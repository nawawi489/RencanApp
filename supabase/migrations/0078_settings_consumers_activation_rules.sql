-- =====================================================================
-- 0078_settings_consumers_activation_rules.sql
-- =====================================================================
-- Bundled fix untuk §34.5 Card Completion Rule + §34.6 Keterangan Card
-- yang selama V1.83 tersimpan tanpa consumer runtime (writer UI nembak
-- public.settings key store yang bukan tabel authoritative).
--
-- Spec: wiki/concepts/settings-consumers-spec.md (v2 + D-8 amendment)
-- TDD plan: wiki/concepts/settings-consumers-tdd-plan.md
-- Owner decisions: memory/settings-consumers-owner-decisions.md (D-1..D-8)
--
-- Highlights:
--   * Storage kanonik `card_completion_rules` + `card_guidance_contents`
--     (dedicated Fase 1, sudah seeded 0047 untuk guidance).
--   * Helper `enforce_card_completion_rule(text, text[], jsonb)` — dipanggil
--     6 RPC activate_*. Locked base STRUKTUR di-preserve verbatim dari
--     bentuk sebelumnya (name/pic/period/dst.), pesan field-wajib diganti
--     generic sesuai PRD §7.4 ("Lengkapi data wajib..."); pesan MBR gate
--     + contribution-quarter tetap spesifik karena bukan "field wajib".
--   * D-8 (amendment 2026-07-19): helper TIDAK insert ke governance_violations
--     karena rollback single-tx pattern (mirror Fase 7 note). Defer autonomous-tx
--     ke follow-up ticket FUT-2. Test S1 assert count tak berubah.
--   * Writer RPC upsert_card_completion_rule + upsert_card_guidance;
--     permission gate share `manage_card_completion_rule` (D-7).
--   * Audit `write_activity` diff before/after.
--   * Legacy `settings` key `card_completion_rule_%` + `card_guidance_%`
--     DIHAPUS setelah audit `settings_legacy_purged` per org. Whitelist
--     `upsert_settings` di-rewrite jadi 5 retain prefix.
--   * Sanity fail-fast ACL check untuk 9 fungsi.
--
-- Prasyarat: 0005 (skema 2 tabel), 0014 (upsert_settings + write_activity),
-- 0047 (guidance seed), 0067 (activate_* SECURITY DEFINER), 0077 (trigger
-- anti-bypass) — semua sudah applied di local DB (nomor lokal berbeda).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Step 0. Preflight guard — no duplicate (org, card_type) di guidance table
-- ---------------------------------------------------------------------
do $$
declare v_dup int;
begin
  select count(*) into v_dup from (
    select organization_id, card_type, count(*) as c
    from public.card_guidance_contents
    group by organization_id, card_type
    having count(*) > 1
  ) x;
  if v_dup > 0 then
    raise exception '0078 preflight: card_guidance_contents has % duplicate (org, card_type) group(s). Cleanup manual dulu.', v_dup;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Step 1. Partial unique index di card_guidance_contents (bebas versi PG)
-- ---------------------------------------------------------------------
create unique index if not exists card_guidance_org_ct_uq
  on public.card_guidance_contents (organization_id, card_type)
  where organization_id is not null;

create unique index if not exists card_guidance_null_ct_uq
  on public.card_guidance_contents (card_type)
  where organization_id is null;

-- ---------------------------------------------------------------------
-- Step 2. Cleanup legacy per-org seed 0005:598 (field-name lawas)
-- ---------------------------------------------------------------------
delete from public.card_completion_rules
where required_fields::text ~ 'reviewer_id|expected_output|definition_of_done|priority|start_date|deadline';

-- ---------------------------------------------------------------------
-- Step 3. Seed default org-NULL row di card_completion_rules (6 baris)
--         Isi = replica locked base configurable per cardType. Admin
--         boleh override per-org via upsert_card_completion_rule.
-- ---------------------------------------------------------------------
insert into public.card_completion_rules (organization_id, card_type, required_fields, updated_at)
select null, ct, rf::jsonb, now() from (values
  ('goal',              '["target_value"]'),
  ('strategy',          '["target","expected_outcome"]'),
  ('initiative',        '["reason","main_risk","alternative"]'),
  ('action_plan',       '["target_result","team_id"]'),
  ('development_area',  '[]'),
  ('problem_statement', '["impact"]')
) as v(ct, rf)
where not exists (
  select 1 from public.card_completion_rules
  where organization_id is null and card_type = v.ct
);

