-- Migration 0046 contract test — chat_message context & reply_to (PRD §30 rule 2 + komponen 10).
--
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0046_chat_message_context_reply_contract.sql
--
-- Pola: raise notice 'PASS …' / raise exception 'FAIL: …'.
-- 7 blok (a–g) sesuai spec §10 Tahap 1.

-- ============================================================ (a) DDL: kolom + constraint ada
do $$
declare
  fails text := '';
  v_cnt int;
begin
  -- Kolom baru ada
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_messages' and column_name='context_entity_type') then
    fails := fails || 'context_entity_type_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_messages' and column_name='context_entity_id') then
    fails := fails || 'context_entity_id_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_messages' and column_name='context_label') then
    fails := fails || 'context_label_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_messages' and column_name='reply_to_message_id') then
    fails := fails || 'reply_to_message_id_missing; ';
  end if;

  -- Constraint pair check
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='chat_messages_context_pair') then
    fails := fails || 'context_pair_check_missing; ';
  end if;

  -- Constraint label requires pair
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='chat_messages_context_label_requires_pair') then
    fails := fails || 'context_label_requires_pair_check_missing; ';
  end if;

  -- Constraint entity_type enum
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='chat_messages_context_entity_type_enum') then
    fails := fails || 'context_entity_type_enum_check_missing; ';
  end if;

  -- FK reply_to_message_id → chat_messages(id)
  if not exists (
    select 1 from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    where tc.table_schema='public' and tc.table_name='chat_messages'
      and rc.delete_rule = 'SET NULL'
      and exists (
        select 1 from information_schema.key_column_usage kcu
        where kcu.constraint_name = rc.constraint_name and kcu.column_name = 'reply_to_message_id'
      )
  ) then fails := fails || 'fk_reply_to_set_null_missing; '; end if;

  if fails <> '' then raise exception 'FAIL a: DDL kolom/constraint — %', fails; end if;
  raise notice 'PASS a: DDL kolom + constraint + FK reply_to ada';
end $$;

-- ============================================================ (b) send_chat_message signature (6→7 param after 0103)
-- 0059 took it 5→6 (p_attachments); 0103 adds p_client_request_id (7th, default null)
-- for write idempotency. The extra trailing default-param leaves existing positional
-- calls below (4–6 args) working unchanged.
do $$
declare
  v_nargs int;
begin
  select pronargs into v_nargs from pg_proc
    where proname = 'send_chat_message' and pronamespace = 'public'::regnamespace;
  if v_nargs is null then
    raise exception 'FAIL b: send_chat_message function not found';
  end if;
  if v_nargs <> 7 then
    raise exception 'FAIL b: send_chat_message has % args, expected 7 (after 0103)', v_nargs;
  end if;
  raise notice 'PASS b: send_chat_message memiliki 7 parameter (v3 after 0103)';
end $$;

-- ============================================================ (c) send konteks sah → context_label = server snapshot nama AP
do $$
declare
  v_org uuid;
  v_user1 uuid;
  v_user2 uuid;
  v_init uuid;
  v_room uuid;
  v_ap uuid;
  v_msg_id uuid;
  v_row record;
begin
  -- Cleanup stale data from previous runs
  delete from auth.users where email in ('alice-0046c@test.local', 'bob-0046c@test.local');

  -- Scaffold: org, 2 users, initiative aktif + room, AP turunan
  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0046c')
    returning id into v_org;
  v_user1 := gen_random_uuid();
  v_user2 := gen_random_uuid();
  -- raw_app_meta_data.organization_id wajib sejak 0083: handle_new_user menolak
  -- menebak org, dan prelude fixtures sudah membuat dua org.
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (v_user1, 'alice-0046c@test.local', jsonb_build_object('full_name', 'Alice'), jsonb_build_object('organization_id', v_org)),
           (v_user2, 'bob-0046c@test.local', jsonb_build_object('full_name', 'Bob'), jsonb_build_object('organization_id', v_org));
  update public.profiles set organization_id = v_org where id in (v_user1, v_user2);

  insert into public.action_plans (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-0046c', 'active', v_user1)
    returning id into v_init;

  -- Room dibuat oleh trigger initiative_chat_room (status active) — ambil id
  select id into v_room from public.chat_rooms where action_plan_id = v_init;
  if v_room is null then
    -- Fallback: buat manual (trigger mungkin gagal jika user1 bukan pic)
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (gen_random_uuid(), v_org, v_init, 'Init-0046c')
      returning id into v_room;
  end if;

  -- Pastikan user1 member room
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_user1) on conflict do nothing;

  -- AP di bawah Initiative
  insert into public.tasks (id, organization_id, action_plan_id, name, pic_id, reviewer_id, status, created_by)
    values (gen_random_uuid(), v_org, v_init, 'Tugas Alpha', v_user1, v_user2, 'assigned', v_user1)
    returning id into v_ap;

  -- Set auth.uid() ke user1
  perform set_config('request.jwt.claims', json_build_object('sub', v_user1)::text, true);

  -- Kirim pesan dengan konteks
  select public.send_chat_message(v_room, 'mau tanya soal tugas ini', '{}', v_ap, null) into v_msg_id;

  -- Verifikasi
  select * into v_row from public.chat_messages where id = v_msg_id;
  if v_row.context_entity_type <> 'task' then
    raise exception 'FAIL c: context_entity_type = %, expected action_plan', v_row.context_entity_type;
  end if;
  if v_row.context_entity_id <> v_ap then
    raise exception 'FAIL c: context_entity_id mismatch';
  end if;
  if v_row.context_label <> 'Tugas Alpha' then
    raise exception 'FAIL c: context_label = %, expected Tugas Alpha (server snapshot)', v_row.context_label;
  end if;

  -- Cleanup
  delete from public.organizations where id = v_org;
  delete from auth.users where email in ('alice-0046c@test.local', 'bob-0046c@test.local');

  raise notice 'PASS c: konteks sah → context_label = server snapshot nama AP';
