#!/bin/sh
set -e

: "${DATABASE_URL:?DATABASE_URL is required}"

echo "[entrypoint] running prisma migrate deploy..."
npx --no-install prisma migrate deploy

echo "[entrypoint] starting next server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
exec node server.js
