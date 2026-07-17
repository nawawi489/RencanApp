-- Contract test — keyset pagination `listChatMessages` (spec: keyset-pagination-list-chat-messages).
--
-- Membuktikan invarian SERVER-SIDE untuk paginasi client `.from('chat_messages').select()`
-- di bawah RLS `chat_messages_select`. TIDAK menyentuh grammar filter PostgREST — untuk
-- parseability end-to-end `.or()` ke Kong lokal, lihat `keyset_list_chat_messages_http.test.ts`
-- (AC-17b, integration HTTP terpisah).
--
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0045_keyset_list_chat_messages_contract.sql
--
-- Pola:
-- - `raise notice 'PASS…'` bila lulus, `raise exception 'FAIL: …'` bila gagal.
-- - Setiap blok RLS memakai `set local role authenticated` (kritis: postgres/superuser
--   men-bypass RLS → tanpa switch role blok akan lulus palsu). Reset ke postgres via
--   `reset role` di akhir blok agar cleanup + blok berikutnya tetap bisa berjalan.
-- - Seed test memakai prefix body `__ktest45__` agar cleanup deterministik.

-- ============================================================ 0045-DB-1: index reuse (regression guard — spec FR-KP13)
-- idx_chat_messages_org_room_created (org, room, created_at desc) dari 0044 dipakai apa adanya —
-- keyset TIDAK menambah migrasi baru. Jika index ini hilang, perencanaan query keyset (WHERE
-- org=X AND room=Y ORDER BY created_at DESC, id DESC LIMIT 30) kehilangan support push-down.
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'chat_messages'
      and indexname = 'idx_chat_messages_org_room_created'
  ) then
    fails := fails || 'composite_index_missing (spec FR-KP13 REUSE broken); ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0045-DB-1: %', fails;
  end if;
  raise notice 'PASS 0045-DB-1';
end $$;

-- ============================================================ 0045-DB-2: RLS chat_messages_select tetap `org=current AND (member OR view_all)`
-- Regresi guard untuk gate — bila di masa depan policy diubah (mis. per-room utk view_all),
-- perilaku silent-0-rows di [DB-4] & anti-kebocoran [DB-5] bisa berubah semantiknya.
do $$
declare fails text := '';
declare qual_text text;
begin
  select pg_get_expr(pol.polqual, pol.polrelid) into qual_text
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    where c.relname = 'chat_messages' and pol.polname = 'chat_messages_select';

  if qual_text is null then
    fails := fails || 'policy_missing; ';
  else
    if qual_text not like '%current_user_org()%' then fails := fails || 'no_org_clause; '; end if;
    if qual_text not like '%is_chat_member%'    then fails := fails || 'no_member_clause; '; end if;
    if qual_text not like '%can_view_workspace%' then fails := fails || 'no_view_all_clause; '; end if;
  end if;

  if fails <> '' then
    raise exception 'FAIL 0045-DB-2 (qual=%): %', qual_text, fails;
  end if;
  raise notice 'PASS 0045-DB-2';
end $$;

-- ============================================================ 0045-DB-3: tuple keyset semantics — `(created_at, id) < (T, X)` deterministic + tie-break
-- AC-17a: bukti bahwa dua pesan ber-created_at IDENTIK di batas halaman tidak duplikat/skip
-- ketika predikat tuple dipakai (dgn tie-break id DESC). Ini menegakkan semantik BAWAH-SQL
-- yang dicerminkan client via `.or('created_at.lt.<T>,and(created_at.eq.<T>,id.lt.<X>)')`.
do $$
declare
  org_id uuid;
  user_id uuid;
  room_id uuid;
  ts timestamptz := '2026-06-24T01:00:00.500000+00:00';
  id_a uuid := gen_random_uuid();
  id_b uuid := gen_random_uuid();
  id_c uuid := gen_random_uuid();
  cursor_ts timestamptz;
  cursor_id uuid;
  page0_count int;
  page1_count int;
  overlap_count int;
