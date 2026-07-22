-- =============================================================================
-- RencanApp — Skenario Lengkap Sampai Tutup Periode (Local Development)
-- =============================================================================
-- Perluas seed_dummy.sql menjadi skenario end-to-end Q3 2026 sampai
-- period_snapshot ditutup dan ranking_snapshots terbentuk.
--
-- Prasyarat:
--   1. `supabase start` sudah jalan.
--   2. `supabase/seed_dummy.sql` sudah dijalankan (6 user + org struct baseline).
--
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < supabase/seed_scenario_close.sql
--
-- Idempoten: aman dipanggil ulang — periode Q3 2026 di-reset ke 'active',
-- ranking_snapshots dibersihkan, dan INSERT pakai ON CONFLICT DO NOTHING.
--
-- Cerita (Q3 2026, org Rencanapp Demo):
--   • CEO Citra menutup periode setelah 4 initiative eksekusi dievaluasi.
--   • Fajar (Sales Staff) high performer, Gita (Finance Staff) medium.
--   • Sales Manager Dewi tetap `is_current=false` (V1 scoring hanya Staff).
--   • CEO memberi manual override +2 poin ke Gita krn bantu tim Sales.
--   • RPC calculate_period_scores → override_user_score → close_period_snapshot.
-- =============================================================================

begin;

set local row_security = off;
set local search_path = public, auth, extensions;

-- CEO menjadi principal semua RPC (auth.uid() dibaca dari GUC ini).
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-000000000001","role":"authenticated"}';

-- Org target — cermin `_seed_org` di seed_dummy.sql. Aturannya HARUS sama persis:
-- file ini memperluas data seed_dummy, jadi kalau keduanya memilih org berbeda,
-- baris di sini mendarat di org lain dan tersaring RLS tanpa error apa pun.
-- Ambil dari profil CEO dummy supaya otomatis ikut ke mana pun seed_dummy menaruhnya.
create temporary table _seed_org on commit drop as
select coalesce(
  (select organization_id from public.profiles where id = '11111111-1111-1111-1111-000000000001'),
  (select id from public.organizations where name = 'Nyantuy Group' order by created_at limit 1),
  (select id from public.organizations order by created_at limit 1)
) as id;

do $$
begin
  if (select id from _seed_org) is null then
    raise exception 'Org target tidak ketemu. Jalankan supabase/seed_dummy.sql lebih dulu.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 0. RESET AGAR IDEMPOTEN
-- ----------------------------------------------------------------------------
update public.period_snapshots
   set status = 'active', closed_at = null, closed_by = null
 where id = '77777777-eeee-eeee-eeee-000000000001';

-- Beberapa tabel punya trigger append-only / immutable-column (ranking_snapshots,
-- score_formula_versions). Utk reset lokal, bypass sesaat via replica role.
set local session_replication_role = replica;
delete from public.ranking_snapshots
 where period_snapshot_id = '77777777-eeee-eeee-eeee-000000000001';

-- V1 scoring hanya Staff. Non-staff is_current=false agar tidak masuk ranking.
-- Semua user_score_results periode ini di-reset is_current=false agar RPC insert
-- baris auto baru dari nol (mencegah override lama "membekukan" auto stale).
update public.user_score_results
   set is_current = false
 where period_snapshot_id = '77777777-eeee-eeee-eeee-000000000001';

-- ----------------------------------------------------------------------------
-- 0.5 FIX FORMULA VERSION — pakai source_metric yang benar-benar dikenali RPC.
-- seed_dummy pakai 'task_completion' yg TIDAK ada di RPC → semua metric = 0.
-- ----------------------------------------------------------------------------
update public.score_formula_versions
   set categories = '[
       {"code":"EXECUTION","label":"Eksekusi Action Plan","weight":50,"source_metric":"action_plan_completion"},
       {"code":"QUALITY","label":"Kualitas Hasil (Approval Rate)","weight":30,"source_metric":"review_pass_rate"},
       {"code":"GOVERNANCE","label":"Disiplin Governance","weight":20,"source_metric":"governance_discipline"}
     ]'::jsonb
 where id = '66666666-ffff-ffff-ffff-000000000001';

-- Kembalikan trigger normal untuk semua INSERT/UPDATE selanjutnya.
set local session_replication_role = origin;

