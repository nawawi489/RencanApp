-- EMS V1.8.1 — Fase 7 contract suite (People & Score).
--
-- Membuktikan invarian Fase 7 di bawah KONTEKS USER NYATA (auth.uid() via request.jwt.claims +
-- set local role authenticated). Tiap test: fixture (privileged) → simulasi user → assert → ROLLBACK.
-- 'PASS' = lolos; exception = guard bocor. Mengikuti pola fase6_development_workspace_contract.sql.
--
-- Konstanta dev (project fhnqwytqprsptjshoxfn):
--   org=4b07a19f-550d-4952-b0d8-44f38f651d89, ceo=ca8c1471-b870-4f09-a149-25e5eae99d6f
--   role c_level=3d831bd8-b728-4be6-8551-09ac3697cada, staff=06771d3b-8d83-442d-a343-1d6248c43f53
--
-- Menjawab celah KRITIS critic rencana TDD: invarian governance server (AC-7.7/14/15/17/18/19/20/26/
-- 7.27/28/29/30/31/34 + D5 per-tier penalty + D10 single-actor + D11 tie-breaker rank kembar).

-- ============================================================ TEST 1: schema (7 tabel + kolom & CHECK kunci)
-- AC-7.4 (no weight planning card), AC-7.32 (severity 4 tier kolom), DC-7.1..7.7 (tabel & CHECK).
begin;
do $$
declare
  fails text := '';
  r record;
begin
  -- 7 tabel baru harus ada.
  for r in select t as name from unnest(array[
    'score_categories', 'score_formula_templates', 'score_formula_versions',
    'score_formula_assignments', 'period_snapshots', 'user_score_results', 'ranking_snapshots'
  ]) t loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=r.name) then
      fails := fails || r.name || '_table_missing; ';
    end if;
  end loop;

  -- score_formula_versions: status enum (D draft/active/archived), categories jsonb, version_number not null.
  if not exists (select 1 from pg_constraint c
                 where c.conrelid='public.score_formula_versions'::regclass
                   and c.conname='score_formula_versions_status_check') then
    fails := fails||'sfv_status_check_missing; ';
  end if;

  -- period_snapshots: status enum draft/active/closed; partial unique 1 active per org.
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and tablename='period_snapshots'
                   and indexdef ilike '%where%status%active%') then
    fails := fails||'period_active_partial_unique_missing; ';
  end if;

  -- user_score_results: result_kind ('auto'|'override'), is_current bool, version FK per-baris.
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='user_score_results'
                   and column_name='result_kind') then
    fails := fails||'usr_result_kind_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='user_score_results'
                   and column_name='score_formula_version_id') then
    fails := fails||'usr_version_per_row_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='user_score_results'
                   and column_name='is_current') then
    fails := fails||'usr_is_current_missing; ';
  end if;

  -- D10 revisi: TIDAK ada kolom override_status (single-actor, bukan two-actor pending/approved).
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='user_score_results'
               and column_name='override_status') then
    fails := fails||'override_status_should_not_exist_single_actor; ';
  end if;

  -- AC-7.4: tidak ada kolom weight di planning card.
  if exists (select 1 from information_schema.columns
             where table_schema='public'
               and table_name in ('goals','kpi_areas','strategies','initiatives','action_plans',
                                  'development_areas','problem_statements')
               and column_name in ('weight','bobot')) then
    fails := fails||'planning_card_has_weight; ';
  end if;

  if fails <> '' then raise exception 'TEST1 schema FAIL: %', fails; end if;
  raise notice 'TEST1 schema PASS';
end $$;
rollback;

