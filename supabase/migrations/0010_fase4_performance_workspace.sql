-- EMS V1.8.1 — Fase 4: Performance Workspace (Hierarki Strategis)
-- Menambah lapisan strategis di atas Initiative datar Fase 1: Goal → KPI Area → Strategy → (Initiative → Action Plan).
-- Tabel: goal_templates, kpi_area_templates (sistem), goals, kpi_areas, strategies + initiatives.strategy_id.
-- Keputusan mengikat (lihat specs/fase-4-tdd-handoff.json):
--   K1 write model: card dibuat via INSERT ber-RLS (bukan RPC); hanya lifecycle activate_* + apply_goal_template via RPC.
--   K2 gate: Goal aktif wajib >=1 KPI Area; Strategy wajib alasan/risiko/alternatif; KPI Area wajib Target. Mesin 3/3/3 DEFER Fase 5.
--   K3 tanpa reviewer_id pada planning card.
--   K4 create_goal/create_kpi_area = CEO/grant (TIDAK di default c_level/management); create_strategy tetap default. (has_permission 0005 sudah benar.)
--   K5 FK planning chain ON DELETE RESTRICT; initiatives.strategy_id SET NULL; cross-org ditutup di RLS WITH CHECK + can_access.
--   K6 seed kpi_area_templates nama PERSIS PRD §47-48 (idempoten where not exists).
--   K7 can_access_goal/kpi_area/strategy meniru can_access_initiative (org + view_workspace/pic/creator/PIC-induk/EXISTS-turunan).
--   K8 audit append-only via write_activity; CHECK notifications enum TIDAK diubah.
--   K9 apply_goal_template atomik.

-- ============================================================ TABLES (urutan dependency-safe)

-- Template sistem (organization_id null = bawaan). Finite: 2 Goal Template (Omset, Profit).
create table if not exists public.goal_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,                 -- 'omset' | 'profit'
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.kpi_area_templates (
  id uuid primary key default gen_random_uuid(),
  goal_template_id uuid not null references public.goal_templates (id) on delete cascade,
  division text not null check (division in ('cmo', 'coo', 'cfo', 'chro', 'cbo')),
  division_label text not null,             -- mis. 'Sales & Marketing (CMO)'
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (goal_template_id, division, name)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  description text,
  pic_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in ('draft', 'active', 'done', 'archived')),
  goal_template_id uuid references public.goal_templates (id) on delete set null,  -- jejak asal template (K6/§50)
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_period_order check (period_start is null or period_end is null or period_end >= period_start)
);

create table if not exists public.kpi_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete restrict,   -- K5: tidak boleh cascade hapus
  name text not null,
  description text,
  target text,                              -- Target (tanpa bobot/satuan wajib — PRD §46)
  pic_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in ('draft', 'active', 'done', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_areas_period_order check (period_start is null or period_end is null or period_end >= period_start)
);

create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kpi_area_id uuid not null references public.kpi_areas (id) on delete restrict,   -- K5
  name text not null,
  description text,
  reason text,                              -- Alasan Strategy (wajib saat aktif — PRD §22)
  main_risk text,                           -- Risiko Utama (wajib saat aktif)
  alternative text,                         -- Alternatif Strategy (wajib saat aktif)
  pic_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in ('draft', 'active', 'done', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strategies_period_order check (period_start is null or period_end is null or period_end >= period_start)
  -- K3: TIDAK ada reviewer_id pada planning card.
);

-- Initiative datar Fase 1 mendapat induk strategis (nullable → backward-compat; SET NULL agar hapus Strategy tak hapus evidence).
alter table public.initiatives
  add column if not exists strategy_id uuid references public.strategies (id) on delete set null;

create index if not exists idx_kpi_areas_goal on public.kpi_areas (goal_id);
create index if not exists idx_strategies_kpi_area on public.strategies (kpi_area_id);
create index if not exists idx_initiatives_strategy on public.initiatives (strategy_id);
create index if not exists idx_kpi_area_templates_goal on public.kpi_area_templates (goal_template_id);

-- updated_at otomatis (public.set_updated_at dari Fase 0).
drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at before update on public.goals
  for each row execute function public.set_updated_at();
