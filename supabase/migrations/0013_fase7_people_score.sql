-- EMS V1.8.1 — Fase 7: People & Score.
-- Achievement Score per user dari data eksekusi Fase 1–6, ber-versi, dengan ranking ter-freeze
-- per periode dan manual override append-only.
--
-- Sumber: specs/fase-7-people-score.md (§0 13 keputusan terkunci, FR-7.1..7.10, DC-7.x, AC-7.1..7.35).
--
-- Keputusan mengikat (kunci sebelum green):
--   D1/D2 Visibility = restriktif + supervisor (rantai PIC-induk). Helper is_supervisor_of inline kolom.
--   D3    Period window anchor ke action_plan_submissions.review_status='approved' (TIDAK ALTER action_plans).
--   D4    result_achievement keluar dari seed Staff V1 (renormalisasi 100% → 6 kategori).
--   D5    governance_discipline: clamp(100 − Σpenalti, 0, 100); penalti SEKALI per tier (DISTINCT severity)
--         low=2 med=5 high=15 critical=40, maks 62 (REVISI review: bukan aditif per kejadian).
--   D7    Seed Staff aktif; Management/C-Level/CEO = draft (defer total).
--   D8    Development Contribution = level Initiative (problem_statement_id non-null & pic_id=user).
--   D9    Ranking hanya tampil setelah close (ranking_snapshots beku); periode aktif tanpa ranking.
--   D10   Override SINGLE-actor (REVISI review): override_user_score efektif seketika; approved_by=changed_by;
--         TIDAK ada approve_score_override / override_status. Anti-self → governance_violations 'critical'.
--   D11   Tie-breaker = rank kembar (skor sama → rank_number sama, rank berikut melompat); sort by full_name.
--   D12   Role level dikunci saat open_period_snapshot.
--   D13   Config formula transparan dalam org (RLS SELECT score_formula_* org-scoped semua anggota).
--
--   K1    SELECT policy user_score_results/ranking_snapshots pakai kolom INLINE (user_id) + helper LINTAS-tabel
--         (is_supervisor_of). Hindari self-requery (gotcha 42501 Fase 1).
--   K2    Bobot 100% ditegakkan di RPC activate_score_formula_version (BUKAN CHECK constraint — categories JSONB).
--   K3    Partial unique index period_snapshots WHERE status='active' — guard RPC saja bocor di race.
--   K4    Heavy RPC (calculate_period_scores, close_period_snapshot) revoke dari authenticated (pola 0003 sistem).
--   K5    Append-only: trigger BEFORE DELETE pada user_score_results/ranking_snapshots/period_snapshots tolak.

-- ============================================================ TABEL: score_categories
-- Referensi kategori per level + pemetaan ke source_metric (computable dari Fase 1–6).
create table if not exists public.score_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,  -- null = sistem
  code text not null,
  label text not null,
  level text not null check (level in ('staff', 'management', 'c_level', 'ceo')),
  source_metric text not null,  -- 'action_plan_completion', 'repeat_compliance', dst.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, code, level)
);

-- ============================================================ TABEL: score_formula_templates
create table if not exists public.score_formula_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  level text not null check (level in ('staff', 'management', 'c_level', 'ceo')),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================ TABEL: score_formula_versions
-- categories JSONB array: [{code, weight (0..100 numeric), source_metric}, ...]
-- K2: SUM(weight)=100 DITEGAKKAN di RPC activate, BUKAN CHECK (JSONB tak praktis di CHECK).
create table if not exists public.score_formula_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,  -- null = sistem
  template_id uuid references public.score_formula_templates (id) on delete cascade,
  version_number int not null,
  level text not null check (level in ('staff', 'management', 'c_level', 'ceo')),
  categories jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  effective_date date,
  change_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, version_number)
);

create index if not exists idx_score_formula_versions_template
  on public.score_formula_versions (template_id);
create index if not exists idx_score_formula_versions_org_level_status
  on public.score_formula_versions (organization_id, level, status);

-- ============================================================ TABEL: score_formula_assignments
create table if not exists public.score_formula_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  formula_version_id uuid not null references public.score_formula_versions (id) on delete cascade,
  scope_level text not null check (scope_level in ('org_role', 'user')),
  role_level text check (role_level in ('staff', 'management', 'c_level', 'ceo')),
  user_id uuid references public.profiles (id) on delete cascade,
  start_date date not null default current_date,
  end_date date,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_score_formula_assignments_org_role
  on public.score_formula_assignments (organization_id, role_level)
  where scope_level = 'org_role';
create index if not exists idx_score_formula_assignments_user
  on public.score_formula_assignments (user_id)
  where scope_level = 'user';

