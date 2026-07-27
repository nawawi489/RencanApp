-- 0110-DB cross-tenant isolation for 9 previously uncovered tables — S2-8.
--
-- WHY: The audit (2026-07-26) found that the runtime cross-org assertions
-- shipped so far cover a subset of the org-scoped surface. Nine tables had
-- ZERO runtime test proving a user in Org A cannot see Org B rows:
--   evaluations, cancellations, deadline_change_requests,
--   deadline_change_logs, reviews, login_logs, confidential_access_rules,
--   video_briefs, brief_understanding_records.
--
-- SHAPE: each check runs inside its own BEGIN…ROLLBACK, so failures name
-- exactly which table regressed and no test leaks state into the next.
--
-- Uses the CEO fixture from _fixtures.sql (`ca8c1471…`, org `4b07a19f…`)
-- as "user A". Inserts rows into the DCR-05 org (`52b0ebe1…`) as "org B"
-- with `row_security = off`, then impersonates user A and asserts the
-- filtered SELECT returns 0 rows.

\set ON_ERROR_STOP on

-- Constants used across tests.
-- User A + Org A (fixture CEO in Contract Fixtures Org).
--   sub = ca8c1471-b870-4f09-a149-25e5eae99d6f
--   org = 4b07a19f-550d-4952-b0d8-44f38f651d89
-- Org B (DCR-05 Fixtures Org).
--   org = 52b0ebe1-d8bd-466d-b491-526ee6518b70
--   user = 11111111-1111-1111-1111-000000000001 (DCR CEO)

-- --------------------------------------------------------------------------
-- Structural precondition for each of the 9 tables: RLS on + at least one
-- SELECT-scoped policy. If a future migration drops RLS or all policies
-- from any of these, this fails long before the runtime block below.
-- --------------------------------------------------------------------------
do $$
declare
  v_tables text[] := array[
    'evaluations', 'cancellations', 'deadline_change_requests',
    'deadline_change_logs', 'reviews', 'login_logs',
    'confidential_access_rules', 'video_briefs', 'brief_understanding_records'
  ];
  v_t text;
  v_rls boolean;
  v_policies int;
  fails text := '';
begin
  foreach v_t in array v_tables loop
    select c.relrowsecurity into v_rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_t;

    if v_rls is null then
      fails := fails || v_t || ':missing_table; ';
      continue;
    end if;
    if not v_rls then
      fails := fails || v_t || ':rls_disabled; ';
    end if;

    select count(*) into v_policies
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v_t
       and p.polcmd in ('r', '*');

    if v_policies = 0 then
      fails := fails || v_t || ':no_select_policy; ';
    end if;
  end loop;

  if fails <> '' then
    raise exception '0110-DB-2 FAILED (structural): %', fails;
  end if;
  raise notice '0110-DB-2 PASSED: all 9 target tables have RLS on with a SELECT policy';
end $$;

-- --------------------------------------------------------------------------
-- Runtime check helper: impersonate the fixture CEO in Org A.
-- Kept in pg_temp so it never persists past the test session.
-- --------------------------------------------------------------------------
create or replace function pg_temp.act_as_orgA_ceo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'ca8c1471-b870-4f09-a149-25e5eae99d6f', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', 'ca8c1471-b870-4f09-a149-25e5eae99d6f',
      'role', 'authenticated',
      'org_id', '4b07a19f-550d-4952-b0d8-44f38f651d89'
    )::text,
    true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ==========================================================================
-- 0110-DB-3 · evaluations (initiative-scoped, has organization_id)
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_initB uuid;
  v_evalB uuid;
  v_seen int;
