-- =====================================================================
-- 0064_fix_strategy_current_values_security_invoker.sql
-- =====================================================================
-- Fixes a regression introduced by 0045 (rename workspace terminology):
-- the view was originally created (0019, as kpi_area_current_values)
-- with `security_invoker = true` so RLS on the underlying tables
-- (task_result_values, task_submissions) applies per querying user.
--
-- The DROP + CREATE VIEW rebuild in 0045 recreated it without that
-- option, silently reverting it to definer-style behavior (Postgres
-- default): the view runs as its owner (postgres), bypassing RLS and
-- letting any authenticated user read aggregate KPI values across
-- organizations, not just their own. Flagged by Supabase security
-- advisor as `security_definer_view` (ERROR).
--
-- Fix: restore security_invoker = true so RLS on task_result_values /
-- task_submissions is enforced per caller again (org + visibility
-- scoping, matching the assumption in mobile/src/lib/home.ts).
-- =====================================================================

BEGIN;

ALTER VIEW public.strategy_current_values SET (security_invoker = true);

COMMIT;
