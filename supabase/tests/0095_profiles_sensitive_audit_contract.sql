-- Migration 0095 contract test — jejak audit kolom sensitif `profiles`.
--
-- Yang dijaga, berurut dari yang paling mahal kalau lepas:
--   DB-1  trigger ada, AFTER UPDATE, dan fungsinya SECURITY DEFINER
--   DB-2  INTI: perubahan role tercatat dengan level lama→baru dan penanda `self`
--   DB-3  perpindahan org tercatat ke organisasi LAMA (batas yang dilanggar)
--   DB-4  is_active tercatat
--   DB-5  satu UPDATE yang mengubah tiga kolom sekaligus → tiga baris, bukan satu
--   DB-6  perubahan `full_name` TIDAK mencatat apa pun (hasil, bukan mekanismenya)
--   DB-7  aktor tanpa baris profil tidak menggagalkan UPDATE (guard FK actor_id)
--   DB-8  0093 tidak dibatalkan: profiles tetap tanpa jalur UPDATE untuk authenticated
--   DB-9  menghapus organisasi tidak digagalkan oleh trigger ini (guard FK organization_id)
--
-- Fixture: org A = 4b07a19f-550d-4952-b0d8-44f38f651d89 (supabase/tests/_fixtures.sql).
-- Trigger diuji lewat UPDATE langsung sebagai superuser — itu SATU-SATUNYA cara menguji
-- jaring pengaman ini, karena justru jalur langsung itulah yang tidak punya jejak sendiri.
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0095_profiles_sensitive_audit_contract.sql

-- ============================================================ 0095-DB-1: struktur trigger
do $$
declare v_secdef boolean; v_timing text; fails text := '';
begin
  -- Bit `2` = TRIGGER_TYPE_BEFORE. JANGAN pakai bit `1` — itu TRIGGER_TYPE_ROW, yang
  -- menyala untuk setiap trigger FOR EACH ROW dan membuat trigger AFTER terbaca "BEFORE".
  select p.prosecdef, case when t.tgtype & 2 = 2 then 'BEFORE' else 'AFTER' end
    into v_secdef, v_timing
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
   where n.nspname = 'public' and c.relname = 'profiles'
     and t.tgname = 'profiles_audit_sensitive' and not t.tgisinternal;

  if v_secdef is null then
    fails := fails || 'trigger_tidak_ada; ';
  else
    -- SECURITY DEFINER wajib: jejak audit yang bisa dimatikan oleh pihak yang diaudit
    -- (karena ia tak punya hak tulis ke activity_logs) bukan jejak audit.
    if not v_secdef then fails := fails || 'fungsi_bukan_security_definer; '; end if;
    if v_timing <> 'AFTER' then fails := fails || 'trigger_bukan_after('||v_timing||'); '; end if;
  end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-1: %', fails; end if;
  raise notice 'PASS 0095-DB-1: trigger AFTER UPDATE + fungsi SECURITY DEFINER';
end $$;

-- ============================================================ 0095-DB-2: perubahan role tercatat
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_staff_tpl uuid := '06771d3b-8d83-442d-a343-1d6248c43f53';
  v_ceo_tpl   uuid := '4b07ce00-0000-0000-0000-0000000000ce';
  u uuid := gen_random_uuid();
  v_detail jsonb; n int; fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values (u, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, role_template_id, is_active)
    values (u, v_orgA, v_staff_tpl, true)
    on conflict (id) do update set organization_id = excluded.organization_id,
                                   role_template_id = excluded.role_template_id;

  update public.profiles set role_template_id = v_ceo_tpl where id = u;

  select count(*) into n from public.activity_logs
   where entity_id = u and action = 'profile_role_changed';
  if n <> 1 then fails := fails || 'jumlah_baris_salah('||n||'); '; end if;

  select detail into v_detail from public.activity_logs
   where entity_id = u and action = 'profile_role_changed' limit 1;

  -- Level lama→baru wajib ikut: tanpa itu jejaknya hanya berisi UUID template dan
  -- pembaca harus menebak apakah perubahannya naik atau turun.
  if v_detail->>'from_level' <> 'staff' then fails := fails || 'from_level_salah; '; end if;
  if v_detail->>'to_level'   <> 'ceo'   then fails := fails || 'to_level_salah; ';   end if;
  if v_detail->>'from_role_template_id' is null then fails := fails || 'from_id_hilang; '; end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-2: %', fails; end if;
  raise notice 'PASS 0095-DB-2: perubahan role tercatat lengkap dengan level lama→baru';
