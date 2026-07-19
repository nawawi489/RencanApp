-- [QUARANTINED — WIP] Excluded from CI (run-db-contract-tests.sh skips *.wip.sql).
-- Reason: schema: evaluations.initiative_id column removed; ALSO runner-incompatible sentinel style (raise 'ROLLBACK_OK').
-- Repair tracked in supabase/tests/WIP_REPAIR_BACKLOG.md. Rename back to *.sql once green.
--
-- Fase 8 — Governance & Admin contract suite (per-block; jalankan tiap DO via Supabase MCP execute_sql).
-- Pola fase6/fase7: set request.jwt.claims utk auth.uid(); buat user transient in-tx; ROLLBACK via
-- RAISE 'ROLLBACK_OK: ...' di akhir (MCP menampilkan error berisi summary = lulus). Ganti UUID dev:
--   org  = 4b07a19f-550d-4952-b0d8-44f38f651d89
--   ceo  = ca8c1471-b870-4f09-a149-25e5eae99d6f
-- Verifikasi live 2026-06-25: TestA–D semua PASS.

-- ============================== TEST A — anti-self CHECK + append-only delete
do $$
declare v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
        v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f'; v_init uuid;
begin
  select id into v_init from public.initiatives limit 1;
  begin
    insert into public.evaluations(organization_id, initiative_id, evaluated_by, pic_id)
      values (v_org, v_init, v_ceo, v_ceo);
    raise exception 'FAIL: evaluations_pic_ne_evaluator not enforced';
  exception when check_violation then null; end;
  begin
    insert into public.deadline_change_requests(organization_id, entity_type, entity_id,
      old_deadline, new_deadline, reason, requestor_id, approver_id, status)
      values (v_org, 'action_plan', gen_random_uuid(), '2026-07-01','2026-07-10','x', v_ceo, v_ceo, 'pending');
    raise exception 'FAIL: dcr_requestor_ne_approver not enforced';
  exception when check_violation then null; end;
  insert into public.cancellations(organization_id, entity_type, entity_id, cancelled_by, reason, approval_status)
    values (v_org, 'goal', gen_random_uuid(), v_ceo, 'tmp', 'pending');
  begin
    delete from public.cancellations where reason='tmp';
    raise exception 'FAIL: cancellations delete not blocked';
  exception when others then if sqlerrm like '%append-only%' then null; else raise; end if; end;
  insert into public.evaluations(organization_id, initiative_id, evaluated_by, results)
    values (v_org, v_init, v_ceo, 'tmp-eval');
  begin
    delete from public.evaluations where results='tmp-eval';
    raise exception 'FAIL: evaluations delete not blocked';
  exception when others then if sqlerrm like '%append-only%' then null; else raise; end if; end;
  raise exception 'ROLLBACK_OK: TestA passed (anti-self CHECK x2 + append-only x2)';
end $$;

-- ============================== TEST B — create_department + cancel(CEO auto) + DCR reject + settings whitelist
do $$
declare v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
        v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
        v_goal uuid; v_cid uuid; v_status text; v_appr text; v_dept uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  v_dept := public.create_department('Operasi', 'Dept ops');
  if v_dept is null then raise exception 'FAIL: create_department null'; end if;
  insert into public.goals(organization_id, name, status, created_by)
    values (v_org, 'TmpGoalCancel', 'active', v_ceo) returning id into v_goal;
  v_cid := public.cancel_card('goal', v_goal, 'tidak relevan');
  select approval_status into v_appr from public.cancellations where id = v_cid;
  select status into v_status from public.goals where id = v_goal;
  if v_appr <> 'auto_approved' then raise exception 'FAIL: expected auto_approved got %', v_appr; end if;
  if v_status <> 'cancelled' then raise exception 'FAIL: goal status expected cancelled got %', v_status; end if;
  begin
    perform public.create_deadline_change_request(gen_random_uuid(), '2026-07-10','2026-07-01','r',null,null);
    raise exception 'FAIL: DCR did not reject';
  exception when others then
    if sqlerrm like '%lebih awal%' or sqlerrm like '%tidak ditemukan%' then null; else raise; end if; end;
  begin
    perform public.upsert_settings('arbitrary_bad_key', '{"x":1}'::jsonb);
    raise exception 'FAIL: invalid settings key accepted';
  exception when others then if sqlerrm like '%tidak valid%' then null; else raise; end if; end;
  perform public.upsert_settings('notification_rule_deadline', '{"enabled":true}'::jsonb);
  if not exists (select 1 from public.settings where organization_id=v_org and key='notification_rule_deadline') then
    raise exception 'FAIL: whitelisted settings key not persisted'; end if;
  raise exception 'ROLLBACK_OK: TestB passed';
