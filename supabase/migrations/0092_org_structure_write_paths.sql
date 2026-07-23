-- =============================================================================
-- 0092 — BL-19b: jalur tulis yang hilang untuk struktur organisasi.
-- =============================================================================
-- Dua entitas mandek sebagai create-only meski kolomnya sudah ada sejak 0014:
--
--   1. Departemen tidak bisa dinonaktifkan. Kolom `departments.is_active` ada
--      (0014:132) dan copy admin sudah menjanjikannya ("Nonaktifkan tanpa
--      menghapus untuk menjaga riwayat"), tapi write pada tabelnya dicabut dari
--      `authenticated` (0014:372) dan tidak pernah ada RPC penggantinya. Janji di
--      UI tanpa jalur tulis = fitur yang tidak ada.
--
--   2. Anggota Tim tidak bisa dilepas. `assign_team_member` (0014:514) ada, tapi
--      tanpa pasangannya salah-assign jadi pintu satu arah — persis kelas masalah
--      create-only yang sedang ditutup.
--
-- Keputusan yang diambil di sini, supaya tidak perlu ditebak ulang nanti:
--
--   • Nonaktifkan Departemen TIDAK meng-cascade ke Posisi/Tim yang menautnya.
--     Nonaktif itu sinyal "jangan dipakai untuk yang baru", bukan penghapusan;
--     memutus tautan lama justru menghancurkan riwayat yang jadi alasan
--     nonaktif dipilih ketimbang delete. Pencegahan tautan baru sudah ditangani
--     di klien (picker hanya menawarkan Departemen aktif).
--
--   • Gate memakai `create_department`, bukan permission baru. Namanya memang
--     tidak enak untuk aksi nonaktifkan, tapi katalog permission dirujuk literal
--     di beberapa CHECK constraint (0017:64/111/116) — menambah key berarti
--     migrasi lintas-tabel demi satu tombol. Utang nama dicatat, bukan dibayar
--     di sini.
--
--   • `assign_team_member` ikut ditulis ulang HANYA untuk menambah activity log.
--     Tanpa itu pelepasan anggota tercatat sementara penambahannya tidak —
--     jejak audit yang timpang lebih menyesatkan daripada tidak ada sama sekali.
--     CREATE OR REPLACE mempertahankan ACL (bukan DROP+CREATE), jadi grant yang
--     ada tidak ter-reset.
-- =============================================================================

-- ============================================================ 1. set_department_active
create or replace function public.set_department_active(
  p_department_id uuid, p_active boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_name text;
begin
  if not public.has_permission('create_department') then
    raise exception 'Anda tidak berwenang mengelola Departemen.';
  end if;
  if p_active is null then
    raise exception 'Status aktif wajib diisi.';
  end if;
  v_org := public.current_user_org();

  select d.name into v_name
    from public.departments d
   where d.id = p_department_id and d.organization_id = v_org;
  if v_name is null then
    raise exception 'Department tidak ditemukan di organisasi ini.';
  end if;

  update public.departments
     set is_active = p_active, updated_at = now()
   where id = p_department_id and organization_id = v_org;

  perform public.write_activity(
    'department', p_department_id,
    case when p_active then 'department_activated' else 'department_deactivated' end,
    jsonb_build_object('name', v_name)
  );
end;
$$;

revoke execute on function public.set_department_active(uuid, boolean) from public, anon;
grant execute on function public.set_department_active(uuid, boolean) to authenticated;

-- ============================================================ 2. remove_team_member
create or replace function public.remove_team_member(
  p_team_id uuid, p_profile_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_removed int;
begin
  if not public.has_permission('manage_teams') then
    raise exception 'Anda tidak berwenang mengelola anggota Tim.';
  end if;
  v_org := public.current_user_org();

  -- Tim divalidasi lebih dulu dan TERPISAH dari hasil delete: tanpa ini, tim milik
  -- org lain dan anggota yang memang tidak ada sama-sama menghasilkan 0 baris, dan
  -- pesan "bukan anggota" akan mengonfirmasi keberadaan tim lintas-org.
  if not exists (
    select 1 from public.teams t where t.id = p_team_id and t.organization_id = v_org
  ) then
    raise exception 'Tim tidak ditemukan.';
  end if;

  delete from public.team_members
   where team_id = p_team_id and profile_id = p_profile_id and organization_id = v_org;
  get diagnostics v_removed = row_count;
  if v_removed = 0 then
    raise exception 'Orang ini bukan anggota Tim tersebut.';
  end if;

  perform public.write_activity(
    'team', p_team_id, 'team_member_removed',
    jsonb_build_object('profile_id', p_profile_id)
  );
end;
$$;

revoke execute on function public.remove_team_member(uuid, uuid) from public, anon;
grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

-- ============================================================ 3. assign_team_member — tambah activity log
create or replace function public.assign_team_member(
  p_team_id uuid, p_profile_id uuid, p_role_in_team text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_teams') then
    raise exception 'Anda tidak berwenang mengelola anggota Tim.';
  end if;
  v_org := public.current_user_org();
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.organization_id = v_org) then
    raise exception 'Tim tidak ditemukan.';
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = p_profile_id and p.organization_id = v_org and p.is_active) then
    raise exception 'Anggota tidak valid atau tidak aktif.';
  end if;
  insert into public.team_members (team_id, profile_id, organization_id, role_in_team)
  values (p_team_id, p_profile_id, v_org, nullif(trim(coalesce(p_role_in_team,'')),''))
  returning id into v_id;

  perform public.write_activity(
    'team', p_team_id, 'team_member_assigned',
    jsonb_build_object('profile_id', p_profile_id)
  );
  return v_id;
end;
$$;
