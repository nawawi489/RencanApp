-- =====================================================================
-- 0097_rls_initplan_wrap.sql
-- =====================================================================
-- Perf: fix 10 `auth_rls_initplan` advisor warnings.
--
-- Postgres re-evaluates a bare `auth.uid()` in an RLS predicate PER ROW
-- during a scan. Wrapping the call in a scalar subquery — `(select auth.uid())`
-- — lets the planner cache it as a one-time InitPlan. Semantically identical.
-- Ref: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Each policy below is reproduced EXACTLY from its current definition
-- (verified against the live staging schema via pg_get_expr on 2026-07-24).
-- ONLY change: every bare `auth.uid()` in the policy expression is wrapped
-- as `(select auth.uid())`. Helper functions (public.can_view_workspace,
-- public.can_access_confidential_chat, public.is_chat_member, public.has_permission,
-- public.is_supervisor_of, public.current_user_org, etc.) are left untouched —
-- the advisor only flags the direct auth.*() calls in the policy predicate.
--
-- Policies touched (table → policy):
--   goals → goals_select
--   development_areas → development_areas_select
--   problem_statements → problem_statements_select
--   mentions → mentions_select
--   chat_message_reads → chat_message_reads_select
--   push_tokens → push_tokens_select_own
--   user_score_results → user_score_results_select
--   ranking_snapshots → ranking_snapshots_select
--   brief_understanding_records → bur_insert (WITH CHECK)
--   brief_understanding_records → bur_update (USING + WITH CHECK)
-- =====================================================================

BEGIN;

-- ----------- goals_select (from 0049 / orig 0010) --------------------
DROP POLICY IF EXISTS goals_select ON public.goals;
CREATE POLICY goals_select ON public.goals
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org()
    AND (
      public.can_view_workspace()
      OR pic_id = (select auth.uid())
      OR created_by = (select auth.uid())
      OR public.goal_has_my_descendant(id)
    )
  );

-- ----------- development_areas_select (from 0049 / orig 0012) ---------
DROP POLICY IF EXISTS development_areas_select ON public.development_areas;
CREATE POLICY development_areas_select ON public.development_areas
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org()
    AND (
      public.can_view_workspace()
      OR pic_id = (select auth.uid())
      OR created_by = (select auth.uid())
      OR public.development_area_has_my_descendant(id)
    )
  );

-- ----------- problem_statements_select (from 0049 / orig 0012) --------
DROP POLICY IF EXISTS problem_statements_select ON public.problem_statements;
CREATE POLICY problem_statements_select ON public.problem_statements
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_user_org()
    AND (
      public.can_view_workspace()
      OR pic_id = (select auth.uid())
      OR created_by = (select auth.uid())
      OR public.is_development_area_pic(development_area_id)
      OR public.problem_statement_has_my_descendant(id)
    )
  );

-- ----------- mentions_select (from 0060) -----------------------------
drop policy if exists "mentions_select" on public.mentions;
create policy "mentions_select" on public.mentions
  for select to authenticated
  using (
    -- Self-mention: gate chat mentions by confidential, pass comment mentions through
    (mentioned_user_id = (select auth.uid()) and (
      chat_message_id is null
      or exists (
        select 1 from public.chat_messages cm
        join public.chat_rooms r on r.id = cm.chat_room_id
        where cm.id = mentions.chat_message_id
          and public.can_access_confidential_chat(r.action_plan_id)
      )
    ))
    or (chat_message_id is not null and exists (
      select 1 from public.chat_messages cm
      join public.chat_rooms r on r.id = cm.chat_room_id
      where cm.id = mentions.chat_message_id
        and (public.is_chat_member(cm.chat_room_id) or public.can_view_workspace())
        and public.can_access_confidential_chat(r.action_plan_id)
    ))
    or (comment_id is not null and exists (
      select 1 from public.comments c where c.id = mentions.comment_id and (
        (c.entity_type = 'action_plan' and public.can_access_action_plan(c.entity_id))
        or (c.entity_type = 'initiative' and public.can_access_initiative(c.entity_id)))))
  );

-- ----------- chat_message_reads_select (from 0060) -------------------
drop policy if exists "chat_message_reads_select" on public.chat_message_reads;
create policy "chat_message_reads_select" on public.chat_message_reads
  for select to authenticated
  using (
    -- Own reads: still gated by confidential
    (reader_id = (select auth.uid()) and exists (
      select 1 from public.chat_messages cm
      join public.chat_rooms r on r.id = cm.chat_room_id
      where cm.id = chat_message_reads.chat_message_id
        and public.can_access_confidential_chat(r.action_plan_id)
    ))
    or exists (
      select 1 from public.chat_messages cm
      join public.chat_rooms r on r.id = cm.chat_room_id
      where cm.id = chat_message_reads.chat_message_id
        and (public.is_chat_member(cm.chat_room_id) or public.can_view_workspace())
        and public.can_access_confidential_chat(r.action_plan_id)
    )
  );

-- ----------- push_tokens_select_own (from 0063) ----------------------
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens for select to authenticated
  using (organization_id = public.current_user_org() and user_id = (select auth.uid()));

-- ----------- user_score_results_select (from 0071) -------------------
drop policy if exists "user_score_results_select" on public.user_score_results;
create policy "user_score_results_select" on public.user_score_results
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      user_id = (select auth.uid())
      or public.has_permission('manage_score_formula')
      or public.has_permission('view_all_workspace')
      or public.is_supervisor_of(user_id)
    )
  );

-- ----------- ranking_snapshots_select (from 0071) --------------------
drop policy if exists "ranking_snapshots_select" on public.ranking_snapshots;
create policy "ranking_snapshots_select" on public.ranking_snapshots
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and (
      user_id = (select auth.uid())
      or public.has_permission('manage_score_formula')
      or public.has_permission('view_all_workspace')
      or public.is_supervisor_of(user_id)
    )
  );

-- ----------- bur_insert (from 0016) ----------------------------------
drop policy if exists "bur_insert" on public.brief_understanding_records;
create policy "bur_insert" on public.brief_understanding_records for insert to authenticated
  with check (
    organization_id = public.current_user_org()
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.video_briefs vb
      where vb.id = brief_understanding_records.video_brief_id
        and vb.organization_id = public.current_user_org()
    )
  );

-- ----------- bur_update (from 0016) ----------------------------------
drop policy if exists "bur_update" on public.brief_understanding_records;
create policy "bur_update" on public.brief_understanding_records for update to authenticated
  using (organization_id = public.current_user_org() and user_id = (select auth.uid()))
  with check (
    organization_id = public.current_user_org()
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.video_briefs vb
      where vb.id = brief_understanding_records.video_brief_id
        and vb.organization_id = public.current_user_org()
    )
  );

COMMIT;
