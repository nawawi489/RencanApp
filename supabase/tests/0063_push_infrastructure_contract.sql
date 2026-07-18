-- Migration 0063 contract test — Push Notifications Fase 2 server infrastructure.
--
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0060_push_infrastructure_contract.sql
--
-- Pola: raise notice 'PASS …' / raise exception 'FAIL: …'.
-- Cakupan awal (Fase 2-A, tables + RLS + FK + index):
--   (a) push_tokens DDL + kolom + tipe + constraint
--   (b) push_tokens RLS enabled + SELECT own-row + revoke DML
--   (c) push_tokens FK convention: profiles bukan auth.users
--   (d) push_tokens unique(expo_token) + partial index user_id where revoked_at is null
--   (e) push_deliveries DDL + kolom retry (attempts, next_attempt_at) + status enum
--   (f) push_deliveries RLS enabled + zero policy client + revoke DML dari public/anon/authenticated
--   (g) push_deliveries unique(notification_id, push_token_id) + FK
--
-- Blok berikutnya (Fase 2-B/C/D/F) akan menambah (h..z) dalam file yang sama:
--   register_push_token / unregister_push_token signature + idempotency + anti-hijack
--   is_push_worthy fail-closed
--   AC-FAN-4 isolasi kegagalan (file terpisah)
--   AC-FAN-6 lintas-tenant (file terpisah)
--   pg_net + pg_cron + vault (file terpisah)

-- ============================================================ (a) push_tokens DDL + kolom
do $$
declare fails text := '';
begin
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='push_tokens') then
    raise exception 'FAIL a: push_tokens table missing';
  end if;

  -- Kolom wajib per spec §6 FR-PN-01. organization_id CRITICAL — drainer AC-FAN-9 filter butuh ini.
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='id'
      and data_type='uuid') then fails := fails || 'id_missing_or_wrong_type; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='organization_id'
      and data_type='uuid' and is_nullable='NO') then fails := fails || 'organization_id_missing_or_nullable; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='user_id'
      and data_type='uuid' and is_nullable='NO') then fails := fails || 'user_id_missing_or_nullable; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='expo_token'
      and data_type='text' and is_nullable='NO') then fails := fails || 'expo_token_missing_or_nullable; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='platform'
      and data_type='text' and is_nullable='NO') then fails := fails || 'platform_missing_or_nullable; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='device_id'
      and data_type='text') then fails := fails || 'device_id_missing; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='created_at') then
      fails := fails || 'created_at_missing; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='updated_at') then
      fails := fails || 'updated_at_missing; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_tokens' and column_name='revoked_at') then
      fails := fails || 'revoked_at_missing; '; end if;

  -- Platform CHECK: hanya 'ios'/'android'. 'web' tidak diizinkan (Expo Push tak support).
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='push_tokens_platform_check') then
    fails := fails || 'platform_check_missing; ';
  end if;

  if fails <> '' then raise exception 'FAIL a: push_tokens DDL — %', fails; end if;
  raise notice 'PASS a: push_tokens DDL kolom + platform CHECK ok';
end $$;

-- ============================================================ (b) push_tokens RLS + SELECT own-row + revoke DML
do $$
declare
  v_rls_on boolean;
  v_select_policy_count int;
  v_write_policy_count int;
  v_write_privs text := '';
begin
  select relrowsecurity into v_rls_on
  from pg_class where relname='push_tokens' and relnamespace='public'::regnamespace;
  if not v_rls_on then raise exception 'FAIL b: push_tokens RLS not enabled'; end if;

  -- Tepat 1 policy SELECT untuk own-row (organization + user match).
  select count(*) into v_select_policy_count
  from pg_policies where schemaname='public' and tablename='push_tokens' and cmd='SELECT';
  if v_select_policy_count <> 1 then
    raise exception 'FAIL b: push_tokens SELECT policy count = %, expected 1', v_select_policy_count;
  end if;

  -- Nol policy untuk INSERT/UPDATE/DELETE — semua tulis lewat RPC SECURITY DEFINER.
  select count(*) into v_write_policy_count
  from pg_policies where schemaname='public' and tablename='push_tokens' and cmd in ('INSERT','UPDATE','DELETE');
  if v_write_policy_count <> 0 then
    raise exception 'FAIL b: push_tokens must not have INSERT/UPDATE/DELETE policies (got %)', v_write_policy_count;
  end if;

  -- Grant check: TIDAK ada INSERT/UPDATE/DELETE utk authenticated/anon.
  select string_agg(privilege_type || ':' || grantee, ',') into v_write_privs
  from information_schema.role_table_grants
  where table_schema='public' and table_name='push_tokens'
    and grantee in ('authenticated','anon','public')
    and privilege_type in ('INSERT','UPDATE','DELETE');
  if v_write_privs is not null then
    raise exception 'FAIL b: push_tokens DML tidak di-revoke: %', v_write_privs;
  end if;

  raise notice 'PASS b: push_tokens RLS + SELECT own-row + DML revoked';
end $$;

-- ============================================================ (c) FK convention: public.profiles bukan auth.users
do $$
declare
  v_org_fk text;
  v_user_fk text;
