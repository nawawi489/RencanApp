-- 0042 — Index kronologis-per-organisasi untuk activity_logs.
--
-- Latar: activity_logs (Fase 1, migration 0005) menampung SEMUA audit RPC mutasi
-- (94 pemanggilan write_activity di 22 migrasi). Tabel append-only tanpa retensi,
-- tumbuh linear seiring pemakaian. Index existing `idx_activity_logs_entity`
-- (entity_type, entity_id) hanya menutup lookup per-entity. Pola baca kedua —
-- daftar kronologis-per-organisasi (activity_governance.ts::listActivityLogs +
-- listGovernanceViolations, dipakai halaman audit admin) — tidak beririsan dgn
-- index itu. Tanpa index baru: seq scan penuh tiap render, biaya proporsional
-- terhadap total baris seluruh org lalu difilter RLS.
--
-- Ordering `created_at DESC` cocok dgn ORDER BY .. DESC LIMIT n di pemakai, jadi
-- Postgres bisa memakai index-only backward scan (tanpa sort tambahan).
--
-- Aman: penambahan index, tidak menyentuh data / RLS / RPC / policy. `IF NOT
-- EXISTS` menjaga idempotensi (rerun migrate up tidak error).

create index if not exists idx_activity_logs_org_created
  on public.activity_logs (organization_id, created_at desc);
