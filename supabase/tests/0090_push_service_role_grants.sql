-- 0090 contract — SERVICE_ROLE privileges on the push fan-out path.
--
-- Menutup blind spot yang membuat drainer mati diam-diam sejak 0063: satu-satunya
-- kontrak push yang menyentuh claim_push_deliveries adalah
-- 0063_push_infrastructure_contract.wip.sql, dan file *.wip.sql di-SKIP oleh
-- scripts/ci/run-db-contract-tests.sh. Bahkan seandainya ia berjalan, ia hanya
-- mengassert signature + SECURITY DEFINER dan memanggil RPC sebagai superuser
-- test — jadi ACL yang salah lolos begitu saja. Kontrak ini mengassert ACL-nya
-- secara eksplisit, dan sengaja TIDAK ber-suffix .wip supaya ikut gate CI.
--
-- Jalankan:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f supabase/tests/0090_push_service_role_grants.sql
--
-- Invarian:
--   (a) service_role BISA execute kedua RPC drainer.
--   (b) service_role punya SELECT+UPDATE pada push_deliveries & push_tokens.
--   (c) anon/authenticated TETAP tidak bisa execute RPC drainer (no re-widening).
--   (d) service_role TIDAK diberi INSERT/DELETE (least privilege dipertahankan).
--   (e) Tidak ada tabel push_* yang bisa ditulis anon/public.

-- ============================================================ (a) service_role EXECUTE pada RPC drainer
do $$
declare
  v_missing text := '';
  v_fn text;
begin
  foreach v_fn in array array[
    'public.claim_push_deliveries(int)',
    'public.bump_push_delivery_backoff(uuid, text)'
  ] loop
    if not has_function_privilege('service_role', v_fn, 'execute') then
      v_missing := v_missing || v_fn || '; ';
    end if;
  end loop;

  if v_missing <> '' then
    raise exception 'FAIL 0090a: service_role tidak punya EXECUTE pada RPC drainer: % '
      '(gejala live: POST /rest/v1/rpc/claim_push_deliveries → 403 tiap menit, push_deliveries kosong permanen). '
      'Ingat: service_role BUKAN postgres — BYPASSRLS tidak memberi GRANT.', v_missing;
  end if;
  raise notice 'PASS 0090a: service_role punya EXECUTE pada claim_push_deliveries + bump_push_delivery_backoff';
end $$;

-- ============================================================ (b) service_role SELECT+UPDATE pada tabel transport
-- markSent/markFailedPermanent/revokeToken di push-fanout melakukan
-- `update ... where id = ?` langsung via PostgREST. UPDATE saja tidak cukup:
-- filter di WHERE membaca kolom, jadi SELECT juga wajib.
do $$
declare
  v_missing text := '';
  v_tbl text;
  v_priv text;
begin
  foreach v_tbl in array array['public.push_deliveries', 'public.push_tokens'] loop
    foreach v_priv in array array['select', 'update'] loop
      if not has_table_privilege('service_role', v_tbl, v_priv) then
        v_missing := v_missing || v_tbl || '.' || v_priv || '; ';
      end if;
    end loop;
  end loop;

  if v_missing <> '' then
    raise exception 'FAIL 0090b: service_role kurang privilege tabel transport push: %', v_missing;
  end if;
  raise notice 'PASS 0090b: service_role punya SELECT+UPDATE pada push_deliveries + push_tokens';
end $$;

-- ============================================================ (c) anon/authenticated TETAP terkunci dari RPC drainer
do $$
declare
  v_leak text := '';
  v_role text;
  v_fn text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_fn in array array[
      'public.claim_push_deliveries(int)',
      'public.bump_push_delivery_backoff(uuid, text)'
    ] loop
      if has_function_privilege(v_role, v_fn, 'execute') then
        v_leak := v_leak || v_role || '→' || v_fn || '; ';
      end if;
    end loop;
  end loop;

  if v_leak <> '' then
    raise exception 'FAIL 0090c: RPC drainer bocor ke role user-facing: % '
      '(klien bisa mengklaim/menunda delivery push milik org lain).', v_leak;
  end if;
  raise notice 'PASS 0090c: anon + authenticated tidak bisa execute RPC drainer';
end $$;

-- ============================================================ (d) least privilege — service_role tanpa INSERT/DELETE
-- Materialisasi baris terjadi di dalam claim_push_deliveries (SECURITY DEFINER,
-- jalan sebagai owner) dan purge dilakukan pg_cron sebagai postgres. Drainer
-- tidak pernah butuh INSERT/DELETE; kalau muncul, berarti seseorang menyalin
-- `grant all` dan memperluas blast radius secret key.
do $$
declare
  v_excess text := '';
  v_priv text;
begin
  foreach v_priv in array array['insert', 'delete'] loop
    if has_table_privilege('service_role', 'public.push_deliveries', v_priv) then
      v_excess := v_excess || 'push_deliveries.' || v_priv || '; ';
    end if;
    if has_table_privilege('service_role', 'public.push_tokens', v_priv) then
      v_excess := v_excess || 'push_tokens.' || v_priv || '; ';
    end if;
  end loop;

  if v_excess <> '' then
    raise exception 'FAIL 0090d: service_role diberi privilege melebihi kebutuhan drainer: %', v_excess;
  end if;
  raise notice 'PASS 0090d: service_role tidak punya INSERT/DELETE pada tabel push';
end $$;

-- ============================================================ (e) anon/public tidak bisa menulis tabel push
do $$
declare
  v_leak text := '';
  v_role text;
  v_tbl text;
  v_priv text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_tbl in array array['public.push_deliveries', 'public.push_tokens'] loop
      foreach v_priv in array array['insert', 'update', 'delete'] loop
        if has_table_privilege(v_role, v_tbl, v_priv) then
          v_leak := v_leak || v_role || '→' || v_tbl || '.' || v_priv || '; ';
        end if;
      end loop;
    end loop;
  end loop;

  if v_leak <> '' then
    raise exception 'FAIL 0090e: role user-facing punya write access ke tabel push: % '
      '(registrasi token wajib lewat register_push_token/unregister_push_token).', v_leak;
  end if;
  raise notice 'PASS 0090e: anon + authenticated read-only pada push_tokens, zero access pada push_deliveries';
end $$;
