-- 0024 — UI-S-S01 follow-up: gate Σ=100% contribution_pct saat aktivasi Strategy (PRD §20).
--
-- Logic:
--   - Saat aktivasi Strategy X: contribution_pct WAJIB diisi (tidak NULL).
--   - Σ contribution_pct dari semua Strategy aktif sib (kpi_area_id sama, status='active', id<>X)
--     + X.contribution_pct HARUS = 100 (toleransi 0.001, selaras numeric(6,3)).
--   - Active siblings dgn contribution_pct NULL (warisan pra-0023) di-coalesce ke 0.
--
-- Catatan governance: gate ini menjaga konsistensi planning — Strategy tidak boleh diaktifkan
-- bila menyebabkan total bobot kontribusi ke parent KPI Area melebihi/kurang dari 100%.

create or replace function public.activate_strategy(p_strategy_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.strategies;
  v_other_sum numeric;
  v_total numeric;
begin
  select * into s from public.strategies where id = p_strategy_id;
  if not found then raise exception 'Strategy tidak ditemukan.'; end if;
  if not (s.created_by = auth.uid() or s.pic_id = auth.uid() or public.is_kpi_area_pic(s.kpi_area_id)
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
    from public.strategies
   where kpi_area_id = s.kpi_area_id
     and status = 'active'
     and id <> p_strategy_id;
  v_total := v_other_sum + s.contribution_pct;
  if abs(v_total - 100) > 0.001 then
    raise exception 'Total Kontribusi Quarter Strategy di KPI Area harus 100%%; setelah aktivasi akan menjadi %.', v_total;
  end if;

  update public.strategies set status = 'active' where id = p_strategy_id;
  perform public.write_activity('strategy', p_strategy_id, 'activate', '{}'::jsonb);
end;
$$;
