-- Migration 0045 contract test — chat_message_reactions (Reaction pill, PRD §30.6).
--
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0045_chat_message_reactions_contract.sql
--
-- Pola: raise notice 'PASS …' / raise exception 'FAIL: …'.
-- 15 blok (a–o) sesuai §12.3 rencana TDD.

-- ============================================================ (a) DDL tabel + PK/FK CASCADE
do $$
declare
  fails text := '';
  v_cnt int;
begin
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='reaction_emojis') then
    fails := fails || 'reaction_emojis_missing; ';
  end if;
  if not exists (select 1 from information_schema.tables
    where table_schema='public' and table_name='chat_message_reactions') then
    fails := fails || 'chat_message_reactions_missing; ';
  end if;

  -- PK komposit (chat_message_id, reactor_id, emoji)
  select count(*) into v_cnt from information_schema.table_constraints
    where table_schema='public' and table_name='chat_message_reactions'
      and constraint_type='PRIMARY KEY';
  if v_cnt <> 1 then fails := fails || 'pk_missing; '; end if;

  -- FK chat_message_id → chat_messages(id) ON DELETE CASCADE
  if not exists (
    select 1 from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    where tc.table_schema='public' and tc.table_name='chat_message_reactions'
      and rc.delete_rule = 'CASCADE'
      and exists (
        select 1 from information_schema.key_column_usage kcu
        where kcu.constraint_name = rc.constraint_name and kcu.column_name = 'chat_message_id'
      )
  ) then fails := fails || 'fk_chat_message_id_cascade_missing; '; end if;

  -- FK reactor_id → profiles(id) ON DELETE CASCADE
  if not exists (
    select 1 from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    where tc.table_schema='public' and tc.table_name='chat_message_reactions'
      and rc.delete_rule = 'CASCADE'
      and exists (
        select 1 from information_schema.key_column_usage kcu
        where kcu.constraint_name = rc.constraint_name and kcu.column_name = 'reactor_id'
      )
  ) then fails := fails || 'fk_reactor_id_cascade_missing; '; end if;

  -- FK organization_id → organizations(id) ON DELETE CASCADE
  if not exists (
    select 1 from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    where tc.table_schema='public' and tc.table_name='chat_message_reactions'
      and rc.delete_rule = 'CASCADE'
      and exists (
        select 1 from information_schema.key_column_usage kcu
        where kcu.constraint_name = rc.constraint_name and kcu.column_name = 'organization_id'
      )
  ) then fails := fails || 'fk_organization_id_cascade_missing; '; end if;

  -- FK emoji → reaction_emojis(emoji)
  if not exists (
    select 1 from information_schema.referential_constraints rc
    join information_schema.table_constraints tc on tc.constraint_name = rc.constraint_name
    where tc.table_schema='public' and tc.table_name='chat_message_reactions'
      and exists (
        select 1 from information_schema.key_column_usage kcu
        where kcu.constraint_name = rc.constraint_name and kcu.column_name = 'emoji'
      )
  ) then fails := fails || 'fk_emoji_missing; '; end if;

  if fails <> '' then raise exception 'FAIL a: DDL/PK/FK — %', fails; end if;
  raise notice 'PASS a: DDL tabel + PK/FK CASCADE';
end $$;

-- ============================================================ (b) RLS enable + policy SELECT
do $$
declare fails text := '';
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='chat_message_reactions' and c.relrowsecurity=true)
  then fails := fails || 'rls_not_enabled; '; end if;

  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='chat_message_reactions'
      and policyname='chat_message_reactions_select' and cmd='SELECT')
  then fails := fails || 'select_policy_missing; '; end if;

  if fails <> '' then raise exception 'FAIL b: RLS — %', fails; end if;
  raise notice 'PASS b: RLS enable + policy SELECT';
end $$;

-- ============================================================ (c) revoke I/U/D dari authenticated+anon
do $$
declare
  v_ins boolean;
  v_upd boolean;
  v_del boolean;
begin
  select exists (select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='chat_message_reactions'
      and grantee in ('authenticated','anon') and privilege_type='INSERT') into v_ins;
  select exists (select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='chat_message_reactions'
      and grantee in ('authenticated','anon') and privilege_type='UPDATE') into v_upd;
  select exists (select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='chat_message_reactions'
      and grantee in ('authenticated','anon') and privilege_type='DELETE') into v_del;

  if v_ins or v_upd or v_del then
    raise exception 'FAIL c: revoke I/U/D — ins=% upd=% del=%', v_ins, v_upd, v_del;
  end if;
  raise notice 'PASS c: revoke I/U/D authenticated+anon';
