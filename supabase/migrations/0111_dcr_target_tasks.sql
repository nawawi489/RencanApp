-- 0111 — Deadline Change Request (S3-4). Sprint 3.
--
-- Migrasi 0045 memindahkan `deadline` + `reviewer_id` dari `action_plans` ke
-- `tasks`, tapi trio DCR (create/review/resubmit) tetap SELECT/UPDATE ke
-- `action_plans` sehingga fitur ini mati total (kolom tidak ada → 42703 di
-- runtime). Perbaikan:
--
--   • Baca deadline / reviewer_id / status dari `tasks`, bukan `action_plans`.
--   • Insert DCR dengan `entity_type = 'task'`.
--   • Activity + notifikasi memakai `entity_type = 'task'` juga (kolom
--     `entity_type` di notifications/activity_logs adalah text bebas, tak ada
--     CHECK constraint yang menghalangi).
--   • Update `tasks.deadline` pada approve (dengan bypass config
--     `app.allow_deadline_update` yang sekarang di-guard trigger
--     `tg_guard_ap_deadline_direct_update` yang sudah pindah ke `tasks`).
--   • Cross-org guard eksplisit di ketiga fungsi (S2 patch untuk 13 fungsi lain
--     terlewatkan trio ini).
--   • Guard PIC/reviewer di `tasks` — reviewer wajib bukan requestor, PIC yang
--     mengajukan, reviewer yang me-review. Pola null-safe (`is null or`)
--     mengikuti S2-5.
--
-- Post-condition: plpgsql_check_function_tb harus 0 error untuk ketiga fungsi.

set search_path = public;

-- ---------------- create_deadline_change_request ------------------

