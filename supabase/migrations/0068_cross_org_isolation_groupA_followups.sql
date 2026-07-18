-- =============================================================================
-- 0068_cross_org_isolation_groupA_followups.sql
-- =============================================================================
-- SECURITY FIX (Group A, /cso follow-up 2026-07-16):
--
-- Migration 0067 fixed 13 SECURITY DEFINER RPCs that never compared the target
-- row's organization_id to the caller's own org. Post-merge review surfaced
-- four more RPCs with the same shape:
--
--   1. review_task_submission           (0046:2041)
--   2. review_task_instance_submission  (0046:1965)
--        Both log a governance_violation on reviewer_override, but the log
--        entry doesn't block the write — a manage_others_cards holder in
--        Org A could still review Org B's submission by ID. Add the org
--        guard BEFORE the reviewer-override branch so cross-org access is
--        rejected outright; same-org overrides continue to log as today.
--
--   3. assign_score_formula             (0013:440)
--        Fetches v_org from score_formula_versions but never checks it
--        against current_user_org(); also never validates p_user_id belongs
--        to the caller's org when scope_level='user'.
--
--   4. create_team                      (0014:491)
--        Correctly guards p_department_id via v_org, but the adjacent
--        p_lead_id insert has no equivalent check — inconsistent with the
--        assign_team_member function directly below it.
--
-- All four are CREATE OR REPLACE — signatures unchanged, no DROP needed.
-- =============================================================================


-- ============================================================ 1. review_task_submission (0046:2041)
CREATE OR REPLACE FUNCTION public.review_task_submission(p_submission_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.task_submissions;
  a public.tasks;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.task_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  select * into a from public.tasks where id = s.task_id;

  if a.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;

  if a.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if a.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail)
      values (a.organization_id, auth.uid(), 'reviewer_override', 'task', a.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', a.reviewer_id));
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review pekerjaan ini.';
    end if;
  end if;
  if s.review_status <> 'pending' or a.status <> 'submitted' then
    raise exception 'Submission ini sudah direview atau tidak menunggu review.';
  end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  update public.task_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (task_id, submission_id, reviewer_id, decision, reason)
  values (a.id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.tasks
  set status = case when p_decision = 'approve' then 'done' else 'revision' end
  where id = a.id;

  perform public.write_activity('task', a.id,
    case when p_decision = 'approve' then 'review_approve' else 'review_reject' end,
    jsonb_build_object('submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  perform public.emit_notification(a.organization_id, a.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'task', a.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end,
    a.name);

  perform public.resolve_notifications('task', a.id,
    array['review_request'],
    case when p_decision = 'approve' then 'approved' else 'rejected' end);
end;
$function$;


-- ============================================================ 2. review_task_instance_submission (0046:1965)
CREATE OR REPLACE FUNCTION public.review_task_instance_submission(p_submission_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.task_submissions;
  ins public.task_instances;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.task_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  if s.task_instance_id is null then
    raise exception 'Submission ini bukan submission instance.';
  end if;
  select * into ins from public.task_instances where id = s.task_instance_id;

  if ins.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;

  if ins.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if ins.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
      values (ins.organization_id, auth.uid(), 'reviewer_override', 'task_instance', ins.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', ins.reviewer_id), 'medium');
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review instance ini.';
    end if;
  end if;

  if s.review_status <> 'pending' or ins.status <> 'submitted' then
    raise exception 'Submission ini sudah direview atau tidak menunggu review.';
  end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  update public.task_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (task_id, submission_id, reviewer_id, decision, reason)
  values (ins.task_id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.task_instances
  set status = case when p_decision = 'approve' then 'done' else 'revision' end,
      reviewed_at = now()
  where id = ins.id;

  perform public.write_activity('task', ins.task_id,
    case when p_decision = 'approve' then 'review_instance_approve' else 'review_instance_reject' end,
    jsonb_build_object('instance_id', ins.id, 'submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  perform public.emit_notification(ins.organization_id, ins.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'task_instance', ins.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end, null);

  perform public.resolve_notifications('task_instance', ins.id,
    array['review_request'],
    case when p_decision = 'approve' then 'approved' else 'rejected' end);
end;
$function$;


-- ============================================================ 3. assign_score_formula (0013:440)
create or replace function public.assign_score_formula(
  p_version_id uuid, p_scope_level text, p_role_level text, p_user_id uuid, p_start_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select organization_id into v_org from public.score_formula_versions where id = p_version_id;
  if v_org is null then raise exception 'Versi formula tidak ditemukan.'; end if;
  if v_org is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if p_scope_level = 'user' and p_user_id is not null and not exists (
    select 1 from public.profiles where id = p_user_id and organization_id = v_org
  ) then
    raise exception 'User target harus anggota organisasi yang sama.';
  end if;

  update public.score_formula_assignments
    set end_date = coalesce(p_start_date, current_date) - 1
    where organization_id = public.current_user_org()
      and scope_level = p_scope_level
      and ((scope_level='org_role' and role_level = p_role_level)
        or (scope_level='user' and user_id = p_user_id))
      and end_date is null;

  insert into public.score_formula_assignments
    (organization_id, formula_version_id, scope_level, role_level, user_id, start_date, assigned_by)
    values (public.current_user_org(), p_version_id, p_scope_level, p_role_level, p_user_id,
            coalesce(p_start_date, current_date), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;


-- ============================================================ 4. create_team (0014:491)
create or replace function public.create_team(
  p_name text, p_department_id uuid, p_description text, p_lead_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_teams') then
    raise exception 'Anda tidak berwenang mengelola Tim.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama Tim wajib diisi.'; end if;
  v_org := public.current_user_org();
  if p_department_id is not null and not exists (
    select 1 from public.departments d where d.id = p_department_id and d.organization_id = v_org
  ) then raise exception 'Department tidak ditemukan di organisasi ini.'; end if;
  if p_lead_id is not null and not exists (
    select 1 from public.profiles p where p.id = p_lead_id and p.organization_id = v_org
  ) then raise exception 'Lead Tim harus anggota organisasi yang sama.'; end if;
  insert into public.teams (organization_id, department_id, name, description, lead_id, created_by)
  values (v_org, p_department_id, trim(p_name),
          nullif(trim(coalesce(p_description,'')),''), p_lead_id, auth.uid())
  returning id into v_id;
  perform public.write_activity('team', v_id, 'create', jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;
