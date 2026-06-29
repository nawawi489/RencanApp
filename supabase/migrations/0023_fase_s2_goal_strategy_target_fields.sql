-- 0023 — UI-S-G01 + UI-S-S01 (PRD V1.8.2 §17, §20).
--
-- Konteks: form Goal & Strategy belum punya field wajib menurut PRD V1.8.2.
--   §17 New Goal     : field wajib termasuk "Target Tahunan" + "Tahun Goal".
--   §20 New Strategy : field wajib termasuk "Kontribusi Quarter".
--
-- Strategi storage:
--   - goals.target_value text   → free-form (selaras dgn kpi_areas.target text di 0010); satuan
--                                 tidak dipaksa (PRD §18 alasan: "Satuan membuat UI terasa seperti spreadsheet").
--   - Tahun Goal       → TIDAK butuh kolom baru. Form set period_start='YYYY-01-01' + period_end='YYYY-12-31'.
--                        Year derive di UI via EXTRACT(YEAR FROM period_start).
--   - strategies.contribution_pct numeric(6,3) NULL CHECK [0..100]
--                                 → Kontribusi Q% ke parent KPI Area utk quarter aktif Strategy.
--                                 NULL diizinkan agar Draft tidak melanggar; gate Σ=100% per sibling
--                                 set saat aktivasi (V1: validasi UI; enforce trigger ditunda S2 follow-up).
--
-- Catatan governance (scope-guardrails): contribution_pct di sini adalah BOBOT KONTRIBUSI PLANNING
-- (kontribusi Strategy ke output KPI Area), BUKAN bobot skor. Bobot skor tetap eksklusif di score_formula.

alter table public.goals
  add column if not exists target_value text;

alter table public.strategies
  add column if not exists contribution_pct numeric(6,3);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'strategies_contribution_pct_range'
  ) then
    alter table public.strategies
      add constraint strategies_contribution_pct_range
      check (contribution_pct is null or (contribution_pct >= 0 and contribution_pct <= 100));
  end if;
end$$;