begin
  select id into org_id from public.organizations limit 1;
  select id into user_id from public.profiles where organization_id = org_id and is_active = true limit 1;
  select r.id into room_id from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id = r.id
    where r.organization_id = org_id and m.member_id = user_id limit 1;

  if org_id is null or user_id is null or room_id is null then
    raise notice 'SKIP 0045-DB-3: no seed member available';
    return;
  end if;

  -- Seed 3 pesan dgn created_at PERSIS SAMA → tie total. id DESC menentukan urutan stabil.
  insert into public.chat_messages (id, organization_id, chat_room_id, author_id, body, created_at)
    values (id_a, org_id, room_id, user_id, '__ktest45__ tie-a', ts),
           (id_b, org_id, room_id, user_id, '__ktest45__ tie-b', ts),
           (id_c, org_id, room_id, user_id, '__ktest45__ tie-c', ts);

  -- "Page 0" = 2 baris pertama menurut ORDER BY created_at DESC, id DESC.
  -- Ambil cursor = baris LAST (paling lama urutan) page 0.
  select cm.created_at, cm.id
    into cursor_ts, cursor_id
    from public.chat_messages cm
    where cm.chat_room_id = room_id and cm.body like '__ktest45__ tie-%'
    order by cm.created_at desc, cm.id desc
    offset 1 limit 1; -- baris ke-2 (index 1) = LAST page 0 dengan page size 2.

  -- Page 0 = 2 baris teratas (untuk simulasi page-size 2). Hitung via subquery agar
  -- ORDER BY + LIMIT valid; count(*) di outer.
  select count(*) into page0_count from (
    select cm.id from public.chat_messages cm
      where cm.chat_room_id = room_id and cm.body like '__ktest45__ tie-%'
      order by cm.created_at desc, cm.id desc
      limit 2
  ) as p0;
  if page0_count <> 2 then
    raise exception 'FAIL 0045-DB-3a: expected 2 rows on page 0, got %', page0_count;
  end if;

  -- Page 1 via tuple predicate strict `<` — WAJIB persis 1 baris (baris ke-3, tie ketiga).
  select count(*) into page1_count from (
    select cm.id from public.chat_messages cm
      where cm.chat_room_id = room_id
        and cm.body like '__ktest45__ tie-%'
        and (cm.created_at, cm.id) < (cursor_ts, cursor_id)
      order by cm.created_at desc, cm.id desc
      limit 2
  ) as p1;
  if page1_count <> 1 then
    raise exception 'FAIL 0045-DB-3b: expected 1 row on page 1 (tie remainder), got %', page1_count;
  end if;

  -- Anti-duplikat: overlap page 0 ∩ page 1 = 0.
  with p0 as (
    select cm.id from public.chat_messages cm
      where cm.chat_room_id = room_id and cm.body like '__ktest45__ tie-%'
      order by cm.created_at desc, cm.id desc limit 2
  ), p1 as (
    select cm.id from public.chat_messages cm
      where cm.chat_room_id = room_id and cm.body like '__ktest45__ tie-%'
        and (cm.created_at, cm.id) < (cursor_ts, cursor_id)
      order by cm.created_at desc, cm.id desc limit 2
  )
  select count(*) into overlap_count from p0 inner join p1 on p0.id = p1.id;
  if overlap_count <> 0 then
    raise exception 'FAIL 0045-DB-3c: page0 ∩ page1 = % (expected 0 — dup!)', overlap_count;
  end if;

  -- Anti-skip: page0 ∪ page1 = 3 baris (seluruh tie ter-cover). UNION antar SELECT bertingkat
  -- di PL/pgSQL harus dibungkus dalam parens ketika masing-masing punya klausa LIMIT.
  with unioned as (
    (select cm.id from public.chat_messages cm
       where cm.chat_room_id = room_id and cm.body like '__ktest45__ tie-%'
       order by cm.created_at desc, cm.id desc limit 2)
    union
    (select cm.id from public.chat_messages cm
       where cm.chat_room_id = room_id and cm.body like '__ktest45__ tie-%'
         and (cm.created_at, cm.id) < (cursor_ts, cursor_id)
       order by cm.created_at desc, cm.id desc limit 2)
  )
  select count(*) into overlap_count from unioned;
  if overlap_count <> 3 then
    raise exception 'FAIL 0045-DB-3d: page0 ∪ page1 = % (expected 3 — skip!)', overlap_count;
  end if;

  -- Cleanup
  delete from public.chat_messages where body like '\_\_ktest45\_\_ tie-%' escape '\';
  raise notice 'PASS 0045-DB-3';
