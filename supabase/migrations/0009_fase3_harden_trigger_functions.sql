-- EMS V1.8.1 — Fase 3 hardening: fungsi trigger tidak boleh dipanggil langsung via REST.
--
-- Diterapkan ke DB sebagai migrasi terpisah `fase3_harden_trigger_functions`
-- (version 20260624104539) setelah `fase3_collab`. Dipisah ke file 0009 agar file repo
-- sejajar 1:1 dengan riwayat migrasi remote (schema_migrations).
--
-- Sebab: fungsi trigger SECURITY DEFINER tanpa argumen terekspos sebagai endpoint
-- /rest/v1/rpc/<name> (advisor 0028/0029). Mereka HANYA dipicu oleh trigger, jadi
-- tidak ada role yang perlu EXECUTE. Idempoten.

revoke execute on function public.tg_initiative_chat_room() from public, anon, authenticated;
revoke execute on function public.tg_action_plan_sync_chat() from public, anon, authenticated;
revoke execute on function public.tg_governance_warning() from public, anon, authenticated;