create or replace function public.create_deadline_change_request(
  p_entity_id uuid,
  p_old_deadline date,
  p_new_deadline date,
  p_reason text,
  p_impact text,
  p_evidence_note text
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_task public.tasks;
  v_reviewer uuid;
begin
  select * into v_task from public.tasks where id = p_entity_id;
  if not found then
    raise exception 'Tugas tidak ditemukan.';
  end if;

  -- Cross-org guard eksplisit (S2 sweep terlewat).
  if v_task.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;

  -- Hanya PIC atau operator dgn permission override yang boleh mengajukan.
  if not (v_task.pic_id is not null and v_task.pic_id = auth.uid())
     and not public.has_permission('manage_others_cards') then
    raise exception 'Hanya PIC Tugas yang dapat mengajukan perubahan deadline.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan perubahan deadline wajib diisi.';
  end if;
  if p_new_deadline <= p_old_deadline then
    raise exception 'Tanggal baru tidak boleh lebih awal dari deadline saat ini.';
  end if;
  if p_new_deadline < public.org_today(v_task.organization_id) then
    raise exception 'Tanggal baru tidak boleh di masa lalu.';
  end if;

  v_reviewer := v_task.reviewer_id;

  insert into public.deadline_change_requests
    (organization_id, entity_type, entity_id, old_deadline, new_deadline,
     reason, impact_if_rejected, evidence_note, requestor_id)
  values (v_task.organization_id, 'task', p_entity_id, p_old_deadline, p_new_deadline,
          trim(p_reason), nullif(trim(coalesce(p_impact,'')),''),
          nullif(trim(coalesce(p_evidence_note,'')),''), auth.uid())
  returning id into v_id;

  insert into public.deadline_change_logs (organization_id, request_id, action, actor_id)
  values (v_task.organization_id, v_id, 'submitted', auth.uid());

  perform public.write_activity('task', p_entity_id, 'deadline_change_requested',
    jsonb_build_object('request_id', v_id, 'new_deadline', p_new_deadline));

  -- Reviewer bisa null (guard task belum lengkap) — notifikasi dilewati.
  if v_reviewer is not null then
    perform public.emit_notification(v_task.organization_id, v_reviewer, auth.uid(),
      'deadline_change_requested',
      'task', p_entity_id, 'Permintaan Perubahan Deadline',
      'Ada permintaan perubahan deadline yang menunggu review.');
  end if;

  return v_id;
end;
$$;

-- ---------------- review_deadline_change --------------------------

create or replace function public.review_deadline_change(
  p_request_id uuid,
  p_decision text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_req public.deadline_change_requests;
  v_task_status text;
  v_task_org uuid;
  v_task_reviewer uuid;
begin
  if p_decision not in ('approved','rejected','revision_requested') then
    raise exception 'Keputusan tidak valid.';
  end if;

  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'Permintaan tidak ditemukan.';
  end if;

  if v_req.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Permintaan ini sudah diproses atau menunggu revisi pengaju.';
  end if;

  if not public.has_permission('review_deadline_changes') then
    raise exception 'Anda tidak berwenang me-review perubahan deadline.';
  end if;

  if v_req.requestor_id is null or v_req.requestor_id = auth.uid() then
    -- Log pelanggaran self-approval saat requestor = actor (nulls tak trigger).
    if v_req.requestor_id = auth.uid() then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, severity, detail)
      values (v_req.organization_id, auth.uid(), 'deadline_change_self_approval',
              v_req.entity_type, v_req.entity_id, 'critical',
              jsonb_build_object('request_id', p_request_id, 'decision', p_decision));
      raise exception 'Anda tidak dapat me-review permintaan yang Anda ajukan sendiri.';
    end if;
  end if;

  if p_decision in ('rejected','revision_requested')
     and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi untuk menolak atau meminta revisi.';
  end if;

  if p_decision in ('approved','revision_requested') then
    select status, organization_id, reviewer_id
      into v_task_status, v_task_org, v_task_reviewer
      from public.tasks where id = v_req.entity_id;
    if v_task_status is null then
      raise exception 'Tugas terkait tidak ditemukan.';
    end if;
    if v_task_org is distinct from v_req.organization_id then
      raise exception 'Tugas berpindah organisasi; permintaan tidak dapat diproses.';
    end if;
    if v_task_status in ('archived','cancelled','done') then
      raise exception 'Tugas sudah berstatus terminal; permintaan tidak dapat diproses.';
    end if;
    -- Reviewer harus punya kaitan; kalau task punya reviewer yg berbeda dari actor,
    -- hanya reviewer resmi (atau override permission) yang boleh proses.
    if v_task_reviewer is not null and v_task_reviewer <> auth.uid()
       and not public.has_permission('manage_others_cards') then
      raise exception 'Hanya reviewer Tugas yang dapat memproses permintaan ini.';
    end if;
  end if;

  if p_decision = 'approved' then
    update public.deadline_change_requests
      set status = 'approved', approver_id = auth.uid(), responded_at = now()
      where id = p_request_id;
    perform set_config('app.allow_deadline_update', 'true', true);
    update public.tasks set deadline = v_req.new_deadline where id = v_req.entity_id;
    perform set_config('app.allow_deadline_update', 'false', true);
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'approved', auth.uid(),
            nullif(trim(coalesce(p_reason,'')),''));
    perform public.write_activity('task', v_req.entity_id, 'deadline_change_approved',
      jsonb_build_object('request_id', p_request_id, 'new_deadline', v_req.new_deadline));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_approved', 'task', v_req.entity_id,
      'Perubahan Deadline Disetujui', 'Permintaan perubahan deadline Anda disetujui.');
    perform public.resolve_notifications('task', v_req.entity_id,
      array['deadline_change_requested'], 'approved');

  elsif p_decision = 'revision_requested' then
    update public.deadline_change_requests
      set status = 'revision_requested', approver_id = auth.uid(),
          responded_at = now(), revision_reason = trim(p_reason)
      where id = p_request_id;
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'revision_requested', auth.uid(), trim(p_reason));
    perform public.write_activity('task', v_req.entity_id, 'deadline_change_revision_requested',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_revision_requested', 'task', v_req.entity_id,
      'Perubahan Deadline Perlu Revisi', 'Reviewer meminta revisi pada permintaan Anda.');
    perform public.resolve_notifications('task', v_req.entity_id,
      array['deadline_change_requested'], 'revision_requested');

  else
    update public.deadline_change_requests
      set status = 'rejected', approver_id = auth.uid(),
          responded_at = now(), rejection_reason = trim(p_reason)
      where id = p_request_id;
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'rejected', auth.uid(), trim(p_reason));
    perform public.write_activity('task', v_req.entity_id, 'deadline_change_rejected',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_rejected', 'task', v_req.entity_id,
      'Perubahan Deadline Ditolak', 'Permintaan perubahan deadline Anda ditolak.');
    perform public.resolve_notifications('task', v_req.entity_id,
      array['deadline_change_requested'], 'rejected');
  end if;
