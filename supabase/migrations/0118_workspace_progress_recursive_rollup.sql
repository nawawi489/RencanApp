-- =====================================================================
-- 0118_workspace_progress_recursive_rollup.sql
-- =====================================================================
-- FEATURE (Opsi B): Recursive progress rollup for Initiative & Action Plan cards.
--
-- Before 0118, workspace_card_progress rolled Initiative and Action Plan (AP)
-- cards up with the (A) STATUS-ROLLUP branch — the fraction of non-archived
-- children whose status is 'done' (`round(100*done/total)`). That answers
-- "how many children are finished", not "how far along is the work", so a
-- long-running AP whose tasks are 50%/80%/etc. read as 0% until each flips to
-- 'done'.
--
-- Opsi B replaces the AP and Initiative levels with an UNWEIGHTED MEAN of child
-- progress, mirroring the client heuristic in mobile/src/lib/progress.ts (the
-- single source of truth for the per-status mapping — do not diverge from it):
--
--   task_progress (leaf):
--     one_time  → status heuristic: draft/archived/cancelled/unknown 0,
--                 assigned 10, revision 30, in_progress 50, submitted 80, done 100
--     repeat    → Repeat Compliance = round(100 * done / total) over the task's
--                 NON-ARCHIVED task_instances (all-time; NO period scoping, NO
--                 submitted_late gate — done means status='done'). No instances → 0.
--   ap_progress        = avg(coalesce(task_progress, 0)) over the AP's non-archived
--                        tasks; an AP with no tasks → 0.
--   initiative_progress = avg(ap_progress) over the Initiative's non-archived APs;
--                        an Initiative with no non-archived AP → 0.
--
-- Precision (OQ-3): child progress is carried as full-precision numeric between
-- levels; round() is applied ONLY once, at the output boundary.
--
-- ISOLATION (AC-19): only Initiative and Action Plan pids switch to the recursive
-- mean. Problem-Statement (% child AP done), Development-Area, Goal/Strategy
-- attainment, and every other level keep their existing STATUS-ROLLUP / attainment
-- semantics byte-for-byte. is_measured stays true ONLY for attainment (Goal /
-- Strategy) — recursive Initiative/AP progress is NOT "measured".
--
-- The (A) STATUS-ROLLUP, (P) PUSH-DOWN, (B) GOAL and (C) STRATEGY attainment
-- blocks below are COPIED VERBATIM from 0102. The only changes are (1) three new
-- CTEs (relevant_ap, task_progress, ap_progress, initiative_progress) and (2) the
-- final coalesce, which now prefers Initiative then AP recursive progress ahead of
-- the status rollup.
--
-- READ-ONLY. SECURITY INVOKER (RLS on tasks / task_instances / task_submissions
-- still applies per caller, so confidential instances never leak into a mean).
-- Return shape TABLE(card_id, progress, is_measured) is UNCHANGED, so the ACL is
-- preserved across CREATE OR REPLACE; grants are re-asserted below.
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

  -- (R) RECURSIVE ROLLUP (Opsi B) — Initiative & Action Plan only.
  -- relevant_ap: APs we must score — those requested directly, or children of a
  -- requested Initiative (needed to compute that Initiative's mean). Left broad on
  -- the AP's own status so a directly-requested (even archived) AP still scores;
  -- the Initiative rollup re-filters to non-archived children below.
  relevant_ap as (
    select ap.id, ap.initiative_id, ap.status
      from public.action_plans ap
     where ap.id = any(p_card_ids)
        or ap.initiative_id = any(p_card_ids)
  ),
  -- task_progress: leaf progress per non-archived task under a relevant AP.
  -- one_time → status heuristic (mirror of progress.ts ACTION_PLAN_STATUS_PROGRESS);
  -- repeat   → Repeat Compliance = round(100*done/total) over NON-ARCHIVED instances,
  --            coalesced to 0 when there are no instances (R-1 / R-2).
  task_progress as (
    select t.id as task_id,
           t.action_plan_id,
           case
             when t.repeat_setting = 'repeat' then
               coalesce(
                 round(
                   100.0 * count(ti.id) filter (where ti.status = 'done')
                   / nullif(count(ti.id) filter (where ti.status <> 'archived'), 0)
                 ),
                 0
               )
             else
               case t.status
                 when 'done'        then 100
                 when 'submitted'   then 80
                 when 'in_progress' then 50
                 when 'revision'    then 30
                 when 'assigned'    then 10
                 else 0
               end
           end::numeric as progress
      from public.tasks t
      join relevant_ap ra on ra.id = t.action_plan_id
      left join public.task_instances ti on ti.task_id = t.id
     where t.status <> 'archived'
     group by t.id, t.action_plan_id, t.repeat_setting, t.status
  ),
  -- ap_progress: unweighted mean of leaf task progress; AP with no task → 0.
  -- Full-precision numeric (no round here) so the Initiative mean stays exact.
  ap_progress as (
    select ra.id as pid,
           coalesce(avg(tp.progress), 0)::numeric as progress
      from relevant_ap ra
      left join task_progress tp on tp.action_plan_id = ra.id
     group by ra.id
  ),
  -- initiative_progress: unweighted mean of child AP progress over NON-ARCHIVED
  -- APs; Initiative with no non-archived AP → 0. Full-precision numeric.
  initiative_progress as (
    select i.id as pid,
           coalesce(avg(app.progress), 0)::numeric as progress
      from public.initiatives i
      join ids on ids.id = i.id
      left join relevant_ap ra on ra.initiative_id = i.id and ra.status <> 'archived'
      left join ap_progress app on app.pid = ra.id
     group by i.id
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
    round(coalesce(m.progress, ip.progress, app.progress, sr.progress, 0))::int as progress,
    (m.pid is not null) as is_measured
  from ids
  left join measured m on m.pid = ids.id
  left join initiative_progress ip on ip.pid = ids.id
  left join ap_progress app on app.pid = ids.id
  left join status_rollup sr on sr.pid = ids.id;
$function$;

-- ACL re-assert (posture unchanged from 0102: authenticated only; PUBLIC/anon revoked).
-- CREATE OR REPLACE preserves the existing ACL, so these are idempotent guards.
REVOKE EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) TO authenticated;

COMMIT;
