-- =============================================================================
-- benchmark-workspace-card-progress-0118.sql
-- =============================================================================
-- One-time performance validation for migration 0118 (recursive rollup for
-- Action Plan & Initiative, "Opsi B" — see wiki/concepts/workspace-card-progress.md).
-- Kept as a reference artifact + template for future workspace_card_progress
-- perf work, NOT a recurring CI gate — timing is inherently environment-
-- dependent, so this is a manual/diagnostic tool for a human to run and read.
--
-- WHAT IT DOES
--   Seeds a dedicated, disposable benchmark organization (~210 initiatives,
--   ~1.6K action plans, ~12K tasks, ~2.4K repeat tasks x 20 instances = ~48K
--   task_instances), times the 0118 (current) and 0102 (pre-recursive-rollup)
--   function bodies back-to-back on IDENTICAL data at realistic + stress batch
--   sizes, then ALWAYS restores 0118 as the live body — even on error, since
--   step 8 embeds the exact 0118 definition rather than relying on an external
--   restore step — and verifies the restore against a hardcoded content hash
--   before tearing the seed down.
--
-- FINDING (2026-07-30, see wiki/concepts/workspace-card-progress.md "Opsi B"):
--   0118 and 0102 perform statistically identically at every batch size tested,
--   PROVIDED `ANALYZE` runs before timing. Without it, a same-session timing
--   run immediately after this script's bulk seed (~62K rows) sees the planner
--   working off stale/absent statistics, and reports what looks like a 7-20x
--   regression that isn't real — same query, same buffer counts, once stats
--   are fresh. This gotcha is why step 2b (ANALYZE) exists; do not remove it
--   when adapting this script.
--
-- BATCH SIZE RATIONALE
--   Grounded in how mobile/src/hooks/use-workspace.ts actually calls
--   useCardProgress: Initiative/AP batches are always "children of one
--   expanded parent" (small — single/low-double-digit), never an org-wide flat
--   list (only Goal/Development-Area panes fetch flat, and those levels are
--   untouched by 0118). The "_all" batches below are deliberate STRESS cases
--   to check scaling headroom, not realistic UI traffic.
--
-- SAFETY
--   Local dev only. This function-swaps the LIVE workspace_card_progress body
--   mid-run and bulk-seeds ~62K rows — never point this at staging/production.
--   Requires an explicit `-v confirm_local=yes` to run (see below) as a guard
--   against an accidental remote invocation.
--
-- RUN (local, against the docker dev DB):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -v confirm_local=yes \
--     -f scripts/ops/benchmark-workspace-card-progress-0118.sql
-- =============================================================================

\timing off
\set ON_ERROR_STOP on

\if :{?confirm_local}
\else
  \echo 'REFUSING TO RUN: this seeds ~62K rows and temporarily swaps the LIVE'
  \echo 'workspace_card_progress function body. Local dev only — never staging/'
  \echo 'production. Pass -v confirm_local=yes to confirm this is your local'
  \echo 'docker dev stack (docker exec supabase_db_supabase psql ...).'
  \q
\endif

-- ---------------------------------------------------------------- 0. constants
\set v_org 'b0000000-0000-4000-8000-000000000001'
\set v_ceo 'b0000000-0000-4000-8000-000000000002'
\set v_role 'b0000000-0000-4000-8000-000000000003'

-- ---------------------------------------------------------------- 1. actors
insert into public.organizations (id, name, created_at, timezone)
  values (:'v_org', 'BENCH 0118 org', now(), 'Asia/Jakarta')
  on conflict (id) do nothing;
insert into public.role_templates (id, organization_id, name, level, is_system)
  values (:'v_role', :'v_org', 'CEO', 'ceo', true)
  on conflict (id) do nothing;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values (:'v_ceo', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'bench0118@fixtures.local', crypt('bench', gen_salt('bf')), now(),
    jsonb_build_object('provider','email','providers',array['email'],'role_level','ceo','organization_id',:'v_org'),
    '{"full_name":"Bench CEO"}'::jsonb, now(), now(), '', '', '', '')
  on conflict (id) do nothing;
