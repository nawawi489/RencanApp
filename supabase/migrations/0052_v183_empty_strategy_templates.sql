-- =====================================================================
-- 0052_v183_empty_strategy_templates.sql
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
--   2. Contract test `supabase/tests/fase4_performance_workspace_
--      contract.sql` TEST 1 (baris 37-46) masih meng-assert seed 10/9
--      pakai nama lama `kpi_area_templates` (broken post-0045 rename
--      juga). Perlu di-invert ke `count(*)=0` + rename tabel.
--   3. `apply_goal_template` RPC di-DROP di 0046:132 dan tidak
--      di-recreate — `mobile/src/lib/goals.ts:123` calls a dead
--      function. Bukan bug V1.83 tapi ekosistem Goal Template memang
--      sudah rusak sebelum ini.

begin;

-- Hapus 19 baris seed default (10 Omset + 9 Profit) per PRD V1.82 §47-48.
-- WHERE selektif berdasarkan goal_template.key + nama PRD PASTI —
-- baris admin custom (nama non-PRD) tidak tersentuh.
delete from public.strategy_templates
where (goal_template_id, name) in (
  select gt.id, x.name
  from (values
    -- §47 Omset (10 items)
    ('omset',  'Menambah Jumlah Customer'),
    ('omset',  'Meningkatkan Basket Size'),
    ('omset',  'Meningkatkan Output Produk'),
    ('omset',  'Meningkatkan Produktivitas'),
    ('omset',  'Ketersediaan Arus Kas yang Memadai'),
    ('omset',  'A/R Collection'),
    ('omset',  'Meningkatkan Kompetensi Karyawan'),
    ('omset',  'Ketersediaan Karyawan (MPP)'),
    ('omset',  'Menambah Jumlah Cabang Baru'),
    ('omset',  'Menciptakan Produk / Brand Baru'),
    -- §48 Profit (9 items)
    ('profit', 'Increase Sales Price'),
    ('profit', 'Minimize Budget'),
    ('profit', 'Menurunkan OPEX'),
    ('profit', 'Menurunkan Komplain Pelanggan'),
    ('profit', 'Control Budgeting'),
    ('profit', 'Mengurangi Biaya Lembur'),
    ('profit', 'Menurunkan Turnover'),
    ('profit', 'Ketersediaan Pendanaan Ekspansi Outlet Baru'),
    ('profit', 'Efisiensi Biaya Ekspansi')
  ) as x (tkey, name)
  join public.goal_templates gt on gt.key = x.tkey
);

-- Sanity notice.
do $$
declare
  n int;
  n_default int;
begin
  select count(*) into n from public.strategy_templates;
  select count(*) into n_default
    from public.strategy_templates st
    join public.goal_templates gt on gt.id = st.goal_template_id
    where gt.key in ('omset', 'profit');
  raise notice '0052: strategy_templates total rows = %, default (omset/profit) rows = % (should be 0)',
    n, n_default;
end $$;

commit;
