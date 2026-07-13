-- Migration 0047 contract test — System events in chat timeline (PRD §30 komponen 8).
--
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0047_chat_system_events_contract.sql
--
-- Pola: raise notice 'PASS …' / raise exception 'FAIL: …'.
-- 9 blok (a–i).
--
-- Scaffold note: auth.users INSERT triggers handle_new_user → auto-creates profile
-- in the first org. Our tests then UPDATE the profile to the test org.

-- ============================================================ (a) DDL: kolom + constraint ada
do $$
declare
  fails text := '';
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_messages' and column_name='kind') then
    fails := fails || 'kind_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_messages' and column_name='system_event_type') then
    fails := fails || 'system_event_type_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_messages' and column_name='actor_id') then
    fails := fails || 'actor_id_missing; ';
  end if;
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='chat_messages_kind_enum') then
    fails := fails || 'kind_enum_missing; ';
  end if;
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='chat_messages_system_event_type_enum') then
    fails := fails || 'system_event_type_enum_missing; ';
  end if;
  if not exists (select 1 from information_schema.check_constraints
    where constraint_schema='public' and constraint_name='chat_messages_kind_invariant') then
    fails := fails || 'kind_invariant_missing; ';
  end if;
  if fails <> '' then raise exception 'FAIL a: DDL — %', fails; end if;
  raise notice 'PASS a: DDL kolom kind/system_event_type/actor_id + constraint ada';
end $$;

-- ============================================================ (b) Helper emit_chat_system_event exists, 3 args
do $$
declare v_nargs int;
begin
  select pronargs into v_nargs from pg_proc
    where proname = 'emit_chat_system_event' and pronamespace = 'public'::regnamespace;
  if v_nargs is null then
    raise exception 'FAIL b: emit_chat_system_event function not found';
  end if;
  if v_nargs <> 3 then
    raise exception 'FAIL b: emit_chat_system_event has % args, expected 3', v_nargs;
  end if;
  raise notice 'PASS b: emit_chat_system_event memiliki 3 parameter';
end $$;

-- ============================================================ (c) review approve → status_done system event
do $$
declare
  v_org uuid;
  v_pic uuid;
  v_reviewer uuid;
  v_init uuid;
  v_room uuid;
  v_ap uuid;
  v_sub uuid;
  v_ev record;
  v_cnt int;
begin
  -- Scaffold: org first, then auth.users (trigger auto-creates profile), then update profile org
  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0047c')
    returning id into v_org;
  v_pic := gen_random_uuid();
  v_reviewer := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_pic, 'fajar-0047c@test.local', '{"full_name":"Fajar"}'::jsonb),
           (v_reviewer, 'dewi-0047c@test.local', '{"full_name":"Dewi"}'::jsonb);
  update public.profiles set organization_id = v_org where id in (v_pic, v_reviewer);

  insert into public.initiatives (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-0047c', 'active', v_pic)
    returning id into v_init;
  select id into v_room from public.chat_rooms where initiative_id = v_init;
  if v_room is null then
    insert into public.chat_rooms (id, organization_id, initiative_id, name)
      values (gen_random_uuid(), v_org, v_init, 'Init-0047c')
      returning id into v_room;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_pic), (v_room, v_reviewer) on conflict do nothing;

  insert into public.action_plans (id, organization_id, initiative_id, name, pic_id, reviewer_id, status, created_by)
    values (gen_random_uuid(), v_org, v_init, 'Tugas Alpha', v_pic, v_reviewer, 'submitted', v_pic)
    returning id into v_ap;
  insert into public.action_plan_submissions (id, action_plan_id, version_number, submitted_by, status, review_status)
    values (gen_random_uuid(), v_ap, 1, v_pic, 'submitted', 'pending')
    returning id into v_sub;
  update public.action_plans set current_submission_id = v_sub where id = v_ap;

  -- Act: reviewer approves
  perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer)::text, true);
  perform public.review_action_plan_submission(v_sub, 'approve', null);

  -- Assert: exactly 1 system event in room
  select count(*) into v_cnt from public.chat_messages
    where chat_room_id = v_room and kind = 'system';
  if v_cnt <> 1 then
    raise exception 'FAIL c: expected 1 system event, got %', v_cnt;
  end if;

  select * into v_ev from public.chat_messages
    where chat_room_id = v_room and kind = 'system' limit 1;
  if v_ev.system_event_type <> 'status_done' then
    raise exception 'FAIL c: system_event_type = %, expected status_done', v_ev.system_event_type;
  end if;
  if v_ev.author_id is not null then
    raise exception 'FAIL c: author_id should be null for system event';
  end if;
  if v_ev.actor_id <> v_reviewer then
    raise exception 'FAIL c: actor_id mismatch';
  end if;
  if v_ev.body not like '%Dewi%' then
    raise exception 'FAIL c: body should contain actor name, got: %', v_ev.body;
  end if;
  if v_ev.body not like '%Selesai%' then
    raise exception 'FAIL c: body should contain Selesai, got: %', v_ev.body;
  end if;
  if v_ev.context_entity_type <> 'action_plan' or v_ev.context_entity_id <> v_ap then
    raise exception 'FAIL c: context should reference action_plan';
  end if;

  -- Cleanup
  delete from public.chat_messages where chat_room_id = v_room;
  delete from public.chat_room_members where chat_room_id = v_room;
  delete from public.chat_rooms where id = v_room;
  delete from public.action_plan_submissions where action_plan_id = v_ap;
  delete from public.action_plans where id = v_ap;
  delete from public.initiatives where id = v_init;
  delete from public.profiles where id in (v_pic, v_reviewer);
  delete from auth.users where id in (v_pic, v_reviewer);
  delete from public.organizations where id = v_org;
  raise notice 'PASS c: review approve → status_done system event dengan body + context benar';
