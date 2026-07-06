-- EMS — Fase 7 cross-org isolation fix (ditemukan saat WS-5 close-period).
--
-- MASALAH: RPC Fase 7 di 0013 ber-SECURITY DEFINER (owner postgres → RLS BYPASS di dalam fungsi).
-- Fungsi yang menerima p_period_id memuat baris via `where id = p_period_id` TANPA membandingkan
-- v_period.organization_id dengan org pemanggil. Satu-satunya gerbang adalah has_permission(...),
-- yang mengecek izin pemanggil DI ORG PEMANGGIL — bukan kepemilikan periode. Akibatnya pemegang
-- manage_score_formula (mis. CEO) org A bisa close / calculate / override periode milik org B hanya
-- dengan menebak UUID-nya. Asumsi WS-5 spec §6 bahwa "RLS SELECT mengembalikan Periode tidak
-- ditemukan untuk lintas-org" SALAH: RLS tidak berlaku di dalam SECURITY DEFINER.
--
-- PERBAIKAN: tambah guard org eksplisit tepat setelah cek not-found di ketiga RPC yang menerima
-- p_period_id: close_period_snapshot, calculate_period_scores, override_user_score. Pesan disamakan
-- dengan not-found ('Periode tidak ditemukan.') agar tidak membocorkan eksistensi periode org lain.
--
-- AUDIT open_period_snapshot: AMAN tanpa perubahan. RPC ini tidak menerima UUID periode; ia SELALU
-- meng-INSERT dengan organization_id = current_user_org() dan guard "one active" juga di-scope ke
-- current_user_org(). Tidak ada permukaan lintas-org. Sengaja tidak diubah (didokumentasikan di sini).
--
-- Idempoten (create or replace). Tidak menyentuh migrasi lama. Grant/revoke tak berubah (definisi
-- 0013 tetap: revoke dari public, anon).

