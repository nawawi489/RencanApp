-- =============================================================================
-- RencanApp — Dummy Data Seed (Local Development)
-- =============================================================================
-- Skema data minimal (~10-20 baris per scope utama) untuk development lokal.
-- Jalankan setelah `supabase start` + `supabase db reset` (atau setara).
--
--   psql "postgresql://postgres:postgres@localhost:54322/postgres" \
--        -f supabase/seed_dummy.sql
--
-- Aturan:
--   • Idempoten: pakai ON CONFLICT DO NOTHING / WHERE NOT EXISTS — aman dipanggil ulang.
--   • Bypass RLS: SET LOCAL row_security = off dalam transaksi — local superuser.
--   • UUID deterministik: gunakan rentang 1111…/2222…/dst agar mudah dilacak di SQL editor.
--   • Semua user dummy pakai password plaintext: "rencan123" (lokal saja, jangan di remote).
-- =============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. RLS bypass + disable auth trigger (kembalikan setelah commit)
-- ----------------------------------------------------------------------------
set local row_security = off;

-- pgcrypto untuk crypt()/gen_salt() (default Supabase: ada di schema extensions)
create extension if not exists pgcrypto with schema extensions;
-- pastikan schema auth tersedia
set search_path = public, auth, extensions;

-- ----------------------------------------------------------------------------
-- 0b. ORG TARGET — SATU sumber, dipakai SEMUA baris di file ini
-- ----------------------------------------------------------------------------
-- Dulu setiap baris memanggil `select id from public.organizations limit 1` TANPA
-- `order by`. Itu non-deterministik: begitu DB lokal punya lebih dari satu org —
-- dan itu terjadi, karena DB contract tests menyuntikkan "Contract Fixtures Org" +
-- "DCR-05 Fixtures Org" — baris data bisa mendarat di org mana pun.
--
-- Lebih buruk lagi, profil TIDAK ikut ekspresi itu: profil dibuat trigger
-- `handle_new_user` yang memakai `order by created_at limit 1` (org TERTUA). Kedua
-- aturan berbeda, jadi profil dan datanya bisa terpisah org. Gejalanya senyap dan
-- menyesatkan: login berhasil, workspace kosong, dan layar turunan melaporkan
-- "Goal tidak ditemukan" karena RLS menyaring habis — persis seperti data hilang.
-- (Org fixture ber-`created_at` epoch 1970, jadi mereka MENANG aturan "tertua".)
--
-- Perbaikannya: pin ke org kanonik bikinan migrasi 0001 ('Nyantuy Group') — satu-
-- satunya org dengan set role_templates lengkap (ceo/c_level/management/staff).
-- Fallback ke org tertua supaya file ini tetap jalan bila org kanonik di-rename.
create temporary table _seed_org on commit drop as
select coalesce(
  (select id from public.organizations where name = 'Nyantuy Group' order by created_at limit 1),
  (select id from public.organizations order by created_at limit 1)
) as id;

do $$
begin
  if (select id from _seed_org) is null then
    raise exception 'Tidak ada organizations. Jalankan migrasi dulu (supabase db reset), baru seed ini.';
  end if;
end $$;

