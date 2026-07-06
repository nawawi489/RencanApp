-- EMS — Fase 7 cross-org isolation contract (migration 0039).
--
-- Membuktikan RPC Fase 7 ber-SECURITY DEFINER menolak periode LINTAS-ORG. Sebelum 0039, pemegang
-- manage_score_formula (CEO) org A dapat close / calculate / override periode milik org B hanya
-- dengan menebak UUID (RLS di-bypass di dalam SECURITY DEFINER). Contract fase7 asli sengaja
-- melewati kasus ini; blok di bawah menutup gap tsb.
--
-- Pola: begin; do $$ ... raise notice '... PASS'; end $$; rollback;  (exception = guard bocor).
-- Konstanta LOCAL DB (docker supabase_db_supabase):
--   org A = 52b0ebe1-d8bd-466d-b491-526ee6518b70 (Nyantuy Group)
--   ceo A = 11111111-1111-1111-1111-000000000001 (role level ceo, aktif → manage_score_formula true)
-- Org B + fixture-nya dibuat transient di dalam tiap transaksi lalu di-ROLLBACK.
--
-- Verifikasi:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres < supabase/tests/0039_cross_org_isolation_contract.sql

-- ============================================================ TEST 1: cross-org close_period_snapshot DITOLAK
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_periodB uuid; v_status text; v_rank int; v_log int; fails text := '';
begin
  -- Org B + periode aktif milik org B.
  insert into public.organizations (name) values ('OrgB-victim-close') returning id into v_orgB;
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status)
    values (v_orgB, 'B-close', current_date, current_date+30, 'active') returning id into v_periodB;

  -- CEO org A mencoba menutup periode org B → HARUS ditolak 'Periode tidak ditemukan.'.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.close_period_snapshot(v_periodB);
    fails := fails||'cross_org_close_allowed; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then fails := fails||'close_wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  -- Efek samping NIHIL: status org B tetap active, tak ada ranking, tak ada activity log 'period_closed'.
  select status into v_status from public.period_snapshots where id = v_periodB;
  if v_status <> 'active' then fails := fails||'orgB_status_mutated('||v_status||'); '; end if;
  select count(*) into v_rank from public.ranking_snapshots where period_snapshot_id = v_periodB;
  if v_rank <> 0 then fails := fails||'ranking_rows_written('||v_rank||'); '; end if;
  select count(*) into v_log from public.activity_logs
    where entity_id = v_periodB and action = 'period_closed';
  if v_log <> 0 then fails := fails||'close_activity_logged('||v_log||'); '; end if;

  if fails <> '' then raise exception 'TEST1 cross_org_close FAIL: %', fails; end if;
  raise notice 'TEST1 cross-org close_period_snapshot ditolak + no side effect PASS';
end $$;
rollback;

-- ============================================================ TEST 2: cross-org calculate_period_scores DITOLAK
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_periodB uuid; v_scores int; fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-calc') returning id into v_orgB;
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status)
    values (v_orgB, 'B-calc', current_date, current_date+30, 'active') returning id into v_periodB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.calculate_period_scores(v_periodB);
    fails := fails||'cross_org_calc_allowed; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then fails := fails||'calc_wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  -- Tak ada baris skor tertulis untuk periode org B.
  select count(*) into v_scores from public.user_score_results where period_snapshot_id = v_periodB;
  if v_scores <> 0 then fails := fails||'orgB_scores_written('||v_scores||'); '; end if;

  if fails <> '' then raise exception 'TEST2 cross_org_calc FAIL: %', fails; end if;
  raise notice 'TEST2 cross-org calculate_period_scores ditolak + no rows PASS';
end $$;
rollback;

-- ============================================================ TEST 3: cross-org override_user_score DITOLAK
-- Fixture org B: user + baris skor current. Tanpa guard org, override akan sukses (score ada);
-- dengan guard, ditolak SEBELUM menyentuh baris skor.
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_periodB uuid; v_userB uuid := gen_random_uuid();
  v_scoreB uuid; v_kind text; fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-override') returning id into v_orgB;
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status)
    values (v_orgB, 'B-override', current_date, current_date+30, 'active') returning id into v_periodB;
  insert into auth.users (id) values (v_userB);
  insert into public.profiles (id, organization_id, role_template_id) values (v_userB, v_orgB, null)
    on conflict (id) do update set organization_id = excluded.organization_id,
      role_template_id = excluded.role_template_id;
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, auto_calculated_score, metric_breakdown,
     result_kind, is_current, calculated_at)
    values (v_orgB, v_periodB, v_userB, 70.00, '{}'::jsonb, 'auto', true, now())
    returning id into v_scoreB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.override_user_score(v_periodB, v_userB, 99.00, 'sabotase lintas-org');
    fails := fails||'cross_org_override_allowed; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then fails := fails||'override_wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  -- Baris skor org B utuh: masih auto, is_current, tak ada baris override baru.
  select result_kind into v_kind from public.user_score_results where id = v_scoreB;
  if v_kind <> 'auto' then fails := fails||'orgB_score_kind_changed('||v_kind||'); '; end if;
  if not exists (select 1 from public.user_score_results where id = v_scoreB and is_current = true) then
    fails := fails||'orgB_score_flipped; ';
  end if;
  if exists (select 1 from public.user_score_results
             where period_snapshot_id = v_periodB and result_kind = 'override') then
    fails := fails||'override_row_created; ';
  end if;

  if fails <> '' then raise exception 'TEST3 cross_org_override FAIL: %', fails; end if;
  raise notice 'TEST3 cross-org override_user_score ditolak + skor org B utuh PASS';
