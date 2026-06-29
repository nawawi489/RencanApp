-- 0031 — Defense-in-depth: gate aktivasi untuk dua field PRD yang baru ditambah:
--
--   §17 Goal              : target_value wajib saat aktivasi (UI-S-G01 migrasi 0023).
--   §15 Problem Statement : impact wajib saat aktivasi (UI-S-PR1 migrasi 0030).
--
-- Versi terakhir activate_goal = 0010. Versi terakhir activate_problem_statement = 0012.
-- Logika lain (MBR gate, double-activate, auth) dijaga utuh.

create or replace function public.activate_goal(p_goal_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.goals; v_kpi int;
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Goal ini.';
  end if;
  if g.status <> 'draft' then raise exception 'Goal sudah diaktifkan.'; end if;
  if coalesce(trim(g.name), '') = '' or g.pic_id is null or g.period_start is null or g.period_end is null
     or coalesce(trim(g.target_value), '') = '' then
    raise exception 'Kelengkapan Goal belum terpenuhi (nama, PIC, periode, Target Tahunan wajib).';
  end if;
  select count(*) into v_kpi from public.kpi_areas where goal_id = p_goal_id;
  if v_kpi < 1 then
    raise exception 'Goal wajib memiliki minimal 1 KPI Area sebelum diaktifkan.';
  end if;
  update public.goals set status = 'active' where id = p_goal_id;
  perform public.write_activity('goal', p_goal_id, 'activate', '{}'::jsonb);
end;
$$;

-- activate_problem_statement (versi 0012) + gate impact.
create or replace function public.activate_problem_statement(p_problem_statement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.problem_statements;
  v_rule public.minimum_breakdown_rules;
  v_children int;
begin
  select * into p from public.problem_statements where id = p_problem_statement_id;
  if not found then raise exception 'Problem Statement tidak ditemukan.'; end if;
  if not (p.created_by = auth.uid() or p.pic_id = auth.uid()
          or public.is_development_area_pic(p.development_area_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Problem Statement ini.';
  end if;
  if p.status <> 'draft' then raise exception 'Problem Statement sudah diaktifkan.'; end if;
  if coalesce(trim(p.name), '') = '' or p.pic_id is null
     or p.period_start is null or p.period_end is null
     or p.impact is null then
    raise exception 'Kelengkapan Problem Statement belum terpenuhi (nama, PIC, periode, Dampak wajib).';
  end if;

  -- K6 MBR gate (tetap, dari 0012).
  v_rule := public.current_minimum_breakdown_rule('problem_statement', 'initiative');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_children from public.initiatives
      where problem_statement_id = p_problem_statement_id
        and status <> 'archived'
        and organization_id = p.organization_id;
    if v_children < v_rule.min_count then
      raise exception
        'Problem Statement ini baru memiliki % dari % Initiative. Tambahkan % Initiative lagi agar bisa diaktifkan.',
        v_children, v_rule.min_count, (v_rule.min_count - v_children);
    end if;
  end if;

  update public.problem_statements set status = 'active' where id = p_problem_statement_id;
  perform public.write_activity('problem_statement', p_problem_statement_id, 'activate', '{}'::jsonb);
end;
$$;
