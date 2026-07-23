
-- ============================================================================
-- BL-10b (PR-2) — scope `people` (DB-75..DB-80), migrasi 0086
--
-- Gate paling sederhana dari seluruh 14 scope: `organization_id = current_user_org()
-- OR id = auth.uid()`, tanpa permission gate (padanan policy `profiles_select_same_org`,
-- 0001:149-151).
--
-- Ini menutup utang FR-8.5.3 Fase 8, yang mewajibkan minimal 8 entity type termasuk
-- People — yang shipped hanya 7, tanpa catatan keputusan. Perbaikan FR yang meleset,
-- bukan fitur baru.
-- ============================================================================

begin;
do $$
declare
  v_org   uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo   uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_orgB  uuid;
  v_uid   uuid := '9f000000-0000-4000-8000-00000000b10b';
  v_uidB  uuid := '9f000000-0000-4000-8000-00000000b10c';
  fails   text := '';
  n       int;
  got     text;
begin
  -- Aktor uji di org yang SAMA. `raw_app_meta_data.organization_id` WAJIB eksplisit sejak
  -- 0083 — tanpa itu trigger handle_new_user raise dan seluruh blok gagal.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'bl10b.searchable@contoh.test', '', now(),
          jsonb_build_object('organization_id', v_org::text), '{}'::jsonb, now(), now());
  update public.profiles
     set full_name = 'Bl10b Kandidat', position_title = 'Analis Riset Bl10b'
   where id = v_uid;

  -- Aktor di org LAIN, sengaja bernama sama → uji isolasi lintas-org.
  insert into public.organizations (name) values ('bl10b-victim-org') returning id into v_orgB;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  values (v_uidB, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'bl10b.victim@contoh.test', '', now(),
          jsonb_build_object('organization_id', v_orgB::text), '{}'::jsonb, now(), now());
  update public.profiles
     set full_name = 'Bl10b Kandidat', position_title = 'Analis Riset Bl10b'
   where id = v_uidB;

  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- DB-75 — KONTROL POSITIF: cocok lewat full_name
  select count(*) into n from public.search_global('Bl10b Kandidat', array['people'], true, 30, null, null);
  if n <> 1 then
    fails := fails || 'DB-75 people_kontrol_positif_nama(' || n || ' baris, harap 1 — org lain tak boleh ikut); ';
  end if;

  -- DB-76 — cocok lewat position_title juga (§6.3: dua field di-match)
  select count(*) into n from public.search_global('Analis Riset Bl10b', array['people'], true, 30, null, null);
  if n <> 1 then
    fails := fails || 'DB-76 people_kontrol_positif_jabatan(' || n || '); ';
  end if;

  -- DB-77 — proyeksi §6.3: title = full_name, subtitle = position_title,
  -- snippet & parent_id NULL. Diuji satu per satu, bukan "ada baris".
  select title || '|' || coalesce(subtitle,'<nol>') || '|' || coalesce(snippet,'NULL')
         || '|' || coalesce(parent_id::text,'NULL')
    into got
  from public.search_global('Bl10b Kandidat', array['people'], true, 30, null, null);
  if coalesce(got,'') <> 'Bl10b Kandidat|Analis Riset Bl10b|NULL|NULL' then
    fails := fails || 'DB-77 proyeksi_people_salah: [' || coalesce(got,'<nol>') || ']; ';
  end if;

  -- DB-78 — LARANGAN KELUARAN §6.3: `profiles.email` tidak boleh bocor lewat kolom mana pun,
  -- DAN tidak boleh bisa dicari. Email adalah PII yang tidak diminta §38.
  select count(*) into n
  from public.search_global('Bl10b Kandidat', array['people'], true, 30, null, null) t
  where t.title ilike '%@contoh.test%' or coalesce(t.subtitle,'') ilike '%@contoh.test%'
     or coalesce(t.snippet,'') ilike '%@contoh.test%';
  if n <> 0 then fails := fails || 'DB-78 email_bocor_di_proyeksi(' || n || ' baris); '; end if;

  select count(*) into n from public.search_global('bl10b.searchable', array['people'], true, 30, null, null);
  if n <> 0 then fails := fails || 'DB-78 email_dapat_dicari(' || n || ' baris — email bukan field match); '; end if;

  -- DB-79 — self-row: aktor selalu menemukan dirinya sendiri (cabang `id = auth.uid()`)
  execute 'reset role';
  perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.search_global('Bl10b Kandidat', array['people'], true, 30, null, null);
  if n < 1 then fails := fails || 'DB-79 self_row_tidak_ditemukan; '; end if;
  execute 'reset role';

  -- DB-80 — scope `people` ikut saat p_scopes null (sudah dirilis di PR ini)
  perform set_config('request.jwt.claims',
          json_build_object('sub', v_ceo, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n
  from public.search_global('Bl10b Kandidat', null, true, 30, null, null) t
  where t.scope = 'people';
  if n <> 1 then fails := fails || 'DB-80 people_tidak_ikut_saat_scope_null(' || n || '); '; end if;
  execute 'reset role';

  if fails <> '' then
    raise exception 'FAIL 0086-DB-75..80: %', fails;
  end if;
  raise notice 'PASS 0086-DB-75..80: scope people (nama + jabatan, proyeksi §6.3, email tidak bocor & tidak tercari, self-row, scope-null)';
end $$;
rollback;
