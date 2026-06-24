-- EMS V1.8.1 — Fase 3 per-user SQL contract suite (gate AC-N9 + append-only + RLS + CF-1 + AC-N10/I5/I6)
--
-- Membuktikan invarian governance Fase 3 di bawah KONTEKS USER NYATA (auth.uid() disimulasikan via
-- request.jwt.claims). Tiap test: bangun fixture (auth.users insert → trigger handle_new_user buat
-- profil staff Nyantuy) → assert → ROLLBACK (nol polusi). Verified GREEN di dev fhnqwytqprsptjshoxfn 2026-06-24.
--
-- Cara jalan (butuh koneksi role pemilik/postgres, mis. service_role / psql):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fase3_per_user_contract.sql
-- Tiap blok RAISE NOTICE 'PASS' bila lolos; RAISE EXCEPTION 'FAIL: ...' bila ada guard yang bocor.
-- (Dijalankan via Supabase MCP execute_sql: tiap blok do $$..$$ dikirim terpisah; pakai
--  raise exception untuk memaksa rollback — pesan 'ALL_PASS' = sukses.)
--
-- ID konstan dev: org=4b07a19f-550d-4952-b0d8-44f38f651d89, ceo=ca8c1471-b870-4f09-a149-25e5eae99d6f,
-- perm manage_others_cards=f6bbcc19-18f4-4093-8b13-a5368c8cf1fd, view_governance_violation=b70a3396-6dff-4179-a952-8e02df0f0aa8.
-- Ganti bila org dev berbeda.

-- ============================================================ TEST 1: guard one-time (submit + review)
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  pic uuid := '11111111-1111-1111-1111-111111111101';
  rev uuid := '11111111-1111-1111-1111-111111111102';
  out_u uuid := '11111111-1111-1111-1111-111111111103';
  mgr uuid := '11111111-1111-1111-1111-111111111104';
  v_init uuid; a1 uuid; a2 uuid; a3 uuid; a4 uuid; s3 uuid;
  fails text := ''; rnd uuid := '99999999-9999-9999-9999-999999999999';
