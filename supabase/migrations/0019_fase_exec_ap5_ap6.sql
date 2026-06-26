-- 0019 UI-S-AP5 (file upload) + UI-S-AP6 (KPI Area linkage + delta) — paired feature.
-- Spec: specs/action-plan-submit-upload.md + §10 owner addendum.
-- TDD plan: specs/action-plan-submit-upload-tdd-plan.md + §7 critic addendum.
--
-- Pola arsitektur (lihat wiki/concepts/architecture.md): thick-DB / thin-client.
-- Otorisasi server-side via SECURITY DEFINER + Storage RLS path-scoped.
--
-- Catatan implementasi pasca-eksekusi (vs draft spec):
--   - kpi_area_id NULLABLE di DB (per ER-1/A2: legacy submissions tetap NULL, RPC enforce NOT NULL untuk row baru).
--   - cleanup_orphan_upload SET storage.allow_delete_query='true' untuk bypass storage.protect_delete trigger.
--   - log_governance_violation severity ∈ {low|medium|high|critical} (bukan 'warning' — check constraint
--     governance_violations_severity_check di migrasi 0014).
--   - log_governance_violation di reject path TIDAK survive rollback transaksi (preseden Fase 7 V1
--     limitation — butuh autonomous tx / Edge Function untuk persist). Hanya untuk SUCCESS path.
--   - DROP policy 'evidence_objects_insert'/'evidence_objects_select' lama (terlalu permisif, OR semua policy
--     → policy ketat baru jadi tak efektif).
--   - Storage policy WHERE clause memakai 'objects.name' table-qualified untuk hindari ambiguous reference
--     ke 'ap.name' (action_plans.name).

-- ============================================================ (1) Schema extensions

alter table public.action_plan_result_values
  add column if not exists kpi_area_id uuid references public.kpi_areas(id) on delete restrict,
  add column if not exists value_numeric numeric,
  add column if not exists previous_value_text text;

create index if not exists idx_arv_kpi_area
  on public.action_plan_result_values(kpi_area_id) where kpi_area_id is not null;

alter table public.action_plan_submissions
  add column if not exists status text not null default 'submitted'
    check (status in ('draft', 'submitted'));

create index if not exists idx_aps_draft
  on public.action_plan_submissions(id) where status = 'draft';

update public.action_plan_result_values
  set value_numeric = nullif(value_text, '')::numeric
  where value_type in ('number', 'currency', 'percentage')
    and value_text ~ '^-?[0-9]+(\.[0-9]+)?$'
    and value_numeric is null;

-- ============================================================ (2) VIEW kpi_area_current_values

create or replace view public.kpi_area_current_values
  with (security_invoker = true) as
  select rv.kpi_area_id,
    coalesce(sum(case when rv.value_type in ('number', 'currency', 'percentage') then rv.value_numeric else 0 end), 0) as numeric_total,
    count(*) filter (where rv.value_type = 'text') as text_count,
    max(s.reviewed_at) as last_approved_at
  from public.action_plan_result_values rv
  join public.action_plan_submissions s on s.id = rv.submission_id
  where s.review_status = 'approved'
    and rv.kpi_area_id is not null
  group by rv.kpi_area_id;

grant select on public.kpi_area_current_values to authenticated;
revoke select on public.kpi_area_current_values from public, anon;

-- ============================================================ (3) Helper log_governance_violation

