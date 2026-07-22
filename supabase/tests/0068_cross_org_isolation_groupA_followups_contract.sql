-- Migration 0068 contract test — Group A follow-up cross-org isolation guards.
--
-- Covers the 4 SECURITY DEFINER RPCs missed by migration 0067:
--   review_task_submission, review_task_instance_submission,
--   assign_score_formula, create_team.
--
-- Pola: `raise notice 'PASS'` bila lolos, `raise exception 'FAIL: ...'` bila gagal.
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0064_cross_org_isolation_groupA_followups_contract.sql

-- ============================================================ 0064-DB-1: structural guard — function body contains current_user_org()
do $$
declare
  v_funcs text[] := array[
    'review_task_submission',
    'review_task_instance_submission',
    'assign_score_formula',
    'create_team'
  ];
  v_fn text;
  v_body text;
  fails text := '';
begin
  foreach v_fn in array v_funcs loop
    select pg_get_functiondef(p.oid) into v_body
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn
     limit 1;

    if v_body is null then
      fails := fails || v_fn || '_not_found; ';
      continue;
    end if;

    if v_body not ilike '%current_user_org()%' then
      fails := fails || v_fn || '_missing_current_user_org; ';
    end if;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0064-DB-1: %', fails;
  end if;
  raise notice 'PASS 0064-DB-1: all 4 functions reference current_user_org()';
end $$;

-- ============================================================ 0064-DB-2: all 4 functions are SECURITY DEFINER
do $$
declare
  v_funcs text[] := array[
    'review_task_submission',
    'review_task_instance_submission',
    'assign_score_formula',
    'create_team'
  ];
  v_fn text;
  v_secdef boolean;
  fails text := '';
begin
  foreach v_fn in array v_funcs loop
    select p.prosecdef into v_secdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn
     limit 1;

    if v_secdef is null then
      fails := fails || v_fn || '_not_found; ';
    elsif not v_secdef then
      fails := fails || v_fn || '_not_security_definer; ';
    end if;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0064-DB-2: %', fails;
  end if;
  raise notice 'PASS 0064-DB-2: all 4 functions are SECURITY DEFINER';
end $$;

-- ============================================================ 0064-DB-3: runtime cross-org rejection (review_task_submission)
-- CEO of Org A tries to review a task submission belonging to Org B. Must be
-- rejected by the org guard BEFORE the reviewer-override branch runs (i.e.
-- no governance_violations row should be logged for this attempt).
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_picB uuid; v_revB uuid; v_apB uuid; v_taskB uuid; v_subB uuid;
  v_review_status text; v_task_status text; n_violations int;
  fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-review-task') returning id into v_orgB;
  v_picB := gen_random_uuid(); v_revB := gen_random_uuid();
  -- organization_id wajib eksplisit sejak 0083 (handle_new_user menolak menebak).
  insert into auth.users (id, raw_app_meta_data) values
    (v_picB, jsonb_build_object('organization_id', v_orgB)),
    (v_revB, jsonb_build_object('organization_id', v_orgB));
  insert into public.profiles (id, organization_id) values (v_picB, v_orgB), (v_revB, v_orgB)
    on conflict (id) do update set organization_id = excluded.organization_id;

  insert into public.action_plans (organization_id, name) values (v_orgB, 'B-ap') returning id into v_apB;
  insert into public.tasks (organization_id, action_plan_id, name, pic_id, reviewer_id, status)
    values (v_orgB, v_apB, 'B-task', v_picB, v_revB, 'submitted')
    returning id into v_taskB;
  insert into public.task_submissions (task_id, version_number, submitted_by, review_status, status)
    values (v_taskB, 1, v_picB, 'pending', 'submitted')
    returning id into v_subB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.review_task_submission(v_subB, 'approve', null);
    fails := fails||'cross_org_review_task_submission_allowed; ';
  exception when others then
    if sqlerrm not ilike '%lintas-organisasi%' then fails := fails||'wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  select review_status into v_review_status from public.task_submissions where id = v_subB;
  select status into v_task_status from public.tasks where id = v_taskB;
  select count(*) into n_violations from public.governance_violations where entity_id = v_taskB;

  if v_review_status <> 'pending' then fails := fails||'submission_mutated('||v_review_status||'); '; end if;
  if v_task_status <> 'submitted' then fails := fails||'task_mutated('||v_task_status||'); '; end if;
  if n_violations <> 0 then fails := fails||'governance_violation_logged_before_org_guard; '; end if;

  if fails <> '' then raise exception 'FAIL 0064-DB-3: %', fails; end if;
  raise notice 'PASS 0064-DB-3: cross-org review_task_submission rejected before reviewer-override branch, no side effect';
