-- 0117 — Sprint 9 S9-6: search_cards pakai ILIKE + LIMIT agar indeks trigram terpakai.
--
-- Latar (audit 2026-07-26):
--   * `search_cards` (versi live di 0046) memakai `lower(name) LIKE v_q` di 7
--     cabang UNION ALL. Karena predikatnya `lower(name)`, indeks trigram GIN
--     yang dibangun di 0096 pada kolom `name` raw (`name extensions.gin_trgm_ops`)
--     tak akan pernah terpilih planner — semua cabang seq-scan.
--   * Tidak ada LIMIT di seluruh fungsi. Query dgn 3 huruf umum ("ana") bisa
--     mengembalikan ribuan baris jsonb dari 7 tabel → biaya jaringan besar.
--
-- Solusi (mirror pola search_global 0089):
--   * Ganti `lower(name) LIKE lower(...)` → `name ILIKE v_q_ci`, dengan v_q_ci
--     mempertahankan casing pengguna. Opclass `extensions.gin_trgm_ops` mendukung
--     ILIKE dan case-insensitive matching internally.
--   * Tambah parameter `p_limit int default 50` dengan cap keras 200. Rentang
--     ini generous untuk UI tipeahead (biasanya menampilkan 5-10) sementara
--     memberi headroom untuk konsumen non-UI (mis. dashboard).
--   * Karena signature parameter berubah (tambah p_limit), harus DROP dulu.
--     ACL akan hilang → recreate REVOKE di akhir, konsisten dgn user_permissions.
--
-- Verifikasi (harus dilakukan pasca-apply):
--   EXPLAIN (ANALYZE, BUFFERS) SELECT public.search_cards('proyek', NULL, false, 50);
--   → harus menunjukkan `Bitmap Index Scan on idx_*_name_trgm` untuk tabel-tabel
--     yang punya indeks (goals, strategies, initiatives, action_plans, tasks,
--     development_areas, problem_statements).

drop function if exists public.search_cards(text, text[], boolean);

create or replace function public.search_cards(
  p_query text,
  p_entity_types text[],
  p_include_archived boolean,
  p_limit int default 50
) returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q_ci text;
  v_types text[];
  v_arch boolean;
  v_lim int;
begin
  if coalesce(trim(p_query), '') = '' then return; end if;

  v_q_ci := '%' || trim(p_query) || '%';
  v_types := coalesce(p_entity_types,
    array['goal','strategy','initiative','action_plan','task','development_area','problem_statement']);
  v_arch := coalesce(p_include_archived, false);
  v_lim := least(greatest(coalesce(p_limit, 50), 1), 200);

  return query
  (
    select jsonb_build_object('id', g.id, 'entity_type', 'goal', 'name', g.name, 'status', g.status)
    from public.goals g
    where 'goal' = any(v_types) and public.can_access_goal(g.id)
      and g.name ilike v_q_ci
      and (v_arch or g.status <> 'archived')
    union all
    select jsonb_build_object('id', k.id, 'entity_type', 'strategy', 'name', k.name, 'status', k.status)
    from public.strategies k
    where 'strategy' = any(v_types) and public.can_access_strategy(k.id)
      and k.name ilike v_q_ci
      and (v_arch or k.status <> 'archived')
    union all
    select jsonb_build_object('id', s.id, 'entity_type', 'initiative', 'name', s.name, 'status', s.status)
    from public.initiatives s
    where 'initiative' = any(v_types) and public.can_access_initiative(s.id)
      and s.name ilike v_q_ci
      and (v_arch or s.status <> 'archived')
    union all
    select jsonb_build_object('id', i.id, 'entity_type', 'action_plan', 'name', i.name, 'status', i.status)
    from public.action_plans i
    where 'action_plan' = any(v_types) and public.can_access_action_plan(i.id)
      and i.name ilike v_q_ci
      and (v_arch or i.status <> 'archived')
    union all
    select jsonb_build_object('id', a.id, 'entity_type', 'task', 'name', a.name, 'status', a.status)
    from public.tasks a
    where 'task' = any(v_types) and public.can_access_task(a.id)
      and a.name ilike v_q_ci
      and (v_arch or a.status <> 'archived')
    union all
    select jsonb_build_object('id', d.id, 'entity_type', 'development_area', 'name', d.name, 'status', d.status)
    from public.development_areas d
    where 'development_area' = any(v_types) and public.can_access_development_area(d.id)
      and d.name ilike v_q_ci
      and (v_arch or d.status <> 'archived')
    union all
    select jsonb_build_object('id', ps.id, 'entity_type', 'problem_statement', 'name', ps.name, 'status', ps.status)
    from public.problem_statements ps
    where 'problem_statement' = any(v_types) and public.can_access_problem_statement(ps.id)
      and ps.name ilike v_q_ci
      and (v_arch or ps.status <> 'archived')
  )
  limit v_lim;
end;
$$;

revoke execute on function public.search_cards(text, text[], boolean, int) from public, anon;
grant execute on function public.search_cards(text, text[], boolean, int) to authenticated;
