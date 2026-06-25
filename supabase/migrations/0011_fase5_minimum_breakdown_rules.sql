-- EMS V1.8.1 — Fase 5: Minimum Breakdown Rule (MBR) + Kelengkapan Perencanaan.
-- 1 tabel baru: minimum_breakdown_rules. organization_id NULL = baris sistem (fallback global).
-- 3 mode enforcement (PRD §40): 'hanya_peringatan' | 'blokir_aktivasi' | 'blokir_akses_turunan'.
-- Keputusan mengikat (lihat sdd-plan wf_cb5903ba-dac):
--   K1 Gate mode 1 ditambahkan ke activate_kpi_area (BUKAN activate_goal — gate ≥1 KPI Area
--      sudah hardcoded di Fase 4; tidak boleh dilonggarkan).
--   K2 Gate mode 2 lewat trigger BEFORE INSERT SECURITY DEFINER di kpi_areas/strategies/initiatives/
--      action_plans (raise pesan ramah). Konsisten Fase 0–4: refusal/gate-block tidak menulis
--      governance_violations (RAISE rollback INSERT pada tx yang sama; bukan tindakan terlarang
--      yang BERHASIL — pola sama dgn permission_denied di RPC lifecycle Fase 4).
--   K3 Default seed sistem = mode 'hanya_peringatan' + angka LONGGAR (BUILD-PLAN line 113).
--      goal→kpi_area dikunci 'blokir_aktivasi'/1 agar konsisten dgn gate Fase 4.
--   K4 Counting child: status <> 'archived' (draft DIHITUNG sebagai breakdown valid).
--   K5 RLS: SELECT untuk authenticated (org-row + system-row); INSERT/UPDATE/DELETE default-deny
--      → tulis hanya via RPC SECURITY DEFINER (set_minimum_breakdown_rule).
--   K6 Tidak retroaktif: switch mode tidak menandai card existing yang melanggar.
--   K7 Development workspace: rule di-seed agar terlihat di Settings, tapi enforcement
--      DI-DEFER ke Fase 6 (early-return di check_minimum_breakdown_compliance).

-- ============================================================ TABLE

