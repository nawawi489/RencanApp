-- Contract test: 0076_activation_bypass_and_confidential_holes
-- Verifies:
--   [BUG 1] activation-bypass trigger installed on all 5 tables + guards
--           direct draft→active transitions via authenticated role.
--   [BUG 2] can_access_goal/strategy/initiative contains klausa
--           confidential_access_rules (function definition text).
begin;
select plan(13);

-- ---------------------------------------------------------------- BUG 1: triggers exist on 5 tables
select has_trigger('public', 'goals',        'goals_guard_activation_bypass',        'T1a: trigger on goals');
select has_trigger('public', 'strategies',   'strategies_guard_activation_bypass',   'T1b: trigger on strategies');
select has_trigger('public', 'initiatives',  'initiatives_guard_activation_bypass',  'T1c: trigger on initiatives');
select has_trigger('public', 'action_plans', 'action_plans_guard_activation_bypass', 'T1d: trigger on action_plans');
select has_trigger('public', 'tasks',        'tasks_guard_activation_bypass',        'T1e: trigger on tasks');

-- ---------------------------------------------------------------- BUG 1: guard function exists + right shape
select has_function('public', 'tg_guard_activation_direct_update',
  'T2: guard function exists');

-- Critical: trigger MUST be SECURITY INVOKER, not DEFINER. DEFINER akan
-- flip current_user ke owner sehingga role-check gagal & trigger tak
-- pernah blok bypass — regresi silent.
select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'tg_guard_activation_direct_update'),
  false,
  'T3: guard function is SECURITY INVOKER (NOT DEFINER — DEFINER would flip current_user and break role check)'
);

-- ---------------------------------------------------------------- BUG 2: 3 can_access_* now reference confidential rules
select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_access_goal')
  like '%confidential_access_rules%',
  'T4: can_access_goal references confidential_access_rules'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_access_strategy')
  like '%confidential_access_rules%',
  'T5: can_access_strategy references confidential_access_rules'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'can_access_initiative')
  like '%confidential_access_rules%',
  'T6: can_access_initiative references confidential_access_rules'
);

-- ---------------------------------------------------------------- BUG 1 behavioral: bypass truly blocked
-- Butuh user real dari seed supaya RLS lolos & trigger sempat firing.
-- Ambil profil pertama yang ada di DB; jika seed kosong, skip (unknown-user
-- akan lolos RLS = null match; kita mau real test).
do $$
declare v_uid uuid; v_org uuid;
begin
  select id, organization_id into v_uid, v_org
    from public.profiles order by id limit 1;
  if v_uid is null then
    raise notice 'SKIP behavioral tests: no seed profile';
    return;
  end if;

  insert into public.goals (id, organization_id, name, status, pic_id, created_by)
  values ('99999999-9999-9999-9999-000000000076', v_org, 'test-0076-bypass',
          'draft', v_uid, v_uid);

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
end $$;

-- T7: direct draft→active blocked
select throws_ok(
  $q$ update public.goals set status = 'active'
        where id = '99999999-9999-9999-9999-000000000076' $q$,
  '42501',
  null,
  'T7: direct draft→active from authenticated raises 42501'
);

-- T8: draft→archived still allowed (client can archive draft cards)
select lives_ok(
  $q$ update public.goals set status = 'archived'
        where id = '99999999-9999-9999-9999-000000000076' $q$,
  'T8: direct draft→archived from authenticated allowed'
);

reset role;

-- T9: SECURITY DEFINER RPC (activate_goal) bypasses trigger — legit path works
do $$
declare v_uid uuid; v_org uuid;
begin
  select id, organization_id into v_uid, v_org
    from public.profiles order by id limit 1;

  insert into public.strategies (id, organization_id, goal_id, name, status, pic_id, created_by)
  select '88888888-8888-8888-8888-000000000076', v_org,
         '99999999-9999-9999-9999-000000000076', 'test-0076-kpi', 'draft', v_uid, v_uid
   where v_uid is not null
     and exists (select 1 from public.goals where id = '99999999-9999-9999-9999-000000000076');

  -- Reset goal ke draft (T8 bikin archived) supaya activate_goal valid.
  update public.goals
    set status = 'draft',
        period_start = '2026-01-01', period_end = '2026-12-31',
        target_value = 'Rp 1M'
    where id = '99999999-9999-9999-9999-000000000076';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
end $$;

select lives_ok(
  $q$ select public.activate_goal('99999999-9999-9999-9999-000000000076'::uuid) $q$,
  'T9: legitimate activate_goal RPC bypasses trigger (SECURITY DEFINER = postgres owner)'
);

reset role;

select * from finish();
rollback;
