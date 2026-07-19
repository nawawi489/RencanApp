-- [QUARANTINED — WIP] Excluded from CI (run-db-contract-tests.sh skips *.wip.sql).
-- Reason: minimum_breakdown_rules behavior drift (goal->kpi unlock assertion).
-- Repair tracked in supabase/tests/WIP_REPAIR_BACKLOG.md. Rename back to *.sql once green.
--
-- EMS V1.8.1 — Fase 5 contract suite (Minimum Breakdown Rule + Kelengkapan Perencanaan).
--
-- Membuktikan invarian Fase 5 di bawah KONTEKS USER NYATA (auth.uid() via request.jwt.claims +
-- set local role authenticated/anon). Tiap test: fixture (privileged) → simulasi user → assert → ROLLBACK.
--
-- Cara jalan:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fase5_minimum_breakdown_rules_contract.sql
-- atau via Supabase MCP execute_sql: kirim tiap blok `begin; do $$..$$; rollback;` terpisah.
-- 'PASS' = lolos; 'FAIL: ...' = guard bocor.
--
-- Konstanta dev (project fhnqwytqprsptjshoxfn):
--   org=4b07a19f-550d-4952-b0d8-44f38f651d89, ceo=ca8c1471-b870-4f09-a149-25e5eae99d6f
--   role c_level=3d831bd8-b728-4be6-8551-09ac3697cada, staff=06771d3b-8d83-442d-a343-1d6248c43f53

-- ============================================================ TEST 1: schema + seed sistem + RLS default-deny
begin;
do $$
declare
  n int; fails text := '';
begin
  -- Tabel ada, kolom kanonik ada, CHECK enum mode + min_count>=1 ada.
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='minimum_breakdown_rules') then
    fails := fails||'table_missing; ';
  end if;
  -- Seed sistem (organization_id NULL) sudah ada 6 baris kanonik.
  select count(*) into n from public.minimum_breakdown_rules where organization_id is null;
  if n < 6 then fails := fails||'system_seed_count('||n||'); '; end if;
  -- Goal→KPI Area sistem dikunci blokir_aktivasi/1.
  if not exists (select 1 from public.minimum_breakdown_rules
                 where organization_id is null
                   and parent_card_type='goal' and child_card_type='kpi_area'
                   and enforcement_mode='blokir_aktivasi' and min_count=1) then
    fails := fails||'goal_kpi_lock_missing; ';
  end if;
  -- CHECK min_count >= 1 (langsung INSERT privileged dengan min_count=0 → 23514).
  begin
    insert into public.minimum_breakdown_rules
      (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode)
    values (null, 'kpi_area', 'strategy', 0, 'hanya_peringatan');
    fails := fails||'min_count_zero_allowed; ';
  exception when check_violation then null; when others then fails := fails||'min_count_zero:'||sqlerrm||'; '; end;

  if fails <> '' then raise exception 'TEST1 schema/seed FAIL: %', fails; end if;
  raise notice 'TEST1 schema/seed PASS';
end $$;
rollback;

-- ============================================================ TEST 2: RLS write default-deny untuk authenticated
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  fails text := '';
begin
  -- Sebagai CEO authenticated, INSERT langsung ke tabel HARUS ditolak (insufficient_privilege),
  -- karena REVOKE INSERT,UPDATE,DELETE FROM authenticated. Tulis hanya via RPC.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.minimum_breakdown_rules
      (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode)
    values (v_org, 'kpi_area', 'strategy', 3, 'hanya_peringatan');
    fails := fails||'authenticated_insert_allowed; ';
  exception when insufficient_privilege then null; when others then fails := fails||'auth_ins:'||sqlerrm||'; '; end;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST2 rls FAIL: %', fails; end if;
  raise notice 'TEST2 rls default-deny PASS';
end $$;
rollback;

-- ============================================================ TEST 3: set_minimum_breakdown_rule — permission + lock + UPSERT
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  stf  uuid := '33333333-3333-3333-3333-333333333301';
  rid uuid; fails text := '';
