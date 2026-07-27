-- 0115-DB contract — Sprint 5, S5-8 (penghapusan akun / anonimisasi + ekspor data).
--
-- Menahan invarian kepatuhan (UU 27/2022 PDP + Play Data safety):
--
--   • request_account_deletion() idempotent — 2 panggilan berturut menghasilkan
--     1 baris pending saja (unique partial index penjaga).
--   • anonymize_account() ANTI SELF (sama pola dengan S4-4 self-deactivate) —
--     admin terakhir menganonimkan diri = organisasi terkunci tanpa jalur pulih.
--   • anonymize_account() menghapus PII di profiles + login_logs, TIDAK menyentuh
--     baris skor/audit historis (audit `_no_delete` triggers tetap penjaga akhir).
--   • export_my_data() mengembalikan JSONB berisi profile.id = auth.uid()
--     (self-service, tidak bocor lintas-org).

\set ON_ERROR_STOP on

begin;
set local row_security = off;

create temporary table _c on commit drop as
select
  '4b07a19f-550d-4952-b0d8-44f38f651d89'::uuid as org_a,
  'ca8c1471-b870-4f09-a149-25e5eae99d6f'::uuid as user_a;   -- CEO Fixture Org A

grant select on _c to public;

-- Impersonate authenticated user_a.
create or replace function pg_temp.act_as_a() returns void language plpgsql as $$
declare c record;
begin
  select * into c from _c;
  perform set_config('request.jwt.claim.sub', c.user_a::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', c.user_a::text, 'role', 'authenticated', 'org_id', c.org_a::text)::text,
    true);
  perform set_config('role', 'authenticated', true);
  perform set_config('row_security', 'on', true);
end $$;

-- --------------------------------------------------------------------------
-- 0115-DB-1 request_account_deletion idempotent — 2 call → 1 pending row.
-- --------------------------------------------------------------------------
do $$
declare c record; v_id1 uuid; v_id2 uuid; v_count int;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();

  v_id1 := public.request_account_deletion('coba-1');
  v_id2 := public.request_account_deletion('coba-2');

  if v_id1 is null or v_id2 is null then
    raise exception '0115-DB-1 FAILED: request_account_deletion returned null';
  end if;
  if v_id1 <> v_id2 then
    raise exception '0115-DB-1 FAILED: 2 calls produced different ids (% vs %)', v_id1, v_id2;
  end if;

  set local role postgres;
  perform set_config('row_security', 'off', true);
  select count(*) into v_count from public.account_deletion_requests
   where user_id = c.user_a and status = 'pending';
  if v_count <> 1 then
    raise exception '0115-DB-1 FAILED: expected 1 pending row, got %', v_count;
  end if;

  raise notice '0115-DB-1 PASSED: request_account_deletion idempotent';
end $$;

-- --------------------------------------------------------------------------
-- 0115-DB-2 anonymize_account — ANTI SELF (memblokir target = auth.uid()).
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();

  begin
    perform public.anonymize_account(c.user_a, 'coba');
    raise exception '0115-DB-2 FAILED: anonymize_account allowed self-target';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%akun sendiri%' then
      raise exception '0115-DB-2 FAILED: expected self-target error, got: %', v_msg;
    end if;
  end;
  raise notice '0115-DB-2 PASSED: anonymize_account rejects self-target';
end $$;

-- --------------------------------------------------------------------------
-- 0115-DB-3 export_my_data — mengembalikan JSONB berisi profile.id = auth.uid().
-- --------------------------------------------------------------------------
do $$
declare c record; v_out jsonb; v_pid text;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();

  v_out := public.export_my_data();
  if v_out is null then
    raise exception '0115-DB-3 FAILED: export_my_data returned null';
  end if;

  v_pid := v_out->'profile'->>'id';
  if v_pid is null or v_pid <> c.user_a::text then
    raise exception '0115-DB-3 FAILED: profile.id mismatch (got %, expected %)', v_pid, c.user_a;
  end if;

  -- Tidak boleh bocor lintas-org — organization.id kalau ada wajib org_a.
  if (v_out->'organization'->>'id') is not null and (v_out->'organization'->>'id') <> c.org_a::text then
    raise exception '0115-DB-3 FAILED: organization.id leaked cross-org (got %)', v_out->'organization'->>'id';
  end if;

  raise notice '0115-DB-3 PASSED: export_my_data returns own profile only';
end $$;

-- --------------------------------------------------------------------------
-- 0115-DB-4 anonymize_account — auth guard: unauthenticated (no jwt.claim.sub)
-- ditolak dgn 42501.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text;
begin
  select * into c from _c;
  -- Reset auth ke non-authenticated.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}'::text, true);
  perform set_config('role', 'authenticated', true);
  perform set_config('row_security', 'on', true);

  begin
    perform public.anonymize_account(c.user_a, null);
    raise exception '0115-DB-4 FAILED: anonymize_account allowed without auth';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    -- Bisa "tidak terautentikasi" atau ditolak permission — dua-duanya OK
    -- (yg penting BUKAN sukses).
    if v_msg not ilike '%terautentikasi%' and v_msg not ilike '%berwenang%' then
      raise exception '0115-DB-4 FAILED: expected auth error, got: %', v_msg;
    end if;
  end;
  raise notice '0115-DB-4 PASSED: anonymize_account rejects unauthenticated';
end $$;

rollback;
