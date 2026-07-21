#!/usr/bin/env bash
# =============================================================================
# run-db-contract-tests.sh — Execute the SQL contract suite against a database.
# =============================================================================
# The RencanApp ADR ("Thick Database, Thin Client") puts every business rule and
# RLS policy in Postgres. CI otherwise only runs lint/tsc/jest — the thin client
# layer — so regressions in the layer that actually holds the rules (a dropped
# SELECT policy, a bypassed activation gate, a broken cross-org guard) ship
# undetected. This runner closes that gap: it applies the canonical fixtures then
# runs every `supabase/tests/*.sql` contract, failing if any one fails.
#
# Each contract file signals failure by raising an exception (psql exits non-zero
# under `ON_ERROR_STOP=1`); success is silent / a NOTICE. No pgTAP needed.
#
# USAGE
#   Host psql (CI):     DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#                       scripts/ci/run-db-contract-tests.sh
#   Docker (local dev): RENCAN_DB_CONTAINER=supabase_db_supabase \
#                       scripts/ci/run-db-contract-tests.sh
#
# EXCLUDED from the loop:
#   _*.sql   — preludes/fixtures (applied first, not asserted).
#   *.wip.sql — quarantined tests (tracked for repair; see WIP header in each).
# =============================================================================
set -uo pipefail

# Resolve repo root from this script's location (scripts/ci/…).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TESTS_DIR="$ROOT/supabase/tests"
FIXTURES="$TESTS_DIR/_fixtures.sql"

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CONTAINER="${RENCAN_DB_CONTAINER:-}"

# run_sql <file> — apply one .sql file, aborting on the first server error.
run_sql() {
  local file="$1"
  if [[ -n "$CONTAINER" ]]; then
    docker exec -i "$CONTAINER" psql -U postgres -d postgres \
      -v ON_ERROR_STOP=1 --quiet -f - < "$file"
  else
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet -f "$file"
  fi
}

echo "==> Applying fixtures prelude: $(basename "$FIXTURES")"
if ! run_sql "$FIXTURES"; then
  echo "FATAL: fixtures prelude failed to apply — aborting." >&2
  exit 1
fi

shopt -s nullglob
pass=0; fail=0; failed_files=()
for file in "$TESTS_DIR"/*.sql; do
  base="$(basename "$file")"
  case "$base" in
    _*.sql)   continue ;;   # fixtures / preludes
    *.wip.sql) echo "  SKIP  $base (quarantined)"; continue ;;
  esac
  if run_sql "$file" > /dev/null 2>&1; then
    echo "  PASS  $base"; pass=$((pass+1))
  else
    echo "  FAIL  $base"; fail=$((fail+1)); failed_files+=("$base")
    # Re-run without silencing so the failure detail lands in the CI log.
    run_sql "$file" >&2 || true
  fi
done

echo ""
echo "==> DB contract summary: $pass passed, $fail failed"
if (( fail > 0 )); then
  printf '    FAILED: %s\n' "${failed_files[@]}" >&2
  exit 1
fi
echo "    All DB contract tests passed."
