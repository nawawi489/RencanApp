-- ============================================================================
-- 0038 — WS-4 / DCR-05 "Minta Revisi" pada Deadline Change Request (PRD §25)
-- Menambah aksi reviewer ke-3 (revision_requested) + resubmit pengaju + bugfix
-- hardcode 'Ditolak' + guard AP terminal (OQ-8) + resubmit re-fetch (OQ-9).
--
-- Owner-locked D1-D5 dan resolusi OQ-8/OQ-9 (docs/spec-ws04-...md §8.1).
-- URUTAN INTRA-FILE (WAJIB): ALTER DDL semua dulu → REPLACE/CREATE RPC.
-- Bila terbalik → 23514 saat RPC menulis enum baru yang belum diterima CHECK.
-- ============================================================================

-- --------------------------------------------------- 1. status CHECK + revision
alter table public.deadline_change_requests
  drop constraint if exists deadline_change_requests_status_check,
  add constraint deadline_change_requests_status_check
    check (status in ('pending','revision_requested','approved','rejected'));

-- --------------------------------------------------- 2. action CHECK + revision/resubmit
alter table public.deadline_change_logs
  drop constraint if exists deadline_change_logs_action_check,
  add constraint deadline_change_logs_action_check
    check (action in ('submitted','approved','rejected','cancelled','revision_requested','resubmitted'));

-- --------------------------------------------------- 3. ADD COLUMN revision_reason
-- Kolom baru — BUKAN reuse `rejection_reason` (bermakna "ditolak permanen").
-- Digunakan `listDeadlineChangeRequests` (select *) untuk render inline ke pengaju.
alter table public.deadline_change_requests
  add column if not exists revision_reason text;

-- --------------------------------------------------- 4. Perluas partial unique index (D3)
-- Predicate `where` tidak bisa di-ALTER in-place → DROP + RECREATE.
drop index if exists public.dcr_one_pending_per_entity;
create unique index dcr_one_pending_per_entity
  on public.deadline_change_requests (entity_type, entity_id)
  where status in ('pending','revision_requested');

-- --------------------------------------------------- 5. notifications_type_check superset
-- Array asli 0014 (12 tipe) + `deadline_change_revision_requested`.
alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
    'review_request','approved','rejected','deadline_reminder','repeat_due','instance_missed',
    'comment','mention','governance_warning',
    'deadline_change_requested','deadline_change_approved','deadline_change_rejected',
    'deadline_change_revision_requested'
  ]));

-- --------------------------------------------------- 6. REPLACE review_deadline_change
-- Branch tambah: revision_requested. Guard OQ-8: tolak approve/revision saat AP terminal.
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
  -- Advisory lock untuk cegah double-review.
  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan.'; end if;
  if v_req.status <> 'pending' then
    raise exception 'Permintaan ini sudah diproses atau menunggu revisi pengaju.';
  end if;
  if not public.has_permission('review_deadline_changes') then
    raise exception 'Anda tidak berwenang me-review perubahan deadline.';
  end if;
  if v_req.requestor_id = auth.uid() then
    -- Anti-self: berlaku untuk SEMUA decision termasuk revision_requested (FR-19).
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

  -- OQ-8 guard: tolak approve/revision_requested bila AP terminal.
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
  elsif p_decision = 'revision_requested' then
    -- approver_id di-SET (bukan null): jejak akuntabilitas + RLS dcr_select visibility.
    -- Di-clear saat resubmit agar constraint dcr_requestor_ne_approver aman.
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
    -- action_plans.deadline TIDAK diubah.
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
  end if;
end;
$$;
revoke execute on function public.review_deadline_change(uuid, text, text) from public, anon;

-- --------------------------------------------------- 7. CREATE resubmit_deadline_change_request
-- Requestor-only. Validasi server terhadap `action_plans.deadline` aktual (OQ-9 re-fetch)
-- + `org_today` + reason non-kosong. UPDATE baris SAMA, bukan buat baru (D2).
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

  -- OQ-9 re-fetch: banding terhadap action_plans.deadline aktual, bukan v_req.old_deadline
  -- (yang tetap disimpan sebagai snapshot audit historis).
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

  -- Log payload bermakna (FR-18): satu-satunya jejak nilai antar-putaran karena UPDATE menimpa.
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
end;
$$;
revoke execute on function public.resubmit_deadline_change_request(uuid, date, text) from public, anon;