begin
  -- push_tokens.organization_id → public.organizations
  select ccu.table_schema || '.' || ccu.table_name into v_org_fk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
  where tc.table_schema='public' and tc.table_name='push_tokens'
    and tc.constraint_type='FOREIGN KEY' and kcu.column_name='organization_id';
  if v_org_fk is null or v_org_fk <> 'public.organizations' then
    raise exception 'FAIL c: push_tokens.organization_id FK = %, expected public.organizations', coalesce(v_org_fk, 'NULL');
  end if;

  -- push_tokens.user_id → public.profiles (BUKAN auth.users; konvensi seluruh repo)
  select ccu.table_schema || '.' || ccu.table_name into v_user_fk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
  where tc.table_schema='public' and tc.table_name='push_tokens'
    and tc.constraint_type='FOREIGN KEY' and kcu.column_name='user_id';
  if v_user_fk is null or v_user_fk <> 'public.profiles' then
    raise exception 'FAIL c: push_tokens.user_id FK = %, expected public.profiles', coalesce(v_user_fk, 'NULL');
  end if;

  raise notice 'PASS c: push_tokens FK ke public.organizations + public.profiles';
end $$;

-- ============================================================ (d) push_tokens indexes: unique expo_token + partial user
do $$
declare
  v_unique_expo boolean;
  v_partial_user boolean;
begin
  select exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='push_tokens'
      and indexdef ilike '%CREATE UNIQUE INDEX%(expo_token)%'
  ) into v_unique_expo;
  if not v_unique_expo then raise exception 'FAIL d: push_tokens unique(expo_token) index missing'; end if;

  -- Partial index: WHERE revoked_at IS NULL → drainer scan cepat token aktif.
  select exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='push_tokens'
      and indexdef ilike '%(user_id)%'
      and indexdef ilike '%WHERE (revoked_at IS NULL)%'
  ) into v_partial_user;
  if not v_partial_user then raise exception 'FAIL d: push_tokens partial idx (user_id) where revoked_at is null missing'; end if;

  raise notice 'PASS d: push_tokens indexes (unique expo_token + partial user_id)';
end $$;

-- ============================================================ (e) push_deliveries DDL + retry kolom + status enum
do $$
declare fails text := '';
begin
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='push_deliveries') then
    raise exception 'FAIL e: push_deliveries table missing';
  end if;

  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='notification_id'
      and data_type='uuid' and is_nullable='NO') then fails := fails || 'notification_id_missing_or_nullable; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='push_token_id'
      and data_type='uuid' and is_nullable='NO') then fails := fails || 'push_token_id_missing_or_nullable; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='status'
      and data_type='text' and is_nullable='NO') then fails := fails || 'status_missing_or_nullable; '; end if;

  -- Retry kolom (owner decision terkunci) — exponential backoff via next_attempt_at + cap attempts.
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='attempts'
      and data_type='integer' and is_nullable='NO') then fails := fails || 'attempts_missing_or_nullable; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='next_attempt_at'
      and is_nullable='NO') then fails := fails || 'next_attempt_at_missing_or_nullable; '; end if;

  -- Kolom observability drainer: ticket + receipt + error.
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='provider_ticket_id') then
      fails := fails || 'provider_ticket_id_missing; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='provider_receipt_id') then
      fails := fails || 'provider_receipt_id_missing; '; end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='push_deliveries' and column_name='error') then
      fails := fails || 'error_missing; '; end if;

  -- status CHECK: 5 nilai spec §6.
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='push_deliveries_status_check') then
    fails := fails || 'status_check_missing; ';
  end if;

  if fails <> '' then raise exception 'FAIL e: push_deliveries DDL — %', fails; end if;
  raise notice 'PASS e: push_deliveries DDL + retry kolom + status CHECK ok';
end $$;

-- ============================================================ (f) push_deliveries RLS + zero policy + DML fully revoked
do $$
declare
  v_rls_on boolean;
  v_any_policy int;
  v_grants text := '';
begin
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='push_deliveries') then
    raise exception 'FAIL f: push_deliveries table missing (guard di blok e seharusnya sudah stop, tapi safety net)';
  end if;
  select relrowsecurity into v_rls_on
  from pg_class where relname='push_deliveries' and relnamespace='public'::regnamespace;
  if coalesce(v_rls_on, false) = false then raise exception 'FAIL f: push_deliveries RLS not enabled (defense-in-depth wajib)'; end if;

  -- ZERO policy — hanya SERVICE_ROLE bypass yang boleh akses.
  select count(*) into v_any_policy
  from pg_policies where schemaname='public' and tablename='push_deliveries';
  if v_any_policy <> 0 then
    raise exception 'FAIL f: push_deliveries harus TANPA policy (got % policies)', v_any_policy;
  end if;

  -- Grant: TIDAK ada SELECT/INSERT/UPDATE/DELETE untuk authenticated/anon/public.
  select string_agg(privilege_type || ':' || grantee, ',') into v_grants
  from information_schema.role_table_grants
  where table_schema='public' and table_name='push_deliveries'
    and grantee in ('authenticated','anon','public');
  if v_grants is not null then
    raise exception 'FAIL f: push_deliveries grants ke authenticated/anon/public tidak di-revoke: %', v_grants;
  end if;

  raise notice 'PASS f: push_deliveries RLS on + zero policy + zero grant client';
end $$;

-- ============================================================ (g) push_deliveries unique + FK
do $$
declare
  v_unique boolean;
  v_notif_fk text;
  v_token_fk text;
