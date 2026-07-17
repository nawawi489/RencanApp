-- Fix #64 — Chat Confidential Visibility contract tests.
--
-- Membuktikan 7 permukaan chat (RLS chat_messages, FTS search_chat_messages, preview
-- get_chat_rooms, recompute_chat_room_members, mentions, reactions, reads) menghormati
-- confidential_access_rules pada action plan. Pola: begin;do$$…end$$;rollback; + JWT swap.
--
-- Keputusan owner 2026-07-15: OWNER-A (balik resolusi), OWNER-B (auto-remove non-grantee),
-- OWNER-C (mask hanya last_message_body), OWNER-D (system events dikecualikan), SCOPE-1
-- (mentions+reactions+reads di-scope-in).

-- ============================================================ TEST: all surfaces
begin;
do $$
declare
  v_ceo     uuid := '00000064-0000-0000-0000-000000000001';
  v_pic     uuid := '00000064-0000-0000-0000-000000000002';
  v_grantee uuid := '00000064-0000-0000-0000-000000000003';
  v_viewer  uuid := '00000064-0000-0000-0000-000000000004';
  v_other_ceo uuid := '00000064-0000-0000-0000-000000000005';
  v_org uuid; v_other_org uuid;
  v_role_ceo uuid; v_role_staff uuid; v_other_role_ceo uuid;
  v_ap uuid; v_room uuid; v_msg1 uuid; v_msg2 uuid; v_msg3 uuid; v_sys_msg uuid;
  v_perm_view uuid;
  v_count int; fails text := '';
  v_body text; v_unread int; v_can_anon bool;
