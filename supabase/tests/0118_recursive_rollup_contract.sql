-- =============================================================================
-- 0118_recursive_rollup_contract.sql
-- Contract tests for the recursive progress rollup (Opsi B) added in migration
-- 0118 to public.workspace_card_progress(uuid[]).
--
-- WHAT IS ASSERTED (behaviour, run the function and check RESULT ROWS):
--   * Governance introspection (fixture-independent): SECURITY INVOKER,
--     search_path pin, anon-deny / authenticated-allow ACL, and the
--     strategy_current_values view is security_invoker.
--   * Action Plan = unweighted mean of leaf task progress (OQ-1 one_time mapping,
--     repeat = Repeat Compliance), empty AP → 0, archived children excluded.
--   * Initiative = unweighted mean of its non-archived AP progress; empty → 0.
--   * Isolation (AC-19): Problem-Statement / Development-Area / Strategy keep
--     count-done; Goal/Strategy attainment unchanged (byte-for-byte).
--   * Confidential instance-level: hidden task_instances never leak into a mean;
--     two callers of differing visibility see different partial aggregates.
--
-- All Goal/Strategy attainment fixtures (AC-5/6/7, AC-18) are authored from
-- scratch here; NO reuse of the quarantined 0074 goal-attainment .wip cases.
--
-- Harness: per-case  begin; <seed as postgres>; set jwt+role authenticated;
--          call workspace_card_progress; reset role; assert via raise exception;
--          rollback;  — org from _fixtures.sql (shared org 4b07a19f / CEO ca8c1471).
--          Every card is seeded in-test.
--
-- Run (local):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/0118_recursive_rollup_contract.sql
-- =============================================================================

\set ORG   '4b07a19f-550d-4952-b0d8-44f38f651d89'
\set CEO    'ca8c1471-b870-4f09-a149-25e5eae99d6f'

-- ============================================================ GOV: governance introspection (fixture-independent)
begin;
do $$
declare
  fails text := '';
  v_secdef boolean;
  v_haspath boolean;
  v_anon boolean;
  v_auth boolean;
  v_view_invoker boolean;
begin
  select prosecdef into v_secdef
    from pg_proc where oid = 'public.workspace_card_progress(uuid[])'::regprocedure;
  if v_secdef is distinct from false then
    fails := fails || 'prosecdef_not_invoker(got=' || coalesce(v_secdef::text,'null') || '); ';
  end if;

  select exists (
    select 1 from pg_proc p,
      lateral unnest(coalesce(p.proconfig, array[]::text[])) as c
     where p.oid = 'public.workspace_card_progress(uuid[])'::regprocedure
       and c like 'search_path=%'
  ) into v_haspath;
  if not v_haspath then fails := fails || 'no_search_path_pin; '; end if;

  select has_function_privilege('anon', 'public.workspace_card_progress(uuid[])', 'execute')
    into v_anon;
  if v_anon then fails := fails || 'anon_can_execute; '; end if;

  select has_function_privilege('authenticated', 'public.workspace_card_progress(uuid[])', 'execute')
    into v_auth;
  if not v_auth then fails := fails || 'authenticated_denied; '; end if;

  select coalesce('security_invoker=true' = any(c.reloptions), false) into v_view_invoker
    from pg_class c where c.relname = 'strategy_current_values';
  if not v_view_invoker then fails := fails || 'scv_view_not_invoker; '; end if;

  if fails <> '' then raise exception 'GOV FAIL: %', fails; end if;
  raise notice 'GOV governance introspection PASS';
end $$;
rollback;

-- ============================================================ AC-1: Action Plan = unweighted mean of leaf task progress
-- one_time in_progress(50) + one_time done(100) -> avg = 75  (NOT count-done 1/2 = 50).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid;
  v_prog int; v_meas boolean;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC1 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC1 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC1 init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC1 ap', 'active', v_init, v_ceo, v_ceo) returning id into v_ap;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap, 'AC1 t ip', 'one_time', false,false,false, 'in_progress', v_ceo, v_ceo),
           (v_org, v_ap, 'AC1 t done', 'one_time', false,false,false, 'done', v_ceo, v_ceo);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress, w.is_measured into v_prog, v_meas
    from public.workspace_card_progress(array[v_ap]) w where w.card_id = v_ap;
  execute 'reset role';

  if v_prog is distinct from 75 then fails := fails || 'ap_mean:got=' || coalesce(v_prog::text,'null') || ' want=75; '; end if;
  if v_meas is distinct from false then fails := fails || 'ap_is_measured_true; '; end if;

  if fails <> '' then raise exception 'AC-1 FAIL: %', fails; end if;
  raise notice 'AC-1 AP unweighted mean PASS';
