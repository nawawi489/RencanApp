-- EMS V1.8.1 — Contract suite UI-S-SF1 Score Formula editor (migrasi 0020).
-- Pola PR #13/#14: jwt claims + set local role authenticated + ROLLBACK. 'ALL PASS' = lolos.
--
-- 13 invarian (per §6 Keputusan Binding spec):
--   T1  PIC admin create_score_formula_draft sukses (return uuid).
--   T2  Create draft kedua untuk template+level sama → raise 'draft_already_exists' (DEC-11).
--   T3  change_reason <8 char trimmed → raise 'minimal 8' (DEC-4).
--   T4  update_score_formula_version_weights sukses dgn change_reason valid (categories=[] → no set lock).
--   T5  Weight non-integer (55.5) → raise 'integer' (DEC-5).
--   T6  Tambah code baru ke set yg sudah locked → raise 'categories_set_mismatch' (DEC-12).
--   T7  Save sum!=100 DIIZINKAN (DEC-6 work-in-progress).
--   T8  activate_score_formula_version dgn sum!=100 → raise '100' (existing 0013 logic).
--   T9  activate dgn effective_date < current_date → raise 'retroactive' (DEC-10).
--   T10 activate dgn current_date → sukses; status → 'active'.
--   T11 Direct UPDATE pada status='active' (bypass RPC) → trigger raise 'cannot_edit_non_draft' (DEC-1/15).
--   T12 Direct DELETE → trigger append-only raise (DEC-15 extend tg_block_delete_append_only).
--   T13 Non-admin (tanpa permission manage_score_formula) → raise 'berwenang' (defense-in-depth gate RPC).

begin;
do $$
declare
  v_org uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_admin uuid := '99999999-2222-0000-0000-aaaa00000001';
  v_nonadmin uuid := '99999999-2222-0000-0000-aaaa00000002';
  v_tmpl uuid := '99999999-2222-0000-0000-bbbb00000001';
  v_perm uuid; v_role_staff uuid;
  fails text := '';
  v_draft_id uuid; rec record;
