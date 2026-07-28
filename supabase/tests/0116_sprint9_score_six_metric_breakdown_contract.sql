-- Sprint 9 S9-2 — Fixture mesin skor yang mencakup KEENAM metrik dgn assert
-- terhadap kolom `metric_breakdown` (BUKAN sekadar "tidak melempar").
-- Jalankan: docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0116_sprint9_score_six_metric_breakdown_contract.sql
-- Pola: `begin; do $$..$$; rollback;`. RAISE NOTICE 'PASS' bila lolos, RAISE EXCEPTION 'FAIL: …' bila regresi.
-- ID dev lokal: org=52b0ebe1-…b70, ceo=11111111-…001 (mirror close_period_snapshot_contract.sql, 0079).
--
-- Motivasi (audit 2026-07-26):
--   * Fixture eksisting 0079/close_period_snapshot hanya memakai SATU metrik
--     (action_plan_completion). Bug yang butuh migrasi 0099 (compute_development_contribution
--     merujuk kolom hilang pasca rename 0045) HANYA muncul saat formula MEMUAT metrik yang
--     rusak — dan tak ada tes yang melakukannya. Nilai salah pun bisa terus lolos karena
--     tak ada assert atas `metric_breakdown` (hanya seed `'{}'::jsonb`).
--
-- Kontrak:
--   * T9-2-1: calculate_period_scores dgn formula 6-metrik untuk 1 user tanpa data → semua 6
--     kunci tampil di `metric_breakdown` dgn nilai yang tepat sesuai default fungsi metrik:
--        apc=0, rc=0, otr=0, rpr=0, dev=0, gov=100
--     auto_calculated_score = 100 × (gov_weight / 100) = 10.00 (weight lain × 0 = 0).
--   * T9-2-2: sama seperti T9-2-1 tapi satu governance_violation 'critical' → gov=60
--     (subtraction 40). Membuktikan compute_governance_discipline benar-benar terpanggil,
--     BUKAN sekadar mengembalikan default 100.

-- ============================================================ T9-2-1: zero-data → 6 kunci breakdown, gov=100 (default), score=10.00
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_role_staff uuid;
  v_u uuid := '99999999-9200-0000-0000-000000000001';
  v_formula uuid;
  v_period uuid;
  v_score numeric;
  v_bd jsonb;
  fails text := '';
begin
  select id into v_role_staff
    from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  if v_role_staff is null then
    raise exception 'T9-2-1 SETUP FAIL: role_templates staff seed missing for v_org';
  end if;

  -- Seed formula dgn SEMUA 6 metrik (V1 default weights per 0013:864–869).
  insert into public.score_formula_versions
    (organization_id, level, categories, status, version_number)
    values (v_org, 'staff',
      $j$[
        {"code":"apc","weight":24,"source_metric":"action_plan_completion"},
        {"code":"rc","weight":24,"source_metric":"repeat_compliance"},
        {"code":"otr","weight":18,"source_metric":"on_time_rate"},
        {"code":"rpr","weight":12,"source_metric":"review_pass_rate"},
        {"code":"dev","weight":12,"source_metric":"development_contribution"},
        {"code":"gov","weight":10,"source_metric":"governance_discipline"}
      ]$j$::jsonb,
      'active', 1)
    returning id into v_formula;

  -- 1 staff user tanpa data (semua metrik ratio → 0, gov → 100 default).
  insert into auth.users (id, raw_app_meta_data)
    values (v_u, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_u, v_org, v_role_staff, 'Uji T9-2-1 zero-data')
    on conflict (id) do update
      set organization_id = excluded.organization_id,
          role_template_id = excluded.role_template_id;

  -- Netralkan periode aktif eksisting (pola sama dgn 0079 T-DB-6).
  update public.period_snapshots
     set status = 'closed'
   where organization_id = v_org and status = 'active';

  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'T9-2-1', current_date, current_date + 30, 'active', v_ceo)
    returning id into v_period;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.calculate_period_scores(v_period);
  execute 'reset role';

  select auto_calculated_score, metric_breakdown
    into v_score, v_bd
    from public.user_score_results
    where period_snapshot_id = v_period
      and user_id = v_u
      and result_kind = 'auto'
      and is_current = true
    limit 1;

  if v_score is null then
    fails := fails || 'user_score_row_missing; ';
  else
    if v_bd is null then
      fails := fails || 'metric_breakdown_null; ';
    else
      -- Semua 6 kunci HARUS hadir (bukan hanya "tidak throw").
      if not (v_bd ? 'apc') then fails := fails || 'missing_key_apc; '; end if;
      if not (v_bd ? 'rc')  then fails := fails || 'missing_key_rc; '; end if;
      if not (v_bd ? 'otr') then fails := fails || 'missing_key_otr; '; end if;
      if not (v_bd ? 'rpr') then fails := fails || 'missing_key_rpr; '; end if;
      if not (v_bd ? 'dev') then fails := fails || 'missing_key_dev; '; end if;
      if not (v_bd ? 'gov') then fails := fails || 'missing_key_gov; '; end if;

      -- Nilai per metrik: ratio metrics default 0, governance_discipline default 100.
      if (v_bd->>'apc')::numeric <> 0     then fails := fails || 'apc_expected_0_got_'   || (v_bd->>'apc')  || '; '; end if;
      if (v_bd->>'rc')::numeric  <> 0     then fails := fails || 'rc_expected_0_got_'    || (v_bd->>'rc')   || '; '; end if;
      if (v_bd->>'otr')::numeric <> 0     then fails := fails || 'otr_expected_0_got_'   || (v_bd->>'otr')  || '; '; end if;
      if (v_bd->>'rpr')::numeric <> 0     then fails := fails || 'rpr_expected_0_got_'   || (v_bd->>'rpr')  || '; '; end if;
      if (v_bd->>'dev')::numeric <> 0     then fails := fails || 'dev_expected_0_got_'   || (v_bd->>'dev')  || '; '; end if;
      if (v_bd->>'gov')::numeric <> 100   then fails := fails || 'gov_expected_100_got_' || (v_bd->>'gov')  || '; '; end if;
    end if;
    -- score = 0*24 + 0*24 + 0*18 + 0*12 + 0*12 + 100*10 = 1000 → /100 = 10.00.
    if v_score <> 10.00 then
      fails := fails || 'score_expected_10.00_got_' || v_score || '; ';
    end if;
  end if;

  if fails <> '' then raise exception 'T9-2-1 FAIL: %', fails; end if;
  raise notice 'T9-2-1 six-metric zero-data breakdown PASS (score=% breakdown=%)', v_score, v_bd;
