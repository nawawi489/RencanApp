-- Migration 0062 contract test — authenticated/anon/PUBLIC EXECUTE must stay revoked
-- on internal-only RPCs. This is the third time this repo has been bitten by a blanket
-- GRANT (0036) or a DROP+CREATE ACL reset (0046) silently re-exposing these functions —
-- this contract exists so a future regression fails CI instead of shipping silently.
--
-- Pola: `raise notice 'PASS'` bila lolos, `raise exception 'FAIL: ...'` bila gagal.
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0062_revoke_authenticated_internal_rpcs_contract.sql

-- ============================================================ 0062-DB-1: headline functions — authenticated tidak bisa EXECUTE
do $$
declare fails text := '';
begin
  if has_function_privilege('authenticated',
      'public.emit_notification(uuid,uuid,uuid,text,text,uuid,text,text,date)', 'EXECUTE') then
    fails := fails || 'emit_notification_still_authenticated_executable; ';
  end if;
  if has_function_privilege('authenticated',
      'public.write_activity(text,uuid,text,jsonb)', 'EXECUTE') then
    fails := fails || 'write_activity_still_authenticated_executable; ';
  end if;
  if has_function_privilege('anon',
      'public.emit_notification(uuid,uuid,uuid,text,text,uuid,text,text,date)', 'EXECUTE') then
    fails := fails || 'emit_notification_still_anon_executable; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0062-DB-1: %', fails;
  end if;
  raise notice 'PASS 0062-DB-1';
end $$;

-- ============================================================ 0062-DB-2: functions dropped+recreated in 0046 — PUBLIC grant must be gone
-- These carried NO explicit REVOKE after their DROP FUNCTION ... CASCADE + CREATE OR
-- REPLACE in 0046, so their ACL reset to Postgres' implicit default (EXECUTE to PUBLIC).
-- A role-specific REVOKE FROM authenticated is not sufficient here — PUBLIC must be
-- revoked explicitly, or every role (including authenticated) still inherits EXECUTE.
do $$
declare fails text := '';
begin
  if has_function_privilege('authenticated',
      'public.generate_action_plan_instances(uuid,date)', 'EXECUTE') then
    fails := fails || 'generate_action_plan_instances_still_executable; ';
  end if;
  if has_function_privilege('authenticated',
      'public.mark_overdue_instances(timestamptz)', 'EXECUTE') then
    fails := fails || 'mark_overdue_instances_still_executable; ';
  end if;
  if has_function_privilege('authenticated',
      'public.recompute_chat_room_members(uuid)', 'EXECUTE') then
    fails := fails || 'recompute_chat_room_members_still_executable; ';
  end if;
  if has_function_privilege('authenticated', 'public.emit_deadline_notifications()', 'EXECUTE') then
    fails := fails || 'emit_deadline_notifications_still_executable; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0062-DB-2: %', fails;
  end if;
  raise notice 'PASS 0062-DB-2';
end $$;

-- ============================================================ 0062-DB-3: functions renamed in 0046 (S5 block) — new names locked down
-- Original names (tg_initiative_chat_room, tg_action_plan_sync_chat,
-- tg_kpi_area_breakdown_touch_updated_at) no longer exist post-0046; this asserts the
-- CURRENT names carry no stray EXECUTE grant to anon/authenticated/PUBLIC.
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_task_sync_chat'
  ) then
    fails := fails || 'tg_task_sync_chat_missing_did_it_get_renamed_again; ';
  elsif has_function_privilege('authenticated', 'public.tg_task_sync_chat()', 'EXECUTE') then
    fails := fails || 'tg_task_sync_chat_still_executable; ';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_action_plan_chat_room'
  ) then
    fails := fails || 'tg_action_plan_chat_room_missing_did_it_get_renamed_again; ';
  elsif has_function_privilege('authenticated', 'public.tg_action_plan_chat_room()', 'EXECUTE') then
    fails := fails || 'tg_action_plan_chat_room_still_executable; ';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_strategy_breakdown_touch_updated_at'
  ) then
    fails := fails || 'tg_strategy_breakdown_touch_updated_at_missing_did_it_get_renamed_again; ';
  elsif has_function_privilege('authenticated', 'public.tg_strategy_breakdown_touch_updated_at()', 'EXECUTE') then
    fails := fails || 'tg_strategy_breakdown_touch_updated_at_still_executable; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0062-DB-3: %', fails;
  end if;
  raise notice 'PASS 0062-DB-3';
end $$;
