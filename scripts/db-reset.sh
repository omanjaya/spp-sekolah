#!/usr/bin/env bash
# Drop the database schema, re-apply migrations, then seed.
# USAGE: ./scripts/db-reset.sh
# Requires: DATABASE_URL in env (or .env), Prisma CLI, and tsx installed.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" ]] && [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  . .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set. Define it in .env or export it." >&2
  exit 1
fi

echo "[db-reset] resetting database with prisma migrate reset..."
# --force skips confirmation, --skip-seed lets us run the seed explicitly below
npx prisma migrate reset --force --skip-seed

echo "[db-reset] generating prisma client..."
npx prisma generate

echo "[db-reset] seeding..."
npx tsx prisma/seed.ts

echo "[db-reset] done."
