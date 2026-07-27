-- 0113-DB contract — Sprint 4, S4-1 / S4-2 / S4-4 / S4-5.
--
-- Enforces the guards that anchor the new operator capabilities:
--
--   S4-1 / S4-2: update_task / update_action_plan / update_initiative reject
--                deadline / periode / kontribusi changes pasca-aktivasi
--                (dasar skor). If a caller only touches allowed fields, the
--                update must succeed.
--
--   S4-4:       set_user_active refuses self-deactivate (a lone admin
--                nonaktifkan diri = organisasi terkunci).
--
--   S4-5:       update_user_role refuses self-target (anti self-promote —
--                siapa saja dengan `manage_users_permissions` bisa memberi
--                diri role apa pun tanpa gerbang ini).
--
-- Reuses the CEO fixture users from _fixtures.sql; identical topology dengan
-- 0108/0109/0110 supaya diff dua kontrak nyaman dibaca berdampingan.

\set ON_ERROR_STOP on

begin;
set local row_security = off;

create temporary table _c on commit drop as
select
  '4b07a19f-550d-4952-b0d8-44f38f651d89'::uuid as org_a,
  'ca8c1471-b870-4f09-a149-25e5eae99d6f'::uuid as user_a,   -- CEO Fixture Org A
  gen_random_uuid() as goal_a,
  gen_random_uuid() as strat_a,
  gen_random_uuid() as init_a,
  gen_random_uuid() as ap_a,
  gen_random_uuid() as task_active_a,
  gen_random_uuid() as task_draft_a;

grant select on _c to public;

-- Parent chain aktif dulu (goals→strategies→initiatives→action_plans→tasks).
insert into public.goals (id, organization_id, name, created_by, pic_id, status, target_value, period_start, period_end)
select goal_a, org_a, 'S4 Goal A', user_a, user_a, 'active', '10', now(), now() + interval '30 days' from _c;

insert into public.strategies (id, organization_id, goal_id, name, created_by, pic_id, status)
select strat_a, org_a, goal_a, 'S4 Strat A', user_a, user_a, 'active' from _c;

-- Inisiatif AKTIF supaya periode + kontribusi terkunci; contribution_pct wajib pasca-aktif.
insert into public.initiatives (id, organization_id, strategy_id, name, created_by, pic_id, status,
                                contribution_pct, period_start, period_end)
select init_a, org_a, strat_a, 'S4 Init A', user_a, user_a, 'active',
       25, now()::date, (now() + interval '90 days')::date from _c;

insert into public.action_plans (id, organization_id, initiative_id, name, created_by, pic_id, status,
                                 target_result, period_start, period_end)
select ap_a, org_a, init_a, 'S4 AP A', user_a, user_a, 'active',
       'Target A', now()::date, (now() + interval '30 days')::date from _c;

-- Tugas aktif — deadline terkunci (must be rejected).
insert into public.tasks (id, organization_id, action_plan_id, name, created_by, pic_id, reviewer_id,
                          status, repeat_setting, start_date, deadline)
select task_active_a, org_a, ap_a, 'S4 Task active', user_a, user_a, user_a, 'assigned', 'one_time',
       now()::date, (now() + interval '7 days')::date from _c;

-- Tugas draft — full-field edit boleh (must succeed).
insert into public.tasks (id, organization_id, action_plan_id, name, created_by, pic_id, reviewer_id,
                          status, repeat_setting)
select task_draft_a, org_a, ap_a, 'S4 Task draft', user_a, user_a, user_a, 'draft', 'one_time' from _c;

-- Impersonate authenticated (sub=user_a, org=org_a). Sama dengan 0108.
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
-- 0113-DB-1 update_task — deadline change on active task REJECTED.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    perform public.update_task(
      c.task_active_a, 'S4 Task active renamed', null, c.user_a, c.user_a, 'high',
      c.task_active_a::text::date, -- garbage date to force mismatch
      (now() + interval '14 days')::date, null, null, null, null
    );
    raise exception '0113-DB-1 FAILED: update_task allowed deadline change on active task';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%terkunci%' then
      raise exception '0113-DB-1 FAILED: expected "terkunci" error, got: %', v_msg;
    end if;
  end;
  raise notice '0113-DB-1 PASSED: update_task rejects deadline change post-activation';
