-- 0084_bl07_notifications_missing_types.sql
-- BL-07 — melengkapi jenis Notifications PRD §28 (9 tipe; 5 sudah jalan sebelum migrasi ini).
-- Scoping + bukti: wiki/concepts/feature-gap-backlog.md §6. Keputusan owner 2026-07-22:
--
--   D-BL07-1  "Bukti dikirim" HANYA di jalur review_required = false, penerima = pembuat card.
--             Alasan: 'review_request' sudah dikirim ke reviewer saat submit (0072:116) — itu
--             peristiwa yang sama. Tipe kedua di titik itu = reviewer ternotifikasi dua kali.
--             Lubang yang nyata justru di sebelahnya: saat review tidak diperlukan, submission
--             langsung 'done' dan NOL notifikasi terkirim ke siapa pun.
--   D-BL07-2  "Deadline lewat" one-time = NOTIFIKASI SAJA. tasks.status tidak disentuh; ia tidak
--             punya nilai missed/overdue (berbeda dari task_instances) dan menambahkannya
--             menjalar ke CHECK constraint, sapuan cron, dan skoring. §28 menyebut "Deadline
--             lewat" sebagai JENIS NOTIFIKASI, bukan status kartu.
--   D-BL07-3  "Aturan Pecah Target warning" (§28 item 7) DITUTUP sebagai koreksi PRD, bukan
--             dibangun: ia kondisi sinkron yang sudah digerbangi check_minimum_breakdown_
--             compliance di tombol turunan. Tidak ada tipe baru untuknya di migrasi ini.
--
-- Tiga tipe baru: evidence_submitted, deadline_overdue, permission_changed.
--
-- Badan keempat fungsi di bawah DIREPRODUKSI APA ADANYA dari versi hidupnya (pola 0072), lalu
-- disisipi delta-nya — dibangun lewat skrip ber-assert, bukan salin-tempel manual:
--   submit_task              ← 0072:17-122
--   submit_task_instance     ← 0046:2409-2499
--   emit_deadline_notifications ← 0046:1105-1154
--   set_user_permission      ← 0076:36-97
--
-- create or replace di SEMUA fungsi (bukan drop+create): drop ... cascade akan mereset ACL ke
-- PUBLIC EXECUTE, membatalkan REVOKE 0066/0076/0080. REVOKE tetap ditegaskan ulang di akhir
-- sebagai backstop.
--
-- CATATAN push: ketiga tipe baru sengaja TIDAK ditambahkan ke allowlist is_push_worthy (0081).
-- 0081 sendiri belum diterapkan ke staging (CHECK hidup di sana masih 13 tipe dan
-- emit_period_closing_reminders tidak ada di pg_proc), jadi menyentuh fungsi itu di sini akan
-- menggabungkan dua masalah. Ketiga tipe tampil in-app; push menyusul setelah 0081 mendarat.

-- --------------------------------------------------- 1. notifications_type_check superset (17)
-- Superset dari 0038 (13) + period_closing_reminder (0081) + 3 tipe BL-07. period_closing_reminder
-- disertakan supaya migrasi ini tidak meregresi 0081 pada database yang SUDAH menerapkannya.
alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
    'review_request','approved','rejected','deadline_reminder','repeat_due','instance_missed',
    'comment','mention','governance_warning',
    'deadline_change_requested','deadline_change_approved','deadline_change_rejected',
    'deadline_change_revision_requested',
    'period_closing_reminder',
    'evidence_submitted','deadline_overdue','permission_changed'
  ]));

-- --------------------------------------------------- 2. submit_task (+ evidence_submitted)
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
  elsif not a.review_required then
    -- BL-07 / D-BL07-1. Jalur review_required = false sebelumnya NOL notifikasi: submission
    -- langsung 'done' (0007:429-438) dan tak seorang pun tahu bukti masuk. Penerima = pembuat
    -- card. emit_notification sudah no-op bila penerima null (creator terhapus → on delete set
    -- null) atau penerima = actor (PIC membuat card-nya sendiri), jadi tak perlu guard tambahan.
    -- Cabang ini TIDAK menyala saat review_required = true — reviewer tidak pernah dinotifikasi
    -- dua kali untuk satu submit.
    perform public.emit_notification(a.organization_id, a.created_by, a.pic_id, 'evidence_submitted',
      'task', a.id, 'Bukti dikirim', a.name);
  end if;

  return p_submission_draft_id;