end $$;

-- ============================== TEST C — confidential gate + CEO bypass + deadline guard + DCR self-block + approve
do $$
declare v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
        v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
        v_staff uuid; v_init uuid; v_ap uuid; v_dcr uuid; v_dl date; v_access boolean;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'ConfInit', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'ConfAP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo) returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  select public.can_access_initiative(v_init) into v_access;
  if not v_access then raise exception 'FAIL: staff should access init pre-confidential'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.grant_confidential_access('initiative', v_init, v_ceo, 'confidential', 'sensitif');
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  select public.can_access_initiative(v_init) into v_access;
  if v_access then raise exception 'FAIL: confidential gate did not deny staff'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  select public.can_access_initiative(v_init) into v_access;
  if not v_access then raise exception 'FAIL: CEO should bypass confidential'; end if;
  begin
    update public.action_plans set deadline = '2026-08-01' where id = v_ap;
    raise exception 'FAIL: direct deadline update not blocked';
  exception when others then if sqlerrm like '%Deadline Change Request%' then null; else raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','butuh waktu',null,null);
  begin
    perform public.review_deadline_change(v_dcr, 'approved', null);
    raise exception 'FAIL: self-approval not blocked';
  exception when others then if sqlerrm like '%sendiri%' or sqlerrm like '%berwenang%' then null; else raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'approved', null);
  select deadline into v_dl from public.action_plans where id = v_ap;
  if v_dl <> '2026-07-15' then raise exception 'FAIL: AP deadline not updated, got %', v_dl; end if;
  raise exception 'ROLLBACK_OK: TestC passed';
end $$;

-- ============================== TEST D — search_cards RLS + empty + record_evaluation upsert + anti-self
do $$
declare v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
        v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
        v_staff uuid; v_init uuid; v_eid uuid; v_cnt int; v_ta text;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'ZxSearchInit', 'active', v_staff, v_ceo) returning id into v_init;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  select count(*) into v_cnt from public.search_cards('ZxSearch', null, false) r where (r->>'entity_type')='initiative';
  if v_cnt < 1 then raise exception 'FAIL: CEO search did not find initiative'; end if;
  select count(*) into v_cnt from public.search_cards('', null, false) r;
  if v_cnt <> 0 then raise exception 'FAIL: empty query should return 0, got %', v_cnt; end if;
  v_eid := public.record_evaluation(v_init, 'sebagian', 'hasil', array['a'], array['b'], 'pelajaran', true, false, null);
  select target_achieved into v_ta from public.evaluations where id = v_eid;
  if v_ta <> 'sebagian' then raise exception 'FAIL: evaluation target not stored, got %', v_ta; end if;
  perform public.record_evaluation(v_init, 'ya', 'hasil2', null, null, null, false, true, 'rollout');
  select count(*) into v_cnt from public.evaluations where initiative_id = v_init;
  if v_cnt <> 1 then raise exception 'FAIL: evaluation should upsert to 1 row, got %', v_cnt; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  begin
    perform public.record_evaluation(v_init, 'ya', null, null, null, null, false, false, null);
    raise exception 'FAIL: self-evaluation not blocked';
  exception when others then if sqlerrm like '%sendiri%' or sqlerrm like '%initiativenya%' then null; else raise; end if; end;
  raise exception 'ROLLBACK_OK: TestD passed';
end $$;