-- =============================================================================
-- 1. AUTH USERS (6 user) + PROFILES
-- =============================================================================
-- Trigger `handle_new_user` akan auto-create profile basic — kita UPDATE
-- setelahnya untuk set full_name, position_title, dan role_template_id.
--
-- `organization_id` dititipkan lewat raw_app_meta_data supaya trigger menaruh
-- profil langsung di `_seed_org`. Wajib sejak migrasi 0083: dengan lebih dari
-- satu org, trigger menolak menebak alih-alih memilih org tertua — aturan
-- "tertua" itulah yang dulu menelan profil seed ke org fixture ber-epoch 1970.
-- Namespace 11111111-… = user dummy
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('11111111-1111-1111-1111-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'ceo@rencan.local', crypt('rencan123', gen_salt('bf')), now(),
   ('{"provider":"email","providers":["email"]}'::jsonb
     || jsonb_build_object('organization_id', (select id from _seed_org))), '{}'::jsonb, now(), now(), '', '', '', ''),
  ('11111111-1111-1111-1111-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'cmo@rencan.local', crypt('rencan123', gen_salt('bf')), now(),
   ('{"provider":"email","providers":["email"]}'::jsonb
     || jsonb_build_object('organization_id', (select id from _seed_org))), '{}'::jsonb, now(), now(), '', '', '', ''),
  ('11111111-1111-1111-1111-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mgr.sales@rencan.local', crypt('rencan123', gen_salt('bf')), now(),
   ('{"provider":"email","providers":["email"]}'::jsonb
     || jsonb_build_object('organization_id', (select id from _seed_org))), '{}'::jsonb, now(), now(), '', '', '', ''),
  ('11111111-1111-1111-1111-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'mgr.ops@rencan.local', crypt('rencan123', gen_salt('bf')), now(),
   ('{"provider":"email","providers":["email"]}'::jsonb
     || jsonb_build_object('organization_id', (select id from _seed_org))), '{}'::jsonb, now(), now(), '', '', '', ''),
  ('11111111-1111-1111-1111-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'staff.sales@rencan.local', crypt('rencan123', gen_salt('bf')), now(),
   ('{"provider":"email","providers":["email"]}'::jsonb
     || jsonb_build_object('organization_id', (select id from _seed_org))), '{}'::jsonb, now(), now(), '', '', '', ''),
  ('11111111-1111-1111-1111-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'staff.finance@rencan.local', crypt('rencan123', gen_salt('bf')), now(),
   ('{"provider":"email","providers":["email"]}'::jsonb
     || jsonb_build_object('organization_id', (select id from _seed_org))), '{}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- Lengkapi profile (organization_id, full_name, position_title, role_template_id) per-role.
-- Asumsi: trigger handle_new_user sudah insert profile dengan role 'staff' default.
--
-- `organization_id` WAJIB ikut di-set di sini. Trigger memilih org TERTUA, sedangkan
-- seluruh data di file ini memakai `_seed_org` — dua aturan berbeda, dan pada DB yang
-- pernah dipakai contract tests hasilnya berbeda org. Menyamakannya di sini membuat
-- profil dan datanya selalu satu org, sekaligus MEMPERBAIKI profil yang sudah terlanjur
-- salah org dari run sebelumnya (file ini idempoten, jadi cukup jalankan ulang).
-- role_template_id sengaja diturunkan dari `_seed_org`, BUKAN `p.organization_id`:
-- kalau tidak, ia akan menunjuk role_template milik org lama.
update public.profiles p set
  organization_id = (select id from _seed_org),
  full_name = case p.email
    when 'ceo@rencan.local'         then 'Citra Wibawa'
    when 'cmo@rencan.local'         then 'Bayu Pratama'
    when 'mgr.sales@rencan.local'   then 'Dewi Anggraini'
    when 'mgr.ops@rencan.local'     then 'Eko Saputro'
    when 'staff.sales@rencan.local' then 'Fajar Nugroho'
    when 'staff.finance@rencan.local' then 'Gita Maharani'
  end,
  position_title = case p.email
    when 'ceo@rencan.local'         then 'CEO'
    when 'cmo@rencan.local'         then 'Chief Marketing Officer'
    when 'mgr.sales@rencan.local'   then 'Sales Manager'
    when 'mgr.ops@rencan.local'     then 'Operations Manager'
    when 'staff.sales@rencan.local' then 'Sales Executive'
    when 'staff.finance@rencan.local' then 'Finance Staff'
  end,
  role_template_id = (
    select rt.id from public.role_templates rt
    where rt.organization_id = (select id from _seed_org)
      and (
        (p.email in ('ceo@rencan.local') and rt.level = 'ceo')
        or (p.email in ('cmo@rencan.local') and rt.level = 'c_level')
        or (p.email in ('mgr.sales@rencan.local','mgr.ops@rencan.local') and rt.level = 'management')
        or (p.email in ('staff.sales@rencan.local','staff.finance@rencan.local') and rt.level = 'staff')
      )
    limit 1
  )
where p.email in (
  'ceo@rencan.local','cmo@rencan.local','mgr.sales@rencan.local',
  'mgr.ops@rencan.local','staff.sales@rencan.local','staff.finance@rencan.local'
);

-- Auth identities (Supabase v2 butuh baris di auth.identities untuk login email)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.email,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email in (
  'ceo@rencan.local','cmo@rencan.local','mgr.sales@rencan.local',
  'mgr.ops@rencan.local','staff.sales@rencan.local','staff.finance@rencan.local'
)
on conflict do nothing;

-- =============================================================================
-- 2. ORG STRUCTURE
-- =============================================================================
-- Departments (3)
insert into public.departments (id, organization_id, name, description, is_active)
values
  ('22222222-2222-2222-2222-000000000001', (select id from _seed_org), 'Sales & Marketing', 'Pengelola revenue dan brand', true),
  ('22222222-2222-2222-2222-000000000002', (select id from _seed_org), 'Operations', 'Pengelola operasional harian', true),
  ('22222222-2222-2222-2222-000000000003', (select id from _seed_org), 'Finance', 'Pengelola keuangan dan kas', true)
on conflict (organization_id, name) do nothing;

-- Positions (4)
insert into public.positions (id, organization_id, department_id, name, is_active)
values
  ('33333333-3333-3333-3333-000000000001', (select id from _seed_org),
   '22222222-2222-2222-2222-000000000001', 'Sales Manager', true),
  ('33333333-3333-3333-3333-000000000002', (select id from _seed_org),
   '22222222-2222-2222-2222-000000000001', 'Sales Executive', true),
  ('33333333-3333-3333-3333-000000000003', (select id from _seed_org),
   '22222222-2222-2222-2222-000000000002', 'Operations Manager', true),
  ('33333333-3333-3333-3333-000000000004', (select id from _seed_org),
   '22222222-2222-2222-2222-000000000003', 'Finance Staff', true)
on conflict (organization_id, name) do nothing;

-- Teams (2)
insert into public.teams (id, organization_id, department_id, name, lead_id, is_active)
values
  ('44444444-4444-4444-4444-000000000001', (select id from _seed_org),
   '22222222-2222-2222-2222-000000000001', 'Tim Sales', '11111111-1111-1111-1111-000000000003', true),
  ('44444444-4444-4444-4444-000000000002', (select id from _seed_org),
   '22222222-2222-2222-2222-000000000002', 'Tim Ops', '11111111-1111-1111-1111-000000000004', true)
on conflict (organization_id, name) do nothing;

-- Team members (4)
insert into public.team_members (id, team_id, profile_id, organization_id, role_in_team)
values
  ('55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-000000000001',
   '11111111-1111-1111-1111-000000000003', (select id from _seed_org), 'lead'),
  ('55555555-5555-5555-5555-000000000002', '44444444-4444-4444-4444-000000000001',
   '11111111-1111-1111-1111-000000000005', (select id from _seed_org), 'member'),
  ('55555555-5555-5555-5555-000000000003', '44444444-4444-4444-4444-000000000002',
   '11111111-1111-1111-1111-000000000004', (select id from _seed_org), 'lead'),
  ('55555555-5555-5555-5555-000000000004', '44444444-4444-4444-4444-000000000002',
   '11111111-1111-1111-1111-000000000006', (select id from _seed_org), 'member')
on conflict (team_id, profile_id) do nothing;

-- =============================================================================
-- 3. CARD HIERARCHY (Goal → KPI Area → Strategy → Initiative)
-- =============================================================================
-- Goals (2)
insert into public.goals (id, organization_id, name, description, pic_id, period_start, period_end, status, target_value)
values
  ('66666666-6666-6666-6666-000000000001', (select id from _seed_org),
   'Naikkan Omset Q3 2026', 'Fokus akuisisi customer baru dan basket size', '11111111-1111-1111-1111-000000000002',
   '2026-07-01', '2026-09-30', 'active', 'Rp 2,5 Miliar'),
  ('66666666-6666-6666-6666-000000000002', (select id from _seed_org),
   'Tingkatkan Profit Margin Q3 2026', 'Optimasi biaya operasional dan kolektibilitas AR', '11111111-1111-1111-1111-000000000002',
   '2026-07-01', '2026-09-30', 'active', '15% margin')
on conflict (id) do nothing;

-- KPI Areas (4)
insert into public.strategies (id, organization_id, goal_id, name, target, target_numeric, target_unit, pic_id, period_start, period_end, status)
values
  ('77777777-7777-7777-7777-000000000001', (select id from _seed_org),
   '66666666-6666-6666-6666-000000000001', 'Akuisisi Customer Baru',
   'Tambah 120 customer aktif', 120, 'customer', '11111111-1111-1111-1111-000000000003',
   '2026-07-01', '2026-09-30', 'active'),
  ('77777777-7777-7777-7777-000000000002', (select id from _seed_org),
   '66666666-6666-6666-6666-000000000001', 'Basket Size Rata-rata',
   'Naikkan ke Rp 350.000', 350000, 'rupiah', '11111111-1111-1111-1111-000000000003',
   '2026-07-01', '2026-09-30', 'active'),
  ('77777777-7777-7777-7777-000000000003', (select id from _seed_org),
   '66666666-6666-6666-6666-000000000002', 'Pengendalian Biaya Operasional',
   'Turun 8% dari baseline', 8, 'percent', '11111111-1111-1111-1111-000000000004',
   '2026-07-01', '2026-09-30', 'active'),
  ('77777777-7777-7777-7777-000000000004', (select id from _seed_org),
   '66666666-6666-6666-6666-000000000002', 'Kolektibilitas AR',
   'Turunkan DSO ke 28 hari', 28, 'hari', '11111111-1111-1111-1111-000000000006',
   '2026-07-01', '2026-09-30', 'active')
on conflict (id) do nothing;

-- Strategies (4)
insert into public.initiatives (id, organization_id, strategy_id, name, reason, main_risk, alternative, pic_id, period_start, period_end, status)
values
  ('88888888-8888-8888-8888-000000000001', (select id from _seed_org),
   '77777777-7777-7777-7777-000000000001', 'Campaign Referral Customer Aktif',
   'Customer aktif adalah channel akuisisi paling murah dan kredibel',
   'Reward tidak cukup menarik; churn turun tapi volume stagnan',
   'Bundle promo ke new customer jika referral di bawah target',
   '11111111-1111-1111-1111-000000000003', '2026-07-01', '2026-09-30', 'active'),
  ('88888888-8888-8888-8888-000000000002', (select id from _seed_org),
   '77777777-7777-7777-7777-000000000002', 'Cross-sell Add-on ke Transaksi Berulang',
   'Customer yang sudah repeat order lebih responsif ke add-on bernilai tinggi',
   'Penolakan karena dianggap upselling agresif',
   'Sembunyikan add-on di halaman kedua checkout jika conversion turun >10%',
   '11111111-1111-1111-1111-000000000003', '2026-07-01', '2026-09-30', 'active'),
  ('88888888-8888-8888-8888-000000000003', (select id from _seed_org),
   '77777777-7777-7777-7777-000000000003', 'Standarkan Proses Shift Pagi & Malam',
   'Inkonsistensi shift utama penyebab boros bahan dan waktu idle',
   'Resistensi tim lama yang sudah nyaman dengan pola eksisting',
   'Lakukan per shift, mulai shift malam yang lebih sedikit personil',
   '11111111-1111-1111-1111-000000000004', '2026-07-01', '2026-09-30', 'active'),
  ('88888888-8888-8888-8888-000000000004', (select id from _seed_org),
   '77777777-7777-7777-7777-000000000004', 'Reminder Piutang Bertahap',
   'Customer B2B sering terlambat bayar karena tidak ada pengingat terstruktur',
   'Customer merasa terganggu jika intensitas terlalu tinggi',
   'Eskalasi ke email formal di hari ke-45 jika pengingat tidak direspons',
   '11111111-1111-1111-1111-000000000006', '2026-07-01', '2026-09-30', 'active')
on conflict (id) do nothing;

-- Initiatives (4)
insert into public.action_plans (id, organization_id, initiative_id, name, description, target_result, pic_id, period_start, period_end, status, created_by)
values
  ('99999999-9999-9999-9999-000000000001', (select id from _seed_org),
   '88888888-8888-8888-8888-000000000001', 'Launch Program Referral',
   'Buka program referral dengan reward Rp 50.000 untuk setiap konversi',
   '120 referral terkonversi dalam 90 hari', '11111111-1111-1111-1111-000000000003',
   '2026-07-01', '2026-09-30', 'active', '11111111-1111-1111-1111-000000000003'),
  ('99999999-9999-9999-9999-000000000002', (select id from _seed_org),
   '88888888-8888-8888-8888-000000000002', 'Optimasi Checkout Page',
   'Tambah slot add-on di halaman kedua dan ukur konversi',
   'Naikkan basket size ke Rp 350.000', '11111111-1111-1111-1111-000000000005',
   '2026-07-01', '2026-09-30', 'active', '11111111-1111-1111-1111-000000000003'),
  ('99999999-9999-9999-9999-000000000003', (select id from _seed_org),
   '88888888-8888-8888-8888-000000000003', 'SOP Shift Pagi',
   'Tulis dan latih SOP shift pagi (06.00-14.00)',
   'Boros bahan turun 8%', '11111111-1111-1111-1111-000000000004',
   '2026-07-15', '2026-08-31', 'active', '11111111-1111-1111-1111-000000000004'),
  ('99999999-9999-9999-9999-000000000004', (select id from _seed_org),
   '88888888-8888-8888-8888-000000000004', 'Template Reminder Piutang H+5',
   'Siapkan 3 template reminder piutang bertahap (H+5, H+15, H+30)',
   'DSO turun ke 28 hari', '11111111-1111-1111-1111-000000000006',
   '2026-07-01', '2026-08-15', 'active', '11111111-1111-1111-1111-000000000006')
on conflict (id) do nothing;

-- Development Areas (2) — harus sebelum problem_statements (FK)
insert into public.development_areas (id, organization_id, name, description, pic_id, period_start, period_end, status, created_by)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', (select id from _seed_org),
   'Pelatihan Negosiasi Tim Sales', 'Workshop 2 hari untuk 5 account executive tentang teknik negosiasi value-based',
   '11111111-1111-1111-1111-000000000003', '2026-08-01', '2026-08-31', 'active', '11111111-1111-1111-1111-000000000003'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', (select id from _seed_org),
   'Sertifikasi Sistem ERP Finance', 'Pelatihan dan ujian sertifikasi untuk 2 finance staff',
   '11111111-1111-1111-1111-000000000006', '2026-07-15', '2026-08-15', 'active', '11111111-1111-1111-1111-000000000006')
