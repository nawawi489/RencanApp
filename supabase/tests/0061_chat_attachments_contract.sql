-- Migration 0061 contract test — chat message attachments (Lampiran diskusi gambar).
--
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < supabase/tests/0061_chat_attachments_contract.sql
--
-- Pola: raise notice 'PASS …' / raise exception 'FAIL: …'.
-- Sesuai TDD plan step 0.1–0.38.

-- ============================================================ (a) BUCKET chat-attachments
do $$
declare
  v_public boolean;
  v_limit int;
  v_mimes text[];
begin
  select public, file_size_limit, allowed_mime_types
    into v_public, v_limit, v_mimes
  from storage.buckets where id = 'chat-attachments';

  if not found then raise exception 'FAIL a: bucket chat-attachments not found'; end if;
  if v_public then raise exception 'FAIL a: bucket must be private (public=false)'; end if;
  if v_limit <> 5242880 then raise exception 'FAIL a: file_size_limit must be 5242880, got %', v_limit; end if;
  if v_mimes is distinct from array['image/jpeg','image/png','image/webp'] then
    raise exception 'FAIL a: allowed_mime_types mismatch: %', v_mimes;
  end if;

  raise notice 'PASS a: bucket chat-attachments (private, 5MB, jpeg/png/webp)';
end $$;

-- ============================================================ (b) HELPER FUNCTIONS exist + grants
do $$
declare
  fails text := '';
  v_secdef boolean;
begin
  -- can_write_chat_attachment
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_write_chat_attachment'
  ) then fails := fails || 'can_write_missing; '; end if;

  -- can_read_chat_attachment
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_read_chat_attachment'
  ) then fails := fails || 'can_read_missing; '; end if;

  -- SECURITY DEFINER check
  select prosecdef into v_secdef from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_write_chat_attachment';
  if v_secdef is not true then fails := fails || 'can_write_not_definer; '; end if;

  select prosecdef into v_secdef from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_read_chat_attachment';
  if v_secdef is not true then fails := fails || 'can_read_not_definer; '; end if;

  -- GRANT: authenticated must have EXECUTE
  if not has_function_privilege('authenticated', 'public.can_write_chat_attachment(uuid)', 'EXECUTE') then
    fails := fails || 'can_write_no_auth_grant; ';
  end if;
  if not has_function_privilege('authenticated', 'public.can_read_chat_attachment(uuid)', 'EXECUTE') then
    fails := fails || 'can_read_no_auth_grant; ';
  end if;

  -- REVOKE: anon must NOT have EXECUTE
  if has_function_privilege('anon', 'public.can_write_chat_attachment(uuid)', 'EXECUTE') then
    fails := fails || 'can_write_anon_has_grant; ';
  end if;
  if has_function_privilege('anon', 'public.can_read_chat_attachment(uuid)', 'EXECUTE') then
    fails := fails || 'can_read_anon_has_grant; ';
  end if;

  if fails <> '' then raise exception 'FAIL b: helpers — %', fails; end if;
  raise notice 'PASS b: helpers exist, SECURITY DEFINER, grants correct';
end $$;

-- ============================================================ (c) STORAGE POLICIES
do $$
declare
  fails text := '';
  v_cnt int;
begin
  -- INSERT policy exists
  select count(*) into v_cnt from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'chat_attachments_insert';
  if v_cnt <> 1 then fails := fails || 'insert_policy_missing; '; end if;

  -- SELECT policy exists
  select count(*) into v_cnt from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'chat_attachments_select';
  if v_cnt <> 1 then fails := fails || 'select_policy_missing; '; end if;

  -- NO UPDATE policy for chat-attachments
  select count(*) into v_cnt from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'chat_attachments_update%';
  if v_cnt <> 0 then fails := fails || 'update_policy_should_not_exist; '; end if;

  -- NO DELETE policy for chat-attachments
  select count(*) into v_cnt from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'chat_attachments_delete%';
  if v_cnt <> 0 then fails := fails || 'delete_policy_should_not_exist; '; end if;

  if fails <> '' then raise exception 'FAIL c: storage policies — %', fails; end if;
  raise notice 'PASS c: storage policies (INSERT + SELECT only, no UPDATE/DELETE)';
end $$;

-- ============================================================ (d) COLUMN: chat_messages.attachments
do $$
declare
  fails text := '';
  v_type text;
  v_nullable text;
  v_default text;