-- ---------------------------------------------------------------------
-- Step 4. Helper enforce_card_completion_rule
--         D-8: SKIP governance_violations INSERT (single-tx rollback).
--         detail.missing di raise error jadi telemetry-only.
-- ---------------------------------------------------------------------
create or replace function public.enforce_card_completion_rule(
  p_card_type text,
  p_required text[],
  p_row jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_missing text[] := array[]::text[]; v_field text;
begin
  foreach v_field in array coalesce(p_required, array[]::text[]) loop
    if v_field not in (
      'target_value','target','target_result','expected_outcome',
      'reason','main_risk','alternative','impact','team_id'
    ) then
      -- Server rejects unknown field silently (upsert RPC sudah validate; ini defense-in-depth).
      -- Skip supaya legacy row dgn field lawas tak jadi kegagalan aktivasi (sudah dibersihkan Step 2).
      continue;
    end if;
    if (p_row ->> v_field) is null or (p_row ->> v_field) = '' then
      v_missing := array_append(v_missing, v_field);
    end if;
  end loop;

  if array_length(v_missing, 1) is null then return; end if;

  raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.'
    using errcode = 'P0001',
          detail  = jsonb_build_object('missing', v_missing)::text;
end;
$$;

-- ---------------------------------------------------------------------
-- Step 5. Helper baca required_fields per (org, cardType) dgn fallback ke org-NULL
-- ---------------------------------------------------------------------
create or replace function public.card_completion_rule_for(
  p_org uuid, p_card_type text
) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select array(select jsonb_array_elements_text(required_fields))
       from public.card_completion_rules
      where organization_id = p_org and card_type = p_card_type),
    (select array(select jsonb_array_elements_text(required_fields))
       from public.card_completion_rules
      where organization_id is null and card_type = p_card_type),
    array[]::text[]
  );
$$;

