-- 0026 — Defense-in-depth: gate aktivasi untuk 3 field wajib PRD V1.8.2 yang baru
-- ditambah lewat migrasi 0025.
--
--   §18 KPI Area   : expected_outcome wajib saat aktivasi.
--   §21 Initiative : team_id wajib saat aktivasi.
--   §22 Action Plan: deadline_time wajib saat aktivasi (semua jenis: one-time & repeat).
--
-- Catatan: tidak menyentuh logic lain (anti-self-review, MBR gate, repeat branch). Hanya menambah
-- predikat ke validasi kelengkapan, dan menyatukan pesan exception agar konsisten.

-- ============================================================ activate_kpi_area
-- Versi terakhir: 0011 (dgn MBR gate). Tambah expected_outcome wajib.
create or replace function public.activate_kpi_area(p_kpi_area_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  k public.kpi_areas;
  v_rule public.minimum_breakdown_rules;
  v_strategies int;
begin
  select * into k from public.kpi_areas where id = p_kpi_area_id;
  if not found then raise exception 'KPI Area tidak ditemukan.'; end if;
  if not (k.created_by = auth.uid() or k.pic_id = auth.uid() or public.is_goal_pic(k.goal_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan KPI Area ini.';
  end if;
  if k.status <> 'draft' then raise exception 'KPI Area sudah diaktifkan.'; end if;
  if coalesce(trim(k.name), '') = '' or k.pic_id is null or k.period_start is null or k.period_end is null
     or coalesce(trim(k.target), '') = ''
     or coalesce(trim(k.expected_outcome), '') = '' then
    raise exception 'Kelengkapan KPI Area belum terpenuhi (nama, PIC, periode, Target, Ekspektasi Hasil wajib).';
  end if;

  -- Fase 5 MBR gate (tetap).
  v_rule := public.current_minimum_breakdown_rule('kpi_area', 'strategy');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_strategies from public.strategies
      where kpi_area_id = p_kpi_area_id and status <> 'archived'
        and organization_id = k.organization_id;
    if v_strategies < v_rule.min_count then
      raise exception
        'KPI Area ini baru memiliki % dari % Strategy. Tambahkan % Strategy lagi agar bisa diaktifkan.',
        v_strategies, v_rule.min_count, (v_rule.min_count - v_strategies);
    end if;
  end if;

  update public.kpi_areas set status = 'active' where id = p_kpi_area_id;
  perform public.write_activity('kpi_area', p_kpi_area_id, 'activate', '{}'::jsonb);
end;
$$;

-- ============================================================ activate_initiative
-- Versi terakhir: 0012 (dgn dual-parent strategy/PS). Tambah team_id wajib.
create or replace function public.activate_initiative(p_initiative_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.initiatives;
begin
  select * into i from public.initiatives where id = p_initiative_id;
  if not found then raise exception 'Initiative tidak ditemukan.'; end if;
  if not (i.created_by = auth.uid() or i.pic_id = auth.uid()
          or public.is_problem_statement_pic(i.problem_statement_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Initiative ini.';
  end if;
  if i.status <> 'draft' then raise exception 'Initiative sudah diaktifkan.'; end if;
  if coalesce(trim(i.name), '') = '' or coalesce(trim(i.target_result), '') = ''
     or i.pic_id is null or i.period_start is null or i.period_end is null
     or i.team_id is null then
    raise exception 'Kelengkapan Initiative belum terpenuhi (nama, target hasil, periode, PIC, Tim wajib).';
  end if;
  update public.initiatives set status = 'active' where id = p_initiative_id;
  perform public.write_activity('initiative', p_initiative_id, 'activate', '{}'::jsonb);
end;
$$;

-- ============================================================ activate_action_plan
-- Versi terakhir: 0007 (dgn repeat branch). Tambah deadline_time wajib di kedua cabang.
create or replace function public.activate_action_plan(p_action_plan_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
  rule public.action_plan_repeat_rules;
  v_count int;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.initiatives i where i.id = a.initiative_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengaktifkan Action Plan ini.';
  end if;
  if a.status <> 'draft' then raise exception 'Action Plan sudah diaktifkan.'; end if;
  if a.pic_id = a.reviewer_id then
    raise exception 'PIC dan Reviewer tidak boleh orang yang sama.';
  end if;

  -- Cabang REPEAT (PRD §22.9 Jam Deadline wajib juga utk repeat).
  if a.repeat_setting = 'repeat' then
    select * into rule from public.action_plan_repeat_rules where action_plan_id = p_action_plan_id;
    if not found then raise exception 'Repeat Rule belum diatur untuk Action Plan ini.'; end if;
    if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
       or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
       or a.priority is null
       or coalesce(trim(a.deadline_time), '') = '' then
      raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, output, definition of done, prioritas, Jam Deadline wajib).';
    end if;
    update public.action_plans set status = 'in_progress' where id = p_action_plan_id;
    v_count := public.generate_action_plan_instances(p_action_plan_id, rule.repeat_end_date);
    perform public.write_activity('action_plan', p_action_plan_id, 'activate_repeat',
      jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id, 'instances', v_count));
    return;
  end if;

  -- Cabang ONE TIME.
  if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
     or a.start_date is null or a.deadline is null
     or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
     or a.priority is null
     or coalesce(trim(a.deadline_time), '') = '' then
    raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, tanggal mulai, deadline, Jam Deadline, output, definition of done, prioritas wajib).';
  end if;
  update public.action_plans set status = 'assigned' where id = p_action_plan_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'activate',
    jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id));
end;
$$;
