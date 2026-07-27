-- 0109-DB contract — Sprint 2, S2-4.
-- Verifies:
--   0109-DB-1: activate_task rejects a cross-org call with the same-org error.
--   0109-DB-2: tasks INSERT policy rejects a task whose action_plan_id
--              belongs to a different org.

\set ON_ERROR_STOP on

begin;
set local row_security = off;

create temporary table _c on commit drop as
select
  '4b07a19f-550d-4952-b0d8-44f38f651d89'::uuid as org_a,
  '52b0ebe1-d8bd-466d-b491-526ee6518b70'::uuid as org_b,
  'ca8c1471-b870-4f09-a149-25e5eae99d6f'::uuid as user_a,
  '11111111-1111-1111-1111-000000000001'::uuid as user_b,
  gen_random_uuid() as goal_b,  gen_random_uuid() as strat_b,
  gen_random_uuid() as init_b,  gen_random_uuid() as ap_b,
  gen_random_uuid() as task_b;

-- Parent chain in Org B (for the draft task we'll try to activate cross-org).
insert into public.goals (id, organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
  select goal_b, org_b, 'Goal B', user_b, user_b, 'active', '10', now(), now() + interval '30 days' from _c;
insert into public.strategies (id, organization_id, goal_id, name, created_by, pic_id, status)
  select strat_b, org_b, goal_b, 'S B', user_b, user_b, 'active' from _c;
insert into public.initiatives (id, organization_id, strategy_id, name, created_by, pic_id, status)
  select init_b, org_b, strat_b, 'I B', user_b, user_b, 'active' from _c;
insert into public.action_plans (id, organization_id, initiative_id, name, created_by, pic_id, status)
  select ap_b, org_b, init_b, 'AP B', user_b, user_b, 'active' from _c;

insert into public.tasks (id, organization_id, action_plan_id, name, created_by, pic_id, reviewer_id,
                          status, repeat_setting, expected_output, definition_of_done, priority, deadline_time,
                          start_date, deadline)
  select task_b, org_b, ap_b, 'Task B', user_b, user_b, user_b, 'draft', 'one_time',
         'out', 'dod', 'high', '17:00', now()::date, now()::date + 1 from _c;

create or replace function pg_temp.act_as_a() returns void language plpgsql as $$
declare c record;
begin
  select * into c from _c;
  perform set_config('request.jwt.claim.sub', c.user_a::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', c.user_a::text, 'role', 'authenticated', 'org_id', c.org_a::text)::text,
    true);
  perform set_config('role', 'authenticated', true);
  perform set_config('row_security', 'on', true);
end $$;

-- --------------------------------------------------------------------------
-- 0109-DB-1: activate_task on a task in Org B by user A → cross-org error.
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
    raise exception '0109-DB-1 FAILED: activate_task accepted a cross-org call';
  end if;
  if v_msg not ilike '%lintas-organisasi%' then
    raise exception '0109-DB-1 FAILED: expected cross-org message, got: %', v_msg;
  end if;
  raise notice '0109-DB-1 PASSED: activate_task rejects cross-org caller';
end $$;

-- --------------------------------------------------------------------------
-- 0109-DB-2: tasks INSERT with a foreign action_plan_id rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_new_task uuid := gen_random_uuid(); v_rows integer;
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
  exception when insufficient_privilege or check_violation then null;
  end;
  raise notice '0109-DB-2 PASSED: tasks INSERT rejects cross-org action_plan_id';
end $$;

rollback;
