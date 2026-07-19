-- 0078_settings_consumers_activation_bypass_still_blocked_contract.sql
-- Contract: 0077 trigger tg_guard_activation_direct_update masih aktif pasca 0078.
-- Covers AC-10.
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--   -f supabase/tests/0078_settings_consumers_activation_bypass_still_blocked_contract.sql -v ON_ERROR_STOP=1

-- ============================================================ S1 — trigger exists on 5 tables
begin;
do $$
declare
  v_count int;
  fails text := '';
begin
  select count(*) into v_count from pg_trigger
    where tgname like '%_guard_activation_bypass' and not tgisinternal;

  if v_count <> 5 then
    fails := fails || 'S1: expected 5 triggers, got ' || v_count || '; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0078-bypass-S1: %', fails;
  end if;
  raise notice 'PASS 0078-bypass-S1 5 activation-guard triggers present';
end $$;
rollback;

-- ============================================================ S2 — direct UPDATE draft→active blocked
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_goal uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  insert into public.goals(organization_id, name, pic_id, period_start, period_end, target_value, status, created_by)
    values (v_org, 'S2 bypass goal', v_ceo, '2026-01-01', '2026-12-31', 100, 'draft', v_ceo)
    returning id into v_goal;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    update public.goals set status = 'active' where id = v_goal;
    fails := fails || 'S2: direct UPDATE draft→active succeeded (trigger 0077 broken/absent); ';
  exception when others then
    if sqlerrm not ilike '%aktivasi%' and sqlerrm not ilike '%activate%' and sqlerrm not ilike '%42501%'
       and sqlerrm not ilike '%kelengkapan%' then
      fails := fails || 'S2: unexpected error: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-bypass-S2: %', fails;
  end if;
  raise notice 'PASS 0078-bypass-S2 direct UPDATE bypass blocked';
end $$;
rollback;
