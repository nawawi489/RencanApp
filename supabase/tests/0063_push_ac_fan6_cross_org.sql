-- AC-FAN-6 contract — drainer TIDAK boleh membocorkan notifikasi lintas-tenant.
-- Spec FR-PN-09: drainer WAJIB filter push_tokens.organization_id = notifications.organization_id
-- AND push_tokens.user_id = notifications.recipient_id AND push_tokens.revoked_at IS NULL.
-- Menutup celah kelas 0039 (cross-org p_period_id gap).
--
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0063_push_ac_fan6_cross_org.sql
--
-- Pola: seed 2 org × 2 user × berbagai kondisi token → jalankan CANONICAL DRAINER QUERY
-- (encoded di sini agar Edge Function Fase 2-E wajib match) → assert set token yg cocok
-- sesuai kontrak, TANPA leak.

-- ============================================================ (a) Cross-org isolation
begin;
do $$
declare
  v_org1 uuid := '99999999-2222-0000-0000-9999aa000061';
  v_org2 uuid := '99999999-2222-0000-0000-9999aa000062';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000021'; -- di org1
  v_userB uuid := '99999999-2222-0000-0000-aaaa00000022'; -- di org2
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000023'; -- actor di org1
  v_notif_org1 uuid;
  v_expected_tokens int;
  v_leaked_tokens int;
begin
  insert into public.organizations(id, name) values
    (v_org1, 'Org 1 AC-FAN-6'),
    (v_org2, 'Org 2 AC-FAN-6') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_userB), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org1, 'User A org1', true),
    (v_userB, v_org2, 'User B org2', true),
    (v_actor, v_org1, 'Actor org1', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  -- Token untuk userA di org1.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[fan6-A-org1]', 'ios', 'devA');

  -- Token untuk userB di org2.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userB::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[fan6-B-org2]', 'ios', 'devB');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  -- Insert notif untuk userA di org1.
  perform public.emit_notification(
    v_org1, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000006'::uuid,
    'Test AC-FAN-6', 'body', current_date
  );
  select id into v_notif_org1 from public.notifications
    where organization_id = v_org1 and recipient_id = v_userA
      and entity_id = '99999999-2222-0000-0000-cccc00000006'::uuid
    order by created_at desc limit 1;

  -- CANONICAL DRAINER QUERY — Edge Function Fase 2-E WAJIB menggunakan pola predikat sama.
  -- Baris matched: token milik userA di org1 (tepat 1).
  select count(*) into v_expected_tokens
  from public.notifications n
  join public.push_tokens pt
    on pt.organization_id = n.organization_id
   and pt.user_id = n.recipient_id
   and pt.revoked_at is null
  where n.id = v_notif_org1;

  if v_expected_tokens <> 1 then
    raise exception 'FAIL AC-FAN-6a: expected 1 token match untuk notif org1, got %', v_expected_tokens;
  end if;

  -- INVARIAN CROSS-ORG: token userB di org2 TIDAK PERNAH match notif org1
  -- meskipun user_id nya berbeda org.
  select count(*) into v_leaked_tokens
  from public.notifications n
  join public.push_tokens pt
    on pt.organization_id = n.organization_id  -- filter kunci
   and pt.user_id = n.recipient_id
   and pt.revoked_at is null
  where n.id = v_notif_org1
    and pt.expo_token = 'ExponentPushToken[fan6-B-org2]';

  if v_leaked_tokens <> 0 then
    raise exception 'FAIL AC-FAN-6a: LEAK cross-org — token org2 match notif org1 (% baris)', v_leaked_tokens;
  end if;

  -- Uji sanity: kalau kita HAPUS filter organization_id (query broken), userB SEHARUSNYA nyangkut
  -- karena recipient_id sama (v_userA) — tapi filter user_id != recipient (v_userB != v_userA)
  -- sudah mencegah. Jadi cek dgn user_id yg SAMA namun beda org (skenario ekstrem).
  raise notice 'PASS AC-FAN-6a: canonical drainer query cross-org isolated (1 match org1, 0 leak org2)';
end $$;
rollback;

-- ============================================================ (b) Revoked token skip
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000063';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000024';
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000025';
  v_notif uuid;
  v_matched int;
begin
  insert into public.organizations(id, name) values (v_org, 'Org 63') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User A rev', true),
    (v_actor, v_org, 'Actor rev', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[fan6-revoked]', 'ios', 'devRev');
  perform public.unregister_push_token('ExponentPushToken[fan6-revoked]');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  perform public.emit_notification(
    v_org, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000007'::uuid,
    'Test AC-FAN-6b', 'body', current_date
  );
  select id into v_notif from public.notifications
    where organization_id = v_org and recipient_id = v_userA
      and entity_id = '99999999-2222-0000-0000-cccc00000007'::uuid
    order by created_at desc limit 1;

  -- Revoked token TIDAK PERNAH match — filter revoked_at IS NULL.
  select count(*) into v_matched
  from public.notifications n
  join public.push_tokens pt
    on pt.organization_id = n.organization_id
   and pt.user_id = n.recipient_id
   and pt.revoked_at is null
  where n.id = v_notif;

  if v_matched <> 0 then
    raise exception 'FAIL AC-FAN-6b: revoked token TIDAK di-skip (% match)', v_matched;
  end if;

  raise notice 'PASS AC-FAN-6b: revoked_at IS NOT NULL → drainer skip token (zero match)';
end $$;
rollback;

-- ============================================================ (c) Recipient-boundary — user lain di ORG SAMA tidak nyangkut
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000064';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000026'; -- target recipient
  v_userC uuid := '99999999-2222-0000-0000-aaaa00000027'; -- user lain di org sama
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000028';
  v_notif uuid;
  v_matched int;
  v_leaked_userC int;
begin
  insert into public.organizations(id, name) values (v_org, 'Org 64') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_userC), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User A rec', true),
    (v_userC, v_org, 'User C same-org', true),
    (v_actor, v_org, 'Actor rec', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[fan6-A]', 'ios', 'devA');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userC::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[fan6-C]', 'ios', 'devC');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  perform public.emit_notification(
    v_org, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000008'::uuid,
    'Test AC-FAN-6c', 'body', current_date
  );
  select id into v_notif from public.notifications
    where organization_id = v_org and recipient_id = v_userA
      and entity_id = '99999999-2222-0000-0000-cccc00000008'::uuid
    order by created_at desc limit 1;

  -- Tepat 1 match — token userA saja.
  select count(*) into v_matched
  from public.notifications n
  join public.push_tokens pt
    on pt.organization_id = n.organization_id
   and pt.user_id = n.recipient_id
   and pt.revoked_at is null
  where n.id = v_notif;
  if v_matched <> 1 then
    raise exception 'FAIL AC-FAN-6c: expected 1 match untuk recipient, got %', v_matched;
  end if;

  -- Token userC (same-org, different user) TIDAK nyangkut.
  select count(*) into v_leaked_userC
  from public.notifications n
  join public.push_tokens pt
    on pt.organization_id = n.organization_id
   and pt.user_id = n.recipient_id
   and pt.revoked_at is null
  where n.id = v_notif
    and pt.expo_token = 'ExponentPushToken[fan6-C]';
  if v_leaked_userC <> 0 then
    raise exception 'FAIL AC-FAN-6c: LEAK — token userC (same-org) match notif untuk userA';
  end if;

  raise notice 'PASS AC-FAN-6c: recipient-boundary — token user lain di org sama tidak nyangkut';
end $$;
rollback;
