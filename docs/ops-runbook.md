# Runbook Operasional Rencanapp

Prosedur untuk memelihara produksi: postur backup, restore, rollback, dan rotasi kunci. Semua langkah adalah aksi owner/operator manusia.

## 1. Target Recovery (RPO / RTO)

Target untuk V1:

- **RPO** (Recovery Point Objective) — kehilangan data maksimum yg diterima: **1 jam**.
- **RTO** (Recovery Time Objective) — waktu maksimum kembali beroperasi setelah insiden: **4 jam**.

Angka ini ditetapkan berdasarkan (a) sifat data — kinerja kerja, bukan transaksi keuangan real-time, (b) skala pengguna V1 (kecil, satu-dua organisasi), dan (c) kapasitas 1-dev.  Setelah pengguna melewati 100 organisasi atau data historis > 1 tahun, tinjau ulang ke arah lebih ketat.

## 2. Postur Backup

Rencanapp menyimpan seluruh state di **Supabase (Postgres)**. Dua jalur backup, tergantung tier:

### Opsi A — Free tier: `pg_dump` terjadwal ke object storage

Free-tier Supabase tidak menyediakan Point-in-Time Recovery (PITR). Backup diambil sendiri secara terjadwal:

- **Frekuensi**: setiap **60 menit** (memenuhi RPO 1 jam).
- **Retensi**: 30 hari.
- **Storage**: Cloudflare R2 (atau S3-compatible pilihan owner), bucket **PRIVATE**, di-enkripsi sisi server.
- **Script**: `scripts/ops/pg-dump-backup.sh` (lihat §5). Dijalankan via GitHub Actions cron `.github/workflows/backup.yml` (blueprint tersedia, aktifkan setelah bucket + secret ready).
- **Verifikasi**: `.dump` file yang berhasil punya ukuran > 0 dan dapat diproses `pg_restore --list`. Job mencatat ini dan mengirim alert bila gagal.

Kelemahan pendekatan ini: window kehilangan data bisa sampai 59 menit. Bila tidak dapat diterima, upgrade ke Opsi B.

### Opsi B — Pro tier: PITR (Point-in-Time Recovery)

Supabase Pro tier menyediakan PITR dengan window 7 hari (default), retensi 30 hari. Aktivasi via dashboard:

1. Dashboard project → **Settings → Add-ons → PITR**.
2. Setelah aktif, RPO menurun ke **hitungan detik** (WAL streaming).
3. Backup manual `pg_dump` tetap direkomendasikan untuk long-term retention (> 30 hari) atau ekspor lintas-region.

## 3. Prosedur Restore

**Kapan dijalankan**: insiden yg menyebabkan corrupt / kehilangan data ireversibel di prod (mis. migrasi rusak berjalan, kesalahan mass-UPDATE, kompromi akses).

### Restore dari `pg_dump`

```bash
# 1. Unduh dump terbaru dari object storage.
aws s3 cp s3://rencanapp-backups/YYYY-MM-DD/dump-HHMM.sql.gz .

# 2. Buat DB target kosong di Supabase (atau project sandbox untuk drill).
supabase link --project-ref <target-project-ref>

# 3. Restore ke DB target. Gunakan --clean --if-exists agar idempoten.
gunzip -c dump-HHMM.sql.gz | psql "$(supabase status | grep DB_URL | awk '{print $2}')"

# 4. Jalankan migrasi baru (bila ada di antara backup dan sekarang).
supabase db push --linked

# 5. Verifikasi baseline:
#    - jumlah user, org, card dibandingkan sisa log.
#    - RLS aktif di 57/57 tabel (query di p3-production-provisioning-runbook.md §P3-C).
```

### Restore dari PITR

Dashboard project → **Backups → Point-in-time recovery** → pilih timestamp target. Supabase menyediakan project turunan tempat dump dipulihkan; setelah verifikasi, redirect klien via update env `EXPO_PUBLIC_SUPABASE_URL` di EAS Dashboard.

### Wajib: satu restore drill sebelum go-live

**Sebelum V1.0.0 di-tag**, jalankan drill di lingkungan sandbox:

- [ ] Ambil dump produksi terkini.
- [ ] Restore ke project Supabase sandbox baru.
- [ ] Verifikasi login berhasil dengan salah satu akun test.
- [ ] Verifikasi kueri kinerja + report populasi normal.
- [ ] Catat waktu total di catatan runbook di bawah (§7).

