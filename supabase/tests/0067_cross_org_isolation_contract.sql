-- Migration 0067 contract test — cross-org isolation guard in SECURITY DEFINER RPCs.
--
-- Verifies that all 13 functions patched in 0067 contain the cross-org guard
-- pattern (`current_user_org()` check via `is distinct from`). This is a
-- structural contract: if a future migration rewrites any of these functions
-- without the guard, this test fails CI instead of shipping silently.
--
-- Pola: `raise notice 'PASS'` bila lolos, `raise exception 'FAIL: ...'` bila gagal.
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0067_cross_org_isolation_contract.sql

-- ============================================================ 0067-DB-1: structural guard — function body contains current_user_org()
-- Every function patched by 0067 must contain both 'current_user_org()' and
-- 'lintas-organisasi' in its body. This catches accidental guard removal in
-- future CREATE OR REPLACE rewrites.
do $$
declare
  v_funcs text[] := array[
    'activate_goal',
    'activate_action_plan',
    'activate_strategy',
    'activate_initiative',
    'approve_cancellation',
    'archive_card',
    'restore_card',
    'restore_goal_template_items',
    'set_task_repeat_rule',
    'activate_score_formula_version',
    'activate_development_area',
    'review_deadline_change',
    'activate_problem_statement'
  ];
  v_fn text;
  v_body text;
  fails text := '';
begin
  foreach v_fn in array v_funcs loop
    select pg_get_functiondef(p.oid) into v_body
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn
     limit 1;

    if v_body is null then
      fails := fails || v_fn || '_not_found; ';
      continue;
    end if;

    if v_body not ilike '%current_user_org()%' then
      fails := fails || v_fn || '_missing_current_user_org; ';
    end if;

    if v_body not ilike '%lintas-organisasi%' then
      fails := fails || v_fn || '_missing_cross_org_message; ';
    end if;

    if v_body not ilike '%is distinct from%' then
      fails := fails || v_fn || '_missing_is_distinct_from; ';
    end if;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0067-DB-1: %', fails;
  end if;
  raise notice 'PASS 0067-DB-1: all 13 functions contain cross-org guard (current_user_org + is distinct from + lintas-organisasi)';
end $$;

-- ============================================================ 0067-DB-2: all 13 functions are SECURITY DEFINER
-- Guard only matters if the function is SECURITY DEFINER (bypasses RLS).
-- If any gets downgraded to INVOKER the guard is harmless but this test
-- should still pass — however, losing SECURITY DEFINER accidentally would
-- be its own bug, so we assert it.
do $$
declare
  v_funcs text[] := array[
    'activate_goal',
    'activate_action_plan',
    'activate_strategy',
    'activate_initiative',
    'approve_cancellation',
    'archive_card',
    'restore_card',
    'restore_goal_template_items',
    'set_task_repeat_rule',
    'activate_score_formula_version',
    'activate_development_area',
    'review_deadline_change',
    'activate_problem_statement'
  ];
  v_fn text;
  v_secdef boolean;
  fails text := '';
begin
  foreach v_fn in array v_funcs loop
    select p.prosecdef into v_secdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn
     limit 1;

    if v_secdef is null then
      fails := fails || v_fn || '_not_found; ';
    elsif not v_secdef then
      fails := fails || v_fn || '_not_security_definer; ';
    end if;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0067-DB-2: %', fails;
  end if;
  raise notice 'PASS 0067-DB-2: all 13 functions are SECURITY DEFINER';
end $$;

-- ============================================================ 0067-DB-3: runtime cross-org rejection (activate_goal)
-- End-to-end proof: CEO of Org A tries to activate a Goal belonging to Org B.
-- Must raise 'lintas-organisasi', NOT succeed.
-- Konstanta LOCAL DB: org A = 52b0ebe1-..., ceo A = 11111111-...-000000000001.
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_goalB uuid; v_status text; fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-activate-goal') returning id into v_orgB;
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_orgB, 'B-goal', v_ceoA, current_date, current_date+30, 'draft', '100', v_ceoA)
    returning id into v_goalB;
  insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_orgB, v_goalB, 'B-kpi', v_ceoA, current_date, current_date+30, 'draft', v_ceoA);

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.activate_goal(v_goalB);
    fails := fails||'cross_org_activate_goal_allowed; ';
  exception when others then
    if sqlerrm not ilike '%lintas-organisasi%' then fails := fails||'wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  select status into v_status from public.goals where id = v_goalB;
  if v_status <> 'draft' then fails := fails||'goal_status_mutated('||v_status||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0067-DB-3: %', fails; end if;
  raise notice 'PASS 0067-DB-3: cross-org activate_goal rejected + no side effect';
