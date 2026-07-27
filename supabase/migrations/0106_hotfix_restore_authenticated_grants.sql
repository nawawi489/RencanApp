-- 0106_hotfix_restore_authenticated_grants.sql — pulihkan EXECUTE untuk
-- `authenticated` yang secara tidak sengaja ikut tercabut oleh 0105.
--
-- WHY: 0105 me-REVOKE EXECUTE dari PUBLIC + anon untuk 44 fungsi. Asumsi
-- implisit: setiap fungsi yang harus tetap callable oleh end-user sudah punya
-- `GRANT EXECUTE ... TO authenticated` eksplisit dari migrasi historis. Asumsi
-- itu SALAH untuk >=11 fungsi (helper predikat spt goal_has_my_descendant +
-- beberapa RPC bisnis spt cancel_card/archive_card/create_comment) — mereka
-- bergantung pada PUBLIC sebagai satu-satunya jalur ke `authenticated`.
-- Akibatnya: setelah 0105, klien authenticated dapat "permission denied for
-- function <helper>" di jalur SECURITY INVOKER (mis. dari body fungsi
-- SECURITY INVOKER yang meng-`perform` helper SECDEF).
--
-- BUKTI EMPIRIS (CI PR #209 + staging DB):
--   • 0059:276     permission denied for function can_access_task
--   • 0067-DB-4    permission denied for function archive_card
--   • 0073-DB-7    permission denied for function apply_goal_template
--   • 0077 TEST2   permission denied for function goal_has_my_descendant
--   • 0078-bypass-S2  permission denied for function goal_has_my_descendant
--   • 0085         permission denied for function search_cards
--   • 0103-DB-5    permission denied for function goal_has_my_descendant
--   • 0104-DB-2    permission denied for function i_am_action_plan_pic
--   • 0105-DB-2    authenticated grant hilang di RPC bisnis (7 fungsi)
--   • close_period permission denied for function is_supervisor_of
--
-- FIX: grant EXECUTE ke `authenticated` untuk SEMUA fungsi di skema public,
-- kecuali trigger functions (tg_* + set_updated_at) yang dipanggil oleh trigger
-- system tanpa peduli grant. Grant ke `authenticated` TIDAK menembus ke
-- PUBLIC/anon → invarian 0105 (0 callable oleh anon) TETAP.
--
-- FUTURE-PROOF: migrasi berikutnya yang `CREATE OR REPLACE FUNCTION` di public
-- akan me-reset ACL ke default PUBLIC (memori [[anon-public-rpc-grant-gotcha]]).
-- Wajib re-run 0105+0106 (atau replikasi pola: revoke public/anon + grant
-- authenticated) di migrasi tersebut, dan contract 0105-DB-1 akan tripwire
-- kalau lupa.

do $$
declare r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname not like 'tg\_%' escape '\'
      and p.proname <> 'set_updated_at'
  loop
    execute format('grant execute on function public.%I(%s) to authenticated',
                   r.proname, r.args);
  end loop;
end $$;

-- Re-assert invarian 0105 (0 fungsi public callable oleh PUBLIC/anon).
-- Grant di atas ke `authenticated` tidak menembus, tapi kita verify eksplisit
-- supaya kegagalan langsung terlihat kalau ada yang salah (mis. seseorang
-- menambah `to public` di grant di masa depan).
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
