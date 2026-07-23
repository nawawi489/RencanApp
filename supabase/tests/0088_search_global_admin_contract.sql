-- BL-10d (PR-4) — scope audit: `activity_log`, `governance_violation` (DB-96..DB-104).
-- Migrasi 0088. Spec: specs/bl-10-search-scope-38.md §6.3 (diamandemen), FR-10/FR-11.
--
-- KEPUTUSAN OWNER 2026-07-23 (BL10-OQ-05): yang dicocokkan adalah NAMA ENTITAS INDUK yang
-- ditunjuk baris audit, BUKAN `action`/`violation_type`. Alasannya terukur — di DB ini
-- `activity_logs` punya 733 baris tetapi hanya 11 `action` unik, dan `create` sendiri 536
-- (73%). Mencocokkan pada action berarti: mengetik "dibuat" mengembalikan nol (nilainya
-- snake_case), sedangkan mengetik "create" mengembalikan tiga perempat seluruh log.
-- Menaruh peta label Indonesia di SQL juga akan menduplikasi GOVERNANCE_VIOLATION_TYPE_LABEL
-- dan mengembalikan drift yang baru ditutup gate CI BL-13.
--
-- OQ-01 (fail-closed confidential) dan OQ-02 (ikut RLS termasuk self-row) memakai default
-- spec. Keduanya menjadi STRUKTURAL di desain ini: baris yang entitasnya tak dapat diakses
-- gugur sendiri lewat gate per-entitas, bukan lewat filter tambahan yang bisa lupa dipasang.

begin;
do $$
declare
  v_org   uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo   uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal  uuid;
  fails   text := '';
  n       int;
  got     text;
begin
  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_org, 'bl10d Sasaran Audit', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo)
    returning id into v_goal;

  -- Baris audit menunjuk Goal itu. `detail` sengaja memuat penanda unik untuk menguji
  -- bahwa isinya TIDAK bocor dan TIDAK dapat dicari (§6.3 larangan keluaran).
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
    values (v_org, v_ceo, 'goal', v_goal, 'create',
            jsonb_build_object('rahasia', 'bl10d-detail-tidak-boleh-bocor'));

  insert into public.governance_violations (organization_id, user_id, violation_type,
                                            entity_type, entity_id, severity, resolution_note)
    values (v_org, v_ceo, 'self_approval_attempt', 'goal', v_goal, 'high',
            'bl10d-catatan-admin-rahasia');

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-96 — KONTROL POSITIF: ditemukan lewat NAMA ENTITAS INDUK (keputusan OQ-05)
  select count(*) into n from public.search_global('bl10d Sasaran Audit', array['activity_log'], true, 30, null, null);
  if n < 1 then fails := fails || 'DB-96 activity_log_kontrol_positif(' || n || '); '; end if;

  -- DB-97 — TIDAK dapat dicari lewat raw action (keputusan OQ-05: action bukan field match)
  select count(*) into n from public.search_global('create', array['activity_log'], true, 30, null, null);
  if n <> 0 then
    fails := fails || 'DB-97 action_masih_jadi_field_match(' || n || ' baris — OQ-05 dilanggar); ';
  end if;

  -- DB-98 — proyeksi: title = nama entitas, parent_id = entity_id, snippet NULL
  select title || '|' || coalesce(parent_id::text,'NULL') || '|' || coalesce(snippet,'NULL')
    into got
  from public.search_global('bl10d Sasaran Audit', array['activity_log'], true, 30, null, null);
  if coalesce(got,'') <> 'bl10d Sasaran Audit|' || v_goal::text || '|NULL' then
    fails := fails || 'DB-98 proyeksi_activity_log_salah: [' || coalesce(got,'<nol>') || ']; ';
  end if;

  -- DB-99 — `detail` tidak bocor DAN tidak dapat dicari (§6.3)
  select count(*) into n
  from public.search_global('bl10d Sasaran Audit', array['activity_log'], true, 30, null, null) t
  where coalesce(t.subtitle,'') ilike '%rahasia%' or coalesce(t.snippet,'') ilike '%rahasia%'
     or t.title ilike '%rahasia%';
  if n <> 0 then fails := fails || 'DB-99 detail_bocor_di_proyeksi(' || n || '); '; end if;

  select count(*) into n from public.search_global('bl10d-detail-tidak-boleh', array['activity_log'], true, 30, null, null);
  if n <> 0 then fails := fails || 'DB-99 detail_dapat_dicari(' || n || '); '; end if;

  -- DB-100 — governance_violation: kontrol positif lewat nama entitas induk
  select count(*) into n from public.search_global('bl10d Sasaran Audit', array['governance_violation'], true, 30, null, null);
  if n <> 1 then fails := fails || 'DB-100 governance_kontrol_positif(' || n || '); '; end if;

  -- DB-101 — `resolution_note` (catatan admin TENTANG user) tidak bocor & tidak tercari
  select count(*) into n
  from public.search_global('bl10d Sasaran Audit', array['governance_violation'], true, 30, null, null) t
  where coalesce(t.subtitle,'') ilike '%catatan-admin%' or coalesce(t.snippet,'') ilike '%catatan-admin%';
  if n <> 0 then fails := fails || 'DB-101 resolution_note_bocor(' || n || '); '; end if;

  select count(*) into n from public.search_global('bl10d-catatan-admin', array['governance_violation'], true, 30, null, null);
  if n <> 0 then fails := fails || 'DB-101 resolution_note_dapat_dicari(' || n || '); '; end if;

  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0088-DB-96..101: %', fails;
  end if;
  raise notice 'PASS 0088-DB-96..101: scope audit dicocokkan lewat nama entitas induk; action/detail/resolution_note tidak bocor & tidak tercari';
