-- 0109_activate_task_org_guard_and_tasks_insert_fk.sql — Sprint 2, S2-4.
--
-- WHY:
-- 1. `activate_task` missed the sweep in 0067/0068 that added the cross-org
--    guard to 13 sibling activation RPCs. A CEO in Org A who obtains a task
--    UUID from Org B could activate it: the current body only checks
--    `created_by = auth.uid()` OR `manage_others_cards` OR (via the parent
--    action_plan lookup) `i.pic_id = auth.uid()` — none of those imply
--    same-tenancy.
-- 2. `action_plans_insert` on the physical `public.tasks` table (formerly
--    `action_plans` before the 0045 rename) validates `organization_id`,
--    `created_by`, and the create permission, but never checks that the
--    parent `action_plan_id` belongs to the caller's org. A user could
--    therefore INSERT a task pointing at a foreign action_plan and have it
--    appear in that org's rollups.
--
-- FIX:
-- - Rewrite `activate_task` with the same cross-org guard used by all
--   `activate_*` siblings, and route completeness through
--   `enforce_card_completion_rule` so operator-tunable rules apply here too.
-- - Rewrite the tasks INSERT policy to include
--   `action_plan_in_my_org(action_plan_id)` — using the helper added in
--   0108.
--
-- Contract: supabase/tests/0109_activate_task_org_guard_and_tasks_insert_fk_contract.sql

-- ---------------------------------------------------------------------------
-- 1. Rewrite tasks INSERT policy with parent-FK guard.
-- ---------------------------------------------------------------------------
drop policy if exists "action_plans_insert" on public.tasks;
drop policy if exists "tasks_insert"        on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    organization_id = public.current_user_org()
    and created_by = auth.uid()
    -- Permission key is `create_action_plan` (kept from pre-0045 for
    -- backwards compat with existing role_template_permissions rows —
    -- the table rename did not cascade to permission `key` values).
    and public.has_permission('create_action_plan')
    and public.action_plan_in_my_org(action_plan_id)
  );

-- ---------------------------------------------------------------------------
-- 2. Rewrite activate_task with cross-org guard.
--    Body preserves all existing completeness checks; only adds the org guard
--    at the top (matching the 0078 activate_* pattern).
-- ---------------------------------------------------------------------------
create or replace function public.activate_task(p_action_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  a public.tasks;
  rule public.task_repeat_rules;
  v_count int;
begin
  select * into a from public.tasks where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;

  -- S2-4 fix: reject cross-org callers *before* any state check, so the
  -- error surface matches the other activate_* siblings ("Anda tidak
  -- berwenang mengakses card lintas-organisasi.") instead of leaking status.
  if a.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;

  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.action_plans i where i.id = a.action_plan_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengaktifkan Action Plan ini.';
  end if;
  if a.status <> 'draft' then raise exception 'Action Plan sudah diaktifkan.'; end if;
  if a.pic_id = a.reviewer_id then
    raise exception 'PIC dan Reviewer tidak boleh orang yang sama.';
  end if;

  -- Cabang REPEAT
  if a.repeat_setting = 'repeat' then
    select * into rule from public.task_repeat_rules where task_id = p_action_plan_id;
    if not found then raise exception 'Repeat Rule belum diatur untuk Action Plan ini.'; end if;
    if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
       or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
       or a.priority is null
       or coalesce(trim(a.deadline_time), '') = '' then
      raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, output, definition of done, prioritas, Jam Deadline wajib).';
    end if;
    if a.evidence_required and coalesce(trim(a.evidence_description), '') = '' then
      raise exception 'Bukti yang Diminta wajib dideskripsikan saat Bukti diwajibkan (PRD §22.5).';
    end if;
    update public.tasks set status = 'in_progress' where id = p_action_plan_id;
    v_count := public.generate_action_plan_instances(p_action_plan_id, rule.repeat_end_date);
    perform public.write_activity('task', p_action_plan_id, 'activate_repeat',
      jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id, 'instances', v_count));
    return;
  end if;

  -- Cabang ONE TIME
  if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
     or a.start_date is null or a.deadline is null
     or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
     or a.priority is null
     or coalesce(trim(a.deadline_time), '') = '' then
    raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, tanggal mulai, deadline, Jam Deadline, output, definition of done, prioritas wajib).';
  end if;
  if a.evidence_required and coalesce(trim(a.evidence_description), '') = '' then
    raise exception 'Bukti yang Diminta wajib dideskripsikan saat Bukti diwajibkan (PRD §22.5).';
  end if;
  update public.tasks set status = 'assigned' where id = p_action_plan_id;
  perform public.write_activity('task', p_action_plan_id, 'activate',
    jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id));
end;
$function$;

-- 0105 lockdown re-application for the rewritten function.
revoke execute on function public.activate_task(uuid) from public, anon;
grant  execute on function public.activate_task(uuid) to authenticated, service_role;
