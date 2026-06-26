-- EMS V1.8.1 — Fase 8: Governance & Admin Lengkap (exit V1.8.1).
-- 11 tabel baru: departments, positions, teams, team_members, deadline_change_requests,
--   deadline_change_logs, cancellations, evaluations, confidential_access_rules,
--   video_briefs, brief_understanding_records. (41 + 11 = 52 public; +auth.users = 53 PRD §83.)
-- ALTER 7 tabel card: tambah status 'cancelled' + kolom archived_at.
-- 6 permission keys baru (per-row WHERE NOT EXISTS guard). has_permission extend default MGR/C-Level.
-- 12 RPC SECURITY DEFINER. Trigger guard deadline langsung di action_plans. Append-only triggers.
-- can_access_initiative/can_access_action_plan diperluas dengan confidential check.
--
-- Keputusan mengikat (lihat spec specs/fase-8-governance-admin.md §0 koreksi grill):
--   C1 permission key view_governance_violation SINGULAR (sudah ada Fase 0). JANGAN seed ulang.
--   C2 write_activity_system tetap 6-param (p_org,p_actor,p_entity_type,p_entity_id,p_action,p_detail).
--      Trigger Fase 8 pakai write_activity (4-param, actor=auth.uid()) — TIDAK redefinisi.
--   C3 'cancelled' ditambah ke CHECK status 7 tabel card via DROP+ADD constraint.
--   C4 kolom requestor_id (bukan requested_by).
--   GOV: refusal/gate-block hanya RAISE (rollback tx). governance_violations hanya untuk tindakan
--      terlarang yang BERHASIL (mis. self-approval bypass) → ditandai (best-effort) di V1.

-- ============================================================ PERMISSION: extend has_permission
-- MGR/C-Level default Fase 8: create_department, manage_teams, review_deadline_changes (PRD §54-58).
-- Pertahankan default eksekusi card existing.

create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.user_role_level() = 'ceo', false)
    or (
      public.user_role_level() in ('c_level', 'management')
      and p_key in (
        'create_initiative', 'create_action_plan', 'create_strategy',
        'create_department', 'manage_teams', 'review_deadline_changes'
      )
    )
    or exists (
      select 1
      from public.user_permissions up
      join public.permissions pm on pm.id = up.permission_id
      where up.user_id = auth.uid() and pm.key = p_key and up.granted
    );
$$;

-- ============================================================ PERMISSION: seed 6 keys baru
-- Per-row WHERE NOT EXISTS guard (C6). view_activity_log/view_governance_violation/manage_settings/
-- manage_users_permissions/manage_card_completion_rule SUDAH ada Fase 0 — tidak di-seed ulang.

insert into public.permissions (key, label)
select v.key, v.label from (values
  ('create_department',          'Membuat Department'),
  ('manage_positions',           'Kelola Posisi'),
  ('manage_teams',               'Kelola Tim'),
  ('manage_confidential_access', 'Kelola Akses Rahasia'),
  ('review_deadline_changes',    'Review Perubahan Deadline'),
  ('manage_video_briefs',        'Kelola Video Brief')
) as v(key, label)
where not exists (select 1 from public.permissions p where p.key = v.key);

-- ============================================================ ALTER 7 tabel card: status 'cancelled' + archived_at

alter table public.goals
  drop constraint if exists goals_status_check,
  add constraint goals_status_check check (status in ('draft','active','done','archived','cancelled'));
alter table public.kpi_areas
  drop constraint if exists kpi_areas_status_check,
  add constraint kpi_areas_status_check check (status in ('draft','active','done','archived','cancelled'));
alter table public.strategies
  drop constraint if exists strategies_status_check,
  add constraint strategies_status_check check (status in ('draft','active','done','archived','cancelled'));
alter table public.initiatives
  drop constraint if exists initiatives_status_check,
  add constraint initiatives_status_check check (status in ('draft','active','done','archived','cancelled'));
alter table public.development_areas
  drop constraint if exists development_areas_status_check,
  add constraint development_areas_status_check check (status in ('draft','active','done','archived','cancelled'));
alter table public.problem_statements
  drop constraint if exists problem_statements_status_check,
  add constraint problem_statements_status_check check (status in ('draft','active','done','archived','cancelled'));
alter table public.action_plans
  drop constraint if exists action_plans_status_check,
  add constraint action_plans_status_check
    check (status in ('draft','assigned','in_progress','submitted','done','revision','archived','cancelled'));

