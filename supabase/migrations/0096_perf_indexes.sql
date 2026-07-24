-- 0096 perf indexes — verified missing on staging (audit 2026-07-24)
-- Plain CREATE INDEX IF NOT EXISTS (not CONCURRENTLY) so this runs inside the
-- migration transaction; staging tables are small enough that the brief lock
-- is fine. All 10 confirmed absent via pg_indexes on the live staging schema.

-- Score-calc per-user scans (calculate_period_scores, 0079). Each metric fn
-- seq-scans a fact table once per staff user, under an advisory xact lock.
create index if not exists idx_task_submissions_submitted_by on public.task_submissions (submitted_by, submitted_at);
create index if not exists idx_governance_violations_user   on public.governance_violations (user_id, created_at);
create index if not exists idx_initiatives_pic              on public.initiatives (pic_id);

-- Global-search card-name ILIKE '%q%' (search_global, 0089) — leading-wildcard
-- across 7 card tables. pg_trgm opclass lives in the `extensions` schema (0054).
create index if not exists idx_goals_name_trgm              on public.goals              using gin (name extensions.gin_trgm_ops);
create index if not exists idx_strategies_name_trgm         on public.strategies         using gin (name extensions.gin_trgm_ops);
create index if not exists idx_initiatives_name_trgm        on public.initiatives        using gin (name extensions.gin_trgm_ops);
create index if not exists idx_action_plans_name_trgm       on public.action_plans       using gin (name extensions.gin_trgm_ops);
create index if not exists idx_tasks_name_trgm              on public.tasks              using gin (name extensions.gin_trgm_ops);
create index if not exists idx_development_areas_name_trgm  on public.development_areas  using gin (name extensions.gin_trgm_ops);
create index if not exists idx_problem_statements_name_trgm on public.problem_statements using gin (name extensions.gin_trgm_ops);
