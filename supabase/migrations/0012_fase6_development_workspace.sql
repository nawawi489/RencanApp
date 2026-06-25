-- EMS V1.8.1 — Fase 6: Development Workspace (Development Area → Problem Statement → Initiative → Action Plan).
-- Jalur eksekusi kedua, paralel dgn Performance (Fase 4). Initiative & Action Plan reuse penuh Fase 1–5.
--
-- Sumber: wiki/concepts/fase6-spec.md (AC-A1..AC-X2, DC-1..DC-21, non-goals, tdd_handoff).
--
-- Keputusan mengikat (kunci sebelum green; menutup kritik tdd-plan MC/CN):
--   K1 SELECT policy DA/PS pakai kolom INLINE (org/pic/created_by) + helper LINTAS-tabel untuk
--      cabang "turunan". Tidak boleh helper yang me-requery tabel sendiri (gotcha 42501 yang
--      menggigit Fase 1; lihat 0006_fase1_fix_returning_rls). CN-8 sebagai dampak: MC-1
--      menegaskan INSERT…RETURNING DA & PS lolos via .insert().select().single().
--   K2 problem_statement_in_my_org(null) → TRUE (null-safe), agar INSERT/UPDATE Initiative
--      Performance (problem_statement_id NULL) TIDAK regresi. (CN-8).
--   K3 CHECK initiatives_single_parent: strategy_id XOR problem_statement_id — keduanya tidak
--      boleh ter-isi bersamaan; keduanya null tetap valid (Initiative datar Fase 1).
--   K4 Permission create_development_area sudah di-seed Fase 0 (0001 L201); has_permission()
--      hardcode c_level/management TIDAK memuatnya, jadi default Staff/C-Level/Management = false
--      kecuali grant eksplisit. Dipakai di RLS INSERT DA + RPC. (CN-7).
--   K5 FK problem_statements→development_areas ON DELETE RESTRICT (sama dgn KPI Area→Goal).
--      FK initiatives.problem_statement_id ON DELETE SET NULL (sama dgn strategy_id, Fase 4).
--   K6 activate_development_area / activate_problem_statement: gate MBR mode 'blokir_aktivasi'
--      INLINE (pola activate_kpi_area Fase 5). Default sistem dev = 'hanya_peringatan' jadi tidak
--      menghalangi; gate aktif hanya bila org mengubah rule ke 'blokir_aktivasi'. (MC-4/CN-5).
--   K7 tg_enforce_mbr_block_child: pasang ke problem_statements; di cabang initiatives,
--      route by populated FK — strategy_id non-null → ('strategy','initiative'); else
--      problem_statement_id non-null → ('problem_statement','initiative'); else (kedua null)
--      → return new (Initiative datar Fase 1). CASE expr dipakai untuk parameterize FK column.
--   K8 check_minimum_breakdown_compliance: HAPUS early-return baris 182-184. Tambah cabang
--      development_area→problem_statement & problem_statement→initiative (count by populated FK).
--   K9 Initiative Development (problem_statement_id != null) ikut visibility chain:
--      - initiatives_select diperluas: is_problem_statement_pic(problem_statement_id)
--      - action_plans_select diperluas: i_am_problem_statement_pic_via_initiative(initiative_id)
--      - can_access_initiative diperluas: cek problem_statement chain juga (Fase 3 collab).
--      - activate_initiative diperluas: is_problem_statement_pic sebagai jalur otorisasi.
--   K10 Tidak ada migrasi tabel Strategy/KPI Area/Goal/Action Plan. Tidak ada kolom weight.
--       Tidak ada seed 7 Development Area per-org (PRD §85 → contoh, bukan auto-seed). (NG2/OQ-2).

-- ============================================================ TABLES

-- Development Area (root jalur Development; mirror Goal struktur kanonik tapi tanpa goal_template_id).
create table if not exists public.development_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  pic_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in ('draft', 'active', 'done', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint development_areas_period_order check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

-- Problem Statement / Development Goal (child Development Area; mirror Strategy minus reason/risk/alt).
create table if not exists public.problem_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  development_area_id uuid not null references public.development_areas (id) on delete restrict,  -- K5
  name text not null,
  description text,
  pic_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in ('draft', 'active', 'done', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint problem_statements_period_order check (
    period_start is null or period_end is null or period_end >= period_start
  )
);

-- Initiative: ditambahi problem_statement_id (nullable; SET NULL agar hapus PS tidak hapus Initiative).
-- CHECK initiatives_single_parent menjamin satu (atau nol) induk strategis — tidak dua arah.
alter table public.initiatives
  add column if not exists problem_statement_id uuid
    references public.problem_statements (id) on delete set null;

-- CHECK ditambah idempoten via DO block (Postgres tidak punya "add constraint if not exists" sebelum 15).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.initiatives'::regclass and conname = 'initiatives_single_parent'
  ) then
    alter table public.initiatives
      add constraint initiatives_single_parent
      check (strategy_id is null or problem_statement_id is null);  -- keduanya null OK; satu non-null OK; dua non-null DITOLAK
  end if;