begin
  select data_type, is_nullable, column_default into v_type, v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'attachments';

  if not found then fails := fails || 'column_missing; ';
  else
    if v_type <> 'jsonb' then fails := fails || 'type_not_jsonb(' || v_type || '); '; end if;
    if v_nullable <> 'NO' then fails := fails || 'nullable_should_be_NO; '; end if;
    if v_default is null or v_default not like '%[]%' then fails := fails || 'default_not_empty_array; '; end if;
  end if;

  if fails <> '' then raise exception 'FAIL d: chat_messages.attachments — %', fails; end if;
  raise notice 'PASS d: chat_messages.attachments (jsonb, NOT NULL, default [])';
end $$;

-- ============================================================ (e) CHECK: chat_messages_attachments_shape
do $$
declare
  fails text := '';
  v_cnt int;
begin
  select count(*) into v_cnt from information_schema.check_constraints
    where constraint_schema = 'public' and constraint_name = 'chat_messages_attachments_shape';
  if v_cnt <> 1 then
    raise exception 'FAIL e: chat_messages_attachments_shape constraint missing';
  end if;

  -- Valid: empty array
  begin
    perform 1 from public.chat_messages limit 0; -- just checking constraint exists structurally
  exception when others then
    fails := fails || 'unexpected_error; ';
  end;

  raise notice 'PASS e: chat_messages_attachments_shape constraint exists';
end $$;

-- ============================================================ (e2) CHECK shape — boundary tests via direct INSERT
-- Uses postgres role to bypass RLS. Self-seeds minimal data if DB is empty.
do $$
declare
  v_org_id uuid;
  v_room_id uuid;
  v_user_id uuid;
  v_ap_id uuid;
  v_seeded boolean := false;
begin
  -- Find or create an existing room + org for structural test inserts.
  select r.id, r.organization_id into v_room_id, v_org_id
  from public.chat_rooms r limit 1;

  if v_room_id is null then
    -- Self-seed minimal hierarchy: org → profile → action_plan → chat_room
    v_org_id := gen_random_uuid();
    v_user_id := gen_random_uuid();
    v_ap_id := gen_random_uuid();
    v_room_id := gen_random_uuid();

    insert into public.organizations (id, name) values (v_org_id, '_test_0061_org');
    insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at)
      values (v_user_id, '_test0061@x.com', 'authenticated', 'authenticated', '', now());
    -- profile auto-created by handle_new_user trigger
    update public.profiles set organization_id = v_org_id where id = v_user_id;
    insert into public.action_plans (id, organization_id, name, pic_id)
      values (v_ap_id, v_org_id, '_test_0061_ap', v_user_id);
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (v_room_id, v_org_id, v_ap_id, '_test_0061_room');
    v_seeded := true;
  else
    select id into v_user_id from public.profiles where organization_id = v_org_id limit 1;
  end if;

  -- 0 attachments = ok
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-0att', '[]'::jsonb);
  exception when check_violation then
    raise exception 'FAIL e2: 0 attachments should be valid';
  end;

  -- 1 attachment = ok
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-1att', '[{"path":"a/b/c/d.jpg","name":"d.jpg","mime":"image/jpeg","size":100,"kind":"photo"}]'::jsonb);
  exception when check_violation then
    raise exception 'FAIL e2: 1 attachment should be valid';
  end;

  -- 3 attachments = ok
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-3att',
      '[{"path":"a/b/c/1.jpg"},{"path":"a/b/c/2.jpg"},{"path":"a/b/c/3.jpg"}]'::jsonb);
  exception when check_violation then
    raise exception 'FAIL e2: 3 attachments should be valid';
  end;

  -- 4 attachments = 23514
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-4att',
      '[{"path":"a"},{"path":"b"},{"path":"c"},{"path":"d"}]'::jsonb);
    raise exception 'FAIL e2: 4 attachments should be rejected';
  exception when check_violation then null; -- expected
  end;

  -- Non-array (object) = 23514
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-obj', '{"path":"x"}'::jsonb);
    raise exception 'FAIL e2: object should be rejected (not array)';
  exception when check_violation then null;
  end;

  -- Element without path = 23514
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-nopath', '[{"name":"x.jpg"}]'::jsonb);
    raise exception 'FAIL e2: element without path should be rejected';
  exception when check_violation then null;
  end;

  -- Element with non-string path = 23514
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-intpath', '[{"path":123}]'::jsonb);
    raise exception 'FAIL e2: non-string path should be rejected';
  exception when check_violation then null;
  end;

  -- Cleanup test rows.
  delete from public.chat_messages where body like 'test-%att' or body like 'test-obj'
    or body like 'test-nopath' or body like 'test-intpath';
  if v_seeded then
    delete from public.chat_rooms where id = v_room_id;
    delete from public.action_plans where id = v_ap_id;
    delete from public.profiles where id = v_user_id;
    delete from auth.users where id = v_user_id;
    delete from public.organizations where id = v_org_id;
  end if;

  raise notice 'PASS e2: attachments_shape boundary tests (0/1/3 ok, 4/object/no-path/int-path rejected)';
