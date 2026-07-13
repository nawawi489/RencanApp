-- Perketat event-trigger function bawaan project `rls_auto_enable`
-- (otomatis mengaktifkan RLS pada tabel baru di schema public).
-- Dipicu oleh event DDL, bukan RPC — tidak ada role yang perlu EXECUTE.
do $$ begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
