-- WS-4 / DCR-05 "Minta Revisi" contract suite (per-block; ROLLBACK_OK = lulus).
-- Pola fase8: set_config('request.jwt.claims',...) utk auth.uid(); user transient in-tx.
-- UUID dev:
--   org  = 4b07a19f-550d-4952-b0d8-44f38f651d89
--   ceo  = ca8c1471-b870-4f09-a149-25e5eae99d6f

-- ============================== BLOCK A — schema: status/action/notif CHECK menerima nilai baru
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_req uuid;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  -- status baru
  insert into public.deadline_change_requests(organization_id, entity_type, entity_id,
    old_deadline, new_deadline, reason, requestor_id, status)
    values (v_org, 'action_plan', gen_random_uuid(), '2026-07-01','2026-07-10','r', v_staff, 'revision_requested')
    returning id into v_req;
  -- action baru
  insert into public.deadline_change_logs(organization_id, request_id, action, actor_id, note)
    values (v_org, v_req, 'revision_requested', v_ceo, 'perlu detail');
  insert into public.deadline_change_logs(organization_id, request_id, action, actor_id, note)
    values (v_org, v_req, 'resubmitted', v_staff, 'new_deadline=2026-07-20; reason=fix');
  -- notif type baru
  insert into public.notifications(organization_id, recipient_id, actor_id, type,
    entity_type, entity_id, title, body)
    values (v_org, v_staff, v_ceo, 'deadline_change_revision_requested',
            'action_plan', gen_random_uuid(), 't', 'b');
  -- reject nilai tak sah
  begin
    insert into public.deadline_change_requests(organization_id, entity_type, entity_id,
      old_deadline, new_deadline, reason, requestor_id, status)
      values (v_org, 'action_plan', gen_random_uuid(), '2026-07-01','2026-07-10','r', v_staff, 'bogus');
    raise exception 'FAIL: status CHECK menerima nilai tak sah';
  exception when check_violation then null; end;
  begin
    insert into public.deadline_change_logs(organization_id, request_id, action, actor_id)
      values (v_org, v_req, 'bogus', v_ceo);
    raise exception 'FAIL: action CHECK menerima nilai tak sah';
  exception when check_violation then null; end;
  raise exception 'ROLLBACK_OK: BlockA passed (status/action/notif CHECK accept + reject bogus)';
end $$;

-- ============================== BLOCK B — index D3 blokir request kedua saat pending/revision
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_ap uuid; v_init uuid;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'B-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'B-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo) returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  perform public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','pertama',null,null);
  -- Kedua saat pending → unique violation
  begin
    perform public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-20','kedua',null,null);
    raise exception 'FAIL: kedua saat pending tidak diblokir';
  exception when unique_violation then null; end;
  -- Ubah manual ke revision_requested (bypass RPC — hanya utk uji index). Kedua tetap harus diblokir.
  update public.deadline_change_requests set status='revision_requested', revision_reason='need'
    where entity_id=v_ap;
  begin
    perform public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-25','ketiga',null,null);
    raise exception 'FAIL: kedua saat revision_requested tidak diblokir';
  exception when unique_violation then null; end;
  raise exception 'ROLLBACK_OK: BlockB passed (index D3 blokir pending+revision_requested)';
end $$;

-- ============================== BLOCK C — review revision_requested happy path + deadline TIDAK berubah
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_ap uuid; v_init uuid; v_dcr uuid;
        v_status text; v_apr uuid; v_rreason text; v_dl date;
        v_log_cnt int; v_notif_cnt int;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'C-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'C-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo) returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','pertama',null,null);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'revision_requested', 'bukti kurang detail');
  select status, approver_id, revision_reason into v_status, v_apr, v_rreason
    from public.deadline_change_requests where id = v_dcr;
  if v_status <> 'revision_requested' then raise exception 'FAIL: status expected revision_requested got %', v_status; end if;
  if v_apr <> v_ceo then raise exception 'FAIL: approver_id expected ceo got %', v_apr; end if;
  if v_rreason <> 'bukti kurang detail' then raise exception 'FAIL: revision_reason mismatch'; end if;
  select deadline into v_dl from public.action_plans where id = v_ap;
  if v_dl <> '2026-07-01' then raise exception 'FAIL: AP deadline berubah tak terduga: %', v_dl; end if;
  select count(*) into v_log_cnt from public.deadline_change_logs
    where request_id = v_dcr and action = 'revision_requested';
  if v_log_cnt <> 1 then raise exception 'FAIL: log revision_requested cnt %', v_log_cnt; end if;
  select count(*) into v_notif_cnt from public.notifications
    where recipient_id = v_staff and type = 'deadline_change_revision_requested';
  if v_notif_cnt <> 1 then raise exception 'FAIL: notif revision_requested cnt %', v_notif_cnt; end if;
  raise exception 'ROLLBACK_OK: BlockC passed (revision branch: set fields+log+notif, deadline stable)';
