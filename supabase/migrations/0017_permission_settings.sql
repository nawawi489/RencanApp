-- EMS V1.8.1 — permission-settings (#35 "User & Permission").
-- Spec: specs/permission-settings.md · TDD: specs/permission-settings-tdd-plan.md
-- Menambah jalur grant/revoke user_permissions yang aman (sebelumnya HANYA bisa via SQL mentah —
-- melanggar invarian tulis-via-RPC + tanpa audit). Tidak ada tabel/kolom/seed key baru;
-- reuse key existing manage_users_permissions (0001:208).
-- OQ-1 (owner 2026-06-26, ikuti preseden Fase 7): RPC kontrak THROW (returns void); logging
-- "percobaan ilegal" yang survive-rollback DITUNDA (accepted V1 limitation — butuh autonomous tx/
-- Edge Function). RPC cukup raise exception bahasa Indonesia; audit row HANYA pada SUCCESS path.

-- (3) Tutup gap privilege: user_permissions satu-satunya write-table tanpa revoke ini (semua tabel
-- Fase 8 punya). Tulis hanya via RPC SECURITY DEFINER di bawah.
revoke insert, update, delete on public.user_permissions from authenticated, anon;

-- (1) Single setter grant/revoke (FROZEN). Validasi urut (FR-8); tiap gagal → raise + rollback.
create or replace function public.set_user_permission(
  p_target_user_id uuid, p_permission_key text, p_granted boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_perm_id uuid; v_target_level text; v_prev boolean; v_reason text;
begin
  -- 1. GATE paling awal (cegah kebocoran info ke non-admin).
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengelola hak akses pengguna.';
  end if;
  -- 2. SELF diblok simetris (grant & revoke) — anti-lockout & anti-eskalasi.
  if p_target_user_id = auth.uid() then
    raise exception 'Anda tidak dapat mengubah hak akses Anda sendiri.';
  end if;
  -- 3. reason wajib ≤500.
  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then raise exception 'Alasan perubahan hak akses wajib diisi.'; end if;
  if length(v_reason) > 500 then raise exception 'Alasan terlalu panjang (maks 500 karakter).'; end if;
  -- 4. key valid.
  select id into v_perm_id from public.permissions where key = p_permission_key;
  if v_perm_id is null then raise exception 'Kunci hak akses tidak valid.'; end if;
  -- 5. target ada/aktif/org-sama (current_user_org NULL untuk caller nonaktif → tak ada match).
  v_org := public.current_user_org();
  select rt.level into v_target_level
  from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
  where p.id = p_target_user_id and p.organization_id = v_org and p.is_active;
  if v_target_level is null then raise exception 'Pengguna tidak ditemukan atau tidak aktif.'; end if;
  -- 6. target bukan CEO (hak CEO inheren, tak bisa diubah).
  if v_target_level = 'ceo' then raise exception 'Hak akses CEO tidak dapat diubah.'; end if;
  -- 7. delegasi gate key: grant manage_users_permissions hanya boleh oleh CEO (cegah rantai eskalasi).
  if p_permission_key = 'manage_users_permissions' and p_granted
     and coalesce(public.user_role_level() = 'ceo', false) = false then
    raise exception 'Hanya CEO yang dapat memberikan hak Kelola User & Permission.';
  end if;

  select granted into v_prev from public.user_permissions
    where user_id = p_target_user_id and permission_id = v_perm_id;

  if p_granted then
    insert into public.user_permissions (user_id, permission_id, granted)
    values (p_target_user_id, v_perm_id, true)
    on conflict (user_id, permission_id) do update set granted = true;
    perform public.write_activity('user_permission', p_target_user_id, 'user_permission_granted',
      jsonb_build_object('target_user_id', p_target_user_id, 'permission_key', p_permission_key,
        'granted', true, 'previous_granted', coalesce(v_prev, false), 'reason', v_reason));
  else
    -- 8. default-role permission tak bisa dicabut (melekat pada role — ubah role-nya).
    if v_target_level in ('c_level','management') and p_permission_key in
       ('create_initiative','create_action_plan','create_strategy',
        'create_department','manage_teams','review_deadline_changes')
    then raise exception 'Hak akses ini melekat pada role; ubah role untuk mencabutnya.'; end if;
    -- 9. anti-lockout: jangan cabut pemegang gate key terakhir saat tak ada CEO aktif di org.
    if p_permission_key = 'manage_users_permissions'
       and not exists (
         select 1 from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
         where p.organization_id = v_org and p.is_active and rt.level = 'ceo')
       and not exists (
         select 1 from public.user_permissions up
         join public.permissions pr on pr.id = up.permission_id
         join public.profiles p on p.id = up.user_id
         where pr.key = 'manage_users_permissions' and up.granted
           and p.organization_id = v_org and p.is_active and up.user_id <> p_target_user_id)
    then raise exception 'Tidak dapat mencabut pemegang Kelola User & Permission terakhir.'; end if;
    -- revoke = DELETE (has_permission abaikan granted=false → DELETE lebih bersih; jejak di activity_logs).
    delete from public.user_permissions where user_id = p_target_user_id and permission_id = v_perm_id;
    if not found then
      raise exception 'Hak akses ini tidak diberikan secara kustom; tidak ada yang dapat dicabut.';
    end if;
    perform public.write_activity('user_permission', p_target_user_id, 'user_permission_revoked',
      jsonb_build_object('target_user_id', p_target_user_id, 'permission_key', p_permission_key,
        'granted', false, 'previous_granted', coalesce(v_prev, false), 'reason', v_reason));
  end if;
end; $$;

revoke execute on function public.set_user_permission(uuid, text, boolean, text) from public, anon;

-- (2) Read admin ber-gate (BUKAN RLS transparan). is_default identik logika default has_permission.
create or replace function public.list_user_permissions_admin(p_target_user_id uuid)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_level text;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang melihat hak akses pengguna.';
  end if;
  v_org := public.current_user_org();
  select rt.level into v_level
  from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
  where p.id = p_target_user_id and p.organization_id = v_org;
  if v_level is null then raise exception 'Pengguna tidak ditemukan di organisasi ini.'; end if;
  return query
  select jsonb_build_object(
    'key', pm.key,
    'label', pm.label,
    'granted', (v_level = 'ceo')
      or (v_level in ('c_level','management') and pm.key in
         ('create_initiative','create_action_plan','create_strategy',
          'create_department','manage_teams','review_deadline_changes'))
      or coalesce(up.granted, false),
    'is_default', (v_level = 'ceo')
      or (v_level in ('c_level','management') and pm.key in
         ('create_initiative','create_action_plan','create_strategy',
          'create_department','manage_teams','review_deadline_changes')))
  from public.permissions pm
  left join public.user_permissions up
    on up.permission_id = pm.id and up.user_id = p_target_user_id
  order by pm.key;
end; $$;

revoke execute on function public.list_user_permissions_admin(uuid) from public, anon;
