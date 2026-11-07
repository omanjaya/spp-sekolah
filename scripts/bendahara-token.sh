#!/usr/bin/env sh
# Buat token API integrasi bendahara.
#
#   scripts/bendahara-token.sh <token-id> <school-id>
#   contoh: scripts/bendahara-token.sh bendahara-prod 50103017
#
# Menampilkan token plaintext (berikan ke aplikasi bendahara, hanya sekali) dan
# entri yang ditambahkan ke BENDAHARA_API_TOKENS di .env server. Server hanya
# menyimpan hash SHA-256, bukan token aslinya.
set -eu

TOKEN_ID="${1:-}"
SCHOOL_ID="${2:-}"
if ! printf '%s' "$TOKEN_ID" | grep -Eq '^[a-z0-9-]{3,32}$' || [ -z "$SCHOOL_ID" ]; then
  echo "Pemakaian: $0 <token-id: a-z 0-9 -, 3-32 karakter> <school-id>" >&2
  exit 1
fi

SECRET="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
TOKEN="sppbdh_${TOKEN_ID}_${SECRET}"
HASH="$(printf '%s' "$TOKEN" | sha256sum | cut -d' ' -f1)"

echo "Token (simpan di konfigurasi server aplikasi bendahara, JANGAN di-commit):"
echo "  $TOKEN"
echo
echo "Entri untuk BENDAHARA_API_TOKENS di .env SPP (pisahkan beberapa entri dengan koma):"
echo "  ${TOKEN_ID}:${SCHOOL_ID}:${HASH}"
