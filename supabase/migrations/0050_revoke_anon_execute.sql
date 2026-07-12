-- =============================================================================
-- 0050_revoke_anon_execute.sql
-- =============================================================================
-- Migration 0036 granted EXECUTE on ALL public functions to anon as a blanket
-- fix for PostgREST 403s. This was overly broad — anon should never call RPCs
-- (all RPCs require auth.uid()). The per-function REVOKEs in earlier migrations
-- (0005, 0007, 0009, etc.) were negated by 0036 running after them.
--
-- This migration REVOKEs EXECUTE from anon on every public function, then
-- re-grants only the functions that legitimately need anon access (currently
-- none — all RPC entry points require authenticated role).
--
-- Tables: anon keeps SELECT (needed for PostgREST schema introspection and
-- edge-case public reads gated by RLS). No change to table grants.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      r.proname, r.args
    );
  END LOOP;
END $$;
