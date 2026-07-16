-- =============================================================================
-- 0065_search_path_empty_consistency.sql
-- =============================================================================
-- Defense-in-depth fix (Group D, /cso follow-up 2026-07-16):
--
-- Every other SECURITY DEFINER function in the codebase uses
-- `set search_path = ''` (forces fully schema-qualified references).
-- These two instead pin to `public`:
--
--   1. current_user_org  (0016_security_hardening.sql:17)
--   2. purge_old_activity_logs  (0043_activity_logs_retention.sql:35)
--
-- Both function bodies already fully qualify every reference
-- (public.profiles, public.activity_logs, auth.uid()), so this is a
-- no-behavior-change consistency fix, not an active bug.
-- =============================================================================


-- ============================================================ 1. current_user_org
create or replace function public.current_user_org()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id from public.profiles
  where id = auth.uid() and is_active = true;
$$;


-- ============================================================ 2. purge_old_activity_logs
create or replace function public.purge_old_activity_logs(
  p_retention_months int default 12,
  p_batch_size int default 10000,
  p_activate_after date default '2026-08-06'
) returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count int;
begin
  if current_date < p_activate_after then
    return 0;
  end if;

  with old as (
    select id from public.activity_logs
    where created_at < now() - make_interval(months => p_retention_months)
    order by created_at
    limit p_batch_size
  )
  delete from public.activity_logs
  where id in (select id from old);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