end $$;

-- ============================== BLOCK D — alasan wajib untuk revision_requested; anti-self semua decision
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_ap uuid; v_init uuid; v_dcr uuid;
        v_viol_cnt int;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'D-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'D-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo) returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','pertama',null,null);
  -- Alasan kosong utk revision_requested → raise
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  begin
    perform public.review_deadline_change(v_dcr, 'revision_requested', '');
    raise exception 'FAIL: alasan kosong tidak ditolak';
  exception when others then if sqlerrm like '%Alasan wajib%' then null; else raise; end if; end;
  -- Anti-self revision oleh requestor (yang juga punya permission — v_ceo tidak; skip permission cek).
  -- Untuk minimal: gunakan v_staff; v_staff bukan reviewer, jadi kena permission wall dulu (per §4 FR-19 note).
  -- Jadi kita cukup validasi: reviewer non-self OK, dan self (v_ceo request+review v_ceo) violasi.
  -- Buat DCR baru dengan requestor=v_ceo (self-review test). Reviewer harus ≠ pic (constraint).
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'D-AP2', v_ceo, '11111111-1111-1111-1111-000000000003', '2026-07-01', 'in_progress', v_ceo)
    returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','self',null,null);
  begin
    perform public.review_deadline_change(v_dcr, 'revision_requested', 'catatan');
    raise exception 'FAIL: anti-self revision_requested tidak ditolak';
  exception when others then if sqlerrm like '%sendiri%' then null; else raise; end if; end;
  -- Catatan: governance_violations insert oleh RPC ikut rollback bersama exception (subtx),
  -- jadi tak diperiksa di sini; pola sama dengan fase8_governance_admin_contract.sql.
  raise exception 'ROLLBACK_OK: BlockD passed (alasan wajib + anti-self revision raise)';
end $$;

-- ============================== BLOCK E — resubmit happy path (UPDATE row sama + clear fields)
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_ap uuid; v_init uuid; v_dcr uuid;
        v_status text; v_apr uuid; v_resp timestamptz; v_rreason text;
        v_reason text; v_newdl date; v_row_cnt int; v_log_cnt int;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'E-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'E-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo) returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','pertama',null,null);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'revision_requested', 'perlu detail');
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  perform public.resubmit_deadline_change_request(v_dcr, '2026-07-20', 'sudah dilengkapi');
  select status, approver_id, responded_at, revision_reason, reason, new_deadline
    into v_status, v_apr, v_resp, v_rreason, v_reason, v_newdl
    from public.deadline_change_requests where id = v_dcr;
  if v_status <> 'pending' then raise exception 'FAIL: status expected pending got %', v_status; end if;
  if v_apr is not null then raise exception 'FAIL: approver_id not cleared'; end if;
  if v_resp is not null then raise exception 'FAIL: responded_at not cleared'; end if;
  if v_rreason is not null then raise exception 'FAIL: revision_reason not cleared'; end if;
  if v_reason <> 'sudah dilengkapi' then raise exception 'FAIL: reason not updated (%)', v_reason; end if;
  if v_newdl <> '2026-07-20' then raise exception 'FAIL: new_deadline not updated (%)', v_newdl; end if;
  -- Baris tetap sama (UPDATE, bukan INSERT baru)
  select count(*) into v_row_cnt from public.deadline_change_requests where entity_id = v_ap;
  if v_row_cnt <> 1 then raise exception 'FAIL: expected 1 DCR row, got %', v_row_cnt; end if;
  select count(*) into v_log_cnt from public.deadline_change_logs where request_id = v_dcr and action = 'resubmitted';
  if v_log_cnt <> 1 then raise exception 'FAIL: log resubmitted cnt %', v_log_cnt; end if;
  raise exception 'ROLLBACK_OK: BlockE passed (resubmit UPDATE same row + clear approver/responded/revision_reason)';
end $$;

