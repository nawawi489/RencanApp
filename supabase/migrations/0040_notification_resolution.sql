-- ============================================================================
-- 0040 — ISSUE-005: resolusi notifikasi actionable.
-- Notifikasi actionable (review_request / deadline_change_*) tetap tampil
-- "menunggu review" setelah entity-nya sudah diputuskan. Perbaikan: tandai baris
-- notif tersebut `resolved_at` + `resolution` saat RPC pemutus jalan.
-- ============================================================================

-- --------------------------------------------------- 1. Kolom resolusi (idempotent)
alter table public.notifications
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution  text;

-- Guard: nilai resolution yang valid.
alter table public.notifications
  drop constraint if exists notifications_resolution_check,
  add constraint notifications_resolution_check
    check (resolution is null or resolution in
      ('approved','rejected','revision_requested','resubmitted','superseded'));

-- Index parsial: perlu-tindakan query filter `resolved_at is null` sering dipanggil.
create index if not exists notifications_unresolved_idx
  on public.notifications (recipient_id, type)
  where resolved_at is null;

-- --------------------------------------------------- 2. Helper internal
-- Menandai semua baris notif untuk (entity_type, entity_id) di antara p_types
-- yang belum resolved. SECURITY DEFINER, revoke dari role publik.
create or replace function public.resolve_notifications(
  p_entity_type text,
  p_entity_id   uuid,
  p_types       text[],
  p_resolution  text
) returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.notifications
     set resolved_at = coalesce(resolved_at, now()),
         resolution  = coalesce(resolution, p_resolution)
   where entity_type = p_entity_type
     and entity_id   = p_entity_id
     and type = any (p_types)
     and resolved_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.resolve_notifications(text, uuid, text[], text)
  from public, anon, authenticated;

-- --------------------------------------------------- 3. review_deadline_change:
-- versi 0038 + resolve notif reviewer di semua branch putusan.
create or replace function public.review_deadline_change(
  p_request_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_req public.deadline_change_requests;
  v_ap_status text;
begin
  if p_decision not in ('approved','rejected','revision_requested') then
    raise exception 'Keputusan tidak valid.';
  end if;
  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan.'; end if;
  if v_req.status <> 'pending' then
    raise exception 'Permintaan ini sudah diproses atau menunggu revisi pengaju.';
  end if;
  if not public.has_permission('review_deadline_changes') then
    raise exception 'Anda tidak berwenang me-review perubahan deadline.';
  end if;
  if v_req.requestor_id = auth.uid() then
    insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, severity, detail)
    values (v_req.organization_id, auth.uid(), 'deadline_change_self_approval',
            v_req.entity_type, v_req.entity_id, 'critical',
            jsonb_build_object('request_id', p_request_id, 'decision', p_decision));
    raise exception 'Anda tidak dapat me-review permintaan yang Anda ajukan sendiri.';
  end if;
  if p_decision in ('rejected','revision_requested')
     and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi untuk menolak atau meminta revisi.';
  end if;

  if p_decision in ('approved','revision_requested') then
    select status into v_ap_status from public.action_plans where id = v_req.entity_id;
    if v_ap_status in ('archived','cancelled','done') then
      raise exception 'Action Plan sudah berstatus terminal; permintaan tidak dapat diproses.';
    end if;
  end if;

  if p_decision = 'approved' then
    update public.deadline_change_requests
      set status = 'approved', approver_id = auth.uid(), responded_at = now()
      where id = p_request_id;
    perform set_config('app.allow_deadline_update', 'true', true);
    update public.action_plans set deadline = v_req.new_deadline where id = v_req.entity_id;
    perform set_config('app.allow_deadline_update', 'false', true);
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'approved', auth.uid(), nullif(trim(coalesce(p_reason,'')),''));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_approved',
      jsonb_build_object('request_id', p_request_id, 'new_deadline', v_req.new_deadline));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_approved', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Disetujui', 'Permintaan perubahan deadline Anda disetujui.');
    -- ISSUE-005: notif reviewer "menunggu review" tidak lagi actionable.
    perform public.resolve_notifications('action_plan', v_req.entity_id,
      array['deadline_change_requested'], 'approved');
  elsif p_decision = 'revision_requested' then
    update public.deadline_change_requests
      set status = 'revision_requested', approver_id = auth.uid(),
          responded_at = now(), revision_reason = trim(p_reason)
      where id = p_request_id;
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'revision_requested', auth.uid(), trim(p_reason));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_revision_requested',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_revision_requested', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Perlu Revisi', 'Reviewer meminta revisi pada permintaan Anda.');
    perform public.resolve_notifications('action_plan', v_req.entity_id,
      array['deadline_change_requested'], 'revision_requested');
  else
    update public.deadline_change_requests
      set status = 'rejected', approver_id = auth.uid(), responded_at = now(), rejection_reason = trim(p_reason)
      where id = p_request_id;
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'rejected', auth.uid(), trim(p_reason));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_rejected',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_rejected', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Ditolak', 'Permintaan perubahan deadline Anda ditolak.');
    perform public.resolve_notifications('action_plan', v_req.entity_id,
      array['deadline_change_requested'], 'rejected');
  end if;
