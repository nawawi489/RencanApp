-- WS-5 — kontrak invarian RPC close_period_snapshot yang diandalkan UI "Tutup Periode".
-- Melengkapi (BUKAN menduplikasi) fase7 TEST7 yang sudah menutup jalur n>0 happy path +
-- closed read-only. Fokus di sini: n=0, re-close, unauthorized (tanpa efek samping),
-- append-only ranking, dan BENTUK audit (entity_type/action/actor/org/ranked_users).
--
-- Pola fase7: tiap blok `begin; do $$..$$; rollback;` — RAISE NOTICE 'PASS' bila lolos,
-- RAISE EXCEPTION 'FAIL: ...' bila guard bocor. Jalankan (butuh role pemilik/postgres):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/close_period_snapshot_contract.sql
-- ID dev lokal: org=52b0ebe1-…b70, ceo=11111111-…001.
--
-- Periode uji dibuat via INSERT langsung status='draft' (BUKAN open_period_snapshot) agar
-- tidak bentrok dgn partial unique "1 active per org" bila org sudah punya periode aktif.
-- RPC close hanya menolak status='closed' → draft ditutup dgn jalur kode yang sama.
--
-- CATATAN cross-org (SENGAJA tak diuji di sini): close_period_snapshot SECURITY DEFINER →
-- RLS di-BYPASS di dalam fungsi; SELECT ... FOR UPDATE menemukan periode lintas-org.
-- Isolasi lintas-org BUKAN dijaga RPC (bertentangan dgn asumsi awal spec §6). Ini isu
-- backend 0013 di luar scope WS-5 (UI-only) — dicatat untuk review backend terpisah.

-- ============================================================ WS5-DB-1: n=0 → sukses, 0 ranking, audit ranked_users=0
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  period uuid; v_count int; v_rank int; fails text := '';
begin
  -- INSERT langsung period_snapshots harus sebagai postgres (RLS INSERT hanya via RPC definer).
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'WS5-n0', current_date, current_date + 30, 'draft', v_ceo) returning id into period;
  -- Baru jadi CEO untuk memanggil close (auth.uid()/has_permission baca jwt).
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Periode tanpa user_score_results is_current → close harus mengembalikan 0.
  v_count := public.close_period_snapshot(period);
  if v_count <> 0 then fails := fails || 'expected_0_got_' || v_count || '; '; end if;
  select count(*) into v_rank from public.ranking_snapshots where period_snapshot_id = period;
  if v_rank <> 0 then fails := fails || 'ranking_rows_' || v_rank || '; '; end if;
  if not exists (select 1 from public.period_snapshots where id = period and status = 'closed') then
    fails := fails || 'not_closed; ';
  end if;
  -- Audit period_closed tetap ditulis dgn ranked_users=0 (n=0 tetap final, bukan gagal).
  if not exists (
    select 1 from public.activity_logs
    where entity_id = period and entity_type = 'period_snapshot'
      and action = 'period_closed' and (detail ->> 'ranked_users') = '0'
  ) then fails := fails || 'no_audit_n0; '; end if;
  execute 'reset role';
  if fails <> '' then raise exception 'WS5-DB-1 FAIL: %', fails; end if;
  raise notice 'WS5-DB-1 n=0 sukses + audit ranked_users=0 PASS';
end $$;
rollback;

-- ============================================================ WS5-DB-2: re-close → raise "sudah ditutup"
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  period uuid; fails text := '';
begin
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'WS5-reclose', current_date, current_date + 30, 'draft', v_ceo) returning id into period;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.close_period_snapshot(period);
  begin
    perform public.close_period_snapshot(period);
    fails := fails || 'reclose_accepted; ';
  exception when others then
    if sqlerrm not ilike '%ditutup%' then fails := fails || 'reclose_wrong_msg:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';
  if fails <> '' then raise exception 'WS5-DB-2 FAIL: %', fails; end if;
  raise notice 'WS5-DB-2 re-close ditolak PASS';
end $$;
rollback;

