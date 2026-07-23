-- Migration 0093 contract test — jalur tulis Profil / Organisasi / Goal (BL-19c).
--
-- Yang dijaga di sini, berurut dari yang paling mahal kalau lepas:
--   • ESKALASI HAK AKSES. 0093 mencabut GRANT tulis `profiles` dari authenticated
--     dan MENGHAPUS policy `profiles_update_self`. Sebelum itu, satu UPDATE biasa
--     pada baris sendiri cukup untuk mengganti `role_template_id` jadi CEO. RLS
--     tidak punya granularitas kolom, jadi tidak ada bentuk policy yang menutupnya —
--     penutupnya adalah ketiadaan grant. Kalau ada yang "mengembalikan" grant atau
--     policy self-update di kemudian hari, DB-2/DB-3 memerah.
--   • Kolom yang boleh berubah lewat RPC tetap sempit. `update_own_profile` hanya
--     `full_name`; itu satu-satunya pengganti batasan kolom yang hilang bersama RLS.
--   • Periode & target Goal terkunci setelah aktivasi (keputusan owner 2026-07-23) —
--     keduanya dasar perhitungan skor. Ditolak eksplisit, bukan diabaikan diam-diam.
--   • Batas org tidak membocorkan keberadaan baris (anti-oracle), pola sama dengan
--     0092-DB-6.
--
-- Pattern: `raise notice 'PASS'` on success, `raise exception 'FAIL: ...'` on failure.
-- Fixture constants (supabase/tests/_fixtures.sql):
--   org A = 4b07a19f-550d-4952-b0d8-44f38f651d89, CEO A = ca8c1471-b870-4f09-a149-25e5eae99d6f
--   org B = 52b0ebe1-d8bd-466d-b491-526ee6518b70, CEO B = 11111111-1111-1111-1111-000000000001
--   staff org B         = 11111111-1111-1111-1111-000000000003 (level `staff`)
--   role template Staff org A = 06771d3b-8d83-442d-a343-1d6248c43f53
--   CEO ⇒ `has_permission(...)` lolos tanpa syarat (0041), jadi blok lintas-org
--   membuktikan penolakan datang dari SCOPE ORG, bukan dari gate permission.
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0093_self_service_write_paths_contract.sql

-- ============================================================ 0093-DB-1: ACL ketiga fungsi baru
do $$
declare
  v_fns text[] := array['update_own_profile', 'update_organization', 'update_goal'];
  v_fn text; v_oid oid; fails text := '';
begin
  foreach v_fn in array v_fns loop
    select p.oid into v_oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn
     limit 1;
    if v_oid is null then fails := fails || v_fn || '_not_found; '; continue; end if;
    if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      fails := fails || v_fn || '_authenticated_cannot_execute; ';
    end if;
    -- `revoke ... from public` saja tidak cukup dibaca sebagai bukti: `anon` bisa
    -- mewarisi lewat PUBLIC kalau grant-nya tertinggal ([[anon-public-rpc-grant-gotcha]]).
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      fails := fails || v_fn || '_anon_can_execute; ';
    end if;
  end loop;
  if fails <> '' then raise exception 'FAIL 0093-DB-1: %', fails; end if;
  raise notice 'PASS 0093-DB-1: update_own_profile + update_organization + update_goal — authenticated only';
end $$;

-- ============================================================ 0093-DB-2: grant tulis `profiles` dicabut, policy self-update hilang
do $$
declare
  v_tbl oid := 'public.profiles'::regclass;
  n_policy int; fails text := '';
