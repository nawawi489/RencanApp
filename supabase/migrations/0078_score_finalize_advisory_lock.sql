-- EMS — Fase 7 Score/Ranking finalization: advisory lock untuk mencegah race dua-tab.
--
-- KONTEKS: Spec specs/score-ranking-finalization-bridge.md (owner keputusan #4, 2026-07-19).
-- Bug jembatan: `close_period_snapshot` membaca `user_score_results` yang kosong karena
-- `calculate_period_scores` nol caller UI/hook. Fase 3-4 spec menambah tombol UI + hook baru
-- yang memanggil calc → close berurutan sync client-side. Bila dua Owner (dua tab / dua device)
-- menekan tombol berbarengan pada period yang sama, dua skenario race muncul di server:
--   R1. Dua calculate() paralel → partial unique index `ux_user_score_results_one_current`
--       (0013:146-147) melempar `duplicate key value violates unique constraint …` mentah
--       ke UI, bukan pesan Indonesia terkurasi.
--   R2. calculate() mid-flight + close() dari sesi lain commit duluan → calc masih menulis
--       baris `is_current=true` untuk period yang statusnya sudah 'closed', menghasilkan
--       state tak konsisten (ranking_snapshots beku vs user_score_results yang bergerak).
--
-- PERBAIKAN: pasang `pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text))`
-- sebagai statement PERTAMA di calculate_period_scores dan close_period_snapshot. Lock
-- transaction-scoped (auto-release saat COMMIT/ROLLBACK). Dua sesi paralel di periodId yang
-- sama antre sepenuhnya (bukan busy-loop); sesi kedua menunggu, lalu berjalan dengan snapshot
-- state pasca-commit sesi pertama. Efek client: sesi kedua melihat `status='closed'` atau
-- baris `user_score_results` yang lengkap, sesuai kontrak error/idempotency existing.
--
-- IDEMPOTEN: create or replace tidak mereset ACL yang sudah ada (memory
-- anon-public-rpc-grant-gotcha: hanya DROP FUNCTION yang reset PUBLIC EXECUTE ke default).
-- ACL revoke dari 0013 + 0050 tetap berlaku. Kontrak T-DB-3 mem-verifikasi.
--
-- NOL PERUBAHAN SIGNATURE: signature 4-RPC Fase 7 tetap → database.types.ts TIDAK perlu regen.
-- Body fungsi dijaga byte-identical dengan 0039 kecuali baris `perform pg_advisory_xact_lock(...)`
-- sebagai statement pertama di dalam BEGIN blok utama. Perubahan lain di 0013/0039 tidak
-- tersentuh.
--
-- KONFLIK PENOMORAN: settings-consumers-owner-decisions juga mengklaim slot 0078. Bila
-- settings-consumers landed duluan ke origin/staging, rename file ini + kontraknya ke 0079
-- (dan update `basis:` di specs/score-ranking-finalization-bridge.md).
--
-- OPEN_PERIOD_SNAPSHOT: SENGAJA TIDAK di-lock. RPC tsb tidak menerima UUID periode; guard
-- "one active per org" sudah ditegakkan partial unique index ux_period_snapshots_one_active_per_org
-- (0013:120-121). Tidak ada permukaan race yang membutuhkan advisory lock.
--
-- OVERRIDE_USER_SCORE: SENGAJA TIDAK di-lock. Path override tidak dipanggil dari orchestrator
-- finalize (single-actor server E1 dipertahankan). Race dua-actor pada baris yang sama
-- di-serialisasi oleh partial unique index + baris-level lock existing.

-- ============================================================ RPC: calculate_period_scores (+ advisory lock)
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
  -- Advisory lock (0078): serialize per-periodId. Statement pertama supaya sesi lain
  -- yang menunggu tidak melakukan pekerjaan yang akan di-supersede. Auto-release di COMMIT/ROLLBACK.
  perform pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text));

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

-- ============================================================ RPC: close_period_snapshot (+ advisory lock)
create or replace function public.close_period_snapshot(p_period_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_period public.period_snapshots; v_count int := 0;
begin
  -- Advisory lock (0078): serialize per-periodId. Menutup R2 (calc mid-flight vs close):
  -- close menunggu calc selesai, membaca state pasca-commit yang konsisten.
  perform pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text));

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

  -- Insert ranking_snapshots dengan rank() (D11 rank kembar; rank berikut MELOMPAT).
  -- full_name HANYA sebagai display tie-breaker di ORDER BY (bukan dalam OVER clause).
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
