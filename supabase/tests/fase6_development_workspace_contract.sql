-- EMS V1.8.1 — Fase 6 contract suite (Development Workspace).
--
-- Membuktikan invarian Fase 6 di bawah KONTEKS USER NYATA (auth.uid() via request.jwt.claims +
-- set local role authenticated). Tiap test: fixture (privileged) → simulasi user → assert → ROLLBACK.
-- 'PASS' = lolos; exception = guard bocor.
--
-- Konstanta dev (project fhnqwytqprsptjshoxfn):
--   org=4b07a19f-550d-4952-b0d8-44f38f651d89, ceo=ca8c1471-b870-4f09-a149-25e5eae99d6f
--   role c_level=3d831bd8-b728-4be6-8551-09ac3697cada, staff=06771d3b-8d83-442d-a343-1d6248c43f53
--
-- Cara jalan via MCP execute_sql: kirim tiap blok `begin; do $$..$$; rollback;` terpisah,
-- atau seluruh file via psql -v ON_ERROR_STOP=1.

-- ============================================================ TEST 1: schema + constraint
-- AC-A1/B1/C1/C2 + skema dasar.
begin;
do $$
declare
  fails text := '';
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='development_areas') then
    fails := fails||'dev_area_table_missing; ';
  end if;
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='problem_statements') then
    fails := fails||'ps_table_missing; ';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='initiatives'
                   and column_name='problem_statement_id') then
    fails := fails||'initiatives_ps_col_missing; ';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid='public.initiatives'::regclass
                   and conname='initiatives_single_parent') then
    fails := fails||'single_parent_check_missing; ';
  end if;
  -- FK problem_statements.development_area_id ON DELETE RESTRICT (bukan CASCADE).
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.problem_statements'::regclass
      and c.contype='f' and c.confdeltype='r'
  ) then fails := fails||'ps_fk_not_restrict; '; end if;

  if fails <> '' then raise exception 'TEST1 schema FAIL: %', fails; end if;
  raise notice 'TEST1 schema PASS';
end $$;
rollback;