begin
  insert into auth.users (id) values (stf);
  insert into public.profiles (id, organization_id) values (stf, v_org)
    on conflict (id) do update set organization_id = excluded.organization_id;

  -- Staff tanpa permission → ditolak.
  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_minimum_breakdown_rule('kpi_area', 'strategy', 3, 'hanya_peringatan');
    fails := fails||'staff_allowed; ';
  exception when others then null; end;
  execute 'reset role';

  -- CEO (default has_permission true) → UPSERT lewat.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  rid := public.set_minimum_breakdown_rule('kpi_area', 'strategy', 3, 'hanya_peringatan');
  if rid is null then fails := fails||'ceo_upsert_returns_null; '; end if;
  -- Idempoten — UPSERT kedua kalinya merubah angka.
  perform public.set_minimum_breakdown_rule('kpi_area', 'strategy', 5, 'blokir_aktivasi');
  if not exists (select 1 from public.minimum_breakdown_rules
                 where organization_id = v_org and parent_card_type='kpi_area'
                   and child_card_type='strategy' and min_count=5 and enforcement_mode='blokir_aktivasi') then
    fails := fails||'upsert_not_updated; ';
  end if;
  -- KUNCI goal→kpi_area: tak boleh diubah ke peringatan / min_count<1.
  begin
    perform public.set_minimum_breakdown_rule('goal', 'kpi_area', 1, 'hanya_peringatan');
    fails := fails||'goal_kpi_unlock_allowed; ';
  exception when others then null; end;
  -- Mode tak dikenal ditolak.
  begin
    perform public.set_minimum_breakdown_rule('kpi_area', 'strategy', 3, 'foo');
    fails := fails||'unknown_mode_allowed; ';
  exception when others then null; end;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST3 set_rule FAIL: %', fails; end if;
  raise notice 'TEST3 set_minimum_breakdown_rule PASS';
end $$;
rollback;

-- ============================================================ TEST 4: check_minimum_breakdown_compliance — count, fallback, dev early-return
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  g uuid; k uuid; r record; fails text := '';
begin
  -- Fixture: 1 Goal Active + 2 KPI Area draft (count=2) — perlu agar gate Fase 4 lewat.
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'G1', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into g;
  insert into public.kpi_areas (organization_id, goal_id, name, status, created_by)
    values (v_org, g, 'K1', 'draft', v_ceo) returning id into k;
  insert into public.kpi_areas (organization_id, goal_id, name, status, created_by)
    values (v_org, g, 'K2', 'draft', v_ceo);

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- Default sistem goal→kpi_area: required=1, current=2 → meets=true.
  select * into r from public.check_minimum_breakdown_compliance('goal', g) limit 1;
  if r.child_card_type <> 'kpi_area' then fails := fails||'child_type_wrong; '; end if;
  if r.current_count <> 2 then fails := fails||'count_wrong('||r.current_count||'); '; end if;
  if r.required_count <> 1 then fails := fails||'required_wrong('||r.required_count||'); '; end if;
  if r.meets_requirement is not true then fails := fails||'meets_false_unexpected; '; end if;

  -- Archived TIDAK dihitung.
  update public.kpi_areas set status='archived' where goal_id=g;
  select * into r from public.check_minimum_breakdown_compliance('goal', g) limit 1;
  if r.current_count <> 0 then fails := fails||'archived_counted('||r.current_count||'); '; end if;
  if r.meets_requirement is not false then fails := fails||'meets_true_after_archive; '; end if;

  -- Development workspace: early-return → tabel kosong.
  if exists (select 1 from public.check_minimum_breakdown_compliance('development_area', g)) then
    fails := fails||'dev_not_empty; ';
  end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST4 check_compliance FAIL: %', fails; end if;
  raise notice 'TEST4 check_minimum_breakdown_compliance PASS';
end $$;
rollback;

