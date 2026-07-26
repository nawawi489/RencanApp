-- Migration 0100 contract test — Write Idempotency Keys (client_request_id).
--
-- Guards, ordered by cost-if-broken:
--   • DEDUP CORRECTNESS. A retried submit carrying the same client_request_id must
--     return the ORIGINAL row (one row total), not a duplicate and not a 23505 to
--     the UI. This is the whole point of the feature (follow-up to PR #197, which
--     only stopped the AUTOMATIC retry).
--   • The five create_<entity>_idempotent RPCs are `security invoker` (they must
--     run under the caller's RLS, adding no SECURITY DEFINER surface) and are
--     executable by `authenticated` only — never anon/public
--     ([[anon-public-rpc-grant-gotcha]]: a DROP resets ACL to PUBLIC EXECUTE).
--   • send_chat_message keeps authenticated-only ACL after the 6->7 param rewrite.
--   • A NULL client_request_id must NEVER dedup (old clients / opt-out path).
--
-- Pattern: `raise notice 'PASS'` on success, `raise exception 'FAIL: ...'` on failure
--   (psql ON_ERROR_STOP=1). No pgTAP.
-- Fixture constants (supabase/tests/_fixtures.sql):
--   org A = 4b07a19f-550d-4952-b0d8-44f38f651d89, CEO A = ca8c1471-b870-4f09-a149-25e5eae99d6f
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0100_write_idempotency_keys_contract.sql

-- ============================================================ 0100-DB-1: kolom client_request_id (uuid, nullable) di 6 tabel
do $$
declare
  v_tbls text[] := array['goals','action_plans','tasks','initiatives','problem_statements','chat_messages'];
  v_t text; v_type text; v_nullable text; fails text := '';
begin
  foreach v_t in array v_tbls loop
    select data_type, is_nullable into v_type, v_nullable
      from information_schema.columns
     where table_schema='public' and table_name=v_t and column_name='client_request_id';
    if v_type is null then fails := fails || v_t||'.client_request_id_missing; '; continue; end if;
    if v_type <> 'uuid' then fails := fails || v_t||'.wrong_type('||v_type||'); '; end if;
    if v_nullable <> 'YES' then fails := fails || v_t||'.not_nullable; '; end if;
  end loop;
  if fails <> '' then raise exception 'FAIL 0100-DB-1: %', fails; end if;
  raise notice 'PASS 0100-DB-1: client_request_id uuid nullable pada 6 tabel';
end $$;

-- ============================================================ 0100-DB-2: partial unique index per tabel
-- Direct-insert 5 tabel: (organization_id, created_by, client_request_id) WHERE client_request_id IS NOT NULL.
-- chat_messages: (chat_room_id, author_id, client_request_id) WHERE ... (kolom = author_id, BUKAN sender_id).
do $$
declare
  v_rec record;
  v_expect jsonb := jsonb_build_object(
    'goals','organization_id, created_by, client_request_id',
    'action_plans','organization_id, created_by, client_request_id',
    'tasks','organization_id, created_by, client_request_id',
    'initiatives','organization_id, created_by, client_request_id',
    'problem_statements','organization_id, created_by, client_request_id',
    'chat_messages','chat_room_id, author_id, client_request_id'
  );
  v_t text; v_def text; fails text := '';
begin
  for v_t in select jsonb_object_keys(v_expect) loop
    select indexdef into v_def
      from pg_indexes
     where schemaname='public' and tablename=v_t
       and indexdef ilike '%client_request_id%'
       and indexdef ilike '%unique%'
       and indexdef ilike '%where%client_request_id is not null%';
    if v_def is null then fails := fails || v_t||'.partial_unique_index_missing; '; continue; end if;
    if position((v_expect->>v_t) in v_def) = 0 then
      fails := fails || v_t||'.index_cols_mismatch{'||v_def||'}; ';
    end if;
  end loop;
  if fails <> '' then raise exception 'FAIL 0100-DB-2: %', fails; end if;
  raise notice 'PASS 0100-DB-2: partial unique index (org/created_by|room/author, client_request_id) per tabel';
end $$;

-- ============================================================ 0100-DB-3: 5 RPC create_*_idempotent — security INVOKER + ACL authenticated-only
do $$
declare
  v_fns text[] := array['create_goal_idempotent','create_action_plan_idempotent','create_task_idempotent',
                        'create_initiative_idempotent','create_problem_statement_idempotent'];
  v_fn text; v_oid oid; v_secdef boolean; fails text := '';
begin
  foreach v_fn in array v_fns loop
    select p.oid, p.prosecdef into v_oid, v_secdef
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=v_fn limit 1;
    if v_oid is null then fails := fails || v_fn||'_not_found; '; continue; end if;
    if v_secdef then fails := fails || v_fn||'_is_security_definer(must_be_invoker); '; end if;
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      fails := fails || v_fn||'_authenticated_cannot_execute; ';
    end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE') then fails := fails || v_fn||'_anon_can_execute; '; end if;
  end loop;
  if fails <> '' then raise exception 'FAIL 0100-DB-3: %', fails; end if;
  raise notice 'PASS 0100-DB-3: 5 create_*_idempotent — security invoker, authenticated-only';
end $$;

-- ============================================================ 0100-DB-4: send_chat_message rewrite 6->7 param + ACL
do $$
declare
  v_oid oid; v_args text; v_nargs int; fails text := '';
begin
  -- signature 7-arg baru harus ada; param p_client_request_id uuid present.
  select p.oid, pg_get_function_arguments(p.oid), p.pronargs into v_oid, v_args, v_nargs
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='send_chat_message'
     and pg_get_function_arguments(p.oid) ilike '%p_client_request_id uuid%';
  if v_oid is null then
    raise exception 'FAIL 0100-DB-4: send_chat_message dgn param p_client_request_id uuid tidak ada';
  end if;
  if v_nargs <> 7 then fails := fails || 'expected_7_args_got_'||v_nargs||'{'||v_args||'}; '; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then fails := fails || 'authenticated_cannot_execute; '; end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE')  then fails := fails || 'anon_can_execute; ';  end if;
  -- tidak boleh ada dua definisi tertinggal (6-arg lama harus di-DROP).
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='send_chat_message') <> 1 then
    fails := fails || 'multiple_send_chat_message_overloads(old_6arg_not_dropped); ';
  end if;
  if fails <> '' then raise exception 'FAIL 0100-DB-4: %', fails; end if;
  raise notice 'PASS 0100-DB-4: send_chat_message 7-arg (p_client_request_id) authenticated-only, satu overload';