on conflict (id) do nothing;

-- Problem Statements (2)
insert into public.problem_statements (id, organization_id, development_area_id, name, description, impact, initial_evidence, pic_id, status, period_start, period_end, created_by)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', (select id from _seed_org),
   'bbbbbbbb-bbbb-bbbb-bbbb-000000000001',
   'Churn Customer Meningkat 15% YoY', 'Pelanggan berhenti repeat order dalam 90 hari sejak transaksi pertama',
   'high', 'Data CRM: 87 dari 580 customer baru Q1 tidak transaksi lagi di Q2',
   '11111111-1111-1111-1111-000000000003', 'active', '2026-07-01', '2026-09-30', '11111111-1111-1111-1111-000000000003'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', (select id from _seed_org),
   'bbbbbbbb-bbbb-bbbb-bbbb-000000000002',
   'Stok Bahan Mentah Tidak Terkontrol', 'Stok opname mingguan tidak dilakukan sehingga procurement boros 12%',
   'medium', 'Audit internal menemukan 8 item dengan selisih > 15%',
   '11111111-1111-1111-1111-000000000004', 'active', '2026-07-01', '2026-08-31', '11111111-1111-1111-1111-000000000004')
on conflict (id) do nothing;

-- =============================================================================
-- 4. ACTION PLANS & EXECUTION
-- =============================================================================
-- Action plans (4)
insert into public.tasks (id, organization_id, action_plan_id, name, description, pic_id, reviewer_id,
  start_date, deadline, expected_output, definition_of_done, priority, repeat_setting,
  evidence_required, result_value_required, review_required, status, created_by)
