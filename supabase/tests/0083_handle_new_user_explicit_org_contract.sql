-- Kontrak BL-14 handle_new_user: penempatan organisasi eksplisit (migrasi 0083).
-- Jalankan: docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0083_handle_new_user_explicit_org_contract.sql
-- Pola: `begin; do $$..$$; rollback;` per blok. RAISE NOTICE 'PASS' / RAISE EXCEPTION 'FAIL: …'.
-- Fixture standar CI: supabase/tests/_fixtures.sql (org 4b07a19f-…d89 + org 52b0ebe1-…b70).
--
-- Blok ini SENGAJA mengandalkan fakta bahwa fixtures membuat DUA org: itulah
-- kondisi yang membuat guard aktif. Kalau suatu saat fixtures kembali ke satu org,
-- T-BL14-1 akan gagal dan memberi tahu bahwa premisnya berubah — bukan lolos diam.
--
-- T-BL14-1: >1 org + tanpa organization_id → INSERT auth.users DITOLAK, nol profil.
-- T-BL14-2: pesan penolakan menyebut sebab DAN perbaikannya.
-- T-BL14-3: organization_id eksplisit → profil mendarat di org itu, bukan org tertua.
-- T-BL14-4: organization_id menunjuk org yang tidak terdaftar → ditolak.
-- T-BL14-5: organization_id bukan UUID → ditolak (tidak fallback diam).
-- T-BL14-6: role_level tetap dihormati bersama organization_id (regresi 0015 F-5).
-- T-BL14-7: single-org tanpa organization_id tetap jalan persis seperti dulu.
-- T-BL14-8: ACL — handle_new_user tetap tercabut dari public/anon/authenticated.

-- ============================================================ T-BL14-1: guard menolak tebakan
begin;
do $$
declare
  v_new  uuid := gen_random_uuid();
  v_orgs bigint;
  n      int;
  fails  text := '';
  raised boolean := false;
begin
  select count(*) into v_orgs from public.organizations;
  if v_orgs < 2 then
    raise exception 'T-BL14-1 PREMIS GAGAL: butuh >1 org (fixtures), dapat %', v_orgs;
  end if;

  begin
    insert into auth.users (id, email) values (v_new, 'bl14-guard@test.local');
  exception when others then
    raised := true;
  end;

  if not raised then fails := fails || 'insert_tanpa_org_id_tidak_ditolak; '; end if;

  select count(*) into n from public.profiles where id = v_new;
  if n <> 0 then fails := fails || 'profil_tetap_dibuat=' || n || '; '; end if;

  if fails <> '' then raise exception 'T-BL14-1 FAIL: %', fails; end if;
  raise notice 'T-BL14-1 guard menolak penempatan otomatis saat >1 org PASS';
end $$;
rollback;

-- ============================================================ T-BL14-2: pesan menyebut sebab + perbaikan
-- Pesan error adalah antarmuka yang dibaca orang dua tahun lagi; kalau ia hanya
-- berbunyi "gagal", guard ini justru menukar satu kegagalan diam dengan satu
-- kegagalan membingungkan. Karena itu isinya dikunci, bukan cuma fakta raise-nya.
begin;
do $$
declare
  v_new uuid := gen_random_uuid();
  v_msg text := '';
  fails text := '';
begin
  begin
    insert into auth.users (id, email) values (v_new, 'bl14-msg@test.local');
  exception when others then
    v_msg := sqlerrm;
  end;

  if v_msg = '' then
    fails := fails || 'tidak_ada_pesan; ';
  else
    -- Sebab: lebih dari satu organisasi.
    if position('organisasi' in lower(v_msg)) = 0 then
      fails := fails || 'pesan_tak_menyebut_sebab; ';
    end if;
    -- Perbaikan: set organization_id secara eksplisit.
    if position('organization_id' in v_msg) = 0 then
      fails := fails || 'pesan_tak_menyebut_organization_id; ';
    end if;
    if position('raw_app_meta_data' in v_msg) = 0 then
      fails := fails || 'pesan_tak_menyebut_raw_app_meta_data; ';
    end if;
  end if;

  if fails <> '' then raise exception 'T-BL14-2 FAIL: % (pesan: %)', fails, v_msg; end if;
  raise notice 'T-BL14-2 pesan menyebut sebab + perbaikan PASS';
