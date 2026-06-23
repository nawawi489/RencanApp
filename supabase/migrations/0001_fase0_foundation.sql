-- EMS V1.8.1 — Fase 0: Fondasi & Shell
-- Tabel: organizations, role_templates, profiles, permissions, user_permissions, settings, login_logs
-- (auth.users disediakan Supabase Auth). RLS + seed Nyantuy Group + trigger profil otomatis.

-- ============================================================ TABLES

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.role_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  level text not null check (level in ('ceo', 'c_level', 'management', 'staff')),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  role_template_id uuid references public.role_templates (id) on delete set null,
  full_name text,
  email text,
  position_title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, permission_id)
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create table if not exists public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  logged_in_at timestamptz not null default now(),
  ip text,
  user_agent text,
  success boolean not null default true
);

-- ============================================================ FUNCTIONS

-- Org user saat ini (SECURITY DEFINER agar tidak rekursif dengan RLS profiles).
create or replace function public.current_user_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- updated_at otomatis.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Buat profil otomatis saat user baru mendaftar (default org pertama + role Staff).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role uuid;
begin
  select id into v_org from public.organizations order by created_at limit 1;
  select id into v_role
    from public.role_templates
    where level = 'staff' and organization_id = v_org
    order by created_at limit 1;

  insert into public.profiles (id, organization_id, role_template_id, full_name, email)
  values (
    new.id,
    v_org,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ RLS

alter table public.organizations enable row level security;
alter table public.role_templates enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_permissions enable row level security;
alter table public.settings enable row level security;
alter table public.login_logs enable row level security;

create policy "org_select_own" on public.organizations
  for select to authenticated
  using (id = public.current_user_org());

create policy "role_select_own_org" on public.role_templates
  for select to authenticated
  using (organization_id = public.current_user_org());

create policy "profiles_select_same_org" on public.profiles
  for select to authenticated
  using (organization_id = public.current_user_org() or id = auth.uid());

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "permissions_select_all" on public.permissions
  for select to authenticated
  using (true);

create policy "user_permissions_select_self" on public.user_permissions
  for select to authenticated
  using (user_id = auth.uid());

create policy "settings_select_own_org" on public.settings
  for select to authenticated
  using (organization_id = public.current_user_org());

create policy "login_logs_select_self" on public.login_logs
  for select to authenticated
  using (user_id = auth.uid());

create policy "login_logs_insert_self" on public.login_logs
  for insert to authenticated
  with check (user_id = auth.uid());

-- ============================================================ SEED

insert into public.organizations (name)
select 'Nyantuy Group'
where not exists (select 1 from public.organizations);

with org as (select id from public.organizations order by created_at limit 1)
insert into public.role_templates (organization_id, name, level, is_system)
select org.id, x.name, x.level, true
from org,
  (values
    ('CEO / Super Admin', 'ceo'),
    ('C-Level', 'c_level'),
    ('Management / Manager / Head', 'management'),
    ('Staff', 'staff')
  ) as x (name, level)
where not exists (select 1 from public.role_templates);

insert into public.permissions (key, label)
select x.key, x.label
from (values
  ('create_goal', 'Membuat Goal'),
  ('create_kpi_area', 'Membuat KPI Area'),
  ('create_development_area', 'Membuat Development Area'),
  ('create_strategy', 'Membuat Strategy'),
  ('create_initiative', 'Membuat Initiative'),
  ('create_action_plan', 'Membuat Action Plan'),
  ('view_all_workspace', 'Lihat seluruh Workspace'),
  ('manage_others_cards', 'Kelola card orang lain'),
  ('manage_settings', 'Ubah Settings'),
  ('manage_users_permissions', 'Kelola User & Permission'),
  ('manage_goal_templates', 'Kelola Goal Template'),
  ('manage_kpi_area_templates', 'Kelola KPI Area Template'),
  ('manage_minimum_breakdown_rule', 'Kelola Minimum Breakdown Rule'),
  ('manage_card_completion_rule', 'Kelola Card Completion Rule'),
  ('view_activity_log', 'Lihat Activity Log'),
  ('view_governance_violation', 'Lihat Governance Violation'),
  ('manage_score_formula', 'Kelola Score Formula')
) as x (key, label)
where not exists (select 1 from public.permissions);
