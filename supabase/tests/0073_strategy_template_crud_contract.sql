-- Migration 0073 contract test — strategy_templates per-org CRUD + cross-tenant RLS.
--
-- 0073 replaced the withdrawn 0061 draft, whose INSERT/UPDATE/DELETE policies were
-- gated on `has_permission(...)` ONLY, with no organization scope — so an admin of
-- org A could DELETE/UPDATE strategy_templates belonging to org B (cross-tenant).
-- This contract locks the fix so a future CREATE-OR-REPLACE / policy rewrite that
-- drops the org scope fails CI instead of shipping the hole to production.
--
-- Rewritten from the original pgTAP draft (0073_..._contract.wip.sql) into the
-- extension-free `do $$ ... raise exception $$ / rollback` pattern the rest of the
-- P2 suite uses (pgTAP is not enabled in this repo's fresh bootstrap, so the pgTAP
-- version never ran). Structural checks are preserved AND strengthened with the
-- behavioral cross-tenant proofs the pgTAP version lacked.
--
-- Pattern: `raise notice 'PASS'` on success, `raise exception 'FAIL: ...'` on failure.
-- Fixture constants (supabase/tests/_fixtures.sql):
--   CEO A = ca8c1471-b870-4f09-a149-25e5eae99d6f, org A = 4b07a19f-550d-4952-b0d8-44f38f651d89.
--   CEO-level users satisfy has_permission('manage_kpi_area_templates') unconditionally
--   (0041 has_permission: `user_role_level() = 'ceo'`), so the cross-org blocks below
--   are proven to come from the ORG scope, not the permission gate.
-- Run (local docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/0073_strategy_template_crud_contract.sql

-- ============================================================ 0073-DB-1: schema (organization_id + is_active)
do $$
declare fails text := '';
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'strategy_templates'
      and column_name = 'organization_id' and is_nullable = 'NO'
  ) then fails := fails || 'organization_id_missing_or_nullable; '; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'strategy_templates'
      and column_name = 'is_active' and is_nullable = 'NO' and column_default = 'true'
  ) then fails := fails || 'is_active_missing_or_wrong_default; '; end if;

  if fails <> '' then raise exception 'FAIL 0073-DB-1: %', fails; end if;
  raise notice 'PASS 0073-DB-1: organization_id NOT NULL + is_active NOT NULL default true';
end $$;

-- ============================================================ 0073-DB-2: 4 org-scoped RLS policies exist, correctly wired
do $$
declare
  v_expected text[][] := array[
    ['strategy_templates_select', 'SELECT'],
    ['strategy_templates_insert', 'INSERT'],
    ['strategy_templates_update', 'UPDATE'],
    ['strategy_templates_delete', 'DELETE']
  ];
  i int;
  v_name text; v_cmd text; v_qual text; v_check text;
  fails text := '';
begin
  for i in 1 .. array_length(v_expected, 1) loop
    v_name := v_expected[i][1];
    v_cmd  := v_expected[i][2];
    select cmd, qual, with_check into v_cmd, v_qual, v_check
      from pg_policies
     where schemaname = 'public' and tablename = 'strategy_templates'
       and policyname = v_name;
    if not found then
      fails := fails || v_name || '_missing; ';
      continue;
    end if;
    if v_cmd <> v_expected[i][2] then
      fails := fails || v_name || '_wrong_cmd(' || v_cmd || '); ';
    end if;
    -- Write/select policies must reference the org scope. INSERT has no USING
    -- (only WITH CHECK); the others carry it in USING. Assert the org guard is
    -- present in whichever clause applies.
    if coalesce(v_qual, '') !~ 'current_user_org' and coalesce(v_check, '') !~ 'current_user_org' then
      fails := fails || v_name || '_missing_org_scope; ';
    end if;
  end loop;

  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'strategy_templates') <> 4 then
    fails := fails || 'policy_count_not_4; ';
  end if;

  if fails <> '' then raise exception 'FAIL 0073-DB-2: %', fails; end if;
  raise notice 'PASS 0073-DB-2: select+insert+update+delete policies exist, org-scoped';
end $$;

-- ============================================================ 0073-DB-3: permission label renamed to V1.83 terminology
do $$
begin
  if (select label from public.permissions where key = 'manage_kpi_area_templates')
     is distinct from 'Kelola Strategy Template' then
    raise exception 'FAIL 0073-DB-3: permission label not renamed to "Kelola Strategy Template"';
  end if;
  raise notice 'PASS 0073-DB-3: permission label renamed';
end $$;