begin
  -- ORG + ROLE TEMPLATES (before auth.users so handle_new_user trigger finds them)
  insert into public.organizations (name) values ('T064-Org') returning id into v_org;
  insert into public.role_templates (organization_id, name, level)
    values (v_org, 'CEO', 'ceo') returning id into v_role_ceo;
  insert into public.role_templates (organization_id, name, level)
    values (v_org, 'Staff', 'staff') returning id into v_role_staff;

  -- AUTH.USERS (FK target for profiles; handle_new_user trigger auto-creates profiles)
  insert into auth.users(id) values (v_ceo),(v_pic),(v_grantee),(v_viewer),(v_other_ceo)
    on conflict (id) do nothing;

  -- PROFILES (upsert — trigger may have created stubs)
  insert into public.profiles (id, organization_id, full_name, email, role_template_id, is_active)
    values (v_ceo,     v_org, 'CEO Test',     'ceo@t064.test',     v_role_ceo,   true),
           (v_pic,     v_org, 'PIC Test',     'pic@t064.test',     v_role_staff, true),
           (v_grantee, v_org, 'Grantee Test', 'grantee@t064.test', v_role_staff, true),
           (v_viewer,  v_org, 'Viewer Test',  'viewer@t064.test',  v_role_staff, true)
    on conflict (id) do update set
      organization_id  = excluded.organization_id,
      full_name        = excluded.full_name,
      email            = excluded.email,
      role_template_id = excluded.role_template_id,
      is_active        = excluded.is_active;

  -- PERMISSION: viewer gets view_all_workspace
  insert into public.permissions (key, label) values ('view_all_workspace', 'View All Workspace')
    on conflict (key) do update set label = excluded.label returning id into v_perm_view;
  insert into public.user_permissions (user_id, permission_id) values (v_viewer, v_perm_view)
    on conflict do nothing;

  -- ACTION PLAN (confidential) under org
  insert into public.action_plans (organization_id, name, pic_id, created_by, status)
    values (v_org, '__t064_ap', v_pic, v_pic, 'active') returning id into v_ap;

  -- CHAT ROOM (auto-created by tg_action_plan_chat_room trigger)
  select id into v_room from public.chat_rooms where action_plan_id = v_ap;

  -- CHAT ROOM MEMBERS: pic + viewer + grantee
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_pic), (v_room, v_viewer), (v_room, v_grantee)
    on conflict do nothing;

  -- MESSAGES (3 normal + 1 system)
  insert into public.chat_messages (chat_room_id, organization_id, author_id, body, kind)
    values (v_room, v_org, v_pic, '__t064_msg1', 'user') returning id into v_msg1;
  insert into public.chat_messages (chat_room_id, organization_id, author_id, body, kind)
    values (v_room, v_org, v_pic, '__t064_msg2', 'user') returning id into v_msg2;
  insert into public.chat_messages (chat_room_id, organization_id, author_id, body, kind)
    values (v_room, v_org, v_pic, '__t064_msg3', 'user') returning id into v_msg3;
  insert into public.chat_messages (chat_room_id, organization_id, author_id, body, kind, system_event_type, actor_id)
    values (v_room, v_org, null, '__t064_sys', 'system', 'status_done', v_pic) returning id into v_sys_msg;

  -- MENTIONS on msg1 mentioning viewer
  insert into public.mentions (chat_message_id, mentioned_user_id)
    values (v_msg1, v_viewer);

  -- REACTIONS on msg2 by viewer
  insert into public.chat_message_reactions (chat_message_id, reactor_id, organization_id, emoji)
    values (v_msg2, v_viewer, v_org, (select emoji from public.reaction_emojis limit 1));

  -- READS on msg3 by viewer
  insert into public.chat_message_reads (chat_message_id, reader_id)
    values (v_msg3, v_viewer);

  -- MARK AP AS CONFIDENTIAL
  insert into public.confidential_access_rules (organization_id, entity_type, entity_id, user_id, granted_by)
    values (v_org, 'action_plan', v_ap, v_grantee, v_ceo);

  -- ============================================================ SEED-VALID
  if not exists (select 1 from public.role_templates where id = v_role_ceo and level = 'ceo') then
    raise exception 'SEED-VALID FAIL: role_templates ceo missing';
  end if;
  if not exists (select 1 from public.profiles where id = v_viewer and is_active = true) then
    raise exception 'SEED-VALID FAIL: viewer profile inactive or missing';
  end if;

  -- ============================================================ NEGATIVE-1: viewer SELECT → 0 user messages
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_messages
    where chat_room_id = v_room and kind = 'user';
  if v_count <> 0 then fails := fails || 'NEG1_viewer_saw_' || v_count || '_user_msgs; '; end if;

  execute 'reset role';

  -- ============================================================ POSITIVE-6: viewer sees system events (OWNER-D)
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_messages
    where chat_room_id = v_room and kind = 'system';
  if v_count <> 1 then fails := fails || 'POS6_system_event_count=' || v_count || '_expected_1; '; end if;

  execute 'reset role';

  -- ============================================================ POSITIVE-1: PIC SELECT → 4
  perform set_config('request.jwt.claims', json_build_object('sub', v_pic, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_messages where chat_room_id = v_room;
  if v_count <> 4 then fails := fails || 'POS1_pic_count=' || v_count || '_expected_4; '; end if;

  execute 'reset role';

  -- ============================================================ POSITIVE-2: grantee SELECT → 4
  perform set_config('request.jwt.claims', json_build_object('sub', v_grantee, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_messages where chat_room_id = v_room;
  if v_count <> 4 then fails := fails || 'POS2_grantee_count=' || v_count || '_expected_4; '; end if;

  execute 'reset role';

  -- ============================================================ POSITIVE-3: CEO SELECT → 4
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_messages where chat_room_id = v_room;
  if v_count <> 4 then fails := fails || 'POS3_ceo_count=' || v_count || '_expected_4; '; end if;

  execute 'reset role';

  -- ============================================================ NEGATIVE-2: viewer FTS → 0
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.search_chat_messages(
    p_query := '__t064_msg', p_limit := 50
  );
  if v_count <> 0 then fails := fails || 'NEG2_fts_viewer=' || v_count || '; '; end if;

  execute 'reset role';

  -- ============================================================ POSITIVE-4: PIC FTS → 3
  perform set_config('request.jwt.claims', json_build_object('sub', v_pic, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.search_chat_messages(
    p_query := '__t064_msg', p_limit := 50
  );
  if v_count <> 3 then fails := fails || 'POS4_fts_pic=' || v_count || '_expected_3; '; end if;

  execute 'reset role';

  -- ============================================================ PREVIEW MASK: viewer body NULL (OWNER-C)
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select last_message_body, unread_count into v_body, v_unread
    from public.get_chat_rooms() where id = v_room;
  if v_body is not null then fails := fails || 'PREVIEW_body_not_masked; '; end if;

  execute 'reset role';

  -- ============================================================ PREVIEW OK: PIC body NOT NULL
  perform set_config('request.jwt.claims', json_build_object('sub', v_pic, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select last_message_body into v_body
    from public.get_chat_rooms() where id = v_room;
  if v_body is null then fails := fails || 'PREVIEW_pic_body_null; '; end if;

  execute 'reset role';

  -- ============================================================ NEGATIVE-3: viewer mentions leak → 0
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.mentions
    where chat_message_id in (v_msg1, v_msg2, v_msg3);
  if v_count <> 0 then fails := fails || 'NEG3_mentions_leak=' || v_count || '; '; end if;

  execute 'reset role';

  -- ============================================================ NEGATIVE-4: viewer reactions leak → 0
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_message_reactions
    where chat_message_id in (v_msg1, v_msg2, v_msg3);
  if v_count <> 0 then fails := fails || 'NEG4_reactions_leak=' || v_count || '; '; end if;

  execute 'reset role';

  -- ============================================================ NEGATIVE-5: viewer reads leak → 0
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_message_reads
    where chat_message_id in (v_msg1, v_msg2, v_msg3);
  if v_count <> 0 then fails := fails || 'NEG5_reads_leak=' || v_count || '; '; end if;

  execute 'reset role';

  -- ============================================================ CROSS-ORG: other CEO → 0
  insert into public.organizations (name) values ('T064-OtherOrg') returning id into v_other_org;
  insert into public.role_templates (organization_id, name, level)
    values (v_other_org, 'CEO', 'ceo') returning id into v_other_role_ceo;
  insert into public.profiles (id, organization_id, full_name, email, role_template_id, is_active)
    values (v_other_ceo, v_other_org, 'Other CEO', 'ceo@other.test', v_other_role_ceo, true)
    on conflict (id) do update set
      organization_id  = excluded.organization_id,
      full_name        = excluded.full_name,
      email            = excluded.email,
      role_template_id = excluded.role_template_id,
      is_active        = excluded.is_active;
  insert into public.user_permissions (user_id, permission_id) values (v_other_ceo, v_perm_view)
    on conflict do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.chat_messages where chat_room_id = v_room;
  if v_count <> 0 then fails := fails || 'CROSSORG_rls=' || v_count || '; '; end if;

  select count(*) into v_count from public.search_chat_messages(p_query := '__t064_msg', p_limit := 50);
  if v_count <> 0 then fails := fails || 'CROSSORG_fts=' || v_count || '; '; end if;

  execute 'reset role';

  -- ============================================================ POSITIVE-5: recompute removes viewer
  perform public.recompute_chat_room_members(v_room);
  select count(*) into v_count from public.chat_room_members
    where chat_room_id = v_room and member_id = v_viewer;
  if v_count <> 0 then fails := fails || 'POS5_recompute_viewer_still_member; '; end if;

  select count(*) into v_count from public.chat_room_members
    where chat_room_id = v_room and member_id = v_pic;
  if v_count <> 1 then fails := fails || 'POS5_recompute_pic_missing; '; end if;

  -- ============================================================ GRANT-PARITY: anon cannot execute search_chat_messages
  select has_function_privilege('anon', 'public.search_chat_messages(text,uuid,int,timestamptz,uuid)', 'EXECUTE')
    into v_can_anon;
  if v_can_anon then fails := fails || 'GRANT_anon_can_execute_search; '; end if;

  -- ============================================================ RESULT
  if fails <> '' then
    raise exception 'FIX #64 CONTRACT FAIL: %', fails;
  end if;
  raise notice 'FIX #64 — ALL TESTS PASS (NEG1,POS1-6,NEG2-5,CROSSORG,PREVIEW,RECOMPUTE,GRANT)';
end $$;
rollback;

-- ============================================================ TEST: IDEMPOTENCY
begin;
do $$
declare v_count int;
begin
  select count(*) into v_count from pg_policies
    where tablename = 'chat_messages' and policyname = 'chat_messages_select';
  if v_count <> 1 then
    raise exception 'IDEMPOTENCY FAIL: chat_messages_select policy count = % (expected 1)', v_count;
  end if;
  raise notice 'IDEMPOTENCY — chat_messages_select policy count = 1 PASS';
end $$;
rollback;