end $$;

-- ============================================================ (d) cross-Initiative → exception
do $$
declare
  v_org uuid;
  v_user1 uuid;
  v_init1 uuid;
  v_init2 uuid;
  v_room1 uuid;
  v_ap2 uuid;
begin
  -- Cleanup stale data from previous runs
  delete from auth.users where email = 'carol-0046d@test.local';

  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0046d')
    returning id into v_org;
  v_user1 := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (v_user1, 'carol-0046d@test.local', jsonb_build_object('full_name', 'Carol'), jsonb_build_object('organization_id', v_org));
  update public.profiles set organization_id = v_org where id in (v_user1);

  -- Init 1 + room
  insert into public.action_plans (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-1', 'active', v_user1)
    returning id into v_init1;
  select id into v_room1 from public.chat_rooms where action_plan_id = v_init1;
  if v_room1 is null then
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (gen_random_uuid(), v_org, v_init1, 'Init-1')
      returning id into v_room1;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room1, v_user1) on conflict do nothing;

  -- Init 2 + AP di bawah Init 2
  insert into public.action_plans (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-2', 'active', v_user1)
    returning id into v_init2;
  insert into public.tasks (id, organization_id, action_plan_id, name, pic_id, reviewer_id, status, created_by)
    values (gen_random_uuid(), v_org, v_init2, 'AP-Init2', v_user1, null, 'assigned', v_user1)
    returning id into v_ap2;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user1)::text, true);

  -- Kirim ke room Init-1 dengan konteks AP milik Init-2 → HARUS gagal
  begin
    perform public.send_chat_message(v_room1, 'test cross', '{}', v_ap2, null);
    delete from public.organizations where id = v_org;
    raise exception 'FAIL d: cross-Initiative context seharusnya ditolak';
  exception when others then
    if sqlerrm not like '%Action Plan%' then
      delete from public.organizations where id = v_org;
      raise exception 'FAIL d: error message tidak sesuai: %', sqlerrm;
    end if;
  end;

  delete from public.organizations where id = v_org;
  delete from auth.users where email = 'carol-0046d@test.local';
  raise notice 'PASS d: cross-Initiative context → exception';
end $$;

-- ============================================================ (e) reply_to cross-room → exception
do $$
declare
  v_org uuid;
  v_user1 uuid;
  v_init1 uuid;
  v_init2 uuid;
  v_room1 uuid;
  v_room2 uuid;
  v_msg_other uuid;
begin
  -- Cleanup stale data from previous runs
  delete from auth.users where email = 'dave-0046e@test.local';

  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0046e')
    returning id into v_org;
  v_user1 := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (v_user1, 'dave-0046e@test.local', jsonb_build_object('full_name', 'Dave'), jsonb_build_object('organization_id', v_org));
  update public.profiles set organization_id = v_org where id in (v_user1);

  -- Room 1
  insert into public.action_plans (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-e1', 'active', v_user1)
    returning id into v_init1;
  select id into v_room1 from public.chat_rooms where action_plan_id = v_init1;
  if v_room1 is null then
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (gen_random_uuid(), v_org, v_init1, 'Init-e1')
      returning id into v_room1;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room1, v_user1) on conflict do nothing;

  -- Room 2 + pesan di room 2
  insert into public.action_plans (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-e2', 'active', v_user1)
    returning id into v_init2;
  select id into v_room2 from public.chat_rooms where action_plan_id = v_init2;
  if v_room2 is null then
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (gen_random_uuid(), v_org, v_init2, 'Init-e2')
      returning id into v_room2;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room2, v_user1) on conflict do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user1)::text, true);

  -- Buat pesan di room 2
  select public.send_chat_message(v_room2, 'pesan room 2', '{}', null, null) into v_msg_other;

  -- Reply ke pesan room 2 dari room 1 → HARUS gagal
  begin
    perform public.send_chat_message(v_room1, 'reply spoof', '{}', null, v_msg_other);
    delete from public.organizations where id = v_org;
    raise exception 'FAIL e: cross-room reply_to seharusnya ditolak';
  exception when others then
    if sqlerrm not like '%reply%' and sqlerrm not like '%room%' then
      delete from public.organizations where id = v_org;
      raise exception 'FAIL e: error message tidak sesuai: %', sqlerrm;
    end if;
  end;

  delete from public.organizations where id = v_org;
  delete from auth.users where email = 'dave-0046e@test.local';
  raise notice 'PASS e: cross-room reply_to → exception';