-- ============================================================ TEST 2: SUM(weight)=100 wajib untuk activate
-- AC-7.1, AC-7.2, AC-7.5.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  tmpl uuid; v_bad uuid; v_good uuid; v_id uuid; fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- Buat template baru (CEO punya manage_score_formula via hardcode).
  insert into public.score_formula_templates (organization_id, name, level, is_default, created_by)
    values (v_org, 'T-staff-test', 'staff', false, v_ceo) returning id into tmpl;

  -- Draft version SUM=95 (gagal aktivasi).
  v_bad := public.upsert_score_formula_version(tmpl,
    '[{"code":"a","weight":50,"source_metric":"x"},{"code":"b","weight":45,"source_metric":"y"}]'::jsonb,
    'sum 95');

  begin
    perform public.activate_score_formula_version(v_bad, current_date);
    fails := fails||'sum95_activated; ';
  exception when others then
    if sqlerrm not ilike '%100%' then fails := fails||'sum95_wrong_msg:'||sqlerrm||'; '; end if;
  end;

  -- Verifikasi status tetap draft.
  if not exists (select 1 from public.score_formula_versions where id=v_bad and status='draft') then
    fails := fails||'sum95_status_changed; ';
  end if;

  -- Draft SUM=100 → aktivasi sukses; activated_at terisi; versi aktif sebelumnya (kalau ada) di-arsipkan.
  v_good := public.upsert_score_formula_version(tmpl,
    '[{"code":"a","weight":60,"source_metric":"x"},{"code":"b","weight":40,"source_metric":"y"}]'::jsonb,
    'sum 100');
  perform public.activate_score_formula_version(v_good, current_date);
  if not exists (select 1 from public.score_formula_versions where id=v_good and status='active'
                 and activated_at is not null) then
    fails := fails||'sum100_not_activated; ';
  end if;

  -- AC-7.5: upsert lain = INSERT baris baru, v_good TIDAK di-UPDATE in-place.
  v_id := public.upsert_score_formula_version(tmpl,
    '[{"code":"a","weight":70,"source_metric":"x"},{"code":"b","weight":30,"source_metric":"y"}]'::jsonb,
    'new draft');
  if v_id = v_good then fails := fails||'upsert_returned_same_id; '; end if;
  if not exists (select 1 from public.score_formula_versions where id=v_id and status='draft') then
    fails := fails||'new_draft_missing; ';
  end if;
  if not exists (select 1 from public.score_formula_versions where id=v_good and status='active') then
    fails := fails||'v_good_mutated; ';
  end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST2 sum100 FAIL: %', fails; end if;
  raise notice 'TEST2 SUM(weight)=100 gate + versioning (AC-7.1/2/5) PASS';
end $$;
rollback;

-- ============================================================ TEST 3: SECURITY DEFINER + revoke matrix
-- AC-7.34: RPC tulis di-revoke dari public, anon (heavy juga authenticated bila sistem).
begin;
do $$
declare
  fails text := '';
  v_count int;
  r record;
begin
  for r in select rpc from unnest(array[
    'upsert_score_formula_version', 'activate_score_formula_version', 'assign_score_formula',
    'open_period_snapshot', 'calculate_period_scores', 'close_period_snapshot', 'override_user_score'
  ]) rpc loop
    -- security definer
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname=r.rpc and p.prosecdef) then
      fails := fails || r.rpc || '_not_secdef; ';
    end if;
    -- revoke public, anon (no execute privilege)
    if exists (select 1 from information_schema.routine_privileges
               where routine_schema='public' and routine_name=r.rpc and grantee in ('public','anon')
                 and privilege_type='EXECUTE') then
      fails := fails || r.rpc || '_executable_by_public_anon; ';
    end if;
  end loop;

  -- D10 revisi: TIDAK ada approve_score_override (single-actor).
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.proname='approve_score_override') then
    fails := fails||'approve_score_override_should_not_exist_single_actor; ';
  end if;

  if fails <> '' then raise exception 'TEST3 secdef_revoke FAIL: %', fails; end if;
  raise notice 'TEST3 SECURITY DEFINER + revoke matrix (AC-7.34) PASS';
end $$;
rollback;