insert into public.profiles (id, organization_id, role_template_id, full_name, email, is_active)
  values (:'v_ceo', :'v_org', :'v_role', 'Bench CEO', 'bench0118@fixtures.local', true)
  on conflict (id) do update set organization_id = excluded.organization_id, is_active = true;

insert into public.goals (id, organization_id, name, status, pic_id, created_by)
  values ('b0000000-0000-4000-8000-000000000004', :'v_org', 'BENCH goal', 'active', :'v_ceo', :'v_ceo')
  on conflict (id) do nothing;
insert into public.strategies (id, organization_id, goal_id, name, status, pic_id, created_by)
  values ('b0000000-0000-4000-8000-000000000005', :'v_org', 'b0000000-0000-4000-8000-000000000004',
          'BENCH strat', 'active', :'v_ceo', :'v_ceo')
  on conflict (id) do nothing;
\set v_strat 'b0000000-0000-4000-8000-000000000005'

-- ---------------------------------------------------------------- 2. seed (set-based)
\echo '=== seeding tier1 (200 initiatives, 3-8 AP each), tier2 (10 large initiatives, 45-50 AP each) ==='

create temp table bench_init (id uuid, seq int, ap_count int, tier text) on commit preserve rows;
insert into bench_init
  select gen_random_uuid(), i, 3 + (i % 6), 'tier1' from generate_series(1, 200) i
  union all
  select gen_random_uuid(), 1000 + i, 45 + (i % 6), 'tier2' from generate_series(1, 10) i;

insert into public.initiatives (id, organization_id, strategy_id, name, status, pic_id, created_by)
  select id, :'v_org', :'v_strat', 'BENCH init ' || seq, 'draft', :'v_ceo', :'v_ceo'
  from bench_init;

create temp table bench_ap (id uuid, init_id uuid, init_seq int, tier text, ap_seq int, task_count int)
  on commit preserve rows;
insert into bench_ap
  select gen_random_uuid(), bi.id, bi.seq, bi.tier, s, 3 + (s % 13)
  from bench_init bi, generate_series(1, bi.ap_count) s;

insert into public.action_plans (id, organization_id, name, status, initiative_id, pic_id, created_by)
  select id, :'v_org', 'BENCH ap ' || init_seq || '.' || ap_seq, 'draft', init_id, :'v_ceo', :'v_ceo'
  from bench_ap;

\echo '=== seeding tier3: one mega AP with 500 tasks ==='
create temp table bench_ap3 (id uuid) on commit preserve rows;
insert into bench_ap3 values ('c0000000-0000-4000-8000-000000000001');
insert into public.action_plans (id, organization_id, name, status, initiative_id, pic_id, created_by)
  select id, :'v_org', 'BENCH ap3 mega', 'draft',
         (select id from bench_init where tier = 'tier1' limit 1), :'v_ceo', :'v_ceo'
  from bench_ap3;

\echo '=== seeding tasks (tier1+tier2 per-AP 3-15, tier3 mega AP fixed 500) ==='
create temp table bench_task (id uuid, ap_id uuid, t_seq int, repeat_setting text, status text)
  on commit preserve rows;
insert into bench_task
  select gen_random_uuid(), ba.id, s,
         case when s % 4 = 0 then 'repeat' else 'one_time' end,
         (array['draft','assigned','in_progress','revision','submitted','done'])[1 + (s % 6)]
  from bench_ap ba, generate_series(1, ba.task_count) s
  union all
  select gen_random_uuid(), ba3.id, s,
         case when s % 4 = 0 then 'repeat' else 'one_time' end,
         (array['draft','assigned','in_progress','revision','submitted','done'])[1 + (s % 6)]
  from bench_ap3 ba3, generate_series(1, 500) s;

insert into public.tasks (id, organization_id, action_plan_id, name, repeat_setting,
    evidence_required, result_value_required, review_required, status, pic_id, created_by)
  select id, :'v_org', ap_id, 'BENCH task ' || t_seq, repeat_setting,
         false, false, false, status, :'v_ceo', :'v_ceo'
  from bench_task;