end $$;
rollback;

-- ============================================================ AC-3 / OQ-1: one_time status -> progress mapping, incl. CASE ELSE 0
-- One AP per status, single task each; assert AP == mapped leaf value.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid;
  fails text := '';
  rec record;
  v_ap uuid; v_prog int;
  -- status -> expected leaf/AP value (single task)
  cases text[][] := array[
    array['draft','0'], array['assigned','10'], array['in_progress','50'],
    array['revision','30'], array['submitted','80'], array['done','100'],
    array['cancelled','0']    -- unmapped -> CASE ELSE 0
  ];
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC3 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC3 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC3 init', 'active', v_ceo, v_ceo) returning id into v_init;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);

  for i in 1 .. array_length(cases, 1) loop
    insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
      values (v_org, 'AC3 ap ' || cases[i][1], 'active', v_init, v_ceo, v_ceo) returning id into v_ap;
    insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
        evidence_required, result_value_required, review_required, status, pic_id, created_by)
      values (v_org, v_ap, 'AC3 t ' || cases[i][1], 'one_time', false,false,false, cases[i][1], v_ceo, v_ceo);

    execute 'set local role authenticated';
    select w.progress into v_prog
      from public.workspace_card_progress(array[v_ap]) w where w.card_id = v_ap;
    execute 'reset role';

    if v_prog is distinct from cases[i][2]::int then
      fails := fails || cases[i][1] || ':got=' || coalesce(v_prog::text,'null') || ' want=' || cases[i][2] || '; ';
    end if;
  end loop;

  if fails <> '' then raise exception 'AC-3 FAIL: %', fails; end if;
  raise notice 'AC-3 one_time status mapping (+ ELSE 0) PASS';
end $$;
rollback;

-- ============================================================ AC-16 / OQ-5: AP with no task -> 0; repeat task with no instance -> 0
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap_empty uuid; v_ap_rep uuid; v_rule uuid; v_t uuid;
  v_p_empty int; v_p_rep int;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC16 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC16 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC16 init', 'active', v_ceo, v_ceo) returning id into v_init;

  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC16 ap empty', 'active', v_init, v_ceo, v_ceo) returning id into v_ap_empty;

  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC16 ap rep', 'active', v_init, v_ceo, v_ceo) returning id into v_ap_rep;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_rep, 'AC16 t rep', 'repeat', false,false,false, 'assigned', v_ceo, v_ceo)
    returning id into v_t;
  insert into public.task_repeat_rules (organization_id, task_id, frequency,
      repeat_start_date, repeat_end_date, time_of_day, missed_rule, created_by)
    values (v_org, v_t, 'daily', '2026-01-01', '2026-12-31', '09:00', 'strict', v_ceo)
    returning id into v_rule;
  -- NO task_instances rows for the repeat task -> compliance 0.

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_empty from public.workspace_card_progress(array[v_ap_empty]) w where w.card_id = v_ap_empty;
  select w.progress into v_p_rep   from public.workspace_card_progress(array[v_ap_rep])   w where w.card_id = v_ap_rep;
  execute 'reset role';

  if v_p_empty is distinct from 0 then fails := fails || 'ap_empty:got=' || coalesce(v_p_empty::text,'null') || ' want=0; '; end if;
  if v_p_rep   is distinct from 0 then fails := fails || 'ap_repeat_no_instance:got=' || coalesce(v_p_rep::text,'null') || ' want=0; '; end if;

  if fails <> '' then raise exception 'AC-16 FAIL: %', fails; end if;
  raise notice 'AC-16 empty AP + repeat-no-instance -> 0 PASS';
end $$;
rollback;

