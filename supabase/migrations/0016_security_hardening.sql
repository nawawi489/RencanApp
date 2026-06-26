-- EMS V1.8.1 — Hardening pasca-review keseluruhan code (CRITICAL/HIGH).
-- Tutup gap:
--   (1) cancel_card kurang authz + tanpa org-scoping  (CRITICAL #1 review)
--   (2) Deactivated users (profiles.is_active=false) tetap dapat akses (HIGH #5)
--   (3) grant_confidential_access tanpa verifikasi entity & user satu-org (HIGH #9)
--   (4) brief_understanding_records insert/update belum verifikasi video_brief_id satu-org (MEDIUM)
-- Tidak menyentuh migrasi lama. Idempoten (create or replace; drop policy if exists).

-- ============================================================ (2) is_active gate
-- current_user_org: kembalikan NULL untuk user nonaktif → semua policy yang membandingkan
-- organization_id = current_user_org() ikut block. Tetap stable + security definer.
create or replace function public.current_user_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles
  where id = auth.uid() and is_active = true;
$$;

-- user_role_level: NULL untuk user nonaktif (mempengaruhi has_permission CEO-shortcut).
create or replace function public.user_role_level()
returns text language sql stable security definer set search_path = '' as $$
  select rt.level
  from public.profiles p
  join public.role_templates rt on rt.id = p.role_template_id
  where p.id = auth.uid() and p.is_active = true;
$$;

-- has_permission: tegaskan is_active sebagai pre-condition (defense in depth — user_role_level
-- sudah NULL untuk nonaktif, dan klausa EXISTS sudah join profiles, tapi user_permissions klausa
-- tidak menyaring is_active; kita batasi via outer guard).
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
          'create_department', 'manage_teams', 'review_deadline_changes'
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

-- ============================================================ (1) cancel_card hardening
-- Replace dengan: resolve target row → cek organization_id = caller_org → gate authorization
-- (CEO / has_permission('manage_others_cards') / PIC sebenarnya / creator) sebelum
-- count child & mutasi status. Hilangkan bypass cross-tenant via SECURITY DEFINER.

create or replace function public.cancel_card(
  p_entity_type text, p_entity_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_org uuid;
  v_caller_org uuid;
  v_active_children int := 0;
  v_is_ceo boolean;
  v_can_manage boolean;
  v_pic uuid;
  v_created_by uuid;
  v_authorized boolean;
begin
  if p_entity_type not in ('action_plan','initiative','strategy','kpi_area','goal',
                           'development_area','problem_statement') then
    raise exception 'Tipe card tidak valid.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi.';
  end if;

  v_caller_org := public.current_user_org();
  if v_caller_org is null then
    raise exception 'Sesi tidak valid.';
  end if;

  -- Resolve organization_id + pic_id/created_by target untuk org-scoping + authz.
  -- Tabel-tabel yang berbeda punya kolom berbeda; tangani per-cabang.
  if p_entity_type = 'action_plan' then
    select organization_id, pic_id, created_by into v_org, v_pic, v_created_by
      from public.action_plans where id = p_entity_id;
  elsif p_entity_type = 'initiative' then
    select organization_id, pic_id, created_by into v_org, v_pic, v_created_by
      from public.initiatives where id = p_entity_id;
  elsif p_entity_type = 'strategy' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.strategies where id = p_entity_id;
  elsif p_entity_type = 'kpi_area' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.kpi_areas where id = p_entity_id;
  elsif p_entity_type = 'goal' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.goals where id = p_entity_id;
  elsif p_entity_type = 'development_area' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.development_areas where id = p_entity_id;
  elsif p_entity_type = 'problem_statement' then
    select organization_id, pic_id, created_by into v_org, v_pic, v_created_by
      from public.problem_statements where id = p_entity_id;
  end if;

  if v_org is null then
    raise exception 'Card tidak ditemukan.';
  end if;
  if v_org <> v_caller_org then
    raise exception 'Card di luar organisasi Anda.';
  end if;

  v_is_ceo := (public.user_role_level() = 'ceo');
  v_can_manage := public.has_permission('manage_others_cards');
  v_authorized := v_is_ceo
                  or v_can_manage
                  or (v_pic is not null and v_pic = auth.uid())
                  or (v_created_by is not null and v_created_by = auth.uid());

  if not v_authorized then
    raise exception 'Anda tidak berwenang membatalkan card ini.';
  end if;

  -- Hitung child aktif (status not in archived/cancelled) — sekarang org-scoped sudah aman.
  if p_entity_type = 'goal' then
    select count(*) into v_active_children from public.kpi_areas
      where goal_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'kpi_area' then
    select count(*) into v_active_children from public.strategies
      where kpi_area_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'strategy' then
    select count(*) into v_active_children from public.initiatives
      where strategy_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'initiative' then
    select count(*) into v_active_children from public.action_plans
      where initiative_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'development_area' then
    select count(*) into v_active_children from public.problem_statements
      where development_area_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'problem_statement' then
    select count(*) into v_active_children from public.initiatives
      where problem_statement_id = p_entity_id and status not in ('archived','cancelled');
  end if;
  if v_active_children > 0 then
    raise exception 'Terdapat % card turunan yang masih aktif.', v_active_children;
  end if;

  insert into public.cancellations (organization_id, entity_type, entity_id, cancelled_by, reason,
    approval_status, approved_by, approved_at)
  values (v_caller_org, p_entity_type, p_entity_id, auth.uid(), trim(p_reason),
    case when v_is_ceo then 'auto_approved' else 'pending' end,
    case when v_is_ceo then auth.uid() else null end,
    case when v_is_ceo then now() else null end)
  returning id into v_id;

  if v_is_ceo then
    -- Org sudah diverifikasi di atas; mutasi tetap bawa filter org untuk defense-in-depth.
    execute format(
      'update public.%I set status = ''cancelled'' where id = $1 and organization_id = $2',
      case p_entity_type
        when 'action_plan' then 'action_plans'
        when 'initiative' then 'initiatives'
        when 'strategy' then 'strategies'
        when 'kpi_area' then 'kpi_areas'
        when 'goal' then 'goals'
        when 'development_area' then 'development_areas'
        when 'problem_statement' then 'problem_statements'
      end
    ) using p_entity_id, v_caller_org;
    perform public.write_activity(p_entity_type, p_entity_id, 'card_cancelled',
      jsonb_build_object('cancellation_id', v_id, 'reason', trim(p_reason)));
  else
    perform public.write_activity(p_entity_type, p_entity_id, 'cancellation_requested',
      jsonb_build_object('cancellation_id', v_id, 'reason', trim(p_reason)));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.cancel_card(text, uuid, text) from public, anon;

-- ============================================================ (3) grant_confidential_access
-- Verifikasi entity dan target user berada di organisasi pemanggil.

create or replace function public.grant_confidential_access(
  p_entity_type text, p_entity_id uuid, p_user_id uuid, p_access_level text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_org uuid;
  v_entity_org uuid;
  v_target_org uuid;
begin
  if not public.has_permission('manage_confidential_access') then
    raise exception 'Anda tidak berwenang mengelola Akses Rahasia.';
  end if;
  if p_entity_type not in ('action_plan','initiative','strategy','kpi_area','goal') then
    raise exception 'Tipe card tidak valid untuk akses rahasia.';
  end if;
  if coalesce(p_access_level,'restricted') not in ('restricted','confidential') then
    raise exception 'Level akses tidak valid.';
  end if;
  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Sesi tidak valid.';
  end if;

  -- Resolve organization_id entity target per tipe.
  if p_entity_type = 'action_plan' then
    select organization_id into v_entity_org from public.action_plans where id = p_entity_id;
  elsif p_entity_type = 'initiative' then
    select organization_id into v_entity_org from public.initiatives where id = p_entity_id;
  elsif p_entity_type = 'strategy' then
    select organization_id into v_entity_org from public.strategies where id = p_entity_id;
  elsif p_entity_type = 'kpi_area' then
    select organization_id into v_entity_org from public.kpi_areas where id = p_entity_id;
  elsif p_entity_type = 'goal' then
    select organization_id into v_entity_org from public.goals where id = p_entity_id;
  end if;
  if v_entity_org is null or v_entity_org <> v_org then
    raise exception 'Card target di luar organisasi Anda.';
  end if;

  select organization_id into v_target_org from public.profiles where id = p_user_id;
  if v_target_org is null or v_target_org <> v_org then
    raise exception 'Target user di luar organisasi Anda.';
  end if;

  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, access_level, granted_by, approval_reason)
  values (v_org, p_entity_type, p_entity_id, p_user_id, coalesce(p_access_level,'restricted'),
          auth.uid(), nullif(trim(coalesce(p_reason,'')),''))
  on conflict (entity_type, entity_id, user_id) do update set
    access_level = excluded.access_level, approval_reason = excluded.approval_reason,
    granted_by = excluded.granted_by
  returning id into v_id;
  perform public.write_activity(p_entity_type, p_entity_id, 'confidential_access_granted',
    jsonb_build_object('user_id', p_user_id, 'access_level', coalesce(p_access_level,'restricted')));
  return v_id;
end;
$$;
revoke execute on function public.grant_confidential_access(text, uuid, uuid, text, text) from public, anon;

-- ============================================================ (4) brief_understanding_records
-- Tambah verifikasi video_brief_id berada di organisasi pemanggil pada INSERT & UPDATE.

drop policy if exists "bur_insert" on public.brief_understanding_records;
create policy "bur_insert" on public.brief_understanding_records for insert to authenticated
  with check (
    organization_id = public.current_user_org()
    and user_id = auth.uid()
    and exists (
      select 1 from public.video_briefs vb
      where vb.id = brief_understanding_records.video_brief_id
        and vb.organization_id = public.current_user_org()
    )
  );

drop policy if exists "bur_update" on public.brief_understanding_records;
create policy "bur_update" on public.brief_understanding_records for update to authenticated
  using (organization_id = public.current_user_org() and user_id = auth.uid())
  with check (
    organization_id = public.current_user_org()
    and user_id = auth.uid()
    and exists (
      select 1 from public.video_briefs vb
      where vb.id = brief_understanding_records.video_brief_id
        and vb.organization_id = public.current_user_org()
    )
  );