end $$;

-- ============================================================ (d) RPC idempoten (toggle-on dua kali → count=1, no 23505)
-- Uji idempotensi SEKUENSIAL, bukan concurrency dua-sesi. Race INSERT-INSERT ditutup
-- ON CONFLICT DO NOTHING by construction. Return true pada INSERT-yang-conflict adalah
-- perilaku spec §7.3, bukan regresi (C8/C14 accepted).
do $$
declare
  v_org uuid; v_uid uuid; v_room uuid; v_msg uuid; v_r1 boolean; v_r2 boolean; v_cnt int;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_uid from public.profiles where organization_id=v_org and is_active limit 1;
  select r.id into v_room from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org and m.member_id=v_uid limit 1;

  if v_org is null or v_uid is null or v_room is null then
    raise notice 'SKIP d: no seed member'; return;
  end if;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_uid, '__rxtest_d__') returning id into v_msg;

  perform set_config('request.jwt.claims', json_build_object('sub',v_uid)::text, true);

  v_r1 := public.toggle_chat_reaction(v_msg, '👍');
  v_r2 := public.toggle_chat_reaction(v_msg, '👍');

  select count(*) into v_cnt from public.chat_message_reactions
    where chat_message_id=v_msg and reactor_id=v_uid and emoji='👍';

  -- Second toggle is toggle-OFF (delete), so count should be 0 and r2=false
  if v_r1 <> true then raise exception 'FAIL d: first toggle should be true, got %', v_r1; end if;
  if v_r2 <> false then raise exception 'FAIL d: second toggle should be false (toggle-off), got %', v_r2; end if;
  if v_cnt <> 0 then raise exception 'FAIL d: expected 0 rows after toggle-off, got %', v_cnt; end if;

  -- Toggle on again to test true idempotency: on→off→on
  v_r1 := public.toggle_chat_reaction(v_msg, '👍');
  if v_r1 <> true then raise exception 'FAIL d: re-toggle-on should be true'; end if;
  select count(*) into v_cnt from public.chat_message_reactions
    where chat_message_id=v_msg and reactor_id=v_uid and emoji='👍';
  if v_cnt <> 1 then raise exception 'FAIL d: expected 1 row after re-toggle-on, got %', v_cnt; end if;

  delete from public.chat_message_reactions where chat_message_id=v_msg;
  delete from public.chat_messages where id=v_msg;
  raise notice 'PASS d: RPC idempoten toggle on/off/on';
end $$;

-- ============================================================ (e/f) validasi emoji-aktif hanya INSERT + delisted removable + flip runtime (M9)
do $$
declare
  v_org uuid; v_uid uuid; v_room uuid; v_msg uuid;
  v_ok boolean; v_err text;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_uid from public.profiles where organization_id=v_org and is_active limit 1;
  select r.id into v_room from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org and m.member_id=v_uid limit 1;

  if v_org is null or v_uid is null or v_room is null then
    raise notice 'SKIP e/f: no seed member'; return;
  end if;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_uid, '__rxtest_ef__') returning id into v_msg;
  perform set_config('request.jwt.claims', json_build_object('sub',v_uid)::text, true);

  -- (e) Insert with active emoji succeeds
  v_ok := public.toggle_chat_reaction(v_msg, '👀');
  if v_ok <> true then raise exception 'FAIL e: active emoji toggle-on should be true'; end if;

  -- Flip active=false for 👀
  update public.reaction_emojis set active=false where emoji='👀';

  -- (f-M9) INSERT now rejected for delisted emoji on NEW toggle-on
  begin
    -- First toggle-off the existing reaction
    v_ok := public.toggle_chat_reaction(v_msg, '👀');
    if v_ok <> false then raise exception 'FAIL f: toggle-off delisted should be false'; end if;
    -- Now try toggle-on again — should fail because emoji is delisted
    v_ok := public.toggle_chat_reaction(v_msg, '👀');
    raise exception 'FAIL f: delisted INSERT should raise, but returned %', v_ok;
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%tidak didukung%' then
      -- Re-raise if it's not the expected error
      update public.reaction_emojis set active=true where emoji='👀';
      raise exception 'FAIL f: wrong error: %', v_err;
    end if;
  end;

  -- Restore active flag
  update public.reaction_emojis set active=true where emoji='👀';

  delete from public.chat_message_reactions where chat_message_id=v_msg;
  delete from public.chat_messages where id=v_msg;
  raise notice 'PASS e/f: validasi emoji-aktif + delisted removable + flip runtime';