drop trigger if exists kpi_areas_set_updated_at on public.kpi_areas;
create trigger kpi_areas_set_updated_at before update on public.kpi_areas
  for each row execute function public.set_updated_at();
drop trigger if exists strategies_set_updated_at on public.strategies;
create trigger strategies_set_updated_at before update on public.strategies
  for each row execute function public.set_updated_at();

-- ============================================================ VISIBILITAS (SECURITY DEFINER, bebas RLS)
-- PENTING (root cause yang ditemukan saat TDD): SELECT policy untuk tabel ini menyebut kolom baris INLINE
-- (organization_id/pic_id/created_by/induk) — BUKAN lewat fungsi can_access_*(id) yang me-requery tabelnya sendiri.
-- Sebab: pada INSERT ... RETURNING (dipakai data layer .insert().select().single()), fungsi STABLE yang
-- me-requery tabel yang sama TIDAK melihat baris baru di snapshot statement → exists()=false → 42501 palsu.
-- Cabang "turunan" (level bawah ikut lihat leluhur) tetap lewat helper, karena query tabel LAIN (aman).

-- Helper otorisasi parent-PIC untuk INSERT KPI Area / Strategy (dipakai di RLS WITH CHECK) + akses induk.
create or replace function public.is_goal_pic(p_goal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.goals g
                 where g.id = p_goal and g.organization_id = public.current_user_org() and g.pic_id = auth.uid());
$$;
create or replace function public.is_kpi_area_pic(p_kpi_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kpi_areas k
                 where k.id = p_kpi_area and k.organization_id = public.current_user_org() and k.pic_id = auth.uid());
$$;
revoke execute on function public.is_goal_pic(uuid) from public, anon;
revoke execute on function public.is_kpi_area_pic(uuid) from public, anon;

