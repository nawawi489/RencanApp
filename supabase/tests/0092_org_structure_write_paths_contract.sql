-- Migration 0092 contract test — jalur tulis struktur organisasi (BL-19b).
--
-- Mengunci tiga hal yang mudah hilang saat RPC ditulis ulang:
--   • ACL: kedua fungsi baru boleh dieksekusi `authenticated`, TIDAK oleh `anon`.
--     0014 sempat menulis `revoke ... from public, anon` untuk `create_team` tanpa
--     `grant` penggantinya — kelas kesalahan yang sama gampang terulang.
--   • Batas org: aktor org lain ditolak, dan pesan penolakannya tidak membocorkan
--     apakah baris incarannya ada.
--   • Nonaktifkan Departemen TIDAK meng-cascade. Ini keputusan desain (riwayat
--     dipertahankan), bukan kebetulan implementasi, jadi harus ada yang menjaganya.
--
-- Pattern: `raise notice 'PASS'` on success, `raise exception 'FAIL: ...'` on failure.
-- Fixture constants (supabase/tests/_fixtures.sql):
--   org A = 4b07a19f-550d-4952-b0d8-44f38f651d89, CEO A = ca8c1471-b870-4f09-a149-25e5eae99d6f
--   org B = 52b0ebe1-d8bd-466d-b491-526ee6518b70, CEO B = 11111111-1111-1111-1111-000000000001
--   Keduanya level `ceo` ⇒ `has_permission(...)` lolos tanpa syarat (0041), sehingga
--   blok lintas-org di bawah terbukti ditolak oleh SCOPE ORG, bukan oleh gate permission.
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0092_org_structure_write_paths_contract.sql

-- ============================================================ 0092-DB-1: ACL kedua fungsi baru
do $$
declare
  v_fns text[] := array['set_department_active', 'remove_team_member'];
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
    if has_function_privilege('anon', v_oid, 'EXECUTE') then
      fails := fails || v_fn || '_anon_can_execute; ';
    end if;
  end loop;
  if fails <> '' then raise exception 'FAIL 0092-DB-1: %', fails; end if;
  raise notice 'PASS 0092-DB-1: set_department_active + remove_team_member — authenticated only';
end $$;

-- ============================================================ 0092-DB-2: toggle nonaktif ⇄ aktif + activity log
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_dept uuid; v_active boolean; n_off int; n_on int;
  fails text := '';
begin
  insert into public.departments (organization_id, name) values (v_orgA, 'DB2-dept')
    returning id into v_dept;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_department_active(v_dept, false);
  execute 'reset role';

  select is_active into v_active from public.departments where id = v_dept;
  if v_active is not false then fails := fails || 'deactivate_did_not_stick; '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_department_active(v_dept, true);
  execute 'reset role';

  select is_active into v_active from public.departments where id = v_dept;
  if v_active is not true then fails := fails || 'reactivate_did_not_stick; '; end if;

  -- Reversibel itu inti dari "nonaktif, bukan hapus": kalau hanya satu arah yang
  -- terkunci, nonaktif jadi delete berbaju lain.
  select count(*) into n_off from public.activity_logs
   where entity_id = v_dept and action = 'department_deactivated';
  select count(*) into n_on from public.activity_logs
   where entity_id = v_dept and action = 'department_activated';
  if n_off <> 1 then fails := fails || 'deactivate_not_logged('||n_off||'); '; end if;
  if n_on  <> 1 then fails := fails || 'activate_not_logged('||n_on||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0092-DB-2: %', fails; end if;
  raise notice 'PASS 0092-DB-2: nonaktif ⇄ aktif dua arah, keduanya tercatat di activity log';
end $$;
rollback;

-- ============================================================ 0092-DB-3: nonaktif TIDAK meng-cascade
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_dept uuid; v_pos uuid; v_team uuid;
  v_pos_dept uuid; v_team_dept uuid; v_pos_active boolean; v_team_active boolean;
  fails text := '';
begin
  insert into public.departments (organization_id, name) values (v_orgA, 'DB3-dept')
    returning id into v_dept;
  insert into public.positions (organization_id, department_id, name)
    values (v_orgA, v_dept, 'DB3-pos') returning id into v_pos;
  insert into public.teams (organization_id, department_id, name)
    values (v_orgA, v_dept, 'DB3-team') returning id into v_team;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_department_active(v_dept, false);
  execute 'reset role';

  select department_id, is_active into v_pos_dept,  v_pos_active  from public.positions where id = v_pos;
  select department_id, is_active into v_team_dept, v_team_active from public.teams     where id = v_team;

  -- Tautan lama justru ALASAN nonaktif dipilih ketimbang delete. Kalau nanti ada yang
  -- "merapikan" dengan set null / ikut menonaktifkan, riwayatnya hilang diam-diam.
  if v_pos_dept  is distinct from v_dept then fails := fails || 'position_unlinked; '; end if;
  if v_team_dept is distinct from v_dept then fails := fails || 'team_unlinked; ';     end if;
  if v_pos_active  is not true then fails := fails || 'position_deactivated_by_cascade; '; end if;
  if v_team_active is not true then fails := fails || 'team_deactivated_by_cascade; ';     end if;

  if fails <> '' then raise exception 'FAIL 0092-DB-3: %', fails; end if;
  raise notice 'PASS 0092-DB-3: Posisi/Tim tertaut tetap utuh setelah Departemen dinonaktifkan';
