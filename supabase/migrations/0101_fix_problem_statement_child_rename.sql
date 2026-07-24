-- 0101 — Hotfix: activate_problem_statement child-count reads the wrong table (42703).
--
-- SEBAB (sama dengan 0099 untuk compute_development_contribution). Rename 0045 menggeser
-- nama tabel satu tingkat: initiatives (lama, ber-`problem_statement_id`) menjadi `action_plans`;
-- `initiatives` sekarang adalah bekas `strategies` dan TIDAK punya `problem_statement_id`.
-- Turunan langsung sebuah Problem Statement adalah **action_plans**, bukan `initiatives`.
-- `activate_problem_statement` masih menghitung `public.initiatives WHERE problem_statement_id`
-- sehingga melempar 42703 undefined_column begitu aturan PS diset `blokir_aktivasi`
-- (tak terlihat pada mode default `hanya_peringatan` karena cabang itu tak dieksekusi).
--
-- RUANG LINGKUP — hanya SATU fungsi. Audit atas DB staging (pg_get_functiondef) menunjukkan:
--   • cancel_card                        → cabang problem_statement SUDAH baca action_plans (0046). OK.
--   • check_minimum_breakdown_compliance → cabang problem_statement SUDAH baca action_plans (0065). OK.
--   • is_supervisor_of / workspace_card_progress / tg_enforce_mbr_block_child → `problem_statement_id`
--     selalu diakses lewat baris ber-alias action_plans; referensi `initiatives`-nya sah (strategy_id). OK.
-- Jadi hanya activate_problem_statement yang perlu di-repoint.
--
-- HUBUNGAN dengan 0082. Migrasi 0082 (`mbr_rule_naming_and_ps_activation`) sudah memuat perbaikan
-- yang IDENTIK untuk fungsi ini, tetapi PER 2026-07-24 BELUM ter-apply ke DB staging (list_migrations
-- tidak memuat 0082; baris `minimum_breakdown_rules` masih penamaan legacy). Body di bawah dibuat
-- BYTE-IDENTIK dengan versi 0082 agar tidak pernah ada divergensi: pada DB manapun yang sudah/akan
-- menjalankan 0082, migrasi ini menjadi CREATE OR REPLACE no-op yang aman.
--
-- ⚠️ SISA DRIFT (di luar lingkup hotfix ini). Selama baris `minimum_breakdown_rules` staging masih
-- legacy (`problem_statement→initiative` alih-alih `problem_statement→action_plan`), pencarian
-- `current_minimum_breakdown_rule('problem_statement','action_plan')` mengembalikan NULL → gerbang
-- `blokir_aktivasi` PS FAIL-OPEN (tidak crash, tapi tidak menegakkan). Penegakan penuh baru pulih
-- setelah bagian §1 migrasi 0082 (rename baris aturan) ikut ter-apply ke staging.
--
-- CREATE OR REPLACE (bukan DROP+CREATE) — ACL fungsi tetap utuh; grant di-reassert eksplisit
-- untuk mencocokkan posture asli (memori anon-public-rpc-grant-gotcha).

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
