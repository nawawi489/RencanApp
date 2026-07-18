-- =====================================================================
-- 0074_workspace_card_progress_attainment.sql
-- =====================================================================
-- workspace_card_progress v2 — attainment-aware roll-up Goal/Strategi.
-- READ-ONLY. SECURITY INVOKER: RLS on parent+child tables enforced per caller.
--
-- Changes from v1 (0046):
--   - RETURNS TABLE adds `is_measured boolean`
--   - Goal branch: mean of clamped(0..100) attainment from measured child Strategies
--     (status IN ('active','done'), target_numeric > 0)
--   - Strategy branch: own attainment vs target (clamped 0..100)
--   - Fallback: status-rollup (% children done) when no measured signal → is_measured=false
--
-- Owner decisions: O4 (population=active/done), S1 (clamp per-child), D1 (Goal no column).
-- =====================================================================

BEGIN;

-- RETURNS TABLE shape changes → must DROP + CREATE (not OR REPLACE).
-- No CASCADE: this function has no pg_depend dependents (only called via PostgREST).
DROP FUNCTION IF EXISTS public.workspace_card_progress(uuid[]);

CREATE FUNCTION public.workspace_card_progress(p_card_ids uuid[])
  RETURNS TABLE(card_id uuid, progress integer, is_measured boolean)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO ''
AS $function$
  with ids as (select unnest(p_card_ids) as id),

  -- (A) STATUS-ROLLUP — VERBATIM from 0046:2692-2727 (6 branches). Do not modify.
  child_status as (
    -- goal → strategies
    select k.goal_id as pid, k.status as cstatus
      from public.strategies k
      join ids on ids.id = k.goal_id
     where k.status <> 'archived'
    union all
    -- strategy → initiatives
    select s.strategy_id, s.status
      from public.initiatives s
      join ids on ids.id = s.strategy_id
     where s.status <> 'archived'
    union all
    -- initiative → action_plans
    select i.initiative_id, i.status
      from public.action_plans i
      join ids on ids.id = i.initiative_id
     where i.status <> 'archived'
    union all
    -- action_plan → tasks
    select a.action_plan_id, a.status
      from public.tasks a
      join ids on ids.id = a.action_plan_id
     where a.status <> 'archived'
    union all
    -- development_area → problem_statements
    select p.development_area_id, p.status
      from public.problem_statements p
      join ids on ids.id = p.development_area_id
     where p.status <> 'archived'
    union all
    -- problem_statement → action_plans
    select i.problem_statement_id, i.status
      from public.action_plans i
      join ids on ids.id = i.problem_statement_id
     where i.status <> 'archived'
  ),
  status_rollup as (
    select ids.id as pid,
           coalesce(
             round(
               100.0 * count(*) filter (where cs.cstatus = 'done')
               / nullif(count(cs.cstatus), 0)
             ),
             0
           )::int as progress
      from ids
      left join child_status cs on cs.pid = ids.id
     group by ids.id
  ),

  -- (B) GOAL attainment = mean( clamp(attainment per measured child Strategy) ).
  --     Population: status IN ('active','done') — O4 excludes draft+archived.
  --     Guard: target_numeric > 0 (prevents div-by-zero; target=0 treated as unmeasured).
  goal_attainment as (
    select st.goal_id as pid,
           round(avg( least(100, greatest(0,
             round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric))) ))::int as progress
      from public.strategies st
      join ids on ids.id = st.goal_id
      left join public.strategy_current_values scv on scv.strategy_id = st.id
     where st.status in ('active', 'done')
       and st.target_numeric is not null and st.target_numeric > 0
     group by st.goal_id
  ),

  -- (C) STRATEGY attainment = own current vs target (clamped 0..100).
  strategy_attainment as (
    select st.id as pid,
           least(100, greatest(0,
             round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric)))::int as progress
      from public.strategies st
      join ids on ids.id = st.id
      left join public.strategy_current_values scv on scv.strategy_id = st.id
     where st.target_numeric is not null and st.target_numeric > 0
  ),

  measured as (
    select pid, progress from goal_attainment
    union all
    select pid, progress from strategy_attainment
  )

  select
    ids.id as card_id,
    coalesce(m.progress, sr.progress, 0)::int as progress,
    (m.pid is not null) as is_measured
  from ids
  left join measured m on m.pid = ids.id
  left join status_rollup sr on sr.pid = ids.id;
$function$;

-- ACL: DROP resets to EXECUTE TO PUBLIC (documented in 0062:26-28).
REVOKE EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) TO authenticated;

COMMIT;
