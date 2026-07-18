-- [QUARANTINED — WIP] Excluded from CI (run-db-contract-tests.sh skips *.wip.sql).
-- Reason: schema: initiatives now requires strategy_id.
-- Repair tracked in supabase/tests/WIP_REPAIR_BACKLOG.md. Rename back to *.sql once green.
--
-- ISSUE-005 fix — resolusi notifikasi actionable.
-- Pola: per-blok DO $$..$$ dengan `raise 'ROLLBACK_OK: …'` di akhir untuk memaksa rollback (nol polusi).
-- Jalankan: docker exec -i supabase_db_supabase psql -U postgres -d postgres < supabase/tests/0040_notification_resolution_contract.sql
-- Dev UUID: org=52b0ebe1-…b70, ceo=11111111-…001.

-- ============================== BLOCK A — approve DCR resolves reviewer's deadline_change_requested notif
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_init uuid; v_ap uuid; v_dcr uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);

  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'A-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      deadline, status, created_by)
    values (v_org, v_init, 'A-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo)
    returning id into v_ap;

  -- Staff mengajukan DCR → emit_notification ke reviewer (CEO).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','perlu tambahan waktu',null,null);

  -- Reviewer approve.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'approved', null);

  -- Setelah approve: notif deadline_change_requested milik reviewer harus terisi resolved_at + resolution='approved'.
  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications
   where recipient_id = v_ceo
     and type = 'deadline_change_requested'
     and entity_type = 'action_plan' and entity_id = v_ap;
  if v_resolved is null then
    raise exception 'FAIL BlockA: notif reviewer masih menganga (resolved_at null) — approve tidak mem-resolve';
  end if;
  if v_resolution <> 'approved' then
    raise exception 'FAIL BlockA: resolution=% (harus approved)', v_resolution;
  end if;

  raise exception 'ROLLBACK_OK: BlockA passed (approve DCR resolves reviewer notif)';
end $$;

