-- 0078_settings_consumers_writer_permission_shared_contract.sql
-- Contract: D-7 upsert_card_guidance reuse permission manage_card_completion_rule.
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--   -f supabase/tests/0078_settings_consumers_writer_permission_shared_contract.sql -v ON_ERROR_STOP=1

-- ============================================================ S1 — manage_card_completion_rule allows guidance upsert
begin;
do $$
declare
  v_staff uuid;
  v_org uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = '11111111-1111-1111-1111-000000000001';

  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.profiles(id, organization_id, full_name)
    values (v_staff, v_org, 'S1 Staff')
    on conflict (id) do update set organization_id = v_org;

  -- Grant permission manage_card_completion_rule ke staff (via permission_id FK)
  insert into public.user_permissions(user_id, permission_id, granted, scope)
    select v_staff, id, true, 'org' from public.permissions where key = 'manage_card_completion_rule'
    on conflict do nothing;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_card_guidance('initiative', 'Custom title', 'Custom body', null);
  exception when others then
    fails := fails || 'S1: staff with manage_card_completion_rule blocked from guidance: ' || sqlerrm || '; ';
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-perm-S1: %', fails;
  end if;
  raise notice 'PASS 0078-perm-S1 D-7 permission reuse works';
end $$;
rollback;

-- ============================================================ S2 — without permission → 42501
begin;
do $$
declare
  v_staff uuid;
  v_org uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = '11111111-1111-1111-1111-000000000001';

  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.profiles(id, organization_id, full_name)
    values (v_staff, v_org, 'S2 Staff')
    on conflict (id) do update set organization_id = v_org;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_card_guidance('initiative', 't', 'b', null);
    fails := fails || 'S2: staff without permission accepted (gate broken); ';
  exception when others then
    if sqlerrm not ilike '%berwenang%' and sqlerrm not ilike '%42501%' then
      fails := fails || 'S2: wrong error: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-perm-S2: %', fails;
  end if;
  raise notice 'PASS 0078-perm-S2 permission gate enforces';
end $$;
rollback;
