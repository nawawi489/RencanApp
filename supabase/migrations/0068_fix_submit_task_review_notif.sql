-- 0068_fix_submit_task_review_notif.sql
-- Regresi 0046: submit_task (one-time) tak lagi memanggil emit_notification,
-- sedangkan submit_task_instance (rutin) tetap emit 'review_request' ke
-- reviewer_id. Konsekuensi: PIC submit tugas one-time → reviewer tidak
-- pernah menerima notifikasi in-app / push → SLA review kacau.
--
-- Fix: paritas dengan submit_task_instance — setelah transisi status ke
-- 'submitted', bila tugas memerlukan review DAN reviewer_id terisi, emit
-- notifikasi. Cek reviewer_id defensif meski submit_task_instance meng-
-- asumsikan ins.reviewer_id selalu ada; di sisi one-time `tasks.reviewer_id`
-- adalah nullable.
--
-- Body RPC di-repro persis dari 0046:2312-2405 (tidak ada perubahan lain);
-- satu-satunya delta adalah blok `perform emit_notification(...)` sebelum
-- `return`.

create or replace function public.submit_task(
  p_submission_draft_id uuid,
  p_note text,
  p_evidence jsonb,
  p_result_values jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s public.task_submissions;
  a public.tasks;
  v_item jsonb;
  v_strategy_id uuid;
  v_candidates_count int;
  v_prev numeric;
begin
  select * into s from public.task_submissions where id = p_submission_draft_id;
  if not found then raise exception 'Draft submission tidak ditemukan.'; end if;
  if s.status <> 'draft' then raise exception 'Draft sudah di-finalize / status invalid.'; end if;
  if s.submitted_by <> auth.uid() then
    perform public.log_governance_violation(auth.uid(), 'finalize_non_submitter', 'task_submission',
      p_submission_draft_id, 'medium', jsonb_build_object('expected', s.submitted_by));
    raise exception 'Hanya pembuat draft yang dapat finalize.';
  end if;
  select * into a from public.tasks where id = s.task_id;
  if a.reviewer_id is not null and a.reviewer_id = a.pic_id then
    perform public.log_governance_violation(auth.uid(), 'self_approval_attempt', 'task',
      a.id, 'critical', jsonb_build_object('pic', a.pic_id, 'reviewer', a.reviewer_id));
    raise exception 'Konfigurasi tidak valid: PIC dan Reviewer sama.';
  end if;
  if jsonb_typeof(p_evidence) = 'array' and jsonb_array_length(p_evidence) > 5 then
    raise exception 'Maksimum 5 file bukti per submission (OD-2).';
  end if;
  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  select count(*) into v_candidates_count
    from public.list_strategy_candidates_for_task(s.task_id);
  if a.result_value_required and v_candidates_count > 0
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (
        p_submission_draft_id, v_item ->> 'kind', v_item ->> 'storage_path',
        v_item ->> 'url', v_item ->> 'text_content', v_item ->> 'file_name',
        v_item ->> 'mime_type', auth.uid()
      );
    end loop;
  end if;
  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      v_strategy_id := nullif(v_item ->> 'strategy_id', '')::uuid;
      if v_strategy_id is null and v_candidates_count > 0 then
        raise exception 'Nilai Hasil wajib terhubung ke KPI Area.';
      end if;
      if v_strategy_id is not null and not exists (
        select 1 from public.list_strategy_candidates_for_task(s.task_id) c
        where c.id = v_strategy_id
      ) then
        perform public.log_governance_violation(auth.uid(), 'strategy_mismatch', 'task',
          s.task_id, 'critical', jsonb_build_object('attempted', v_strategy_id));
        raise exception 'KPI Area tidak valid untuk Action Plan ini.';
      end if;
      v_prev := null;
      if v_strategy_id is not null then
        select numeric_total into v_prev from public.strategy_current_values where strategy_id = v_strategy_id;
      end if;
      insert into public.task_result_values
        (submission_id, strategy_id, label, value_type, value_text, value_numeric, previous_value_text)
      values (
        p_submission_draft_id, v_strategy_id, v_item ->> 'label',
        coalesce(v_item ->> 'value_type', 'text'),
        v_item ->> 'value_text',
        nullif(v_item ->> 'value_numeric', '')::numeric,
        coalesce(v_prev::text, null)
      );
    end loop;
  end if;
  update public.task_submissions
    set status = 'submitted', submitted_at = now(), note = nullif(trim(p_note), '')
    where id = p_submission_draft_id;
  update public.tasks
    set status = 'submitted', current_submission_id = p_submission_draft_id
    where id = s.task_id;
  perform public.write_activity('task', s.task_id, 'submit',
    jsonb_build_object('submission_id', p_submission_draft_id, 'version', s.version_number,
      'evidence_count', coalesce(jsonb_array_length(p_evidence), 0),
      'result_count', coalesce(jsonb_array_length(p_result_values), 0)));

  -- Fix 0068: paritas dengan submit_task_instance — beri tahu reviewer.
  if a.review_required and a.reviewer_id is not null then
    perform public.emit_notification(a.organization_id, a.reviewer_id, a.pic_id, 'review_request',
      'task', a.id, 'Permintaan review', a.name);
  end if;

  return p_submission_draft_id;
end;
$function$;