-- ============================================================ AC-17 / OQ-2: repeat compliance + one_time/repeat mixed in one mean
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid;
  v_ap_rep uuid; v_ap_mix uuid; v_t_rep uuid; v_t_rep2 uuid; v_rule uuid; v_rule2 uuid;
  v_p_rep int; v_p_mix int;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC17 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC17 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC17 init', 'active', v_ceo, v_ceo) returning id into v_init;

  -- AP1: single repeat task, 2 instances 1 done / 1 assigned -> compliance 50 -> AP 50
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC17 ap rep', 'active', v_init, v_ceo, v_ceo) returning id into v_ap_rep;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_rep, 'AC17 t rep', 'repeat', false,false,false, 'assigned', v_ceo, v_ceo)
    returning id into v_t_rep;
  insert into public.task_repeat_rules (organization_id, task_id, frequency,
      repeat_start_date, repeat_end_date, time_of_day, missed_rule, created_by)
    values (v_org, v_t_rep, 'daily', '2026-01-01', '2026-12-31', '09:00', 'strict', v_ceo)
    returning id into v_rule;
  insert into public.task_instances (organization_id, task_id, repeat_rule_id, instance_date,
      instance_time, deadline_at, status, submitted_late, pic_id)
    values (v_org, v_t_rep, v_rule, '2026-02-01', '09:00', '2026-02-01T09:00:00Z', 'done', false, v_ceo),
           (v_org, v_t_rep, v_rule, '2026-02-02', '09:00', '2026-02-02T09:00:00Z', 'assigned', false, v_ceo);

  -- AP2: one_time done(100) + repeat(compliance 50) -> avg = 75
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC17 ap mix', 'active', v_init, v_ceo, v_ceo) returning id into v_ap_mix;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_mix, 'AC17 mix one', 'one_time', false,false,false, 'done', v_ceo, v_ceo);
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_mix, 'AC17 mix rep', 'repeat', false,false,false, 'assigned', v_ceo, v_ceo)
    returning id into v_t_rep2;
  insert into public.task_repeat_rules (organization_id, task_id, frequency,
      repeat_start_date, repeat_end_date, time_of_day, missed_rule, created_by)
    values (v_org, v_t_rep2, 'daily', '2026-01-01', '2026-12-31', '09:00', 'strict', v_ceo)
    returning id into v_rule2;
  insert into public.task_instances (organization_id, task_id, repeat_rule_id, instance_date,
      instance_time, deadline_at, status, submitted_late, pic_id)
    values (v_org, v_t_rep2, v_rule2, '2026-02-01', '09:00', '2026-02-01T09:00:00Z', 'done', false, v_ceo),
           (v_org, v_t_rep2, v_rule2, '2026-02-02', '09:00', '2026-02-02T09:00:00Z', 'assigned', false, v_ceo);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_rep from public.workspace_card_progress(array[v_ap_rep]) w where w.card_id = v_ap_rep;
  select w.progress into v_p_mix from public.workspace_card_progress(array[v_ap_mix]) w where w.card_id = v_ap_mix;
  execute 'reset role';

  if v_p_rep is distinct from 50 then fails := fails || 'ap_repeat_compliance:got=' || coalesce(v_p_rep::text,'null') || ' want=50; '; end if;
  if v_p_mix is distinct from 75 then fails := fails || 'ap_mixed_one_repeat:got=' || coalesce(v_p_mix::text,'null') || ' want=75; '; end if;

  if fails <> '' then raise exception 'AC-17 FAIL: %', fails; end if;
  raise notice 'AC-17 repeat compliance + mixed mean PASS';
end $$;
rollback;

-- ============================================================ AC-2 / AC-9 / AC-12: Initiative recursion; unweighted (NOT sum(done)/sum(all))
-- AP1: 1 task done(100). AP2: 3 tasks [done(100), draft(0), draft(0)] -> 33.33.
-- Initiative = avg(100, 33.33) = 66.67 -> 67.  (sum(done)/sum(all) would be 2/4 = 50.)
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap1 uuid; v_ap2 uuid;
  v_p_ap1 int; v_p_ap2 int; v_p_init int; v_m_init boolean;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC2 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC2 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC2 init', 'active', v_ceo, v_ceo) returning id into v_init;

  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC2 ap1', 'active', v_init, v_ceo, v_ceo) returning id into v_ap1;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap1, 'AC2 a1 done', 'one_time', false,false,false, 'done', v_ceo, v_ceo);

  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC2 ap2', 'active', v_init, v_ceo, v_ceo) returning id into v_ap2;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap2, 'AC2 a2 done',  'one_time', false,false,false, 'done',  v_ceo, v_ceo),
           (v_org, v_ap2, 'AC2 a2 draft1','one_time', false,false,false, 'draft', v_ceo, v_ceo),
           (v_org, v_ap2, 'AC2 a2 draft2','one_time', false,false,false, 'draft', v_ceo, v_ceo);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_ap1 from public.workspace_card_progress(array[v_ap1]) w where w.card_id = v_ap1;
  select w.progress into v_p_ap2 from public.workspace_card_progress(array[v_ap2]) w where w.card_id = v_ap2;
  select w.progress, w.is_measured into v_p_init, v_m_init
    from public.workspace_card_progress(array[v_init]) w where w.card_id = v_init;
  execute 'reset role';

  if v_p_ap1  is distinct from 100 then fails := fails || 'ap1:got=' || coalesce(v_p_ap1::text,'null')  || ' want=100; '; end if;
  if v_p_ap2  is distinct from 33  then fails := fails || 'ap2:got=' || coalesce(v_p_ap2::text,'null')  || ' want=33; '; end if;
  if v_p_init is distinct from 67  then fails := fails || 'init:got=' || coalesce(v_p_init::text,'null') || ' want=67; '; end if;
  if v_m_init is distinct from false then fails := fails || 'init_is_measured_true; '; end if;

  if fails <> '' then raise exception 'AC-2/9/12 FAIL: %', fails; end if;
  raise notice 'AC-2 recursion + AC-9/12 unweighted mean PASS';
