-- 0110-DB Global RLS enable contract — Sprint 2, S2-8.
--
-- WHY: The existing `rls_select_policy_coverage_contract.sql` finds tables
-- that have RLS enabled but no SELECT policy. It does NOT catch a table
-- that got created without `enable row level security` in the first place —
-- silent tenant-crossing, because `authenticated` reads it without any
-- RLS predicate. Adds the missing invariant: every base table in `public`
-- (except the deliberate write-only sinks below) must have RLS ON.
--
-- Runs in the same `DB contract tests (Postgres)` job. Any new table lands
-- with RLS on OR gets an allowlist entry (a deliberate, PR-reviewable choice).

\set ON_ERROR_STOP on

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
     and c.relrowsecurity is not true
     and c.relname not in (
       -- Intentional exceptions must be listed here with a comment on WHY.
       -- Nothing today; keep this array empty until a legitimate case appears.
       ''
     );

  if offenders is not null then
    raise exception '0110-DB-1 FAILED: table(s) in public schema without RLS enabled: %', offenders;
  end if;

  raise notice '0110-DB-1 PASSED: every public base table has RLS enabled';
end $$;