end $$;

-- --------------------------------------------------------------------------
-- 0113-DB-2 update_task — allowed-field only edit succeeds on active task.
-- --------------------------------------------------------------------------
do $$
declare c record; v_name text;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  perform public.update_task(
    c.task_active_a, 'S4 Task renamed OK', 'desc baru', c.user_a, c.user_a, 'medium',
    (now())::date, (now() + interval '7 days')::date, null,
    'output baru', 'dod baru', 'bukti baru'
  );
  select name into v_name from public.tasks where id = c.task_active_a;
  if v_name <> 'S4 Task renamed OK' then
    raise exception '0113-DB-2 FAILED: expected rename to persist, got name=%', v_name;
  end if;
  raise notice '0113-DB-2 PASSED: update_task allows name/priority/description on active task';
end $$;

-- --------------------------------------------------------------------------
-- 0113-DB-3 update_action_plan — period change on active AP REJECTED.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    perform public.update_action_plan(
      c.ap_a, 'S4 AP renamed', null, c.user_a, 'Target A',
      (now() + interval '60 days')::date, -- new period_start ≠ existing
      (now() + interval '90 days')::date
    );
    raise exception '0113-DB-3 FAILED: update_action_plan allowed period change on active AP';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%terkunci%' then
      raise exception '0113-DB-3 FAILED: expected "terkunci" error, got: %', v_msg;
    end if;
  end;
  raise notice '0113-DB-3 PASSED: update_action_plan rejects period change post-activation';
end $$;

-- --------------------------------------------------------------------------
-- 0113-DB-4 update_initiative — contribution_pct change on active REJECTED.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text; v_start date; v_end date;
begin
  select * into c from _c;
  select period_start, period_end into v_start, v_end from public.initiatives where id = c.init_a;
  perform pg_temp.act_as_a();
  begin
    perform public.update_initiative(
      c.init_a, 'S4 Init renamed', null, c.user_a, null, null, null,
      50, -- was 25 → different
      v_start, v_end
    );
    raise exception '0113-DB-4 FAILED: update_initiative allowed contribution change on active';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%terkunci%' then
      raise exception '0113-DB-4 FAILED: expected "terkunci" error, got: %', v_msg;
    end if;
  end;
  raise notice '0113-DB-4 PASSED: update_initiative rejects contribution_pct change post-activation';
end $$;

-- --------------------------------------------------------------------------
-- 0113-DB-5 set_user_active — self-deactivate REJECTED.
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text;
begin
  select * into c from _c;
  perform pg_temp.act_as_a();
  begin
    perform public.set_user_active(c.user_a, false);
    raise exception '0113-DB-5 FAILED: set_user_active allowed self-deactivate';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%tidak bisa menonaktifkan akun anda sendiri%' then
      raise exception '0113-DB-5 FAILED: expected self-deactivate error, got: %', v_msg;
    end if;
  end;
  raise notice '0113-DB-5 PASSED: set_user_active rejects self-deactivate';
end $$;

-- --------------------------------------------------------------------------
-- 0113-DB-6 update_user_role — self-target REJECTED (anti self-promote).
-- --------------------------------------------------------------------------
do $$
declare c record; v_msg text; v_role_id uuid;
begin
  select * into c from _c;
  -- Ambil sembarang role template Org A (fixture CEO pasti punya minimal satu).
  select id into v_role_id from public.role_templates
   where organization_id = c.org_a limit 1;
  if v_role_id is null then
    raise notice '0113-DB-6 SKIPPED: Org A has no role templates (fixture drift)';
    return;
  end if;

  perform pg_temp.act_as_a();
  begin
    perform public.update_user_role(c.user_a, v_role_id);
    raise exception '0113-DB-6 FAILED: update_user_role allowed self-target';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg not ilike '%tidak bisa mengubah role anda sendiri%' then
      raise exception '0113-DB-6 FAILED: expected self-target error, got: %', v_msg;
    end if;
  end;
  raise notice '0113-DB-6 PASSED: update_user_role rejects self-target';
end $$;

rollback;