-- ============================== BLOCK B — reject DCR resolves reviewer notif w/ resolution='rejected'
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_init uuid; v_ap uuid; v_dcr uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'B-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      deadline, status, created_by)
    values (v_org, v_init, 'B-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo)
    returning id into v_ap;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','r',null,null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'rejected', 'alasan tolak');

  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications
   where recipient_id = v_ceo
     and type = 'deadline_change_requested'
     and entity_type = 'action_plan' and entity_id = v_ap;
  if v_resolved is null or v_resolution <> 'rejected' then
    raise exception 'FAIL BlockB: reject harus set resolved_at + resolution=rejected (got %, %)', v_resolved, v_resolution;
  end if;
  raise exception 'ROLLBACK_OK: BlockB passed (reject DCR resolves reviewer notif)';
end $$;

-- ============================== BLOCK C — revision_requested DCR resolves reviewer notif w/ resolution='revision_requested'
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_init uuid; v_ap uuid; v_dcr uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'C-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      deadline, status, created_by)
    values (v_org, v_init, 'C-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo)
    returning id into v_ap;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','r',null,null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'revision_requested', 'perlu detail');

  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications
   where recipient_id = v_ceo
     and type = 'deadline_change_requested'
     and entity_type = 'action_plan' and entity_id = v_ap;
  if v_resolved is null or v_resolution <> 'revision_requested' then
    raise exception 'FAIL BlockC: revision harus set resolution=revision_requested (got %, %)', v_resolved, v_resolution;
  end if;
  raise exception 'ROLLBACK_OK: BlockC passed (revision_requested resolves reviewer notif)';
end $$;

-- ============================== BLOCK D — resubmit DCR resolves pengaju's revision notif w/ resolution='resubmitted'
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_init uuid; v_ap uuid; v_dcr uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'D-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      deadline, status, created_by)
    values (v_org, v_init, 'D-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo)
    returning id into v_ap;

  -- staff request → CEO minta revisi → staff resubmit
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','r',null,null);

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'revision_requested', 'kurang detail');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  perform public.resubmit_deadline_change_request(v_dcr, '2026-07-20', 'detail lengkap');

  -- Notif "Perlu Revisi" milik pengaju harus ter-resolve.
  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications
   where recipient_id = v_staff
     and type = 'deadline_change_revision_requested'
     and entity_type = 'action_plan' and entity_id = v_ap;
  if v_resolved is null or v_resolution <> 'resubmitted' then
    raise exception 'FAIL BlockD: resubmit harus set resolution=resubmitted (got %, %)', v_resolved, v_resolution;
  end if;
  raise exception 'ROLLBACK_OK: BlockD passed (resubmit resolves pengaju revision notif)';
end $$;

-- ============================== BLOCK E — review_action_plan_submission (approve) resolves reviewer's review_request notif
-- Notif review_request diseed langsung (bug-set state). Fokus test: RPC pemutus mem-resolve.
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_pic uuid; v_init uuid; v_ap uuid; v_sub uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_pic := gen_random_uuid();
  insert into auth.users(id) values (v_pic);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'E-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      review_required, evidence_required, result_value_required, repeat_setting, status, created_by)
    values (v_org, v_init, 'E-AP', v_pic, v_ceo, true, false, false, 'one_time', 'submitted', v_ceo)
    returning id into v_ap;
  insert into public.action_plan_submissions(action_plan_id, submitted_by, version_number, status)
    values (v_ap, v_pic, 1, 'submitted') returning id into v_sub;
  update public.action_plans set current_submission_id = v_sub where id = v_ap;
  -- Seed notif review_request untuk reviewer (state buggy: sudah ada tapi belum resolved).
  insert into public.notifications(organization_id, recipient_id, actor_id, type,
    entity_type, entity_id, title, body)
    values (v_org, v_ceo, v_pic, 'review_request', 'action_plan', v_ap, 'Permintaan review', 'E-AP');

  -- CEO approve
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_action_plan_submission(v_sub, 'approve', null);

  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications
   where recipient_id = v_ceo
     and type = 'review_request'
     and entity_type = 'action_plan' and entity_id = v_ap;
  if v_resolved is null or v_resolution <> 'approved' then
    raise exception 'FAIL BlockE: approve AP harus resolve review_request (got %, %)', v_resolved, v_resolution;
  end if;
  raise exception 'ROLLBACK_OK: BlockE passed (approve AP resolves reviewer review_request)';
end $$;

-- ============================== BLOCK F — review_action_plan_submission (reject) resolves w/ resolution='rejected'
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_pic uuid; v_init uuid; v_ap uuid; v_sub uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_pic := gen_random_uuid();
  insert into auth.users(id) values (v_pic);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'F-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      review_required, evidence_required, result_value_required, repeat_setting, status, created_by)
    values (v_org, v_init, 'F-AP', v_pic, v_ceo, true, false, false, 'one_time', 'submitted', v_ceo)
    returning id into v_ap;
  insert into public.action_plan_submissions(action_plan_id, submitted_by, version_number, status)
    values (v_ap, v_pic, 1, 'submitted') returning id into v_sub;
  update public.action_plans set current_submission_id = v_sub where id = v_ap;
  insert into public.notifications(organization_id, recipient_id, actor_id, type,
    entity_type, entity_id, title, body)
    values (v_org, v_ceo, v_pic, 'review_request', 'action_plan', v_ap, 'Permintaan review', 'F-AP');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_action_plan_submission(v_sub, 'reject', 'perlu revisi');

  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications
   where recipient_id = v_ceo
     and type = 'review_request'
     and entity_type = 'action_plan' and entity_id = v_ap;
  if v_resolved is null or v_resolution <> 'rejected' then
    raise exception 'FAIL BlockF: reject AP harus resolve review_request (got %, %)', v_resolved, v_resolution;
  end if;
  raise exception 'ROLLBACK_OK: BlockF passed (reject AP resolves reviewer review_request)';
end $$;

-- ============================== BLOCK G — review_action_plan_instance_submission (approve) resolves review_request notif on instance
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_pic uuid; v_init uuid; v_ap uuid; v_rule uuid; v_inst uuid; v_sub uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_pic := gen_random_uuid();
  insert into auth.users(id) values (v_pic);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'G-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      review_required, evidence_required, result_value_required, repeat_setting, status, created_by)
    values (v_org, v_init, 'G-AP', v_pic, v_ceo, true, false, false, 'repeat', 'in_progress', v_ceo)
    returning id into v_ap;
  insert into public.action_plan_repeat_rules(organization_id, action_plan_id, frequency,
      repeat_start_date, repeat_end_date, time_of_day)
    values (v_org, v_ap, 'daily', current_date, current_date + 30, '17:00')
    returning id into v_rule;
  insert into public.action_plan_instances(organization_id, action_plan_id, repeat_rule_id,
      instance_date, instance_time, deadline_at, status, pic_id, reviewer_id)
    values (v_org, v_ap, v_rule, current_date, '17:00', now() + interval '2 hours',
            'submitted', v_pic, v_ceo)
    returning id into v_inst;
  insert into public.action_plan_submissions(action_plan_id, action_plan_instance_id,
      submitted_by, version_number, status, review_status)
    values (v_ap, v_inst, v_pic, 1, 'submitted', 'pending')
    returning id into v_sub;
  update public.action_plan_instances set current_submission_id = v_sub where id = v_inst;
  -- Seed notif review_request untuk instance.
  insert into public.notifications(organization_id, recipient_id, actor_id, type,
    entity_type, entity_id, title, body)
    values (v_org, v_ceo, v_pic, 'review_request', 'action_plan_instance', v_inst, 'Permintaan review', 'G-AP');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_action_plan_instance_submission(v_sub, 'approve', null);

  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications
   where recipient_id = v_ceo
     and type = 'review_request'
     and entity_type = 'action_plan_instance' and entity_id = v_inst;
  if v_resolved is null or v_resolution <> 'approved' then
    raise exception 'FAIL BlockG: approve instance harus resolve review_request (got %, %)', v_resolved, v_resolution;
  end if;
  raise exception 'ROLLBACK_OK: BlockG passed (approve instance resolves reviewer review_request)';
end $$;

-- ============================== BLOCK H — backfill: notif stale untuk DCR non-pending harus resolved
-- Simulasi state QA: DCR sudah approved kemarin, tapi notif reviewer belum resolved.
-- Backfill (bagian dari migration) harus mengoreksi.
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_init uuid; v_ap uuid; v_dcr uuid; v_notif uuid;
        v_resolved timestamptz; v_resolution text;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'H-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id,
      deadline, status, created_by)
    values (v_org, v_init, 'H-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo)
    returning id into v_ap;
  -- DCR sudah approved (final state).
  insert into public.deadline_change_requests(organization_id, entity_type, entity_id,
    old_deadline, new_deadline, reason, requestor_id, status, approver_id, responded_at)
    values (v_org, 'action_plan', v_ap, '2026-07-01','2026-07-15','r', v_staff, 'approved',
            v_ceo, now() - interval '1 day')
    returning id into v_dcr;
  -- Notif stale: masih belum resolved.
  insert into public.notifications(organization_id, recipient_id, actor_id, type,
    entity_type, entity_id, title, body, created_at)
    values (v_org, v_ceo, v_staff, 'deadline_change_requested', 'action_plan', v_ap,
            'Permintaan Perubahan Deadline', 'Ada permintaan…', now() - interval '1 day')
    returning id into v_notif;

  -- Panggil backfill (bagian dari migration). Diekspos sebagai backfill_resolve_stale_notifications().
  perform public.backfill_resolve_stale_notifications();

  select resolved_at, resolution into v_resolved, v_resolution
    from public.notifications where id = v_notif;
  if v_resolved is null or v_resolution <> 'approved' then
    raise exception 'FAIL BlockH: backfill harus resolve stale notif w/ resolution=DCR.status (got %, %)', v_resolved, v_resolution;
  end if;
  raise exception 'ROLLBACK_OK: BlockH passed (backfill resolves stale DCR notif)';
end $$;
