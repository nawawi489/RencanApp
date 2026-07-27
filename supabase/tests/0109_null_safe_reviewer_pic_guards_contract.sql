-- 0109-DB contract — Sprint 2, S2-5.
-- Static assertion: no `public` function contains a null-unsafe `<>` guard on
-- `reviewer_id` or `pic_id`. If a future migration reintroduces the pattern
-- the CI job fails immediately.

\set ON_ERROR_STOP on

do $$
declare
  v_offenders text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into v_offenders
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (
       regexp_replace(
         pg_get_functiondef(p.oid),
         '(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?(reviewer_id|pic_id)\s+is\s+null\s+or\s+(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?\1\s*<>\s*auth\.uid\(\)',
         '',
         'g'
       ) ~ '(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?(reviewer_id|pic_id)\s*<>\s*auth\.uid\(\)'
     );

  if v_offenders is not null then
    raise exception '0109-DB-1 FAILED: functions still use null-unsafe `<> auth.uid()`: %', v_offenders;
  end if;

  raise notice '0109-DB-1 PASSED: no null-unsafe reviewer_id / pic_id `<>` guards in public schema';
end $$;