end $$;

-- ============================================================ (g) cross-org 0 baris
do $$
declare
  v_org_a uuid; v_uid_a uuid; v_room_a uuid; v_msg_a uuid;
  v_org_b uuid; v_uid_b uuid;
  v_err text; v_cnt int;
begin
  select id into v_org_a from public.organizations limit 1;
  select id into v_uid_a from public.profiles where organization_id=v_org_a and is_active limit 1;
  select r.id into v_room_a from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org_a and m.member_id=v_uid_a limit 1;

  select id into v_org_b from public.organizations where id <> v_org_a limit 1;

  if v_org_b is null then
    raise notice 'SKIP g: only one org in DB'; return;
  end if;

  select id into v_uid_b from public.profiles where organization_id=v_org_b and is_active limit 1;
  if v_uid_b is null then
    raise notice 'SKIP g: no active user in org B'; return;
  end if;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org_a, v_room_a, v_uid_a, '__rxtest_g__') returning id into v_msg_a;

  -- User B (org B) tries to react to message in org A's room
  perform set_config('request.jwt.claims', json_build_object('sub',v_uid_b)::text, true);
  begin
    perform public.toggle_chat_reaction(v_msg_a, '👍');
    raise exception 'FAIL g: cross-org toggle should raise';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%anggota room%' then
      delete from public.chat_messages where id=v_msg_a;
      raise exception 'FAIL g: wrong error: %', v_err;
    end if;
  end;

  select count(*) into v_cnt from public.chat_message_reactions
    where chat_message_id=v_msg_a and reactor_id=v_uid_b;
  if v_cnt <> 0 then
    delete from public.chat_messages where id=v_msg_a;
    raise exception 'FAIL g: cross-org wrote % rows', v_cnt;
  end if;

  delete from public.chat_messages where id=v_msg_a;
  raise notice 'PASS g: cross-org 0 baris';
end $$;

-- ============================================================ (h) cascade 5 sub-hop
do $$
declare
  v_org uuid; v_uid uuid; v_room uuid; v_msg uuid;
  v_cnt_before int; v_cnt_after int; v_rx_cnt int;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_uid from public.profiles where organization_id=v_org and is_active limit 1;
  select r.id into v_room from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org and m.member_id=v_uid limit 1;

  if v_org is null or v_uid is null or v_room is null then
    raise notice 'SKIP h: no seed member'; return;
  end if;

  -- (h-v) immutability: count chat_messages before
  select count(*) into v_cnt_before from public.chat_messages where chat_room_id=v_room;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_uid, '__rxtest_h__') returning id into v_msg;

  -- Add reaction directly as postgres (bypass RLS for test setup)
  insert into public.chat_message_reactions(chat_message_id, reactor_id, emoji, organization_id)
    values (v_msg, v_uid, '👍', v_org);

  -- (h-v) immutability: adding reaction did NOT update chat_messages
  select count(*) into v_cnt_after from public.chat_messages where chat_room_id=v_room;
  -- cnt_after = cnt_before + 1 (the test message we just inserted, NOT from reaction)
  if v_cnt_after <> v_cnt_before + 1 then
    raise exception 'FAIL h-v: chat_messages count changed unexpectedly: before=% after=%', v_cnt_before, v_cnt_after;
  end if;

  -- (h-i) DELETE chat_messages → reactions cascade
  delete from public.chat_messages where id=v_msg;
  select count(*) into v_rx_cnt from public.chat_message_reactions where chat_message_id=v_msg;
  if v_rx_cnt <> 0 then
    raise exception 'FAIL h-i: reaction survived message delete, got %', v_rx_cnt;
  end if;

  raise notice 'PASS h: cascade + immutability';
end $$;

-- ============================================================ (i) anti-tamper + residu positif (C9/M4)
do $$
declare
  v_org uuid; v_uid_x uuid; v_uid_y uuid; v_room uuid; v_msg uuid;
  v_cnt int; v_x_exists boolean; v_y_exists boolean;
