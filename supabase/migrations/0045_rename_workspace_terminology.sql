-- =====================================================================
-- 0045_rename_workspace_terminology.sql
-- =====================================================================
-- Rename Workspace Performance hierarchy V1.8.2 -> V1.8.3 (bottom-up).
--
-- Spec: specs/rename-workspace-terminology.md §7 (Data Contracts)
-- PRD: PRD.md V1.8.3 (updated 2026-07-11)
-- Owner decisions: RWT-01..RWT-11 DECIDED (default) 2026-07-11
--
-- SCOPE (F1): tables + columns + indexes + view rename only.
--   Function bodies, RLS policy bodies, and trigger functions are deferred
--   to F3 (see spec §10 fase eksekusi). Between F1 and F3 apply, expect
--   RPC failures referencing renamed tables (broken pg_proc.prosrc text
--   until F3 rewrites them).
--
-- Mapping (bottom-up):
--   action_plans                    -> tasks
--   action_plan_instances           -> task_instances
--   action_plan_submissions         -> task_submissions
--   action_plan_result_values       -> task_result_values
--   action_plan_repeat_rules        -> task_repeat_rules
--   initiatives                     -> action_plans
--   strategies                      -> initiatives
--   kpi_areas                       -> strategies
--   kpi_area_templates              -> strategy_templates
--   kpi_area_target_breakdowns      -> strategy_target_breakdowns
--   view kpi_area_current_values    -> strategy_current_values
--
-- FK columns follow bottom-up shift:
--   action_plan_id -> task_id
--   initiative_id  -> action_plan_id
--   strategy_id    -> initiative_id
--   kpi_area_id    -> strategy_id
--
-- Order matters: rename compound identifiers BEFORE their base (e.g.,
-- action_plan_instances before action_plans) so no name collisions occur
-- mid-transaction. All within one BEGIN/COMMIT for atomicity.
-- =====================================================================

BEGIN;

-- =====================================================================
-- Section 1: Rename tables bottom-up (level 4 -> level 5 first)
-- =====================================================================

-- Level 4 old (action_plans + turunan) -> level 5 new (tasks + turunan)
-- IMPORTANT: rename compound names BEFORE base name.
ALTER TABLE public.action_plan_instances     RENAME TO task_instances;
ALTER TABLE public.action_plan_submissions   RENAME TO task_submissions;
ALTER TABLE public.action_plan_result_values RENAME TO task_result_values;
ALTER TABLE public.action_plan_repeat_rules  RENAME TO task_repeat_rules;
ALTER TABLE public.action_plans              RENAME TO tasks;

-- Level 3 old (initiatives) -> level 4 new (action_plans)
ALTER TABLE public.initiatives RENAME TO action_plans;

-- Level 2 old (strategies) -> level 3 new (initiatives)
ALTER TABLE public.strategies RENAME TO initiatives;

-- Level 1 old (kpi_areas + turunan) -> level 2 new (strategies + turunan)
ALTER TABLE public.kpi_area_target_breakdowns RENAME TO strategy_target_breakdowns;
ALTER TABLE public.kpi_area_templates         RENAME TO strategy_templates;
ALTER TABLE public.kpi_areas                  RENAME TO strategies;

-- =====================================================================
-- Section 2: Rename FK columns (bottom-up)
-- =====================================================================

-- Level 4 old FK action_plan_id -> level 5 new task_id
ALTER TABLE public.task_instances    RENAME COLUMN action_plan_id TO task_id;
ALTER TABLE public.task_repeat_rules RENAME COLUMN action_plan_id TO task_id;
ALTER TABLE public.task_submissions  RENAME COLUMN action_plan_id TO task_id;
ALTER TABLE public.reviews           RENAME COLUMN action_plan_id TO task_id;

-- Level 3 old FK initiative_id -> level 4 new action_plan_id
ALTER TABLE public.tasks        RENAME COLUMN initiative_id TO action_plan_id;
ALTER TABLE public.chat_rooms   RENAME COLUMN initiative_id TO action_plan_id;
ALTER TABLE public.evaluations  RENAME COLUMN initiative_id TO action_plan_id;
ALTER TABLE public.video_briefs RENAME COLUMN initiative_id TO action_plan_id;

-- Level 2 old FK strategy_id -> level 3 new initiative_id
ALTER TABLE public.action_plans RENAME COLUMN strategy_id TO initiative_id;

-- Level 1 old FK kpi_area_id -> level 2 new strategy_id
ALTER TABLE public.initiatives                 RENAME COLUMN kpi_area_id TO strategy_id;
ALTER TABLE public.strategy_target_breakdowns  RENAME COLUMN kpi_area_id TO strategy_id;
ALTER TABLE public.task_result_values          RENAME COLUMN kpi_area_id TO strategy_id;

-- =====================================================================
-- Section 3: Rename indexes to match new table naming
-- =====================================================================

-- action_plans -> tasks indexes
ALTER INDEX public.action_plans_pkey            RENAME TO tasks_pkey;
ALTER INDEX public.idx_action_plans_initiative  RENAME TO idx_tasks_action_plan;
ALTER INDEX public.idx_action_plans_pic         RENAME TO idx_tasks_pic;
ALTER INDEX public.idx_action_plans_reviewer    RENAME TO idx_tasks_reviewer;

-- action_plan_instances -> task_instances
ALTER INDEX public.action_plan_instances_pkey RENAME TO task_instances_pkey;
ALTER INDEX public.action_plan_instances_action_plan_id_instance_date_key
                                             RENAME TO task_instances_task_id_instance_date_key;
