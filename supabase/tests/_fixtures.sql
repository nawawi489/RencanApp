-- =============================================================================
-- RencanApp — Canonical CI fixtures for DB contract tests (_fixtures.sql)
-- =============================================================================
-- WHY THIS FILE EXISTS
--   The pre-0045 contract tests (0017, 0018, 0020, 0038, fase3, fase5, fase6,
--   fase7, fase8) were authored to run via Supabase MCP `execute_sql` against
--   the REMOTE dev project `fhnqwytqprsptjshoxfn`. They hardcode that project's
--   "dev constants" — an organization, a CEO user, and two role templates — and
--   assume those rows already exist. None of them are created by the migrations
--   (they are tenant data, not schema), so on a fresh CI database the tests fail
--   with FK / "seed … missing" errors before asserting anything.
--
--   This prelude seeds exactly those hardcoded rows so every legacy test runs
--   unchanged against a freshly-reset CI database. It is applied AFTER
--   `supabase db reset` and BEFORE the test loop (see
--   scripts/ci/run-db-contract-tests.sh).
--
-- INVARIANTS THIS FILE MUST PRESERVE
--   • Idempotent — safe to re-run (ON CONFLICT everywhere).
--   • EVERY `auth.users` INSERT must name its organization explicitly via
--     `raw_app_meta_data.organization_id`. Since migration 0083 (BL-14),
--     `handle_new_user()` REFUSES to guess: with more than one organization in
--     the database and no explicit id, it raises. This file creates two orgs
--     (shared + DCR-05), so the "oldest org wins" fallback it used to rely on is
--     no longer available here — and a failure in this prelude is FATAL to the
--     whole contract suite (see scripts/ci/run-db-contract-tests.sh).
--   • The shared org keeps its `created_at = 'epoch'` pin. It no longer decides
--     placement, but tests and seeds elsewhere still reason about org ordering,
--     so the pin stays to keep that ordering deterministic.
--   • System catalog rows the tests also depend on (permissions, role guidance,
--     minimum_breakdown_rules, score-formula system, card_guidance_contents,
--     goal_templates) are already created BY THE MIGRATIONS — do NOT duplicate
--     them here.
--
-- RUN (local, against the docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/_fixtures.sql
-- =============================================================================

begin;
set local row_security = off;
set local search_path = public, auth, extensions;

-- ---------------------------------------------------------------------------
-- 1. Shared organization (used by 0017, 0018, 0020, fase3, fase5-8).
--    created_at pinned to epoch → oldest org → handle_new_user default.
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, created_at, timezone) values
  ('4b07a19f-550d-4952-b0d8-44f38f651d89', 'Contract Fixtures Org',
   'epoch'::timestamptz, 'Asia/Jakarta')
on conflict (id) do update
  set created_at = 'epoch'::timestamptz, name = excluded.name;

-- Role templates for the shared org, with the EXACT UUIDs the legacy tests
-- hardcode (staff 06771d3b…, c_level 3d831bd8…) plus a CEO-level template for
-- the CEO fixture profile.
insert into public.role_templates (id, organization_id, name, level, is_system) values
  ('06771d3b-8d83-442d-a343-1d6248c43f53', '4b07a19f-550d-4952-b0d8-44f38f651d89', 'Staff',   'staff',   true),
  ('3d831bd8-b728-4be6-8551-09ac3697cada', '4b07a19f-550d-4952-b0d8-44f38f651d89', 'C-Level', 'c_level', true),
  ('4b07ce00-0000-0000-0000-0000000000ce', '4b07a19f-550d-4952-b0d8-44f38f651d89', 'CEO',     'ceo',     true)
on conflict (id) do update
  set organization_id = excluded.organization_id, level = excluded.level;

-- CEO user (ca8c1471…). app_metadata carries BOTH the explicit organization_id
-- (required since 0083 — this file creates two orgs) and role_level='ceo', so
-- handle_new_user provisions the profile in the shared org with the CEO role
-- template without any follow-up UPDATE.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  'ca8c1471-b870-4f09-a149-25e5eae99d6f', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'ceo@fixtures.local',
  crypt('rencan123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"role_level":"ceo","organization_id":"4b07a19f-550d-4952-b0d8-44f38f651d89"}'::jsonb,
  '{"full_name":"CEO Fixture"}'::jsonb, now(), now(), '', '', '', ''
) on conflict (id) do nothing;

-- Force the CEO profile onto the shared org + CEO role. Still needed despite the
-- explicit organization_id above: the `on conflict (id) do nothing` on auth.users
-- means a re-run does NOT re-fire the trigger, so a profile left behind by an
-- older revision of this file would otherwise keep its stale org/role.
insert into public.profiles (id, organization_id, role_template_id, full_name, email, is_active) values
  ('ca8c1471-b870-4f09-a149-25e5eae99d6f', '4b07a19f-550d-4952-b0d8-44f38f651d89',
   '4b07ce00-0000-0000-0000-0000000000ce', 'CEO Fixture', 'ceo@fixtures.local', true)
on conflict (id) do update
  set organization_id  = excluded.organization_id,
      role_template_id = excluded.role_template_id,
      is_active        = true;

-- ---------------------------------------------------------------------------
-- 2. DCR-05 org + actors (0038 only — a distinct org/CEO/reviewer).
--    created_at slightly after the epoch so the shared org stays oldest.
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, created_at, timezone) values
  ('52b0ebe1-d8bd-466d-b491-526ee6518b70', 'DCR-05 Fixtures Org',
   'epoch'::timestamptz + interval '1 second', 'Asia/Jakarta')
on conflict (id) do update
  set created_at = 'epoch'::timestamptz + interval '1 second', name = excluded.name;

insert into public.role_templates (id, organization_id, name, level, is_system) values
  ('52b0ce00-0000-0000-0000-0000000000ce', '52b0ebe1-d8bd-466d-b491-526ee6518b70', 'CEO',   'ceo',   true),
  ('52b0f5af-0000-0000-0000-0000000005af', '52b0ebe1-d8bd-466d-b491-526ee6518b70', 'Staff', 'staff', true)
on conflict (id) do update
  set organization_id = excluded.organization_id, level = excluded.level;

-- DCR-05 CEO/actor (…0001) and extra reviewer (…0003).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('11111111-1111-1111-1111-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dcr.ceo@fixtures.local',
   crypt('rencan123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role_level":"ceo","organization_id":"52b0ebe1-d8bd-466d-b491-526ee6518b70"}'::jsonb,
   '{"full_name":"DCR CEO"}'::jsonb, now(), now(), '', '', '', ''),
  ('11111111-1111-1111-1111-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'dcr.reviewer@fixtures.local',
   crypt('rencan123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"organization_id":"52b0ebe1-d8bd-466d-b491-526ee6518b70"}'::jsonb,
   '{"full_name":"DCR Reviewer"}'::jsonb, now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into public.profiles (id, organization_id, role_template_id, full_name, email, is_active) values
  ('11111111-1111-1111-1111-000000000001', '52b0ebe1-d8bd-466d-b491-526ee6518b70',
   '52b0ce00-0000-0000-0000-0000000000ce', 'DCR CEO', 'dcr.ceo@fixtures.local', true),
  ('11111111-1111-1111-1111-000000000003', '52b0ebe1-d8bd-466d-b491-526ee6518b70',
   '52b0f5af-0000-0000-0000-0000000005af', 'DCR Reviewer', 'dcr.reviewer@fixtures.local', true)
on conflict (id) do update
  set organization_id  = excluded.organization_id,
      role_template_id = excluded.role_template_id,
      is_active        = true;

commit;