end $$;
rollback;

-- ============================================================ 0064-DB-4: runtime cross-org rejection (review_task_instance_submission)
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_picB uuid; v_revB uuid; v_apB uuid; v_taskB uuid; v_ruleB uuid; v_instB uuid; v_subB uuid;
  v_review_status text; v_inst_status text; n_violations int;
  fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-review-instance') returning id into v_orgB;
  v_picB := gen_random_uuid(); v_revB := gen_random_uuid();
  insert into auth.users (id, raw_app_meta_data) values
    (v_picB, jsonb_build_object('organization_id', v_orgB)),
    (v_revB, jsonb_build_object('organization_id', v_orgB));
  insert into public.profiles (id, organization_id) values (v_picB, v_orgB), (v_revB, v_orgB)
    on conflict (id) do update set organization_id = excluded.organization_id;

  insert into public.action_plans (organization_id, name) values (v_orgB, 'B-ap-inst') returning id into v_apB;
  insert into public.tasks (organization_id, action_plan_id, name, pic_id, reviewer_id, repeat_setting)
    values (v_orgB, v_apB, 'B-task-repeat', v_picB, v_revB, 'repeat')
    returning id into v_taskB;
  insert into public.task_repeat_rules (organization_id, task_id, frequency, repeat_start_date, repeat_end_date, time_of_day)
    values (v_orgB, v_taskB, 'daily', current_date, current_date + 30, '09:00')
    returning id into v_ruleB;
  insert into public.task_instances (organization_id, task_id, repeat_rule_id, instance_date, instance_time, deadline_at, pic_id, reviewer_id, status)
    values (v_orgB, v_taskB, v_ruleB, current_date, '09:00', now() + interval '2 hours', v_picB, v_revB, 'submitted')
    returning id into v_instB;
  insert into public.task_submissions (task_id, task_instance_id, version_number, submitted_by, review_status, status)
    values (v_taskB, v_instB, 1, v_picB, 'pending', 'submitted')
    returning id into v_subB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.review_task_instance_submission(v_subB, 'approve', null);
    fails := fails||'cross_org_review_task_instance_submission_allowed; ';
  exception when others then
    if sqlerrm not ilike '%lintas-organisasi%' then fails := fails||'wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  select review_status into v_review_status from public.task_submissions where id = v_subB;
  select status into v_inst_status from public.task_instances where id = v_instB;
  select count(*) into n_violations from public.governance_violations where entity_id = v_instB;

  if v_review_status <> 'pending' then fails := fails||'submission_mutated('||v_review_status||'); '; end if;
  if v_inst_status <> 'submitted' then fails := fails||'instance_mutated('||v_inst_status||'); '; end if;
  if n_violations <> 0 then fails := fails||'governance_violation_logged_before_org_guard; '; end if;

  if fails <> '' then raise exception 'FAIL 0064-DB-4: %', fails; end if;
  raise notice 'PASS 0064-DB-4: cross-org review_task_instance_submission rejected before reviewer-override branch, no side effect';
end $$;
rollback;

-- ============================================================ 0064-DB-5: runtime cross-org rejection (assign_score_formula)
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_verB uuid; n_assign int; fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-score-formula') returning id into v_orgB;
  insert into public.score_formula_versions (organization_id, version_number, level, categories, status)
    values (v_orgB, 1, 'staff', '[]'::jsonb, 'draft')
    returning id into v_verB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.assign_score_formula(v_verB, 'org_role', 'staff', null, current_date);
    fails := fails||'cross_org_assign_score_formula_allowed; ';
  exception when others then
    if sqlerrm not ilike '%lintas-organisasi%' then fails := fails||'wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  select count(*) into n_assign from public.score_formula_assignments where formula_version_id = v_verB;
  if n_assign <> 0 then fails := fails||'assignment_created_cross_org; '; end if;

  if fails <> '' then raise exception 'FAIL 0064-DB-5: %', fails; end if;
  raise notice 'PASS 0064-DB-5: cross-org assign_score_formula rejected, no assignment row created';
