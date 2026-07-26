-- 0104_create_task_with_repeat_atomic.sql — atomic Task + Repeat Rule creation.
--
-- WHY: task/new.tsx used to run TWO sequential writes in one mutation —
--   1. create_task_idempotent(...)   (insert the Task draft)
--   2. set_task_repeat_rule(task.id, ...) (insert its repeat rule)  [only if repeat]
-- These were not atomic. If the connection dropped after (1) committed but
-- before/within (2), onError fired ("Gagal"). The user, seeing failure, tapped
-- Save again → a SECOND Task was created (the first already existed as a draft
-- WITHOUT its repeat rule). client_request_id dedup (0103) covered the network
-- LOST-ACK retry of a single call, but here the two writes are separate round
-- trips: the first already succeeded, so its key is spent, and the re-submit
-- minted a fresh key for a brand-new duplicate. This closes that vector by
-- folding both writes into ONE server-side transaction.
--
-- MECHANISM: create_task_with_repeat_idempotent — SECURITY INVOKER (caller's RLS
-- applies, mirroring create_task_idempotent, no new SECURITY DEFINER surface).
--   • Inserts the task idempotently (identical ON CONFLICT DO NOTHING + re-SELECT
--     as create_task_idempotent — a lost-ACK retry with the same client_request_id
--     still returns the ORIGINAL row).
--   • When p_repeat, calls the existing public.set_task_repeat_rule(...) in the
--     SAME transaction. set_task_repeat_rule stays SECURITY DEFINER and keeps its
--     own authz + cross-org guard; it upserts on (task_id), so a retry re-affirms
--     the rule instead of erroring. If it raises (bad params, cross-org, instances
--     already generated, dropped connection mid-call), the whole txn — task insert
--     included — rolls back. No orphan draft, so no duplicate on the next tap.
--
-- create_task_idempotent is kept (other callers may create one-time tasks); this
-- is the combined path task/new.tsx now uses for both one-time and repeat.
--
-- Contract: supabase/tests/0104_create_task_with_repeat_atomic_contract.sql (0104-DB-1..4).

create or replace function public.create_task_with_repeat_idempotent(
  p_action_plan_id uuid,
  p_name text,
  p_pic_id uuid default null,
  p_reviewer_id uuid default null,
  p_start_date date default null,
  p_deadline date default null,
  p_deadline_time text default null,
  p_expected_output text default null,
  p_definition_of_done text default null,
  p_priority text default null,
  p_evidence_required boolean default false,
  p_result_value_required boolean default false,
  p_evidence_description text default null,
  p_description text default null,
  p_client_request_id uuid default null,
  -- Repeat (Fase 2). p_repeat=false => one-time task, repeat params ignored.
  p_repeat boolean default false,
  p_frequency text default null,
  p_weekdays integer[] default null,
  p_month_days integer[] default null,
  p_custom_dates date[] default null,
  p_repeat_start_date date default null,
  p_repeat_end_date date default null,
  p_time_of_day time without time zone default null,
  p_missed_rule text default null,
  p_grace_period_minutes integer default null
) returns public.tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.tasks;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi.' using errcode = '42501'; end if;
  select organization_id into v_org from public.profiles where id = v_uid;

  insert into public.tasks (organization_id, created_by, client_request_id,
                            action_plan_id, name, pic_id, reviewer_id, start_date, deadline,
                            deadline_time, expected_output, definition_of_done, priority,
                            evidence_required, result_value_required, evidence_description, description)
  values (v_org, v_uid, p_client_request_id,
          p_action_plan_id, p_name, p_pic_id, p_reviewer_id, p_start_date, p_deadline,
          p_deadline_time, p_expected_output, p_definition_of_done, p_priority,
          p_evidence_required, p_result_value_required, p_evidence_description, p_description)
  on conflict (organization_id, created_by, client_request_id) where client_request_id is not null
    do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.tasks
     where organization_id = v_org and created_by = v_uid and client_request_id = p_client_request_id;
  end if;

  -- Same transaction: if the repeat rule fails, the task insert above rolls back too.
  if p_repeat then
    perform public.set_task_repeat_rule(
      v_row.id, p_frequency, p_weekdays, p_month_days, p_custom_dates,
      p_repeat_start_date, p_repeat_end_date, p_time_of_day, p_missed_rule, p_grace_period_minutes);
    -- Re-read: set_task_repeat_rule flips tasks.repeat_setting to 'repeat', which the
    -- RETURNING above (run before that UPDATE) did not capture.
    select * into v_row from public.tasks where id = v_row.id;
  end if;

  return v_row;
end;
$$;

-- ACL: a fresh function defaults to PUBLIC EXECUTE — authenticated only, never anon.
revoke all on function public.create_task_with_repeat_idempotent(
  uuid, text, uuid, uuid, date, date, text, text, text, text, boolean, boolean, text, text, uuid,
  boolean, text, integer[], integer[], date[], date, date, time without time zone, text, integer
) from public, anon;
grant execute on function public.create_task_with_repeat_idempotent(
  uuid, text, uuid, uuid, date, date, text, text, text, text, boolean, boolean, text, text, uuid,
  boolean, text, integer[], integer[], date[], date, date, time without time zone, text, integer
) to authenticated;