begin
  select exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='push_deliveries'
      and indexdef ilike '%CREATE UNIQUE INDEX%(notification_id, push_token_id)%'
  ) into v_unique;
  if not v_unique then
    raise exception 'FAIL g: push_deliveries unique(notification_id, push_token_id) missing';
  end if;

  select ccu.table_schema || '.' || ccu.table_name into v_notif_fk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
  where tc.table_schema='public' and tc.table_name='push_deliveries'
    and tc.constraint_type='FOREIGN KEY' and kcu.column_name='notification_id';
  if v_notif_fk is null or v_notif_fk <> 'public.notifications' then
    raise exception 'FAIL g: push_deliveries.notification_id FK = %, expected public.notifications', coalesce(v_notif_fk, 'NULL');
  end if;

  select ccu.table_schema || '.' || ccu.table_name into v_token_fk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name=tc.constraint_name and kcu.table_schema=tc.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema
  where tc.table_schema='public' and tc.table_name='push_deliveries'
    and tc.constraint_type='FOREIGN KEY' and kcu.column_name='push_token_id';
  if v_token_fk is null or v_token_fk <> 'public.push_tokens' then
    raise exception 'FAIL g: push_deliveries.push_token_id FK = %, expected public.push_tokens', coalesce(v_token_fk, 'NULL');
  end if;

  raise notice 'PASS g: push_deliveries unique + FK ke notifications & push_tokens';
end $$;

-- ============================================================ (h) RPC signature: register/unregister exist
do $$
declare
  v_reg_args text;
  v_unreg_args text;
begin
  select pg_get_function_identity_arguments(oid) into v_reg_args
  from pg_proc where proname='register_push_token' and pronamespace='public'::regnamespace;
  if v_reg_args is null then raise exception 'FAIL h: register_push_token missing'; end if;
  if v_reg_args not ilike '%p_expo_token text%' or v_reg_args not ilike '%p_platform text%' or v_reg_args not ilike '%p_device_id text%' then
    raise exception 'FAIL h: register_push_token args = %, expected (p_expo_token text, p_platform text, p_device_id text)', v_reg_args;
  end if;

  select pg_get_function_identity_arguments(oid) into v_unreg_args
  from pg_proc where proname='unregister_push_token' and pronamespace='public'::regnamespace;
  if v_unreg_args is null then raise exception 'FAIL h: unregister_push_token missing'; end if;
  if v_unreg_args not ilike '%p_expo_token text%' then
    raise exception 'FAIL h: unregister_push_token args = %, expected (p_expo_token text)', v_unreg_args;
  end if;

  raise notice 'PASS h: register_push_token + unregister_push_token signatures ok';
end $$;

-- ============================================================ (i) RPC security: SECURITY DEFINER + search_path=''
do $$
declare
  v_reg_secdef boolean; v_reg_path text;
  v_unreg_secdef boolean; v_unreg_path text;
begin
  select prosecdef, coalesce(array_to_string(proconfig, ','), '') into v_reg_secdef, v_reg_path
  from pg_proc where proname='register_push_token' and pronamespace='public'::regnamespace;
  if v_reg_secdef is null then raise exception 'FAIL i: register_push_token missing (proc not found)'; end if;
  if not v_reg_secdef then raise exception 'FAIL i: register_push_token bukan SECURITY DEFINER'; end if;
  if v_reg_path not ilike '%search_path=%' then
    raise exception 'FAIL i: register_push_token tidak set search_path (proconfig=%)', v_reg_path;
  end if;

  select prosecdef, coalesce(array_to_string(proconfig, ','), '') into v_unreg_secdef, v_unreg_path
  from pg_proc where proname='unregister_push_token' and pronamespace='public'::regnamespace;
  if v_unreg_secdef is null then raise exception 'FAIL i: unregister_push_token missing (proc not found)'; end if;
  if not v_unreg_secdef then raise exception 'FAIL i: unregister_push_token bukan SECURITY DEFINER'; end if;
  if v_unreg_path not ilike '%search_path=%' then
    raise exception 'FAIL i: unregister_push_token tidak set search_path (proconfig=%)', v_unreg_path;
  end if;

  raise notice 'PASS i: kedua RPC SECURITY DEFINER + search_path pinned';
end $$;

-- ============================================================ (j) Idempotent register — 2 panggilan same expo_token → 1 row
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000001';
  v_token text := 'ExponentPushToken[j-idempotent-test]';
  v_count int;
  v_platform_after text;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active)
    values (v_userA, v_org, 'User-A idempotent', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);

  perform public.register_push_token(v_token, 'ios', 'device-1');
  -- Panggilan kedua: byte-for-byte upsert. Bebas efek — verifikasi via count & platform.
  perform public.register_push_token(v_token, 'android', 'device-1');

  select count(*), platform into v_count, v_platform_after
  from public.push_tokens where expo_token = v_token group by platform;
  if v_count <> 1 then raise exception 'FAIL j: idempotent violated — % rows for same expo_token', v_count; end if;
  if v_platform_after <> 'android' then
    raise exception 'FAIL j: platform tidak update ke ''android'' (got %)', v_platform_after;
  end if;

  raise notice 'PASS j: register idempotent (1 row) + field update (platform android)';
end $$;
rollback;

