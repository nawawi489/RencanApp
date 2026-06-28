-- 0021 S2: KPI Area Target Breakdown (PRD V1.8.2 §12).
--
-- Yang dibangun:
--   (1) Tabel public.kpi_area_target_breakdowns — baris per (kpi_area_id, period_type, period_key).
--       period_type ∈ {'quarter','month'}. Untuk 'month', parent_quarter_key wajib ∈ {Q1..Q4}.
--       contribution_pct numeric(6,3) ∈ [0,100]. UNIQUE (kpi_area_id, period_type, period_key).
--   (2) RLS:
--       - SELECT: org_id match + (can_view_workspace OR PIC/creator KPI Area OR descendant access).
--       - INSERT/UPDATE/DELETE: DITUTUP utk authenticated; mutasi HANYA via RPC SECURITY DEFINER.
--   (3) RPC public.kpi_area_breakdown_replace(p_kpi_area_id, p_quarter jsonb, p_month jsonb, p_reason text):
--       Atomic replace. Validasi Σ=100 per (Q level) DAN per (Q-bulan level). Wajib reason ≥8 char.
--       Snapshot old → emit activity_log 'kpi_area_breakdown_updated' dgn detail {old,new,reason}.
--       Permission gate: PIC KPI Area / creator / manage_others_cards / is_goal_pic.
--   (4) Trigger append-only delete (sama pola dgn fase 7/8) — DELETE diblock; mutasi via RPC.
--
-- Catatan §12 kunci:
--   - "Monthly breakdown di setiap Quarter juga harus 100%" → relative ke parent Q, BUKAN ke tahun.
--   - "Kontribusi periode berjalan boleh diedit jika permission mengizinkan" → V1 wajib reason; ditahan
--     pada periode tertutup oleh future close mechanism (di luar scope S2).
--
-- Catatan governance (scope-guardrails): breakdown adalah BARIS pada KPI Area; bukan tabel kartu anak.
--   "Bobot planning card" tetap ditolak; bobot skor hanya di score_formula.

-- ============================================================ (1) Tabel breakdown

create table if not exists public.kpi_area_target_breakdowns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kpi_area_id uuid not null references public.kpi_areas(id) on delete cascade,
  period_type text not null,
  period_key text not null,
  parent_quarter_key text,
  contribution_pct numeric(6,3) not null,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_area_breakdown_unique unique (kpi_area_id, period_type, period_key),
  constraint kpi_area_breakdown_period_type_valid
    check (period_type in ('quarter','month')),
  constraint kpi_area_breakdown_pct_range
    check (contribution_pct >= 0 and contribution_pct <= 100),
  constraint kpi_area_breakdown_period_shape_valid
    check (
      (period_type = 'quarter'
        and period_key in ('Q1','Q2','Q3','Q4')
        and parent_quarter_key is null)
      or
      (period_type = 'month'
        and period_key in ('M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12')
        and parent_quarter_key in ('Q1','Q2','Q3','Q4'))
    )
);

create index if not exists kpi_area_breakdown_by_area
  on public.kpi_area_target_breakdowns (kpi_area_id, period_type);

alter table public.kpi_area_target_breakdowns enable row level security;

-- Append-only delete block (sama pola tg_block_delete_append_only dari 0005).
drop trigger if exists kpi_area_breakdown_no_delete on public.kpi_area_target_breakdowns;
create trigger kpi_area_breakdown_no_delete
  before delete on public.kpi_area_target_breakdowns
  for each row execute function public.tg_block_delete_append_only();

-- Maintain updated_at on UPDATE (pola dgn migrasi sebelumnya).
create or replace function public.tg_kpi_area_breakdown_touch_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.tg_kpi_area_breakdown_touch_updated_at() from public, anon, authenticated;

drop trigger if exists kpi_area_breakdown_touch on public.kpi_area_target_breakdowns;
create trigger kpi_area_breakdown_touch
  before update on public.kpi_area_target_breakdowns
  for each row execute function public.tg_kpi_area_breakdown_touch_updated_at();

-- ============================================================ (2) RLS policies

-- SELECT: konsisten dgn kpi_areas_select — org match + (workspace/PIC/creator/descendant).
create policy "kpi_area_breakdown_select" on public.kpi_area_target_breakdowns
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and exists (
      select 1 from public.kpi_areas k
      where k.id = kpi_area_target_breakdowns.kpi_area_id
        and (public.can_view_workspace()
             or k.pic_id = auth.uid()
             or k.created_by = auth.uid()
             or public.is_goal_pic(k.goal_id)
             or public.kpi_area_has_my_descendant(k.id))
    )
  );

-- INSERT/UPDATE/DELETE: TUTUP semua jalur direct DML; mutasi WAJIB via RPC SECURITY DEFINER di bawah.
-- (Tanpa policy INSERT/UPDATE/DELETE, default-deny dari RLS aktif.)

