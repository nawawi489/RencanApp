-- Perketat event-trigger function bawaan project `rls_auto_enable`
-- (otomatis mengaktifkan RLS pada tabel baru di schema public).
-- Dipicu oleh event DDL, bukan RPC — tidak ada role yang perlu EXECUTE.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
