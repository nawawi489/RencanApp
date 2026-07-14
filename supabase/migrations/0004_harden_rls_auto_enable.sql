-- Perketat event-trigger function bawaan project `rls_auto_enable`
-- (otomatis mengaktifkan RLS pada tabel baru di schema public).
-- Dipicu oleh event DDL, bukan RPC — tidak ada role yang perlu EXECUTE.
--
-- Cold-start safety (2026-07-11): function ini dibuat via Supabase Studio project template,
-- bukan migrasi kita. Pada volume kosong, function belum ada saat migration ini apply.
-- REVOKE dibungkus DO/IF EXISTS agar cold-start tidak gagal; ketika function ada
-- (kondisi normal), REVOKE tetap dijalankan.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public, anon, authenticated;
  END IF;
END $$;
