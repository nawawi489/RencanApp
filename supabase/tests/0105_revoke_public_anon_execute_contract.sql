-- Migration 0105 contract test — no public function is EXECUTE-able by PUBLIC or anon.
--
-- Guards, ordered by cost-if-broken:
--   • INVARIANT (the whole point). After 0105 applies, 0 functions in the
--     `public` schema may grant EXECUTE to `PUBLIC` or `anon`. If a later
--     migration re-introduces the exposure via `CREATE OR REPLACE FUNCTION`
--     without re-revoking (see [[anon-public-rpc-grant-gotcha]]), this contract
--     is the tripwire.
--   • AUTHENTICATED PRESERVED. The REVOKE targets PUBLIC + anon only; existing
--     grants to `authenticated` must remain intact so end-user RPCs keep
--     working (spot-check a business RPC + a helper).
--   • ADVISOR ALIGNMENT. Same query the Supabase advisor uses to compute the
--     "Public Can Execute" count — enforcing it in a test means we don't rely
--     on remembering to run the advisor after every schema change.
--
-- Pattern: `raise notice 'PASS'` on success, `raise exception 'FAIL: ...'` on failure
--   (psql ON_ERROR_STOP=1). No pgTAP.
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0105_revoke_public_anon_execute_contract.sql

-- ============================================================ 0105-DB-1: INVARIANT — 0 public.* fns callable by PUBLIC or anon
do $$
declare
  v_count integer;
  v_sample text;
begin
  select count(*), string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into v_count, v_sample
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (has_function_privilege('public', p.oid, 'EXECUTE')
       or has_function_privilege('anon',   p.oid, 'EXECUTE'));

  if v_count > 0 then
    raise exception 'FAIL 0105-DB-1: % public function(s) still EXECUTE-able by PUBLIC/anon → %', v_count, v_sample;
  end if;
  raise notice 'PASS 0105-DB-1: 0 public functions callable by PUBLIC/anon';
end $$;

-- ============================================================ 0105-DB-2: authenticated grants preserved on business RPCs
do $$
declare
  v_missing text := '';
  r record;
  v_spot text[] := array[
    'send_chat_message',
    'create_goal_idempotent',
    'create_action_plan_idempotent',
    'create_task_idempotent',
    'create_initiative_idempotent',
    'create_problem_statement_idempotent',
    'activate_task',
    'cancel_card',
    'archive_card',
    'restore_card',
    'create_comment',
    'grant_confidential_access',
    'set_task_repeat_rule'
  ];
  v_name text;
begin
  foreach v_name in array v_spot loop
    for r in
      select p.oid, pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    loop
      if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
        v_missing := v_missing || v_name || '(' || r.args || '); ';
      end if;
    end loop;
  end loop;

  if v_missing <> '' then
    raise exception 'FAIL 0105-DB-2: authenticated grant hilang di RPC bisnis: %', v_missing;
  end if;
  raise notice 'PASS 0105-DB-2: authenticated masih bisa EXECUTE RPC bisnis inti';
end $$;

-- ============================================================ 0105-DB-3: NEGATIVE — anon literally cannot invoke a business RPC
begin;
do $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin
    perform public.grant_confidential_access(
      p_entity_type => 'goal',
      p_entity_id   => '00000000-0000-0000-0000-000000000000'::uuid,
      p_user_id     => '00000000-0000-0000-0000-000000000000'::uuid,
      p_access_level => 'view',
      p_reason      => 'contract-probe');
    execute 'reset role';
    raise exception 'FAIL 0105-DB-3: anon berhasil memanggil grant_confidential_access (harus 42501)';
  exception
    when insufficient_privilege then
      execute 'reset role';
      raise notice 'PASS 0105-DB-3: anon → grant_confidential_access ditolak dengan 42501';
    when others then
      execute 'reset role';
      -- Bisa jadi SQLSTATE selain 42501 kalau grant sudah ada tapi body raise
      -- lebih dulu. Uji tetap gagal karena harusnya nyangkut di ACL sebelum body.
      raise exception 'FAIL 0105-DB-3: anon mendapat error non-privilege (%): %', SQLSTATE, SQLERRM;
  end;
end $$;
rollback;