-- =============================================================================
-- 1. ONE-TIME TASKS TAMBAHAN (Fajar & Gita)
-- =============================================================================
-- Tujuan: memberi metric `action_plan_completion` = one_time approved / assigned.
-- Fajar (staff sales): 5 one_time (termasuk cccc-…-001 dari seed_dummy), 3 approved.
-- Gita (staff finance): 3 one_time, 2 approved.
insert into public.tasks (
  id, organization_id, action_plan_id, name, description, pic_id, reviewer_id,
  start_date, deadline, expected_output, definition_of_done, priority, repeat_setting,
  evidence_required, result_value_required, review_required, status, created_by
) values
  ('11cccccc-cccc-cccc-cccc-000000000001', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000001', 'Riset Kata Kunci Referral',
   'List 20 keyword paling banyak dicari calon referrer di periode Q3',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-07-01', '2026-07-10', 'Spreadsheet 20 keyword + volume + kompetitor',
   'File tersimpan di Drive folder Referral, di-share ke manager',
   'medium', 'one_time', true, false, true, 'done', '11111111-1111-1111-1111-000000000003'),
  ('11cccccc-cccc-cccc-cccc-000000000002', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000002', 'A/B Test Add-on Warna Tombol',
   'Uji dua warna CTA add-on di checkout page selama 2 minggu',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-07-14', '2026-07-28', 'Report A/B test dengan winner + confidence',
   'Report PDF disetujui manager sales',
   'medium', 'one_time', true, false, true, 'done', '11111111-1111-1111-1111-000000000003'),
  ('11cccccc-cccc-cccc-cccc-000000000003', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000002', 'Copywriting Bundle Add-on',
   'Tulis 5 varian copy add-on untuk halaman checkout',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-08-01', '2026-08-10', '5 varian copy siap A/B test',
   'Copy disetujui manager sales',
   'low', 'one_time', false, false, true, 'done', '11111111-1111-1111-1111-000000000003'),
  ('11cccccc-cccc-cccc-cccc-000000000004', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000001', 'Follow-up Referrer H+3',
   'Hubungi 30 referrer untuk feedback progress',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-08-15', '2026-08-31', 'Rekap feedback 30 referrer',
   'Rekap dikonfirmasi manager sales',
   'medium', 'one_time', true, false, true, 'in_progress', '11111111-1111-1111-1111-000000000003'),
  ('11cccccc-cccc-cccc-cccc-000000000005', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000004', 'Susun Daftar Piutang Prioritas',
   'Segmentasi 50 debitor besar berdasarkan usia piutang',
   '11111111-1111-1111-1111-000000000006', '11111111-1111-1111-1111-000000000004',
   '2026-07-05', '2026-07-15', 'Spreadsheet segmentasi 50 debitor',
   'File tersimpan + disetujui ops manager',
   'high', 'one_time', true, false, true, 'done', '11111111-1111-1111-1111-000000000006'),
  ('11cccccc-cccc-cccc-cccc-000000000006', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000004', 'Template Email Reminder Formal',
   'Draft 3 template email formal untuk H+30 dan H+45',
   '11111111-1111-1111-1111-000000000006', '11111111-1111-1111-1111-000000000004',
   '2026-07-20', '2026-07-31', '3 template email siap kirim',
   'Template disetujui ops manager',
   'medium', 'one_time', false, false, true, 'done', '11111111-1111-1111-1111-000000000006'),
  ('11cccccc-cccc-cccc-cccc-000000000007', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000004', 'Verifikasi Data Kontak Debitor',
   'Verifikasi ulang nomor & email 100 debitor teratas',
   '11111111-1111-1111-1111-000000000006', '11111111-1111-1111-1111-000000000004',
   '2026-08-15', '2026-08-31', 'Data kontak diperbarui',
   'Data verified & disetujui ops manager',
   'low', 'one_time', false, false, true, 'in_progress', '11111111-1111-1111-1111-000000000006')
on conflict do nothing;

