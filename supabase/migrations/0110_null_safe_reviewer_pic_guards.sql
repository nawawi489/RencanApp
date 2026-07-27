-- 0110_null_safe_reviewer_pic_guards.sql — Sprint 2, S2-5.
--
-- WHY: Four functions compare a nullable column with plain `<>`. In Postgres
-- `NULL <> auth.uid()` evaluates to NULL, which is falsy in an `if` clause,
-- so the guarded branch is silently skipped whenever the column is NULL.
-- Concretely today:
--   - `review_task_submission` / `review_task_instance_submission`: a task
--     without an assigned reviewer (`reviewer_id IS NULL`) can be reviewed
--     by any authenticated caller — no permission check, no governance log.
--   - `start_task` / `submit_task_instance`: a task or instance whose PIC
--     was left NULL (draft rows, or corrupted state) can be started/submitted
--     by anyone.
--
-- FIX: Follow the safe pattern already used in 0019:115 and 0046:1058 —
-- `if col is null or col <> auth.uid() then ...`. The rest of each body is
-- reproduced verbatim (bodies are copied wholesale to avoid drift).
--
-- Contract: supabase/tests/0110_null_safe_reviewer_pic_guards_contract.sql

-- ---------------------------------------------------------------------------
-- 1. review_task_submission — reviewer_id null-safe
-- ---------------------------------------------------------------------------
create or replace function public.review_task_submission(p_submission_id uuid, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  -- S2-5 fix: null-safe. Previously `a.reviewer_id <> auth.uid()` evaluated
  -- to NULL when reviewer_id was NULL, so both branches were skipped and any
  -- authenticated caller could review.
  if a.reviewer_id is null or a.reviewer_id <> auth.uid() then
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

revoke execute on function public.review_task_submission(uuid, text, text) from public, anon;
grant  execute on function public.review_task_submission(uuid, text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. review_task_instance_submission — reviewer_id null-safe
-- ---------------------------------------------------------------------------
create or replace function public.review_task_instance_submission(p_submission_id uuid, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

  -- S2-5 fix: null-safe reviewer guard for instance flow.
  if ins.reviewer_id is null or ins.reviewer_id <> auth.uid() then
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

revoke execute on function public.review_task_instance_submission(uuid, text, text) from public, anon;
grant  execute on function public.review_task_instance_submission(uuid, text, text) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. start_task — pic_id null-safe
-- ---------------------------------------------------------------------------
create or replace function public.start_task(p_action_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare a public.tasks;
begin
  select * into a from public.tasks where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  -- S2-5 fix: null-safe pic guard. Draft rows can have pic_id = NULL.
  if a.pic_id is null or a.pic_id <> auth.uid() then
    raise exception 'Hanya PIC yang dapat memulai pekerjaan ini.';
  end if;
  if a.status <> 'assigned' then raise exception 'Action Plan tidak dalam status Assigned.'; end if;
  update public.tasks set status = 'in_progress' where id = p_action_plan_id;
  perform public.write_activity('task', p_action_plan_id, 'start', '{}'::jsonb);
end;
$function$;

revoke execute on function public.start_task(uuid) from public, anon;
grant  execute on function public.start_task(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. submit_task_instance — pic_id null-safe
-- ---------------------------------------------------------------------------
create or replace function public.submit_task_instance(p_instance_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  ins public.task_instances;
  a public.tasks;
  v_version int;
  v_submission_id uuid;
  v_item jsonb;
  v_now timestamptz := now();
  v_effective_deadline timestamptz;
  v_late boolean := false;
  v_late_minutes int := null;
begin
  select * into ins from public.task_instances where id = p_instance_id;
  if not found then raise exception 'Instance tidak ditemukan.'; end if;
  -- S2-5 fix: null-safe pic guard.
  if ins.pic_id is null or ins.pic_id <> auth.uid() then
    raise exception 'Hanya PIC yang dapat submit instance ini.';
  end if;
  if ins.status = 'missed' then raise exception 'Instance sudah Terlewat dan tidak dapat disubmit.'; end if;
  if ins.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Instance tidak dalam status yang bisa disubmit.';
  end if;

  select * into a from public.tasks where id = ins.task_id;

  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  if a.result_value_required
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.task_submissions where task_instance_id = p_instance_id;

  insert into public.task_submissions
    (task_id, task_instance_id, version_number, submitted_by, note)
  values (ins.task_id, p_instance_id, v_version, auth.uid(), nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (v_submission_id, v_item ->> 'kind', v_item ->> 'storage_path', v_item ->> 'url',
              v_item ->> 'text_content', v_item ->> 'file_name', v_item ->> 'mime_type', auth.uid());
    end loop;
  end if;

  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      insert into public.task_result_values (submission_id, label, value_type, value_text)
      values (v_submission_id, v_item ->> 'label', coalesce(v_item ->> 'value_type', 'text'), v_item ->> 'value_text');
    end loop;
  end if;

  v_effective_deadline := ins.deadline_at;
  if v_now > v_effective_deadline then
    v_late := true;
    v_late_minutes := ceil(extract(epoch from (v_now - v_effective_deadline)) / 60.0)::int;
  end if;

  update public.task_instances
  set status = case when a.review_required then 'submitted' else 'done' end,
      current_submission_id = v_submission_id,
      submitted_at = v_now,
      submitted_late = v_late,
      late_minutes = v_late_minutes,
      reviewed_at = case when a.review_required then null else v_now end
  where id = p_instance_id;

  if not a.review_required then
    update public.task_submissions set review_status = 'approved' where id = v_submission_id;
  end if;

  perform public.write_activity('task', ins.task_id, 'submit_instance',
    jsonb_build_object('instance_id', p_instance_id, 'submission_id', v_submission_id, 'version', v_version));

  if a.review_required then
    perform public.emit_notification(ins.organization_id, ins.reviewer_id, ins.pic_id, 'review_request',
      'task_instance', p_instance_id, 'Permintaan review', a.name);
  else
    perform public.emit_notification(ins.organization_id, a.created_by, ins.pic_id, 'evidence_submitted',
      'task_instance', p_instance_id, 'Bukti dikirim', a.name);
  end if;

  return v_submission_id;
end;
$function$;

revoke execute on function public.submit_task_instance(uuid, text, jsonb, jsonb) from public, anon;
grant  execute on function public.submit_task_instance(uuid, text, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Static assertion: the four functions rewritten above must contain the
-- safe null-check pattern. Hardcoded list intentional — this catches a
-- reviewer copying an old body forward without the null-safety, without
-- needing back-reference regex (which triggers "array_agg is aggregate"
-- inside an aggregate WHERE on Postgres 15).
-- ---------------------------------------------------------------------------
do $$
declare
  v_checks record;
  v_body text;
  fails text := '';
begin
  for v_checks in
    select fn, needle from (values
      ('review_task_submission(uuid,text,text)',              'reviewer_id is null or'),
      ('review_task_instance_submission(uuid,text,text)',     'reviewer_id is null or'),
      ('start_task(uuid)',                                    'pic_id is null or'),
      ('submit_task_instance(uuid,text,jsonb,jsonb)',         'pic_id is null or')
    ) as t(fn, needle)
  loop
    begin
      v_body := pg_get_functiondef(('public.' || v_checks.fn)::regprocedure);
    exception when others then
      fails := fails || v_checks.fn || ':not_found; ';
      continue;
    end;
    if position(v_checks.needle in v_body) = 0 then
      fails := fails || v_checks.fn || ':missing_null_guard; ';
    end if;
  end loop;

  if fails <> '' then
    raise exception '0110 post-condition failed: %', fails;
  end if;
end $$;
