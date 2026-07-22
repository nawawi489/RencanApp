-- 0078_settings_consumers_card_guidance_contract.sql
-- Contract: card_guidance_contents reader + upsert_card_guidance writer.
-- Covers AC-5 org-specific, AC-6 fallback tier, partial unique index, permission gate.
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--   -f supabase/tests/0078_settings_consumers_card_guidance_contract.sql -v ON_ERROR_STOP=1

-- ============================================================ S1 — org row menang (AC-5)
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_null_seed_count int;
  v_result record;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  select count(*) into v_null_seed_count
    from public.card_guidance_contents
    where organization_id is null and card_type = 'initiative';

  if v_null_seed_count < 1 then
    fails := fails || 'S1: seed 0047 org-NULL initiative row missing (' || v_null_seed_count || '); ';
  end if;

  insert into public.card_guidance_contents(organization_id, card_type, title, body)
  values (v_org, 'initiative', 'Inisiatif X org', 'Custom body org');

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select title, body into v_result
    from public.card_guidance_contents
    where (organization_id = v_org or organization_id is null)
      and card_type = 'initiative'
    order by organization_id nulls last
    limit 1;

  execute 'reset role';

  if v_result is null then
    fails := fails || 'S1: no row returned via RLS SELECT; ';
  elsif v_result.title <> 'Inisiatif X org' then
    fails := fails || 'S1: org row lost to NULL row (RLS order?); title=' || coalesce(v_result.title, 'NULL') || '; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0078-guidance-S1: %', fails;
  end if;
  raise notice 'PASS 0078-guidance-S1 org row wins';
end $$;
rollback;

-- ============================================================ S2 — fallback org-NULL (AC-6)
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_result record;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;

  delete from public.card_guidance_contents where organization_id = v_org and card_type = 'goal';

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select title, body into v_result
    from public.card_guidance_contents
    where (organization_id = v_org or organization_id is null)
      and card_type = 'goal'
    order by organization_id nulls last
    limit 1;

  execute 'reset role';

  if v_result is null then
    fails := fails || 'S2: no fallback row (seed 0047 missing?); ';
  elsif v_result.title not ilike '%Goal%' then
    fails := fails || 'S2: fallback row unexpected title: ' || v_result.title || '; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0078-guidance-S2: %', fails;
  end if;
  raise notice 'PASS 0078-guidance-S2 fallback org-NULL default';
end $$;
rollback;

-- ============================================================ S3 — writer RPC validate title/body length
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Empty title
  begin
    perform public.upsert_card_guidance('initiative', '', 'body', null);
    fails := fails || 'S3: empty title accepted; ';
  exception when others then
    if sqlerrm not ilike '%Judul wajib%' and sqlerrm not ilike '%22023%' then
      fails := fails || 'S3: unexpected error empty title: ' || sqlerrm || '; ';
    end if;
  end;

  -- Body over 800
  begin
    perform public.upsert_card_guidance('initiative', 'title', repeat('a', 801), null);
    fails := fails || 'S3: overlength body accepted; ';
  exception when others then
    if sqlerrm not ilike '%maksimal 800%' and sqlerrm not ilike '%22023%' then
      fails := fails || 'S3: unexpected error overlength: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-guidance-S3: %', fails;
  end if;
  raise notice 'PASS 0078-guidance-S3 writer validates title/body length';
end $$;
rollback;

-- ============================================================ S4 — writer RPC card_type whitelist
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_card_guidance('bogus', 'x', 'y', null);
    fails := fails || 'S4: bogus card_type accepted; ';
  exception when others then
    if sqlerrm not ilike '%tidak valid%' and sqlerrm not ilike '%22023%' then
      fails := fails || 'S4: unexpected error: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-guidance-S4: %', fails;
  end if;
  raise notice 'PASS 0078-guidance-S4 card_type whitelist enforced';
end $$;
rollback;

-- ============================================================ S5 — writer RPC permission gate
begin;
do $$
declare
  v_staff uuid;
  v_org uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = '11111111-1111-1111-1111-000000000001';
  v_staff := gen_random_uuid();
  -- organization_id wajib eksplisit sejak 0083 (handle_new_user menolak menebak).
  insert into auth.users(id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org));
  insert into public.profiles(id, organization_id, full_name)
    values (v_staff, v_org, 'S5 Staff') on conflict (id) do update set organization_id = v_org;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_card_guidance('initiative', 't', 'b', null);
    fails := fails || 'S5: staff without permission succeeded; ';
  exception when others then
    if sqlerrm not ilike '%berwenang%' and sqlerrm not ilike '%42501%' then
      fails := fails || 'S5: wrong error: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-guidance-S5: %', fails;
  end if;
  raise notice 'PASS 0078-guidance-S5 permission gate';
end $$;
rollback;

-- ============================================================ S6 — partial unique index enforce
begin;
do $$
declare
  v_org uuid;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = '11111111-1111-1111-1111-000000000001';

  delete from public.card_guidance_contents where organization_id = v_org and card_type = 'strategy';
  insert into public.card_guidance_contents(organization_id, card_type, title, body)
    values (v_org, 'strategy', 't1', 'b1');

  begin
    insert into public.card_guidance_contents(organization_id, card_type, title, body)
      values (v_org, 'strategy', 't2', 'b2');
    fails := fails || 'S6a: duplicate (org, ct) accepted — partial unique index missing; ';
  exception when unique_violation then null; end;

  -- Test org-NULL partial unique index
  begin
    insert into public.card_guidance_contents(organization_id, card_type, title, body)
      values (null, 'goal', 'dup goal seed', 'dup');
    -- Kalau tak error, cek count > 1 di baris org-NULL goal
    if (select count(*) from public.card_guidance_contents where organization_id is null and card_type = 'goal') > 1 then
      fails := fails || 'S6b: duplicate (NULL, goal) accepted — partial unique index for NULL missing; ';
    end if;
  exception when unique_violation then null; end;

  if fails <> '' then
    raise exception 'FAIL 0078-guidance-S6: %', fails;
  end if;
  raise notice 'PASS 0078-guidance-S6 partial unique index enforced';
end $$;
rollback;
