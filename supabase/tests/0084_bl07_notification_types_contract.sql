-- Kontrak BL-07 — tiga jenis Notifications PRD §28 yang hilang (migrasi 0084).
-- Jalankan: docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < supabase/tests/0084_bl07_notification_types_contract.sql
-- Pola: `begin; do $$..$$; rollback;` per blok. RAISE NOTICE 'PASS' / RAISE EXCEPTION 'FAIL: …'.
--
-- T-BL07-1: CHECK menerima ketiga tipe baru (perilaku, bukan pembacaan definisi).
-- T-BL07-2: CHECK tetap fail-closed — tipe karangan ditolak.
-- T-BL07-3: period_closing_reminder (0081) tidak ikut hilang saat CHECK ditulis ulang.
-- T-BL07-4: submit_task — evidence_submitted ADA, ber-gate `elsif not review_required`,
--           penerima created_by, DAN review_request lama tetap ada (regresi 0072).
-- T-BL07-5: submit_task_instance — paritas dengan T-BL07-4.
-- T-BL07-6: emit_deadline_notifications — deadline_overdue ber-gate `deadline < today`
--           + ber-dedupe, dan fungsi ini TIDAK menulis ke public.tasks (D-BL07-2 notify-only).
-- T-BL07-7: premis D-BL07-2 — tasks.status masih TANPA missed/overdue. Kalau suatu saat
--           status itu ditambahkan, blok ini gagal dan menyuruh meninjau ulang keputusannya
--           alih-alih membiarkan dua mekanisme "lewat" hidup berdampingan diam-diam.
-- T-BL07-8: set_user_permission — permission_changed terkirim, self-guard 0076 utuh, ACL bersih.

-- ============================================================ T-BL07-1: CHECK menerima 3 tipe baru
begin;
do $$
declare
  v_org   uuid;
  v_user  uuid;
  t       text;
  fails   text := '';
begin
  select id into v_org from public.organizations order by created_at limit 1;
  select id into v_user from public.profiles where organization_id = v_org limit 1;
  if v_org is null or v_user is null then
    raise exception 'T-BL07-1 PREMIS GAGAL: butuh minimal satu org + satu profil (fixtures)';
  end if;

  foreach t in array array['evidence_submitted','deadline_overdue','permission_changed'] loop
    begin
      insert into public.notifications
        (organization_id, recipient_id, actor_id, type, entity_type, entity_id, title, body)
      values (v_org, v_user, null, t, 'task', gen_random_uuid(), 'kontrak', null);
    exception when others then
      fails := fails || t || '_ditolak(' || sqlerrm || '); ';
    end;
  end loop;

  if fails <> '' then raise exception 'T-BL07-1 FAIL: %', fails; end if;
  raise notice 'T-BL07-1 PASS: ketiga tipe baru diterima CHECK';
end $$;
rollback;

-- ============================================================ T-BL07-2: CHECK tetap fail-closed
begin;
do $$
declare
  v_org   uuid;
  v_user  uuid;
  raised  boolean := false;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  select id into v_user from public.profiles where organization_id = v_org limit 1;

  begin
    insert into public.notifications
      (organization_id, recipient_id, actor_id, type, entity_type, entity_id, title, body)
    values (v_org, v_user, null, 'tipe_karangan_bl07', 'task', gen_random_uuid(), 'kontrak', null);
  exception when others then
    raised := true;
  end;

  if not raised then
    raise exception 'T-BL07-2 FAIL: CHECK menerima tipe yang tidak terdaftar — fail-closed hilang';
  end if;
  raise notice 'T-BL07-2 PASS: tipe tak terdaftar tetap ditolak';
end $$;
rollback;

-- ============================================================ T-BL07-3: 0081 tidak diregresi
begin;
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.notifications'::regclass and conname = 'notifications_type_check';

  if v_def is null then
    raise exception 'T-BL07-3 FAIL: notifications_type_check tidak ada';
  end if;
  -- Superset WAJIB memuat tipe 0081. Migrasi yang menulis ulang CHECK tanpa menyalin tipe lama
  -- akan mematikan fitur lain tanpa satu pun error — persis kelas bug yang dicari blok ini.
  if v_def !~ 'period_closing_reminder' then
    raise exception 'T-BL07-3 FAIL: period_closing_reminder (0081) hilang dari CHECK';
  end if;
  raise notice 'T-BL07-3 PASS: CHECK tetap superset (0081 utuh)';
end $$;
rollback;

-- ============================================================ T-BL07-4: submit_task
begin;
do $$
declare
  v_def text;
  fails text := '';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_task';

  if v_def is null then raise exception 'T-BL07-4 FAIL: submit_task tidak ada'; end if;

  if v_def !~ 'evidence_submitted' then
    fails := fails || 'tak_emit_evidence_submitted; ';
  end if;
  -- Gate-nya yang penting, bukan sekadar kehadiran string: cabang HANYA saat review tak
  -- diperlukan. Tanpa gate ini reviewer ternotifikasi dua kali per submit (D-BL07-1).
  if v_def !~ 'elsif not a\.review_required' then
    fails := fails || 'evidence_submitted_tak_ber_gate_review_required_false; ';
  end if;
  -- Urutan argumen emit_notification: (org, PENERIMA, ACTOR, tipe, …). Jadi penerima =
  -- created_by dan actor = pic_id; keduanya dikunci sekaligus supaya tak tertukar.
  if v_def !~ 'a\.created_by, a\.pic_id, ''evidence_submitted''' then
    fails := fails || 'penerima_bukan_created_by_atau_actor_bukan_pic; ';
  end if;
  -- Regresi 0072/0068: notifikasi reviewer lama tidak boleh ikut hilang.
  if v_def !~ '''review_request''' then
    fails := fails || 'review_request_hilang_regresi_0072; ';
  end if;

  if fails <> '' then raise exception 'T-BL07-4 FAIL: %', fails; end if;
  raise notice 'T-BL07-4 PASS: submit_task emit evidence_submitted ber-gate benar';
