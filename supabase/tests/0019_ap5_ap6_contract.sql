-- EMS V1.8.1 — Contract suite UI-S-AP5 (file upload) + UI-S-AP6 (KPI Area linkage).
-- Pola: jwt claims + set local role authenticated + ROLLBACK. Seed sebagai postgres dulu
-- (INSERT pada action_plan_* di-revoke dari authenticated oleh 0005). 'ALL PASS' = lolos.
--
-- 10 invarian yang dibuktikan (per addendum §7.2 TDD plan):
--   T1 PIC create_submission_draft sukses pada AP Fase 4 dgn kandidat KPI Area tersedia.
--   T2 Non-PIC dipanggil create_submission_draft → raise 'Hanya PIC'.
--      (Catatan: log_governance_violation tercatat SAAT eksekusi tapi akan ter-rollback bersama
--      raise — limitasi tanpa autonomous tx, preseden Fase 7 OQ-1.)
--   T3 OD-1 Fase 1 fallback (initiative.strategy_id NULL) → 0 kandidat → submit_action_plan
--      menerima result_values=[] tanpa raise "Nilai Hasil wajib".
--   T4 kpi_area_id mismatch (UUID acak bukan kandidat) → raise + (log tercatat ephemeral spt T2).
--   T5 previous_value_text SERVER-COMPUTED dari VIEW kpi_area_current_values (ER-8 anti-TOCTOU):
--      sub-1 numeric=120 approved; sub-2 finalize → previous_value_text='120'.
--   T6 Pending double-submit reject: review_status='pending' → create_submission_draft kedua raise.
--   T7 Cap 5 attachment di create_submission_draft (OD-2): count=6 → raise.
--   T8 log_governance_violation execute oleh authenticated → permission denied (ER-7).
--   T9 Storage INSERT path[2]=AP yang user-nya REVIEWER (bukan PIC) → policy menolak
--      (ER-3 anti-Reviewer-file-injection). Via direct insert into storage.objects (RLS gate).
--   T10 cleanup_orphan_upload(): pre-finalize (status='draft') sukses delete; post-finalize
--      (status='submitted') raise 'evidence locking'. (ER-4)
--
-- Konstanta dev (project fhnqwytqprsptjshoxfn): org=4b07a19f-550d-4952-b0d8-44f38f651d89

begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_pic uuid := '99999999-1111-0000-0000-aaaa00000001';
  v_reviewer uuid := '99999999-1111-0000-0000-aaaa00000002';
  v_other uuid := '99999999-1111-0000-0000-aaaa00000003';
  v_goal uuid := '99999999-1111-0000-0000-bbbb00000001';
  v_kpi uuid := '99999999-1111-0000-0000-bbbb00000002';
  v_strategy uuid := '99999999-1111-0000-0000-bbbb00000003';
  v_initiative_f4 uuid := '99999999-1111-0000-0000-cccc00000001';
  v_initiative_f1 uuid := '99999999-1111-0000-0000-cccc00000002';
  v_ap_f4 uuid := '99999999-1111-0000-0000-dddd00000001';
  v_ap_f1 uuid := '99999999-1111-0000-0000-dddd00000002';
  fails text := '';
  v_draft_id uuid;
  v_old_sub_id uuid := '99999999-1111-0000-0000-eeee00000001';
  v_draft2_id uuid;
  v_draft_for_t10 uuid := '99999999-1111-0000-0000-eeee00000099';
  v_path text;
  v_path_post text;
  v_prev text;
  n int;
