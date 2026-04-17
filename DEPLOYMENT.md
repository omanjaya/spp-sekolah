# Deployment Guide — Sistem Pembayaran SPP

Single-VPS Docker deployment. Stack: Next.js 15 (standalone) + PostgreSQL 16 + Caddy 2 (auto TLS).

## 1. Prerequisites

On the VPS (Ubuntu/Debian recommended):

- Docker Engine 24+ and Docker Compose v2 (`docker compose version`)
- Ports 80 and 443 open (UFW / provider firewall)
- A domain with an `A` (and optional `AAAA`) record pointing to the VPS IP
- Git, to clone this repo

Install Docker on Ubuntu:

```sh
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# re-login for group change to take effect
```

## 2. Initial Setup

```sh
git clone <repo-url> /opt/spp && cd /opt/spp
cp .env.production.example .env
```

Edit `.env`:

- `DOMAIN` — must match the DNS record (e.g. `spp.sman1dps.sch.id`).
- `NEXTAUTH_URL` — `https://<DOMAIN>`.
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`.
- `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` — must be identical and strong (>=20 chars).

Lock down the file: `chmod 600 .env`.

## 3. First Deploy

```sh
docker compose up -d --build
```

Caddy will request a Let's Encrypt certificate on first start (may take 30–60s). Watch the logs:

```sh
docker compose logs -f caddy
```

Once you see `certificate obtained successfully`, browse to `https://<DOMAIN>`.

## 4. Database Migrations

Migrations run automatically on every `app` container start (via `scripts/entrypoint.sh` → `prisma migrate deploy`). No manual step required.

To run Prisma commands manually:

```sh
docker compose exec app npx prisma migrate status
docker compose exec app npx prisma migrate deploy
```

## 5. Backups

Automatic: the `backup` service runs `scripts/backup.sh` once every 24 hours and writes gzipped dumps to `./backup/spp-YYYY-MM-DD-HHMM.sql.gz`. Files older than 30 days are pruned.

Manual backup on demand:

```sh
docker compose exec backup /scripts/backup.sh
```

Copy backups off the VPS regularly (rsync/rclone to S3/B2/GDrive):

```sh
rsync -avz /opt/spp/backup/ user@offsite:/backups/spp/
```

Restore:

```sh
./scripts/restore.sh backup/spp-2026-04-16-0300.sql.gz
```

The restore script prompts for explicit confirmation and recreates the database.

## 6. Updates

```sh
cd /opt/spp
git pull
docker compose up -d --build
docker image prune -f
```

Migrations apply automatically on container start. Caddy and Postgres containers are only restarted if their image/config changed.

For production-optimized runtime (resource limits + log rotation):

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 7. Logs

```sh
docker compose logs -f app         # application
docker compose logs -f db          # postgres
docker compose logs -f caddy       # reverse proxy (TLS issuance, access)
docker compose logs -f backup      # backup runs
```

Caddy access logs (JSON, rotated) are written to the `caddy_logs` volume at `/var/log/caddy/access.log`.

## 8. Troubleshooting

**`502 Bad Gateway` from Caddy**
- `docker compose ps` — is `app` healthy? Check `docker compose logs app`.
- Healthcheck hits `/api/health`; route must exist and return 2xx (Track B concern).

**TLS fails to issue**
- DNS must resolve to the VPS IP *before* starting Caddy. Verify with `dig +short <DOMAIN>`.
- Let's Encrypt rate limit: 5 failures/hour per domain. Wait and retry.
- Port 80 must be reachable from the public internet for the HTTP-01 challenge.

**`Prisma migrate deploy` errors on startup**
- Usually a drift between the dump and the migration history. Check `docker compose logs app`.
- To bypass temporarily: `docker compose run --rm --entrypoint sh app` then inspect with `npx prisma migrate status`.

**Database connection refused**
- `.env` `POSTGRES_PASSWORD` must equal the password embedded in `DATABASE_URL`.
- The hostname in `DATABASE_URL` must be `db` (the compose service name), not `localhost`.

**Disk filling up**
- Check `./backup/` size and adjust `BACKUP_RETENTION_DAYS` on the `backup` service.
- `docker system prune -f` — safe cleanup.
- Caddy logs rotate automatically (see Caddyfile).

**Need a shell in the app container**

```sh
docker compose exec app sh
```

**Full teardown (DATA LOSS)**

```sh
docker compose down -v       # removes volumes, including pg_data
```

Do not run `down -v` on a production host unless you have a verified backup.