-- ============================================================ (k) unregister sets revoked_at (idempotent)
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000002';
  v_token text := 'ExponentPushToken[k-unregister-test]';
  v_revoked_at timestamptz;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active)
    values (v_userA, v_org, 'User-A unregister', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);

  perform public.register_push_token(v_token, 'android', null);
  perform public.unregister_push_token(v_token);

  select revoked_at into v_revoked_at from public.push_tokens where expo_token = v_token;
  if v_revoked_at is null then raise exception 'FAIL k: revoked_at masih null pasca unregister'; end if;

  -- Idempotent: unregister lagi tidak error (silent no-op karena revoked_at sudah set).
  perform public.unregister_push_token(v_token);
  raise notice 'PASS k: unregister set revoked_at + idempotent';
end $$;
rollback;

-- ============================================================ (l) Anti-hijack transfer + audit write_activity + NO expo_token leak
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000003';
  v_userB uuid := '99999999-2222-0000-0000-aaaa00000004';
  v_token text := 'ExponentPushToken[l-hijack-test]';
  v_owner uuid;
  v_audit_count int;
  v_audit_detail jsonb;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_userB) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User-A hijack', true),
    (v_userB, v_org, 'User-B hijack', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  -- User A registers token first.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token(v_token, 'ios', 'device-shared');

  -- User B (different actor) registers SAME token → transfer + audit + rate-limit check.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userB::text, 'role','authenticated')::text, true);
  perform public.register_push_token(v_token, 'ios', 'device-shared');

  -- Ownership pindah.
  select user_id into v_owner from public.push_tokens where expo_token = v_token;
  if v_owner <> v_userB then raise exception 'FAIL l: token TIDAK transfer ke User-B (owner=%)', v_owner; end if;

  -- Audit row tercatat.
  select count(*), (array_agg(detail order by created_at desc))[1]
    into v_audit_count, v_audit_detail
  from public.activity_logs
  where action = 'push_token_transferred' and actor_id = v_userB;
  if v_audit_count < 1 then raise exception 'FAIL l: audit push_token_transferred TIDAK tercatat'; end if;

  -- CRITICAL: detail JSON TIDAK PERNAH mengandung expo_token (owner decision — leak guard).
  if v_audit_detail ? 'expo_token' then
    raise exception 'FAIL l: LEAK — detail audit mengandung expo_token: %', v_audit_detail;
  end if;

  -- Detail wajib berisi from_user_id, to_user_id, device_id, platform.
  if not (v_audit_detail ? 'from_user_id' and v_audit_detail ? 'to_user_id'
          and v_audit_detail ? 'device_id' and v_audit_detail ? 'platform') then
    raise exception 'FAIL l: detail audit kurang key wajib: %', v_audit_detail;
  end if;

  raise notice 'PASS l: anti-hijack transfer + audit tercatat + zero expo_token leak';
end $$;
rollback;

-- ============================================================ (m) Rate-limit anti-hijack: 3 transfer/24h → transfer ke-4 raise
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000005';
  v_userB uuid := '99999999-2222-0000-0000-aaaa00000006';
  v_i int;
  v_raised boolean := false;
  v_sqlstate text;
  v_msg text;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_userB) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User-A rl', true),
    (v_userB, v_org, 'User-B rl', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  -- 4 token berbeda, semua diregister User-A pertama.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  for v_i in 1..4 loop
    perform public.register_push_token('ExponentPushToken[m-rl-' || v_i || ']', 'ios', 'device-m-' || v_i);
  end loop;

  -- User-B transfer 3 pertama sukses.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userB::text, 'role','authenticated')::text, true);
  for v_i in 1..3 loop
    begin
      perform public.register_push_token('ExponentPushToken[m-rl-' || v_i || ']', 'ios', 'device-m-' || v_i);
    exception when others then
      raise exception 'FAIL m: transfer #% seharusnya sukses tapi raise % (%)', v_i, SQLERRM, SQLSTATE;
    end;
  end loop;

  -- Transfer ke-4 wajib raise ratelimit_exceeded (SQLSTATE '54000' program_limit_exceeded).
  begin
    perform public.register_push_token('ExponentPushToken[m-rl-4]', 'ios', 'device-m-4');
    v_raised := false;
  exception when others then
    v_raised := true;
    v_sqlstate := SQLSTATE;
    v_msg := SQLERRM;
  end;

  if not v_raised then
    raise exception 'FAIL m: transfer ke-4 seharusnya raise ratelimit_exceeded';
  end if;
  if v_sqlstate <> '54000' then
    raise exception 'FAIL m: SQLSTATE = % (msg=%), expected 54000 program_limit_exceeded', v_sqlstate, v_msg;
  end if;
  if v_msg not ilike '%coba lagi besok%' then
    raise exception 'FAIL m: pesan error tidak cocok kontrak (%), expected mengandung ''coba lagi besok''', v_msg;
  end if;

  raise notice 'PASS m: rate-limit 3/24h + SQLSTATE 54000 + pesan ID';
end $$;
rollback;