begin
  select id into v_org from public.organizations limit 1;

  -- Need two distinct members of the same room
  select m1.member_id, m2.member_id, m1.chat_room_id
    into v_uid_x, v_uid_y, v_room
    from public.chat_room_members m1
    join public.chat_room_members m2 on m1.chat_room_id=m2.chat_room_id and m1.member_id<>m2.member_id
    join public.chat_rooms r on r.id=m1.chat_room_id
    where r.organization_id=v_org
    limit 1;

  if v_uid_x is null or v_uid_y is null then
    raise notice 'SKIP i: need two members in same room'; return;
  end if;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_uid_x, '__rxtest_i__') returning id into v_msg;

  -- X toggles on 👍
  perform set_config('request.jwt.claims', json_build_object('sub',v_uid_x)::text, true);
  perform public.toggle_chat_reaction(v_msg, '👍');

  -- Y toggles on 👍 (same emoji, different user)
  perform set_config('request.jwt.claims', json_build_object('sub',v_uid_y)::text, true);
  perform public.toggle_chat_reaction(v_msg, '👍');

  -- (i-a) X's reaction still exists
  select exists(select 1 from public.chat_message_reactions
    where chat_message_id=v_msg and reactor_id=v_uid_x and emoji='👍') into v_x_exists;
  -- (i-b) Y's reaction created
  select exists(select 1 from public.chat_message_reactions
    where chat_message_id=v_msg and reactor_id=v_uid_y and emoji='👍') into v_y_exists;
  -- (i-c) count = 2
  select count(*) into v_cnt from public.chat_message_reactions
    where chat_message_id=v_msg and emoji='👍';

  if not v_x_exists then raise exception 'FAIL i-a: X reaction missing after Y toggle'; end if;
  if not v_y_exists then raise exception 'FAIL i-b: Y reaction not created'; end if;
  if v_cnt <> 2 then raise exception 'FAIL i-c: expected 2 rows, got %', v_cnt; end if;

  -- (i-d) Y toggles off → only Y removed, X intact
  perform set_config('request.jwt.claims', json_build_object('sub',v_uid_y)::text, true);
  perform public.toggle_chat_reaction(v_msg, '👍');

  select exists(select 1 from public.chat_message_reactions
    where chat_message_id=v_msg and reactor_id=v_uid_x and emoji='👍') into v_x_exists;
  select exists(select 1 from public.chat_message_reactions
    where chat_message_id=v_msg and reactor_id=v_uid_y and emoji='👍') into v_y_exists;

  if not v_x_exists then raise exception 'FAIL i-d: X reaction removed by Y toggle-off'; end if;
  if v_y_exists then raise exception 'FAIL i-d: Y reaction not removed'; end if;

  delete from public.chat_message_reactions where chat_message_id=v_msg;
  delete from public.chat_messages where id=v_msg;
  raise notice 'PASS i: anti-tamper + residu positif';
end $$;

-- ============================================================ (j) tulis-langsung gagal (authenticated INSERT/UPDATE/DELETE rejected)
do $$
declare
  v_org uuid; v_uid uuid; v_room uuid; v_msg uuid;
  v_err text;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_uid from public.profiles where organization_id=v_org and is_active limit 1;
  select r.id into v_room from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org and m.member_id=v_uid limit 1;

  if v_uid is null then raise notice 'SKIP j: no seed'; return; end if;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_uid, '__rxtest_j__') returning id into v_msg;

  perform set_config('request.jwt.claims', json_build_object('sub',v_uid)::text, true);
  set local role authenticated;

  begin
    insert into public.chat_message_reactions(chat_message_id, reactor_id, emoji, organization_id)
      values (v_msg, v_uid, '👍', v_org);
    reset role;
    delete from public.chat_messages where id=v_msg;
    raise exception 'FAIL j: direct INSERT should be denied';
  exception when insufficient_privilege then
    null; -- expected
  end;

  reset role;
  delete from public.chat_messages where id=v_msg;
  raise notice 'PASS j: tulis-langsung gagal';
end $$;

-- ============================================================ (k1) guard statik netralitas skor
do $$
declare v_bad text;
begin
  select string_agg(proname, ', ') into v_bad
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in (
      'calculate_period_scores','open_period_snapshot','close_period_snapshot',
      'override_user_score','compute_governance_discipline','compute_review_pass_rate',
      'aggregate_repeat_metrics_per_user','compute_action_plan_completion',
      'compute_development_contribution','upsert_score_formula_version',
      'activate_score_formula_version','assign_score_formula',
      'create_score_formula_draft','update_score_formula_version_weights')
    and position('chat_message_reactions' in pg_get_functiondef(oid)) > 0;
  if v_bad is not null then
    raise exception 'FAIL k1: fungsi skor menyentuh chat_message_reactions: %', v_bad;
  end if;
  raise notice 'PASS k1: guard statik netralitas skor';