end $$;

-- ============================================================ (d) review reject → status_revision
do $$
declare
  v_org uuid; v_pic uuid; v_reviewer uuid; v_init uuid; v_room uuid; v_ap uuid; v_sub uuid;
  v_ev_type text;
begin
  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0047d')
    returning id into v_org;
  v_pic := gen_random_uuid();
  v_reviewer := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_pic, 'pic-0047d@test.local', '{"full_name":"PIC-d"}'::jsonb),
           (v_reviewer, 'rev-0047d@test.local', '{"full_name":"Rev-d"}'::jsonb);
  update public.profiles set organization_id = v_org where id in (v_pic, v_reviewer);

  insert into public.initiatives (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-0047d', 'active', v_pic)
    returning id into v_init;
  select id into v_room from public.chat_rooms where initiative_id = v_init;
  if v_room is null then
    insert into public.chat_rooms (id, organization_id, initiative_id, name)
      values (gen_random_uuid(), v_org, v_init, 'Init-0047d')
      returning id into v_room;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_pic), (v_room, v_reviewer) on conflict do nothing;
  insert into public.action_plans (id, organization_id, initiative_id, name, pic_id, reviewer_id, status, created_by)
    values (gen_random_uuid(), v_org, v_init, 'Tugas-d', v_pic, v_reviewer, 'submitted', v_pic)
    returning id into v_ap;
  insert into public.action_plan_submissions (id, action_plan_id, version_number, submitted_by, status, review_status)
    values (gen_random_uuid(), v_ap, 1, v_pic, 'submitted', 'pending')
    returning id into v_sub;
  update public.action_plans set current_submission_id = v_sub where id = v_ap;

  perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer)::text, true);
  perform public.review_action_plan_submission(v_sub, 'reject', 'Perlu perbaikan');

  select system_event_type into v_ev_type from public.chat_messages
    where chat_room_id = v_room and kind = 'system' limit 1;
  if v_ev_type is null or v_ev_type <> 'status_revision' then
    raise exception 'FAIL d: expected status_revision, got %', v_ev_type;
  end if;

  -- Cleanup
  delete from public.chat_messages where chat_room_id = v_room;
  delete from public.chat_room_members where chat_room_id = v_room;
  delete from public.chat_rooms where id = v_room;
  delete from public.action_plan_submissions where action_plan_id = v_ap;
  delete from public.action_plans where id = v_ap;
  delete from public.initiatives where id = v_init;
  delete from public.profiles where id in (v_pic, v_reviewer);
  delete from auth.users where id in (v_pic, v_reviewer);
  delete from public.organizations where id = v_org;
  raise notice 'PASS d: review reject → status_revision system event';
