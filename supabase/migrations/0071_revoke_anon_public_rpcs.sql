-- =============================================================================
-- 0071_revoke_anon_public_rpcs.sql
-- =============================================================================
-- SECURITY FIX (mcp__supabase__get_advisors security scan, 2026-07-18, during
-- migration 0070 verification on staging project fhnqwytqprsptjshoxfn):
--
-- 9 user-facing RPCs still carry EXECUTE granted to PUBLIC, which PostgREST
-- resolves for the `anon` role too — meaning an unauthenticated caller can
-- invoke them via `supabase.rpc(...)`. All nine are SECURITY DEFINER and
-- mutate state (activate a goal/strategy/action-plan/initiative, apply a
-- goal template, submit or review a task submission), so anon exposure is a
-- real write primitive, not just an information leak.
--
-- Root cause: migration 0046 did `DROP FUNCTION ... CASCADE` then recreated
-- these functions, which resets a function's ACL to Postgres' implicit
-- default (EXECUTE granted to PUBLIC) — confirmed via
-- information_schema.routine_privileges on both the local stack and the
-- staging project: every one of the nine shows only `PUBLIC, postgres`, with
-- no explicit `authenticated` grant. `authenticated` currently gets access
-- purely through the PUBLIC grant, so revoking PUBLIC without also granting
-- authenticated would break the app, not just anon.
--
-- Unlike 0062 (which revoked these 22 internal/trigger functions from
-- `authenticated` too, since they must never be called via RPC at all), the
-- nine functions here are legitimate user-facing RPCs — `authenticated` must
-- keep EXECUTE. Only the `anon`/PUBLIC exposure is the bug.
--
-- After this migration:
--   * `supabase.rpc(...)` calls to these 9 functions as `anon` must return
--     permission-denied (42501).
--   * The same calls as an authenticated user must continue to work
--     unchanged (RLS / in-body auth.uid() checks still apply as before).
-- =============================================================================

-- 0046 (activate_*): goal/strategy/action-plan/initiative activation gates
REVOKE EXECUTE ON FUNCTION public.activate_goal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_goal(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.activate_strategy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_strategy(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.activate_action_plan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_action_plan(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.activate_initiative(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_initiative(uuid) TO authenticated;

-- 0046: apply a goal template to create a goal for a PIC/period
REVOKE EXECUTE ON FUNCTION public.apply_goal_template(uuid, uuid, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_goal_template(uuid, uuid, date, date, jsonb) TO authenticated;

-- 0046: reviewer decision on a task / task-instance submission
REVOKE EXECUTE ON FUNCTION public.review_task_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_task_submission(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_task_instance_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_task_instance_submission(uuid, text, text) TO authenticated;

-- 0046: PIC finalizes a task / task-instance submission draft
REVOKE EXECUTE ON FUNCTION public.submit_task(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_task(uuid, text, jsonb, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_task_instance(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_task_instance(uuid, text, jsonb, jsonb) TO authenticated;
