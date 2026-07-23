-- =============================================================================
-- 0093 — BL-19c: jalur tulis Profil / Organisasi / Goal.
--        Sekaligus MENUTUP eskalasi hak akses yang bisa dieksploitasi.
-- =============================================================================
-- TEMUAN KEAMANAN (ditemukan saat menyiapkan jalur tulis Profil, terbukti di DB nyata)
--
--   `profiles` punya GRANT UPDATE ke `authenticated` (0001) dan policy
--   `profiles_update_self` yang hanya memeriksa `id = auth.uid()` — tanpa batasan
--   kolom, tanpa trigger penjaga. Postgres RLS tidak bisa membatasi kolom, jadi
--   policy itu mengizinkan pemilik baris mengubah KOLOM APA PUN miliknya:
--
--     update public.profiles set role_template_id = '<template CEO>' where id = auth.uid();
--
--   Karena `has_permission()` bertumpu pada `user_role_level()` yang membaca
--   `role_template_id`, satu UPDATE biasa memberi aktor seluruh permukaan admin —
--   tanpa RPC, tanpa gate. Varian `organization_id` memindahkan aktor ke organisasi
--   lain, menembus isolasi multi-tenant yang jadi seluruh alasan 0083 (BL-14) ada.
--   Varian `is_active` menghidupkan kembali akun yang sengaja dinonaktifkan admin.
--
--   Keduanya diverifikasi berjalan pada DB dev sebelum perbaikan ini.
--
-- BENTUK PERBAIKAN
--
--   Grant tulis dicabut dari `authenticated`/`anon`, policy update dihapus, dan
--   satu-satunya jalur jadi RPC berkolom-sempit. Policy-nya DIHAPUS, bukan
--   dipersempit: RLS tidak punya granularitas kolom, jadi policy "self update"
--   apa pun akan selalu seluas seluruh baris — menyisakannya hanya menanam ulang
--   jebakan yang sama untuk pembaca berikutnya.
--
--   Dicabut dari `authenticated, anon` — BUKAN dari `public`. Mencabut dari
--   `public` ikut mematikan `service_role` (BYPASSRLS bukan pengganti GRANT), dan
--   Edge Function `create-user` bergantung padanya.
--
--   INSERT/DELETE ikut dicabut. Saat ini keduanya sudah tertolak karena tidak ada
--   policy-nya, tapi grant tanpa policy adalah ranjau: policy yang ditambahkan
--   nanti akan langsung hidup dengan kewenangan penuh.
--
-- KEPUTUSAN OWNER (2026-07-23)
--   • Profil: hanya `full_name` yang bisa diubah sendiri. Jabatan tetap ditetapkan
--     admin — organisasi sudah punya entitas Positions sebagai sumber kebenaran.
--   • Goal aktif: nama/deskripsi/PIC boleh berubah kapan saja; periode dan target
--     terkunci setelah aktivasi karena keduanya dasar perhitungan skor. Pergantian
--     PIC dicatat ke activity log — atribusi skor ikut bergeser, jadi harus bisa
--     ditelusuri.
--
-- Dikunci `supabase/tests/0093_self_service_write_paths_contract.sql` (0093-DB-1..11).
-- 0093-DB-3 diverifikasi MERAH dengan mengembalikan grant + policy pra-0093: staff
-- berhasil menyetel `role_template_id` miliknya sendiri jadi CEO.
-- =============================================================================

-- ============================================================ 1. Tutup lubang di `profiles`
revoke insert, update, delete on public.profiles from authenticated, anon;
drop policy if exists "profiles_update_self" on public.profiles;