end;
$$;
revoke execute on function public.review_deadline_change(uuid, text, text) from public, anon;

-- --------------------------------------------------- 4. resubmit_deadline_change_request:
-- versi 0038 + resolve notif "Perlu Revisi" milik pengaju.
create or replace function public.resubmit_deadline_change_request(
  p_request_id uuid, p_new_deadline date, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_req public.deadline_change_requests;
  v_reviewer uuid;
  v_ap_status text;
  v_ap_deadline date;
begin
  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan.'; end if;
  if v_req.requestor_id <> auth.uid() then
    raise exception 'Hanya pengaju yang dapat mengirim ulang permintaan.';
  end if;
  if v_req.status <> 'revision_requested' then
    raise exception 'Permintaan ini tidak dalam status perlu revisi.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi.';
  end if;

  select status, deadline into v_ap_status, v_ap_deadline
    from public.action_plans where id = v_req.entity_id;
  if v_ap_status in ('archived','cancelled','done') then
    raise exception 'Action Plan sudah berstatus terminal; revisi tidak dapat dikirim.';
  end if;
  if p_new_deadline <= v_ap_deadline then
    raise exception 'Tanggal baru tidak boleh lebih awal atau sama dengan deadline saat ini.';
  end if;
  if p_new_deadline < public.org_today(v_req.organization_id) then
    raise exception 'Tanggal baru tidak boleh di masa lalu.';
  end if;

  update public.deadline_change_requests
    set status = 'pending',
        new_deadline = p_new_deadline,
        reason = trim(p_reason),
        approver_id = null,
        responded_at = null,
        revision_reason = null
    where id = p_request_id;

  insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
  values (v_req.organization_id, p_request_id, 'resubmitted', auth.uid(),
          'new_deadline=' || p_new_deadline::text || '; reason=' || trim(p_reason));

  perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_resubmitted',
    jsonb_build_object('request_id', p_request_id, 'new_deadline', p_new_deadline, 'reason', trim(p_reason)));

  select reviewer_id into v_reviewer from public.action_plans where id = v_req.entity_id;
  if v_reviewer is not null then
    perform public.emit_notification(v_req.organization_id, v_reviewer, auth.uid(),
      'deadline_change_requested', 'action_plan', v_req.entity_id,
      'Permintaan Perubahan Deadline (Revisi)',
      'Permintaan perubahan deadline direvisi dan menunggu review.');
  end if;

  -- ISSUE-005: notif "Perlu Revisi" milik pengaju sudah ditindaklanjuti.
  perform public.resolve_notifications('action_plan', v_req.entity_id,
    array['deadline_change_revision_requested'], 'resubmitted');
end;
$$;
revoke execute on function public.resubmit_deadline_change_request(uuid, date, text) from public, anon;