\echo '=== seeding repeat_rules + instances (20 instances/repeat task, ~1/3 assigned rest done) ==='
create temp table bench_rule (id uuid, task_id uuid) on commit preserve rows;
insert into bench_rule
  select gen_random_uuid(), id from bench_task where repeat_setting = 'repeat';

insert into public.task_repeat_rules (id, organization_id, task_id, frequency,
    repeat_start_date, repeat_end_date, time_of_day, missed_rule, created_by)
  select id, :'v_org', task_id, 'daily', '2025-01-01', '2026-12-31', '09:00', 'strict', :'v_ceo'
  from bench_rule;

insert into public.task_instances (id, organization_id, task_id, repeat_rule_id, instance_date,
    instance_time, deadline_at, status, submitted_late, pic_id)
  select gen_random_uuid(), :'v_org', br.task_id, br.id,
         ('2026-01-01'::date + (g || ' days')::interval)::date,
         '09:00'::time,
         (('2026-01-01'::date + (g || ' days')::interval)::date || ' 09:00')::timestamptz,
         case when g % 3 = 0 then 'assigned' else 'done' end,
         false, :'v_ceo'
  from bench_rule br, generate_series(1, 20) g;

-- ---------------------------------------------------------------- 2b. ANALYZE
-- Critical: without this, timing runs against stale/absent planner statistics
-- immediately after a ~62K-row bulk seed (and possibly races background
-- autovacuum) — an unfair, high-variance comparison that can look like a
-- 7-20x regression which isn't real. Force fresh stats before ANY timing.
\echo '=== ANALYZE affected tables ==='
analyze public.initiatives, public.action_plans, public.tasks,
        public.task_repeat_rules, public.task_instances;

-- ---------------------------------------------------------------- 3. summary counts
\echo '=== seeded volume ==='
select
  (select count(*) from bench_init) as initiatives,
  (select count(*) from bench_ap) + (select count(*) from bench_ap3) as action_plans,
  (select count(*) from bench_task) as tasks,
  (select count(*) from bench_rule) as repeat_tasks,
  (select count(*) from public.task_instances where organization_id = :'v_org') as instances;

-- ---------------------------------------------------------------- 4. batch ids
create temp table bench_batch (label text, ids uuid[]) on commit preserve rows;
insert into bench_batch values
  ('single_initiative_typical', (select array[id] from bench_init where tier = 'tier1' limit 1)),
  ('single_initiative_large',   (select array[id] from bench_init where tier = 'tier2' limit 1)),
  ('initiatives_batch_30',      (select array_agg(id) from (select id from bench_init where tier = 'tier1' limit 30) x)),
  ('initiatives_batch_all_210', (select array_agg(id) from bench_init)),
  ('single_ap_typical',         (select array[id] from bench_ap where tier = 'tier1' limit 1)),
  ('single_ap_mega_500tasks',   (select array[id] from bench_ap3)),
  ('aps_batch_50',              (select array_agg(id) from (select id from bench_ap where tier = 'tier1' limit 50) x)),
  ('aps_batch_all',             (select array_agg(id) from bench_ap));

-- session temp objects are NOT auto-visible to a role switched in via SET LOCAL
-- ROLE (verified empirically: "permission denied for table" without this) —
-- grant explicitly so the authenticated-role timing calls below can read it.
grant select on bench_batch to authenticated;

-- ---------------------------------------------------------------- 5. timing harness
create or replace function pg_temp.bench_time(p_ids uuid[], p_iters int)
  returns numeric language plpgsql as $$
declare
  t0 timestamptz; t1 timestamptz;
  ms numeric[] := '{}';
  discard bigint;
