-- =============================================================================
-- Contract — RLS SELECT-policy coverage (anti-recurrence for the 0049/0067 bug class)
-- =============================================================================
-- WHY: Twice now a `DROP FUNCTION … CASCADE` (or a rewrite migration) silently
-- dropped the SELECT policies off a table that still had RLS enabled, so the app
-- read back zero rows while the data was really there:
--   • 0049_hotfix_missing_select_policies  — SELECT policies swept by CASCADE
--   • 0067_fix_score_ranking_rls_policies   — "Skor menyusul" while scores existed
-- A table with RLS ENABLED but NO SELECT (or ALL) policy denies every read to
-- non-superuser roles. That is almost never intentional. This contract fails the
-- build the moment any public table regresses into that state.
--
-- INTENTIONAL EXCEPTIONS (write-only sinks drained by service_role, which bypasses
-- RLS) live in the allowlist below. Adding a table here is a deliberate decision:
-- document why. Removing a policy WITHOUT allowlisting is what this test catches.
--
-- Run: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--        -v ON_ERROR_STOP=1 -f - < supabase/tests/rls_select_policy_coverage_contract.sql
-- =============================================================================
do $$
declare
  offenders text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity = true                 -- RLS enabled
    and not exists (                            -- …but no SELECT/ALL policy
      select 1 from pg_policy p
      where p.polrelid = c.oid
        and p.polcmd in ('r', '*')              -- 'r' = SELECT, '*' = ALL
    )
    and c.relname not in (
      -- Allowlist: RLS-enabled, deliberately read-only to authenticated users;
      -- rows are consumed only by service_role (push-fanout drainer), which
      -- bypasses RLS. See 0060_push_infrastructure.sql.
      'push_deliveries'
    );

  if offenders is not null then
    raise exception
      'RLS SELECT-policy coverage FAIL: table(s) have RLS enabled but no SELECT/ALL policy (0049/0067 class): %',
      offenders;
  end if;
  raise notice 'RLS SELECT-POLICY COVERAGE CONTRACT: ALL PASS';
end $$;
