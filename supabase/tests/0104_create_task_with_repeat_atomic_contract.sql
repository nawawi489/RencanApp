-- Migration 0104 contract test — atomic Task + Repeat Rule creation.
--
-- Guards, ordered by cost-if-broken:
--   • ATOMICITY (the whole point). If the repeat-rule write fails, the task insert
--     must roll back too — otherwise an orphan draft survives and the user's retry
--     mints a genuine duplicate Task (the bug this migration fixes).
--   • HAPPY PATH. p_repeat=true creates the task AND its repeat rule in one call;
--     repeat_setting flips to 'repeat'.
--   • IDEMPOTENCY. A retry with the same client_request_id returns the ORIGINAL
--     task (one row) and leaves exactly one repeat rule (set_task_repeat_rule
--     upserts on task_id), never a 23505 to the UI.
--   • SECURITY. create_task_with_repeat_idempotent is `security invoker` (runs
--     under the caller's RLS, adds no SECURITY DEFINER surface) and is executable
--     by `authenticated` only — never anon/public ([[anon-public-rpc-grant-gotcha]]).
--
-- Pattern: `raise notice 'PASS'` on success, `raise exception 'FAIL: ...'` on failure
--   (psql ON_ERROR_STOP=1). No pgTAP.
-- Fixture constants (supabase/tests/_fixtures.sql):
--   org A = 4b07a19f-550d-4952-b0d8-44f38f651d89, CEO A = ca8c1471-b870-4f09-a149-25e5eae99d6f
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0104_create_task_with_repeat_atomic_contract.sql

-- ============================================================ 0104-DB-1: RPC security invoker + ACL authenticated-only
do $$
declare
  v_oid oid; v_secdef boolean;
begin
  select p.oid, p.prosecdef into v_oid, v_secdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='create_task_with_repeat_idempotent' limit 1;
  if v_oid is null then raise exception 'FAIL 0104-DB-1: create_task_with_repeat_idempotent tidak ditemukan'; end if;
  if v_secdef then raise exception 'FAIL 0104-DB-1: harus SECURITY INVOKER (bukan definer)'; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'FAIL 0104-DB-1: authenticated tidak bisa EXECUTE';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then
    raise exception 'FAIL 0104-DB-1: anon bisa EXECUTE (harus authenticated-only)';
  end if;
  raise notice 'PASS 0104-DB-1: create_task_with_repeat_idempotent — security invoker, authenticated-only';
end $$;

-- ============================================================ 0104-DB-2: happy path — task + repeat rule in one call
begin;
do $$
declare
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ap  uuid := gen_random_uuid();
  v_task public.tasks; n_rules int; fails text := '';
begin
  insert into public.action_plans (id, organization_id, created_by, name)
    values (v_ap, v_org, v_ceo, '0104 Parent AP');

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_task := public.create_task_with_repeat_idempotent(
    p_action_plan_id=>v_ap, p_name=>'Daily Close', p_deadline_time=>'23:00',
    p_client_request_id=>null,
    p_repeat=>true, p_frequency=>'daily',
    p_repeat_start_date=>'2026-06-01', p_repeat_end_date=>'2026-06-30',
    p_time_of_day=>'23:00', p_missed_rule=>'strict');

  execute 'reset role';

  if v_task.id is null then fails := fails || 'task_not_created; '; end if;
  if v_task.repeat_setting is distinct from 'repeat' then
    fails := fails || 'repeat_setting='||coalesce(v_task.repeat_setting,'<null>')||'(expected repeat); ';
  end if;
  select count(*) into n_rules from public.task_repeat_rules where task_id = v_task.id;
  if n_rules <> 1 then fails := fails || 'repeat_rule_count='||n_rules||'(expected 1); '; end if;

  if fails <> '' then raise exception 'FAIL 0104-DB-2: %', fails; end if;
  raise notice 'PASS 0104-DB-2: happy path — task + 1 repeat rule, repeat_setting=repeat';
end $$;
rollback;

-- ============================================================ 0104-DB-3: ATOMICITY — repeat-rule failure rolls back the task insert
-- Force set_task_repeat_rule to raise AFTER the task insert (invalid frequency
-- violates action_plan_repeat_rules_frequency_check). The task must NOT persist.
begin;
do $$
declare
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ap  uuid := gen_random_uuid();
  v_key uuid := '00000000-0000-0000-0000-0000000d0104';
  n_tasks int; raised boolean := false; fails text := '';
begin
  insert into public.action_plans (id, organization_id, created_by, name)
    values (v_ap, v_org, v_ceo, '0104 Atomic AP');

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- SAVEPOINT so the expected error does not abort the whole test block.
  begin
    perform public.create_task_with_repeat_idempotent(
      p_action_plan_id=>v_ap, p_name=>'Atomic Task', p_deadline_time=>'23:00',
      p_client_request_id=>v_key,
      p_repeat=>true, p_frequency=>'yearly',  -- invalid → CHECK violation inside set_task_repeat_rule
      p_repeat_start_date=>'2026-06-01', p_repeat_end_date=>'2026-06-30',
      p_time_of_day=>'23:00', p_missed_rule=>'strict');
  exception when others then
    raised := true;  -- error propagated as expected
  end;

  execute 'reset role';

  if not raised then fails := fails || 'rpc_did_not_raise_on_bad_repeat; '; end if;
  -- The task insert must have rolled back with the failed repeat rule: zero orphan drafts.
  select count(*) into n_tasks from public.tasks
    where organization_id=v_org and created_by=v_ceo and client_request_id=v_key;
  if n_tasks <> 0 then fails := fails || 'orphan_task_survived_count='||n_tasks||'(expected 0); '; end if;

  if fails <> '' then raise exception 'FAIL 0104-DB-3: %', fails; end if;
  raise notice 'PASS 0104-DB-3: atomicity — repeat-rule failure rolls back the task insert (no orphan draft)';
end $$;
rollback;

-- ============================================================ 0104-DB-4: idempotency — same key -> 1 task/id stabil, 1 repeat rule
begin;
do $$
declare
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ap  uuid := gen_random_uuid();
  v_key uuid := '00000000-0000-0000-0000-0000000d0114';
  v_t1 public.tasks; v_t2 public.tasks; n_tasks int; n_rules int; fails text := '';
begin
  insert into public.action_plans (id, organization_id, created_by, name)
    values (v_ap, v_org, v_ceo, '0104 Idem AP');

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  v_t1 := public.create_task_with_repeat_idempotent(
    p_action_plan_id=>v_ap, p_name=>'Idem Task', p_deadline_time=>'23:00',
    p_client_request_id=>v_key,
    p_repeat=>true, p_frequency=>'daily',
    p_repeat_start_date=>'2026-06-01', p_repeat_end_date=>'2026-06-30',
    p_time_of_day=>'23:00', p_missed_rule=>'strict');

  -- Retry with the SAME key (simulates the user tapping Save again after a lost ACK).
  v_t2 := public.create_task_with_repeat_idempotent(
    p_action_plan_id=>v_ap, p_name=>'Idem Task RETRY', p_deadline_time=>'23:00',
    p_client_request_id=>v_key,
    p_repeat=>true, p_frequency=>'daily',
    p_repeat_start_date=>'2026-06-01', p_repeat_end_date=>'2026-06-30',
    p_time_of_day=>'23:00', p_missed_rule=>'strict');

  execute 'reset role';

  if v_t1.id is distinct from v_t2.id then fails := fails || 'same_key_different_task_id; '; end if;
  select count(*) into n_tasks from public.tasks
    where organization_id=v_org and created_by=v_ceo and client_request_id=v_key;
  if n_tasks <> 1 then fails := fails || 'task_count='||n_tasks||'(expected 1); '; end if;
  select count(*) into n_rules from public.task_repeat_rules where task_id = v_t1.id;
  if n_rules <> 1 then fails := fails || 'repeat_rule_count='||n_rules||'(expected 1); '; end if;

  if fails <> '' then raise exception 'FAIL 0104-DB-4: %', fails; end if;
  raise notice 'PASS 0104-DB-4: idempotency — same key 1 task/id stabil, 1 repeat rule (upsert)';
end $$;
rollback;
