-- =====================================================================
-- 0045R_revert_workspace_terminology.sql
-- =====================================================================
-- Revert of 0045 SCHEMA changes only (tables/columns/indexes/view rename).
--
-- Symmetric bottom-up reversal per specs/rollback-plan.md. Runs inside a
-- single BEGIN/COMMIT so any error rolls the whole revert back.
--
-- WARNING: This reverts the DDL shape only. It does NOT restore pre-0046
-- function bodies, RLS policies, or triggers — those were REPLACED (not
-- backed up) by 0046. Restoration steps for functions/policies are
-- described in specs/rollback-plan.md and require re-applying migrations
-- 0000..0044 fresh on an empty DB, or a point-in-time backup.
--
-- The intended flow when this is used:
--   1. Apply 0045R first (restore schema shape).
--   2. Restore functions/policies by:
--      (a) re-running the historical migrations 0005..0044 on the reverted
--          schema, OR
--      (b) restoring the pg_dump snapshot taken BEFORE 0045 was applied.
-- =====================================================================

BEGIN;

-- =====================================================================
-- Section 0R: Revert cosmetic constraint rename (S0 forward, §pre-index)
-- =====================================================================
-- 0046 S0 renamed CHECK constraint initiatives_single_parent -> action_plans_single_parent.
-- Revert here (before table rename below flips public.action_plans back to public.initiatives).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.action_plans'::regclass
      AND conname = 'action_plans_single_parent'
  ) THEN
    ALTER TABLE public.action_plans RENAME CONSTRAINT action_plans_single_parent TO initiatives_single_parent;
  END IF;
END $$;

-- =====================================================================
-- Section 4R: Drop the new view first (references renamed tables)
-- =====================================================================

DROP VIEW IF EXISTS public.strategy_current_values;

-- =====================================================================
-- Section 2R: Rename FK columns back (top-down = reverse of forward)
-- =====================================================================

-- Level 1 revert: strategy_id -> kpi_area_id
ALTER TABLE public.task_result_values          RENAME COLUMN strategy_id TO kpi_area_id;
ALTER TABLE public.strategy_target_breakdowns  RENAME COLUMN strategy_id TO kpi_area_id;
ALTER TABLE public.initiatives                 RENAME COLUMN strategy_id TO kpi_area_id;

-- Level 2 revert: initiative_id -> strategy_id (on action_plans)
ALTER TABLE public.action_plans RENAME COLUMN initiative_id TO strategy_id;

-- Level 3 revert: action_plan_id -> initiative_id
ALTER TABLE public.video_briefs RENAME COLUMN action_plan_id TO initiative_id;
ALTER TABLE public.evaluations  RENAME COLUMN action_plan_id TO initiative_id;
ALTER TABLE public.chat_rooms   RENAME COLUMN action_plan_id TO initiative_id;
ALTER TABLE public.tasks        RENAME COLUMN action_plan_id TO initiative_id;

-- Level 4 revert: task_id -> action_plan_id
ALTER TABLE public.reviews           RENAME COLUMN task_id TO action_plan_id;
ALTER TABLE public.task_submissions  RENAME COLUMN task_id TO action_plan_id;
ALTER TABLE public.task_repeat_rules RENAME COLUMN task_id TO action_plan_id;
ALTER TABLE public.task_instances    RENAME COLUMN task_id TO action_plan_id;

-- =====================================================================
-- Section 1R: Rename tables back (top-down = reverse of forward)
-- =====================================================================

-- Level 1 revert: strategies + turunan -> kpi_areas + turunan
ALTER TABLE public.strategies                  RENAME TO kpi_areas;
ALTER TABLE public.strategy_templates          RENAME TO kpi_area_templates;
ALTER TABLE public.strategy_target_breakdowns  RENAME TO kpi_area_target_breakdowns;

-- Level 2 revert: initiatives -> strategies
ALTER TABLE public.initiatives RENAME TO strategies;

-- Level 3 revert: action_plans -> initiatives
ALTER TABLE public.action_plans RENAME TO initiatives;

-- Level 4 revert: tasks + turunan -> action_plans + turunan
ALTER TABLE public.tasks              RENAME TO action_plans;
ALTER TABLE public.task_repeat_rules  RENAME TO action_plan_repeat_rules;
ALTER TABLE public.task_result_values RENAME TO action_plan_result_values;
ALTER TABLE public.task_submissions   RENAME TO action_plan_submissions;
ALTER TABLE public.task_instances     RENAME TO action_plan_instances;

-- =====================================================================
-- Section 3R: Rename indexes back (mirror the forward set exactly)
-- =====================================================================

