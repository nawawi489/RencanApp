-- Migration 0060 contract test — Push Notifications Fase 2 server infrastructure.
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
