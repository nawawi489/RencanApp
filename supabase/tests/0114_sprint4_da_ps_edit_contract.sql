-- 0114-DB contract — Sprint 4 follow-up (S4-3).
--
-- Melengkapi 0113-DB dgn assertion untuk DA + PS edit:
--
--   0114-DB-1: update_development_area — periode change pasca-active REJECTED.
--   0114-DB-2: update_problem_statement — impact change pasca-active REJECTED.
--
-- Reuse fixture users dari _fixtures.sql (Contract Fixtures Org A).

\set ON_ERROR_STOP on

begin;
set local row_security = off;

create temporary table _c on commit drop as
select
  '4b07a19f-550d-4952-b0d8-44f38f651d89'::uuid as org_a,
  'ca8c1471-b870-4f09-a149-25e5eae99d6f'::uuid as user_a,
  gen_random_uuid() as da_a,
  gen_random_uuid() as ps_a;

grant select on _c to public;

-- DA aktif — periode terkunci.
insert into public.development_areas (id, organization_id, name, created_by, pic_id, status,
                                      period_start, period_end)
select da_a, org_a, 'S4 DA A', user_a, user_a, 'active',
       now()::date, (now() + interval '30 days')::date from _c;

-- PS aktif — impact + periode terkunci.
insert into public.problem_statements (id, organization_id, development_area_id, name, created_by,
                                       pic_id, status, impact, period_start, period_end)
select ps_a, org_a, da_a, 'S4 PS A', user_a, user_a, 'active', 'high',
       now()::date, (now() + interval '30 days')::date from _c;

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
-- 0114-DB-1 update_development_area — period change on active DA REJECTED.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    perform public.update_development_area(
      c.da_a, 'S4 DA renamed', null, c.user_a,
      '2020-01-01'::date, -- period_start beda dari existing
      (now() + interval '30 days')::date
    );
    raise exception '0114-DB-1 FAILED: update_development_area allowed period change on active DA';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%terkunci%' then
      raise exception '0114-DB-1 FAILED: expected "terkunci" error, got: %', v_msg;
    end if;
  end;
  raise notice '0114-DB-1 PASSED: update_development_area rejects period change post-activation';
end $$;

-- --------------------------------------------------------------------------
-- 0114-DB-2 update_problem_statement — impact change on active PS REJECTED.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text; v_start date; v_end date;
begin
  select * into c from _c;
  select period_start, period_end into v_start, v_end from public.problem_statements where id = c.ps_a;
  perform pg_temp.act_as_a();
  begin
    perform public.update_problem_statement(
      c.ps_a, 'S4 PS renamed', null, c.user_a,
      'low', -- was 'high' → different
      null,
      v_start, v_end
    );
    raise exception '0114-DB-2 FAILED: update_problem_statement allowed impact change on active PS';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%terkunci%' then
      raise exception '0114-DB-2 FAILED: expected "terkunci" error, got: %', v_msg;
    end if;
  end;
  raise notice '0114-DB-2 PASSED: update_problem_statement rejects impact change post-activation';
end $$;

-- --------------------------------------------------------------------------
-- 0114-DB-3 update_problem_statement — allowed-field only edit succeeds.
-- --------------------------------------------------------------------------
do $$
declare c record; v_name text; v_start date; v_end date; v_impact text;
begin
  select * into c from _c;
  select period_start, period_end, impact into v_start, v_end, v_impact
    from public.problem_statements where id = c.ps_a;
  perform pg_temp.act_as_a();
  perform public.update_problem_statement(
    c.ps_a, 'S4 PS renamed OK', 'desc baru', c.user_a,
    v_impact, -- unchanged
    'bukti baru',
    v_start, v_end
  );
  select name into v_name from public.problem_statements where id = c.ps_a;
  if v_name <> 'S4 PS renamed OK' then
    raise exception '0114-DB-3 FAILED: expected rename to persist, got name=%', v_name;
  end if;
  raise notice '0114-DB-3 PASSED: update_problem_statement allows name/desc/evidence on active PS';
end $$;

rollback;