begin
  select id into v_perm from public.permissions where key='manage_score_formula';
  select id into v_role_staff from public.role_templates where level='staff' limit 1;

  -- organization_id in app_metadata is required since 0083 (handle_new_user
  -- refuses to guess an org; the fixtures prelude creates two).
  insert into auth.users(id, raw_app_meta_data) values
    (v_admin,    jsonb_build_object('organization_id', v_org)),
    (v_nonadmin, jsonb_build_object('organization_id', v_org))
  on conflict do nothing;
  insert into public.profiles(id, organization_id, role_template_id, full_name, is_active) values
    (v_admin, v_org, v_role_staff, 'Admin', true),
    (v_nonadmin, v_org, v_role_staff, 'Non-admin', true)
  on conflict (id) do update set
    organization_id=excluded.organization_id, full_name=excluded.full_name, is_active=true;
  insert into public.user_permissions(user_id, permission_id, granted) values (v_admin, v_perm, true)
    on conflict (user_id, permission_id) do update set granted=true;
  insert into public.score_formula_templates(id, organization_id, level, name, created_by)
    values (v_tmpl, v_org, 'staff', 'Tmpl SF1 Test', v_admin);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

  begin v_draft_id := public.create_score_formula_draft(v_tmpl, 'staff', 'inisialisasi v1', null);
    if v_draft_id is null then fails := fails || 'T1_null; '; end if;
  exception when others then fails := fails || 'T1:' || sqlerrm || '; '; end;

  begin perform public.create_score_formula_draft(v_tmpl, 'staff', 'kedua kali', null);
    fails := fails || 'T2_no_exc; ';
  exception when others then if sqlerrm not ilike '%draft_already_exists%' then fails := fails || 'T2_msg:' || sqlerrm || '; '; end if; end;

  begin perform public.update_score_formula_version_weights(v_draft_id,
    jsonb_build_array(jsonb_build_object('code','x','weight',100,'source_metric','m')), 'short');
    fails := fails || 'T3_no_exc; ';
  exception when others then if sqlerrm not ilike '%minimal 8%' then fails := fails || 'T3_msg:' || sqlerrm || '; '; end if; end;

  begin perform public.update_score_formula_version_weights(v_draft_id,
    jsonb_build_array(jsonb_build_object('code','perf','weight',60,'source_metric','m1'),
                      jsonb_build_object('code','disc','weight',40,'source_metric','m2')),
    'set bobot perdana');
  exception when others then fails := fails || 'T4:' || sqlerrm || '; '; end;

  begin perform public.update_score_formula_version_weights(v_draft_id,
    jsonb_build_array(jsonb_build_object('code','perf','weight',55.5,'source_metric','m1'),
                      jsonb_build_object('code','disc','weight',44.5,'source_metric','m2')),
    'decimal harus tolak');
    fails := fails || 'T5_no_exc; ';
  exception when others then if sqlerrm not ilike '%integer%' then fails := fails || 'T5_msg:' || sqlerrm || '; '; end if; end;

  begin perform public.update_score_formula_version_weights(v_draft_id,
    jsonb_build_array(jsonb_build_object('code','perf','weight',50,'source_metric','m1'),
                      jsonb_build_object('code','disc','weight',30,'source_metric','m2'),
                      jsonb_build_object('code','newone','weight',20,'source_metric','m3')),
    'tambah code baru');
    fails := fails || 'T6_no_exc; ';
  exception when others then if sqlerrm not ilike '%categories_set_mismatch%' then fails := fails || 'T6_msg:' || sqlerrm || '; '; end if; end;

  begin perform public.update_score_formula_version_weights(v_draft_id,
    jsonb_build_array(jsonb_build_object('code','perf','weight',50,'source_metric','m1'),
                      jsonb_build_object('code','disc','weight',30,'source_metric','m2')),
    'sum belum 100 boleh save');
  exception when others then fails := fails || 'T7:' || sqlerrm || '; '; end;

  begin perform public.activate_score_formula_version(v_draft_id, null);
    fails := fails || 'T8_no_exc; ';
  exception when others then if sqlerrm not ilike '%100%' then fails := fails || 'T8_msg:' || sqlerrm || '; '; end if; end;

  -- T9a: update bobot ke 100 (commit independen sebelum T9b activate retroaktif)
  begin perform public.update_score_formula_version_weights(v_draft_id,
    jsonb_build_array(jsonb_build_object('code','perf','weight',60,'source_metric','m1'),
                      jsonb_build_object('code','disc','weight',40,'source_metric','m2')),
    'siap aktivasi');
  exception when others then fails := fails || 'T9a:' || sqlerrm || '; '; end;

  begin perform public.activate_score_formula_version(v_draft_id, current_date - 1);
    fails := fails || 'T9_no_exc; ';
  exception when others then if sqlerrm not ilike '%retroactive%' then fails := fails || 'T9_msg:' || sqlerrm || '; '; end if; end;

  begin perform public.activate_score_formula_version(v_draft_id, current_date);
  exception when others then fails := fails || 'T10:' || sqlerrm || '; '; end;
  select status into rec from public.score_formula_versions where id = v_draft_id;
  if rec.status <> 'active' then fails := fails || format('T10_status:%s; ', rec.status); end if;

  reset role;
  begin update public.score_formula_versions set categories = '[]'::jsonb where id = v_draft_id;
    fails := fails || 'T11_no_exc; ';
  exception when others then if sqlerrm not ilike '%cannot_edit_non_draft%' then fails := fails || 'T11_msg:' || sqlerrm || '; '; end if; end;

  begin delete from public.score_formula_versions where id = v_draft_id;
    fails := fails || 'T12_no_exc; ';
  exception when others then if sqlerrm not ilike '%append-only%' then fails := fails || 'T12_msg:' || sqlerrm || '; '; end if; end;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_nonadmin::text, 'role','authenticated')::text, true);
  begin perform public.create_score_formula_draft(v_tmpl, 'staff', 'akan ditolak gate', null);
    fails := fails || 'T13_no_exc; ';
  exception when others then if sqlerrm not ilike '%berwenang%' then fails := fails || 'T13_msg:' || sqlerrm || '; '; end if; end;

  reset role;
  if fails = '' then raise notice 'ALL PASS';
  else raise exception '%', fails;
  end if;
end;
$$;
rollback;
