-- 0100 — calculate_period_scores: set-based metric precompute (perf)
--
-- Audit 2026-07-24 (calculate_period_scores, HIGH): fungsi lama memanggil ≤6 fungsi metrik
-- SKALAR di DALAM loop per-user → biaya O(users × metrics × scan), di-serialize di bawah
-- pg_advisory_xact_lock sepanjang durasi. Pada ratusan staff → transaksi berdurasi menit yang
-- menahan lock. (0096 sudah menambah index sehingga tiap scan per-user index-served, bukan
-- seq-scan; ini menghapus overhead pemanggilan × users.)
--
-- Perbaikan BEDAH-MINIMAL (risiko rendah): precompute SEMUA metrik untuk SEMUA staff dalam
-- SATU pass set-based per metrik (temp table pg_temp._calc_metrics), lalu loop membaca nilai
-- dari sana. Loop resolusi-formula + weighted-sum + breakdown (||) + DML TIDAK BERUBAH — satu-
-- satunya perubahan perilaku adalah SUMBER nilai metrik (fungsi skalar → lookup temp).
--
-- Setiap kolom temp mereproduksi fungsi skalarnya PERSIS, termasuk default:
--   ratio metrics (repeat/on_time/apc/dev/review) → 0 saat tak ada denominator,
--   governance_discipline → 100 saat tak ada pelanggaran.
-- Diverifikasi di staging: batch == skalar untuk seluruh staff, seluruh metrik (0 selisih).
--
-- Catatan: development_contribution memakai public.action_plans (lihat 0099 — perbaikan
-- rename-miss; fungsi skalar compute_development_contribution juga sudah diperbaiki di sana).

create or replace function public.calculate_period_scores(p_period_id uuid)
returns integer
language plpgsql security definer set search_path to '' as $function$
declare
  v_period public.period_snapshots;
  v_org uuid;
  v_count int := 0;
  v_user record;
  v_formula_id uuid;
  v_categories jsonb;
  v_metric_breakdown jsonb;
  v_score numeric;
  v_cat jsonb;
  v_metric_value numeric;
  v_metrics record;