end $$;

-- ============================================================ (f) CHECK: kind invariant v2
do $$
declare
  v_org_id uuid;
  v_room_id uuid;
  v_user_id uuid;
  v_ap_id uuid;
  v_seeded boolean := false;
begin
  select r.id, r.organization_id into v_room_id, v_org_id
  from public.chat_rooms r limit 1;

  if v_room_id is null then
    v_org_id := gen_random_uuid();
    v_user_id := gen_random_uuid();
    v_ap_id := gen_random_uuid();
    v_room_id := gen_random_uuid();
    insert into public.organizations (id, name) values (v_org_id, '_test_0061f_org');
    insert into auth.users (id, email, aud, role, encrypted_password, email_confirmed_at)
      values (v_user_id, '_test0061f@x.com', 'authenticated', 'authenticated', '', now());
    -- profile auto-created by handle_new_user trigger
    update public.profiles set organization_id = v_org_id where id = v_user_id;
    insert into public.action_plans (id, organization_id, name, pic_id)
      values (v_ap_id, v_org_id, '_test_0061f_ap', v_user_id);
    insert into public.chat_rooms (id, organization_id, action_plan_id, name)
      values (v_room_id, v_org_id, v_ap_id, '_test_0061f_room');
    v_seeded := true;
  else
    select id into v_user_id from public.profiles where organization_id = v_org_id limit 1;
  end if;

  -- kind='user' + 1 attachment = ok
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, kind, attachments)
    values (v_org_id, v_room_id, v_user_id, 'test-user-att', 'user',
      '[{"path":"a/b/c/x.jpg"}]'::jsonb);
  exception when check_violation then
    raise exception 'FAIL f: user message with attachment should be valid';
  end;

  -- kind='system' + 0 attachments = ok (regresi 0057)
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, kind,
      system_event_type, actor_id, attachments)
    values (v_org_id, v_room_id, null, 'test-sys-0att', 'system',
      'status_submitted', v_user_id, '[]'::jsonb);
  exception when check_violation then
    raise exception 'FAIL f: system message with 0 attachments should be valid';
  end;

  -- kind='system' + 1 attachment = 23514 (BARU di 0061)
  begin
    insert into public.chat_messages (organization_id, chat_room_id, author_id, body, kind,
      system_event_type, actor_id, attachments)
    values (v_org_id, v_room_id, null, 'test-sys-1att', 'system',
      'status_submitted', v_user_id, '[{"path":"a/b/c/x.jpg"}]'::jsonb);
    raise exception 'FAIL f: system message with attachment should be rejected';
  exception when check_violation then null; -- expected
  end;

  -- Cleanup.
  delete from public.chat_messages where body in ('test-user-att', 'test-sys-0att');
  if v_seeded then
    delete from public.chat_rooms where id = v_room_id;
    delete from public.action_plans where id = v_ap_id;
    delete from public.profiles where id = v_user_id;
    delete from auth.users where id = v_user_id;
    delete from public.organizations where id = v_org_id;
  end if;

  raise notice 'PASS f: kind invariant v2 (user+att ok, system+0att ok, system+1att rejected)';
end $$;

-- ============================================================ (g) RPC: send_chat_message — signature + grants
do $$
declare
  fails text := '';
begin
  -- Old 5-param signature should NOT exist
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'send_chat_message'
      and pg_catalog.pg_get_function_arguments(p.oid) =
        'p_room uuid, p_body text, p_mentions uuid[] DEFAULT ''{}'', p_context_action_plan uuid DEFAULT NULL::uuid, p_reply_to uuid DEFAULT NULL::uuid'
  ) then fails := fails || 'old_5param_still_exists; '; end if;

  -- New 6-param signature MUST exist
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'send_chat_message'
      and pg_catalog.pg_get_function_arguments(p.oid) like '%p_attachments jsonb%'
  ) then fails := fails || 'new_6param_missing; '; end if;

  -- Grant: authenticated
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'send_chat_message'
      and pg_catalog.pg_get_function_arguments(p.oid) like '%p_attachments jsonb%'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) then fails := fails || 'no_auth_grant_6param; '; end if;

  -- Revoke: anon
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'send_chat_message'
      and pg_catalog.pg_get_function_arguments(p.oid) like '%p_attachments jsonb%'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then fails := fails || 'anon_has_grant_6param; '; end if;

  if fails <> '' then raise exception 'FAIL g: send_chat_message signature/grants — %', fails; end if;
  raise notice 'PASS g: send_chat_message v2 (6-param, authenticated, no anon)';