end;
$function$;

-- --------------------------------------------------- 3. submit_task_instance (+ evidence_submitted)
CREATE OR REPLACE FUNCTION public.submit_task_instance(p_instance_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if ins.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat submit instance ini.'; end if;
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

  -- Fase 3: minta review ke reviewer instance bila perlu review.
  if a.review_required then
    perform public.emit_notification(ins.organization_id, ins.reviewer_id, ins.pic_id, 'review_request',
      'task_instance', p_instance_id, 'Permintaan review', a.name);
  else
    -- BL-07 / D-BL07-1 — paritas dengan submit_task. Alasan paritas ini persis alasan 0072 ada:
    -- kedua jalur submit pernah menyimpang dan reviewer one-time berhenti dinotifikasi.
    perform public.emit_notification(ins.organization_id, a.created_by, ins.pic_id, 'evidence_submitted',
      'task_instance', p_instance_id, 'Bukti dikirim', a.name);
  end if;

  return v_submission_id;
end;
$function$;

-- --------------------------------------------------- 4. emit_deadline_notifications (+ deadline_overdue)
CREATE OR REPLACE FUNCTION public.emit_deadline_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_count int := 0;
begin
  -- Action Plan one-time: deadline dalam (org_today, org_today+3].
  for r in
    select a.id, a.organization_id, a.pic_id, a.name, a.deadline,
           public.org_today(a.organization_id) as today
    from public.tasks a
    where a.repeat_setting <> 'repeat'
      and a.status in ('assigned', 'in_progress', 'revision')
      and a.pic_id is not null
      and a.deadline is not null
  loop
    if r.deadline > r.today and r.deadline <= r.today + 3 then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'deadline_reminder',
        'task', r.id, 'Deadline mendekat', r.name, r.today);
      v_count := v_count + 1;
    elsif r.deadline < r.today then
      -- BL-07 / D-BL07-2: "lewat" adalah FAKTA TURUNAN (deadline < org_today), bukan status
      -- kartu. tasks.status sengaja TIDAK disentuh — ia tak punya nilai missed/overdue (beda
      -- dari task_instances) dan menambahkannya akan menjalar ke CHECK + skoring.
      -- dedupe_date = r.today → maksimum satu notifikasi terlewat per tugas per hari.
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'deadline_overdue',
        'task', r.id, 'Deadline terlewat', r.name, r.today);
      v_count := v_count + 1;
    end if;
  end loop;

  -- Instance: due today → repeat_due; mendekat (<=3 hari) → deadline_reminder.
  for r in
    select i.id, i.organization_id, i.pic_id, i.deadline_at,
           public.org_today(i.organization_id) as today,
           (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date as due_date
    from public.task_instances i
    join public.organizations o on o.id = i.organization_id
    where i.status in ('assigned', 'in_progress') and i.pic_id is not null
  loop
    if r.due_date = r.today then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'repeat_due',
        'task_instance', r.id, 'Tugas rutin hari ini', null, r.today);
      v_count := v_count + 1;
    elsif r.due_date > r.today and r.due_date <= r.today + 3 then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'deadline_reminder',
        'task_instance', r.id, 'Deadline mendekat', null, r.today);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- --------------------------------------------------- 5. set_user_permission (+ permission_changed)