end $$;
rollback;

-- ============================================================ 0095-DB-3: perpindahan org dicatat ke org LAMA
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_orgB uuid;
  u uuid := gen_random_uuid();
  v_log_org uuid; v_detail jsonb; fails text := '';
begin
  insert into public.organizations (name) values ('DB3-org-tujuan') returning id into v_orgB;
  insert into auth.users (id, raw_app_meta_data) values (u, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values (u, v_orgA, true)
    on conflict (id) do update set organization_id = excluded.organization_id;

  update public.profiles set organization_id = v_orgB where id = u;

  select organization_id, detail into v_log_org, v_detail
    from public.activity_logs where entity_id = u and action = 'profile_org_changed' limit 1;

  -- Dicatat ke org LAMA: org itulah batas yang dilanggar, dan RLS activity_logs org-scoped
  -- berarti mencatat ke org BARU membuat jejaknya hanya terlihat oleh pihak yang pindah.
  if v_log_org is distinct from v_orgA then fails := fails || 'tidak_dicatat_ke_org_lama; '; end if;
  if (v_detail->>'to_organization_id')::uuid is distinct from v_orgB then
    fails := fails || 'tujuan_tidak_tercatat; ';
  end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-3: %', fails; end if;
  raise notice 'PASS 0095-DB-3: perpindahan org tercatat ke organisasi lama + tujuan terekam';
end $$;
rollback;

-- ============================================================ 0095-DB-4: is_active tercatat
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  u uuid := gen_random_uuid(); n int; fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values (u, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values (u, v_orgA, false)
    on conflict (id) do update set is_active = false;

  update public.profiles set is_active = true where id = u;

  select count(*) into n from public.activity_logs
   where entity_id = u and action = 'profile_active_changed'
     and detail->>'to_is_active' = 'true';
  if n <> 1 then fails := fails || 'reaktivasi_tidak_tercatat('||n||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-4: %', fails; end if;
  raise notice 'PASS 0095-DB-4: perubahan is_active tercatat';
end $$;
rollback;

-- ============================================================ 0095-DB-5: tiga kolom sekaligus → tiga baris
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo_tpl uuid := '4b07ce00-0000-0000-0000-0000000000ce';
  v_orgB uuid; u uuid := gen_random_uuid(); n int; fails text := '';
begin
  insert into public.organizations (name) values ('DB5-org') returning id into v_orgB;
  insert into auth.users (id, raw_app_meta_data) values (u, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values (u, v_orgA, true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  -- Serangan nyata mengubah beberapa kolom dalam SATU pernyataan. Kalau trigger hanya
  -- mencatat satu peristiwa gabungan, dua perubahan lain hilang dari jejak.
  update public.profiles
     set role_template_id = v_ceo_tpl, organization_id = v_orgB, is_active = false
   where id = u;

  select count(*) into n from public.activity_logs where entity_id = u
     and action in ('profile_role_changed','profile_org_changed','profile_active_changed');
  if n <> 3 then fails := fails || 'harusnya_3_baris_dapat('||n||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-5: %', fails; end if;
  raise notice 'PASS 0095-DB-5: satu UPDATE tiga kolom → tiga baris audit terpisah';
end $$;
rollback;

-- ============================================================ 0095-DB-6: full_name TIDAK memicu audit
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  u uuid := gen_random_uuid(); n int; fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values (u, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, full_name, is_active)
    values (u, v_orgA, 'Nama Lama', true)
    on conflict (id) do update set full_name = 'Nama Lama';

  update public.profiles set full_name = 'Nama Baru' where id = u;

  -- `update_own_profile` adalah jalur tulis paling sering dipakai. Kalau ganti nama ikut
  -- membanjiri activity_logs, jejak yang benar-benar penting tenggelam di antaranya.
  --
  -- Ini menguji HASIL, bukan mekanismenya. Terbukti saat red-check: mencabut klausa `WHEN`
  -- saja TIDAK memerahkan assertion ini, karena guard `is distinct from` di badan fungsi
  -- masih menahan. Keduanya harus dicabut supaya menyala. Itu memang yang diinginkan —
  -- assertion ini bertahan bila kelak filternya dipindah antara `WHEN` dan badan fungsi;
  -- `WHEN` adalah optimasi (tidak membangunkan fungsi sama sekali), bukan sumber kebenaran.
  select count(*) into n from public.activity_logs where entity_id = u
     and action in ('profile_role_changed','profile_org_changed','profile_active_changed');
  if n <> 0 then fails := fails || 'ganti_nama_ikut_tercatat('||n||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-6: %', fails; end if;
  raise notice 'PASS 0095-DB-6: perubahan full_name tidak membangunkan trigger audit';
end $$;
rollback;

-- ============================================================ 0095-DB-7: aktor tanpa profil tidak menggagalkan UPDATE
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceo_tpl uuid := '4b07ce00-0000-0000-0000-0000000000ce';
  u uuid := gen_random_uuid(); v_hantu uuid := gen_random_uuid();
  v_actor uuid; v_role uuid; fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values (u, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values (u, v_orgA, true)
    on conflict (id) do update set organization_id = excluded.organization_id;

  -- auth.uid() menunjuk user TANPA baris profil. `activity_logs.actor_id` ber-FK ke
  -- profiles, jadi tanpa guard EXISTS insert audit melanggar FK dan MEMBATALKAN update
  -- yang sah — trigger audit tidak boleh jadi penyebab kegagalan operasi normal.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_hantu, 'role', 'authenticated')::text, true);
  update public.profiles set role_template_id = v_ceo_tpl where id = u;
  perform set_config('request.jwt.claims', null, true);

  select role_template_id into v_role from public.profiles where id = u;
  if v_role is distinct from v_ceo_tpl then fails := fails || 'update_gagal_karena_trigger; '; end if;

  select actor_id into v_actor from public.activity_logs
   where entity_id = u and action = 'profile_role_changed' limit 1;
  if v_actor is not null then fails := fails || 'actor_hantu_tidak_di_null_kan; '; end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-7: %', fails; end if;
  raise notice 'PASS 0095-DB-7: aktor tanpa profil → actor_id null, update tetap berhasil';
end $$;
rollback;

-- ============================================================ 0095-DB-8: 0093 tidak dibatalkan
do $$
declare fails text := '';
begin
  -- Trigger ini menambah PENGAWASAN, bukan mengembalikan jalur tulis. Kalau kelak ada yang
  -- mengira "sudah ada audit, jadi UPDATE langsung boleh dibuka lagi", assertion ini yang
  -- menahannya — eskalasi role yang ditutup 0093 akan hidup lagi seketika.
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    fails := fails || 'authenticated_dapat_update_profiles_lagi; ';
  end if;
  if exists (
    select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles' and pol.polcmd = 'w'
  ) then fails := fails || 'policy_update_profiles_muncul_lagi; '; end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-8: %', fails; end if;
  raise notice 'PASS 0095-DB-8: profiles tetap tanpa jalur UPDATE langsung untuk authenticated';
end $$;

-- ============================================================ 0095-DB-9: hapus organisasi tidak digagalkan trigger
begin;
do $$
declare
  v_org uuid; u uuid := gen_random_uuid(); n_profil int; v_org_after uuid; fails text := '';
begin
  insert into public.organizations (name) values ('DB9-org-akan-dihapus') returning id into v_org;
  insert into auth.users (id, raw_app_meta_data) values (u, jsonb_build_object('organization_id', v_org));
  insert into public.profiles (id, organization_id, is_active) values (u, v_org, true)
    on conflict (id) do update set organization_id = excluded.organization_id;

  -- `profiles.organization_id` ber-`on delete set null`, jadi menghapus organisasi memicu
  -- UPDATE pada profiles DI DALAM transaksi penghapusan — trigger audit menyala dengan
  -- `old.organization_id` menunjuk baris yang sudah lenyap. Tanpa guard EXISTS, insert
  -- audit melanggar FK dan membatalkan seluruh penghapusan.
  -- Regresi nyata: ditemukan kontrak 0083 (T-BL14-7), bukan oleh review.
  begin
    delete from public.organizations where id = v_org;
  exception when others then
    fails := fails || 'hapus_org_digagalkan_trigger:' || sqlerrm || '; ';
  end;

  select count(*) into n_profil from public.profiles where id = u;
  if n_profil <> 1 then fails := fails || 'profil_ikut_hilang; '; end if;
  select organization_id into v_org_after from public.profiles where id = u;
  if v_org_after is not null then fails := fails || 'org_tidak_di_null_kan; '; end if;

  if fails <> '' then raise exception 'FAIL 0095-DB-9: %', fails; end if;
  raise notice 'PASS 0095-DB-9: hapus organisasi tetap berhasil, profil ter-null bukan terhapus';
end $$;
rollback;
