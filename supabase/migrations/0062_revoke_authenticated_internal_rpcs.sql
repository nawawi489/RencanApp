-- =============================================================================
-- 0062_revoke_authenticated_internal_rpcs.sql
-- =============================================================================
-- SECURITY FIX (Finding 3, /cso audit 2026-07-16, conf 9/10, VERIFIED):
--
-- Migration 0036 blanket-granted EXECUTE on every public function to both
-- `authenticated` and `anon`. Migration 0050 closed the `anon` leg. This
-- migration closes the `authenticated` leg for functions that carried an
-- explicit `REVOKE EXECUTE ... FROM ... authenticated` in migrations
-- 0003-0021 — internal helpers and trigger functions that must never be
-- callable via PostgREST RPC.
--
-- Two highest-severity exposures confirmed:
--   * emit_notification: any authenticated user can spoof a notification into
--     any org / to any user (cross-tenant phishing primitive, no org guard).
--   * write_activity: any authenticated user can insert fabricated audit-log
--     entries in their own org (corrupts governance/compliance evidence).
--
-- After this migration, calling these functions directly via
-- `supabase.rpc('emit_notification', {...})` etc. must return permission-denied.
--
-- CORRECTNESS NOTE (caught in /review before this migration shipped):
-- 0046_rewrite_bodies_and_policies.sql did `DROP FUNCTION ... CASCADE` on 11
-- of these 22 functions and recreated them. Postgres has no `IF EXISTS` for
-- REVOKE, so a stale name aborts the whole transaction; a DROP+CREATE also
-- resets the function's ACL to Postgres' implicit default (EXECUTE granted
-- to PUBLIC), which a REVOKE targeting only `authenticated` does not undo
-- (PUBLIC grants apply to every role regardless of role-specific revokes).
-- Three of those 11 were also renamed in the same migration (S5 block):
--   tg_initiative_chat_room            -> tg_task_sync_chat
--   tg_action_plan_sync_chat           -> tg_action_plan_chat_room
--   tg_kpi_area_breakdown_touch_updated_at -> tg_strategy_breakdown_touch_updated_at
-- To stay correct across any future DROP+CREATE cycle, every REVOKE below
-- targets PUBLIC, anon, and authenticated explicitly (revoking a privilege
-- a role never had is a harmless no-op in Postgres — only revoking on a
-- nonexistent function errors).
-- =============================================================================

-- 0003: handle_new_user is a SECURITY DEFINER trigger helper, never callable externally
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 0004: internal DDL helper, never callable externally.
-- Cold-start guard: this function ships via the Supabase project template, not our
-- migrations, so it doesn't exist yet on a fresh/empty database (see 0004's own
-- comment). Bare REVOKE would abort the whole file on first `supabase start`/CI.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 0005: audit-log writer — SECURITY DEFINER; callers are other trusted functions only
REVOKE EXECUTE ON FUNCTION public.write_activity(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
-- 0005: trigger function
REVOKE EXECUTE ON FUNCTION public.log_card_creation() FROM PUBLIC, anon, authenticated;

-- 0007 (recreated in 0046 via DROP+CREATE, same name — ACL reset to PUBLIC default):
-- system-side audit writer (cron/trigger context only)
REVOKE EXECUTE ON FUNCTION public.write_activity_system(uuid, uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
-- 0007 (recreated in 0046, same name): cron-only job generators / markers
REVOKE EXECUTE ON FUNCTION public.generate_action_plan_instances(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_instances(timestamptz) FROM PUBLIC, anon, authenticated;

-- 0008: CRITICAL — emit_notification has zero org/recipient validation vs caller
REVOKE EXECUTE ON FUNCTION public.emit_notification(uuid, uuid, uuid, text, text, uuid, text, text, date) FROM PUBLIC, anon, authenticated;
-- 0008 (recreated in 0046, same name): internal membership recompute — SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.recompute_chat_room_members(uuid) FROM PUBLIC, anon, authenticated;
-- 0008 (recreated in 0046, same name): cron job, should never run via RPC
REVOKE EXECUTE ON FUNCTION public.emit_deadline_notifications() FROM PUBLIC, anon, authenticated;

-- 0009: trigger functions, renamed in 0046 (S5 block) — target the CURRENT names,
-- not the original 0009 names (tg_initiative_chat_room / tg_action_plan_sync_chat),
-- which no longer exist and would abort this migration with "function does not exist".
REVOKE EXECUTE ON FUNCTION public.tg_task_sync_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_action_plan_chat_room() FROM PUBLIC, anon, authenticated;
-- 0009 (recreated in 0046, same name): tg_governance_warning
REVOKE EXECUTE ON FUNCTION public.tg_governance_warning() FROM PUBLIC, anon, authenticated;

-- 0013: append-only guard trigger
REVOKE EXECUTE ON FUNCTION public.tg_block_delete_append_only() FROM PUBLIC, anon, authenticated;
-- 0013: internal scoring sub-computations called only from SECURITY DEFINER aggregators
REVOKE EXECUTE ON FUNCTION public.compute_governance_discipline(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
-- 0013 (recreated in 0046, same name):
REVOKE EXECUTE ON FUNCTION public.compute_review_pass_rate(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aggregate_repeat_metrics_per_user(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_action_plan_completion(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
-- 0013: never touched by 0046
REVOKE EXECUTE ON FUNCTION public.compute_development_contribution(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;

-- 0019: internal governance logging helper
REVOKE EXECUTE ON FUNCTION public.log_governance_violation(uuid, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 0020: trigger function — score formula immutability guard
REVOKE EXECUTE ON FUNCTION public.tg_score_formula_immutable_columns() FROM PUBLIC, anon, authenticated;

-- 0021: trigger function — KPI area breakdown timestamp, renamed in 0046 (S5 block).
-- Original name (tg_kpi_area_breakdown_touch_updated_at) no longer exists.
REVOKE EXECUTE ON FUNCTION public.tg_strategy_breakdown_touch_updated_at() FROM PUBLIC, anon, authenticated;