end $$;

create index if not exists idx_problem_statements_dev_area on public.problem_statements (development_area_id);
create index if not exists idx_initiatives_problem_statement on public.initiatives (problem_statement_id);

-- updated_at otomatis.
drop trigger if exists development_areas_set_updated_at on public.development_areas;
create trigger development_areas_set_updated_at before update on public.development_areas
  for each row execute function public.set_updated_at();
drop trigger if exists problem_statements_set_updated_at on public.problem_statements;
create trigger problem_statements_set_updated_at before update on public.problem_statements
  for each row execute function public.set_updated_at();

-- ============================================================ AUDIT (append-only)

drop trigger if exists development_areas_log_create on public.development_areas;
create trigger development_areas_log_create after insert on public.development_areas
  for each row execute function public.log_card_creation('development_area');
drop trigger if exists problem_statements_log_create on public.problem_statements;
create trigger problem_statements_log_create after insert on public.problem_statements
  for each row execute function public.log_card_creation('problem_statement');

-- ============================================================ HELPER FUNCTIONS (SECURITY DEFINER, bebas RLS)
-- Catatan K1: SELECT policy DA/PS WAJIB pakai kolom INLINE. Helper hanya dipakai untuk LINTAS-tabel
-- (problem_statements dari sudut DA; initiatives/action_plans dari sudut PS) sehingga tidak menyentuh
-- baris yang sedang INSERT...RETURNING-ed (aman dari 42501).

create or replace function public.is_development_area_pic(p_dev_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.development_areas d
    where d.id = p_dev_area
      and d.organization_id = public.current_user_org()
      and d.pic_id = auth.uid()
  );
$$;

create or replace function public.is_problem_statement_pic(p_ps uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.problem_statements p
    where p.id = p_ps
      and p.organization_id = public.current_user_org()
      and p.pic_id = auth.uid()
  );
$$;