-- ============================================================ RPC: calculate_period_scores (+ org guard)
create or replace function public.calculate_period_scores(p_period_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
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
  v_existing_auto uuid;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select * into v_period from public.period_snapshots where id = p_period_id;
  if not found then raise exception 'Periode tidak ditemukan.'; end if;
  -- Cross-org guard (SECURITY DEFINER bypass RLS): periode harus milik org pemanggil.
  -- `is distinct from` (BUKAN <>): profiles.organization_id NULLABLE + current_user_org() bisa NULL
  -- (mis. org dihapus → on delete set null). `uuid <> NULL` = NULL → guard TAK menyala (bypass).
  -- `is distinct from NULL` = TRUE → pemanggil tanpa org ditolak.
  if v_period.organization_id is distinct from public.current_user_org() then
    raise exception 'Periode tidak ditemukan.';
  end if;
  if v_period.status = 'closed' then
    raise exception 'Periode ini sudah ditutup dan tidak bisa diubah.';
  end if;

  v_org := v_period.organization_id;

  -- Iterasi user staff di org dengan role_template_id ada (NULL di-skip, AC-7.28).
  for v_user in
    select p.id as user_id, rt.level
    from public.profiles p
    join public.role_templates rt on rt.id = p.role_template_id
    where p.organization_id = v_org and rt.level = 'staff'  -- D7: V1 Staff only
  loop
    -- Pilih formula efektif (assignment user → org_role → default).
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

    if v_formula_id is null then continue; end if;  -- tak ada formula efektif → skip

    v_score := 0;
    v_metric_breakdown := '{}'::jsonb;
    for v_cat in select * from jsonb_array_elements(v_categories) loop
      v_metric_value := case v_cat->>'source_metric'
        when 'action_plan_completion'
          then public.compute_action_plan_completion(v_user.user_id, v_org,
                                                     v_period.period_start, v_period.period_end)
        when 'repeat_compliance'
          then (select repeat_compliance from public.aggregate_repeat_metrics_per_user(
                  v_user.user_id, v_org, v_period.period_start, v_period.period_end))
        when 'on_time_rate'
          then (select on_time_rate from public.aggregate_repeat_metrics_per_user(
                  v_user.user_id, v_org, v_period.period_start, v_period.period_end))
        when 'review_pass_rate'
          then public.compute_review_pass_rate(v_user.user_id, v_org,
                                               v_period.period_start, v_period.period_end)
        when 'development_contribution'
          then public.compute_development_contribution(v_user.user_id, v_org,
                                                       v_period.period_start, v_period.period_end)
        when 'governance_discipline'
          then public.compute_governance_discipline(v_user.user_id, v_org,
                                                    v_period.period_start, v_period.period_end)
        else 0
      end;
      -- Clamp 0..100 sebelum dijumlahkan (AC-7.21/7.35).
      v_metric_value := greatest(0, least(100, coalesce(v_metric_value, 0)));
      v_score := v_score + v_metric_value * (v_cat->>'weight')::numeric / 100.0;
      v_metric_breakdown := v_metric_breakdown
        || jsonb_build_object(v_cat->>'code', v_metric_value);
    end loop;
    v_score := round(greatest(0, least(100, v_score)), 2);

    -- Supersede auto lama (is_current=false); JANGAN sentuh override.
    update public.user_score_results
      set is_current = false
      where period_snapshot_id = p_period_id
        and user_id = v_user.user_id
        and result_kind = 'auto'
        and is_current = true;

    -- Jika sudah ada override current, jangan insert auto baru sebagai current
    -- (override tetap berkuasa). Tetap insert audit row auto historis (is_current=false).
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
$$;
revoke execute on function public.calculate_period_scores(uuid) from public, anon;

-- ============================================================ RPC: close_period_snapshot (+ org guard)
create or replace function public.close_period_snapshot(p_period_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_period public.period_snapshots; v_count int := 0;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select * into v_period from public.period_snapshots where id = p_period_id for update;
  if not found then raise exception 'Periode tidak ditemukan.'; end if;
  -- Cross-org guard (SECURITY DEFINER bypass RLS): periode harus milik org pemanggil.
  -- `is distinct from` (BUKAN <>): profiles.organization_id NULLABLE + current_user_org() bisa NULL
  -- (mis. org dihapus → on delete set null). `uuid <> NULL` = NULL → guard TAK menyala (bypass).
  -- `is distinct from NULL` = TRUE → pemanggil tanpa org ditolak.
  if v_period.organization_id is distinct from public.current_user_org() then
    raise exception 'Periode tidak ditemukan.';
  end if;
  if v_period.status = 'closed' then
    raise exception 'Periode ini sudah ditutup dan tidak bisa diubah.';
  end if;

  -- Insert ranking_snapshots dengan dense_rank (D11 rank kembar; rank berikut MELOMPAT).
  -- Implementasi: rank() (bukan dense_rank) memberi 1,1,3,3,5 — sesuai "rank berikut melompat".
  -- D11: rank() OVER (order by score desc) → kembar (1,1,3,3,5; rank berikut melompat).
  -- full_name HANYA sebagai display tie-breaker di ORDER BY (bukan dalam OVER clause yang
  -- akan membuat ranks unik 1,2,3).
  insert into public.ranking_snapshots
    (organization_id, period_snapshot_id, user_id, rank_number, score, metric_breakdown)
  select
    v_period.organization_id,
    p_period_id,
    r.user_id,
    rank() over (order by r.effective_score desc),
    r.effective_score,
    r.metric_breakdown
  from (
    select user_id, metric_breakdown,
           coalesce(manual_adjusted_score, auto_calculated_score) as effective_score
    from public.user_score_results
    where period_snapshot_id = p_period_id and is_current = true
  ) r
  join public.profiles p on p.id = r.user_id
  order by r.effective_score desc, coalesce(p.full_name, '') asc;

  get diagnostics v_count = row_count;

  update public.period_snapshots
    set status = 'closed', closed_at = now(), closed_by = auth.uid()
    where id = p_period_id;

  perform public.write_activity('period_snapshot', p_period_id, 'period_closed',
    jsonb_build_object('ranked_users', v_count));
  return v_count;
end;
$$;
revoke execute on function public.close_period_snapshot(uuid) from public, anon;

-- ============================================================ RPC: override_user_score (+ org guard)
create or replace function public.override_user_score(
  p_period_id uuid, p_user_id uuid, p_manual_score numeric, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_period public.period_snapshots;
  v_existing public.user_score_results;
  v_new uuid;
begin
  -- KETERBATASAN V1: governance_violations insert SEBELUM raise exception akan ter-rollback
  -- bersama caller's savepoint (PG semantics, no autonomous tx). Audit row HANYA pada SUCCESS
  -- path (activity_logs 'score_override_applied'). Audit attempt-failed defer Fase 8 (dblink).
  if p_user_id = auth.uid() then
    raise exception 'Anda tidak bisa mengubah score Anda sendiri.';
  end if;
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Alasan override wajib diisi.';
  end if;

  select * into v_period from public.period_snapshots where id = p_period_id;
  if not found then raise exception 'Periode tidak ditemukan.'; end if;
  -- Cross-org guard (SECURITY DEFINER bypass RLS): periode harus milik org pemanggil.
  -- `is distinct from` (BUKAN <>): profiles.organization_id NULLABLE + current_user_org() bisa NULL
  -- (mis. org dihapus → on delete set null). `uuid <> NULL` = NULL → guard TAK menyala (bypass).
  -- `is distinct from NULL` = TRUE → pemanggil tanpa org ditolak.
  if v_period.organization_id is distinct from public.current_user_org() then
    raise exception 'Periode tidak ditemukan.';
  end if;
  if v_period.status = 'closed' then
    raise exception 'Periode ini sudah ditutup dan tidak bisa diubah.';
  end if;

  -- Ambil baris current (auto atau override). Salin auto_calculated_score utuh.
  select * into v_existing
    from public.user_score_results
    where period_snapshot_id = p_period_id and user_id = p_user_id and is_current = true
    limit 1;
  if not found then raise exception 'Score user belum dihitung untuk periode ini.'; end if;

  -- Flip current sebelumnya.
  update public.user_score_results set is_current = false
    where id = v_existing.id;

  -- Insert baris override baru (single-actor: approved_by = changed_by).
  insert into public.user_score_results
    (organization_id, period_snapshot_id, user_id, score_formula_version_id,
     auto_calculated_score, manual_adjusted_score, metric_breakdown,
     override_reason, override_changed_by, override_changed_at, override_approved_by,
     result_kind, is_current, calculated_at)
    values (v_existing.organization_id, p_period_id, p_user_id, v_existing.score_formula_version_id,
            v_existing.auto_calculated_score, p_manual_score, v_existing.metric_breakdown,
            p_reason, auth.uid(), now(), auth.uid(),
            'override', true, now())
    returning id into v_new;

  perform public.write_activity('user_score_result', v_new, 'score_override_applied',
    jsonb_build_object(
      'period_snapshot_id', p_period_id,
      'target_user', p_user_id,
      'previous_auto', v_existing.auto_calculated_score,
      'new_manual', p_manual_score,
      'reason', p_reason,
      'changed_by', auth.uid(),
      'approved_by', auth.uid()
    ));
  return v_new;
end;
$$;
revoke execute on function public.override_user_score(uuid, uuid, numeric, text) from public, anon;