Drill yang belum pernah dijalankan bukan drill — itu asumsi.

## 4. Prosedur Rollback

### Rollback deploy klien (staging / prod)

- Web (EAS Hosting): revert alias ke build sebelumnya.
  ```bash
  cd mobile
  eas deploy:list --limit 5
  eas deploy:promote --deployment <previous-id>
  ```
- Native (App Store / Play): tidak dapat rollback binary yg sudah rilis; tuas yg tersedia adalah `expo update rollback` untuk membalikkan OTA update ke bundle sebelumnya (dilakukan lewat kanal EAS Update).
  ```bash
  eas update:list --branch production --limit 5
  eas update:republish --group <previous-update-group>
  ```

### Rollback migrasi

Migrasi Supabase TIDAK punya `down` step di Rencanapp (keputusan sengaja: lebih aman menulis migrasi baru yg membatalkan efek migrasi salah daripada meng-executes DDL turunan yg belum diuji).

- **Migrasi kecil (single-table DDL)**: tulis migrasi kompensasi baru yg membatalkan efeknya.
- **Migrasi besar (corruption/mass-UPDATE)**: pakai restore dari backup terkini (§3).

## 5. Script Backup Otomatis

`scripts/ops/pg-dump-backup.sh` (buat sebelum aktivasi Opsi A):

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL wajib di-set (dari secret)}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET wajib di-set (mis. s3://rencanapp-backups)}"

TS="$(date -u +%Y-%m-%dT%H%M%SZ)"
FILE="/tmp/rencanapp-${TS}.dump"

pg_dump --format=custom --compress=9 --no-owner --no-acl \
        --file="${FILE}" "${SUPABASE_DB_URL}"

aws s3 cp "${FILE}" "${BACKUP_BUCKET}/$(date -u +%Y-%m-%d)/rencanapp-${TS}.dump" \
  --sse AES256

rm -f "${FILE}"
echo "OK ${TS}"
```

Workflow GitHub Actions `backup.yml`:

```yaml
name: Backup Postgres (prod)
on:
  schedule:
    - cron: "0 * * * *"  # setiap jam
  workflow_dispatch:
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install postgres client
        run: sudo apt-get install -y postgresql-client
      - name: Run backup
        env:
          SUPABASE_DB_URL: ${{ secrets.PROD_SUPABASE_DB_URL }}
          BACKUP_BUCKET: ${{ secrets.PROD_BACKUP_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.PROD_BACKUP_AWS_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.PROD_BACKUP_AWS_SECRET }}
        run: bash scripts/ops/pg-dump-backup.sh
```

## 6. Rotasi Kunci

### Anon key Supabase

Anon key aman di-embed di klien (proteksi via RLS). Rotasi hanya diperlukan jika kunci lama BOCOR (mis. commit histori git yang lolos), sebagai tindakan defensif:

1. Supabase dashboard project → **Settings → API → Regenerate anon key**.
2. Perbarui secret:
   - GitHub Secret `PROD_SUPABASE_ANON_KEY`
   - EAS Dashboard env `EXPO_PUBLIC_SUPABASE_ANON_KEY` (channel production)
3. Trigger deploy baru → propagasi ke klien via OTA update.

### Service role key

TIDAK BOLEH BOCOR — melewati RLS. Bila bocor:

1. Dashboard → regenerate service_role.
2. Update Vault secret (referensi Edge Function `create-user` menggunakannya).
3. Redeploy Edge Function.

### Kata sandi DB (Postgres)

Untuk operator/DBA. Rotasi manual on-demand:

1. Dashboard → **Settings → Database → Change password**.
2. Update password manager tim.
3. Tidak ada dependensi klien (klien pakai anon key, bukan DB password).

### DSN Sentry + kunci push (FCM/APNs)

Rotasi ikuti prosedur masing-masing penyedia; update secret di GitHub + EAS lalu deploy.

## 7. Catatan Drill

Tabel ini diisi setiap kali drill dijalankan:

| Tanggal | Skenario | Waktu ke restore | Catatan |
|---|---|---|---|
| (isi) | Restore full dari `pg_dump` ke project sandbox | (isi menit) | |
| (isi) | Rollback OTA update | (isi menit) | |
| (isi) | Rotasi anon key | (isi menit) | |

Drill wajib ke depan: minimal **satu restore full** per kuartal, dan **satu rotasi anon key** per tahun.
