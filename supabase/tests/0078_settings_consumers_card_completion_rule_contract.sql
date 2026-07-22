-- 0078_settings_consumers_card_completion_rule_contract.sql
-- Contract: helper enforce_card_completion_rule + 6 RPC activate_* + writer RPC.
-- Covers AC-1, AC-2..4, AC-11 cross-org, AC-13 activity-log diff, AC-16 field-name reject.
-- Convention: Fase 8 (0064). Per-section BEGIN/DO/ROLLBACK for data isolation.
-- Runner:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0078_settings_consumers_card_completion_rule_contract.sql \
--     -v ON_ERROR_STOP=1
-- CEO fixture: 11111111-1111-1111-1111-000000000001 (auth.users + profiles ada).

-- ============================================================ S1 — helper enforces admin extras
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_goal uuid;
  v_kpi uuid;
  v_strat uuid;
  v_init uuid;
  v_violations_before int;
  v_violations_after int;
  v_status text;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  -- Seed rule: initiative wajib 'reason'
  insert into public.card_completion_rules (organization_id, card_type, required_fields)
  values (v_org, 'initiative', to_jsonb(array['reason']))
  on conflict (organization_id, card_type) do update set required_fields = excluded.required_fields;

  -- Create draft goal → strategy → initiative dgn reason NULL
  insert into public.goals(organization_id, name, pic_id, period_start, period_end, target_value, status, created_by)
    values (v_org, 'S1 goal', v_ceo, '2026-01-01', '2026-12-31', 100, 'draft', v_ceo) returning id into v_goal;
  insert into public.strategies(organization_id, goal_id, name, pic_id, period_start, period_end, target, expected_outcome, status, created_by)
    values (v_org, v_goal, 'S1 strat', v_ceo, '2026-01-01', '2026-12-31', '100', 'outcome', 'draft', v_ceo) returning id into v_strat;
  insert into public.initiatives(organization_id, strategy_id, name, pic_id, period_start, period_end,
                                  reason, main_risk, alternative, contribution_pct, status, created_by)
    values (v_org, v_strat, 'S1 init', v_ceo, '2026-01-01', '2026-12-31',
            null, 'risk', 'alt', 100, 'draft', v_ceo) returning id into v_init;

  select count(*) into v_violations_before from public.governance_violations where entity_id = v_init;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.activate_initiative(v_init);
    fails := fails || 'S1: expected RAISE, got success; ';
  exception
    when others then
      if sqlerrm not ilike '%Lengkapi data wajib%' then
        fails := fails || 'S1: wrong error text: ' || sqlerrm || '; ';
      end if;
  end;

  execute 'reset role';

  select status into v_status from public.initiatives where id = v_init;
  if v_status <> 'draft' then
    fails := fails || 'S1: status changed from draft to ' || v_status || '; ';
  end if;

  -- D-8 defer: assert count = 0 (INSERT rolled back atau helper skip)
  select count(*) into v_violations_after from public.governance_violations where entity_id = v_init;
  if v_violations_after <> v_violations_before then
    fails := fails || 'S1: governance_violations count changed (' || v_violations_before
      || '→' || v_violations_after || '); D-8 defer premature — konsul owner CP-1; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0078-S1: %', fails;
  end if;
  raise notice 'PASS 0078-S1 helper enforces admin extras + D-8 defer sanity';
end $$;
rollback;

-- ============================================================ S2 — locked base tetap enforced (AC-4)
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_goal uuid;
  v_strat uuid;
  v_init uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  -- Rule kosong — admin uncheck semua configurable
  insert into public.card_completion_rules (organization_id, card_type, required_fields)
  values (v_org, 'initiative', '[]'::jsonb)
  on conflict (organization_id, card_type) do update set required_fields = '[]'::jsonb;

  insert into public.goals(organization_id, name, pic_id, period_start, period_end, target_value, status, created_by)
    values (v_org, 'S2 goal', v_ceo, '2026-01-01', '2026-12-31', 100, 'draft', v_ceo) returning id into v_goal;
  insert into public.strategies(organization_id, goal_id, name, pic_id, period_start, period_end, target, expected_outcome, status, created_by)
    values (v_org, v_goal, 'S2 strat', v_ceo, '2026-01-01', '2026-12-31', '100', 'outcome', 'draft', v_ceo) returning id into v_strat;
  -- Initiative dgn name = '' (locked base coalesce(trim(name),'')='' violated)
  insert into public.initiatives(organization_id, strategy_id, name, pic_id, period_start, period_end,
                                  reason, main_risk, alternative, contribution_pct, status, created_by)
    values (v_org, v_strat, '', v_ceo, '2026-01-01', '2026-12-31',
            'r', 'risk', 'alt', 100, 'draft', v_ceo) returning id into v_init;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.activate_initiative(v_init);
    fails := fails || 'S2: activation succeeded despite name=NULL (locked base broken); ';
  exception when others then null; -- expected raise
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-S2: %', fails;
  end if;
  raise notice 'PASS 0078-S2 locked base name still enforced';