begin
  -- SELECT harus TETAP ada — mencabutnya akan mematikan seluruh aplikasi, jadi
  -- assertion ini juga menjaga perbaikan tidak kebablasan.
  if not has_table_privilege('authenticated', v_tbl, 'SELECT') then
    fails := fails || 'authenticated_lost_select; ';
  end if;
  if has_table_privilege('authenticated', v_tbl, 'UPDATE') then fails := fails || 'authenticated_can_update; '; end if;
  -- INSERT/DELETE ikut dicabut walau saat ini sudah tertolak karena tidak ada policy:
  -- grant tanpa policy adalah ranjau — policy yang ditambahkan nanti langsung hidup
  -- dengan kewenangan penuh.
  if has_table_privilege('authenticated', v_tbl, 'INSERT') then fails := fails || 'authenticated_can_insert; '; end if;
  if has_table_privilege('authenticated', v_tbl, 'DELETE') then fails := fails || 'authenticated_can_delete; '; end if;
  if has_table_privilege('anon', v_tbl, 'UPDATE')          then fails := fails || 'anon_can_update; ';          end if;

  -- service_role WAJIB tetap bisa menulis: Edge Function `create-user` bergantung
  -- padanya, dan BYPASSRLS bukan pengganti GRANT ([[service-role-revoke-gotcha]]).
  if not has_table_privilege('service_role', 'public.profiles'::regclass, 'UPDATE') then
    fails := fails || 'service_role_lost_update; ';
  end if;

  select count(*) into n_policy from pg_policies
   where schemaname = 'public' and tablename = 'profiles' and cmd in ('UPDATE', 'ALL');
  if n_policy <> 0 then fails := fails || 'update_policy_still_present('||n_policy||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-2: %', fails; end if;
  raise notice 'PASS 0093-DB-2: authenticated hanya SELECT di profiles; nol policy UPDATE; service_role utuh';
end $$;

-- ============================================================ 0093-DB-3: eskalasi hak akses lewat UPDATE langsung DITOLAK
-- Inti BL-19c. Ketiga varian ini berjalan di DB dev sebelum 0093.
begin;
do $$
declare
  v_staffB uuid := '11111111-1111-1111-1111-000000000003';
  v_ceo_tpl uuid := '52b0ce00-0000-0000-0000-0000000000ce';  -- template CEO org B
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_tpl_after uuid; v_org_after uuid; v_active_after boolean;
  fails text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',v_staffB,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- (a) menaikkan level sendiri: `has_permission()` bertumpu pada `role_template_id`.
  begin
    execute format('update public.profiles set role_template_id = %L where id = %L', v_ceo_tpl, v_staffB);
    fails := fails || 'privilege_escalation_allowed; ';
  exception when insufficient_privilege then null;
           when others then fails := fails || 'unexpected_errcode_a:' || sqlstate || '; ';
  end;

  -- (b) pindah organisasi: menembus isolasi multi-tenant yang jadi alasan 0083 ada.
  begin
    execute format('update public.profiles set organization_id = %L where id = %L', v_orgA, v_staffB);
    fails := fails || 'tenant_hop_allowed; ';
  exception when insufficient_privilege then null;
           when others then fails := fails || 'unexpected_errcode_b:' || sqlstate || '; ';
  end;

  -- (c) menghidupkan kembali akun yang sengaja dinonaktifkan admin.
  begin
    execute format('update public.profiles set is_active = true where id = %L', v_staffB);
    fails := fails || 'self_reactivation_allowed; ';
  exception when insufficient_privilege then null;
           when others then fails := fails || 'unexpected_errcode_c:' || sqlstate || '; ';
  end;

  execute 'reset role';

  select role_template_id, organization_id, is_active
    into v_tpl_after, v_org_after, v_active_after
    from public.profiles where id = v_staffB;
  if v_tpl_after = v_ceo_tpl then fails := fails || 'role_template_mutated; '; end if;
  if v_org_after = v_orgA    then fails := fails || 'organization_mutated; ';  end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-3: %', fails; end if;
  raise notice 'PASS 0093-DB-3: role_template_id / organization_id / is_active tidak bisa disetel sendiri';
end $$;
rollback;

-- ============================================================ 0093-DB-4: update_own_profile hanya menyentuh full_name
begin;
do $$
declare
  v_staffB uuid := '11111111-1111-1111-1111-000000000003';
  v_tpl_before uuid; v_org_before uuid; v_email_before text;
  v_name text; v_tpl uuid; v_org uuid; v_email text; n_log int;
  fails text := '';
begin
  select role_template_id, organization_id, email
    into v_tpl_before, v_org_before, v_email_before
    from public.profiles where id = v_staffB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_staffB,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.update_own_profile('  Nama Baru DB4  ');
  execute 'reset role';

  select full_name, role_template_id, organization_id, email
    into v_name, v_tpl, v_org, v_email
    from public.profiles where id = v_staffB;

  -- Trim dilakukan RPC, bukan klien: nama ber-spasi pinggir sudah pernah lolos ke DB.
  if v_name <> 'Nama Baru DB4' then fails := fails || 'name_not_saved_or_not_trimmed:' || coalesce(v_name,'<null>') || '; '; end if;
  -- Daftar kolom di RPC adalah satu-satunya pengganti batasan kolom yang hilang
  -- bersama policy. Kalau ia melebar, tidak ada lapisan lain yang menahannya.
  if v_tpl   is distinct from v_tpl_before   then fails := fails || 'role_template_touched; ';  end if;
  if v_org   is distinct from v_org_before   then fails := fails || 'organization_touched; ';   end if;
  if v_email is distinct from v_email_before then fails := fails || 'email_touched; ';          end if;

  select count(*) into n_log from public.activity_logs
   where entity_id = v_staffB and action = 'profile_updated';
  if n_log <> 1 then fails := fails || 'not_logged('||n_log||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-4: %', fails; end if;
  raise notice 'PASS 0093-DB-4: hanya full_name berubah (ter-trim), tercatat di activity log';