-- ============================================================ (n) Platform format validation
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000007';
  v_raised boolean := false;
  v_sqlstate text;
  v_msg text;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active)
    values (v_userA, v_org, 'User-A n', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);

  -- Platform 'web' tidak didukung Expo Push → raise (CHECK constraint push_tokens_platform_check).
  begin
    perform public.register_push_token('ExponentPushToken[n-web]', 'web', null);
    v_raised := false;
  exception when others then
    v_raised := true;
    v_sqlstate := SQLSTATE;
    v_msg := SQLERRM;
  end;
  if not v_raised then raise exception 'FAIL n: platform ''web'' seharusnya di-reject'; end if;
  -- Tolak false-positive: kalau SQLSTATE '42883' (undefined_function) berarti RPC belum ada, bukan validasi format.
  if v_sqlstate = '42883' then
    raise exception 'FAIL n: register_push_token tidak ada — RED phase (msg=%)', v_msg;
  end if;

  raise notice 'PASS n: platform format validation';
end $$;
rollback;

-- ============================================================ (o) is_push_worthy(p_type, p_org) signature + security
do $$
declare
  v_args text; v_secdef boolean; v_stable char; v_path text;
begin
  select pg_get_function_identity_arguments(oid), prosecdef, provolatile,
         coalesce(array_to_string(proconfig, ','), '')
    into v_args, v_secdef, v_stable, v_path
  from pg_proc where proname='is_push_worthy' and pronamespace='public'::regnamespace;
  if v_args is null then raise exception 'FAIL o: is_push_worthy missing'; end if;
  if v_args not ilike '%p_type text%' then
    raise exception 'FAIL o: is_push_worthy args = %, expected (p_type text[, p_org uuid])', v_args;
  end if;
  if not v_secdef then raise exception 'FAIL o: is_push_worthy bukan SECURITY DEFINER'; end if;
  if v_stable <> 's' then raise exception 'FAIL o: is_push_worthy volatilitas = %, expected STABLE (s)', v_stable; end if;
  if v_path not ilike '%search_path=%' then
    raise exception 'FAIL o: is_push_worthy tidak set search_path (proconfig=%)', v_path;
  end if;
  raise notice 'PASS o: is_push_worthy signature + STABLE + SECURITY DEFINER + search_path';
end $$;

-- ============================================================ (p) Fail-closed default (no settings key) — whitelist Fase 1
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000008';
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active)
    values (v_userA, v_org, 'User-A p', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;
  -- Bersihkan settings key kalau ada residu dari test lain.
  delete from public.settings where organization_id = v_org and key = 'notification_rule_push_types';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);

  -- 6 tipe Fase 1 wajib TRUE.
  if not public.is_push_worthy('review_request') then raise exception 'FAIL p: review_request seharusnya TRUE (fail-closed default)'; end if;
  if not public.is_push_worthy('approved') then raise exception 'FAIL p: approved seharusnya TRUE'; end if;
  if not public.is_push_worthy('rejected') then raise exception 'FAIL p: rejected seharusnya TRUE'; end if;
  if not public.is_push_worthy('deadline_reminder') then raise exception 'FAIL p: deadline_reminder seharusnya TRUE'; end if;
  if not public.is_push_worthy('repeat_due') then raise exception 'FAIL p: repeat_due seharusnya TRUE'; end if;
  if not public.is_push_worthy('instance_missed') then raise exception 'FAIL p: instance_missed seharusnya TRUE'; end if;

  -- Non-Fase-1 tipe wajib FALSE (fail-closed).
  if public.is_push_worthy('comment') then raise exception 'FAIL p: comment seharusnya FALSE'; end if;
  if public.is_push_worthy('mention') then raise exception 'FAIL p: mention seharusnya FALSE'; end if;
  if public.is_push_worthy('governance_warning') then raise exception 'FAIL p: governance_warning seharusnya FALSE'; end if;
  if public.is_push_worthy('deadline_change_requested') then raise exception 'FAIL p: deadline_change_requested seharusnya FALSE'; end if;
  if public.is_push_worthy('deadline_change_revision_requested') then raise exception 'FAIL p: DCR-revision seharusnya FALSE (Fase 2 fitur)'; end if;
  if public.is_push_worthy('unknown_random_type') then raise exception 'FAIL p: unknown type seharusnya FALSE'; end if;
  if public.is_push_worthy('') then raise exception 'FAIL p: empty string seharusnya FALSE'; end if;

  raise notice 'PASS p: fail-closed default whitelist (6 tipe Fase 1 TRUE, sisanya FALSE)';
end $$;
rollback;

-- ============================================================ (q) Org override via settings key — hanya subset yang di-config yang TRUE
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000009';
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active)
    values (v_userA, v_org, 'User-A q', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  -- Set org key ke SUBSET (hanya review_request).
  insert into public.settings (organization_id, key, value, updated_at)
    values (v_org, 'notification_rule_push_types', '["review_request"]'::jsonb, now())
    on conflict (organization_id, key) do update set value = excluded.value, updated_at = now();

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);

  -- Hanya review_request TRUE; approved yang tadi TRUE di (p) sekarang FALSE karena org override subset.
  if not public.is_push_worthy('review_request') then raise exception 'FAIL q: review_request seharusnya TRUE (in override list)'; end if;
  if public.is_push_worthy('approved') then raise exception 'FAIL q: approved seharusnya FALSE (di luar override list)'; end if;
  if public.is_push_worthy('deadline_reminder') then raise exception 'FAIL q: deadline_reminder seharusnya FALSE (di luar override list)'; end if;

  raise notice 'PASS q: org override subset — hanya tipe di key yang TRUE';
