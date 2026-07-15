-- =====================================================================
-- 0059_v183_empty_strategy_templates.sql
-- =====================================================================
-- V1.83 §19: "Strategy Template kosong secara default. Sistem tidak
-- menyediakan template bawaan berbasis industri, divisi, atau jenis
-- target tertentu. Alasan: EMS harus bisa dipakai lintas industri."
--
-- Migrasi 0010:472-501 sebelumnya seed 19 template bawaan (10 Omset per
-- PRD V1.82 §47 + 9 Profit per §48) di tabel `kpi_area_templates`
-- (rename ke `strategy_templates` di 0045). V1.83 mencabut daftar
-- tersebut — daftar contoh V1.82 dianggap terlalu opinionated dan
-- mengarahkan struktur perusahaan tertentu.
--
-- Migrasi 0029 sebelumnya juga menambahkan `target_hint` +
-- `expected_outcome_hint` ke 19 baris tersebut. DELETE di sini otomatis
-- membersihkan hints juga (hints kolomnya di tabel yang sama).
--
-- Idempotent: DELETE aman dijalankan berulang (0 rows kalau sudah
-- kosong). Idempotent juga terhadap admin yang sudah menambah template
-- custom pasca-V1.83 — WHERE clause selektif hanya menghapus baris seed
-- (yang terikat ke goal_templates omset/profit + nama PRD §47-48).
--
-- Safety:
--   - `strategies.strategy_template_id` tidak eksis di schema (tidak
--     ada FK dari strategy ke template), jadi tidak ada risiko cascade.
--   - `goals.goal_template_id → goal_templates.id` = ON DELETE SET NULL
--     (0010:47), jadi kalau di masa depan goal_templates ikut dihapus
--     pun goal user aman.
--
-- Preserved DI migrasi ini (out of scope):
--   1. `goal_templates` (omset/profit) TIDAK dihapus. V1.83 §17 New
--      Goal tidak eksplisit menuntut hapus; keputusan owner terpisah.
--      Konsekuensi: Menu → Template → Goal Template masih menampilkan
--      2 entri, tapi Strategy Template picker di dalamnya akan kosong.
--
-- CORRECTION (post-review, lihat wiki/log.md): klaim awal migrasi ini bahwa
-- `apply_goal_template` adalah dead function TIDAK BENAR. RPC itu di-DROP
-- lalu langsung di-CREATE OR REPLACE lagi di 0046:430 — hidup, dan dipanggil
-- dari `mobile/src/lib/goals.ts:114` via tombol live "Buat Goal dari
-- Template" (`settings-goal-templates.tsx` → `goal-wizard.tsx`). Body RPC-nya
-- `INSERT INTO strategies ... SELECT ... FROM strategy_templates WHERE
-- goal_template_id = ...` — begitu tabel ini kosong, RPC tetap sukses tapi
-- menghasilkan Goal dengan NOL Strategy turunan, tanpa error. Ini bukan bug
-- RPC (INSERT ... SELECT dari 0 baris memang valid), tapi behavior-nya harus
-- eksplisit, bukan diam-diam:
--   - `goal-wizard.tsx` step 2 sekarang menampilkan catatan saat
--     kpiTemplates kosong, menjelaskan Goal akan dibuat tanpa Strategy.
--   - Contract test TEST 1 di `fase4_performance_workspace_contract.sql`
--     sudah diperbaiki (nama tabel + assert count=0). TEST 4 & TEST 6 di
--     file yang sama JUGA meng-assert count=10 dari apply_goal_template dan
--     sudah diupdate ke count=0 — tapi keduanya (plus TEST 3, TEST 5) masih
--     tidak bisa dieksekusi karena referensi tabel pre-rename `kpi_areas`
--     yang sudah tidak ada sejak 0045 (debt terpisah, di luar scope migrasi
--     ini — lihat komentar di masing-masing TEST).

begin;

-- Hapus 19 baris seed default (10 Omset + 9 Profit) per PRD V1.82 §47-48.
-- WHERE selektif berdasarkan goal_template.key + division + nama PRD PASTI
-- (3-tuple, cocok dengan unique key asli `(goal_template_id, division, name)`
-- di 0010:35) — baris admin custom (nama non-PRD, atau nama PRD yang
-- di-reuse di division LAIN) tidak tersentuh.
delete from public.strategy_templates
where (goal_template_id, division, name) in (
  select gt.id, x.division, x.name
  from (values
    -- §47 Omset (10 items)
    ('omset',  'cmo',  'Menambah Jumlah Customer'),
    ('omset',  'cmo',  'Meningkatkan Basket Size'),
    ('omset',  'coo',  'Meningkatkan Output Produk'),
    ('omset',  'coo',  'Meningkatkan Produktivitas'),
    ('omset',  'cfo',  'Ketersediaan Arus Kas yang Memadai'),
    ('omset',  'cfo',  'A/R Collection'),
    ('omset',  'chro', 'Meningkatkan Kompetensi Karyawan'),
    ('omset',  'chro', 'Ketersediaan Karyawan (MPP)'),
    ('omset',  'cbo',  'Menambah Jumlah Cabang Baru'),
    ('omset',  'cbo',  'Menciptakan Produk / Brand Baru'),
    -- §48 Profit (9 items)
    ('profit', 'cmo',  'Increase Sales Price'),
    ('profit', 'cmo',  'Minimize Budget'),
    ('profit', 'coo',  'Menurunkan OPEX'),
    ('profit', 'coo',  'Menurunkan Komplain Pelanggan'),
    ('profit', 'cfo',  'Control Budgeting'),
    ('profit', 'chro', 'Mengurangi Biaya Lembur'),
    ('profit', 'chro', 'Menurunkan Turnover'),
    ('profit', 'cbo',  'Ketersediaan Pendanaan Ekspansi Outlet Baru'),
    ('profit', 'cbo',  'Efisiensi Biaya Ekspansi')
  ) as x (tkey, division, name)
  join public.goal_templates gt on gt.key = x.tkey
);

-- Sanity notice.
do $$
declare
  n_default int;
begin
  select count(*) into n_default
    from public.strategy_templates st
    join public.goal_templates gt on gt.id = st.goal_template_id
    where gt.key in ('omset', 'profit');
  raise notice '0059: default (omset/profit) strategy_templates rows = % (should be 0)', n_default;
end $$;

commit;