end $$;
rollback;

-- ============================================================ 0093-DB-5: validasi nama — kosong & terlalu panjang ditolak
begin;
do $$
declare
  v_staffB uuid := '11111111-1111-1111-1111-000000000003';
  v_before text; v_after text;
  fails text := '';
begin
  select full_name into v_before from public.profiles where id = v_staffB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_staffB,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- Whitespace-only, bukan sekadar string kosong: `trim` di RPC ada justru supaya
  -- nama "   " tidak lolos jadi nama tak terlihat di seluruh UI.
  begin
    perform public.update_own_profile('   ');
    fails := fails || 'blank_name_accepted; ';
  exception when others then
    if sqlerrm not ilike '%wajib diisi%' then fails := fails || 'wrong_msg_blank:' || sqlerrm || '; '; end if;
  end;

  begin
    perform public.update_own_profile(repeat('x', 121));
    fails := fails || 'overlong_name_accepted; ';
  exception when others then
    if sqlerrm not ilike '%120 karakter%' then fails := fails || 'wrong_msg_long:' || sqlerrm || '; '; end if;
  end;

  -- Batas atas persis harus DITERIMA — off-by-one di sini menolak nama yang sah.
  perform public.update_own_profile(repeat('y', 120));
  execute 'reset role';

  select full_name into v_after from public.profiles where id = v_staffB;
  if v_after <> repeat('y', 120) then fails := fails || 'boundary_120_rejected; '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-5: %', fails; end if;
  raise notice 'PASS 0093-DB-5: nama kosong/>120 ditolak, tepat 120 diterima';
end $$;
rollback;

-- ============================================================ 0093-DB-6: update_organization — gate permission, bukan sekadar login
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_staffB uuid := '11111111-1111-1111-1111-000000000003';
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_name text; v_tz text; v_nameB text; n_log int;
  fails text := '';