-- Validasi induk se-organisasi (tutup cross-org FK hole). K2: null-safe agar Initiative Performance
-- (problem_statement_id NULL) lolos initiatives_insert/update yang akan diperluas.
create or replace function public.development_area_in_my_org(p_dev_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_dev_area is null or exists (
    select 1 from public.development_areas d
    where d.id = p_dev_area and d.organization_id = public.current_user_org()
  );
$$;

create or replace function public.problem_statement_in_my_org(p_ps uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_ps is null or exists (
    select 1 from public.problem_statements p
    where p.id = p_ps and p.organization_id = public.current_user_org()
  );
$$;

-- Visibility chain: DA punya PS milik saya, atau Initiative/AP milik saya di bawahnya.
create or replace function public.development_area_has_my_descendant(p_dev_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.problem_statements p
    where p.development_area_id = p_dev_area
      and (p.pic_id = auth.uid() or p.created_by = auth.uid()
        or exists (select 1 from public.initiatives i where i.problem_statement_id = p.id
          and (i.pic_id = auth.uid() or i.created_by = auth.uid()
            or exists (select 1 from public.action_plans a where a.initiative_id = i.id
              and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))))
  );
$$;

-- PS punya Initiative/AP milik saya di bawahnya.
create or replace function public.problem_statement_has_my_descendant(p_ps uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i where i.problem_statement_id = p_ps
      and (i.pic_id = auth.uid() or i.created_by = auth.uid()
        or exists (select 1 from public.action_plans a where a.initiative_id = i.id
          and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))
  );
$$;

-- Untuk action_plans_select extension: apakah saya PIC Problem Statement yang menjadi induk
-- Initiative ini (jalur Fase 6: PIC PS lihat AP turunan).
create or replace function public.i_am_problem_statement_pic_via_initiative(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i
    join public.problem_statements p on p.id = i.problem_statement_id
    where i.id = p_initiative
      and p.organization_id = public.current_user_org()
      and p.pic_id = auth.uid()
  );
$$;

-- can_access_* untuk pemakaian programatik (RPC). Body shallow + helper.
create or replace function public.can_access_development_area(p_dev_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.development_areas d where d.id = p_dev_area
      and d.organization_id = public.current_user_org()
      and (public.can_view_workspace() or d.pic_id = auth.uid() or d.created_by = auth.uid()
           or public.development_area_has_my_descendant(d.id))
  );
$$;

create or replace function public.can_access_problem_statement(p_ps uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.problem_statements p where p.id = p_ps
      and p.organization_id = public.current_user_org()
      and (public.can_view_workspace() or p.pic_id = auth.uid() or p.created_by = auth.uid()
           or public.is_development_area_pic(p.development_area_id)
           or public.problem_statement_has_my_descendant(p.id))
  );
$$;

revoke execute on function public.is_development_area_pic(uuid) from public, anon;
revoke execute on function public.is_problem_statement_pic(uuid) from public, anon;
revoke execute on function public.development_area_in_my_org(uuid) from public, anon;
revoke execute on function public.problem_statement_in_my_org(uuid) from public, anon;
revoke execute on function public.development_area_has_my_descendant(uuid) from public, anon;
revoke execute on function public.problem_statement_has_my_descendant(uuid) from public, anon;
revoke execute on function public.i_am_problem_statement_pic_via_initiative(uuid) from public, anon;
revoke execute on function public.can_access_development_area(uuid) from public, anon;
revoke execute on function public.can_access_problem_statement(uuid) from public, anon;

-- ============================================================ RLS

alter table public.development_areas enable row level security;
alter table public.problem_statements enable row level security;

-- Development Area: lihat (inline kolom + helper LINTAS-tabel utk descendant); buat butuh
-- create_development_area; ubah oleh creator/PIC/manage_others.
drop policy if exists "development_areas_select" on public.development_areas;
create policy "development_areas_select" on public.development_areas
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.can_view_workspace() or pic_id = auth.uid() or created_by = auth.uid()
              or public.development_area_has_my_descendant(id)));

drop policy if exists "development_areas_insert" on public.development_areas;
create policy "development_areas_insert" on public.development_areas
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('create_development_area'));

drop policy if exists "development_areas_update" on public.development_areas;
create policy "development_areas_update" on public.development_areas
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org());

-- Problem Statement: lihat (inline + helper utk DA-PIC & descendant); buat butuh
-- create_development_area ATAU jadi PIC Development Area induk (jalur parent-PIC).
drop policy if exists "problem_statements_select" on public.problem_statements;
create policy "problem_statements_select" on public.problem_statements
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.can_view_workspace() or pic_id = auth.uid() or created_by = auth.uid()
              or public.is_development_area_pic(development_area_id)
              or public.problem_statement_has_my_descendant(id)));

drop policy if exists "problem_statements_insert" on public.problem_statements;
create policy "problem_statements_insert" on public.problem_statements
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.development_area_in_my_org(development_area_id)
              and (public.has_permission('create_development_area')
                   or public.is_development_area_pic(development_area_id)));

drop policy if exists "problem_statements_update" on public.problem_statements;
create policy "problem_statements_update" on public.problem_statements
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org());

-- ============================================================ INITIATIVES: perluas SELECT/INSERT/UPDATE
-- AC-C3 + AC-C4 + AC-D5. INSERT/UPDATE: tambah problem_statement_in_my_org (K2 null-safe).
-- SELECT: tambah is_problem_statement_pic (PIC PS lihat Initiative Development tanpa jadi PIC Initiative).

drop policy if exists "initiatives_select" on public.initiatives;
create policy "initiatives_select" on public.initiatives
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      public.can_view_workspace()
      or pic_id = auth.uid()
      or created_by = auth.uid()
      or public.initiative_has_my_action_plan(id)
      or public.is_problem_statement_pic(problem_statement_id)  -- Fase 6: PIC PS lihat Initiative-nya
    )
  );

drop policy if exists "initiatives_insert" on public.initiatives;
create policy "initiatives_insert" on public.initiatives
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('create_initiative')
              and public.strategy_in_my_org(strategy_id)
              and public.problem_statement_in_my_org(problem_statement_id));  -- K2 null-safe

