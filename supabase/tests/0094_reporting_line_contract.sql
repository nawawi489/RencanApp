-- Migration 0094 contract test — reporting line (BL-19d bagian 2).
--
-- Yang dijaga di sini, berurut dari yang paling mahal kalau lepas:
--   DB-1  ACL + kolom/FK/index ada, dan FK-nya ON DELETE SET NULL (bukan CASCADE)
--   DB-2  jalur tabel tetap TERTUTUP — `manager_id` tidak boleh membatalkan 0093
--   DB-3  INTI: siklus ditolak, termasuk siklus tak langsung tiga tingkat
--   DB-4  diri sendiri sebagai atasan ditolak
--   DB-5  lintas-org ditolak (dua arah: target maupun atasan)
--   DB-6  atasan nonaktif ditolak
--   DB-7  melepas atasan (null) selalu boleh + tercatat
--   DB-8  menghapus atasan meng-null-kan bawahan, TIDAK menghapus bawahannya
--
-- Fixture constants (supabase/tests/_fixtures.sql):
--   org A = 4b07a19f-550d-4952-b0d8-44f38f651d89, CEO A = ca8c1471-b870-4f09-a149-25e5eae99d6f
--   org B = 52b0ebe1-d8bd-466d-b491-526ee6518b70, CEO B = 11111111-1111-1111-1111-000000000001
--   Keduanya level `ceo` ⇒ `has_permission` lolos tanpa syarat (0041), jadi penolakan
--   lintas-org di bawah terbukti datang dari SCOPE ORG, bukan dari gate permission.
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0094_reporting_line_contract.sql

-- ============================================================ 0094-DB-1: skema + ACL
do $$
declare v_oid oid; v_delrule text; fails text := '';
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='profiles' and column_name='manager_id'
  ) then fails := fails || 'kolom_manager_id_hilang; '; end if;

  -- ON DELETE SET NULL, bukan CASCADE: menghapus atasan tidak boleh ikut menghapus
  -- profil bawahannya. 'a' = NO ACTION, 'c' = CASCADE, 'n' = SET NULL.
  select c.confdeltype into v_delrule
    from pg_constraint c join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = any(c.conkey)
   where n.nspname='public' and t.relname='profiles' and c.contype='f' and a.attname='manager_id'
   limit 1;
  if v_delrule is null then fails := fails || 'fk_manager_id_hilang; ';
  elsif v_delrule <> 'n' then fails := fails || 'fk_bukan_set_null('||v_delrule||'); '; end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='set_reporting_line' limit 1;
  if v_oid is null then fails := fails || 'rpc_hilang; ';
  else
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      fails := fails || 'authenticated_tidak_bisa_execute; '; end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      fails := fails || 'anon_bisa_execute; '; end if;
  end if;

  if fails <> '' then raise exception 'FAIL 0094-DB-1: %', fails; end if;
  raise notice 'PASS 0094-DB-1: kolom + FK SET NULL + RPC authenticated-only';
end $$;

-- ============================================================ 0094-DB-2: jalur tabel tetap tertutup (0093 tidak dibatalkan)
do $$
declare fails text := '';
begin
  -- Kalau `manager_id` kelak "dipermudah" dengan mengembalikan grant/policy update,
  -- eskalasi role yang ditutup 0093 ikut hidup lagi. Assertion ini yang menahannya.
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    fails := fails || 'authenticated_dapat_update_profiles_lagi; ';
  end if;
  if exists (
    select 1 from pg_policy pol join pg_class c on c.oid=pol.polrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='profiles' and pol.polcmd = 'w'
  ) then fails := fails || 'policy_update_profiles_muncul_lagi; '; end if;

  if fails <> '' then raise exception 'FAIL 0094-DB-2: %', fails; end if;
  raise notice 'PASS 0094-DB-2: profiles tetap tanpa jalur UPDATE langsung';
end $$;

