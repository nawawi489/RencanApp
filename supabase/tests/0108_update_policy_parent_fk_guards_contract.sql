-- 0108-DB contract — Sprint 2, S2-3.
--
-- Enforces that cross-tenant re-parenting is rejected on the four card-parent
-- UPDATE policies (strategies, initiatives, tasks, problem_statements), and
-- that `action_plan_in_my_org` is null-safe + org-scoped.
--
-- Uses the CEO fixture users from _fixtures.sql instead of creating new
-- profiles (auth.users FK). Contract Fixtures Org = Org A; DCR-05 Fixtures
-- Org = Org B. Fixture CEOs already carry a role template with the create/
-- manage permissions we exercise.

\set ON_ERROR_STOP on

begin;
set local row_security = off;

-- --------------------------------------------------------------------------
-- Fixture handles + parent chains per org. Inserts run as postgres (BYPASSRLS)
-- so `set local row_security = off` is belt-and-suspenders.
-- --------------------------------------------------------------------------
create temporary table _c on commit drop as
select
  '4b07a19f-550d-4952-b0d8-44f38f651d89'::uuid as org_a,

  '52b0ebe1-d8bd-466d-b491-526ee6518b70'::uuid as org_b,
  'ca8c1471-b870-4f09-a149-25e5eae99d6f'::uuid as user_a,   -- CEO Fixture
  '11111111-1111-1111-1111-000000000001'::uuid as user_b,   -- DCR CEO
  gen_random_uuid() as goal_a,   gen_random_uuid() as goal_b,
  gen_random_uuid() as strat_a,  gen_random_uuid() as strat_b,
  gen_random_uuid() as init_a,   gen_random_uuid() as init_b,
  gen_random_uuid() as ap_a,     gen_random_uuid() as ap_b,
  gen_random_uuid() as task_a,   gen_random_uuid() as task_b,
  gen_random_uuid() as da_a,     gen_random_uuid() as da_b,
  gen_random_uuid() as ps_a,     gen_random_uuid() as ps_b;

-- Grant read so the authenticated impersonation blocks below can `select * from _c`.
grant select on _c to public;

-- Full parent chain per org.
insert into public.goals (id, organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
select goal_a, org_a, 'Goal A', user_a, user_a, 'active', '10', now(), now() + interval '30 days' from _c
union all
select goal_b, org_b, 'Goal B', user_b, user_b, 'active', '10', now(), now() + interval '30 days' from _c;

insert into public.strategies (id, organization_id, goal_id, name, created_by, pic_id, status)
select strat_a, org_a, goal_a, 'Strat A', user_a, user_a, 'active' from _c
union all
select strat_b, org_b, goal_b, 'Strat B', user_b, user_b, 'active' from _c;

insert into public.initiatives (id, organization_id, strategy_id, name, created_by, pic_id, status)
select init_a, org_a, strat_a, 'Init A', user_a, user_a, 'active' from _c
union all
select init_b, org_b, strat_b, 'Init B', user_b, user_b, 'active' from _c;

insert into public.development_areas (id, organization_id, name, created_by, pic_id, status)
select da_a, org_a, 'DA A', user_a, user_a, 'active' from _c
union all
select da_b, org_b, 'DA B', user_b, user_b, 'active' from _c;

insert into public.problem_statements (id, organization_id, development_area_id, name, created_by, pic_id, status)
select ps_a, org_a, da_a, 'PS A', user_a, user_a, 'active' from _c
union all
select ps_b, org_b, da_b, 'PS B', user_b, user_b, 'active' from _c;

-- action_plans_single_parent constraint: exactly one of initiative_id /
-- problem_statement_id must be set. Attach these to initiatives only.
insert into public.action_plans (id, organization_id, initiative_id, name, created_by, pic_id, status)
select ap_a, org_a, init_a, 'AP A', user_a, user_a, 'active' from _c
union all
select ap_b, org_b, init_b, 'AP B', user_b, user_b, 'active' from _c;

insert into public.tasks (id, organization_id, action_plan_id, name, created_by, pic_id, status, repeat_setting)
select task_a, org_a, ap_a, 'Task A', user_a, user_a, 'draft', 'one_time' from _c
union all
select task_b, org_b, ap_b, 'Task B', user_b, user_b, 'draft', 'one_time' from _c;

-- --------------------------------------------------------------------------
-- Helper: run as `authenticated` with sub=user_a, org_id=org_a. Also flips
-- row_security back ON so the impersonated queries are subject to RLS.
-- --------------------------------------------------------------------------
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
-- 0108-DB-1 strategies UPDATE — cross-org re-parent rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_rows integer;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    update public.strategies set goal_id = c.goal_b where id = c.strat_a;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0108-DB-1 FAILED: strategies WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then null;
  end;

  update public.strategies set name = 'Strat A renamed' where id = c.strat_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0108-DB-1 FAILED: same-org UPDATE on strategies did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0108-DB-1 PASSED: strategies UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0108-DB-2 initiatives UPDATE — cross-org re-parent rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_rows integer;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    update public.initiatives set strategy_id = c.strat_b where id = c.init_a;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0108-DB-2 FAILED: initiatives WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then null;
  end;

  update public.initiatives set name = 'Init A renamed' where id = c.init_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0108-DB-2 FAILED: same-org UPDATE on initiatives did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0108-DB-2 PASSED: initiatives UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0108-DB-3 tasks UPDATE — cross-org re-parent rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_rows integer;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    update public.tasks set action_plan_id = c.ap_b where id = c.task_a;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0108-DB-3 FAILED: tasks WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then null;
  end;

  update public.tasks set name = 'Task A renamed' where id = c.task_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0108-DB-3 FAILED: same-org UPDATE on tasks did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0108-DB-3 PASSED: tasks UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0108-DB-4 problem_statements UPDATE — cross-org re-parent rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_rows integer;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    update public.problem_statements set development_area_id = c.da_b where id = c.ps_a;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0108-DB-4 FAILED: problem_statements WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then null;
  end;

  update public.problem_statements set name = 'PS A renamed' where id = c.ps_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0108-DB-4 FAILED: same-org UPDATE on problem_statements did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0108-DB-4 PASSED: problem_statements UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0108-DB-5 action_plan_in_my_org helper — null-safe + org-scoped.
-- --------------------------------------------------------------------------
do $$
declare c record; v_null boolean; v_own boolean; v_other boolean;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  select public.action_plan_in_my_org(null)     into v_null;
  select public.action_plan_in_my_org(c.ap_a)   into v_own;
  select public.action_plan_in_my_org(c.ap_b)   into v_other;
  if v_null is not true then
    raise exception '0108-DB-5 FAILED: action_plan_in_my_org(null) must be true (null-safe), got %', v_null;
  end if;
  if v_own is not true then
    raise exception '0108-DB-5 FAILED: action_plan_in_my_org(own) must be true, got %', v_own;
  end if;
  if v_other is not false then
    raise exception '0108-DB-5 FAILED: action_plan_in_my_org(cross-org) must be false, got %', v_other;
  end if;
  raise notice '0108-DB-5 PASSED: action_plan_in_my_org null-safe + org-scoped';
end $$;

rollback;
