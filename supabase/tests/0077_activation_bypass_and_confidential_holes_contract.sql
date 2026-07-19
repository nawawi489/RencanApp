-- Contract test: 0077_activation_bypass_and_confidential_holes
-- Verifies:
--   [BUG 1] activation-bypass trigger installed on all 5 tables + guards
--           direct draft→active transitions via authenticated role.
--   [BUG 2] can_access_goal/strategy/initiative contains klausa
--           confidential_access_rules (function definition text).
--
-- Pola: begin; do $$ ... raise exception on fail ... end $$; rollback;
-- No pgTAP — CI runner uses ON_ERROR_STOP=1 (exception = FAIL, no exception = PASS).

-- ============================================================ TEST 1: structural checks
begin;
do $$
declare
  v_trigger_count int;
  v_fn_exists bool;
  v_secdef bool;
  v_conf_goal bool;
  v_conf_strategy bool;
  v_conf_initiative bool;
  fails text := '';
begin
  -- T1: 5 triggers exist
  select count(*) into v_trigger_count
    from pg_trigger
   where tgname in (
     'goals_guard_activation_bypass',
     'strategies_guard_activation_bypass',
     'initiatives_guard_activation_bypass',
     'action_plans_guard_activation_bypass',
     'tasks_guard_activation_bypass'
   ) and not tgisinternal;
  if v_trigger_count <> 5 then
    fails := fails || 'triggers_exist(' || v_trigger_count || '/5); ';
  end if;

  -- T2: guard function exists
  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'tg_guard_activation_direct_update'
  ) into v_fn_exists;
  if not v_fn_exists then
    fails := fails || 'guard_fn_missing; ';
  end if;

  -- T3: guard function is SECURITY INVOKER (prosecdef = false)
  select prosecdef into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tg_guard_activation_direct_update';
  if v_secdef is distinct from false then
    fails := fails || 'guard_fn_is_SECURITY_DEFINER(MUST_BE_INVOKER); ';
  end if;

  -- T4-T6: can_access_* reference confidential_access_rules
  select pg_get_functiondef(p.oid) like '%confidential_access_rules%' into v_conf_goal
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_access_goal';
  if not coalesce(v_conf_goal, false) then
    fails := fails || 'can_access_goal_missing_confidential; ';
  end if;

  select pg_get_functiondef(p.oid) like '%confidential_access_rules%' into v_conf_strategy
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_access_strategy';
  if not coalesce(v_conf_strategy, false) then
    fails := fails || 'can_access_strategy_missing_confidential; ';
  end if;

  select pg_get_functiondef(p.oid) like '%confidential_access_rules%' into v_conf_initiative
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_access_initiative';
  if not coalesce(v_conf_initiative, false) then
    fails := fails || 'can_access_initiative_missing_confidential; ';
  end if;

  if fails <> '' then
    raise exception 'TEST1 structural checks FAIL: %', fails;
  end if;
  raise notice 'TEST1 structural (5 triggers + fn INVOKER + 3 confidential clauses) PASS';
end $$;
rollback;

-- ============================================================ TEST 2: behavioral — bypass blocked + archive allowed
begin;
do $$
declare
  v_uid uuid; v_org uuid;
  v_blocked bool := false;
  v_errcode text;
  fails text := '';
begin
  select id, organization_id into v_uid, v_org
    from public.profiles order by id limit 1;
  if v_uid is null then
    raise notice 'TEST2 SKIP: no seed profile';
    return;
  end if;

  insert into public.goals (id, organization_id, name, status, pic_id, created_by)
  values ('99999999-9999-9999-9999-000000000077', v_org, 'test-0077-bypass',
          'draft', v_uid, v_uid);

  -- Simulate authenticated role (PostgREST direct call)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- T2a: direct draft→active MUST raise 42501
  begin
    update public.goals set status = 'active'
      where id = '99999999-9999-9999-9999-000000000077';
    fails := fails || 'bypass_not_blocked; ';
  exception when others then
    get stacked diagnostics v_errcode = returned_sqlstate;
    if v_errcode <> '42501' then
      fails := fails || 'wrong_errcode(' || v_errcode || '); ';
    end if;
    v_blocked := true;
  end;

  -- T2b: direct draft→archived MUST succeed
  begin
    update public.goals set status = 'archived'
      where id = '99999999-9999-9999-9999-000000000077';
  exception when others then
    fails := fails || 'archive_blocked(' || sqlerrm || '); ';
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'TEST2 behavioral FAIL: %', fails;
  end if;
  raise notice 'TEST2 behavioral (bypass→42501, archive→ok) PASS';
end $$;
rollback;

-- ============================================================ TEST 3: SECURITY DEFINER RPC bypasses trigger (legit path)
begin;
do $$
declare
  v_uid uuid; v_org uuid;
  fails text := '';
begin
  select id, organization_id into v_uid, v_org
    from public.profiles order by id limit 1;
  if v_uid is null then
    raise notice 'TEST3 SKIP: no seed profile';
    return;
  end if;

  -- Create goal in draft with required fields for activate_goal
  insert into public.goals (id, organization_id, name, status, pic_id, created_by,
                            period_start, period_end, target_value)
  values ('99999999-9999-9999-9999-000000000078', v_org, 'test-0077-rpc',
          'draft', v_uid, v_uid, '2026-01-01', '2026-12-31', 'Rp 1M');

  -- Create ≥1 strategy (activate_goal requires ≥1; post-0046 rename kpi_areas→strategies)
  insert into public.strategies (organization_id, goal_id, name, pic_id, created_by)
  values (v_org, '99999999-9999-9999-9999-000000000078', 'KPI-test-0077', v_uid, v_uid);

  -- Call as authenticated (activate_goal is SECURITY DEFINER → runs as postgres inside)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.activate_goal('99999999-9999-9999-9999-000000000078'::uuid);
  exception when others then
    fails := fails || 'activate_goal_failed(' || sqlerrm || '); ';
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'TEST3 RPC bypass FAIL: %', fails;
  end if;
  raise notice 'TEST3 legitimate activate_goal RPC bypasses trigger PASS';
end $$;
rollback;