end $$;
rollback;

-- ============================================================ 0092-DB-4: set_department_active lintas-org ditolak
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoB uuid := '11111111-1111-1111-1111-000000000001';
  v_dept uuid; v_active boolean;
  fails text := '';
begin
  insert into public.departments (organization_id, name) values (v_orgA, 'DB4-dept')
    returning id into v_dept;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoB,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.set_department_active(v_dept, false);
    fails := fails || 'cross_org_deactivate_allowed; ';
  exception when others then
    if sqlerrm not ilike '%tidak ditemukan%' then fails := fails || 'wrong_msg:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';

  select is_active into v_active from public.departments where id = v_dept;
  if v_active is not true then fails := fails || 'department_mutated_across_org; '; end if;

  if fails <> '' then raise exception 'FAIL 0092-DB-4: %', fails; end if;
  raise notice 'PASS 0092-DB-4: aktor org lain ditolak (CEO ⇒ bukan gate permission), baris tidak berubah';
end $$;
rollback;

-- ============================================================ 0092-DB-5: remove_team_member melepas, panggilan kedua ditolak
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_team uuid; n_before int; n_after int; n_log int;
  fails text := '';
begin
  insert into public.teams (organization_id, name) values (v_orgA, 'DB5-team') returning id into v_team;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.assign_team_member(v_team, v_ceoA, 'Lead');
  execute 'reset role';

  select count(*) into n_before from public.team_members where team_id = v_team;
  if n_before <> 1 then fails := fails || 'assign_precondition_failed('||n_before||'); '; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.remove_team_member(v_team, v_ceoA);

  -- Panggilan kedua harus MENOLAK, bukan diam-diam sukses: "sudah tidak ada" dan
  -- "berhasil dilepas" adalah hasil berbeda bagi pemanggil.
  begin
    perform public.remove_team_member(v_team, v_ceoA);
    fails := fails || 'second_remove_silently_succeeded; ';
  exception when others then
    if sqlerrm not ilike '%bukan anggota%' then fails := fails || 'wrong_msg:' || sqlerrm || '; '; end if;
  end;
  execute 'reset role';

  select count(*) into n_after from public.team_members where team_id = v_team;
  if n_after <> 0 then fails := fails || 'member_not_removed('||n_after||'); '; end if;

  select count(*) into n_log from public.activity_logs
   where entity_id = v_team and action = 'team_member_removed';
  if n_log <> 1 then fails := fails || 'remove_not_logged('||n_log||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0092-DB-5: %', fails; end if;
  raise notice 'PASS 0092-DB-5: anggota terlepas + tercatat; panggilan ulang ditolak eksplisit';
end $$;
rollback;

-- ============================================================ 0092-DB-6: remove_team_member lintas-org — ditolak tanpa membocorkan keanggotaan
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_ceoB uuid := '11111111-1111-1111-1111-000000000001';
  v_team uuid; n_after int;
  fails text := '';
begin
  insert into public.teams (organization_id, name) values (v_orgA, 'DB6-team') returning id into v_team;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.assign_team_member(v_team, v_ceoA, null);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoB,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform public.remove_team_member(v_team, v_ceoA);
    fails := fails || 'cross_org_remove_allowed; ';
  exception when others then
    -- Anti-oracle: pesannya harus "Tim tidak ditemukan", BUKAN "bukan anggota".
    -- Yang kedua akan mengonfirmasi bahwa tim milik org lain itu ada.
    if sqlerrm not ilike '%Tim tidak ditemukan%' then
      fails := fails || 'leaky_or_wrong_msg:' || sqlerrm || '; ';
    end if;
  end;
  execute 'reset role';

  select count(*) into n_after from public.team_members where team_id = v_team;
  if n_after <> 1 then fails := fails || 'membership_mutated_across_org('||n_after||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0092-DB-6: %', fails; end if;
  raise notice 'PASS 0092-DB-6: lintas-org ditolak dengan pesan non-oracle, keanggotaan utuh';
end $$;
rollback;

-- ============================================================ 0092-DB-7: assign_team_member ikut tercatat
begin;
do $$
declare
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_team uuid; n_log int;
  fails text := '';
begin
  insert into public.teams (organization_id, name) values (v_orgA, 'DB7-team') returning id into v_team;

  perform set_config('request.jwt.claims', json_build_object('sub',v_ceoA,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.assign_team_member(v_team, v_ceoA, null);
  execute 'reset role';

  -- Jejak audit yang timpang (lepas tercatat, tambah tidak) lebih menyesatkan
  -- daripada tidak ada jejak sama sekali.
  select count(*) into n_log from public.activity_logs
   where entity_id = v_team and action = 'team_member_assigned';
  if n_log <> 1 then fails := fails || 'assign_not_logged('||n_log||'); '; end if;

  if fails <> '' then raise exception 'FAIL 0092-DB-7: %', fails; end if;
  raise notice 'PASS 0092-DB-7: penambahan anggota tercatat — jejak audit simetris dengan pelepasan';
end $$;
rollback;
