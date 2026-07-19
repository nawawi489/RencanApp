-- Fase 0 (specs/score-ranking-finalization-tdd-plan.md) — kontrak untuk migrasi 0079.
-- Jalankan: docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0079_score_finalize_advisory_lock_contract.sql
-- Pola: `begin; do $$..$$; rollback;` per blok. RAISE NOTICE 'PASS' bila lolos, RAISE EXCEPTION 'FAIL: …' bila regresi.
-- ID dev lokal: org=52b0ebe1-…b70, ceo=11111111-…001 (mirror close_period_snapshot_contract.sql).
--
-- T-DB-1: calculate_period_scores menolak periodId org lain via cross-org guard 0039.
-- T-DB-2: close_period_snapshot menolak periodId org lain via cross-org guard 0039.
-- T-DB-3: authenticated EXECUTE + anon REVOKE (regression guard untuk PR #102 pola CASCADE reset ACL).
-- T-DB-4: pg_advisory_xact_lock terpasang di calculate_period_scores (static regex; multi-line safe).
-- T-DB-5: pg_advisory_xact_lock terpasang di close_period_snapshot (static regex; multi-line safe).
-- T-DB-6: end-to-end calc → close menghasilkan ranking_snapshots non-empty (INV-2 bug-fix confirmation).
-- T-DB-7: override yang di-apply SEBELUM close tercermin di ranking_snapshots.score via coalesce (INV-5).

-- ============================================================ T-DB-1: cross-org calculate_period_scores → 'Periode tidak ditemukan.'
begin;
do $$
declare
  v_org_self uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org_other uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_other_ceo uuid := 'aaaaaaaa-0000-0000-0000-0000000000c1';
  v_other_role_staff uuid := 'aaaaaaaa-0000-0000-0000-0000000000d1';
  period_other uuid; fails text := '';
begin
  -- Fixture org kedua (minimum viable): org + CEO profile + role_template staff + period aktif.
  insert into public.organizations (id, name) values (v_org_other, '0079-T1-other-org')
    on conflict (id) do nothing;
  insert into auth.users (id) values (v_other_ceo) on conflict (id) do nothing;
  insert into public.role_templates (id, organization_id, level, name)
    values (v_other_role_staff, v_org_other, 'staff', '0079-T1-other-staff')
    on conflict (id) do nothing;
  -- Level user ini tidak relevan untuk T-DB-1: dia hanya dipakai sebagai created_by
  -- pada period_snapshots org lain. Aktor sesungguhnya (v_ceo) berasal dari v_org_self.
  insert into public.profiles (id, organization_id, role_template_id)
    values (v_other_ceo, v_org_other, v_other_role_staff)
    on conflict (id) do update set organization_id = excluded.organization_id;
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org_other, '0079-T1-other-period', current_date, current_date + 30, 'active', v_other_ceo)
    returning id into period_other;

  -- v_ceo (org_self) mencoba calc periode milik v_org_other → cross-org guard 0039 harus menolak
  -- dengan pesan 'Periode tidak ditemukan.' (BUKAN 'Anda tidak berwenang…'; guard org sengaja
  -- disamakan dengan not-found supaya eksistensi periode org lain tidak bocor).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.calculate_period_scores(period_other);
    fails := fails || 'cross_org_calc_accepted; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then
      fails := fails || 'wrong_msg:' || sqlerrm || '; ';
    end if;
  end;
  execute 'reset role';
  if fails <> '' then raise exception 'T-DB-1 FAIL: %', fails; end if;
  raise notice 'T-DB-1 cross-org calculate ditolak PASS';
end $$;
rollback;

-- ============================================================ T-DB-2: cross-org close_period_snapshot → 'Periode tidak ditemukan.'
begin;
do $$
declare
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_org_other uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_other_ceo uuid := 'aaaaaaaa-0000-0000-0000-0000000000c2';
  v_other_role_staff uuid := 'aaaaaaaa-0000-0000-0000-0000000000d2';
  period_other uuid; fails text := '';