end $$;
rollback;

-- ============================================================ Initiative mixes a real AP(50) with an empty AP(0) -> 25
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap_real uuid; v_ap_empty uuid;
  v_p_init int;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'MIX goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'MIX strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'MIX init', 'active', v_ceo, v_ceo) returning id into v_init;

  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'MIX ap real', 'active', v_init, v_ceo, v_ceo) returning id into v_ap_real;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_real, 'MIX t', 'one_time', false,false,false, 'in_progress', v_ceo, v_ceo);

  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'MIX ap empty', 'active', v_init, v_ceo, v_ceo) returning id into v_ap_empty;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_init from public.workspace_card_progress(array[v_init]) w where w.card_id = v_init;
  execute 'reset role';

  if v_p_init is distinct from 25 then fails := fails || 'init_real50_empty0:got=' || coalesce(v_p_init::text,'null') || ' want=25; '; end if;

  if fails <> '' then raise exception 'MIX FAIL: %', fails; end if;
  raise notice 'MIX real AP(50) + empty AP(0) -> 25 PASS';
end $$;
rollback;

-- ============================================================ AC-11: archived children excluded at each level
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid;
  v_init_active uuid; v_init_allarch uuid;
  v_ap_mixarch uuid; v_ap_allarch uuid; v_ap_live uuid;
  v_p_ap_mix int; v_p_ap_allarch int; v_p_init_allarch int;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC11 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC11 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC11 init active', 'active', v_ceo, v_ceo) returning id into v_init_active;

  -- AP with one done(100) task + one archived task -> archived excluded -> 100 (not avg(100,0))
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC11 ap mixarch', 'active', v_init_active, v_ceo, v_ceo) returning id into v_ap_mixarch;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_mixarch, 'AC11 t done', 'one_time', false,false,false, 'done', v_ceo, v_ceo),
           (v_org, v_ap_mixarch, 'AC11 t arch', 'one_time', false,false,false, 'archived', v_ceo, v_ceo);

  -- AP whose only task is archived -> 0
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC11 ap allarch', 'active', v_init_active, v_ceo, v_ceo) returning id into v_ap_allarch;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_allarch, 'AC11 t only arch', 'one_time', false,false,false, 'archived', v_ceo, v_ceo);

  -- Initiative whose only AP is archived -> 0
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC11 init allarch', 'active', v_ceo, v_ceo) returning id into v_init_allarch;
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC11 ap archived', 'archived', v_init_allarch, v_ceo, v_ceo) returning id into v_ap_live;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_live, 'AC11 t under arch ap', 'one_time', false,false,false, 'done', v_ceo, v_ceo);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_ap_mix     from public.workspace_card_progress(array[v_ap_mixarch])   w where w.card_id = v_ap_mixarch;
  select w.progress into v_p_ap_allarch from public.workspace_card_progress(array[v_ap_allarch])   w where w.card_id = v_ap_allarch;
  select w.progress into v_p_init_allarch from public.workspace_card_progress(array[v_init_allarch]) w where w.card_id = v_init_allarch;
  execute 'reset role';

  if v_p_ap_mix       is distinct from 100 then fails := fails || 'ap_archived_task_excluded:got=' || coalesce(v_p_ap_mix::text,'null')       || ' want=100; '; end if;
  if v_p_ap_allarch   is distinct from 0   then fails := fails || 'ap_all_tasks_archived:got='     || coalesce(v_p_ap_allarch::text,'null')   || ' want=0; ';   end if;
  if v_p_init_allarch is distinct from 0   then fails := fails || 'init_all_ap_archived:got='      || coalesce(v_p_init_allarch::text,'null') || ' want=0; ';   end if;

  if fails <> '' then raise exception 'AC-11 FAIL: %', fails; end if;
  raise notice 'AC-11 archived excluded at each level PASS';