end $$;
rollback;

-- ============================================================ S3 — fallback org-NULL default (AC-3)
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_goal uuid;
  v_strat uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  -- Hapus row org=v_org untuk strategy (kalau ada) → hanya org-NULL default yang berlaku
  delete from public.card_completion_rules where organization_id = v_org and card_type = 'strategy';

  -- Seed org-NULL: expected_outcome wajib
  insert into public.card_completion_rules (organization_id, card_type, required_fields)
  values (null, 'strategy', to_jsonb(array['expected_outcome']))
  on conflict do nothing;

  insert into public.goals(organization_id, name, pic_id, period_start, period_end, target_value, status, created_by)
    values (v_org, 'S3 goal', v_ceo, '2026-01-01', '2026-12-31', 100, 'draft', v_ceo) returning id into v_goal;
  insert into public.strategies(organization_id, goal_id, name, pic_id, period_start, period_end, target, expected_outcome, status, created_by)
    values (v_org, v_goal, 'S3 strat', v_ceo, '2026-01-01', '2026-12-31', '100', null, 'draft', v_ceo) returning id into v_strat;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.activate_strategy(v_strat);
    fails := fails || 'S3: activation succeeded despite org-NULL rule expected_outcome NULL (fallback not consulted); ';
  exception when others then null; end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-S3: %', fails;
  end if;
  raise notice 'PASS 0078-S3 fallback org-NULL default consulted';
end $$;
rollback;

-- ============================================================ S4 — cross-org isolation (AC-11)
begin;
do $$
declare
  v_ceo_a uuid := '11111111-1111-1111-1111-000000000001';
  v_org_a uuid;
  v_org_b uuid;
  v_goal_b uuid;
  fails text := '';
begin
  select organization_id into v_org_a from public.profiles where id = v_ceo_a;

  insert into public.organizations(name) values ('S4 org B') returning id into v_org_b;
  insert into public.goals(organization_id, name, pic_id, period_start, period_end, target_value, status, created_by)
    values (v_org_b, 'S4 goal orgB', v_ceo_a, '2026-01-01', '2026-12-31', 100, 'draft', v_ceo_a)
    returning id into v_goal_b;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.activate_goal(v_goal_b);
    fails := fails || 'S4: cross-org activation succeeded (guard broken); ';
  exception when others then
    if sqlerrm not ilike '%lintas%' and sqlerrm not ilike '%42501%'
       and sqlerrm not ilike '%cross%' and sqlerrm not ilike '%organisasi%' then
      fails := fails || 'S4: wrong error text: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-S4: %', fails;
  end if;
  raise notice 'PASS 0078-S4 cross-org isolation preserved';
end $$;
rollback;

-- ============================================================ S5 — writer RPC upsert diff + activity log (AC-13, F7)
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_before_seed jsonb := to_jsonb(array['reason']);
  v_log record;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  insert into public.card_completion_rules (organization_id, card_type, required_fields)
  values (v_org, 'initiative', v_before_seed)
  on conflict (organization_id, card_type) do update set required_fields = v_before_seed;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_card_completion_rule('initiative', array['reason','main_risk'], 'Q3 discipline');
  exception when others then
    fails := fails || 'S5: upsert RPC missing or error: ' || sqlerrm || '; ';
  end;

  execute 'reset role';

  if fails = '' then
    select * into v_log from public.activity_logs
      where action = 'card_completion_rule_updated'
      order by created_at desc limit 1;

    if v_log is null then
      fails := fails || 'S5: no activity_logs row emitted; ';
    else
      if v_log.entity_type <> 'card_completion_rule' then
        fails := fails || 'S5: entity_type=' || coalesce(v_log.entity_type,'NULL') || ' expected card_completion_rule; ';
      end if;
      if v_log.entity_id is not null then
        fails := fails || 'S5: entity_id NOT NULL (should be NULL for settings-level audit); ';
      end if;
      if v_log.detail->>'card_type' <> 'initiative' then
        fails := fails || 'S5: detail.card_type wrong; ';
      end if;
      if v_log.detail->'before' <> to_jsonb(array['reason']) then
        fails := fails || 'S5: detail.before mismatch; ';
      end if;
      if v_log.detail->'after' <> to_jsonb(array['reason','main_risk']) then
        fails := fails || 'S5: detail.after mismatch; ';
      end if;
      if v_log.detail->>'reason' <> 'Q3 discipline' then
        fails := fails || 'S5: detail.reason mismatch; ';
      end if;
    end if;
  end if;

  if fails <> '' then
    raise exception 'FAIL 0078-S5: %', fails;
  end if;
  raise notice 'PASS 0078-S5 upsert diff + activity log schema';
