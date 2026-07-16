-- =============================================================================
-- RencanApp — Staging Multi-Account Seed
-- =============================================================================
-- 3 organisasi, ~16 user, hirarki card lengkap, data eksekusi.
-- Dijalankan via Supabase MCP execute_sql (remote staging).
-- Password semua user staging: "staging123"
--
-- Org 1: Nyantuy Group     (existing, F&B/retail)  — 6 user
-- Org 2: PT Mitra Logistik (new, logistics)        — 6 user
-- Org 3: Karya Digital     (new, tech agency)       — 4 user
-- =============================================================================

-- ============================================================================
-- PART 1: ORGANIZATIONS + ROLE TEMPLATES
-- ============================================================================

-- Org 2
INSERT INTO public.organizations (id, name)
VALUES ('a2000000-0000-0000-0000-000000000001', 'PT Mitra Logistik')
ON CONFLICT (id) DO NOTHING;

-- Org 3
INSERT INTO public.organizations (id, name)
VALUES ('a3000000-0000-0000-0000-000000000001', 'Karya Digital Indonesia')
ON CONFLICT (id) DO NOTHING;

-- Role templates for Org 2
INSERT INTO public.role_templates (id, organization_id, name, level, is_system)
VALUES
  ('b2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'CEO / Super Admin', 'ceo', true),
  ('b2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'C-Level', 'c_level', true),
  ('b2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'Management / Manager / Head', 'management', true),
  ('b2000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', 'Staff', 'staff', true)
ON CONFLICT (id) DO NOTHING;

-- Role templates for Org 3
INSERT INTO public.role_templates (id, organization_id, name, level, is_system)
VALUES
  ('b3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'CEO / Super Admin', 'ceo', true),
  ('b3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'C-Level', 'c_level', true),
  ('b3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001', 'Management / Manager / Head', 'management', true),
  ('b3000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000001', 'Staff', 'staff', true)
ON CONFLICT (id) DO NOTHING;

-- Permissions seed (idempotent — will skip if already seeded by migration)
INSERT INTO public.permissions (key, label)
SELECT x.key, x.label
FROM (VALUES
  ('create_goal', 'Membuat Goal'),
  ('create_kpi_area', 'Membuat KPI Area'),
  ('create_development_area', 'Membuat Development Area'),
  ('create_strategy', 'Membuat Strategy'),
  ('create_initiative', 'Membuat Initiative'),
  ('create_action_plan', 'Membuat Action Plan'),
  ('view_all_workspace', 'Lihat seluruh Workspace'),
  ('manage_others_cards', 'Kelola card orang lain'),
  ('manage_settings', 'Ubah Settings'),
  ('manage_users_permissions', 'Kelola User & Permission'),
  ('manage_goal_templates', 'Kelola Goal Template'),
  ('manage_kpi_area_templates', 'Kelola KPI Area Template'),
  ('manage_minimum_breakdown_rule', 'Kelola Minimum Breakdown Rule'),
  ('manage_card_completion_rule', 'Kelola Card Completion Rule'),
  ('view_activity_log', 'Lihat Activity Log'),
  ('view_governance_violation', 'Lihat Governance Violation'),
  ('manage_score_formula', 'Kelola Score Formula')
) AS x (key, label)
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- PART 2: AUTH USERS
-- ============================================================================
-- Org 1 (Nyantuy Group) — existing org ID: 9054981b-bb2f-492f-a471-d4f053ddcb1b
-- Existing users kept: aksalalsal23@gmail.com (CEO), qa-manager, qa-staff
-- New users:

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token, is_sso_user, is_anonymous
) VALUES
  -- === ORG 1 (Nyantuy) new users ===
  ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'coo@nyantuy.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Bayu Pratama"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mgr.ops@nyantuy.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Eko Saputro"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'staff.finance@nyantuy.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Gita Maharani"}'::jsonb, now(), now(), '', '', '', '', false, false),

  -- === ORG 2 (PT Mitra Logistik) ===
  ('a2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ceo@mitralogistik.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Andi Wijaya"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cfo@mitralogistik.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Sari Dewi"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mgr.warehouse@mitralogistik.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Budi Hartono"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a2000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'mgr.fleet@mitralogistik.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Rini Susanti"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a2000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'staff.admin@mitralogistik.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Dimas Prasetyo"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a2000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'driver@mitralogistik.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Teguh Prasetya"}'::jsonb, now(), now(), '', '', '', '', false, false),

  -- === ORG 3 (Karya Digital Indonesia) ===
  ('a3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'ceo@karyadigital.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Rizki Maulana"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'cto@karyadigital.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Ayu Lestari"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'pm@karyadigital.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Hendra Gunawan"}'::jsonb, now(), now(), '', '', '', '', false, false),

  ('a3000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dev@karyadigital.staging',
   extensions.crypt('staging123', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Nisa Putri"}'::jsonb, now(), now(), '', '', '', '', false, false)
ON CONFLICT (id) DO NOTHING;

-- Auth identities (required for email login on Supabase v2+)
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, u.email,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email LIKE '%@nyantuy.staging'
   OR u.email LIKE '%@mitralogistik.staging'
   OR u.email LIKE '%@karyadigital.staging'
ON CONFLICT DO NOTHING;


-- ============================================================================
-- PART 3: FIX PROFILES (org assignment + role + names)
-- ============================================================================
-- handle_new_user trigger puts ALL new users in org 1 as 'staff'.
-- We need to move org 2/3 users to their correct org + role.

-- Existing Org 1 users: fix names & roles
UPDATE public.profiles SET
  full_name = 'Dewi Anggraini',
  position_title = 'Sales Manager',
  role_template_id = '95ee80cf-819e-4d99-b8d8-61fa9208ac1b'  -- management
WHERE id = 'a0045162-6bbb-40d2-bce6-26117c847d3c';

UPDATE public.profiles SET
  full_name = 'Fajar Nugroho',
  position_title = 'Sales Executive'
WHERE id = '5cf33d55-5d20-4c53-84ae-55af17c1bbc4';

-- New Org 1 users: set correct names, positions, roles
UPDATE public.profiles SET
  full_name = 'Bayu Pratama', position_title = 'Chief Operating Officer',
  role_template_id = 'af0be9d2-579c-46b5-b492-6f52086267f7'  -- c_level
WHERE id = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.profiles SET
  full_name = 'Eko Saputro', position_title = 'Operations Manager',
  role_template_id = '95ee80cf-819e-4d99-b8d8-61fa9208ac1b'  -- management
WHERE id = 'a1000000-0000-0000-0000-000000000002';

UPDATE public.profiles SET
  full_name = 'Gita Maharani', position_title = 'Finance Staff'
WHERE id = 'a1000000-0000-0000-0000-000000000003';

-- Org 2 users: move to org 2 + set correct roles
UPDATE public.profiles SET
  organization_id = 'a2000000-0000-0000-0000-000000000001',
  full_name = 'Andi Wijaya', position_title = 'CEO',
  role_template_id = 'b2000000-0000-0000-0000-000000000001'  -- ceo
WHERE id = 'a2000000-0000-0000-0000-000000000001';

UPDATE public.profiles SET
  organization_id = 'a2000000-0000-0000-0000-000000000001',
  full_name = 'Sari Dewi', position_title = 'Chief Financial Officer',
  role_template_id = 'b2000000-0000-0000-0000-000000000002'  -- c_level
WHERE id = 'a2000000-0000-0000-0000-000000000002';

UPDATE public.profiles SET
  organization_id = 'a2000000-0000-0000-0000-000000000001',
  full_name = 'Budi Hartono', position_title = 'Warehouse Manager',
  role_template_id = 'b2000000-0000-0000-0000-000000000003'  -- management
WHERE id = 'a2000000-0000-0000-0000-000000000003';

UPDATE public.profiles SET
  organization_id = 'a2000000-0000-0000-0000-000000000001',
  full_name = 'Rini Susanti', position_title = 'Fleet Manager',
  role_template_id = 'b2000000-0000-0000-0000-000000000003'  -- management
WHERE id = 'a2000000-0000-0000-0000-000000000004';

UPDATE public.profiles SET
  organization_id = 'a2000000-0000-0000-0000-000000000001',
  full_name = 'Dimas Prasetyo', position_title = 'Admin Staff',
  role_template_id = 'b2000000-0000-0000-0000-000000000004'  -- staff
WHERE id = 'a2000000-0000-0000-0000-000000000005';

UPDATE public.profiles SET
  organization_id = 'a2000000-0000-0000-0000-000000000001',
  full_name = 'Teguh Prasetya', position_title = 'Driver Lead',
  role_template_id = 'b2000000-0000-0000-0000-000000000004'  -- staff
WHERE id = 'a2000000-0000-0000-0000-000000000006';

-- Org 3 users: move to org 3 + set correct roles
UPDATE public.profiles SET
  organization_id = 'a3000000-0000-0000-0000-000000000001',
  full_name = 'Rizki Maulana', position_title = 'CEO',
  role_template_id = 'b3000000-0000-0000-0000-000000000001'  -- ceo
WHERE id = 'a3000000-0000-0000-0000-000000000001';

UPDATE public.profiles SET
  organization_id = 'a3000000-0000-0000-0000-000000000001',
  full_name = 'Ayu Lestari', position_title = 'Chief Technology Officer',
  role_template_id = 'b3000000-0000-0000-0000-000000000002'  -- c_level
WHERE id = 'a3000000-0000-0000-0000-000000000002';

UPDATE public.profiles SET
  organization_id = 'a3000000-0000-0000-0000-000000000001',
  full_name = 'Hendra Gunawan', position_title = 'Project Manager',
  role_template_id = 'b3000000-0000-0000-0000-000000000003'  -- management
WHERE id = 'a3000000-0000-0000-0000-000000000003';

UPDATE public.profiles SET
  organization_id = 'a3000000-0000-0000-0000-000000000001',
  full_name = 'Nisa Putri', position_title = 'Frontend Developer',
  role_template_id = 'b3000000-0000-0000-0000-000000000004'  -- staff
WHERE id = 'a3000000-0000-0000-0000-000000000004';

-- Update CEO Nyantuy profile
UPDATE public.profiles SET
  full_name = 'CEO Nyantuy Group', position_title = 'CEO'
WHERE id = 'ca8c1471-b870-4f09-a149-25e5eae99d6f';


-- ============================================================================
-- PART 4: ORG STRUCTURE (Departments, Positions, Teams)
-- ============================================================================

-- === ORG 1 (Nyantuy Group) ===
INSERT INTO public.departments (id, organization_id, name, description, is_active)
VALUES
  ('d1000000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'Sales & Marketing', 'Pengelola revenue dan brand', true),
  ('d1000000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'Operations', 'Pengelola operasional harian', true),
  ('d1000000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'Finance', 'Pengelola keuangan dan kas', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.positions (id, organization_id, department_id, name, is_active)
VALUES
  ('10020000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'd1000000-0000-0000-0000-000000000001', 'Sales Manager', true),
  ('10020000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'd1000000-0000-0000-0000-000000000001', 'Sales Executive', true),
  ('10020000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'd1000000-0000-0000-0000-000000000002', 'Operations Manager', true),
  ('10020000-0000-0000-0000-000000000004', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'd1000000-0000-0000-0000-000000000003', 'Finance Staff', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.teams (id, organization_id, department_id, name, lead_id, is_active)
VALUES
  ('10030000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'd1000000-0000-0000-0000-000000000001', 'Tim Sales',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', true),
  ('10030000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'd1000000-0000-0000-0000-000000000002', 'Tim Operasional',
   'a1000000-0000-0000-0000-000000000002', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.team_members (id, team_id, profile_id, organization_id, role_in_team)
VALUES
  ('10040000-0000-0000-0000-000000000001', '10030000-0000-0000-0000-000000000001',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'lead'),
  ('10040000-0000-0000-0000-000000000002', '10030000-0000-0000-0000-000000000001',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'member'),
  ('10040000-0000-0000-0000-000000000003', '10030000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'lead'),
  ('10040000-0000-0000-0000-000000000004', '10030000-0000-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'member')
ON CONFLICT (team_id, profile_id) DO NOTHING;

-- === ORG 2 (PT Mitra Logistik) ===
INSERT INTO public.departments (id, organization_id, name, description, is_active)
VALUES
  ('d2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Warehouse', 'Manajemen gudang dan inventori', true),
  ('d2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'Fleet & Distribution', 'Armada dan distribusi', true),
  ('d2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'Admin & Finance', 'Administrasi dan keuangan', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.positions (id, organization_id, department_id, name, is_active)
VALUES
  ('20020000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Warehouse Manager', true),
  ('20020000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'Fleet Manager', true),
  ('20020000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', 'Driver Lead', true),
  ('20020000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000003', 'Admin Staff', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.teams (id, organization_id, department_id, name, lead_id, is_active)
VALUES
  ('20030000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'd2000000-0000-0000-0000-000000000001', 'Tim Gudang',
   'a2000000-0000-0000-0000-000000000003', true),
  ('20030000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   'd2000000-0000-0000-0000-000000000002', 'Tim Armada',
   'a2000000-0000-0000-0000-000000000004', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.team_members (id, team_id, profile_id, organization_id, role_in_team)
VALUES
  ('20040000-0000-0000-0000-000000000001', '20030000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001', 'lead'),
  ('20040000-0000-0000-0000-000000000002', '20030000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000001', 'member'),
  ('20040000-0000-0000-0000-000000000003', '20030000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001', 'lead'),
  ('20040000-0000-0000-0000-000000000004', '20030000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000001', 'member')
ON CONFLICT (team_id, profile_id) DO NOTHING;

-- === ORG 3 (Karya Digital) ===
INSERT INTO public.departments (id, organization_id, name, description, is_active)
VALUES
  ('d3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Engineering', 'Tim pengembangan software', true),
  ('d3000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'Product', 'Product management dan design', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.positions (id, organization_id, department_id, name, is_active)
VALUES
  ('30020000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000001', 'Frontend Developer', true),
  ('30020000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002', 'Project Manager', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.teams (id, organization_id, department_id, name, lead_id, is_active)
VALUES
  ('30030000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'd3000000-0000-0000-0000-000000000001', 'Squad Alpha',
   'a3000000-0000-0000-0000-000000000003', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.team_members (id, team_id, profile_id, organization_id, role_in_team)
VALUES
  ('30040000-0000-0000-0000-000000000001', '30030000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001', 'lead'),
  ('30040000-0000-0000-0000-000000000002', '30030000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000001', 'member')
ON CONFLICT (team_id, profile_id) DO NOTHING;


-- ============================================================================
-- PART 5: CARD HIERARCHY (Goals → KPI Areas → Strategies → Action Plans)
-- ============================================================================

-- === ORG 1 (Nyantuy Group) ===
INSERT INTO public.goals (id, organization_id, name, description, pic_id, period_start, period_end, status, target_value)
VALUES
  ('10050000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'Naikkan Omset Q3 2026', 'Fokus akuisisi customer baru dan basket size',
   'a1000000-0000-0000-0000-000000000001', '2026-07-01', '2026-09-30', 'active', 'Rp 2,5 Miliar'),
  ('10050000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'Tingkatkan Profit Margin Q3 2026', 'Optimasi biaya operasional dan kolektibilitas AR',
   'a1000000-0000-0000-0000-000000000001', '2026-07-01', '2026-09-30', 'active', '15% margin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.strategies (id, organization_id, goal_id, name, target, target_numeric, target_unit, pic_id, period_start, period_end, status)
VALUES
  ('10060000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10050000-0000-0000-0000-000000000001', 'Akuisisi Customer Baru',
   'Tambah 120 customer aktif', 120, 'customer',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', '2026-07-01', '2026-09-30', 'active'),
  ('10060000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10050000-0000-0000-0000-000000000001', 'Basket Size Rata-rata',
   'Naikkan ke Rp 350.000', 350000, 'rupiah',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', '2026-07-01', '2026-09-30', 'active'),
  ('10060000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10050000-0000-0000-0000-000000000002', 'Pengendalian Biaya Operasional',
   'Turun 8% dari baseline', 8, 'percent',
   'a1000000-0000-0000-0000-000000000002', '2026-07-01', '2026-09-30', 'active'),
  ('10060000-0000-0000-0000-000000000004', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10050000-0000-0000-0000-000000000002', 'Kolektibilitas AR',
   'Turunkan DSO ke 28 hari', 28, 'hari',
   'a1000000-0000-0000-0000-000000000003', '2026-07-01', '2026-09-30', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.initiatives (id, organization_id, strategy_id, name, reason, main_risk, alternative, pic_id, period_start, period_end, status)
VALUES
  ('10070000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10060000-0000-0000-0000-000000000001', 'Campaign Referral Customer Aktif',
   'Customer aktif adalah channel akuisisi paling murah', 'Reward tidak cukup menarik',
   'Bundle promo ke new customer', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   '2026-07-01', '2026-09-30', 'active'),
  ('10070000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10060000-0000-0000-0000-000000000002', 'Cross-sell Add-on ke Repeat Order',
   'Customer repeat lebih responsif ke add-on', 'Penolakan karena dianggap upselling agresif',
   'Halaman kedua checkout jika conversion turun >10%', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   '2026-07-01', '2026-09-30', 'active'),
  ('10070000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10060000-0000-0000-0000-000000000003', 'Standarkan Proses Shift Pagi & Malam',
   'Inkonsistensi shift penyebab boros bahan', 'Resistensi tim lama',
   'Lakukan per shift, mulai shift malam', 'a1000000-0000-0000-0000-000000000002',
   '2026-07-01', '2026-09-30', 'active'),
  ('10070000-0000-0000-0000-000000000004', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10060000-0000-0000-0000-000000000004', 'Reminder Piutang Bertahap',
   'Customer B2B sering terlambat bayar tanpa pengingat terstruktur', 'Intensitas terlalu tinggi bisa mengganggu',
   'Eskalasi ke email formal di hari ke-45 jika tidak direspons', 'a1000000-0000-0000-0000-000000000003',
   '2026-07-01', '2026-09-30', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.action_plans (id, organization_id, initiative_id, name, description, target_result, pic_id, period_start, period_end, status, created_by)
VALUES
  ('10080000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10070000-0000-0000-0000-000000000001', 'Launch Program Referral',
   'Buka program referral dengan reward Rp 50.000 untuk setiap konversi',
   '120 referral terkonversi dalam 90 hari', '5cf33d55-5d20-4c53-84ae-55af17c1bbc4',
   '2026-07-01', '2026-09-30', 'active', 'a0045162-6bbb-40d2-bce6-26117c847d3c'),
  ('10080000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10070000-0000-0000-0000-000000000002', 'Optimasi Checkout Page',
   'Tambah slot add-on di halaman kedua checkout',
   'Basket size naik ke Rp 350.000', '5cf33d55-5d20-4c53-84ae-55af17c1bbc4',
   '2026-07-01', '2026-09-30', 'active', 'a0045162-6bbb-40d2-bce6-26117c847d3c'),
  ('10080000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10070000-0000-0000-0000-000000000003', 'SOP Shift Pagi',
   'Tulis dan latih SOP shift pagi (06.00-14.00)',
   'Boros bahan turun 8%', 'a1000000-0000-0000-0000-000000000002',
   '2026-07-15', '2026-08-31', 'active', 'a1000000-0000-0000-0000-000000000002'),
  ('10080000-0000-0000-0000-000000000004', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10070000-0000-0000-0000-000000000004', 'Template Reminder Piutang H+5',
   '3 template reminder piutang bertahap (H+5, H+15, H+30)',
   'DSO turun ke 28 hari', 'a1000000-0000-0000-0000-000000000003',
   '2026-07-01', '2026-08-15', 'active', 'a1000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- === ORG 2 (PT Mitra Logistik) ===
INSERT INTO public.goals (id, organization_id, name, description, pic_id, period_start, period_end, status, target_value)
VALUES
  ('20050000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'Efisiensi Pengiriman Q3 2026', 'Optimalkan rute dan kurangi keterlambatan pengiriman',
   'a2000000-0000-0000-0000-000000000002', '2026-07-01', '2026-09-30', 'active', 'On-time delivery 95%'),
  ('20050000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   'Akurasi Inventory Q3 2026', 'Tingkatkan akurasi stok gudang dan kurangi shrinkage',
   'a2000000-0000-0000-0000-000000000002', '2026-07-01', '2026-09-30', 'active', 'Akurasi stok 99%')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.strategies (id, organization_id, goal_id, name, target, target_numeric, target_unit, pic_id, period_start, period_end, status)
VALUES
  ('20060000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   '20050000-0000-0000-0000-000000000001', 'On-time Delivery Rate',
   '95% pengiriman tepat waktu', 95, 'percent',
   'a2000000-0000-0000-0000-000000000004', '2026-07-01', '2026-09-30', 'active'),
  ('20060000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   '20050000-0000-0000-0000-000000000001', 'Biaya Bahan Bakar per KM',
   'Turunkan ke Rp 2.500/km', 2500, 'rupiah',
   'a2000000-0000-0000-0000-000000000004', '2026-07-01', '2026-09-30', 'active'),
  ('20060000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000001',
   '20050000-0000-0000-0000-000000000002', 'Stock Accuracy Rate',
   'Akurasi stok 99%', 99, 'percent',
   'a2000000-0000-0000-0000-000000000003', '2026-07-01', '2026-09-30', 'active'),
  ('20060000-0000-0000-0000-000000000004', 'a2000000-0000-0000-0000-000000000001',
   '20050000-0000-0000-0000-000000000002', 'Shrinkage Rate',
   'Shrinkage di bawah 0.5%', 0.5, 'percent',
   'a2000000-0000-0000-0000-000000000003', '2026-07-01', '2026-09-30', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.initiatives (id, organization_id, strategy_id, name, reason, main_risk, alternative, pic_id, period_start, period_end, status)
VALUES
  ('20070000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   '20060000-0000-0000-0000-000000000001', 'Optimasi Rute Pengiriman',
   'Rute manual menyebabkan jarak tempuh lebih jauh 15%', 'Driver enggan ubah rute yang sudah familiar',
   'Gunakan rute hybrid: GPS suggestion + override manual', 'a2000000-0000-0000-0000-000000000004',
   '2026-07-01', '2026-09-30', 'active'),
  ('20070000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   '20060000-0000-0000-0000-000000000003', 'Cycle Count Mingguan',
   'Stock opname bulanan terlalu jarang, selisih baru ketahuan akhir bulan',
   'Tambahan beban kerja di shift sibuk',
   'Cycle count zona prioritas dulu (fast-moving items)', 'a2000000-0000-0000-0000-000000000003',
   '2026-07-01', '2026-09-30', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.action_plans (id, organization_id, initiative_id, name, description, target_result, pic_id, period_start, period_end, status, created_by)
VALUES
  ('20080000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   '20070000-0000-0000-0000-000000000001', 'Pilot Rute GPS Jakut-Jaktim',
   'Uji coba optimasi rute GPS untuk 10 armada area Jakarta Utara-Timur',
   'Jarak tempuh turun 10%, on-time naik ke 95%', 'a2000000-0000-0000-0000-000000000006',
   '2026-07-01', '2026-08-31', 'active', 'a2000000-0000-0000-0000-000000000004'),
  ('20080000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   '20070000-0000-0000-0000-000000000002', 'SOP Cycle Count Zona A',
   'Implementasi cycle count mingguan untuk zona fast-moving items',
   'Akurasi stok zona A naik ke 99.5%', 'a2000000-0000-0000-0000-000000000005',
   '2026-07-01', '2026-08-31', 'active', 'a2000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- === ORG 3 (Karya Digital) ===
INSERT INTO public.goals (id, organization_id, name, description, pic_id, period_start, period_end, status, target_value)
VALUES
  ('30050000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'On-time Project Delivery Q3', 'Selesaikan semua project client sesuai timeline kontrak',
   'a3000000-0000-0000-0000-000000000002', '2026-07-01', '2026-09-30', 'active', '100% on-time'),
  ('30050000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   'Client Satisfaction Score Q3', 'Pertahankan CSAT di atas 4.5/5',
   'a3000000-0000-0000-0000-000000000002', '2026-07-01', '2026-09-30', 'active', 'CSAT 4.5+')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.strategies (id, organization_id, goal_id, name, target, target_numeric, target_unit, pic_id, period_start, period_end, status)
VALUES
  ('30060000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   '30050000-0000-0000-0000-000000000001', 'Sprint Velocity',
   'Rata-rata velocity 40 story points/sprint', 40, 'story points',
   'a3000000-0000-0000-0000-000000000003', '2026-07-01', '2026-09-30', 'active'),
  ('30060000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   '30050000-0000-0000-0000-000000000001', 'Bug Escape Rate',
   'Bug escape ke production < 2 per sprint', 2, 'bug',
   'a3000000-0000-0000-0000-000000000003', '2026-07-01', '2026-09-30', 'active'),
  ('30060000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001',
   '30050000-0000-0000-0000-000000000002', 'Response Time SLA',
   'Response ticket < 4 jam', 4, 'jam',
   'a3000000-0000-0000-0000-000000000003', '2026-07-01', '2026-09-30', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.initiatives (id, organization_id, strategy_id, name, reason, main_risk, alternative, pic_id, period_start, period_end, status)
VALUES
  ('30070000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   '30060000-0000-0000-0000-000000000001', 'Implementasi Code Review Wajib',
   'Merge tanpa review menyebabkan 60% bug escape', 'Bottleneck di reviewer tunggal',
   'Async review dengan SLA 4 jam', 'a3000000-0000-0000-0000-000000000003',
   '2026-07-01', '2026-09-30', 'active'),
  ('30070000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   '30060000-0000-0000-0000-000000000003', 'Setup Helpdesk Triage System',
   'Ticket sering hilang di Slack tanpa tracking', 'Learning curve tools baru',
   'Mulai dengan Google Form + Sheet sederhana', 'a3000000-0000-0000-0000-000000000003',
   '2026-07-01', '2026-08-31', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.action_plans (id, organization_id, initiative_id, name, description, target_result, pic_id, period_start, period_end, status, created_by)
VALUES
  ('30080000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   '30070000-0000-0000-0000-000000000001', 'Setup Branch Protection Rules',
   'Konfigurasi GitHub branch protection: require 1 approval, status checks pass',
   'Zero unreviewed merge ke main', 'a3000000-0000-0000-0000-000000000004',
   '2026-07-01', '2026-07-31', 'active', 'a3000000-0000-0000-0000-000000000003'),
  ('30080000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   '30070000-0000-0000-0000-000000000002', 'Deploy Helpdesk Portal',
   'Setup portal triage untuk ticket client dengan auto-assign dan SLA tracking',
   'Semua ticket ter-track dan response < 4 jam', 'a3000000-0000-0000-0000-000000000004',
   '2026-07-15', '2026-08-15', 'active', 'a3000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- PART 6: TASKS & EXECUTION (Org 1 detailed, Org 2-3 basic)
-- ============================================================================

-- === ORG 1 Tasks ===
INSERT INTO public.tasks (id, organization_id, action_plan_id, name, description, pic_id, reviewer_id,
  start_date, deadline, expected_output, definition_of_done, priority, repeat_setting,
  evidence_required, result_value_required, review_required, status, created_by)
VALUES
  ('10090000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10080000-0000-0000-0000-000000000001', 'Desain Landing Page Referral',
   'Buat landing page program referral dengan tracking UTM',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   '2026-07-05', '2026-07-15', 'Landing page live dengan form referral',
   'Halaman published, form tersubmit ke CRM, UTM aktif',
   'high', 'one_time', true, false, true, 'in_progress', 'a0045162-6bbb-40d2-bce6-26117c847d3c'),

  ('10090000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10080000-0000-0000-0000-000000000002', 'Report Basket Size Harian',
   'Submit basket size rata-rata harian tim sales',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   '2026-07-01', '2026-09-30', 'Basket size harian tercatat',
   'Submit nilai basket size via form sebelum jam 17.00',
   'medium', 'repeat', true, true, true, 'in_progress', 'a0045162-6bbb-40d2-bce6-26117c847d3c'),

  ('10090000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10080000-0000-0000-0000-000000000003', 'Briefing SOP Shift Pagi',
   'Briefing dan role-play SOP shift pagi ke seluruh tim',
   'a1000000-0000-0000-0000-000000000002', 'ca8c1471-b870-4f09-a149-25e5eae99d6f',
   '2026-08-01', '2026-08-10', 'SOP dipahami semua anggota',
   'Seluruh tim hadir, post-test minimal 70%',
   'high', 'one_time', true, false, true, 'assigned', 'a1000000-0000-0000-0000-000000000002'),

  ('10090000-0000-0000-0000-000000000004', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10080000-0000-0000-0000-000000000004', 'Kirim Reminder Piutang Harian',
   'Kirim reminder piutang H+5 ke customer jatuh tempo',
   'a1000000-0000-0000-0000-000000000003', 'ca8c1471-b870-4f09-a149-25e5eae99d6f',
   '2026-07-05', '2026-08-15', 'Customer diingatkan sebelum jatuh tempo',
   'Reminder terkirim ke semua customer B2B di hari kerja',
   'medium', 'repeat', true, true, true, 'in_progress', 'a1000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Repeat rules for Org 1
INSERT INTO public.task_repeat_rules (id, organization_id, task_id, frequency, weekdays,
  repeat_start_date, repeat_end_date, time_of_day, missed_rule, grace_period_minutes, created_by)
VALUES
  ('100a0000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10090000-0000-0000-0000-000000000002', 'weekly', array[1,2,3,4,5],
   '2026-07-01', '2026-09-30', '17:00:00', 'grace_period', 30,
   'a0045162-6bbb-40d2-bce6-26117c847d3c'),
  ('100a0000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10090000-0000-0000-0000-000000000004', 'weekly', array[1,2,3,4,5],
   '2026-07-05', '2026-08-15', '09:00:00', 'strict', null,
   'a1000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Task instances for Org 1
INSERT INTO public.task_instances (id, organization_id, task_id, repeat_rule_id,
  instance_date, instance_time, deadline_at, status, pic_id, reviewer_id, submitted_at, submitted_late)
VALUES
  ('100b0000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10090000-0000-0000-0000-000000000002', '100a0000-0000-0000-0000-000000000001',
   '2026-07-07', '17:00:00', '2026-07-07 17:30:00+07', 'done',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   '2026-07-07 16:50:00+07', false),
  ('100b0000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10090000-0000-0000-0000-000000000002', '100a0000-0000-0000-0000-000000000001',
   '2026-07-08', '17:00:00', '2026-07-08 17:30:00+07', 'submitted',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   '2026-07-08 17:10:00+07', false),
  ('100b0000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10090000-0000-0000-0000-000000000002', '100a0000-0000-0000-0000-000000000001',
   '2026-07-09', '17:00:00', '2026-07-09 17:30:00+07', 'assigned',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   null, false),
  ('100b0000-0000-0000-0000-000000000004', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10090000-0000-0000-0000-000000000004', '100a0000-0000-0000-0000-000000000002',
   '2026-07-07', '09:00:00', '2026-07-07 09:00:00+07', 'done',
   'a1000000-0000-0000-0000-000000000003', null,
   '2026-07-07 08:45:00+07', false)
ON CONFLICT (id) DO NOTHING;

-- Submissions for Org 1
INSERT INTO public.task_submissions (id, task_id, task_instance_id, version_number,
  submitted_by, submitted_at, note, review_status, reviewed_by, reviewed_at)
VALUES
  ('100c0000-0000-0000-0000-000000000001', '10090000-0000-0000-0000-000000000002',
   '100b0000-0000-0000-0000-000000000001', 1,
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', '2026-07-07 16:50:00+07',
   'Basket size Senin 7 Juli: Rp 358.000 (47 transaksi)', 'approved',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', '2026-07-07 18:00:00+07'),
  ('100c0000-0000-0000-0000-000000000002', '10090000-0000-0000-0000-000000000002',
   '100b0000-0000-0000-0000-000000000002', 1,
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', '2026-07-08 17:10:00+07',
   'Basket size Selasa 8 Juli: Rp 372.500 (52 transaksi)', 'pending',
   null, null)
ON CONFLICT (id) DO NOTHING;

-- Link current_submission_id
UPDATE public.task_instances SET current_submission_id = '100c0000-0000-0000-0000-000000000001'
WHERE id = '100b0000-0000-0000-0000-000000000001';
UPDATE public.task_instances SET current_submission_id = '100c0000-0000-0000-0000-000000000002'
WHERE id = '100b0000-0000-0000-0000-000000000002';

-- Evidence
INSERT INTO public.evidence_files (id, submission_id, kind, storage_path, file_name, mime_type, text_content, uploaded_by)
VALUES
  ('100d0000-0000-0000-0000-000000000001', '100c0000-0000-0000-0000-000000000001',
   'text_note', null, null, null,
   'Total order Senin 7 Juli: 47 transaksi, basket size rata-rata Rp 358.000. Naik 3% dari minggu lalu.',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4')
ON CONFLICT (id) DO NOTHING;

-- Review for approved submission
INSERT INTO public.reviews (id, task_id, submission_id, reviewer_id, decision, reason)
VALUES
  ('100e0000-0000-0000-0000-000000000001', '10090000-0000-0000-0000-000000000002',
   '100c0000-0000-0000-0000-000000000001', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   'approve', 'Data valid, tren naik. Lanjut besok ya.')
ON CONFLICT (id) DO NOTHING;

-- === ORG 2 Tasks ===
INSERT INTO public.tasks (id, organization_id, action_plan_id, name, description, pic_id, reviewer_id,
  start_date, deadline, expected_output, definition_of_done, priority, repeat_setting,
  evidence_required, result_value_required, review_required, status, created_by)
VALUES
  ('20090000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   '20080000-0000-0000-0000-000000000001', 'Log Jarak Tempuh Harian',
   'Catat jarak tempuh aktual vs rute GPS setiap hari',
   'a2000000-0000-0000-0000-000000000006', 'a2000000-0000-0000-0000-000000000004',
   '2026-07-01', '2026-08-31', 'Data jarak tempuh harian',
   'Log lengkap dengan foto odometer awal-akhir',
   'medium', 'repeat', true, true, true, 'in_progress', 'a2000000-0000-0000-0000-000000000004'),
  ('20090000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   '20080000-0000-0000-0000-000000000002', 'Cycle Count Zona A Minggu 1',
   'Hitung stok fisik untuk 50 SKU fast-moving di zona A',
   'a2000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000003',
   '2026-07-07', '2026-07-11', 'Laporan selisih stok',
   'Semua 50 SKU terhitung, selisih di-flag',
   'high', 'one_time', true, false, true, 'assigned', 'a2000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- === ORG 3 Tasks ===
INSERT INTO public.tasks (id, organization_id, action_plan_id, name, description, pic_id, reviewer_id,
  start_date, deadline, expected_output, definition_of_done, priority, repeat_setting,
  evidence_required, result_value_required, review_required, status, created_by)
VALUES
  ('30090000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   '30080000-0000-0000-0000-000000000001', 'Setup GitHub Branch Rules',
   'Konfigurasi branch protection di semua repo client',
   'a3000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000003',
   '2026-07-07', '2026-07-14', 'Branch protection aktif',
   'Require 1 approval + CI pass untuk merge ke main, tested di repo sandbox',
   'high', 'one_time', true, false, true, 'in_progress', 'a3000000-0000-0000-0000-000000000003'),
  ('30090000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001',
   '30080000-0000-0000-0000-000000000002', 'Riset Helpdesk Platform',
   'Evaluasi 3 platform helpdesk (Zendesk, Freshdesk, Crisp) untuk kebutuhan client',
   'a3000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000003',
   '2026-07-15', '2026-07-25', 'Dokumen perbandingan platform',
   'Matrix fitur vs harga lengkap, rekomendasi 1 platform',
   'medium', 'one_time', false, false, true, 'assigned', 'a3000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- PART 7: DEVELOPMENT AREAS + PROBLEM STATEMENTS
-- ============================================================================

-- Org 1
INSERT INTO public.development_areas (id, organization_id, name, description, pic_id, period_start, period_end, status, created_by)
VALUES
  ('10110000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'Pelatihan Negosiasi Tim Sales', 'Workshop 2 hari teknik negosiasi value-based',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', '2026-08-01', '2026-08-31', 'active',
   'a0045162-6bbb-40d2-bce6-26117c847d3c'),
  ('10110000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'Sertifikasi ERP Finance', 'Pelatihan dan ujian sertifikasi ERP',
   'a1000000-0000-0000-0000-000000000003', '2026-07-15', '2026-08-15', 'active',
   'a1000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.problem_statements (id, organization_id, development_area_id, name, description, impact, initial_evidence, pic_id, status, period_start, period_end, created_by)
VALUES
  ('10120000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10110000-0000-0000-0000-000000000001', 'Churn Customer 15% YoY',
   'Pelanggan berhenti repeat order dalam 90 hari', 'high',
   'Data CRM: 87 dari 580 customer baru Q1 tidak repeat di Q2',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', 'active', '2026-07-01', '2026-09-30',
   'a0045162-6bbb-40d2-bce6-26117c847d3c')
ON CONFLICT (id) DO NOTHING;

-- Org 2
INSERT INTO public.development_areas (id, organization_id, name, description, pic_id, period_start, period_end, status, created_by)
VALUES
  ('20110000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'Training GPS & Route Optimization', 'Pelatihan penggunaan sistem GPS untuk seluruh driver',
   'a2000000-0000-0000-0000-000000000004', '2026-07-15', '2026-08-15', 'active',
   'a2000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- PART 8: SCORING & GOVERNANCE
-- ============================================================================

-- Period snapshot — all 3 orgs
INSERT INTO public.period_snapshots (id, organization_id, period_name, period_start, period_end, status, created_by)
VALUES
  ('10130000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'Q3 2026', '2026-07-01', '2026-09-30', 'active', 'ca8c1471-b870-4f09-a149-25e5eae99d6f'),
  ('20130000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'Q3 2026', '2026-07-01', '2026-09-30', 'active', 'a2000000-0000-0000-0000-000000000001'),
  ('30130000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'Q3 2026', '2026-07-01', '2026-09-30', 'active', 'a3000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Score formula templates (1 per org, staff level)
INSERT INTO public.score_formula_templates (id, organization_id, name, level, is_default, created_by)
VALUES
  ('10140000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'Formula Standar Staff Q3', 'staff', true, 'ca8c1471-b870-4f09-a149-25e5eae99d6f'),
  ('20140000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'Formula Staff Logistik Q3', 'staff', true, 'a2000000-0000-0000-0000-000000000001'),
  ('30140000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'Formula Staff Digital Q3', 'staff', true, 'a3000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Score formula versions
INSERT INTO public.score_formula_versions (id, template_id, version_number, level, organization_id, status, categories, effective_date, change_reason, created_by, approved_by, activated_at)
VALUES
  ('10150000-0000-0000-0000-000000000001', '10140000-0000-0000-0000-000000000001',
   1, 'staff', '9054981b-bb2f-492f-a471-d4f053ddcb1b', 'active',
   '[{"code":"EXECUTION","label":"Eksekusi Action Plan","weight":50,"source_metric":"task_completion"},
     {"code":"QUALITY","label":"Kualitas Hasil","weight":30,"source_metric":"review_pass_rate"},
     {"code":"GOVERNANCE","label":"Disiplin Governance","weight":20,"source_metric":"governance_discipline"}]'::jsonb,
   '2026-07-01', 'Formula awal Q3 2026',
   'ca8c1471-b870-4f09-a149-25e5eae99d6f', 'ca8c1471-b870-4f09-a149-25e5eae99d6f', '2026-07-01 09:00:00+07'),
  ('20150000-0000-0000-0000-000000000001', '20140000-0000-0000-0000-000000000001',
   1, 'staff', 'a2000000-0000-0000-0000-000000000001', 'active',
   '[{"code":"EXECUTION","label":"Eksekusi Tugas","weight":40,"source_metric":"task_completion"},
     {"code":"QUALITY","label":"Akurasi Data","weight":35,"source_metric":"review_pass_rate"},
     {"code":"GOVERNANCE","label":"Kepatuhan SOP","weight":25,"source_metric":"governance_discipline"}]'::jsonb,
   '2026-07-01', 'Formula awal logistik Q3',
   'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', '2026-07-01 09:00:00+07'),
  ('30150000-0000-0000-0000-000000000001', '30140000-0000-0000-0000-000000000001',
   1, 'staff', 'a3000000-0000-0000-0000-000000000001', 'active',
   '[{"code":"EXECUTION","label":"Delivery Sprint","weight":45,"source_metric":"task_completion"},
     {"code":"QUALITY","label":"Code Quality","weight":35,"source_metric":"review_pass_rate"},
     {"code":"GOVERNANCE","label":"Process Compliance","weight":20,"source_metric":"governance_discipline"}]'::jsonb,
   '2026-07-01', 'Formula awal digital Q3',
   'a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', '2026-07-01 09:00:00+07')
ON CONFLICT (id) DO NOTHING;

-- Score formula assignments (org-wide staff)
INSERT INTO public.score_formula_assignments (id, organization_id, formula_version_id, scope_level, role_level, start_date, assigned_by)
VALUES
  ('10160000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10150000-0000-0000-0000-000000000001', 'org_role', 'staff', '2026-07-01', 'ca8c1471-b870-4f09-a149-25e5eae99d6f'),
  ('20160000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   '20150000-0000-0000-0000-000000000001', 'org_role', 'staff', '2026-07-01', 'a2000000-0000-0000-0000-000000000001'),
  ('30160000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   '30150000-0000-0000-0000-000000000001', 'org_role', 'staff', '2026-07-01', 'a3000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- User score results (staff users only)
INSERT INTO public.user_score_results (id, organization_id, period_snapshot_id, user_id,
  score_formula_version_id, result_kind, auto_calculated_score, manual_adjusted_score, is_current, metric_breakdown)
VALUES
  -- Org 1: Fajar (sales exec)
  ('10170000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10130000-0000-0000-0000-000000000001', '5cf33d55-5d20-4c53-84ae-55af17c1bbc4',
   '10150000-0000-0000-0000-000000000001', 'auto', 84.5, null, true,
   '{"EXECUTION": 88, "QUALITY": 82, "GOVERNANCE": 80}'::jsonb),
  -- Org 1: Gita (finance)
  ('10170000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '10130000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
   '10150000-0000-0000-0000-000000000001', 'auto', 78.0, null, true,
   '{"EXECUTION": 75, "QUALITY": 80, "GOVERNANCE": 80}'::jsonb),
  -- Org 2: Dimas (admin)
  ('20170000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   '20130000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000005',
   '20150000-0000-0000-0000-000000000001', 'auto', 72.0, null, true,
   '{"EXECUTION": 70, "QUALITY": 75, "GOVERNANCE": 70}'::jsonb),
  -- Org 2: Teguh (driver)
  ('20170000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000001',
   '20130000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000006',
   '20150000-0000-0000-0000-000000000001', 'auto', 88.5, null, true,
   '{"EXECUTION": 90, "QUALITY": 88, "GOVERNANCE": 85}'::jsonb),
  -- Org 3: Nisa (dev)
  ('30170000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   '30130000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000004',
   '30150000-0000-0000-0000-000000000001', 'auto', 91.0, null, true,
   '{"EXECUTION": 92, "QUALITY": 90, "GOVERNANCE": 90}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Governance violation (Org 1 — self-approval attempt)
INSERT INTO public.governance_violations (id, organization_id, user_id, violation_type, entity_type, entity_id, detail, severity, resolution_status)
VALUES
  ('10180000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', 'self_approval_attempt', 'task',
   '10090000-0000-0000-0000-000000000002',
   '{"note": "Staff mencoba approve submission miliknya sendiri (di-block trigger)"}'::jsonb,
   'low', 'open')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- PART 9: CHAT & NOTIFICATIONS
-- ============================================================================
-- Chat rooms are auto-created by trigger when action_plans are inserted.
-- We add members, messages, and notifications.

-- Org 1: Chat room members for 'Launch Program Referral'
INSERT INTO public.chat_room_members (chat_room_id, member_id)
SELECT cr.id, m.uid
FROM public.chat_rooms cr
CROSS JOIN (VALUES
  ('a0045162-6bbb-40d2-bce6-26117c847d3c'::uuid),
  ('5cf33d55-5d20-4c53-84ae-55af17c1bbc4'::uuid),
  ('a1000000-0000-0000-0000-000000000001'::uuid)
) AS m(uid)
WHERE cr.action_plan_id = '10080000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- Org 1: Chat messages
INSERT INTO public.chat_messages (id, organization_id, chat_room_id, author_id, body)
SELECT '10190000-0000-0000-0000-000000000001'::uuid,
       cr.organization_id, cr.id,
       'a0045162-6bbb-40d2-bce6-26117c847d3c'::uuid,
       'Landing page referral harus ready sebelum 15 Juli ya. Fokus ke flow registrasi yang simpel.'
FROM public.chat_rooms cr
WHERE cr.action_plan_id = '10080000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chat_messages (id, organization_id, chat_room_id, author_id, body)
SELECT '10190000-0000-0000-0000-000000000002'::uuid,
       cr.organization_id, cr.id,
       '5cf33d55-5d20-4c53-84ae-55af17c1bbc4'::uuid,
       'Siap kak! Draft wireframe sudah selesai, minta review ya. UTM tracking sudah disetup di GA4.'
FROM public.chat_rooms cr
WHERE cr.action_plan_id = '10080000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chat_messages (id, organization_id, chat_room_id, author_id, body)
SELECT '10190000-0000-0000-0000-000000000003'::uuid,
       cr.organization_id, cr.id,
       'a1000000-0000-0000-0000-000000000001'::uuid,
       'Bagus. Pastikan reward structure-nya jelas di landing page. CEO minta laporan referral mingguan juga.'
FROM public.chat_rooms cr
WHERE cr.action_plan_id = '10080000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Org 2: Chat room members for 'Pilot Rute GPS'
INSERT INTO public.chat_room_members (chat_room_id, member_id)
SELECT cr.id, m.uid
FROM public.chat_rooms cr
CROSS JOIN (VALUES
  ('a2000000-0000-0000-0000-000000000004'::uuid),
  ('a2000000-0000-0000-0000-000000000006'::uuid)
) AS m(uid)
WHERE cr.action_plan_id = '20080000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_messages (id, organization_id, chat_room_id, author_id, body)
SELECT '20190000-0000-0000-0000-000000000001'::uuid,
       cr.organization_id, cr.id,
       'a2000000-0000-0000-0000-000000000004'::uuid,
       'Teguh, mulai hari ini pakai rute GPS untuk area Jakut-Jaktim. Log jarak tempuh di form harian.'
FROM public.chat_rooms cr
WHERE cr.action_plan_id = '20080000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chat_messages (id, organization_id, chat_room_id, author_id, body)
SELECT '20190000-0000-0000-0000-000000000002'::uuid,
       cr.organization_id, cr.id,
       'a2000000-0000-0000-0000-000000000006'::uuid,
       'Siap bu, tapi rute ke Cakung lewat tol atau bawah? GPS suggest tol tapi biayanya besar.'
FROM public.chat_rooms cr
WHERE cr.action_plan_id = '20080000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- Org 3: Chat room members for 'Setup Branch Rules'
INSERT INTO public.chat_room_members (chat_room_id, member_id)
SELECT cr.id, m.uid
FROM public.chat_rooms cr
CROSS JOIN (VALUES
  ('a3000000-0000-0000-0000-000000000003'::uuid),
  ('a3000000-0000-0000-0000-000000000004'::uuid)
) AS m(uid)
WHERE cr.action_plan_id = '30080000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

INSERT INTO public.chat_messages (id, organization_id, chat_room_id, author_id, body)
SELECT '30190000-0000-0000-0000-000000000001'::uuid,
       cr.organization_id, cr.id,
       'a3000000-0000-0000-0000-000000000003'::uuid,
       'Nisa, branch protection udah di-set di repo sandbox. Coba test buat PR tanpa reviewer, harusnya ke-block.'
FROM public.chat_rooms cr
WHERE cr.action_plan_id = '30080000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- === NOTIFICATIONS ===
INSERT INTO public.notifications (id, organization_id, recipient_id, actor_id, type, entity_type, entity_id, title, body, is_read)
VALUES
  -- Org 1: Review request
  ('101a0000-0000-0000-0000-000000000001', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'a0045162-6bbb-40d2-bce6-26117c847d3c', '5cf33d55-5d20-4c53-84ae-55af17c1bbc4',
   'review_request', 'task_instance', '100b0000-0000-0000-0000-000000000002',
   'Review Submission Baru', 'Fajar Nugroho mengirim submission basket size 8 Juli', false),
  -- Org 1: Approved notification
  ('101a0000-0000-0000-0000-000000000002', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   '5cf33d55-5d20-4c53-84ae-55af17c1bbc4', 'a0045162-6bbb-40d2-bce6-26117c847d3c',
   'approved', 'task_instance', '100b0000-0000-0000-0000-000000000001',
   'Submission Disetujui', 'Submission basket size 7 Juli disetujui Dewi', true),
  -- Org 1: Deadline reminder
  ('101a0000-0000-0000-0000-000000000003', '9054981b-bb2f-492f-a471-d4f053ddcb1b',
   'a1000000-0000-0000-0000-000000000002', null,
   'deadline_reminder', 'action_plan', '10080000-0000-0000-0000-000000000003',
   'Deadline Mendekat', 'Action Plan "SOP Shift Pagi" deadline 31 Agustus', false),
  -- Org 2: Task assigned
  ('201a0000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000005', 'a2000000-0000-0000-0000-000000000003',
   'repeat_due', 'task', '20090000-0000-0000-0000-000000000002',
   'Tugas Baru', 'Kamu ditugaskan untuk Cycle Count Zona A Minggu 1', false),
  -- Org 3: Review request
  ('301a0000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000004',
   'review_request', 'task', '30090000-0000-0000-0000-000000000001',
   'Review Progress', 'Nisa meminta review progress setup branch protection', false)
ON CONFLICT (id) DO NOTHING;