begin
  -- Parent chain for Org B: goal → strategy → initiative.
  insert into public.goals (organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
  values (v_orgB, 'B-goal-eval', v_userB, v_userB, 'active', '10', now(), now() + interval '30 days')
  returning id into v_evalB; -- reuse variable slot
  insert into public.strategies (organization_id, goal_id, name, created_by, pic_id, status)
  values (v_orgB, v_evalB, 'B-strat-eval', v_userB, v_userB, 'active')
  returning id into v_evalB;
  insert into public.initiatives (organization_id, strategy_id, name, created_by, pic_id, status)
  values (v_orgB, v_evalB, 'B-init-eval', v_userB, v_userB, 'active')
  returning id into v_initB;

  insert into public.evaluations (organization_id, initiative_id, evaluated_by)
  values (v_orgB, v_initB, v_userB)
  returning id into v_evalB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.evaluations where id = v_evalB;
  if v_seen <> 0 then
    raise exception '0110-DB-3 FAILED: evaluations leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-3 PASSED: evaluations cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-4 · cancellations
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_cancelB uuid;
  v_seen int;
begin
  insert into public.cancellations (organization_id, entity_type, entity_id, cancelled_by, reason)
  values (v_orgB, 'goal', gen_random_uuid(), v_userB, 'test')
  returning id into v_cancelB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.cancellations where id = v_cancelB;
  if v_seen <> 0 then
    raise exception '0110-DB-4 FAILED: cancellations leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-4 PASSED: cancellations cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-5 · deadline_change_requests
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_dcrB uuid;
  v_seen int;
begin
  insert into public.deadline_change_requests
    (organization_id, entity_type, entity_id, old_deadline, new_deadline, reason, requestor_id)
  values (v_orgB, 'action_plan', gen_random_uuid(),
          current_date, current_date + 7, 'test', v_userB)
  returning id into v_dcrB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.deadline_change_requests where id = v_dcrB;
  if v_seen <> 0 then
    raise exception '0110-DB-5 FAILED: deadline_change_requests leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-5 PASSED: deadline_change_requests cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-6 · deadline_change_logs
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_dcrB uuid;
  v_logB uuid;
  v_seen int;
begin
  insert into public.deadline_change_requests
    (organization_id, entity_type, entity_id, old_deadline, new_deadline, reason, requestor_id)
  values (v_orgB, 'action_plan', gen_random_uuid(),
          current_date, current_date + 7, 'test', v_userB)
  returning id into v_dcrB;

  insert into public.deadline_change_logs
    (organization_id, request_id, action, actor_id, note)
  values (v_orgB, v_dcrB, 'submitted', v_userB, 'test')
  returning id into v_logB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.deadline_change_logs where id = v_logB;
  if v_seen <> 0 then
    raise exception '0110-DB-6 FAILED: deadline_change_logs leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-6 PASSED: deadline_change_logs cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-7 · reviews (org inferred via tasks parent → action_plans → initiatives)
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_goalB uuid; v_stratB uuid; v_initB uuid; v_apB uuid; v_taskB uuid;
  v_subB uuid; v_revB uuid;
  v_seen int;
begin
  -- Full parent chain needed to instantiate a task-submission-review row.
  insert into public.goals (organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
    values (v_orgB, 'B-goal-rev', v_userB, v_userB, 'active', '10', now(), now() + interval '30 days')
    returning id into v_goalB;
  insert into public.strategies (organization_id, goal_id, name, created_by, pic_id, status)
    values (v_orgB, v_goalB, 'B-strat-rev', v_userB, v_userB, 'active') returning id into v_stratB;
  insert into public.initiatives (organization_id, strategy_id, name, created_by, pic_id, status)
    values (v_orgB, v_stratB, 'B-init-rev', v_userB, v_userB, 'active') returning id into v_initB;
  insert into public.action_plans (organization_id, initiative_id, name, created_by, pic_id, status)
    values (v_orgB, v_initB, 'B-ap-rev', v_userB, v_userB, 'active') returning id into v_apB;
  insert into public.tasks (organization_id, action_plan_id, name, created_by, pic_id, reviewer_id, status, repeat_setting)
    values (v_orgB, v_apB, 'B-task-rev', v_userB, v_userB, v_userB, 'submitted', 'one_time')
    returning id into v_taskB;
  insert into public.task_submissions (task_id, version_number, submitted_by, review_status, status)
    values (v_taskB, 1, v_userB, 'pending', 'submitted') returning id into v_subB;
  insert into public.reviews (action_plan_id, submission_id, reviewer_id, decision, reason)
    values (v_taskB, v_subB, v_userB, 'approve', null) returning id into v_revB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.reviews where id = v_revB;
  if v_seen <> 0 then
    raise exception '0110-DB-7 FAILED: reviews leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-7 PASSED: reviews cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-8 · login_logs (no organization_id — scoped via user_id → profile)
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_logB uuid;
  v_seen int;
begin
  insert into public.login_logs (user_id, ip, user_agent, success)
    values (v_userB, '10.0.0.99', 'contract-test', true)
    returning id into v_logB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.login_logs where id = v_logB;
  if v_seen <> 0 then
    raise exception '0110-DB-8 FAILED: login_logs leaked cross-org (Org A saw % rows for a user in Org B)', v_seen;
  end if;
  raise notice '0110-DB-8 PASSED: login_logs cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-9 · confidential_access_rules
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_ruleB uuid;
  v_seen int;
begin
  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, granted_by)
  values (v_orgB, 'goal', gen_random_uuid(), v_userB, v_userB)
  returning id into v_ruleB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.confidential_access_rules where id = v_ruleB;
  if v_seen <> 0 then
    raise exception '0110-DB-9 FAILED: confidential_access_rules leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-9 PASSED: confidential_access_rules cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-10 · video_briefs
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_goalB uuid; v_stratB uuid; v_initB uuid; v_briefB uuid;
  v_seen int;
begin
  insert into public.goals (organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
    values (v_orgB, 'B-goal-vb', v_userB, v_userB, 'active', '10', now(), now() + interval '30 days') returning id into v_goalB;
  insert into public.strategies (organization_id, goal_id, name, created_by, pic_id, status)
    values (v_orgB, v_goalB, 'B-strat-vb', v_userB, v_userB, 'active') returning id into v_stratB;
  insert into public.initiatives (organization_id, strategy_id, name, created_by, pic_id, status)
    values (v_orgB, v_stratB, 'B-init-vb', v_userB, v_userB, 'active') returning id into v_initB;

  insert into public.video_briefs (organization_id, initiative_id, brief_url, description, created_by)
  values (v_orgB, v_initB, 'https://x/y.mp4', 'test', v_userB)
  returning id into v_briefB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.video_briefs where id = v_briefB;
  if v_seen <> 0 then
    raise exception '0110-DB-10 FAILED: video_briefs leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-10 PASSED: video_briefs cross-org isolation holds';
end $$;
rollback;

-- ==========================================================================
-- 0110-DB-11 · brief_understanding_records
-- ==========================================================================
begin;
set local row_security = off;
do $$
declare
  v_orgB uuid := '52b0ebe1-d8bd-466d-b491-526ee6518b70';
  v_userB uuid := '11111111-1111-1111-1111-000000000001';
  v_goalB uuid; v_stratB uuid; v_initB uuid; v_briefB uuid; v_recB uuid;
  v_seen int;
begin
  insert into public.goals (organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
    values (v_orgB, 'B-goal-bur', v_userB, v_userB, 'active', '10', now(), now() + interval '30 days') returning id into v_goalB;
  insert into public.strategies (organization_id, goal_id, name, created_by, pic_id, status)
    values (v_orgB, v_goalB, 'B-strat-bur', v_userB, v_userB, 'active') returning id into v_stratB;
  insert into public.initiatives (organization_id, strategy_id, name, created_by, pic_id, status)
    values (v_orgB, v_stratB, 'B-init-bur', v_userB, v_userB, 'active') returning id into v_initB;

  insert into public.video_briefs (organization_id, initiative_id, brief_url, created_by)
    values (v_orgB, v_initB, 'https://x/y.mp4', v_userB) returning id into v_briefB;

  insert into public.brief_understanding_records
    (organization_id, video_brief_id, user_id, is_understood)
  values (v_orgB, v_briefB, v_userB, true)
  returning id into v_recB;

  perform pg_temp.act_as_orgA_ceo();
  select count(*) into v_seen from public.brief_understanding_records where id = v_recB;
  if v_seen <> 0 then
    raise exception '0110-DB-11 FAILED: brief_understanding_records leaked cross-org (Org A saw % rows)', v_seen;
  end if;
  raise notice '0110-DB-11 PASSED: brief_understanding_records cross-org isolation holds';
end $$;
rollback;
