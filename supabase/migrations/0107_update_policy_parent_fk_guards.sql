-- 0107_update_policy_parent_fk_guards.sql — Sprint 2, S2-3.
--
-- WHY: Every card-parent table has an INSERT policy that validates the new
-- parent belongs to the caller's org, but the UPDATE policies stopped at
-- `organization_id = current_user_org()`. Consequence: `UPDATE strategies
-- SET goal_id = <goal in org B>` was accepted as long as the row itself was
-- in the caller's org, letting a malicious user *re-parent* their own card
-- to a foreign org and pull its child rollups into their view. The already-
-- correct `action_plans_update` policy (see 0046:2770) demonstrates the
-- pattern: FK-parent guard(s) in `WITH CHECK`.
--
-- FIX (four physical tables affected by the 0045 rename chain):
--   1. `public.strategies`         → parent `goal_id`
--   2. `public.initiatives`        → parent `strategy_id`
--   3. `public.tasks`              → parent `action_plan_id`
--   4. `public.problem_statements` → parent `development_area_id`
--
-- The `_in_my_org(uuid)` helpers already exist for goal / strategy /
-- development_area / problem_statement / initiative. `action_plan_in_my_org`
-- is added here for the tasks-parent guard (post-rename it referenced no
-- pre-existing helper).
--
-- BONUS FIX: `activate_goal` counted KPI Area children with only `goal_id`,
-- omitting the `organization_id` filter — cheap defense-in-depth even though
-- the FK plus RLS make cross-org children impossible today.
--
-- Contract: supabase/tests/0107_update_policy_parent_fk_guards_contract.sql

-- ---------------------------------------------------------------------------
-- 1. Helper: action_plan_in_my_org(uuid). Null-safe, mirrors strategy_in_my_org.
-- ---------------------------------------------------------------------------
create or replace function public.action_plan_in_my_org(p_action_plan uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_action_plan is null or exists (
    select 1
      from public.action_plans a
     where a.id = p_action_plan
       and a.organization_id = public.current_user_org()
  );
$$;

-- Lock the helper down immediately (0105 sweep + defensive explicit revoke).
revoke execute on function public.action_plan_in_my_org(uuid) from public, anon;
grant  execute on function public.action_plan_in_my_org(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Replace the four vulnerable UPDATE policies.
--    Both the old (pre-0045) and new policy names are dropped defensively —
--    the 0045 rename touched tables, not policies, so historical names may
--    still be attached.
-- ---------------------------------------------------------------------------

-- 2a. public.strategies — parent goal_id.
-- Drop every pre-existing UPDATE policy on this physical table by pattern so
-- we do not need to reference the legacy pre-0045 policy name in source
-- (blocked by the rename guard). The new policy is created immediately below.
do $$
declare r record;
begin
  for r in
    select p.polname from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'strategies' and p.polcmd = 'w'
  loop
    execute format('drop policy %I on public.strategies', r.polname);
  end loop;
end $$;
create policy "strategies_update" on public.strategies
  for update to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      created_by = auth.uid()
      or pic_id = auth.uid()
      or public.has_permission('manage_others_cards')
    )
  )
  with check (
    organization_id = public.current_user_org()
    and public.goal_in_my_org(goal_id)
  );

-- 2b. public.initiatives (was strategies) — parent strategy_id
drop policy if exists "strategies_update"  on public.initiatives;
drop policy if exists "initiatives_update" on public.initiatives;
create policy "initiatives_update" on public.initiatives
  for update to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      created_by = auth.uid()
      or pic_id = auth.uid()
      or public.has_permission('manage_others_cards')
    )
  )
  with check (
    organization_id = public.current_user_org()
    and public.strategy_in_my_org(strategy_id)
  );

-- 2c. public.tasks (was action_plans) — parent action_plan_id
drop policy if exists "action_plans_update" on public.tasks;
drop policy if exists "tasks_update"        on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      created_by = auth.uid()
      or pic_id = auth.uid()
      or reviewer_id = auth.uid()
      or public.has_permission('manage_others_cards')
    )
  )
  with check (
    organization_id = public.current_user_org()
    and public.action_plan_in_my_org(action_plan_id)
  );

-- 2d. public.problem_statements — parent development_area_id
drop policy if exists "problem_statements_update" on public.problem_statements;
create policy "problem_statements_update" on public.problem_statements
  for update to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      created_by = auth.uid()
      or pic_id = auth.uid()
      or public.has_permission('manage_others_cards')
    )
  )
  with check (
    organization_id = public.current_user_org()
    and public.development_area_in_my_org(development_area_id)
  );

-- ---------------------------------------------------------------------------
-- 3. activate_goal count filter — cheap defense-in-depth for cross-org KPI
--    Area count (line 167 of 0078). Preserves the rest of the body verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.activate_goal(p_goal_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare g public.goals; v_kpi int;
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;
  if g.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Goal ini.';
  end if;
  if g.status <> 'draft' then raise exception 'Goal sudah diaktifkan.'; end if;
  if coalesce(trim(g.name), '') = '' or g.pic_id is null or g.period_start is null or g.period_end is null
     or coalesce(trim(g.target_value), '') = '' then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;
  -- S2-3 fix: filter child count by organization_id so a hypothetical FK/RLS
  -- regression cannot inflate the count from foreign tenants.
  select count(*) into v_kpi
    from public.strategies
   where goal_id = p_goal_id
     and organization_id = g.organization_id;
  if v_kpi < 1 then
    raise exception 'Goal wajib memiliki minimal 1 KPI Area sebelum diaktifkan.';
  end if;
  perform public.enforce_card_completion_rule('goal',
    public.card_completion_rule_for(g.organization_id, 'goal'),
    to_jsonb(g));
  update public.goals set status = 'active' where id = p_goal_id;
  perform public.write_activity('goal', p_goal_id, 'activate', '{}'::jsonb);
end;
$$;

-- CREATE OR REPLACE resets ACL to PUBLIC — re-apply the 0105 lockdown for
-- this specific function so we don't wait for the next full sweep.
revoke execute on function public.activate_goal(uuid) from public, anon;
grant  execute on function public.activate_goal(uuid) to authenticated, service_role;