create table if not exists public.minimum_breakdown_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade, -- NULL = baris sistem (fallback)
  parent_card_type text not null check (parent_card_type in (
    'goal', 'kpi_area', 'strategy', 'initiative', 'development_area', 'problem_statement'
  )),
  child_card_type text not null check (child_card_type in (
    'kpi_area', 'strategy', 'initiative', 'action_plan', 'problem_statement'
  )),
  min_count int not null default 1 check (min_count >= 1),
  enforcement_mode text not null default 'hanya_peringatan' check (enforcement_mode in (
    'hanya_peringatan', 'blokir_aktivasi', 'blokir_akses_turunan'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  unique (organization_id, parent_card_type, child_card_type)  -- per-org unik per pasangan
);

-- Partial unique untuk baris SISTEM (organization_id NULL) — semantik NULL di unique() tidak ketat.
create unique index if not exists uq_mbr_system
  on public.minimum_breakdown_rules (parent_card_type, child_card_type)
  where organization_id is null;

create index if not exists idx_mbr_lookup
  on public.minimum_breakdown_rules (organization_id, parent_card_type, child_card_type);

drop trigger if exists mbr_set_updated_at on public.minimum_breakdown_rules;
create trigger mbr_set_updated_at before update on public.minimum_breakdown_rules
  for each row execute function public.set_updated_at();

-- ============================================================ SEED sistem (organization_id NULL)
-- Idempoten via where not exists. Performance: peringatan + angka longgar (PRD vs BUILD-PLAN);
-- goal→kpi_area dikunci 'blokir_aktivasi'/1 (konsisten gate Fase 4). Development di-seed untuk
-- visibilitas di Settings; enforcement defer Fase 6.

insert into public.minimum_breakdown_rules
  (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode)
select * from (values
  (null::uuid, 'goal',              'kpi_area',          1, 'blokir_aktivasi'),
  (null::uuid, 'kpi_area',          'strategy',          1, 'hanya_peringatan'),
  (null::uuid, 'strategy',          'initiative',        1, 'hanya_peringatan'),
  (null::uuid, 'initiative',        'action_plan',       1, 'hanya_peringatan'),
  (null::uuid, 'development_area',  'problem_statement', 1, 'hanya_peringatan'),
  (null::uuid, 'problem_statement', 'initiative',        1, 'hanya_peringatan')
) as s (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode)
where not exists (
  select 1 from public.minimum_breakdown_rules m
  where m.organization_id is null
    and m.parent_card_type = s.parent_card_type
    and m.child_card_type = s.child_card_type
);

-- ============================================================ RLS

alter table public.minimum_breakdown_rules enable row level security;

drop policy if exists "mbr_select" on public.minimum_breakdown_rules;
create policy "mbr_select" on public.minimum_breakdown_rules
  for select to authenticated
  using (organization_id is null or organization_id = public.current_user_org());

-- Default-deny untuk INSERT/UPDATE/DELETE: tulis hanya via RPC SECURITY DEFINER.
revoke insert, update, delete on public.minimum_breakdown_rules from authenticated, anon;

-- ============================================================ HELPER: resolusi rule (org → sistem)

create or replace function public.current_minimum_breakdown_rule(
  p_parent_card_type text, p_child_card_type text
) returns public.minimum_breakdown_rules
language sql stable security definer set search_path = '' as $$
  select r.* from public.minimum_breakdown_rules r
  where r.parent_card_type = p_parent_card_type
    and r.child_card_type = p_child_card_type
    and (r.organization_id = public.current_user_org() or r.organization_id is null)
  order by r.organization_id nulls last  -- org-row dulu, fallback sistem
  limit 1;
$$;
revoke execute on function public.current_minimum_breakdown_rule(text, text) from public, anon;

-- ============================================================ RPC: set_minimum_breakdown_rule (UPSERT org-row)

create or replace function public.set_minimum_breakdown_rule(
  p_parent_card_type text,
  p_child_card_type text,
  p_min_count int,
  p_enforcement_mode text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_minimum_breakdown_rule') then
    raise exception 'Anda tidak berwenang mengubah Minimum Breakdown Rule.';
  end if;
  if p_min_count is null or p_min_count < 1 then
    raise exception 'min_count harus >= 1.';
  end if;
  if p_enforcement_mode not in ('hanya_peringatan', 'blokir_aktivasi', 'blokir_akses_turunan') then
    raise exception 'Mode enforcement tidak dikenal.';
  end if;
  -- K1: goal->kpi_area minimal blokir_aktivasi/1 — tak boleh dilonggarkan (gate Fase 4).
  if p_parent_card_type = 'goal' and p_child_card_type = 'kpi_area' then
    if p_enforcement_mode <> 'blokir_aktivasi' or p_min_count < 1 then
      raise exception 'Aturan Goal → KPI Area dikunci pada mode Blokir Aktivasi dengan minimum 1.';
    end if;
  end if;

  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Organisasi tidak ditemukan.';
  end if;

  insert into public.minimum_breakdown_rules
    (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode, updated_by)
  values (v_org, p_parent_card_type, p_child_card_type, p_min_count, p_enforcement_mode, auth.uid())
  on conflict (organization_id, parent_card_type, child_card_type)
  do update set
    min_count = excluded.min_count,
    enforcement_mode = excluded.enforcement_mode,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_id;

  perform public.write_activity('minimum_breakdown_rule', v_id, 'update', jsonb_build_object(
    'parent_card_type', p_parent_card_type,
    'child_card_type', p_child_card_type,
    'min_count', p_min_count,
    'enforcement_mode', p_enforcement_mode
  ));
  return v_id;
end;
$$;
revoke execute on function public.set_minimum_breakdown_rule(text, text, int, text) from public, anon;

-- ============================================================ RPC: check_minimum_breakdown_compliance

-- Read-only. Mengembalikan kepatuhan (count child non-archived vs minimum) untuk satu parent card.
-- Development workspace: early-return (enforcement defer Fase 6).
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
  -- Tenant guard: parent harus milik org pemanggil (defense-in-depth, RLS sudah ada).
  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Organisasi tidak ditemukan.';
  end if;

  -- Development workspace: defer enforcement; kembalikan tabel kosong.
  if p_parent_card_type in ('development_area', 'problem_statement') then
    return;
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

-- ============================================================ GATE mode 1: activate_kpi_area
-- Hanya saat mode='blokir_aktivasi' & belum compliant → tolak + tulis governance_violations low.
-- activate_goal TIDAK disentuh (gate ≥1 KPI Area sudah hardcoded di Fase 4).

create or replace function public.activate_kpi_area(p_kpi_area_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  k public.kpi_areas;
  v_rule public.minimum_breakdown_rules;
  v_strategies int;
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

  -- Fase 5 — gate MBR mode 1. Postgres tidak punya autonomous tx vanilla; RAISE rollback INSERT
  -- di tx yang sama. Konsisten dgn pola Fase 0–4: refusal/gate-block tidak menulis violation row
  -- (hanya tindakan terlarang yang BERHASIL — mis. reviewer_override — yang dicatat governance).
  v_rule := public.current_minimum_breakdown_rule('kpi_area', 'strategy');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_strategies from public.strategies
      where kpi_area_id = p_kpi_area_id and status <> 'archived'
        and organization_id = k.organization_id;
    if v_strategies < v_rule.min_count then
      raise exception
        'KPI Area ini baru memiliki % dari % Strategy. Tambahkan % Strategy lagi agar bisa diaktifkan.',
        v_strategies, v_rule.min_count, (v_rule.min_count - v_strategies);
    end if;
  end if;

  update public.kpi_areas set status = 'active' where id = p_kpi_area_id;
  perform public.write_activity('kpi_area', p_kpi_area_id, 'activate', '{}'::jsonb);
end;
$$;

-- ============================================================ GATE mode 2: trigger BEFORE INSERT
-- Saat rule (parent_type, child_type) ber-mode 'blokir_akses_turunan' dan parent BELUM memenuhi
-- minimum sibling, INSERT child ditolak + tulis governance_violations low (atomik).
-- Pola helper umum agar 4 tabel turunan reuse logika sama.

create or replace function public.tg_enforce_mbr_block_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_parent_type text;
  v_child_type text;
  v_parent_id uuid;
  v_org uuid;
  v_rule public.minimum_breakdown_rules;
  v_siblings int;
begin
  -- Petakan tabel turunan → (parent_type, child_type, parent_id).
  if tg_table_name = 'kpi_areas' then
    v_parent_type := 'goal'; v_child_type := 'kpi_area'; v_parent_id := new.goal_id;
  elsif tg_table_name = 'strategies' then
    v_parent_type := 'kpi_area'; v_child_type := 'strategy'; v_parent_id := new.kpi_area_id;
  elsif tg_table_name = 'initiatives' then
    if new.strategy_id is null then return new; end if;  -- Initiative datar Fase 1: lewati.
    v_parent_type := 'strategy'; v_child_type := 'initiative'; v_parent_id := new.strategy_id;
  elsif tg_table_name = 'action_plans' then
    v_parent_type := 'initiative'; v_child_type := 'action_plan'; v_parent_id := new.initiative_id;
  else
    return new;
  end if;

  v_rule := public.current_minimum_breakdown_rule(v_parent_type, v_child_type);
  if v_rule.id is null or v_rule.enforcement_mode <> 'blokir_akses_turunan' then
    return new;
  end if;

  v_org := new.organization_id;
  -- Hitung sibling existing (parent yang sama, non-archived). Pakai EXECUTE agar generic per tabel.
  execute format(
    'select count(*) from public.%I where %I = $1 and status <> ''archived'' and organization_id = $2',
    tg_table_name,
    case tg_table_name
      when 'kpi_areas' then 'goal_id'
      when 'strategies' then 'kpi_area_id'
      when 'initiatives' then 'strategy_id'
      when 'action_plans' then 'initiative_id'
    end
  ) into v_siblings using v_parent_id, v_org;

  if v_siblings < v_rule.min_count then
    -- Konsisten Fase 0–4: refusal/gate-block hanya RAISE, tidak menulis governance_violations
    -- (RAISE rollback INSERT pada tx yang sama; bukan tindakan terlarang yang berhasil).
    raise exception
      'Tidak dapat membuat % baru: induk masih membutuhkan % dari % %.',
      v_child_type, (v_rule.min_count - v_siblings), v_rule.min_count, v_child_type;
  end if;

  return new;
end;
$$;
revoke execute on function public.tg_enforce_mbr_block_child() from public, anon;

drop trigger if exists kpi_areas_enforce_mbr on public.kpi_areas;
create trigger kpi_areas_enforce_mbr before insert on public.kpi_areas
  for each row execute function public.tg_enforce_mbr_block_child();

drop trigger if exists strategies_enforce_mbr on public.strategies;
create trigger strategies_enforce_mbr before insert on public.strategies
  for each row execute function public.tg_enforce_mbr_block_child();

drop trigger if exists initiatives_enforce_mbr on public.initiatives;
create trigger initiatives_enforce_mbr before insert on public.initiatives
  for each row execute function public.tg_enforce_mbr_block_child();

drop trigger if exists action_plans_enforce_mbr on public.action_plans;
create trigger action_plans_enforce_mbr before insert on public.action_plans
  for each row execute function public.tg_enforce_mbr_block_child();
