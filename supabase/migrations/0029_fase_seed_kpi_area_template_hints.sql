-- 0029 — Seed `target_hint` + `expected_outcome_hint` untuk 19 KPI Area Template PRD §47-48.
--
-- Idempotent: hanya mengisi baris yang `target_hint IS NULL` AND `expected_outcome_hint IS NULL`.
-- Admin tetap bisa override lewat UI/RPC; seed ini cuma starting point yang sopan.
-- Bahasa Indonesia; tidak prescribed angka — beri pola yang user tinggal sesuaikan.

with hints as (
  select * from (values
    -- ====== Omset ======
    ('Menambah Jumlah Customer',
      'Naikkan jumlah customer aktif sebesar X% YoY',
      'Pertumbuhan customer baru terlihat di laporan akuisisi bulanan'),
    ('Meningkatkan Basket Size',
      'Naikkan rata-rata transaksi per customer ke nilai Rp X',
      'Basket size rata-rata meningkat di POS report bulanan'),
    ('Meningkatkan Output Produk',
      'Naikkan output produksi ke X unit per periode',
      'Output produksi konsisten di atas baseline tanpa naik reject rate'),
    ('Meningkatkan Produktivitas',
      'Naikkan output per orang/jam ke X dari baseline saat ini',
      'Produktivitas naik tanpa menambah headcount'),
    ('Ketersediaan Arus Kas yang Memadai',
      'Jaga saldo kas operasional minimum Rp X sepanjang periode',
      'Kas operasional selalu di atas threshold; tidak ada pinjaman talangan'),
    ('A/R Collection',
      'Turunkan DSO (Days Sales Outstanding) ke X hari',
      'A/R aging > 30 hari di bawah X% dari total A/R'),
    ('Meningkatkan Kompetensi Karyawan',
      'X% karyawan menuntaskan program upskilling utama periode ini',
      'Skill assessment naik minimal 1 tingkat untuk X karyawan'),
    ('Ketersediaan Karyawan (MPP)',
      'Penuhi MPP ≥X% di semua posisi kritikal',
      'Tidak ada vacant kritikal lebih dari Y hari'),
    ('Menambah Jumlah Cabang Baru',
      'Buka X cabang baru di lokasi strategis',
      'Cabang baru operasional + revenue first month di atas target'),
    ('Menciptakan Produk / Brand Baru',
      'Luncurkan X produk/brand baru ke pasar',
      'Produk launching + adoption rate ≥Y dalam Z bulan pertama'),
    -- ====== Profit ======
    ('Increase Sales Price',
      'Naikkan harga jual rata-rata X% tanpa turunkan volume signifikan',
      'Margin per unit naik; volume turun < Y%'),
    ('Minimize Budget',
      'Turunkan budget non-esensial X% dari baseline',
      'Pengeluaran non-esensial konsisten di bawah cap; tidak ganggu eksekusi'),
    ('Menurunkan OPEX',
      'Turunkan OPEX X% YoY dari kategori prioritas',
      'OPEX bulanan stabil di bawah baseline; SLA ops terjaga'),
    ('Menurunkan Komplain Pelanggan',
      'Turunkan jumlah komplain valid ke X per bulan',
      'NPS naik / Komplain valid turun konsisten 3 bulan'),
    ('Control Budgeting',
      'Realisasi anggaran di kisaran ±X% dari budget per bulan',
      'Variance bulanan ≤ X%; tidak ada over-budget kategori utama'),
    ('Mengurangi Biaya Lembur',
      'Turunkan jam lembur X% YoY dari baseline',
      'Total OT cost turun; produktivitas dalam jam reguler stabil'),
    ('Menurunkan Turnover',
      'Turnover karyawan kunci ≤X% per tahun',
      'Retention key talent ≥Y%; exit interview rendah karena alasan controllable'),
    ('Ketersediaan Pendanaan Ekspansi Outlet Baru',
      'Amankan komitmen pendanaan Rp X untuk ekspansi periode ini',
      'Dana committed sudah ada; tidak ada gap funding di milestone kritikal'),
    ('Efisiensi Biaya Ekspansi',
      'Capex ekspansi per outlet ≤Rp X (di bawah benchmark)',
      'Biaya per outlet baru di bawah target; payback period sesuai rencana')
  ) as t (name, target_hint, expected_outcome_hint)
)
update public.kpi_area_templates k
   set target_hint = h.target_hint,
       expected_outcome_hint = h.expected_outcome_hint
  from hints h
 where k.name = h.name
   and k.target_hint is null
   and k.expected_outcome_hint is null;