end $$;

-- ============================================================ 0045-DB-4: RLS parity 3-way (§7.4 critic)
-- Tiga skenario TERPISAH — jangan digabung:
--   (a) member same-org → boleh baca pesan room
--   (b) non-member same-org DENGAN can_view_workspace → boleh baca (view-all)
--   (c) non-member cross-org → 0 baris (silent, tidak error)
-- Dijalankan dgn `set local role authenticated` — postgres men-bypass RLS.
do $$
declare
  org_a uuid;
  user_member uuid;         -- (a) member of some room in org A
  user_view_all uuid;       -- (b) non-member same-org dgn view_all_workspace
  user_cross_org uuid;      -- (c) profile di org lain
  room_id uuid;
  seed_msg_id uuid := gen_random_uuid();
  seed_created_at timestamptz := now();
  n int;
  role_ceo uuid;
  org_b uuid := gen_random_uuid();
begin
  select id into org_a from public.organizations order by id limit 1;
  select id into user_member from public.profiles
    where organization_id = org_a and is_active = true limit 1;
  select r.id into room_id from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id = r.id
    where r.organization_id = org_a and m.member_id = user_member limit 1;

  if org_a is null or user_member is null or room_id is null then
    raise notice 'SKIP 0045-DB-4: no seed member available';
    return;
  end if;

  -- Seed pesan test.
  insert into public.chat_messages (id, organization_id, chat_room_id, author_id, body, created_at)
    values (seed_msg_id, org_a, room_id, user_member, '__ktest45__ parity-msg', seed_created_at);

  -- Pilih user_view_all = user CEO di org A yg BUKAN member room ini (ideal), atau fallback
  -- ke CEO manapun di org A (walau member — kita akan hapus dari room_members untuk test).
  -- Cari role_template CEO.
  select id into role_ceo from public.role_templates where level = 'ceo' limit 1;

  if role_ceo is not null then
    -- Coba cari CEO di org A yg BUKAN member room test (jalur happy).
    select p.id into user_view_all from public.profiles p
      where p.organization_id = org_a and p.is_active = true and p.role_template_id = role_ceo
        and not exists (
          select 1 from public.chat_room_members m
          where m.chat_room_id = room_id and m.member_id = p.id
        )
      limit 1;

    -- Fallback: seed CEO synthetic di org A agar coverage §7.4b tidak SKIP.
    if user_view_all is null then
      user_view_all := gen_random_uuid();
      insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
        values (user_view_all, 'authenticated', 'authenticated', 'ktest45-ceo-nm@test.local',
                '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
      if not exists (select 1 from public.profiles where id = user_view_all) then
        insert into public.profiles (id, organization_id, full_name, email, is_active, role_template_id)
          values (user_view_all, org_a, 'ktest45 CEO NM', 'ktest45-ceo-nm@test.local', true, role_ceo);
      else
        update public.profiles
          set organization_id = org_a, full_name = 'ktest45 CEO NM',
              is_active = true, role_template_id = role_ceo
          where id = user_view_all;
      end if;
      -- Pastikan BUKAN member room test (defensive; trigger tak menambah membership).
      delete from public.chat_room_members
        where chat_room_id = room_id and member_id = user_view_all;
    end if;
  end if;

  -- Buat org B + user_cross_org (synthetic, cleanup di akhir). Insert ke auth.users memicu
  -- trigger `on_auth_user_created` yg meng-auto-create profile (default org via convention);
  -- karena itu kita UPDATE profile setelah insert bukan INSERT lagi (menghindari PK collision).
  insert into public.organizations (id, name) values (org_b, '__ktest45__ Org B');
  user_cross_org := gen_random_uuid();
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (user_cross_org, 'authenticated', 'authenticated', 'ktest45-crossorg@test.local',
            '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
            now(), now(), now(), '{}'::jsonb, '{}'::jsonb);
  -- Jika trigger tak jalan (config berbeda), fallback INSERT.
  if not exists (select 1 from public.profiles where id = user_cross_org) then
    insert into public.profiles (id, organization_id, full_name, email, is_active)
      values (user_cross_org, org_b, 'ktest45 cross-org', 'ktest45-crossorg@test.local', true);
  else
    update public.profiles
      set organization_id = org_b, full_name = 'ktest45 cross-org', is_active = true
      where id = user_cross_org;
  end if;

  ---------------- (a) member same-org
  perform set_config('request.jwt.claims', json_build_object('sub', user_member)::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_messages
    where chat_room_id = room_id and body = '__ktest45__ parity-msg';
  if n <> 1 then
    reset role;
    raise exception 'FAIL 0045-DB-4a: member same-org expected 1 row, got %', n;
  end if;
  reset role;

  ---------------- (b) non-member same-org + can_view_workspace
  if user_view_all is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', user_view_all)::text, true);
    set local role authenticated;
    select count(*) into n from public.chat_messages
      where chat_room_id = room_id and body = '__ktest45__ parity-msg';
    if n <> 1 then
      reset role;
      raise exception 'FAIL 0045-DB-4b: view_all_workspace non-member same-org expected 1 row (RLS grants via can_view_workspace), got %', n;
    end if;
    reset role;
  else
    raise notice 'SKIP 0045-DB-4b: no CEO non-member available in org A';
  end if;

  ---------------- (c) non-member cross-org — WAJIB 0 baris silent
  perform set_config('request.jwt.claims', json_build_object('sub', user_cross_org)::text, true);
  set local role authenticated;
  select count(*) into n from public.chat_messages
    where chat_room_id = room_id and body = '__ktest45__ parity-msg';
  if n <> 0 then
    reset role;
    raise exception 'FAIL 0045-DB-4c: cross-org expected 0 rows silent, got % (RLS BYPASS SUSPECTED!)', n;
  end if;
  reset role;

  -- Cleanup — hapus profile+auth.users synthetic (baik cross-org maupun CEO fallback bila dibuat).
  delete from public.chat_messages where body like '\_\_ktest45\_\_%' escape '\';
  delete from public.profiles where email in ('ktest45-crossorg@test.local', 'ktest45-ceo-nm@test.local');
  delete from auth.users where email in ('ktest45-crossorg@test.local', 'ktest45-ceo-nm@test.local');
  delete from public.organizations where id = org_b;

  raise notice 'PASS 0045-DB-4';
end $$;

-- ============================================================ 0045-DB-5: cursor bukan kanal bocor lintas-room (AC-11 + presedens .eq top-level AC-12)
-- Bila `.eq('chat_room_id')` dilipat ke dalam grup `.or()` cursor, hasilnya menjadi
-- `(chat_room_id = X AND lt) OR (eq AND lt)` → cabang kedua kehilangan filter room →
-- membocorkan pesan room LAIN se-org untuk pembaca `can_view_workspace`. Test ini
-- membuktikan bahwa untuk user view_all_workspace, cursor dari room A dipakai ke
-- room B TIDAK meloloskan pesan room A (predikat cursor mempersempit, tak melebar).
do $$
declare
  org_a uuid;
  user_view_all uuid;
  room_a uuid;
  room_b uuid;
  cursor_ts timestamptz := now() + interval '1 hour'; -- cursor "future" agar semua baris lolos strict-lt bila room filter absen (worst case).
  cursor_id uuid := gen_random_uuid();
  bleed int;
  role_ceo uuid;
begin
  select id into org_a from public.organizations
    where name <> '__ktest45__ Org B' order by id limit 1;
  select id into role_ceo from public.role_templates where level = 'ceo' limit 1;

  if role_ceo is null then
    raise notice 'SKIP 0045-DB-5: no CEO role_template';
    return;
  end if;

  -- Cari CEO (view_all_workspace) di org A.
  select id into user_view_all from public.profiles
    where organization_id = org_a and is_active = true and role_template_id = role_ceo
    limit 1;

  -- Dua room di org A. Bila hanya ada 1, buat room B sintetis (perlu action_plan? — cari
  -- yg tersedia; kalau tak ada, skip).
  select r.id into room_a from public.chat_rooms r where r.organization_id = org_a order by r.id limit 1;
  select r.id into room_b from public.chat_rooms r where r.organization_id = org_a and r.id <> room_a order by r.id limit 1;

  if user_view_all is null or room_a is null or room_b is null then
    raise notice 'SKIP 0045-DB-5: need view_all user + 2 rooms same-org';
    return;
  end if;

  -- Seed 1 pesan di room A yg WAJIB tak bocor ke query room B.
  insert into public.chat_messages (organization_id, chat_room_id, author_id, body)
    values (org_a, room_a, user_view_all, '__ktest45__ leak-canary-room-a');

  perform set_config('request.jwt.claims', json_build_object('sub', user_view_all)::text, true);
  set local role authenticated;

  -- SIMULASI QUERY BENAR (spec): `.eq('chat_room_id', room_b) AND (or cursor)` →
  -- filter room_b top-level; cursor hanya mempersempit.
  select count(*) into bleed
    from public.chat_messages cm
    where cm.chat_room_id = room_b -- top-level AND, TIDAK boleh dilipat ke OR
      and (
        cm.created_at < cursor_ts
        or (cm.created_at = cursor_ts and cm.id < cursor_id)
      )
      and cm.body = '__ktest45__ leak-canary-room-a';
  if bleed <> 0 then
    reset role;
    raise exception 'FAIL 0045-DB-5a: canary room A bocor via cursor (bleed=%)', bleed;
  end if;

  -- SIMULASI QUERY SALAH (footgun spec): `.eq` dilipat ke dalam grup .or() →
  -- `(room=B AND cursor) OR (cursor)`. Cabang kanan kehilangan room filter → bocor.
  -- Test ini MENDOKUMENTASIKAN besaran bug bila developer masa depan salah lipat.
  select count(*) into bleed
    from public.chat_messages cm
    where cm.body = '__ktest45__ leak-canary-room-a'
      and (
        (
          cm.chat_room_id = room_b
          and (cm.created_at < cursor_ts or (cm.created_at = cursor_ts and cm.id < cursor_id))
        )
        or (cm.created_at < cursor_ts or (cm.created_at = cursor_ts and cm.id < cursor_id))
      );
  if bleed <> 1 then
    reset role;
    raise exception 'FAIL 0045-DB-5b: expected footgun shape to leak 1 canary (proof-of-shape), got % (adjust seed)', bleed;
  end if;

  reset role;

  -- Cleanup
  delete from public.chat_messages where body like '\_\_ktest45\_\_%' escape '\';
  raise notice 'PASS 0045-DB-5';
end $$;

-- ============================================================ 0045-DB-6: round-trip timestamp lossless — mikrodetik + offset TZ (AC-17a)
-- Membuktikan dua baris berjarak 1 mikrodetik di batas cursor tidak ter-skip/dup ketika
-- nilai `created_at` dipakai apa adanya sebagai boundary. Grammar filter PostgREST (AC-17b)
-- diuji terpisah di HTTP integration; di sini kita mengunci semantik SQL.
do $$
declare
  org_id uuid;
  user_id uuid;
  room_id uuid;
  ts_a timestamptz := '2026-06-24T01:00:00.123456+00:00';
  ts_b timestamptz := '2026-06-24T01:00:00.123457+00:00'; -- +1 mikrodetik
  id_a uuid := gen_random_uuid();
  id_b uuid := gen_random_uuid();
  page1_count int;
  page1_id uuid;
begin
  select id into org_id from public.organizations
    where name <> '__ktest45__ Org B' order by id limit 1;
  select id into user_id from public.profiles where organization_id = org_id and is_active = true limit 1;
  select r.id into room_id from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id = r.id
    where r.organization_id = org_id and m.member_id = user_id limit 1;

  if org_id is null or user_id is null or room_id is null then
    raise notice 'SKIP 0045-DB-6: no seed';
    return;
  end if;

  insert into public.chat_messages (id, organization_id, chat_room_id, author_id, body, created_at)
    values (id_a, org_id, room_id, user_id, '__ktest45__ ustest a', ts_a),
           (id_b, org_id, room_id, user_id, '__ktest45__ ustest b', ts_b);

  -- Page 0 (page_size=1) mengambil TS_B (newest). Cursor = (ts_b, id_b). Page 1 harus
  -- mengembalikan TEPAT baris TS_A (mikrodetik lebih lama) — mikrodetik dipertahankan.
  select count(*) into page1_count
    from public.chat_messages cm
    where cm.chat_room_id = room_id
      and cm.body like '__ktest45__ ustest %'
      and (cm.created_at, cm.id) < (ts_b, id_b);
  if page1_count <> 1 then
    raise exception 'FAIL 0045-DB-6a: expected 1 row on page 1 after us-precision boundary, got %', page1_count;
  end if;

  select cm.id into page1_id
    from public.chat_messages cm
    where cm.chat_room_id = room_id
      and cm.body like '__ktest45__ ustest %'
      and (cm.created_at, cm.id) < (ts_b, id_b)
    order by cm.created_at desc, cm.id desc
    limit 1;
  if page1_id <> id_a then
    raise exception 'FAIL 0045-DB-6b: expected id_a on page 1, got %', page1_id;
  end if;

  -- Round-trip via TEXT: nilai ts_a di-serialize → parse ulang → strict-lt (ts_a, id_a)
  -- terhadap dirinya sendiri harus mengembalikan 0 (bukan 1 — jika presisi hilang, ts_a
  -- round-trip menjadi ts_a-1us dan baris ts_a lolos strict-lt palsu).
  select count(*) into page1_count
    from public.chat_messages cm
    where cm.chat_room_id = room_id
      and cm.body like '__ktest45__ ustest %'
      and (cm.created_at, cm.id) < (ts_a::text::timestamptz, id_a);
  if page1_count <> 0 then
    raise exception 'FAIL 0045-DB-6c: TEXT round-trip lost microsecond precision — self-strict-lt returned %, expected 0', page1_count;
  end if;

  -- Cleanup
  delete from public.chat_messages where body like '\_\_ktest45\_\_%' escape '\';
  raise notice 'PASS 0045-DB-6';
end $$;

-- ============================================================ 0045-DB-7: append-only utuh — test tidak meninggalkan sisa
-- Sanity akhir: seluruh baris ber-prefix __ktest45__ sudah dihapus. Guard supaya kegagalan
-- cleanup di blok mana pun terdeteksi cepat.
do $$
declare orphan int;
begin
  select count(*) into orphan from public.chat_messages where body like '\_\_ktest45\_\_%' escape '\';
  if orphan <> 0 then
    raise exception 'FAIL 0045-DB-7: % orphan test rows leftover', orphan;
  end if;
  select count(*) into orphan from public.organizations where name = '__ktest45__ Org B';
  if orphan <> 0 then
    raise exception 'FAIL 0045-DB-7b: % orphan org B leftover', orphan;
  end if;
  raise notice 'PASS 0045-DB-7';
end $$;
