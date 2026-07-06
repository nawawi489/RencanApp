-- 0041 — Department = admin-only (ikuti PRD §34.3 + §9).
-- Temuan QA 2026-07-07 (ISSUE-001): Manager/C-Level bisa membuat Departemen karena
-- `create_department` termasuk 6 kunci default role c_level/management (0016/0017 + spec).
-- PRD §9 tidak mencantumkan pengelolaan Department sebagai permission utama, dan §34.3
-- menempatkan Organization/Department di bawah Admin Settings (admin-gated). Owner memilih
-- "ikuti PRD": cabut create_department dari bundle default → hanya CEO (bypass) atau grant
-- eksplisit lewat Permission Settings. 5 kunci default tersisa tetap kapabilitas Manager sah
-- (buat card + kelola tim + review deadline change).
--
-- Sinkron 3-arah (WAJIB identik): fungsi ini (server) + MGR_DEFAULT_KEYS (klien,
-- lib/permission-defaults.ts) + spec permission-settings.md §5.2/§5.3.

-- (1) has_permission — hapus create_department dari default c_level/management.
create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.profiles
                     where id = auth.uid() and is_active = true) then false
    else (
      coalesce(public.user_role_level() = 'ceo', false)
      or (
        public.user_role_level() in ('c_level', 'management')
        and p_key in (
          'create_initiative', 'create_action_plan', 'create_strategy',
          'manage_teams', 'review_deadline_changes'
        )
      )
      or exists (
        select 1 from public.user_permissions up
        join public.permissions pr on pr.id = up.permission_id
        where up.user_id = auth.uid() and pr.key = p_key and up.granted = true
      )
    )
  end;
$$;

-- (2) set_user_permission — revoke-default guard tanpa create_department (kini bisa
-- di-grant/revoke eksplisit untuk c_level/management).
create or replace function public.set_user_permission(
  p_target_user_id uuid, p_permission_key text, p_granted boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_perm_id uuid; v_target_level text; v_prev boolean; v_reason text;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengubah hak akses pengguna.';
  end if;
  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then raise exception 'Alasan perubahan wajib diisi.'; end if;
  v_org := public.current_user_org();
  select id into v_perm_id from public.permissions where key = p_permission_key;
  if v_perm_id is null then raise exception 'Permission tidak dikenal: %', p_permission_key; end if;
  select rt.level into v_target_level
  from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
  where p.id = p_target_user_id and p.organization_id = v_org and p.is_active;
  if v_target_level is null then raise exception 'Pengguna tidak ditemukan atau tidak aktif.'; end if;
  if v_target_level = 'ceo' then raise exception 'Hak akses CEO tidak dapat diubah.'; end if;
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
    if v_target_level in ('c_level','management') and p_permission_key in
       ('create_initiative','create_action_plan','create_strategy',
        'manage_teams','review_deadline_changes')
    then raise exception 'Hak akses ini melekat pada role; ubah role untuk mencabutnya.'; end if;
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

-- (3) list_user_permissions_admin — is_default/granted identik logika default has_permission.
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
          'manage_teams','review_deadline_changes'))
      or coalesce(up.granted, false),
    'is_default', (v_level = 'ceo')
      or (v_level in ('c_level','management') and pm.key in
         ('create_initiative','create_action_plan','create_strategy',
          'manage_teams','review_deadline_changes')))
  from public.permissions pm
  left join public.user_permissions up
    on up.permission_id = pm.id and up.user_id = p_target_user_id
  order by pm.key;
end; $$;

revoke execute on function public.list_user_permissions_admin(uuid) from public, anon;
