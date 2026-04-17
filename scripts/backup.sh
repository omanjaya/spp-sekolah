#!/bin/sh
# Daily pg_dump backup with gzip compression and rotation.
# Designed to run inside the `backup` compose service (libpq present) or
# standalone via `docker compose exec backup /scripts/backup.sh`.

set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"

BACKUP_DIR="${BACKUP_DIR:-/backup}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y-%m-%d-%H%M)"
OUT_FILE="${BACKUP_DIR}/spp-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] dumping ${PGDATABASE}@${PGHOST} -> ${OUT_FILE}"

# --no-owner / --no-privileges keep the dump portable between environments.
pg_dump \
	--host="${PGHOST}" \
	--port="${PGPORT:-5432}" \
	--username="${PGUSER}" \
	--dbname="${PGDATABASE}" \
	--format=plain \
	--no-owner \
	--no-privileges \
	| gzip -9 > "${OUT_FILE}.tmp"

mv "${OUT_FILE}.tmp" "${OUT_FILE}"

SIZE="$(wc -c < "${OUT_FILE}" | awk '{print $1}')"
echo "[backup] wrote ${OUT_FILE} (${SIZE} bytes)"

echo "[backup] pruning dumps older than ${RETENTION_DAYS} days"
find "${BACKUP_DIR}" -type f -name 'spp-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "[backup] done at $(date -Iseconds)"
