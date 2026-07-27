-- 0109-DB contract — Sprint 2, S2-4.
-- Verifies:
--   0109-DB-1: activate_task rejects a cross-org call with the exact
--              same-organization error message used by other activate_*.
--   0109-DB-2: tasks INSERT policy rejects a task whose action_plan_id
--              belongs to a different org.

\set ON_ERROR_STOP on

begin;

create temporary table _c on commit drop as
select
  gen_random_uuid() as org_a,
  gen_random_uuid() as org_b,
  gen_random_uuid() as user_a,
  gen_random_uuid() as user_b,
  gen_random_uuid() as goal_a,   gen_random_uuid() as goal_b,
  gen_random_uuid() as strat_a,  gen_random_uuid() as strat_b,
  gen_random_uuid() as init_a,   gen_random_uuid() as init_b,
  gen_random_uuid() as ap_a,     gen_random_uuid() as ap_b,
  gen_random_uuid() as task_b,
  gen_random_uuid() as rt;

insert into public.organizations (id, name)
  select org_a, 'Org A' from _c union all select org_b, 'Org B' from _c;
insert into public.role_templates (id, organization_id, name, level)
  select rt, org_a, 'RT-A', 'staff' from _c on conflict do nothing;
insert into public.role_templates (id, organization_id, name, level)
  select rt, org_b, 'RT-B', 'staff' from _c on conflict do nothing;
insert into public.profiles (id, organization_id, full_name, role_template_id, is_active)
  select user_a, org_a, 'User A', rt, true from _c union all
  select user_b, org_b, 'User B', rt, true from _c;
insert into public.role_template_permissions (role_template_id, permission_id)
  select rt, p.id from _c, public.permissions p
   where p.key in ('manage_others_cards','create_goal','create_action_plan')
  on conflict do nothing;

-- Parent chain per org (all active).
insert into public.goals (id, organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
  select goal_a, org_a, 'Goal A', user_a, user_a, 'active', '10', now(), now() + interval '30 days' from _c union all
  select goal_b, org_b, 'Goal B', user_b, user_b, 'active', '10', now(), now() + interval '30 days' from _c;
insert into public.strategies (id, organization_id, goal_id, name, created_by, pic_id, status)
  select strat_a, org_a, goal_a, 'S A', user_a, user_a, 'active' from _c union all
  select strat_b, org_b, goal_b, 'S B', user_b, user_b, 'active' from _c;
insert into public.initiatives (id, organization_id, strategy_id, name, created_by, pic_id, status)
  select init_a, org_a, strat_a, 'I A', user_a, user_a, 'active' from _c union all
  select init_b, org_b, strat_b, 'I B', user_b, user_b, 'active' from _c;
insert into public.action_plans (id, organization_id, initiative_id, name, created_by, pic_id, status)
  select ap_a, org_a, init_a, 'AP A', user_a, user_a, 'active' from _c union all
  select ap_b, org_b, init_b, 'AP B', user_b, user_b, 'active' from _c;

-- One draft task in Org B, so an Org A caller can attempt cross-org activate.
insert into public.tasks (id, organization_id, action_plan_id, name, created_by, pic_id, reviewer_id,
                          status, repeat_setting, expected_output, definition_of_done, priority, deadline_time,
                          start_date, deadline)
  select task_b, org_b, ap_b, 'Task B', user_b, user_b, user_b, 'draft', 'one_time',
         'out', 'dod', 1, '17:00', now()::date, now()::date + 1 from _c;

create or replace function pg_temp.act_as_a() returns void language plpgsql as $$
declare c record;
begin
  select * into c from _c;
  perform set_config('request.jwt.claim.sub', c.user_a::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', c.user_a::text, 'role', 'authenticated', 'org_id', c.org_a::text)::text,
    true);
  perform set_config('role', 'authenticated', true);
end $$;

-- --------------------------------------------------------------------------
-- 0109-DB-1: activate_task on a task in Org B, called by user in Org A →
-- must raise the cross-org error, NOT any state / permission error.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text := ''; v_raised boolean := false;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    perform public.activate_task(c.task_b);
  exception when others then
    v_msg := SQLERRM;
    v_raised := true;
  end;

  if not v_raised then
    raise exception '0109-DB-1 FAILED: activate_task accepted a cross-org call (no exception)';
  end if;
  if v_msg not ilike '%lintas-organisasi%' then
    raise exception '0109-DB-1 FAILED: expected cross-org message, got: %', v_msg;
  end if;
  raise notice '0109-DB-1 PASSED: activate_task rejects cross-org caller';
end $$;

-- --------------------------------------------------------------------------
-- 0109-DB-2: tasks INSERT with a foreign action_plan_id is rejected by the
-- new WITH CHECK (action_plan_in_my_org).
-- --------------------------------------------------------------------------
do $$
declare c record; v_new_task uuid := gen_random_uuid(); v_rows integer; v_ok boolean := false;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();

  begin
    insert into public.tasks (id, organization_id, action_plan_id, name, created_by, pic_id,
                              status, repeat_setting)
    values (v_new_task, c.org_a, c.ap_b, 'sneaky', c.user_a, c.user_a, 'draft', 'one_time');
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0109-DB-2 FAILED: WITH CHECK allowed cross-org action_plan_id (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then
    v_ok := true;
  end;
  raise notice '0109-DB-2 PASSED: tasks INSERT rejects cross-org action_plan_id';
end $$;

rollback;
