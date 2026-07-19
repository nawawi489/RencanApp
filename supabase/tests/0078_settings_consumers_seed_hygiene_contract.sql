-- 0078_settings_consumers_seed_hygiene_contract.sql
-- Contract: legacy per-org seed 0005:598 cleaned + seed default org-NULL 6 baris.
-- Covers AC-9.
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--   -f supabase/tests/0078_settings_consumers_seed_hygiene_contract.sql -v ON_ERROR_STOP=1

-- ============================================================ S1 — legacy 0005:598 field-name cleaned
begin;
do $$
declare
  v_count int;
  fails text := '';
begin
  select count(*) into v_count from public.card_completion_rules
    where required_fields::text ~ 'reviewer_id|expected_output|definition_of_done|priority|start_date|deadline';
  if v_count > 0 then
    fails := fails || 'S1: ' || v_count || ' legacy field-name rows still present (0005:598 not cleaned); ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0078-seed-S1: %', fails;
  end if;
  raise notice 'PASS 0078-seed-S1 legacy field-name rows cleaned';
end $$;
rollback;

-- ============================================================ S2 — org-NULL default seed 6 rows
begin;
do $$
declare
  v_count int;
  v_row record;
  v_valid_fields text[] := array[
    'name','pic_id','period_start','period_end',
    'target_value','target','target_result','expected_outcome',
    'reason','main_risk','alternative','impact','team_id'
  ];
  v_field text;
  fails text := '';
begin
  select count(*) into v_count from public.card_completion_rules
    where organization_id is null
      and card_type in ('goal','strategy','initiative','action_plan','development_area','problem_statement');
  if v_count <> 6 then
    fails := fails || 'S2: org-NULL default seed count = ' || v_count || ' expected 6; ';
  end if;

  -- Whitelist check
  for v_row in
    select card_type, required_fields
    from public.card_completion_rules
    where organization_id is null
      and card_type in ('goal','strategy','initiative','action_plan','development_area','problem_statement')
  loop
    for v_field in select jsonb_array_elements_text(v_row.required_fields) loop
      if not (v_field = any (v_valid_fields)) then
        fails := fails || 'S2: card_type=' || v_row.card_type
          || ' has invalid field-name "' || v_field || '"; ';
      end if;
    end loop;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0078-seed-S2: %', fails;
  end if;
  raise notice 'PASS 0078-seed-S2 default seed valid';
end $$;
rollback;
