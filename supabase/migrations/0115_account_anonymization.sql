-- =============================================================================
-- 0115 — Sprint 5 S5-8: penghapusan akun / anonimisasi + ekspor data (UU PDP)
-- =============================================================================
-- UU 27/2022 tentang PDP + syarat Google Play Data safety mewajibkan tiga hal
-- untuk aplikasi yang mengolah data pekerja: (1) jalur permintaan penghapusan
-- di dalam aplikasi atau URL publik, (2) mekanisme anonimisasi untuk data yang
-- tidak boleh dihapus penuh karena integritas historis (baris skor & log audit
-- yang menjadi bukti compliance), dan (3) jalur ekspor data user.
--
-- Kenapa anonimisasi, bukan DELETE:
--   • Delapan tabel skor/audit punya trigger `_no_delete` yg memblokir cascade
--     (mempertahankan angka historis + jejak governance). Menghapus row profil
--     langsung akan gagal — bukan pilihan.
--   • Baris `activity_logs` + `login_logs` + `evaluations` dst. bernilai
--     forensik + akuntabilitas; menyisakan `actor_id NULL` atas nama identitas
--     yg diwipe tetap benar (audit trigger `on delete set null` sudah diatur
--     sejak awal, lihat memory `audit-trigger-fk-guard-gotcha`).
--   • Tujuan sebenarnya bukan menghapus baris, tapi memutus keterhubungan
--     antara identitas (nama/email/no telp/position) dgn baris tsb.
--
-- Kepemilikan tindakan:
--   • request_account_deletion() = SELF-SERVICE. User mengajukan, admin org
--     memproses (memberikan waktu untuk verifikasi + backup dokumen kerja
--     yg tak boleh dihapus). Idempoten: request kedua tak melempar.
--   • anonymize_account(target, reason) = ADMIN. Gate
--     `manage_users_permissions` (sama kaliber dgn `set_user_active` dan
--     `update_user_role`). ANTI SELF-ANONYMIZE untuk hindari kunci diri sendiri
--     tanpa jalur pulih (persis pola S4-4 self-deactivate).
--   • export_my_data() = SELF-SERVICE. Kembalikan JSONB berisi profil +
--     ringkasan aktivitas + daftar card owned. Cukup memenuhi syarat "jalur
--     ekspor" untuk V1; ekspor lengkap semua tabel bisa jadi follow-up bila
--     regulator meminta portabilitas format tertentu.
--
-- Hapus baris `auth.users` = tanggung jawab Edge Function/service_role (RPC
-- tidak boleh menembus schema `auth`). Skema di sini berhenti pada anonimisasi
-- `public.profiles` + baris terkait; user tetap teregister di `auth.users` tapi
-- namanya '<uuid>@anonymized.local' dan tak bisa login karena `is_active=false`
-- (guard `handle_new_user` + `login_logs` policy).
-- =============================================================================

-- 1. Tabel account_deletion_requests
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  requested_at timestamptz not null default now(),
  reason text,
  status text not null default 'pending'
    check (status in ('pending','anonymized','cancelled')),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

-- Idempotency guard: paling banyak SATU pending per user. Unique partial index
-- (bukan constraint) supaya baris pasca-resolved boleh berulang — user boleh
-- request lagi setelah admin batalkan permintaan sebelumnya (mis. konteks
-- keliru), tanpa harus reset row lama.
create unique index if not exists account_deletion_requests_one_pending_per_user
  on public.account_deletion_requests (user_id)
  where status = 'pending';

-- Indeks per-org: admin harus bisa scan permintaan aktif tanpa penuh scan.
create index if not exists account_deletion_requests_org_status_idx
  on public.account_deletion_requests (organization_id, status)
  where status = 'pending';

alter table public.account_deletion_requests enable row level security;

-- SELECT: user melihat request sendiri, admin org melihat semua request org-nya.
create policy account_deletion_requests_select on public.account_deletion_requests
  for select using (
    user_id = auth.uid()
    or (
      organization_id = public.current_user_org()
      and public.has_permission('manage_users_permissions')
    )
  );

-- INSERT/UPDATE via RPC saja — tidak ada policy publik. Ini yang memaksa
-- pemanggilan lewat SECURITY DEFINER dgn guard identitas yg konsisten.

