-- WS-3b — kontrak: submit_action_plan_instance memancarkan notif review_request
-- dengan entity_type='action_plan_instance' + entity_id=<instance_id> (BUKAN parent AP).
-- Pola per-blok: raise 'ROLLBACK_OK: ...' memaksa rollback (nol polusi). Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres < supabase/tests/ws3b_notif_instance_entity_contract.sql
-- UUID dev lokal: org=52b0ebe1-…b70, ceo=11111111-…001.

-- ============================== BLOCK A — review_required=true → notif ke reviewer instance, entity=instance
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_pic uuid; v_rev uuid; v_init uuid; v_ap uuid; v_rule uuid; v_inst uuid; v_sub uuid;
        n_ok int; n_wrong int;
begin
  v_pic := gen_random_uuid(); v_rev := gen_random_uuid();
  insert into auth.users(id) values (v_pic),(v_rev);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'WS3b-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      review_required, evidence_required, result_value_required, repeat_setting, status, created_by)
    values (v_org, v_init, 'WS3b-AP', v_pic, v_rev, true, false, false, 'repeat', 'in_progress', v_ceo)
    returning id into v_ap;
  insert into public.action_plan_repeat_rules(organization_id, action_plan_id, frequency,
      repeat_start_date, repeat_end_date, time_of_day)
    values (v_org, v_ap, 'daily', current_date, current_date + 30, '17:00')
    returning id into v_rule;
  insert into public.action_plan_instances(organization_id, action_plan_id, repeat_rule_id,
      instance_date, instance_time, deadline_at, status, pic_id, reviewer_id)
    values (v_org, v_ap, v_rule, current_date, '17:00', now() + interval '2 hours',
            'assigned', v_pic, v_rev)
    returning id into v_inst;

  -- PIC submit instance
  perform set_config('request.jwt.claims', json_build_object('sub', v_pic, 'role','authenticated')::text, true);
  v_sub := public.submit_action_plan_instance(v_inst, 'sudah dikerjakan', null, null);

  -- Notif BENAR: review_request ke reviewer, entity_type=action_plan_instance, entity_id=instance
  select count(*) into n_ok from public.notifications
    where type = 'review_request' and recipient_id = v_rev
      and entity_type = 'action_plan_instance' and entity_id = v_inst;
  if n_ok <> 1 then
    raise exception 'FAIL: notif review_request instance count % (harus 1: entity_type=action_plan_instance, entity_id=%)', n_ok, v_inst;
  end if;

  -- Regresi guard: TIDAK boleh ada review_request yang salah pakai entity_type=action_plan + entity_id=parent AP
  select count(*) into n_wrong from public.notifications
    where type = 'review_request' and recipient_id = v_rev
      and entity_type = 'action_plan' and entity_id = v_ap;
  if n_wrong <> 0 then
    raise exception 'FAIL: notif review_request salah pakai entity_type=action_plan/entity_id=AP (bug WS-3b)';
  end if;

  raise exception 'ROLLBACK_OK: BlockA passed (submit instance emit review_request entity=action_plan_instance)';
end $$;

-- ============================== BLOCK B — review_required=false → langsung done, TANPA notif review_request
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_pic uuid; v_rev uuid; v_init uuid; v_ap uuid; v_rule uuid; v_inst uuid; v_sub uuid;
        v_status text; n_cnt int;
begin
  v_pic := gen_random_uuid(); v_rev := gen_random_uuid();
  insert into auth.users(id) values (v_pic),(v_rev);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'WS3b-Init2', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      review_required, evidence_required, result_value_required, repeat_setting, status, created_by)
    values (v_org, v_init, 'WS3b-AP2', v_pic, v_rev, false, false, false, 'repeat', 'in_progress', v_ceo)
    returning id into v_ap;
  insert into public.action_plan_repeat_rules(organization_id, action_plan_id, frequency,
      repeat_start_date, repeat_end_date, time_of_day)
    values (v_org, v_ap, 'daily', current_date, current_date + 30, '17:00')
    returning id into v_rule;
  insert into public.action_plan_instances(organization_id, action_plan_id, repeat_rule_id,
      instance_date, instance_time, deadline_at, status, pic_id, reviewer_id)
    values (v_org, v_ap, v_rule, current_date, '17:00', now() + interval '2 hours',
            'assigned', v_pic, v_rev)
    returning id into v_inst;

  perform set_config('request.jwt.claims', json_build_object('sub', v_pic, 'role','authenticated')::text, true);
  v_sub := public.submit_action_plan_instance(v_inst, 'tanpa review', null, null);

  select status into v_status from public.action_plan_instances where id = v_inst;
  if v_status <> 'done' then raise exception 'FAIL: review_required=false harus langsung done, got %', v_status; end if;
  select count(*) into n_cnt from public.notifications
    where type = 'review_request' and entity_id = v_inst;
  if n_cnt <> 0 then raise exception 'FAIL: review_required=false tidak boleh emit review_request (got %)', n_cnt; end if;

  raise exception 'ROLLBACK_OK: BlockB passed (review_required=false → done tanpa review_request)';
end $$;