end $$;
rollback;

-- ============================================================ T-BL14-3: penempatan eksplisit dihormati
begin;
do $$
declare
  v_shared uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';  -- org TERTUA (epoch)
  v_dcr    uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';  -- BUKAN yang tertua
  v_new    uuid := gen_random_uuid();
  v_org    uuid;
  v_oldest uuid;
  fails    text := '';
begin
  select id into v_oldest from public.organizations order by created_at limit 1;
  if v_oldest <> v_shared then
    raise exception 'T-BL14-3 PREMIS GAGAL: org tertua % bukan org fixtures %', v_oldest, v_shared;
  end if;

  insert into auth.users (id, email, raw_app_meta_data)
    values (v_new, 'bl14-explicit@test.local',
            jsonb_build_object('organization_id', v_dcr));

  select organization_id into v_org from public.profiles where id = v_new;
  if v_org is null then
    fails := fails || 'profil_tak_dibuat; ';
  elsif v_org <> v_dcr then
    fails := fails || 'org_salah=' || v_org || '; ';
  end if;

  if fails <> '' then raise exception 'T-BL14-3 FAIL: %', fails; end if;
  raise notice 'T-BL14-3 organization_id eksplisit menang atas aturan org tertua PASS';
end $$;
rollback;

-- ============================================================ T-BL14-4: org tak terdaftar ditolak
begin;
do $$
declare
  v_new   uuid := gen_random_uuid();
  v_ghost uuid := '00000000-dead-4000-8000-000000000000';
  v_msg   text := '';
  n       int;
  fails   text := '';
begin
  if exists (select 1 from public.organizations where id = v_ghost) then
    raise exception 'T-BL14-4 PREMIS GAGAL: org hantu % ternyata ada', v_ghost;
  end if;

  begin
    insert into auth.users (id, email, raw_app_meta_data)
      values (v_new, 'bl14-ghost@test.local',
              jsonb_build_object('organization_id', v_ghost));
  exception when others then
    v_msg := sqlerrm;
  end;

  if v_msg = '' then fails := fails || 'org_hantu_diterima; '; end if;
  if position('tidak terdaftar' in lower(v_msg)) = 0 then
    fails := fails || 'pesan_tak_jelas; ';
  end if;

  select count(*) into n from public.profiles where id = v_new;
  if n <> 0 then fails := fails || 'profil_tetap_dibuat=' || n || '; '; end if;

  if fails <> '' then raise exception 'T-BL14-4 FAIL: % (pesan: %)', fails, v_msg; end if;
  raise notice 'T-BL14-4 organization_id tak terdaftar ditolak PASS';
end $$;
rollback;

-- ============================================================ T-BL14-5: nilai bukan UUID ditolak
begin;
do $$
declare
  v_new uuid := gen_random_uuid();
  v_msg text := '';
  n     int;
  fails text := '';
begin
  begin
    insert into auth.users (id, email, raw_app_meta_data)
      values (v_new, 'bl14-notuuid@test.local',
              jsonb_build_object('organization_id', 'bukan-uuid'));
  exception when others then
    v_msg := sqlerrm;
  end;

  if v_msg = '' then fails := fails || 'nilai_ngawur_diterima; '; end if;
  if position('uuid' in lower(v_msg)) = 0 then fails := fails || 'pesan_tak_menyebut_uuid; '; end if;

  select count(*) into n from public.profiles where id = v_new;
  if n <> 0 then fails := fails || 'profil_tetap_dibuat=' || n || '; '; end if;

  if fails <> '' then raise exception 'T-BL14-5 FAIL: % (pesan: %)', fails, v_msg; end if;
  raise notice 'T-BL14-5 organization_id non-UUID ditolak PASS';
end $$;
rollback;

-- ============================================================ T-BL14-6: role_level tetap dihormati
-- Regresi terhadap 0015 F-5: menambah cabang org tidak boleh menggeser pemilihan
-- role template. Keduanya dibaca dari app_metadata yang sama.
begin;
do $$
declare
  v_dcr uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_new uuid := gen_random_uuid();
  v_rt  uuid;
  v_lvl text;
  fails text := '';
