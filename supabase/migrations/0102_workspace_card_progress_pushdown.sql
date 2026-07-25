-- =====================================================================
-- 0102_workspace_card_progress_pushdown.sql
-- =====================================================================
-- PERF: push the strategy_id filter into workspace_card_progress'
--       current-values aggregate. READ-ONLY, SECURITY INVOKER. No behaviour
--       change — every returned (card_id, progress, is_measured) is identical.
--
-- Problem (pre-0102):
--   The function referenced the view public.strategy_current_values in both the
--   Goal and Strategy attainment branches. That view has NO per-strategy filter:
--   it aggregates the org's ENTIRE approved result set
--     (task_result_values ⋈ task_submissions WHERE review_status='approved')
--   grouped by strategy_id, every time it is referenced. So even a 1-card request
--   forced a full grouped aggregation over all approved submissions, hash-joined
--   to the handful of in-scope strategies. This cost grows with total approved
--   submissions, independent of p_card_ids.
--
-- Fix (push-down):
--   Inline the same aggregate as a CTE (scv), restricted to the strategies that
--   are actually joined by the two attainment branches — i.e. strategies whose
--   id is in p_card_ids (Strategy branch, scv.strategy_id = st.id where st.id ∈ ids)
--   or whose goal_id is in p_card_ids (Goal branch, scv.strategy_id = st.id where
--   st.goal_id ∈ ids). Filtering the aggregate input by strategy_id cannot change
--   the per-strategy sum of any retained strategy, and every strategy the branches
--   join is retained — so output is byte-for-byte equivalent. The bounded scan is
--   served by idx_task_result_values_strategy (partial btree on strategy_id).
--
--   The view public.strategy_current_values is left UNCHANGED (other callers may
--   depend on it); the push-down lives only inside this function.
--
-- CREATE OR REPLACE (no DROP): return shape is unchanged from 0074, so the ACL is
-- preserved. Grants are re-asserted below to keep the posture explicit.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.workspace_card_progress(p_card_ids uuid[])
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

  -- (P) PUSH-DOWN — strategies whose current-value aggregate the branches below
  --     can reference: Strategy branch needs st.id ∈ p_card_ids; Goal branch needs
  --     st.goal_id ∈ p_card_ids. This is an exact superset of the strategy_ids the
  --     two LEFT JOINs on scv.strategy_id = st.id can match, so restricting the
  --     aggregate to it changes no output number.
  relevant_strategies as (
    select st.id
      from public.strategies st
     where st.id = any(p_card_ids)
        or st.goal_id = any(p_card_ids)
  ),
  -- scv — inlined public.strategy_current_values.numeric_total, but scanning only
  -- the relevant strategies (bounded by idx_task_result_values_strategy) instead
  -- of the org's entire approved result set. Aggregate expression is identical to
  -- the view's numeric_total (0064: view is security_invoker; RLS still applies to
  -- the base tables per caller).
  scv as (
    select rv.strategy_id,
           coalesce(sum(
             case
               when rv.value_type = any(array['number','currency','percentage'])
                 then rv.value_numeric
               else 0::numeric
             end
           ), 0::numeric) as numeric_total
      from public.task_result_values rv
      join public.task_submissions s on s.id = rv.submission_id
     where s.review_status = 'approved'
       and rv.strategy_id is not null
       and rv.strategy_id in (select id from relevant_strategies)
     group by rv.strategy_id
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
      left join scv on scv.strategy_id = st.id
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
      left join scv on scv.strategy_id = st.id
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

-- ACL re-assert (posture unchanged from 0074: authenticated only; PUBLIC/anon revoked).
-- CREATE OR REPLACE preserves the existing ACL, so these are idempotent guards.
REVOKE EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) TO authenticated;

COMMIT;