end $$;
rollback;

-- ============================================================ (r) Drainer context (p_org explicit) — SERVICE_ROLE tanpa auth.uid
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  -- Bersih dari residu.
  delete from public.settings where organization_id = v_org and key = 'notification_rule_push_types';

  -- Simulasi drainer: postgres role (bypass RLS), tanpa jwt.claims — auth.uid()=null.
  -- p_org explicit dipakai untuk resolve whitelist.
  if not public.is_push_worthy('review_request', v_org) then
    raise exception 'FAIL r: review_request seharusnya TRUE via p_org explicit (default whitelist)';
  end if;
  if public.is_push_worthy('comment', v_org) then
    raise exception 'FAIL r: comment seharusnya FALSE via p_org explicit';
  end if;

  -- Set org key ke daftar kustom, verifikasi p_org explicit pakai daftar kustom.
  insert into public.settings (organization_id, key, value, updated_at)
    values (v_org, 'notification_rule_push_types', '["comment"]'::jsonb, now())
    on conflict (organization_id, key) do update set value = excluded.value, updated_at = now();

  if public.is_push_worthy('review_request', v_org) then
    raise exception 'FAIL r: review_request seharusnya FALSE karena override ["comment"]';
  end if;
  if not public.is_push_worthy('comment', v_org) then
    raise exception 'FAIL r: comment seharusnya TRUE via p_org+override';
  end if;

  raise notice 'PASS r: drainer context (p_org explicit) + org override honored';
end $$;
rollback;

-- ============================================================ (s) claim_push_deliveries + bump signatures
do $$
declare
  v_claim_args text; v_bump_args text; v_claim_secdef boolean; v_bump_secdef boolean;
begin
  select pg_get_function_identity_arguments(oid), prosecdef
    into v_claim_args, v_claim_secdef
  from pg_proc where proname='claim_push_deliveries' and pronamespace='public'::regnamespace;
  if v_claim_args is null then raise exception 'FAIL s: claim_push_deliveries missing'; end if;
  if not v_claim_secdef then raise exception 'FAIL s: claim_push_deliveries bukan SECURITY DEFINER'; end if;

  select pg_get_function_identity_arguments(oid), prosecdef
    into v_bump_args, v_bump_secdef
  from pg_proc where proname='bump_push_delivery_backoff' and pronamespace='public'::regnamespace;
  if v_bump_args is null then raise exception 'FAIL s: bump_push_delivery_backoff missing'; end if;
  if not v_bump_secdef then raise exception 'FAIL s: bump_push_delivery_backoff bukan SECURITY DEFINER'; end if;

  raise notice 'PASS s: claim_push_deliveries + bump_push_delivery_backoff signatures + SECURITY DEFINER';
end $$;

-- ============================================================ (t) claim materializes new pending row for push-worthy notif
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000030';
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000031';
  v_claim_count int;
  v_notif_id uuid;
  v_expo_token text;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User A t', true),
    (v_actor, v_org, 'Actor t', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[t-claim]', 'ios', 'devT');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  perform public.emit_notification(
    v_org, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000010'::uuid,
    'Title t', 'body t', current_date
  );

  -- Claim materialize + return row. Query terpisah untuk hindari max(uuid) unsupported.
  select count(*) into v_claim_count from public.claim_push_deliveries(100);
  if v_claim_count < 1 then raise exception 'FAIL t: claim tidak materialize row'; end if;

  select expo_token into v_expo_token from public.push_deliveries pd
    join public.push_tokens pt on pt.id = pd.push_token_id
    join public.notifications n on n.id = pd.notification_id
    where n.recipient_id = v_userA
    order by pd.created_at desc limit 1;
  if v_expo_token <> 'ExponentPushToken[t-claim]' then
    raise exception 'FAIL t: expo_token wrong (got %)', v_expo_token;
  end if;

  raise notice 'PASS t: claim_push_deliveries materialize + return joined view';
end $$;
rollback;

-- ============================================================ (u) claim honors backoff (next_attempt_at > now() skipped)
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000032';
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000033';
  v_delivery_id uuid;
  v_claim_count int;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User A u', true),
    (v_actor, v_org, 'Actor u', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[u-backoff]', 'ios', 'devU');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  perform public.emit_notification(
    v_org, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000011'::uuid,
    'Title u', 'body u', current_date
  );

  -- Materialize dulu.
  perform public.claim_push_deliveries(100);

  -- Set next_attempt_at ke future untuk baris ini.
  update public.push_deliveries
    set next_attempt_at = now() + interval '10 minutes',
        status = 'pending'
  where public.push_deliveries.notification_id in (
    select n.id from public.notifications n
    where n.organization_id = v_org and n.recipient_id = v_userA
  );

  -- Claim ulang — TIDAK boleh return baris karena backoff.
  select count(*) into v_claim_count from public.claim_push_deliveries(100);
  if v_claim_count > 0 then
    raise exception 'FAIL u: claim mengembalikan % baris padahal next_attempt_at > now()', v_claim_count;
  end if;

  raise notice 'PASS u: claim honors backoff (next_attempt_at > now() skipped)';
end $$;
rollback;