end;
$$;

-- ---------------- resubmit_deadline_change_request -----------------

create or replace function public.resubmit_deadline_change_request(
  p_request_id uuid,
  p_new_deadline date,
  p_reason text
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_req public.deadline_change_requests;
  v_reviewer uuid;
  v_task_status text;
  v_task_deadline date;
  v_task_org uuid;
begin
  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then
    raise exception 'Permintaan tidak ditemukan.';
  end if;

  if v_req.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if v_req.requestor_id is null or v_req.requestor_id <> auth.uid() then
    raise exception 'Hanya pengaju yang dapat mengirim ulang permintaan.';
  end if;
  if v_req.status <> 'revision_requested' then
    raise exception 'Permintaan ini tidak dalam status perlu revisi.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi.';
  end if;

  select status, deadline, organization_id, reviewer_id
    into v_task_status, v_task_deadline, v_task_org, v_reviewer
    from public.tasks where id = v_req.entity_id;
  if v_task_status is null then
    raise exception 'Tugas terkait tidak ditemukan.';
  end if;
  if v_task_org is distinct from v_req.organization_id then
    raise exception 'Tugas berpindah organisasi; revisi tidak dapat dikirim.';
  end if;
  if v_task_status in ('archived','cancelled','done') then
    raise exception 'Tugas sudah berstatus terminal; revisi tidak dapat dikirim.';
  end if;
  if v_task_deadline is not null and p_new_deadline <= v_task_deadline then
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

  perform public.write_activity('task', v_req.entity_id, 'deadline_change_resubmitted',
    jsonb_build_object('request_id', p_request_id, 'new_deadline', p_new_deadline, 'reason', trim(p_reason)));

  if v_reviewer is not null then
    perform public.emit_notification(v_req.organization_id, v_reviewer, auth.uid(),
      'deadline_change_requested', 'task', v_req.entity_id,
      'Permintaan Perubahan Deadline (Revisi)',
      'Permintaan perubahan deadline direvisi dan menunggu review.');
  end if;

  perform public.resolve_notifications('task', v_req.entity_id,
    array['deadline_change_revision_requested'], 'resubmitted');
end;
$$;

-- Grants konsisten dgn pola 0104/0110: only authenticated (via anon revoked in 0105).
revoke execute on function public.create_deadline_change_request(uuid, date, date, text, text, text) from public;
revoke execute on function public.review_deadline_change(uuid, text, text) from public;
revoke execute on function public.resubmit_deadline_change_request(uuid, date, text) from public;
grant execute on function public.create_deadline_change_request(uuid, date, date, text, text, text) to authenticated;
grant execute on function public.review_deadline_change(uuid, text, text) to authenticated;
grant execute on function public.resubmit_deadline_change_request(uuid, date, text) to authenticated;

comment on function public.create_deadline_change_request(uuid, date, date, text, text, text) is
  'S3-4: rewrite ke public.tasks (post-0045). Cross-org guard + PIC guard null-safe.';
comment on function public.review_deadline_change(uuid, text, text) is
  'S3-4: rewrite ke public.tasks + tg_guard_ap_deadline_direct_update bypass di UPDATE deadline.';
comment on function public.resubmit_deadline_change_request(uuid, date, text) is
  'S3-4: rewrite ke public.tasks. Requestor null-safe (S2-5 pattern).';
