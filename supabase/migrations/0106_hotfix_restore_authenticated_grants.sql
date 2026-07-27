-- 0106_hotfix_restore_authenticated_grants.sql — pulihkan EXECUTE untuk
-- `authenticated` yang secara tidak sengaja ikut tercabut oleh 0105, tanpa
-- membuka fungsi internal yang sengaja definer-only.
--
-- WHY: 0105 me-REVOKE EXECUTE dari PUBLIC + anon untuk 44 fungsi dengan asumsi
-- setiap fungsi yang harus tetap end-user-callable sudah punya
-- `GRANT EXECUTE ... TO authenticated` eksplisit. Asumsi itu SALAH untuk >=11
-- fungsi (helper predikat spt goal_has_my_descendant + RPC bisnis spt
-- cancel_card/archive_card/create_comment) — mereka bergantung pada PUBLIC
-- sebagai satu-satunya jalur ke authenticated. Akibatnya: klien authenticated
-- mendapat "permission denied for function <X>" di jalur SECURITY INVOKER.
--
-- FIX: grant EXECUTE ke `authenticated` untuk setiap fungsi public, KECUALI:
--   • trigger functions (`tg_*` + `set_updated_at`) — dipanggil trigger system.
--   • fungsi internal definer-only yang dijaga oleh kontrak lain
--     (0043/0057/0066/0078/0081/0083/0090). Deny-list di bawah = sumber
--     kebenaran; tambah entry baru bila ada kontrak baru yg assert
--     "authenticated should NOT have EXECUTE on X".
--
-- Grant ke `authenticated` TIDAK menembus ke PUBLIC/anon → invarian 0105 tetap.
--
-- IDEMPOTENT: bila 0106 versi awal (blanket-grant tanpa deny-list) sudah pernah
-- di-apply ke staging DB, tail REVOKE block di bawah menarik ulang grants yang
-- salah masuk. REVOKE pada fungsi yg belum di-grant = no-op (WARNING, bukan
-- error).

do $$
declare
  r record;
  v_deny text[] := array[
    'purge_old_activity_logs',       -- 0043 audit purge (service_role only)
    'emit_chat_system_event',        -- 0057 trigger emitter
    'emit_notification',             -- 0066 internal notification writer
    'write_activity',                -- 0066 internal audit writer
    'generate_action_plan_instances',-- 0066 cron worker
    'mark_overdue_instances',        -- 0066 cron worker
    'recompute_chat_room_members',   -- 0066 background reconciler
    'emit_deadline_notifications',   -- 0066 cron worker
    'enforce_card_completion_rule',  -- 0078 trigger enforcer
    'emit_period_closing_reminders', -- 0081 cron worker
    'handle_new_user',               -- 0083 auth trigger handler
    'claim_push_deliveries',         -- 0090 push drainer (service_role only)
    'bump_push_delivery_backoff'     -- 0090 push drainer (service_role only)
  ];
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname not like 'tg\_%' escape '\'
      and p.proname <> 'set_updated_at'
      and not (p.proname = ANY(v_deny))
  loop
    execute format('grant execute on function public.%I(%s) to authenticated',
                   r.proname, r.args);
  end loop;
end $$;

-- Cleanup: bila 0106 versi awal (blanket-grant) sudah men-grant fungsi
-- deny-list, tarik ulang. Idempoten — no-op kalau grant memang tidak ada.
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'purge_old_activity_logs','emit_chat_system_event','emit_notification',
        'write_activity','generate_action_plan_instances','mark_overdue_instances',
        'recompute_chat_room_members','emit_deadline_notifications',
        'enforce_card_completion_rule','emit_period_closing_reminders',
        'handle_new_user','claim_push_deliveries','bump_push_delivery_backoff'
      )
  loop
    execute format('revoke execute on function public.%I(%s) from authenticated',
                   r.proname, r.args);
  end loop;
end $$;

-- Re-assert invarian 0105.
do $$
declare v_remaining integer;
begin
  select count(*) into v_remaining
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (has_function_privilege('public', p.oid, 'EXECUTE')
       or has_function_privilege('anon',   p.oid, 'EXECUTE'));
  if v_remaining > 0 then
    raise exception '0106 post-condition failed: % public function(s) still callable by anon/public', v_remaining;
  end if;
end $$;
