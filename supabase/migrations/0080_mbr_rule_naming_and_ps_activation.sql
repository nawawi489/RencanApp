-- BL-04 — Minimum Breakdown Rule: rekonsiliasi penamaan baris aturan + perbaikan aktivasi PS.
--
-- LATAR. Migrasi 0045 mengganti nama tabel kartu secara berantai (geser satu tingkat):
--   kpi_areas → strategies · strategies → initiatives · initiatives → action_plans · action_plans → tasks
-- Migrasi 0046/0065 menulis ulang seluruh RPC memakai penamaan BARU itu. Yang tidak pernah ikut
-- dipindah adalah ISI tabel `minimum_breakdown_rules` — 6 baris seed dari 0011 masih memakai
-- penamaan legacy. Akibatnya `check_minimum_breakdown_compliance` mencari pasangan yang tidak ada:
--
--   cabang RPC                          baris aturan ditemukan
--   goal → strategy                     0   ← fail-open permanen
--   strategy → initiative               1
--   initiative → action_plan            1
--   action_plan → task                  0   ← fail-open permanen
--   development_area → problem_statement 1
--   problem_statement → action_plan     0   ← fail-open permanen
--
-- `v_rule.id IS NULL` → `meets_requirement := true` tanpa syarat. Jadi 3 dari 6 aturan tidak
-- pernah bisa menegakkan apa pun, berapa pun mode yang dipilih admin di Settings. Itulah sebab
-- sesungguhnya BL-04: bukan guard UI yang kurang, melainkan data aturan yang tak terbaca.
--
-- Pemetaan legacy → sekarang (geseran yang sama dengan 0045, jadi makna tiap baris TIDAK berubah):
--   goal             → kpi_area           ==>  goal             → strategy
--   kpi_area         → strategy           ==>  strategy         → initiative
--   strategy         → initiative         ==>  initiative       → action_plan
--   initiative       → action_plan        ==>  action_plan      → task
--   problem_statement → initiative        ==>  problem_statement → action_plan
--   development_area → problem_statement  ==>  (tetap)
--
-- Setelah migrasi ini keenam cabang RPC menemukan baris aturannya, dan min_count/enforcement_mode
-- pilihan organisasi (baris org-level) ikut terbawa apa adanya.

-- ============================================================ 1. Rename isi baris aturan
-- CHECK di-drop dulu: rename dilakukan dua fase lewat nilai sentinel, karena pemetaan di atas
-- adalah GESERAN — target satu baris adalah nilai baris lain (mis. 'kpi_area→strategy' menjadi
-- 'strategy→initiative' yang masih ditempati baris lain). Update satu fase akan menabrak
-- unique index (uq_mbr_system / unique per-org) di tengah jalan.

ALTER TABLE public.minimum_breakdown_rules
  DROP CONSTRAINT IF EXISTS minimum_breakdown_rules_parent_card_type_check;
ALTER TABLE public.minimum_breakdown_rules
  DROP CONSTRAINT IF EXISTS minimum_breakdown_rules_child_card_type_check;

DO $$
BEGIN
  -- Sentinel idempotensi: 'kpi_area' hanya ada di penamaan legacy. Bila sudah tidak ada satu pun,
  -- migrasi ini pernah jalan → jangan geser lagi (geseran kedua akan merusak: 'strategy→initiative'
  -- adalah pasangan yang sah di KEDUA penamaan).
  IF EXISTS (
    SELECT 1 FROM public.minimum_breakdown_rules
    WHERE parent_card_type = 'kpi_area' OR child_card_type = 'kpi_area'
  ) THEN
    -- Fase A — ke nilai sentinel (tidak mungkin bertabrakan dengan nilai final mana pun).
    UPDATE public.minimum_breakdown_rules
    SET parent_card_type = 'mig0080__' || v.new_parent,
        child_card_type  = 'mig0080__' || v.new_child
    FROM (VALUES
      ('goal',              'kpi_area',          'goal',              'strategy'),
      ('kpi_area',          'strategy',          'strategy',          'initiative'),
      ('strategy',          'initiative',        'initiative',        'action_plan'),
      ('initiative',        'action_plan',       'action_plan',       'task'),
      ('problem_statement', 'initiative',        'problem_statement', 'action_plan')
    ) AS v (old_parent, old_child, new_parent, new_child)
    WHERE minimum_breakdown_rules.parent_card_type = v.old_parent
      AND minimum_breakdown_rules.child_card_type  = v.old_child;

    -- Fase B — buang prefiks sentinel.
    UPDATE public.minimum_breakdown_rules
    SET parent_card_type = substring(parent_card_type from 10),
        child_card_type  = substring(child_card_type  from 10)
    WHERE parent_card_type LIKE 'mig0080\_\_%';
  END IF;