-- ---------------------------------------------------------------------
-- Step 6. Rewrite 6 activate_* RPC
--         Struktur locked base preserved verbatim; hanya pesan field-wajib
--         diganti generic sesuai PRD §7.4. Helper dipanggil sesudah locked base.
-- ---------------------------------------------------------------------
create or replace function public.activate_goal(p_goal_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare g public.goals; v_kpi int;
begin
  select * into g from public.goals where id = p_goal_id;
  if not found then raise exception 'Goal tidak ditemukan.'; end if;
  if g.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (g.created_by = auth.uid() or g.pic_id = auth.uid() or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Goal ini.';
  end if;
  if g.status <> 'draft' then raise exception 'Goal sudah diaktifkan.'; end if;
  if coalesce(trim(g.name), '') = '' or g.pic_id is null or g.period_start is null or g.period_end is null
     or coalesce(trim(g.target_value), '') = '' then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;
  select count(*) into v_kpi from public.strategies where goal_id = p_goal_id;
  if v_kpi < 1 then
    raise exception 'Goal wajib memiliki minimal 1 KPI Area sebelum diaktifkan.';
  end if;
  perform public.enforce_card_completion_rule('goal',
    public.card_completion_rule_for(g.organization_id, 'goal'),
    to_jsonb(g));
  update public.goals set status = 'active' where id = p_goal_id;
  perform public.write_activity('goal', p_goal_id, 'activate', '{}'::jsonb);
end;
$$;

create or replace function public.activate_strategy(p_strategy_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare k public.strategies; v_rule public.minimum_breakdown_rules; v_initiatives int;
begin
  select * into k from public.strategies where id = p_strategy_id;
  if not found then raise exception 'KPI Area tidak ditemukan.'; end if;
  if k.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (k.created_by = auth.uid() or k.pic_id = auth.uid() or public.is_goal_pic(k.goal_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan KPI Area ini.';
  end if;
  if k.status <> 'draft' then raise exception 'KPI Area sudah diaktifkan.'; end if;
  if coalesce(trim(k.name), '') = '' or k.pic_id is null or k.period_start is null or k.period_end is null
     or coalesce(trim(k.target), '') = ''
     or coalesce(trim(k.expected_outcome), '') = '' then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;

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

  perform public.enforce_card_completion_rule('strategy',
    public.card_completion_rule_for(k.organization_id, 'strategy'),
    to_jsonb(k));

  update public.strategies set status = 'active' where id = p_strategy_id;
  perform public.write_activity('strategy', p_strategy_id, 'activate', '{}'::jsonb);
end;
$$;

create or replace function public.activate_initiative(p_initiative_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare s public.initiatives; v_other_sum numeric; v_total numeric;
begin
  select * into s from public.initiatives where id = p_initiative_id;
  if not found then raise exception 'Strategy tidak ditemukan.'; end if;
  if s.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (s.created_by = auth.uid() or s.pic_id = auth.uid() or public.is_strategy_pic(s.strategy_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Strategy ini.';
  end if;
  if s.status <> 'draft' then raise exception 'Strategy sudah diaktifkan.'; end if;
  if coalesce(trim(s.name), '') = '' or s.pic_id is null or s.period_start is null or s.period_end is null then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;
  if coalesce(trim(s.reason), '') = '' or coalesce(trim(s.main_risk), '') = '' or coalesce(trim(s.alternative), '') = '' then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;

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

  perform public.enforce_card_completion_rule('initiative',
    public.card_completion_rule_for(s.organization_id, 'initiative'),
    to_jsonb(s));

  update public.initiatives set status = 'active' where id = p_initiative_id;
  perform public.write_activity('initiative', p_initiative_id, 'activate', '{}'::jsonb);
end;
$$;

create or replace function public.activate_action_plan(p_action_plan_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare i public.action_plans;
begin
  select * into i from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Initiative tidak ditemukan.'; end if;
  if i.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (i.created_by = auth.uid() or i.pic_id = auth.uid()
          or public.is_problem_statement_pic(i.problem_statement_id)
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Initiative ini.';
  end if;
  if i.status <> 'draft' then raise exception 'Initiative sudah diaktifkan.'; end if;
  if coalesce(trim(i.name), '') = '' or coalesce(trim(i.target_result), '') = ''
     or i.pic_id is null or i.period_start is null or i.period_end is null
     or i.team_id is null then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;
  perform public.enforce_card_completion_rule('action_plan',
    public.card_completion_rule_for(i.organization_id, 'action_plan'),
    to_jsonb(i));
  update public.action_plans set status = 'active' where id = p_action_plan_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'activate', '{}'::jsonb);
end;
$$;

create or replace function public.activate_development_area(p_development_area_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare d public.development_areas; v_rule public.minimum_breakdown_rules; v_children int;
begin
  select * into d from public.development_areas where id = p_development_area_id;
  if not found then raise exception 'Development Area tidak ditemukan.'; end if;
  if d.organization_id is distinct from public.current_user_org() then
    raise exception 'Anda tidak berwenang mengakses card lintas-organisasi.';
  end if;
  if not (d.created_by = auth.uid() or d.pic_id = auth.uid()
          or public.has_permission('manage_others_cards')) then
    raise exception 'Anda tidak berwenang mengaktifkan Development Area ini.';
  end if;
  if d.status <> 'draft' then raise exception 'Development Area sudah diaktifkan.'; end if;
  if coalesce(trim(d.name), '') = '' or d.pic_id is null
     or d.period_start is null or d.period_end is null then
    raise exception 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' using errcode='P0001';
  end if;

  v_rule := public.current_minimum_breakdown_rule('development_area', 'problem_statement');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_children from public.problem_statements
      where development_area_id = p_development_area_id and status <> 'archived'
        and organization_id = d.organization_id;
    if v_children < v_rule.min_count then
      raise exception
        'Development Area ini baru memiliki % dari % Problem Statement. Tambahkan % Problem Statement lagi agar bisa diaktifkan.',
        v_children, v_rule.min_count, (v_rule.min_count - v_children);
    end if;
  end if;

  perform public.enforce_card_completion_rule('development_area',
    public.card_completion_rule_for(d.organization_id, 'development_area'),
    to_jsonb(d));

  update public.development_areas set status = 'active' where id = p_development_area_id;
  perform public.write_activity('development_area', p_development_area_id, 'activate', '{}'::jsonb);
end;
$$;

create or replace function public.activate_problem_statement(p_problem_statement_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
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

  v_rule := public.current_minimum_breakdown_rule('problem_statement', 'initiative');
  if v_rule.id is not null and v_rule.enforcement_mode = 'blokir_aktivasi' then
    select count(*) into v_children from public.initiatives
      where problem_statement_id = p_problem_statement_id
        and status <> 'archived'
        and organization_id = p.organization_id;
    if v_children < v_rule.min_count then
      raise exception
        'Problem Statement ini baru memiliki % dari % Initiative. Tambahkan % Initiative lagi agar bisa diaktifkan.',
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

-- ---------------------------------------------------------------------
-- Step 7. Writer RPC: upsert_card_completion_rule + upsert_card_guidance
-- ---------------------------------------------------------------------
create or replace function public.upsert_card_completion_rule(
  p_card_type text,
  p_required_fields text[],
  p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_before text[]; v_field text;
begin
  if not (public.has_permission('manage_card_completion_rule')
       or public.has_permission('manage_settings')) then
    raise exception 'Anda tidak berwenang mengubah Card Completion Rule.' using errcode='42501';
  end if;
  if p_card_type not in ('goal','strategy','initiative','action_plan','development_area','problem_statement') then
    raise exception 'Card type % tidak valid.', p_card_type using errcode='22023';
  end if;
  foreach v_field in array coalesce(p_required_fields, array[]::text[]) loop
    if v_field not in (
      'target_value','target','target_result','expected_outcome',
      'reason','main_risk','alternative','impact','team_id'
    ) then
      raise exception 'Field % tidak dikenal.', v_field using errcode='22023';
    end if;
  end loop;

  v_org := public.current_user_org();

  select coalesce(
    (select array(select jsonb_array_elements_text(required_fields))
       from public.card_completion_rules
      where organization_id = v_org and card_type = p_card_type),
    array[]::text[]
  ) into v_before;

  insert into public.card_completion_rules (organization_id, card_type, required_fields, updated_at)
  values (v_org, p_card_type, to_jsonb(p_required_fields), now())
  on conflict (organization_id, card_type)
    do update set required_fields = excluded.required_fields, updated_at = now();

  perform public.write_activity('card_completion_rule', null, 'card_completion_rule_updated',
    jsonb_build_object(
      'card_type', p_card_type,
      'before', to_jsonb(v_before),
      'after',  to_jsonb(p_required_fields),
      'reason', p_reason
    ));
end;
$$;

create or replace function public.upsert_card_guidance(
  p_card_type text, p_title text, p_body text, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_before_title text; v_before_body text;
begin
  -- D-7: reuse manage_card_completion_rule permission untuk guidance juga.
  if not (public.has_permission('manage_card_completion_rule')
       or public.has_permission('manage_settings')) then
    raise exception 'Anda tidak berwenang mengubah Keterangan Card.' using errcode='42501';
  end if;
  if p_card_type not in ('goal','strategy','initiative','action_plan','task','development_area','problem_statement') then
    raise exception 'Card type % tidak valid.', p_card_type using errcode='22023';
  end if;
  if p_title is null or length(trim(p_title)) = 0 or length(p_title) > 120 then
    raise exception 'Judul wajib dan maksimal 120 karakter.' using errcode='22023';
  end if;
  if p_body is null or length(trim(p_body)) = 0 or length(p_body) > 800 then
    raise exception 'Isi wajib dan maksimal 800 karakter.' using errcode='22023';
  end if;

  v_org := public.current_user_org();

  select title, body into v_before_title, v_before_body
    from public.card_guidance_contents
    where organization_id = v_org and card_type = p_card_type;

  -- Partial unique index org-NOT-NULL variant (Step 1) — WHERE clause matches partial index
  insert into public.card_guidance_contents (organization_id, card_type, title, body, updated_at)
  values (v_org, p_card_type, p_title, p_body, now())
  on conflict (organization_id, card_type) where organization_id is not null
    do update set title = excluded.title, body = excluded.body, updated_at = now();

  perform public.write_activity('card_guidance', null, 'card_guidance_updated',
    jsonb_build_object(
      'card_type', p_card_type,
      'before', jsonb_build_object('title', v_before_title, 'body', v_before_body),
      'after',  jsonb_build_object('title', p_title, 'body', p_body),
      'reason', p_reason
    ));
end;
$$;

-- ---------------------------------------------------------------------
-- Step 8. GRANT/REVOKE bersih (memori anon-public-rpc-grant-gotcha.md)
-- ---------------------------------------------------------------------
revoke execute on function public.enforce_card_completion_rule(text, text[], jsonb) from public, anon;
revoke execute on function public.card_completion_rule_for(uuid, text)             from public, anon;
revoke execute on function public.upsert_card_completion_rule(text, text[], text)  from public, anon;
revoke execute on function public.upsert_card_guidance(text, text, text, text)     from public, anon;
revoke execute on function public.activate_goal(uuid)              from public, anon;
revoke execute on function public.activate_strategy(uuid)          from public, anon;
revoke execute on function public.activate_initiative(uuid)        from public, anon;
revoke execute on function public.activate_action_plan(uuid)       from public, anon;
revoke execute on function public.activate_development_area(uuid)  from public, anon;
revoke execute on function public.activate_problem_statement(uuid) from public, anon;

grant execute on function public.upsert_card_completion_rule(text, text[], text)  to authenticated;
grant execute on function public.upsert_card_guidance(text, text, text, text)     to authenticated;
grant execute on function public.activate_goal(uuid)              to authenticated;
grant execute on function public.activate_strategy(uuid)          to authenticated;
grant execute on function public.activate_initiative(uuid)        to authenticated;
grant execute on function public.activate_action_plan(uuid)       to authenticated;
grant execute on function public.activate_development_area(uuid)  to authenticated;
grant execute on function public.activate_problem_statement(uuid) to authenticated;
-- enforce_card_completion_rule + card_completion_rule_for: definer-only, NO grant to authenticated.

-- ---------------------------------------------------------------------
-- Step 9. Legacy settings audit + DELETE + rewrite upsert_settings whitelist
-- ---------------------------------------------------------------------
insert into public.activity_logs (organization_id, actor_id, entity_type, action, detail)
select organization_id, null, 'settings', 'settings_legacy_purged',
       jsonb_build_object(
         'keys_purged_count', count(*),
         'keys_sample', (array_agg(key order by key))[1:5],
         'migration', '0078'
       )
  from public.settings
 where key like 'card_completion_rule_%' or key like 'card_guidance_%'
 group by organization_id;

delete from public.settings
 where key like 'card_completion_rule_%' or key like 'card_guidance_%';

create or replace function public.upsert_settings(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_allowed boolean;
begin
  v_org := public.current_user_org();
  -- Whitelist post-0078: 5 retain prefix saja. card_completion_rule_* + card_guidance_*
  -- di-deprecate karena punya writer RPC dedicated.
  v_allowed := p_key like 'status_%'
            or p_key like 'priority_%'
            or p_key like 'notification_rule_%'
            or p_key = 'confidential_access_mode'
            or p_key = 'deadline_change_max_per_card';
  if not v_allowed then
    insert into public.governance_violations (organization_id, user_id, violation_type, severity, detail)
    values (v_org, auth.uid(), 'settings_invalid_key', 'critical', jsonb_build_object('key', p_key));
    raise exception 'Kunci pengaturan tidak valid.';
  end if;
  if not public.has_permission('manage_settings') then
    raise exception 'Anda tidak berwenang mengubah Pengaturan.';
  end if;
  insert into public.settings (organization_id, key, value, updated_at)
  values (v_org, p_key, p_value, now())
  on conflict (organization_id, key) do update set value = excluded.value, updated_at = now();
  perform public.write_activity('settings', null, 'setting_updated', jsonb_build_object('key', p_key));
end;
$$;
revoke execute on function public.upsert_settings(text, jsonb) from public, anon;
grant  execute on function public.upsert_settings(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Step 10. Sanity fail-fast ACL check (memori anon-public-rpc-grant-gotcha.md)
-- ---------------------------------------------------------------------
do $$
declare v_fn text; v_fns text[] := array[
  'public.enforce_card_completion_rule(text,text[],jsonb)',
  'public.card_completion_rule_for(uuid,text)',
  'public.upsert_card_completion_rule(text,text[],text)',
  'public.upsert_card_guidance(text,text,text,text)',
  'public.activate_goal(uuid)',
  'public.activate_strategy(uuid)',
  'public.activate_initiative(uuid)',
  'public.activate_action_plan(uuid)',
  'public.activate_development_area(uuid)',
  'public.activate_problem_statement(uuid)'
];
begin
  foreach v_fn in array v_fns loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '0078 ACL leak: anon has EXECUTE on %', v_fn;
    end if;
    if has_function_privilege('public', v_fn, 'EXECUTE') then
      raise exception '0078 ACL leak: PUBLIC has EXECUTE on %', v_fn;
    end if;
  end loop;
  raise notice '0078 sanity: ACL bersih untuk 10 fungsi';
end $$;

commit;
