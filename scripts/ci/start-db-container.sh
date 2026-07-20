#!/usr/bin/env bash
# =============================================================================
# start-db-container.sh — boot a throwaway Postgres and replay the schema.
# =============================================================================
# Produces the database the DB contract suite runs against: a single
# `supabase/postgres` container, bootstrapped with the platform objects the image
# does not ship (scripts/ci/db-bootstrap.sql), then every supabase/migrations/*.sql
# applied in filename order — the same order `supabase db reset` uses.
#
# WHY NOT `supabase start`: that boots nine containers and binds 54321/54322 on
# the host. On the self-hosted runner the Docker daemon is shared with the
# developer's machine, where the real dev stack already owns those ports and
# `supabase stop` would tear it down. This container publishes NO host port —
# psql reaches it through `docker exec` — so it cannot collide with anything.
#
# USAGE
#   NAME=$(scripts/ci/start-db-container.sh)          # prints the container name
#   RENCAN_DB_CONTAINER="$NAME" scripts/ci/run-db-contract-tests.sh
#   docker rm -f "$NAME"
#
# ENV
#   RENCAN_CI_DB_NAME   container name (default: rencan-ci-db-$$)
#   RENCAN_CI_DB_IMAGE  image tag; keep in step with the CLI's db image.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="${RENCAN_CI_DB_NAME:-rencan-ci-db-$$}"
IMAGE="${RENCAN_CI_DB_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.143}"

# All progress goes to stderr; stdout carries only the container name.
log() { echo "$@" >&2; }

log "==> Starting $IMAGE as $NAME (no published port)"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null

log "==> Waiting for Postgres to accept connections"
for _ in $(seq 1 90); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 2
done
# The image restarts Postgres once after its init scripts run, so pg_isready can
# succeed against the server that is about to shut down. Require the connection
# to stay up across several consecutive probes before trusting it.
stable=0
for _ in $(seq 1 90); do
  if docker exec "$NAME" psql -U postgres -d postgres -Atc 'select 1' >/dev/null 2>&1; then
    stable=$((stable + 1))
    [ "$stable" -ge 5 ] && break
  else
    stable=0
  fi
  sleep 2
done
if [ "$stable" -lt 5 ]; then
  log "FATAL: Postgres never became ready in $NAME"
  docker logs --tail 50 "$NAME" >&2 || true
  exit 1
fi

# Bootstrap must run as supabase_admin: `postgres` is not a superuser in this
# image and owns neither the `auth` nor the `storage` schema.
log "==> Applying platform bootstrap (auth + storage)"
docker exec -i "$NAME" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 --quiet \
  -f - < "$ROOT/scripts/ci/db-bootstrap.sql" >&2

log "==> Replaying migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  if ! docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 --quiet \
       -f - < "$file" >&2; then
    log "FATAL: migration failed: $(basename "$file")"
    exit 1
  fi
done

log "==> Schema ready in $NAME"
echo "$NAME"