END;
$$;

-- ============================================================ 2. CHECK: hanya penamaan sekarang
-- Nilai legacy ('kpi_area' sebagai parent/child) sengaja TIDAK lagi diterima supaya drift yang
-- sama tidak bisa masuk lagi lewat set_minimum_breakdown_rule.

ALTER TABLE public.minimum_breakdown_rules
  ADD CONSTRAINT minimum_breakdown_rules_parent_card_type_check CHECK (
    parent_card_type = ANY (ARRAY[
      'goal'::text, 'strategy'::text, 'initiative'::text, 'action_plan'::text,
      'development_area'::text, 'problem_statement'::text
    ])
  );

ALTER TABLE public.minimum_breakdown_rules
  ADD CONSTRAINT minimum_breakdown_rules_child_card_type_check CHECK (
    child_card_type = ANY (ARRAY[
      'strategy'::text, 'initiative'::text, 'action_plan'::text, 'task'::text,
      'problem_statement'::text
    ])
  );

-- ============================================================ 3. activate_problem_statement
-- Dua cacat, keduanya lahir dari rename 0045 yang tidak ikut memperbarui fungsi ini:
--   (a) mencari aturan ('problem_statement','initiative') — pasangan legacy;
--   (b) menghitung `public.initiatives WHERE problem_statement_id` — kolom itu ADA di
--       `action_plans`, TIDAK di `initiatives`. Turunan Problem Statement adalah Rencana Aksi.
-- Efek (b): begitu aturan PS diset 'blokir_aktivasi', setiap aktivasi PS mati dengan
-- 42703 undefined_column, bukan pesan ramah. Selama ini tak terlihat karena mode default
-- 'hanya_peringatan' membuat cabang itu tak pernah dieksekusi.
-- CREATE OR REPLACE (bukan DROP+CREATE) — ACL fungsi tetap utuh (memori anon-public-rpc-grant-gotcha).

CREATE OR REPLACE FUNCTION public.activate_problem_statement(p_problem_statement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
declare p public.problem_statements; v_rule public.minimum_breakdown_rules; v_children int;
begin
  select * into p from public.problem_statements where id = p_problem_statement_id;
  if not found then raise exception 'Problem Statement tidak ditemukan.'; end if;
  if p.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (p.created_by = auth.uid() or p.pic_id = auth.uid()
          or public.is_development_area_pic(p.development_area_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Problem Statement ini.';
  end if;
  if p.status <> 'draft' then raise exception 'Problem Statement sudah diaktifkan.'; end if;
  if coalesce(trim(p.name), '') = '' or p.pic_id is null
     or p.period_start is null or p.period_end is null
     or p.impact is null then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;

  v_rule := public.current_minimum_breakdown_rule('problem_statement', 'action_plan');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_children from public.action_plans
      where problem_statement_id = p_problem_statement_id
        and status <> 'archived'
        and organization_id = p.organization_id;
    if v_children < v_rule.min_count then
      raise exception
        'Problem Statement ini baru memiliki % dari % Rencana Aksi. Tambahkan % Rencana Aksi lagi agar bisa diaktifkan.',
        v_children, v_rule.min_count, (v_rule.min_count - v_children);
    end if;
  end if;

  perform public.enforce_card_completion_rule('problem_statement',
    public.card_completion_rule_for(p.organization_id, 'problem_statement'),
    to_jsonb(p));

  update public.problem_statements set status = 'active' where id = p_problem_statement_id;
  perform public.write_activity('problem_statement', p_problem_statement_id, 'activate', '{}'::jsonb);
end;
$$;

revoke execute on function public.activate_problem_statement(uuid) from public, anon;
grant  execute on function public.activate_problem_statement(uuid) to authenticated;

-- ============================================================ 4. ACL check_minimum_breakdown_compliance
-- Masih memegang PUBLIC EXECUTE (proacl '=X/postgres') — sisa DROP ... CASCADE di 0046 yang
-- mereset ACL ke default. Fungsi ini SECURITY DEFINER dan membaca data org, jadi PUBLIC dicabut.
-- GRANT ke authenticated WAJIB menyertai revoke: sebelumnya authenticated mewarisi hak lewat
-- PUBLIC, mencabut tanpa memberi akan mematikan seluruh indikator Kelengkapan Perencanaan di klien.

revoke execute on function public.check_minimum_breakdown_compliance(text, uuid) from public, anon;
grant  execute on function public.check_minimum_breakdown_compliance(text, uuid) to authenticated;