end $$;
rollback;

-- ============================================================ T-BL07-5: submit_task_instance
begin;
do $$
declare
  v_def text;
  fails text := '';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_task_instance';

  if v_def is null then raise exception 'T-BL07-5 FAIL: submit_task_instance tidak ada'; end if;

  if v_def !~ 'evidence_submitted' then
    fails := fails || 'tak_emit_evidence_submitted; ';
  end if;
  if v_def !~ 'a\.created_by, ins\.pic_id, ''evidence_submitted''' then
    fails := fails || 'penerima_bukan_created_by_atau_actor_bukan_pic; ';
  end if;
  if v_def !~ '''review_request''' then
    fails := fails || 'review_request_hilang; ';
  end if;

  if fails <> '' then raise exception 'T-BL07-5 FAIL: %', fails; end if;
  raise notice 'T-BL07-5 PASS: paritas instance dengan one-time terjaga';
end $$;
rollback;

-- ============================================================ T-BL07-6: cron overdue, notify-only
begin;
do $$
declare
  v_def text;
  fails text := '';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'emit_deadline_notifications';

  if v_def is null then raise exception 'T-BL07-6 FAIL: emit_deadline_notifications tidak ada'; end if;

  if v_def !~ 'deadline_overdue' then
    fails := fails || 'tak_emit_deadline_overdue; ';
  end if;
  if v_def !~ 'r\.deadline < r\.today' then
    fails := fails || 'overdue_tak_ber_gate_deadline_lewat; ';
  end if;
  -- Tanpa dedupe_date, cron harian akan mengirim ulang notifikasi yang sama tiap hari
  -- selama tugas belum ditutup.
  if v_def !~ '''deadline_overdue'',\s*\n?\s*''task'', r\.id, ''Deadline terlewat'', r\.name, r\.today' then
    fails := fails || 'overdue_tanpa_dedupe_date; ';
  end if;
  -- D-BL07-2 mengikat: notifikasi SAJA. Fungsi cron ini tidak boleh menyentuh status kartu.
  if v_def ~* 'update\s+public\.tasks' then
    fails := fails || 'cron_menulis_ke_tasks_melanggar_notify_only; ';
  end if;

  if fails <> '' then raise exception 'T-BL07-6 FAIL: %', fails; end if;
  raise notice 'T-BL07-6 PASS: deadline_overdue ber-gate + ber-dedupe, status tak disentuh';
end $$;
rollback;

-- ============================================================ T-BL07-7: premis D-BL07-2
begin;
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.tasks'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';

  if v_def is null then raise exception 'T-BL07-7 PREMIS GAGAL: CHECK status tasks tidak ditemukan'; end if;

  -- Keputusan D-BL07-2 ("lewat" = fakta turunan, bukan status) hanya benar selama tasks
  -- memang tak punya status terlewat. Kalau nanti ditambahkan, dua mekanisme akan hidup
  -- berdampingan; blok ini memaksa keputusannya ditinjau ulang alih-alih lolos diam.
  if v_def ~ '''missed''' or v_def ~ '''overdue''' then
    raise exception 'T-BL07-7 FAIL: tasks.status kini punya missed/overdue — tinjau ulang D-BL07-2 (wiki §6.3)';
  end if;
  raise notice 'T-BL07-7 PASS: tasks.status tetap tanpa missed/overdue';
end $$;
rollback;

-- ============================================================ T-BL07-8: set_user_permission
begin;
do $$
declare
  v_def  text;
  v_acl  text;
  fails  text := '';
begin
  select pg_get_functiondef(p.oid), coalesce(array_to_string(p.proacl, ' '), '')
    into v_def, v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_user_permission';

  if v_def is null then raise exception 'T-BL07-8 FAIL: set_user_permission tidak ada'; end if;

  if v_def !~ 'permission_changed' then
    fails := fails || 'tak_emit_permission_changed; ';
  end if;
  -- Regresi 0076: hardening yang direstorasi tidak boleh ikut hilang saat fungsi ditulis ulang.
  -- Self-escalation pernah bisa dieksploitasi secara live, jadi ini bukan detail kosmetik.
  if v_def !~ 'p_target_user_id = auth\.uid\(\)' then
    fails := fails || 'self_guard_0076_hilang; ';
  end if;
  if v_def !~ 'has_permission\(''manage_users_permissions''\)' then
    fails := fails || 'gate_permission_0076_hilang; ';
  end if;
  -- ACL: create or replace mempertahankan ACL, tapi drop+create akan meresetnya ke PUBLIC.
  if v_acl ~ '(^|\s)=X/' or v_acl ~ 'anon=X' then
    fails := fails || 'acl_bocor_ke_public_atau_anon(' || v_acl || '); ';
  end if;

  if fails <> '' then raise exception 'T-BL07-8 FAIL: %', fails; end if;
  raise notice 'T-BL07-8 PASS: permission_changed terkirim, hardening 0076 + ACL utuh';
end $$;
rollback;
