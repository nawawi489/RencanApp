-- Kontrak B-1 score-period-end-nudge (migrasi 0081).
-- Jalankan: docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0081_period_closing_reminder_contract.sql
-- Pola: `begin; do $$..$$; rollback;` per blok. RAISE NOTICE 'PASS' / RAISE EXCEPTION 'FAIL: …'.
-- Fixture standar CI: supabase/tests/_fixtures.sql (org 52b0ebe1-…b70, CEO 11111111-…001).
--
-- T-N-1: tipe 'period_closing_reminder' diterima constraint notifications_type_check.
-- T-N-2: H-7/H-3/H-1 memicu notif; hari lain TIDAK.
-- T-N-3: period_end terlewat → notif "belum difinalisasi", setiap hari.
-- T-N-4: dedupe — dua kali panggil di hari yang sama tetap 1 baris.
-- T-N-5: periode 'closed'/'draft' TIDAK pernah di-nudge.
-- T-N-6: penerima = pemegang manage_score_formula; staff biasa TIDAK menerima.
-- T-N-7: ACL — emitter dicabut dari public/anon/authenticated; is_push_worthy memuat tipe baru.

-- ============================================================ T-N-1: constraint menerima tipe baru
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  fails text := '';
begin
  begin
    insert into public.notifications
      (organization_id, recipient_id, type, entity_type, entity_id, title)
      values (v_org, v_ceo, 'period_closing_reminder', 'period_snapshot', gen_random_uuid(), 'uji');
  exception when check_violation then
    fails := fails || 'constraint menolak tipe baru; ';
  end;
  if fails <> '' then raise exception 'T-N-1 FAIL: %', fails; end if;
  raise notice 'T-N-1 tipe period_closing_reminder diterima PASS';
end $$;
rollback;

-- ============================================================ T-N-2: gate kadens H-7/H-3/H-1
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_today date := public.org_today(v_org);
  v_period uuid;
  v_n int;
  fails text := '';
  d int;
begin
  -- Hari yang HARUS memicu.
  foreach d in array array[7, 3, 1] loop
    delete from public.notifications where type = 'period_closing_reminder';
    update public.period_snapshots set status = 'closed' where organization_id = v_org and status = 'active';
    insert into public.period_snapshots
      (organization_id, period_name, period_start, period_end, status, created_by)
      values (v_org, 'T-N-2 H-' || d, v_today - 30, v_today + d, 'active', v_ceo)
      returning id into v_period;

    perform public.emit_period_closing_reminders();
    select count(*) into v_n from public.notifications
      where type = 'period_closing_reminder' and entity_id = v_period;
    if v_n = 0 then fails := fails || 'H-' || d || '_tidak_memicu; '; end if;
    update public.period_snapshots set status = 'closed' where id = v_period;
  end loop;

  -- Hari yang TIDAK boleh memicu (H-5, H-2).
  foreach d in array array[5, 2] loop
    delete from public.notifications where type = 'period_closing_reminder';
    insert into public.period_snapshots
      (organization_id, period_name, period_start, period_end, status, created_by)
      values (v_org, 'T-N-2 diam H-' || d, v_today - 30, v_today + d, 'active', v_ceo)
      returning id into v_period;

    perform public.emit_period_closing_reminders();
    select count(*) into v_n from public.notifications
      where type = 'period_closing_reminder' and entity_id = v_period;
    if v_n <> 0 then fails := fails || 'H-' || d || '_seharusnya_diam; '; end if;
    update public.period_snapshots set status = 'closed' where id = v_period;
  end loop;

  if fails <> '' then raise exception 'T-N-2 FAIL: %', fails; end if;
  raise notice 'T-N-2 kadens H-7/H-3/H-1 (dan diam di H-5/H-2) PASS';
end $$;
rollback;

-- ============================================================ T-N-3: overdue → notif harian, copy berbeda
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_today date := public.org_today(v_org);
  v_period uuid; v_title text; v_body text; fails text := '';
begin
  update public.period_snapshots set status = 'closed' where organization_id = v_org and status = 'active';
  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'T-N-3 telat', v_today - 40, v_today - 5, 'active', v_ceo)
    returning id into v_period;

  perform public.emit_period_closing_reminders();
  select title, body into v_title, v_body from public.notifications
    where type = 'period_closing_reminder' and entity_id = v_period limit 1;

  if v_title is null then
    fails := fails || 'overdue_tidak_memicu; ';
  else
    if v_title not ilike '%belum difinalisasi%' then
      fails := fails || 'judul_overdue_salah:' || v_title || '; ';
    end if;
    if v_body not ilike '%sudah berakhir 5 hari lalu%' then
      fails := fails || 'body_overdue_salah:' || coalesce(v_body, '(null)') || '; ';
    end if;
  end if;

  if fails <> '' then raise exception 'T-N-3 FAIL: %', fails; end if;
  raise notice 'T-N-3 overdue memicu + copy dibedakan PASS';
end $$;
rollback;

-- ============================================================ T-N-4: dedupe per hari
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_today date := public.org_today(v_org);
  v_period uuid; v_n int; fails text := '';
