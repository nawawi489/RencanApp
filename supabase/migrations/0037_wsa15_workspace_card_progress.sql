-- WSA-15 / AC 22 — RPC rollup progress orb per card tree (spec §6.4–6.8 & §10).
--
-- Kontrak: workspace_card_progress(p_card_ids uuid[]) RETURNS TABLE(card_id uuid, progress int)
--   progress = % anak LANGSUNG non-archived berstatus 'done' (identik ratioDoneOfChildren di
--   mobile/src/lib/progress.ts — SATU sumber kebenaran, sama dgn header detail UI-G-001).
--   Induk tanpa anak non-archived → 0 (bukan NULL; konsisten header detail).
--   Non-rekursif: hanya anak SATU level.
--   Action Plan (leaf) TIDAK dihitung di sini — orb-nya dihitung klien via computeActionPlanProgress.
--
-- Keamanan: SECURITY INVOKER (default) + SET search_path = '' → RLS induk & anak ditegakkan untuk
--   pemanggil. Konsekuensi (keputusan owner 2026-07-03): capaian = fungsi anak yang TERLIHAT
--   pemanggil (bisa beda antar peran). JANGAN ubah ke DEFINER — akan bocorkan progress lintas-org.
--
-- Pemetaan induk → tabel anak + FK:
--   goal              → kpi_areas.goal_id
--   kpi_area          → strategies.kpi_area_id
--   strategy          → initiatives.strategy_id
--   initiative        → action_plans.initiative_id
--   development_area  → problem_statements.development_area_id
--   problem_statement → initiatives.problem_statement_id

create or replace function public.workspace_card_progress(p_card_ids uuid[])
returns table (card_id uuid, progress int)
language sql
stable
security invoker
set search_path = ''
as $$
  with ids as (
    select unnest(p_card_ids) as id
  ),
  -- Satu baris per (parent id, status anak non-archived). RLS pada tiap tabel anak otomatis
  -- menyaring baris yang tak boleh dilihat pemanggil.
  child_status as (
    -- goal → kpi_areas
    select k.goal_id as pid, k.status as cstatus
      from public.kpi_areas k
      join ids on ids.id = k.goal_id
     where k.status <> 'archived'
    union all
    -- kpi_area → strategies
    select s.kpi_area_id, s.status
      from public.strategies s
      join ids on ids.id = s.kpi_area_id
     where s.status <> 'archived'
    union all
    -- strategy → initiatives
    select i.strategy_id, i.status
      from public.initiatives i
      join ids on ids.id = i.strategy_id
     where i.status <> 'archived'
    union all
    -- initiative → action_plans
    select a.initiative_id, a.status
      from public.action_plans a
      join ids on ids.id = a.initiative_id
     where a.status <> 'archived'
    union all
    -- development_area → problem_statements
    select p.development_area_id, p.status
      from public.problem_statements p
      join ids on ids.id = p.development_area_id
     where p.status <> 'archived'
    union all
    -- problem_statement → initiatives
    select i.problem_statement_id, i.status
      from public.initiatives i
      join ids on ids.id = i.problem_statement_id
     where i.status <> 'archived'
  )
  select
    ids.id as card_id,
    -- childless (count 0) → 0 via coalesce; else round(100 * done/total).
    coalesce(
      round(
        100.0 * count(*) filter (where cs.cstatus = 'done')
        / nullif(count(cs.cstatus), 0)
      ),
      0
    )::int as progress
  from ids
  left join child_status cs on cs.pid = ids.id
  group by ids.id;
$$;

comment on function public.workspace_card_progress(uuid[]) is
  'WSA-15: progress orb tree = % anak langsung non-archived berstatus done (identik ratioDoneOfChildren). SECURITY INVOKER: hormati RLS, capaian per-visibilitas pemanggil.';

grant execute on function public.workspace_card_progress(uuid[]) to authenticated;
