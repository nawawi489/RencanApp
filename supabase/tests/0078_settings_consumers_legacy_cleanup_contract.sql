-- 0078_settings_consumers_legacy_cleanup_contract.sql
-- Contract: DELETE settings key card_completion_rule_% + card_guidance_%,
-- activity_logs audit, upsert_settings whitelist rewrite (5 retain, 2 drop).
-- Covers AC-8.
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--   -f supabase/tests/0078_settings_consumers_legacy_cleanup_contract.sql -v ON_ERROR_STOP=1

-- ============================================================ S1 — legacy key deleted (post-0078)
begin;
do $$
declare
  v_count int;
  fails text := '';
begin
  select count(*) into v_count from public.settings
    where key like 'card_completion_rule_%' or key like 'card_guidance_%';
  if v_count > 0 then
    fails := fails || 'S1: legacy keys still exist (' || v_count || '); ';
  end if;
  if fails <> '' then
    raise exception 'FAIL 0078-legacy-S1: %', fails;
  end if;
  raise notice 'PASS 0078-legacy-S1 no legacy settings keys';
end $$;
rollback;

-- ============================================================ S2 — activity_logs audit row (post-0078)
-- Skenario: kalau pre-0078 ada baris legacy `settings.card_completion_rule_%` atau
-- `card_guidance_%`, migration harus INSERT activity_logs 'settings_legacy_purged'
-- per org SEBELUM DELETE. Kalau baseline lokal tak punya baris tsb (fresh DB),
-- tak ada audit entry yang dibutuhkan — SKIP.
begin;
do $$
declare
  v_expected_orgs int;
  v_audit_count int;
  fails text := '';
begin
  -- Reconstruct expected count via looking for legacy keys yang MASIH ada (post-DELETE = 0)
  -- + activity_logs 'settings_legacy_purged'. Kalau audit_count > 0, verify shape.
  select count(*) into v_audit_count from public.activity_logs
    where action = 'settings_legacy_purged';

  if v_audit_count = 0 then
    -- Fresh DB / no legacy keys at migration time — SKIP dgn NOTICE.
    raise notice 'SKIP 0078-legacy-S2: no legacy keys existed at migration time (0 audit rows expected)';
  else
    -- Kalau ada audit row, verify shape.
    if not exists (
      select 1 from public.activity_logs
      where action = 'settings_legacy_purged'
        and entity_type = 'settings'
        and detail ? 'keys_purged_count'
        and (detail->>'migration') = '0078'
    ) then
      fails := fails || 'S2: audit row shape wrong (missing entity_type/detail keys); ';
    end if;
    if fails <> '' then
      raise exception 'FAIL 0078-legacy-S2: %', fails;
    end if;
    raise notice 'PASS 0078-legacy-S2 audit trail % rows dgn shape valid', v_audit_count;
  end if;
end $$;
rollback;

-- ============================================================ S3 — upsert_settings reject prefix baru
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.upsert_settings('card_completion_rule_goal', '{}'::jsonb);
    fails := fails || 'S3a: card_completion_rule_goal accepted post-0078; ';
  exception when others then
    if sqlerrm not ilike '%tidak valid%' then
      fails := fails || 'S3a: wrong error text: ' || sqlerrm || '; ';
    end if;
  end;

  begin
    perform public.upsert_settings('card_guidance_goal', '{}'::jsonb);
    fails := fails || 'S3b: card_guidance_goal accepted post-0078; ';
  exception when others then
    if sqlerrm not ilike '%tidak valid%' then
      fails := fails || 'S3b: wrong error text: ' || sqlerrm || '; ';
    end if;
  end;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-legacy-S3: %', fails;
  end if;
  raise notice 'PASS 0078-legacy-S3 whitelist rejects deprecated prefixes';
end $$;
rollback;

-- ============================================================ S4 — 5 retain prefix still accepted
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org uuid;
  v_keys text[] := array[
    'status_test', 'priority_test', 'notification_rule_test',
    'confidential_access_mode', 'deadline_change_max_per_card'
  ];
  v_key text;
  v_row_count int;
  fails text := '';
begin
  select organization_id into v_org from public.profiles where id = v_ceo;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  foreach v_key in array v_keys loop
    begin
      perform public.upsert_settings(v_key, '{"a":1}'::jsonb);
    exception when others then
      fails := fails || 'S4: retain prefix "' || v_key || '" rejected: ' || sqlerrm || '; ';
    end;

    select count(*) into v_row_count from public.settings
      where organization_id = v_org and key = v_key;
    if v_row_count = 0 then
      fails := fails || 'S4: row for key "' || v_key || '" not written; ';
    end if;
  end loop;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0078-legacy-S4: %', fails;
  end if;
  raise notice 'PASS 0078-legacy-S4 5 retain prefixes still accepted';
end $$;
rollback;