end $$;
rollback;

-- ============================================================ TEST 4: regression — same-org close TETAP jalan
-- Guard org tidak boleh memblok operasi org sendiri.
begin;
do $$
declare
  v_orgA uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_periodA uuid; v_status text; v_rank int; fails text := '';
begin
  -- Periode draft milik org A (draft menghindari partial-unique 'one active per org').
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_orgA, 'A-own', current_date, current_date+30, 'draft', v_ceoA) returning id into v_periodA;
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, auto_calculated_score, metric_breakdown,
     result_kind, is_current, calculated_at)
    values (v_orgA, v_periodA, v_ceoA, 88.00, '{}'::jsonb, 'auto', true, now());

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.close_period_snapshot(v_periodA);
  execute 'reset role';

  select status into v_status from public.period_snapshots where id = v_periodA;
  if v_status <> 'closed' then fails := fails||'same_org_close_failed('||v_status||'); '; end if;
  select count(*) into v_rank from public.ranking_snapshots where period_snapshot_id = v_periodA;
  if v_rank <> 1 then fails := fails||'same_org_ranking_missing('||v_rank||'); '; end if;

  if fails <> '' then raise exception 'TEST4 same_org_close FAIL: %', fails; end if;
  raise notice 'TEST4 same-org close_period_snapshot tetap jalan (regression) PASS';
end $$;
rollback;

-- ============================================================ TEST 5: audit open_period_snapshot org-safe
-- open_period_snapshot tidak menerima UUID; SELALU meng-INSERT dengan current_user_org(). Buktikan
-- periode yang dibuat CEO org A ber-organization_id = org A (tak mungkin menyasar org lain).
begin;
do $$
declare
  v_orgA uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_new uuid; v_org uuid; fails text := '';
begin
  -- Bersihkan periode aktif org A yang mungkin ada agar guard 'one active' tak mengganggu (in-tx, rollback).
  update public.period_snapshots set status = 'draft'
    where organization_id = v_orgA and status = 'active';

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  v_new := public.open_period_snapshot('A-open-audit', current_date, current_date+30);
  execute 'reset role';

  select organization_id into v_org from public.period_snapshots where id = v_new;
  if v_org <> v_orgA then fails := fails||'open_period_wrong_org('||v_org||'); '; end if;

  if fails <> '' then raise exception 'TEST5 open_period_org_safe FAIL: %', fails; end if;
  raise notice 'TEST5 open_period_snapshot selalu org pemanggil (audit: no cross-org surface) PASS';
end $$;
rollback;

-- ============================================================ TEST 6: pemanggil TANPA org (NULL) DITOLAK
-- profiles.organization_id NULLABLE (on delete set null) + has_permission ceo-shortcut tak butuh org →
-- current_user_org() bisa NULL sementara has_permission=true. Guard `<>` akan yield NULL (bypass);
-- guard `is distinct from` menolak. User aktif ber-role ceo tapi organization_id=NULL tak boleh
-- menutup periode org manapun.
begin;
do $$
declare
  v_orgB uuid; v_periodB uuid; v_ceoNull uuid := gen_random_uuid();
  v_ceo_rt uuid; v_status text; fails text := '';
begin
  select id into v_ceo_rt from public.role_templates where level = 'ceo' limit 1;
  if v_ceo_rt is null then raise notice 'TEST6 SKIP (tak ada role_template level ceo)'; return; end if;

  insert into public.organizations (name) values ('OrgB-null-caller') returning id into v_orgB;
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status)
    values (v_orgB, 'B-null', current_date, current_date+30, 'active') returning id into v_periodB;

  -- Attacker aktif, role ceo, tapi organization_id = NULL.
  insert into auth.users (id) values (v_ceoNull);
  insert into public.profiles (id, organization_id, role_template_id, is_active)
    values (v_ceoNull, NULL, v_ceo_rt, true)
    on conflict (id) do update set organization_id = NULL, role_template_id = v_ceo_rt, is_active = true;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoNull,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.close_period_snapshot(v_periodB);
    fails := fails||'null_org_caller_closed; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then fails := fails||'null_org_wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  select status into v_status from public.period_snapshots where id = v_periodB;
  if v_status <> 'active' then fails := fails||'orgB_status_mutated_by_null_caller('||v_status||'); '; end if;

  if fails <> '' then raise exception 'TEST6 null_org_caller FAIL: %', fails; end if;
  raise notice 'TEST6 pemanggil NULL-org ditolak (guard NULL-safe is distinct from) PASS';
end $$;
rollback;
