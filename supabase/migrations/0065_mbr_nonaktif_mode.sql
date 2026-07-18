-- PRD V1.83 §7.5 / §34.4 — Tambah mode 'nonaktif' ke Minimum Breakdown Rule.
-- Saat mode nonaktif, rule dianggap tidak ada: tombol turunan mengikuti permission biasa,
-- compliance check returns meets_requirement = true, trigger & activation gate skip.

-- 1. Widen CHECK constraint pada enforcement_mode.
ALTER TABLE public.minimum_breakdown_rules
  DROP CONSTRAINT IF EXISTS minimum_breakdown_rules_enforcement_mode_check;
ALTER TABLE public.minimum_breakdown_rules
  ADD CONSTRAINT minimum_breakdown_rules_enforcement_mode_check CHECK (
    enforcement_mode = ANY (ARRAY[
      'nonaktif'::text,
      'hanya_peringatan'::text,
      'blokir_aktivasi'::text,
      'blokir_akses_turunan'::text
    ])
  );

-- 2. Update set_minimum_breakdown_rule — accept 'nonaktif' as valid mode.
CREATE OR REPLACE FUNCTION public.set_minimum_breakdown_rule(
  p_parent_card_type text,
  p_child_card_type  text,
  p_min_count        integer,
  p_enforcement_mode text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_org uuid;
BEGIN
  IF NOT public.has_permission('manage_minimum_breakdown_rule') THEN
    RAISE EXCEPTION 'Anda tidak berwenang mengubah Minimum Breakdown Rule.';
  END IF;
  IF p_min_count IS NULL OR p_min_count < 1 THEN
    RAISE EXCEPTION 'min_count harus >= 1.';
  END IF;
  IF p_enforcement_mode NOT IN ('nonaktif', 'hanya_peringatan', 'blokir_aktivasi', 'blokir_akses_turunan') THEN
    RAISE EXCEPTION 'Mode enforcement tidak dikenal.';
  END IF;
  -- K1: goal->strategy minimal blokir_aktivasi/1 — tak boleh dilonggarkan (gate Fase 4).
  IF p_parent_card_type = 'goal' AND p_child_card_type = 'strategy' THEN
    IF p_enforcement_mode NOT IN ('blokir_aktivasi', 'blokir_akses_turunan') OR p_min_count < 1 THEN
      RAISE EXCEPTION 'Aturan Goal → KPI Area dikunci pada mode Blokir Aktivasi dengan minimum 1.';
    END IF;
  END IF;

  v_org := public.current_user_org();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan.';
  END IF;

  INSERT INTO public.minimum_breakdown_rules
    (organization_id, parent_card_type, child_card_type, min_count, enforcement_mode, updated_by)
  VALUES (v_org, p_parent_card_type, p_child_card_type, p_min_count, p_enforcement_mode, auth.uid())
  ON CONFLICT (organization_id, parent_card_type, child_card_type)
  DO UPDATE SET
    min_count = excluded.min_count,
    enforcement_mode = excluded.enforcement_mode,
    updated_by = excluded.updated_by,
    updated_at = now()
  RETURNING id INTO v_id;

  PERFORM public.write_activity('minimum_breakdown_rule', v_id, 'update', jsonb_build_object(
    'parent_card_type', p_parent_card_type,
    'child_card_type', p_child_card_type,
    'min_count', p_min_count,
    'enforcement_mode', p_enforcement_mode
  ));
  RETURN v_id;
END;
$function$;

-- 3. Update check_minimum_breakdown_compliance — nonaktif → always compliant.
CREATE OR REPLACE FUNCTION public.check_minimum_breakdown_compliance(
  p_parent_card_type text,
  p_parent_card_id   uuid
)
RETURNS TABLE(
  child_card_type    text,
  current_count      integer,
  required_count     integer,
  enforcement_mode   text,
  meets_requirement  boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_org   uuid;
  v_child text;
  v_count int := 0;
  v_rule  public.minimum_breakdown_rules;
BEGIN
  v_org := public.current_user_org();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan.';
  END IF;

  IF p_parent_card_type = 'goal' THEN
    IF NOT public.can_access_goal(p_parent_card_id) THEN
      RAISE EXCEPTION 'Anda tidak berwenang membaca Goal ini.';
    END IF;
    v_child := 'strategy';
    SELECT count(*) INTO v_count FROM public.strategies
      WHERE goal_id = p_parent_card_id AND status <> 'archived'
        AND organization_id = v_org;
  ELSIF p_parent_card_type = 'strategy' THEN
    IF NOT public.can_access_strategy(p_parent_card_id) THEN
      RAISE EXCEPTION 'Anda tidak berwenang membaca KPI Area ini.';
    END IF;
    v_child := 'initiative';
    SELECT count(*) INTO v_count FROM public.initiatives
      WHERE strategy_id = p_parent_card_id AND status <> 'archived'
        AND organization_id = v_org;
  ELSIF p_parent_card_type = 'initiative' THEN
    IF NOT public.can_access_initiative(p_parent_card_id) THEN
      RAISE EXCEPTION 'Anda tidak berwenang membaca Strategy ini.';
    END IF;
    v_child := 'action_plan';
    SELECT count(*) INTO v_count FROM public.action_plans
      WHERE initiative_id = p_parent_card_id AND status <> 'archived'
        AND organization_id = v_org;
  ELSIF p_parent_card_type = 'action_plan' THEN
    IF NOT public.can_access_action_plan(p_parent_card_id) THEN
      RAISE EXCEPTION 'Anda tidak berwenang membaca Initiative ini.';
    END IF;
    v_child := 'task';
    SELECT count(*) INTO v_count FROM public.tasks
      WHERE action_plan_id = p_parent_card_id AND status <> 'archived'
        AND organization_id = v_org;
  ELSIF p_parent_card_type = 'development_area' THEN
    IF NOT public.can_access_development_area(p_parent_card_id) THEN
      RAISE EXCEPTION 'Anda tidak berwenang membaca Development Area ini.';
    END IF;
    v_child := 'problem_statement';
    SELECT count(*) INTO v_count FROM public.problem_statements
      WHERE development_area_id = p_parent_card_id AND status <> 'archived'
        AND organization_id = v_org;
  ELSIF p_parent_card_type = 'problem_statement' THEN
    IF NOT public.can_access_problem_statement(p_parent_card_id) THEN
      RAISE EXCEPTION 'Anda tidak berwenang membaca Problem Statement ini.';
    END IF;
    v_child := 'action_plan';
    SELECT count(*) INTO v_count FROM public.action_plans
      WHERE problem_statement_id = p_parent_card_id AND status <> 'archived'
        AND organization_id = v_org;
  ELSE
    RAISE EXCEPTION 'parent_card_type tidak didukung: %', p_parent_card_type;
  END IF;

  v_rule := public.current_minimum_breakdown_rule(p_parent_card_type, v_child);
  IF v_rule.id IS NULL OR v_rule.enforcement_mode = 'nonaktif' THEN
    -- Tanpa rule ATAU nonaktif → fail-open (compliant).
    child_card_type   := v_child;
    current_count     := v_count;
    required_count    := 0;
    enforcement_mode  := COALESCE(v_rule.enforcement_mode, 'hanya_peringatan');
    meets_requirement := true;
    RETURN NEXT;
    RETURN;
  END IF;

  child_card_type   := v_child;
  current_count     := v_count;
  required_count    := v_rule.min_count;
  enforcement_mode  := v_rule.enforcement_mode;
  meets_requirement := (v_count >= v_rule.min_count);
  RETURN NEXT;
END;
$function$;

-- 4. Update tg_enforce_mbr_block_child — skip nonaktif (already skips non-blokir_akses_turunan,
--    but explicit for clarity).
CREATE OR REPLACE FUNCTION public.tg_enforce_mbr_block_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_parent_type text;
  v_child_type  text;
  v_parent_id   uuid;
  v_parent_col  text;
  v_org         uuid;
  v_rule        public.minimum_breakdown_rules;
  v_siblings    int;
BEGIN
  IF tg_table_name = 'strategies' THEN
    v_parent_type := 'goal'; v_child_type := 'strategy';
    v_parent_id := new.goal_id; v_parent_col := 'goal_id';
  ELSIF tg_table_name = 'initiatives' THEN
    v_parent_type := 'strategy'; v_child_type := 'initiative';
    v_parent_id := new.strategy_id; v_parent_col := 'strategy_id';
  ELSIF tg_table_name = 'action_plans' THEN
    IF new.initiative_id IS NOT NULL THEN
      v_parent_type := 'initiative'; v_child_type := 'action_plan';
      v_parent_id := new.initiative_id; v_parent_col := 'initiative_id';
    ELSIF new.problem_statement_id IS NOT NULL THEN
      v_parent_type := 'problem_statement'; v_child_type := 'action_plan';
      v_parent_id := new.problem_statement_id; v_parent_col := 'problem_statement_id';
    ELSE
      RETURN new;
    END IF;
  ELSIF tg_table_name = 'tasks' THEN
    v_parent_type := 'action_plan'; v_child_type := 'task';
    v_parent_id := new.action_plan_id; v_parent_col := 'action_plan_id';
  ELSIF tg_table_name = 'problem_statements' THEN
    v_parent_type := 'development_area'; v_child_type := 'problem_statement';
    v_parent_id := new.development_area_id; v_parent_col := 'development_area_id';
  ELSE
    RETURN new;
  END IF;

  v_rule := public.current_minimum_breakdown_rule(v_parent_type, v_child_type);
  IF v_rule.id IS NULL OR v_rule.enforcement_mode <> 'blokir_akses_turunan' THEN
    RETURN new;
  END IF;

  v_org := new.organization_id;
  EXECUTE format(
    'SELECT count(*) FROM public.%I WHERE %I = $1 AND status <> ''archived'' AND organization_id = $2',
    tg_table_name, v_parent_col
  ) INTO v_siblings USING v_parent_id, v_org;

  IF v_siblings < v_rule.min_count THEN
    RAISE EXCEPTION
      'Tidak dapat membuat % baru: induk masih membutuhkan % dari % %.',
      v_child_type, (v_rule.min_count - v_siblings), v_rule.min_count, v_child_type;
  END IF;

  RETURN new;
END;
$function$;

-- 5. Update activate_problem_statement — skip MBR gate when nonaktif.
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

  -- K6 MBR gate — skip when nonaktif.
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