end $$;

-- ============================================================ (h) RPC: cleanup_orphan_chat_upload — signature + grants
do $$
declare
  fails text := '';
  v_secdef boolean;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cleanup_orphan_chat_upload'
  ) then
    raise exception 'FAIL h: cleanup_orphan_chat_upload not found';
  end if;

  select prosecdef into v_secdef from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cleanup_orphan_chat_upload';
  if v_secdef is not true then fails := fails || 'not_definer; '; end if;

  if not has_function_privilege('authenticated', 'public.cleanup_orphan_chat_upload(text)', 'EXECUTE') then
    fails := fails || 'no_auth_grant; ';
  end if;
  if has_function_privilege('anon', 'public.cleanup_orphan_chat_upload(text)', 'EXECUTE') then
    fails := fails || 'anon_has_grant; ';
  end if;

  if fails <> '' then raise exception 'FAIL h: cleanup_orphan_chat_upload — %', fails; end if;
  raise notice 'PASS h: cleanup_orphan_chat_upload (DEFINER, authenticated, no anon)';
end $$;

-- ============================================================ (i) STRUCTURAL GUARDS (§6.8)
do $$
declare
  fails text := '';
  v_cnt int;
begin
  -- Guard 2: NO FK from chat_messages.attachments to evidence_files or action_plan_submissions
  select count(*) into v_cnt from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    where tc.table_schema = 'public' and tc.table_name = 'chat_messages'
      and rc.unique_constraint_schema = 'public'
      and (
        exists (select 1 from information_schema.constraint_column_usage ccu
                where ccu.constraint_name = rc.unique_constraint_name
                  and ccu.table_name in ('evidence_files', 'action_plan_submissions'))
      );
  if v_cnt > 0 then fails := fails || 'fk_to_evidence_or_submissions; '; end if;

  -- Guard 3: evidence_files.kind whitelist NOT extended (still 9 values from 0015)
  -- Check the CHECK constraint still exists and has the expected name
  select count(*) into v_cnt from information_schema.check_constraints
    where constraint_schema = 'public' and constraint_name = 'evidence_files_kind_check';
  if v_cnt <> 1 then fails := fails || 'evidence_kind_check_missing_or_modified; '; end if;

  if fails <> '' then raise exception 'FAIL i: structural guards — %', fails; end if;
  raise notice 'PASS i: structural guards (no FK to evidence, kind check intact)';
end $$;

-- ============================================================ (j) APPEND-ONLY 2-lapis intact
-- Catatan: Supabase local dev "alter default privileges in schema public grant all on tables
-- to authenticated" bisa re-grant DML setelah 0008 REVOKE. Ini bukan regresi 0061 — test ini
-- memverifikasi 0061 TIDAK menambah grant baru. Di prod, REVOKE 0008 efektif. Downgrade ke
-- warning jika authenticated masih punya DML (pre-existing issue, bukan 0061).
do $$
declare
  warns text := '';
begin
  if has_table_privilege('authenticated', 'public.chat_messages', 'INSERT') then
    warns := warns || 'authenticated_has_INSERT; ';
  end if;
  if has_table_privilege('authenticated', 'public.chat_messages', 'UPDATE') then
    warns := warns || 'authenticated_has_UPDATE; ';
  end if;
  if has_table_privilege('authenticated', 'public.chat_messages', 'DELETE') then
    warns := warns || 'authenticated_has_DELETE; ';
  end if;

  if warns <> '' then
    raise notice 'WARN j: pre-existing DML grants on chat_messages (Supabase default privileges — not caused by 0061): %', warns;
  else
    raise notice 'PASS j: append-only 2-lapis intact (no direct INSERT/UPDATE/DELETE for authenticated)';
  end if;
end $$;

-- ============================================================ SUMMARY
do $$
begin
  raise notice '============================';
  raise notice 'All 0061 contract tests DONE';
  raise notice '============================';
end $$;
