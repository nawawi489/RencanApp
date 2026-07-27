-- 0106-DB-1: backfill_resolve_stale_notifications must not exist.
-- Sprint 2, S2-2. Tripwire against re-introducing the cross-tenant mass-write
-- surface documented in `anon-public-rpc-grant-gotcha` memory.
--
-- Runs on the same Postgres started by CI (Ubuntu supabase start). Any future
-- migration that recreates the function will fail this assertion in the
-- `DB contract tests (Postgres)` job.

\set ON_ERROR_STOP on

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'backfill_resolve_stale_notifications';

  if v_count <> 0 then
    raise exception '0106-DB-1 FAILED: backfill_resolve_stale_notifications must be dropped (found % overloads)', v_count;
  end if;

  raise notice '0106-DB-1 PASSED: backfill_resolve_stale_notifications is not present';
end $$;