end $$;
rollback;

-- ============================================================================
-- FR-11 fail-closed + FR-10 self-row (DB-102..DB-104)
-- ============================================================================
begin;
do $$
declare
  v_org   uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo   uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_staff uuid := '9f000000-0000-4000-8000-00000000d10d';
  v_goal  uuid;
  v_period uuid;
  fails   text := '';
  n       int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_staff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'bl10d.staff@contoh.test', '', now(),
          jsonb_build_object('organization_id', v_org::text), '{}'::jsonb, now(), now());

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
    values (v_org, 'bl10d Sasaran Kedua', v_ceo, current_date, current_date+30, 'draft', '1', v_ceo)
    returning id into v_goal;

  -- Baris audit milik CEO (bukan milik staff)
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
    values (v_org, v_ceo, 'goal', v_goal, 'update');
  -- Baris audit milik STAFF sendiri
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
    values (v_org, v_staff, 'goal', v_goal, 'update');

  -- DB-102 — FR-11 FAIL-CLOSED: baris audit yang menunjuk entitas TANPA nama/gate
  -- (mis. period_snapshot) dikeluarkan seluruhnya. Diuji lewat entity_id yang tidak ada
  -- di satu pun tabel card — resolusi-lewat-identitas membuat ini gugur otomatis.
  insert into public.period_snapshots (organization_id, period_name, period_start, period_end, status, created_by)
    values (v_org, 'bl10d periode', current_date, current_date+30, 'draft', v_ceo)
    returning id into v_period;
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
    values (v_org, v_ceo, 'period_snapshot', v_period, 'period_closed');

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.search_global('bl10d periode', array['activity_log'], true, 30, null, null);
  if n <> 0 then
    fails := fails || 'DB-102 entitas_tanpa_gate_tidak_fail_closed(' || n || ' baris); ';
  end if;

  execute 'reset role';

  -- ---- FR-10 self-row × OQ-05: batas yang muncul dari tabrakan dua keputusan ----
  --
  -- FR-10 (default owner) menyatakan self-row ikut RLS: staff tanpa permission audit tetap
  -- berhak atas BARIS AUDITNYA SENDIRI. OQ-05 (keputusan owner 2026-07-23) menetapkan yang
  -- dicocokkan dan DITAMPILKAN adalah NAMA ENTITAS INDUK.
  --
  -- Keduanya bertabrakan saat staff punya baris audit atas entitas yang tidak berhak ia
  -- lihat: menampilkan barisnya berarti membocorkan nama entitas itu. Search karena itu
  -- memilih TIDAK BOCOR — gate per-entitas berlaku juga pada cabang self-row.
  --
  -- Konsekuensinya jujur dan harus diketahui: Search BUKAN pengganti layar
  -- /settings-activity-log. Layar itu tidak diubah dan tetap menampilkan self-row apa adanya
  -- (tanpa nama entitas). Yang dipersempit hanyalah permukaan SEARCH.
  perform set_config('request.jwt.claims',
          json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-103 — staff TIDAK melihat baris auditnya sendiri bila entitasnya di luar haknya.
  select count(*) into n from public.search_global('bl10d Sasaran Kedua', array['activity_log'], true, 30, null, null);
  if n <> 0 then
    fails := fails || 'DB-103 nama_entitas_bocor_lewat_self_row(' || n || ' baris); ';
  end if;

  execute 'reset role';

  -- DB-104 — KONTROL POSITIF, supaya DB-103 tidak hijau karena alasan yang salah.
  -- Bila staff MEMANG berhak atas entitasnya (di sini: ia PIC-nya), baris auditnya sendiri
  -- HARUS ketemu meski ia tak punya permission `view_activity_log`. Tanpa blok ini, DB-103
  -- akan tetap hijau pada implementasi yang keliru mematikan seluruh cabang self-row.
  declare v_goal_mine uuid;
  begin
    insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, target_value, created_by)
      values (v_org, 'bl10d Sasaran Milik Staff', v_staff, current_date, current_date+30, 'draft', '1', v_ceo)
      returning id into v_goal_mine;
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action)
      values (v_org, v_staff, 'goal', v_goal_mine, 'update');

    perform set_config('request.jwt.claims',
            json_build_object('sub', v_staff, 'role','authenticated')::text, true);
    execute 'set local role authenticated';

    -- Assertion difilter pada `subtitle` (= `action`), BUKAN count total.
    -- Menyisipkan goal memicu log otomatis ber-action `create`; dan karena `set_config`
    -- bersifat transaction-local, impersonasi dari blok sebelumnya masih aktif saat
    -- penyisipan sehingga log otomatis itu pun ber-`actor_id` staff. Jadi count total di
    -- sini sah bernilai 2, dan assertion `= 1` akan merah karena artefak fixture, bukan
    -- karena perilaku yang salah.
    select count(*) into n
    from public.search_global('bl10d Sasaran Milik Staff', array['activity_log'], true, 30, null, null)
    where subtitle = 'update';
    if n <> 1 then
      fails := fails || 'DB-104 self_row_mati_total(dapat ' || n || ', harap 1 — cabang self-row seharusnya hidup saat entitasnya boleh dilihat); ';
    end if;

    execute 'reset role';
  end;

  if fails <> '' then
    raise exception 'FAIL 0088-DB-102..104: %', fails;
  end if;
  raise notice 'PASS 0088-DB-102..104: FR-11 fail-closed utk entitas tanpa gate + FR-10 self-row (staff lihat miliknya, bukan milik CEO)';
end $$;
rollback;
