-- Fase 0: cabut EXECUTE eksplisit (Supabase memberi grant ke anon/authenticated by default).

-- handle_new_user: trigger function, tidak ada role yang perlu memanggilnya via RPC.
revoke execute on function public.handle_new_user() from anon, authenticated;

-- current_user_org: hanya dipakai authenticated saat evaluasi RLS; anon tidak perlu.
-- (Warning "authenticated dapat eksekusi" untuk fungsi ini memang disengaja —
--  helper RLS wajib SECURITY DEFINER agar policy profiles tidak rekursif.)
revoke execute on function public.current_user_org() from anon;