-- ============================================================ 0073-DB-4: cross-org DELETE blocked (THE hole from the 0061 draft)
-- CEO A (permission satisfied) tries to DELETE org B's template. RLS must filter
-- the row out → 0 rows deleted, template survives.
begin;
do $$
declare
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_orgB uuid; v_gt uuid; v_tplB uuid; v_remaining int; fails text := '';
begin
  select id into v_gt from public.goal_templates limit 1;
  if v_gt is null then raise notice 'SKIP 0073-DB-4 (no goal_templates seed)'; return; end if;

  insert into public.organizations (name) values ('OrgB-victim-tpl-delete') returning id into v_orgB;
  insert into public.strategy_templates
    (organization_id, goal_template_id, division, division_label, name, is_active)
    values (v_orgB, v_gt, 'cmo', 'Sales & Marketing (CMO)', 'B-secret-template', true)
    returning id into v_tplB;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceoA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.strategy_templates where id = v_tplB;   -- RLS → 0 rows
  execute 'reset role';

  select count(*) into v_remaining from public.strategy_templates where id = v_tplB;
  if v_remaining <> 1 then fails := fails || 'cross_org_delete_succeeded(remaining=' || v_remaining || '); '; end if;

  if fails <> '' then raise exception 'FAIL 0073-DB-4: %', fails; end if;
  raise notice 'PASS 0073-DB-4: cross-org DELETE blocked (template survives)';
end $$;
rollback;

-- ============================================================ 0073-DB-5: cross-org UPDATE blocked + cross-org SELECT invisible
begin;
do $$
declare
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_orgB uuid; v_gt uuid; v_tplB uuid; v_name text; v_visible int; fails text := '';
begin
  select id into v_gt from public.goal_templates limit 1;
  if v_gt is null then raise notice 'SKIP 0073-DB-5 (no goal_templates seed)'; return; end if;

  insert into public.organizations (name) values ('OrgB-victim-tpl-update') returning id into v_orgB;
  insert into public.strategy_templates
    (organization_id, goal_template_id, division, division_label, name, is_active)
    values (v_orgB, v_gt, 'coo', 'Operations (COO)', 'B-original-name', true)
    returning id into v_tplB;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceoA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.strategy_templates set name = 'A-hijacked-name' where id = v_tplB;   -- RLS → 0 rows
  select count(*) into v_visible from public.strategy_templates where id = v_tplB;    -- RLS → invisible
  execute 'reset role';

  if v_visible <> 0 then fails := fails || 'cross_org_select_leak(visible=' || v_visible || '); '; end if;
  select name into v_name from public.strategy_templates where id = v_tplB;
  if v_name is distinct from 'B-original-name' then fails := fails || 'cross_org_update_mutated(' || coalesce(v_name, 'NULL') || '); '; end if;

  if fails <> '' then raise exception 'FAIL 0073-DB-5: %', fails; end if;
  raise notice 'PASS 0073-DB-5: cross-org UPDATE blocked + SELECT invisible';
end $$;
rollback;

-- ============================================================ 0073-DB-6: same-org DELETE still works (guard does not over-block)
begin;
do $$
declare
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_orgA uuid := '4b07a19f-550d-4952-b0d8-44f38f651d89';
  v_gt uuid; v_tplA uuid; v_remaining int; fails text := '';
begin
  select id into v_gt from public.goal_templates limit 1;
  if v_gt is null then raise notice 'SKIP 0073-DB-6 (no goal_templates seed)'; return; end if;

  insert into public.strategy_templates
    (organization_id, goal_template_id, division, division_label, name, is_active)
    values (v_orgA, v_gt, 'cfo', 'Finance (CFO)', 'A-own-template', true)
    returning id into v_tplA;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceoA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  delete from public.strategy_templates where id = v_tplA;   -- same org + permission → 1 row
  execute 'reset role';

  select count(*) into v_remaining from public.strategy_templates where id = v_tplA;
  if v_remaining <> 0 then fails := fails || 'same_org_delete_blocked(remaining=' || v_remaining || '); '; end if;

  if fails <> '' then raise exception 'FAIL 0073-DB-6: %', fails; end if;
  raise notice 'PASS 0073-DB-6: same-org DELETE works (regression)';
end $$;
rollback;

-- ============================================================ 0073-DB-7: apply_goal_template (SECURITY DEFINER) does not seed cross-org templates
-- The RPC bypasses RLS; 0073 added `strategy_templates.organization_id = v_org` to
-- its seeding query. CEO A applying a goal_template shared with org B must NOT get
-- strategies seeded from org B's template.
begin;
do $$
declare
  v_ceoA uuid := 'ca8c1471-b870-4f09-a149-25e5eae99d6f';
  v_orgB uuid; v_gt uuid; v_goal uuid; v_leaked int; fails text := '';
begin
  select id into v_gt from public.goal_templates limit 1;
  if v_gt is null then raise notice 'SKIP 0073-DB-7 (no goal_templates seed)'; return; end if;

  insert into public.organizations (name) values ('OrgB-victim-rpc') returning id into v_orgB;
  insert into public.strategy_templates
    (organization_id, goal_template_id, division, division_label, name, is_active)
    values (v_orgB, v_gt, 'chro', 'People (CHRO)', 'B-rpc-secret', true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_ceoA, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_goal := public.apply_goal_template(v_gt, v_ceoA, current_date, current_date + 30);
  execute 'reset role';

  select count(*) into v_leaked
    from public.strategies where goal_id = v_goal and name = 'B-rpc-secret';
  if v_leaked <> 0 then fails := fails || 'rpc_seeded_cross_org_template(count=' || v_leaked || '); '; end if;

  if fails <> '' then raise exception 'FAIL 0073-DB-7: %', fails; end if;
  raise notice 'PASS 0073-DB-7: apply_goal_template does not seed cross-org template';
end $$;
rollback;
