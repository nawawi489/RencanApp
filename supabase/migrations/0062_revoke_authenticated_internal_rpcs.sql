-- =============================================================================
-- 0062_revoke_authenticated_internal_rpcs.sql
-- =============================================================================
-- SECURITY FIX (Finding 3, /cso audit 2026-07-16, conf 9/10, VERIFIED):
--
-- Migration 0036 blanket-granted EXECUTE on every public function to both
-- `authenticated` and `anon`. Migration 0050 closed the `anon` leg. This
-- migration closes the `authenticated` leg for functions that carried an
-- explicit `REVOKE EXECUTE ... FROM ... authenticated` in migrations
-- 0003–0021 — internal helpers and trigger functions that must never be
-- callable via PostgREST RPC.
--
-- Two highest-severity exposures confirmed:
--   • emit_notification: any authenticated user can spoof a notification into
--     any org / to any user (cross-tenant phishing primitive, no org guard).
--   • write_activity: any authenticated user can insert fabricated audit-log
--     entries in their own org (corrupts governance/compliance evidence).
--
-- After this migration, calling these functions directly via
-- `supabase.rpc('emit_notification', {...})` etc. must return permission-denied.
-- =============================================================================

-- 0003: handle_new_user is a SECURITY DEFINER trigger helper, never callable externally
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 0004: internal DDL helper, never callable externally
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- 0005: audit-log writer — SECURITY DEFINER; callers are other trusted functions only
REVOKE EXECUTE ON FUNCTION public.write_activity(text, uuid, text, jsonb) FROM authenticated;
-- 0005: trigger function
REVOKE EXECUTE ON FUNCTION public.log_card_creation() FROM authenticated;

-- 0007: system-side audit writer (cron/trigger context only)
REVOKE EXECUTE ON FUNCTION public.write_activity_system(uuid, uuid, text, uuid, text, jsonb) FROM authenticated;
-- 0007: cron-only job generators / markers
REVOKE EXECUTE ON FUNCTION public.generate_action_plan_instances(uuid, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_instances(timestamptz) FROM authenticated;

-- 0008: CRITICAL — emit_notification has zero org/recipient validation vs caller
REVOKE EXECUTE ON FUNCTION public.emit_notification(uuid, uuid, uuid, text, text, uuid, text, text, date) FROM authenticated;
-- 0008: internal membership recompute — SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.recompute_chat_room_members(uuid) FROM authenticated;
-- 0008: cron job, should never run via RPC
REVOKE EXECUTE ON FUNCTION public.emit_deadline_notifications() FROM authenticated;

-- 0009: trigger functions — returning `trigger`, but belt-and-suspenders
REVOKE EXECUTE ON FUNCTION public.tg_initiative_chat_room() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_action_plan_sync_chat() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_governance_warning() FROM authenticated;

-- 0013: append-only guard trigger
REVOKE EXECUTE ON FUNCTION public.tg_block_delete_append_only() FROM authenticated;
-- 0013: internal scoring sub-computations called only from SECURITY DEFINER aggregators
REVOKE EXECUTE ON FUNCTION public.compute_governance_discipline(uuid, uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_review_pass_rate(uuid, uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.aggregate_repeat_metrics_per_user(uuid, uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_action_plan_completion(uuid, uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_development_contribution(uuid, uuid, date, date) FROM authenticated;

-- 0019: internal governance logging helper
REVOKE EXECUTE ON FUNCTION public.log_governance_violation(uuid, text, text, uuid, text, jsonb) FROM authenticated;

-- 0020: trigger function — score formula immutability guard
REVOKE EXECUTE ON FUNCTION public.tg_score_formula_immutable_columns() FROM authenticated;

-- 0021: trigger function — KPI area breakdown timestamp
REVOKE EXECUTE ON FUNCTION public.tg_kpi_area_breakdown_touch_updated_at() FROM authenticated;