begin
  insert into auth.users (id) values (pic),(rev),(out_u),(mgr);
  insert into public.user_permissions (user_id, permission_id, granted)
    values (mgr, 'f6bbcc19-18f4-4093-8b13-a5368c8cf1fd', true);
  insert into public.initiatives (organization_id, name, pic_id, created_by, status)
    values (v_org,'IT Test',pic,v_ceo,'active') returning id into v_init;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id,
     review_required, evidence_required, result_value_required, repeat_setting, status,
     expected_output, definition_of_done, priority, start_date, deadline)
    values (v_org,v_init,'A1',pic,rev,true,false,false,'one_time','assigned','out','dod','medium',current_date,current_date+7) returning id into a1;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, review_required, evidence_required, repeat_setting, status)
    values (v_org,v_init,'A2',pic,rev,true,true,'one_time','assigned') returning id into a2;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, review_required, evidence_required, repeat_setting, status)
    values (v_org,v_init,'A3',pic,rev,true,false,'one_time','submitted') returning id into a3;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, repeat_setting, status)
    values (v_org,v_init,'A4',pic,rev,'one_time','done') returning id into a4;
  insert into public.action_plan_submissions (action_plan_id, version_number, submitted_by, review_status)
    values (a3,1,pic,'pending') returning id into s3;

  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.submit_action_plan(rnd,'n',null,null); fails:=fails||'S1_notfound:NOERR; ';
  exception when others then if sqlerrm not like '%tidak ditemukan%' then fails:=fails||'S1:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',out_u,'role','authenticated')::text, true);
  begin perform public.submit_action_plan(a1,'n',null,null); fails:=fails||'S2_notpic:NOERR; ';
  exception when others then if sqlerrm not like '%Hanya PIC%' then fails:=fails||'S2:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.submit_action_plan(a4,'n',null,null); fails:=fails||'S3_status:NOERR; ';
  exception when others then if sqlerrm not like '%tidak dalam status%' then fails:=fails||'S3:'||sqlerrm||'; '; end if; end;
  begin perform public.submit_action_plan(a2,'n',null,null); fails:=fails||'S4_evidence:NOERR; ';
  exception when others then if sqlerrm not like '%Bukti wajib%' then fails:=fails||'S4:'||sqlerrm||'; '; end if; end;
  begin perform public.submit_action_plan(a1,'n',null,null);
  exception when others then fails:=fails||'S5_positive:'||sqlerrm||'; '; end;

  perform set_config('request.jwt.claims', json_build_object('sub',rev,'role','authenticated')::text, true);
  begin perform public.review_action_plan_submission(s3,'foo',null); fails:=fails||'R1:NOERR; ';
  exception when others then if sqlerrm not like '%tidak valid%' then fails:=fails||'R1:'||sqlerrm||'; '; end if; end;
  begin perform public.review_action_plan_submission(rnd,'approve',null); fails:=fails||'R2:NOERR; ';
  exception when others then if sqlerrm not like '%tidak ditemukan%' then fails:=fails||'R2:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.review_action_plan_submission(s3,'approve',null); fails:=fails||'R3_self:NOERR; ';
  exception when others then if sqlerrm not like '%me-review pekerjaannya sendiri%' then fails:=fails||'R3:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',out_u,'role','authenticated')::text, true);
  begin perform public.review_action_plan_submission(s3,'approve',null); fails:=fails||'R4_nonrev:NOERR; ';
  exception when others then if sqlerrm not like '%Hanya Reviewer yang ditunjuk%' then fails:=fails||'R4:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',rev,'role','authenticated')::text, true);
  begin perform public.review_action_plan_submission(s3,'reject',null); fails:=fails||'R5_reason:NOERR; ';
  exception when others then if sqlerrm not like '%Alasan penolakan wajib%' then fails:=fails||'R5:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',mgr,'role','authenticated')::text, true);
  begin perform public.review_action_plan_submission(s3,'approve',null);
  exception when others then fails:=fails||'R6_override:'||sqlerrm||'; '; end;
  if not exists (select 1 from public.governance_violations where entity_id=a3 and violation_type='reviewer_override' and user_id=mgr) then fails:=fails||'R6_no_govrow; '; end if;
  perform set_config('request.jwt.claims', json_build_object('sub',rev,'role','authenticated')::text, true);
  begin perform public.review_action_plan_submission(s3,'approve',null); fails:=fails||'R7_already:NOERR; ';
  exception when others then if sqlerrm not like '%sudah direview%' then fails:=fails||'R7:'||sqlerrm||'; '; end if; end;

  if fails <> '' then raise exception 'TEST1 one-time guards FAIL: %', fails; end if;
  raise notice 'TEST1 one-time guards PASS';
end $$;
rollback;

-- ============================================================ TEST 2: guard instance (submit + review)
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  pic uuid := '11111111-1111-1111-1111-111111111101';
  rev uuid := '11111111-1111-1111-1111-111111111102';
  out_u uuid := '11111111-1111-1111-1111-111111111103';
  v_init uuid; apr uuid; ape uuid; apo uuid; rule uuid; rule_e uuid;
  i_assigned uuid; i_missed uuid; i_submitted uuid; i_e uuid; s_inst uuid; s_one uuid;
  rnd uuid := '99999999-9999-9999-9999-999999999999'; fails text := '';