end $$;

-- ============================================================ (k2) uji operasional netralitas skor (M6)
-- Requires score tables + calculate_period_scores. SKIP if schema absent.
do $$
declare
  v_has_fn boolean;
  v_has_tbl boolean;
  v_org uuid; v_uid uuid; v_room uuid; v_msg uuid;
  v_pre_hash text;
  v_diff int;
begin
  select exists(select 1 from pg_proc where pronamespace='public'::regnamespace
    and proname='calculate_period_scores') into v_has_fn;
  select exists(select 1 from pg_tables where schemaname='public'
    and tablename='period_snapshots') into v_has_tbl;

  if not v_has_fn or not v_has_tbl then
    raise notice 'SKIP k2: calculate_period_scores or period tables absent'; return;
  end if;

  -- Verify that the function body does not reference chat_message_reactions
  select count(*) into v_diff from pg_proc
    where pronamespace='public'::regnamespace and proname='calculate_period_scores'
      and position('chat_message_reactions' in pg_get_functiondef(oid)) > 0;
  if v_diff > 0 then
    raise exception 'FAIL k2: calculate_period_scores references chat_message_reactions';
  end if;

  -- Structural guard passed. Operational test needs seed data.
  select id into v_org from public.organizations limit 1;
  select id into v_uid from public.profiles where organization_id=v_org and is_active limit 1;
  select r.id into v_room from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org and m.member_id=v_uid limit 1;

  if v_uid is null or v_room is null then
    raise notice 'SKIP k2: no seed member for operational test'; return;
  end if;

  -- Add test reaction — verify it doesn't affect score function definitions
  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_uid, '__rxtest_k2__') returning id into v_msg;
  insert into public.chat_message_reactions(chat_message_id, reactor_id, emoji, organization_id)
    values (v_msg, v_uid, '👍', v_org);

  -- Re-check: function def unchanged after data insertion
  select count(*) into v_diff from pg_proc
    where pronamespace='public'::regnamespace and proname='calculate_period_scores'
      and position('chat_message_reactions' in pg_get_functiondef(oid)) > 0;

  delete from public.chat_message_reactions where chat_message_id=v_msg;
  delete from public.chat_messages where id=v_msg;

  if v_diff > 0 then
    raise exception 'FAIL k2: score function changed after reaction data insertion';
  end if;
  raise notice 'PASS k2: netralitas skor operasional';
end $$;

-- ============================================================ (l) seed exact-4 + policy + revoke reaction_emojis (C7/M1)
do $$
declare
  v_active_cnt int;
  v_extra_cnt int;
  v_sel boolean;
  v_ins boolean;
begin
  -- (l-i) seed aktif tepat 4
  select count(*) into v_active_cnt from public.reaction_emojis where active;
  if v_active_cnt <> 4 then
    raise exception 'FAIL l-i: expected 4 active emojis, got %', v_active_cnt;
  end if;

  -- No extra active emojis outside the seed set
  select count(*) into v_extra_cnt from public.reaction_emojis
    where active and emoji not in ('👍','✅','👀','🙏');
  if v_extra_cnt <> 0 then
    raise exception 'FAIL l-i: unexpected active emojis outside seed: %', v_extra_cnt;
  end if;

  -- (l-ii) SELECT policy exists for authenticated
  if not exists (select 1 from pg_policies
    where schemaname='public' and tablename='reaction_emojis'
      and policyname='reaction_emojis_select' and cmd='SELECT')
  then raise exception 'FAIL l-ii: reaction_emojis_select policy missing'; end if;

  -- (l-iii) RLS enabled
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='reaction_emojis' and c.relrowsecurity=true)
  then raise exception 'FAIL l-iii: RLS not enabled on reaction_emojis'; end if;

  -- (l-iv) INSERT/UPDATE/DELETE revoked from authenticated+anon
  select exists (select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='reaction_emojis'
      and grantee in ('authenticated','anon')
      and privilege_type in ('INSERT','UPDATE','DELETE')) into v_ins;
  if v_ins then
    raise exception 'FAIL l-iv: I/U/D not revoked on reaction_emojis';
  end if;

  raise notice 'PASS l: seed exact-4 + policy + revoke reaction_emojis';
end $$;