begin
  for i in 1..p_iters loop
    t0 := clock_timestamp();
    select count(*) into discard from public.workspace_card_progress(p_ids);
    t1 := clock_timestamp();
    ms := ms || round((extract(epoch from (t1 - t0)) * 1000)::numeric, 3);
  end loop;
  -- median of p_iters samples (drops first as warm-up if p_iters > 1)
  return (
    select percentile_cont(0.5) within group (order by v)
    from unnest(case when p_iters > 1 then ms[2:p_iters] else ms end) v
  );
end $$;

-- run one label as CEO under authenticated role + RLS
create or replace function pg_temp.bench_run(p_label text, p_iters int default 7)
  returns table(label text, batch_size int, median_ms numeric) language plpgsql as $$
declare
  v_ids uuid[];
  v_ms numeric;
begin
  select ids into v_ids from bench_batch where bench_batch.label = p_label;
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'b0000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select pg_temp.bench_time(v_ids, p_iters) into v_ms;
  execute 'reset role';
  return query select p_label, array_length(v_ids, 1), v_ms;
end $$;
grant execute on function pg_temp.bench_time(uuid[], int) to authenticated;
grant execute on function pg_temp.bench_run(text, int) to authenticated;

-- ---------------------------------------------------------------- 6. capture live function body (expected: 0118)
\echo '=== confirming live function is 0118 before benchmarking ==='
select md5(pg_get_functiondef('public.workspace_card_progress(uuid[])'::regprocedure)) as live_hash \gset
\echo 'live function hash:' :live_hash '(expected c68ceb1a72eaa64fc51b8584995f5bfc if unchanged since 0118)'

-- ---------------------------------------------------------------- 7. TIME 0118 (current live body)
\echo ''
\echo '########## RUN A: 0118 (recursive rollup, current) ##########'
begin;
select * from pg_temp.bench_run('single_initiative_typical');
select * from pg_temp.bench_run('single_initiative_large');
select * from pg_temp.bench_run('initiatives_batch_30');
select * from pg_temp.bench_run('initiatives_batch_all_210');
select * from pg_temp.bench_run('single_ap_typical');
select * from pg_temp.bench_run('single_ap_mega_500tasks');
select * from pg_temp.bench_run('aps_batch_50');
select * from pg_temp.bench_run('aps_batch_all');
rollback;

\echo ''
\echo '########## EXPLAIN (ANALYZE, BUFFERS) — 0118, aps_batch_all (worst realistic-adjacent case) ##########'
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers, format text)
select * from public.workspace_card_progress((select ids from bench_batch where label = 'aps_batch_all'));
reset role;
rollback;

-- ---------------------------------------------------------------- 8. swap in 0102 baseline body (temporary)
\echo ''
\echo '=== swapping in 0102 baseline body (temporary, for comparison only) ==='
CREATE OR REPLACE FUNCTION public.workspace_card_progress(p_card_ids uuid[])
  RETURNS TABLE(card_id uuid, progress integer, is_measured boolean)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO ''
