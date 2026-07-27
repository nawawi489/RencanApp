#!/usr/bin/env bash
# S5-10 — backup Postgres terjadwal ke object storage.
# Dijalankan via .github/workflows/backup.yml (cron per jam) atau manual di
# host operator. Owner mengaktifkan setelah bucket + IAM disiapkan; skrip ini
# tidak menjalankan aksi jaringan tanpa env yg diisi.
#
# Wajib env:
#   SUPABASE_DB_URL   URL koneksi Postgres langsung (bukan pooler PgBouncer).
#   BACKUP_BUCKET     Tujuan S3-compatible, mis. s3://rencanapp-backups.
#   AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (untuk aws-cli).
#
# Output: <BACKUP_BUCKET>/YYYY-MM-DD/rencanapp-<ISO8601>.dump

set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL wajib di-set (dari secret)}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET wajib di-set (mis. s3://rencanapp-backups)}"

TS="$(date -u +%Y-%m-%dT%H%M%SZ)"
DAY="$(date -u +%Y-%m-%d)"
FILE="/tmp/rencanapp-${TS}.dump"

echo "backup: $(date -u) → ${BACKUP_BUCKET}/${DAY}/rencanapp-${TS}.dump"

# --format=custom + --compress=9 → arsip binary ter-kompresi maksimal;
# pg_restore --list bisa introspect isi tanpa unpack penuh.
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="${FILE}" \
  "${SUPABASE_DB_URL}"

# Sanity check: file harus > 0. pg_dump exit sukses meski koneksi terputus di
# tengah bisa meninggalkan file kosong (jarang, tapi kita jaga di sini).
if [[ ! -s "${FILE}" ]]; then
  echo "ERROR: dump file kosong — pg_dump tidak menghasilkan output"
  rm -f "${FILE}"
  exit 1
fi

# Upload dgn SSE (server-side encryption).
aws s3 cp "${FILE}" "${BACKUP_BUCKET}/${DAY}/rencanapp-${TS}.dump" \
  --sse AES256

rm -f "${FILE}"
echo "OK ${TS}"