end $$;
rollback;

-- ============================================================ AC-4: regression seed "Otomasi Proses Internal" — Initiative, 1 active AP, task-agg 50 -> ~50
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid;
  v_p_init int; v_p_ap int;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC4 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC4 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'Otomasi Proses Internal', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC4 ap active', 'active', v_init, v_ceo, v_ceo) returning id into v_ap;
  -- Deterministic task-agg 50: two one_time tasks in_progress(50)+in_progress(50) -> mean 50.
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap, 'AC4 t1', 'one_time', false,false,false, 'in_progress', v_ceo, v_ceo),
           (v_org, v_ap, 'AC4 t2', 'one_time', false,false,false, 'in_progress', v_ceo, v_ceo);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_ap   from public.workspace_card_progress(array[v_ap])   w where w.card_id = v_ap;
  select w.progress into v_p_init from public.workspace_card_progress(array[v_init]) w where w.card_id = v_init;
  execute 'reset role';

  if v_p_ap   is distinct from 50 then fails := fails || 'ap_agg:got='   || coalesce(v_p_ap::text,'null')   || ' want=50; '; end if;
  if v_p_init is distinct from 50 then fails := fails || 'init_agg:got=' || coalesce(v_p_init::text,'null') || ' want=50; '; end if;

  if fails <> '' then raise exception 'AC-4 FAIL: %', fails; end if;
  raise notice 'AC-4 Otomasi Proses Internal seed regression PASS';
end $$;
rollback;

-- ============================================================ AC-14 / OQ-4: confidential instances never leak; partial aggregate per caller
-- AP has one_time done(100) + a CONFIDENTIAL repeat task (compliance 50). A CEO
-- sees both -> avg(100,50)=75. A non-granted staff cannot see the repeat task's
-- instances (can_access_task=false) -> its compliance reads 0 -> avg(100,0)=50.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid;
  v_staff uuid := '99999999-9418-0000-0000-000000000001';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid; v_t_conf uuid; v_rule uuid;
  v_p_ceo int; v_p_staff int;
  fails text := '';
begin
  select id into v_role_staff from public.role_templates
    where organization_id = v_org and level = 'staff' limit 1;
  if v_role_staff is null then raise exception 'AC-14 SETUP FAIL: staff role template missing'; end if;

  insert into auth.users (id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name, is_active)
    values (v_staff, v_org, v_role_staff, 'AC14 staff', true)
    on conflict (id) do update
      set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id, is_active = true;
  -- Grant workspace visibility so the BASE clause of can_access_task passes; the
  -- confidential clause is what must still exclude the task from this staff.
  insert into public.user_permissions (user_id, permission_id, granted)
    select v_staff, p.id, true from public.permissions p where p.key = 'view_all_workspace'
    on conflict (user_id, permission_id) do update set granted = true;

  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC14 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC14 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC14 init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC14 ap', 'active', v_init, v_ceo, v_ceo) returning id into v_ap;

  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap, 'AC14 one done', 'one_time', false,false,false, 'done', v_ceo, v_ceo);

  -- confidential repeat task, pic = CEO (so staff is not the PIC)
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap, 'AC14 conf rep', 'repeat', false,false,false, 'assigned', v_ceo, v_ceo)
    returning id into v_t_conf;
  insert into public.task_repeat_rules (organization_id, task_id, frequency,
      repeat_start_date, repeat_end_date, time_of_day, missed_rule, created_by)
    values (v_org, v_t_conf, 'daily', '2026-01-01', '2026-12-31', '09:00', 'strict', v_ceo)
    returning id into v_rule;
  insert into public.task_instances (organization_id, task_id, repeat_rule_id, instance_date,
      instance_time, deadline_at, status, submitted_late, pic_id)
    values (v_org, v_t_conf, v_rule, '2026-02-01', '09:00', '2026-02-01T09:00:00Z', 'done', false, v_ceo),
           (v_org, v_t_conf, v_rule, '2026-02-02', '09:00', '2026-02-02T09:00:00Z', 'assigned', false, v_ceo);
  -- Mark the repeat task confidential; NO rule row for the staff user.
  insert into public.confidential_access_rules (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'task', v_t_conf, v_ceo, v_ceo) on conflict do nothing;

  -- CEO caller: sees confidential instances -> avg(100, 50) = 75
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_ceo from public.workspace_card_progress(array[v_ap]) w where w.card_id = v_ap;
  execute 'reset role';

  -- Staff caller: confidential instances hidden -> repeat reads 0 -> avg(100, 0) = 50
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_staff from public.workspace_card_progress(array[v_ap]) w where w.card_id = v_ap;
  execute 'reset role';

  if v_p_ceo   is distinct from 75 then fails := fails || 'ceo_sees_confidential:got=' || coalesce(v_p_ceo::text,'null')   || ' want=75; '; end if;
  if v_p_staff is distinct from 50 then fails := fails || 'staff_partial_no_leak:got=' || coalesce(v_p_staff::text,'null') || ' want=50; '; end if;

  if fails <> '' then raise exception 'AC-14 FAIL: %', fails; end if;
  raise notice 'AC-14 confidential instance-level partial aggregate PASS';