end $$;
rollback;

-- ============================================================ 0064-DB-6: cross-org lead rejection (create_team)
-- CEO of Org A creates a Tim in Org A but points p_lead_id at a profile in Org B.
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgB uuid; v_leadB uuid; n_team int; fails text := '';
begin
  insert into public.organizations (name) values ('OrgB-victim-team-lead') returning id into v_orgB;
  v_leadB := gen_random_uuid();
  insert into auth.users (id, raw_app_meta_data)
    values (v_leadB, jsonb_build_object('organization_id', v_orgB));
  insert into public.profiles (id, organization_id) values (v_leadB, v_orgB)
    on conflict (id) do update set organization_id = excluded.organization_id;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.create_team('CrossOrgLeadTeam', null, null, v_leadB);
    fails := fails||'cross_org_lead_allowed; ';
  exception when others then
    if sqlerrm not ilike '%organisasi yang sama%' then fails := fails||'wrong_msg:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  select count(*) into n_team from public.teams where name = 'CrossOrgLeadTeam';
  if n_team <> 0 then fails := fails||'team_created_with_cross_org_lead; '; end if;

  if fails <> '' then raise exception 'FAIL 0064-DB-6: %', fails; end if;
  raise notice 'PASS 0064-DB-6: create_team rejects lead from another organization, no team created';
end $$;
rollback;

-- ============================================================ 0064-DB-7: regression — same-org reviewer-override still works + logs
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgA uuid; v_picA uuid; v_revA uuid; v_apA uuid; v_taskA uuid; v_subA uuid;
  v_task_status text; n_violations int; fails text := '';
begin
  select organization_id into v_orgA from public.profiles where id = v_ceoA;
  v_picA := gen_random_uuid(); v_revA := gen_random_uuid();
  insert into auth.users (id, raw_app_meta_data) values
    (v_picA, jsonb_build_object('organization_id', v_orgA)),
    (v_revA, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id) values (v_picA, v_orgA), (v_revA, v_orgA)
    on conflict (id) do update set organization_id = excluded.organization_id;

  insert into public.action_plans (organization_id, name) values (v_orgA, 'A-ap-override') returning id into v_apA;
  insert into public.tasks (organization_id, action_plan_id, name, pic_id, reviewer_id, status)
    values (v_orgA, v_apA, 'A-task-override', v_picA, v_revA, 'submitted')
    returning id into v_taskA;
  insert into public.task_submissions (task_id, version_number, submitted_by, review_status, status)
    values (v_taskA, 1, v_picA, 'pending', 'submitted')
    returning id into v_subA;

  -- v_ceoA is not the assigned reviewer (v_revA is) but has manage_others_cards via ceo level.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.review_task_submission(v_subA, 'approve', null);
  execute 'reset role';

  select status into v_task_status from public.tasks where id = v_taskA;
  select count(*) into n_violations from public.governance_violations
    where entity_id = v_taskA and violation_type = 'reviewer_override';

  if v_task_status <> 'done' then fails := fails||'same_org_review_failed('||v_task_status||'); '; end if;
  if n_violations <> 1 then fails := fails||'governance_violation_not_logged('||n_violations||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0064-DB-7: %', fails; end if;
  raise notice 'PASS 0064-DB-7: same-org reviewer-override still works and logs governance_violations (regression)';
end $$;
rollback;

-- ============================================================ 0064-DB-8: regression — same-org create_team with valid lead works
begin;
do $$
declare
  v_ceoA uuid := '11111111-1111-1111-1111-000000000001';
  v_orgA uuid; v_leadA uuid; v_teamId uuid; fails text := '';
begin
  select organization_id into v_orgA from public.profiles where id = v_ceoA;
  v_leadA := gen_random_uuid();
  insert into auth.users (id, raw_app_meta_data)
    values (v_leadA, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id) values (v_leadA, v_orgA)
    on conflict (id) do update set organization_id = excluded.organization_id;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  v_teamId := public.create_team('SameOrgLeadTeam', null, null, v_leadA);
  execute 'reset role';

  if v_teamId is null then fails := fails||'team_not_created; '; end if;

  if fails <> '' then raise exception 'FAIL 0064-DB-8: %', fails; end if;
  raise notice 'PASS 0064-DB-8: same-org create_team with valid lead works (regression)';
end $$;
rollback;