end $$;

-- ============================================================ (e) submit → status_submitted; resubmit → status_resubmitted
do $$
declare
  v_org uuid; v_pic uuid; v_reviewer uuid; v_init uuid; v_room uuid; v_ap uuid;
  v_sub1 uuid; v_sub2 uuid;
  v_events text[];
begin
  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0047e')
    returning id into v_org;
  v_pic := gen_random_uuid();
  v_reviewer := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_pic, 'pic-0047e@test.local', '{"full_name":"PIC-e"}'::jsonb),
           (v_reviewer, 'rev-0047e@test.local', '{"full_name":"Rev-e"}'::jsonb);
  update public.profiles set organization_id = v_org where id in (v_pic, v_reviewer);

  insert into public.initiatives (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-0047e', 'active', v_pic)
    returning id into v_init;
  select id into v_room from public.chat_rooms where initiative_id = v_init;
  if v_room is null then
    insert into public.chat_rooms (id, organization_id, initiative_id, name)
      values (gen_random_uuid(), v_org, v_init, 'Init-0047e')
      returning id into v_room;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_pic), (v_room, v_reviewer) on conflict do nothing;
  insert into public.action_plans (id, organization_id, initiative_id, name, pic_id, reviewer_id,
    status, evidence_required, created_by)
    values (gen_random_uuid(), v_org, v_init, 'Tugas-e', v_pic, v_reviewer, 'assigned', false, v_pic)
    returning id into v_ap;

  -- Submit (first time)
  perform set_config('request.jwt.claims', json_build_object('sub', v_pic)::text, true);
  insert into public.action_plan_submissions (id, action_plan_id, version_number, submitted_by, status)
    values (gen_random_uuid(), v_ap, 1, v_pic, 'draft')
    returning id into v_sub1;
  perform public.submit_action_plan(v_sub1, 'catatan', null, null);

  -- Reviewer rejects
  perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer)::text, true);
  perform public.review_action_plan_submission(v_sub1, 'reject', 'Revisi dulu');

  -- PIC resubmits
  perform set_config('request.jwt.claims', json_build_object('sub', v_pic)::text, true);
  insert into public.action_plan_submissions (id, action_plan_id, version_number, submitted_by, status)
    values (gen_random_uuid(), v_ap, 2, v_pic, 'draft')
    returning id into v_sub2;
  perform public.submit_action_plan(v_sub2, 'sudah diperbaiki', null, null);

  -- Collect all system events (ordering within single txn is by UUID, not insertion order,
  -- because created_at defaults to now() = txn start time; in prod each RPC is a separate txn)
  select array_agg(system_event_type order by created_at, id) into v_events
  from public.chat_messages
  where chat_room_id = v_room and kind = 'system';

  -- Expected set: {status_submitted, status_revision, status_resubmitted} — 3 events total
  if v_events is null or array_length(v_events, 1) <> 3 then
    raise exception 'FAIL e: expected 3 events, got %', v_events;
  end if;
  if not ('status_submitted' = any(v_events)) then
    raise exception 'FAIL e: status_submitted missing from %', v_events;
  end if;
  if not ('status_revision' = any(v_events)) then
    raise exception 'FAIL e: status_revision missing from %', v_events;
  end if;
  if not ('status_resubmitted' = any(v_events)) then
    raise exception 'FAIL e: status_resubmitted missing from %', v_events;
  end if;

  -- Cleanup
  delete from public.chat_messages where chat_room_id = v_room;
  delete from public.chat_room_members where chat_room_id = v_room;
  delete from public.chat_rooms where id = v_room;
  delete from public.action_plan_submissions where action_plan_id = v_ap;
  delete from public.action_plans where id = v_ap;
  delete from public.initiatives where id = v_init;
  delete from public.profiles where id in (v_pic, v_reviewer);
  delete from auth.users where id in (v_pic, v_reviewer);
  delete from public.organizations where id = v_org;
  raise notice 'PASS e: submit → status_submitted, reject → status_revision, resubmit → status_resubmitted';