-- ============================================================ (v) claim honors attempts cap (attempts >= 6 skipped)
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000034';
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000035';
  v_claim_count int;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User A v', true),
    (v_actor, v_org, 'Actor v', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[v-cap]', 'ios', 'devV');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  perform public.emit_notification(
    v_org, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000012'::uuid,
    'Title v', 'body v', current_date
  );

  perform public.claim_push_deliveries(100);

  -- Set attempts=6 (exhausted).
  update public.push_deliveries pd
    set attempts = 6, status = 'pending', next_attempt_at = now()
  where pd.notification_id in (
    select n.id from public.notifications n
    where n.organization_id = v_org and n.recipient_id = v_userA
  );

  -- Claim TIDAK boleh pick attempts >= 6.
  select count(*) into v_claim_count from public.claim_push_deliveries(100);
  if v_claim_count > 0 then
    raise exception 'FAIL v: claim mengembalikan % baris padahal attempts >= 6', v_claim_count;
  end if;

  raise notice 'PASS v: claim honors attempts cap (>= 6 skipped)';
end $$;
rollback;

-- ============================================================ (x) bump_push_delivery_backoff — exponential + attempts increment
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000036';
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000037';
  v_delivery_id uuid;
  v_attempts_after int;
  v_next_after timestamptz;
  v_gap_min numeric;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User A x', true),
    (v_actor, v_org, 'Actor x', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[x-bump]', 'ios', 'devX');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  perform public.emit_notification(
    v_org, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000013'::uuid,
    'Title x', 'body x', current_date
  );

  perform public.claim_push_deliveries(100);

  select pd.id into v_delivery_id from public.push_deliveries pd
  join public.notifications n on n.id = pd.notification_id
  where n.recipient_id = v_userA order by pd.created_at desc limit 1;

  -- Bump pertama: attempts 0→1, next ~ +2 menit (pow(2,1)=2).
  perform public.bump_push_delivery_backoff(v_delivery_id, 'transient err 1');
  select attempts, next_attempt_at into v_attempts_after, v_next_after
    from public.push_deliveries where id = v_delivery_id;
  if v_attempts_after <> 1 then raise exception 'FAIL x: attempts setelah bump-1 = %, expected 1', v_attempts_after; end if;
  v_gap_min := extract(epoch from (v_next_after - now())) / 60.0;
  if v_gap_min < 1.5 or v_gap_min > 2.5 then
    raise exception 'FAIL x: gap bump-1 = % menit, expected ~2', round(v_gap_min, 2);
  end if;

  -- Bump kedua: attempts 1→2, next ~ +4 menit (pow(2,2)=4).
  perform public.bump_push_delivery_backoff(v_delivery_id, 'transient err 2');
  select attempts, next_attempt_at into v_attempts_after, v_next_after
    from public.push_deliveries where id = v_delivery_id;
  if v_attempts_after <> 2 then raise exception 'FAIL x: attempts setelah bump-2 = %, expected 2', v_attempts_after; end if;
  v_gap_min := extract(epoch from (v_next_after - now())) / 60.0;
  if v_gap_min < 3.5 or v_gap_min > 4.5 then
    raise exception 'FAIL x: gap bump-2 = % menit, expected ~4', round(v_gap_min, 2);
  end if;

  raise notice 'PASS x: bump exponential — attempts increment + backoff 2/4 min';
end $$;
rollback;

-- ============================================================ (y) bump at attempts+1 >= 6 → status='failed'
begin;
do $$
declare
  v_org uuid := '99999999-2222-0000-0000-9999aa000060';
  v_userA uuid := '99999999-2222-0000-0000-aaaa00000038';
  v_actor uuid := '99999999-2222-0000-0000-aaaa00000039';
  v_delivery_id uuid;
  v_status text;
  v_attempts int;
begin
  insert into public.organizations(id, name) values (v_org, 'Test Org 0060') on conflict (id) do nothing;
  insert into auth.users(id) values (v_userA), (v_actor) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_userA, v_org, 'User A y', true),
    (v_actor, v_org, 'Actor y', true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_userA::text, 'role','authenticated')::text, true);
  perform public.register_push_token('ExponentPushToken[y-fail]', 'ios', 'devY');

  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);

  perform public.emit_notification(
    v_org, v_userA, v_actor,
    'review_request', 'action_plan',
    '99999999-2222-0000-0000-cccc00000014'::uuid,
    'Title y', 'body y', current_date
  );
  perform public.claim_push_deliveries(100);

  select pd.id into v_delivery_id from public.push_deliveries pd
  join public.notifications n on n.id = pd.notification_id
  where n.recipient_id = v_userA order by pd.created_at desc limit 1;

  -- Set attempts=5 (dekat cap). Bump → attempts=6 → status='failed'.
  update public.push_deliveries set attempts = 5 where id = v_delivery_id;
  perform public.bump_push_delivery_backoff(v_delivery_id, 'transient err 6');

  select attempts, status into v_attempts, v_status
    from public.push_deliveries where id = v_delivery_id;
  if v_attempts <> 6 then raise exception 'FAIL y: attempts = %, expected 6', v_attempts; end if;
  if v_status <> 'failed' then raise exception 'FAIL y: status = %, expected failed', v_status; end if;

  raise notice 'PASS y: bump attempts+1 >= 6 → status=failed final';
end $$;
rollback;