AS $function$
  with ids as (select unnest(p_card_ids) as id),
  child_status as (
    select k.goal_id as pid, k.status as cstatus
      from public.strategies k join ids on ids.id = k.goal_id where k.status <> 'archived'
    union all
    select s.strategy_id, s.status
      from public.initiatives s join ids on ids.id = s.strategy_id where s.status <> 'archived'
    union all
    select i.initiative_id, i.status
      from public.action_plans i join ids on ids.id = i.initiative_id where i.status <> 'archived'
    union all
    select a.action_plan_id, a.status
      from public.tasks a join ids on ids.id = a.action_plan_id where a.status <> 'archived'
    union all
    select p.development_area_id, p.status
      from public.problem_statements p join ids on ids.id = p.development_area_id where p.status <> 'archived'
    union all
    select i.problem_statement_id, i.status
      from public.action_plans i join ids on ids.id = i.problem_statement_id where i.status <> 'archived'
  ),
  status_rollup as (
    select ids.id as pid,
           coalesce(round(100.0 * count(*) filter (where cs.cstatus = 'done') / nullif(count(cs.cstatus), 0)), 0)::int as progress
      from ids left join child_status cs on cs.pid = ids.id group by ids.id
  ),
  relevant_strategies as (
    select st.id from public.strategies st where st.id = any(p_card_ids) or st.goal_id = any(p_card_ids)
  ),
  scv as (
    select rv.strategy_id,
           coalesce(sum(case when rv.value_type = any(array['number','currency','percentage']) then rv.value_numeric else 0::numeric end), 0::numeric) as numeric_total
      from public.task_result_values rv join public.task_submissions s on s.id = rv.submission_id
     where s.review_status = 'approved' and rv.strategy_id is not null
       and rv.strategy_id in (select id from relevant_strategies)
     group by rv.strategy_id
  ),
  goal_attainment as (
    select st.goal_id as pid,
           round(avg(least(100, greatest(0, round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric)))))::int as progress
      from public.strategies st join ids on ids.id = st.goal_id left join scv on scv.strategy_id = st.id
     where st.status in ('active', 'done') and st.target_numeric is not null and st.target_numeric > 0
     group by st.goal_id
  ),
  strategy_attainment as (
    select st.id as pid,
           least(100, greatest(0, round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric)))::int as progress
      from public.strategies st join ids on ids.id = st.id left join scv on scv.strategy_id = st.id
     where st.target_numeric is not null and st.target_numeric > 0
  ),
  measured as (
    select pid, progress from goal_attainment union all select pid, progress from strategy_attainment
  )
  select ids.id as card_id, coalesce(m.progress, sr.progress, 0)::int as progress, (m.pid is not null) as is_measured
  from ids left join measured m on m.pid = ids.id left join status_rollup sr on sr.pid = ids.id;
$function$;
REVOKE EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) TO authenticated;

\echo ''
\echo '########## RUN B: 0102 (status-rollup / count-done baseline) ##########'
begin;
select * from pg_temp.bench_run('single_initiative_typical');
select * from pg_temp.bench_run('single_initiative_large');
select * from pg_temp.bench_run('initiatives_batch_30');
select * from pg_temp.bench_run('initiatives_batch_all_210');
select * from pg_temp.bench_run('single_ap_typical');
select * from pg_temp.bench_run('single_ap_mega_500tasks');
select * from pg_temp.bench_run('aps_batch_50');
select * from pg_temp.bench_run('aps_batch_all');
rollback;

\echo ''
\echo '########## EXPLAIN (ANALYZE, BUFFERS) — 0102, aps_batch_all ##########'
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', 'b0000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;
explain (analyze, buffers, format text)
select * from public.workspace_card_progress((select ids from bench_batch where label = 'aps_batch_all'));
reset role;
rollback;

