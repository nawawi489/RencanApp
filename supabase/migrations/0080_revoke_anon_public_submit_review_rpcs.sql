-- =============================================================================
-- 0080_revoke_anon_public_submit_review_rpcs.sql
-- =============================================================================
-- PORT dari `main` 0071_revoke_anon_public_rpcs.sql (#102) ke `staging`.
--
-- Konteks: #102 mencabut EXECUTE PUBLIC/anon dari 9 RPC user-facing SECURITY
-- DEFINER. Di `staging`, 5 di antaranya sudah tertutup migrasi 0078
-- (activate_goal, activate_strategy, activate_action_plan, activate_initiative,
-- apply_goal_template). Empat sisanya — submit/review — tidak pernah punya
-- statement GRANT/REVOKE apa pun di seluruh migrasi `staging`.
--
-- Akar masalah (dari #102): migrasi 0046 melakukan `DROP FUNCTION ... CASCADE`
-- lalu membuat ulang fungsi-fungsi ini, yang me-reset ACL ke default implisit
-- Postgres (EXECUTE ke PUBLIC). PostgREST me-resolve PUBLIC untuk role `anon`
-- juga, sehingga pemanggil tak terautentikasi bisa meng-invoke lewat
-- `supabase.rpc(...)`. Keempatnya SECURITY DEFINER dan mengubah state, jadi
-- eksposur anon = write primitive, bukan sekadar kebocoran informasi.
--
-- CATATAN PENTING — migrasi ini NO-OP terhadap DB staging saat ditulis.
-- Verifikasi `pg_proc.proacl` pada project staging (2026-07-20) menunjukkan
-- kesembilan fungsi SUDAH beracl `postgres=X/postgres | authenticated=X/postgres`
-- tanpa PUBLIC — fix #102 tampaknya pernah diterapkan langsung ke DB staging
-- tanpa file migrasi pendampingnya (pola yang sama dengan catatan "CI tidak
-- menjalankan db push"). Jadi ini menutup DRIFT, bukan lubang yang sedang aktif:
-- tanpa file ini, environment mana pun yang dibangun dari migrasi (dev lokal,
-- branch DB baru, bootstrap prod) tetap mewarisi PUBLIC EXECUTE, dan tidak ada
-- apa pun di repo yang memulihkan revoke bila `DROP FUNCTION ... CASCADE`
-- terjadi lagi.
--
-- Seperti #102 (dan berbeda dari 0066 yang mencabut fungsi internal/trigger
-- dari `authenticated` juga): keempat fungsi ini RPC user-facing yang sah —
-- `authenticated` WAJIB tetap punya EXECUTE. Hanya eksposur PUBLIC/anon yang bug.
-- Karena `authenticated` sebelumnya mendapat akses murni lewat grant PUBLIC,
-- revoke tanpa grant eksplisit akan mematikan aplikasi, bukan hanya anon.
--
-- Setelah migrasi ini:
--   * `supabase.rpc(...)` sebagai `anon` ke-4 fungsi ini → permission denied (42501).
--   * Pemanggilan sebagai user terautentikasi tetap berjalan seperti semula
--     (RLS / cek `auth.uid()` di dalam body tidak berubah).
-- =============================================================================

-- 0046: reviewer memutuskan submission task / task-instance
REVOKE EXECUTE ON FUNCTION public.review_task_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_task_submission(uuid, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_task_instance_submission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_task_instance_submission(uuid, text, text) TO authenticated;

-- 0046: PIC memfinalisasi draft submission task / task-instance
REVOKE EXECUTE ON FUNCTION public.submit_task(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_task(uuid, text, jsonb, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_task_instance(uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_task_instance(uuid, text, jsonb, jsonb) TO authenticated;