ALTER INDEX public.strategy_target_breakdowns_unique       RENAME TO kpi_area_breakdown_unique;
ALTER INDEX public.strategy_target_breakdowns_by_strategy  RENAME TO kpi_area_breakdown_by_area;
ALTER INDEX public.strategy_target_breakdowns_pkey         RENAME TO kpi_area_target_breakdowns_pkey;

ALTER INDEX public.idx_strategy_templates_goal RENAME TO idx_kpi_area_templates_goal;
ALTER INDEX public.strategy_templates_goal_template_id_division_name_key
                                              RENAME TO kpi_area_templates_goal_template_id_division_name_key;
ALTER INDEX public.strategy_templates_pkey    RENAME TO kpi_area_templates_pkey;

ALTER INDEX public.idx_strategies_goal RENAME TO idx_kpi_areas_goal;
ALTER INDEX public.strategies_pkey     RENAME TO kpi_areas_pkey;

ALTER INDEX public.idx_initiatives_strategy RENAME TO idx_strategies_kpi_area;
ALTER INDEX public.initiatives_pkey         RENAME TO strategies_pkey;

ALTER INDEX public.video_briefs_action_plan_id_key RENAME TO video_briefs_initiative_id_key;
ALTER INDEX public.evaluations_action_plan_id_key  RENAME TO evaluations_initiative_id_key;
ALTER INDEX public.chat_rooms_action_plan_id_key   RENAME TO chat_rooms_initiative_id_key;

ALTER INDEX public.idx_action_plans_team              RENAME TO idx_initiatives_team;
ALTER INDEX public.idx_action_plans_initiative        RENAME TO idx_initiatives_strategy;
ALTER INDEX public.idx_action_plans_problem_statement RENAME TO idx_initiatives_problem_statement;
ALTER INDEX public.action_plans_pkey                  RENAME TO initiatives_pkey;

ALTER INDEX public.idx_reviews_task RENAME TO idx_reviews_action_plan;

ALTER INDEX public.idx_task_repeat_rules_task    RENAME TO idx_repeat_rules_action_plan;
ALTER INDEX public.task_repeat_rules_task_id_key RENAME TO action_plan_repeat_rules_action_plan_id_key;
ALTER INDEX public.task_repeat_rules_pkey        RENAME TO action_plan_repeat_rules_pkey;

ALTER INDEX public.idx_task_result_values_strategy RENAME TO idx_arv_kpi_area;
ALTER INDEX public.task_result_values_pkey         RENAME TO action_plan_result_values_pkey;

ALTER INDEX public.idx_task_submissions_task RENAME TO idx_submissions_action_plan;
ALTER INDEX public.task_submissions_pkey     RENAME TO action_plan_submissions_pkey;

ALTER INDEX public.idx_task_instances_task RENAME TO idx_instances_action_plan;
ALTER INDEX public.task_instances_task_id_instance_date_key
                                          RENAME TO action_plan_instances_action_plan_id_instance_date_key;
ALTER INDEX public.task_instances_pkey    RENAME TO action_plan_instances_pkey;

ALTER INDEX public.idx_tasks_reviewer   RENAME TO idx_action_plans_reviewer;
ALTER INDEX public.idx_tasks_pic        RENAME TO idx_action_plans_pic;
ALTER INDEX public.idx_tasks_action_plan RENAME TO idx_action_plans_initiative;
ALTER INDEX public.tasks_pkey           RENAME TO action_plans_pkey;

-- =====================================================================
-- Section 4R (continued): Recreate the legacy view
-- =====================================================================

CREATE VIEW public.kpi_area_current_values AS
  SELECT rv.kpi_area_id,
    COALESCE(sum(
      CASE
        WHEN rv.value_type = ANY (ARRAY['number'::text, 'currency'::text, 'percentage'::text])
          THEN rv.value_numeric
        ELSE 0::numeric
      END), 0::numeric) AS numeric_total,
    count(*) FILTER (WHERE rv.value_type = 'text'::text) AS text_count,
    max(s.reviewed_at) AS last_approved_at
  FROM public.action_plan_result_values rv
    JOIN public.action_plan_submissions s ON s.id = rv.submission_id
  WHERE s.review_status = 'approved'::text
    AND rv.kpi_area_id IS NOT NULL
  GROUP BY rv.kpi_area_id;

GRANT SELECT ON public.kpi_area_current_values TO authenticated;
REVOKE ALL ON public.kpi_area_current_values FROM public;
REVOKE ALL ON public.kpi_area_current_values FROM anon;

COMMIT;