-- ---------------------------------------------------------------- 9. restore 0118 (self-contained — do not skip)
-- Embedded directly (not `\i`'d from the migration file) so this script always
-- leaves the live function correct even if run standalone, on a stale checkout,
-- or if step 8 above errors out mid-swap.
\echo ''
\echo '=== restoring 0118 live body ==='
CREATE OR REPLACE FUNCTION public.workspace_card_progress(p_card_ids uuid[])
  RETURNS TABLE(card_id uuid, progress integer, is_measured boolean)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO ''
AS $function$
  with ids as (select unnest(p_card_ids) as id),

  -- (A) STATUS-ROLLUP — VERBATIM from 0046:2692-2727 (6 branches). Do not modify.
  child_status as (
    -- goal → strategies
    select k.goal_id as pid, k.status as cstatus
      from public.strategies k
      join ids on ids.id = k.goal_id
     where k.status <> 'archived'
    union all
    -- strategy → initiatives
    select s.strategy_id, s.status
      from public.initiatives s
      join ids on ids.id = s.strategy_id
     where s.status <> 'archived'
    union all
    -- initiative → action_plans
    select i.initiative_id, i.status
      from public.action_plans i
      join ids on ids.id = i.initiative_id
     where i.status <> 'archived'
    union all
    -- action_plan → tasks
    select a.action_plan_id, a.status
      from public.tasks a
      join ids on ids.id = a.action_plan_id
     where a.status <> 'archived'
    union all
    -- development_area → problem_statements
    select p.development_area_id, p.status
      from public.problem_statements p
      join ids on ids.id = p.development_area_id
     where p.status <> 'archived'
    union all
    -- problem_statement → action_plans
    select i.problem_statement_id, i.status
      from public.action_plans i
      join ids on ids.id = i.problem_statement_id
     where i.status <> 'archived'
  ),
  status_rollup as (
    select ids.id as pid,
           coalesce(
             round(
               100.0 * count(*) filter (where cs.cstatus = 'done')
               / nullif(count(cs.cstatus), 0)
             ),
             0
           )::int as progress
      from ids
      left join child_status cs on cs.pid = ids.id
     group by ids.id
  ),

  -- (R) RECURSIVE ROLLUP (Opsi B) — Initiative & Action Plan only.
  -- relevant_ap: APs we must score — those requested directly, or children of a
  -- requested Initiative (needed to compute that Initiative's mean). Left broad on
  -- the AP's own status so a directly-requested (even archived) AP still scores;
  -- the Initiative rollup re-filters to non-archived children below.
  relevant_ap as (
    select ap.id, ap.initiative_id, ap.status
      from public.action_plans ap
     where ap.id = any(p_card_ids)
        or ap.initiative_id = any(p_card_ids)
  ),
  -- task_progress: leaf progress per non-archived task under a relevant AP.
  -- one_time → status heuristic (mirror of progress.ts ACTION_PLAN_STATUS_PROGRESS);
  -- repeat   → Repeat Compliance = round(100*done/total) over NON-ARCHIVED instances,
  --            coalesced to 0 when there are no instances (R-1 / R-2).
  task_progress as (
    select t.id as task_id,
           t.action_plan_id,
           case
             when t.repeat_setting = 'repeat' then
               coalesce(
                 round(
                   100.0 * count(ti.id) filter (where ti.status = 'done')
                   / nullif(count(ti.id) filter (where ti.status <> 'archived'), 0)
                 ),
                 0
               )
             else
               case t.status
                 when 'done'        then 100
                 when 'submitted'   then 80
                 when 'in_progress' then 50
                 when 'revision'    then 30
                 when 'assigned'    then 10
                 else 0
               end
           end::numeric as progress
      from public.tasks t
      join relevant_ap ra on ra.id = t.action_plan_id
      left join public.task_instances ti on ti.task_id = t.id
     where t.status <> 'archived'
     group by t.id, t.action_plan_id, t.repeat_setting, t.status
  ),
  -- ap_progress: unweighted mean of leaf task progress; AP with no task → 0.
  -- Full-precision numeric (no round here) so the Initiative mean stays exact.
  ap_progress as (
    select ra.id as pid,
           coalesce(avg(tp.progress), 0)::numeric as progress
      from relevant_ap ra
      left join task_progress tp on tp.action_plan_id = ra.id
     group by ra.id
  ),
  -- initiative_progress: unweighted mean of child AP progress over NON-ARCHIVED
  -- APs; Initiative with no non-archived AP → 0. Full-precision numeric.
  initiative_progress as (
    select i.id as pid,
           coalesce(avg(app.progress), 0)::numeric as progress
      from public.initiatives i
      join ids on ids.id = i.id
      left join relevant_ap ra on ra.initiative_id = i.id and ra.status <> 'archived'
      left join ap_progress app on app.pid = ra.id
     group by i.id
  ),

  -- (P) PUSH-DOWN — strategies whose current-value aggregate the branches below
  --     can reference: Strategy branch needs st.id ∈ p_card_ids; Goal branch needs
  --     st.goal_id ∈ p_card_ids. This is an exact superset of the strategy_ids the
  --     two LEFT JOINs on scv.strategy_id = st.id can match, so restricting the
  --     aggregate to it changes no output number.
  relevant_strategies as (
    select st.id
      from public.strategies st
     where st.id = any(p_card_ids)
        or st.goal_id = any(p_card_ids)
  ),
  -- scv — inlined public.strategy_current_values.numeric_total, but scanning only
  -- the relevant strategies (bounded by idx_task_result_values_strategy) instead
  -- of the org's entire approved result set. Aggregate expression is identical to
  -- the view's numeric_total (0064: view is security_invoker; RLS still applies to
  -- the base tables per caller).
  scv as (
    select rv.strategy_id,
           coalesce(sum(
             case
               when rv.value_type = any(array['number','currency','percentage'])
                 then rv.value_numeric
               else 0::numeric
             end
           ), 0::numeric) as numeric_total
      from public.task_result_values rv
      join public.task_submissions s on s.id = rv.submission_id
     where s.review_status = 'approved'
       and rv.strategy_id is not null
       and rv.strategy_id in (select id from relevant_strategies)
     group by rv.strategy_id
  ),

  -- (B) GOAL attainment = mean( clamp(attainment per measured child Strategy) ).
  --     Population: status IN ('active','done') — O4 excludes draft+archived.
  --     Guard: target_numeric > 0 (prevents div-by-zero; target=0 treated as unmeasured).
  goal_attainment as (
    select st.goal_id as pid,
           round(avg( least(100, greatest(0,
             round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric))) ))::int as progress
      from public.strategies st
      join ids on ids.id = st.goal_id
      left join scv on scv.strategy_id = st.id
     where st.status in ('active', 'done')
       and st.target_numeric is not null and st.target_numeric > 0
     group by st.goal_id
  ),

  -- (C) STRATEGY attainment = own current vs target (clamped 0..100).
  strategy_attainment as (
    select st.id as pid,
           least(100, greatest(0,
             round(100.0 * coalesce(scv.numeric_total, 0) / st.target_numeric)))::int as progress
      from public.strategies st
      join ids on ids.id = st.id
      left join scv on scv.strategy_id = st.id
     where st.target_numeric is not null and st.target_numeric > 0
  ),

  measured as (
    select pid, progress from goal_attainment
    union all
    select pid, progress from strategy_attainment
  )

  select
    ids.id as card_id,
    round(coalesce(m.progress, ip.progress, app.progress, sr.progress, 0))::int as progress,
    (m.pid is not null) as is_measured
  from ids
  left join measured m on m.pid = ids.id
  left join initiative_progress ip on ip.pid = ids.id
  left join ap_progress app on app.pid = ids.id
  left join status_rollup sr on sr.pid = ids.id;