-- Submissions untuk one_time (task_instance_id NULL — one_time = task-level).
insert into public.task_submissions (
  id, task_id, task_instance_id, version_number, submitted_by, submitted_at,
  note, review_status, reviewed_by, reviewed_at
) values
  ('11ffffff-ffff-ffff-ffff-000000000001', '11cccccc-cccc-cccc-cccc-000000000001',
   null, 1,
   '11111111-1111-1111-1111-000000000005', '2026-07-09 15:30:00+07',
   'Sheet keyword sudah lengkap, silakan review.', 'approved',
   '11111111-1111-1111-1111-000000000003', '2026-07-10 09:00:00+07'),
  ('11ffffff-ffff-ffff-ffff-000000000002', '11cccccc-cccc-cccc-cccc-000000000002',
   null, 1,
   '11111111-1111-1111-1111-000000000005', '2026-07-27 16:30:00+07',
   'A/B test 14 hari selesai, warna oranye menang 12% CTR.', 'approved',
   '11111111-1111-1111-1111-000000000003', '2026-07-28 09:15:00+07'),
  ('11ffffff-ffff-ffff-ffff-000000000003', '11cccccc-cccc-cccc-cccc-000000000003',
   null, 1,
   '11111111-1111-1111-1111-000000000005', '2026-08-11 09:00:00+07',
   'Copy siap review — 5 varian.', 'approved',
   '11111111-1111-1111-1111-000000000003', '2026-08-12 11:00:00+07'),
  ('11ffffff-ffff-ffff-ffff-000000000005', '11cccccc-cccc-cccc-cccc-000000000005',
   null, 1,
   '11111111-1111-1111-1111-000000000006', '2026-07-14 14:00:00+07',
   'Segmentasi 50 debitor selesai.', 'approved',
   '11111111-1111-1111-1111-000000000004', '2026-07-15 09:00:00+07'),
  ('11ffffff-ffff-ffff-ffff-000000000006', '11cccccc-cccc-cccc-cccc-000000000006',
   null, 1,
   '11111111-1111-1111-1111-000000000006', '2026-07-30 10:00:00+07',
   '3 template siap.', 'approved',
   '11111111-1111-1111-1111-000000000004', '2026-07-31 09:00:00+07')
on conflict do nothing;

-- =============================================================================
-- 2. REPEAT INSTANCES — Basket Size Fajar (Juli minggu 1–3)
-- =============================================================================
-- 15 hari kerja (Sen–Jum) 06 Jul – 24 Jul, pakai repeat rule dddddddd-…-1.
-- Pola: n∈{5,12}=missed, n∈{7,14}=submitted+late, sisanya done on-time.
with dates as (
  select (row_number() over ())::int as n, d::date as d
  from generate_series(date '2026-07-06', date '2026-07-24', interval '1 day') g(d)
  where extract(isodow from d) between 1 and 5
)
insert into public.task_instances (
  id, organization_id, task_id, repeat_rule_id, instance_date, instance_time,
  deadline_at, status, pic_id, reviewer_id, submitted_at, submitted_late
)
select
  ('21eeeeee-eeee-eeee-eeee-0000000000' || lpad(n::text, 2, '0'))::uuid,
  (select id from _seed_org),
  'cccccccc-cccc-cccc-cccc-000000000002',
  'dddddddd-dddd-dddd-dddd-000000000001',
  d, '17:00:00',
  (d + time '17:30:00') at time zone 'Asia/Jakarta',
  case when n in (5, 12) then 'missed'
       when n in (7, 14) then 'submitted'
       else 'done' end,
  '11111111-1111-1111-1111-000000000005',
  '11111111-1111-1111-1111-000000000003',
  case when n in (5, 12) then null
       when n in (7, 14) then (d + time '18:10:00') at time zone 'Asia/Jakarta'
       else (d + time '17:15:00') at time zone 'Asia/Jakarta' end,
  case when n in (7, 14) then true else false end
from dates
on conflict do nothing;

-- Submissions basket-size (semua yg done/submitted → approved).
insert into public.task_submissions (
  id, task_id, task_instance_id, version_number, submitted_by, submitted_at,
  note, review_status, reviewed_by, reviewed_at
)
select
  ('21ffffff-ffff-ffff-ffff-0000000000' || right(i.id::text, 2))::uuid,
  i.task_id, i.id, 1,
  '11111111-1111-1111-1111-000000000005',
  i.submitted_at,
  'Basket size ' || to_char(i.instance_date, 'DD Mon YYYY'),
  'approved',
  '11111111-1111-1111-1111-000000000003',
  i.submitted_at + interval '30 minutes'
from public.task_instances i
where i.task_id = 'cccccccc-cccc-cccc-cccc-000000000002'
  and i.id::text like '21eeeeee-%'
  and i.status in ('done','submitted')
on conflict do nothing;

update public.task_instances i
   set current_submission_id = s.id
  from public.task_submissions s
 where s.task_instance_id = i.id
   and i.id::text like '21eeeeee-%';

