-- 0022 Cat-3 bundle: DB foundations untuk UI-S-AR1, UI-S-GV1, UI-S-OR1, UI-S-PRM1.
--
-- Yang dibangun (atomik per seksi, semua reversibel via DROP/ALTER … DROP COLUMN):
--   (A) restore_card RPC — kebalikan archive_card (UI-S-AR1).
--   (B) governance_violations + kolom resolution + resolve_governance_violation RPC (UI-S-GV1).
--   (C) create_position + create_role_template RPC (UI-S-OR1).
--   (D) user_permissions.scope kolom + set_user_permission_scope RPC (UI-S-PRM1).
--
-- Catatan governance: semua tulis ber-RPC SECURITY DEFINER + emit activity_log; direct DML ditutup.

-- ============================================================ (A) restore_card RPC

create or replace function public.restore_card(p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tbl text; v_status text; v_pic uuid;
begin
  v_tbl := case p_entity_type when 'action_plan' then 'action_plans'
    when 'initiative' then 'initiatives' when 'strategy' then 'strategies'
    when 'kpi_area' then 'kpi_areas' when 'goal' then 'goals'
    when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end;
  if v_tbl is null then raise exception 'Tipe card tidak valid.'; end if;
  execute format('select status, pic_id from public.%I where id = $1', v_tbl)
    into v_status, v_pic using p_entity_id;
  if v_status is null then raise exception 'Card tidak ditemukan.'; end if;
  if not (v_pic = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang memulihkan card ini.';
  end if;
  if v_status <> 'archived' then
    raise exception 'Hanya card berstatus diarsipkan yang dapat dipulihkan.';
  end if;
  -- Restore ke 'draft' supaya owner verifikasi ulang sebelum aktifkan kembali (governance-safe).
  execute format('update public.%I set status = ''draft'', archived_at = null where id = $1', v_tbl)
    using p_entity_id;
  perform public.write_activity(p_entity_type, p_entity_id, 'card_restored', '{}'::jsonb);
end;
$$;

revoke execute on function public.restore_card(text, uuid) from public, anon;
grant execute on function public.restore_card(text, uuid) to authenticated;

-- ============================================================ (B) Governance Violation resolution

alter table public.governance_violations
  add column if not exists resolution_status text not null default 'open'
    check (resolution_status in ('open','resolved','dismissed')),
  add column if not exists resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_gv_resolution_status
  on public.governance_violations (resolution_status, created_at desc);

create or replace function public.resolve_governance_violation(
  p_violation_id uuid, p_resolution_note text, p_status text default 'resolved'
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if not public.has_permission('view_governance_violation') then
    raise exception 'Anda tidak berwenang menutup pelanggaran governance.';
  end if;
  if p_status not in ('resolved','dismissed') then
    raise exception 'Status hanya boleh resolved atau dismissed.';
  end if;
  if length(coalesce(trim(p_resolution_note), '')) < 8 then
    raise exception 'Catatan penyelesaian wajib minimal 8 karakter.';
  end if;

  select organization_id into v_org from public.governance_violations where id = p_violation_id;
  if v_org is null then raise exception 'Pelanggaran tidak ditemukan.'; end if;
  if v_org <> public.current_user_org() then
    raise exception 'Pelanggaran dari organisasi lain.';
  end if;

  update public.governance_violations
     set resolution_status = p_status,
         resolution_note = trim(p_resolution_note),
         resolved_at = now(),
         resolved_by = auth.uid()
   where id = p_violation_id
     and resolution_status = 'open';

  if not found then
    raise exception 'Pelanggaran sudah ditutup atau tidak dapat diubah.';
  end if;

  perform public.write_activity('governance_violation', p_violation_id, 'violation_resolved',
    jsonb_build_object('status', p_status, 'note', trim(p_resolution_note)));
end;
$$;

revoke execute on function public.resolve_governance_violation(uuid, text, text) from public, anon;
grant execute on function public.resolve_governance_violation(uuid, text, text) to authenticated;

-- ============================================================ (C) create_position + create_role_template

create or replace function public.create_position(
  p_name text, p_department_id uuid default null, p_description text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_positions') then
    raise exception 'Anda tidak berwenang mengelola Posisi.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama Posisi wajib diisi.'; end if;
  v_org := public.current_user_org();
  if p_department_id is not null and not exists (
    select 1 from public.departments d where d.id = p_department_id and d.organization_id = v_org
  ) then raise exception 'Department tidak ditemukan di organisasi ini.'; end if;
  insert into public.positions (organization_id, department_id, name, description, created_by)
  values (v_org, p_department_id, trim(p_name), nullif(trim(coalesce(p_description,'')),''), auth.uid())
  returning id into v_id;
  perform public.write_activity('position', v_id, 'create', jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;

revoke execute on function public.create_position(text, uuid, text) from public, anon;
grant execute on function public.create_position(text, uuid, text) to authenticated;

create or replace function public.create_role_template(
  p_name text, p_level text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Anda tidak berwenang mengelola Role Template.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama Role wajib diisi.'; end if;
  if p_level not in ('ceo','c_level','management','staff') then
    raise exception 'Level harus salah satu dari ceo/c_level/management/staff.';
  end if;
  v_org := public.current_user_org();
  insert into public.role_templates (organization_id, name, level, is_system)
  values (v_org, trim(p_name), p_level, false)
  returning id into v_id;
  perform public.write_activity('role_template', v_id, 'create',
    jsonb_build_object('name', trim(p_name), 'level', p_level));
  return v_id;
end;
$$;

revoke execute on function public.create_role_template(text, text) from public, anon;
grant execute on function public.create_role_template(text, text) to authenticated;

-- ============================================================ (D) user_permissions.scope

alter table public.user_permissions
  add column if not exists scope text not null default 'org'
    check (scope in ('own','team','dept','org'));

create or replace function public.set_user_permission_scope(
  p_target_user_id uuid, p_permission_key text, p_scope text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_perm_id uuid; v_admin_org uuid; v_target_org uuid;
begin
  if not public.has_permission('manage_users_permissions') then
    raise exception 'Anda tidak berwenang mengubah scope permission.';
  end if;
  if p_scope not in ('own','team','dept','org') then
    raise exception 'Scope harus salah satu dari own/team/dept/org.';
  end if;
  select id into v_perm_id from public.permissions where key = p_permission_key;
  if v_perm_id is null then raise exception 'Permission key tidak ditemukan.'; end if;
  v_admin_org := public.current_user_org();
  select organization_id into v_target_org from public.profiles where id = p_target_user_id;
  if v_target_org is null or v_target_org <> v_admin_org then
    raise exception 'User target di luar organisasi Anda.';
  end if;
  -- Upsert dgn granted default true (scope tanpa grant tak masuk akal — caller bisa revoke via
  -- set_user_permission terpisah). Bila baris baru → granted=true.
  insert into public.user_permissions (user_id, permission_id, granted, scope)
  values (p_target_user_id, v_perm_id, true, p_scope)
  on conflict (user_id, permission_id) do update set scope = excluded.scope;

  perform public.write_activity('user_permission', p_target_user_id, 'permission_scope_updated',
    jsonb_build_object('permission_key', p_permission_key, 'scope', p_scope));
end;
$$;

revoke execute on function public.set_user_permission_scope(uuid, text, text) from public, anon;
grant execute on function public.set_user_permission_scope(uuid, text, text) to authenticated;