alter table public.goals              add column if not exists archived_at timestamptz;
alter table public.kpi_areas          add column if not exists archived_at timestamptz;
alter table public.strategies         add column if not exists archived_at timestamptz;
alter table public.initiatives        add column if not exists archived_at timestamptz;
alter table public.development_areas  add column if not exists archived_at timestamptz;
alter table public.problem_statements add column if not exists archived_at timestamptz;
alter table public.action_plans       add column if not exists archived_at timestamptz;

-- settings: unique(org,key) agar upsert_settings ON CONFLICT bekerja (idempoten).
create unique index if not exists settings_org_key_uniq
  on public.settings (organization_id, key);

-- Tambah 3 tipe notifikasi DCR ke CHECK notifications.type (Fase 3 enum).
alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check check (type = any (array[
    'review_request','approved','rejected','deadline_reminder','repeat_due','instance_missed',
    'comment','mention','governance_warning',
    'deadline_change_requested','deadline_change_approved','deadline_change_rejected'
  ]));

-- ============================================================ TABLES (11 baru)

create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.positions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id   uuid references public.departments(id) on delete set null,
  name            text not null,
  description     text,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id   uuid references public.departments(id) on delete set null,
  name            text not null,
  description     text,
  lead_id         uuid references public.profiles(id) on delete set null,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.team_members (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_in_team    text,
  joined_at       timestamptz not null default now(),
  unique (team_id, profile_id)
);

create table if not exists public.deadline_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  entity_type        text not null check (entity_type = 'action_plan'),
  entity_id          uuid not null,
  old_deadline       date not null,
  new_deadline       date not null,
  reason             text not null,
  impact_if_rejected text,
  evidence_note      text,
  requestor_id       uuid not null references public.profiles(id) on delete restrict,
  approver_id        uuid references public.profiles(id) on delete set null,
  status             text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason   text,
  responded_at       timestamptz,
  created_at         timestamptz not null default now(),
  constraint dcr_requestor_ne_approver
    check (approver_id is null or requestor_id <> approver_id)
);
create unique index if not exists dcr_one_pending_per_entity
  on public.deadline_change_requests (entity_type, entity_id) where status = 'pending';

create table if not exists public.deadline_change_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id      uuid not null references public.deadline_change_requests(id) on delete cascade,
  action          text not null check (action in ('submitted','approved','rejected','cancelled')),
  actor_id        uuid references public.profiles(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now()
);

create table if not exists public.cancellations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type     text not null check (entity_type in (
    'action_plan','initiative','strategy','kpi_area','goal','development_area','problem_statement')),
  entity_id       uuid not null,
  cancelled_by    uuid not null references public.profiles(id) on delete restrict,
  reason          text not null,
  approval_status text not null default 'pending'
    check (approval_status in ('auto_approved','pending','approved','rejected')),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.evaluations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  initiative_id     uuid not null references public.initiatives(id) on delete cascade,
  target_achieved   text check (target_achieved in ('ya','sebagian','tidak')),
  results           text,
  success_factors   text[],
  failure_factors   text[],
  lessons_learned   text,
  should_become_sop boolean not null default false,
  rollout_needed    boolean not null default false,
  rollout_notes     text,
  evaluated_by      uuid not null references public.profiles(id) on delete restrict,
  pic_id            uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (initiative_id),
  constraint evaluations_pic_ne_evaluator check (pic_id is null or pic_id <> evaluated_by)
);

create table if not exists public.confidential_access_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type     text not null check (entity_type in ('action_plan','initiative','strategy','kpi_area','goal')),
  entity_id       uuid not null,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  access_level    text not null default 'restricted' check (access_level in ('restricted','confidential')),
  granted_by      uuid not null references public.profiles(id) on delete restrict,
  approval_reason text,
  created_at      timestamptz not null default now(),
  unique (entity_type, entity_id, user_id)
);

create table if not exists public.video_briefs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  initiative_id    uuid not null references public.initiatives(id) on delete cascade,
  brief_url        text not null,
  duration_seconds int,
  description      text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (initiative_id)
);