-- ============================================================ WS5-DB-3: unauthorized (non-CEO) → raise + TANPA efek samping
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_staff uuid := '99999999-0000-0000-0000-0000000000a1';
  v_role_staff uuid;
  period uuid; v_rank int; v_audit int; fails text := '';
begin
  select id into v_role_staff from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  -- organization_id wajib eksplisit sejak 0083 (handle_new_user menolak menebak).
  insert into auth.users (id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id)
    values (v_staff, v_org, v_role_staff)
    on conflict (id) do update set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id;

  -- CEO buat periode.
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'WS5-unauth', current_date, current_date + 30, 'draft', v_ceo) returning id into period;

  -- Staff (tanpa manage_score_formula) mencoba close → ditolak.
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.close_period_snapshot(period);
    fails := fails || 'staff_close_accepted; ';
  exception when others then
    if sqlerrm not ilike '%berwenang%' then fails := fails || 'staff_wrong_msg:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';

  -- TANPA efek samping: periode tetap draft (belum closed), 0 ranking, 0 audit period_closed.
  if exists (select 1 from public.period_snapshots where id = period and status = 'closed') then
    fails := fails || 'period_closed_by_staff; ';
  end if;
  select count(*) into v_rank from public.ranking_snapshots where period_snapshot_id = period;
  if v_rank <> 0 then fails := fails || 'ranking_leaked_' || v_rank || '; '; end if;
  select count(*) into v_audit from public.activity_logs where entity_id = period and action = 'period_closed';
  if v_audit <> 0 then fails := fails || 'audit_leaked_' || v_audit || '; '; end if;

  if fails <> '' then raise exception 'WS5-DB-3 FAIL: %', fails; end if;
  raise notice 'WS5-DB-3 unauthorized ditolak tanpa efek samping PASS';
end $$;
rollback;

-- ============================================================ WS5-DB-4: audit shape (actor/org) + append-only ranking DELETE
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_u uuid := '99999999-0000-0000-0000-0000000000b2';
  v_role_staff uuid; period uuid; v_rid uuid; fails text := '';
begin
  select id into v_role_staff from public.role_templates where organization_id = v_org and level = 'staff' limit 1;
  insert into auth.users (id, raw_app_meta_data)
    values (v_u, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_u, v_org, v_role_staff, 'Uji Ranking')
    on conflict (id) do update set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id;

  -- Insert period + score sebagai postgres (RLS INSERT hanya via RPC definer).
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'WS5-audit', current_date, current_date + 30, 'draft', v_ceo) returning id into period;
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
    select v_org, period, v_u, sfv.id, 80.00, '{}'::jsonb, 'auto', true, now()
    from public.score_formula_versions sfv where sfv.status = 'active' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.close_period_snapshot(period);
  -- Kembali ke postgres: assertion + uji trigger DELETE butuh bypass RLS (sbg authenticated,
  -- RLS menyembunyikan baris → DELETE 0 baris & trigger append-only tak pernah kena).
  execute 'reset role';

  -- Audit shape: entity_type=period_snapshot, actor=ceo, org, ranked_users>=1.
  if not exists (
    select 1 from public.activity_logs
    where entity_id = period and entity_type = 'period_snapshot' and action = 'period_closed'
      and actor_id = v_ceo and organization_id = v_org
      and (detail ->> 'ranked_users')::int >= 1
  ) then fails := fails || 'audit_shape_mismatch; '; end if;

  -- Append-only: ranking_snapshots DELETE ditolak trigger (D9 ranking beku).
  select id into v_rid from public.ranking_snapshots where period_snapshot_id = period limit 1;
  if v_rid is null then
    fails := fails || 'no_ranking_to_delete; ';
  else
    begin
      delete from public.ranking_snapshots where id = v_rid;
      fails := fails || 'ranking_delete_accepted; ';
    exception when others then
      if sqlerrm not ilike '%append-only%' then fails := fails || 'ranking_delete_wrong_msg:' || sqlerrm || '; '; end if;
    end;
  end if;

  if fails <> '' then raise exception 'WS5-DB-4 FAIL: %', fails; end if;
  raise notice 'WS5-DB-4 audit shape + ranking append-only PASS';
end $$;
rollback;