-- ============================================================ (3) Permission helper KPI Area

create or replace function public.can_edit_kpi_area_breakdown(p_kpi_area_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.kpi_areas k
    where k.id = p_kpi_area_id
      and k.organization_id = public.current_user_org()
      and (
        k.pic_id = auth.uid()
        or k.created_by = auth.uid()
        or public.has_permission('manage_others_cards')
        or public.is_goal_pic(k.goal_id)
      )
  );
$$;

revoke execute on function public.can_edit_kpi_area_breakdown(uuid) from public, anon;
grant execute on function public.can_edit_kpi_area_breakdown(uuid) to authenticated;

-- ============================================================ (4) RPC: replace breakdown atomik

create or replace function public.kpi_area_breakdown_replace(
  p_kpi_area_id uuid,
  p_quarter jsonb,   -- nullable; bila non-null wajib array [{period_key,pct}] dgn 4 entri Σ=100
  p_month   jsonb,   -- nullable; bila non-null wajib array [{period_key,parent_quarter_key,pct}] dgn 3 entri Σ=100 per Q yang diisi
  p_reason  text
) returns setof public.kpi_area_target_breakdowns
language plpgsql security definer set search_path = '' as $$
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
  if not public.can_edit_kpi_area_breakdown(p_kpi_area_id) then
    raise exception 'Anda tidak berwenang mengubah Target Breakdown KPI Area ini.';
  end if;

  -- Resolve org_id KPI Area (sumber kebenaran utk baris breakdown — kpi_area = tenant boundary).
  select organization_id into v_org from public.kpi_areas where id = p_kpi_area_id;
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
    from public.kpi_area_target_breakdowns
   where kpi_area_id = p_kpi_area_id;

  -- ---------------------------------------------------------- atomic replace
  -- Hapus per period_type yang sedang di-replace (NULL = jangan sentuh tipe itu).
  -- Catatan: trigger append-only delete tidak bisa apply ke RPC SECURITY DEFINER scope dgn
  -- session_user. Solusi: drop trigger sesaat tidak aman → pakai pendekatan UPDATE-or-INSERT.
  -- Implementasi: untuk setiap input baris, INSERT … ON CONFLICT (kpi_area_id, period_type, period_key)
  -- DO UPDATE SET contribution_pct, parent_quarter_key, reason, updated_at, created_by.
  -- Untuk baris yang TIDAK ada di input tapi ada di DB pada period_type tsb → set pct=0 (idempotent default).
  -- Untuk V1 sederhana: kalau caller kirim p_quarter empty array → tidak menyentuh; non-empty → upsert 4 baris.
  if p_quarter is not null and jsonb_array_length(p_quarter) = 4 then
    insert into public.kpi_area_target_breakdowns (
      organization_id, kpi_area_id, period_type, period_key, parent_quarter_key,
      contribution_pct, reason, created_by
    )
    select v_org, p_kpi_area_id, 'quarter', e->>'period_key', null,
           (e->>'pct')::numeric, p_reason, auth.uid()
      from jsonb_array_elements(p_quarter) as e
    on conflict (kpi_area_id, period_type, period_key)
      do update set
        contribution_pct = excluded.contribution_pct,
        parent_quarter_key = excluded.parent_quarter_key,
        reason = excluded.reason,
        created_by = excluded.created_by,
        updated_at = now();
  end if;

  if p_month is not null and jsonb_array_length(p_month) > 0 then
    insert into public.kpi_area_target_breakdowns (
      organization_id, kpi_area_id, period_type, period_key, parent_quarter_key,
      contribution_pct, reason, created_by
    )
    select v_org, p_kpi_area_id, 'month',
           e->>'period_key', e->>'parent_quarter_key',
           (e->>'pct')::numeric, p_reason, auth.uid()
      from jsonb_array_elements(p_month) as e
    on conflict (kpi_area_id, period_type, period_key)
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
    from public.kpi_area_target_breakdowns
   where kpi_area_id = p_kpi_area_id;

  perform public.write_activity(
    'kpi_area', p_kpi_area_id, 'target_breakdown_updated',
    jsonb_build_object('old', v_old, 'new', v_new, 'reason', p_reason)
  );

  -- ---------------------------------------------------------- return seluruh state baru
  return query
    select * from public.kpi_area_target_breakdowns
     where kpi_area_id = p_kpi_area_id
     order by period_type, period_key;
end;
$$;

revoke execute on function public.kpi_area_breakdown_replace(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.kpi_area_breakdown_replace(uuid, jsonb, jsonb, text) to authenticated;

-- ============================================================ (5) View helper untuk read
-- (Tetap pakai direct select via RLS; tidak butuh RPC khusus untuk read.)