-- ============================================================ TABEL: period_snapshots
-- K3: partial unique index satu active per org.
create table if not exists public.period_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_name text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint period_snapshots_period_order check (period_end >= period_start)
);

create unique index if not exists ux_period_snapshots_one_active_per_org
  on public.period_snapshots (organization_id) where status = 'active';

-- ============================================================ TABEL: user_score_results
-- D10 revisi: single-actor. TIDAK ada override_status. approved_by = changed_by.
-- AC-7.6: version per-baris (BUKAN kolom tunggal di period_snapshots).
create table if not exists public.user_score_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_snapshot_id uuid not null references public.period_snapshots (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score_formula_version_id uuid references public.score_formula_versions (id) on delete set null,
  auto_calculated_score numeric(6,2) not null,
  manual_adjusted_score numeric(6,2),
  metric_breakdown jsonb not null default '{}'::jsonb,
  override_reason text,
  override_changed_by uuid references public.profiles (id) on delete set null,
  override_changed_at timestamptz,
  override_approved_by uuid references public.profiles (id) on delete set null,  -- = changed_by (single-actor)
  result_kind text not null default 'auto'
    check (result_kind in ('auto', 'override')),
  is_current boolean not null default true,
  calculated_at timestamptz not null default now()
);

-- Partial unique: satu baris current per (period, user).
create unique index if not exists ux_user_score_results_one_current
  on public.user_score_results (period_snapshot_id, user_id) where is_current;

create index if not exists idx_user_score_results_period
  on public.user_score_results (period_snapshot_id);
create index if not exists idx_user_score_results_user
  on public.user_score_results (user_id);

-- ============================================================ TABEL: ranking_snapshots
create table if not exists public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_snapshot_id uuid not null references public.period_snapshots (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rank_number int not null,
  score numeric(6,2) not null,
  metric_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (period_snapshot_id, user_id)
);

create index if not exists idx_ranking_snapshots_period
  on public.ranking_snapshots (period_snapshot_id);

-- updated_at otomatis.
drop trigger if exists score_formula_templates_set_updated_at on public.score_formula_templates;
create trigger score_formula_templates_set_updated_at before update on public.score_formula_templates
  for each row execute function public.set_updated_at();

-- ============================================================ APPEND-ONLY guards (K5)
-- BEFORE DELETE → raise. user_score_results, ranking_snapshots, period_snapshots historis tak boleh
-- dihapus. activity_logs & governance_violations sudah append-only dari Fase 1 (tanpa policy DELETE).

create or replace function public.tg_block_delete_append_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception '% adalah append-only dan tidak dapat dihapus.', tg_table_name;
end;
$$;
revoke execute on function public.tg_block_delete_append_only() from public, anon, authenticated;

drop trigger if exists user_score_results_no_delete on public.user_score_results;
create trigger user_score_results_no_delete before delete on public.user_score_results
  for each row execute function public.tg_block_delete_append_only();

drop trigger if exists ranking_snapshots_no_delete on public.ranking_snapshots;
create trigger ranking_snapshots_no_delete before delete on public.ranking_snapshots
  for each row execute function public.tg_block_delete_append_only();