ALTER INDEX public.idx_instances_action_plan RENAME TO idx_task_instances_task;

-- action_plan_submissions -> task_submissions
ALTER INDEX public.action_plan_submissions_pkey RENAME TO task_submissions_pkey;
ALTER INDEX public.idx_submissions_action_plan  RENAME TO idx_task_submissions_task;

-- action_plan_result_values -> task_result_values
ALTER INDEX public.action_plan_result_values_pkey RENAME TO task_result_values_pkey;
ALTER INDEX public.idx_arv_kpi_area               RENAME TO idx_task_result_values_strategy;

-- action_plan_repeat_rules -> task_repeat_rules
ALTER INDEX public.action_plan_repeat_rules_pkey RENAME TO task_repeat_rules_pkey;
ALTER INDEX public.action_plan_repeat_rules_action_plan_id_key
                                                RENAME TO task_repeat_rules_task_id_key;
ALTER INDEX public.idx_repeat_rules_action_plan RENAME TO idx_task_repeat_rules_task;

-- reviews.action_plan_id -> reviews.task_id
ALTER INDEX public.idx_reviews_action_plan RENAME TO idx_reviews_task;

-- initiatives -> action_plans
ALTER INDEX public.initiatives_pkey                  RENAME TO action_plans_pkey;
ALTER INDEX public.idx_initiatives_problem_statement RENAME TO idx_action_plans_problem_statement;
ALTER INDEX public.idx_initiatives_strategy          RENAME TO idx_action_plans_initiative;
ALTER INDEX public.idx_initiatives_team              RENAME TO idx_action_plans_team;

-- chat_rooms/evaluations/video_briefs unique keys on renamed FK
ALTER INDEX public.chat_rooms_initiative_id_key   RENAME TO chat_rooms_action_plan_id_key;
ALTER INDEX public.evaluations_initiative_id_key  RENAME TO evaluations_action_plan_id_key;
ALTER INDEX public.video_briefs_initiative_id_key RENAME TO video_briefs_action_plan_id_key;

-- strategies -> initiatives
ALTER INDEX public.strategies_pkey       RENAME TO initiatives_pkey;
ALTER INDEX public.idx_strategies_kpi_area RENAME TO idx_initiatives_strategy;

-- kpi_areas -> strategies
ALTER INDEX public.kpi_areas_pkey    RENAME TO strategies_pkey;
ALTER INDEX public.idx_kpi_areas_goal RENAME TO idx_strategies_goal;

-- kpi_area_templates -> strategy_templates
ALTER INDEX public.kpi_area_templates_pkey RENAME TO strategy_templates_pkey;
ALTER INDEX public.kpi_area_templates_goal_template_id_division_name_key
                                          RENAME TO strategy_templates_goal_template_id_division_name_key;
ALTER INDEX public.idx_kpi_area_templates_goal RENAME TO idx_strategy_templates_goal;

-- kpi_area_target_breakdowns -> strategy_target_breakdowns
ALTER INDEX public.kpi_area_target_breakdowns_pkey RENAME TO strategy_target_breakdowns_pkey;
ALTER INDEX public.kpi_area_breakdown_by_area      RENAME TO strategy_target_breakdowns_by_strategy;
ALTER INDEX public.kpi_area_breakdown_unique       RENAME TO strategy_target_breakdowns_unique;

-- =====================================================================
-- Section 4: DROP + CREATE view (view stored as text, needs rebuild)
-- =====================================================================

DROP VIEW IF EXISTS public.kpi_area_current_values;

CREATE VIEW public.strategy_current_values AS
  SELECT rv.strategy_id,
    COALESCE(sum(
      CASE
        WHEN rv.value_type = ANY (ARRAY['number'::text, 'currency'::text, 'percentage'::text])
          THEN rv.value_numeric
        ELSE 0::numeric
      END), 0::numeric) AS numeric_total,
    count(*) FILTER (WHERE rv.value_type = 'text'::text) AS text_count,
    max(s.reviewed_at) AS last_approved_at
  FROM public.task_result_values rv
    JOIN public.task_submissions s ON s.id = rv.submission_id
  WHERE s.review_status = 'approved'::text
    AND rv.strategy_id IS NOT NULL
  GROUP BY rv.strategy_id;

-- Preserve original grants: kpi_area_current_values granted to authenticated,
-- revoked from public/anon (per 0032 or 0034 migration).
GRANT SELECT ON public.strategy_current_values TO authenticated;
REVOKE ALL ON public.strategy_current_values FROM public;
REVOKE ALL ON public.strategy_current_values FROM anon;

-- =====================================================================
-- Section 5: Notes for F3
-- =====================================================================
-- After this migration:
--   - Tables/columns/indexes renamed
--   - View recreated
--   - Functions still reference OLD table names in pg_proc.prosrc → BROKEN
--     until F3 CREATE OR REPLACE with new bodies (spec §10 F3).
--   - RLS policies bodies referencing renamed tables in subqueries may fail;
--     testing after this migration will reveal which policies need rewrite.
--   - Triggers still attach to renamed tables (Postgres OID-tracks), fine.
--   - Trigger function bodies (pg_proc.prosrc) reference old table names
--     → broken until F3.
--
-- Rollback: see supabase/migrations/0045R_workspace_terminology_revert.sql
-- (to be added in F6 rollback drill).

COMMIT;