-- Helper validasi induk se-organisasi (tutup cross-org FK hole, K5).
create or replace function public.goal_in_my_org(p_goal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.goals g where g.id = p_goal and g.organization_id = public.current_user_org());
$$;
create or replace function public.kpi_area_in_my_org(p_kpi_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kpi_areas k where k.id = p_kpi_area and k.organization_id = public.current_user_org());
$$;
create or replace function public.strategy_in_my_org(p_strategy uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_strategy is null or exists (
    select 1 from public.strategies s where s.id = p_strategy and s.organization_id = public.current_user_org());
$$;
revoke execute on function public.goal_in_my_org(uuid) from public, anon;
revoke execute on function public.kpi_area_in_my_org(uuid) from public, anon;
revoke execute on function public.strategy_in_my_org(uuid) from public, anon;

create or replace function public.goal_has_my_descendant(p_goal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.kpi_areas k where k.goal_id = p_goal
      and (k.pic_id = auth.uid() or k.created_by = auth.uid()
        or exists (select 1 from public.strategies s where s.kpi_area_id = k.id
          and (s.pic_id = auth.uid() or s.created_by = auth.uid()
            or exists (select 1 from public.initiatives i where i.strategy_id = s.id
              and (i.pic_id = auth.uid() or i.created_by = auth.uid()
                or exists (select 1 from public.action_plans a where a.initiative_id = i.id
                  and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))))))
  );
$$;

create or replace function public.kpi_area_has_my_descendant(p_kpi_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.strategies s where s.kpi_area_id = p_kpi_area
      and (s.pic_id = auth.uid() or s.created_by = auth.uid()
        or exists (select 1 from public.initiatives i where i.strategy_id = s.id
          and (i.pic_id = auth.uid() or i.created_by = auth.uid()
            or exists (select 1 from public.action_plans a where a.initiative_id = i.id
              and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))))
  );
$$;

create or replace function public.strategy_has_my_descendant(p_strategy uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.initiatives i where i.strategy_id = p_strategy
      and (i.pic_id = auth.uid() or i.created_by = auth.uid()
        or exists (select 1 from public.action_plans a where a.initiative_id = i.id
          and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))
  );
$$;

revoke execute on function public.goal_has_my_descendant(uuid) from public, anon;
revoke execute on function public.kpi_area_has_my_descendant(uuid) from public, anon;
revoke execute on function public.strategy_has_my_descendant(uuid) from public, anon;

-- can_access_* (K7) — untuk pemakaian programatik atas baris yang SUDAH ada (mis. RPC). Body shallow + helper.
create or replace function public.can_access_goal(p_goal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.goals g where g.id = p_goal
      and g.organization_id = public.current_user_org()
      and (public.can_view_workspace() or g.pic_id = auth.uid() or g.created_by = auth.uid()
           or public.goal_has_my_descendant(g.id))
  );
$$;

create or replace function public.can_access_kpi_area(p_kpi_area uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.kpi_areas k where k.id = p_kpi_area
      and k.organization_id = public.current_user_org()
      and (public.can_view_workspace() or k.pic_id = auth.uid() or k.created_by = auth.uid()
           or public.is_goal_pic(k.goal_id) or public.kpi_area_has_my_descendant(k.id))
  );
$$;

create or replace function public.can_access_strategy(p_strategy uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.strategies s where s.id = p_strategy
      and s.organization_id = public.current_user_org()
      and (public.can_view_workspace() or s.pic_id = auth.uid() or s.created_by = auth.uid()
           or public.is_kpi_area_pic(s.kpi_area_id) or public.strategy_has_my_descendant(s.id))
  );
$$;

revoke execute on function public.can_access_goal(uuid) from public, anon;
revoke execute on function public.can_access_kpi_area(uuid) from public, anon;
revoke execute on function public.can_access_strategy(uuid) from public, anon;

-- ============================================================ AUDIT (append-only, reuse log_card_creation)

drop trigger if exists goals_log_create on public.goals;
create trigger goals_log_create after insert on public.goals
  for each row execute function public.log_card_creation('goal');
drop trigger if exists kpi_areas_log_create on public.kpi_areas;
create trigger kpi_areas_log_create after insert on public.kpi_areas
  for each row execute function public.log_card_creation('kpi_area');
drop trigger if exists strategies_log_create on public.strategies;
create trigger strategies_log_create after insert on public.strategies
  for each row execute function public.log_card_creation('strategy');

-- ============================================================ RPC: lifecycle (Draft → Active)

-- Goal: gate kelengkapan (nama, PIC, periode) + WAJIB >=1 KPI Area (PRD §20.4 / K2).
create or replace function public.activate_goal(p_goal_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.goals; v_kpi int;
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Goal ini.';
  end if;
  if g.status <> 'draft' then raise exception 'Goal sudah diaktifkan.'; end if;
  if coalesce(trim(g.name), '') = '' or g.pic_id is null or g.period_start is null or g.period_end is null then
    raise exception 'Kelengkapan Goal belum terpenuhi (nama, PIC, periode wajib).';
  end if;
  select count(*) into v_kpi from public.kpi_areas where goal_id = p_goal_id;
  if v_kpi < 1 then
    raise exception 'Goal wajib memiliki minimal 1 KPI Area sebelum diaktifkan.';
  end if;
  update public.goals set status = 'active' where id = p_goal_id;
  perform public.write_activity('goal', p_goal_id, 'activate', '{}'::jsonb);
end;
$$;

-- KPI Area: gate kelengkapan (nama, PIC, periode, TARGET wajib — FR-KPI-02 / K2).
create or replace function public.activate_kpi_area(p_kpi_area_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare k public.kpi_areas;
begin
  select * into k from public.kpi_areas where id = p_kpi_area_id;
  if not found then raise exception 'KPI Area tidak ditemukan.'; end if;
  if not (k.created_by = auth.uid() or k.pic_id = auth.uid() or public.is_goal_pic(k.goal_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan KPI Area ini.';
  end if;
  if k.status <> 'draft' then raise exception 'KPI Area sudah diaktifkan.'; end if;
  if coalesce(trim(k.name), '') = '' or k.pic_id is null or k.period_start is null or k.period_end is null
     or coalesce(trim(k.target), '') = '' then
    raise exception 'Kelengkapan KPI Area belum terpenuhi (nama, PIC, periode, Target wajib).';
  end if;
  update public.kpi_areas set status = 'active' where id = p_kpi_area_id;
  perform public.write_activity('kpi_area', p_kpi_area_id, 'activate', '{}'::jsonb);
end;
$$;

-- Strategy: card berpikir utama — WAJIB Alasan + Risiko Utama + Alternatif (PRD §22 / K2).
create or replace function public.activate_strategy(p_strategy_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.strategies;
begin
  select * into s from public.strategies where id = p_strategy_id;
  if not found then raise exception 'Strategy tidak ditemukan.'; end if;
  if not (s.created_by = auth.uid() or s.pic_id = auth.uid() or public.is_kpi_area_pic(s.kpi_area_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Strategy ini.';
  end if;
  if s.status <> 'draft' then raise exception 'Strategy sudah diaktifkan.'; end if;
  if coalesce(trim(s.name), '') = '' or s.pic_id is null or s.period_start is null or s.period_end is null then
    raise exception 'Kelengkapan Strategy belum terpenuhi (nama, PIC, periode wajib).';
  end if;
  if coalesce(trim(s.reason), '') = '' or coalesce(trim(s.main_risk), '') = '' or coalesce(trim(s.alternative), '') = '' then
    raise exception 'Strategy wajib mengisi Alasan, Risiko Utama, dan Alternatif sebelum diaktifkan.';
  end if;
  update public.strategies set status = 'active' where id = p_strategy_id;
  perform public.write_activity('strategy', p_strategy_id, 'activate', '{}'::jsonb);
end;
$$;

-- ============================================================ RPC: Goal Wizard (apply_goal_template) — ATOMIK (K9)

-- Generate Goal draft + KPI Area draft dari template (PRD §49 step 7). Mengembalikan goal_id.
-- Otorisasi: butuh create_goal (CEO/grant). KPI Area diseed dari kpi_area_templates milik template.
create or replace function public.apply_goal_template(
  p_goal_template_id uuid, p_pic_id uuid, p_period_start date, p_period_end date, p_targets jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.goal_templates; v_goal uuid; v_org uuid;
begin
  if not public.has_permission('create_goal') then
    raise exception 'Anda tidak berwenang membuat Goal.';
  end if;
  select * into t from public.goal_templates where id = p_goal_template_id;
  if not found then raise exception 'Goal Template tidak ditemukan.'; end if;
  v_org := public.current_user_org();
  -- SECURITY DEFINER mem-bypass RLS: pastikan PIC (bila diisi) adalah anggota org pemanggil,
  -- agar tak bisa menetapkan PIC lintas-organisasi lewat RPC.
  if p_pic_id is not null and not exists (
    select 1 from public.profiles where id = p_pic_id and organization_id = v_org
  ) then
    raise exception 'PIC harus anggota organisasi yang sama.';
  end if;

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, goal_template_id, created_by)
  values (v_org, t.name, p_pic_id, p_period_start, p_period_end, 'draft', t.id, auth.uid())
  returning id into v_goal;

  -- Target per-KPI dari wizard (PRD §49 step 5); key = id KPI Area template (bukan nama → tahan
  -- nama duplikat antar divisi). Kosong → null (dilengkapi nanti).
  insert into public.kpi_areas (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
  select v_org, v_goal, kt.name, nullif(trim(coalesce(p_targets ->> kt.id::text, '')), ''),
         p_pic_id, p_period_start, p_period_end, 'draft', auth.uid()
  from public.kpi_area_templates kt
  where kt.goal_template_id = p_goal_template_id;

  perform public.write_activity('goal', v_goal, 'apply_template',
    jsonb_build_object('goal_template_id', p_goal_template_id));
  return v_goal;
end;
$$;

-- "Pulihkan Item Template yang Belum Ada" (PRD §50): tambah KPI Area template yang belum ada ke Goal.
-- IDEMPOTEN by-name: apply 2x tidak menduplikasi, tidak menimpa data aktif. Mengembalikan jumlah yang ditambah.
create or replace function public.restore_goal_template_items(p_goal_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare g public.goals; v_added int; v_org uuid;
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;
  if g.goal_template_id is null then raise exception 'Goal ini tidak berasal dari template.'; end if;
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Goal ini.';
  end if;
  v_org := g.organization_id;

  insert into public.kpi_areas (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
  select v_org, g.id, kt.name, g.pic_id, g.period_start, g.period_end, 'draft', auth.uid()
  from public.kpi_area_templates kt
  where kt.goal_template_id = g.goal_template_id
    and not exists (
      select 1 from public.kpi_areas k where k.goal_id = g.id and k.name = kt.name   -- by-name guard
    );
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke execute on function public.activate_goal(uuid) from public, anon;
revoke execute on function public.activate_kpi_area(uuid) from public, anon;
revoke execute on function public.activate_strategy(uuid) from public, anon;
revoke execute on function public.apply_goal_template(uuid, uuid, date, date, jsonb) from public, anon;
revoke execute on function public.restore_goal_template_items(uuid) from public, anon;

-- ============================================================ RLS

alter table public.goal_templates enable row level security;
alter table public.kpi_area_templates enable row level security;
alter table public.goals enable row level security;
alter table public.kpi_areas enable row level security;
alter table public.strategies enable row level security;

-- Template sistem: dibaca semua anggota authenticated (read-only; tulis hanya lewat migrasi/seed atau permission khusus nanti).
create policy "goal_templates_select" on public.goal_templates
  for select to authenticated using (true);
create policy "kpi_area_templates_select" on public.kpi_area_templates
  for select to authenticated using (true);

-- Goals: lihat sesuai tanggung jawab; buat butuh create_goal; ubah oleh creator/PIC/manage_others.
-- SELECT inline (lihat catatan root-cause di bagian VISIBILITAS): kolom baris langsung, helper hanya utk turunan.
create policy "goals_select" on public.goals
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.can_view_workspace() or pic_id = auth.uid() or created_by = auth.uid()
              or public.goal_has_my_descendant(id)));
create policy "goals_insert" on public.goals
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('create_goal'));
create policy "goals_update" on public.goals
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org());

-- KPI Areas: buat butuh create_kpi_area ATAU jadi PIC Goal induk (jalur parent-PIC, K4). Induk wajib se-org (cross-org ditutup).
create policy "kpi_areas_select" on public.kpi_areas
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.can_view_workspace() or pic_id = auth.uid() or created_by = auth.uid()
              or public.is_goal_pic(goal_id) or public.kpi_area_has_my_descendant(id)));
create policy "kpi_areas_insert" on public.kpi_areas
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.goal_in_my_org(goal_id)
              and (public.has_permission('create_kpi_area') or public.is_goal_pic(goal_id)));
create policy "kpi_areas_update" on public.kpi_areas
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org());

-- Strategies: buat butuh create_strategy ATAU jadi PIC KPI Area induk (jalur parent-PIC).
create policy "strategies_select" on public.strategies
  for select to authenticated
  using (organization_id = public.current_user_org()
         and (public.can_view_workspace() or pic_id = auth.uid() or created_by = auth.uid()
              or public.is_kpi_area_pic(kpi_area_id) or public.strategy_has_my_descendant(id)));
create policy "strategies_insert" on public.strategies
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.kpi_area_in_my_org(kpi_area_id)
              and (public.has_permission('create_strategy') or public.is_kpi_area_pic(kpi_area_id)));
create policy "strategies_update" on public.strategies
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org());

-- Initiative: perbarui policy agar strategy_id (jika diisi) wajib milik strategy se-org (tutup cross-org FK hole, K5).
-- Backward-compat: strategy_id null tetap lolos (Initiative datar Fase 1).
drop policy if exists "initiatives_insert" on public.initiatives;
create policy "initiatives_insert" on public.initiatives
  for insert to authenticated
  with check (organization_id = public.current_user_org()
              and created_by = auth.uid()
              and public.has_permission('create_initiative')
              and public.strategy_in_my_org(strategy_id));
drop policy if exists "initiatives_update" on public.initiatives;
create policy "initiatives_update" on public.initiatives
  for update to authenticated
  using (organization_id = public.current_user_org()
         and (created_by = auth.uid() or pic_id = auth.uid() or public.has_permission('manage_others_cards')))
  with check (organization_id = public.current_user_org()
              and public.strategy_in_my_org(strategy_id));

-- ============================================================ SEED: Goal & KPI Area Template (PRD §46-48)

insert into public.goal_templates (key, name, sort_order)
select x.key, x.name, x.sort_order
from (values ('omset', 'Meningkatkan Omset Penjualan', 1), ('profit', 'Meningkatkan Profit', 2)) as x (key, name, sort_order)
where not exists (select 1 from public.goal_templates g where g.key = x.key);

-- KPI Area Template — nama PERSIS PRD §47 (Omset, 5 divisi @2) & §48 (Profit; CFO 1 item).
insert into public.kpi_area_templates (goal_template_id, division, division_label, name, sort_order)
select gt.id, x.division, x.division_label, x.name, x.sort_order
from (values
  -- §47 Omset
  ('omset', 'cmo',  'Sales & Marketing (CMO)',     'Menambah Jumlah Customer', 1),
  ('omset', 'cmo',  'Sales & Marketing (CMO)',     'Meningkatkan Basket Size', 2),
  ('omset', 'coo',  'Operations (COO)',            'Meningkatkan Output Produk', 1),
  ('omset', 'coo',  'Operations (COO)',            'Meningkatkan Produktivitas', 2),
  ('omset', 'cfo',  'Finance & Accounting (CFO)',  'Ketersediaan Arus Kas yang Memadai', 1),
  ('omset', 'cfo',  'Finance & Accounting (CFO)',  'A/R Collection', 2),
  ('omset', 'chro', 'Human Capital (CHRO)',        'Meningkatkan Kompetensi Karyawan', 1),
  ('omset', 'chro', 'Human Capital (CHRO)',        'Ketersediaan Karyawan (MPP)', 2),
  ('omset', 'cbo',  'Business Growth (CBO)',       'Menambah Jumlah Cabang Baru', 1),
  ('omset', 'cbo',  'Business Growth (CBO)',       'Menciptakan Produk / Brand Baru', 2),
  -- §48 Profit
  ('profit', 'cmo',  'Sales & Marketing (CMO)',    'Increase Sales Price', 1),
  ('profit', 'cmo',  'Sales & Marketing (CMO)',    'Minimize Budget', 2),
  ('profit', 'coo',  'Operations (COO)',           'Menurunkan OPEX', 1),
  ('profit', 'coo',  'Operations (COO)',           'Menurunkan Komplain Pelanggan', 2),
  ('profit', 'cfo',  'Finance & Accounting (CFO)', 'Control Budgeting', 1),
  ('profit', 'chro', 'Human Capital (CHRO)',       'Mengurangi Biaya Lembur', 1),
  ('profit', 'chro', 'Human Capital (CHRO)',       'Menurunkan Turnover', 2),
  ('profit', 'cbo',  'Business Growth (CBO)',      'Ketersediaan Pendanaan Ekspansi Outlet Baru', 1),
  ('profit', 'cbo',  'Business Growth (CBO)',      'Efisiensi Biaya Ekspansi', 2)
) as x (tkey, division, division_label, name, sort_order)
join public.goal_templates gt on gt.key = x.tkey
where not exists (
  select 1 from public.kpi_area_templates k
  where k.goal_template_id = gt.id and k.division = x.division and k.name = x.name
);

-- Guidance card untuk planning card baru (dibaca lewat policy guidance_select Fase 1).
insert into public.card_guidance_contents (organization_id, card_type, title, body)
select null::uuid, x.card_type, x.title, x.body
from (values
  ('goal', 'Goal — Arah besar yang ingin dicapai',
   'Goal adalah tujuan strategis tingkat atas. Wajib punya PIC/Owner dan periode, lalu dipecah menjadi KPI Area. Goal tidak bisa diaktifkan sebelum punya minimal 1 KPI Area.'),
  ('kpi_area', 'KPI Area — Area ukuran keberhasilan Goal',
   'KPI Area menetapkan Target yang menjadi ukuran keberhasilan Goal. Tidak ada bobot atau satuan wajib. Pecah KPI Area menjadi Strategy.'),
  ('strategy', 'Strategy — Cara mencapai KPI Area',
   'Strategy adalah card berpikir utama. Tidak boleh dangkal: wajib mengisi Alasan, Risiko Utama, dan Alternatif sebelum diaktifkan. Strategy dipecah menjadi Initiative.')
) as x (card_type, title, body)
where not exists (select 1 from public.card_guidance_contents g where g.card_type = x.card_type and g.organization_id is null);