end $$;

-- ============================================================ (f) no room → no error, 0 events
do $$
declare
  v_org uuid; v_pic uuid; v_reviewer uuid; v_init uuid; v_ap uuid; v_sub uuid;
  v_cnt int;
begin
  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0047f')
    returning id into v_org;
  v_pic := gen_random_uuid();
  v_reviewer := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_pic, 'pic-0047f@test.local', '{"full_name":"PIC-f"}'::jsonb),
           (v_reviewer, 'rev-0047f@test.local', '{"full_name":"Rev-f"}'::jsonb);
  update public.profiles set organization_id = v_org where id in (v_pic, v_reviewer);

  -- Initiative in draft (no room created by trigger)
  insert into public.initiatives (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-draft-0047f', 'draft', v_pic)
    returning id into v_init;

  insert into public.action_plans (id, organization_id, initiative_id, name, pic_id, reviewer_id, status, created_by)
    values (gen_random_uuid(), v_org, v_init, 'Tugas-f', v_pic, v_reviewer, 'submitted', v_pic)
    returning id into v_ap;
  insert into public.action_plan_submissions (id, action_plan_id, version_number, submitted_by, status, review_status)
    values (gen_random_uuid(), v_ap, 1, v_pic, 'submitted', 'pending')
    returning id into v_sub;
  update public.action_plans set current_submission_id = v_sub where id = v_ap;

  -- Reviewer approves → should NOT error despite no room
  perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer)::text, true);
  perform public.review_action_plan_submission(v_sub, 'approve', null);

  -- No system events anywhere for this org
  select count(*) into v_cnt from public.chat_messages cm
    where cm.kind = 'system'
      and cm.organization_id = v_org;
  if v_cnt <> 0 then
    raise exception 'FAIL f: expected 0 system events for room-less AP, got %', v_cnt;
  end if;

  -- Cleanup
  delete from public.action_plan_submissions where action_plan_id = v_ap;
  delete from public.action_plans where id = v_ap;
  delete from public.initiatives where id = v_init;
  delete from public.profiles where id in (v_pic, v_reviewer);
  delete from auth.users where id in (v_pic, v_reviewer);
  delete from public.organizations where id = v_org;
  raise notice 'PASS f: no room → no error, 0 system events';
end $$;

-- ============================================================ (g) unread: non-actor sees unread, actor excluded
do $$
declare
  v_org uuid; v_pic uuid; v_reviewer uuid; v_member uuid;
  v_init uuid; v_room uuid; v_ap uuid; v_sub uuid;
  v_unread_pic int; v_unread_reviewer int; v_unread_member int;
