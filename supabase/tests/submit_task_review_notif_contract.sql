-- =============================================================================
-- Contract — submit_task emits a reviewer notification (regression guard for 0068)
-- =============================================================================
-- WHY: 0068_fix_submit_task_review_notif restored parity with
-- submit_task_instance — when a task with `review_required` is submitted, the
-- assigned reviewer must get a `review_request` notification. The audit found
-- this had silently gone missing (one-time reviewer notification lost), and CI
-- never caught it because nothing exercised the DB layer.
--
-- SCOPE: this is a WIRING-level contract. It asserts, from the live function
-- definition, that submit_task still calls emit_notification with type
-- 'review_request', gated on review_required + reviewer_id. That is exactly the
-- line 0068 added and the one a careless refactor would drop. A full behavioural
-- end-to-end test (build goal→strategy→initiative→action_plan, call submit_task
-- as the PIC, assert the notifications row) is deferred to the submit-flow test
-- repair — that chain is what rotted the legacy exec tests and is tracked in
-- supabase/tests/WIP_REPAIR_BACKLOG.md.
--
-- Run: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--        -v ON_ERROR_STOP=1 -f - < supabase/tests/submit_task_review_notif_contract.sql
-- =============================================================================
do $$
declare
  v_def  text;
  fails  text := '';
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'submit_task';

  if v_def is null then
    raise exception 'FAIL: function public.submit_task not found';
  end if;

  -- Must emit a notification of type 'review_request'.
  if v_def !~* 'emit_notification' then
    fails := fails || 'no_emit_notification_call; ';
  end if;
  if v_def !~* '''review_request''' then
    fails := fails || 'no_review_request_type; ';
  end if;
  -- Must be gated on review_required and a present reviewer (not fire blindly).
  if v_def !~* 'review_required' then
    fails := fails || 'not_gated_on_review_required; ';
  end if;
  if v_def !~* 'reviewer_id' then
    fails := fails || 'no_reviewer_id_reference; ';
  end if;

  if fails <> '' then
    raise exception 'submit_task review-notif CONTRACT FAIL: %', fails;
  end if;
  raise notice 'SUBMIT_TASK REVIEW-NOTIF CONTRACT: ALL PASS';
end $$;
