-- =============================================================================
-- 0094 — BL-19d bagian 2: Reporting line (PRD §34.3 item 5).
-- =============================================================================
-- §34.3 mendaftarkan enam hal yang diatur Organization; lima sudah ada, "Reporting
-- line" absen di SELURUH lapisan — `profiles` bahkan tidak punya kolomnya. Ini satu-
-- satunya item §34.3 yang butuh perubahan skema, bukan sekadar layar.
--
-- CAKUPAN YANG SENGAJA DIPILIH: DESKRIPTIF, BUKAN OTORISASI
--
--   Reporting line di V1 menjawab "siapa atasan siapa" dan tidak lebih. Ia TIDAK
--   dipakai sebagai gerbang akses.
--
--   Alasannya bukan kehati-hatian abstrak, melainkan temuan konkret: kolom
--   `user_permissions.scope` ('own'/'team'/'dept'/'org', 0022) memang ada dan bisa
--   disetel, tapi **tidak ada satu pun policy atau RPC yang membacanya** — klien
--   hanya menampilkannya. Jadi tidak ada mesin scope yang menunggu disambung ke
--   reporting line; menyambungkannya sekarang berarti MEMBANGUN mesin otorisasi baru
--   sekaligus, dengan permukaan kebocoran yang jauh lebih luas daripada satu kolom.
--
--   Konsekuensi jujur: menyetel atasan seseorang TIDAK memberi atasan itu akses apa
--   pun atas data bawahannya. Kalau kelak scope mau ditegakkan, itu pekerjaan
--   tersendiri yang butuh spec — dan reporting line ini jadi datanya, bukan gerbangnya.
--
-- KENAPA RPC, BUKAN UPDATE LANGSUNG
--
--   0093 mencabut seluruh grant tulis `profiles` dari `authenticated` setelah terbukti
--   policy "self update" membuka eskalasi role. `manager_id` tidak boleh membatalkan
--   keputusan itu, jadi satu-satunya jalur adalah RPC berkolom-sempit.
-- =============================================================================

alter table public.profiles
  add column if not exists manager_id uuid references public.profiles(id) on delete set null;

-- `on delete set null`, BUKAN cascade: menghapus seorang atasan tidak boleh ikut
-- menghapus profil bawahannya. Bawahan kehilangan atasan (kondisi yang bisa dilihat
-- dan diperbaiki), bukan lenyap.

create index if not exists idx_profiles_manager on public.profiles(manager_id)
  where manager_id is not null;

-- ============================================================ set_reporting_line
create or replace function public.set_reporting_line(
  p_user_id uuid, p_manager_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_cursor uuid; v_depth int := 0;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengatur garis pelaporan.';
  end if;
  v_org := public.current_user_org();

  if not exists (
    select 1 from public.profiles p where p.id = p_user_id and p.organization_id = v_org
  ) then
    raise exception 'User tidak ditemukan di organisasi ini.';
  end if;

  -- Melepas atasan (null) selalu boleh: kalau tidak, satu-satunya cara memperbaiki
  -- struktur yang salah adalah lewat DB langsung.
  if p_manager_id is null then
    update public.profiles set manager_id = null where id = p_user_id;
    perform public.write_activity('profile', p_user_id, 'reporting_line_cleared', '{}'::jsonb);
    return;
  end if;

  if p_manager_id = p_user_id then
    raise exception 'Seseorang tidak bisa menjadi atasan dirinya sendiri.';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = p_manager_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'Atasan harus anggota organisasi yang sama dan aktif.';
  end if;

  -- Penjaga siklus. Ditelusuri dari CALON ATASAN ke atas: bila rantainya sampai ke
  -- `p_user_id`, menyimpannya akan membentuk lingkaran — dan lingkaran di sini bukan
  -- sekadar data aneh, ia membuat setiap penelusuran rantai (bagan, notifikasi
  -- berjenjang, eskalasi) berputar tanpa henti.
  --
  -- Ditulis sebagai loop dengan batas kedalaman, bukan CTE rekursif: CTE rekursif atas
  -- data yang SUDAH bersiklus akan menggantung lebih dulu sebelum sempat melaporkannya.
  v_cursor := p_manager_id;
  while v_cursor is not null loop
    if v_cursor = p_user_id then
      raise exception 'Garis pelaporan melingkar: orang ini sudah menjadi atasan dari calon atasannya.';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 64 then
      -- Hanya tercapai bila data lama sudah bersiklus (mis. dari masa sebelum penjaga
      -- ini ada). Gagal keras jauh lebih baik daripada loop tak berujung.
      raise exception 'Rantai pelaporan terlalu dalam atau sudah bersiklus — periksa struktur organisasi.';
    end if;
    select p.manager_id into v_cursor from public.profiles p where p.id = v_cursor;
  end loop;

  update public.profiles set manager_id = p_manager_id where id = p_user_id;

  perform public.write_activity('profile', p_user_id, 'reporting_line_set',
    jsonb_build_object('manager_id', p_manager_id));
end;
$$;

revoke execute on function public.set_reporting_line(uuid, uuid) from public, anon;
grant execute on function public.set_reporting_line(uuid, uuid) to authenticated;
