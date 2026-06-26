-- 0020 UI-S-SF1: Score Formula editor inline.
-- Spec: specs/score-formula-editor.md §6 Keputusan Binding (mengikat).
--
-- Yang dilakukan:
--   (1) Trigger tg_score_formula_immutable_columns — block UPDATE pada status active/archived;
--       block perubahan kolom kunci (template_id/level/version_number/organization_id/created_by) pada draft.
--   (2) Extend tg_block_delete_append_only ke score_formula_versions.
--   (3) RPC create_score_formula_draft — 1-draft enforce; auto-clone categories saat NULL; emit
--       'score_formula_draft_created' di activity_log.
--   (4) RPC update_score_formula_version_weights — UPDATE in-place pada status='draft';
--       categories_set_mismatch guard (set kategori dikunci); emit 'score_formula_weights_updated'.
--   (5) Modifikasi activate_score_formula_version — tambah guard effective_date < current_date.
--       Tetap emit 'score_formula_activated' yg sudah ada (DEC-8 audit taxonomy: 3 event baru +
--       retain legacy 'score_formula_changed' yg di-emit oleh upsert_score_formula_version existing).
--
-- Catatan governance: log_governance_violation pada permission_denied path SILENT (V1 limitation;
-- ter-rollback bersama raise — preseden Fase 7 OQ-1 + PR #13/#14).

-- ============================================================ (1) Trigger immutable columns

create or replace function public.tg_score_formula_immutable_columns()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status in ('active', 'archived') then
    raise exception 'cannot_edit_non_draft: versi dgn status % tidak bisa diubah.', old.status;
  end if;
  if old.template_id is distinct from new.template_id then
    raise exception 'immutable_column: template_id tidak boleh diubah.';
  end if;
  if old.level is distinct from new.level then
    raise exception 'immutable_column: level tidak boleh diubah.';
  end if;
  if old.version_number is distinct from new.version_number then
    raise exception 'immutable_column: version_number tidak boleh diubah.';
  end if;
  if old.organization_id is distinct from new.organization_id then
    raise exception 'immutable_column: organization_id tidak boleh diubah.';
  end if;
  if old.created_by is distinct from new.created_by then
    raise exception 'immutable_column: created_by tidak boleh diubah.';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_score_formula_immutable_columns() from public, anon, authenticated;

drop trigger if exists score_formula_versions_immutable_columns on public.score_formula_versions;
create trigger score_formula_versions_immutable_columns
  before update on public.score_formula_versions
  for each row execute function public.tg_score_formula_immutable_columns();

-- ============================================================ (2) Extend append-only ke score_formula_versions

drop trigger if exists score_formula_versions_no_delete on public.score_formula_versions;
create trigger score_formula_versions_no_delete
  before delete on public.score_formula_versions
  for each row execute function public.tg_block_delete_append_only();

-- ============================================================ (3) RPC create_score_formula_draft

create or replace function public.create_score_formula_draft(
  p_template_id uuid,
  p_level text,
  p_change_reason text,
  p_categories jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_tmpl public.score_formula_templates;
  v_next int;
  v_categories jsonb;
  v_org uuid;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;

  if length(coalesce(trim(p_change_reason), '')) < 8 then
    raise exception 'Alasan perubahan wajib minimal 8 karakter.';
  end if;

  if p_level not in ('staff', 'management', 'c_level', 'ceo') then
    raise exception 'Level tidak valid (V1: staff/management/c_level/ceo).';
  end if;

  select * into v_tmpl from public.score_formula_templates where id = p_template_id;
  if not found then raise exception 'Template tidak ditemukan.'; end if;

  v_org := public.current_user_org();
  if v_tmpl.organization_id is not null and v_tmpl.organization_id <> v_org then
    raise exception 'Template lintas-organisasi tidak diizinkan.';
  end if;

  if exists (
    select 1 from public.score_formula_versions
      where template_id = p_template_id and level = p_level and status = 'draft'
  ) then
    raise exception 'draft_already_exists: Sudah ada draft untuk template+level ini. Buka draft existing.';
  end if;

  if p_categories is null then
    select categories into v_categories
      from public.score_formula_versions
      where template_id = p_template_id and level = p_level
      order by version_number desc
      limit 1;
    if v_categories is null then v_categories := '[]'::jsonb; end if;
  else
    v_categories := p_categories;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
    from public.score_formula_versions
    where template_id = p_template_id and level = p_level;

  insert into public.score_formula_versions
    (organization_id, template_id, version_number, level, categories, status, change_reason, created_by)
  values (
    coalesce(v_tmpl.organization_id, v_org),
    p_template_id, v_next, p_level, v_categories, 'draft', trim(p_change_reason), auth.uid()
  )
  returning id into v_id;

  perform public.write_activity('score_formula_version', v_id, 'score_formula_draft_created',
    jsonb_build_object('template_id', p_template_id, 'level', p_level, 'version', v_next,
                       'change_reason', trim(p_change_reason)));
  return v_id;
end;
$$;

revoke execute on function public.create_score_formula_draft(uuid, text, text, jsonb) from public, anon;
grant execute on function public.create_score_formula_draft(uuid, text, text, jsonb) to authenticated;

-- ============================================================ (4) RPC update_score_formula_version_weights

create or replace function public.update_score_formula_version_weights(
  p_version_id uuid,
  p_categories jsonb,
  p_change_reason text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.score_formula_versions;
  v_existing_codes text[];
  v_new_codes text[];
  v_item jsonb;
  v_weight numeric;
  v_org uuid;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;

  if length(coalesce(trim(p_change_reason), '')) < 8 then
    raise exception 'Alasan perubahan wajib minimal 8 karakter.';
  end if;

  select * into v from public.score_formula_versions where id = p_version_id;
  if not found then raise exception 'Versi formula tidak ditemukan.'; end if;

  v_org := public.current_user_org();
  if v.organization_id is not null and v.organization_id <> v_org then
    raise exception 'Versi lintas-organisasi tidak diizinkan.';
  end if;

  if v.status <> 'draft' then
    raise exception 'cannot_edit_non_draft: hanya draft yg bisa diedit (status saat ini %).', v.status;
  end if;

  if jsonb_typeof(p_categories) <> 'array' then
    raise exception 'categories harus array JSONB.';
  end if;

  -- categories_set_mismatch guard (§6 DEC-12) — set code TIDAK boleh berubah.
  if jsonb_array_length(v.categories) > 0 then
    select array_agg(c->>'code' order by c->>'code') into v_existing_codes
      from jsonb_array_elements(v.categories) c;
    select array_agg(c->>'code' order by c->>'code') into v_new_codes
      from jsonb_array_elements(p_categories) c;
    if v_existing_codes is distinct from v_new_codes then
      raise exception 'categories_set_mismatch: set kategori dikunci di V1; hanya bobot yg boleh diubah.';
    end if;
  end if;

  -- Validasi tiap weight integer 0..100 (§6 DEC-5).
  for v_item in select * from jsonb_array_elements(p_categories) loop
    if not jsonb_typeof(v_item->'weight') = 'number' then
      raise exception 'Bobot kategori % bukan angka.', v_item->>'code';
    end if;
    v_weight := (v_item->>'weight')::numeric;
    if v_weight < 0 or v_weight > 100 then
      raise exception 'Bobot kategori % di luar rentang 0..100.', v_item->>'code';
    end if;
    if v_weight <> floor(v_weight) then
      raise exception 'Bobot kategori % harus integer (V1).', v_item->>'code';
    end if;
  end loop;

  update public.score_formula_versions
    set categories = p_categories, change_reason = trim(p_change_reason)
    where id = p_version_id;

  perform public.write_activity('score_formula_version', p_version_id, 'score_formula_weights_updated',
    jsonb_build_object('change_reason', trim(p_change_reason),
                       'categories_count', jsonb_array_length(p_categories)));
end;
$$;

revoke execute on function public.update_score_formula_version_weights(uuid, jsonb, text) from public, anon;
grant execute on function public.update_score_formula_version_weights(uuid, jsonb, text) to authenticated;

-- ============================================================ (5) Patch activate_score_formula_version
-- §6 DEC-10: reject retroaktif.

create or replace function public.activate_score_formula_version(
  p_version_id uuid, p_effective_date date
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sum numeric; v_tmpl uuid; v_status text; v_eff date;
begin
  if not public.has_permission('manage_score_formula') then
    raise exception 'Anda tidak berwenang mengelola Score Formula.';
  end if;
  select template_id, status into v_tmpl, v_status
    from public.score_formula_versions where id = p_version_id;
  if not found then raise exception 'Versi formula tidak ditemukan.'; end if;
  if v_status <> 'draft' then raise exception 'Hanya versi draft yang bisa diaktifkan.'; end if;

  v_eff := coalesce(p_effective_date, current_date);
  if v_eff < current_date then
    raise exception 'effective_date_retroactive: tanggal efektif tidak boleh sebelum hari ini.';
  end if;

  select coalesce(sum((c->>'weight')::numeric), 0) into v_sum
    from public.score_formula_versions sfv,
         jsonb_array_elements(sfv.categories) c
    where sfv.id = p_version_id;
  if v_sum <> 100 then
    raise exception 'Total bobot Score Formula harus tepat 100. Saat ini %.', v_sum;
  end if;

  update public.score_formula_versions
    set status = 'archived'
    where template_id = v_tmpl and status = 'active' and id <> p_version_id;

  update public.score_formula_versions
    set status = 'active', activated_at = now(), effective_date = v_eff,
        approved_by = auth.uid()
    where id = p_version_id;

  perform public.write_activity('score_formula_version', p_version_id, 'score_formula_activated',
    jsonb_build_object('effective_date', v_eff));
end;
$$;

revoke execute on function public.activate_score_formula_version(uuid, date) from public, anon;
grant execute on function public.activate_score_formula_version(uuid, date) to authenticated;
