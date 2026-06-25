-- EMS V1.8.1 — Fase 4 contract suite (Performance Workspace / Hierarki Strategis)
--
-- Membuktikan invarian Fase 4 di bawah KONTEKS USER NYATA (auth.uid() via request.jwt.claims +
-- set local role authenticated/anon). Tiap test: bangun fixture (privileged) → simulasi user → assert → ROLLBACK.
--
-- Cara jalan:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fase4_performance_workspace_contract.sql
-- atau via Supabase MCP execute_sql: kirim tiap blok `begin; do $$..$$; rollback;` terpisah.
-- 'PASS' = lolos; 'FAIL: ...' = guard bocor. Memetakan langkah Layer A rencana TDD (A-SCHEMA … A-INIT-COMPAT).
--
-- Konstanta dev (project fhnqwytqprsptjshoxfn, verified 2026-06-24):
--   org=4b07a19f-550d-4952-b0d8-44f38f651d89, ceo=ca8c1471-b870-4f09-a149-25e5eae99d6f
--   role c_level=3d831bd8-b728-4be6-8551-09ac3697cada, staff=06771d3b-8d83-442d-a343-1d6248c43f53
--   perm manage_others_cards=f6bbcc19-18f4-4093-8b13-a5368c8cf1fd, create_goal=52d1e9c4-c6c1-4bd2-9495-f2a4e278f82d,
--        create_kpi_area=7ab8c266-c3e1-4503-8c0a-418e71ccc50a, view_all_workspace=a76f022e-8bce-4a63-a96d-5060f0c681c3

-- ============================================================ TEST 1: schema + period CHECK + seed (A-SCHEMA, missing[8][9])
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  g uuid; n int; fails text := '';
begin
  -- single-day legal
  begin
    insert into public.goals (organization_id, name, period_start, period_end, created_by)
    values (v_org, 'G single', current_date, current_date, v_ceo) returning id into g;
  exception when others then fails := fails||'single_day:'||sqlerrm||'; '; end;
  -- end < start ditolak (23514)
  begin
    insert into public.goals (organization_id, name, period_start, period_end, created_by)
    values (v_org, 'G bad', current_date, current_date - 1, v_ceo);
    fails := fails||'period_bad_allowed; ';
  exception when check_violation then null; when others then fails := fails||'period_bad:'||sqlerrm||'; '; end;
  -- seed counts (missing[8])
  select count(*) into n from public.kpi_area_templates kt join public.goal_templates t on t.id=kt.goal_template_id where t.key='omset';
  if n <> 10 then fails := fails||'omset_items('||n||'); '; end if;
  select count(*) into n from public.kpi_area_templates kt join public.goal_templates t on t.id=kt.goal_template_id where t.key='profit';
  if n <> 9 then fails := fails||'profit_items('||n||'); '; end if;
  select count(*) into n from public.kpi_area_templates kt join public.goal_templates t on t.id=kt.goal_template_id
    where t.key='profit' and kt.division='cfo';
  if n <> 1 then fails := fails||'profit_cfo_count('||n||'); '; end if;
  if not exists (select 1 from public.kpi_area_templates kt join public.goal_templates t on t.id=kt.goal_template_id
                 where t.key='profit' and kt.division='cfo' and kt.name='Control Budgeting') then
    fails := fails||'cfo_name_mismatch; ';
  end if;

  if fails <> '' then raise exception 'TEST1 schema/seed FAIL: %', fails; end if;
  raise notice 'TEST1 schema/seed PASS';
end $$;
rollback;

-- ============================================================ TEST 2: RLS insert + jalur parent-PIC (A-INS, missing[5][6])
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  c_rt uuid := '3d831bd8-b728-4be6-8551-09ac3697cada';
  clv uuid := '22222222-2222-2222-2222-222222222201';  -- c_level (default: create_strategy ya, create_goal/kpi tidak)
  stf uuid := '22222222-2222-2222-2222-222222222202';  -- staff biasa
  goal uuid; kpi uuid; gid uuid; kid uuid; sid uuid; fails text := '';
