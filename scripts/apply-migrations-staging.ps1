# =========================================================================
# apply-migrations-staging.ps1
# Apply all migrations 0006 → 0043 to Supabase STAGING project.
# =========================================================================
# Prasyarat:
#   - psql sudah terinstall (dari Postgres client atau Supabase CLI)
#   - DB password staging (Supabase Dashboard → Project Settings → Database → Connection string)
#
# Cara pakai:
#   $env:PGPASSWORD = "<paste-staging-db-password>"
#   .\scripts\apply-migrations-staging.ps1
#
# Catatan:
#   - Migration 0001–0005 SUDAH di-apply via MCP di sesi Claude sebelumnya.
#   - Script ini mem-apply 0006 → 0043 secara berurutan, stop on first error.
#   - schema_migrations tracking di-populate di akhir untuk semua 43 baris.
# =========================================================================

$ErrorActionPreference = "Stop"

$PROJECT_REF = "fhnqwytqprsptjshoxfn"  # staging
$DB_HOST = "aws-1-ap-southeast-1.pooler.supabase.com"  # ganti kalau region berbeda
$DB_PORT = "6543"
$DB_USER = "postgres.fhnqwytqprsptjshoxfn"
$DB_NAME = "postgres"

if (-not $env:PGPASSWORD) {
  Write-Error "Set `$env:PGPASSWORD dulu dengan password DB staging (bukan anon key)."
  exit 1
}

$conn = "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require"
$migDir = Join-Path $PSScriptRoot "..\supabase\migrations"

$applied = @("0001", "0002", "0003", "0004", "0005")  # sudah via MCP
$files = Get-ChildItem $migDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  $num = $file.BaseName.Substring(0, 4)
  if ($applied -contains $num) {
    Write-Host "SKIP  $($file.Name)  (already applied via MCP)" -ForegroundColor DarkGray
    continue
  }
  Write-Host "APPLY $($file.Name)" -ForegroundColor Cyan
  & psql $conn -v ON_ERROR_STOP=1 -f $file.FullName
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Gagal apply $($file.Name). Berhenti."
    exit 1
  }
}

Write-Host ""
Write-Host "Semua migration selesai di-apply." -ForegroundColor Green
Write-Host "Selanjutnya: kembali ke Claude, aku akan populate supabase_migrations tracking table." -ForegroundColor Yellow