drop policy if exists "initiatives_update" on public.initiatives;
create policy "initiatives_update" on public.initiatives
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org()
              and public.strategy_in_my_org(strategy_id)
              and public.problem_statement_in_my_org(problem_statement_id));

-- ============================================================ ACTION_PLANS: perluas SELECT
-- AC-D6: PIC Problem Statement bisa lihat AP di bawah Initiative Development-nya.

drop policy if exists "action_plans_select" on public.action_plans;
create policy "action_plans_select" on public.action_plans
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      public.can_view_workspace()
      or pic_id = auth.uid()
      or reviewer_id = auth.uid()
      or created_by = auth.uid()
      or public.i_am_initiative_pic(initiative_id)
      or public.i_am_problem_statement_pic_via_initiative(initiative_id)  -- Fase 6
    )
  );

-- ============================================================ EXTEND can_access_initiative (Fase 3 collab)
-- AC-W1: notifications/comments/inbox Fase 3 memakai can_access_initiative. Perluas agar PIC PS &
-- creator PS punya akses (jalur Development), serta descendant chain via problem_statement.

create or replace function public.can_access_initiative(p_initiative uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i
    where i.id = p_initiative
      and i.organization_id = public.current_user_org()
      and (public.can_view_workspace() or i.pic_id = auth.uid()
           or i.created_by = auth.uid() or public.initiative_has_my_action_plan(i.id)
           or public.is_problem_statement_pic(i.problem_statement_id))  -- Fase 6
  );
$$;
revoke execute on function public.can_access_initiative(uuid) from public, anon;

-- ============================================================ RPC: lifecycle Development
-- AC-E1..E3, AC-F1..F3. Gate kelengkapan (nama, PIC, periode) + otorisasi + MBR gate inline (K6).

