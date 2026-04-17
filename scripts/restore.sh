#!/bin/bash
# Restore a gzipped pg_dump into the running `db` service.
# Usage: ./scripts/restore.sh backup/spp-2026-04-16-0300.sql.gz
#
# This will:
#   1. Prompt for confirmation (destructive).
#   2. Stop the `app` service so no writes hit the DB during restore.
#   3. Drop & recreate the target database.
#   4. Pipe the gunzipped dump into psql inside the `db` container.
#   5. Start `app` back up.

set -euo pipefail

if [ $# -lt 1 ]; then
	echo "Usage: $0 <backup-file.sql.gz>" >&2
	exit 2
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
	echo "[restore] file not found: ${BACKUP_FILE}" >&2
	exit 1
fi

# Load env for POSTGRES_* vars
if [ -f .env ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env
	set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER missing in .env}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD missing in .env}"
: "${POSTGRES_DB:?POSTGRES_DB missing in .env}"

COMPOSE="${COMPOSE:-docker compose}"

cat <<EOF
============================================================
  DESTRUCTIVE RESTORE
  Target DB   : ${POSTGRES_DB}
  Target user : ${POSTGRES_USER}
  Backup file : ${BACKUP_FILE}

  This will DROP and RECREATE the database. All current data
  will be replaced by the contents of the backup file.
============================================================
EOF

read -r -p "Type 'RESTORE' to continue: " CONFIRM
if [ "${CONFIRM}" != "RESTORE" ]; then
	echo "[restore] aborted"
	exit 1
fi

echo "[restore] stopping app..."
${COMPOSE} stop app

echo "[restore] ensuring db is healthy..."
${COMPOSE} up -d db
# Simple wait loop
for _ in $(seq 1 30); do
	if ${COMPOSE} exec -T db pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
		break
	fi
	sleep 1
done

echo "[restore] dropping and recreating database ${POSTGRES_DB}..."
${COMPOSE} exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" db \
	psql -U "${POSTGRES_USER}" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "${POSTGRES_DB}";
CREATE DATABASE "${POSTGRES_DB}" OWNER "${POSTGRES_USER}";
SQL

echo "[restore] loading ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | ${COMPOSE} exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" db \
	psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1

echo "[restore] restarting app..."
${COMPOSE} up -d app

echo "[restore] done."