end $$;
rollback;

-- ============================================================ AC-18 / OQ-6: Goal-fallback = count-done of Strategies (unchanged); is_measured=false
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_s_done uuid; v_s_active uuid;
  v_p_goal int; v_m_goal boolean;
  fails text := '';
begin
  -- Goal with two UNMEASURED strategies (no target_numeric): 1 done, 1 active -> count-done 50.
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC18 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC18 s done',   'done',   v_ceo, v_ceo) returning id into v_s_done;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC18 s active', 'active', v_ceo, v_ceo) returning id into v_s_active;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress, w.is_measured into v_p_goal, v_m_goal
    from public.workspace_card_progress(array[v_goal]) w where w.card_id = v_goal;
  execute 'reset role';

  if v_p_goal is distinct from 50    then fails := fails || 'goal_count_done:got=' || coalesce(v_p_goal::text,'null') || ' want=50; '; end if;
  if v_m_goal is distinct from false then fails := fails || 'goal_is_measured_true; '; end if;

  if fails <> '' then raise exception 'AC-18 FAIL: %', fails; end if;
  raise notice 'AC-18 Goal count-done fallback PASS';
end $$;
rollback;

-- ============================================================ AC-5/6/7: Goal & Strategy attainment byte-for-byte (measured)
-- Strategy target_numeric=200, one approved result value 140 -> attainment 70.
-- Goal = mean of measured child strategies = 70. Both is_measured=true.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid; v_task uuid; v_sub uuid;
  v_p_goal int; v_m_goal boolean; v_p_strat int; v_m_strat boolean;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC5 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, target_numeric, pic_id, created_by)
    values (v_org, v_goal, 'AC5 strat', 'active', 200, v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC5 init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC5 ap', 'active', v_init, v_ceo, v_ceo) returning id into v_ap;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap, 'AC5 task', 'one_time', false,false,false, 'done', v_ceo, v_ceo)
    returning id into v_task;
  insert into public.task_submissions (task_id, version_number, submitted_by, submitted_at, review_status, status)
    values (v_task, 1, v_ceo, now(), 'approved', 'submitted') returning id into v_sub;
  insert into public.task_result_values (submission_id, label, value_type, value_numeric, strategy_id)
    values (v_sub, 'metric', 'number', 140, v_strat);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress, w.is_measured into v_p_strat, v_m_strat
    from public.workspace_card_progress(array[v_strat]) w where w.card_id = v_strat;
  select w.progress, w.is_measured into v_p_goal, v_m_goal
    from public.workspace_card_progress(array[v_goal]) w where w.card_id = v_goal;
  execute 'reset role';

  if v_p_strat is distinct from 70   then fails := fails || 'strategy_attainment:got=' || coalesce(v_p_strat::text,'null') || ' want=70; '; end if;
  if v_m_strat is distinct from true then fails := fails || 'strategy_not_measured; '; end if;
  if v_p_goal  is distinct from 70   then fails := fails || 'goal_attainment:got='     || coalesce(v_p_goal::text,'null')  || ' want=70; '; end if;
  if v_m_goal  is distinct from true then fails := fails || 'goal_not_measured; '; end if;

  if fails <> '' then raise exception 'AC-5/6/7 FAIL: %', fails; end if;
  raise notice 'AC-5/6/7 attainment byte-for-byte PASS';
end $$;
rollback;

-- ============================================================ AC-19 / OQ-7a: isolation — PS/DA/Strategy count-done vs Initiative/AP recursive avg
-- Same node type (action_plans) rolls up differently by parent:
--   Initiative I1 -> avg of its AP's task progress (recursive).
--   Problem-Statement P1 -> % of its child APs that are 'done' (count-done).
-- Both child APs are 'active' with task-agg 50, so:
--   AP_i / AP_p  == 50 (recursive),  I1 == 50 (recursive),  P1 == 0 (count-done),
--   DevArea == count-done of PS,  Strategy == count-done of Initiatives.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap_i uuid;
  v_da uuid; v_ps uuid; v_ap_p uuid;
  v_p_ap_i int; v_p_ap_p int; v_p_init int; v_p_ps int; v_p_da int; v_p_strat int;
  fails text := '';
begin
  -- Initiative branch
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC19 goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal, 'AC19 strat', 'active', v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'AC19 init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'AC19 ap under init', 'active', v_init, v_ceo, v_ceo) returning id into v_ap_i;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_i, 'AC19 ti', 'one_time', false,false,false, 'in_progress', v_ceo, v_ceo);

  -- Problem-statement branch (development_area -> problem_statement -> action_plan)
  insert into public.development_areas (organization_id, name, status, pic_id, created_by)
    values (v_org, 'AC19 da', 'active', v_ceo, v_ceo) returning id into v_da;
  insert into public.problem_statements (organization_id, development_area_id, name, status, pic_id, created_by)
    values (v_org, v_da, 'AC19 ps', 'active', v_ceo, v_ceo) returning id into v_ps;
  insert into public.action_plans (organization_id, name, status, problem_statement_id, pic_id, created_by)
    values (v_org, 'AC19 ap under ps', 'active', v_ps, v_ceo, v_ceo) returning id into v_ap_p;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap_p, 'AC19 tp', 'one_time', false,false,false, 'in_progress', v_ceo, v_ceo);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select w.progress into v_p_ap_i  from public.workspace_card_progress(array[v_ap_i])  w where w.card_id = v_ap_i;
  select w.progress into v_p_ap_p  from public.workspace_card_progress(array[v_ap_p])  w where w.card_id = v_ap_p;
  select w.progress into v_p_init  from public.workspace_card_progress(array[v_init])  w where w.card_id = v_init;
  select w.progress into v_p_ps    from public.workspace_card_progress(array[v_ps])    w where w.card_id = v_ps;
  select w.progress into v_p_da    from public.workspace_card_progress(array[v_da])    w where w.card_id = v_da;
  select w.progress into v_p_strat from public.workspace_card_progress(array[v_strat]) w where w.card_id = v_strat;
  execute 'reset role';

  if v_p_ap_i  is distinct from 50 then fails := fails || 'ap_under_init_recursive:got='  || coalesce(v_p_ap_i::text,'null')  || ' want=50; '; end if;
  if v_p_ap_p  is distinct from 50 then fails := fails || 'ap_under_ps_recursive:got='    || coalesce(v_p_ap_p::text,'null')  || ' want=50; '; end if;
  if v_p_init  is distinct from 50 then fails := fails || 'init_recursive:got='           || coalesce(v_p_init::text,'null')  || ' want=50; '; end if;
  if v_p_ps    is distinct from 0  then fails := fails || 'ps_count_done_not_recursive:got=' || coalesce(v_p_ps::text,'null') || ' want=0; ';  end if;
  if v_p_da    is distinct from 0  then fails := fails || 'da_count_done:got='             || coalesce(v_p_da::text,'null')    || ' want=0; ';  end if;
  if v_p_strat is distinct from 0  then fails := fails || 'strategy_count_done:got='       || coalesce(v_p_strat::text,'null') || ' want=0; ';  end if;

  if fails <> '' then raise exception 'AC-19 FAIL: %', fails; end if;
  raise notice 'AC-19 isolation (PS/DA/Strategy count-done vs Initiative/AP avg) PASS';
