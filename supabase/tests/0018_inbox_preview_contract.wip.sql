-- [QUARANTINED — WIP] Excluded from CI (run-db-contract-tests.sh skips *.wip.sql).
-- Reason: schema: initiatives now requires strategy_id (goal->strategy->initiative rename); test attaches initiative to org/goal directly.
-- Repair tracked in supabase/tests/WIP_REPAIR_BACKLOG.md. Rename back to *.sql once green.
--
-- EMS V1.8.1 — Contract FR-DATA.1: get_chat_rooms() preview kolom (UI-S-IN1).
-- Pola: jwt claims + set local role authenticated + ROLLBACK. Seed sebagai postgres dulu
-- (INSERT ke chat_rooms/chat_messages/chat_room_members di-revoke dari authenticated oleh 0008).
--
-- Invarian yang dibuktikan:
--   T1  Member melihat 4 room miliknya dengan kolom preview konsisten dengan pesan terbaru.
--   T2  Non-member melihat 0 baris (digerakkan is_chat_member, BUKAN null auth.uid()).
--   T3  Room tanpa pesan → 3 kolom nullable null, room TETAP muncul (left join lateral).
--   T4  author_id NULL → last_message_author_name NULL, last_message_body tetap terisi.
--   T5  Tie created_at → tiebreaker id desc deterministik.
--   T6  Outer order: last_message_at desc nulls last dipertahankan (room kosong di paling akhir).
--
-- Catatan: jalankan via MCP execute_sql (atau psql) sekali. 'ALL PASS' = lolos.
-- Konstanta dev (project fhnqwytqprsptjshoxfn): org=4b07a19f-550d-4952-b0d8-44f38f651d89

begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_member uuid    := '99999999-0000-0000-0000-aaaa00000001';
  v_nonmember uuid := '99999999-0000-0000-0000-aaaa00000002';
  v_author uuid    := '99999999-0000-0000-0000-aaaa00000003';
  v_ini1 uuid := '99999999-0000-0000-0000-bbbb00000001';
  v_ini2 uuid := '99999999-0000-0000-0000-bbbb00000002';
  v_ini3 uuid := '99999999-0000-0000-0000-bbbb00000003';
  v_ini4 uuid := '99999999-0000-0000-0000-bbbb00000004';
  v_room1 uuid := '99999999-0000-0000-0000-cccc00000001';
  v_room2 uuid := '99999999-0000-0000-0000-cccc00000002';
  v_room3 uuid := '99999999-0000-0000-0000-cccc00000003';
  v_room4 uuid := '99999999-0000-0000-0000-cccc00000004';
  fails text := '';
  rec record;
  n int;
  v_first uuid;
  v_last uuid;