begin
  insert into auth.users (id) values (clv),(stf);
  update public.profiles set role_template_id = c_rt where id = clv;  -- jadikan c_level
  -- fixture induk: Goal dgn PIC = clv; KPI Area dgn PIC = stf (untuk uji parent-PIC strategy)
  insert into public.goals (organization_id, name, pic_id, created_by, status)
    values (v_org, 'G induk', clv, v_ceo, 'active') returning id into goal;
  insert into public.kpi_areas (organization_id, goal_id, name, pic_id, created_by, status)
    values (v_org, goal, 'K induk', stf, v_ceo, 'active') returning id into kpi;

  -- goals_insert
  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.goals (organization_id,name,created_by) values (v_org,'x',stf); fails:=fails||'staff_goal_allowed; ';
  exception when insufficient_privilege then null; when others then fails:=fails||'staff_goal:'||sqlerrm||'; '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',clv,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.goals (organization_id,name,created_by) values (v_org,'x',clv); fails:=fails||'clevel_goal_allowed; ';
  exception when insufficient_privilege then null; when others then fails:=fails||'clevel_goal:'||sqlerrm||'; '; end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.goals (organization_id,name,created_by) values (v_org,'ceo goal',v_ceo) returning id into gid;
  exception when others then fails:=fails||'ceo_goal_denied:'||sqlerrm||'; '; end;
  execute 'reset role';

  -- kpi_areas_insert parent-PIC (missing[5]): clv adalah PIC Goal induk → boleh, walau tanpa create_kpi_area
  perform set_config('request.jwt.claims', json_build_object('sub',clv,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.kpi_areas (organization_id,goal_id,name,created_by) values (v_org,goal,'K by parent-PIC',clv) returning id into kid;
  exception when others then fails:=fails||'kpi_parentpic_denied:'||sqlerrm||'; '; end;
  -- negatif: stf bukan PIC Goal & tanpa grant → ditolak
  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  begin insert into public.kpi_areas (organization_id,goal_id,name,created_by) values (v_org,goal,'K nope',stf); fails:=fails||'kpi_nonpic_allowed; ';
  exception when insufficient_privilege then null; when others then fails:=fails||'kpi_nonpic:'||sqlerrm||'; '; end;
  execute 'reset role';

  -- strategies_insert parent-PIC (missing[6]): stf adalah PIC KPI Area induk → boleh
  perform set_config('request.jwt.claims', json_build_object('sub',stf,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.strategies (organization_id,kpi_area_id,name,created_by) values (v_org,kpi,'S by parent-PIC',stf) returning id into sid;
  exception when others then fails:=fails||'strat_parentpic_denied:'||sqlerrm||'; '; end;
  -- c_level punya default create_strategy → boleh walau bukan PIC
  perform set_config('request.jwt.claims', json_build_object('sub',clv,'role','authenticated')::text, true);
  begin insert into public.strategies (organization_id,kpi_area_id,name,created_by) values (v_org,kpi,'S by clevel',clv);
  exception when others then fails:=fails||'strat_clevel_denied:'||sqlerrm||'; '; end;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST2 RLS insert FAIL: %', fails; end if;
  raise notice 'TEST2 RLS insert PASS';
end $$;
rollback;

-- ============================================================ TEST 3: activate gates + authz + status (A-ACT, missing[1][2][10])
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  pic uuid := '22222222-2222-2222-2222-222222222301';
  other uuid := '22222222-2222-2222-2222-222222222302';
  goal uuid; kpi uuid; strat uuid; fails text := '';
begin
  insert into auth.users (id) values (pic),(other);
  insert into public.goals (organization_id,name,pic_id,period_start,period_end,created_by,status)
    values (v_org,'G act',pic,current_date,current_date+30,v_ceo,'draft') returning id into goal;

  -- activate_goal tanpa KPI Area → tolak (K2)
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.activate_goal(goal); fails:=fails||'goal_nokpi_allowed; ';
  exception when others then if sqlerrm not like '%minimal 1 KPI Area%' then fails:=fails||'goal_nokpi:'||sqlerrm||'; '; end if; end;

  -- otorisasi negatif (missing[1]): user lain bukan owner/pic
  perform set_config('request.jwt.claims', json_build_object('sub',other,'role','authenticated')::text, true);
  begin perform public.activate_goal(goal); fails:=fails||'goal_nonowner_allowed; ';
  exception when others then if sqlerrm not like '%tidak berwenang%' then fails:=fails||'goal_nonowner:'||sqlerrm||'; '; end if; end;

  -- tambah KPI Area (privileged) lalu activate_goal positif
  insert into public.kpi_areas (organization_id,goal_id,name,pic_id,target,period_start,period_end,created_by,status)
    values (v_org,goal,'K1',pic,'Target X',current_date,current_date+30,v_ceo,'draft') returning id into kpi;
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.activate_goal(goal); exception when others then fails:=fails||'goal_activate_pos:'||sqlerrm||'; '; end;
  -- double-activate (missing[2]) → tolak
  begin perform public.activate_goal(goal); fails:=fails||'goal_double_allowed; ';
  exception when others then if sqlerrm not like '%sudah diaktifkan%' then fails:=fails||'goal_double:'||sqlerrm||'; '; end if; end;

  -- activate_kpi_area Target kosong (missing[10])
  insert into public.kpi_areas (organization_id,goal_id,name,pic_id,period_start,period_end,created_by,status)
    values (v_org,goal,'K no target',pic,current_date,current_date+30,v_ceo,'draft') returning id into kpi;
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.activate_kpi_area(kpi); fails:=fails||'kpi_notarget_allowed; ';
  exception when others then if sqlerrm not like '%Target wajib%' then fails:=fails||'kpi_notarget:'||sqlerrm||'; '; end if; end;

  -- activate_strategy depth kosong
  insert into public.strategies (organization_id,kpi_area_id,name,pic_id,period_start,period_end,created_by,status)
    values (v_org,kpi,'S shallow',pic,current_date,current_date+30,v_ceo,'draft') returning id into strat;
  begin perform public.activate_strategy(strat); fails:=fails||'strat_shallow_allowed; ';
  exception when others then if sqlerrm not like '%Alasan, Risiko Utama, dan Alternatif%' then fails:=fails||'strat_shallow:'||sqlerrm||'; '; end if; end;
  -- isi depth (privileged) → activate positif
  update public.strategies set reason='r', main_risk='m', alternative='a' where id=strat;
  begin perform public.activate_strategy(strat); exception when others then fails:=fails||'strat_activate_pos:'||sqlerrm||'; '; end;

  if fails <> '' then raise exception 'TEST3 activate FAIL: %', fails; end if;
  raise notice 'TEST3 activate PASS';
end $$;
rollback;

-- ============================================================ TEST 4: template apply atomik + restore idempoten + audit (A-TPL/A-AUDIT, missing[7][11])
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  t_omset uuid; goal uuid; n int; added int; fails text := '';
begin
  select id into t_omset from public.goal_templates where key='omset';
  -- apply sebagai CEO (punya create_goal)
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  goal := public.apply_goal_template(t_omset, v_ceo, current_date, current_date+90);
  select count(*) into n from public.kpi_areas where goal_id=goal;
  if n <> 10 then fails:=fails||'apply_kpi_count('||n||'); '; end if;
  -- audit actor_id = caller (missing[11])
  if not exists (select 1 from public.activity_logs where entity_type='goal' and entity_id=goal and action='apply_template' and actor_id=v_ceo) then
    fails:=fails||'apply_audit_missing; ';
  end if;
  if not exists (select 1 from public.activity_logs where entity_type='goal' and entity_id=goal and action='create' and actor_id=v_ceo) then
    fails:=fails||'create_audit_missing; ';
  end if;
  -- restore idempoten (missing[7]): semua sudah ada → 0 ditambah, tetap 10
  added := public.restore_goal_template_items(goal);
  if added <> 0 then fails:=fails||'restore_added('||added||'); '; end if;
  select count(*) into n from public.kpi_areas where goal_id=goal;
  if n <> 10 then fails:=fails||'restore_dup('||n||'); '; end if;
  -- hapus 1 KPI lalu restore → +1
  delete from public.kpi_areas where goal_id=goal and name='A/R Collection';
  added := public.restore_goal_template_items(goal);
  if added <> 1 then fails:=fails||'restore_one('||added||'); '; end if;

  if fails <> '' then raise exception 'TEST4 template FAIL: %', fails; end if;
  raise notice 'TEST4 template PASS';
end $$;
rollback;

-- ============================================================ TEST 5: cross-org + Lihat!=Edit + anon revoke + initiative compat (A-SELECT/A-UPDATE/A-GRANT/A-INIT-COMPAT, missing[3][4][13][14])
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  view_perm uuid := 'a76f022e-8bce-4a63-a96d-5060f0c681c3';
  org_b uuid; viewer uuid := '22222222-2222-2222-2222-222222222501';
  goal uuid; strat_b uuid; kpi_b uuid; goal_b uuid; n int; rc int; ini uuid; fails text := '';
begin
  insert into auth.users (id) values (viewer);
  insert into public.user_permissions (user_id, permission_id, granted) values (viewer, view_perm, true); -- view_all_workspace
  insert into public.goals (organization_id,name,pic_id,created_by,status)
    values (v_org,'G org A',v_ceo,v_ceo,'active') returning id into goal;

  -- org B + fixture (privileged)
  insert into public.organizations (name) values ('Org B Test') returning id into org_b;
  insert into public.goals (organization_id,name,created_by,status) values (org_b,'G org B',v_ceo,'active') returning id into goal_b;
  insert into public.kpi_areas (organization_id,goal_id,name,created_by,status) values (org_b,goal_b,'K org B',v_ceo,'active') returning id into kpi_b;
  insert into public.strategies (organization_id,kpi_area_id,name,created_by,status) values (org_b,kpi_b,'S org B',v_ceo,'active') returning id into strat_b;

  -- cross-org SELECT (missing[4]): viewer org A tidak melihat goal org B
  perform set_config('request.jwt.claims', json_build_object('sub',viewer,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.goals where id=goal_b;
  if n <> 0 then fails:=fails||'crossorg_goal_leak('||n||'); '; end if;
  select count(*) into n from public.strategies where id=strat_b;
  if n <> 0 then fails:=fails||'crossorg_strat_leak('||n||'); '; end if;
  -- Lihat != Edit (missing[3]): viewer bisa SELECT goal org A tapi UPDATE 0 baris
  select count(*) into n from public.goals where id=goal;
  if n <> 1 then fails:=fails||'viewer_cannot_see('||n||'); '; end if;
  update public.goals set name='hacked' where id=goal;
  get diagnostics rc = row_count;
  if rc <> 0 then fails:=fails||'viewer_edited('||rc||'); '; end if;
  execute 'reset role';

  -- anon revoke (missing[13])
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','anon')::text, true);
  execute 'set local role anon';
  begin perform public.activate_goal(goal); fails:=fails||'anon_rpc_allowed; ';
  exception when insufficient_privilege then null; when others then fails:=fails||'anon_rpc:'||sqlerrm||'; '; end;
  execute 'reset role';

  -- initiative backward-compat (missing[14]): ceo insert initiative strategy_id NULL eksplisit → OK; cross-org strategy → ditolak
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.initiatives (organization_id,name,strategy_id,created_by) values (v_org,'I null strat',null,v_ceo) returning id into ini;
  exception when others then fails:=fails||'ini_nullstrat_denied:'||sqlerrm||'; '; end;
  begin insert into public.initiatives (organization_id,name,strategy_id,created_by) values (v_org,'I crossorg strat',strat_b,v_ceo); fails:=fails||'ini_crossorg_allowed; ';
  exception when insufficient_privilege then null; when others then fails:=fails||'ini_crossorg:'||sqlerrm||'; '; end;
  execute 'reset role';

  if fails <> '' then raise exception 'TEST5 isolation FAIL: %', fails; end if;
  raise notice 'TEST5 isolation PASS';
end $$;
rollback;

-- ============================================================ TEST 6: apply_goal_template tolak PIC lintas-org (code-review #2/#6)
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  t_omset uuid; goal uuid; n int; org_b uuid; pic_b uuid := '33333333-3333-3333-3333-333333333301'; fails text := '';
begin
  select id into t_omset from public.goal_templates where key='omset';
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceo,'role','authenticated')::text, true);
  -- positif: PIC se-org (ceo) → 10 KPI Area dari template Omset
  goal := public.apply_goal_template(t_omset, v_ceo, current_date, current_date+90);
  select count(*) into n from public.kpi_areas where goal_id=goal;
  if n <> 10 then fails:=fails||'apply_count('||n||'); '; end if;
  -- negatif: PIC dari org lain → ditolak (SECURITY DEFINER tak boleh bypass batas org)
  insert into public.organizations (name) values ('Org B chk') returning id into org_b;
  insert into auth.users (id) values (pic_b);
  update public.profiles set organization_id = org_b where id = pic_b;
  begin
    perform public.apply_goal_template(t_omset, pic_b, current_date, current_date+90);
    fails:=fails||'crossorg_pic_allowed; ';
  exception when others then
    if sqlerrm not like '%organisasi yang sama%' then fails:=fails||'crossorg_pic:'||sqlerrm||'; '; end if;
  end;
  if fails <> '' then raise exception 'TEST6 apply_goal_template org FAIL: %', fails; end if;
  raise notice 'TEST6 apply_goal_template org PASS';
end $$;
rollback;
