-- 0080_revoke_anon_public_submit_review_rpcs_contract.sql
-- Contract: ACL fail-fast untuk 4 RPC submit/review yang di-port dari `main` #102.
-- Mengunci invariant yang selama ini hanya hidup di DB staging tanpa file migrasi:
-- anon/PUBLIC tidak boleh EXECUTE, `authenticated` wajib tetap bisa.
-- Runner: docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--   -f supabase/tests/0080_revoke_anon_public_submit_review_rpcs_contract.sql -v ON_ERROR_STOP=1

-- ============================================================ S1 — anon/PUBLIC no execute
begin;
do $$
declare
  v_fn text;
  v_fns text[] := array[
    'public.review_task_submission(uuid,text,text)',
    'public.review_task_instance_submission(uuid,text,text)',
    'public.submit_task(uuid,text,jsonb,jsonb)',
    'public.submit_task_instance(uuid,text,jsonb,jsonb)'
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
      fails := fails || v_fn || ' undefined_function; ';
    end;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0080-acl-S1: %', fails;
  end if;
  raise notice 'PASS 0080-acl-S1 no anon/PUBLIC EXECUTE leak';
end $$;
rollback;

-- ============================================================ S2 — authenticated tetap punya EXECUTE
-- Keempatnya RPC user-facing yang sah; revoke tanpa grant akan mematikan aplikasi.
begin;
do $$
declare
  v_fn text;
  v_fns text[] := array[
    'public.review_task_submission(uuid,text,text)',
    'public.review_task_instance_submission(uuid,text,text)',
    'public.submit_task(uuid,text,jsonb,jsonb)',
    'public.submit_task_instance(uuid,text,jsonb,jsonb)'
  ];
  fails text := '';
begin
  foreach v_fn in array v_fns loop
    begin
      if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
        fails := fails || v_fn || ' authenticated missing EXECUTE; ';
      end if;
    exception when undefined_function then
      fails := fails || v_fn || ' undefined_function; ';
    end;
  end loop;

  if fails <> '' then
    raise exception 'FAIL 0080-acl-S2: %', fails;
  end if;
  raise notice 'PASS 0080-acl-S2 authenticated retains EXECUTE';
end $$;
rollback;
