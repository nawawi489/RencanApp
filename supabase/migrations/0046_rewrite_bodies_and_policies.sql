-- =====================================================================
-- 0046_rewrite_bodies_and_policies.sql
-- =====================================================================
-- Bundles F2 (enum backfill) + F3 (function bodies + RLS policy rewrite)
-- into one atomic migration per spec §10 merge gate "F1+F2 (dan idealnya
-- F3+F4) dalam SATU PR".
--
-- Depends on: 0045 (tables/columns/indexes/view already renamed).
--
-- Approach (order matters):
--   S0. Expand CHECK constraints to accept BOTH old and new entity_type
--       literals (transition compat; historical rows keep old values per
--       RWT-07 A, new inserts use new values).
--   S1. DROP 3 triggers pointing to about-to-be-renamed trigger functions.
--   S2. Rewrite 19 RLS policies (DROP + CREATE with new function refs
--       and cosmetic policy name refresh). Must precede DROP FUNCTION.
--   S3. CREATE OR REPLACE 62 functions with new names + new bodies.
--       FROZEN per RWT-05 A + pg_cron: compute_action_plan_completion,
--       generate_action_plan_instances. All others rename per spec §7.4.
--   S4. DROP 21 lingering old-name functions (identities superseded by S3).
--   S5. Recreate 3 triggers with new function references + new trigger names.
--   S6. Create map_legacy_entity_type helper for read-side rendering of
--       historical rows (per spec §7.6).
--
-- Rollback: 0046R would need to revert all sections in reverse order.
-- Since scope is large, prefer rolling back to pre-0045 baseline via 0045R
-- (F6 rollback drill).
-- =====================================================================

BEGIN;

-- Disable function body checks during migration: SQL functions eagerly check
-- referenced identifiers at CREATE time, but we're creating them in a batch
-- where dependencies may not exist yet. All references resolve at COMMIT.
SET LOCAL check_function_bodies = off;

-- =====================================================================
-- S0. Expand entity_type CHECK constraints for transition compat
-- =====================================================================
-- Historical rows keep old literals; new INSERTs use new literals.
-- Read-side render via map_legacy_entity_type helper (S6).

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_entity_type_check;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_entity_type_check CHECK (
    entity_type = ANY (ARRAY[
      'action_plan'::text, 'initiative'::text, 'action_plan_instance'::text,
      'task'::text, 'task_instance'::text
    ])
  );

ALTER TABLE public.cancellations
  DROP CONSTRAINT IF EXISTS cancellations_entity_type_check;
ALTER TABLE public.cancellations
  ADD CONSTRAINT cancellations_entity_type_check CHECK (
    entity_type = ANY (ARRAY[
      'action_plan'::text, 'initiative'::text, 'strategy'::text, 'kpi_area'::text,
      'task'::text, 'goal'::text, 'development_area'::text, 'problem_statement'::text
    ])
  );

ALTER TABLE public.confidential_access_rules
  DROP CONSTRAINT IF EXISTS confidential_access_rules_entity_type_check;
ALTER TABLE public.confidential_access_rules
  ADD CONSTRAINT confidential_access_rules_entity_type_check CHECK (
    entity_type = ANY (ARRAY[
      'action_plan'::text, 'initiative'::text, 'strategy'::text, 'kpi_area'::text,
      'task'::text, 'goal'::text
    ])
  );

ALTER TABLE public.deadline_change_requests
  DROP CONSTRAINT IF EXISTS deadline_change_requests_entity_type_check;
ALTER TABLE public.deadline_change_requests
  ADD CONSTRAINT deadline_change_requests_entity_type_check CHECK (
    entity_type = ANY (ARRAY['action_plan'::text, 'task'::text])
  );

ALTER TABLE public.minimum_breakdown_rules
  DROP CONSTRAINT IF EXISTS minimum_breakdown_rules_parent_card_type_check;
ALTER TABLE public.minimum_breakdown_rules
  ADD CONSTRAINT minimum_breakdown_rules_parent_card_type_check CHECK (
    parent_card_type = ANY (ARRAY[
      'goal'::text, 'kpi_area'::text, 'strategy'::text, 'initiative'::text, 'action_plan'::text,
      'development_area'::text, 'problem_statement'::text
    ])
  );

ALTER TABLE public.minimum_breakdown_rules
  DROP CONSTRAINT IF EXISTS minimum_breakdown_rules_child_card_type_check;
ALTER TABLE public.minimum_breakdown_rules
  ADD CONSTRAINT minimum_breakdown_rules_child_card_type_check CHECK (
    child_card_type = ANY (ARRAY[
      'kpi_area'::text, 'strategy'::text, 'initiative'::text, 'action_plan'::text, 'task'::text,
      'problem_statement'::text
    ])
  );

-- Rename cosmetic constraint (initiatives_single_parent lives on action_plans post-F1).
-- Wrapped in a DO block for idempotency (rollback-drill replay support).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.action_plans'::regclass
      AND conname = 'initiatives_single_parent'
  ) THEN
    ALTER TABLE public.action_plans RENAME CONSTRAINT initiatives_single_parent TO action_plans_single_parent;
  END IF;
END $$;

-- =====================================================================
-- S1. Drop triggers pointing to renamed functions (must precede DROP FUNCTION)
-- =====================================================================

DROP TRIGGER IF EXISTS action_plan_sync_chat    ON public.tasks;
DROP TRIGGER IF EXISTS initiative_chat_room     ON public.action_plans;
DROP TRIGGER IF EXISTS kpi_area_breakdown_touch ON public.strategy_target_breakdowns;


-- =====================================================================
-- S2. Drop all 62 old-name functions with CASCADE
-- =====================================================================