-- ============================================================ Fase 2-F: pg_net + vault + cron + retention
-- Kontrak z1–z6: infrastruktur drainer (extension, guardrail, vault, cron schedule).

-- ============================================================ (z1) pg_net + pg_cron extensions loaded
do $$
declare
  v_net boolean; v_cron boolean; v_vault boolean;
begin
  select exists(select 1 from pg_extension where extname = 'pg_net') into v_net;
  select exists(select 1 from pg_extension where extname = 'pg_cron') into v_cron;
  select exists(select 1 from pg_extension where extname = 'supabase_vault') into v_vault;

  if not v_net then raise exception 'FAIL z1: pg_net extension not loaded'; end if;
  if not v_cron then raise exception 'FAIL z1: pg_cron extension not loaded'; end if;
  if not v_vault then raise exception 'FAIL z1: supabase_vault extension not loaded'; end if;

  raise notice 'PASS z1: pg_net + pg_cron + supabase_vault extensions loaded';
end $$;

-- ============================================================ (z2) Guardrail G-2: schema net USAGE revoked from client roles
-- Catatan: pada local dev, REVOKE harus dijalankan sebagai supabase_admin (lihat komentar di migration).
-- Pada hosted, migration postgres superuser langsung berhasil.
do $$
declare
  v_auth boolean; v_anon boolean; v_pub boolean;
begin
  select has_schema_privilege('authenticated', 'net', 'USAGE') into v_auth;
  select has_schema_privilege('anon', 'net', 'USAGE') into v_anon;
  -- PUBLIC grant di ACL = entry tanpa rolename prefix: '{=U/' atau ',=U/'.
  select (nspacl::text ~ '(\{|,)=U/') into v_pub from pg_namespace where nspname = 'net';

  if v_auth then raise exception 'FAIL z2: authenticated masih punya USAGE on schema net'; end if;
  if v_anon then raise exception 'FAIL z2: anon masih punya USAGE on schema net'; end if;
  if coalesce(v_pub, false) then raise exception 'FAIL z2: public masih punya USAGE on schema net'; end if;

  raise notice 'PASS z2: guardrail G-2 — USAGE on schema net revoked from authenticated/anon/public';
end $$;

-- ============================================================ (z3) Guardrail G-1: vault secrets exist (service_role_key + project_url)
do $$
declare
  v_srk boolean; v_url boolean;
begin
  select exists(select 1 from vault.secrets where name = 'service_role_key') into v_srk;
  select exists(select 1 from vault.secrets where name = 'project_url') into v_url;

  if not v_srk then raise exception 'FAIL z3: vault secret "service_role_key" missing'; end if;
  if not v_url then raise exception 'FAIL z3: vault secret "project_url" missing'; end if;

  raise notice 'PASS z3: guardrail G-1 — vault secrets service_role_key + project_url exist';
end $$;

-- ============================================================ (z4) cron job push-fanout-drainer exists, schedule * * * * *, command uses vault
do $$
declare
  v_schedule text; v_command text;
begin
  select schedule, command into v_schedule, v_command
  from cron.job where jobname = 'push-fanout-drainer';

  if v_schedule is null then raise exception 'FAIL z4: cron job push-fanout-drainer missing'; end if;
  if v_schedule <> '* * * * *' then
    raise exception 'FAIL z4: schedule = %, expected * * * * *', v_schedule;
  end if;
  if v_command not ilike '%vault.decrypted_secrets%' then
    raise exception 'FAIL z4: command tidak menggunakan vault (hardcoded secret?)';
  end if;
  if v_command not ilike '%net.http_post%' then
    raise exception 'FAIL z4: command tidak memanggil net.http_post';
  end if;
  if v_command not ilike '%push-fanout%' then
    raise exception 'FAIL z4: command tidak menargetkan push-fanout Edge Function';
  end if;

  raise notice 'PASS z4: push-fanout-drainer cron — * * * * * + vault lookup + net.http_post';
end $$;

-- ============================================================ (z5) cron job push-deliveries-purge exists, schedule 0 3 * * *, command deletes 30 days
do $$
declare
  v_schedule text; v_command text;
begin
  select schedule, command into v_schedule, v_command
  from cron.job where jobname = 'push-deliveries-purge';

  if v_schedule is null then raise exception 'FAIL z5: cron job push-deliveries-purge missing'; end if;
  if v_schedule <> '0 3 * * *' then
    raise exception 'FAIL z5: schedule = %, expected 0 3 * * *', v_schedule;
  end if;
  if v_command not ilike '%push_deliveries%' then
    raise exception 'FAIL z5: command tidak menyebut push_deliveries';
  end if;
  if v_command not ilike '%30 days%' then
    raise exception 'FAIL z5: command tidak mengandung interval 30 days';
  end if;

  raise notice 'PASS z5: push-deliveries-purge cron — 0 3 * * * + 30 days retention';
end $$;

-- ============================================================ (z6) vault decrypted_secrets view resolves at runtime (smoke test)
do $$
declare
  v_count int;
begin
  select count(*) into v_count from vault.decrypted_secrets
  where name in ('service_role_key', 'project_url');

  if v_count < 2 then
    raise exception 'FAIL z6: vault.decrypted_secrets hanya resolve % dari 2 secrets', v_count;
  end if;

  raise notice 'PASS z6: vault.decrypted_secrets resolves service_role_key + project_url';
end $$;