-- =============================================================================
-- 3. REPEAT INSTANCES — Follow-up Piutang Gita (Juli minggu 1–3)
-- =============================================================================
-- 15 hari kerja: 3 missed, 2 late-submitted, 10 done on-time.
with dates as (
  select (row_number() over ())::int as n, d::date as d
  from generate_series(date '2026-07-06', date '2026-07-24', interval '1 day') g(d)
  where extract(isodow from d) between 1 and 5
)
insert into public.task_instances (
  id, organization_id, task_id, repeat_rule_id, instance_date, instance_time,
  deadline_at, status, pic_id, reviewer_id, submitted_at, submitted_late
)
select
  ('22eeeeee-eeee-eeee-eeee-0000000000' || lpad(n::text, 2, '0'))::uuid,
  (select id from _seed_org),
  'cccccccc-cccc-cccc-cccc-000000000004',
  'dddddddd-dddd-dddd-dddd-000000000002',
  d, '09:00:00',
  (d + time '09:00:00') at time zone 'Asia/Jakarta',
  case when n in (3, 8, 13) then 'missed'
       when n in (4, 10) then 'submitted'
       else 'done' end,
  '11111111-1111-1111-1111-000000000006',
  '11111111-1111-1111-1111-000000000001',
  case when n in (3, 8, 13) then null
       when n in (4, 10) then (d + time '10:30:00') at time zone 'Asia/Jakarta'
       else (d + time '08:45:00') at time zone 'Asia/Jakarta' end,
  case when n in (4, 10) then true else false end
from dates
on conflict do nothing;

insert into public.task_submissions (
  id, task_id, task_instance_id, version_number, submitted_by, submitted_at,
  note, review_status, reviewed_by, reviewed_at
)
select
  ('22ffffff-ffff-ffff-ffff-0000000000' || right(i.id::text, 2))::uuid,
  i.task_id, i.id, 1,
  '11111111-1111-1111-1111-000000000006',
  i.submitted_at,
  'Reminder piutang ' || to_char(i.instance_date, 'DD Mon YYYY'),
  'approved',
  '11111111-1111-1111-1111-000000000001',
  i.submitted_at + interval '30 minutes'
from public.task_instances i
where i.task_id = 'cccccccc-cccc-cccc-cccc-000000000004'
  and i.id::text like '22eeeeee-%'
  and i.status in ('done','submitted')
on conflict do nothing;

update public.task_instances i
   set current_submission_id = s.id
  from public.task_submissions s
 where s.task_instance_id = i.id
   and i.id::text like '22eeeeee-%';

-- =============================================================================
-- 4. GOVERNANCE VIOLATIONS TAMBAHAN
-- =============================================================================
-- Gita: 1 medium (deadline miss beruntun). Fajar sudah punya 1 low dari seed_dummy.
insert into public.governance_violations (
  id, organization_id, user_id, violation_type, entity_type, entity_id, detail, severity, resolution_status, created_at
) values
  ('66666666-cccc-cccc-cccc-000000000002', (select id from _seed_org),
   '11111111-1111-1111-1111-000000000006', 'deadline_missed_repeat', 'task',
   'cccccccc-cccc-cccc-cccc-000000000004',
   '{"note":"3 hari berturut miss reminder piutang"}'::jsonb,
   'medium', 'open', '2026-07-15 10:00:00+07')
on conflict do nothing;