DROP FUNCTION IF EXISTS public.activate_action_plan(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.activate_goal(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.activate_initiative(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.activate_kpi_area(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.activate_strategy(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.aggregate_repeat_metrics_per_user(uuid,uuid,date,date) CASCADE;
DROP FUNCTION IF EXISTS public.apply_goal_template(uuid,uuid,date,date,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.approve_cancellation(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.archive_card(text,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.backfill_resolve_stale_notifications() CASCADE;
DROP FUNCTION IF EXISTS public.can_access_action_plan(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_access_kpi_area(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_access_strategy(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_edit_kpi_area_breakdown(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_card(text,uuid,text) CASCADE;
DROP FUNCTION IF EXISTS public.check_minimum_breakdown_compliance(text,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_orphan_upload(text) CASCADE;
DROP FUNCTION IF EXISTS public.compute_action_plan_completion(uuid,uuid,date,date) CASCADE;
DROP FUNCTION IF EXISTS public.compute_review_pass_rate(uuid,uuid,date,date) CASCADE;
DROP FUNCTION IF EXISTS public.create_comment(text,uuid,text,uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.create_submission_draft(uuid,integer) CASCADE;
DROP FUNCTION IF EXISTS public.development_area_has_my_descendant(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.emit_deadline_notifications() CASCADE;
DROP FUNCTION IF EXISTS public.generate_action_plan_instances(uuid,date) CASCADE;
DROP FUNCTION IF EXISTS public.get_chat_rooms() CASCADE;
DROP FUNCTION IF EXISTS public.get_near_deadline_items() CASCADE;
DROP FUNCTION IF EXISTS public.get_overdue_items() CASCADE;
DROP FUNCTION IF EXISTS public.get_repeat_compliance(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_today_repeat_instances() CASCADE;
DROP FUNCTION IF EXISTS public.goal_has_my_descendant(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.grant_confidential_access(text,uuid,uuid,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.i_am_initiative_pic(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.i_am_problem_statement_pic_via_initiative(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.initiative_has_my_action_plan(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_kpi_area_pic(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_supervisor_of(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.kpi_area_breakdown_replace(uuid,jsonb,jsonb,text) CASCADE;
DROP FUNCTION IF EXISTS public.kpi_area_has_my_descendant(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.kpi_area_in_my_org(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.list_kpi_area_candidates_for_action_plan(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.mark_overdue_instances(timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS public.problem_statement_has_my_descendant(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.recompute_chat_room_members(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.record_evaluation(uuid,text,text,text[],text[],text,boolean,boolean,text) CASCADE;
DROP FUNCTION IF EXISTS public.restore_card(text,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.restore_goal_template_items(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.review_action_plan_instance_submission(uuid,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.review_action_plan_submission(uuid,text,text) CASCADE;
DROP FUNCTION IF EXISTS public.search_cards(text,text[],boolean) CASCADE;
DROP FUNCTION IF EXISTS public.set_action_plan_repeat_rule(uuid,text,integer[],integer[],date[],date,date,time without time zone,text,integer) CASCADE;
DROP FUNCTION IF EXISTS public.set_minimum_breakdown_rule(text,text,integer,text) CASCADE;
DROP FUNCTION IF EXISTS public.start_action_plan(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.strategy_has_my_descendant(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.strategy_in_my_org(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.submit_action_plan(uuid,text,jsonb,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.submit_action_plan_instance(uuid,text,jsonb,jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.tg_action_plan_sync_chat() CASCADE;
DROP FUNCTION IF EXISTS public.tg_enforce_mbr_block_child() CASCADE;
DROP FUNCTION IF EXISTS public.tg_governance_warning() CASCADE;
DROP FUNCTION IF EXISTS public.tg_initiative_chat_room() CASCADE;
DROP FUNCTION IF EXISTS public.tg_kpi_area_breakdown_touch_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.workspace_card_progress(uuid[]) CASCADE;

-- =====================================================================
-- S3. CREATE OR REPLACE 62 functions with new bodies
-- =====================================================================

-- ---- activate_task(uuid) ----
CREATE OR REPLACE FUNCTION public.activate_task(p_action_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.tasks;
  rule public.task_repeat_rules;
  v_count int;
begin
  select * into a from public.tasks where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.action_plans i where i.id = a.action_plan_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengaktifkan Action Plan ini.';
  end if;
  if a.status <> 'draft' then raise exception 'Action Plan sudah diaktifkan.'; end if;
  if a.pic_id = a.reviewer_id then
    raise exception 'PIC dan Reviewer tidak boleh orang yang sama.';
  end if;

  -- Cabang REPEAT
  if a.repeat_setting = 'repeat' then
    select * into rule from public.task_repeat_rules where task_id = p_action_plan_id;
    if not found then raise exception 'Repeat Rule belum diatur untuk Action Plan ini.'; end if;
    if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
       or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
       or a.priority is null
       or coalesce(trim(a.deadline_time), '') = '' then
      raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, output, definition of done, prioritas, Jam Deadline wajib).';
    end if;
    if a.evidence_required and coalesce(trim(a.evidence_description), '') = '' then
      raise exception 'Bukti yang Diminta wajib dideskripsikan saat Bukti diwajibkan (PRD §22.5).';
    end if;
    update public.tasks set status = 'in_progress' where id = p_action_plan_id;
    v_count := public.generate_action_plan_instances(p_action_plan_id, rule.repeat_end_date);
    perform public.write_activity('task', p_action_plan_id, 'activate_repeat',
      jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id, 'instances', v_count));
    return;
  end if;

  -- Cabang ONE TIME
  if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
     or a.start_date is null or a.deadline is null
     or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
     or a.priority is null
     or coalesce(trim(a.deadline_time), '') = '' then
    raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, tanggal mulai, deadline, Jam Deadline, output, definition of done, prioritas wajib).';
  end if;
  if a.evidence_required and coalesce(trim(a.evidence_description), '') = '' then
    raise exception 'Bukti yang Diminta wajib dideskripsikan saat Bukti diwajibkan (PRD §22.5).';
  end if;
  update public.tasks set status = 'assigned' where id = p_action_plan_id;
  perform public.write_activity('task', p_action_plan_id, 'activate',
    jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id));
end;
$function$;


-- ---- activate_goal(uuid) ----
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


-- ---- activate_action_plan(uuid) ----
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


-- ---- activate_strategy(uuid) ----
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


-- ---- activate_initiative(uuid) ----
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

  -- UI-S-S01 gate: Σ contribution_pct sibling aktif + ini = 100 (PRD §20).
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


-- ---- aggregate_repeat_metrics_per_user(uuid,uuid,date,date) ----
CREATE OR REPLACE FUNCTION public.aggregate_repeat_metrics_per_user(p_user uuid, p_org uuid, p_start date, p_end date)
 RETURNS TABLE(repeat_compliance numeric, on_time_rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ins as (
    select status, submitted_late
    from public.task_instances
    where pic_id = p_user
      and organization_id = p_org
      and status <> 'archived'
      and deadline_at >= p_start::timestamptz
      and deadline_at <  (p_end + 1)::timestamptz
  )
  select
    round(coalesce(100.0 *
      (count(*) filter (where status='done' and not submitted_late))::numeric
      / nullif(count(*), 0), 0), 2) as repeat_compliance,
    round(coalesce(100.0 *
      (count(*) filter (where status in ('done','submitted','revision') and not submitted_late))::numeric
      / nullif(count(*), 0), 0), 2) as on_time_rate
  from ins;
$function$;


-- ---- apply_goal_template(uuid,uuid,date,date,jsonb) ----
CREATE OR REPLACE FUNCTION public.apply_goal_template(p_goal_template_id uuid, p_pic_id uuid, p_period_start date, p_period_end date, p_targets jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.goal_templates; v_goal uuid; v_org uuid;
begin
  if not public.has_permission('create_goal') then
    raise exception 'Anda tidak berwenang membuat Goal.';
  end if;
  select * into t from public.goal_templates where id = p_goal_template_id;
  if not found then raise exception 'Goal Template tidak ditemukan.'; end if;
  v_org := public.current_user_org();
  -- SECURITY DEFINER mem-bypass RLS: pastikan PIC (bila diisi) adalah anggota org pemanggil,
  -- agar tak bisa menetapkan PIC lintas-organisasi lewat RPC.
  if p_pic_id is not null and not exists (
    select 1 from public.profiles where id = p_pic_id and organization_id = v_org
  ) then
    raise exception 'PIC harus anggota organisasi yang sama.';
  end if;

  insert into public.goals (organization_id, name, pic_id, period_start, period_end, status, goal_template_id, created_by)
  values (v_org, t.name, p_pic_id, p_period_start, p_period_end, 'draft', t.id, auth.uid())
  returning id into v_goal;

  -- Target per-KPI dari wizard (PRD §49 step 5); key = id KPI Area template (bukan nama → tahan
  -- nama duplikat antar divisi). Kosong → null (dilengkapi nanti).
  insert into public.strategies (organization_id, goal_id, name, target, pic_id, period_start, period_end, status, created_by)
  select v_org, v_goal, kt.name, nullif(trim(coalesce(p_targets ->> kt.id::text, '')), ''),
         p_pic_id, p_period_start, p_period_end, 'draft', auth.uid()
  from public.strategy_templates kt
  where kt.goal_template_id = p_goal_template_id;

  perform public.write_activity('goal', v_goal, 'apply_template',
    jsonb_build_object('goal_template_id', p_goal_template_id));
  return v_goal;
end;
$function$;


-- ---- approve_cancellation(uuid) ----
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


-- ---- archive_card(text,uuid) ----
CREATE OR REPLACE FUNCTION public.archive_card(p_entity_type text, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tbl text; v_status text; v_pic uuid; v_active_children int := 0;
begin
  v_tbl := case p_entity_type when 'task' then 'tasks'
    when 'action_plan' then 'action_plans' when 'initiative' then 'initiatives'
    when 'strategy' then 'strategies' when 'goal' then 'goals'
    when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end;
  if v_tbl is null then raise exception 'Tipe card tidak valid.'; end if;
  execute format('select status, pic_id from public.%I where id = $1', v_tbl)
    into v_status, v_pic using p_entity_id;
  if v_status is null then raise exception 'Card tidak ditemukan.'; end if;
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


-- ---- backfill_resolve_stale_notifications() ----
CREATE OR REPLACE FUNCTION public.backfill_resolve_stale_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- deadline_change_requested untuk DCR yang sudah non-pending.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, coalesce(d.responded_at, now())),
        resolution  = coalesce(n.resolution, d.status)
    from public.deadline_change_requests d
   where n.type = 'deadline_change_requested'
     and n.entity_type = 'task'
     and n.entity_id   = d.entity_id
     and d.status <> 'pending'
     and n.resolved_at is null;

  -- deadline_change_revision_requested: hilang saat DCR keluar dari revision_requested.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, now()),
        resolution  = coalesce(n.resolution, 'superseded')
    from public.deadline_change_requests d
   where n.type = 'deadline_change_revision_requested'
     and n.entity_type = 'task'
     and n.entity_id   = d.entity_id
     and d.status <> 'revision_requested'
     and n.resolved_at is null;

  -- review_request AP-level untuk submission yang sudah non-pending.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, coalesce(s.reviewed_at, now())),
        resolution  = coalesce(n.resolution, s.review_status)
    from public.task_submissions s
   where n.type = 'review_request'
     and n.entity_type = 'task'
     and n.entity_id   = s.task_id
     and s.task_instance_id is null
     and s.review_status in ('approved','rejected')
     and n.resolved_at is null;

  -- review_request instance-level untuk submission instance yang sudah non-pending.
  update public.notifications n
    set resolved_at = coalesce(n.resolved_at, coalesce(s.reviewed_at, now())),
        resolution  = coalesce(n.resolution, s.review_status)
    from public.task_submissions s
   where n.type = 'review_request'
     and n.entity_type = 'task_instance'
     and n.entity_id   = s.task_instance_id
     and s.review_status in ('approved','rejected')
     and n.resolved_at is null;
end;
$function$;


-- ---- can_access_task(uuid) ----
CREATE OR REPLACE FUNCTION public.can_access_task(p_task uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.tasks a
    left join public.action_plans i on i.id = a.action_plan_id
    where a.id = p_task
      and a.organization_id = public.current_user_org()
      and (public.can_view_workspace() or a.pic_id = auth.uid()
           or a.reviewer_id = auth.uid() or a.created_by = auth.uid()
           or i.pic_id = auth.uid())
      and (
        not exists (select 1 from public.confidential_access_rules cr
                    where cr.entity_type = 'task' and cr.entity_id = a.id)
        or public.user_role_level() = 'ceo'
        or a.pic_id = auth.uid()
        or exists (select 1 from public.confidential_access_rules cr
                   where cr.entity_type = 'task' and cr.entity_id = a.id
                     and cr.user_id = auth.uid())
      )
  );
$function$;


-- ---- can_access_strategy(uuid) ----
CREATE OR REPLACE FUNCTION public.can_access_strategy(p_strategy uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.strategies k where k.id = p_strategy
      and k.organization_id = public.current_user_org()
      and (public.can_view_workspace() or k.pic_id = auth.uid() or k.created_by = auth.uid()
           or public.is_goal_pic(k.goal_id) or public.strategy_has_my_descendant(k.id))
  );
$function$;


-- ---- can_access_initiative(uuid) ----
CREATE OR REPLACE FUNCTION public.can_access_initiative(p_initiative uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.initiatives s where s.id = p_initiative
      and s.organization_id = public.current_user_org()
      and (public.can_view_workspace() or s.pic_id = auth.uid() or s.created_by = auth.uid()
           or public.is_strategy_pic(s.strategy_id) or public.initiative_has_my_descendant(s.id))
  );
$function$;


-- ---- can_edit_strategy_breakdown(uuid) ----
CREATE OR REPLACE FUNCTION public.can_edit_strategy_breakdown(p_strategy_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.strategies k
    where k.id = p_strategy_id
      and k.organization_id = public.current_user_org()
      and (
        k.pic_id = auth.uid()
        or k.created_by = auth.uid()
        or public.has_permission('manage_others_cards')
        or public.is_goal_pic(k.goal_id)
      )
  );
$function$;


-- ---- cancel_card(text,uuid,text) ----
CREATE OR REPLACE FUNCTION public.cancel_card(p_entity_type text, p_entity_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_org uuid;
  v_caller_org uuid;
  v_active_children int := 0;
  v_is_ceo boolean;
  v_can_manage boolean;
  v_pic uuid;
  v_created_by uuid;
  v_authorized boolean;
begin
  if p_entity_type not in ('task','action_plan','initiative','strategy','goal',
                           'development_area','problem_statement') then
    raise exception 'Tipe card tidak valid.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi.';
  end if;

  v_caller_org := public.current_user_org();
  if v_caller_org is null then
    raise exception 'Sesi tidak valid.';
  end if;

  -- Resolve organization_id + pic_id/created_by target untuk org-scoping + authz.
  -- Tabel-tabel yang berbeda punya kolom berbeda; tangani per-cabang.
  if p_entity_type = 'task' then
    select organization_id, pic_id, created_by into v_org, v_pic, v_created_by
      from public.tasks where id = p_entity_id;
  elsif p_entity_type = 'action_plan' then
    select organization_id, pic_id, created_by into v_org, v_pic, v_created_by
      from public.action_plans where id = p_entity_id;
  elsif p_entity_type = 'initiative' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.initiatives where id = p_entity_id;
  elsif p_entity_type = 'strategy' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.strategies where id = p_entity_id;
  elsif p_entity_type = 'goal' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.goals where id = p_entity_id;
  elsif p_entity_type = 'development_area' then
    select organization_id, null::uuid, created_by into v_org, v_pic, v_created_by
      from public.development_areas where id = p_entity_id;
  elsif p_entity_type = 'problem_statement' then
    select organization_id, pic_id, created_by into v_org, v_pic, v_created_by
      from public.problem_statements where id = p_entity_id;
  end if;

  if v_org is null then
    raise exception 'Card tidak ditemukan.';
  end if;
  if v_org <> v_caller_org then
    raise exception 'Card di luar organisasi Anda.';
  end if;

  v_is_ceo := (public.user_role_level() = 'ceo');
  v_can_manage := public.has_permission('manage_others_cards');
  v_authorized := v_is_ceo
                  or v_can_manage
                  or (v_pic is not null and v_pic = auth.uid())
                  or (v_created_by is not null and v_created_by = auth.uid());

  if not v_authorized then
    raise exception 'Anda tidak berwenang membatalkan card ini.';
  end if;

  -- Hitung child aktif (status not in archived/cancelled) — sekarang org-scoped sudah aman.
  if p_entity_type = 'goal' then
    select count(*) into v_active_children from public.strategies
      where goal_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'strategy' then
    select count(*) into v_active_children from public.initiatives
      where strategy_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'initiative' then
    select count(*) into v_active_children from public.action_plans
      where initiative_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'action_plan' then
    select count(*) into v_active_children from public.tasks
      where action_plan_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'development_area' then
    select count(*) into v_active_children from public.problem_statements
      where development_area_id = p_entity_id and status not in ('archived','cancelled');
  elsif p_entity_type = 'problem_statement' then
    select count(*) into v_active_children from public.action_plans
      where problem_statement_id = p_entity_id and status not in ('archived','cancelled');
  end if;
  if v_active_children > 0 then
    raise exception 'Terdapat % card turunan yang masih aktif.', v_active_children;
  end if;

  insert into public.cancellations (organization_id, entity_type, entity_id, cancelled_by, reason,
    approval_status, approved_by, approved_at)
  values (v_caller_org, p_entity_type, p_entity_id, auth.uid(), trim(p_reason),
    case when v_is_ceo then 'auto_approved' else 'pending' end,
    case when v_is_ceo then auth.uid() else null end,
    case when v_is_ceo then now() else null end)
  returning id into v_id;

  if v_is_ceo then
    -- Org sudah diverifikasi di atas; mutasi tetap bawa filter org untuk defense-in-depth.
    execute format(
      'update public.%I set status = ''cancelled'' where id = $1 and organization_id = $2',
      case p_entity_type
        when 'task' then 'tasks'
        when 'action_plan' then 'action_plans'
        when 'initiative' then 'initiatives'
        when 'strategy' then 'strategies'
        when 'goal' then 'goals'
        when 'development_area' then 'development_areas'
        when 'problem_statement' then 'problem_statements'
      end
    ) using p_entity_id, v_caller_org;
    perform public.write_activity(p_entity_type, p_entity_id, 'card_cancelled',
      jsonb_build_object('cancellation_id', v_id, 'reason', trim(p_reason)));
  else
    perform public.write_activity(p_entity_type, p_entity_id, 'cancellation_requested',
      jsonb_build_object('cancellation_id', v_id, 'reason', trim(p_reason)));
  end if;
  return v_id;
end;
$function$;


-- ---- check_minimum_breakdown_compliance(text,uuid) ----
CREATE OR REPLACE FUNCTION public.check_minimum_breakdown_compliance(p_parent_card_type text, p_parent_card_id uuid)
 RETURNS TABLE(child_card_type text, current_count integer, required_count integer, enforcement_mode text, meets_requirement boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_child text;
  v_count int := 0;
  v_rule public.minimum_breakdown_rules;
begin
  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Organisasi tidak ditemukan.';
  end if;

  -- Tentukan child terdekat + autz akses parent + tenant check.
  if p_parent_card_type = 'goal' then
    if not public.can_access_goal(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Goal ini.';
    end if;
    v_child := 'strategy';
    select count(*) into v_count from public.strategies
      where goal_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'strategy' then
    if not public.can_access_strategy(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca KPI Area ini.';
    end if;
    v_child := 'initiative';
    select count(*) into v_count from public.initiatives
      where strategy_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'initiative' then
    if not public.can_access_initiative(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Strategy ini.';
    end if;
    v_child := 'action_plan';
    select count(*) into v_count from public.action_plans
      where initiative_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'action_plan' then
    if not public.can_access_action_plan(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Initiative ini.';
    end if;
    v_child := 'task';
    select count(*) into v_count from public.tasks
      where action_plan_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'development_area' then  -- Fase 6
    if not public.can_access_development_area(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Development Area ini.';
    end if;
    v_child := 'problem_statement';
    select count(*) into v_count from public.problem_statements
      where development_area_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  elsif p_parent_card_type = 'problem_statement' then  -- Fase 6
    if not public.can_access_problem_statement(p_parent_card_id) then
      raise exception 'Anda tidak berwenang membaca Problem Statement ini.';
    end if;
    v_child := 'action_plan';
    select count(*) into v_count from public.action_plans
      where problem_statement_id = p_parent_card_id and status <> 'archived'
        and organization_id = v_org;
  else
    raise exception 'parent_card_type tidak didukung: %', p_parent_card_type;
  end if;

  v_rule := public.current_minimum_breakdown_rule(p_parent_card_type, v_child);
  if v_rule.id is null then
    -- Tanpa rule → fail-open (compliant).
    child_card_type := v_child;
    current_count := v_count;
    required_count := 0;
    enforcement_mode := 'hanya_peringatan';
    meets_requirement := true;
    return next;
    return;
  end if;

  child_card_type := v_child;
  current_count := v_count;
  required_count := v_rule.min_count;
  enforcement_mode := v_rule.enforcement_mode;
  meets_requirement := (v_count >= v_rule.min_count);
  return next;
end;
$function$;


-- ---- cleanup_orphan_upload(text) ----
CREATE OR REPLACE FUNCTION public.cleanup_orphan_upload(p_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  parts text[];
  v_ap_id uuid;
  v_draft_id uuid;
  v_pic uuid;
  v_status text;
begin
  parts := string_to_array(p_path, '/');
  if array_length(parts, 1) < 4 then raise exception 'Path tidak valid.'; end if;
  begin
    v_ap_id := parts[2]::uuid;
    v_draft_id := parts[3]::uuid;
  exception when others then raise exception 'Path tidak valid (UUID parse error).';
  end;
  select pic_id into v_pic from public.tasks where id = v_ap_id;
  if v_pic is null or v_pic <> auth.uid() then
    perform public.log_governance_violation(auth.uid(), 'orphan_cleanup_unauthorized', 'task',
      v_ap_id, 'medium', jsonb_build_object('path', p_path));
    raise exception 'Tidak berwenang membersihkan upload pada Action Plan ini.';
  end if;
  select status into v_status from public.task_submissions where id = v_draft_id;
  if v_status is null or v_status <> 'draft' then
    raise exception 'Submission sudah final / tidak ditemukan — cleanup ditolak (evidence locking).';
  end if;
  -- Bypass storage.protect_delete trigger (cek GUC storage.allow_delete_query).
  -- Aman: SECURITY DEFINER + sudah re-validate ownership + status di atas.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'evidence' and name = p_path;
end;
$function$;


-- ---- compute_action_plan_completion(uuid,uuid,date,date) ----
CREATE OR REPLACE FUNCTION public.compute_action_plan_completion(p_user uuid, p_org uuid, p_start date, p_end date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with assigned as (
    select id from public.tasks
    where pic_id = p_user and organization_id = p_org
      and repeat_setting = 'one_time'
      and status <> 'archived'
      and (start_date is null or start_date <= p_end)
      and (deadline is null or deadline >= p_start)
  ), approved as (
    select distinct s.task_id
    from public.task_submissions s
    join assigned a on a.id = s.task_id
    where s.review_status = 'approved'
      and s.reviewed_at is not null
      and s.reviewed_at >= p_start::timestamptz
      and s.reviewed_at <  (p_end + 1)::timestamptz
  )
  select round(coalesce(100.0 * (select count(*) from approved)::numeric
    / nullif((select count(*) from assigned), 0), 0), 2);
$function$;


-- ---- compute_review_pass_rate(uuid,uuid,date,date) ----
CREATE OR REPLACE FUNCTION public.compute_review_pass_rate(p_user uuid, p_org uuid, p_start date, p_end date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with subs as (
    select s.review_status
    from public.task_submissions s
    join public.tasks ap on ap.id = s.task_id
    where s.submitted_by = p_user
      and ap.organization_id = p_org
      and s.submitted_at >= p_start::timestamptz
      and s.submitted_at <  (p_end + 1)::timestamptz
  )
  select round(
    coalesce(
      100.0 * (count(*) filter (where review_status='approved'))::numeric
      / nullif(count(*), 0),
      0
    ),
    2
  ) from subs;
$function$;


-- ---- create_comment(text,uuid,text,uuid[]) ----
CREATE OR REPLACE FUNCTION public.create_comment(p_entity_type text, p_entity_id uuid, p_body text, p_mentions uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid := public.current_user_org();
  v_uid uuid := auth.uid();
  v_id uuid;
  v_access boolean;
  v_mention uuid;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'Komentar tidak boleh kosong.'; end if;
  if p_entity_type not in ('task', 'action_plan', 'task_instance') then
    raise exception 'entity_type komentar tidak valid.';
  end if;

  v_access := case
    when p_entity_type = 'task' then public.can_access_task(p_entity_id)
    when p_entity_type = 'action_plan' then public.can_access_action_plan(p_entity_id)
    when p_entity_type = 'task_instance' then exists (
      select 1 from public.task_instances i
      where i.id = p_entity_id and public.can_access_task(i.task_id))
    else false end;
  if not v_access then raise exception 'Anda tidak berhak mengomentari item ini.'; end if;

  insert into public.comments (organization_id, entity_type, entity_id, author_id, body)
  values (v_org, p_entity_type, p_entity_id, v_uid, trim(p_body))
  returning id into v_id;

  -- Mention akses-gated: hanya id yang juga punya akses entity.
  if p_mentions is not null then
    for v_mention in select distinct unnest(p_mentions) loop
      if v_mention <> v_uid and (
        case
          when p_entity_type = 'task' then public.can_access_task(p_entity_id)
          when p_entity_type = 'action_plan' then public.can_access_action_plan(p_entity_id)
          else exists (select 1 from public.task_instances i
                       where i.id = p_entity_id and public.can_access_task(i.task_id))
        end)
      then
        insert into public.mentions (comment_id, mentioned_user_id) values (v_id, v_mention);
        perform public.emit_notification(v_org, v_mention, v_uid, 'mention',
          p_entity_type, p_entity_id, 'Anda disebut dalam komentar', null);
      end if;
    end loop;
  end if;

  return v_id;
end;
$function$;


-- ---- create_submission_draft(uuid,integer) ----
CREATE OR REPLACE FUNCTION public.create_submission_draft(p_action_plan_id uuid, p_attachment_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.tasks;
  v_version int;
  v_draft_id uuid;
begin
  if p_attachment_count < 0 or p_attachment_count > 5 then
    raise exception 'Jumlah lampiran 0..5 (OD-2 cap).';
  end if;
  select * into a from public.tasks where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if a.pic_id is null or a.pic_id <> auth.uid() then
    perform public.log_governance_violation(auth.uid(), 'submit_non_pic', 'task', p_action_plan_id,
      'medium', jsonb_build_object('attempted_by', auth.uid(), 'expected_pic', a.pic_id));
    raise exception 'Hanya PIC yang dapat membuat draft submission.';
  end if;
  if a.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Action Plan tidak dalam status yang bisa disubmit.';
  end if;
  if exists (
    select 1 from public.task_submissions
      where task_id = p_action_plan_id
        and status = 'submitted'
        and review_status = 'pending'
  ) then
    raise exception 'Sesi review masih berjalan. Tunggu Reviewer memutuskan terlebih dahulu.';
  end if;
  select coalesce(max(version_number), 0) + 1 into v_version
    from public.task_submissions where task_id = p_action_plan_id;
  insert into public.task_submissions
    (task_id, version_number, submitted_by, status, review_status)
  values (p_action_plan_id, v_version, auth.uid(), 'draft', 'pending')
  returning id into v_draft_id;
  return v_draft_id;
end;
$function$;


-- ---- development_area_has_my_descendant(uuid) ----
CREATE OR REPLACE FUNCTION public.development_area_has_my_descendant(p_dev_area uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.problem_statements p
    where p.development_area_id = p_dev_area
      and (p.pic_id = auth.uid() or p.created_by = auth.uid()
        or exists (select 1 from public.action_plans i where i.problem_statement_id = p.id
          and (i.pic_id = auth.uid() or i.created_by = auth.uid()
            or exists (select 1 from public.tasks a where a.action_plan_id = i.id
              and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))))
  );
$function$;


-- ---- emit_deadline_notifications() ----
CREATE OR REPLACE FUNCTION public.emit_deadline_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_count int := 0;
begin
  -- Action Plan one-time: deadline dalam (org_today, org_today+3].
  for r in
    select a.id, a.organization_id, a.pic_id, a.name, a.deadline,
           public.org_today(a.organization_id) as today
    from public.tasks a
    where a.repeat_setting <> 'repeat'
      and a.status in ('assigned', 'in_progress', 'revision')
      and a.pic_id is not null
      and a.deadline is not null
  loop
    if r.deadline > r.today and r.deadline <= r.today + 3 then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'deadline_reminder',
        'task', r.id, 'Deadline mendekat', r.name, r.today);
      v_count := v_count + 1;
    end if;
  end loop;

  -- Instance: due today → repeat_due; mendekat (<=3 hari) → deadline_reminder.
  for r in
    select i.id, i.organization_id, i.pic_id, i.deadline_at,
           public.org_today(i.organization_id) as today,
           (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date as due_date
    from public.task_instances i
    join public.organizations o on o.id = i.organization_id
    where i.status in ('assigned', 'in_progress') and i.pic_id is not null
  loop
    if r.due_date = r.today then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'repeat_due',
        'task_instance', r.id, 'Tugas rutin hari ini', null, r.today);
      v_count := v_count + 1;
    elsif r.due_date > r.today and r.due_date <= r.today + 3 then
      perform public.emit_notification(r.organization_id, r.pic_id, null, 'deadline_reminder',
        'task_instance', r.id, 'Deadline mendekat', null, r.today);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;


-- ---- generate_action_plan_instances(uuid,date) ----
CREATE OR REPLACE FUNCTION public.generate_action_plan_instances(p_action_plan_id uuid, p_through_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_through date;
  v_tz text;
  v_total int := 0;
  v_ins int;
begin
  for r in
    select rr.*, a.pic_id as ap_pic, a.reviewer_id as ap_reviewer, a.organization_id as ap_org
    from public.task_repeat_rules rr
    join public.tasks a on a.id = rr.task_id
    where (p_action_plan_id is not null and rr.task_id = p_action_plan_id)
       or (p_action_plan_id is null and a.repeat_setting = 'repeat' and a.status = 'in_progress')
  loop
    v_through := least(r.repeat_end_date, coalesce(p_through_date, r.repeat_end_date));
    if v_through < r.repeat_start_date then continue; end if;

    select coalesce(o.timezone, 'Asia/Jakarta') into v_tz
      from public.organizations o where o.id = r.ap_org;

    with candidate as (
      select g::date as instance_date
      from generate_series(r.repeat_start_date::timestamp, v_through::timestamp, interval '1 day') as g
      where r.frequency = 'daily'
         or (r.frequency = 'weekly'  and extract(dow from g)::int = any (r.weekdays))
         or (r.frequency = 'monthly' and extract(day from g)::int = any (r.month_days))
      union
      select cd
      from unnest(coalesce(r.custom_dates, '{}'::date[])) as cd
      where r.frequency = 'custom' and cd between r.repeat_start_date and v_through
    )
    insert into public.task_instances
      (organization_id, task_id, repeat_rule_id, instance_date, instance_time,
       deadline_at, pic_id, reviewer_id, status)
    select r.ap_org, r.task_id, r.id, c.instance_date, r.time_of_day,
           (c.instance_date + r.time_of_day) at time zone v_tz,
           r.ap_pic, r.ap_reviewer, 'assigned'
    from candidate c
    on conflict (task_id, instance_date) do nothing;

    get diagnostics v_ins = row_count;
    v_total := v_total + v_ins;
  end loop;

  -- Logging hanya untuk eager (konteks user); cron memakai write_activity_system di mark-overdue.
  if p_action_plan_id is not null and v_total > 0 then
    perform public.write_activity('task', p_action_plan_id, 'instances_generated',
      jsonb_build_object('count', v_total));
  end if;

  return v_total;
end;
$function$;


-- ---- get_chat_rooms() ----
CREATE OR REPLACE FUNCTION public.get_chat_rooms()
 RETURNS TABLE(id uuid, action_plan_id uuid, name text, unread_count integer, last_message_at timestamp with time zone, last_message_body text, last_message_author_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.id, r.action_plan_id, r.name,
    (select count(*) from public.chat_messages cm
       where cm.chat_room_id = r.id
         and cm.author_id is distinct from auth.uid()
         and not exists (select 1 from public.chat_message_reads cr
                         where cr.chat_message_id = cm.id and cr.reader_id = auth.uid()))::int as unread_count,
    latest.created_at as last_message_at,
    latest.body       as last_message_body,
    latest.author_name as last_message_author_name
  from public.chat_rooms r
  left join lateral (
    select cm.created_at, cm.body, p.full_name as author_name
    from public.chat_messages cm
    left join public.profiles p on p.id = cm.author_id
    where cm.chat_room_id = r.id
    order by cm.created_at desc, cm.id desc
    limit 1
  ) latest on true
  where public.is_chat_member(r.id)
  order by latest.created_at desc nulls last;
$function$;


-- ---- get_near_deadline_items() ----
CREATE OR REPLACE FUNCTION public.get_near_deadline_items()
 RETURNS TABLE(kind text, id uuid, task_id uuid, name text, due date, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'task', a.id, a.id, a.name, a.deadline, a.status
  from public.tasks a
  where a.pic_id = auth.uid() and a.repeat_setting <> 'repeat'
    and a.status in ('assigned', 'in_progress', 'revision')
    and a.deadline is not null
    and a.deadline > public.org_today() and a.deadline <= public.org_today() + 3
  union all
  select 'instance', i.id, i.task_id, a.name,
         (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date, i.status
  from public.task_instances i
  join public.tasks a on a.id = i.task_id
  join public.organizations o on o.id = i.organization_id
  where i.pic_id = auth.uid() and i.status in ('assigned', 'in_progress')
    and (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date > public.org_today()
    and (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date <= public.org_today() + 3;
$function$;


-- ---- get_overdue_items() ----
CREATE OR REPLACE FUNCTION public.get_overdue_items()
 RETURNS TABLE(kind text, id uuid, task_id uuid, name text, due date, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'task', a.id, a.id, a.name, a.deadline, a.status
  from public.tasks a
  where a.pic_id = auth.uid() and a.repeat_setting <> 'repeat'
    and a.status in ('assigned', 'in_progress', 'revision')
    and a.deadline is not null and a.deadline < public.org_today()
  union all
  select 'instance', i.id, i.task_id, a.name,
         (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date, i.status
  from public.task_instances i
  join public.tasks a on a.id = i.task_id
  join public.organizations o on o.id = i.organization_id
  where i.pic_id = auth.uid() and i.status = 'missed';
$function$;


-- ---- get_repeat_compliance(uuid) ----
CREATE OR REPLACE FUNCTION public.get_repeat_compliance(p_action_plan_id uuid)
 RETURNS TABLE(expected_count integer, on_time_count integer, missed_count integer, done_count integer, compliance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.tasks;
begin
  select * into a from public.tasks where id = p_action_plan_id;
  if not found or a.repeat_setting <> 'repeat' then
    return;  -- one_time / tak ada → tabel kosong (compliance dianggap NULL di klien).
  end if;
  if not public.can_access_task(p_action_plan_id) then
    return;
  end if;

  return query
  with ev as (
    select i.status, i.submitted_at,
           case when rr.missed_rule = 'grace_period'
                then i.deadline_at + make_interval(mins => coalesce(rr.grace_period_minutes, 0))
                else i.deadline_at end as effective_deadline
    from public.task_instances i
    join public.task_repeat_rules rr on rr.id = i.repeat_rule_id
    where i.task_id = p_action_plan_id
      and i.status <> 'archived'
  )
  select
    count(*)::int as expected_count,
    count(*) filter (where status = 'done' and submitted_at is not null and submitted_at <= effective_deadline)::int as on_time_count,
    count(*) filter (where status = 'missed')::int as missed_count,
    count(*) filter (where status = 'done')::int as done_count,
    case when count(*) = 0 then null
         else round(
           count(*) filter (where status = 'done' and submitted_at is not null and submitted_at <= effective_deadline)::numeric
           / count(*)::numeric, 4)
    end as compliance
  from ev;
end;
$function$;


-- ---- get_today_repeat_instances() ----
CREATE OR REPLACE FUNCTION public.get_today_repeat_instances()
 RETURNS TABLE(kind text, id uuid, task_id uuid, name text, due date, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select 'instance', i.id, i.task_id, a.name,
         (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date, i.status
  from public.task_instances i
  join public.tasks a on a.id = i.task_id
  join public.organizations o on o.id = i.organization_id
  where i.pic_id = auth.uid()
    and i.status in ('assigned', 'in_progress')
    and (i.deadline_at at time zone coalesce(o.timezone, 'Asia/Jakarta'))::date = public.org_today()
  order by i.deadline_at asc;
$function$;


-- ---- goal_has_my_descendant(uuid) ----
CREATE OR REPLACE FUNCTION public.goal_has_my_descendant(p_goal uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.strategies k where k.goal_id = p_goal
      and (k.pic_id = auth.uid() or k.created_by = auth.uid()
        or exists (select 1 from public.initiatives s where s.strategy_id = k.id
          and (s.pic_id = auth.uid() or s.created_by = auth.uid()
            or exists (select 1 from public.action_plans i where i.initiative_id = s.id
              and (i.pic_id = auth.uid() or i.created_by = auth.uid()
                or exists (select 1 from public.tasks a where a.action_plan_id = i.id
                  and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))))))
  );
$function$;


-- ---- grant_confidential_access(text,uuid,uuid,text,text) ----
CREATE OR REPLACE FUNCTION public.grant_confidential_access(p_entity_type text, p_entity_id uuid, p_user_id uuid, p_access_level text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_org uuid;
  v_entity_org uuid;
  v_target_org uuid;
begin
  if not public.has_permission('manage_confidential_access') then
    raise exception 'Anda tidak berwenang mengelola Akses Rahasia.';
  end if;
  if p_entity_type not in ('task','action_plan','initiative','strategy','goal') then
    raise exception 'Tipe card tidak valid untuk akses rahasia.';
  end if;
  if coalesce(p_access_level,'restricted') not in ('restricted','confidential') then
    raise exception 'Level akses tidak valid.';
  end if;
  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Sesi tidak valid.';
  end if;

  -- Resolve organization_id entity target per tipe.
  if p_entity_type = 'task' then
    select organization_id into v_entity_org from public.tasks where id = p_entity_id;
  elsif p_entity_type = 'action_plan' then
    select organization_id into v_entity_org from public.action_plans where id = p_entity_id;
  elsif p_entity_type = 'initiative' then
    select organization_id into v_entity_org from public.initiatives where id = p_entity_id;
  elsif p_entity_type = 'strategy' then
    select organization_id into v_entity_org from public.strategies where id = p_entity_id;
  elsif p_entity_type = 'goal' then
    select organization_id into v_entity_org from public.goals where id = p_entity_id;
  end if;
  if v_entity_org is null or v_entity_org <> v_org then
    raise exception 'Card target di luar organisasi Anda.';
  end if;

  select organization_id into v_target_org from public.profiles where id = p_user_id;
  if v_target_org is null or v_target_org <> v_org then
    raise exception 'Target user di luar organisasi Anda.';
  end if;

  insert into public.confidential_access_rules
    (organization_id, entity_type, entity_id, user_id, access_level, granted_by, approval_reason)
  values (v_org, p_entity_type, p_entity_id, p_user_id, coalesce(p_access_level,'restricted'),
          auth.uid(), nullif(trim(coalesce(p_reason,'')),''))
  on conflict (entity_type, entity_id, user_id) do update set
    access_level = excluded.access_level, approval_reason = excluded.approval_reason,
    granted_by = excluded.granted_by
  returning id into v_id;
  perform public.write_activity(p_entity_type, p_entity_id, 'confidential_access_granted',
    jsonb_build_object('user_id', p_user_id, 'access_level', coalesce(p_access_level,'restricted')));
  return v_id;
end;
$function$;


-- ---- i_am_action_plan_pic(uuid) ----
CREATE OR REPLACE FUNCTION public.i_am_action_plan_pic(p_action_plan uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.action_plans i
    where i.id = p_action_plan and i.pic_id = auth.uid()
  );
$function$;


-- ---- i_am_problem_statement_pic_via_action_plan(uuid) ----
CREATE OR REPLACE FUNCTION public.i_am_problem_statement_pic_via_action_plan(p_action_plan uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.action_plans i
    join public.problem_statements p on p.id = i.problem_statement_id
    where i.id = p_action_plan
      and p.organization_id = public.current_user_org()
      and p.pic_id = auth.uid()
  );
$function$;


-- ---- action_plan_has_my_task(uuid) ----
CREATE OR REPLACE FUNCTION public.action_plan_has_my_task(p_action_plan uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.tasks a
    where a.action_plan_id = p_action_plan
      and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())
  );
$function$;


-- ---- is_strategy_pic(uuid) ----
CREATE OR REPLACE FUNCTION public.is_strategy_pic(p_strategy uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.strategies k
                 where k.id = p_strategy and k.organization_id = public.current_user_org() and k.pic_id = auth.uid());
$function$;


-- ---- is_supervisor_of(uuid) ----
CREATE OR REPLACE FUNCTION public.is_supervisor_of(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(p_user, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid() and exists (
    -- Performance chain: AP.pic = p_user, leluhur PIC = auth.uid()
    select 1 from public.tasks a
    left join public.action_plans i on i.id = a.action_plan_id
    left join public.initiatives s on s.id = i.initiative_id
    left join public.strategies k on k.id = s.strategy_id
    left join public.goals g on g.id = k.goal_id
    where a.pic_id = p_user
      and a.organization_id = public.current_user_org()
      and (i.pic_id = auth.uid() or s.pic_id = auth.uid()
           or k.pic_id = auth.uid() or g.pic_id = auth.uid())
    union all
    -- Development chain via problem_statement
    select 1 from public.tasks a
    join public.action_plans i on i.id = a.action_plan_id
    join public.problem_statements ps on ps.id = i.problem_statement_id
    join public.development_areas da on da.id = ps.development_area_id
    where a.pic_id = p_user
      and a.organization_id = public.current_user_org()
      and (i.pic_id = auth.uid() or ps.pic_id = auth.uid() or da.pic_id = auth.uid())
    union all
    -- PIC Initiative langsung sebagai p_user
    select 1 from public.action_plans i
    left join public.initiatives s on s.id = i.initiative_id
    left join public.strategies k on k.id = s.strategy_id
    left join public.goals g on g.id = k.goal_id
    left join public.problem_statements ps on ps.id = i.problem_statement_id
    left join public.development_areas da on da.id = ps.development_area_id
    where i.pic_id = p_user
      and i.organization_id = public.current_user_org()
      and (s.pic_id = auth.uid() or k.pic_id = auth.uid() or g.pic_id = auth.uid()
           or ps.pic_id = auth.uid() or da.pic_id = auth.uid())
  );
$function$;


-- ---- strategy_breakdown_replace(uuid,jsonb,jsonb,text) ----
CREATE OR REPLACE FUNCTION public.strategy_breakdown_replace(p_strategy_id uuid, p_quarter jsonb, p_month jsonb, p_reason text)
 RETURNS SETOF strategy_target_breakdowns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_old jsonb;
  v_new jsonb;
  v_quarter_sum numeric;
  v_quarter_count int;
  v_month_quarters text[];
  v_month_q text;
  v_month_sum numeric;
  v_month_count int;
begin
  -- ---------------------------------------------------------- guard: reason
  if length(coalesce(trim(p_reason), '')) < 8 then
    raise exception 'Alasan perubahan wajib minimal 8 karakter.';
  end if;

  -- ---------------------------------------------------------- guard: permission
  if not public.can_edit_strategy_breakdown(p_strategy_id) then
    raise exception 'Anda tidak berwenang mengubah Target Breakdown KPI Area ini.';
  end if;

  -- Resolve org_id KPI Area (sumber kebenaran utk baris breakdown — strategy = tenant boundary).
  select organization_id into v_org from public.strategies where id = p_strategy_id;
  if v_org is null then
    raise exception 'KPI Area tidak ditemukan.';
  end if;

  -- ---------------------------------------------------------- guard: shape & Σ quarter
  if p_quarter is not null then
    if jsonb_typeof(p_quarter) <> 'array' then
      raise exception 'p_quarter harus berupa JSON array.';
    end if;
    select count(*), coalesce(sum( (e->>'pct')::numeric ), 0)
      into v_quarter_count, v_quarter_sum
      from jsonb_array_elements(p_quarter) as e;
    if v_quarter_count > 0 then
      if v_quarter_count <> 4 then
        raise exception 'Breakdown Quarter harus berisi 4 entri (Q1..Q4); ditemukan %.', v_quarter_count;
      end if;
      -- Toleransi sangat ketat: 100.000 ± 0.001 (numeric(6,3)).
      if abs(v_quarter_sum - 100) > 0.001 then
        raise exception 'Total kontribusi Quarter harus 100%%; saat ini %.', v_quarter_sum;
      end if;
    end if;
  end if;

  -- ---------------------------------------------------------- guard: shape & Σ month per Quarter
  if p_month is not null then
    if jsonb_typeof(p_month) <> 'array' then
      raise exception 'p_month harus berupa JSON array.';
    end if;
    -- Group sums per parent_quarter_key.
    select array_agg(distinct (e->>'parent_quarter_key'))
      into v_month_quarters
      from jsonb_array_elements(p_month) as e;
    if v_month_quarters is not null then
      foreach v_month_q in array v_month_quarters loop
        if v_month_q is null then
          raise exception 'Setiap entri Month wajib punya parent_quarter_key.';
        end if;
        select count(*), coalesce(sum( (e->>'pct')::numeric ), 0)
          into v_month_count, v_month_sum
          from jsonb_array_elements(p_month) as e
          where e->>'parent_quarter_key' = v_month_q;
        if v_month_count <> 3 then
          raise exception 'Breakdown Month per Quarter % harus berisi 3 entri; ditemukan %.', v_month_q, v_month_count;
        end if;
        if abs(v_month_sum - 100) > 0.001 then
          raise exception 'Total kontribusi Month untuk Quarter % harus 100%%; saat ini %.', v_month_q, v_month_sum;
        end if;
      end loop;
    end if;
  end if;

  -- ---------------------------------------------------------- snapshot old utk activity_log
  select coalesce(jsonb_agg(jsonb_build_object(
            'period_type', period_type,
            'period_key', period_key,
            'parent_quarter_key', parent_quarter_key,
            'contribution_pct', contribution_pct
          ) order by period_type, period_key), '[]'::jsonb)
    into v_old
    from public.strategy_target_breakdowns
   where strategy_id = p_strategy_id;

  -- ---------------------------------------------------------- atomic replace
  -- Hapus per period_type yang sedang di-replace (NULL = jangan sentuh tipe itu).
  -- Catatan: trigger append-only delete tidak bisa apply ke RPC SECURITY DEFINER scope dgn
  -- session_user. Solusi: drop trigger sesaat tidak aman → pakai pendekatan UPDATE-or-INSERT.
  -- Implementasi: untuk setiap input baris, INSERT … ON CONFLICT (strategy_id, period_type, period_key)
  -- DO UPDATE SET contribution_pct, parent_quarter_key, reason, updated_at, created_by.
  -- Untuk baris yang TIDAK ada di input tapi ada di DB pada period_type tsb → set pct=0 (idempotent default).
  -- Untuk V1 sederhana: kalau caller kirim p_quarter empty array → tidak menyentuh; non-empty → upsert 4 baris.
  if p_quarter is not null and jsonb_array_length(p_quarter) = 4 then
    insert into public.strategy_target_breakdowns (
      organization_id, strategy_id, period_type, period_key, parent_quarter_key,
      contribution_pct, reason, created_by
    )
    select v_org, p_strategy_id, 'quarter', e->>'period_key', null,
           (e->>'pct')::numeric, p_reason, auth.uid()
      from jsonb_array_elements(p_quarter) as e
    on conflict (strategy_id, period_type, period_key)
      do update set
        contribution_pct = excluded.contribution_pct,
        parent_quarter_key = excluded.parent_quarter_key,
        reason = excluded.reason,
        created_by = excluded.created_by,
        updated_at = now();
  end if;

  if p_month is not null and jsonb_array_length(p_month) > 0 then
    insert into public.strategy_target_breakdowns (
      organization_id, strategy_id, period_type, period_key, parent_quarter_key,
      contribution_pct, reason, created_by
    )
    select v_org, p_strategy_id, 'month',
           e->>'period_key', e->>'parent_quarter_key',
           (e->>'pct')::numeric, p_reason, auth.uid()
      from jsonb_array_elements(p_month) as e
    on conflict (strategy_id, period_type, period_key)
      do update set
        contribution_pct = excluded.contribution_pct,
        parent_quarter_key = excluded.parent_quarter_key,
        reason = excluded.reason,
        created_by = excluded.created_by,
        updated_at = now();
  end if;

  -- ---------------------------------------------------------- audit
  select coalesce(jsonb_agg(jsonb_build_object(
            'period_type', period_type,
            'period_key', period_key,
            'parent_quarter_key', parent_quarter_key,
            'contribution_pct', contribution_pct
          ) order by period_type, period_key), '[]'::jsonb)
    into v_new
    from public.strategy_target_breakdowns
   where strategy_id = p_strategy_id;

  perform public.write_activity(
    'strategy', p_strategy_id, 'target_breakdown_updated',
    jsonb_build_object('old', v_old, 'new', v_new, 'reason', p_reason)
  );

  -- ---------------------------------------------------------- return seluruh state baru
  return query
    select * from public.strategy_target_breakdowns
     where strategy_id = p_strategy_id
     order by period_type, period_key;
end;
$function$;


-- ---- strategy_has_my_descendant(uuid) ----
CREATE OR REPLACE FUNCTION public.strategy_has_my_descendant(p_strategy uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.initiatives s where s.strategy_id = p_strategy
      and (s.pic_id = auth.uid() or s.created_by = auth.uid()
        or exists (select 1 from public.action_plans i where i.initiative_id = s.id
          and (i.pic_id = auth.uid() or i.created_by = auth.uid()
            or exists (select 1 from public.tasks a where a.action_plan_id = i.id
              and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))))
  );
$function$;


-- ---- strategy_in_my_org(uuid) ----
CREATE OR REPLACE FUNCTION public.strategy_in_my_org(p_strategy uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.strategies k where k.id = p_strategy and k.organization_id = public.current_user_org());
$function$;


-- ---- list_strategy_candidates_for_task(uuid) ----
CREATE OR REPLACE FUNCTION public.list_strategy_candidates_for_task(p_action_plan_id uuid)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct k.id, k.name
  from public.tasks ap
  join public.action_plans i on i.id = ap.action_plan_id
  join public.initiatives s on s.id = i.initiative_id
  join public.strategies k on k.id = s.strategy_id
  where ap.id = p_action_plan_id
    and (ap.pic_id = auth.uid() or ap.reviewer_id = auth.uid())
  order by k.name;
$function$;


-- ---- mark_overdue_instances(timestamp with time zone) ----
CREATE OR REPLACE FUNCTION public.mark_overdue_instances(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select i.id, i.organization_id, i.task_id, i.pic_id, i.deadline_at,
           rr.missed_rule, rr.grace_period_minutes
    from public.task_instances i
    join public.task_repeat_rules rr on rr.id = i.repeat_rule_id
    where i.status in ('assigned', 'in_progress')
      and i.current_submission_id is null
      and i.submitted_at is null
      and rr.missed_rule <> 'overdue_allowed'
      and p_now > (case when rr.missed_rule = 'grace_period'
                        then i.deadline_at + make_interval(mins => coalesce(rr.grace_period_minutes, 0))
                        else i.deadline_at end)
  loop
    update public.task_instances
      set status = 'missed', missed_reason = 'deadline_passed'
      where id = r.id;

    insert into public.governance_violations
      (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
    values (r.organization_id, r.pic_id, 'instance_missed', 'task_instance', r.id,
            jsonb_build_object('task_id', r.task_id, 'deadline_at', r.deadline_at), 'medium');

    perform public.write_activity_system(r.organization_id, null, 'task_instance', r.id,
      'instance_marked_overdue', jsonb_build_object('task_id', r.task_id));

    -- Fase 3: notif domain ke PIC (oversight di-handle trigger governance_warning).
    perform public.emit_notification(r.organization_id, r.pic_id, null, 'instance_missed',
      'task_instance', r.id, 'Pekerjaan terlewat', null,
      public.org_today(r.organization_id));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;


-- ---- problem_statement_has_my_descendant(uuid) ----
CREATE OR REPLACE FUNCTION public.problem_statement_has_my_descendant(p_ps uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.action_plans i where i.problem_statement_id = p_ps
      and (i.pic_id = auth.uid() or i.created_by = auth.uid()
        or exists (select 1 from public.tasks a where a.action_plan_id = i.id
          and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))
  );
$function$;


-- ---- recompute_chat_room_members(uuid) ----
CREATE OR REPLACE FUNCTION public.recompute_chat_room_members(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action_plan uuid;
begin
  select action_plan_id into v_action_plan from public.chat_rooms where id = p_room;
  if v_action_plan is null then return; end if;

  with eligible as (
    select i.pic_id as member_id from public.action_plans i
      where i.id = v_action_plan and i.pic_id is not null
    union
    select a.pic_id from public.tasks a
      where a.action_plan_id = v_action_plan and a.pic_id is not null
    union
    select a.reviewer_id from public.tasks a
      where a.action_plan_id = v_action_plan and a.reviewer_id is not null
  )
  insert into public.chat_room_members (chat_room_id, member_id)
  select p_room, e.member_id from eligible e
  on conflict (chat_room_id, member_id) do nothing;

  -- Cabut anggota yang tak lagi berhak.
  delete from public.chat_room_members m
  where m.chat_room_id = p_room
    and m.member_id not in (
      select i.pic_id from public.action_plans i where i.id = v_action_plan and i.pic_id is not null
      union
      select a.pic_id from public.tasks a where a.action_plan_id = v_action_plan and a.pic_id is not null
      union
      select a.reviewer_id from public.tasks a where a.action_plan_id = v_action_plan and a.reviewer_id is not null
    );
end;
$function$;


-- ---- record_evaluation(uuid,text,text,text[],text[],text,boolean,boolean,text) ----
CREATE OR REPLACE FUNCTION public.record_evaluation(p_action_plan_id uuid, p_target_achieved text, p_results text, p_success_factors text[], p_failure_factors text[], p_lessons_learned text, p_should_become_sop boolean, p_rollout_needed boolean, p_rollout_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_org uuid; v_pic uuid; v_status text;
begin
  if not public.can_access_action_plan(p_action_plan_id) then
    raise exception 'Anda tidak berwenang mengevaluasi Initiative ini.';
  end if;
  select organization_id, pic_id, status into v_org, v_pic, v_status
    from public.action_plans where id = p_action_plan_id;
  if v_status not in ('done','active') then
    raise exception 'Evaluation hanya untuk Initiative yang sedang berjalan atau selesai.';
  end if;
  if v_pic is not null and v_pic = auth.uid() then
    insert into public.governance_violations (organization_id, user_id, violation_type, entity_type, entity_id, severity, detail)
    values (v_org, auth.uid(), 'self_evaluation', 'action_plan', p_action_plan_id, 'high', '{}'::jsonb);
    raise exception 'PIC tidak dapat mengevaluasi action_plannya sendiri.';
  end if;
  if p_target_achieved is not null and p_target_achieved not in ('ya','sebagian','tidak') then
    raise exception 'Nilai pencapaian target tidak valid.';
  end if;

  insert into public.evaluations (organization_id, action_plan_id, target_achieved, results,
    success_factors, failure_factors, lessons_learned, should_become_sop, rollout_needed,
    rollout_notes, evaluated_by, pic_id)
  values (v_org, p_action_plan_id, p_target_achieved, nullif(trim(coalesce(p_results,'')),''),
    p_success_factors, p_failure_factors, nullif(trim(coalesce(p_lessons_learned,'')),''),
    coalesce(p_should_become_sop, false), coalesce(p_rollout_needed, false),
    nullif(trim(coalesce(p_rollout_notes,'')),''), auth.uid(), v_pic)
  on conflict (action_plan_id) do update set
    target_achieved = excluded.target_achieved, results = excluded.results,
    success_factors = excluded.success_factors, failure_factors = excluded.failure_factors,
    lessons_learned = excluded.lessons_learned, should_become_sop = excluded.should_become_sop,
    rollout_needed = excluded.rollout_needed, rollout_notes = excluded.rollout_notes,
    evaluated_by = excluded.evaluated_by, updated_at = now()
  returning id into v_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'evaluation_recorded',
    jsonb_build_object('evaluation_id', v_id));
  return v_id;
end;
$function$;


-- ---- restore_card(text,uuid) ----
CREATE OR REPLACE FUNCTION public.restore_card(p_entity_type text, p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tbl text; v_status text; v_pic uuid;
begin
  v_tbl := case p_entity_type when 'task' then 'tasks'
    when 'action_plan' then 'action_plans' when 'initiative' then 'initiatives'
    when 'strategy' then 'strategies' when 'goal' then 'goals'
    when 'development_area' then 'development_areas' when 'problem_statement' then 'problem_statements' end;
  if v_tbl is null then raise exception 'Tipe card tidak valid.'; end if;
  execute format('select status, pic_id from public.%I where id = $1', v_tbl)
    into v_status, v_pic using p_entity_id;
  if v_status is null then raise exception 'Card tidak ditemukan.'; end if;
  if not (v_pic = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang memulihkan card ini.';
  end if;
  if v_status <> 'archived' then
    raise exception 'Hanya card berstatus diarsipkan yang dapat dipulihkan.';
  end if;
  -- Restore ke 'draft' supaya owner verifikasi ulang sebelum aktifkan kembali (governance-safe).
  execute format('update public.%I set status = ''draft'', archived_at = null where id = $1', v_tbl)
    using p_entity_id;
  perform public.write_activity(p_entity_type, p_entity_id, 'card_restored', '{}'::jsonb);
end;
$function$;


-- ---- restore_goal_template_items(uuid) ----
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
      select 1 from public.strategies k where k.goal_id = g.id and k.name = kt.name   -- by-name guard
    );
  get diagnostics v_added = row_count;
  return v_added;
end;
$function$;


-- ---- review_task_instance_submission(uuid,text,text) ----
CREATE OR REPLACE FUNCTION public.review_task_instance_submission(p_submission_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.task_submissions;
  ins public.task_instances;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.task_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  if s.task_instance_id is null then
    raise exception 'Submission ini bukan submission instance.';
  end if;
  select * into ins from public.task_instances where id = s.task_instance_id;

  if ins.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if ins.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail, severity)
      values (ins.organization_id, auth.uid(), 'reviewer_override', 'task_instance', ins.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', ins.reviewer_id), 'medium');
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review instance ini.';
    end if;
  end if;

  if s.review_status <> 'pending' or ins.status <> 'submitted' then
    raise exception 'Submission ini sudah direview atau tidak menunggu review.';
  end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  update public.task_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (task_id, submission_id, reviewer_id, decision, reason)
  values (ins.task_id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.task_instances
  set status = case when p_decision = 'approve' then 'done' else 'revision' end,
      reviewed_at = now()
  where id = ins.id;

  perform public.write_activity('task', ins.task_id,
    case when p_decision = 'approve' then 'review_instance_approve' else 'review_instance_reject' end,
    jsonb_build_object('instance_id', ins.id, 'submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  perform public.emit_notification(ins.organization_id, ins.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'task_instance', ins.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end, null);

  -- ISSUE-005: notif review_request reviewer instance tidak lagi actionable.
  perform public.resolve_notifications('task_instance', ins.id,
    array['review_request'],
    case when p_decision = 'approve' then 'approved' else 'rejected' end);
end;
$function$;


-- ---- review_task_submission(uuid,text,text) ----
CREATE OR REPLACE FUNCTION public.review_task_submission(p_submission_id uuid, p_decision text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.task_submissions;
  a public.tasks;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Keputusan review tidak valid.';
  end if;

  select * into s from public.task_submissions where id = p_submission_id;
  if not found then raise exception 'Submission tidak ditemukan.'; end if;
  select * into a from public.tasks where id = s.task_id;

  if a.pic_id = auth.uid() then
    raise exception 'PIC tidak boleh me-review pekerjaannya sendiri.';
  end if;

  if a.reviewer_id <> auth.uid() then
    if public.has_permission('manage_others_cards') then
      insert into public.governance_violations
        (organization_id, user_id, violation_type, entity_type, entity_id, detail)
      values (a.organization_id, auth.uid(), 'reviewer_override', 'task', a.id,
              jsonb_build_object('submission_id', p_submission_id, 'assigned_reviewer', a.reviewer_id));
    else
      raise exception 'Hanya Reviewer yang ditunjuk yang dapat me-review pekerjaan ini.';
    end if;
  end if;
  if s.review_status <> 'pending' or a.status <> 'submitted' then
    raise exception 'Submission ini sudah direview atau tidak menunggu review.';
  end if;
  if p_decision = 'reject' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  update public.task_submissions
  set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
      review_reason = nullif(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_submission_id;

  insert into public.reviews (task_id, submission_id, reviewer_id, decision, reason)
  values (a.id, p_submission_id, auth.uid(), p_decision, nullif(trim(p_reason), ''));

  update public.tasks
  set status = case when p_decision = 'approve' then 'done' else 'revision' end
  where id = a.id;

  perform public.write_activity('task', a.id,
    case when p_decision = 'approve' then 'review_approve' else 'review_reject' end,
    jsonb_build_object('submission_id', p_submission_id, 'reason', nullif(trim(p_reason), '')));

  perform public.emit_notification(a.organization_id, a.pic_id, auth.uid(),
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'task', a.id,
    case when p_decision = 'approve' then 'Pekerjaan disetujui' else 'Pekerjaan perlu revisi' end,
    a.name);

  -- ISSUE-005: notif review_request reviewer tidak lagi actionable.
  perform public.resolve_notifications('task', a.id,
    array['review_request'],
    case when p_decision = 'approve' then 'approved' else 'rejected' end);
end;
$function$;


-- ---- search_cards(text,text[],boolean) ----
CREATE OR REPLACE FUNCTION public.search_cards(p_query text, p_entity_types text[], p_include_archived boolean)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_q text; v_types text[]; v_arch boolean;
begin
  v_q := '%' || lower(coalesce(trim(p_query), '')) || '%';
  if coalesce(trim(p_query), '') = '' then return; end if;
  v_types := coalesce(p_entity_types,
    array['goal','strategy','initiative','action_plan','task','development_area','problem_statement']);
  v_arch := coalesce(p_include_archived, false);

  return query
  select jsonb_build_object('id', g.id, 'entity_type', 'goal', 'name', g.name, 'status', g.status)
  from public.goals g where 'goal' = any(v_types) and public.can_access_goal(g.id)
    and lower(g.name) like v_q and (v_arch or g.status <> 'archived')
  union all
  select jsonb_build_object('id', k.id, 'entity_type', 'strategy', 'name', k.name, 'status', k.status)
  from public.strategies k where 'strategy' = any(v_types) and public.can_access_strategy(k.id)
    and lower(k.name) like v_q and (v_arch or k.status <> 'archived')
  union all
  select jsonb_build_object('id', s.id, 'entity_type', 'initiative', 'name', s.name, 'status', s.status)
  from public.initiatives s where 'initiative' = any(v_types) and public.can_access_initiative(s.id)
    and lower(s.name) like v_q and (v_arch or s.status <> 'archived')
  union all
  select jsonb_build_object('id', i.id, 'entity_type', 'action_plan', 'name', i.name, 'status', i.status)
  from public.action_plans i where 'action_plan' = any(v_types) and public.can_access_action_plan(i.id)
    and lower(i.name) like v_q and (v_arch or i.status <> 'archived')
  union all
  select jsonb_build_object('id', a.id, 'entity_type', 'task', 'name', a.name, 'status', a.status)
  from public.tasks a where 'task' = any(v_types) and public.can_access_task(a.id)
    and lower(a.name) like v_q and (v_arch or a.status <> 'archived')
  union all
  select jsonb_build_object('id', d.id, 'entity_type', 'development_area', 'name', d.name, 'status', d.status)
  from public.development_areas d where 'development_area' = any(v_types) and public.can_access_development_area(d.id)
    and lower(d.name) like v_q and (v_arch or d.status <> 'archived')
  union all
  select jsonb_build_object('id', ps.id, 'entity_type', 'problem_statement', 'name', ps.name, 'status', ps.status)
  from public.problem_statements ps where 'problem_statement' = any(v_types) and public.can_access_problem_statement(ps.id)
    and lower(ps.name) like v_q and (v_arch or ps.status <> 'archived');
end;
$function$;


-- ---- set_task_repeat_rule(uuid,text,integer[],integer[],date[],date,date,time without time zone,text,integer) ----
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
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.action_plans i where i.id = a.action_plan_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengatur Repeat untuk Action Plan ini.';
  end if;

  -- Terkunci bila sudah ada instance (periode berjalan tak boleh diubah diam-diam).
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


-- ---- set_minimum_breakdown_rule(text,text,integer,text) ----
CREATE OR REPLACE FUNCTION public.set_minimum_breakdown_rule(p_parent_card_type text, p_child_card_type text, p_min_count integer, p_enforcement_mode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_org uuid;
begin
  if not public.has_permission('manage_minimum_breakdown_rule') then
    raise exception 'Anda tidak berwenang mengubah Minimum Breakdown Rule.';
  end if;
  if p_min_count is null or p_min_count < 1 then
    raise exception 'min_count harus >= 1.';
  end if;
  if p_enforcement_mode not in ('hanya_peringatan', 'blokir_aktivasi', 'blokir_akses_turunan') then
    raise exception 'Mode enforcement tidak dikenal.';
  end if;
  -- K1: goal->strategy minimal blokir_aktivasi/1 — tak boleh dilonggarkan (gate Fase 4).
  if p_parent_card_type = 'goal' and p_child_card_type = 'strategy' then
    if p_enforcement_mode <> 'blokir_aktivasi' or p_min_count < 1 then
      raise exception 'Aturan Goal → KPI Area dikunci pada mode Blokir Aktivasi dengan minimum 1.';
    end if;
  end if;

  v_org := public.current_user_org();
  if v_org is null then
    raise exception 'Organisasi tidak ditemukan.';
  end if;

  insert into public.minimum_breakdown_rules
    (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode, updated_by)
  values (v_org, p_parent_card_type, p_child_card_type, p_min_count, p_enforcement_mode, auth.uid())
  on conflict (organization_id, parent_card_type, child_card_type)
  do update set
    min_count = excluded.min_count,
    enforcement_mode = excluded.enforcement_mode,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning id into v_id;

  perform public.write_activity('minimum_breakdown_rule', v_id, 'update', jsonb_build_object(
    'parent_card_type', p_parent_card_type,
    'child_card_type', p_child_card_type,
    'min_count', p_min_count,
    'enforcement_mode', p_enforcement_mode
  ));
  return v_id;
end;
$function$;


-- ---- start_task(uuid) ----
CREATE OR REPLACE FUNCTION public.start_task(p_action_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.tasks;
begin
  select * into a from public.tasks where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if a.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat memulai pekerjaan ini.'; end if;
  if a.status <> 'assigned' then raise exception 'Action Plan tidak dalam status Assigned.'; end if;
  update public.tasks set status = 'in_progress' where id = p_action_plan_id;
  perform public.write_activity('task', p_action_plan_id, 'start', '{}'::jsonb);
end;
$function$;


-- ---- initiative_has_my_descendant(uuid) ----
CREATE OR REPLACE FUNCTION public.initiative_has_my_descendant(p_initiative uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.action_plans i where i.initiative_id = p_initiative
      and (i.pic_id = auth.uid() or i.created_by = auth.uid()
        or exists (select 1 from public.tasks a where a.action_plan_id = i.id
          and (a.pic_id = auth.uid() or a.reviewer_id = auth.uid())))
  );
$function$;


-- ---- initiative_in_my_org(uuid) ----
CREATE OR REPLACE FUNCTION public.initiative_in_my_org(p_initiative uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_initiative is null or exists (
    select 1 from public.initiatives s where s.id = p_initiative and s.organization_id = public.current_user_org());
$function$;


-- ---- submit_task(uuid,text,jsonb,jsonb) ----
CREATE OR REPLACE FUNCTION public.submit_task(p_submission_draft_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.task_submissions;
  a public.tasks;
  v_item jsonb;
  v_strategy_id uuid;
  v_candidates_count int;
  v_prev numeric;
begin
  select * into s from public.task_submissions where id = p_submission_draft_id;
  if not found then raise exception 'Draft submission tidak ditemukan.'; end if;
  if s.status <> 'draft' then raise exception 'Draft sudah di-finalize / status invalid.'; end if;
  if s.submitted_by <> auth.uid() then
    perform public.log_governance_violation(auth.uid(), 'finalize_non_submitter', 'task_submission',
      p_submission_draft_id, 'medium', jsonb_build_object('expected', s.submitted_by));
    raise exception 'Hanya pembuat draft yang dapat finalize.';
  end if;
  select * into a from public.tasks where id = s.task_id;
  if a.reviewer_id is not null and a.reviewer_id = a.pic_id then
    perform public.log_governance_violation(auth.uid(), 'self_approval_attempt', 'task',
      a.id, 'critical', jsonb_build_object('pic', a.pic_id, 'reviewer', a.reviewer_id));
    raise exception 'Konfigurasi tidak valid: PIC dan Reviewer sama.';
  end if;
  if jsonb_typeof(p_evidence) = 'array' and jsonb_array_length(p_evidence) > 5 then
    raise exception 'Maksimum 5 file bukti per submission (OD-2).';
  end if;
  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  select count(*) into v_candidates_count
    from public.list_strategy_candidates_for_task(s.task_id);
  if a.result_value_required and v_candidates_count > 0
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (
        p_submission_draft_id, v_item ->> 'kind', v_item ->> 'storage_path',
        v_item ->> 'url', v_item ->> 'text_content', v_item ->> 'file_name',
        v_item ->> 'mime_type', auth.uid()
      );
    end loop;
  end if;
  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      v_strategy_id := nullif(v_item ->> 'strategy_id', '')::uuid;
      if v_strategy_id is null and v_candidates_count > 0 then
        raise exception 'Nilai Hasil wajib terhubung ke KPI Area.';
      end if;
      if v_strategy_id is not null and not exists (
        select 1 from public.list_strategy_candidates_for_task(s.task_id) c
        where c.id = v_strategy_id
      ) then
        perform public.log_governance_violation(auth.uid(), 'strategy_mismatch', 'task',
          s.task_id, 'critical', jsonb_build_object('attempted', v_strategy_id));
        raise exception 'KPI Area tidak valid untuk Action Plan ini.';
      end if;
      v_prev := null;
      if v_strategy_id is not null then
        select numeric_total into v_prev from public.strategy_current_values where strategy_id = v_strategy_id;
      end if;
      insert into public.task_result_values
        (submission_id, strategy_id, label, value_type, value_text, value_numeric, previous_value_text)
      values (
        p_submission_draft_id, v_strategy_id, v_item ->> 'label',
        coalesce(v_item ->> 'value_type', 'text'),
        v_item ->> 'value_text',
        nullif(v_item ->> 'value_numeric', '')::numeric,
        coalesce(v_prev::text, null)
      );
    end loop;
  end if;
  update public.task_submissions
    set status = 'submitted', submitted_at = now(), note = nullif(trim(p_note), '')
    where id = p_submission_draft_id;
  update public.tasks
    set status = 'submitted', current_submission_id = p_submission_draft_id
    where id = s.task_id;
  perform public.write_activity('task', s.task_id, 'submit',
    jsonb_build_object('submission_id', p_submission_draft_id, 'version', s.version_number,
      'evidence_count', coalesce(jsonb_array_length(p_evidence), 0),
      'result_count', coalesce(jsonb_array_length(p_result_values), 0)));
  return p_submission_draft_id;
end;
$function$;


-- ---- submit_task_instance(uuid,text,jsonb,jsonb) ----
CREATE OR REPLACE FUNCTION public.submit_task_instance(p_instance_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ins public.task_instances;
  a public.tasks;
  v_version int;
  v_submission_id uuid;
  v_item jsonb;
  v_now timestamptz := now();
  v_effective_deadline timestamptz;
  v_late boolean := false;
  v_late_minutes int := null;
begin
  select * into ins from public.task_instances where id = p_instance_id;
  if not found then raise exception 'Instance tidak ditemukan.'; end if;
  if ins.pic_id <> auth.uid() then raise exception 'Hanya PIC yang dapat submit instance ini.'; end if;
  if ins.status = 'missed' then raise exception 'Instance sudah Terlewat dan tidak dapat disubmit.'; end if;
  if ins.status not in ('assigned', 'in_progress', 'revision') then
    raise exception 'Instance tidak dalam status yang bisa disubmit.';
  end if;

  select * into a from public.tasks where id = ins.task_id;

  if a.evidence_required
     and (p_evidence is null or jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0) then
    raise exception 'Bukti wajib dilampirkan sebelum submit.';
  end if;
  if a.result_value_required
     and (p_result_values is null or jsonb_typeof(p_result_values) <> 'array' or jsonb_array_length(p_result_values) = 0) then
    raise exception 'Nilai Hasil wajib diisi sebelum submit.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.task_submissions where task_instance_id = p_instance_id;

  insert into public.task_submissions
    (task_id, task_instance_id, version_number, submitted_by, note)
  values (ins.task_id, p_instance_id, v_version, auth.uid(), nullif(trim(p_note), ''))
  returning id into v_submission_id;

  if p_evidence is not null and jsonb_typeof(p_evidence) = 'array' then
    for v_item in select * from jsonb_array_elements(p_evidence) loop
      insert into public.evidence_files
        (submission_id, kind, storage_path, url, text_content, file_name, mime_type, uploaded_by)
      values (v_submission_id, v_item ->> 'kind', v_item ->> 'storage_path', v_item ->> 'url',
              v_item ->> 'text_content', v_item ->> 'file_name', v_item ->> 'mime_type', auth.uid());
    end loop;
  end if;

  if p_result_values is not null and jsonb_typeof(p_result_values) = 'array' then
    for v_item in select * from jsonb_array_elements(p_result_values) loop
      insert into public.task_result_values (submission_id, label, value_type, value_text)
      values (v_submission_id, v_item ->> 'label', coalesce(v_item ->> 'value_type', 'text'), v_item ->> 'value_text');
    end loop;
  end if;

  v_effective_deadline := ins.deadline_at;
  if v_now > v_effective_deadline then
    v_late := true;
    v_late_minutes := ceil(extract(epoch from (v_now - v_effective_deadline)) / 60.0)::int;
  end if;

  update public.task_instances
  set status = case when a.review_required then 'submitted' else 'done' end,
      current_submission_id = v_submission_id,
      submitted_at = v_now,
      submitted_late = v_late,
      late_minutes = v_late_minutes,
      reviewed_at = case when a.review_required then null else v_now end
  where id = p_instance_id;

  if not a.review_required then
    update public.task_submissions set review_status = 'approved' where id = v_submission_id;
  end if;

  perform public.write_activity('task', ins.task_id, 'submit_instance',
    jsonb_build_object('instance_id', p_instance_id, 'submission_id', v_submission_id, 'version', v_version));

  -- Fase 3: minta review ke reviewer instance bila perlu review.
  if a.review_required then
    perform public.emit_notification(ins.organization_id, ins.reviewer_id, ins.pic_id, 'review_request',
      'task_instance', p_instance_id, 'Permintaan review', a.name);
  end if;

  return v_submission_id;
end;
$function$;


-- ---- tg_task_sync_chat() ----
CREATE OR REPLACE FUNCTION public.tg_task_sync_chat()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room uuid;
begin
  select id into v_room from public.chat_rooms
    where action_plan_id = coalesce(new.action_plan_id, old.action_plan_id);
  if v_room is not null then perform public.recompute_chat_room_members(v_room); end if;
  -- Bila Action Plan pindah Initiative, sinkron room lama juga.
  if tg_op = 'UPDATE' and new.action_plan_id is distinct from old.action_plan_id then
    select id into v_room from public.chat_rooms where action_plan_id = old.action_plan_id;
    if v_room is not null then perform public.recompute_chat_room_members(v_room); end if;
  end if;
  return new;
end;
$function$;


-- ---- tg_enforce_mbr_block_child() ----
CREATE OR REPLACE FUNCTION public.tg_enforce_mbr_block_child()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent_type text;
  v_child_type text;
  v_parent_id uuid;
  v_parent_col text;
  v_org uuid;
  v_rule public.minimum_breakdown_rules;
  v_siblings int;
begin
  -- Petakan tabel turunan → (parent_type, child_type, parent_id, parent_col untuk hitung sibling).
  if tg_table_name = 'strategies' then
    v_parent_type := 'goal'; v_child_type := 'strategy';
    v_parent_id := new.goal_id; v_parent_col := 'goal_id';
  elsif tg_table_name = 'initiatives' then
    v_parent_type := 'strategy'; v_child_type := 'initiative';
    v_parent_id := new.strategy_id; v_parent_col := 'strategy_id';
  elsif tg_table_name = 'action_plans' then
    -- K7: route by populated FK. Initiative datar (kedua null) → lewati.
    if new.initiative_id is not null then
      v_parent_type := 'initiative'; v_child_type := 'action_plan';
      v_parent_id := new.initiative_id; v_parent_col := 'initiative_id';
    elsif new.problem_statement_id is not null then
      v_parent_type := 'problem_statement'; v_child_type := 'action_plan';
      v_parent_id := new.problem_statement_id; v_parent_col := 'problem_statement_id';
    else
      return new;  -- Initiative datar Fase 1: bypass MBR.
    end if;
  elsif tg_table_name = 'tasks' then
    v_parent_type := 'action_plan'; v_child_type := 'task';
    v_parent_id := new.action_plan_id; v_parent_col := 'action_plan_id';
  elsif tg_table_name = 'problem_statements' then  -- Fase 6
    v_parent_type := 'development_area'; v_child_type := 'problem_statement';
    v_parent_id := new.development_area_id; v_parent_col := 'development_area_id';
  else
    return new;
  end if;

  v_rule := public.current_minimum_breakdown_rule(v_parent_type, v_child_type);
  if v_rule.id is null or v_rule.enforcement_mode <> 'blokir_akses_turunan' then
    return new;
  end if;

  v_org := new.organization_id;
  execute format(
    'select count(*) from public.%I where %I = $1 and status <> ''archived'' and organization_id = $2',
    tg_table_name, v_parent_col
  ) into v_siblings using v_parent_id, v_org;

  if v_siblings < v_rule.min_count then
    raise exception
      'Tidak dapat membuat % baru: induk masih membutuhkan % dari % %.',
      v_child_type, (v_rule.min_count - v_siblings), v_rule.min_count, v_child_type;
  end if;

  return new;
end;
$function$;


-- ---- tg_governance_warning() ----
CREATE OR REPLACE FUNCTION public.tg_governance_warning()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pic uuid;
  v_reviewer uuid;
  v_holder uuid;
begin
  if new.severity is null or new.severity not in ('medium', 'high', 'critical') then
    return new;
  end if;

  -- Resolusi PIC/Reviewer card terdampak dari entity.
  if new.entity_type = 'task' then
    select pic_id, reviewer_id into v_pic, v_reviewer from public.tasks where id = new.entity_id;
  elsif new.entity_type = 'task_instance' then
    select pic_id, reviewer_id into v_pic, v_reviewer from public.task_instances where id = new.entity_id;
  end if;

  if new.violation_type = 'reviewer_override' then
    -- Pelaku (new.user_id) sebagai actor → emit_notification otomatis skip jika ia juga recipient.
    perform public.emit_notification(new.organization_id, v_pic, new.user_id, 'governance_warning',
      new.entity_type, new.entity_id, 'Peringatan governance pada card Anda', null);
    perform public.emit_notification(new.organization_id, v_reviewer, new.user_id, 'governance_warning',
      new.entity_type, new.entity_id, 'Peringatan governance pada card Anda', null);
  else
    -- instance_missed dll: oversight = Reviewer card.
    perform public.emit_notification(new.organization_id, v_reviewer, null, 'governance_warning',
      new.entity_type, new.entity_id, 'Peringatan governance pada card terkait', null);
  end if;

  -- Pemegang permission view_governance_violation (oversight org).
  for v_holder in
    select up.user_id from public.user_permissions up
    join public.permissions p on p.id = up.permission_id
    where up.granted and p.key = 'view_governance_violation'
      and exists (select 1 from public.profiles pr
                  where pr.id = up.user_id and pr.organization_id = new.organization_id)
  loop
    perform public.emit_notification(new.organization_id, v_holder, new.user_id, 'governance_warning',
      new.entity_type, new.entity_id, 'Governance violation tercatat', null);
  end loop;

  return new;
end;
$function$;


-- ---- tg_action_plan_chat_room() ----
CREATE OR REPLACE FUNCTION public.tg_action_plan_chat_room()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room uuid;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.chat_rooms (organization_id, action_plan_id, name)
    values (new.organization_id, new.id, new.name)
    on conflict (action_plan_id) do nothing
    returning id into v_room;
    if v_room is null then
      select id into v_room from public.chat_rooms where action_plan_id = new.id;
    end if;
    perform public.recompute_chat_room_members(v_room);
  end if;
  return new;
end;
$function$;


-- ---- tg_strategy_breakdown_touch_updated_at() ----
CREATE OR REPLACE FUNCTION public.tg_strategy_breakdown_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;


-- ---- workspace_card_progress(uuid[]) ----
CREATE OR REPLACE FUNCTION public.workspace_card_progress(p_card_ids uuid[])
 RETURNS TABLE(card_id uuid, progress integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with ids as (
    select unnest(p_card_ids) as id
  ),
  -- Satu baris per (parent id, status anak non-archived). RLS pada tiap tabel anak otomatis
  -- menyaring baris yang tak boleh dilihat pemanggil.
  child_status as (
    -- goal → strategies
    select k.goal_id as pid, k.status as cstatus
      from public.strategies k
      join ids on ids.id = k.goal_id
     where k.status <> 'archived'
    union all
    -- strategy → initiatives
    select s.strategy_id, s.status
      from public.initiatives s
      join ids on ids.id = s.strategy_id
     where s.status <> 'archived'
    union all
    -- initiative → action_plans
    select i.initiative_id, i.status
      from public.action_plans i
      join ids on ids.id = i.initiative_id
     where i.status <> 'archived'
    union all
    -- action_plan → tasks
    select a.action_plan_id, a.status
      from public.tasks a
      join ids on ids.id = a.action_plan_id
     where a.status <> 'archived'
    union all
    -- development_area → problem_statements
    select p.development_area_id, p.status
      from public.problem_statements p
      join ids on ids.id = p.development_area_id
     where p.status <> 'archived'
    union all
    -- problem_statement → action_plans
    select i.problem_statement_id, i.status
      from public.action_plans i
      join ids on ids.id = i.problem_statement_id
     where i.status <> 'archived'
  )
  select
    ids.id as card_id,
    -- childless (count 0) → 0 via coalesce; else round(100 * done/total).
    coalesce(
      round(
        100.0 * count(*) filter (where cs.cstatus = 'done')
        / nullif(count(cs.cstatus), 0)
      ),
      0
    )::int as progress
  from ids
  left join child_status cs on cs.pid = ids.id
  group by ids.id;
$function$;



-- =====================================================================
-- S4. Recreate 19 RLS policies (DROP + CREATE for idempotency)
-- =====================================================================

-- ============================================================
-- Section 2A: Rewrite 19 policies (function refs + optional rename)
-- Generated from pg_policies dump + placeholder-safe function name sed
-- ============================================================

-- public.action_plans :: initiatives_insert -> action_plans_insert
DROP POLICY IF EXISTS initiatives_insert ON public.action_plans;
DROP POLICY IF EXISTS action_plans_insert ON public.action_plans;
CREATE POLICY action_plans_insert ON public.action_plans FOR INSERT TO authenticated
  WITH CHECK (((organization_id = current_user_org()) AND (created_by = ( SELECT auth.uid() AS uid)) AND has_permission('create_initiative'::text) AND initiative_in_my_org(initiative_id) AND problem_statement_in_my_org(problem_statement_id)));

-- public.action_plans :: initiatives_select -> action_plans_select
DROP POLICY IF EXISTS initiatives_select ON public.action_plans;
DROP POLICY IF EXISTS action_plans_select ON public.action_plans;
CREATE POLICY action_plans_select ON public.action_plans FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND (can_view_workspace() OR (pic_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR action_plan_has_my_task(id) OR is_problem_statement_pic(problem_statement_id))));

-- public.action_plans :: initiatives_update -> action_plans_update
DROP POLICY IF EXISTS initiatives_update ON public.action_plans;
DROP POLICY IF EXISTS action_plans_update ON public.action_plans;
CREATE POLICY action_plans_update ON public.action_plans FOR UPDATE TO authenticated
  USING (((organization_id = current_user_org()) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (pic_id = ( SELECT auth.uid() AS uid)) OR has_permission('manage_others_cards'::text))))
  WITH CHECK (((organization_id = current_user_org()) AND initiative_in_my_org(initiative_id) AND problem_statement_in_my_org(problem_statement_id)));

-- public.comments :: comments_select -> comments_select
DROP POLICY IF EXISTS comments_select ON public.comments;
DROP POLICY IF EXISTS comments_select ON public.comments;
CREATE POLICY comments_select ON public.comments FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND (((entity_type = 'action_plan'::text) AND can_access_task(entity_id)) OR ((entity_type = 'initiative'::text) AND can_access_initiative(entity_id)) OR ((entity_type = 'action_plan_instance'::text) AND (EXISTS ( SELECT 1    FROM task_instances i   WHERE ((i.id = comments.entity_id) AND can_access_task(i.task_id))))))));

-- public.evaluations :: evaluations_select -> evaluations_select
DROP POLICY IF EXISTS evaluations_select ON public.evaluations;
DROP POLICY IF EXISTS evaluations_select ON public.evaluations;
CREATE POLICY evaluations_select ON public.evaluations FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND can_access_initiative(action_plan_id)));

-- public.evidence_files :: evidence_select -> evidence_select
DROP POLICY IF EXISTS evidence_select ON public.evidence_files;
DROP POLICY IF EXISTS evidence_select ON public.evidence_files;
CREATE POLICY evidence_select ON public.evidence_files FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1    FROM task_submissions s   WHERE ((s.id = evidence_files.submission_id) AND can_access_task(s.task_id)))));

-- public.initiatives :: strategies_insert -> initiatives_insert
DROP POLICY IF EXISTS strategies_insert ON public.initiatives;
DROP POLICY IF EXISTS initiatives_insert ON public.initiatives;
CREATE POLICY initiatives_insert ON public.initiatives FOR INSERT TO authenticated
  WITH CHECK (((organization_id = current_user_org()) AND (created_by = ( SELECT auth.uid() AS uid)) AND strategy_in_my_org(strategy_id) AND (has_permission('create_strategy'::text) OR is_strategy_pic(strategy_id))));

-- public.initiatives :: strategies_select -> initiatives_select
DROP POLICY IF EXISTS strategies_select ON public.initiatives;
DROP POLICY IF EXISTS initiatives_select ON public.initiatives;
CREATE POLICY initiatives_select ON public.initiatives FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND (can_view_workspace() OR (pic_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR is_strategy_pic(strategy_id) OR initiative_has_my_descendant(id))));

-- public.mentions :: mentions_select -> mentions_select
DROP POLICY IF EXISTS mentions_select ON public.mentions;
DROP POLICY IF EXISTS mentions_select ON public.mentions;
CREATE POLICY mentions_select ON public.mentions FOR SELECT TO authenticated
  USING (((mentioned_user_id = ( SELECT auth.uid() AS uid)) OR ((chat_message_id IS NOT NULL) AND (EXISTS ( SELECT 1    FROM chat_messages cm   WHERE ((cm.id = mentions.chat_message_id) AND is_chat_member(cm.chat_room_id))))) OR ((comment_id IS NOT NULL) AND (EXISTS ( SELECT 1    FROM comments c   WHERE ((c.id = mentions.comment_id) AND (((c.entity_type = 'action_plan'::text) AND can_access_task(c.entity_id)) OR ((c.entity_type = 'initiative'::text) AND can_access_initiative(c.entity_id)))))))));

-- public.reviews :: reviews_select -> reviews_select
DROP POLICY IF EXISTS reviews_select ON public.reviews;
DROP POLICY IF EXISTS reviews_select ON public.reviews;
CREATE POLICY reviews_select ON public.reviews FOR SELECT TO authenticated
  USING (can_access_task(task_id));

-- public.strategies :: kpi_areas_select -> strategies_select
DROP POLICY IF EXISTS kpi_areas_select ON public.strategies;
DROP POLICY IF EXISTS strategies_select ON public.strategies;
CREATE POLICY strategies_select ON public.strategies FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND (can_view_workspace() OR (pic_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR is_goal_pic(goal_id) OR strategy_has_my_descendant(id))));

-- public.strategy_target_breakdowns :: kpi_area_breakdown_select -> strategy_target_breakdowns_select
DROP POLICY IF EXISTS kpi_area_breakdown_select ON public.strategy_target_breakdowns;
DROP POLICY IF EXISTS strategy_target_breakdowns_select ON public.strategy_target_breakdowns;
CREATE POLICY strategy_target_breakdowns_select ON public.strategy_target_breakdowns FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND (EXISTS ( SELECT 1    FROM strategies k   WHERE ((k.id = strategy_target_breakdowns.strategy_id) AND (can_view_workspace() OR (k.pic_id = ( SELECT auth.uid() AS uid)) OR (k.created_by = ( SELECT auth.uid() AS uid)) OR is_goal_pic(k.goal_id) OR strategy_has_my_descendant(k.id)))))));

-- public.task_instances :: instances_select -> instances_select
DROP POLICY IF EXISTS instances_select ON public.task_instances;
DROP POLICY IF EXISTS instances_select ON public.task_instances;
CREATE POLICY instances_select ON public.task_instances FOR SELECT TO authenticated
  USING (can_access_task(task_id));

-- public.task_repeat_rules :: repeat_rules_select -> repeat_rules_select
DROP POLICY IF EXISTS repeat_rules_select ON public.task_repeat_rules;
DROP POLICY IF EXISTS repeat_rules_select ON public.task_repeat_rules;
CREATE POLICY repeat_rules_select ON public.task_repeat_rules FOR SELECT TO authenticated
  USING (can_access_task(task_id));

-- public.task_result_values :: result_values_select -> result_values_select
DROP POLICY IF EXISTS result_values_select ON public.task_result_values;
DROP POLICY IF EXISTS result_values_select ON public.task_result_values;
CREATE POLICY result_values_select ON public.task_result_values FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1    FROM task_submissions s   WHERE ((s.id = task_result_values.submission_id) AND can_access_task(s.task_id)))));

-- public.task_submissions :: submissions_select -> submissions_select
DROP POLICY IF EXISTS submissions_select ON public.task_submissions;
DROP POLICY IF EXISTS submissions_select ON public.task_submissions;
CREATE POLICY submissions_select ON public.task_submissions FOR SELECT TO authenticated
  USING (can_access_task(task_id));

-- public.tasks :: action_plans_select -> tasks_select
DROP POLICY IF EXISTS action_plans_select ON public.tasks;
DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND (can_view_workspace() OR (pic_id = ( SELECT auth.uid() AS uid)) OR (reviewer_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR i_am_action_plan_pic(action_plan_id) OR i_am_problem_statement_pic_via_action_plan(action_plan_id))));

-- public.video_briefs :: video_briefs_select -> video_briefs_select
DROP POLICY IF EXISTS video_briefs_select ON public.video_briefs;
DROP POLICY IF EXISTS video_briefs_select ON public.video_briefs;
CREATE POLICY video_briefs_select ON public.video_briefs FOR SELECT TO authenticated
  USING (((organization_id = current_user_org()) AND can_access_initiative(action_plan_id)));

-- storage.objects :: evidence_select_authorized -> evidence_select_authorized
DROP POLICY IF EXISTS evidence_select_authorized ON storage.objects;
DROP POLICY IF EXISTS evidence_select_authorized ON storage.objects;
CREATE POLICY evidence_select_authorized ON storage.objects FOR SELECT TO authenticated
  USING (((bucket_id = 'evidence'::text) AND (((array_length(storage.foldername(name), 1) >= 2) AND (EXISTS ( SELECT 1    FROM tasks ap   WHERE ((ap.id = ((storage.foldername(objects.name))[2])::uuid) AND can_access_task(ap.id))))) OR ((array_length(storage.foldername(name), 1) < 2) AND can_view_workspace()))));

-- =====================================================================
-- S5. Recreate 3 triggers with new function references + names.
-- DROP IF EXISTS before each CREATE for replay-safety (new-name triggers
-- survive the table-rename roundtrip via OID during a rollback drill).
-- =====================================================================

DROP TRIGGER IF EXISTS task_sync_chat ON public.tasks;
CREATE TRIGGER task_sync_chat
  AFTER INSERT OR UPDATE OF pic_id, reviewer_id, action_plan_id
  ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_sync_chat();

DROP TRIGGER IF EXISTS action_plan_chat_room ON public.action_plans;
CREATE TRIGGER action_plan_chat_room
  AFTER INSERT OR UPDATE OF status
  ON public.action_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_action_plan_chat_room();

DROP TRIGGER IF EXISTS strategy_target_breakdown_touch ON public.strategy_target_breakdowns;
CREATE TRIGGER strategy_target_breakdown_touch
  BEFORE UPDATE
  ON public.strategy_target_breakdowns
  FOR EACH ROW EXECUTE FUNCTION public.tg_strategy_breakdown_touch_updated_at();

-- =====================================================================
-- S6. map_legacy_entity_type helper (read-side compat for historical rows)
-- =====================================================================
-- Historical activity_logs / notifications / etc. may store OLD literals:
--   'kpi_area', 'strategy', 'initiative', 'action_plan', 'action_plan_instance'
-- Read paths (Menu → Aktivitas, Inbox) should call this helper to map to
-- current-generation labels. New INSERTs should use new literals directly.

CREATE OR REPLACE FUNCTION public.map_legacy_entity_type(p_entity_type text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path TO ''
AS $$
  SELECT CASE p_entity_type
    -- Level 1 shift: kpi_area (old) -> strategy (new)
    WHEN 'kpi_area'             THEN 'strategy'
    -- Level 2 shift: strategy (old) -> initiative (new)
    WHEN 'strategy'             THEN 'initiative'
    -- Level 3 shift: initiative (old) -> action_plan (new)
    WHEN 'initiative'           THEN 'action_plan'
    -- Level 4 shift: action_plan (old) -> task (new)
    WHEN 'action_plan'          THEN 'task'
    -- Level 4 instance shift: action_plan_instance (old) -> task_instance (new)
    WHEN 'action_plan_instance' THEN 'task_instance'
    -- No shift for goal, development_area, problem_statement, etc.
    ELSE p_entity_type
  END;
$$;

GRANT EXECUTE ON FUNCTION public.map_legacy_entity_type(text) TO authenticated;

COMMIT;