end $$;
rollback;

-- ============================================================ T9-2-2: satu governance_violation 'critical' di dalam periode → gov=60
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_role_staff uuid;
  v_u uuid := '99999999-9200-0000-0000-000000000002';
  v_formula uuid;
  v_period uuid;
  v_score numeric;
  v_bd jsonb;
  fails text := '';
begin
  select id into v_role_staff
    from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  if v_role_staff is null then
    raise exception 'T9-2-2 SETUP FAIL: role_templates staff seed missing for v_org';
  end if;

  insert into public.score_formula_versions
    (organization_id, level, categories, status, version_number)
    values (v_org, 'staff',
      $j$[
        {"code":"apc","weight":24,"source_metric":"action_plan_completion"},
        {"code":"rc","weight":24,"source_metric":"repeat_compliance"},
        {"code":"otr","weight":18,"source_metric":"on_time_rate"},
        {"code":"rpr","weight":12,"source_metric":"review_pass_rate"},
        {"code":"dev","weight":12,"source_metric":"development_contribution"},
        {"code":"gov","weight":10,"source_metric":"governance_discipline"}
      ]$j$::jsonb,
      'active', 1)
    returning id into v_formula;

  insert into auth.users (id, raw_app_meta_data)
    values (v_u, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_u, v_org, v_role_staff, 'Uji T9-2-2 gov-critical')
    on conflict (id) do update
      set organization_id = excluded.organization_id,
          role_template_id = excluded.role_template_id;

  update public.period_snapshots
     set status = 'closed'
   where organization_id = v_org and status = 'active';

  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'T9-2-2', current_date, current_date + 30, 'active', v_ceo)
    returning id into v_period;

  -- Satu governance_violation 'critical' dalam periode → subtraction 40 → gov=60.
  insert into public.governance_violations
    (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity, created_at)
    values (v_org, v_u, 'test_violation', null, null, '{}'::jsonb, 'critical', now());

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.calculate_period_scores(v_period);
  execute 'reset role';

  select auto_calculated_score, metric_breakdown
    into v_score, v_bd
    from public.user_score_results
    where period_snapshot_id = v_period
      and user_id = v_u
      and result_kind = 'auto'
      and is_current = true
    limit 1;

  if v_score is null then
    fails := fails || 'user_score_row_missing; ';
  else
    -- 6 kunci harus hadir.
    if not (v_bd ?& array['apc','rc','otr','rpr','dev','gov']) then
      fails := fails || 'missing_one_or_more_keys:' || (v_bd::text) || '; ';
    end if;
    -- gov = 100 - 40 (critical) = 60. Membuktikan compute_governance_discipline benar-benar
    -- terpanggil, bukan sekadar default no-op.
    if (v_bd->>'gov')::numeric <> 60 then
      fails := fails || 'gov_expected_60_got_' || (v_bd->>'gov') || '; ';
    end if;
    -- Metrik ratio lain tetap 0 (tanpa data). apc/rc/otr/rpr/dev = 0.
    if (v_bd->>'apc')::numeric <> 0 then fails := fails || 'apc_expected_0_got_' || (v_bd->>'apc') || '; '; end if;
    if (v_bd->>'dev')::numeric <> 0 then fails := fails || 'dev_expected_0_got_' || (v_bd->>'dev') || '; '; end if;
    -- score = 0*24 + 0*24 + 0*18 + 0*12 + 0*12 + 60*10 = 600 → /100 = 6.00.
    if v_score <> 6.00 then
      fails := fails || 'score_expected_6.00_got_' || v_score || '; ';
    end if;
  end if;

  if fails <> '' then raise exception 'T9-2-2 FAIL: %', fails; end if;
  raise notice 'T9-2-2 six-metric governance-critical breakdown PASS (score=% breakdown=%)', v_score, v_bd;
end $$;
rollback;
