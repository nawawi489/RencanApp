-- 0072 — Restore permission-settings hardening lost by later migrations.
--
-- Regression audit (branch ci/db-contract-tests, contract 0017_permission_settings_contract):
--
-- (A) TABLE WRITE GRANT (test N_table_write_grant)
--     0017 (line 12) revoked INSERT/UPDATE/DELETE on public.user_permissions from
--     `authenticated`/`anon` so the SECURITY DEFINER RPC set_user_permission is the ONLY
--     write path (its CEO/delegation/self checks cannot be bypassed). 0036's bulk
--     `GRANT ... ON TABLE public.<every table> TO authenticated` (and SELECT to anon)
--     silently re-granted them. Today RLS still blocks direct writes (no permissive
--     INSERT/UPDATE/DELETE policy exists → INSERT raises 42501, UPDATE/DELETE touch 0 rows),
--     so this is not yet exploitable — but the safety now rests ENTIRELY on the absence of
--     any write policy. The moment a future migration adds one, the stray grant becomes a
--     privilege-escalation surface that bypasses the RPC. Restore defense-in-depth.
--
-- (B) SELF-MODIFICATION GUARD (test B_self)
--     0017 (lines 25-28) rejected any self-change ("...hak akses Anda sendiri.") — a
--     separation-of-duties / anti-lockout invariant. 0041's rewrite (department-admin-only)
--     copied the body but dropped that block. Result: a staff user holding delegated
--     `manage_users_permissions` can self-grant ANY non-delegation permission
--     (view_all_workspace, create_strategy, manage_teams, review_deadline_changes, ...) with
--     no second actor. (Self-granting manage_users_permissions itself stays CEO-gated.)
--     This IS exploitable today. Restore the guard.
--
-- No behavior change beyond restoring the two invariants; all other 0041 validation kept identical.

-- (A) Re-revoke direct write privileges — RPC set_user_permission remains the only write path.
revoke insert, update, delete on public.user_permissions from authenticated, anon;

-- (B) Recreate set_user_permission with the self-guard restored (placement + message per 0017).
create or replace function public.set_user_permission(
  p_target_user_id uuid, p_permission_key text, p_granted boolean, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_perm_id uuid; v_target_level text; v_prev boolean; v_reason text;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengubah hak akses pengguna.';
  end if;
  -- SELF diblok simetris (grant & revoke) — anti-lockout & anti-eskalasi (restored: 0017 → dropped in 0041).
  if p_target_user_id = auth.uid() then
    raise exception 'Anda tidak dapat mengubah hak akses Anda sendiri.';
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