begin
  select name into v_nameB from public.organizations where id = v_orgB;

  perform set_config('request.jwt.claims', json_build_object('sub',v_staffB,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.update_organization('Diambil Alih Staff', 'Asia/Jakarta');
    fails := fails || 'staff_allowed_to_update_org; ';
  exception when others then
    if sqlerrm not ilike '%tidak berwenang%' then fails := fails || 'wrong_msg_staff:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';

  select name into v_name from public.organizations where id = v_orgB;
  if v_name is distinct from v_nameB then fails := fails || 'org_mutated_by_staff; '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.update_organization('  Org DB6  ', 'Asia/Makassar');
  execute 'reset role';

  select name, timezone into v_name, v_tz from public.organizations where id = v_orgA;
  if v_name <> 'Org DB6'        then fails := fails || 'name_not_saved:' || coalesce(v_name,'<null>') || '; '; end if;
  if v_tz   <> 'Asia/Makassar'  then fails := fails || 'tz_not_saved:'   || coalesce(v_tz,'<null>')   || '; '; end if;

  select count(*) into n_log from public.activity_logs
   where entity_id = v_orgA and action = 'organization_updated';
  if n_log <> 1 then fails := fails || 'not_logged('||n_log||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-6: %', fails; end if;
  raise notice 'PASS 0093-DB-6: staff ditolak & baris utuh; CEO tersimpan + tercatat';
end $$;
rollback;

-- ============================================================ 0093-DB-7: zona waktu divalidasi katalog, penolakan tidak menyimpan separuh
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_name_before text; v_tz_before text; v_name text; v_tz text;
  fails text := '';
begin
  select name, timezone into v_name_before, v_tz_before from public.organizations where id = v_orgA;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    -- Zona tak dikenal menggeser deadline SELURUH organisasi lewat `org_today()`,
    -- dan gejalanya angka yang salah — bukan error. Karena itu divalidasi terhadap
    -- katalog Postgres, bukan daftar hardcoded yang ikut basi.
    perform public.update_organization('Nama Ikut Terkirim', 'Mars/Olympus_Mons');
    fails := fails || 'unknown_timezone_accepted; ';
  exception when others then
    if sqlerrm not ilike '%Zona waktu tidak dikenal%' then fails := fails || 'wrong_msg_tz:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';

  select name, timezone into v_name, v_tz from public.organizations where id = v_orgA;
  -- Nama dikirim di panggilan yang sama; kalau ia tersimpan padahal zona ditolak,
  -- pemanggil melihat error sambil separuh datanya sudah berubah.
  if v_name is distinct from v_name_before then fails := fails || 'partial_write_name; '; end if;
  if v_tz   is distinct from v_tz_before    then fails := fails || 'partial_write_tz; ';   end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-7: %', fails; end if;
  raise notice 'PASS 0093-DB-7: zona tak dikenal ditolak, nol tulisan parsial';
end $$;
rollback;

-- ============================================================ 0093-DB-8: Goal aktif — periode & target TERKUNCI, nama/PIC boleh
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_name text; v_ps date; v_target text; n_log int;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, period_start, period_end, target_value, created_by)
  values (v_orgA, 'DB8 goal', 'active', date '2026-01-01', date '2026-12-31', '100', v_ceoA)
  returning id into v_goal;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';

  -- Keduanya dasar perhitungan skor: menggesernya setelah skor dihitung membuat
  -- angka historis tidak konsisten dengan periodenya.
  begin
    perform public.update_goal(v_goal, 'DB8 goal', null, null, date '2026-02-01', date '2026-12-31', '100');
    fails := fails || 'period_change_allowed_on_active; ';
  exception when others then
    if sqlerrm not ilike '%Periode Goal terkunci%' then fails := fails || 'wrong_msg_period:' || sqlerrm || '; '; end if;
  end;

  begin
    perform public.update_goal(v_goal, 'DB8 goal', null, null, date '2026-01-01', date '2026-12-31', '250');
    fails := fails || 'target_change_allowed_on_active; ';
  exception when others then
    if sqlerrm not ilike '%Target Goal terkunci%' then fails := fails || 'wrong_msg_target:' || sqlerrm || '; '; end if;
  end;

  -- Penolakan di atas TIDAK boleh ikut mengunci yang memang boleh berubah.
  perform public.update_goal(v_goal, 'DB8 nama baru', 'deskripsi', v_ceoA,
                             date '2026-01-01', date '2026-12-31', '100');
  execute 'reset role';

  select name, period_start, target_value into v_name, v_ps, v_target
    from public.goals where id = v_goal;
  if v_name   <> 'DB8 nama baru'  then fails := fails || 'name_not_saved; ';   end if;
  if v_ps     <> date '2026-01-01' then fails := fails || 'period_mutated; ';   end if;
  if v_target <> '100'             then fails := fails || 'target_mutated; ';   end if;

  -- `fields` yang berubah ikut dicatat: pergantian PIC menggeser atribusi skor,
  -- jadi "Goal diubah" saja tidak cukup untuk menelusuri kenapa angka bergeser.
  select count(*) into n_log from public.activity_logs
   where entity_id = v_goal and action = 'update'
     and detail -> 'fields' ? 'pic_id';
  if n_log <> 1 then fails := fails || 'pic_change_not_in_log('||n_log||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-8: %', fails; end if;
  raise notice 'PASS 0093-DB-8: periode+target ditolak eksplisit di Goal aktif; nama/PIC tersimpan + tercatat';
end $$;
rollback;

-- ============================================================ 0093-DB-9: Goal draft — periode & target masih boleh berubah
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_goal uuid; v_ps date; v_target text;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, period_start, period_end, target_value, created_by)
  values (v_orgA, 'DB9 goal', 'draft', date '2026-01-01', date '2026-12-31', '100', v_ceoA)
  returning id into v_goal;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.update_goal(v_goal, 'DB9 goal', null, null, date '2026-03-01', date '2026-09-30', '250');

  -- Kontrol positif untuk DB8: kalau kunci periode terpasang di cabang yang salah,
  -- draft ikut terkunci dan tidak ada yang memberi tahu.
  begin
    perform public.update_goal(v_goal, 'DB9 goal', null, null, date '2026-09-30', date '2026-03-01', '250');
    fails := fails || 'inverted_period_accepted; ';
  exception when others then
    if sqlerrm not ilike '%tidak boleh mendahului%' then fails := fails || 'wrong_msg_order:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';

  select period_start, target_value into v_ps, v_target from public.goals where id = v_goal;
  if v_ps     <> date '2026-03-01' then fails := fails || 'draft_period_not_saved; '; end if;
  if v_target <> '250'             then fails := fails || 'draft_target_not_saved; '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-9: %', fails; end if;
  raise notice 'PASS 0093-DB-9: draft bebas ubah periode/target; periode terbalik tetap ditolak';
