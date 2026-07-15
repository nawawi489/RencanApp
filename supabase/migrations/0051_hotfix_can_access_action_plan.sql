-- =============================================================================
-- 0051_hotfix_can_access_action_plan.sql
-- =============================================================================
-- Migration 0046 (F2+F3 rewrite) dropped old can_access_action_plan (which
-- checked OLD action_plans table = level 4, now tasks) and created
-- can_access_task as its replacement. But it never created the NEW
-- can_access_action_plan for level 3 (NEW action_plans table, old initiatives).
--
-- Multiple RLS policies and RPC bodies reference can_access_action_plan() —
-- they silently error 42883 at runtime when accessing action_plan-level cards.
--
-- This migration creates the missing function following the same pattern as
-- can_access_task but adapted for action_plans (no reviewer_id column,
-- parent join is to initiatives via initiative_id).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_access_action_plan(p_action_plan uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.action_plans ap
    LEFT JOIN public.initiatives i ON i.id = ap.initiative_id
    WHERE ap.id = p_action_plan
      AND ap.organization_id = public.current_user_org()
      AND (
        public.can_view_workspace()
        OR ap.pic_id = auth.uid()
        OR ap.created_by = auth.uid()
        OR i.pic_id = auth.uid()
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.confidential_access_rules cr
          WHERE cr.entity_type = 'action_plan' AND cr.entity_id = ap.id
        )
        OR public.user_role_level() = 'ceo'
        OR ap.pic_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.confidential_access_rules cr
          WHERE cr.entity_type = 'action_plan' AND cr.entity_id = ap.id
            AND cr.user_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_action_plan(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_action_plan(uuid) FROM public, anon;
