-- 0030 — UI-S-PR1 Problem Statement: Dampak + Bukti awal (PRD §15 metadata "Dampak follow up hilang"
--                                     + design.html prototype 9 "Dampak: High/Med/Low" + "Bukti awal").
--
--   problem_statements.impact text CHECK ('high','medium','low')
--   problem_statements.initial_evidence text   — deskripsi/link bukti awal mengapa problem ini real
--
-- NULL-able. Form menegakkan wajib di save (V1); gate aktivasi bisa di-extend follow-up.

alter table public.problem_statements
  add column if not exists impact text,
  add column if not exists initial_evidence text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'problem_statements_impact_valid'
  ) then
    alter table public.problem_statements
      add constraint problem_statements_impact_valid
      check (impact is null or impact in ('high', 'medium', 'low'));
  end if;
end$$;