begin
  insert into public.organizations (id, name) values (v_org_other, '0079-T2-other-org')
    on conflict (id) do nothing;
  insert into auth.users (id) values (v_other_ceo) on conflict (id) do nothing;
  insert into public.role_templates (id, organization_id, level, name)
    values (v_other_role_staff, v_org_other, 'staff', '0079-T2-other-staff')
    on conflict (id) do nothing;
  -- Level user ini tidak relevan untuk T-DB-2: dia hanya dipakai sebagai created_by
  -- pada period_snapshots org lain. Aktor sesungguhnya (v_ceo) berasal dari v_org_self.
  insert into public.profiles (id, organization_id, role_template_id)
    values (v_other_ceo, v_org_other, v_other_role_staff)
    on conflict (id) do update set organization_id = excluded.organization_id;
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org_other, '0079-T2-other-period', current_date, current_date + 30, 'draft', v_other_ceo)
    returning id into period_other;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.close_period_snapshot(period_other);
    fails := fails || 'cross_org_close_accepted; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then
      fails := fails || 'wrong_msg:' || sqlerrm || '; ';
    end if;
  end;
  execute 'reset role';
  if fails <> '' then raise exception 'T-DB-2 FAIL: %', fails; end if;
  raise notice 'T-DB-2 cross-org close ditolak PASS';
end $$;
rollback;

-- ============================================================ T-DB-3: authenticated EXECUTE + anon REVOKE (memory anon-public-rpc-grant-gotcha regression)
begin;
do $$
declare fails text := '';
begin
  -- authenticated harus EXECUTE (baseline privilege via 0036 blanket grant + tidak dicabut khusus).
  if not has_function_privilege('authenticated', 'public.calculate_period_scores(uuid)', 'EXECUTE') then
    fails := fails || 'authenticated_no_execute_calc; ';
  end if;
  if not has_function_privilege('authenticated', 'public.close_period_snapshot(uuid)', 'EXECUTE') then
    fails := fails || 'authenticated_no_execute_close; ';
  end if;
  -- anon TIDAK boleh EXECUTE (0013 inline + 0050 sweep + tidak reset oleh CREATE OR REPLACE 0079).
  if has_function_privilege('anon', 'public.calculate_period_scores(uuid)', 'EXECUTE') then
    fails := fails || 'anon_has_execute_calc; ';
  end if;
  if has_function_privilege('anon', 'public.close_period_snapshot(uuid)', 'EXECUTE') then
    fails := fails || 'anon_has_execute_close; ';
  end if;
  if fails <> '' then raise exception 'T-DB-3 FAIL: %', fails; end if;
  raise notice 'T-DB-3 grant/revoke shape PASS';
end $$;
rollback;

-- ============================================================ T-DB-4: pg_advisory_xact_lock terpasang di calculate_period_scores
begin;
do $$
declare v_body text; fails text := '';
begin
  select pg_get_functiondef(p.oid) into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'calculate_period_scores'
    limit 1;
  -- Regex multi-line safe ([\s\S]*? bukan .*) + case-insensitive.
  if v_body !~* E'pg_advisory_xact_lock[\\s\\S]*?hashtext[\\s\\S]*?''score_finalize:''[\\s\\S]*?p_period_id' then
    fails := fails || 'lock_missing_or_wrong_key_calc; ';
  end if;
  if fails <> '' then raise exception 'T-DB-4 FAIL: %', fails; end if;
  raise notice 'T-DB-4 calculate advisory lock present PASS';
end $$;
rollback;