begin
  insert into auth.users (id) values (pic),(rev),(out_u);
  insert into public.initiatives (organization_id, name, pic_id, created_by, status) values (v_org,'IT Inst',pic,v_ceo,'active') returning id into v_init;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, review_required, evidence_required, repeat_setting, status)
    values (v_org,v_init,'APR',pic,rev,true,false,'repeat','in_progress') returning id into apr;
  insert into public.action_plan_repeat_rules (organization_id, action_plan_id, frequency, repeat_start_date, repeat_end_date, time_of_day, missed_rule)
    values (v_org,apr,'daily',current_date,current_date+30,'17:00','strict') returning id into rule;
  insert into public.action_plan_instances (organization_id, action_plan_id, repeat_rule_id, instance_date, instance_time, deadline_at, pic_id, reviewer_id, status)
    values (v_org,apr,rule,current_date,'17:00',now()+interval '6 hours',pic,rev,'assigned') returning id into i_assigned;
  insert into public.action_plan_instances (organization_id, action_plan_id, repeat_rule_id, instance_date, instance_time, deadline_at, pic_id, reviewer_id, status)
    values (v_org,apr,rule,current_date-1,'17:00',now()-interval '1 day',pic,rev,'missed') returning id into i_missed;
  insert into public.action_plan_instances (organization_id, action_plan_id, repeat_rule_id, instance_date, instance_time, deadline_at, pic_id, reviewer_id, status)
    values (v_org,apr,rule,current_date-2,'17:00',now()-interval '2 day',pic,rev,'submitted') returning id into i_submitted;
  insert into public.action_plan_submissions (action_plan_id, action_plan_instance_id, version_number, submitted_by, review_status)
    values (apr,i_submitted,1,pic,'pending') returning id into s_inst;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, review_required, evidence_required, repeat_setting, status)
    values (v_org,v_init,'APE',pic,rev,true,true,'repeat','in_progress') returning id into ape;
  insert into public.action_plan_repeat_rules (organization_id, action_plan_id, frequency, repeat_start_date, repeat_end_date, time_of_day, missed_rule)
    values (v_org,ape,'daily',current_date,current_date+30,'17:00','strict') returning id into rule_e;
  insert into public.action_plan_instances (organization_id, action_plan_id, repeat_rule_id, instance_date, instance_time, deadline_at, pic_id, reviewer_id, status)
    values (v_org,ape,rule_e,current_date,'17:00',now()+interval '6 hours',pic,rev,'assigned') returning id into i_e;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, review_required, repeat_setting, status)
    values (v_org,v_init,'APO',pic,rev,true,'one_time','submitted') returning id into apo;
  insert into public.action_plan_submissions (action_plan_id, version_number, submitted_by, review_status) values (apo,1,pic,'pending') returning id into s_one;

  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.submit_action_plan_instance(rnd,'n',null,null); fails:=fails||'I1:NOERR; ';
  exception when others then if sqlerrm not like '%Instance tidak ditemukan%' then fails:=fails||'I1:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',out_u,'role','authenticated')::text, true);
  begin perform public.submit_action_plan_instance(i_assigned,'n',null,null); fails:=fails||'I2:NOERR; ';
  exception when others then if sqlerrm not like '%Hanya PIC yang dapat submit instance%' then fails:=fails||'I2:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.submit_action_plan_instance(i_missed,'n',null,null); fails:=fails||'I3:NOERR; ';
  exception when others then if sqlerrm not like '%sudah Terlewat%' then fails:=fails||'I3:'||sqlerrm||'; '; end if; end;
  begin perform public.submit_action_plan_instance(i_submitted,'n',null,null); fails:=fails||'I4:NOERR; ';
  exception when others then if sqlerrm not like '%tidak dalam status yang bisa disubmit%' then fails:=fails||'I4:'||sqlerrm||'; '; end if; end;
  begin perform public.submit_action_plan_instance(i_e,'n',null,null); fails:=fails||'I5:NOERR; ';
  exception when others then if sqlerrm not like '%Bukti wajib%' then fails:=fails||'I5:'||sqlerrm||'; '; end if; end;
  begin perform public.submit_action_plan_instance(i_assigned,'n',null,null);
  exception when others then fails:=fails||'I6_positive:'||sqlerrm||'; '; end;

  perform set_config('request.jwt.claims', json_build_object('sub',rev,'role','authenticated')::text, true);
  begin perform public.review_action_plan_instance_submission(s_inst,'foo',null); fails:=fails||'RI1:NOERR; ';
  exception when others then if sqlerrm not like '%tidak valid%' then fails:=fails||'RI1:'||sqlerrm||'; '; end if; end;
  begin perform public.review_action_plan_instance_submission(rnd,'approve',null); fails:=fails||'RI2:NOERR; ';
  exception when others then if sqlerrm not like '%tidak ditemukan%' then fails:=fails||'RI2:'||sqlerrm||'; '; end if; end;
  begin perform public.review_action_plan_instance_submission(s_one,'approve',null); fails:=fails||'RI3:NOERR; ';
  exception when others then if sqlerrm not like '%bukan submission instance%' then fails:=fails||'RI3:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  begin perform public.review_action_plan_instance_submission(s_inst,'approve',null); fails:=fails||'RI4:NOERR; ';
  exception when others then if sqlerrm not like '%me-review pekerjaannya sendiri%' then fails:=fails||'RI4:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',out_u,'role','authenticated')::text, true);
  begin perform public.review_action_plan_instance_submission(s_inst,'approve',null); fails:=fails||'RI5:NOERR; ';
  exception when others then if sqlerrm not like '%Hanya Reviewer yang ditunjuk yang dapat me-review instance%' then fails:=fails||'RI5:'||sqlerrm||'; '; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub',rev,'role','authenticated')::text, true);
  begin perform public.review_action_plan_instance_submission(s_inst,'reject',null); fails:=fails||'RI6:NOERR; ';
  exception when others then if sqlerrm not like '%Alasan penolakan wajib%' then fails:=fails||'RI6:'||sqlerrm||'; '; end if; end;
  begin perform public.review_action_plan_instance_submission(s_inst,'approve',null);
  exception when others then fails:=fails||'RI7_positive:'||sqlerrm||'; '; end;
  begin perform public.review_action_plan_instance_submission(s_inst,'approve',null); fails:=fails||'RI8:NOERR; ';
  exception when others then if sqlerrm not like '%sudah direview%' then fails:=fails||'RI8:'||sqlerrm||'; '; end if; end;

  if fails <> '' then raise exception 'TEST2 instance guards FAIL: %', fails; end if;
  raise notice 'TEST2 instance guards PASS';