begin
  insert into auth.users (id, email, raw_app_meta_data)
    values (v_new, 'bl14-ceo@test.local',
            jsonb_build_object('organization_id', v_dcr, 'role_level', 'ceo'));

  select p.role_template_id into v_rt from public.profiles p where p.id = v_new;
  select rt.level into v_lvl from public.role_templates rt where rt.id = v_rt;

  if v_lvl is distinct from 'ceo' then
    fails := fails || 'role_level_diabaikan=' || coalesce(v_lvl, '<null>') || '; ';
  end if;

  if fails <> '' then raise exception 'T-BL14-6 FAIL: %', fails; end if;
  raise notice 'T-BL14-6 role_level tetap dihormati bersama organization_id PASS';
end $$;
rollback;

-- ============================================================ T-BL14-7: single-org tetap jalan
-- Inti keputusan owner: V1 single-org TIDAK BOLEH berubah perilakunya. Diuji dengan
-- menyisakan tepat satu org di dalam transaksi yang di-rollback. Org fixtures dipilih
-- karena ia satu-satunya yang punya set role_templates lengkap.
begin;
do $$
declare
  v_shared uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_new    uuid := gen_random_uuid();
  v_org    uuid;
  v_count  bigint;
  fails    text := '';
  r        record;
begin
  -- Teardown, bukan bagian dari yang diuji. Menghapus org meng-cascade ke 8 tabel
  -- append-only (0013/0014/0020/0021) yang memblokir DELETE lewat
  -- `tg_block_delete_append_only` — jadi "sisakan satu org" mustahil selama trigger
  -- itu terpasang. Trigger dilepas secara data-driven (bukan daftar tabel hardcoded,
  -- yang akan basi begitu tabel append-only ke-9 muncul) dan HANYA di dalam transaksi
  -- ini: DDL di Postgres transaksional, jadi `rollback` di bawah memasangnya kembali.
  -- Catatan untuk pembaca berikutnya: FK-nya sendiri semuanya `cascade`/`set null` —
  -- yang memblokir adalah trigger, bukan constraint.
  for r in
    select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgfoid = 'public.tg_block_delete_append_only()'::regprocedure
      and not t.tgisinternal
  loop
    execute format('drop trigger %I on %I.%I',
                   r.trigger_name, r.schema_name, r.table_name);
  end loop;

  delete from public.organizations where id <> v_shared;

  select count(*) into v_count from public.organizations;
  if v_count <> 1 then
    raise exception 'T-BL14-7 PREMIS GAGAL: sisa org % (harus 1)', v_count;
  end if;

  -- Tanpa organization_id sama sekali — persis pemanggil lama.
  insert into auth.users (id, email) values (v_new, 'bl14-single@test.local');

  select organization_id into v_org from public.profiles where id = v_new;
  if v_org is null then
    fails := fails || 'profil_tak_dibuat_atau_org_null; ';
  elsif v_org <> v_shared then
    fails := fails || 'org_salah=' || v_org || '; ';
  end if;

  if fails <> '' then raise exception 'T-BL14-7 FAIL: %', fails; end if;
  raise notice 'T-BL14-7 single-org tanpa organization_id tetap jalan PASS';
end $$;
rollback;

-- ============================================================ T-BL14-8: ACL tidak bocor
-- 0083 memakai CREATE OR REPLACE justru supaya REVOKE 0003/0066 tetap berlaku.
-- Kalau seseorang menggantinya jadi DROP+CREATE, blok ini yang menangkapnya.
begin;
do $$
declare
  fails text := '';
begin
  if has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE') then
    fails := fails || 'anon_bisa_execute; ';
  end if;
  if has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') then
    fails := fails || 'authenticated_bisa_execute; ';
  end if;
  -- Trigger wajib masih terpasang; DROP ... CASCADE ikut menghapusnya diam-diam.
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
      and t.tgname = 'on_auth_user_created' and not t.tgisinternal
  ) then
    fails := fails || 'trigger_on_auth_user_created_hilang; ';
  end if;

  if fails <> '' then raise exception 'T-BL14-8 FAIL: %', fails; end if;
  raise notice 'T-BL14-8 ACL + trigger tetap utuh PASS';
end $$;
rollback;