-- ============================================================ TEST 2: CHECK initiatives_single_parent
-- AC-C2 — strategy_id DAN problem_statement_id keduanya non-null → ditolak. Datar (keduanya null) OK.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  g uuid; k uuid; s uuid; d uuid; p uuid; ini uuid; fails text := '';
begin
  -- Fixture untuk dua induk.
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'G-single', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into g;
  insert into public.kpi_areas (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
    values (v_org, g, 'K-single', 'tgt', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into k;
  insert into public.strategies (organization_id, kpi_area_id, name, status, created_by)
    values (v_org, k, 'S-single', 'draft', v_ceo) returning id into s;
  insert into public.development_areas (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'D-single', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into d;
  insert into public.problem_statements (organization_id, development_area_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, d, 'P-single', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into p;

  -- Initiative datar (kedua null) → OK.
  begin
    insert into public.initiatives (organization_id, name, status, created_by)
      values (v_org, 'I-flat', 'draft', v_ceo) returning id into ini;
  exception when others then fails := fails||'flat_initiative_rejected:'||sqlerrm||'; '; end;

  -- Initiative dgn strategy_id saja → OK.
  begin
    insert into public.initiatives (organization_id, name, strategy_id, status, created_by)
      values (v_org, 'I-perf', s, 'draft', v_ceo);
  exception when others then fails := fails||'strategy_only_rejected:'||sqlerrm||'; '; end;

  -- Initiative dgn problem_statement_id saja → OK.
  begin
    insert into public.initiatives (organization_id, name, problem_statement_id, status, created_by)
      values (v_org, 'I-dev', p, 'draft', v_ceo);
  exception when others then fails := fails||'ps_only_rejected:'||sqlerrm||'; '; end;

  -- Initiative dgn KEDUANYA → DITOLAK.
  begin
    insert into public.initiatives (organization_id, name, strategy_id, problem_statement_id, status, created_by)
      values (v_org, 'I-both', s, p, 'draft', v_ceo);
    fails := fails||'both_parents_allowed; ';
  exception when check_violation then null; when others then fails := fails||'both_parents_wrong_err:'||sqlerrm||'; '; end;

  if fails <> '' then raise exception 'TEST2 single_parent FAIL: %', fails; end if;
  raise notice 'TEST2 initiatives_single_parent PASS';
end $$;
rollback;

-- ============================================================ TEST 3: RLS — 42501 gotcha (INSERT…RETURNING)
-- MC-1 (kritik): policy SELECT WAJIB pakai kolom INLINE. .insert().select().single() harus lolos
-- ketika user adalah creator (kolom 'created_by' terisi di NEW), tanpa 42501 palsu.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  d uuid; p uuid; fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- INSERT…RETURNING Development Area sebagai CEO (creator). Tidak boleh 42501.
  begin
    with ins as (
      insert into public.development_areas
        (organization_id, name, pic_id, period_start, period_end, status, created_by)
      values (v_org, 'DA-retn', v_ceo, current_date, current_date+30, 'draft', v_ceo)
      returning id
    ) select id into d from ins;
  exception
    when insufficient_privilege then fails := fails||'DA_returning_42501; ';
    when others then fails := fails||'DA_returning_err:'||sqlerrm||'; ';
  end;

  -- INSERT…RETURNING Problem Statement (induk DA milik creator).
  begin
    with ins as (
      insert into public.problem_statements
        (organization_id, development_area_id, name, pic_id, period_start, period_end, status, created_by)
      values (v_org, d, 'PS-retn', v_ceo, current_date, current_date+30, 'draft', v_ceo)
      returning id
    ) select id into p from ins;
  exception
    when insufficient_privilege then fails := fails||'PS_returning_42501; ';
    when others then fails := fails||'PS_returning_err:'||sqlerrm||'; ';
  end;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST3 returning_rls FAIL: %', fails; end if;
  raise notice 'TEST3 INSERT...RETURNING DA & PS (MC-1) PASS';
end $$;
rollback;

-- ============================================================ TEST 4: RLS INSERT permission gating
-- AC-I1..I5 + CN-7: Staff/C-Level tanpa grant → ditolak (42501); CEO → lolos.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_clev uuid := '3d831bd8-b728-4be6-8551-09ac3697cada';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  clev uuid := '44444444-4444-4444-4444-444444444401';
  stf  uuid := '44444444-4444-4444-4444-444444444402';
  fails text := '';
begin
  insert into auth.users (id) values (clev);
  insert into public.profiles (id, organization_id, role_template_id) values (clev, v_org, v_role_clev)
    on conflict (id) do update set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id;
  insert into auth.users (id) values (stf);
  insert into public.profiles (id, organization_id, role_template_id) values (stf, v_org, v_role_staff)
    on conflict (id) do update set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id;

  -- Staff: ditolak.
  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.development_areas (organization_id, name, status, created_by)
      values (v_org, 'DA-staff', 'draft', stf);
    fails := fails||'staff_insert_allowed; ';
  exception when insufficient_privilege then null;
    when others then fails := fails||'staff_ins_err:'||sqlerrm||'; '; end;
  execute 'reset role';

  -- C-Level TANPA grant: ditolak (has_permission hardcode TIDAK memasukkan create_development_area).
  perform set_config('request.jwt.claims', json_build_object('sub',clev,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.development_areas (organization_id, name, status, created_by)
      values (v_org, 'DA-clev', 'draft', clev);
    fails := fails||'clev_no_grant_allowed; ';
  exception when insufficient_privilege then null;
    when others then fails := fails||'clev_ins_err:'||sqlerrm||'; '; end;
  execute 'reset role';

  -- CEO: lolos.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.development_areas (organization_id, name, status, created_by)
      values (v_org, 'DA-ceo', 'draft', v_ceo);
  exception when others then fails := fails||'ceo_ins_blocked:'||sqlerrm||'; '; end;
  execute 'reset role';

  -- C-Level DENGAN grant eksplisit user_permissions: lolos.
  insert into public.user_permissions (user_id, permission_id, granted)
    select clev, pm.id, true from public.permissions pm where pm.key='create_development_area'
    on conflict (user_id, permission_id) do update set granted = true;
  perform set_config('request.jwt.claims', json_build_object('sub',clev,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.development_areas (organization_id, name, status, created_by)
      values (v_org, 'DA-clev-grant', 'draft', clev);
  exception when others then fails := fails||'clev_grant_blocked:'||sqlerrm||'; '; end;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST4 permission_gating FAIL: %', fails; end if;
  raise notice 'TEST4 DA INSERT permission gating (CN-7) PASS';
end $$;
rollback;

-- ============================================================ TEST 5: null-safe problem_statement_in_my_org
-- CN-8: INSERT/UPDATE Initiative Performance (problem_statement_id NULL) HARUS tetap lolos
-- setelah problem_statement_in_my_org ditambah ke WITH CHECK. Regresi katastrofik bila bocor.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  g uuid; k uuid; s uuid; fails text := '';
begin
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'G-null', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into g;
  insert into public.kpi_areas (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
    values (v_org, g, 'K-null', 'tgt', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into k;
  insert into public.strategies (organization_id, kpi_area_id, name, status, created_by)
    values (v_org, k, 'S-null', 'draft', v_ceo) returning id into s;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- Initiative Performance (problem_statement_id null) — datar Fase 1 maupun anak Strategy.
  begin
    insert into public.initiatives (organization_id, name, status, created_by)
      values (v_org, 'I-flat-null', 'draft', v_ceo);
  exception when others then fails := fails||'flat_null_ps_rejected:'||sqlerrm||'; '; end;

  begin
    insert into public.initiatives (organization_id, name, strategy_id, status, created_by)
      values (v_org, 'I-perf-null', s, 'draft', v_ceo);
  exception when others then fails := fails||'strategy_null_ps_rejected:'||sqlerrm||'; '; end;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST5 null_safe FAIL: %', fails; end if;
  raise notice 'TEST5 problem_statement_in_my_org(null)=true (CN-8) PASS';
end $$;
rollback;

-- ============================================================ TEST 6: visibility chain — PIC DA lihat PS turunan, PIC PS lihat Initiative dev
-- AC-D3..D6.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  da_pic uuid := '55555555-5555-5555-5555-555555555501';
  ps_pic uuid := '55555555-5555-5555-5555-555555555502';
  outsider uuid := '55555555-5555-5555-5555-555555555503';
  d uuid; p uuid; ini uuid; n int; fails text := '';
begin
  -- Seed users staff (untuk uji RLS bebas dari kekuasaan CEO/view_all_workspace).
  insert into auth.users (id) values (da_pic), (ps_pic), (outsider);
  insert into public.profiles (id, organization_id, role_template_id) values
    (da_pic, v_org, v_role_staff),
    (ps_pic, v_org, v_role_staff),
    (outsider, v_org, v_role_staff)
    on conflict (id) do update set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id;

  -- CEO bikin DA dgn pic=da_pic; PS dgn pic=ps_pic; Initiative Development di bawah PS (pic=ceo).
  insert into public.development_areas
    (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'D-vis', da_pic, current_date, current_date+30, 'active', v_ceo) returning id into d;
  insert into public.problem_statements
    (organization_id, development_area_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, d, 'P-vis', ps_pic, current_date, current_date+30, 'active', v_ceo) returning id into p;
  insert into public.initiatives
    (organization_id, name, problem_statement_id, pic_id, status, created_by)
    values (v_org, 'I-vis', p, v_ceo, 'draft', v_ceo) returning id into ini;

  -- AC-D3: outsider TIDAK lihat DA.
  perform set_config('request.jwt.claims', json_build_object('sub',outsider,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.development_areas where id = d;
  if n <> 0 then fails := fails||'outsider_sees_DA('||n||'); '; end if;
  -- AC-D4: outsider TIDAK lihat PS.
  select count(*) into n from public.problem_statements where id = p;
  if n <> 0 then fails := fails||'outsider_sees_PS('||n||'); '; end if;
  -- Outsider TIDAK lihat Initiative dev (bukan PIC, bukan PIC PS).
  select count(*) into n from public.initiatives where id = ini;
  if n <> 0 then fails := fails||'outsider_sees_initiative('||n||'); '; end if;
  execute 'reset role';

  -- AC-D3: da_pic LIHAT DA (sebagai PIC).
  perform set_config('request.jwt.claims', json_build_object('sub',da_pic,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.development_areas where id = d;
  if n <> 1 then fails := fails||'da_pic_blind_to_DA('||n||'); '; end if;
  -- da_pic LIHAT PS via is_development_area_pic.
  select count(*) into n from public.problem_statements where id = p;
  if n <> 1 then fails := fails||'da_pic_blind_to_PS('||n||'); '; end if;
  execute 'reset role';

  -- AC-D5: ps_pic LIHAT Initiative dev via is_problem_statement_pic(problem_statement_id).
  perform set_config('request.jwt.claims', json_build_object('sub',ps_pic,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.initiatives where id = ini;
  if n <> 1 then fails := fails||'ps_pic_blind_to_initiative('||n||'); '; end if;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST6 visibility FAIL: %', fails; end if;
  raise notice 'TEST6 visibility chain DA→PS→Initiative PASS';
end $$;
rollback;

-- ============================================================ TEST 7: activate_development_area lifecycle
-- AC-E1..E3 + gate MBR mode 1 (blokir_aktivasi).
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  d uuid; logs int; fails text := '';
begin
  insert into public.development_areas (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'D-act', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into d;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- Default rule sistem dev = hanya_peringatan → aktivasi lolos meskipun 0 PS.
  begin
    perform public.activate_development_area(d);
  exception when others then fails := fails||'activate_blocked_default:'||sqlerrm||'; '; end;
  if (select status from public.development_areas where id=d) <> 'active' then
    fails := fails||'status_not_active; ';
  end if;
  select count(*) into logs from public.activity_logs
    where entity_type='development_area' and entity_id=d and action='activate';
  if logs < 1 then fails := fails||'activate_log_missing; '; end if;

  -- Sudah aktif → aktivasi kedua ditolak.
  begin
    perform public.activate_development_area(d);
    fails := fails||'reactivation_allowed; ';
  exception when others then null; end;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST7 activate_DA FAIL: %', fails; end if;
  raise notice 'TEST7 activate_development_area PASS';
end $$;
rollback;

-- ============================================================ TEST 8: MBR gate blokir_aktivasi pada activate_development_area
-- MC-4/CN-5: keputusan terkunci — gate aktif saat org set mode blokir_aktivasi.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  d uuid; fails text := '';
begin
  -- Set rule org dev_area→problem_statement = blokir_aktivasi/1.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_minimum_breakdown_rule('development_area', 'problem_statement', 1, 'blokir_aktivasi');
  execute 'reset role';

  insert into public.development_areas (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'D-gate', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into d;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  -- Tanpa PS → harus ditolak.
  begin
    perform public.activate_development_area(d);
    fails := fails||'blocked_activation_allowed; ';
  exception when others then null; end;
  if (select status from public.development_areas where id=d) <> 'draft' then
    fails := fails||'status_changed_on_block; ';
  end if;

  -- Tambah 1 PS → kemudian aktivasi lolos.
  insert into public.problem_statements (organization_id, development_area_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, d, 'P1', v_ceo, current_date, current_date+30, 'draft', v_ceo);
  begin
    perform public.activate_development_area(d);
  exception when others then fails := fails||'activate_with_child_blocked:'||sqlerrm||'; '; end;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST8 MBR gate1 DA FAIL: %', fails; end if;
  raise notice 'TEST8 activate_DA gate blokir_aktivasi PASS';
end $$;
rollback;

-- ============================================================ TEST 9: activate_problem_statement + jalur PIC DA
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_role_staff uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  da_pic uuid := '66666666-6666-6666-6666-666666666601';
  d uuid; p uuid; fails text := '';
begin
  insert into auth.users (id) values (da_pic);
  insert into public.profiles (id, organization_id, role_template_id)
    values (da_pic, v_org, v_role_staff)
    on conflict (id) do update set organization_id = excluded.organization_id, role_template_id = excluded.role_template_id;

  -- CEO buat DA dgn pic=da_pic; PS dgn pic=ceo (PIC PS ≠ PIC DA).
  insert into public.development_areas (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'D-actps', da_pic, current_date, current_date+30, 'active', v_ceo) returning id into d;
  -- Pasca-migrasi 0031: impact wajib pada activate_problem_statement (PRD §15 metadata Dampak).
  insert into public.problem_statements (organization_id, development_area_id, name, pic_id, period_start, period_end, impact, status, created_by)
    values (v_org, d, 'P-actps', v_ceo, current_date, current_date+30, 'medium', 'draft', v_ceo) returning id into p;

  -- da_pic (BUKAN PIC PS) bisa aktifkan via jalur is_development_area_pic.
  perform set_config('request.jwt.claims', json_build_object('sub',da_pic,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.activate_problem_statement(p);
  exception when others then fails := fails||'da_pic_blocked_activate_PS:'||sqlerrm||'; '; end;
  if (select status from public.problem_statements where id=p) <> 'active' then
    fails := fails||'PS_not_active; ';
  end if;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST9 activate_PS FAIL: %', fails; end if;
  raise notice 'TEST9 activate_problem_statement (jalur PIC DA) PASS';
end $$;
rollback;

-- ============================================================ TEST 10: MBR flip — check_compliance dev_area & problem_statement
-- AC-G1, AC-G2. Early-return DIHAPUS; cabang dev_area/PS bekerja.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  d uuid; p uuid; r record; fails text := '';
begin
  insert into public.development_areas (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'D-mbr', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into d;
  insert into public.problem_statements (organization_id, development_area_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, d, 'P-mbr', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into p;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- dev_area → problem_statement: 1 child active (non-archived).
  select * into r from public.check_minimum_breakdown_compliance('development_area', d) limit 1;
  if r.child_card_type <> 'problem_statement' then fails := fails||'dev_child_wrong; '; end if;
  if r.current_count <> 1 then fails := fails||'dev_count_wrong('||r.current_count||'); '; end if;
  if r.required_count <> 1 then fails := fails||'dev_required_wrong('||r.required_count||'); '; end if;
  if r.meets_requirement is not true then fails := fails||'dev_not_compliant; '; end if;

  -- problem_statement → initiative: 0 child → tidak compliant.
  select * into r from public.check_minimum_breakdown_compliance('problem_statement', p) limit 1;
  if r.child_card_type <> 'initiative' then fails := fails||'ps_child_wrong; '; end if;
  if r.current_count <> 0 then fails := fails||'ps_count_wrong; '; end if;
  if r.meets_requirement is not false then fails := fails||'ps_compliant_when_empty; '; end if;

  -- Tambah Initiative Development → compliant.
  insert into public.initiatives (organization_id, name, problem_statement_id, status, created_by)
    values (v_org, 'I-mbr', p, 'draft', v_ceo);
  select * into r from public.check_minimum_breakdown_compliance('problem_statement', p) limit 1;
  if r.current_count <> 1 or r.meets_requirement is not true then
    fails := fails||'ps_not_compliant_after_add('||r.current_count||'); ';
  end if;

  execute 'reset role';
  if fails <> '' then raise exception 'TEST10 mbr_flip FAIL: %', fails; end if;
  raise notice 'TEST10 check_compliance dev_area + problem_statement PASS';
end $$;
rollback;

-- ============================================================ TEST 11: trigger MBR mode 2 — blokir_akses_turunan
-- AC-G4..G8. Trigger pada problem_statements + Initiative route by populated FK.
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  d uuid; p uuid; fails text := '';
begin
  -- Set rule org dev_area→problem_statement = blokir_akses_turunan/2.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_minimum_breakdown_rule('development_area', 'problem_statement', 2, 'blokir_akses_turunan');
  execute 'reset role';

  insert into public.development_areas (organization_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, 'D-trig', v_ceo, current_date, current_date+30, 'active', v_ceo) returning id into d;

  -- INSERT PS pertama (sibling=0 < 2) → ditolak.
  begin
    insert into public.problem_statements (organization_id, development_area_id, name, status, created_by)
    values (v_org, d, 'P-trig', 'draft', v_ceo);
    fails := fails||'ps_insert_should_block; ';
  exception when others then null; end;

  -- Set rule problem_statement→initiative = blokir_akses_turunan/2 untuk uji Initiative dev route.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_minimum_breakdown_rule('problem_statement', 'initiative', 2, 'blokir_akses_turunan');
  execute 'reset role';

  -- Bypass trigger PS dgn ubah rule sementara? Tidak — gunakan tx terpisah. Buat PS via privileged
  -- dgn rule yg sudah diset blokir_akses_turunan/2 untuk DA→PS: kita perlu bypass juga? Untuk uji
  -- Initiative dev branch, kita SET rule PS→Initiative SAJA (DA→PS biarkan default).
  begin
    insert into public.minimum_breakdown_rules
      (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode, updated_by)
    values (v_org, 'development_area', 'problem_statement', 1, 'hanya_peringatan', v_ceo)
    on conflict (organization_id, parent_card_type, child_card_type) do update set
      min_count = 1, enforcement_mode = 'hanya_peringatan';
  end;
  insert into public.problem_statements (organization_id, development_area_id, name, status, created_by)
    values (v_org, d, 'P-trig2', 'draft', v_ceo) returning id into p;

  -- Initiative dev pertama (sibling=0 < 2) → ditolak via cabang problem_statement_id.
  begin
    insert into public.initiatives (organization_id, name, problem_statement_id, status, created_by)
      values (v_org, 'I-trig', p, 'draft', v_ceo);
    fails := fails||'ini_dev_insert_should_block; ';
  exception when others then null; end;

  -- Initiative datar (kedua FK null) tetap lolos (backward-compat AC-G7).
  begin
    insert into public.initiatives (organization_id, name, status, created_by)
      values (v_org, 'I-flat-trig', 'draft', v_ceo);
  exception when others then fails := fails||'flat_initiative_blocked_wrong:'||sqlerrm||'; '; end;

  if fails <> '' then raise exception 'TEST11 trigger mode2 FAIL: %', fails; end if;
  raise notice 'TEST11 trigger blokir_akses_turunan (PS + Initiative dev route) PASS';
end $$;
rollback;

-- ============================================================ TEST 12: guidance + can_access extend
begin;
do $$
declare fails text := ''; n int;
begin
  -- AC-J1: seed guidance Fase 6.
  select count(*) into n from public.card_guidance_contents
    where organization_id is null and card_type in ('development_area', 'problem_statement');
  if n < 2 then fails := fails||'guidance_seed_missing('||n||'); '; end if;

  if fails <> '' then raise exception 'TEST12 guidance FAIL: %', fails; end if;
  raise notice 'TEST12 seed card_guidance_contents PASS';
end $$;
rollback;
