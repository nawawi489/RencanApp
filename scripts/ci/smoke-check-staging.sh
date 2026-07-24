#!/usr/bin/env bash
# =============================================================================
# smoke-check-staging.sh — Verifikasi pasca-deploy: staging melayani bundel yang
# BENAR-BENAR membawa nilai env, bukan sekadar balas HTTP 200.
# =============================================================================
# LATAR
#   `eas deploy` sukses hanya berarti unggahan selesai. Selama 56 commit
#   (2026-07-21 → 07-24) staging melayani halaman putih karena env CircleCI tidak
#   terinterpolasi, dan setiap deploy tetap "sukses" karena tidak ada yang membuka
#   halamannya. Skrip ini menutup kelas itu.
#
# KENAPA RETRY-NYA PADA ISI BUNDEL, BUKAN STATUS HTTP
#   Alias EAS + cache Cloudflare butuh puluhan detik untuk menunjuk build baru.
#   SELAMA propagasi itu, URL tetap balas HTTP 200 — hanya isinya masih bundel
#   lama. Versi pertama skrip ini retry pada "bukan 200" lalu memeriksa host SEKALI
#   di akhir; hasilnya deploy #402 tercatat MERAH-PALSU walau env-nya benar, karena
#   smoke check mengukur saat bundel masih basi. Kondisi retry yang benar adalah
#   "host belum muncul di bundel", bukan status HTTP.
#
# BATAS YANG JUJUR
#   `curl` tidak mengeksekusi JavaScript, jadi skrip ini TIDAK membuktikan aplikasi
#   merender — hanya bahwa bundel yang dilayani membawa host Supabase asli. Untuk
#   membuktikan render dibutuhkan browser headless; itu jalur peningkatan bila kelak
#   ada kegagalan render yang lolos gate ini.
#
# PEMAKAIAN
#   STAGING_SUPABASE_URL=https://ref.supabase.co scripts/ci/smoke-check-staging.sh [URL]
#
# ENV OPSIONAL (untuk pengujian lokal)
#   SMOKE_ATTEMPTS  jumlah percobaan (default 15)
#   SMOKE_SLEEP     jeda antar percobaan, detik (default 12)
#   → default 15 × 12s = anggaran ~3 menit propagasi.
# =============================================================================
set -eu

URL="${1:-https://staging.rencanapp.com}"
ATTEMPTS="${SMOKE_ATTEMPTS:-15}"
SLEEP="${SMOKE_SLEEP:-12}"

: "${STAGING_SUPABASE_URL:?STAGING_SUPABASE_URL belum di-set}"

# Host asli diturunkan dari env yang SAMA yang dipakai build. Verifikasi POSITIF:
# host ini HARUS ada di bundel. Tidak bisa false-positive oleh prosa/komentar mana pun,
# tidak seperti pemindaian "string ini tidak boleh ada" yang sempat mencocokkan pesan
# error env.ts sendiri (deploy #395).
HOST=$(printf '%s' "$STAGING_SUPABASE_URL" | sed -E 's#^https?://##; s#/.*$##')
[ -n "$HOST" ] || { echo "GAGAL: tidak bisa menurunkan host dari STAGING_SUPABASE_URL." >&2; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
HTML="$TMP/staging.html"
JS="$TMP/bundle.js"

for i in $(seq 1 "$ATTEMPTS"); do
  CODE=$(curl -s -o "$HTML" -w '%{http_code}' "$URL" || echo 000)
  if [ "$CODE" = "200" ]; then
    BUNDLE=$(grep -oE '/_expo/static/js/web/[^"]+\.js' "$HTML" | head -1 || true)
    if [ -n "$BUNDLE" ] && curl -sfo "$JS" "$URL$BUNDLE" 2>/dev/null; then
      if grep -qF "$HOST" "$JS"; then
        echo "OK: $URL 200, bundel $BUNDLE memuat host Supabase asli (percobaan $i/$ATTEMPTS)."
        exit 0
      fi
    fi
  fi
  if [ "$i" -lt "$ATTEMPTS" ]; then
    echo "percobaan $i/$ATTEMPTS: belum siap (HTTP $CODE, host belum di bundel), tunggu ${SLEEP}s"
    sleep "$SLEEP"
  fi
done

echo "GAGAL: setelah $ATTEMPTS percobaan (~$((ATTEMPTS * SLEEP))s), host Supabase tidak muncul di bundel LIVE." >&2
echo "  Bisa berarti env memang tidak sampai ke build, ATAU propagasi alias/cache lebih lambat dari anggaran." >&2
exit 1
