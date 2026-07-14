-- Migration 0044 contract test — search_chat_messages (Chat FTS V1).
--
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0044_search_chat_messages_contract.sql
--
-- Pola: `raise notice 'PASS…'` bila lolos, `raise exception 'FAIL: …'` bila gagal.
-- Cakupan governance yg butuh JWT-user (silent-filter, confidential, cross-org) diserahkan
-- ke Fase-7 style contract atau QA — di sini fokus invariansi struktural + guard yg
-- deterministik tanpa seed multi-user.

-- ============================================================ 0044-DB-1: extension pg_trgm ada di skema `extensions`
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
  ) then
    fails := fails || 'pg_trgm_not_installed; ';
  end if;

  if not exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm' and n.nspname = 'extensions'
  ) then
    fails := fails || 'pg_trgm_wrong_schema (must be extensions); ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0044-DB-1: %', fails;
  end if;
  raise notice 'PASS 0044-DB-1';
end $$;

-- ============================================================ 0044-DB-2: 2 indeks baru pada chat_messages
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'chat_messages'
      and indexname = 'idx_chat_messages_body_trgm'
  ) then
    fails := fails || 'gin_trgm_index_missing; ';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'chat_messages'
      and indexname = 'idx_chat_messages_org_room_created'
  ) then
    fails := fails || 'composite_index_missing; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0044-DB-2: %', fails;
  end if;
  raise notice 'PASS 0044-DB-2';
end $$;

-- ============================================================ 0044-DB-3: RPC signature persis (text, uuid, int, timestamptz, uuid)
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_chat_messages'
  ) then
    fails := fails || 'function_missing; ';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_chat_messages'
      and pg_get_function_arguments(p.oid)
        ilike '%p_query text%p_room_id uuid%p_limit integer%p_before timestamp with time zone%p_before_id uuid%'
  ) then
    fails := fails || 'wrong_signature; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0044-DB-3: %', fails;
  end if;
  raise notice 'PASS 0044-DB-3';
end $$;

-- ============================================================ 0044-DB-4: SECURITY DEFINER + STABLE + search_path=''
do $$
declare fails text := '';
declare config text[];
begin
  select p.proconfig into config from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_chat_messages'
    limit 1;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_chat_messages'
      and p.prosecdef = true
  ) then
    fails := fails || 'not_security_definer; ';
  end if;

  -- STABLE = 's' (volatile='v', immutable='i').
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'search_chat_messages'
      and p.provolatile = 's'
  ) then
    fails := fails || 'not_stable_volatility; ';
  end if;

  -- search_path harus di-set (isi bebas — biasanya '' atau 'public' tetap OK; empty diinginkan
  -- untuk hardening — kita minta minimal ada `search_path=` di proconfig).
  if config is null or not exists (
    select 1 from unnest(config) c where c like 'search_path=%'
  ) then
    fails := fails || 'no_search_path_set; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0044-DB-4: %', fails;
  end if;
  raise notice 'PASS 0044-DB-4';
end $$;

-- ============================================================ 0044-DB-5: authenticated punya EXECUTE; public/anon TIDAK
do $$
declare fails text := '';
begin
  if not has_function_privilege(
    'authenticated',
    'public.search_chat_messages(text, uuid, int, timestamptz, uuid)',
    'EXECUTE'
  ) then
    fails := fails || 'authenticated_missing_execute; ';
  end if;

  if has_function_privilege(
    'anon',
    'public.search_chat_messages(text, uuid, int, timestamptz, uuid)',
    'EXECUTE'
  ) then
    fails := fails || 'anon_has_execute_leak; ';
  end if;

  -- public role juga tidak boleh.
  if has_function_privilege(
    'public',
    'public.search_chat_messages(text, uuid, int, timestamptz, uuid)',
    'EXECUTE'
  ) then
    fails := fails || 'public_has_execute_leak; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0044-DB-5: %', fails;
  end if;
  raise notice 'PASS 0044-DB-5';
end $$;

