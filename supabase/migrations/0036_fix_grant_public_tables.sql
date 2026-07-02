-- =============================================================================
-- 0036_fix_grant_public_tables.sql
-- =============================================================================
-- BUGFIX: Semua tabel public yang dibuat via custom migration tidak punya
-- GRANT untuk role `authenticated` dan `anon` — PostgREST auto-grant hanya
-- jalan untuk tabel yang dibuat via Supabase tracking (Studio / Dashboard).
-- Akibatnya SELECT/INSERT/UPDATE/DELETE ke tabel-tabel ini return 403.
--
-- Migration ini GRANT CRUD ke `authenticated` dan SELECT ke `anon` untuk
-- seluruh tabel di schema public (kecuali yang sudah benar). RLS policies
-- tetap yang menentukan baris mana yang boleh diakses.
-- =============================================================================

-- Grant CRUD ke authenticated di semua tabel public
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', r.tablename);
    execute format('GRANT SELECT ON TABLE public.%I TO anon', r.tablename);
    -- Sequence untuk serial PK (skip kalau tidak ada — UUID PK tidak punya sequence)
    begin
      execute format('GRANT USAGE, SELECT ON SEQUENCE public.%I_id_seq TO authenticated', r.tablename);
    exception
      when undefined_object then null;
      when undefined_table then null;
      when others then
        -- skip sequence grant kalau ada error lain
        raise notice 'Skipping sequence grant for %.id_seq: %', r.tablename, SQLERRM;
    end;
  end loop;
end$$;

-- Grant EXECUTE ke authenticated di semua function public (untuk RPC)
do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', r.proname, r.args);
    execute format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', r.proname, r.args);
  end loop;
end$$;