begin
  update public.period_snapshots set status = 'closed' where organization_id = v_org and status = 'active';
  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'T-N-4 dedupe', v_today - 30, v_today + 3, 'active', v_ceo)
    returning id into v_period;

  -- Tiga kali panggil di hari yang sama (mensimulasikan cron retry / manual run).
  perform public.emit_period_closing_reminders();
  perform public.emit_period_closing_reminders();
  perform public.emit_period_closing_reminders();

  select count(*) into v_n from public.notifications
    where type = 'period_closing_reminder' and entity_id = v_period and recipient_id = v_ceo;
  if v_n <> 1 then fails := fails || 'expected_1_row_got_' || v_n || '; '; end if;

  if fails <> '' then raise exception 'T-N-4 FAIL: %', fails; end if;
  raise notice 'T-N-4 dedupe per hari PASS (1 baris setelah 3x panggil)';
end $$;
rollback;

-- ============================================================ T-N-5: hanya status 'active'
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_today date := public.org_today(v_org);
  v_draft uuid; v_closed uuid; v_n int; fails text := '';
begin
  update public.period_snapshots set status = 'closed' where organization_id = v_org and status = 'active';
  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'T-N-5 draft', v_today - 30, v_today + 3, 'draft', v_ceo)
    returning id into v_draft;
  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, closed_at, created_by)
    values (v_org, 'T-N-5 closed', v_today - 30, v_today + 3, 'closed', now(), v_ceo)
    returning id into v_closed;

  perform public.emit_period_closing_reminders();

  select count(*) into v_n from public.notifications
    where type = 'period_closing_reminder' and entity_id in (v_draft, v_closed);
  if v_n <> 0 then fails := fails || 'draft/closed_ikut_di_nudge:' || v_n || '; '; end if;

  if fails <> '' then raise exception 'T-N-5 FAIL: %', fails; end if;
  raise notice 'T-N-5 draft & closed tidak di-nudge PASS';
end $$;
rollback;

-- ============================================================ T-N-6: penerima = pemegang manage_score_formula
begin;
do $$
declare
  v_org uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_ceo uuid := '11111111-1111-1111-1111-000000000001';
  v_staff uuid := '99999999-0000-0000-0000-00000000ab01';
  v_role_staff uuid;
  v_today date := public.org_today(v_org);
  v_period uuid; v_ceo_n int; v_staff_n int; fails text := '';
begin
  select id into v_role_staff from public.role_templates
    where organization_id = v_org and level = 'staff' limit 1;
  -- organization_id wajib eksplisit sejak 0083 (handle_new_user menolak menebak).
  insert into auth.users (id, raw_app_meta_data)
    values (v_staff, jsonb_build_object('organization_id', v_org))
    on conflict (id) do nothing;
  insert into public.profiles (id, organization_id, role_template_id, full_name)
    values (v_staff, v_org, v_role_staff, 'Staff Tanpa Izin')
    on conflict (id) do update set organization_id = excluded.organization_id,
                                   role_template_id = excluded.role_template_id;

  update public.period_snapshots set status = 'closed' where organization_id = v_org and status = 'active';
  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'T-N-6 penerima', v_today - 30, v_today + 1, 'active', v_ceo)
    returning id into v_period;

  perform public.emit_period_closing_reminders();

  select count(*) into v_ceo_n from public.notifications
    where type = 'period_closing_reminder' and entity_id = v_period and recipient_id = v_ceo;
  select count(*) into v_staff_n from public.notifications
    where type = 'period_closing_reminder' and entity_id = v_period and recipient_id = v_staff;

  if v_ceo_n <> 1 then fails := fails || 'ceo_tidak_menerima:' || v_ceo_n || '; '; end if;
  if v_staff_n <> 0 then fails := fails || 'staff_ikut_menerima:' || v_staff_n || '; '; end if;

  if fails <> '' then raise exception 'T-N-6 FAIL: %', fails; end if;
  raise notice 'T-N-6 penerima tepat (CEO ya, staff tidak) PASS';
end $$;
rollback;

-- ============================================================ T-N-7: ACL + push whitelist
begin;
do $$
declare fails text := '';
begin
  -- Emitter hanya boleh dipanggil cron/postgres.
  if has_function_privilege('authenticated', 'public.emit_period_closing_reminders()', 'EXECUTE') then
    fails := fails || 'authenticated_bisa_panggil_emitter; ';
  end if;
  if has_function_privilege('anon', 'public.emit_period_closing_reminders()', 'EXECUTE') then
    fails := fails || 'anon_bisa_panggil_emitter; ';
  end if;
  -- Tipe baru harus lolos is_push_worthy (fallback, tanpa override org).
  if not public.is_push_worthy('period_closing_reminder', null) then
    fails := fails || 'tipe_baru_tidak_push_worthy; ';
  end if;
  -- Regresi: tipe Fase 1 tidak boleh hilang dari whitelist.
  if not public.is_push_worthy('review_request', null) then
    fails := fails || 'regresi_review_request_hilang; ';
  end if;

  if fails <> '' then raise exception 'T-N-7 FAIL: %', fails; end if;
  raise notice 'T-N-7 ACL emitter + push whitelist PASS';
end $$;
rollback;
