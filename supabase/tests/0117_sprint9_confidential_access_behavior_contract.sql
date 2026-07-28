-- Sprint 9 S9-4 — Perilaku (bukan regex atas sumber) untuk klausa confidential
-- pada `can_access_goal` / `can_access_strategy` / `can_access_initiative`.
--
-- Motivasi (audit 2026-07-26):
--   * 0077 T4-T6 memakai `pg_get_functiondef(...) like '%confidential_access_rules%'`.
--     Cek ini lolos meski implementasinya WRONG: fungsi bisa saja MENYEBUT tabel di
--     komentar, di cabang mati, atau membalik gerbangnya, dan tetap match substring.
--   * Sprint 9 S9-4 mengharuskan tes menjalankan fungsi dan memeriksa BARIS HASIL.
--
-- Pola ini pendamping (bukan pengganti) untuk 0077 T4-T6 saat ini. Setelah stabil,
-- 0077 T4-T6 boleh dilucuti; regresi apa pun akan ditangkap di sini karena mengubah
-- semantik akses akan mengubah nilai boolean yang di-return.
--
-- ID dev lokal: org=52b0ebe1-…b70, ceo=11111111-…001. Konvensi org kedua = aaaaaaaa-*.
-- Jalankan: docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0117_sprint9_confidential_access_behavior_contract.sql

-- ============================================================ T9-4-1: can_access_goal — non-CEO tanpa rule → false; dgn rule → true
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_role_staff uuid;
  v_staff uuid := '99999999-9400-0000-0000-000000000001';
  v_goal_conf uuid;
  v_can boolean;
  fails text := '';
begin
  select id into v_role_staff
    from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  if v_role_staff is null then
    raise exception 'T9-4-1 SETUP FAIL: role_templates staff seed missing';
  end if;

  -- Staff biasa (bukan CEO, bukan PIC goal).
  insert into auth.users (id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_staff, v_org, v_role_staff, 'Uji T9-4 staff')
    on conflict (id) do update
      set organization_id = excluded.organization_id,
          role_template_id = excluded.role_template_id;

  -- Goal confidential — pic bukan v_staff.
  insert into public.goals
    (organization_id, name, status, pic_id, created_by)
    values (v_org, 'T9-4 goal confidential', 'active', v_ceo, v_ceo)
    returning id into v_goal_conf;

  -- Rule confidential DIPASANG untuk goal ini, tapi TIDAK memuat v_staff.
  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'goal', v_goal_conf, v_ceo, v_ceo)
    on conflict do nothing;

  -- Jalankan sebagai v_staff — HARUS false (tidak di allowlist, bukan CEO, bukan PIC).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.can_access_goal(v_goal_conf) into v_can;
  execute 'reset role';

  if v_can is distinct from false then
    fails := fails || 'staff_without_rule_can_access:got=' || coalesce(v_can::text, 'null') || '; ';
  end if;

  -- Sekarang tambahkan v_staff ke allowlist confidential.
  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'goal', v_goal_conf, v_staff, v_ceo)
    on conflict do nothing;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.can_access_goal(v_goal_conf) into v_can;
  execute 'reset role';

  if v_can is distinct from true then
    fails := fails || 'staff_with_rule_denied:got=' || coalesce(v_can::text, 'null') || '; ';
  end if;

  -- Jalankan sebagai CEO — HARUS true (bypass allowlist).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.can_access_goal(v_goal_conf) into v_can;
  execute 'reset role';

  if v_can is distinct from true then
    fails := fails || 'ceo_denied:got=' || coalesce(v_can::text, 'null') || '; ';
  end if;

  if fails <> '' then raise exception 'T9-4-1 FAIL: %', fails; end if;
  raise notice 'T9-4-1 can_access_goal confidential behavior PASS';
end $$;
rollback;

-- ============================================================ T9-4-2: can_access_strategy — pola identik untuk strategi
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_role_staff uuid;
  v_staff uuid := '99999999-9400-0000-0000-000000000002';
  v_goal_parent uuid;
  v_strategy_conf uuid;
  v_can boolean;
  fails text := '';