-- ============================================================ T-DB-5: pg_advisory_xact_lock terpasang di close_period_snapshot
begin;
do $$
declare v_body text; fails text := '';
begin
  select pg_get_functiondef(p.oid) into v_body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'close_period_snapshot'
    limit 1;
  if v_body !~* E'pg_advisory_xact_lock[\\s\\S]*?hashtext[\\s\\S]*?''score_finalize:''[\\s\\S]*?p_period_id' then
    fails := fails || 'lock_missing_or_wrong_key_close; ';
  end if;
  if fails <> '' then raise exception 'T-DB-5 FAIL: %', fails; end if;
  raise notice 'T-DB-5 close advisory lock present PASS';
end $$;
rollback;

-- ============================================================ T-DB-6: calc → close menghasilkan ranking_snapshots NON-EMPTY (INV-2, inti bug jembatan)
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_role_staff uuid;
  v_u1 uuid := '99999999-0000-0000-0000-0000000000e1';
  v_u2 uuid := '99999999-0000-0000-0000-0000000000e2';
  v_u3 uuid := '99999999-0000-0000-0000-0000000000e3';
  v_formula_ver uuid;
  v_expected_staff int;
  period uuid; v_calc int; v_close int; v_rank int; fails text := '';
begin
  select id into v_role_staff
    from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  if v_role_staff is null then
    raise exception 'T-DB-6 SETUP FAIL: role_templates staff seed missing for v_org';
  end if;

  -- Seed formula 'active' level=staff SUPAYA calc TIDAK skip user (v_formula_id is null → continue).
  -- Tanpa ini, T-DB-6 lolos via cabang lenient calc=0 tanpa benar-benar membuktikan jembatan bekerja.
  -- template_id nullable → aman NULL. Satu kategori 100% bobot metrik action_plan_completion
  -- (null-safe, coalesce ke 0 di dalam compute_action_plan_completion — tidak throw untuk user tanpa tugas).
  insert into public.score_formula_versions
    (organization_id, level, categories, status, version_number)
    values (v_org, 'staff',
      '[{"code":"apc","source_metric":"action_plan_completion","weight":100}]'::jsonb,
      'active', 1)
    returning id into v_formula_ver;

  -- 3 staff user di v_org.
  insert into auth.users (id) values (v_u1), (v_u2), (v_u3) on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_u1, v_org, v_role_staff, 'Uji T6 satu'),
           (v_u2, v_org, v_role_staff, 'Uji T6 dua'),
           (v_u3, v_org, v_role_staff, 'Uji T6 tiga')
    on conflict (id) do update
      set organization_id = excluded.organization_id,
          role_template_id = excluded.role_template_id;

  -- Periode aktif (INSERT langsung sebagai postgres; RPC open_period_snapshot dilewati agar
  -- tidak bentrok partial-unique "one active per org" di lingkungan dev yang sudah ter-seed).
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, '0079-T6', current_date, current_date + 30, 'active', v_ceo)
    returning id into period;

  -- Expected count DINAMIS: v_org bisa sudah punya staff lain dari dev seed di luar 3 yang
  -- kita tambahkan (JANGAN hardcode 3 — assertion harus match populasi staff v_org sesungguhnya).
  select count(*) into v_expected_staff
    from public.profiles p
    join public.role_templates rt on rt.id = p.role_template_id
    where p.organization_id = v_org and rt.level = 'staff';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- Jalur JEMBATAN: calc → close (INILAH yang V1.83 tidak lakukan).
  v_calc := public.calculate_period_scores(period);
  v_close := public.close_period_snapshot(period);

  execute 'reset role';

  -- Kembali ke postgres agar RLS tidak menyembunyikan baris saat assertion.
  select count(*) into v_rank from public.ranking_snapshots where period_snapshot_id = period;

  -- Kontrak inti: formula 'active' di-seed di atas → calc WAJIB = v_expected_staff (populasi
  -- staff v_org sesungguhnya, minimal 3 yang kita tambahkan + mungkin seed dev lain). close =
  -- jumlah baris ranking.
  if v_calc <> v_expected_staff then
    fails := fails || 'calc_expected_' || v_expected_staff || '_got_' || v_calc || '; ';
  end if;
  if v_close <> v_rank then
    fails := fails || 'close_vs_ranking_mismatch:close=' || v_close || ',ranking=' || v_rank || '; ';
  end if;
  -- INV-2 — inti bug jembatan V1.83: calc>0 HARUS menghasilkan ranking>0. Sebelum Fase 0-4,
  -- close dipanggil tanpa calc sebelumnya → ranking selalu 0 meski user_score_results terisi
  -- di kesempatan lain. Assertion ini adalah canary permanen untuk regresi bug tsb.
  if v_calc > 0 and v_rank = 0 then
    fails := fails || 'jembatan_bug_regresi:calc=' || v_calc || ',ranking_kosong; ';
  end if;
  if v_rank <> v_expected_staff then
    fails := fails || 'ranking_expected_' || v_expected_staff || '_got_' || v_rank || '; ';
  end if;

  if fails <> '' then raise exception 'T-DB-6 FAIL: %', fails; end if;
  raise notice 'T-DB-6 calc→close non-empty ranking PASS (calc=% close=% ranking=%)', v_calc, v_close, v_rank;