values
  ('cccccccc-cccc-cccc-cccc-000000000001', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000001', 'Desain Landing Page Referral',
   'Buat landing page khusus program referral dengan tracking UTM',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-07-05', '2026-07-15', 'Landing page live dengan form referral',
   'Halaman published di domain utama, form tersubmit ke CRM, tracking UTM aktif',
   'high', 'one_time', true, false, true, 'in_progress', '11111111-1111-1111-1111-000000000003'),
  ('cccccccc-cccc-cccc-cccc-000000000002', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000002', 'Checkout Harian (Repeat)',
   'Submit basket size rata-rata harian tim sales',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-07-01', '2026-09-30', 'Basket size harian tercatat',
   'Submit nilai basket size via form sebelum jam 17.00 setiap hari kerja',
   'medium', 'repeat', true, true, true, 'in_progress', '11111111-1111-1111-1111-000000000003'),
  ('cccccccc-cccc-cccc-cccc-000000000003', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000003', 'Latihan SOP Shift Pagi',
   'Briefing dan role-play SOP shift pagi ke seluruh tim',
   '11111111-1111-1111-1111-000000000004', '11111111-1111-1111-1111-000000000001',
   '2026-08-01', '2026-08-10', 'SOP dipahami semua anggota shift pagi',
   'Seluruh tim shift pagi hadir, hasil post-test minimal 70%',
   'high', 'one_time', true, false, true, 'assigned', '11111111-1111-1111-1111-000000000004'),
  ('cccccccc-cccc-cccc-cccc-000000000004', (select id from _seed_org),
   '99999999-9999-9999-9999-000000000004', 'Follow-up Piutang Harian (Repeat)',
   'Kirim reminder piutang H+5 ke customer yang akan jatuh tempo',
   '11111111-1111-1111-1111-000000000006', '11111111-1111-1111-1111-000000000001',
   '2026-07-05', '2026-08-15', 'Customer diingatkan 5 hari sebelum jatuh tempo',
   'Reminder terkirim ke semua customer B2B di hari kerja',
   'medium', 'repeat', true, true, true, 'in_progress', '11111111-1111-1111-1111-000000000006')