create or replace function public.update_own_profile(p_full_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if auth.uid() is null then
    raise exception 'Sesi tidak valid.';
  end if;
  v_name := nullif(trim(coalesce(p_full_name, '')), '');
  if v_name is null then
    raise exception 'Nama lengkap wajib diisi.';
  end if;
  if length(v_name) > 120 then
    raise exception 'Nama lengkap maksimal 120 karakter.';
  end if;

  -- Daftar kolom ditulis eksplisit dan sengaja pendek. Inilah pengganti batasan
  -- kolom yang tidak bisa diberikan RLS.
  update public.profiles set full_name = v_name where id = auth.uid();

  perform public.write_activity('profile', auth.uid(), 'profile_updated',
    jsonb_build_object('field', 'full_name'));
end;
$$;

revoke execute on function public.update_own_profile(text) from public, anon;
grant execute on function public.update_own_profile(text) to authenticated;

-- ============================================================ 2. Organisasi bisa disunting
-- `organizations` TIDAK punya policy UPDATE (RLS menolak secara default), jadi tidak
-- ada lubang sejenis di sini — yang kurang memang jalur tulisnya.
create or replace function public.update_organization(p_name text, p_timezone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_name text; v_tz text;
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Anda tidak berwenang mengubah pengaturan Organisasi.';
  end if;
  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Organisasi tidak ditemukan.';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'Nama Organisasi wajib diisi.';
  end if;

  v_tz := nullif(trim(coalesce(p_timezone, '')), '');
  if v_tz is null then
    raise exception 'Zona waktu wajib diisi.';
  end if;
  -- Zona waktu divalidasi terhadap katalog Postgres, bukan daftar hardcoded: nilai
  -- ini dipakai `org_today()` untuk menentukan deadline, jadi zona yang tidak dikenal
  -- akan menggeser tenggat seluruh organisasi tanpa error yang terlihat.
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    raise exception 'Zona waktu tidak dikenal: %', v_tz;
  end if;

  update public.organizations set name = v_name, timezone = v_tz where id = v_org;

  perform public.write_activity('organization', v_org, 'organization_updated',
    jsonb_build_object('name', v_name, 'timezone', v_tz));
end;
$$;

revoke execute on function public.update_organization(text, text) from public, anon;
grant execute on function public.update_organization(text, text) to authenticated;

-- ============================================================ 3. Goal bisa disunting
create or replace function public.update_goal(
  p_goal_id uuid,
  p_name text,
  p_description text,
  p_pic_id uuid,
  p_period_start date,
  p_period_end date,
  p_target_value text
) returns void language plpgsql security definer set search_path = '' as $$
declare g public.goals; v_org uuid; v_name text; v_changed text[] := '{}';
begin
  v_org := public.current_user_org();
  select * into g from public.goals where id = p_goal_id and organization_id = v_org;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;

  -- Kewenangan disamakan dengan `activate_goal` (0010:246): pembuat, PIC, atau
  -- pemegang `manage_others_cards`. Menyunting Goal aktif setara beratnya dengan
  -- mengaktifkannya, jadi gerbangnya tidak boleh lebih longgar.
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Goal ini.';
  end if;
  if g.status not in ('draft', 'active') then
    raise exception 'Goal berstatus % tidak bisa diubah.', g.status;
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then raise exception 'Nama Goal wajib diisi.'; end if;

  if p_pic_id is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_pic_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'PIC harus anggota organisasi yang sama dan aktif.';
  end if;

  -- Periode & target terkunci setelah aktivasi (keputusan owner): keduanya dasar
  -- perhitungan skor, dan menggesernya setelah skor dihitung membuat angka historis
  -- tidak konsisten dengan periodenya. DITOLAK eksplisit, bukan diabaikan diam-diam —
  -- pemanggil harus tahu perubahannya tidak tersimpan.
  if g.status <> 'draft' then
    if p_period_start is distinct from g.period_start
       or p_period_end is distinct from g.period_end then
      raise exception 'Periode Goal terkunci setelah aktivasi.';
    end if;
    if p_target_value is distinct from g.target_value then
      raise exception 'Target Goal terkunci setelah aktivasi.';
    end if;
  end if;

  if p_period_start is not null and p_period_end is not null
     and p_period_end < p_period_start then
    raise exception 'Periode selesai tidak boleh mendahului periode mulai.';
  end if;

  -- `::text` WAJIB pada tiap literal. Tanpa cast, `text[] || 'name'` membuat parser
  -- memilih operator array||array dan mem-parse literalnya sebagai array — gagal saat
  -- runtime dengan `malformed array literal: "name"`, hanya pada cabang yang benar-benar
  -- dijalankan. Ditemukan 0093-DB-8/DB-9, bukan oleh `create function` yang tetap sukses.
  if v_name is distinct from g.name then v_changed := v_changed || 'name'::text; end if;
  if nullif(trim(coalesce(p_description,'')),'') is distinct from g.description then
    v_changed := v_changed || 'description'::text;
  end if;
  if p_pic_id is distinct from g.pic_id then v_changed := v_changed || 'pic_id'::text; end if;
  if p_period_start is distinct from g.period_start
     or p_period_end is distinct from g.period_end then
    v_changed := v_changed || 'period'::text;
  end if;
  if p_target_value is distinct from g.target_value then v_changed := v_changed || 'target_value'::text; end if;

  update public.goals
     set name         = v_name,
         description  = nullif(trim(coalesce(p_description,'')),''),
         pic_id       = p_pic_id,
         period_start = p_period_start,
         period_end   = p_period_end,
         target_value = nullif(trim(coalesce(p_target_value,'')),'')
   where id = p_goal_id;

  -- Field yang berubah ikut dicatat: pergantian PIC menggeser atribusi skor, jadi
  -- "Goal diubah" saja tidak cukup untuk menelusuri kenapa angka seseorang berubah.
  perform public.write_activity('goal', p_goal_id, 'update',
    jsonb_build_object('fields', v_changed, 'status', g.status));
end;
$$;

revoke execute on function public.update_goal(uuid, text, text, uuid, date, date, text) from public, anon;
grant execute on function public.update_goal(uuid, text, text, uuid, date, date, text) to authenticated;