begin
  select id into v_role_staff
    from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  if v_role_staff is null then
    raise exception 'T9-4-2 SETUP FAIL: role_templates staff seed missing';
  end if;

  insert into auth.users (id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_staff, v_org, v_role_staff, 'Uji T9-4-2 staff')
    on conflict (id) do update
      set organization_id = excluded.organization_id,
          role_template_id = excluded.role_template_id;

  insert into public.goals
    (organization_id, name, status, pic_id, created_by)
    values (v_org, 'T9-4-2 goal parent', 'active', v_ceo, v_ceo)
    returning id into v_goal_parent;

  insert into public.strategies
    (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal_parent, 'T9-4-2 strategy conf', 'active', v_ceo, v_ceo)
    returning id into v_strategy_conf;

  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'strategy', v_strategy_conf, v_ceo, v_ceo)
    on conflict do nothing;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.can_access_strategy(v_strategy_conf) into v_can;
  execute 'reset role';
  if v_can is distinct from false then
    fails := fails || 'staff_without_rule_can_access:got=' || coalesce(v_can::text, 'null') || '; ';
  end if;

  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'strategy', v_strategy_conf, v_staff, v_ceo)
    on conflict do nothing;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.can_access_strategy(v_strategy_conf) into v_can;
  execute 'reset role';
  if v_can is distinct from true then
    fails := fails || 'staff_with_rule_denied:got=' || coalesce(v_can::text, 'null') || '; ';
  end if;

  if fails <> '' then raise exception 'T9-4-2 FAIL: %', fails; end if;
  raise notice 'T9-4-2 can_access_strategy confidential behavior PASS';
end $$;
rollback;

-- ============================================================ T9-4-3: can_access_initiative — pola identik untuk initiative
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_role_staff uuid;
  v_staff uuid := '99999999-9400-0000-0000-000000000003';
  v_goal_parent uuid;
  v_strategy_parent uuid;
  v_initiative_conf uuid;
  v_can boolean;
  fails text := '';
begin
  select id into v_role_staff
    from public.role_templates where organization_id = v_org and level = 'staff' limit 1;

  insert into auth.users (id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_staff, v_org, v_role_staff, 'Uji T9-4-3 staff')
    on conflict (id) do update
      set organization_id = excluded.organization_id,
          role_template_id = excluded.role_template_id;

  insert into public.goals (organization_id, name, status, pic_id, created_by)
    values (v_org, 'T9-4-3 goal', 'active', v_ceo, v_ceo)
    returning id into v_goal_parent;
  insert into public.strategies (organization_id, goal_id, name, status, pic_id, created_by)
    values (v_org, v_goal_parent, 'T9-4-3 strategy', 'active', v_ceo, v_ceo)
    returning id into v_strategy_parent;
  insert into public.initiatives (organization_id, strategy_id, name, status, pic_id, created_by)
    values (v_org, v_strategy_parent, 'T9-4-3 initiative conf', 'active', v_ceo, v_ceo)
    returning id into v_initiative_conf;

  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'initiative', v_initiative_conf, v_ceo, v_ceo)
    on conflict do nothing;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.can_access_initiative(v_initiative_conf) into v_can;
  execute 'reset role';
  if v_can is distinct from false then
    fails := fails || 'staff_without_rule_can_access:got=' || coalesce(v_can::text, 'null') || '; ';
  end if;

  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'initiative', v_initiative_conf, v_staff, v_ceo)
    on conflict do nothing;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.can_access_initiative(v_initiative_conf) into v_can;
  execute 'reset role';
  if v_can is distinct from true then
    fails := fails || 'staff_with_rule_denied:got=' || coalesce(v_can::text, 'null') || '; ';
  end if;

  if fails <> '' then raise exception 'T9-4-3 FAIL: %', fails; end if;
  raise notice 'T9-4-3 can_access_initiative confidential behavior PASS';
end $$;
rollback;
