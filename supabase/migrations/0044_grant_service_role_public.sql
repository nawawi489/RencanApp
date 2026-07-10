-- =============================================================================
-- 0044_grant_service_role_public.sql
-- =============================================================================
-- BUGFIX (turunan 0036): 0036 hanya menutup GRANT ke role `authenticated`/`anon`,
-- role `service_role` (dipakai Edge Function via SERVICE_ROLE_KEY → PostgREST)
-- tetap kosong untuk tabel-tabel yang dibuat via migrasi custom. Efek langsung
-- yang ditemukan oleh manual test ADM-16 (2026-07-10): audit log dari Edge
-- Function `create-user` gagal dengan 42501 "permission denied for table
-- activity_logs" — semua create user berhasil tetapi tidak tercatat di
-- activity_logs. Root cause identik dengan 0036, hanya beda role.
--
-- service_role diasumsikan "trusted server-side"; RLS bypass by default
-- (BYPASSRLS di setup Supabase). Migrasi ini menyelaraskan grant untuk semua
-- tabel + function public agar konsisten dengan konvensi Supabase.
-- =============================================================================

do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
      r.tablename
    );
    begin
      execute format(
        'GRANT USAGE, SELECT ON SEQUENCE public.%I_id_seq TO service_role',
        r.tablename
      );
    exception
      when undefined_object then null;
      when undefined_table then null;
    end;
  end loop;
end$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  end loop;
end$$;