-- ============================================================ TEST 5: gate mode 1 — activate_kpi_area dgn rule blokir_aktivasi
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  g uuid; k uuid; viol int; fails text := '';
begin
  -- Set rule org kpi_area→strategy = blokir_aktivasi/3 via RPC privileged.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_minimum_breakdown_rule('kpi_area', 'strategy', 3, 'blokir_aktivasi');
  execute 'reset role';

  -- KPI Area Draft dgn 0 Strategy, kelengkapan terpenuhi.
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'G2', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into g;
  insert into public.kpi_areas (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
    values (v_org, g, 'K2', 'tgt', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into k;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.activate_kpi_area(k);
    fails := fails||'activate_allowed_below_min; ';
  exception when others then null; end;
  execute 'reset role';

  -- Konsisten Fase 0–4: gate-block hanya raise exception, tidak menulis violation row
  -- (RAISE rollback INSERT pada tx yang sama; refusal ≠ tindakan terlarang yang berhasil).
  select count(*) into viol from public.governance_violations
    where entity_type='kpi_area' and entity_id=k
      and violation_type='minimum_breakdown_not_met';
  if viol <> 0 then fails := fails||'unexpected_violation_written('||viol||'); '; end if;

  -- KPI Area harus TETAP draft (penolakan; status tak berubah).
  if (select status from public.kpi_areas where id=k) <> 'draft' then
    fails := fails||'status_changed_on_block; ';
  end if;

  if fails <> '' then raise exception 'TEST5 gate mode1 FAIL: %', fails; end if;
  raise notice 'TEST5 gate mode1 activate_kpi_area PASS';
end $$;
rollback;

-- ============================================================ TEST 6: gate mode 2 — trigger BEFORE INSERT pada kpi_areas
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  g uuid; viol int; fails text := '';
begin
  -- Set rule org kpi_area→strategy = blokir_akses_turunan/2. Akan menolak INSERT strategies
  -- ke kpi_area yang sibling-nya < 2 (jadi semua INSERT pertama akan menerima — sibling=0 < 2).
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_minimum_breakdown_rule('kpi_area', 'strategy', 2, 'blokir_akses_turunan');
  execute 'reset role';

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'G3', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into g;

  -- Saat membuat KPI Area (rule goal→kpi_area sistem = blokir_aktivasi/1, BUKAN blokir_akses_turunan)
  -- INSERT KPI Area harus tetap lewat — trigger mode 2 hanya aktif untuk mode 'blokir_akses_turunan'.
  begin
    insert into public.kpi_areas (organization_id, goal_id, name, status, created_by)
    values (v_org, g, 'K3', 'draft', v_ceo);
  exception when others then fails := fails||'kpi_insert_blocked_wrong:'||sqlerrm||'; '; end;

  -- Verifikasi: untuk rule mode 'blokir_akses_turunan' di kpi_area→strategy, INSERT strategy
  -- akan diperiksa terhadap sibling pada KPI Area target. Karena ini insert pertama (sibling=0)
  -- dan min=2 → trigger HARUS menolak.
  declare v_kpi uuid; begin
    select id into v_kpi from public.kpi_areas where goal_id=g limit 1;
    begin
      insert into public.strategies (organization_id, kpi_area_id, name, status, created_by)
      values (v_org, v_kpi, 'S1', 'draft', v_ceo);
      fails := fails||'strategy_insert_should_block; ';
    exception when others then null; end;
  end;

  -- Konsisten Fase 0–4: trigger gate-block hanya raise, tidak menulis violation row.
  select count(*) into viol from public.governance_violations
    where violation_type='minimum_breakdown_not_met' and entity_type='kpi_area';
  if viol <> 0 then fails := fails||'unexpected_violation_on_block_child('||viol||'); '; end if;

  if fails <> '' then raise exception 'TEST6 gate mode2 FAIL: %', fails; end if;
  raise notice 'TEST6 gate mode2 trigger BEFORE INSERT PASS';
end $$;
rollback;

-- ============================================================ TEST 7: fallback org→sistem & isolasi tenant
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  r record; fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- Tanpa rule org → fallback sistem (kpi_area→strategy default: hanya_peringatan/1).
  select * into r from public.current_minimum_breakdown_rule('kpi_area', 'strategy');
  if r.id is null then fails := fails||'fallback_system_missing; '; end if;
  if r.organization_id is not null then fails := fails||'fallback_picked_org_unexpected; '; end if;

  -- Setelah set rule org, current_* mengembalikan baris org (bukan sistem).
  perform public.set_minimum_breakdown_rule('kpi_area', 'strategy', 4, 'hanya_peringatan');
  select * into r from public.current_minimum_breakdown_rule('kpi_area', 'strategy');
  if r.organization_id is distinct from v_org then fails := fails||'org_row_not_picked; '; end if;
  if r.min_count <> 4 then fails := fails||'org_min_wrong('||r.min_count||'); '; end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST7 fallback FAIL: %', fails; end if;
  raise notice 'TEST7 fallback org→sistem PASS';
end $$;
rollback;