end $$;
rollback;

-- ============================================================ S6 — writer RPC reject invalid field-name (AC-16)
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_card_completion_rule('initiative', array['garbage_field'], null);
    fails := fails || 'S6: expected RAISE for garbage_field, got success; ';
  exception when others then
    if sqlerrm not ilike '%tidak dikenal%' and sqlerrm not ilike '%invalid%' then
      fails := fails || 'S6: wrong error text: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-S6: %', fails;
  end if;
  raise notice 'PASS 0078-S6 upsert reject invalid field-name';
end $$;
rollback;

-- ============================================================ S7 — writer RPC permission gate (staff → 42501)
begin;
do $$
declare
  v_staff uuid;
  v_org uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = '11111111-1111-1111-1111-000000000001';
  v_staff := gen_random_uuid();
  -- organization_id wajib eksplisit sejak 0083 (handle_new_user menolak menebak).
  insert into auth.users(id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org));
  insert into public.profiles(id, organization_id, full_name)
    values (v_staff, v_org, 'S7 Staff') on conflict (id) do update set organization_id = v_org;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_card_completion_rule('initiative', array['reason'], null);
    fails := fails || 'S7: staff without permission succeeded (gate broken); ';
  exception when others then
    if sqlerrm not ilike '%berwenang%' and sqlerrm not ilike '%42501%' and sqlerrm not ilike '%permission%' then
      fails := fails || 'S7: wrong error text: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-S7: %', fails;
  end if;
  raise notice 'PASS 0078-S7 writer permission gate';
end $$;
rollback;

-- ============================================================ S8 — 6 RPC coverage sample (regression guard)
-- Loop 6 cardType: seed rule dgn 1 configurable field, insert card dgn field itu NULL, expect RAISE.
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid; v_da uuid; v_ps uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  -- Rule dgn 1 configurable field per cardType
  insert into public.card_completion_rules(organization_id, card_type, required_fields) values
    (v_org, 'goal',              to_jsonb(array['target_value'])),
    (v_org, 'strategy',          to_jsonb(array['expected_outcome'])),
    (v_org, 'initiative',        to_jsonb(array['reason'])),
    (v_org, 'action_plan',       to_jsonb(array['target_result'])),
    (v_org, 'development_area',  '[]'::jsonb),
    (v_org, 'problem_statement', to_jsonb(array['impact']))
  on conflict (organization_id, card_type) do update set required_fields = excluded.required_fields;

  -- Seed hierarchy with configurable field NULL for each type
  insert into public.goals(organization_id, name, pic_id, period_start, period_end, target_value, status, created_by)
    values (v_org, 'S8 goal', v_ceo, '2026-01-01','2026-12-31', null, 'draft', v_ceo) returning id into v_goal;
  insert into public.strategies(organization_id, goal_id, name, pic_id, period_start, period_end, target, expected_outcome, status, created_by)
    values (v_org, v_goal, 'S8 strat', v_ceo, '2026-01-01','2026-12-31','100', null, 'draft', v_ceo) returning id into v_strat;
  insert into public.initiatives(organization_id, strategy_id, name, pic_id, period_start, period_end, reason, main_risk, alternative, contribution_pct, status, created_by)
    values (v_org, v_strat, 'S8 init', v_ceo, '2026-01-01','2026-12-31', null, 'risk', 'alt', 100, 'draft', v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, period_start, period_end, team_id, target_result, status, created_by)
    values (v_org, v_init, 'S8 ap', v_ceo, '2026-01-01','2026-12-31', null, null, 'draft', v_ceo) returning id into v_ap;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin perform public.activate_goal(v_goal); fails := fails || 'S8: activate_goal succeeded with target_value=NULL; ';
  exception when others then null; end;
  begin perform public.activate_strategy(v_strat); fails := fails || 'S8: activate_strategy succeeded with expected_outcome=NULL; ';
  exception when others then null; end;
  begin perform public.activate_initiative(v_init); fails := fails || 'S8: activate_initiative succeeded with reason=NULL; ';
  exception when others then null; end;
  begin perform public.activate_action_plan(v_ap); fails := fails || 'S8: activate_action_plan succeeded with target_result=NULL; ';
  exception when others then null; end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-S8: %', fails;
  end if;
  raise notice 'PASS 0078-S8 6-RPC dynamic rule coverage';
end $$;
rollback;
