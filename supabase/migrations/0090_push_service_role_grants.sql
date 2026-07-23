-- 0090 — restore SERVICE_ROLE privileges on the push fan-out path.
--
-- REGRESSION (live since 0063, never worked): the push drainer has been failing
-- 403 on every single invocation — 1440 failures/day, zero successes, since the
-- day 0063 shipped. `public.push_deliveries` has never held a single row.
--
-- ROOT CAUSE — `service_role` is not `postgres`.
-- 0063 assumed the two were the same role:
--     line 11:  "push_deliveries hanya SERVICE_ROLE (bypass RLS) — zero policy, zero grant."
--     line 350: "Hanya SERVICE_ROLE (postgres) yang execute"
-- `service_role` does have BYPASSRLS, so the "zero policy" reasoning holds for
-- RLS — but BYPASSRLS says nothing about table/function GRANTs, which are
-- enforced normally. `service_role`'s only access to these objects came from the
-- default `PUBLIC EXECUTE` on functions; the hardening `revoke ... from public`
-- stripped exactly that, and no `grant ... to service_role` replaced it.
-- Net ACL on staging before this migration: `{postgres=X/postgres}` — only the
-- owner. The Edge Function authenticates as `service_role`, so PostgREST
-- correctly refused it.
--
-- This is NOT the DROP FUNCTION ... CASCADE ACL-reset gotcha (0088/0089 headers):
-- no migration ever dropped these functions. The grant was simply never written.
--
-- SCOPE — least privilege for what supabase/functions/push-fanout/index.ts does:
--   claim()                        -> rpc claim_push_deliveries(int)
--   bumpBackoff()                  -> rpc bump_push_delivery_backoff(uuid, text)
--   markSent/markFailedPermanent() -> update public.push_deliveries where id = ?
--   revokeToken()                  -> update public.push_tokens     where id = ?
-- SELECT accompanies each UPDATE because the `where id = ?` filter reads a column
-- (Postgres requires SELECT on columns referenced in a WHERE clause). No INSERT
-- or DELETE is granted: rows are materialized inside claim_push_deliveries, which
-- is SECURITY DEFINER and therefore runs as the owner, and purging is pg_cron's
-- job (jobid 9, running as postgres).
--
-- The two functions stay revoked from public/anon/authenticated — this migration
-- only adds service_role, it does not re-widen anything.

-- ============================================================ functions
grant execute on function public.claim_push_deliveries(int) to service_role;
grant execute on function public.bump_push_delivery_backoff(uuid, text) to service_role;

comment on function public.claim_push_deliveries(int) is
  'Drainer atomic claim: materialize + FOR UPDATE SKIP LOCKED + 5-min lease. EXECUTE: service_role only (0090 — bukan postgres; service_role adalah role PostgREST untuk secret key).';

comment on function public.bump_push_delivery_backoff(uuid, text) is
  'Exponential backoff drainer: next = now() + 1 min * pow(2, least(attempts, 6)); attempts ke-6 → failed. EXECUTE: service_role only (0090).';

-- ============================================================ tables
-- RLS tetap enabled dengan zero policy untuk push_deliveries; service_role punya
-- BYPASSRLS sehingga grant tabel ini cukup — tidak ada policy baru yang dibuat,
-- dan authenticated/anon tidak mendapat privilege tambahan apa pun.
grant select, update on public.push_deliveries to service_role;
grant select, update on public.push_tokens     to service_role;

-- ============================================================ guard
-- Fail loud kalau salah satu grant di atas tidak mendarat (mis. objek hilang /
-- signature bergeser), supaya migrasi tidak "sukses" dengan drainer tetap mati.
do $$
begin
  if not has_function_privilege('service_role', 'public.claim_push_deliveries(int)', 'execute') then
    raise exception '0090: service_role masih tidak punya EXECUTE pada claim_push_deliveries(int)';
  end if;
  if not has_function_privilege('service_role', 'public.bump_push_delivery_backoff(uuid, text)', 'execute') then
    raise exception '0090: service_role masih tidak punya EXECUTE pada bump_push_delivery_backoff(uuid, text)';
  end if;
  if not has_table_privilege('service_role', 'public.push_deliveries', 'update')
     or not has_table_privilege('service_role', 'public.push_deliveries', 'select') then
    raise exception '0090: service_role masih tidak punya SELECT+UPDATE pada push_deliveries';
  end if;
  if not has_table_privilege('service_role', 'public.push_tokens', 'update')
     or not has_table_privilege('service_role', 'public.push_tokens', 'select') then
    raise exception '0090: service_role masih tidak punya SELECT+UPDATE pada push_tokens';
  end if;
end $$;