create or replace function public.set_user_permission(
  p_target_user_id uuid, p_permission_key text, p_granted boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_perm_id uuid; v_target_level text; v_prev boolean; v_reason text;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengubah hak akses pengguna.';
  end if;
  -- SELF diblok simetris (grant & revoke) — anti-lockout & anti-eskalasi (restored: 0017 → dropped in 0041).
  if p_target_user_id = auth.uid() then
    raise exception 'Anda tidak dapat mengubah hak akses Anda sendiri.';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then raise exception 'Alasan perubahan wajib diisi.'; end if;
  v_org := public.current_user_org();
  select id into v_perm_id from public.permissions where key = p_permission_key;
  if v_perm_id is null then raise exception 'Kunci hak akses tidak valid: %', p_permission_key; end if;
  select rt.level into v_target_level
  from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
  where p.id = p_target_user_id and p.organization_id = v_org and p.is_active;
  if v_target_level is null then raise exception 'Pengguna tidak ditemukan atau tidak aktif.'; end if;
  if v_target_level = 'ceo' then raise exception 'Hak akses CEO tidak dapat diubah.'; end if;
  if p_permission_key = 'manage_users_permissions' and p_granted
     and coalesce(public.user_role_level() = 'ceo', false) = false then
    raise exception 'Hanya CEO yang dapat memberikan hak Kelola User & Permission.';
  end if;

  select granted into v_prev from public.user_permissions
    where user_id = p_target_user_id and permission_id = v_perm_id;

  if p_granted then
    insert into public.user_permissions (user_id, permission_id, granted)
    values (p_target_user_id, v_perm_id, true)
    on conflict (user_id, permission_id) do update set granted = true;
    perform public.write_activity('user_permission', p_target_user_id, 'user_permission_granted',
      jsonb_build_object('target_user_id', p_target_user_id, 'permission_key', p_permission_key,
        'granted', true, 'previous_granted', coalesce(v_prev, false), 'reason', v_reason));
  else
    if v_target_level in ('c_level','management') and p_permission_key in
       ('create_initiative','create_action_plan','create_strategy',
        'manage_teams','review_deadline_changes')
    then raise exception 'Hak akses ini melekat pada role; ubah role untuk mencabutnya.'; end if;
    if p_permission_key = 'manage_users_permissions'
       and not exists (
         select 1 from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
         where p.organization_id = v_org and p.is_active and rt.level = 'ceo')
       and not exists (
         select 1 from public.user_permissions up
         join public.permissions pr on pr.id = up.permission_id
         join public.profiles p on p.id = up.user_id
         where pr.key = 'manage_users_permissions' and up.granted
           and p.organization_id = v_org and p.is_active and up.user_id <> p_target_user_id)
    then raise exception 'Tidak dapat mencabut pemegang Kelola User & Permission terakhir.'; end if;
    delete from public.user_permissions where user_id = p_target_user_id and permission_id = v_perm_id;
    if not found then
      raise exception 'Hak akses ini tidak diberikan secara kustom; tidak ada yang dapat dicabut.';
    end if;
    perform public.write_activity('user_permission', p_target_user_id, 'user_permission_revoked',
      jsonb_build_object('target_user_id', p_target_user_id, 'permission_key', p_permission_key,
        'granted', false, 'previous_granted', coalesce(v_prev, false), 'reason', v_reason));
  end if;

  -- BL-07: PRD §28 item 6 "Permission berubah jika relevan untuk user tersebut" — relevansi
  -- terpenuhi secara alami karena penerimanya memang orang yang izinnya berubah. Ditaruh SETELAH
  -- seluruh cabang guard/raise supaya notifikasi hanya terkirim untuk perubahan yang benar-benar
  -- tersimpan; raise mana pun di atas membatalkan transaksi berikut notifikasinya.
  perform public.emit_notification(v_org, p_target_user_id, auth.uid(), 'permission_changed',
    'user_permission', p_target_user_id,
    case when p_granted then 'Hak akses ditambahkan' else 'Hak akses dicabut' end,
    p_permission_key);
end; $$;

-- --------------------------------------------------- 6. Penegasan ulang ACL
-- create or replace mempertahankan ACL, jadi ini backstop bukan perbaikan. Sengaja mencerminkan
-- REVOKE yang sudah berlaku: 0066 (cron internal), 0076 (set_user_permission), 0080 (submit RPC).
revoke execute on function public.emit_deadline_notifications() from public, anon, authenticated;
revoke execute on function public.set_user_permission(uuid, text, boolean, text) from public, anon;
revoke execute on function public.submit_task(uuid, text, jsonb, jsonb) from public, anon;
revoke execute on function public.submit_task_instance(uuid, text, jsonb, jsonb) from public, anon;