end $$;
rollback;

-- ============================================================ 0093-DB-10: update_goal lintas-org — ditolak tanpa jadi oracle
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_ceoB uuid := '11111111-1111-1111-1111-000000000001';
  v_goal uuid; v_name text;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, created_by)
  values (v_orgA, 'DB10 goal', 'draft', v_ceoA) returning id into v_goal;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoB,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.update_goal(v_goal, 'Diambil Alih', null, null, null, null, null);
    fails := fails || 'cross_org_update_allowed; ';
  exception when others then
    -- Anti-oracle: pesannya "Goal tidak ditemukan", BUKAN "tidak berwenang".
    -- Yang kedua akan mengonfirmasi bahwa Goal milik org lain itu ada.
    if sqlerrm not ilike '%Goal tidak ditemukan%' then
      fails := fails || 'leaky_or_wrong_msg:' || sqlerrm || '; ';
    end if;
  end;
  execute 'reset role';

  select name into v_name from public.goals where id = v_goal;
  if v_name <> 'DB10 goal' then fails := fails || 'goal_mutated_across_org; '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-10: %', fails; end if;
  raise notice 'PASS 0093-DB-10: aktor org lain ditolak (CEO ⇒ bukan gate permission), pesan non-oracle';
end $$;
rollback;

-- ============================================================ 0093-DB-11: PIC wajib anggota org yang sama & aktif
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_staffB uuid := '11111111-1111-1111-1111-000000000003';
  v_dormant uuid := '0093d0a3-0000-0000-0000-00000000d11a';
  v_goal uuid; v_pic uuid;
  fails text := '';
begin
  insert into public.goals (organization_id, name, status, created_by)
  values (v_orgA, 'DB11 goal', 'draft', v_ceoA) returning id into v_goal;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    -- PIC lintas-org: baris `profiles` incaran tidak terlihat oleh RLS aktor, tapi
    -- RPC ini SECURITY DEFINER — tanpa cek eksplisit, FK saja akan meloloskannya.
    perform public.update_goal(v_goal, 'DB11 goal', null, v_staffB, null, null, null);
    fails := fails || 'cross_org_pic_accepted; ';
  exception when others then
    if sqlerrm not ilike '%anggota organisasi yang sama%' then fails := fails || 'wrong_msg_pic:' || sqlerrm || '; '; end if;
  end;

  -- PIC nonaktif harus profil LAIN, bukan aktornya sendiri: menonaktifkan aktor
  -- membuat `current_user_org()` null, sehingga Goal-nya sudah gugur di lookup dan
  -- cabang PIC tidak pernah tercapai — hijau yang membuktikan hal yang salah.
  -- Menonaktifkan lewat role `authenticated` juga sudah mustahil sejak 0093 (itu
  -- justru yang DB-3 kunci), jadi setup ini dikerjakan sebagai owner.
  execute 'reset role';
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    v_dormant, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'db11.dormant@fixtures.local', extensions.crypt('rencan123', extensions.gen_salt('bf')), now(),
    json_build_object('provider','email','providers',json_build_array('email'),
                      'role_level','staff','organization_id',v_orgA)::jsonb,
    '{"full_name":"DB11 Dormant"}'::jsonb, now(), now(), '', '', '', ''
  );
  update public.profiles set is_active = false where id = v_dormant;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.update_goal(v_goal, 'DB11 goal', null, v_dormant, null, null, null);
    fails := fails || 'inactive_pic_accepted; ';
  exception when others then
    if sqlerrm not ilike '%aktif%' then fails := fails || 'wrong_msg_inactive:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';

  select pic_id into v_pic from public.goals where id = v_goal;
  if v_pic is not null then fails := fails || 'pic_set_despite_rejection; '; end if;

  if fails <> '' then raise exception 'FAIL 0093-DB-11: %', fails; end if;
  raise notice 'PASS 0093-DB-11: PIC lintas-org & PIC nonaktif sama-sama ditolak';
end $$;
rollback;
