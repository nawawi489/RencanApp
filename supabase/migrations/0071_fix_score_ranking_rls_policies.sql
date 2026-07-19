-- ============================================================
-- Migration 0071: Re-create missing RLS SELECT policies
-- on user_score_results and ranking_snapshots.
--
-- These policies were originally defined in 0013_fase7_people_score
-- but are absent from the live schema after db reset. Without them
-- RLS blocks all authenticated reads → the app shows "Skor menyusul"
-- even when score data exists.
-- ============================================================

-- user_score_results: own row OR manage_score_formula OR view_all_workspace OR supervisor
drop policy if exists "user_score_results_select" on public.user_score_results;
create policy "user_score_results_select" on public.user_score_results
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      user_id = auth.uid()
      or public.has_permission('manage_score_formula')
      or public.has_permission('view_all_workspace')
      or public.is_supervisor_of(user_id)
    )
  );

-- ranking_snapshots: same visibility rules
drop policy if exists "ranking_snapshots_select" on public.ranking_snapshots;
create policy "ranking_snapshots_select" on public.ranking_snapshots
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      user_id = auth.uid()
      or public.has_permission('manage_score_formula')
      or public.has_permission('view_all_workspace')
      or public.is_supervisor_of(user_id)
    )
  );