end $$;

-- ============================================================ (f) tanpa param baru = backward compatible (kolom NULL)
do $$
declare
  v_org uuid;
  v_user1 uuid;
  v_init uuid;
  v_room uuid;
  v_msg_id uuid;
  v_row record;
begin
  -- Cleanup stale data from previous runs
  delete from auth.users where email = 'eve-0046f@test.local';

  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0046f')
    returning id into v_org;
  v_user1 := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (v_user1, 'eve-0046f@test.local', jsonb_build_object('full_name', 'Eve'), jsonb_build_object('organization_id', v_org));
  update public.profiles set organization_id = v_org where id in (v_user1);

  insert into public.action_plans (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-f', 'active', v_user1)
    returning id into v_init;
  select id into v_room from public.chat_rooms where action_plan_id = v_init;
  if v_room is null then
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (gen_random_uuid(), v_org, v_init, 'Init-f')
      returning id into v_room;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_user1) on conflict do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user1)::text, true);

  -- Kirim TANPA p_context_action_plan dan p_reply_to (default null)
  select public.send_chat_message(v_room, 'pesan biasa', '{}') into v_msg_id;

  select * into v_row from public.chat_messages where id = v_msg_id;
  if v_row.context_entity_type is not null then
    raise exception 'FAIL f: context_entity_type harus NULL, got %', v_row.context_entity_type;
  end if;
  if v_row.context_entity_id is not null then
    raise exception 'FAIL f: context_entity_id harus NULL';
  end if;
  if v_row.context_label is not null then
    raise exception 'FAIL f: context_label harus NULL';
  end if;
  if v_row.reply_to_message_id is not null then
    raise exception 'FAIL f: reply_to_message_id harus NULL';
  end if;

  delete from public.organizations where id = v_org;
  delete from auth.users where email = 'eve-0046f@test.local';
  raise notice 'PASS f: tanpa param baru → kolom context NULL (backward compatible)';
end $$;

-- ============================================================ (g) reply_to sah (same-room) + konteks + reply bersama
do $$
declare
  v_org uuid;
  v_user1 uuid;
  v_user2 uuid;
  v_init uuid;
  v_room uuid;
  v_ap uuid;
  v_msg1 uuid;
  v_msg2 uuid;
  v_row record;
begin
  -- Cleanup stale data from previous runs
  delete from auth.users where email in ('fay-0046g@test.local', 'gus-0046g@test.local');

  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0046g')
    returning id into v_org;
  v_user1 := gen_random_uuid();
  v_user2 := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
    values (v_user1, 'fay-0046g@test.local', jsonb_build_object('full_name', 'Fay'), jsonb_build_object('organization_id', v_org)),
           (v_user2, 'gus-0046g@test.local', jsonb_build_object('full_name', 'Gus'), jsonb_build_object('organization_id', v_org));
  update public.profiles set organization_id = v_org where id in (v_user1, v_user2);

  insert into public.action_plans (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-g', 'active', v_user1)
    returning id into v_init;
  select id into v_room from public.chat_rooms where action_plan_id = v_init;
  if v_room is null then
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (gen_random_uuid(), v_org, v_init, 'Init-g')
      returning id into v_room;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_user1), (v_room, v_user2) on conflict do nothing;

  insert into public.tasks (id, organization_id, action_plan_id, name, pic_id, reviewer_id, status, created_by)
    values (gen_random_uuid(), v_org, v_init, 'Tugas Beta', v_user1, v_user2, 'assigned', v_user1)
    returning id into v_ap;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user1)::text, true);

  -- Pesan pertama (biasa)
  select public.send_chat_message(v_room, 'halo awal', '{}') into v_msg1;

  -- Pesan kedua: konteks AP + reply ke pesan pertama (keduanya independen, boleh hadir bersama — spec D-2)
  select public.send_chat_message(v_room, 'konteks + reply', '{}', v_ap, v_msg1) into v_msg2;

  select * into v_row from public.chat_messages where id = v_msg2;
  if v_row.context_entity_type <> 'task' then
    raise exception 'FAIL g: context_entity_type mismatch';
  end if;
  if v_row.context_entity_id <> v_ap then
    raise exception 'FAIL g: context_entity_id mismatch';
  end if;
  if v_row.context_label <> 'Tugas Beta' then
    raise exception 'FAIL g: context_label = %, expected Tugas Beta', v_row.context_label;
  end if;
  if v_row.reply_to_message_id <> v_msg1 then
    raise exception 'FAIL g: reply_to_message_id mismatch';
  end if;

  delete from public.organizations where id = v_org;
  delete from auth.users where email in ('fay-0046g@test.local', 'gus-0046g@test.local');
  raise notice 'PASS g: konteks + reply bersama → keduanya tersimpan benar';
end $$;