$function$;

-- ACL re-assert (posture unchanged from 0102: authenticated only; PUBLIC/anon revoked).
-- CREATE OR REPLACE preserves the existing ACL, so these are idempotent guards.
REVOKE EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workspace_card_progress(uuid[]) TO authenticated;

\echo '=== integrity check: restored function must hash back to the pre-benchmark value ==='
do $$
declare
  v_hash text;
begin
  select md5(pg_get_functiondef('public.workspace_card_progress(uuid[])'::regprocedure)) into v_hash;
  if v_hash <> 'c68ceb1a72eaa64fc51b8584995f5bfc' then
    raise exception 'RESTORE FAILED: live function hash % does not match expected 0118 hash c68ceb1a72eaa64fc51b8584995f5bfc. DO NOT proceed — investigate before this script (or anything else) touches the DB again.', v_hash;
  end if;
  raise notice 'restore verified: live function matches 0118 exactly';
end $$;

-- ---------------------------------------------------------------- 10. cleanup (disposable org)
\echo ''
\echo '=== tearing down benchmark seed ==='
delete from public.organizations where id = :'v_org';
delete from auth.users where id = :'v_ceo';

\echo '=== post-cleanup counts (should be 0) ==='
select
  (select count(*) from public.tasks where name like 'BENCH%') as bench_tasks_left,
  (select count(*) from public.action_plans where name like 'BENCH%') as bench_aps_left,
  (select count(*) from public.initiatives where name like 'BENCH%') as bench_inits_left,
  (select count(*) from public.organizations where id = :'v_org') as bench_org_left;

\echo 'benchmark-workspace-card-progress-0118.sql: done'