-- ============================================================ 0044-DB-6: length<2 → 0 baris (early return server-side, FR-6)
do $$
declare result_count int;
begin
  -- Panggil sebagai postgres (bypass RLS), tapi RPC internal masih early-return utk len<2.
  -- Query 1 char ('a') → tidak boleh ada baris.
  select count(*) into result_count from public.search_chat_messages('a', null, 20, null, null);
  if result_count <> 0 then
    raise exception 'FAIL 0044-DB-6: expected 0 rows for len<2, got %', result_count;
  end if;

  -- Query hanya spasi (btrim → '') → 0.
  select count(*) into result_count from public.search_chat_messages('   ', null, 20, null, null);
  if result_count <> 0 then
    raise exception 'FAIL 0044-DB-6b: expected 0 rows for whitespace, got %', result_count;
  end if;

  -- NULL query → 0.
  select count(*) into result_count from public.search_chat_messages(null, null, 20, null, null);
  if result_count <> 0 then
    raise exception 'FAIL 0044-DB-6c: expected 0 rows for null, got %', result_count;
  end if;

  raise notice 'PASS 0044-DB-6';
end $$;

-- ============================================================ 0044-DB-7: LIKE-wildcard escape (%, _, \) — user typing '%' tidak match segalanya
--
-- Catatan seeding: seluruh action_plans di lokal sudah memiliki chat_room (unique key). Test
-- memakai room existing + prefix body '__testfts07__' agar tidak nabrak data QA lain; cleanup
-- via prefix di akhir. RPC SECURITY DEFINER membaca current_user_org() → butuh JWT claim; set
-- via `set local request.jwt.claims` untuk user yg sudah anggota room.
do $$
declare
  org_id uuid;
  user_id uuid;
  room_id uuid;
  match_literal_pct int;
  match_no_pct int;
  match_underscore int;
begin
  select id into org_id from public.organizations limit 1;
  select id into user_id from public.profiles where organization_id = org_id and is_active = true limit 1;
  select r.id into room_id from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id = r.id
    where r.organization_id = org_id and m.member_id = user_id limit 1;

  if org_id is null or user_id is null or room_id is null then
    raise notice 'SKIP 0044-DB-7: no seed member';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);

  insert into public.chat_messages (organization_id, chat_room_id, author_id, body)
    values (org_id, room_id, user_id, '__testfts07__ harga naik 100%'),
           (org_id, room_id, user_id, '__testfts07__ update biasa tanpa persen'),
           (org_id, room_id, user_id, '__testfts07__ pola dengan_underscore literal');

  -- Query '100%' — token wildcard %. Kalau tidak di-escape, ILIKE pattern '%100%%' cocok
  -- SEMUA body (bug klasik). Setelah escape, hanya baris berisi literal '100%' cocok.
  select count(*) into match_literal_pct
    from public.search_chat_messages('100%', room_id, 30, null, null)
    where snippet ilike '%__testfts07__%';
  if match_literal_pct <> 1 then
    raise exception 'FAIL 0044-DB-7: expected 1 literal-percent match, got %', match_literal_pct;
  end if;

  -- Sanity: query 'biasa' cocok 1 (baris kedua).
  select count(*) into match_no_pct
    from public.search_chat_messages('biasa', room_id, 30, null, null)
    where snippet ilike '%__testfts07__%';
  if match_no_pct <> 1 then
    raise exception 'FAIL 0044-DB-7b: expected 1 for biasa, got %', match_no_pct;
  end if;

  -- Underscore _ juga wildcard di LIKE — user mengetik 'dengan_underscore' hanya cocok literal.
  select count(*) into match_underscore
    from public.search_chat_messages('dengan_underscore', room_id, 30, null, null)
    where snippet ilike '%__testfts07__%';
  if match_underscore <> 1 then
    raise exception 'FAIL 0044-DB-7c: expected 1 for literal underscore, got %', match_underscore;
  end if;

  -- Cleanup: hapus hanya baris test.
  delete from public.chat_messages where body like '\_\_testfts07\_\_%' escape '\';

  raise notice 'PASS 0044-DB-7';
end $$;

-- ============================================================ 0044-DB-8: limit clamp — p_limit=100 → server cap 30
do $$
declare
  org_id uuid;
  user_id uuid;
  room_id uuid;
  n int;
  result_count int;