end $$;

-- ============================================================ 0100-DB-5: dedup direct-insert (create_goal_idempotent)
-- same key -> id sama + 1 baris; key beda -> 2 baris; key NULL -> tak dedup (2 baris).
begin;
do $$
declare
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_key uuid := '00000000-0000-0000-0000-0000000d0105';
  v_key2 uuid := '00000000-0000-0000-0000-0000000d0106';
  v_g1 public.goals; v_g2 public.goals; v_g3 public.goals; v_gn1 public.goals; v_gn2 public.goals;
  n_same int; n_null int; fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- (a) same key twice -> same row id
  v_g1 := public.create_goal_idempotent(p_name=>'IDK Goal', p_description=>null, p_pic_id=>null,
            p_period_start=>null, p_period_end=>null, p_target_value=>null, p_client_request_id=>v_key);
  v_g2 := public.create_goal_idempotent(p_name=>'IDK Goal RETRY', p_description=>null, p_pic_id=>null,
            p_period_start=>null, p_period_end=>null, p_target_value=>null, p_client_request_id=>v_key);
  if v_g1.id is distinct from v_g2.id then fails := fails || 'same_key_different_id; '; end if;

  select count(*) into n_same from public.goals
    where organization_id=v_org and created_by=v_ceo and client_request_id=v_key;
  if n_same <> 1 then fails := fails || 'same_key_row_count='||n_same||'(expected 1); '; end if;

  -- (b) different key -> new row
  v_g3 := public.create_goal_idempotent(p_name=>'IDK Goal 2', p_description=>null, p_pic_id=>null,
            p_period_start=>null, p_period_end=>null, p_target_value=>null, p_client_request_id=>v_key2);
  if v_g3.id = v_g1.id then fails := fails || 'different_key_same_id; '; end if;

  -- (c) NULL key -> never dedup
  v_gn1 := public.create_goal_idempotent(p_name=>'IDK Goal null', p_description=>null, p_pic_id=>null,
             p_period_start=>null, p_period_end=>null, p_target_value=>null, p_client_request_id=>null);
  v_gn2 := public.create_goal_idempotent(p_name=>'IDK Goal null', p_description=>null, p_pic_id=>null,
             p_period_start=>null, p_period_end=>null, p_target_value=>null, p_client_request_id=>null);
  if v_gn1.id = v_gn2.id then fails := fails || 'null_key_deduped; '; end if;
  select count(*) into n_null from public.goals
    where organization_id=v_org and created_by=v_ceo and client_request_id is null and name='IDK Goal null';
  if n_null <> 2 then fails := fails || 'null_key_row_count='||n_null||'(expected 2); '; end if;

  execute 'reset role';
  if fails <> '' then raise exception 'FAIL 0100-DB-5: %', fails; end if;
  raise notice 'PASS 0100-DB-5: dedup goal — same key 1 baris/id stabil, key beda 2 baris, key NULL tak dedup';
end $$;
rollback;

-- ============================================================ 0100-DB-6: dedup chat (send_chat_message p_client_request_id)
-- same key -> message id sama + 1 baris.
begin;
do $$
declare
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ap uuid := gen_random_uuid();
  v_room uuid := gen_random_uuid();
  v_key uuid := '00000000-0000-0000-0000-0000000d0106';
  v_m1 uuid; v_m2 uuid; n_rows int; fails text := '';
begin
  -- minimal chat scaffolding owned by CEO A (bypass RLS via superuser context for setup)
  insert into public.action_plans (id, organization_id, created_by, name)
    values (v_ap, v_org, v_ceo, 'IDK Chat AP');
  insert into public.chat_rooms (id, organization_id, action_plan_id, name)
    values (v_room, v_org, v_ap, 'IDK Chat Room');
  insert into public.chat_room_members (chat_room_id, member_id)
    values (v_room, v_ceo);

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_m1 := public.send_chat_message(p_room=>v_room, p_body=>'Halo IDK', p_client_request_id=>v_key);
  v_m2 := public.send_chat_message(p_room=>v_room, p_body=>'Halo IDK RETRY', p_client_request_id=>v_key);
  execute 'reset role';

  if v_m1 is distinct from v_m2 then fails := fails || 'same_key_different_message_id; '; end if;
  select count(*) into n_rows from public.chat_messages
    where chat_room_id=v_room and author_id=v_ceo and client_request_id=v_key;
  if n_rows <> 1 then fails := fails || 'same_key_message_count='||n_rows||'(expected 1); '; end if;

  if fails <> '' then raise exception 'FAIL 0100-DB-6: %', fails; end if;
  raise notice 'PASS 0100-DB-6: dedup chat — send_chat_message same key -> 1 pesan/id stabil';
end $$;
rollback;
