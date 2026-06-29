-- 0027 — Dua field PRD V1.8.2 yang masih kosong di schema:
--
--   §18 step 5: "Setelah template dipilih, Nama KPI Area, PIC rekomendasi, Target awal, dan
--               Ekspektasi Hasil terisi otomatis."
--               → Schema `kpi_area_templates` baru punya `name`; tambah `target_hint` + `expected_outcome_hint`.
--   §22.5     : "Bukti yang diminta" sebagai field WAJIB DESKRIPSI (apa bukti yang diminta), bukan
--               sekadar toggle `evidence_required`. Tambah `action_plans.evidence_description text`.
--
-- Catatan: kolom hint NULL-able; baris seed lama tetap valid (picker hanya prefill bila non-null).
-- evidence_description NULL-able juga; activate gate per field bisa di-extend follow-up.

alter table public.kpi_area_templates
  add column if not exists target_hint text,
  add column if not exists expected_outcome_hint text;

alter table public.action_plans
  add column if not exists evidence_description text;