-- --------------------------------------------------- 5. review_action_plan_submission:
-- versi 0008 + resolve notif review_request milik reviewer.
create or replace function public.review_action_plan_submission(
  p_submission_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.action_plan_submissions;
  a public.action_plans;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.action_plan_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  select * into a from public.action_plans where id = s.action_plan_id;

  if a.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if a.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail)
      values (a.organization_id, auth.uid(), 'reviewer_override', 'action_plan', a.id,
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

  update public.action_plan_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (action_plan_id, submission_id, reviewer_id, decision, reason)
  values (a.id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.action_plans
  set status = case when p_decision = 'approve' then 'done' else 'revision' end
  where id = a.id;

  perform public.write_activity('action_plan', a.id,
    case when p_decision = 'approve' then 'review_approve' else 'review_reject' end,
    jsonb_build_object('submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  perform public.emit_notification(a.organization_id, a.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'action_plan', a.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end,
    a.name);

  -- ISSUE-005: notif review_request reviewer tidak lagi actionable.
  perform public.resolve_notifications('action_plan', a.id,
    array['review_request'],
    case when p_decision = 'approve' then 'approved' else 'rejected' end);
end;
$$;
revoke execute on function public.review_action_plan_submission(uuid, text, text) from public, anon;

-- --------------------------------------------------- 6. review_action_plan_instance_submission:
-- versi 0008 + resolve notif review_request milik reviewer instance.
create or replace function public.review_action_plan_instance_submission(
  p_submission_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.action_plan_submissions;
  ins public.action_plan_instances;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.action_plan_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  if s.action_plan_instance_id is null then
    raise exception 'Submission ini bukan submission instance.';
  end if;
  select * into ins from public.action_plan_instances where id = s.action_plan_instance_id;

  if ins.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if ins.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
      values (ins.organization_id, auth.uid(), 'reviewer_override', 'action_plan_instance', ins.id,
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

  update public.action_plan_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (action_plan_id, submission_id, reviewer_id, decision, reason)
  values (ins.action_plan_id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.action_plan_instances
  set status = case when p_decision = 'approve' then 'done' else 'revision' end,
      reviewed_at = now()
  where id = ins.id;

  perform public.write_activity('action_plan', ins.action_plan_id,
    case when p_decision = 'approve' then 'review_instance_approve' else 'review_instance_reject' end,
    jsonb_build_object('instance_id', ins.id, 'submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  perform public.emit_notification(ins.organization_id, ins.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'action_plan_instance', ins.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end, null);

  -- ISSUE-005: notif review_request reviewer instance tidak lagi actionable.
  perform public.resolve_notifications('action_plan_instance', ins.id,
    array['review_request'],
    case when p_decision = 'approve' then 'approved' else 'rejected' end);
end;
$$;
revoke execute on function public.review_action_plan_instance_submission(uuid, text, text) from public, anon;

-- --------------------------------------------------- 7. Backfill helper
-- Idempoten: hanya menyentuh baris `resolved_at is null`. Ekspos sebagai fungsi (bukan skrip inline)
-- supaya contract test bisa memanggil ulang setelah seed state simulasi.
create or replace function public.backfill_resolve_stale_notifications()
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- deadline_change_requested untuk DCR yang sudah non-pending.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, coalesce(d.responded_at, now())),
        resolution  = coalesce(n.resolution, d.status)
    from public.deadline_change_requests d
   where n.type = 'deadline_change_requested'
     and n.entity_type = 'action_plan'
     and n.entity_id   = d.entity_id
     and d.status <> 'pending'
     and n.resolved_at is null;

  -- deadline_change_revision_requested: hilang saat DCR keluar dari revision_requested.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, now()),
        resolution  = coalesce(n.resolution, 'superseded')
    from public.deadline_change_requests d
   where n.type = 'deadline_change_revision_requested'
     and n.entity_type = 'action_plan'
     and n.entity_id   = d.entity_id
     and d.status <> 'revision_requested'
     and n.resolved_at is null;

  -- review_request AP-level untuk submission yang sudah non-pending.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, coalesce(s.reviewed_at, now())),
        resolution  = coalesce(n.resolution, s.review_status)
    from public.action_plan_submissions s
   where n.type = 'review_request'
     and n.entity_type = 'action_plan'
     and n.entity_id   = s.action_plan_id
     and s.action_plan_instance_id is null
     and s.review_status in ('approved','rejected')
     and n.resolved_at is null;

  -- review_request instance-level untuk submission instance yang sudah non-pending.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, coalesce(s.reviewed_at, now())),
        resolution  = coalesce(n.resolution, s.review_status)
    from public.action_plan_submissions s
   where n.type = 'review_request'
     and n.entity_type = 'action_plan_instance'
     and n.entity_id   = s.action_plan_instance_id
     and s.review_status in ('approved','rejected')
     and n.resolved_at is null;
end;
$$;
revoke execute on function public.backfill_resolve_stale_notifications() from public, anon, authenticated;

-- Jalankan sekali saat migration diterapkan. Idempoten — aman re-run.
select public.backfill_resolve_stale_notifications();
