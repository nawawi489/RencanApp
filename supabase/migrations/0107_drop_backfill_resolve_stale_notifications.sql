-- 0106_drop_backfill_resolve_stale_notifications.sql — Sprint 2, S2-2.
--
-- WHY: `public.backfill_resolve_stale_notifications()` was a one-shot data
-- backfill introduced by 0040 (line 403 there invokes it in the same
-- transaction as its creation). It performs FOUR unfiltered UPDATEs across
-- `public.notifications` with zero authorization and no tenant guard. Migration
-- 0105 stripped its PUBLIC/anon EXECUTE grant, but leaving the function alive
-- keeps a live cross-tenant mass-write vector accessible to any future ACL
-- regression (see memory `anon-public-rpc-grant-gotcha`).
--
-- FIX: Drop the function. The backfill it performs has already run at 0040
-- application time; there is no schedule or callsite that legitimately needs
-- to invoke it again. If a future backfill is genuinely required, the correct
-- shape is a fresh migration whose body inlines the necessary UPDATEs (which
-- makes the effect reviewable in the PR), not a durable RPC.
--
-- Contract: supabase/tests/0106_drop_backfill_resolve_stale_notifications_contract.sql

drop function if exists public.backfill_resolve_stale_notifications();

-- Post-condition: function must not exist in pg_proc.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'backfill_resolve_stale_notifications';

  if v_count > 0 then
    raise exception '0106 post-condition failed: backfill_resolve_stale_notifications still exists (% overloads)', v_count;
  end if;
end $$;