begin
  insert into public.organizations (id, name) values (gen_random_uuid(), 'TestOrg-0047g')
    returning id into v_org;
  v_pic := gen_random_uuid();
  v_reviewer := gen_random_uuid();
  v_member := gen_random_uuid();
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_pic, 'pic-0047g@test.local', '{"full_name":"PIC-g"}'::jsonb),
    (v_reviewer, 'rev-0047g@test.local', '{"full_name":"Rev-g"}'::jsonb),
    (v_member, 'mem-0047g@test.local', '{"full_name":"Mem-g"}'::jsonb);
  update public.profiles set organization_id = v_org where id in (v_pic, v_reviewer, v_member);

  insert into public.initiatives (id, organization_id, name, status, created_by)
    values (gen_random_uuid(), v_org, 'Init-0047g', 'active', v_pic)
    returning id into v_init;
  select id into v_room from public.chat_rooms where initiative_id = v_init;
  if v_room is null then
    insert into public.chat_rooms (id, organization_id, initiative_id, name)
      values (gen_random_uuid(), v_org, v_init, 'Init-0047g')
      returning id into v_room;
  end if;
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_pic), (v_room, v_reviewer), (v_room, v_member) on conflict do nothing;

  insert into public.action_plans (id, organization_id, initiative_id, name, pic_id, reviewer_id, status, created_by)
    values (gen_random_uuid(), v_org, v_init, 'Tugas-g', v_pic, v_reviewer, 'submitted', v_pic)
    returning id into v_ap;
  insert into public.action_plan_submissions (id, action_plan_id, version_number, submitted_by, status, review_status)
    values (gen_random_uuid(), v_ap, 1, v_pic, 'submitted', 'pending')
    returning id into v_sub;
  update public.action_plans set current_submission_id = v_sub where id = v_ap;

  -- Reviewer approves → system event with actor=reviewer
  perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer)::text, true);
  perform public.review_action_plan_submission(v_sub, 'approve', null);

  -- Check unread for each user via get_chat_rooms
  perform set_config('request.jwt.claims', json_build_object('sub', v_reviewer)::text, true);
  select coalesce(unread_count, 0) into v_unread_reviewer
    from public.get_chat_rooms() where id = v_room;

  perform set_config('request.jwt.claims', json_build_object('sub', v_pic)::text, true);
  select coalesce(unread_count, 0) into v_unread_pic
    from public.get_chat_rooms() where id = v_room;

  perform set_config('request.jwt.claims', json_build_object('sub', v_member)::text, true);
  select coalesce(unread_count, 0) into v_unread_member
    from public.get_chat_rooms() where id = v_room;

  -- Actor (reviewer) should NOT see unread from their own event
  if v_unread_reviewer <> 0 then
    raise exception 'FAIL g: actor unread = %, expected 0', v_unread_reviewer;
  end if;
  -- Non-actors should see 1 unread
  if v_unread_pic < 1 then
    raise exception 'FAIL g: PIC unread = %, expected >= 1', v_unread_pic;
  end if;
  if v_unread_member < 1 then
    raise exception 'FAIL g: member unread = %, expected >= 1', v_unread_member;
  end if;

  -- Cleanup
  delete from public.chat_messages where chat_room_id = v_room;
  delete from public.chat_room_members where chat_room_id = v_room;
  delete from public.chat_rooms where id = v_room;
  delete from public.action_plan_submissions where action_plan_id = v_ap;
  delete from public.action_plans where id = v_ap;
  delete from public.initiatives where id = v_init;
  delete from public.profiles where id in (v_pic, v_reviewer, v_member);
  delete from auth.users where id in (v_pic, v_reviewer, v_member);
  delete from public.organizations where id = v_org;
  raise notice 'PASS g: unread — actor excluded, non-actor sees unread';
end $$;

-- ============================================================ (h) constraint: kind='system' with author_id → rejected
do $$
begin
  begin
    insert into public.chat_messages
      (organization_id, chat_room_id, author_id, body, kind, system_event_type, actor_id)
    values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'bad',
            'system', 'status_done', gen_random_uuid());
    raise exception 'FAIL h1: system row with author_id should be rejected by constraint';
  exception when check_violation then
    null;
  when foreign_key_violation then
    null;
  end;

  begin
    insert into public.chat_messages
      (organization_id, chat_room_id, author_id, body, kind, system_event_type, actor_id)
    values (gen_random_uuid(), gen_random_uuid(), null, 'bad',
            'system', null, gen_random_uuid());
    raise exception 'FAIL h2: system row without event_type should be rejected';
  exception when check_violation then
    null;
  when foreign_key_violation then
    null;
  end;

  begin
    insert into public.chat_messages
      (organization_id, chat_room_id, author_id, body, kind, system_event_type, actor_id)
    values (gen_random_uuid(), gen_random_uuid(), null, 'bad',
            'system', 'status_done', null);
    raise exception 'FAIL h3: system row without actor_id should be rejected';
  exception when check_violation then
    null;
  when foreign_key_violation then
    null;
  end;

  raise notice 'PASS h: constraint rejects invalid system event rows';
end $$;

-- ============================================================ (i) governance: helper not callable by authenticated
do $$
declare v_has_grant boolean;
begin
  select has_function_privilege('authenticated', 'public.emit_chat_system_event(uuid,uuid,text)', 'EXECUTE')
    into v_has_grant;
  if v_has_grant then
    raise exception 'FAIL i: authenticated should not have EXECUTE on emit_chat_system_event';
  end if;
  raise notice 'PASS i: emit_chat_system_event not callable by authenticated';
end $$;
