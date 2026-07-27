-- 0109-DB contract — Sprint 2, S2-5.
-- Static assertion: no `public` function contains a null-unsafe `<>` guard on
-- `reviewer_id` or `pic_id`. If a future migration reintroduces the pattern
-- the CI job fails immediately.

\set ON_ERROR_STOP on

do $$
declare
  v_checks record;
  v_body text;
  fails text := '';
begin
  for v_checks in
    select fn, needle from (values
      ('review_task_submission(uuid,text,text)',              'reviewer_id is null or'),
      ('review_task_instance_submission(uuid,text,text)',     'reviewer_id is null or'),
      ('start_task(uuid)',                                    'pic_id is null or'),
      ('submit_task_instance(uuid,text,jsonb,jsonb)',         'pic_id is null or')
    ) as t(fn, needle)
  loop
    begin
      v_body := pg_get_functiondef(('public.' || v_checks.fn)::regprocedure);
    exception when others then
      fails := fails || v_checks.fn || ':not_found; ';
      continue;
    end;
    if position(v_checks.needle in v_body) = 0 then
      fails := fails || v_checks.fn || ':missing_null_guard; ';
    end if;
  end loop;

  if fails <> '' then
    raise exception '0109-DB-1 FAILED: %', fails;
  end if;
  raise notice '0109-DB-1 PASSED: all 4 target functions carry the null-safe `<col> is null or` guard';
end $$;