end $$;
rollback;

-- ============================================================ 0067-DB-4: runtime cross-org rejection (archive_card — dynamic table)
-- Tests the dynamic-table variant (archive_card) which uses EXECUTE FORMAT.
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_goalB uuid; fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-archive') returning id into v_orgB;
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_orgB, 'B-archive-goal', v_ceoA, current_date, current_date+30, 'done', '100', v_ceoA)
    returning id into v_goalB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.archive_card('goal', v_goalB);
    fails := fails||'cross_org_archive_allowed; ';
  exception when others then
    if sqlerrm not ilike '%lintas-organisasi%' then fails := fails||'wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  if fails <> '' then raise exception 'FAIL 0067-DB-4: %', fails; end if;
  raise notice 'PASS 0067-DB-4: cross-org archive_card rejected';
end $$;
rollback;

-- ============================================================ 0067-DB-5: regression — same-org activate_goal TETAP jalan
-- Guard must not block same-org operations.
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgA uuid;
  v_goalA uuid; v_status text; fails text := '';
begin
  select organization_id into v_orgA from public.profiles where id = v_ceoA;
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_orgA, 'A-own-goal', v_ceoA, current_date, current_date+30, 'draft', '100', v_ceoA)
    returning id into v_goalA;
  insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_orgA, v_goalA, 'A-kpi', v_ceoA, current_date, current_date+30, 'draft', v_ceoA);

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.activate_goal(v_goalA);
  execute 'reset role';

  select status into v_status from public.goals where id = v_goalA;
  if v_status <> 'active' then fails := fails||'same_org_activate_failed('||v_status||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0067-DB-5: %', fails; end if;
  raise notice 'PASS 0067-DB-5: same-org activate_goal works (regression)';
end $$;
rollback;

-- ============================================================ 0067-DB-6: NULL-org caller rejected
-- Caller with organization_id = NULL must be rejected by `is distinct from`
-- (not just `<>`).
begin;
do $$
declare
  v_orgB uuid; v_goalB uuid; v_ceoNull uuid := gen_random_uuid();
  v_ceo_rt uuid; fails text := '';
begin
  select id into v_ceo_rt from public.role_templates where level = 'ceo' limit 1;
  if v_ceo_rt is null then raise notice 'SKIP 0067-DB-6 (no ceo role_template)'; return; end if;

  insert into public.organizations (name) values ('OrgB-null-caller') returning id into v_orgB;

  -- Create attacker user first (needed as FK target for pic_id on goals).
  -- organization_id wajib eksplisit sejak 0083 (handle_new_user menolak menebak).
  insert into auth.users (id, raw_app_meta_data)
    values (v_ceoNull, jsonb_build_object('organization_id', v_orgB));
  insert into public.profiles (id, organization_id, role_template_id, is_active)
    values (v_ceoNull, v_orgB, v_ceo_rt, true)
    on conflict (id) do update set organization_id = v_orgB, role_template_id = v_ceo_rt, is_active = true;

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_orgB, 'B-null-goal', v_ceoNull, current_date, current_date+30, 'draft', '100', v_ceoNull)
    returning id into v_goalB;
  insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_orgB, v_goalB, 'B-null-kpi', v_ceoNull, current_date, current_date+30, 'draft', v_ceoNull);

  -- Now set attacker's org to NULL (the actual test condition).
  update public.profiles set organization_id = NULL where id = v_ceoNull;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoNull,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.activate_goal(v_goalB);
    fails := fails||'null_org_caller_activated; ';
  exception when others then
    if sqlerrm not ilike '%lintas-organisasi%' then fails := fails||'wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  if fails <> '' then raise exception 'FAIL 0067-DB-6: %', fails; end if;
  raise notice 'PASS 0067-DB-6: NULL-org caller rejected (is distinct from NULL-safe)';
end $$;
rollback;
