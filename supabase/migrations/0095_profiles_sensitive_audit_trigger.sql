-- =============================================================================
-- 0095 — Jejak audit untuk kolom sensitif `profiles`.
-- =============================================================================
-- LATAR: audit pasca-0093 (2026-07-24) menemukan bahwa pertanyaan "siapa mengubah
-- role siapa" TIDAK BISA dijawab. `profiles` hanya punya trigger `set_updated_at`,
-- jadi UPDATE tabel langsung — persis jalur eksploit yang ditutup 0093 — tidak
-- pernah menyentuh `activity_logs`. Audit terpaksa bersandar pada inferensi dari
-- `updated_at`, dan itu hanya bekerja selama penyerangnya cuma satu kali; dua
-- perubahan pada baris yang sama tidak bisa dibedakan dari satu.
--
-- Saat ini satu-satunya jalur tulis adalah RPC yang memang mencatat sendiri, jadi
-- trigger ini BUKAN penambal lubang yang menganga — ia jaring pengaman untuk saat
-- seseorang kelak membuka jalur tulis langsung lagi. Nilainya justru muncul di masa
-- depan yang tidak kita kendalikan.
--
-- KENAPA `insert` LANGSUNG, BUKAN `write_activity`
--   `write_activity` (0005) menurunkan `organization_id` dari `current_user_org()` —
--   organisasi AKTOR. Untuk perpindahan lintas-org itu justru organisasi penyerang,
--   sehingga jejaknya mendarat di tempat yang tidak bisa dilihat organisasi korban.
--   Di sini organisasi ditentukan eksplisit: dicatat ke organisasi LAMA, yaitu batas
--   yang dilanggar dan pihak yang berkepentingan melihatnya.
--
-- KENAPA `security definer`
--   Trigger harus tetap menulis walau pemanggilnya tidak punya hak apa pun atas
--   `activity_logs`. Jejak audit yang bisa dimatikan oleh pihak yang diaudit bukan
--   jejak audit.
-- =============================================================================

create or replace function public.log_profile_sensitive_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_actor uuid;
begin
  -- Organisasi LAMA: untuk perpindahan org, inilah pihak yang kehilangan anggota dan
  -- yang perlu melihat kejadiannya. Untuk perubahan dalam org, lama = baru.
  --
  -- Disaring lewat EXISTS dengan alasan yang sama seperti `actor_id` di bawah — dan ini
  -- BUKAN kehati-hatian teoretis: menghapus sebuah organisasi memicu `on delete set null`
  -- pada `profiles.organization_id`, yang berarti trigger ini menyala DI DALAM transaksi
  -- penghapusan itu, dengan `old.organization_id` menunjuk baris yang sudah lenyap.
  -- Tanpa saringan, insert audit melanggar FK dan MEMBATALKAN penghapusan organisasi.
  -- Ditemukan oleh kontrak 0083 (T-BL14-7), bukan oleh review.
  select o.id into v_org
    from public.organizations o
   where o.id = coalesce(old.organization_id, new.organization_id);
  -- Org lama sudah tidak ada → jatuh ke org baru bila ia masih ada; kalau tidak, null.
  -- `activity_logs.organization_id` nullable, jadi jejaknya tetap tertulis: kehilangan
  -- ruang-lingkup lebih baik daripada kehilangan seluruh catatannya.
  if v_org is null then
    select o.id into v_org from public.organizations o where o.id = new.organization_id;
  end if;

  -- Actor disaring lewat EXISTS karena `activity_logs.actor_id` ber-FK ke `profiles`.
  -- Tanpa saringan ini, aktor yang belum punya baris profil (mis. jalur service-role
  -- saat pembuatan user) memicu pelanggaran FK dan MENGGAGALKAN update yang sah —
  -- trigger audit tidak boleh menjadi penyebab kegagalan operasi normal.
  select p.id into v_actor from public.profiles p where p.id = auth.uid();

  if new.role_template_id is distinct from old.role_template_id then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
    values (v_org, v_actor, 'profile', new.id, 'profile_role_changed',
            jsonb_build_object(
              'from_role_template_id', old.role_template_id,
              'to_role_template_id',   new.role_template_id,
              'from_level', (select rt.level from public.role_templates rt where rt.id = old.role_template_id),
              'to_level',   (select rt.level from public.role_templates rt where rt.id = new.role_template_id),
              'self', auth.uid() is not distinct from new.id));
  end if;

  if new.organization_id is distinct from old.organization_id then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
    values (v_org, v_actor, 'profile', new.id, 'profile_org_changed',
            jsonb_build_object(
              'from_organization_id', old.organization_id,
              'to_organization_id',   new.organization_id,
              'self', auth.uid() is not distinct from new.id));
  end if;

  if new.is_active is distinct from old.is_active then
    insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
    values (v_org, v_actor, 'profile', new.id, 'profile_active_changed',
            jsonb_build_object(
              'from_is_active', old.is_active,
              'to_is_active',   new.is_active,
              'self', auth.uid() is not distinct from new.id));
  end if;

  return null;  -- AFTER trigger: nilai balik diabaikan.
end;
$$;

revoke execute on function public.log_profile_sensitive_change() from public, anon, authenticated;

drop trigger if exists profiles_audit_sensitive on public.profiles;

-- Klausa WHEN menyaring di level trigger, bukan di dalam badan fungsi: baris yang hanya
-- mengubah `full_name` (jalur `update_own_profile`, yang paling sering dipakai) tidak
-- membangunkan fungsi ini sama sekali.
create trigger profiles_audit_sensitive
  after update on public.profiles
  for each row
  when (
    old.role_template_id is distinct from new.role_template_id
    or old.organization_id is distinct from new.organization_id
    or old.is_active is distinct from new.is_active
  )
  execute function public.log_profile_sensitive_change();
