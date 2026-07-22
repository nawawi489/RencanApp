-- =============================================================================
-- 0083 — handle_new_user: penempatan organisasi eksplisit + guard single-org
-- =============================================================================
-- BL-14. Keputusan owner 2026-07-22: V1 dikunci single-org, dan trigger tidak
-- boleh lagi MENEBAK organisasi secara diam-diam.
--
-- PERILAKU LAMA (0015, tak berubah sejak 0001)
--   select id into v_org from public.organizations order by created_at limit 1;
--   Dengan satu org ini benar. Dengan dua org atau lebih, setiap user baru diam-
--   diam mendarat di org TERTUA — bukan org yang dimaksud. Gejalanya bukan error
--   melainkan workspace kosong lewat RLS, jadi terbaca sebagai bug permission dan
--   bisa hidup berbulan-bulan tanpa terdeteksi.
--
-- PERILAKU BARU — tiga cabang, tidak ada tebakan diam:
--   1. `raw_app_meta_data.organization_id` ADA → dipakai apa adanya.
--      Kolom app_metadata HANYA bisa di-set service_role / Admin API (tidak bisa
--      di-set user saat self-signup), pola yang sama persis dengan `role_level`
--      di 0015 — jadi aman sebagai jalur penempatan eksplisit.
--      Id ngawur / org tak dikenal → RAISE, bukan fallback diam ke org tertua.
--   2. Key ABSEN dan jumlah org > 1 → RAISE. Inilah guard BL-14.
--   3. Key ABSEN dan jumlah org ≤ 1 → perilaku hari ini, persis. Single-org
--      tetap jalan tanpa perubahan apa pun di pemanggil.
--
-- SENGAJA TIDAK DIUBAH: kasus NOL org. `profiles.organization_id` nullable
-- (0001:24), jadi hari ini user pertama pada database kosong dapat profil
-- ber-org NULL. Itu jalur lain dengan gejala lain (bukan "masuk org yang salah")
-- dan di luar cakupan BL-14 — dibiarkan identik supaya diff ini tetap satu ide.
--
-- CREATE OR REPLACE, BUKAN DROP+CREATE. `drop function ... cascade` akan
-- (a) mereset ACL fungsi ke PUBLIC EXECUTE — membatalkan REVOKE dari 0003 dan
-- 0066 — dan (b) ikut menghapus trigger `on_auth_user_created` di auth.users,
-- sehingga provisioning profil mati total tanpa satu pun error. REVOKE di bawah
-- bersifat defensif/idempoten, bukan karena replace mengubah ACL.
-- =============================================================================

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_org       uuid;
  v_role      uuid;
  v_level     text;
  v_org_claim text;
  v_org_count bigint;
begin
  v_org_claim := nullif(new.raw_app_meta_data ->> 'organization_id', '');

  if v_org_claim is not null then
    -- Cabang 1: penempatan eksplisit. Dua kegagalan dibedakan supaya pesannya
    -- menunjuk ke perbaikan yang benar (format vs baris yang tak ada).
    begin
      v_org := v_org_claim::uuid;
    exception when invalid_text_representation then
      raise exception
        'raw_app_meta_data.organization_id (%) bukan UUID yang sah. Perbaiki nilainya saat membuat user.',
        quote_literal(v_org_claim)
        using errcode = '22023';
    end;

    perform 1 from public.organizations where id = v_org;
    if not found then
      raise exception
        'Organisasi % (dari raw_app_meta_data.organization_id) tidak terdaftar. Pakai id organisasi yang ada saat membuat user.',
        v_org
        using errcode = '23503';
    end if;
  else
    -- Cabang 2 & 3: tanpa penempatan eksplisit, aturan "org tertua" hanya sah
    -- selama org-nya cuma satu.
    select count(*) into v_org_count from public.organizations;

    if v_org_count > 1 then
      raise exception
        'Lebih dari satu organisasi terdaftar (%), sehingga penempatan organisasi otomatis untuk user baru dinonaktifkan. Set raw_app_meta_data.organization_id secara eksplisit saat membuat user.',
        v_org_count
        using errcode = 'P0001';
    end if;

    select id into v_org from public.organizations order by created_at limit 1;
  end if;

  -- Pemilihan role template: tidak berubah dari 0015.
  v_level := nullif(new.raw_app_meta_data ->> 'role_level', '');

  select id into v_role from public.role_templates
    where organization_id = v_org
      and level = coalesce(v_level, 'staff')
    order by created_at limit 1;

  if v_role is null then
    select id into v_role from public.role_templates
      where organization_id = v_org and level = 'staff'
      order by created_at limit 1;
  end if;

  insert into public.profiles (id, organization_id, role_template_id, full_name, email)
  values (new.id, v_org, v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email);
  return new;
end; $function$;

-- Defensif + idempoten: trigger helper, tidak pernah dipanggil sebagai RPC.
-- Mengulang 0002 / 0003 / 0066 supaya nilai ACL yang benar tetap tercatat di
-- migrasi terbaru yang menyentuh fungsi ini.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