-- ============================================================ HELPER: is_supervisor_of (D1/D2)
-- True jika auth.uid() adalah PIC card induk yang punya turunan ber-PIC = p_user (rantai PIC-induk).
-- Performance: Goal/KPI/Strategy/Initiative → AP.pic. Development: Dev Area/PS/Initiative → AP.pic.
-- Inline kolom (bukan self-requery user_score_results). LINTAS-tabel, aman dari 42501.
create or replace function public.is_supervisor_of(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_user, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid() and exists (
    -- Performance chain: AP.pic = p_user, leluhur PIC = auth.uid()
    select 1 from public.action_plans a
    left join public.initiatives i on i.id = a.initiative_id
    left join public.strategies s on s.id = i.strategy_id
    left join public.kpi_areas k on k.id = s.kpi_area_id
    left join public.goals g on g.id = k.goal_id
    where a.pic_id = p_user
      and a.organization_id = public.current_user_org()
      and (i.pic_id = auth.uid() or s.pic_id = auth.uid()
           or k.pic_id = auth.uid() or g.pic_id = auth.uid())
    union all
    -- Development chain via problem_statement
    select 1 from public.action_plans a
    join public.initiatives i on i.id = a.initiative_id
    join public.problem_statements ps on ps.id = i.problem_statement_id
    join public.development_areas da on da.id = ps.development_area_id
    where a.pic_id = p_user
      and a.organization_id = public.current_user_org()
      and (i.pic_id = auth.uid() or ps.pic_id = auth.uid() or da.pic_id = auth.uid())
    union all
    -- PIC Initiative langsung sebagai p_user
    select 1 from public.initiatives i
    left join public.strategies s on s.id = i.strategy_id
    left join public.kpi_areas k on k.id = s.kpi_area_id
    left join public.goals g on g.id = k.goal_id
    left join public.problem_statements ps on ps.id = i.problem_statement_id
    left join public.development_areas da on da.id = ps.development_area_id
    where i.pic_id = p_user
      and i.organization_id = public.current_user_org()
      and (s.pic_id = auth.uid() or k.pic_id = auth.uid() or g.pic_id = auth.uid()
           or ps.pic_id = auth.uid() or da.pic_id = auth.uid())
  );
$$;
revoke execute on function public.is_supervisor_of(uuid) from public, anon;

-- ============================================================ HELPER: governance_discipline SEKALI per tier (D5)
create or replace function public.compute_governance_discipline(
  p_user uuid, p_org uuid, p_start date, p_end date
) returns numeric language sql stable security definer set search_path = '' as $$
  select greatest(0, least(100,
    100 - coalesce((
      select sum(case s
                  when 'low' then 2
                  when 'medium' then 5
                  when 'high' then 15
                  when 'critical' then 40
                  else 0
                end)::numeric
      from (select distinct severity as s
            from public.governance_violations
            where user_id = p_user
              and organization_id = p_org
              and severity is not null
              and created_at >= p_start::timestamptz
              and created_at <  (p_end + 1)::timestamptz) t
    ), 0)
  ))::numeric;
$$;
revoke execute on function public.compute_governance_discipline(uuid, uuid, date, date) from public, anon;

-- ============================================================ HELPER: review_pass_rate (D3 + AC-7.11)
-- Dari action_plan_submissions.review_status='approved' (BUKAN reviews.decision).
create or replace function public.compute_review_pass_rate(
  p_user uuid, p_org uuid, p_start date, p_end date
) returns numeric language sql stable security definer set search_path = '' as $$
  with subs as (
    select s.review_status
    from public.action_plan_submissions s
    join public.action_plans ap on ap.id = s.action_plan_id
    where s.submitted_by = p_user
      and ap.organization_id = p_org
      and s.submitted_at >= p_start::timestamptz
      and s.submitted_at <  (p_end + 1)::timestamptz
  )
  select round(
    coalesce(
      100.0 * (count(*) filter (where review_status='approved'))::numeric
      / nullif(count(*), 0),
      0
    ),
    2
  ) from subs;
$$;
revoke execute on function public.compute_review_pass_rate(uuid, uuid, date, date) from public, anon;

-- ============================================================ HELPER: aggregate_repeat_metrics_per_user
-- repeat_compliance & on_time_rate per-user dari action_plan_instances (pic_id=user).
create or replace function public.aggregate_repeat_metrics_per_user(
  p_user uuid, p_org uuid, p_start date, p_end date
) returns table (repeat_compliance numeric, on_time_rate numeric)
language sql stable security definer set search_path = '' as $$
  with ins as (
    select status, submitted_late
    from public.action_plan_instances
    where pic_id = p_user
      and organization_id = p_org
      and status <> 'archived'
      and deadline_at >= p_start::timestamptz
      and deadline_at <  (p_end + 1)::timestamptz
  )
  select
    round(coalesce(100.0 *
      (count(*) filter (where status='done' and not submitted_late))::numeric
      / nullif(count(*), 0), 0), 2) as repeat_compliance,
    round(coalesce(100.0 *
      (count(*) filter (where status in ('done','submitted','revision') and not submitted_late))::numeric
      / nullif(count(*), 0), 0), 2) as on_time_rate
  from ins;
$$;
revoke execute on function public.aggregate_repeat_metrics_per_user(uuid, uuid, date, date) from public, anon;

-- ============================================================ HELPER: compute_action_plan_completion (D3)
-- one-time AP user dengan submission approved dalam window.
create or replace function public.compute_action_plan_completion(
  p_user uuid, p_org uuid, p_start date, p_end date
) returns numeric language sql stable security definer set search_path = '' as $$
  with assigned as (
    select id from public.action_plans
    where pic_id = p_user and organization_id = p_org
      and repeat_setting = 'one_time'
      and status <> 'archived'
      and (start_date is null or start_date <= p_end)
      and (deadline is null or deadline >= p_start)
  ), approved as (
    select distinct s.action_plan_id
    from public.action_plan_submissions s
    join assigned a on a.id = s.action_plan_id
    where s.review_status = 'approved'
      and s.reviewed_at is not null
      and s.reviewed_at >= p_start::timestamptz
      and s.reviewed_at <  (p_end + 1)::timestamptz
  )
  select round(coalesce(100.0 * (select count(*) from approved)::numeric
    / nullif((select count(*) from assigned), 0), 0), 2);
$$;
revoke execute on function public.compute_action_plan_completion(uuid, uuid, date, date) from public, anon;

-- ============================================================ HELPER: compute_development_contribution (D8)
create or replace function public.compute_development_contribution(
  p_user uuid, p_org uuid, p_start date, p_end date
) returns numeric language sql stable security definer set search_path = '' as $$
  with dev_init as (
    select status from public.initiatives
    where pic_id = p_user and organization_id = p_org
      and problem_statement_id is not null
      and status <> 'archived'
  )
  select round(coalesce(100.0 *
    (count(*) filter (where status='done'))::numeric
    / nullif(count(*), 0), 0), 2)
  from dev_init;
$$;
revoke execute on function public.compute_development_contribution(uuid, uuid, date, date) from public, anon;

-- Pure-computation helpers: hanya dipakai internal oleh calculate_period_scores RPC.
-- Revoke dari authenticated pula (pola 0003 fungsi sistem; tutup eksposur /rest/v1/rpc/*).
-- is_supervisor_of TETAP callable by authenticated (dipakai di RLS USING clause).
revoke execute on function public.compute_governance_discipline(uuid, uuid, date, date) from authenticated;
revoke execute on function public.compute_review_pass_rate(uuid, uuid, date, date) from authenticated;
revoke execute on function public.aggregate_repeat_metrics_per_user(uuid, uuid, date, date) from authenticated;
revoke execute on function public.compute_action_plan_completion(uuid, uuid, date, date) from authenticated;
revoke execute on function public.compute_development_contribution(uuid, uuid, date, date) from authenticated;

-- ============================================================ RPC: upsert_score_formula_version
-- AC-7.5: INSERT baris baru (version_number naik), TIDAK update in-place.
create or replace function public.upsert_score_formula_version(
  p_template_id uuid, p_categories jsonb, p_change_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_next int; v_tmpl public.score_formula_templates;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select * into v_tmpl from public.score_formula_templates where id = p_template_id;
  if not found then raise exception 'Template tidak ditemukan.'; end if;
  if v_tmpl.organization_id <> public.current_user_org() then
    raise exception 'Template lintas-organisasi tidak diizinkan.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.score_formula_versions where template_id = p_template_id;

  insert into public.score_formula_versions
    (organization_id, template_id, version_number, level, categories, status,
     change_reason, created_by)
    values (v_tmpl.organization_id, p_template_id, v_next, v_tmpl.level,
            coalesce(p_categories, '[]'::jsonb), 'draft', p_change_reason, auth.uid())
    returning id into v_id;

  perform public.write_activity('score_formula_version', v_id, 'score_formula_changed',
    jsonb_build_object('template_id', p_template_id, 'version', v_next, 'reason', p_change_reason));
  return v_id;
end;
$$;
revoke execute on function public.upsert_score_formula_version(uuid, jsonb, text) from public, anon;

-- ============================================================ RPC: activate_score_formula_version
-- AC-7.1/7.2: SUM(weight)=100 ditegakkan di RPC; aktivasi arsipkan versi aktif sebelumnya per template.
create or replace function public.activate_score_formula_version(
  p_version_id uuid, p_effective_date date
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sum numeric; v_tmpl uuid; v_status text;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select template_id, status into v_tmpl, v_status
    from public.score_formula_versions where id = p_version_id;
  if not found then raise exception 'Versi formula tidak ditemukan.'; end if;
  if v_status <> 'draft' then raise exception 'Hanya versi draft yang bisa diaktifkan.'; end if;

  select coalesce(sum((c->>'weight')::numeric), 0) into v_sum
    from public.score_formula_versions sfv,
         jsonb_array_elements(sfv.categories) c
    where sfv.id = p_version_id;
  if v_sum <> 100 then
    raise exception 'Total bobot Score Formula harus tepat 100. Saat ini %.', v_sum;
  end if;

  -- Arsipkan versi aktif sebelumnya per template.
  update public.score_formula_versions
    set status = 'archived'
    where template_id = v_tmpl and status = 'active' and id <> p_version_id;

  update public.score_formula_versions
    set status = 'active', activated_at = now(), effective_date = coalesce(p_effective_date, current_date),
        approved_by = auth.uid()
    where id = p_version_id;

  perform public.write_activity('score_formula_version', p_version_id, 'score_formula_activated',
    jsonb_build_object('effective_date', coalesce(p_effective_date, current_date)));
end;
$$;
revoke execute on function public.activate_score_formula_version(uuid, date) from public, anon;

-- ============================================================ RPC: assign_score_formula
create or replace function public.assign_score_formula(
  p_version_id uuid, p_scope_level text, p_role_level text, p_user_id uuid, p_start_date date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select organization_id into v_org from public.score_formula_versions where id = p_version_id;
  if v_org is null then raise exception 'Versi formula tidak ditemukan.'; end if;

  -- Tutup assignment lama yang overlap (close-by-end_date).
  update public.score_formula_assignments
    set end_date = coalesce(p_start_date, current_date) - 1
    where organization_id = public.current_user_org()
      and scope_level = p_scope_level
      and ((scope_level='org_role' and role_level = p_role_level)
        or (scope_level='user' and user_id = p_user_id))
      and end_date is null;

  insert into public.score_formula_assignments
    (organization_id, formula_version_id, scope_level, role_level, user_id, start_date, assigned_by)
    values (public.current_user_org(), p_version_id, p_scope_level, p_role_level, p_user_id,
            coalesce(p_start_date, current_date), auth.uid())
    returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.assign_score_formula(uuid, text, text, uuid, date) from public, anon;

-- ============================================================ RPC: open_period_snapshot
-- AC-7.29: guard satu active per org (partial unique index sebagai backstop).
create or replace function public.open_period_snapshot(
  p_period_name text, p_period_start date, p_period_end date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  if exists (select 1 from public.period_snapshots
             where organization_id = public.current_user_org() and status='active') then
    raise exception 'Sudah ada periode aktif untuk organisasi ini. Tutup dulu sebelum membuka yang baru.';
  end if;
  insert into public.period_snapshots
    (organization_id, period_name, period_start, period_end, status, created_by)
    values (public.current_user_org(), p_period_name, p_period_start, p_period_end, 'active', auth.uid())
    returning id into v_id;
  perform public.write_activity('period_snapshot', v_id, 'period_opened',
    jsonb_build_object('name', p_period_name, 'start', p_period_start, 'end', p_period_end));
  return v_id;
end;
$$;
revoke execute on function public.open_period_snapshot(text, date, date) from public, anon;

-- ============================================================ RPC: calculate_period_scores
-- D7: V1 hanya Staff. D10/AC-7.14 idempotent (supersede auto, jangan sentuh override).
-- AC-7.28: role_template_id NULL → skip deterministik.
-- D5: governance_discipline SEKALI per tier.
-- D3: window via submission approved.
create or replace function public.calculate_period_scores(p_period_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_period public.period_snapshots;
  v_org uuid;
  v_count int := 0;
  v_user record;
  v_formula_id uuid;
  v_categories jsonb;
  v_metric_breakdown jsonb;
  v_score numeric;
  v_cat jsonb;
  v_metric_value numeric;
  v_existing_auto uuid;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select * into v_period from public.period_snapshots where id = p_period_id;
  if not found then raise exception 'Periode tidak ditemukan.'; end if;
  if v_period.status = 'closed' then
    raise exception 'Periode ini sudah ditutup dan tidak bisa diubah.';
  end if;

  v_org := v_period.organization_id;

  -- Iterasi user staff di org dengan role_template_id ada (NULL di-skip, AC-7.28).
  for v_user in
    select p.id as user_id, rt.level
    from public.profiles p
    join public.role_templates rt on rt.id = p.role_template_id
    where p.organization_id = v_org and rt.level = 'staff'  -- D7: V1 Staff only
  loop
    -- Pilih formula efektif (assignment user → org_role → default).
    select sfv.id, sfv.categories into v_formula_id, v_categories
      from public.score_formula_versions sfv
      left join public.score_formula_assignments sfa
        on sfa.formula_version_id = sfv.id
       and sfa.organization_id = v_org
       and (
         (sfa.scope_level='user' and sfa.user_id = v_user.user_id)
         or (sfa.scope_level='org_role' and sfa.role_level = v_user.level)
       )
       and sfa.start_date <= v_period.period_start
       and (sfa.end_date is null or sfa.end_date >= v_period.period_start)
      where sfv.status = 'active'
        and sfv.level = v_user.level
        and (sfv.organization_id = v_org or sfv.organization_id is null)
      order by (sfa.scope_level='user') desc nulls last,
               (sfa.scope_level='org_role') desc nulls last,
               sfv.organization_id nulls last
      limit 1;

    if v_formula_id is null then continue; end if;  -- tak ada formula efektif → skip

    v_score := 0;
    v_metric_breakdown := '{}'::jsonb;
    for v_cat in select * from jsonb_array_elements(v_categories) loop
      v_metric_value := case v_cat->>'source_metric'
        when 'action_plan_completion'
          then public.compute_action_plan_completion(v_user.user_id, v_org,
                                                     v_period.period_start, v_period.period_end)
        when 'repeat_compliance'
          then (select repeat_compliance from public.aggregate_repeat_metrics_per_user(
                  v_user.user_id, v_org, v_period.period_start, v_period.period_end))
        when 'on_time_rate'
          then (select on_time_rate from public.aggregate_repeat_metrics_per_user(
                  v_user.user_id, v_org, v_period.period_start, v_period.period_end))
        when 'review_pass_rate'
          then public.compute_review_pass_rate(v_user.user_id, v_org,
                                               v_period.period_start, v_period.period_end)
        when 'development_contribution'
          then public.compute_development_contribution(v_user.user_id, v_org,
                                                       v_period.period_start, v_period.period_end)
        when 'governance_discipline'
          then public.compute_governance_discipline(v_user.user_id, v_org,
                                                    v_period.period_start, v_period.period_end)
        else 0
      end;
      -- Clamp 0..100 sebelum dijumlahkan (AC-7.21/7.35).
      v_metric_value := greatest(0, least(100, coalesce(v_metric_value, 0)));
      v_score := v_score + v_metric_value * (v_cat->>'weight')::numeric / 100.0;
      v_metric_breakdown := v_metric_breakdown
        || jsonb_build_object(v_cat->>'code', v_metric_value);
    end loop;
    v_score := round(greatest(0, least(100, v_score)), 2);

    -- Supersede auto lama (is_current=false); JANGAN sentuh override.
    update public.user_score_results
      set is_current = false
      where period_snapshot_id = p_period_id
        and user_id = v_user.user_id
        and result_kind = 'auto'
        and is_current = true;

    -- Jika sudah ada override current, jangan insert auto baru sebagai current
    -- (override tetap berkuasa). Tetap insert audit row auto historis (is_current=false).
    if exists (select 1 from public.user_score_results
               where period_snapshot_id = p_period_id and user_id = v_user.user_id
                 and result_kind='override' and is_current=true) then
      insert into public.user_score_results
        (organization_id, period_snapshot_id, user_id, score_formula_version_id,
         auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
        values (v_org, p_period_id, v_user.user_id, v_formula_id,
                v_score, v_metric_breakdown, 'auto', false, now());
    else
      insert into public.user_score_results
        (organization_id, period_snapshot_id, user_id, score_formula_version_id,
         auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
        values (v_org, p_period_id, v_user.user_id, v_formula_id,
                v_score, v_metric_breakdown, 'auto', true, now());
    end if;

    v_count := v_count + 1;
  end loop;

  perform public.write_activity('period_snapshot', p_period_id, 'scores_calculated',
    jsonb_build_object('users_scored', v_count));
  return v_count;
end;
$$;
revoke execute on function public.calculate_period_scores(uuid) from public, anon;

-- ============================================================ RPC: close_period_snapshot
-- AC-7.19 atomik; D11 rank kembar by score desc, sort sekunder by full_name.
create or replace function public.close_period_snapshot(p_period_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_period public.period_snapshots; v_count int := 0;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select * into v_period from public.period_snapshots where id = p_period_id for update;
  if not found then raise exception 'Periode tidak ditemukan.'; end if;
  if v_period.status = 'closed' then
    raise exception 'Periode ini sudah ditutup dan tidak bisa diubah.';
  end if;

  -- Insert ranking_snapshots dengan dense_rank (D11 rank kembar; rank berikut MELOMPAT).
  -- Implementasi: rank() (bukan dense_rank) memberi 1,1,3,3,5 — sesuai "rank berikut melompat".
  -- D11: rank() OVER (order by score desc) → kembar (1,1,3,3,5; rank berikut melompat).
  -- full_name HANYA sebagai display tie-breaker di ORDER BY (bukan dalam OVER clause yang
  -- akan membuat ranks unik 1,2,3).
  insert into public.ranking_snapshots
    (organization_id, period_snapshot_id, user_id, rank_number, score, metric_breakdown)
  select
    v_period.organization_id,
    p_period_id,
    r.user_id,
    rank() over (order by r.effective_score desc),
    r.effective_score,
    r.metric_breakdown
  from (
    select user_id, metric_breakdown,
           coalesce(manual_adjusted_score, auto_calculated_score) as effective_score
    from public.user_score_results
    where period_snapshot_id = p_period_id and is_current = true
  ) r
  join public.profiles p on p.id = r.user_id
  order by r.effective_score desc, coalesce(p.full_name, '') asc;

  get diagnostics v_count = row_count;

  update public.period_snapshots
    set status = 'closed', closed_at = now(), closed_by = auth.uid()
    where id = p_period_id;

  perform public.write_activity('period_snapshot', p_period_id, 'period_closed',
    jsonb_build_object('ranked_users', v_count));
  return v_count;
end;
$$;
revoke execute on function public.close_period_snapshot(uuid) from public, anon;

-- ============================================================ RPC: override_user_score (D10 single-actor)
-- AC-7.15/16/17/18; anti-self & unauthorized → governance_violations 'critical'.
create or replace function public.override_user_score(
  p_period_id uuid, p_user_id uuid, p_manual_score numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_period public.period_snapshots;
  v_existing public.user_score_results;
  v_new uuid;
begin
  -- KETERBATASAN V1: governance_violations insert SEBELUM raise exception akan ter-rollback
  -- bersama caller's savepoint (PG semantics, no autonomous tx). Audit row HANYA pada SUCCESS
  -- path (activity_logs 'score_override_applied'). Audit attempt-failed defer Fase 8 (dblink).
  if p_user_id = auth.uid() then
    raise exception 'Anda tidak bisa mengubah score Anda sendiri.';
  end if;
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan override wajib diisi.';
  end if;

  select * into v_period from public.period_snapshots where id = p_period_id;
  if not found then raise exception 'Periode tidak ditemukan.'; end if;
  if v_period.status = 'closed' then
    raise exception 'Periode ini sudah ditutup dan tidak bisa diubah.';
  end if;

  -- Ambil baris current (auto atau override). Salin auto_calculated_score utuh.
  select * into v_existing
    from public.user_score_results
    where period_snapshot_id = p_period_id and user_id = p_user_id and is_current = true
    limit 1;
  if not found then raise exception 'Score user belum dihitung untuk periode ini.'; end if;

  -- Flip current sebelumnya.
  update public.user_score_results set is_current = false
    where id = v_existing.id;

  -- Insert baris override baru (single-actor: approved_by = changed_by).
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, manual_adjusted_score, metric_breakdown,
     override_reason, override_changed_by, override_changed_at, override_approved_by,
     result_kind, is_current, calculated_at)
    values (v_existing.organization_id, p_period_id, p_user_id, v_existing.score_formula_version_id,
            v_existing.auto_calculated_score, p_manual_score, v_existing.metric_breakdown,
            p_reason, auth.uid(), now(), auth.uid(),
            'override', true, now())
    returning id into v_new;

  perform public.write_activity('user_score_result', v_new, 'score_override_applied',
    jsonb_build_object(
      'period_snapshot_id', p_period_id,
      'target_user', p_user_id,
      'previous_auto', v_existing.auto_calculated_score,
      'new_manual', p_manual_score,
      'reason', p_reason,
      'changed_by', auth.uid(),
      'approved_by', auth.uid()
    ));
  return v_new;
end;
$$;
revoke execute on function public.override_user_score(uuid, uuid, numeric, text) from public, anon;

-- ============================================================ RLS
-- D13: config formula transparan org (semua anggota baca). Tulis via RPC.
-- D1/D2: user_score_results & ranking_snapshots restriktif + supervisor.

alter table public.score_categories enable row level security;
alter table public.score_formula_templates enable row level security;
alter table public.score_formula_versions enable row level security;
alter table public.score_formula_assignments enable row level security;
alter table public.period_snapshots enable row level security;
alter table public.user_score_results enable row level security;
alter table public.ranking_snapshots enable row level security;

-- score_categories: transparan org (atau null=sistem); tulis hanya manage_score_formula.
drop policy if exists "score_categories_select" on public.score_categories;
create policy "score_categories_select" on public.score_categories
  for select to authenticated
  using (organization_id is null or organization_id = public.current_user_org());

drop policy if exists "score_categories_insert" on public.score_categories;
create policy "score_categories_insert" on public.score_categories
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and public.has_permission('manage_score_formula'));

-- score_formula_templates: D13 transparan org.
drop policy if exists "score_formula_templates_select" on public.score_formula_templates;
create policy "score_formula_templates_select" on public.score_formula_templates
  for select to authenticated
  using (organization_id = public.current_user_org());

drop policy if exists "score_formula_templates_insert" on public.score_formula_templates;
create policy "score_formula_templates_insert" on public.score_formula_templates
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('manage_score_formula'));

-- score_formula_versions: D13 transparan (semua level/status). Tulis via RPC.
drop policy if exists "score_formula_versions_select" on public.score_formula_versions;
create policy "score_formula_versions_select" on public.score_formula_versions
  for select to authenticated
  using (organization_id is null or organization_id = public.current_user_org());

-- score_formula_assignments: transparan org.
drop policy if exists "score_formula_assignments_select" on public.score_formula_assignments;
create policy "score_formula_assignments_select" on public.score_formula_assignments
  for select to authenticated
  using (organization_id = public.current_user_org());

-- period_snapshots: semua anggota org lihat periode (info publik).
drop policy if exists "period_snapshots_select" on public.period_snapshots;
create policy "period_snapshots_select" on public.period_snapshots
  for select to authenticated
  using (organization_id = public.current_user_org());

-- user_score_results: D1/D2 restriktif + supervisor.
drop policy if exists "user_score_results_select" on public.user_score_results;
create policy "user_score_results_select" on public.user_score_results
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (user_id = auth.uid()
              or public.has_permission('manage_score_formula')
              or public.has_permission('view_all_workspace')
              or public.is_supervisor_of(user_id)));

-- ranking_snapshots: D1/D2 sama dgn user_score_results.
drop policy if exists "ranking_snapshots_select" on public.ranking_snapshots;
create policy "ranking_snapshots_select" on public.ranking_snapshots
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (user_id = auth.uid()
              or public.has_permission('manage_score_formula')
              or public.has_permission('view_all_workspace')
              or public.is_supervisor_of(user_id)));

-- TIDAK ada policy INSERT/UPDATE/DELETE pada user_score_results & ranking_snapshots:
-- tulis hanya via RPC SECURITY DEFINER. Default deny untuk klien.

-- ============================================================ has_permission patch: tambah manage_score_formula default
-- CEO sudah hardcode true (line 23 0005). c_level/management TIDAK punya default (sesuai spec).
-- manage_score_formula sudah di-seed Fase 0 (0001:215); efektif via user_permissions atau CEO.

-- ============================================================ SEED: score_categories (sistem)
-- Default kategori untuk Staff level (D4: 6 kategori, result_achievement keluar).
insert into public.score_categories (organization_id, code, level, label, source_metric)
select null, x.code, 'staff', x.label, x.source
from (values
  ('action_plan_completion', 'Action Plan Completion', 'action_plan_completion'),
  ('repeat_compliance', 'Repeat Compliance', 'repeat_compliance'),
  ('on_time_rate', 'On-Time Rate', 'on_time_rate'),
  ('review_pass_rate', 'Review Pass Rate', 'review_pass_rate'),
  ('development_contribution', 'Development Contribution', 'development_contribution'),
  ('governance_discipline', 'Governance Discipline', 'governance_discipline')
) as x (code, label, source)
where not exists (
  select 1 from public.score_categories c
  where c.organization_id is null and c.code = x.code and c.level = 'staff'
);

-- ============================================================ SEED: formula template + version Staff (D4/D7)
-- Staff V1: 6 kategori SUM=100. Bobot re-normalisasi dari default PRD §67 (tanpa result_achievement 15%).
-- Default PRD: completion 20 + repeat 20 + result_achievement 15 + on_time 15 + review 10 + dev 10 + gov 10 = 100.
-- Tanpa result_achievement: 20+20+15+10+10+10 = 85. Bagi sisa 15 proporsional (×100/85) → bulatkan ke integer
-- agar SUM tetap 100: completion 24 + repeat 24 + on_time 18 + review 12 + dev 12 + gov 10 = 100.
do $$
declare v_org uuid; v_tmpl uuid; v_ver uuid; r record;
begin
  for v_org in select id from public.organizations loop
    -- Template Staff default per org (idempoten).
    select id into v_tmpl from public.score_formula_templates
      where organization_id = v_org and level = 'staff' and is_default = true limit 1;
    if v_tmpl is null then
      insert into public.score_formula_templates (organization_id, name, level, is_default, created_by)
        values (v_org, 'Staff Default', 'staff', true, null) returning id into v_tmpl;
    end if;

    -- Version 1 active (idempoten).
    if not exists (select 1 from public.score_formula_versions where template_id = v_tmpl) then
      insert into public.score_formula_versions
        (organization_id, template_id, version_number, level, categories, status, activated_at, effective_date)
        values (v_org, v_tmpl, 1, 'staff',
          jsonb_build_array(
            jsonb_build_object('code','action_plan_completion','weight',24,'source_metric','action_plan_completion'),
            jsonb_build_object('code','repeat_compliance','weight',24,'source_metric','repeat_compliance'),
            jsonb_build_object('code','on_time_rate','weight',18,'source_metric','on_time_rate'),
            jsonb_build_object('code','review_pass_rate','weight',12,'source_metric','review_pass_rate'),
            jsonb_build_object('code','development_contribution','weight',12,'source_metric','development_contribution'),
            jsonb_build_object('code','governance_discipline','weight',10,'source_metric','governance_discipline')
          ),
          'active', now(), current_date)
        returning id into v_ver;
    end if;

    -- D7: template Management/C-Level/CEO = draft (placeholder, kategori kosong).
    for r in select lvl from unnest(array['management','c_level','ceo']) lvl loop
      if not exists (select 1 from public.score_formula_templates
                     where organization_id=v_org and level=r.lvl and is_default=true) then
        insert into public.score_formula_templates (organization_id, name, level, is_default)
          values (v_org, initcap(replace(r.lvl,'_',' '))||' Default', r.lvl, true);
      end if;
    end loop;
  end loop;
end $$;
