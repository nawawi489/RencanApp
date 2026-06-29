-- 0025 — Wajib field PRD V1.8.2 yang belum ada di schema:
--   §18 KPI Area  : "Ekspektasi Hasil" (UI-S-K03)
--   §21 Initiative: "Tim"              (UI-S-I01) → FK ke teams(id) dari fase 8 (0014)
--   §22 Action Plan: "Jam Deadline"    → tambah deadline_time HH:MM (non-repeat path tetap butuh time)
--
-- Catatan:
--   - Semua kolom NULL-able di V1 supaya Draft yang sudah ada tidak melanggar; UI menegakkan wajib
--     di save/activate. Gate trigger di RPC aktivasi bisa ditambah follow-up bila perlu.
--   - team_id ON DELETE SET NULL — kalau team dinonaktifkan, Initiative tetap hidup tanpa team.

alter table public.kpi_areas
  add column if not exists expected_outcome text;

alter table public.initiatives
  add column if not exists team_id uuid references public.teams(id) on delete set null;

create index if not exists idx_initiatives_team on public.initiatives(team_id);

alter table public.action_plans
  add column if not exists deadline_time text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'action_plans_deadline_time_format'
  ) then
    alter table public.action_plans
      add constraint action_plans_deadline_time_format
      check (deadline_time is null or deadline_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end$$;