begin
  select id into org_id from public.organizations limit 1;
  select id into user_id from public.profiles where organization_id = org_id and is_active = true limit 1;
  select r.id into room_id from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id = r.id
    where r.organization_id = org_id and m.member_id = user_id limit 1;

  if org_id is null or user_id is null or room_id is null then
    raise notice 'SKIP 0044-DB-8: no seed member';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);

  -- 40 baris cocok query '__clamptest08__'.
  for n in 1..40 loop
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body)
      values (org_id, room_id, user_id, '__clamptest08__ ' || n);
  end loop;

  -- p_limit=100 → server clamp 30.
  select count(*) into result_count from public.search_chat_messages('__clamptest08__', room_id, 100, null, null);
  if result_count <> 30 then
    raise exception 'FAIL 0044-DB-8: expected 30 (clamp), got %', result_count;
  end if;

  -- p_limit=0 → clamp min 1.
  select count(*) into result_count from public.search_chat_messages('__clamptest08__', room_id, 0, null, null);
  if result_count <> 1 then
    raise exception 'FAIL 0044-DB-8b: expected 1 (clamp), got %', result_count;
  end if;

  -- Cleanup
  delete from public.chat_messages where body like '\_\_clamptest08\_\_%' escape '\';

  raise notice 'PASS 0044-DB-8';
end $$;

-- ============================================================ 0044-DB-9: append-only chat_messages tetap utuh — RPC tidak insert/update/delete
do $$
declare
  msg_count_before bigint;
  msg_count_after bigint;
begin
  select count(*) into msg_count_before from public.chat_messages;

  -- Panggil RPC 5 kali (query pendek, panjang, wildcard) — tidak boleh menambah/mengurangi baris.
  perform public.search_chat_messages('a', null, 20, null, null);
  perform public.search_chat_messages('cpl', null, 20, null, null);
  perform public.search_chat_messages('100%', null, 20, null, null);
  perform public.search_chat_messages('_test_', null, 20, null, null);
  perform public.search_chat_messages('sales', null, 20, null, null);

  select count(*) into msg_count_after from public.chat_messages;

  if msg_count_after <> msg_count_before then
    raise exception 'FAIL 0044-DB-9: chat_messages count changed (% → %)', msg_count_before, msg_count_after;
  end if;

  raise notice 'PASS 0044-DB-9';
end $$;

-- ============================================================ 0044-DB-10: ordering created_at DESC, id DESC (deterministic, FR-11)
do $$
declare
  org_id uuid;
  user_id uuid;
  room_id uuid;
  m_new uuid := gen_random_uuid();
  m_old uuid := gen_random_uuid();
  first_id uuid;
  total_matches int;
begin
  select id into org_id from public.organizations limit 1;
  select id into user_id from public.profiles where organization_id = org_id and is_active = true limit 1;
  select r.id into room_id from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id = r.id
    where r.organization_id = org_id and m.member_id = user_id limit 1;

  if org_id is null or user_id is null or room_id is null then
    raise notice 'SKIP 0044-DB-10: no seed member';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', user_id)::text, true);

  insert into public.chat_messages (id, organization_id, chat_room_id, author_id, body, created_at)
    values (m_old, org_id, room_id, user_id, '__ordertest10__ lama', now() - interval '1 day'),
           (m_new, org_id, room_id, user_id, '__ordertest10__ baru', now());

  -- Sanity: kedua baris harus muncul (guard NULL-vs-anything false positive).
  select count(*) into total_matches
    from public.search_chat_messages('__ordertest10__', room_id, 20, null, null);
  if total_matches <> 2 then
    raise exception 'FAIL 0044-DB-10: expected 2 matches, got % (auth context / gate issue)', total_matches;
  end if;

  select message_id into first_id
    from public.search_chat_messages('__ordertest10__', room_id, 20, null, null)
    limit 1;

  if first_id <> m_new then
    raise exception 'FAIL 0044-DB-10: expected newest first, got % (m_new=%, m_old=%)',
      first_id, m_new, m_old;
  end if;

  -- Cleanup
  delete from public.chat_messages where body like '\_\_ordertest10\_\_%' escape '\';

  raise notice 'PASS 0044-DB-10';
end $$;