create or replace function public.log_governance_violation(
  p_user_id uuid,
  p_violation_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_severity text default 'medium',
  p_detail jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.profiles where id = p_user_id;
  insert into public.governance_violations
    (organization_id, user_id, violation_type, entity_type, entity_id, severity, detail, created_at)
  values (v_org, p_user_id, p_violation_type, p_entity_type, p_entity_id, p_severity, p_detail, now());
end;
$$;

revoke execute on function public.log_governance_violation(uuid, text, text, uuid, text, jsonb)
  from public, anon, authenticated;

-- ============================================================ (4) RPC list_kpi_area_candidates_for_action_plan

create or replace function public.list_kpi_area_candidates_for_action_plan(p_action_plan_id uuid)
returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select distinct k.id, k.name
  from public.action_plans ap
  join public.initiatives i on i.id = ap.initiative_id
  join public.strategies s on s.id = i.strategy_id
  join public.kpi_areas k on k.id = s.kpi_area_id
  where ap.id = p_action_plan_id
    and (ap.pic_id = auth.uid() or ap.reviewer_id = auth.uid())
  order by k.name;
$$;

revoke execute on function public.list_kpi_area_candidates_for_action_plan(uuid) from public, anon;
grant execute on function public.list_kpi_area_candidates_for_action_plan(uuid) to authenticated;

-- ============================================================ (5) RPC create_submission_draft

create or replace function public.create_submission_draft(
  p_action_plan_id uuid, p_attachment_count int
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
  v_version int;
  v_draft_id uuid;
begin
  if p_attachment_count < 0 or p_attachment_count > 5 then
    raise exception 'Jumlah lampiran 0..5 (OD-2 cap).';
  end if;
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if a.pic_id is null or a.pic_id <> auth.uid() then
    perform public.log_governance_violation(auth.uid(), 'submit_non_pic', 'action_plan', p_action_plan_id,
      'medium', jsonb_build_object('attempted_by', auth.uid(), 'expected_pic', a.pic_id));
    raise exception 'Hanya PIC yang dapat membuat draft submission.';
  end if;
  if a.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Action Plan tidak dalam status yang bisa disubmit.';
  end if;
  if exists (
    select 1 from public.action_plan_submissions
      where action_plan_id = p_action_plan_id
        and status = 'submitted'
        and review_status = 'pending'
  ) then
    raise exception 'Sesi review masih berjalan. Tunggu Reviewer memutuskan terlebih dahulu.';
  end if;
  select coalesce(max(version_number), 0) + 1 into v_version
    from public.action_plan_submissions where action_plan_id = p_action_plan_id;
  insert into public.action_plan_submissions
    (action_plan_id, version_number, submitted_by, status, review_status)
  values (p_action_plan_id, v_version, auth.uid(), 'draft', 'pending')
  returning id into v_draft_id;
  return v_draft_id;
end;
$$;

revoke execute on function public.create_submission_draft(uuid, int) from public, anon;
grant execute on function public.create_submission_draft(uuid, int) to authenticated;

-- ============================================================ (6) RPC submit_action_plan REPLACE (finalize)

drop function if exists public.submit_action_plan(uuid, text, jsonb, jsonb);
create or replace function public.submit_action_plan(
  p_submission_draft_id uuid,
  p_note text,
  p_evidence jsonb,
  p_result_values jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.action_plan_submissions;
  a public.action_plans;
  v_item jsonb;
  v_kpi_area_id uuid;
  v_candidates_count int;
  v_prev numeric;
begin
  select * into s from public.action_plan_submissions where id = p_submission_draft_id;
  if not found then raise exception 'Draft submission tidak ditemukan.'; end if;
  if s.status <> 'draft' then raise exception 'Draft sudah di-finalize / status invalid.'; end if;
  if s.submitted_by <> auth.uid() then
    perform public.log_governance_violation(auth.uid(), 'finalize_non_submitter', 'action_plan_submission',
      p_submission_draft_id, 'medium', jsonb_build_object('expected', s.submitted_by));
    raise exception 'Hanya pembuat draft yang dapat finalize.';
  end if;
  select * into a from public.action_plans where id = s.action_plan_id;
  if a.reviewer_id is not null and a.reviewer_id = a.pic_id then
    perform public.log_governance_violation(auth.uid(), 'self_approval_attempt', 'action_plan',
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
    from public.list_kpi_area_candidates_for_action_plan(s.action_plan_id);
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
      v_kpi_area_id := nullif(v_item ->> 'kpi_area_id', '')::uuid;
      if v_kpi_area_id is null and v_candidates_count > 0 then
        raise exception 'Nilai Hasil wajib terhubung ke KPI Area.';
      end if;
      if v_kpi_area_id is not null and not exists (
        select 1 from public.list_kpi_area_candidates_for_action_plan(s.action_plan_id) c
        where c.id = v_kpi_area_id
      ) then
        perform public.log_governance_violation(auth.uid(), 'kpi_area_mismatch', 'action_plan',
          s.action_plan_id, 'critical', jsonb_build_object('attempted', v_kpi_area_id));
        raise exception 'KPI Area tidak valid untuk Action Plan ini.';
      end if;
      v_prev := null;
      if v_kpi_area_id is not null then
        select numeric_total into v_prev from public.kpi_area_current_values where kpi_area_id = v_kpi_area_id;
      end if;
      insert into public.action_plan_result_values
        (submission_id, kpi_area_id, label, value_type, value_text, value_numeric, previous_value_text)
      values (
        p_submission_draft_id, v_kpi_area_id, v_item ->> 'label',
        coalesce(v_item ->> 'value_type', 'text'),
        v_item ->> 'value_text',
        nullif(v_item ->> 'value_numeric', '')::numeric,
        coalesce(v_prev::text, null)
      );
    end loop;
  end if;
  update public.action_plan_submissions
    set status = 'submitted', submitted_at = now(), note = nullif(trim(p_note), '')
    where id = p_submission_draft_id;
  update public.action_plans
    set status = 'submitted', current_submission_id = p_submission_draft_id
    where id = s.action_plan_id;
  perform public.write_activity('action_plan', s.action_plan_id, 'submit',
    jsonb_build_object('submission_id', p_submission_draft_id, 'version', s.version_number,
      'evidence_count', coalesce(jsonb_array_length(p_evidence), 0),
      'result_count', coalesce(jsonb_array_length(p_result_values), 0)));
  return p_submission_draft_id;
end;
$$;

revoke execute on function public.submit_action_plan(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.submit_action_plan(uuid, text, jsonb, jsonb) to authenticated;

-- ============================================================ (7) RPC cleanup_orphan_upload

create or replace function public.cleanup_orphan_upload(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  parts text[];
  v_ap_id uuid;
  v_draft_id uuid;
  v_pic uuid;
  v_status text;
begin
  parts := string_to_array(p_path, '/');
  if array_length(parts, 1) < 4 then raise exception 'Path tidak valid.'; end if;
  begin
    v_ap_id := parts[2]::uuid;
    v_draft_id := parts[3]::uuid;
  exception when others then raise exception 'Path tidak valid (UUID parse error).';
  end;
  select pic_id into v_pic from public.action_plans where id = v_ap_id;
  if v_pic is null or v_pic <> auth.uid() then
    perform public.log_governance_violation(auth.uid(), 'orphan_cleanup_unauthorized', 'action_plan',
      v_ap_id, 'medium', jsonb_build_object('path', p_path));
    raise exception 'Tidak berwenang membersihkan upload pada Action Plan ini.';
  end if;
  select status into v_status from public.action_plan_submissions where id = v_draft_id;
  if v_status is null or v_status <> 'draft' then
    raise exception 'Submission sudah final / tidak ditemukan — cleanup ditolak (evidence locking).';
  end if;
  -- Bypass storage.protect_delete trigger (cek GUC storage.allow_delete_query).
  -- Aman: SECURITY DEFINER + sudah re-validate ownership + status di atas.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'evidence' and name = p_path;
end;
$$;

revoke execute on function public.cleanup_orphan_upload(text) from public, anon;
grant execute on function public.cleanup_orphan_upload(text) to authenticated;

-- ============================================================ (8) Storage RLS policies pada bucket 'evidence'

-- DROP policies lama yang terlalu permisif (sisa Fase 1 — bucket_id='evidence' tanpa path gate).
drop policy if exists "evidence_objects_insert" on storage.objects;
drop policy if exists "evidence_objects_select" on storage.objects;

-- INSERT: hanya PIC Action Plan untuk path miliknya. objects.name table-qualified (anti ambiguous ref).
drop policy if exists "evidence_insert_pic_only" on storage.objects;
create policy "evidence_insert_pic_only" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and array_length(storage.foldername(objects.name), 1) >= 3
    and exists (
      select 1 from public.action_plans ap
      where ap.id = (storage.foldername(objects.name))[2]::uuid
        and ap.pic_id = auth.uid()
    )
  );

-- SELECT: PIC, Reviewer, workspace viewer, atau member chat room (via can_access_action_plan).
drop policy if exists "evidence_select_authorized" on storage.objects;
create policy "evidence_select_authorized" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and (
      (array_length(storage.foldername(objects.name), 1) >= 2
        and exists (
          select 1 from public.action_plans ap
          where ap.id = (storage.foldername(objects.name))[2]::uuid
            and public.can_access_action_plan(ap.id)
        ))
      or
      (array_length(storage.foldername(objects.name), 1) < 2 and public.can_view_workspace())
    )
  );

-- DELETE: PIC pada submission status='draft' SAJA (post-finalize REVOKE = evidence locking PRD §35).
drop policy if exists "evidence_delete_draft_only" on storage.objects;
create policy "evidence_delete_draft_only" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidence'
    and array_length(storage.foldername(objects.name), 1) >= 3
    and exists (
      select 1 from public.action_plans ap
      where ap.id = (storage.foldername(objects.name))[2]::uuid
        and ap.pic_id = auth.uid()
    )
    and exists (
      select 1 from public.action_plan_submissions s
      where s.id = (storage.foldername(objects.name))[3]::uuid
        and s.status = 'draft'
    )
  );

-- TIDAK ada UPDATE policy → object tidak bisa di-overwrite (evidence locking PRD §35).
