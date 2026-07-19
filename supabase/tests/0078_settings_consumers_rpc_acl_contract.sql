-- 0078_settings_consumers_rpc_acl_contract.sql
-- Contract: ACL fail-fast untuk 9 fungsi (6 activate_* + enforce + 2 upsert).
-- Covers AC-12.
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--   -f supabase/tests/0078_settings_consumers_rpc_acl_contract.sql -v ON_ERROR_STOP=1

-- ============================================================ S1 — anon/PUBLIC no execute
begin;
do $$
declare
  v_fn text;
  v_fns text[] := array[
    'public.enforce_card_completion_rule(text,text[],jsonb)',
    'public.upsert_card_completion_rule(text,text[],text)',
    'public.upsert_card_guidance(text,text,text,text)',
    'public.activate_goal(uuid)',
    'public.activate_strategy(uuid)',
    'public.activate_initiative(uuid)',
    'public.activate_action_plan(uuid)',
    'public.activate_development_area(uuid)',
    'public.activate_problem_statement(uuid)'
  ];
  fails text := '';
begin
  foreach v_fn in array v_fns loop
    begin
      if has_function_privilege('anon', v_fn, 'EXECUTE') then
        fails := fails || v_fn || ' anon EXECUTE leak; ';
      end if;
      if has_function_privilege('public', v_fn, 'EXECUTE') then
        fails := fails || v_fn || ' PUBLIC EXECUTE leak; ';
      end if;
    exception when undefined_function then
      fails := fails || v_fn || ' undefined_function (RPC missing pre-0078); ';
    end;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0078-acl-S1: %', fails;
  end if;
  raise notice 'PASS 0078-acl-S1 no anon/PUBLIC EXECUTE leak';
end $$;
rollback;

-- ============================================================ S2 — authenticated grants correct
begin;
do $$
declare
  v_fn text;
  -- 8 fungsi expected authenticated=true (bukan helper enforce_*)
  v_fns_pub text[] := array[
    'public.upsert_card_completion_rule(text,text[],text)',
    'public.upsert_card_guidance(text,text,text,text)',
    'public.activate_goal(uuid)',
    'public.activate_strategy(uuid)',
    'public.activate_initiative(uuid)',
    'public.activate_action_plan(uuid)',
    'public.activate_development_area(uuid)',
    'public.activate_problem_statement(uuid)'
  ];
  fails text := '';
begin
  foreach v_fn in array v_fns_pub loop
    begin
      if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        fails := fails || v_fn || ' authenticated missing EXECUTE; ';
      end if;
    exception when undefined_function then
      fails := fails || v_fn || ' undefined_function (RPC missing pre-0078); ';
    end;
  end loop;

  begin
    if has_function_privilege('authenticated', 'public.enforce_card_completion_rule(text,text[],jsonb)', 'EXECUTE') then
      fails := fails || 'enforce_card_completion_rule authenticated has EXECUTE (should be definer-only); ';
    end if;
  exception when undefined_function then
    fails := fails || 'enforce_card_completion_rule undefined_function; ';
  end;

  if fails <> '' then
    raise exception 'FAIL 0078-acl-S2: %', fails;
  end if;
  raise notice 'PASS 0078-acl-S2 authenticated grants correct + helper definer-only';
end $$;
rollback;
