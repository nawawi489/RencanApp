-- BL-10c (PR-3) — scope turunan: `task_instance`, `comment`, `evidence` (DB-81..DB-96).
-- Migrasi 0087. Spec: specs/bl-10-search-scope-38.md §6.3/§6.4, FR-8/FR-12.
--
-- Pola harness sama dengan 0085: `begin;` / `do $$ … $$;` / `rollback;` — penjelasan
-- lengkap ada di kepala 0085_search_global_contract.sql. Blok ini menyemai SELURUH
-- datanya sendiri; jangan pernah bergantung pada data ambient (pelajaran BL-10a Wave 4).

begin;
do $$
declare
  v_org   uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo   uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid; v_task uuid; v_ti uuid;
  v_sub_ok uuid; v_sub_draft uuid;
  fails  text := '';
  n      int;
  got    text;
begin
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_org, 'bl10c goal', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, v_goal, 'bl10c strategy', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, pic_id, status, created_by)
    values (v_org, v_strat, 'bl10c initiative', v_ceo, 'draft', v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, status, created_by)
    values (v_org, v_init, 'bl10c action plan', v_ceo, 'draft', v_ceo) returning id into v_ap;
  insert into public.tasks (organization_id, action_plan_id, name, pic_id, status, created_by)
    values (v_org, v_ap, 'bl10c Tugas Induk', v_ceo, 'assigned', v_ceo) returning id into v_task;

  -- `task_instances.repeat_rule_id` NOT NULL, jadi aturan repeat-nya ikut disemai.
  declare v_rule uuid;
  begin
    insert into public.task_repeat_rules (organization_id, task_id, frequency,
                                          repeat_start_date, repeat_end_date,
                                          time_of_day, missed_rule)
      values (v_org, v_task, 'daily', current_date, current_date + 30, '17:00', 'strict')
      returning id into v_rule;

    insert into public.task_instances (organization_id, task_id, repeat_rule_id, instance_date, instance_time,
                                       deadline_at, pic_id, status, missed_reason)
      values (v_org, v_task, v_rule, current_date, '17:00', now() + interval '1 day', v_ceo, 'missed',
              'bl10c alasan terlewat unik')
      returning id into v_ti;
  end;

  insert into public.comments (organization_id, entity_type, entity_id, author_id, body)
    values (v_org, 'task', v_task, v_ceo, 'bl10c komentar pada tugas');
  -- literal WARISAN pra-0045 yang masih sah tersimpan; dispatch harus menanganinya.
  insert into public.comments (organization_id, entity_type, entity_id, author_id, body)
    values (v_org, 'action_plan', v_task, v_ceo, 'bl10c komentar literal warisan');

  insert into public.task_submissions (task_id, task_instance_id, version_number, submitted_by, status)
    values (v_task, v_ti, 1, v_ceo, 'submitted') returning id into v_sub_ok;
  insert into public.task_submissions (task_id, task_instance_id, version_number, submitted_by, status)
    values (v_task, v_ti, 2, v_ceo, 'draft') returning id into v_sub_draft;

  insert into public.evidence_files (submission_id, kind, file_name, text_content, storage_path, url, uploaded_by)
    values (v_sub_ok, 'file', 'bl10c-laporan-akhir.pdf', 'bl10c isi catatan bukti',
            'rahasia/bl10c/path.pdf', 'https://rahasia.example/bl10c', v_ceo);

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- ---------- task_instance (DB-81..84) ----------
  -- DB-81 — cocok lewat NAMA TASK INDUK (§6.3: instance tak punya kolom teks sendiri)
  select count(*) into n from public.search_global('bl10c Tugas Induk', array['task_instance'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-81 instance_via_nama_task_induk(' || n || '); '; end if;

  -- DB-82 — cocok lewat missed_reason
  select count(*) into n from public.search_global('alasan terlewat unik', array['task_instance'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-82 instance_via_missed_reason(' || n || '); '; end if;

  -- DB-83 — proyeksi §6.3: title = nama Task induk, parent_id = task_id, snippet = missed_reason
  select title || '|' || coalesce(parent_id::text,'NULL') || '|' || coalesce(snippet,'NULL')
    into got
  from public.search_global('alasan terlewat unik', array['task_instance'], true, 30, null, null);
  if coalesce(got,'') <> 'bl10c Tugas Induk|' || v_task::text || '|bl10c alasan terlewat unik' then
    fails := fails || 'DB-83 proyeksi_instance_salah: [' || coalesce(got,'<nol>') || ']; ';
  end if;

  -- ---------- comment (DB-85..88) ----------
  -- DB-85 — cocok lewat body
  select count(*) into n from public.search_global('bl10c komentar pada tugas', array['comment'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-85 komentar_via_body(' || n || '); '; end if;

  -- DB-86 — literal WARISAN `action_plan` ikut tertangani (§6.4 tabel dispatch statis).
  -- Kalau dispatch memakai daftar yang hanya memuat nama pasca-rename, baris ini hilang diam-diam.
  select count(*) into n from public.search_global('komentar literal warisan', array['comment'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-86 literal_warisan_action_plan_hilang(' || n || '); '; end if;

  -- DB-87 — proyeksi: parent_id = entity_id, snippet = body
  select coalesce(parent_id::text,'NULL') || '|' || coalesce(snippet,'NULL') into got
  from public.search_global('bl10c komentar pada tugas', array['comment'], true, 30, null, null);
  if coalesce(got,'') <> v_task::text || '|bl10c komentar pada tugas' then
    fails := fails || 'DB-87 proyeksi_komentar_salah: [' || coalesce(got,'<nol>') || ']; ';
  end if;

  -- DB-88 — `map_legacy_entity_type` DILARANG di jalur search (§6.4). Diuji atas prosrc
  -- yang komentarnya dilucuti (§9.5 Concern #2).
  if (select regexp_replace(regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g'),
                            '/\*.*?\*/', '', 'gs')
      from pg_proc where proname = 'search_global') ilike '%map_legacy_entity_type%' then
    fails := fails || 'DB-88 memakai_map_legacy_entity_type(dilarang §6.4); ';
  end if;

  -- ---------- evidence (DB-89..93) ----------
  -- DB-89 — cocok lewat file_name
  select count(*) into n from public.search_global('bl10c-laporan-akhir', array['evidence'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-89 bukti_via_file_name(' || n || '); '; end if;

  -- DB-90 — cocok lewat text_content
  select count(*) into n from public.search_global('isi catatan bukti', array['evidence'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-90 bukti_via_text_content(' || n || '); '; end if;

  -- DB-91 — LARANGAN KELUARAN §6.3: `storage_path` dan `url` tidak boleh bocor DI KOLOM MANA PUN
  select count(*) into n
  from public.search_global('bl10c-laporan-akhir', array['evidence'], true, 30, null, null) t
  where t.title ilike '%rahasia%' or coalesce(t.subtitle,'') ilike '%rahasia%'
     or coalesce(t.snippet,'') ilike '%rahasia%';
  if n <> 0 then fails := fails || 'DB-91 storage_path_atau_url_bocor(' || n || '); '; end if;

  -- DB-92 — dan tidak boleh BISA DICARI
  select count(*) into n from public.search_global('rahasia/bl10c', array['evidence'], true, 30, null, null);
  if n <> 0 then fails := fails || 'DB-92 storage_path_dapat_dicari(' || n || '); '; end if;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0087-DB-81..92: %', fails;
  end if;
  raise notice 'PASS 0087-DB-81..92: task_instance (nama induk + missed_reason + proyeksi), comment (body + literal warisan + dispatch statis), evidence (file_name + text_content + storage_path/url tidak bocor & tidak tercari)';
end $$;
rollback;

-- ============================================================================
-- FR-12 / BL10-OQ-03 — aturan bukti berstatus `draft` (DB-93..DB-95)
--
-- Default spec DISAHKAN owner 2026-07-23: bukti tercari bila submission
-- `status <> 'draft'` ATAU `submitted_by = auth.uid()`.
--
-- Blok terpisah karena butuh DUA aktor: pemilik draft dan orang lain yang sama-sama
-- berhak atas Task-nya. Satu aktor saja tidak dapat membuktikan aturan ini — ia hanya
-- menunjukkan "draft terlihat", tanpa memisahkan sebabnya (status vs kepemilikan).
-- ============================================================================
begin;
do $$
declare
  v_org   uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo   uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_other uuid := '9f000000-0000-4000-8000-00000000c10c';
  v_goal uuid; v_strat uuid; v_init uuid; v_ap uuid; v_task uuid;
  v_sub_mine uuid; v_sub_theirs uuid;
  fails text := '';
  n     int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'bl10c.other@contoh.test', '', now(),
          jsonb_build_object('organization_id', v_org::text), '{}'::jsonb, now(), now());

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_org, 'bl10c-d goal', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo) returning id into v_goal;
  insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
    values (v_org, v_goal, 'bl10c-d strategy', v_ceo, current_date, current_date+30, 'draft', v_ceo) returning id into v_strat;
  insert into public.initiatives (organization_id, strategy_id, name, pic_id, status, created_by)
    values (v_org, v_strat, 'bl10c-d initiative', v_ceo, 'draft', v_ceo) returning id into v_init;
  insert into public.action_plans (organization_id, initiative_id, name, pic_id, status, created_by)
    values (v_org, v_init, 'bl10c-d action plan', v_ceo, 'draft', v_ceo) returning id into v_ap;
  -- Aktor kedua dijadikan REVIEWER Task ini. Tanpa itu `can_access_task` menolaknya lebih
  -- dulu, dan DB-95 akan hijau-palsu karena alasan yang salah: bukan "draft orang lain
  -- tersembunyi", melainkan "aktor tidak berhak atas Task-nya sama sekali". Kontrol
  -- simetris hanya bermakna bila KEDUA aktor sama-sama berhak atas Task-nya.
  insert into public.tasks (organization_id, action_plan_id, name, pic_id, reviewer_id, status, created_by)
    values (v_org, v_ap, 'bl10c-d Tugas', v_ceo, v_other, 'assigned', v_ceo) returning id into v_task;

  -- draft milik CEO, dan draft milik orang lain — keduanya di Task yang sama
  insert into public.task_submissions (task_id, version_number, submitted_by, status)
    values (v_task, 1, v_ceo, 'draft') returning id into v_sub_mine;
  insert into public.task_submissions (task_id, version_number, submitted_by, status)
    values (v_task, 2, v_other, 'draft') returning id into v_sub_theirs;

  insert into public.evidence_files (submission_id, kind, file_name, uploaded_by)
    values (v_sub_mine, 'file', 'bl10cdraft milikku.pdf', v_ceo);
  insert into public.evidence_files (submission_id, kind, file_name, uploaded_by)
    values (v_sub_theirs, 'file', 'bl10cdraft punya orang.pdf', v_other);

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-93 — draft SENDIRI ditemukan (cabang `submitted_by = auth.uid()`)
  select count(*) into n from public.search_global('bl10cdraft milikku', array['evidence'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-93 draft_sendiri_tidak_ditemukan(' || n || '); '; end if;

  -- DB-94 — draft ORANG LAIN TIDAK ditemukan, meski Task-nya sama-sama dapat diakses.
  -- Inilah setengah aturan yang membuat FR-12 bermakna; tanpa ini DB-93 hanya membuktikan
  -- "draft terlihat", bukan "draft terlihat KARENA milik sendiri".
  select count(*) into n from public.search_global('bl10cdraft punya orang', array['evidence'], true, 30, null, null);
  if n <> 0 then fails := fails || 'DB-94 draft_orang_lain_bocor(' || n || ' baris — FR-12 dilanggar); '; end if;

  execute 'reset role';

  -- DB-95 — dari sisi pemilik yang lain, arahnya terbalik: ia menemukan draft-nya sendiri
  -- dan TIDAK menemukan milik CEO. Kontrol simetris; tanpa ini aturan bisa lolos dengan
  -- implementasi yang kebetulan hanya menyembunyikan baris kedua.
  perform set_config('request.jwt.claims',
          json_build_object('sub', v_other, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.search_global('bl10cdraft punya orang', array['evidence'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-95 pemilik_lain_tidak_menemukan_draftnya(' || n || '); '; end if;
  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0087-DB-93..95: %', fails;
  end if;
  raise notice 'PASS 0087-DB-93..95: FR-12 bukti draft — hanya pemiliknya, diuji simetris dua arah';
end $$;
rollback;
