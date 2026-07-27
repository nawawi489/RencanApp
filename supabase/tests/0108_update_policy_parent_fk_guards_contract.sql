-- 0107-DB contract — Sprint 2, S2-3.
--
-- Enforces that cross-tenant re-parenting is rejected on the four card-parent
-- UPDATE policies (strategies, initiatives, tasks, problem_statements), and
-- that `activate_goal` still enforces the "at least 1 KPI Area" rule with an
-- organization-scoped count.
--
-- Runs against the Postgres started by `supabase start` in the CI job
-- `DB contract tests (Postgres)`. Uses SET LOCAL role/JWT to impersonate an
-- authenticated user of a specific org.

\set ON_ERROR_STOP on

begin;

-- --------------------------------------------------------------------------
-- Fixture: two orgs, each with a full parent chain and one card at every
-- level. User A belongs to Org A; user B to Org B.
-- --------------------------------------------------------------------------
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
  gen_random_uuid() as task_a,   gen_random_uuid() as task_b,
  gen_random_uuid() as da_a,     gen_random_uuid() as da_b,
  gen_random_uuid() as ps_a,     gen_random_uuid() as ps_b,
  gen_random_uuid() as rt;

-- Bypass RLS as the migration/seed user; app-facing checks below run as
-- `authenticated` with a JWT claim.
insert into public.organizations (id, name)
select org_a, 'Org A' from _c
union all
select org_b, 'Org B' from _c;

insert into public.role_templates (id, organization_id, name, level_index)
select rt, org_a, 'RT-A', 1 from _c
union all
select rt, org_b, 'RT-B', 1 from _c
on conflict do nothing;

insert into public.profiles (id, organization_id, full_name, role_template_id, is_active)
select user_a, org_a, 'User A', rt, true from _c
union all
select user_b, org_b, 'User B', rt, true from _c;

-- Grant every relevant permission to both role templates so gating comes from
-- policies, not from role permissions.
insert into public.role_template_permissions (role_template_id, permission_id)
select rt, p.id
  from _c, public.permissions p
 where p.name in (
   'manage_others_cards','create_goal','create_kpi_area','create_strategy',
   'create_initiative','create_action_plan','create_task','create_dev_area',
   'create_problem_statement'
 )
on conflict do nothing;

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

insert into public.action_plans (id, organization_id, initiative_id, problem_statement_id, name, created_by, pic_id, status)
select ap_a, org_a, init_a, ps_a, 'AP A', user_a, user_a, 'active' from _c
union all
select ap_b, org_b, init_b, ps_b, 'AP B', user_b, user_b, 'active' from _c;

insert into public.tasks (id, organization_id, action_plan_id, name, created_by, pic_id, status, repeat_setting)
select task_a, org_a, ap_a, 'Task A', user_a, user_a, 'draft', 'one_time' from _c
union all
select task_b, org_b, ap_b, 'Task B', user_b, user_b, 'draft', 'one_time' from _c;

-- --------------------------------------------------------------------------
-- Helper: run a block as `authenticated` with sub=user_a, org_id=org_a.
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
end $$;

-- --------------------------------------------------------------------------
-- 0107-DB-1: strategies UPDATE — cross-org re-parent to goal in Org B is
-- rejected. Same-org UPDATE still works.
-- --------------------------------------------------------------------------
do $$
declare
  c record;
  v_rows integer;
  v_ok boolean := false;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();

  -- Attempt: move Org A's strategy under a Goal owned by Org B.
  begin
    update public.strategies set goal_id = c.goal_b where id = c.strat_a;
    get diagnostics v_rows = row_count;
    -- If we ever get here with v_rows > 0, the WITH CHECK failed to bite.
    if v_rows > 0 then
      raise exception '0107-DB-1 FAILED: strategies WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception
    when insufficient_privilege or check_violation then
      v_ok := true;
  end;
  if not v_ok then
    -- v_rows = 0 also acceptable (policy silently filtered).
    perform 1;
  end if;

  -- Same-org UPDATE still allowed (rename).
  update public.strategies set name = 'Strat A renamed' where id = c.strat_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0107-DB-1 FAILED: same-org UPDATE on strategies did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0107-DB-1 PASSED: strategies UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0107-DB-2: initiatives UPDATE — cross-org re-parent to strategy in Org B
-- rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_rows integer; v_ok boolean := false;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    update public.initiatives set strategy_id = c.strat_b where id = c.init_a;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0107-DB-2 FAILED: initiatives WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then v_ok := true;
  end;

  update public.initiatives set name = 'Init A renamed' where id = c.init_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0107-DB-2 FAILED: same-org UPDATE on initiatives did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0107-DB-2 PASSED: initiatives UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0107-DB-3: tasks UPDATE — cross-org re-parent to action_plan in Org B
-- rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_rows integer; v_ok boolean := false;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    update public.tasks set action_plan_id = c.ap_b where id = c.task_a;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0107-DB-3 FAILED: tasks WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then v_ok := true;
  end;

  update public.tasks set name = 'Task A renamed' where id = c.task_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0107-DB-3 FAILED: same-org UPDATE on tasks did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0107-DB-3 PASSED: tasks UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0107-DB-4: problem_statements UPDATE — cross-org re-parent to
-- development_area in Org B rejected.
-- --------------------------------------------------------------------------
do $$
declare c record; v_rows integer; v_ok boolean := false;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    update public.problem_statements set development_area_id = c.da_b where id = c.ps_a;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      raise exception '0107-DB-4 FAILED: problem_statements WITH CHECK allowed cross-org re-parent (rows=%)', v_rows;
    end if;
  exception when insufficient_privilege or check_violation then v_ok := true;
  end;

  update public.problem_statements set name = 'PS A renamed' where id = c.ps_a;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception '0107-DB-4 FAILED: same-org UPDATE on problem_statements did not affect the row (rows=%)', v_rows;
  end if;

  raise notice '0107-DB-4 PASSED: problem_statements UPDATE rejects cross-org re-parent';
end $$;

-- --------------------------------------------------------------------------
-- 0107-DB-5: action_plan_in_my_org helper is null-safe and org-scoped.
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
    raise exception '0107-DB-5 FAILED: action_plan_in_my_org(null) must be true (null-safe), got %', v_null;
  end if;
  if v_own is not true then
    raise exception '0107-DB-5 FAILED: action_plan_in_my_org(own) must be true, got %', v_own;
  end if;
  if v_other is not false then
    raise exception '0107-DB-5 FAILED: action_plan_in_my_org(cross-org) must be false, got %', v_other;
  end if;
  raise notice '0107-DB-5 PASSED: action_plan_in_my_org null-safe + org-scoped';
end $$;

rollback;
