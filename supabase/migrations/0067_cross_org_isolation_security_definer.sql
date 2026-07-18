-- =============================================================================
-- 0067_cross_org_isolation_security_definer.sql
-- =============================================================================
-- SECURITY FIX (Finding 2, /cso audit 2026-07-16):
--
-- Pattern: each SECURITY DEFINER RPC fetches a row by ID, checks only a
-- role-level permission (has_permission('manage_others_cards') or CEO role)
-- but never compares the row's organization_id to the caller's own org
-- (public.current_user_org()). Because SECURITY DEFINER bypasses RLS, a
-- privileged user in Org A can operate on any entity belonging to Org B by
-- guessing the UUID.
--
-- Migration 0039 already fixed 3 RPCs (close_period_snapshot,
-- calculate_period_scores, override_user_score) for the same bug. These 13
-- functions were missed. This migration adds the same guard pattern:
--
--   if <row>.organization_id is distinct from public.current_user_org() then
--     raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
--   end if;
--
-- All 13 are CREATE OR REPLACE — signatures unchanged, no DROP needed.
-- =============================================================================


-- ============================================================ 1. activate_goal (0046:255)
CREATE OR REPLACE FUNCTION public.activate_goal(p_goal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.goals; v_kpi int;
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;
  if g.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Goal ini.';
  end if;
  if g.status <> 'draft' then raise exception 'Goal sudah diaktifkan.'; end if;
  if coalesce(trim(g.name), '') = '' or g.pic_id is null or g.period_start is null or g.period_end is null
     or coalesce(trim(g.target_value), '') = '' then
    raise exception 'Kelengkapan Goal belum terpenuhi (nama, PIC, periode, Target Tahunan wajib).';
  end if;
  select count(*) into v_kpi from public.strategies where goal_id = p_goal_id;
  if v_kpi < 1 then
    raise exception 'Goal wajib memiliki minimal 1 KPI Area sebelum diaktifkan.';
  end if;
  update public.goals set status = 'active' where id = p_goal_id;
  perform public.write_activity('goal', p_goal_id, 'activate', '{}'::jsonb);
end;
$function$;


-- ============================================================ 2. activate_action_plan (0046:284)
CREATE OR REPLACE FUNCTION public.activate_action_plan(p_action_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.action_plans;
begin
  select * into i from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Initiative tidak ditemukan.'; end if;
  if i.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
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
  update public.action_plans set status = 'active' where id = p_action_plan_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'activate', '{}'::jsonb);
end;
$function$;


-- ============================================================ 3. activate_strategy (0046:312)
CREATE OR REPLACE FUNCTION public.activate_strategy(p_strategy_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  k public.strategies;
  v_rule public.minimum_breakdown_rules;
  v_initiatives int;
begin
  select * into k from public.strategies where id = p_strategy_id;
  if not found then raise exception 'KPI Area tidak ditemukan.'; end if;
  if k.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
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

  v_rule := public.current_minimum_breakdown_rule('strategy', 'initiative');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_initiatives from public.initiatives
      where strategy_id = p_strategy_id and status <> 'archived'
        and organization_id = k.organization_id;
    if v_initiatives < v_rule.min_count then
      raise exception
        'KPI Area ini baru memiliki % dari % Strategy. Tambahkan % Strategy lagi agar bisa diaktifkan.',
        v_initiatives, v_rule.min_count, (v_rule.min_count - v_initiatives);
    end if;
  end if;

  update public.strategies set status = 'active' where id = p_strategy_id;
  perform public.write_activity('strategy', p_strategy_id, 'activate', '{}'::jsonb);
end;
$function$;


-- ============================================================ 4. activate_initiative (0046:356)
CREATE OR REPLACE FUNCTION public.activate_initiative(p_initiative_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.initiatives;
  v_other_sum numeric;
  v_total numeric;
begin
  select * into s from public.initiatives where id = p_initiative_id;
  if not found then raise exception 'Strategy tidak ditemukan.'; end if;
  if s.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (s.created_by = auth.uid() or s.pic_id = auth.uid() or public.is_strategy_pic(s.strategy_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Strategy ini.';
  end if;
  if s.status <> 'draft' then raise exception 'Strategy sudah diaktifkan.'; end if;
  if coalesce(trim(s.name), '') = '' or s.pic_id is null or s.period_start is null or s.period_end is null then
    raise exception 'Kelengkapan Strategy belum terpenuhi (nama, PIC, periode wajib).';
  end if;
  if coalesce(trim(s.reason), '') = '' or coalesce(trim(s.main_risk), '') = '' or coalesce(trim(s.alternative), '') = '' then
    raise exception 'Strategy wajib mengisi Alasan, Risiko Utama, dan Alternatif sebelum diaktifkan.';
  end if;

  if s.contribution_pct is null then
    raise exception 'Kontribusi Quarter wajib diisi sebelum aktivasi Strategy.';
  end if;
  select coalesce(sum(coalesce(contribution_pct, 0)), 0)
    into v_other_sum
    from public.initiatives
   where strategy_id = s.strategy_id
     and status = 'active'
     and id <> p_initiative_id;
  v_total := v_other_sum + s.contribution_pct;
  if abs(v_total - 100) > 0.001 then
    raise exception 'Total Kontribusi Quarter Strategy di KPI Area harus 100%%; setelah aktivasi akan menjadi %.', v_total;
  end if;

  update public.initiatives set status = 'active' where id = p_initiative_id;
  perform public.write_activity('initiative', p_initiative_id, 'activate', '{}'::jsonb);
end;
$function$;


-- ============================================================ 5. approve_cancellation (0046:472)
CREATE OR REPLACE FUNCTION public.approve_cancellation(p_cancellation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_c public.cancellations;
begin
  select * into v_c from public.cancellations where id = p_cancellation_id for update;
  if not found then raise exception 'Permintaan pembatalan tidak ditemukan.'; end if;
  if v_c.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if v_c.approval_status <> 'pending' then raise exception 'Pembatalan ini sudah diproses.'; end if;
  if not (public.user_role_level() = 'ceo' or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang menyetujui pembatalan.';
  end if;
  update public.cancellations
    set approval_status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_cancellation_id;
  execute format('update public.%I set status = ''cancelled'' where id = $1',
    case v_c.entity_type when 'task' then 'tasks'
      when 'action_plan' then 'action_plans' when 'initiative' then 'initiatives'
      when 'strategy' then 'strategies' when 'goal' then 'goals'
      when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end)
  using v_c.entity_id;
  perform public.write_activity(v_c.entity_type, v_c.entity_id, 'card_cancelled',
    jsonb_build_object('cancellation_id', p_cancellation_id));
end;
$function$;


-- ============================================================ 6. archive_card (0046:502)
CREATE OR REPLACE FUNCTION public.archive_card(p_entity_type text, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tbl text; v_status text; v_pic uuid; v_org uuid; v_active_children int := 0;
begin
  v_tbl := case p_entity_type when 'task' then 'tasks'
    when 'action_plan' then 'action_plans' when 'initiative' then 'initiatives'
    when 'strategy' then 'strategies' when 'goal' then 'goals'
    when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end;
  if v_tbl is null then raise exception 'Tipe card tidak valid.'; end if;
  execute format('select status, pic_id, organization_id from public.%I where id = $1', v_tbl)
    into v_status, v_pic, v_org using p_entity_id;
  if v_status is null then raise exception 'Card tidak ditemukan.'; end if;
  if v_org is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (v_pic = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengarsipkan card ini.';
  end if;
  if v_status not in ('done','cancelled') then
    raise exception 'Hanya card berstatus selesai atau dibatalkan yang dapat diarsipkan.';
  end if;
  execute format('update public.%I set status = ''archived'', archived_at = now() where id = $1', v_tbl)
    using p_entity_id;
  perform public.write_activity(p_entity_type, p_entity_id, 'card_archived', '{}'::jsonb);
end;
$function$;


-- ============================================================ 7. restore_card (0046:1904)
CREATE OR REPLACE FUNCTION public.restore_card(p_entity_type text, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tbl text; v_status text; v_pic uuid; v_org uuid;
begin
  v_tbl := case p_entity_type when 'task' then 'tasks'
    when 'action_plan' then 'action_plans' when 'initiative' then 'initiatives'
    when 'strategy' then 'strategies' when 'goal' then 'goals'
    when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end;
  if v_tbl is null then raise exception 'Tipe card tidak valid.'; end if;
  execute format('select status, pic_id, organization_id from public.%I where id = $1', v_tbl)
    into v_status, v_pic, v_org using p_entity_id;
  if v_status is null then raise exception 'Card tidak ditemukan.'; end if;
  if v_org is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (v_pic = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang memulihkan card ini.';
  end if;
  if v_status <> 'archived' then
    raise exception 'Hanya card berstatus diarsipkan yang dapat dipulihkan.';
  end if;
  execute format('update public.%I set status = ''draft'', archived_at = null where id = $1', v_tbl)
    using p_entity_id;
  perform public.write_activity(p_entity_type, p_entity_id, 'card_restored', '{}'::jsonb);
end;
$function$;


-- ============================================================ 8. restore_goal_template_items (0046:1935)
CREATE OR REPLACE FUNCTION public.restore_goal_template_items(p_goal_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.goals; v_added int; v_org uuid;
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;
  if g.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if g.goal_template_id is null then raise exception 'Goal ini tidak berasal dari template.'; end if;
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Goal ini.';
  end if;
  v_org := g.organization_id;

  insert into public.strategies (organization_id, goal_id, name, pic_id, period_start, period_end, status, created_by)
  select v_org, g.id, kt.name, g.pic_id, g.period_start, g.period_end, 'draft', auth.uid()
  from public.strategy_templates kt
  where kt.goal_template_id = g.goal_template_id
    and not exists (
      select 1 from public.strategies k where k.goal_id = g.id and k.name = kt.name
    );
  get diagnostics v_added = row_count;
  return v_added;
end;
$function$;


-- ============================================================ 9. set_task_repeat_rule (0046:2160)
CREATE OR REPLACE FUNCTION public.set_task_repeat_rule(p_action_plan_id uuid, p_frequency text, p_weekdays integer[], p_month_days integer[], p_custom_dates date[], p_repeat_start_date date, p_repeat_end_date date, p_time_of_day time without time zone, p_missed_rule text, p_grace_period_minutes integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.tasks;
  v_rule_id uuid;
begin
  select * into a from public.tasks where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if a.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.action_plans i where i.id = a.action_plan_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengatur Repeat untuk Action Plan ini.';
  end if;

  if exists (select 1 from public.task_instances ins where ins.task_id = p_action_plan_id) then
    raise exception 'Repeat Rule terkunci: instance sudah dibuat untuk Action Plan ini.';
  end if;

  insert into public.task_repeat_rules
    (organization_id, task_id, frequency, weekdays, month_days, custom_dates,
     repeat_start_date, repeat_end_date, time_of_day, missed_rule, grace_period_minutes, created_by)
  values
    (a.organization_id, p_action_plan_id, p_frequency,
     nullif(p_weekdays, '{}'::int[]), nullif(p_month_days, '{}'::int[]), nullif(p_custom_dates, '{}'::date[]),
     p_repeat_start_date, p_repeat_end_date, p_time_of_day, p_missed_rule, p_grace_period_minutes, auth.uid())
  on conflict (task_id) do update
    set frequency = excluded.frequency,
        weekdays = excluded.weekdays,
        month_days = excluded.month_days,
        custom_dates = excluded.custom_dates,
        repeat_start_date = excluded.repeat_start_date,
        repeat_end_date = excluded.repeat_end_date,
        time_of_day = excluded.time_of_day,
        missed_rule = excluded.missed_rule,
        grace_period_minutes = excluded.grace_period_minutes,
        updated_at = now()
  returning id into v_rule_id;

  update public.tasks set repeat_setting = 'repeat' where id = p_action_plan_id;

  perform public.write_activity('task', p_action_plan_id, 'set_repeat_rule',
    jsonb_build_object('rule_id', v_rule_id, 'frequency', p_frequency));

  return v_rule_id;
end;
$function$;


-- ============================================================ 10. activate_score_formula_version (0020:215)
CREATE OR REPLACE FUNCTION public.activate_score_formula_version(
  p_version_id uuid, p_effective_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
declare
  v_org uuid; v_sum numeric; v_tmpl uuid; v_status text; v_eff date;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select organization_id, template_id, status into v_org, v_tmpl, v_status
    from public.score_formula_versions where id = p_version_id;
  if not found then raise exception 'Versi formula tidak ditemukan.'; end if;
  if v_org is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if v_status <> 'draft' then raise exception 'Hanya versi draft yang bisa diaktifkan.'; end if;

  v_eff := coalesce(p_effective_date, current_date);
  if v_eff < current_date then
    raise exception 'effective_date_retroactive: tanggal efektif tidak boleh sebelum hari ini.';
  end if;

  select coalesce(sum((c->>'weight')::numeric), 0) into v_sum
    from public.score_formula_versions sfv,
         jsonb_array_elements(sfv.categories) c
    where sfv.id = p_version_id;
  if v_sum <> 100 then
    raise exception 'Total bobot Score Formula harus tepat 100. Saat ini %.', v_sum;
  end if;

  update public.score_formula_versions
    set status = 'archived'
    where template_id = v_tmpl and status = 'active' and id <> p_version_id;

  update public.score_formula_versions
    set status = 'active', activated_at = now(), effective_date = v_eff,
        approved_by = auth.uid()
    where id = p_version_id;

  perform public.write_activity('score_formula_version', p_version_id, 'score_formula_activated',
    jsonb_build_object('effective_date', v_eff));
end;
$$;


-- ============================================================ 11. activate_development_area (0012:356)
CREATE OR REPLACE FUNCTION public.activate_development_area(p_development_area_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
declare
  d public.development_areas;
  v_rule public.minimum_breakdown_rules;
  v_children int;
begin
  select * into d from public.development_areas where id = p_development_area_id;
  if not found then raise exception 'Development Area tidak ditemukan.'; end if;
  if d.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (d.created_by = auth.uid() or d.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Development Area ini.';
  end if;
  if d.status <> 'draft' then raise exception 'Development Area sudah diaktifkan.'; end if;
  if coalesce(trim(d.name), '') = '' or d.pic_id is null
     or d.period_start is null or d.period_end is null then
    raise exception 'Kelengkapan Development Area belum terpenuhi (nama, PIC, periode wajib).';
  end if;

  v_rule := public.current_minimum_breakdown_rule('development_area', 'problem_statement');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_children from public.problem_statements
      where development_area_id = p_development_area_id and status <> 'archived'
        and organization_id = d.organization_id;
    if v_children < v_rule.min_count then
      raise exception
        'Development Area ini baru memiliki % dari % Problem Statement. Tambahkan % Problem Statement lagi agar bisa diaktifkan.',
        v_children, v_rule.min_count, (v_rule.min_count - v_children);
    end if;
  end if;

  update public.development_areas set status = 'active' where id = p_development_area_id;
  perform public.write_activity('development_area', p_development_area_id, 'activate', '{}'::jsonb);
end;
$$;


-- ============================================================ 12. review_deadline_change (0040:52)
CREATE OR REPLACE FUNCTION public.review_deadline_change(
  p_request_id uuid, p_decision text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
declare
  v_req public.deadline_change_requests;
  v_ap_status text;
begin
  if p_decision not in ('approved','rejected','revision_requested') then
    raise exception 'Keputusan tidak valid.';
  end if;
  select * into v_req from public.deadline_change_requests where id = p_request_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan.'; end if;
  if v_req.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Permintaan ini sudah diproses atau menunggu revisi pengaju.';
  end if;
  if not public.has_permission('review_deadline_changes') then
    raise exception 'Anda tidak berwenang me-review perubahan deadline.';
  end if;
  if v_req.requestor_id = auth.uid() then
    insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, severity, detail)
    values (v_req.organization_id, auth.uid(), 'deadline_change_self_approval',
            v_req.entity_type, v_req.entity_id, 'critical',
            jsonb_build_object('request_id', p_request_id, 'decision', p_decision));
    raise exception 'Anda tidak dapat me-review permintaan yang Anda ajukan sendiri.';
  end if;
  if p_decision in ('rejected','revision_requested')
     and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi untuk menolak atau meminta revisi.';
  end if;

  if p_decision in ('approved','revision_requested') then
    select status into v_ap_status from public.action_plans where id = v_req.entity_id;
    if v_ap_status in ('archived','cancelled','done') then
      raise exception 'Action Plan sudah berstatus terminal; permintaan tidak dapat diproses.';
    end if;
  end if;

  if p_decision = 'approved' then
    update public.deadline_change_requests
      set status = 'approved', approver_id = auth.uid(), responded_at = now()
      where id = p_request_id;
    perform set_config('app.allow_deadline_update', 'true', true);
    update public.action_plans set deadline = v_req.new_deadline where id = v_req.entity_id;
    perform set_config('app.allow_deadline_update', 'false', true);
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'approved', auth.uid(), nullif(trim(coalesce(p_reason,'')),''));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_approved',
      jsonb_build_object('request_id', p_request_id, 'new_deadline', v_req.new_deadline));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_approved', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Disetujui', 'Permintaan perubahan deadline Anda disetujui.');
    perform public.resolve_notifications('action_plan', v_req.entity_id,
      array['deadline_change_requested'], 'approved');
  elsif p_decision = 'revision_requested' then
    update public.deadline_change_requests
      set status = 'revision_requested', approver_id = auth.uid(),
          responded_at = now(), revision_reason = trim(p_reason)
      where id = p_request_id;
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'revision_requested', auth.uid(), trim(p_reason));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_revision_requested',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_revision_requested', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Perlu Revisi', 'Reviewer meminta revisi pada permintaan Anda.');
    perform public.resolve_notifications('action_plan', v_req.entity_id,
      array['deadline_change_requested'], 'revision_requested');
  else
    update public.deadline_change_requests
      set status = 'rejected', approver_id = auth.uid(), responded_at = now(), rejection_reason = trim(p_reason)
      where id = p_request_id;
    insert into public.deadline_change_logs (organization_id, request_id, action, actor_id, note)
    values (v_req.organization_id, p_request_id, 'rejected', auth.uid(), trim(p_reason));
    perform public.write_activity('action_plan', v_req.entity_id, 'deadline_change_rejected',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason)));
    perform public.emit_notification(v_req.organization_id, v_req.requestor_id, auth.uid(),
      'deadline_change_rejected', 'action_plan', v_req.entity_id,
      'Perubahan Deadline Ditolak', 'Permintaan perubahan deadline Anda ditolak.');
    perform public.resolve_notifications('action_plan', v_req.entity_id,
      array['deadline_change_requested'], 'rejected');
  end if;
end;
$$;


-- ============================================================ 13. activate_problem_statement (0061:239)
CREATE OR REPLACE FUNCTION public.activate_problem_statement(p_problem_statement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  p public.problem_statements;
  v_rule public.minimum_breakdown_rules;
  v_children int;
BEGIN
  SELECT * INTO p FROM public.problem_statements WHERE id = p_problem_statement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Problem Statement tidak ditemukan.'; END IF;
  IF p.organization_id IS DISTINCT FROM public.current_user_org() THEN
    RAISE EXCEPTION 'Anda tidak berwenang mengakses card lintas-organisasi.';
  END IF;
  IF NOT (p.created_by = auth.uid() OR p.pic_id = auth.uid()
          OR public.is_development_area_pic(p.development_area_id)
          OR public.has_permission('manage_others_cards')) THEN
    RAISE EXCEPTION 'Anda tidak berwenang mengaktifkan Problem Statement ini.';
  END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Problem Statement sudah diaktifkan.'; END IF;
  IF coalesce(trim(p.name), '') = '' OR p.pic_id IS NULL
     OR p.period_start IS NULL OR p.period_end IS NULL
     OR p.impact IS NULL THEN
    RAISE EXCEPTION 'Kelengkapan Problem Statement belum terpenuhi (nama, PIC, periode, Dampak wajib).';
  END IF;

  v_rule := public.current_minimum_breakdown_rule('problem_statement', 'initiative');
  IF v_rule.id IS NOT NULL AND v_rule.enforcement_mode = 'blokir_aktivasi' THEN
    SELECT count(*) INTO v_children FROM public.initiatives
      WHERE problem_statement_id = p_problem_statement_id
        AND status <> 'archived'
        AND organization_id = p.organization_id;
    IF v_children < v_rule.min_count THEN
      RAISE EXCEPTION
        'Problem Statement ini baru memiliki % dari % Initiative. Tambahkan % Initiative lagi agar bisa diaktifkan.',
        v_children, v_rule.min_count, (v_rule.min_count - v_children);
    END IF;
  END IF;

  UPDATE public.problem_statements SET status = 'active' WHERE id = p_problem_statement_id;
  PERFORM public.write_activity('problem_statement', p_problem_statement_id, 'activate', '{}'::jsonb);
END;
$$;
