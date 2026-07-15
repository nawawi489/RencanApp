-- =====================================================================
-- 0049_hotfix_missing_select_policies.sql
-- =====================================================================
-- Hotfix untuk F3 (migrasi 0046) DROP FUNCTION CASCADE efek samping:
-- policy SELECT untuk `goals`, `development_areas`, `problem_statements`
-- ikut ke-drop karena masing-masing mereferensikan
-- goal_has_my_descendant / development_area_has_my_descendant /
-- problem_statement_has_my_descendant (fungsi ini masuk drop-cascade
-- list padahal nama fungsi TIDAK bergeser; kolateral CASCADE).
--
-- Efek: PostgREST INSERT via `INSERT ... RETURNING` gagal 42501 karena
-- USING check pada baris hasil RETURNING dijalankan pada policy SELECT
-- yang tidak ada → deny. Pesan Postgres "new row violates row-level
-- security policy" membingungkan (mengesankan WITH CHECK yang gagal),
-- tapi trace pg log_statement=all mengkonfirmasi CTE pattern
-- `WITH pgrst_source AS (INSERT ... RETURNING goals.*) SELECT ...`
-- gagal di RETURNING SELECT check.
--
-- Recreate 3 policy dari definisi asli (migrasi 0010 + 0012), idempotent.
-- =====================================================================

BEGIN;

-- ----------- goals_select (dari 0010 fase4) ---------------------------
DROP POLICY IF EXISTS goals_select ON public.goals;
CREATE POLICY goals_select ON public.goals
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org()
    AND (
      public.can_view_workspace()
      OR pic_id = auth.uid()
      OR created_by = auth.uid()
      OR public.goal_has_my_descendant(id)
    )
  );

-- ----------- development_areas_select (dari 0012 fase6) ---------------
DROP POLICY IF EXISTS development_areas_select ON public.development_areas;
CREATE POLICY development_areas_select ON public.development_areas
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org()
    AND (
      public.can_view_workspace()
      OR pic_id = auth.uid()
      OR created_by = auth.uid()
      OR public.development_area_has_my_descendant(id)
    )
  );

-- ----------- problem_statements_select (dari 0012 fase6) --------------
DROP POLICY IF EXISTS problem_statements_select ON public.problem_statements;
CREATE POLICY problem_statements_select ON public.problem_statements
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org()
    AND (
      public.can_view_workspace()
      OR pic_id = auth.uid()
      OR created_by = auth.uid()
      OR public.is_development_area_pic(development_area_id)
      OR public.problem_statement_has_my_descendant(id)
    )
  );

COMMIT;
