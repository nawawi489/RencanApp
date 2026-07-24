-- 0099 — fix compute_development_contribution: initiatives → action_plans (V1.8.3 rename-miss)
--
-- Regresi rename V1.8.3 (0045): tabel lama `initiatives` (punya problem_statement_id) di-RENAME
-- menjadi `action_plans`; tabel `initiatives` yang sekarang = tabel lama `strategies` (kolom
-- strategy_id, TANPA problem_statement_id). 0046 (rewrite bodies) MELEWATKAN fungsi ini, jadi ia
-- masih query `public.initiatives.problem_statement_id` → ERROR "column does not exist" saat dipanggil.
--
-- Dampak: calculate_period_scores THROW untuk user dengan formula memuat 'development_contribution'
-- (mis. formula org 63dde287…). Terverifikasi di staging: pemanggilan fungsi ini melempar
-- `42703 column "problem_statement_id" does not exist`.
--
-- Perbaikan minimal & faithful terhadap intent 0013 D8 ("Development Contribution = Initiative
-- dengan problem_statement_id non-null & pic_id=user"; 'Initiative' lama == 'action_plan' sekarang):
-- ganti sumber tabel `public.initiatives` → `public.action_plans`. Logika lain TIDAK berubah.

create or replace function public.compute_development_contribution(p_user uuid, p_org uuid, p_start date, p_end date)
returns numeric
language sql stable security definer set search_path to '' as $function$
  with dev_init as (
    select status from public.action_plans
    where pic_id = p_user and organization_id = p_org
      and problem_statement_id is not null
      and status <> 'archived'
  )
  select round(coalesce(100.0 *
    (count(*) filter (where status='done'))::numeric
    / nullif(count(*), 0), 0), 2)
  from dev_init;
$function$;

-- Posture grant asli (0013): fungsi internal, dipanggil hanya oleh calculate_period_scores (definer).
revoke execute on function public.compute_development_contribution(uuid, uuid, date, date) from public, anon, authenticated;