create table if not exists public.brief_understanding_records (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  video_brief_id    uuid not null references public.video_briefs(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  watched_at        timestamptz not null default now(),
  timestamp_seconds int,
  is_understood     boolean not null default false,
  unique (video_brief_id, user_id)
);

-- Indexes
create index if not exists idx_positions_dept on public.positions (department_id);
create index if not exists idx_teams_dept on public.teams (department_id);
create index if not exists idx_team_members_team on public.team_members (team_id);
create index if not exists idx_team_members_profile on public.team_members (profile_id);
create index if not exists idx_dcr_entity on public.deadline_change_requests (entity_type, entity_id);
create index if not exists idx_dcr_requestor on public.deadline_change_requests (requestor_id);
create index if not exists idx_dcl_request on public.deadline_change_logs (request_id);
create index if not exists idx_cancellations_entity on public.cancellations (entity_type, entity_id);
create index if not exists idx_car_entity on public.confidential_access_rules (entity_type, entity_id);
create index if not exists idx_car_user on public.confidential_access_rules (user_id);
create index if not exists idx_bur_video on public.brief_understanding_records (video_brief_id);

-- updated_at triggers
drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();
drop trigger if exists positions_set_updated_at on public.positions;
create trigger positions_set_updated_at before update on public.positions
  for each row execute function public.set_updated_at();
drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();
drop trigger if exists evaluations_set_updated_at on public.evaluations;
create trigger evaluations_set_updated_at before update on public.evaluations
  for each row execute function public.set_updated_at();

-- ============================================================ RLS ENABLE

alter table public.departments               enable row level security;
alter table public.positions                 enable row level security;
alter table public.teams                      enable row level security;
alter table public.team_members               enable row level security;
alter table public.deadline_change_requests   enable row level security;
alter table public.deadline_change_logs       enable row level security;
alter table public.cancellations              enable row level security;
alter table public.evaluations                enable row level security;
alter table public.confidential_access_rules  enable row level security;
alter table public.video_briefs               enable row level security;
alter table public.brief_understanding_records enable row level security;

-- ============================================================ RLS POLICIES
-- Org-scoped SELECT; tulis via RPC SECURITY DEFINER (default-deny INSERT/UPDATE/DELETE).

-- departments / positions / teams: org-scoped read; tulis via RPC.
drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments for select to authenticated
  using (organization_id = public.current_user_org());
drop policy if exists "positions_select" on public.positions;
create policy "positions_select" on public.positions for select to authenticated
  using (organization_id = public.current_user_org());
drop policy if exists "teams_select" on public.teams;
create policy "teams_select" on public.teams for select to authenticated
  using (organization_id = public.current_user_org());
drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members for select to authenticated
  using (organization_id = public.current_user_org());

-- deadline_change_requests: requestor/approver/reviewer/audit-viewer.
drop policy if exists "dcr_select" on public.deadline_change_requests;
create policy "dcr_select" on public.deadline_change_requests for select to authenticated
  using (organization_id = public.current_user_org()
         and (requestor_id = auth.uid() or approver_id = auth.uid()
              or public.has_permission('review_deadline_changes')
              or public.has_permission('view_activity_log')));

drop policy if exists "dcl_select" on public.deadline_change_logs;
create policy "dcl_select" on public.deadline_change_logs for select to authenticated
  using (organization_id = public.current_user_org()
         and exists (select 1 from public.deadline_change_requests r
                     where r.id = request_id
                       and (r.requestor_id = auth.uid() or r.approver_id = auth.uid()
                            or public.has_permission('review_deadline_changes')
                            or public.has_permission('view_activity_log'))));

-- cancellations: actor/approver/audit-viewer.
drop policy if exists "cancellations_select" on public.cancellations;
create policy "cancellations_select" on public.cancellations for select to authenticated
  using (organization_id = public.current_user_org()
         and (cancelled_by = auth.uid() or approved_by = auth.uid()
              or public.has_permission('view_activity_log')
              or public.has_permission('manage_others_cards')));

-- evaluations: siapa pun yang bisa akses initiative-nya.
drop policy if exists "evaluations_select" on public.evaluations;
create policy "evaluations_select" on public.evaluations for select to authenticated
  using (organization_id = public.current_user_org()
         and public.can_access_initiative(initiative_id));

-- confidential_access_rules: user yg di-grant / pemberi / pengelola.
drop policy if exists "car_select" on public.confidential_access_rules;
create policy "car_select" on public.confidential_access_rules for select to authenticated
  using (organization_id = public.current_user_org()
         and (user_id = auth.uid() or granted_by = auth.uid()
              or public.has_permission('manage_confidential_access')));

-- video_briefs: via can_access_initiative.
drop policy if exists "video_briefs_select" on public.video_briefs;
create policy "video_briefs_select" on public.video_briefs for select to authenticated
  using (organization_id = public.current_user_org()
         and public.can_access_initiative(initiative_id));

-- brief_understanding_records: diri sendiri / pengelola video brief. Tulis langsung oleh user.
drop policy if exists "bur_select" on public.brief_understanding_records;
create policy "bur_select" on public.brief_understanding_records for select to authenticated
  using (organization_id = public.current_user_org()
         and (user_id = auth.uid() or public.has_permission('manage_video_briefs')));
drop policy if exists "bur_insert" on public.brief_understanding_records;
create policy "bur_insert" on public.brief_understanding_records for insert to authenticated
  with check (organization_id = public.current_user_org() and user_id = auth.uid());
drop policy if exists "bur_update" on public.brief_understanding_records;
create policy "bur_update" on public.brief_understanding_records for update to authenticated
  using (organization_id = public.current_user_org() and user_id = auth.uid())
  with check (organization_id = public.current_user_org() and user_id = auth.uid());

-- Default-deny direct writes (tulis via RPC SECURITY DEFINER).
revoke insert, update, delete on public.departments              from authenticated, anon;
revoke insert, update, delete on public.positions                from authenticated, anon;
revoke insert, update, delete on public.teams                     from authenticated, anon;
revoke insert, update, delete on public.team_members              from authenticated, anon;
revoke insert, update, delete on public.deadline_change_requests  from authenticated, anon;
revoke insert, update, delete on public.deadline_change_logs      from authenticated, anon;
revoke insert, update, delete on public.cancellations             from authenticated, anon;
revoke insert, update, delete on public.evaluations               from authenticated, anon;
revoke insert, update, delete on public.confidential_access_rules from authenticated, anon;
revoke insert, update, delete on public.video_briefs              from authenticated, anon;
revoke delete on public.brief_understanding_records               from authenticated, anon;

-- ============================================================ APPEND-ONLY TRIGGERS

drop trigger if exists dcr_no_delete on public.deadline_change_requests;
create trigger dcr_no_delete before delete on public.deadline_change_requests
  for each row execute function public.tg_block_delete_append_only();
drop trigger if exists dcl_no_delete on public.deadline_change_logs;
create trigger dcl_no_delete before delete on public.deadline_change_logs
  for each row execute function public.tg_block_delete_append_only();
drop trigger if exists cancellations_no_delete on public.cancellations;
create trigger cancellations_no_delete before delete on public.cancellations
  for each row execute function public.tg_block_delete_append_only();
drop trigger if exists evaluations_no_delete on public.evaluations;
create trigger evaluations_no_delete before delete on public.evaluations
  for each row execute function public.tg_block_delete_append_only();

-- Activity log untuk departments/teams ditulis via write_activity di dalam RPC create_*.
-- (log_card_creation() me-refer new.status yang TIDAK ada di departments/teams.)

-- ============================================================ GUARD: direct deadline update on AP
-- Saat AP sedang dieksekusi (bukan draft/done/archived/cancelled), kolom deadline tidak boleh
-- diubah langsung — harus lewat RPC review_deadline_change (set session var bypass).

create or replace function public.tg_guard_ap_deadline_direct_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status not in ('draft','done','archived','cancelled')
     and new.deadline is distinct from old.deadline
     and current_setting('app.allow_deadline_update', true) is distinct from 'true'
  then
    raise exception 'Perubahan deadline Action Plan aktif harus melalui proses Deadline Change Request.';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_guard_ap_deadline_direct_update() from public, anon;

drop trigger if exists action_plans_guard_deadline_update on public.action_plans;
create trigger action_plans_guard_deadline_update before update on public.action_plans
  for each row execute function public.tg_guard_ap_deadline_direct_update();

-- ============================================================ CONFIDENTIAL: extend can_access_*
-- Pertahankan logika akses live (initiative_has_my_action_plan, is_problem_statement_pic, dsb),
-- tambah AND-clause confidential: jika ada rule untuk entity, hanya CEO/PIC/whitelisted yg lolos.

create or replace function public.can_access_initiative(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i
    where i.id = p_initiative
      and i.organization_id = public.current_user_org()
      and (public.can_view_workspace() or i.pic_id = auth.uid()
           or i.created_by = auth.uid() or public.initiative_has_my_action_plan(i.id)
           or public.is_problem_statement_pic(i.problem_statement_id))
      and (
        not exists (select 1 from public.confidential_access_rules cr
                    where cr.entity_type = 'initiative' and cr.entity_id = i.id)
        or public.user_role_level() = 'ceo'
        or i.pic_id = auth.uid()
        or exists (select 1 from public.confidential_access_rules cr
                   where cr.entity_type = 'initiative' and cr.entity_id = i.id
                     and cr.user_id = auth.uid())
      )
  );
$$;

create or replace function public.can_access_action_plan(p_action_plan uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.action_plans a
    left join public.initiatives i on i.id = a.initiative_id
    where a.id = p_action_plan
      and a.organization_id = public.current_user_org()
      and (public.can_view_workspace() or a.pic_id = auth.uid()
           or a.reviewer_id = auth.uid() or a.created_by = auth.uid()
           or i.pic_id = auth.uid())
      and (
        not exists (select 1 from public.confidential_access_rules cr
                    where cr.entity_type = 'action_plan' and cr.entity_id = a.id)
        or public.user_role_level() = 'ceo'
        or a.pic_id = auth.uid()
        or exists (select 1 from public.confidential_access_rules cr
                   where cr.entity_type = 'action_plan' and cr.entity_id = a.id
                     and cr.user_id = auth.uid())
      )
  );
$$;

-- ============================================================ RPC: Org Structure

create or replace function public.create_department(p_name text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('create_department') then
    raise exception 'Anda tidak berwenang membuat Department.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama Department wajib diisi.'; end if;
  v_org := public.current_user_org();
  insert into public.departments (organization_id, name, description, created_by)
  values (v_org, trim(p_name), nullif(trim(coalesce(p_description,'')),''), auth.uid())
  returning id into v_id;
  perform public.write_activity('department', v_id, 'create', jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;
revoke execute on function public.create_department(text, text) from public, anon;

create or replace function public.create_team(
  p_name text, p_department_id uuid, p_description text, p_lead_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_teams') then
    raise exception 'Anda tidak berwenang mengelola Tim.';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nama Tim wajib diisi.'; end if;
  v_org := public.current_user_org();
  if p_department_id is not null and not exists (
    select 1 from public.departments d where d.id = p_department_id and d.organization_id = v_org
  ) then raise exception 'Department tidak ditemukan di organisasi ini.'; end if;
  insert into public.teams (organization_id, department_id, name, description, lead_id, created_by)
  values (v_org, p_department_id, trim(p_name),
          nullif(trim(coalesce(p_description,'')),''), p_lead_id, auth.uid())
  returning id into v_id;
  perform public.write_activity('team', v_id, 'create', jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;
revoke execute on function public.create_team(text, uuid, text, uuid) from public, anon;

create or replace function public.assign_team_member(
  p_team_id uuid, p_profile_id uuid, p_role_in_team text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_teams') then
    raise exception 'Anda tidak berwenang mengelola anggota Tim.';
  end if;
  v_org := public.current_user_org();
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.organization_id = v_org) then
    raise exception 'Tim tidak ditemukan.';
  end if;
  if not exists (select 1 from public.profiles p
                 where p.id = p_profile_id and p.organization_id = v_org and p.is_active) then
    raise exception 'Anggota tidak valid atau tidak aktif.';
  end if;
  insert into public.team_members (team_id, profile_id, organization_id, role_in_team)
  values (p_team_id, p_profile_id, v_org, nullif(trim(coalesce(p_role_in_team,'')),''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.assign_team_member(uuid, uuid, text) from public, anon;

-- ============================================================ RPC: Deadline Change Request

create or replace function public.create_deadline_change_request(
  p_entity_id uuid, p_old_deadline date, p_new_deadline date,
  p_reason text, p_impact text, p_evidence_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid; v_ap public.action_plans; v_reviewer uuid;
begin
  select * into v_ap from public.action_plans where id = p_entity_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if not (v_ap.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Hanya PIC Action Plan yang dapat mengajukan perubahan deadline.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan perubahan deadline wajib diisi.'; end if;
  if p_new_deadline <= p_old_deadline then
    raise exception 'Tanggal baru tidak boleh lebih awal dari deadline saat ini.';
  end if;
  if p_new_deadline < public.org_today(v_ap.organization_id) then
    raise exception 'Tanggal baru tidak boleh di masa lalu.';
  end if;
  v_org := v_ap.organization_id;
  v_reviewer := v_ap.reviewer_id;
  insert into public.deadline_change_requests
    (organization_id, entity_type, entity_id, old_deadline, new_deadline,
     reason, impact_if_rejected, evidence_note, requestor_id)
  values (v_org, 'action_plan', p_entity_id, p_old_deadline, p_new_deadline,
          trim(p_reason), nullif(trim(coalesce(p_impact,'')),''),
          nullif(trim(coalesce(p_evidence_note,'')),''), auth.uid())
  returning id into v_id;
  insert into public.deadline_change_logs (organization_id, request_id, action, actor_id)
  values (v_org, v_id, 'submitted', auth.uid());
  perform public.write_activity('action_plan', p_entity_id, 'deadline_change_requested',
    jsonb_build_object('request_id', v_id, 'new_deadline', p_new_deadline));
  perform public.emit_notification(v_org, v_reviewer, auth.uid(), 'deadline_change_requested',
    'action_plan', p_entity_id, 'Permintaan Perubahan Deadline',
    'Ada permintaan perubahan deadline yang menunggu review.');
  return v_id;
end;
$$;
revoke execute on function public.create_deadline_change_request(uuid, date, date, text, text, text) from public, anon;

create or replace function public.review_deadline_change(
  p_request_id uuid, p_decision text, p_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_req public.deadline_change_requests;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'Keputusan tidak valid.';
  end if;
  -- Advisory lock untuk cegah double-approval.
  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan.'; end if;
  if v_req.status <> 'pending' then raise exception 'Permintaan ini sudah diproses.'; end if;
  if not public.has_permission('review_deadline_changes') then
    raise exception 'Anda tidak berwenang me-review perubahan deadline.';
  end if;
  if v_req.requestor_id = auth.uid() then
    -- Anti-self: tindakan terlarang yang dicoba — catat governance (best-effort).
    insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, severity, detail)
    values (v_req.organization_id, auth.uid(), 'deadline_change_self_approval',
            v_req.entity_type, v_req.entity_id, 'critical',
            jsonb_build_object('request_id', p_request_id));
    raise exception 'Anda tidak dapat menyetujui permintaan yang Anda ajukan sendiri.';
  end if;
  if p_decision = 'rejected' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  if p_decision = 'approved' then
    update public.deadline_change_requests
      set status = 'approved', approver_id = auth.uid(), responded_at = now()
      where id = p_request_id;
    -- Bypass guard trigger untuk update deadline AP.
    perform set_config('app.allow_deadline_update', 'true', true);
    update public.action_plans set deadline = v_req.new_deadline where id = v_req.entity_id;
    perform set_config('app.allow_deadline_update', 'false', true);
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'approved', auth.uid(), nullif(trim(coalesce(p_reason,'')),''));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_approved',
      jsonb_build_object('request_id', p_request_id, 'new_deadline', v_req.new_deadline));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_approved', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Disetujui', 'Permintaan perubahan deadline Anda disetujui.');
  else
    update public.deadline_change_requests
      set status = 'rejected', approver_id = auth.uid(), responded_at = now(), rejection_reason = trim(p_reason)
      where id = p_request_id;
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'rejected', auth.uid(), trim(p_reason));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_rejected',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_rejected', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Ditolak', 'Permintaan perubahan deadline Anda ditolak.');
  end if;
end;
$$;
revoke execute on function public.review_deadline_change(uuid, text, text) from public, anon;

-- ============================================================ RPC: Cancellation

create or replace function public.cancel_card(
  p_entity_type text, p_entity_id uuid, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid; v_active_children int := 0; v_is_ceo boolean;
begin
  if p_entity_type not in ('action_plan','initiative','strategy','kpi_area','goal',
                           'development_area','problem_statement') then
    raise exception 'Tipe card tidak valid.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  v_org := public.current_user_org();

  -- Hitung child aktif (status not in archived/cancelled).
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

  v_is_ceo := (public.user_role_level() = 'ceo');
  insert into public.cancellations (organization_id, entity_type, entity_id, cancelled_by, reason,
    approval_status, approved_by, approved_at)
  values (v_org, p_entity_type, p_entity_id, auth.uid(), trim(p_reason),
    case when v_is_ceo then 'auto_approved' else 'pending' end,
    case when v_is_ceo then auth.uid() else null end,
    case when v_is_ceo then now() else null end)
  returning id into v_id;

  if v_is_ceo then
    execute format('update public.%I set status = ''cancelled'' where id = $1',
      case p_entity_type when 'action_plan' then 'action_plans'
        when 'initiative' then 'initiatives' when 'strategy' then 'strategies'
        when 'kpi_area' then 'kpi_areas' when 'goal' then 'goals'
        when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end)
    using p_entity_id;
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

create or replace function public.approve_cancellation(p_cancellation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_c public.cancellations;
begin
  select * into v_c from public.cancellations where id = p_cancellation_id for update;
  if not found then raise exception 'Permintaan pembatalan tidak ditemukan.'; end if;
  if v_c.approval_status <> 'pending' then raise exception 'Pembatalan ini sudah diproses.'; end if;
  if not (public.user_role_level() = 'ceo' or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang menyetujui pembatalan.';
  end if;
  update public.cancellations
    set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_cancellation_id;
  execute format('update public.%I set status = ''cancelled'' where id = $1',
    case v_c.entity_type when 'action_plan' then 'action_plans'
      when 'initiative' then 'initiatives' when 'strategy' then 'strategies'
      when 'kpi_area' then 'kpi_areas' when 'goal' then 'goals'
      when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end)
  using v_c.entity_id;
  perform public.write_activity(v_c.entity_type, v_c.entity_id, 'card_cancelled',
    jsonb_build_object('cancellation_id', p_cancellation_id));
end;
$$;
revoke execute on function public.approve_cancellation(uuid) from public, anon;

-- ============================================================ RPC: Evaluation

create or replace function public.record_evaluation(
  p_initiative_id uuid, p_target_achieved text, p_results text,
  p_success_factors text[], p_failure_factors text[], p_lessons_learned text,
  p_should_become_sop boolean, p_rollout_needed boolean, p_rollout_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid; v_pic uuid; v_status text;
begin
  if not public.can_access_initiative(p_initiative_id) then
    raise exception 'Anda tidak berwenang mengevaluasi Initiative ini.';
  end if;
  select organization_id, pic_id, status into v_org, v_pic, v_status
    from public.initiatives where id = p_initiative_id;
  if v_status not in ('done','active') then
    raise exception 'Evaluation hanya untuk Initiative yang sedang berjalan atau selesai.';
  end if;
  if v_pic is not null and v_pic = auth.uid() then
    insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, severity, detail)
    values (v_org, auth.uid(), 'self_evaluation', 'initiative', p_initiative_id, 'high', '{}'::jsonb);
    raise exception 'PIC tidak dapat mengevaluasi initiativenya sendiri.';
  end if;
  if p_target_achieved is not null and p_target_achieved not in ('ya','sebagian','tidak') then
    raise exception 'Nilai pencapaian target tidak valid.';
  end if;

  insert into public.evaluations (organization_id, initiative_id, target_achieved, results,
    success_factors, failure_factors, lessons_learned, should_become_sop, rollout_needed,
    rollout_notes, evaluated_by, pic_id)
  values (v_org, p_initiative_id, p_target_achieved, nullif(trim(coalesce(p_results,'')),''),
    p_success_factors, p_failure_factors, nullif(trim(coalesce(p_lessons_learned,'')),''),
    coalesce(p_should_become_sop, false), coalesce(p_rollout_needed, false),
    nullif(trim(coalesce(p_rollout_notes,'')),''), auth.uid(), v_pic)
  on conflict (initiative_id) do update set
    target_achieved = excluded.target_achieved, results = excluded.results,
    success_factors = excluded.success_factors, failure_factors = excluded.failure_factors,
    lessons_learned = excluded.lessons_learned, should_become_sop = excluded.should_become_sop,
    rollout_needed = excluded.rollout_needed, rollout_notes = excluded.rollout_notes,
    evaluated_by = excluded.evaluated_by, updated_at = now()
  returning id into v_id;
  perform public.write_activity('initiative', p_initiative_id, 'evaluation_recorded',
    jsonb_build_object('evaluation_id', v_id));
  return v_id;
end;
$$;
revoke execute on function public.record_evaluation(uuid, text, text, text[], text[], text, boolean, boolean, text) from public, anon;

-- ============================================================ RPC: Archive

create or replace function public.archive_card(p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tbl text; v_status text; v_pic uuid; v_active_children int := 0;
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
    raise exception 'Anda tidak berwenang mengarsipkan card ini.';
  end if;
  if v_status not in ('done','cancelled') then
    raise exception 'Hanya card berstatus selesai atau dibatalkan yang dapat diarsipkan.';
  end if;
  execute format('update public.%I set status = ''archived'', archived_at = now() where id = $1', v_tbl)
    using p_entity_id;
  perform public.write_activity(p_entity_type, p_entity_id, 'card_archived', '{}'::jsonb);
end;
$$;
revoke execute on function public.archive_card(text, uuid) from public, anon;

-- ============================================================ RPC: Confidential Access

create or replace function public.grant_confidential_access(
  p_entity_type text, p_entity_id uuid, p_user_id uuid, p_access_level text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
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

-- ============================================================ RPC: Settings (whitelist)

create or replace function public.upsert_settings(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_allowed boolean;
begin
  v_org := public.current_user_org();
  -- Whitelist prefix (FR-8.9.6). card_completion_rule_* boleh via manage_card_completion_rule.
  v_allowed := p_key like 'card_completion_rule_%' or p_key like 'card_guidance_%'
            or p_key like 'status_%' or p_key like 'priority_%'
            or p_key like 'notification_rule_%' or p_key = 'confidential_access_mode'
            or p_key = 'deadline_change_max_per_card';
  if not v_allowed then
    insert into public.governance_violations (organization_id, user_id, violation_type, severity, detail)
    values (v_org, auth.uid(), 'settings_invalid_key', 'critical', jsonb_build_object('key', p_key));
    raise exception 'Kunci pengaturan tidak valid.';
  end if;
  if p_key like 'card_completion_rule_%' then
    if not (public.has_permission('manage_card_completion_rule') or public.has_permission('manage_settings')) then
      raise exception 'Anda tidak berwenang mengubah Card Completion Rule.';
    end if;
  else
    if not public.has_permission('manage_settings') then
      raise exception 'Anda tidak berwenang mengubah Pengaturan.';
    end if;
  end if;
  insert into public.settings (organization_id, key, value, updated_at)
  values (v_org, p_key, p_value, now())
  on conflict (organization_id, key) do update set value = excluded.value, updated_at = now();
  perform public.write_activity('settings', null, 'setting_updated', jsonb_build_object('key', p_key));
end;
$$;
revoke execute on function public.upsert_settings(text, jsonb) from public, anon;

-- ============================================================ RPC: Search (RLS-scoped)

create or replace function public.search_cards(
  p_query text, p_entity_types text[], p_include_archived boolean
) returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text; v_types text[]; v_arch boolean;
begin
  v_q := '%' || lower(coalesce(trim(p_query), '')) || '%';
  if coalesce(trim(p_query), '') = '' then return; end if;
  v_types := coalesce(p_entity_types,
    array['goal','kpi_area','strategy','initiative','action_plan','development_area','problem_statement']);
  v_arch := coalesce(p_include_archived, false);

  return query
  select jsonb_build_object('id', g.id, 'entity_type', 'goal', 'name', g.name, 'status', g.status)
  from public.goals g where 'goal' = any(v_types) and public.can_access_goal(g.id)
    and lower(g.name) like v_q and (v_arch or g.status <> 'archived')
  union all
  select jsonb_build_object('id', k.id, 'entity_type', 'kpi_area', 'name', k.name, 'status', k.status)
  from public.kpi_areas k where 'kpi_area' = any(v_types) and public.can_access_kpi_area(k.id)
    and lower(k.name) like v_q and (v_arch or k.status <> 'archived')
  union all
  select jsonb_build_object('id', s.id, 'entity_type', 'strategy', 'name', s.name, 'status', s.status)
  from public.strategies s where 'strategy' = any(v_types) and public.can_access_strategy(s.id)
    and lower(s.name) like v_q and (v_arch or s.status <> 'archived')
  union all
  select jsonb_build_object('id', i.id, 'entity_type', 'initiative', 'name', i.name, 'status', i.status)
  from public.initiatives i where 'initiative' = any(v_types) and public.can_access_initiative(i.id)
    and lower(i.name) like v_q and (v_arch or i.status <> 'archived')
  union all
  select jsonb_build_object('id', a.id, 'entity_type', 'action_plan', 'name', a.name, 'status', a.status)
  from public.action_plans a where 'action_plan' = any(v_types) and public.can_access_action_plan(a.id)
    and lower(a.name) like v_q and (v_arch or a.status <> 'archived')
  union all
  select jsonb_build_object('id', d.id, 'entity_type', 'development_area', 'name', d.name, 'status', d.status)
  from public.development_areas d where 'development_area' = any(v_types) and public.can_access_development_area(d.id)
    and lower(d.name) like v_q and (v_arch or d.status <> 'archived')
  union all
  select jsonb_build_object('id', ps.id, 'entity_type', 'problem_statement', 'name', ps.name, 'status', ps.status)
  from public.problem_statements ps where 'problem_statement' = any(v_types) and public.can_access_problem_statement(ps.id)
    and lower(ps.name) like v_q and (v_arch or ps.status <> 'archived');
end;
$$;
revoke execute on function public.search_cards(text, text[], boolean) from public, anon;