begin
  -- Seed (privileged, postgres bypasses RLS).
  insert into auth.users(id) values (v_pic),(v_reviewer),(v_other) on conflict (id) do nothing;
  insert into public.profiles(id, organization_id, full_name, is_active) values
    (v_pic, v_org, 'PIC Test', true),
    (v_reviewer, v_org, 'Reviewer Test', true),
    (v_other, v_org, 'Other Test', true)
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    full_name = excluded.full_name,
    is_active = true;

  insert into public.goals(id, organization_id, name, status, period_start, period_end, created_by)
    values (v_goal, v_org, 'Goal-Test', 'active', '2026-01-01', '2026-12-31', v_pic);
  insert into public.kpi_areas(id, organization_id, goal_id, name, target, status, created_by)
    values (v_kpi, v_org, v_goal, 'KPI-Test', '1000', 'active', v_pic);
  insert into public.strategies(id, organization_id, kpi_area_id, name, status, created_by)
    values (v_strategy, v_org, v_kpi, 'Strategy-Test', 'active', v_pic);
  insert into public.initiatives(id, organization_id, strategy_id, name, status, created_by) values
    (v_initiative_f4, v_org, v_strategy, 'Initiative-F4', 'active', v_pic),
    (v_initiative_f1, v_org, NULL,       'Initiative-F1', 'active', v_pic); -- Fase 1: strategy_id NULL

  insert into public.action_plans(id, organization_id, initiative_id, name, pic_id, reviewer_id,
    status, evidence_required, result_value_required, review_required, repeat_setting, created_by) values
    (v_ap_f4, v_org, v_initiative_f4, 'AP-F4', v_pic, v_reviewer, 'in_progress', false, true, true, 'one_time', v_pic),
    (v_ap_f1, v_org, v_initiative_f1, 'AP-F1', v_pic, v_reviewer, 'in_progress', false, true, true, 'one_time', v_pic);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pic::text, 'role','authenticated')::text, true);

  -- T1
  begin
    v_draft_id := public.create_submission_draft(v_ap_f4, 1);
    if v_draft_id is null then fails := fails || 'T1_null; '; end if;
  exception when others then fails := fails || 'T1:' || sqlerrm || '; '; end;

  -- T7
  begin perform public.create_submission_draft(v_ap_f4, 6); fails := fails || 'T7_no_exc; ';
  exception when others then if sqlerrm not ilike '%5%' then fails := fails || 'T7_msg:' || sqlerrm || '; '; end if; end;

  -- T8
  begin perform public.log_governance_violation(v_pic, 'test', 'action_plan', v_ap_f4, 'medium', '{}'::jsonb);
    fails := fails || 'T8_no_exc; ';
  exception when insufficient_privilege then null;
  when others then if sqlerrm not ilike '%permission denied%' then fails := fails || 'T8_msg:' || sqlerrm || '; '; end if; end;

  -- T3
  select count(*) into n from public.list_kpi_area_candidates_for_action_plan(v_ap_f1);
  if n <> 0 then fails := fails || format('T3_kandidat:%s; ', n); end if;
  begin v_draft2_id := public.create_submission_draft(v_ap_f1, 0);
  exception when others then fails := fails || 'T3_draft:' || sqlerrm || '; '; end;
  begin perform public.submit_action_plan(v_draft2_id, 'note', '[]'::jsonb, '[]'::jsonb);
  exception when others then fails := fails || 'T3_finalize:' || sqlerrm || '; '; end;

  -- T2 (v_other = non-PIC)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_other::text, 'role','authenticated')::text, true);
  begin perform public.create_submission_draft(v_ap_f4, 1); fails := fails || 'T2_non_pic_ok; ';
  exception when others then if sqlerrm not ilike '%PIC%' then fails := fails || 'T2_msg:' || sqlerrm || '; '; end if; end;

  -- T4 (back to PIC; mismatch KPI Area)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pic::text, 'role','authenticated')::text, true);
  begin perform public.submit_action_plan(v_draft_id, 'mismatch', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('kpi_area_id','99999999-9999-9999-9999-999999999999',
      'label','bogus','value_type','number','value_text','10','value_numeric','10')));
    fails := fails || 'T4_no_exc; ';
  exception when others then if sqlerrm not ilike '%KPI Area%' then fails := fails || 'T4_msg:' || sqlerrm || '; '; end if; end;

  -- T5: setup approved sub#1 dgn nilai 120, lalu finalize draft dgn nilai 145.
  -- previous_value_text harus = '120' (server-computed dari VIEW kpi_area_current_values).
  reset role;
  insert into public.action_plan_submissions(id, action_plan_id, version_number, submitted_by, status, review_status, reviewed_at)
    values (v_old_sub_id, v_ap_f4, 99, v_pic, 'submitted', 'approved', now());
  insert into public.action_plan_result_values(submission_id, kpi_area_id, label, value_type, value_text, value_numeric)
    values (v_old_sub_id, v_kpi, 'old', 'number', '120', 120);
  select numeric_total::text into v_prev from public.kpi_area_current_values where kpi_area_id = v_kpi;
  if v_prev is distinct from '120' then fails := fails || format('T5_view:%s; ', v_prev); end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pic::text, 'role','authenticated')::text, true);
  begin perform public.submit_action_plan(v_draft_id, 'submit ke kpi', '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('kpi_area_id', v_kpi::text,
      'label','baru','value_type','number','value_text','145','value_numeric','145')));
  exception when others then fails := fails || 'T5_finalize:' || sqlerrm || '; '; end;
  reset role;
  select previous_value_text into v_prev
    from public.action_plan_result_values where submission_id = v_draft_id and kpi_area_id = v_kpi;
  if v_prev is distinct from '120' then fails := fails || format('T5_prev:%s; ', v_prev); end if;

  -- T6: reset AP status agar gate yang trigger adalah 'pending review' (bukan status check).
  update public.action_plans set status='in_progress' where id = v_ap_f4;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pic::text, 'role','authenticated')::text, true);
  begin perform public.create_submission_draft(v_ap_f4, 0); fails := fails || 'T6_no_exc; ';
  exception when others then
    if sqlerrm not ilike '%review%' and sqlerrm not ilike '%pending%' and sqlerrm not ilike '%berjalan%' then
      fails := fails || 'T6_msg:' || sqlerrm || '; ';
    end if;
  end;

  -- T9: Reviewer try INSERT storage object pada path AP-F4 (Reviewer ≠ PIC).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_reviewer::text, 'role','authenticated')::text, true);
  v_path := v_org::text || '/' || v_ap_f4::text || '/draft-xxxx/uuid-file.pdf';
  begin insert into storage.objects(bucket_id, name, owner) values ('evidence', v_path, v_reviewer);
    fails := fails || 'T9_reviewer_insert_ok; ';
  exception when insufficient_privilege then null;
  when others then if sqlerrm not ilike '%row-level%' and sqlerrm not ilike '%permission%' then
    fails := fails || 'T9_msg:' || sqlerrm || '; '; end if; end;

  -- T10: cleanup pre-finalize OK; cleanup post-finalize REJECT.
  reset role;
  update public.action_plan_submissions set review_status = 'approved'
    where action_plan_id = v_ap_f4 and review_status = 'pending';
  insert into public.action_plan_submissions(id, action_plan_id, version_number, submitted_by, status, review_status)
    values (v_draft_for_t10, v_ap_f4, 100, v_pic, 'draft', 'pending');
  v_path := v_org::text || '/' || v_ap_f4::text || '/' || v_draft_for_t10::text || '/pre.pdf';
  v_path_post := v_org::text || '/' || v_ap_f4::text || '/' || v_draft_for_t10::text || '/post.pdf';
  insert into storage.objects(bucket_id, name, owner) values ('evidence', v_path, v_pic);
  insert into storage.objects(bucket_id, name, owner) values ('evidence', v_path_post, v_pic);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pic::text, 'role','authenticated')::text, true);

  begin perform public.cleanup_orphan_upload(v_path);
  exception when others then fails := fails || 'T10_pre:' || sqlerrm || '; '; end;
  reset role;
  if exists (select 1 from storage.objects where bucket_id='evidence' and name = v_path) then
    fails := fails || 'T10_pre_still_exists; ';
  end if;

  update public.action_plan_submissions set status = 'submitted' where id = v_draft_for_t10;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_pic::text, 'role','authenticated')::text, true);
  begin perform public.cleanup_orphan_upload(v_path_post);
    fails := fails || 'T10_post_no_exc; ';
  exception when others then
    if sqlerrm not ilike '%final%' and sqlerrm not ilike '%locking%' then
      fails := fails || 'T10_post_msg:' || sqlerrm || '; ';
    end if;
  end;
  reset role;
  if not exists (select 1 from storage.objects where bucket_id='evidence' and name = v_path_post) then
    fails := fails || 'T10_post_deleted; ';
  end if;

  if fails = '' then raise notice 'ALL PASS';
  else raise exception '%', fails;
  end if;
end;
$$;
rollback;