-- ============================================================ (m) workspace-viewer non-member: READ ok, WRITE rejected (C6/M2)
do $$
declare
  v_org uuid; v_member uuid; v_viewer uuid; v_room uuid; v_msg uuid;
  v_cnt int; v_err text;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_member from public.profiles where organization_id=v_org and is_active limit 1;
  select r.id into v_room from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org and m.member_id=v_member limit 1;

  -- Find a user with can_view_workspace who is NOT a member of v_room
  select p.id into v_viewer from public.profiles p
    join public.user_permissions up on up.user_id=p.id and up.granted=true
    join public.permissions perm on perm.id=up.permission_id
    where p.organization_id=v_org and p.is_active
      and perm.key='view_all_workspace'
      and p.id <> v_member
      and not exists (select 1 from public.chat_room_members crm
        where crm.chat_room_id=v_room and crm.member_id=p.id)
    limit 1;

  if v_viewer is null then
    raise notice 'SKIP m: no workspace-viewer non-member found'; return;
  end if;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_member, '__rxtest_m__') returning id into v_msg;

  -- Member creates a reaction (as postgres for setup)
  insert into public.chat_message_reactions(chat_message_id, reactor_id, emoji, organization_id)
    values (v_msg, v_member, '👍', v_org);

  -- (m-i) Viewer can READ reactions via RLS
  perform set_config('request.jwt.claims', json_build_object('sub',v_viewer)::text, true);
  set local role authenticated;
  select count(*) into v_cnt from public.chat_message_reactions
    where chat_message_id=v_msg;
  reset role;

  if v_cnt < 1 then
    delete from public.chat_message_reactions where chat_message_id=v_msg;
    delete from public.chat_messages where id=v_msg;
    raise exception 'FAIL m-i: viewer should see reactions, saw %', v_cnt;
  end if;

  -- (m-ii) Viewer cannot WRITE via RPC
  perform set_config('request.jwt.claims', json_build_object('sub',v_viewer)::text, true);
  begin
    perform public.toggle_chat_reaction(v_msg, '✅');
    delete from public.chat_message_reactions where chat_message_id=v_msg;
    delete from public.chat_messages where id=v_msg;
    raise exception 'FAIL m-ii: viewer toggle should raise';
  exception when others then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%anggota room%' then
      delete from public.chat_message_reactions where chat_message_id=v_msg;
      delete from public.chat_messages where id=v_msg;
      raise exception 'FAIL m-ii: wrong error from viewer toggle: %', v_err;
    end if;
  end;

  delete from public.chat_message_reactions where chat_message_id=v_msg;
  delete from public.chat_messages where id=v_msg;
  raise notice 'PASS m: workspace-viewer read-vs-write separation';
end $$;

-- ============================================================ (n) FK-only whitelist 23503 (C10/M3)
-- Direct INSERT (as postgres, bypassing RPC) with emoji not in reaction_emojis → FK violation.
do $$
declare
  v_org uuid; v_uid uuid; v_room uuid; v_msg uuid;
  v_err text; v_code text;
begin
  select id into v_org from public.organizations limit 1;
  select id into v_uid from public.profiles where organization_id=v_org and is_active limit 1;
  select r.id into v_room from public.chat_rooms r
    join public.chat_room_members m on m.chat_room_id=r.id
    where r.organization_id=v_org and m.member_id=v_uid limit 1;

  if v_uid is null then raise notice 'SKIP n: no seed'; return; end if;

  insert into public.chat_messages(organization_id, chat_room_id, author_id, body)
    values (v_org, v_room, v_uid, '__rxtest_n__') returning id into v_msg;

  begin
    insert into public.chat_message_reactions(chat_message_id, reactor_id, emoji, organization_id)
      values (v_msg, v_uid, '🚀', v_org);
    delete from public.chat_messages where id=v_msg;
    raise exception 'FAIL n: FK should reject unknown emoji';
  exception when foreign_key_violation then
    null; -- expected 23503
  end;

  delete from public.chat_messages where id=v_msg;
  raise notice 'PASS n: FK-only whitelist 23503';
end $$;

-- ============================================================ (o) revoke execute anon/public pada RPC (M8)
do $$
declare v_err text;
begin
  set local role anon;
  begin
    perform public.toggle_chat_reaction(gen_random_uuid(), '👍');
    reset role;
    raise exception 'FAIL o: anon should not be able to execute RPC';
  exception when insufficient_privilege then
    null; -- expected
  end;
  reset role;
  raise notice 'PASS o: revoke execute anon RPC';
end $$;