end $$;
rollback;

-- ============================================================ T-DB-7: override SEBELUM close → ranking pakai manual_adjusted_score (INV-5)
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_role_staff uuid;
  v_u uuid := '99999999-0000-0000-0000-0000000000f1';
  v_formula uuid;
  period uuid; v_ranked_score numeric; fails text := '';
begin
  select id into v_role_staff
    from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  if v_role_staff is null then
    raise exception 'T-DB-7 SETUP FAIL: role_templates staff seed missing for v_org';
  end if;

  -- Seed formula sendiri, di-scope v_org (BUKAN cross-org select tanpa filter — bug fixture
  -- sebelumnya bisa mengambil score_formula_versions milik org lain, false-positive PASS).
  insert into public.score_formula_versions
    (organization_id, level, categories, status, version_number)
    values (v_org, 'staff',
      '[{"code":"apc","source_metric":"action_plan_completion","weight":100}]'::jsonb,
      'active', 1)
    returning id into v_formula;

  insert into auth.users (id) values (v_u) on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_u, v_org, v_role_staff, 'Uji T7 override')
    on conflict (id) do update set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id;

  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, '0079-T7', current_date, current_date + 30, 'active', v_ceo)
    returning id into period;

  -- Seed baris auto is_current=true dengan auto_calculated_score=80.
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    values (v_org, period, v_u, v_formula, 80.00, '{}'::jsonb, 'auto', true, now());

  -- Terapkan override manual_adjusted_score=95 SEBELUM close (result_kind='override', is_current=true).
  -- Direct INSERT (bukan via RPC override_user_score) supaya kontrak fokus di semantic coalesce close,
  -- bukan gate override RPC yang sudah di-cover kontrak fase7_people_score_contract.sql.
  update public.user_score_results set is_current = false
    where period_snapshot_id = period and user_id = v_u;
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, manual_adjusted_score, metric_breakdown,
     override_reason, override_changed_by, override_changed_at, override_approved_by,
     result_kind, is_current, calculated_at)
    values (v_org, period, v_u, v_formula, 80.00, 95.00, '{}'::jsonb,
            'kontrak T-DB-7', v_ceo, now(), v_ceo,
            'override', true, now());

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.close_period_snapshot(period);
  execute 'reset role';

  select score into v_ranked_score
    from public.ranking_snapshots
    where period_snapshot_id = period and user_id = v_u
    limit 1;
  if v_ranked_score is null then
    fails := fails || 'ranking_row_missing_for_override_user; ';
  elsif v_ranked_score <> 95.00 then
    fails := fails || 'ranking_score_expected_95_got_' || v_ranked_score || '; ';
  end if;

  if fails <> '' then raise exception 'T-DB-7 FAIL: %', fails; end if;
  raise notice 'T-DB-7 override coalesce ranking PASS (score=%)', v_ranked_score;
end $$;
rollback;
