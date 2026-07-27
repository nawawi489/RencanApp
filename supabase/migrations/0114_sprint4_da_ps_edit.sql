-- =============================================================================
-- 0114 — Sprint 4 follow-up (S4-3): edit Development Area + Problem Statement
-- =============================================================================
-- Melengkapi S4-1/S4-2 (0113) yang menutup 3 dari 5 tipe Card yang tak bisa
-- disunting pasca-buat. Dua sisanya (Development Area + Problem Statement)
-- ditutup di sini. Pola RPC + guard identik dengan 0113:
--
--   • Field terkunci pasca-aktivasi = dasar skor. DA/PS keduanya menyerap
--     kolom `period_start` / `period_end` yang jadi window pemetaan Action
--     Plan development ke skor periode; ubah pasca-active = angka historis
--     jadi tak konsisten dgn periodenya.
--
--   • PS juga menyertakan `impact` di kunci: severity classification jadi
--     input governance-violation weighting. Ubah pasca-active = ranking bug
--     lama berubah retroaktif.
--
--   • Kewenangan sunting = kewenangan aktivasi (creator/pic/
--     `manage_others_cards`). Sama dgn `activate_development_area` /
--     `activate_problem_statement` di source-of-truth 0005.
-- =============================================================================

-- ============================================================ 1. update_development_area (S4-3a)
create or replace function public.update_development_area(
  p_development_area_id uuid,
  p_name text,
  p_description text,
  p_pic_id uuid,
  p_period_start date,
  p_period_end date
) returns void language plpgsql security definer set search_path = '' as $$
declare d public.development_areas; v_org uuid; v_name text; v_changed text[] := '{}';
begin
  v_org := public.current_user_org();
  select * into d from public.development_areas
   where id = p_development_area_id and organization_id = v_org;
  if not found then raise exception 'Development Area tidak ditemukan.'; end if;

  if not (d.created_by = auth.uid() or d.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Development Area ini.';
  end if;
  if d.status not in ('draft', 'active') then
    raise exception 'Development Area berstatus % tidak bisa diubah.', d.status;
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then raise exception 'Nama Development Area wajib diisi.'; end if;

  if p_pic_id is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_pic_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'PIC harus anggota organisasi yang sama dan aktif.';
  end if;

  -- Periode terkunci pasca-aktivasi (dasar mapping AP → periode skor).
  if d.status <> 'draft' then
    if p_period_start is distinct from d.period_start
       or p_period_end is distinct from d.period_end then
      raise exception 'Periode Development Area terkunci setelah aktivasi.';
    end if;
  end if;

  if p_period_start is not null and p_period_end is not null
     and p_period_end < p_period_start then
    raise exception 'Periode selesai tidak boleh mendahului periode mulai.';
  end if;

  if v_name is distinct from d.name then v_changed := v_changed || 'name'::text; end if;
  if nullif(trim(coalesce(p_description,'')),'') is distinct from d.description then
    v_changed := v_changed || 'description'::text;
  end if;
  if p_pic_id is distinct from d.pic_id then v_changed := v_changed || 'pic_id'::text; end if;
  if p_period_start is distinct from d.period_start
     or p_period_end is distinct from d.period_end then
    v_changed := v_changed || 'period'::text;
  end if;

  update public.development_areas
     set name         = v_name,
         description  = nullif(trim(coalesce(p_description,'')),''),
         pic_id       = p_pic_id,
         period_start = p_period_start,
         period_end   = p_period_end
   where id = p_development_area_id;

  perform public.write_activity('development_area', p_development_area_id, 'update',
    jsonb_build_object('fields', v_changed, 'status', d.status));
end;
$$;

revoke execute on function public.update_development_area(uuid, text, text, uuid, date, date) from public, anon;
grant execute on function public.update_development_area(uuid, text, text, uuid, date, date) to authenticated;

-- ============================================================ 2. update_problem_statement (S4-3b)
create or replace function public.update_problem_statement(
  p_problem_statement_id uuid,
  p_name text,
  p_description text,
  p_pic_id uuid,
  p_impact text,
  p_initial_evidence text,
  p_period_start date,
  p_period_end date
) returns void language plpgsql security definer set search_path = '' as $$
declare ps public.problem_statements; v_org uuid; v_name text; v_impact text; v_changed text[] := '{}';
begin
  v_org := public.current_user_org();
  select * into ps from public.problem_statements
   where id = p_problem_statement_id and organization_id = v_org;
  if not found then raise exception 'Problem Statement tidak ditemukan.'; end if;

  if not (ps.created_by = auth.uid() or ps.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengubah Problem Statement ini.';
  end if;
  if ps.status not in ('draft', 'active') then
    raise exception 'Problem Statement berstatus % tidak bisa diubah.', ps.status;
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then raise exception 'Nama Problem Statement wajib diisi.'; end if;

  if p_pic_id is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_pic_id and p.organization_id = v_org and p.is_active
  ) then
    raise exception 'PIC harus anggota organisasi yang sama dan aktif.';
  end if;

  v_impact := nullif(trim(coalesce(p_impact,'')),'');
  if v_impact is not null and v_impact not in ('high', 'medium', 'low') then
    raise exception 'Impact tidak dikenal: % (harus high/medium/low).', v_impact;
  end if;

  -- Periode + impact terkunci pasca-aktivasi (dasar skor & severity weighting).
  if ps.status <> 'draft' then
    if p_period_start is distinct from ps.period_start
       or p_period_end is distinct from ps.period_end then
      raise exception 'Periode Problem Statement terkunci setelah aktivasi.';
    end if;
    if v_impact is distinct from ps.impact then
      raise exception 'Impact Problem Statement terkunci setelah aktivasi.';
    end if;
  end if;

  if p_period_start is not null and p_period_end is not null
     and p_period_end < p_period_start then
    raise exception 'Periode selesai tidak boleh mendahului periode mulai.';
  end if;

  if v_name is distinct from ps.name then v_changed := v_changed || 'name'::text; end if;
  if nullif(trim(coalesce(p_description,'')),'') is distinct from ps.description then
    v_changed := v_changed || 'description'::text;
  end if;
  if p_pic_id is distinct from ps.pic_id then v_changed := v_changed || 'pic_id'::text; end if;
  if v_impact is distinct from ps.impact then v_changed := v_changed || 'impact'::text; end if;
  if nullif(trim(coalesce(p_initial_evidence,'')),'') is distinct from ps.initial_evidence then
    v_changed := v_changed || 'initial_evidence'::text;
  end if;
  if p_period_start is distinct from ps.period_start
     or p_period_end is distinct from ps.period_end then
    v_changed := v_changed || 'period'::text;
  end if;

  update public.problem_statements
     set name             = v_name,
         description      = nullif(trim(coalesce(p_description,'')),''),
         pic_id           = p_pic_id,
         impact           = v_impact,
         initial_evidence = nullif(trim(coalesce(p_initial_evidence,'')),''),
         period_start     = p_period_start,
         period_end       = p_period_end
   where id = p_problem_statement_id;

  perform public.write_activity('problem_statement', p_problem_statement_id, 'update',
    jsonb_build_object('fields', v_changed, 'status', ps.status));
end;
$$;

revoke execute on function public.update_problem_statement(uuid, text, text, uuid, text, text, date, date) from public, anon;
grant execute on function public.update_problem_statement(uuid, text, text, uuid, text, text, date, date) to authenticated;