end $$;
rollback;

-- ============================================================ TEST 3: append-only + RLS recipient/member
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  pic uuid := '11111111-1111-1111-1111-111111111101';
  out_u uuid := '11111111-1111-1111-1111-111111111103';
  v_init uuid; tbl text; n int; fails text := '';
  tbls text[] := array['notifications','chat_rooms','chat_room_members','chat_messages','chat_message_reads','comments','mentions'];
begin
  insert into auth.users (id) values (pic),(out_u);
  insert into public.notifications (organization_id, recipient_id, type, entity_type, entity_id, title)
    values (v_org, pic, 'review_request', 'action_plan', v_org, 'Test notif');
  insert into public.initiatives (organization_id, name, pic_id, created_by, status) values (v_org,'IT Chat',pic,v_ceo,'active') returning id into v_init;

  execute 'set role authenticated';
  foreach tbl in array tbls loop
    begin execute format('insert into public.%I default values', tbl); fails:=fails||tbl||'_INS_ALLOWED; ';
    exception when insufficient_privilege then null; when others then fails:=fails||tbl||'_INS_'||sqlstate||'; '; end;
  end loop;
  begin execute 'update public.notifications set is_read=true'; fails:=fails||'NOTIF_UPD_ALLOWED; ';
  exception when insufficient_privilege then null; when others then fails:=fails||'NOTIF_UPD_'||sqlstate||'; '; end;
  begin execute 'delete from public.notifications'; fails:=fails||'NOTIF_DEL_ALLOWED; ';
  exception when insufficient_privilege then null; when others then fails:=fails||'NOTIF_DEL_'||sqlstate||'; '; end;

  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  select count(*) into n from public.notifications;
  if n < 1 then fails:=fails||'RLS_PIC_none; '; end if;
  if exists (select 1 from public.notifications where recipient_id <> pic) then fails:=fails||'RLS_PIC_leak; '; end if;
  perform set_config('request.jwt.claims', json_build_object('sub',out_u,'role','authenticated')::text, true);
  select count(*) into n from public.notifications;
  if n <> 0 then fails:=fails||'RLS_OUT_sees('||n||'); '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  select count(*) into n from public.chat_rooms where initiative_id=v_init;
  if n <> 1 then fails:=fails||'chat_member_PIC('||n||'); '; end if;
  perform set_config('request.jwt.claims', json_build_object('sub',out_u,'role','authenticated')::text, true);
  select count(*) into n from public.chat_rooms where initiative_id=v_init;
  if n <> 0 then fails:=fails||'chat_nonmember_OUT('||n||'); '; end if;

  if fails <> '' then raise exception 'TEST3 append-only/RLS FAIL: %', fails; end if;
  raise notice 'TEST3 append-only/RLS PASS';