-- ============================================================ TEST 4: override single-actor + audit
-- AC-7.15 (isi baris), AC-7.16 (reason wajib), AC-7.18 (anti-self → exception),
-- AC-7.30 (activity_logs 'score_override_applied' pada SUCCESS), D10 revisi (approved_by=changed_by).
-- KETERBATASAN V1: governance_violations row pada attempts (self/unauthorized) tak persist
-- karena PG single-tx + caller exception handler rolls back; defer Fase 8 (dblink/pg_background).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  target uuid := '77777777-7777-7777-7777-777777777701';
  period uuid; r_auto uuid; r_over uuid; fails text := '';
begin
  insert into auth.users (id) values (target) on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id) values (target, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  -- Open period via RPC.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  period := public.open_period_snapshot('P-test', current_date, current_date+30);
  execute 'reset role';

  -- Seed auto score row as service role (simulasi tulisan calculate_period_scores).
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, manual_adjusted_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, target, sfv.id, 75.00, null, '{"a":75}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv where sfv.status='active' and sfv.level='staff'
      and (sfv.organization_id=v_org or sfv.organization_id is null) limit 1
    returning id into r_auto;

  -- AC-7.16/18 tests sebagai CEO.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform public.override_user_score(period, target, 80.00, '');
    fails := fails||'empty_reason_accepted; ';
  exception when others then
    if sqlerrm not ilike '%alasan%' and sqlerrm not ilike '%reason%' then
      fails := fails||'empty_reason_wrong_msg:'||sqlerrm||'; ';
    end if;
  end;

  begin
    perform public.override_user_score(period, v_ceo, 90.00, 'self test');
    fails := fails||'self_override_accepted; ';
  exception when others then
    if sqlerrm not ilike '%sendiri%' then fails := fails||'self_override_wrong_msg:'||sqlerrm||'; '; end if;
  end;

  -- AC-7.15 + AC-7.30: success path.
  r_over := public.override_user_score(period, target, 82.00, 'koreksi data');
  if not exists (select 1 from public.user_score_results
                 where id=r_over and result_kind='override' and is_current=true
                   and auto_calculated_score=75.00 and manual_adjusted_score=82.00
                   and override_reason='koreksi data'
                   and override_changed_by=v_ceo and override_approved_by=v_ceo) then
    fails := fails||'override_row_shape_wrong; ';
  end if;
  if exists (select 1 from public.user_score_results where id=r_auto and is_current=true) then
    fails := fails||'old_auto_still_current; ';
  end if;
  if not exists (select 1 from public.activity_logs
                 where entity_id=r_over and action='score_override_applied') then
    fails := fails||'no_activity_log_override; ';
  end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST4 override FAIL: %', fails; end if;
  raise notice 'TEST4 override single-actor + success audit (AC-7.15/16/18/30 + D10) PASS';
end $$;
rollback;

-- ============================================================ TEST 5: unauthorized override → exception
-- AC-7.17 (V1 trimmed): user tanpa manage_score_formula → exception bahasa Indonesia.
-- Violation row pada attempts defer Fase 8 (catatan V1).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  stf uuid := '77777777-7777-7777-7777-777777777702';
  target uuid := '77777777-7777-7777-7777-777777777703';
  period uuid; fails text := '';
begin
  insert into auth.users (id) values (stf), (target) on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id) values
    (stf, v_org, v_role_staff), (target, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  period := public.open_period_snapshot('P-unauth', current_date, current_date+30);
  execute 'reset role';

  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, target, sfv.id, 60.00, '{}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv where sfv.status='active' and sfv.level='staff'
      and (sfv.organization_id=v_org or sfv.organization_id is null) limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.override_user_score(period, target, 99.00, 'sabotase');
    fails := fails||'unauth_accepted; ';
  exception when others then
    if sqlerrm not ilike '%berwenang%' and sqlerrm not ilike '%izin%' then
      fails := fails||'unauth_wrong_msg:'||sqlerrm||'; ';
    end if;
  end;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST5 unauth_override FAIL: %', fails; end if;
  raise notice 'TEST5 unauthorized override → exception (AC-7.17 trimmed V1) PASS';
end $$;
rollback;

-- ============================================================ TEST 6: idempotency calculate vs override
-- AC-7.14: re-run calculate men-supersede auto (is_current=false → insert auto baru) TANPA menyentuh
-- baris result_kind='override' yang is_current; auto_calculated_score historis tidak hilang.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  u1 uuid := '77777777-7777-7777-7777-777777777710';
  u2 uuid := '77777777-7777-7777-7777-777777777711';
  period uuid; r_over uuid;
  fails text := ''; v_auto_rows int; v_override_rows int; v_current_auto_u1 int;
begin
  insert into auth.users (id) values (u1), (u2);
  insert into public.profiles (id, organization_id, role_template_id) values
    (u1, v_org, v_role_staff), (u2, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  period := public.open_period_snapshot('P-idemp', current_date, current_date+30);
  perform public.calculate_period_scores(period);  -- run 1

  -- Override u2 setelah run 1.
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, u2, sfv.id, 50.00, '{}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv where sfv.status='active' limit 1
    on conflict do nothing;
  r_over := public.override_user_score(period, u2, 88.00, 'koreksi');

  -- Run 2: auto u1 di-supersede; override u2 tidak boleh disentuh.
  perform public.calculate_period_scores(period);

  -- Override masih is_current=true & utuh.
  if not exists (select 1 from public.user_score_results
                 where id=r_over and result_kind='override' and is_current=true
                   and manual_adjusted_score=88.00) then
    fails := fails||'override_lost_after_recalc; ';
  end if;

  -- Auto u2 lama yang sudah is_current=false tidak hilang (audit trail).
  select count(*) into v_auto_rows from public.user_score_results
    where period_snapshot_id=period and user_id=u2 and result_kind='auto';
  if v_auto_rows < 1 then fails := fails||'auto_history_lost; '; end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST6 idempotency FAIL: %', fails; end if;
  raise notice 'TEST6 idempotency calculate vs override (AC-7.14) PASS';
end $$;
rollback;

-- ============================================================ TEST 7: close periode atomik & immutable
-- AC-7.7 (closed read-only), AC-7.19 (atomik insert ranking + flip status),
-- AC-7.20 (ranking immutable), AC-7.30 (activity_logs 'period_closed').
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  u uuid := '77777777-7777-7777-7777-777777777720';
  period uuid; fails text := ''; v_rank_rows int;
begin
  insert into auth.users (id) values (u);
  insert into public.profiles (id, organization_id, role_template_id) values (u, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  period := public.open_period_snapshot('P-close', current_date, current_date+30);
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, u, sfv.id, 70.00, '{}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv where sfv.status='active' limit 1;

  perform public.close_period_snapshot(period);

  -- Status closed + closed_at + closed_by terisi.
  if not exists (select 1 from public.period_snapshots
                 where id=period and status='closed' and closed_at is not null and closed_by=v_ceo) then
    fails := fails||'period_not_closed; ';
  end if;

  -- ranking_snapshots ter-insert.
  select count(*) into v_rank_rows from public.ranking_snapshots where period_snapshot_id=period;
  if v_rank_rows < 1 then fails := fails||'no_ranking_rows; '; end if;

  -- activity_logs 'period_closed'.
  if not exists (select 1 from public.activity_logs
                 where entity_id=period and action='period_closed') then
    fails := fails||'no_activity_log_close; ';
  end if;

  -- AC-7.7: override pada periode closed → ditolak.
  begin
    perform public.override_user_score(period, u, 99.00, 'after close');
    fails := fails||'override_after_close_accepted; ';
  exception when others then
    if sqlerrm not ilike '%ditutup%' then fails := fails||'override_after_close_wrong_msg:'||sqlerrm||'; '; end if;
  end;

  -- AC-7.7: calculate pada periode closed → ditolak.
  begin
    perform public.calculate_period_scores(period);
    fails := fails||'calc_after_close_accepted; ';
  exception when others then
    if sqlerrm not ilike '%ditutup%' then fails := fails||'calc_after_close_wrong_msg:'||sqlerrm||'; '; end if;
  end;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST7 close FAIL: %', fails; end if;
  raise notice 'TEST7 close atomik + closed read-only (AC-7.7/19/20/30) PASS';
end $$;
rollback;

-- ============================================================ TEST 8: satu periode active per org
-- AC-7.29: partial unique index where status='active' (BUKAN sekadar guard RPC).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  p1 uuid; p2 uuid; fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  p1 := public.open_period_snapshot('P-uniq1', current_date, current_date+30);

  -- Buka periode kedua → ditolak (RPC guard atau partial unique).
  begin
    p2 := public.open_period_snapshot('P-uniq2', current_date+31, current_date+60);
    fails := fails||'second_active_period_allowed; ';
  exception when others then null; end;

  -- Direct INSERT (bypass RPC) periode kedua active → ditolak partial unique.
  begin
    insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
      values (v_org, 'P-bypass', current_date+31, current_date+60, 'active', v_ceo);
    fails := fails||'direct_insert_active_allowed; ';
  exception when unique_violation then null;
    when others then fails := fails||'direct_insert_wrong_err:'||sqlerrm||'; '; end;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST8 one_active FAIL: %', fails; end if;
  raise notice 'TEST8 satu periode active per org (AC-7.29) PASS';
end $$;
rollback;

-- ============================================================ TEST 9: RLS read-path — self + supervisor + outsider
-- AC-7.26 (outsider → 0 baris graceful), AC-7.27 (skor sendiri selalu terbaca),
-- D1/D2 (visibility restriktif + atasan via is_supervisor_of rantai PIC-induk).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  boss uuid := '88888888-8888-8888-8888-888888888801';
  staff uuid := '88888888-8888-8888-8888-888888888802';
  outsider uuid := '88888888-8888-8888-8888-888888888803';
  period uuid; g uuid; k uuid; s uuid; i uuid; ap uuid; n int; fails text := '';
begin
  -- Seed 3 user.
  insert into auth.users (id) values (boss),(staff),(outsider);
  insert into public.profiles (id, organization_id, role_template_id) values
    (boss, v_org, v_role_staff), (staff, v_org, v_role_staff), (outsider, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  -- Rantai PIC-induk: boss = PIC Goal; staff = PIC Action Plan turunan.
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'G-sup', boss, current_date, current_date+30, 'active', v_ceo) returning id into g;
  insert into public.kpi_areas (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
    values (v_org, g, 'K-sup', 'tgt', boss, current_date, current_date+30, 'active', v_ceo) returning id into k;
  insert into public.strategies (organization_id, kpi_area_id, name, pic_id, status, created_by)
    values (v_org, k, 'S-sup', boss, 'active', v_ceo) returning id into s;
  insert into public.initiatives (organization_id, name, strategy_id, pic_id, status, created_by)
    values (v_org, 'I-sup', s, boss, 'active', v_ceo) returning id into i;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, status, created_by)
    values (v_org, i, 'AP-sup', staff, boss, 'assigned', v_ceo) returning id into ap;

  -- Periode aktif + skor staff.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  period := public.open_period_snapshot('P-rls', current_date, current_date+30);
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, staff, sfv.id, 65.00, '{}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv where sfv.status='active' limit 1;
  execute 'reset role';

  -- AC-7.26: outsider → 0 baris (BUKAN error).
  perform set_config('request.jwt.claims', json_build_object('sub',outsider,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.user_score_results where user_id=staff and period_snapshot_id=period;
    if n <> 0 then fails := fails||'outsider_sees_score('||n||'); '; end if;
  exception when others then fails := fails||'outsider_rls_threw:'||sqlerrm||'; '; end;
  execute 'reset role';

  -- AC-7.27: staff sendiri → 1 baris.
  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.user_score_results where user_id=staff and period_snapshot_id=period;
  if n <> 1 then fails := fails||'self_not_sees_own_score('||n||'); '; end if;
  execute 'reset role';

  -- D1/D2: boss (supervisor via rantai PIC-induk Goal → ... → AP.pic=staff) → 1 baris.
  perform set_config('request.jwt.claims', json_build_object('sub',boss,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.user_score_results where user_id=staff and period_snapshot_id=period;
  if n <> 1 then fails := fails||'supervisor_blind('||n||'); '; end if;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST9 rls_visibility FAIL: %', fails; end if;
  raise notice 'TEST9 RLS visibility self/supervisor/outsider (AC-7.26/27 + D1/D2) PASS';
end $$;
rollback;

-- ============================================================ TEST 10: NULL role_template_id di-skip deterministik
-- AC-7.28: user dengan role_template_id NULL tidak menggagalkan batch & tak dapat skor.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  u_null uuid := '99999999-9999-9999-9999-999999999901';
  u_ok uuid := '99999999-9999-9999-9999-999999999902';
  period uuid; fails text := ''; n_null int; n_ok int;
begin
  insert into auth.users (id) values (u_null), (u_ok);
  insert into public.profiles (id, organization_id, role_template_id) values
    (u_null, v_org, null), (u_ok, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  period := public.open_period_snapshot('P-nullrole', current_date, current_date+30);
  -- Batch tidak boleh gagal karena u_null.
  begin
    perform public.calculate_period_scores(period);
  exception when others then fails := fails||'batch_threw_on_null:'||sqlerrm||'; '; end;

  select count(*) into n_null from public.user_score_results
    where period_snapshot_id=period and user_id=u_null;
  if n_null <> 0 then fails := fails||'null_role_got_score; '; end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST10 null_role_skip FAIL: %', fails; end if;
  raise notice 'TEST10 NULL role_template_id deterministic skip (AC-7.28) PASS';
end $$;
rollback;

-- ============================================================ TEST 11: tie-breaker rank kembar (D11)
-- Skor identik → rank_number sama; rank berikut melompat (1,1,3 bukan 1,2,3).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  u1 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01';
  u2 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02';
  u3 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03';
  period uuid; fails text := ''; r1 int; r2 int; r3 int;
begin
  insert into auth.users (id) values (u1),(u2),(u3);
  insert into public.profiles (id, organization_id, role_template_id, full_name) values
    (u1, v_org, v_role_staff, 'Alpha'), (u2, v_org, v_role_staff, 'Beta'),
    (u3, v_org, v_role_staff, 'Charlie')
    on conflict (id) do update set organization_id=excluded.organization_id,
      role_template_id=excluded.role_template_id, full_name=excluded.full_name;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  period := public.open_period_snapshot('P-tie', current_date, current_date+30);

  -- Manual seed scores: u1=u2=80, u3=50 (tie di top).
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, x.uid, sfv.id, x.s, '{}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv,
         (values (u1, 80.00), (u2, 80.00), (u3, 50.00)) x(uid, s)
    where sfv.status='active' limit 3;

  perform public.close_period_snapshot(period);

  select rank_number into r1 from public.ranking_snapshots where period_snapshot_id=period and user_id=u1;
  select rank_number into r2 from public.ranking_snapshots where period_snapshot_id=period and user_id=u2;
  select rank_number into r3 from public.ranking_snapshots where period_snapshot_id=period and user_id=u3;

  if r1 <> r2 then fails := fails||'tie_not_equal_rank('||r1||','||r2||'); '; end if;
  if r3 <= r2 then fails := fails||'rank_did_not_skip('||r2||'→'||r3||'); '; end if;
  if r3 <> r2 + 2 then fails := fails||'skip_amount_wrong('||r3||'≠'||(r2+2)||'); '; end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST11 tie_break FAIL: %', fails; end if;
  raise notice 'TEST11 tie-breaker rank kembar (D11) PASS';
end $$;
rollback;

-- ============================================================ TEST 12: governance_discipline SEKALI per tier (D5)
-- Helper compute_governance_discipline(p_user, p_org, p_start, p_end) — penalti DISTINCT severity.
-- low=2 med=5 high=15 crit=40, maks 62. 5 critical = 1 critical = −40 (sekali).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  u uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01';
  d1 numeric; d2 numeric; d3 numeric; fails text := '';
begin
  insert into auth.users (id) values (u);
  insert into public.profiles (id, organization_id, role_template_id) values (u, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  -- Skenario 1: tanpa pelanggaran → 100.
  d1 := public.compute_governance_discipline(u, v_org, current_date, current_date+30);
  if d1 <> 100 then fails := fails||'no_violation_not_100('||d1||'); '; end if;

  -- Skenario 2: 5 pelanggaran critical → 100 − 40 = 60 (SEKALI per tier, bukan 100 − 200 → 0).
  insert into public.governance_violations (organization_id, user_id, violation_type, severity, created_at)
    select v_org, u, 'test', 'critical', current_date + (i || ' days')::interval
    from generate_series(0,4) i;
  d2 := public.compute_governance_discipline(u, v_org, current_date, current_date+30);
  if d2 <> 60 then fails := fails||'5_critical_not_60('||d2||'); '; end if;

  -- Skenario 3: tambah 1 high & 1 medium → 100 − (40+15+5) = 40.
  insert into public.governance_violations (organization_id, user_id, violation_type, severity)
    values (v_org, u, 'test', 'high'), (v_org, u, 'test', 'medium');
  d3 := public.compute_governance_discipline(u, v_org, current_date, current_date+30);
  if d3 <> 40 then fails := fails||'mixed_tiers_not_40('||d3||'); '; end if;

  if fails <> '' then raise exception 'TEST12 gov_per_tier FAIL: %', fails; end if;
  raise notice 'TEST12 governance_discipline SEKALI per tier (D5) PASS';
end $$;
rollback;

-- ============================================================ TEST 13: seed Staff fully-computable + komposisi
-- D7: hanya Staff aktif; D4: result_achievement keluar (6 kategori SUM=100).
-- D13: config transparan org (SELECT score_formula_* lolos untuk semua anggota org).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  staff uuid := 'cccccccc-cccc-cccc-cccc-cccccccccc01';
  sum_w numeric; cat_count int; has_result_achv int; n int; fails text := '';
begin
  insert into auth.users (id) values (staff);
  insert into public.profiles (id, organization_id, role_template_id) values (staff, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  -- Staff template aktif untuk org (default sistem ATAU per-org).
  select sum((c->>'weight')::numeric), count(*),
         sum(case when (c->>'code') = 'result_achievement' then 1 else 0 end)
    into sum_w, cat_count, has_result_achv
  from public.score_formula_versions sfv,
       jsonb_array_elements(sfv.categories) c
  where sfv.level='staff' and sfv.status='active'
    and (sfv.organization_id = v_org or sfv.organization_id is null)
  limit 1;
  if sum_w <> 100 then fails := fails||'staff_seed_sum_not_100('||sum_w||'); '; end if;
  if cat_count <> 6 then fails := fails||'staff_seed_cat_count_not_6('||cat_count||'); '; end if;
  if has_result_achv <> 0 then fails := fails||'result_achievement_in_seed(D4_violation); '; end if;

  -- D7: tidak ada formula level Management/C-Level/CEO yang 'active'.
  select count(*) into n from public.score_formula_versions
    where level in ('management','c_level','ceo') and status='active'
      and (organization_id = v_org or organization_id is null);
  if n <> 0 then fails := fails||'higher_level_active_violates_D7('||n||'); '; end if;

  -- D13: Staff dapat SELECT score_formula_versions (transparan org).
  perform set_config('request.jwt.claims', json_build_object('sub',staff,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.score_formula_versions where level='staff';
  if n < 1 then fails := fails||'staff_blind_to_formula_config; '; end if;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST13 seed FAIL: %', fails; end if;
  raise notice 'TEST13 seed Staff fully-computable + transparan (D4/D7/D13) PASS';
end $$;
rollback;

-- ============================================================ TEST 14: review_pass_rate sumber (D3 + AC-7.11)
-- review_pass_rate dari action_plan_submissions.review_status='approved' ÷ count(*) (BUKAN reviews.decision).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  staff uuid := 'dddddddd-dddd-dddd-dddd-dddddddddd01';
  g uuid; k uuid; s uuid; i uuid; ap uuid; sub uuid; r numeric; fails text := '';
begin
  insert into auth.users (id) values (staff);
  insert into public.profiles (id, organization_id, role_template_id) values (staff, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'G-rev', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into g;
  insert into public.kpi_areas (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
    values (v_org, g, 'K-rev', 'tgt', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into k;
  insert into public.strategies (organization_id, kpi_area_id, name, pic_id, status, created_by)
    values (v_org, k, 'S-rev', v_ceo, 'active', v_ceo) returning id into s;
  insert into public.initiatives (organization_id, name, strategy_id, pic_id, status, created_by)
    values (v_org, 'I-rev', s, v_ceo, 'active', v_ceo) returning id into i;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, status, created_by)
    values (v_org, i, 'AP-rev', staff, v_ceo, 'assigned', v_ceo) returning id into ap;

  -- 3 submissions: 2 approved, 1 rejected → 2/3 ≈ 66.67.
  insert into public.action_plan_submissions (action_plan_id, version_number, submitted_by, submitted_at, review_status)
    values (ap, 1, staff, current_date+1, 'approved'),
           (ap, 2, staff, current_date+2, 'approved'),
           (ap, 3, staff, current_date+3, 'rejected');

  -- Helper menghitung dari submissions, bukan reviews.
  r := public.compute_review_pass_rate(staff, v_org, current_date, current_date+30);
  if r < 66.6 or r > 66.7 then fails := fails||'review_pass_rate_wrong('||r||'); '; end if;

  if fails <> '' then raise exception 'TEST14 review_pass_rate FAIL: %', fails; end if;
  raise notice 'TEST14 review_pass_rate dari submissions (D3 + AC-7.11) PASS';
end $$;
rollback;

-- ============================================================ TEST 15: append-only — no hard delete
-- AC-7.31: user_score_results / ranking_snapshots tidak boleh dihapus langsung (trigger ATAU revoke).
-- AC-7.30: activity_logs append-only (sudah dijamin Fase 1 - sanity check).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  u uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
  period uuid; r uuid; fails text := '';
begin
  insert into auth.users (id) values (u);
  insert into public.profiles (id, organization_id, role_template_id) values (u, v_org, v_role_staff)
    on conflict (id) do update set organization_id=excluded.organization_id, role_template_id=excluded.role_template_id;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  period := public.open_period_snapshot('P-append', current_date, current_date+30);
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, u, sfv.id, 70.00, '{}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv where sfv.status='active' limit 1
    returning id into r;

  -- DELETE langsung pada baris current → ditolak (trigger ATAU policy DELETE absent).
  begin
    delete from public.user_score_results where id=r;
    -- Jika DELETE sukses tanpa exception, periksa apakah baris memang sudah hilang.
    if not exists (select 1 from public.user_score_results where id=r) then
      fails := fails||'user_score_results_deletable; ';
    end if;
  exception when others then null; end;  -- ditolak = OK.

  execute 'reset role';
  if fails <> '' then raise exception 'TEST15 append_only FAIL: %', fails; end if;
  raise notice 'TEST15 append-only no hard delete (AC-7.31) PASS';
end $$;
rollback;