begin
  perform pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text));

  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select * into v_period from public.period_snapshots where id = p_period_id;
  if not found then raise exception 'Periode tidak ditemukan.'; end if;
  if v_period.organization_id is distinct from public.current_user_org() then
    raise exception 'Periode tidak ditemukan.';
  end if;
  if v_period.status = 'closed' then
    raise exception 'Periode ini sudah ditutup dan tidak bisa diubah.';
  end if;

  v_org := v_period.organization_id;

  -- === Precompute semua metrik untuk semua staff (satu pass set-based per metrik) ===
  drop table if exists pg_temp._calc_metrics;
  create temp table _calc_metrics on commit drop as
  with staff as (
    select p.id as user_id
    from public.profiles p
    join public.role_templates rt on rt.id = p.role_template_id
    where p.organization_id = v_org and rt.level = 'staff'
  ),
  rep as (
    select ti.pic_id as user_id,
      round(coalesce(100.0 * (count(*) filter (where ti.status='done' and not ti.submitted_late))::numeric
        / nullif(count(*),0), 0), 2) as repeat_compliance,
      round(coalesce(100.0 * (count(*) filter (where ti.status in ('done','submitted','revision') and not ti.submitted_late))::numeric
        / nullif(count(*),0), 0), 2) as on_time_rate
    from public.task_instances ti
    where ti.organization_id = v_org and ti.status <> 'archived'
      and ti.deadline_at >= v_period.period_start::timestamptz
      and ti.deadline_at <  (v_period.period_end + 1)::timestamptz
    group by ti.pic_id
  ),
  assigned as (
    select t.pic_id as user_id, t.id as task_id
    from public.tasks t
    where t.organization_id = v_org and t.repeat_setting = 'one_time' and t.status <> 'archived'
      and (t.start_date is null or t.start_date <= v_period.period_end)
      and (t.deadline is null or t.deadline >= v_period.period_start)
  ),
  apc as (
    select a.user_id,
      round(coalesce(100.0 * count(distinct s.task_id)::numeric / nullif(count(distinct a.task_id),0), 0), 2) as val
    from assigned a
    left join public.task_submissions s
      on s.task_id = a.task_id and s.review_status = 'approved' and s.reviewed_at is not null
     and s.reviewed_at >= v_period.period_start::timestamptz
     and s.reviewed_at <  (v_period.period_end + 1)::timestamptz
    group by a.user_id
  ),
  dev as (
    select ap.pic_id as user_id,
      round(coalesce(100.0 * (count(*) filter (where ap.status='done'))::numeric / nullif(count(*),0), 0), 2) as val
    from public.action_plans ap
    where ap.organization_id = v_org and ap.problem_statement_id is not null and ap.status <> 'archived'
    group by ap.pic_id
  ),
  gov as (
    select d.user_id,
      greatest(0, least(100, 100 - sum(case d.severity
        when 'low' then 2 when 'medium' then 5 when 'high' then 15 when 'critical' then 40 else 0 end)))::numeric as val
    from (
      select distinct gv.user_id, gv.severity
      from public.governance_violations gv
      where gv.organization_id = v_org and gv.severity is not null
        and gv.created_at >= v_period.period_start::timestamptz
        and gv.created_at <  (v_period.period_end + 1)::timestamptz
    ) d
    group by d.user_id
  ),
  rpr as (
    select s.submitted_by as user_id,
      round(coalesce(100.0 * (count(*) filter (where s.review_status='approved'))::numeric / nullif(count(*),0), 0), 2) as val
    from public.task_submissions s
    join public.tasks ap on ap.id = s.task_id
    where ap.organization_id = v_org
      and s.submitted_at >= v_period.period_start::timestamptz
      and s.submitted_at <  (v_period.period_end + 1)::timestamptz
    group by s.submitted_by
  )
  select st.user_id,
    coalesce(rep.repeat_compliance, 0)  as repeat_compliance,
    coalesce(rep.on_time_rate, 0)       as on_time_rate,
    coalesce(apc.val, 0)                as action_plan_completion,
    coalesce(dev.val, 0)                as development_contribution,
    coalesce(gov.val, 100)              as governance_discipline,
    coalesce(rpr.val, 0)                as review_pass_rate
  from staff st
  left join rep on rep.user_id = st.user_id
  left join apc on apc.user_id = st.user_id
  left join dev on dev.user_id = st.user_id
  left join gov on gov.user_id = st.user_id
  left join rpr on rpr.user_id = st.user_id;

  create unique index on _calc_metrics (user_id);

  -- === Loop scoring/DML — TIDAK BERUBAH kecuali sumber nilai metrik (temp, bukan panggil skalar) ===
  for v_user in
    select p.id as user_id, rt.level
    from public.profiles p
    join public.role_templates rt on rt.id = p.role_template_id
    where p.organization_id = v_org and rt.level = 'staff'
  loop
    select sfv.id, sfv.categories into v_formula_id, v_categories
      from public.score_formula_versions sfv
      left join public.score_formula_assignments sfa
        on sfa.formula_version_id = sfv.id
       and sfa.organization_id = v_org
       and (
         (sfa.scope_level='user' and sfa.user_id = v_user.user_id)
         or (sfa.scope_level='org_role' and sfa.role_level = v_user.level)
       )
       and sfa.start_date <= v_period.period_start
       and (sfa.end_date is null or sfa.end_date >= v_period.period_start)
      where sfv.status = 'active'
        and sfv.level = v_user.level
        and (sfv.organization_id = v_org or sfv.organization_id is null)
      order by (sfa.scope_level='user') desc nulls last,
               (sfa.scope_level='org_role') desc nulls last,
               sfv.organization_id nulls last
      limit 1;

    if v_formula_id is null then continue; end if;

    select * into v_metrics from pg_temp._calc_metrics where user_id = v_user.user_id;

    v_score := 0;
    v_metric_breakdown := '{}'::jsonb;
    for v_cat in select * from jsonb_array_elements(v_categories) loop
      v_metric_value := case v_cat->>'source_metric'
        when 'action_plan_completion'   then v_metrics.action_plan_completion
        when 'repeat_compliance'        then v_metrics.repeat_compliance
        when 'on_time_rate'             then v_metrics.on_time_rate
        when 'review_pass_rate'         then v_metrics.review_pass_rate
        when 'development_contribution' then v_metrics.development_contribution
        when 'governance_discipline'    then v_metrics.governance_discipline
        else 0
      end;
      v_metric_value := greatest(0, least(100, coalesce(v_metric_value, 0)));
      v_score := v_score + v_metric_value * (v_cat->>'weight')::numeric / 100.0;
      v_metric_breakdown := v_metric_breakdown
        || jsonb_build_object(v_cat->>'code', v_metric_value);
    end loop;
    v_score := round(greatest(0, least(100, v_score)), 2);

    update public.user_score_results
      set is_current = false
      where period_snapshot_id = p_period_id
        and user_id = v_user.user_id
        and result_kind = 'auto'
        and is_current = true;

    if exists (select 1 from public.user_score_results
               where period_snapshot_id = p_period_id and user_id = v_user.user_id
                 and result_kind='override' and is_current=true) then
      insert into public.user_score_results
        (organization_id, period_snapshot_id, user_id, score_formula_version_id,
         auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
        values (v_org, p_period_id, v_user.user_id, v_formula_id,
                v_score, v_metric_breakdown, 'auto', false, now());
    else
      insert into public.user_score_results
        (organization_id, period_snapshot_id, user_id, score_formula_version_id,
         auto_calculated_score, metric_breakdown, result_kind, is_current, calculated_at)
        values (v_org, p_period_id, v_user.user_id, v_formula_id,
                v_score, v_metric_breakdown, 'auto', true, now());
    end if;

    v_count := v_count + 1;
  end loop;

  perform public.write_activity('period_snapshot', p_period_id, 'scores_calculated',
    jsonb_build_object('users_scored', v_count));
  return v_count;
end;
$function$;