-- =============================================================================
-- 5. EVALUATIONS — 4 Action Plan Ditutup dengan Evaluasi
-- =============================================================================
-- Constraint: pic_id <> evaluated_by. CEO jadi evaluator utk semua AP.
insert into public.evaluations (
  id, organization_id, action_plan_id, target_achieved, results,
  success_factors, failure_factors, lessons_learned,
  should_become_sop, rollout_needed, rollout_notes,
  evaluated_by, pic_id
) values
  ('ee111111-1111-1111-1111-000000000001', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000001', 'sebagian',
   '112 referral konversi dari target 120 (93%). Overspend reward 8%.',
   ARRAY['Landing page mobile-first','Reward jelas','CTA copy fokus'],
   ARRAY['Reward tidak scale utk high-tier customer','Onboarding referrer masih manual'],
   'Referral bekerja terbaik pada customer aktif 3+ bulan. Reward tier perlu diperluas.',
   true, true, 'Rollout ke divisi retail pada Q4 dgn tier reward baru.',
   '11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000003'),
  ('ee111111-1111-1111-1111-000000000002', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000002', 'ya',
   'Basket size naik dari Rp 305rb → Rp 358rb (target Rp 350rb).',
   ARRAY['A/B test warna CTA','Copy add-on cross-sell','Slot add-on halaman ke-2'],
   ARRAY['Latency halaman naik 200ms saat load add-on'],
   'Placement di halaman ke-2 aman utk konversi; halaman ke-1 kurangi bounce.',
   true, false, null,
   '11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000005'),
  ('ee111111-1111-1111-1111-000000000003', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000003', 'sebagian',
   'Boros bahan turun 6% (target 8%). Shift malam belum diimplementasi.',
   ARRAY['SOP tertulis lengkap','Role-play efektif','Checklist harian'],
   ARRAY['Shift malam belum di-roll out','Resistensi 2 anggota senior'],
   'Perlu pendekatan bertahap; roll out shift malam Q4 setelah tim dilatih ulang.',
   true, true, 'Latih shift malam pada minggu ke-2 Q4.',
   '11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000004'),
  ('ee111111-1111-1111-1111-000000000004', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000004', 'ya',
   'DSO turun dari 41 → 27 hari (target 28). Kolektibilitas AR meningkat.',
   ARRAY['Template reminder bertahap','Follow-up konsisten harian','Segmentasi debitor prioritas'],
   ARRAY['3 hari missed di minggu ke-2','Kontak debitor tidak ter-update'],
   'Reminder H+5 jauh lebih efektif dari sekadar H+30; kontak harus di-refresh bulanan.',
   true, true, 'Terapkan pola ini ke B2B enterprise Q4.',
   '11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000006')
on conflict do nothing;

-- Tandai 4 initiative eksekusi jadi 'done' (sudah dievaluasi).
update public.action_plans
   set status = 'done'
 where id in (
   '99999999-9999-9999-9999-000000000001',
   '99999999-9999-9999-9999-000000000002',
   '99999999-9999-9999-9999-000000000003',
   '99999999-9999-9999-9999-000000000004'
 );

commit;

-- =============================================================================
-- 6. RUN RPC: calculate_period_scores → override_user_score → close_period_snapshot
-- =============================================================================
begin;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-000000000001","role":"authenticated"}';

select 'calculate_period_scores' as step,
       public.calculate_period_scores('77777777-eeee-eeee-eeee-000000000001'::uuid) as users_scored;

select 'override_user_score' as step,
       public.override_user_score(
         '77777777-eeee-eeee-eeee-000000000001'::uuid,
         '11111111-1111-1111-1111-000000000006'::uuid,
         (select coalesce(auto_calculated_score,0) + 2
          from public.user_score_results
          where period_snapshot_id = '77777777-eeee-eeee-eeee-000000000001'
            and user_id = '11111111-1111-1111-1111-000000000006'
            and is_current = true
            and result_kind = 'auto'
          limit 1),
         'Kontribusi lintas tim: bantu Sales rekonsiliasi AR di minggu ke-3.'
       ) as override_id;

select 'close_period_snapshot' as step,
       public.close_period_snapshot('77777777-eeee-eeee-eeee-000000000001'::uuid) as ranked_users;

commit;

-- =============================================================================
-- 7. RINGKASAN HASIL
-- =============================================================================
\echo
\echo '===== PERIODE ====='
select id, period_name, status, closed_at
  from public.period_snapshots
 where id = '77777777-eeee-eeee-eeee-000000000001';

\echo
\echo '===== USER SCORE RESULTS (is_current=true) ====='
select p.full_name,
       r.result_kind,
       r.auto_calculated_score,
       r.manual_adjusted_score,
       r.metric_breakdown
  from public.user_score_results r
  join public.profiles p on p.id = r.user_id
 where r.period_snapshot_id = '77777777-eeee-eeee-eeee-000000000001'
   and r.is_current = true
 order by coalesce(r.manual_adjusted_score, r.auto_calculated_score) desc;

\echo
\echo '===== RANKING SNAPSHOT ====='
select rs.rank_number, p.full_name, rs.score, rs.metric_breakdown
  from public.ranking_snapshots rs
  join public.profiles p on p.id = rs.user_id
 where rs.period_snapshot_id = '77777777-eeee-eeee-eeee-000000000001'
 order by rs.rank_number, p.full_name;

\echo
\echo '===== ACTIVITY LOG (period close) ====='
select created_at, action, detail
  from public.activity_logs
 where entity_type = 'period_snapshot'
   and entity_id = '77777777-eeee-eeee-eeee-000000000001'
 order by created_at desc
 limit 5;