-- ============================== BLOCK F — resubmit guards + OQ-9 re-fetch + OQ-8 terminal
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_other uuid; v_ap uuid; v_init uuid; v_dcr uuid;
begin
  v_staff := gen_random_uuid(); v_other := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into auth.users(id) values (v_other);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'F-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'F-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo) returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','pertama',null,null);
  -- Status guard: pending → resubmit ditolak
  begin
    perform public.resubmit_deadline_change_request(v_dcr, '2026-07-20', 'r');
    raise exception 'FAIL: resubmit saat pending tidak diblokir';
  exception when others then if sqlerrm like '%perlu revisi%' then null; else raise; end if; end;
  -- Reviewer minta revisi
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  perform public.review_deadline_change(v_dcr, 'revision_requested', 'detail');
  -- Non-requestor (v_other) → ditolak
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role','authenticated')::text, true);
  begin
    perform public.resubmit_deadline_change_request(v_dcr, '2026-07-20', 'r');
    raise exception 'FAIL: non-requestor resubmit tidak diblokir';
  exception when others then if sqlerrm like '%pengaju%' then null; else raise; end if; end;
  -- OQ-9 re-fetch: geser AP deadline (via bypass) ke 2026-07-25; resubmit dgn 2026-07-20 (< actual) harus gagal.
  perform set_config('app.allow_deadline_update', 'true', true);
  update public.action_plans set deadline = '2026-07-25' where id = v_ap;
  perform set_config('app.allow_deadline_update', 'false', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  begin
    perform public.resubmit_deadline_change_request(v_dcr, '2026-07-20', 'r');
    raise exception 'FAIL: OQ-9 re-fetch tidak jalan (harusnya banding vs 2026-07-25)';
  exception when others then if sqlerrm like '%lebih awal%' then null; else raise; end if; end;
  -- OQ-8: set AP terminal → resubmit ditolak
  perform set_config('app.allow_deadline_update', 'true', true);
  update public.action_plans set status = 'done' where id = v_ap;
  perform set_config('app.allow_deadline_update', 'false', true);
  begin
    perform public.resubmit_deadline_change_request(v_dcr, '2026-07-30', 'r');
    raise exception 'FAIL: OQ-8 terminal AP tidak diblokir (resubmit)';
  exception when others then if sqlerrm like '%terminal%' then null; else raise; end if; end;
  raise exception 'ROLLBACK_OK: BlockF passed (status guard + non-requestor + OQ-9 re-fetch + OQ-8 terminal)';
end $$;

-- ============================== BLOCK G — OQ-8 guard di review (approve/revision saat AP terminal)
do $$
declare v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
        v_ceo uuid := '11111111-1111-1111-1111-000000000001';
        v_staff uuid; v_ap uuid; v_init uuid; v_dcr uuid;
begin
  v_staff := gen_random_uuid();
  insert into auth.users(id) values (v_staff);
  insert into public.initiatives(organization_id, name, status, pic_id, created_by)
    values (v_org, 'G-Init', 'active', v_ceo, v_ceo) returning id into v_init;
  insert into public.action_plans(organization_id, initiative_id, name, pic_id, reviewer_id, deadline, status, created_by)
    values (v_org, v_init, 'G-AP', v_staff, v_ceo, '2026-07-01', 'in_progress', v_ceo) returning id into v_ap;
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  v_dcr := public.create_deadline_change_request(v_ap, '2026-07-01','2026-07-15','ok',null,null);
  -- Set AP terminal
  perform set_config('app.allow_deadline_update', 'true', true);
  update public.action_plans set status = 'done' where id = v_ap;
  perform set_config('app.allow_deadline_update', 'false', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  begin
    perform public.review_deadline_change(v_dcr, 'approved', null);
    raise exception 'FAIL: approve saat AP terminal tidak diblokir';
  exception when others then if sqlerrm like '%terminal%' then null; else raise; end if; end;
  begin
    perform public.review_deadline_change(v_dcr, 'revision_requested', 'detail');
    raise exception 'FAIL: revision_requested saat AP terminal tidak diblokir';
  exception when others then if sqlerrm like '%terminal%' then null; else raise; end if; end;
  -- Tolak tetap diperbolehkan (bukan modifikasi state AP)
  perform public.review_deadline_change(v_dcr, 'rejected', 'AP sudah selesai');
  raise exception 'ROLLBACK_OK: BlockG passed (OQ-8 blok approve+revision, rejected tetap boleh)';
end $$;