on conflict (id) do nothing;

-- Repeat rules (untuk AP #2 dan #4)
insert into public.task_repeat_rules (
  id, organization_id, task_id, frequency, weekdays, repeat_start_date, repeat_end_date,
  time_of_day, missed_rule, grace_period_minutes, created_by
) values
  ('dddddddd-dddd-dddd-dddd-000000000001', (select id from _seed_org),
   'cccccccc-cccc-cccc-cccc-000000000002', 'weekly', array[1,2,3,4,5],
   '2026-07-01', '2026-09-30', '17:00:00', 'grace_period', 30,
   '11111111-1111-1111-1111-000000000003'),
  ('dddddddd-dddd-dddd-dddd-000000000002', (select id from _seed_org),
   'cccccccc-cccc-cccc-cccc-000000000004', 'weekly', array[1,2,3,4,5],
   '2026-07-05', '2026-08-15', '09:00:00', 'strict', null,
   '11111111-1111-1111-1111-000000000006')
on conflict (id) do nothing;

-- Action plan instances (3 untuk #2, 1 untuk #4).
-- reviewer_id di-set agar layar instance menampilkan reviewer + panel review.
-- #2 (2026-07-02) berstatus 'submitted' — submission f..002 masih 'pending' menunggu
-- review Dewi (…003); current_submission_id di-set via UPDATE setelah submissions dibuat.
insert into public.task_instances (
  id, organization_id, task_id, repeat_rule_id, instance_date, instance_time,
  deadline_at, status, pic_id, reviewer_id, submitted_at, submitted_late
) values
  ('eeeeeeee-eeee-eeee-eeee-000000000001', (select id from _seed_org),
   'cccccccc-cccc-cccc-cccc-000000000002', 'dddddddd-dddd-dddd-dddd-000000000001',
   '2026-07-01', '17:00:00', '2026-07-01 17:30:00+07', 'done',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-07-01 17:15:00+07', false),
  ('eeeeeeee-eeee-eeee-eeee-000000000002', (select id from _seed_org),
   'cccccccc-cccc-cccc-cccc-000000000002', 'dddddddd-dddd-dddd-dddd-000000000001',
   '2026-07-02', '17:00:00', '2026-07-02 17:30:00+07', 'submitted',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   '2026-07-02 17:25:00+07', false),
  ('eeeeeeee-eeee-eeee-eeee-000000000003', (select id from _seed_org),
   'cccccccc-cccc-cccc-cccc-000000000002', 'dddddddd-dddd-dddd-dddd-000000000001',
   '2026-07-03', '17:00:00', '2026-07-03 17:30:00+07', 'assigned',
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   null, false),
  ('eeeeeeee-eeee-eeee-eeee-000000000004', (select id from _seed_org),
   'cccccccc-cccc-cccc-cccc-000000000004', 'dddddddd-dddd-dddd-dddd-000000000002',
   '2026-07-06', '09:00:00', '2026-07-06 09:00:00+07', 'done',
   '11111111-1111-1111-1111-000000000006', null,
   '2026-07-06 08:55:00+07', false)
on conflict (id) do nothing;

-- Submissions (2). task_instance_id WAJIB di-set agar submission tampil di
-- "Riwayat Submission" layar instance + jadi current_submission yang bisa direview.
insert into public.task_submissions (
  id, task_id, task_instance_id, version_number, submitted_by, submitted_at, note, review_status, reviewed_by, reviewed_at
) values
  ('ffffffff-ffff-ffff-ffff-000000000001', 'cccccccc-cccc-cccc-cccc-000000000002',
   'eeeeeeee-eeee-eeee-eeee-000000000001', 1,
   '11111111-1111-1111-1111-000000000005', '2026-07-01 17:15:00+07',
   'Basket size Senin 1 Juli: Rp 348.500', 'approved',
   '11111111-1111-1111-1111-000000000003', '2026-07-01 18:00:00+07'),
  ('ffffffff-ffff-ffff-ffff-000000000002', 'cccccccc-cccc-cccc-cccc-000000000002',
   'eeeeeeee-eeee-eeee-eeee-000000000002', 1,
   '11111111-1111-1111-1111-000000000005', '2026-07-02 17:25:00+07',
   'Basket size Selasa 2 Juli: Rp 362.000', 'pending',
   null, null)
on conflict (id) do nothing;

-- Tautkan current_submission_id instance (FK → submissions, di-set setelah insert submissions).
update public.task_instances i
  set current_submission_id = s.id
  from public.task_submissions s
  where s.task_instance_id = i.id
    and i.id in ('eeeeeeee-eeee-eeee-eeee-000000000001', 'eeeeeeee-eeee-eeee-eeee-000000000002');

-- Evidence files (2)
insert into public.evidence_files (id, submission_id, kind, storage_path, file_name, mime_type, text_content, uploaded_by)
values
  ('99999999-aaaa-aaaa-aaaa-000000000001', 'ffffffff-ffff-ffff-ffff-000000000001',
   'screenshot', 'evidence/checkout-2026-07-01.png', 'checkout-2026-07-01.png', 'image/png',
   null, '11111111-1111-1111-1111-000000000005'),
  ('99999999-aaaa-aaaa-aaaa-000000000002', 'ffffffff-ffff-ffff-ffff-000000000001',
   'text_note', null, null, null,
   'Total order Senin 1 Juli: 47 transaksi, basket size rata-rata Rp 348.500',
   '11111111-1111-1111-1111-000000000005')
on conflict (id) do nothing;

-- Reviews (1)
insert into public.reviews (id, task_id, submission_id, reviewer_id, decision, reason)
values
  ('88888888-ffff-ffff-ffff-000000000001', 'cccccccc-cccc-cccc-cccc-000000000002',
   'ffffffff-ffff-ffff-ffff-000000000001', '11111111-1111-1111-1111-000000000003',
   'approve', 'Data basket size valid, lanjut besok')
on conflict (id) do nothing;

-- =============================================================================
-- 5. SCORING & GOVERNANCE
-- =============================================================================
-- Period snapshot (1 — Q3 2026)
insert into public.period_snapshots (id, organization_id, period_name, period_start, period_end, status, created_by)
values
  ('77777777-eeee-eeee-eeee-000000000001', (select id from _seed_org),
   'Q3 2026', '2026-07-01', '2026-09-30', 'active', '11111111-1111-1111-1111-000000000001')
on conflict (id) do nothing;

-- Score formula template (1)
insert into public.score_formula_templates (id, organization_id, name, level, is_default, created_by)
values
  ('66666666-eeee-eeee-eeee-000000000001', (select id from _seed_org),
   'Formula Standar Staff Q3 2026', 'staff', true, '11111111-1111-1111-1111-000000000001')
on conflict (id) do nothing;

-- Score formula version (1)
insert into public.score_formula_versions (
  id, template_id, version_number, level, organization_id, status, categories,
  effective_date, change_reason, created_by, approved_by, activated_at
) values
  ('66666666-ffff-ffff-ffff-000000000001', '66666666-eeee-eeee-eeee-000000000001',
   1, 'staff', (select id from _seed_org), 'active',
   '[
     {"code": "EXECUTION", "label": "Eksekusi Action Plan", "weight": 50, "source_metric": "task_completion"},
     {"code": "QUALITY",   "label": "Kualitas Hasil",      "weight": 30, "source_metric": "review_pass_rate"},
     {"code": "GOVERNANCE","label": "Disiplin Governance", "weight": 20, "source_metric": "governance_discipline"}
   ]'::jsonb,
   '2026-07-01', 'Formula awal Q3 2026', '11111111-1111-1111-1111-000000000001',
   '11111111-1111-1111-1111-000000000001', '2026-07-01 09:00:00+07')
on conflict (id) do nothing;

-- Score formula assignment (semua staff dapat formula)
insert into public.score_formula_assignments (
  id, organization_id, formula_version_id, scope_level, role_level, start_date, assigned_by
) values
  ('66666666-aaaa-aaaa-aaaa-000000000001', (select id from _seed_org),
   '66666666-ffff-ffff-ffff-000000000001', 'org_role', 'staff', '2026-07-01', '11111111-1111-1111-1111-000000000001')
on conflict (id) do nothing;

-- User score results (3 — untuk 2 staff + 1 manager)
insert into public.user_score_results (
  id, organization_id, period_snapshot_id, user_id, score_formula_version_id,
  result_kind, auto_calculated_score, manual_adjusted_score, is_current, metric_breakdown
) values
  ('66666666-bbbb-bbbb-bbbb-000000000001', (select id from _seed_org),
   '77777777-eeee-eeee-eeee-000000000001', '11111111-1111-1111-1111-000000000005',
   '66666666-ffff-ffff-ffff-000000000001', 'auto', 82.5, null, true,
   '{"EXECUTION": 85, "QUALITY": 80, "GOVERNANCE": 80}'::jsonb),
  ('66666666-bbbb-bbbb-bbbb-000000000002', (select id from _seed_org),
   '77777777-eeee-eeee-eeee-000000000001', '11111111-1111-1111-1111-000000000006',
   '66666666-ffff-ffff-ffff-000000000001', 'auto', 76.0, null, true,
   '{"EXECUTION": 70, "QUALITY": 80, "GOVERNANCE": 80}'::jsonb),
  ('66666666-bbbb-bbbb-bbbb-000000000003', (select id from _seed_org),
   '77777777-eeee-eeee-eeee-000000000001', '11111111-1111-1111-1111-000000000003',
   '66666666-ffff-ffff-ffff-000000000001', 'auto', 88.0, null, true,
   '{"EXECUTION": 90, "QUALITY": 85, "GOVERNANCE": 90}'::jsonb)
on conflict (id) do nothing;

-- Governance violation (1 — contoh self-approval attempt yang ter-block)
insert into public.governance_violations (
  id, organization_id, user_id, violation_type, entity_type, entity_id, detail, severity, resolution_status
) values
  ('66666666-cccc-cccc-cccc-000000000001', (select id from _seed_org),
   '11111111-1111-1111-1111-000000000005', 'self_approval_attempt', 'task',
   'cccccccc-cccc-cccc-cccc-000000000002',
   '{"note": "Staff mencoba approve submission miliknya sendiri (di-block trigger)"}'::jsonb,
   'low', 'open')
on conflict (id) do nothing;

-- =============================================================================
-- 6. CHAT & NOTIFICATIONS (ringan, agar inbox tidak kosong)
-- =============================================================================
-- Catatan: tabel chat_rooms punya trigger `action_plan_chat_room` yang auto-create
-- chat_room setiap kali action_plans di-insert — jadi kita UPDATE name-nya saja,
-- lalu tambahkan chat_room_members, chat_messages, dan notifications.

-- Rename chat_room auto-created untuk action_plan 'Launch Program Referral'
update public.chat_rooms cr set name = 'Diskusi Launch Program Referral'
from public.action_plans i
where cr.action_plan_id = i.id and i.id = '99999999-9999-9999-9999-000000000001';

-- Chat room members (PIC + manager untuk action_plan Launch Program Referral)
insert into public.chat_room_members (chat_room_id, member_id)
select cr.id, m.id
from public.chat_rooms cr
cross join (values
  ('11111111-1111-1111-1111-000000000003'::uuid),
  ('11111111-1111-1111-1111-000000000005'::uuid)
) as m(id)
where cr.action_plan_id = '99999999-9999-9999-9999-000000000001'
on conflict do nothing;

-- Chat messages (menggunakan chat_room_id dari trigger)
insert into public.chat_messages (id, organization_id, chat_room_id, author_id, body)
select '66666666-eeee-eeee-eeee-000000000001'::uuid,
       cr.organization_id,
       cr.id,
       '11111111-1111-1111-1111-000000000003'::uuid,
       'Mohon draft landing page paling lambat 10 Juli ya.'
from public.chat_rooms cr
where cr.action_plan_id = '99999999-9999-9999-9999-000000000001'
union all
select '66666666-eeee-eeee-eeee-000000000002'::uuid,
       cr.organization_id,
       cr.id,
       '11111111-1111-1111-1111-000000000005'::uuid,
       'Siap kak, draft sedang dibuat, design sudah disetujui marketing.'
from public.chat_rooms cr
where cr.action_plan_id = '99999999-9999-9999-9999-000000000001'
on conflict (id) do nothing;

insert into public.notifications (id, organization_id, recipient_id, actor_id, type, entity_type, entity_id, title, body, is_read)
values
  -- review_request instance: entity_type=task_instance + entity_id=instance (WS-3b).
  -- CTA "Review Sekarang" harus membuka layar instance e..002 (submission f..002 pending), bukan parent AP.
  ('66666666-ffff-ffff-ffff-000000000010', (select id from _seed_org),
   '11111111-1111-1111-1111-000000000003', '11111111-1111-1111-1111-000000000005',
   'review_request', 'task_instance', 'eeeeeeee-eeee-eeee-eeee-000000000002',
   'Review Submission Baru', 'Submission baru menunggu review kamu', false),
  ('66666666-ffff-ffff-ffff-000000000011', (select id from _seed_org),
   '11111111-1111-1111-1111-000000000005', '11111111-1111-1111-1111-000000000003',
   'approved', 'task_instance', 'eeeeeeee-eeee-eeee-eeee-000000000001',
   'Submission Disetujui', 'Submission basket size Senin disetujui', true)
on conflict (id) do nothing;

commit;

-- =============================================================================
-- Ringkasan (cek cepat)
-- =============================================================================
-- Setelah file ini jalan, coba query:
--   select email from auth.users where email like '%@rencan.local';
--   select count(*) from public.tasks;
--   select u.email, r.auto_calculated_score
--   from public.user_score_results r join auth.users u on u.id = r.user_id;
--
-- Login di app dengan kredensial apapun dari @rencan.local + password "rencan123".