-- ============================================================ 0094-DB-3: siklus ditolak (langsung & tiga tingkat)
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  v_mgr uuid; fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values
    (a, jsonb_build_object('organization_id', v_orgA)),
    (b, jsonb_build_object('organization_id', v_orgA)),
    (c, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values
    (a, v_orgA, true), (b, v_orgA, true), (c, v_orgA, true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- rantai sah: a → b → c
  perform public.set_reporting_line(a, b);
  perform public.set_reporting_line(b, c);

  -- siklus LANGSUNG: b melapor ke a padahal a sudah melapor ke b
  begin
    perform public.set_reporting_line(b, a);
    fails := fails || 'siklus_langsung_diterima; ';
  exception when others then
    if sqlerrm not ilike '%melingkar%' then fails := fails || 'pesan_salah_langsung:'||sqlerrm||'; '; end if;
  end;

  -- siklus TAK LANGSUNG tiga tingkat: c melapor ke a (a→b→c→a).
  -- Ini kasus yang lolos kalau penjaganya cuma membandingkan satu tingkat.
  begin
    perform public.set_reporting_line(c, a);
    fails := fails || 'siklus_tiga_tingkat_diterima; ';
  exception when others then
    if sqlerrm not ilike '%melingkar%' then fails := fails || 'pesan_salah_tiga:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  -- rantai sah harus utuh, tidak tersentuh oleh percobaan yang gagal
  select manager_id into v_mgr from public.profiles where id = a;
  if v_mgr is distinct from b then fails := fails || 'rantai_sah_rusak; '; end if;
  select manager_id into v_mgr from public.profiles where id = c;
  if v_mgr is not null then fails := fails || 'c_termutasi_walau_ditolak; '; end if;

  if fails <> '' then raise exception 'FAIL 0094-DB-3: %', fails; end if;
  raise notice 'PASS 0094-DB-3: siklus langsung & tiga tingkat ditolak, rantai sah utuh';
end $$;
rollback;

-- ============================================================ 0094-DB-4: diri sendiri sebagai atasan
begin;
do $$
declare
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_reporting_line(v_ceoA, v_ceoA);
    fails := fails || 'atasan_diri_sendiri_diterima; ';
  exception when others then
    if sqlerrm not ilike '%dirinya sendiri%' then fails := fails || 'pesan_salah:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  if fails <> '' then raise exception 'FAIL 0094-DB-4: %', fails; end if;
  raise notice 'PASS 0094-DB-4: seseorang tidak bisa jadi atasan dirinya sendiri';
end $$;
rollback;

-- ============================================================ 0094-DB-5: lintas-org ditolak dua arah
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_ceoB uuid := '11111111-1111-1111-1111-000000000001';
  v_mgr uuid; fails text := '';
begin
  -- (i) aktor org B mencoba mengatur orang org A
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoB,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_reporting_line(v_ceoA, v_ceoB);
    fails := fails || 'aktor_org_lain_bisa_mengatur; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then fails := fails || 'pesan_salah_i:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  -- (ii) aktor org A menunjuk ATASAN dari org lain — arah yang gampang terlewat,
  -- karena target-nya sah dan hanya calon atasannya yang asing.
  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_reporting_line(v_ceoA, v_ceoB);
    fails := fails || 'atasan_lintas_org_diterima; ';
  exception when others then
    if sqlerrm not ilike '%organisasi yang sama%' then fails := fails || 'pesan_salah_ii:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  select manager_id into v_mgr from public.profiles where id = v_ceoA;
  if v_mgr is not null then fails := fails || 'profil_termutasi_lintas_org; '; end if;

  if fails <> '' then raise exception 'FAIL 0094-DB-5: %', fails; end if;
  raise notice 'PASS 0094-DB-5: lintas-org ditolak baik sebagai target maupun sebagai atasan';
end $$;
rollback;

-- ============================================================ 0094-DB-6: atasan nonaktif ditolak
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  m uuid := gen_random_uuid(); fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values (m, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values (m, v_orgA, false)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = false;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_reporting_line(v_ceoA, m);
    fails := fails || 'atasan_nonaktif_diterima; ';
  exception when others then
    if sqlerrm not ilike '%aktif%' then fails := fails || 'pesan_salah:'||sqlerrm||'; '; end if;
  end;
  execute 'reset role';

  if fails <> '' then raise exception 'FAIL 0094-DB-6: %', fails; end if;
  raise notice 'PASS 0094-DB-6: atasan nonaktif ditolak';
end $$;
rollback;

-- ============================================================ 0094-DB-7: melepas atasan selalu boleh + tercatat
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  s uuid := gen_random_uuid(); v_mgr uuid; n_set int; n_clear int; fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values (s, jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values (s, v_orgA, true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_reporting_line(s, v_ceoA);
  perform public.set_reporting_line(s, null);
  execute 'reset role';

  select manager_id into v_mgr from public.profiles where id = s;
  if v_mgr is not null then fails := fails || 'atasan_tidak_terlepas; '; end if;

  -- Tanpa jalur "lepas", struktur yang salah hanya bisa diperbaiki lewat DB langsung.
  select count(*) into n_set   from public.activity_logs where entity_id = s and action = 'reporting_line_set';
  select count(*) into n_clear from public.activity_logs where entity_id = s and action = 'reporting_line_cleared';
  if n_set   <> 1 then fails := fails || 'set_tidak_tercatat('||n_set||'); '; end if;
  if n_clear <> 1 then fails := fails || 'clear_tidak_tercatat('||n_clear||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0094-DB-7: %', fails; end if;
  raise notice 'PASS 0094-DB-7: atasan bisa dilepas, set & clear sama-sama tercatat';
end $$;
rollback;

-- ============================================================ 0094-DB-8: hapus atasan → bawahan ter-null, BUKAN ikut terhapus
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  boss uuid := gen_random_uuid(); sub uuid := gen_random_uuid();
  n_sub int; v_mgr uuid; fails text := '';
begin
  insert into auth.users (id, raw_app_meta_data) values
    (boss, jsonb_build_object('organization_id', v_orgA)),
    (sub,  jsonb_build_object('organization_id', v_orgA));
  insert into public.profiles (id, organization_id, is_active) values
    (boss, v_orgA, true), (sub, v_orgA, true)
    on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_reporting_line(sub, boss);
  execute 'reset role';

  delete from public.profiles where id = boss;

  -- Kalau FK-nya CASCADE, bawahan ikut lenyap saat atasannya dihapus — kehilangan data
  -- diam-diam yang baru ketahuan jauh belakangan.
  select count(*) into n_sub from public.profiles where id = sub;
  if n_sub <> 1 then fails := fails || 'bawahan_ikut_terhapus; '; end if;
  select manager_id into v_mgr from public.profiles where id = sub;
  if v_mgr is not null then fails := fails || 'manager_id_tidak_ter_null; '; end if;

  if fails <> '' then raise exception 'FAIL 0094-DB-8: %', fails; end if;
  raise notice 'PASS 0094-DB-8: atasan dihapus → bawahan tetap ada dengan manager_id null';
end $$;
rollback;
