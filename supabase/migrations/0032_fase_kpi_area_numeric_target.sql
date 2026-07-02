-- 0032 — KPI Area numeric target + unit (owner override PRD §18, 2026-06-29).
--
-- Konteks: PRD V1.8.2 §18 sengaja TANPA Satuan ("Satuan membuat UI terasa seperti spreadsheet")
--   dan target disimpan teks bebas (kpi_areas.target). Owner meng-override (2026-06-29) untuk
--   membuka "% gap" presisi seperti prototype design ("65% / kurang 1.060 customer"). PRD §18
--   diperbarui agar truth tetap konsisten (lihat PRD_EMS_V1.82_Rencanaapp.md §18).
--
-- Yang dibangun:
--   - kpi_areas.target_numeric numeric(20,4) NULL → basis angka untuk hitung % capaian vs target.
--                                 NULL = KPI kualitatif (tetap pakai teks `target`), tak dihitung %.
--   - kpi_areas.target_unit text NULL            → satuan tampilan (mis. "customer", "Rp").
--   - CHECK target_numeric >= 0.
--   - Backward compatible: kolom lama `target` (teks) DIPERTAHANKAN untuk KPI kualitatif & display.
--
-- RLS: tidak ada policy baru. Kolom ikut row-level policy kpi_areas yang sudah ada
--   (SELECT/INSERT/UPDATE). % capaian dihitung di klien dari VIEW kpi_area_current_values
--   (numeric_total) ÷ target_numeric.

alter table public.kpi_areas
  add column if not exists target_numeric numeric(20,4);

alter table public.kpi_areas
  add column if not exists target_unit text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kpi_areas_target_numeric_nonneg'
  ) then
    alter table public.kpi_areas
      add constraint kpi_areas_target_numeric_nonneg
      check (target_numeric is null or target_numeric >= 0);
  end if;
end$$;