begin
  -- Seed (privileged): users + profiles + initiatives status=draft (trigger tg_initiative_chat_room
  -- hanya buat room saat status=active → di sini tidak fire).
  insert into auth.users(id) values (v_member),(v_nonmember),(v_author)
    on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_member,    v_org, 'Member Test',  true),
    (v_nonmember, v_org, 'Non Member',   true),
    (v_author,    v_org, 'Budi Author',  true)
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    full_name = excluded.full_name,
    is_active = true;

  insert into public.initiatives(id, organization_id, name, status, created_by) values
    (v_ini1, v_org, 'Ini1',            'draft', v_author),
    (v_ini2, v_org, 'Ini2-Empty',      'draft', v_author),
    (v_ini3, v_org, 'Ini3-NullAuthor', 'draft', v_author),
    (v_ini4, v_org, 'Ini4-Tie',        'draft', v_author);

  insert into public.chat_rooms(id, organization_id, initiative_id, name) values
    (v_room1, v_org, v_ini1, 'Room 1 - Latest Msg'),
    (v_room2, v_org, v_ini2, 'Room 2 - Empty'),
    (v_room3, v_org, v_ini3, 'Room 3 - Null Author'),
    (v_room4, v_org, v_ini4, 'Room 4 - Tie');

  insert into public.chat_room_members(chat_room_id, member_id) values
    (v_room1, v_member), (v_room2, v_member), (v_room3, v_member), (v_room4, v_member);
  -- v_nonmember sengaja tidak diset sebagai anggota room manapun.

  -- Room1: 2 pesan, terbaru = 'pesan terbaru' oleh Budi Author (2026-06-24).
  insert into public.chat_messages(id, organization_id, chat_room_id, author_id, body, created_at) values
    ('99999999-0000-0000-0000-dddd00000010', v_org, v_room1, v_author, 'pesan lama',    '2026-06-20T01:00:00Z'),
    ('99999999-0000-0000-0000-dddd00000020', v_org, v_room1, v_author, 'pesan terbaru', '2026-06-24T05:00:00Z');
  -- Room2: kosong.
  -- Room3: 1 pesan, author_id NULL (mis. sistem / profil terhapus).
  insert into public.chat_messages(id, organization_id, chat_room_id, author_id, body, created_at) values
    ('99999999-0000-0000-0000-dddd00000030', v_org, v_room3, null, 'sistem update', '2026-06-23T03:00:00Z');
  -- Room4: 2 pesan created_at SAMA, beda id → id desc (ff > 40) → 'tie B' menang.
  insert into public.chat_messages(id, organization_id, chat_room_id, author_id, body, created_at) values
    ('99999999-0000-0000-0000-dddd00000040', v_org, v_room4, v_author, 'tie A (id rendah)',           '2026-06-22T02:00:00Z'),
    ('99999999-0000-0000-0000-dddd000000ff', v_org, v_room4, v_author, 'tie B (id tinggi → menang)', '2026-06-22T02:00:00Z');

  execute 'set local role authenticated';

  ------------------------------- v_member context -------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member::text, 'role','authenticated')::text, true);

  select count(*) into n from public.get_chat_rooms()
    where id in (v_room1, v_room2, v_room3, v_room4);
  if n <> 4 then fails := fails || format('T1_count:%s; ', n); end if;

  -- T1: room1 preview konsisten.
  select * into rec from public.get_chat_rooms() where id = v_room1;
  if rec.last_message_body is distinct from 'pesan terbaru' then
    fails := fails || format('T1_body:%s; ', rec.last_message_body);
  end if;
  if rec.last_message_author_name is distinct from 'Budi Author' then
    fails := fails || format('T1_author:%s; ', rec.last_message_author_name);
  end if;
  if rec.last_message_at is null then fails := fails || 'T1_at_null; '; end if;

  -- T3: empty room → 3 nullable null, room muncul.
  select * into rec from public.get_chat_rooms() where id = v_room2;
  if rec.id is null then fails := fails || 'T3_missing; '; end if;
  if rec.last_message_at is not null
     or rec.last_message_body is not null
     or rec.last_message_author_name is not null then
    fails := fails || format('T3_not_null: at=%s body=%s name=%s; ',
      rec.last_message_at, rec.last_message_body, rec.last_message_author_name);
  end if;

  -- T4: null author → name null, body tetap.
  select * into rec from public.get_chat_rooms() where id = v_room3;
  if rec.last_message_body is distinct from 'sistem update' then
    fails := fails || format('T4_body:%s; ', rec.last_message_body);
  end if;
  if rec.last_message_author_name is not null then
    fails := fails || format('T4_author_should_be_null:%s; ', rec.last_message_author_name);
  end if;

  -- T5: tie → 'tie B' menang (id desc).
  select * into rec from public.get_chat_rooms() where id = v_room4;
  if rec.last_message_body is distinct from 'tie B (id tinggi → menang)' then
    fails := fails || format('T5_tie:%s; ', rec.last_message_body);
  end if;

  -- T6: outer order — pertama=room1 (2026-06-24), terakhir=room2 (null at).
  with ordered as (
    select id, row_number() over () as rn
    from public.get_chat_rooms()
    where id in (v_room1, v_room2, v_room3, v_room4)
  )
  select (select id from ordered where rn = 1),
         (select id from ordered where rn = 4)
  into v_first, v_last;
  if v_first is distinct from v_room1 then fails := fails || format('T6_first:%s; ', v_first); end if;
  if v_last  is distinct from v_room2 then fails := fails || format('T6_last:%s; ',  v_last);  end if;

  ------------------------------- v_nonmember context -------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_nonmember::text, 'role','authenticated')::text, true);

  -- T2: non-member 0 baris (membuktikan gate by is_chat_member, bukan sekadar null auth.uid).
  select count(*) into n from public.get_chat_rooms()
    where id in (v_room1, v_room2, v_room3, v_room4);
  if n <> 0 then fails := fails || format('T2_nonmember_count:%s; ', n); end if;

  if fails = '' then raise notice 'ALL PASS';
  else raise exception '%', fails;
  end if;
end;
$$;
rollback;