end $$;
rollback;

-- ============================================================ MIXED-BATCH: heterogeneous pids in one call, no cross-contamination
-- goal(measured 70) + strategy(measured 70) + initiative(avg 50) + AP(avg 50)
-- + problem_statement(count-done 0) + task(leaf, out of switch scope -> 0)
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid; v_task uuid; v_sub uuid;
  v_da uuid; v_ps uuid; v_ap_ps uuid;
  rec record;
  got jsonb := '{}'::jsonb;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'MB goal', 'active', v_ceo, v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, status, target_numeric, pic_id, created_by)
    values (v_org, v_goal, 'MB strat', 'active', 200, v_ceo, v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strat, 'MB init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, name, status, initiative_id, pic_id, created_by)
    values (v_org, 'MB ap', 'active', v_init, v_ceo, v_ceo) returning id into v_ap;
  insert into public.tasks (organization_id, action_plan_id, name, repeat_setting,
      evidence_required, result_value_required, review_required, status, pic_id, created_by)
    values (v_org, v_ap, 'MB task', 'one_time', false,false,false, 'in_progress', v_ceo, v_ceo)
    returning id into v_task;
  -- approved result value drives strategy/goal attainment to 70
  insert into public.task_submissions (task_id, version_number, submitted_by, submitted_at, review_status, status)
    values (v_task, 1, v_ceo, now(), 'approved', 'submitted') returning id into v_sub;
  insert into public.task_result_values (submission_id, label, value_type, value_numeric, strategy_id)
    values (v_sub, 'metric', 'number', 140, v_strat);

  -- independent PS branch, one active AP (count-done 0)
  insert into public.development_areas (organization_id, name, status, pic_id, created_by)
    values (v_org, 'MB da', 'active', v_ceo, v_ceo) returning id into v_da;
  insert into public.problem_statements (organization_id, development_area_id, name, status, pic_id, created_by)
    values (v_org, v_da, 'MB ps', 'active', v_ceo, v_ceo) returning id into v_ps;
  insert into public.action_plans (organization_id, name, status, problem_statement_id, pic_id, created_by)
    values (v_org, 'MB ap ps', 'active', v_ps, v_ceo, v_ceo) returning id into v_ap_ps;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for rec in
    select w.card_id, w.progress, w.is_measured
      from public.workspace_card_progress(array[v_goal, v_strat, v_init, v_ap, v_ps, v_task]) w
  loop
    got := got || jsonb_build_object(rec.card_id::text,
             jsonb_build_object('p', rec.progress, 'm', rec.is_measured));
  end loop;
  execute 'reset role';

  if (got #>> array[v_goal::text,'p'])::int  is distinct from 70    then fails := fails || 'goal:'  || coalesce(got #>> array[v_goal::text,'p'],'null')  || '!=70; '; end if;
  if (got #>> array[v_goal::text,'m'])::bool is distinct from true  then fails := fails || 'goal_measured; '; end if;
  if (got #>> array[v_strat::text,'p'])::int is distinct from 70    then fails := fails || 'strat:' || coalesce(got #>> array[v_strat::text,'p'],'null') || '!=70; '; end if;
  if (got #>> array[v_strat::text,'m'])::bool is distinct from true then fails := fails || 'strat_measured; '; end if;
  if (got #>> array[v_init::text,'p'])::int  is distinct from 50    then fails := fails || 'init:'  || coalesce(got #>> array[v_init::text,'p'],'null')  || '!=50; '; end if;
  if (got #>> array[v_init::text,'m'])::bool is distinct from false then fails := fails || 'init_measured_true; '; end if;
  if (got #>> array[v_ap::text,'p'])::int    is distinct from 50    then fails := fails || 'ap:'    || coalesce(got #>> array[v_ap::text,'p'],'null')    || '!=50; '; end if;
  if (got #>> array[v_ps::text,'p'])::int    is distinct from 0     then fails := fails || 'ps:'    || coalesce(got #>> array[v_ps::text,'p'],'null')    || '!=0; ';  end if;
  if (got #>> array[v_task::text,'p'])::int  is distinct from 0     then fails := fails || 'task:'  || coalesce(got #>> array[v_task::text,'p'],'null')  || '!=0; ';  end if;

  if fails <> '' then raise exception 'MIXED-BATCH FAIL: %', fails; end if;
  raise notice 'MIXED-BATCH heterogeneous pids, no cross-contamination PASS';
end $$;
rollback;

\echo '0118_recursive_rollup_contract: all blocks evaluated'