-- 2. RPC request_account_deletion (self-service)
create or replace function public.request_account_deletion(p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_org uuid; v_id uuid; v_reason text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  v_org := public.current_user_org();
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  -- Idempoten: kalau sudah ada pending, kembalikan id-nya (tak melempar).
  -- Constraint UNIQUE(user_id,status) menutup race di sisi DB; SELECT ini
  -- mempercepat happy-path tanpa exception handling.
  select id into v_id
  from public.account_deletion_requests
  where user_id = v_uid and status = 'pending'
  limit 1;

  if v_id is not null then
    -- Update reason bila diberikan baru; jangan ganti requested_at.
    if v_reason is not null then
      update public.account_deletion_requests
         set reason = v_reason
       where id = v_id;
    end if;
    return v_id;
  end if;

  insert into public.account_deletion_requests (user_id, organization_id, reason)
  values (v_uid, v_org, v_reason)
  returning id into v_id;

  -- Emit activity_logs bila pola konsisten dengan RPC S4 (setiap keputusan
  -- akun tercatat). Detail sengaja tidak berisi email/nama — actor_id sudah
  -- cukup jejak identitas untuk audit.
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
  values (v_org, v_uid, 'account', v_uid, 'request_deletion',
          jsonb_build_object('has_reason', v_reason is not null));

  return v_id;
end $$;

-- 3. RPC anonymize_account (admin-invoked)
create or replace function public.anonymize_account(
  p_target_user_id uuid,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_org uuid; v_target public.profiles; v_reason text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  v_org := public.current_user_org();
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  -- ANTI SELF-ANONYMIZE (pola S4-4): admin terakhir menghapus dirinya =
  -- organisasi terkunci tanpa jalur pulih. Kalau user genuinely mau resign,
  -- dia panggil request_account_deletion() dan admin lain memproses.
  if p_target_user_id = v_actor then
    raise exception 'Tidak bisa menganonimkan akun sendiri lewat jalur ini. Pakai request_account_deletion, dan admin lain akan memproses.' using errcode = '42501';
  end if;

  if not public.has_permission('manage_users_permissions') then
    raise exception 'Tidak berwenang menganonimkan pengguna' using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_target_user_id;
  if not found then
    raise exception 'Pengguna target tidak ditemukan' using errcode = 'P0002';
  end if;

  -- Cross-org guard: admin org hanya boleh menyentuh anggota org-nya sendiri.
  if v_target.organization_id is distinct from v_org then
    raise exception 'Pengguna target di luar organisasi Anda' using errcode = '42501';
  end if;

  -- Wipe PII di profiles. Email diganti alamat sintetis unik agar constraint
  -- UNIQUE (kalau ada di kolom email) tidak melempar antar-akun teranonimkan.
  update public.profiles set
    full_name = 'Pengguna [dihapus]',
    email = concat(id::text, '@anonymized.local'),
    position_title = null,
    is_active = false,
    updated_at = now()
  where id = p_target_user_id;

  -- Wipe metadata sesi di login_logs (IP + user_agent = PII kuat sesuai UU PDP).
  -- Baris tetap ada karena jejak login-attempt bernilai forensik.
  update public.login_logs
     set ip = null, user_agent = null
   where user_id = p_target_user_id;

  -- Tutup request pending (kalau ada).
  update public.account_deletion_requests
     set status = 'anonymized', resolved_at = now(), resolved_by = v_actor
   where user_id = p_target_user_id and status = 'pending';

  -- Log tindakan admin. Reason diambil apa adanya (tanpa PII sensitif —
  -- admin diinstruksikan tidak menulis nama/no telp di kolom ini).
  insert into public.activity_logs (organization_id, actor_id, entity_type, entity_id, action, detail)
  values (v_org, v_actor, 'account', p_target_user_id, 'anonymize',
          jsonb_build_object('has_reason', v_reason is not null));
end $$;

-- 4. RPC export_my_data (self-service, JSONB)
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_out jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'profile', (
      select jsonb_build_object(
        'id', p.id,
        'organization_id', p.organization_id,
        'role_template_id', p.role_template_id,
        'full_name', p.full_name,
        'email', p.email,
        'position_title', p.position_title,
        'is_active', p.is_active,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      from public.profiles p where p.id = v_uid
    ),
    'organization', (
      select jsonb_build_object('id', o.id, 'name', o.name, 'created_at', o.created_at)
      from public.organizations o
      where o.id = (select organization_id from public.profiles where id = v_uid)
    ),
    'activity_summary', (
      select jsonb_build_object(
        'count', count(*),
        'first_at', min(created_at),
        'last_at', max(created_at)
      )
      from public.activity_logs where actor_id = v_uid
    ),
    'goals_owned', (
      select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'status', g.status)), '[]'::jsonb)
      from public.goals g where g.pic_id = v_uid
    ),
    'action_plans_owned', (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'status', a.status)), '[]'::jsonb)
      from public.action_plans a where a.pic_id = v_uid
    ),
    'tasks_owned', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'status', t.status)), '[]'::jsonb)
      from public.tasks t where t.pic_id = v_uid
    ),
    'deletion_request', (
      select jsonb_build_object(
        'id', r.id,
        'requested_at', r.requested_at,
        'status', r.status,
        'resolved_at', r.resolved_at
      )
      from public.account_deletion_requests r
      where r.user_id = v_uid
      order by r.requested_at desc
      limit 1
    )
  ) into v_out;

  return v_out;
end $$;

-- 5. Hardening ACL: revoke default public/anon, grant hanya authenticated.
revoke execute on function public.request_account_deletion(text) from public, anon;
revoke execute on function public.anonymize_account(uuid, text) from public, anon;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.anonymize_account(uuid, text) to authenticated;
grant execute on function public.export_my_data() to authenticated;
