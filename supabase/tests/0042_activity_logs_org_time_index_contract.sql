-- Migration 0042 — index (organization_id, created_at DESC) untuk pola baca
-- kronologis-per-organisasi (activity log panel + governance violation admin).
-- Tanpa index ini, seq scan tumbuh linear seiring pertambahan audit row (RPC mutasi
-- selalu menulis 1 row → tabel append-only tanpa retensi).
--
-- Pola fase7: `raise notice 'PASS'` bila lolos, `raise exception 'FAIL: ...'` bila gagal.
-- Jalankan (butuh role postgres/owner):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0042_activity_logs_org_time_index_contract.sql

-- ============================================================ 0042-DB-1: index terpasang, urutan kolom benar
do $$
declare fails text := '';
begin
  -- Index harus ada di public.activity_logs.
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and tablename='activity_logs'
                   and indexname='idx_activity_logs_org_created') then
    fails := fails||'idx_activity_logs_org_created_missing; ';
  end if;

  -- Bentuknya WAJIB (organization_id, created_at DESC): jika salah urutan
  -- Postgres tak bisa memakainya untuk pola SELECT ... WHERE organization_id=$
  -- ORDER BY created_at DESC LIMIT n.
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and tablename='activity_logs'
                   and indexname='idx_activity_logs_org_created'
                   and indexdef ilike '%(organization_id, created_at desc)%') then
    fails := fails||'idx_activity_logs_org_created_wrong_shape; ';
  end if;

  if fails <> '' then
    raise exception 'FAIL 0042-DB-1: %', fails;
  end if;
  raise notice 'PASS 0042-DB-1';
end $$;