end $$;
rollback;

-- ============================================================ TEST 4: governance_warning CF-1 + cron idempotency
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  pic uuid := '11111111-1111-1111-1111-111111111101';
  rev uuid := '11111111-1111-1111-1111-111111111102';
  mgr uuid := '11111111-1111-1111-1111-111111111104';
  gov uuid := '11111111-1111-1111-1111-111111111105';
  v_init uuid; ap uuid; apd uuid; rule uuid; inst uuid; n int; c1 int; c2 int; fails text := '';
begin
  insert into auth.users (id) values (pic),(rev),(mgr),(gov);
  insert into public.user_permissions (user_id, permission_id, granted) values (gov, 'b70a3396-6dff-4179-a952-8e02df0f0aa8', true);
  insert into public.initiatives (organization_id, name, pic_id, created_by, status) values (v_org,'IT Gov',pic,v_ceo,'draft') returning id into v_init;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, repeat_setting, status) values (v_org,v_init,'APG',pic,rev,'repeat','in_progress') returning id into ap;
  insert into public.action_plan_repeat_rules (organization_id, action_plan_id, frequency, repeat_start_date, repeat_end_date, time_of_day, missed_rule) values (v_org,ap,'daily',current_date,current_date+30,'17:00','strict') returning id into rule;
  insert into public.action_plan_instances (organization_id, action_plan_id, repeat_rule_id, instance_date, instance_time, deadline_at, pic_id, reviewer_id, status) values (v_org,ap,rule,current_date,'17:00',now()+interval '6 hours',pic,rev,'assigned') returning id into inst;

  insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity) values (v_org, mgr, 'reviewer_override', 'action_plan', ap, '{}'::jsonb, 'medium');
  select count(*) into n from public.notifications where recipient_id=pic and type='governance_warning' and entity_id=ap; if n<>1 then fails:=fails||'override_PIC('||n||'); '; end if;
  select count(*) into n from public.notifications where recipient_id=rev and type='governance_warning' and entity_id=ap; if n<>1 then fails:=fails||'override_REV('||n||'); '; end if;
  select count(*) into n from public.notifications where recipient_id=gov and type='governance_warning' and entity_id=ap; if n<>1 then fails:=fails||'override_GOV('||n||'); '; end if;
  select count(*) into n from public.notifications where recipient_id=mgr and type='governance_warning' and entity_id=ap; if n<>0 then fails:=fails||'override_MGR_leaked('||n||'); '; end if;

  insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity) values (v_org, pic, 'instance_missed', 'action_plan_instance', inst, '{}'::jsonb, 'medium');
  select count(*) into n from public.notifications where recipient_id=rev and type='governance_warning' and entity_id=inst; if n<>1 then fails:=fails||'missed_REV('||n||'); '; end if;
  select count(*) into n from public.notifications where recipient_id=gov and type='governance_warning' and entity_id=inst; if n<>1 then fails:=fails||'missed_GOV('||n||'); '; end if;
  select count(*) into n from public.notifications where recipient_id=pic and type='governance_warning' and entity_id=inst; if n<>0 then fails:=fails||'missed_PIC_via_gov('||n||'); '; end if;

  insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity) values (v_org, pic, 'instance_missed', 'action_plan_instance', inst, '{}'::jsonb, 'low');
  select count(*) into n from public.notifications where type='governance_warning' and entity_id=inst; if n<>2 then fails:=fails||'low_sev_extra('||n||'); '; end if;

  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, repeat_setting, status, deadline) values (v_org,v_init,'APD',pic,rev,'one_time','assigned', current_date+2) returning id into apd;
  perform public.emit_deadline_notifications();
  select count(*) into c1 from public.notifications where recipient_id=pic and type='deadline_reminder' and entity_id=apd;
  perform public.emit_deadline_notifications();
  select count(*) into c2 from public.notifications where recipient_id=pic and type='deadline_reminder' and entity_id=apd;
  if c1<>1 then fails:=fails||'cron_first('||c1||'); '; end if;
  if c2<>1 then fails:=fails||'cron_idempotent('||c2||'); '; end if;

  if fails <> '' then raise exception 'TEST4 governance/cron FAIL: %', fails; end if;
  raise notice 'TEST4 governance/cron PASS';
