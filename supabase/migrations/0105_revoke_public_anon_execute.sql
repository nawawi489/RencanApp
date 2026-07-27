-- 0105_revoke_public_anon_execute.sql — close PUBLIC/anon EXECUTE surface for
-- every function in the `public` schema.
--
-- WHY: Audit 2026-07-26 (production-readiness) — 40 SECURITY DEFINER functions +
-- 4 SECURITY INVOKER helpers were callable by `anon` because `CREATE OR REPLACE`
-- resets ACL to `GRANT EXECUTE TO PUBLIC`, and every prior `REVOKE FROM anon` in
-- 0050/0066/0071/0080 targeted the `anon` role only — leaving the implicit
-- `PUBLIC` grant intact. `anon` inherits from PUBLIC, so it stayed callable.
-- One of the exposed functions (`backfill_resolve_stale_notifications`) had zero
-- authorization and four unfiltered UPDATEs across tenants — a live
-- cross-tenant mass-write vector.
--
-- FIX: REVOKE EXECUTE from BOTH `PUBLIC` and `anon` on every function in the
-- `public` schema. Preserves any existing `GRANT ... TO authenticated`/
-- `service_role` (end-user + backend callers keep working). Trigger functions
-- and RLS helpers don't need any EXECUTE grant at the SQL level — the trigger
-- system invokes them directly.
--
-- This is the DURABLE fix for the mechanism documented in memory
-- `anon-public-rpc-grant-gotcha` — apply this after any future migration that
-- runs `CREATE OR REPLACE FUNCTION` in public schema (which resets ACL).
--
-- Contract: supabase/tests/0105_revoke_public_anon_execute_contract.sql (0105-DB-1..3).
-- Post-apply advisor check: `Public Can Execute SECURITY DEFINER` and
-- `Signed-In Users Can Execute` categories should drop toward 0 (any remaining
-- entries there are the S2-2 backfill function or Postgres built-ins).

do $$
declare
  r record;
  v_stripped integer := 0;
begin
  for r in
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (has_function_privilege('public', p.oid, 'EXECUTE')
        or has_function_privilege('anon',   p.oid, 'EXECUTE'))
  loop
    execute format(
      'revoke execute on function public.%I(%s) from public, anon',
      r.proname, r.args
    );
    v_stripped := v_stripped + 1;
  end loop;

  raise notice '0105: revoked PUBLIC+anon EXECUTE from % public functions', v_stripped;
end $$;

-- Post-condition assertion: 0 functions in public schema remain callable by anon
-- via PUBLIC or direct grant (Postgres built-ins are in other schemas so this
-- check is bounded to public.). If this fails the txn rolls back and the
-- migration is rejected.
do $$
declare
  v_remaining integer;
begin
  select count(*)
    into v_remaining
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (has_function_privilege('public', p.oid, 'EXECUTE')
       or has_function_privilege('anon',   p.oid, 'EXECUTE'));

  if v_remaining > 0 then
    raise exception '0105 post-condition failed: % public function(s) still callable by anon/public', v_remaining;
  end if;
end $$;