create or replace function public.activate_development_area(p_development_area_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.development_areas;
  v_rule public.minimum_breakdown_rules;
  v_children int;
begin
  select * into d from public.development_areas where id = p_development_area_id;
  if not found then raise exception 'Development Area tidak ditemukan.'; end if;
  if not (d.created_by = auth.uid() or d.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Development Area ini.';
  end if;
  if d.status <> 'draft' then raise exception 'Development Area sudah diaktifkan.'; end if;
  if coalesce(trim(d.name), '') = '' or d.pic_id is null
     or d.period_start is null or d.period_end is null then
    raise exception 'Kelengkapan Development Area belum terpenuhi (nama, PIC, periode wajib).';
  end if;

  -- K6: gate MBR mode 'blokir_aktivasi' inline (default sistem = hanya_peringatan → lewat).
  v_rule := public.current_minimum_breakdown_rule('development_area', 'problem_statement');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_children from public.problem_statements
      where development_area_id = p_development_area_id and status <> 'archived'
        and organization_id = d.organization_id;
    if v_children < v_rule.min_count then
      raise exception
        'Development Area ini baru memiliki % dari % Problem Statement. Tambahkan % Problem Statement lagi agar bisa diaktifkan.',
        v_children, v_rule.min_count, (v_rule.min_count - v_children);
    end if;
  end if;

  update public.development_areas set status = 'active' where id = p_development_area_id;
  perform public.write_activity('development_area', p_development_area_id, 'activate', '{}'::jsonb);
end;
$$;

create or replace function public.activate_problem_statement(p_problem_statement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.problem_statements;
  v_rule public.minimum_breakdown_rules;
  v_children int;
begin
  select * into p from public.problem_statements where id = p_problem_statement_id;
  if not found then raise exception 'Problem Statement tidak ditemukan.'; end if;
  if not (p.created_by = auth.uid() or p.pic_id = auth.uid()
          or public.is_development_area_pic(p.development_area_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Problem Statement ini.';
  end if;
  if p.status <> 'draft' then raise exception 'Problem Statement sudah diaktifkan.'; end if;
  if coalesce(trim(p.name), '') = '' or p.pic_id is null
     or p.period_start is null or p.period_end is null then
    raise exception 'Kelengkapan Problem Statement belum terpenuhi (nama, PIC, periode wajib).';
  end if;

  -- K6: gate MBR mode 'blokir_aktivasi' inline.
  v_rule := public.current_minimum_breakdown_rule('problem_statement', 'initiative');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_children from public.initiatives
      where problem_statement_id = p_problem_statement_id and status <> 'archived'
        and organization_id = p.organization_id;
    if v_children < v_rule.min_count then
      raise exception
        'Problem Statement ini baru memiliki % dari % Initiative. Tambahkan % Initiative lagi agar bisa diaktifkan.',
        v_children, v_rule.min_count, (v_rule.min_count - v_children);
    end if;
  end if;

  update public.problem_statements set status = 'active' where id = p_problem_statement_id;
  perform public.write_activity('problem_statement', p_problem_statement_id, 'activate', '{}'::jsonb);
end;
$$;

revoke execute on function public.activate_development_area(uuid) from public, anon;
revoke execute on function public.activate_problem_statement(uuid) from public, anon;

-- ============================================================ EXTEND activate_initiative (jalur PIC PS)
-- AC-W3: PIC Problem Statement bisa mengaktifkan Initiative di bawahnya.

create or replace function public.activate_initiative(p_initiative_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.initiatives;
begin
  select * into i from public.initiatives where id = p_initiative_id;
  if not found then raise exception 'Initiative tidak ditemukan.'; end if;
  if not (i.created_by = auth.uid() or i.pic_id = auth.uid()
          or public.is_problem_statement_pic(i.problem_statement_id)  -- Fase 6 jalur Development
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Initiative ini.';
  end if;
  if i.status <> 'draft' then raise exception 'Initiative sudah diaktifkan.'; end if;
  if coalesce(trim(i.name), '') = '' or coalesce(trim(i.target_result), '') = ''
     or i.pic_id is null or i.period_start is null or i.period_end is null then
    raise exception 'Kelengkapan Initiative belum terpenuhi (nama, target hasil, periode, PIC wajib).';
  end if;
  update public.initiatives set status = 'active' where id = p_initiative_id;
  perform public.write_activity('initiative', p_initiative_id, 'activate', '{}'::jsonb);
end;
$$;

-- ============================================================ MBR FLIP (K8 + K7)
-- (1) check_minimum_breakdown_compliance: hapus early-return; tambah cabang dev_area & PS.
-- (2) tg_enforce_mbr_block_child: route Initiative by populated FK; tambah cabang problem_statements;
--     CASE expr meluas; pasang trigger ke problem_statements.

create or replace function public.check_minimum_breakdown_compliance(
  p_parent_card_type text, p_parent_card_id uuid
) returns table(
  child_card_type text,
  current_count int,
  required_count int,
  enforcement_mode text,
  meets_requirement boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_child text;
  v_count int := 0;
  v_rule public.minimum_breakdown_rules;
begin
  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Organisasi tidak ditemukan.';
  end if;

  -- Tentukan child terdekat + autz akses parent + tenant check.
  if p_parent_card_type = 'goal' then
    if not public.can_access_goal(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Goal ini.';
    end if;
    v_child := 'kpi_area';
    select count(*) into v_count from public.kpi_areas
      where goal_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'kpi_area' then
    if not public.can_access_kpi_area(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca KPI Area ini.';
    end if;
    v_child := 'strategy';
    select count(*) into v_count from public.strategies
      where kpi_area_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'strategy' then
    if not public.can_access_strategy(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Strategy ini.';
    end if;
    v_child := 'initiative';
    select count(*) into v_count from public.initiatives
      where strategy_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'initiative' then
    if not public.can_access_initiative(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Initiative ini.';
    end if;
    v_child := 'action_plan';
    select count(*) into v_count from public.action_plans
      where initiative_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'development_area' then  -- Fase 6
    if not public.can_access_development_area(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Development Area ini.';
    end if;
    v_child := 'problem_statement';
    select count(*) into v_count from public.problem_statements
      where development_area_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'problem_statement' then  -- Fase 6
    if not public.can_access_problem_statement(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Problem Statement ini.';
    end if;
    v_child := 'initiative';
    select count(*) into v_count from public.initiatives
      where problem_statement_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  else
    raise exception 'parent_card_type tidak didukung: %', p_parent_card_type;
  end if;

  v_rule := public.current_minimum_breakdown_rule(p_parent_card_type, v_child);
  if v_rule.id is null then
    -- Tanpa rule → fail-open (compliant).
    child_card_type := v_child;
    current_count := v_count;
    required_count := 0;
    enforcement_mode := 'hanya_peringatan';
    meets_requirement := true;
    return next;
    return;
  end if;

  child_card_type := v_child;
  current_count := v_count;
  required_count := v_rule.min_count;
  enforcement_mode := v_rule.enforcement_mode;
  meets_requirement := (v_count >= v_rule.min_count);
  return next;
end;
$$;
revoke execute on function public.check_minimum_breakdown_compliance(text, uuid) from public, anon;

-- Trigger BEFORE INSERT: extend ke problem_statements + route Initiative by populated FK.
create or replace function public.tg_enforce_mbr_block_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent_type text;
  v_child_type text;
  v_parent_id uuid;
  v_parent_col text;
  v_org uuid;
  v_rule public.minimum_breakdown_rules;
  v_siblings int;
begin
  -- Petakan tabel turunan → (parent_type, child_type, parent_id, parent_col untuk hitung sibling).
  if tg_table_name = 'kpi_areas' then
    v_parent_type := 'goal'; v_child_type := 'kpi_area';
    v_parent_id := new.goal_id; v_parent_col := 'goal_id';
  elsif tg_table_name = 'strategies' then
    v_parent_type := 'kpi_area'; v_child_type := 'strategy';
    v_parent_id := new.kpi_area_id; v_parent_col := 'kpi_area_id';
  elsif tg_table_name = 'initiatives' then
    -- K7: route by populated FK. Initiative datar (kedua null) → lewati.
    if new.strategy_id is not null then
      v_parent_type := 'strategy'; v_child_type := 'initiative';
      v_parent_id := new.strategy_id; v_parent_col := 'strategy_id';
    elsif new.problem_statement_id is not null then
      v_parent_type := 'problem_statement'; v_child_type := 'initiative';
      v_parent_id := new.problem_statement_id; v_parent_col := 'problem_statement_id';
    else
      return new;  -- Initiative datar Fase 1: bypass MBR.
    end if;
  elsif tg_table_name = 'action_plans' then
    v_parent_type := 'initiative'; v_child_type := 'action_plan';
    v_parent_id := new.initiative_id; v_parent_col := 'initiative_id';
  elsif tg_table_name = 'problem_statements' then  -- Fase 6
    v_parent_type := 'development_area'; v_child_type := 'problem_statement';
    v_parent_id := new.development_area_id; v_parent_col := 'development_area_id';
  else
    return new;
  end if;

  v_rule := public.current_minimum_breakdown_rule(v_parent_type, v_child_type);
  if v_rule.id is null or v_rule.enforcement_mode <> 'blokir_akses_turunan' then
    return new;
  end if;

  v_org := new.organization_id;
  execute format(
    'select count(*) from public.%I where %I = $1 and status <> ''archived'' and organization_id = $2',
    tg_table_name, v_parent_col
  ) into v_siblings using v_parent_id, v_org;

  if v_siblings < v_rule.min_count then
    raise exception
      'Tidak dapat membuat % baru: induk masih membutuhkan % dari % %.',
      v_child_type, (v_rule.min_count - v_siblings), v_rule.min_count, v_child_type;
  end if;

  return new;
end;
$$;
revoke execute on function public.tg_enforce_mbr_block_child() from public, anon;

drop trigger if exists problem_statements_enforce_mbr on public.problem_statements;
create trigger problem_statements_enforce_mbr before insert on public.problem_statements
  for each row execute function public.tg_enforce_mbr_block_child();

-- ============================================================ SEED card_guidance_contents (Fase 6)
-- AC-J1 + AC-T2/T3. Idempoten by-card_type+org-null.

insert into public.card_guidance_contents (organization_id, card_type, title, body)
select null::uuid, x.card_type, x.title, x.body
from (values
  ('development_area', 'Development Area — Area pengembangan apa yang sedang dibangun?',
   'Development Area adalah area pembangunan mesin perusahaan: sistem, SDM, organisasi, teknologi, infrastruktur, brand, atau governance. Wajib punya Nama, PIC/Owner, dan Periode. Pecah Development Area menjadi Problem Statement / Development Goal. Contoh tujuh area: Organization, People, System, Technology, Infrastructure, Brand, Governance Development.'),
  ('problem_statement', 'Problem Statement — Masalah apa yang ingin diselesaikan?',
   'Problem Statement (atau Development Goal) menjelaskan masalah/peluang spesifik di Development Area. Wajib Nama, PIC, dan Periode. Pecah Problem Statement menjadi Initiative untuk eksekusi konkret.')
) as x (card_type, title, body)
where not exists (
  select 1 from public.card_guidance_contents g
  where g.card_type = x.card_type and g.organization_id is null
);