end $$;
rollback;

-- ============================================================ TEST 5: mention gating + non-member send + unread-excludes-own
begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  pic uuid := '11111111-1111-1111-1111-111111111101';
  rev uuid := '11111111-1111-1111-1111-111111111102';
  out_u uuid := '11111111-1111-1111-1111-111111111103';
  v_init uuid; ap uuid; room uuid; msg uuid; n int; fails text := '';
begin
  insert into auth.users (id) values (pic),(rev),(out_u);
  insert into public.initiatives (organization_id, name, pic_id, created_by, status) values (v_org,'IT Chat2',pic,v_ceo,'active') returning id into v_init;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, reviewer_id, repeat_setting, status) values (v_org,v_init,'APC',pic,rev,'one_time','assigned') returning id into ap;
  select id into room from public.chat_rooms where initiative_id=v_init;

  if not exists (select 1 from public.chat_room_members where chat_room_id=room and member_id=pic) then fails:=fails||'pic_not_member; '; end if;
  if not exists (select 1 from public.chat_room_members where chat_room_id=room and member_id=rev) then fails:=fails||'rev_not_member; '; end if;
  if exists (select 1 from public.chat_room_members where chat_room_id=room and member_id=out_u) then fails:=fails||'out_is_member; '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  msg := public.send_chat_message(room, 'halo tim', array[rev, out_u]);
  select count(*) into n from public.mentions where chat_message_id=msg; if n<>1 then fails:=fails||'mention_count('||n||'); '; end if;
  if not exists (select 1 from public.mentions where chat_message_id=msg and mentioned_user_id=rev) then fails:=fails||'rev_mention_missing; '; end if;
  if exists (select 1 from public.mentions where chat_message_id=msg and mentioned_user_id=out_u) then fails:=fails||'out_mention_leaked; '; end if;
  select count(*) into n from public.notifications where recipient_id=rev and type='mention' and entity_id=msg; if n<>1 then fails:=fails||'rev_mention_notif('||n||'); '; end if;
  select count(*) into n from public.notifications where recipient_id=out_u and type='mention'; if n<>0 then fails:=fails||'out_mention_notif('||n||'); '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',out_u,'role','authenticated')::text, true);
  begin perform public.send_chat_message(room, 'sneak', '{}'); fails:=fails||'nonmember_send_allowed; ';
  exception when others then if sqlerrm not like '%Hanya anggota room%' then fails:=fails||'nonmember_send:'||sqlerrm||'; '; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub',rev,'role','authenticated')::text, true);
  if public.mark_chat_messages_read(room) <> 1 then fails:=fails||'rev_markread_not1; '; end if;
  perform set_config('request.jwt.claims', json_build_object('sub',pic,'role','authenticated')::text, true);
  if public.mark_chat_messages_read(room) <> 0 then fails:=fails||'pic_markread_own; '; end if;

  if fails <> '' then raise exception 'TEST5 mention/chat FAIL: %', fails; end if;
  raise notice 'TEST5 mention/chat PASS';
end $$;
rollback;
