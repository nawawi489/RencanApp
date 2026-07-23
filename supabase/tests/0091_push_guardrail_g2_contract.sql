-- 0091 contract — guardrail G-2 (HTTP egress) reachability.
--
-- G-2's original form ("revoke usage on schema net from client roles") cannot be
-- enforced from a migration on Supabase hosted: schema `net` is owned by
-- `supabase_admin`, unreachable from `postgres`. See 0091's migration header.
--
-- This contract enforces the half we DO own: even though `anon`/`authenticated`
-- hold USAGE on `net` (and EXECUTE on `net.http_post`) on hosted, they cannot
-- reach it — `net` is not PostgREST-exposed, so the only route is a *bridge*
-- inside a schema we control. Blocks (a) and (b) gate the absence of such a
-- bridge, and they are hard failures because they are our code.
--
-- Block (c) reports the schema-level grant. It is written so it can never pass
-- vacuously the way the old z2 did: it fails when the privilege leaks AND we
-- hold owner rights (i.e. our bug), and reports a documented known-gap when the
-- privilege leaks and the owner is out of reach (i.e. platform's). It never
-- silently reports success on a leak.
--
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0091_push_guardrail_g2_contract.sql

-- ============================================================ (a) zero bridge — no owned function references net.*
-- Satu-satunya pemakaian net.http_post yang sah adalah command cron job
-- push-fanout-drainer, yang jalan sebagai postgres di luar konteks user (diuji
-- di blok b). Fungsi apa pun di schema milik kita yang menyentuh net.* membuka
-- jalur eskalasi: klien memanggil fungsi itu lewat PostgREST, fungsi itu yang
-- melakukan HTTP egress. Fail keras — ini kode kita sendiri.
do $$
declare
  v_bridge text := '';
  v_fn record;
begin
  for v_fn in
    select n.nspname, p.proname, p.prosecdef,
           coalesce(array_to_string(p.proconfig, ','), '<none>') as cfg
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private', 'internal')
      and p.prosrc ~* '(^|[^a-z_])net\.(http_post|http_get|http_delete|http_collect_response|wake)'
  loop
    v_bridge := v_bridge
      || v_fn.nspname || '.' || v_fn.proname
      || ' (secdef=' || v_fn.prosecdef || ', search_path=' || v_fn.cfg || '); ';
  end loop;

  if v_bridge <> '' then
    raise exception 'FAIL 0091a: ada fungsi di schema milik kita yang memanggil net.* — '
      'ini bridge HTTP egress yang bisa dipanggil klien lewat PostgREST: % '
      'Guardrail G-2 tidak aktif di hosted (anon/authenticated punya EXECUTE pada net.http_post), '
      'jadi tidak ada jaring pengaman kedua. Pindahkan egress ke cron/Edge Function.', v_bridge;
  end if;
  raise notice 'PASS 0091a: zero fungsi public/private/internal yang menyentuh net.*';
end $$;

-- ============================================================ (b) egress hanya lewat cron job milik postgres
-- net.http_post boleh muncul di command cron, karena cron.job.command dieksekusi
-- sebagai job owner (postgres) dan tidak pernah punya konteks auth.uid() klien.
-- Yang diassert: setiap job yang melakukan egress adalah job push yang kita kenal
-- dan dimiliki postgres — bukan job asing yang diselipkan.
do $$
declare
  v_bad text := '';
  v_job record;
  v_count int := 0;
begin
  for v_job in
    select j.jobname, r.rolname as owner
    from cron.job j
    left join pg_roles r on r.oid = j.username::regrole
    where j.command ~* '(^|[^a-z_])net\.(http_post|http_get|http_delete)'
  loop
    v_count := v_count + 1;
    if v_job.jobname <> 'push-fanout-drainer' or v_job.owner <> 'postgres' then
      v_bad := v_bad || coalesce(v_job.jobname, '<null>') || '@' || coalesce(v_job.owner, '<null>') || '; ';
    end if;
  end loop;

  if v_bad <> '' then
    raise exception 'FAIL 0091b: cron job tak dikenal melakukan HTTP egress: %', v_bad;
  end if;
  if v_count = 0 then
    raise exception 'FAIL 0091b: tidak ada cron job yang melakukan egress — drainer push-fanout hilang '
      '(bandingkan blok z4 di 0063_push_infrastructure_contract.sql)';
  end if;
  raise notice 'PASS 0091b: egress net.* hanya dari cron push-fanout-drainer milik postgres';
end $$;

-- ============================================================ (c) status G-2, non-vacuous
-- Tidak boleh lulus diam-diam saat privilege bocor (kesalahan z2 lama). Tiga
-- keluaran berbeda: aktif / bug kita (fail) / known gap platform (notice).
do $$
declare
  v_owner text;
  v_can_fix boolean;
  v_leak text := '';
  v_role text;
begin
  select pg_get_userbyid(nspowner) into v_owner from pg_namespace where nspname = 'net';
  if v_owner is null then
    raise exception 'FAIL 0091c: schema net tidak ada — pg_net wajib terpasang untuk drainer push';
  end if;
  v_can_fix := pg_has_role(current_user, v_owner, 'member');

  foreach v_role in array array['anon', 'authenticated'] loop
    if has_schema_privilege(v_role, 'net', 'usage') then
      v_leak := v_leak || v_role || '=usage; ';
    end if;
  end loop;

  if v_leak = '' then
    raise notice 'PASS 0091c: guardrail G-2 aktif — anon/authenticated tanpa USAGE on schema net (owner=%)', v_owner;
  elsif v_can_fix then
    raise exception 'FAIL 0091c: G-2 bocor (%) padahal current_user % berhak atas owner % — '
      'REVOKE seharusnya berhasil di environment ini, jadi ini regresi kita.', v_leak, current_user, v_owner;
  else
    raise notice 'KNOWN GAP 0091c: G-2 tidak aktif (%) — schema net owned by %, di luar jangkauan %. '
      'Mitigasi aktif: blok (a) + (b) menutup satu-satunya jalur yang bisa dicapai klien. '
      'Eskalasi platform dilacak di WIP_REPAIR_BACKLOG.md.', v_leak, v_owner, current_user;
  end if;
end $$;
