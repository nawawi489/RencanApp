-- 0091 — guardrail G-2 (HTTP egress) correction.
--
-- 0063 line 414 issues:
--     revoke usage on schema net from public, authenticated, anon;
-- and its comment claims this succeeds on Supabase HOSTED (postgres = superuser)
-- and only no-ops on LOCAL. Both halves are false, verified 2026-07-23:
--
--   * On staging, schema `net` is owned by `supabase_admin`, `postgres` is NOT a
--     superuser and NOT a member of `supabase_admin` (nor is
--     `supabase_privileged_role`, the only elevated role postgres can assume).
--     The REVOKE therefore emits a warning and changes nothing — confirmed by
--     running it inside an explicit transaction and re-reading the ACL before
--     rollback. `anon` and `authenticated` still hold USAGE on `net` and EXECUTE
--     on `net.http_post`.
--   * On the local stack the assertion passes, but not because the REVOKE
--     worked — the local image simply never granted `net` to the client roles.
--
-- So G-2 has never been active on hosted, and no migration can activate it:
-- revoking a grant made by `supabase_admin` requires `supabase_admin`, which is
-- unreachable from `postgres` (this includes the Dashboard SQL editor, which
-- also connects as `postgres`). Closing it requires a Supabase support request —
-- see supabase/tests/WIP_REPAIR_BACKLOG.md for the exact statement to hand them.
--
-- RESIDUAL RISK — deliberately accepted, and bounded:
-- `net` is not a PostgREST-exposed schema (config.toml declares no [api]
-- schemas, so the default `public, graphql_public` applies), so a client cannot
-- call `net.http_post` over the REST API. Reaching it needs a bridge: a function
-- in a schema we DO own that references `net.*`, or dynamic SQL with an unpinned
-- search_path. Those bridges are ours to prevent, and 0091's contract test now
-- gates on their absence. That is the part of G-2 we can actually enforce.
--
-- This migration changes no privileges on hosted by design. It re-attempts the
-- REVOKE (which is the real fix on any deployment where postgres DOES own the
-- schema, e.g. self-hosted), then reports the outcome loudly instead of letting
-- a no-op masquerade as a guardrail. It deliberately does NOT raise on residual
-- grants: that condition is platform-owned and un-actionable from here, and a
-- hard failure would block every future deploy on something no migration can fix.

do $$
declare
  v_owner  text;
  v_can_fix boolean;
  v_leak   text := '';
  v_role   text;
begin
  select pg_get_userbyid(nspowner) into v_owner from pg_namespace where nspname = 'net';
  if v_owner is null then
    raise notice '0091: schema net tidak ada — pg_net belum terpasang, guardrail G-2 tidak relevan.';
    return;
  end if;

  v_can_fix := pg_has_role(current_user, v_owner, 'member');

  -- Idempoten. Efektif hanya kalau current_user memang owner/member owner.
  -- Di hosted ini menghasilkan WARNING "no privileges could be revoked" — itu
  -- ekspektasi yang terdokumentasi, bukan kegagalan.
  begin
    revoke usage on schema net from public, authenticated, anon;
  exception when insufficient_privilege then
    raise notice '0091: REVOKE ditolak (owner=%), lanjut ke pelaporan.', v_owner;
  end;

  foreach v_role in array array['anon', 'authenticated'] loop
    if has_schema_privilege(v_role, 'net', 'usage') then
      v_leak := v_leak || v_role || '; ';
    end if;
  end loop;

  if v_leak = '' then
    raise notice '0091: guardrail G-2 aktif — anon/authenticated tanpa USAGE on schema net (owner=%).', v_owner;
  elsif v_can_fix then
    -- Kita punya hak owner tapi privilege masih menempel → ini bug kita, bukan platform.
    raise exception '0091: G-2 gagal padahal current_user (%) berhak atas owner % — sisa grant: %',
      current_user, v_owner, v_leak;
  else
    raise warning '0091: guardrail G-2 TIDAK aktif (sisa grant: %). schema net owned by %, '
      'dan % bukan member-nya — REVOKE tidak mungkin dari migration. '
      'Eskalasi ke Supabase support diperlukan; residual risk dibatasi oleh kontrak '
      '0091 (zero bridge dari schema milik kita ke net.*). Detail: WIP_REPAIR_BACKLOG.md.',
      v_leak, v_owner, current_user;
  end if;
end $$;
