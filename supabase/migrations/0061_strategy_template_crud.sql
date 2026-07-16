-- 0061_strategy_template_crud.sql
-- PRD V1.83 §19: admin CRUD for strategy_templates (create/edit/disable).
--
-- Changes:
--   1. Add is_active boolean column (default true) for soft-disable.
--   2. Add INSERT/UPDATE/DELETE RLS policies gated on manage_kpi_area_templates
--      (the permission key seeded in 0001; the table itself was renamed to
--       strategy_templates in migration 0045, but the permission key text
--       was kept as-is and was not part of that rename).
--   3. Rename permission label to match current UI terminology.

-- ---------------------------------------------------------------- schema

alter table public.strategy_templates
  add column if not exists is_active boolean not null default true;

comment on column public.strategy_templates.is_active is
  'Soft-disable: false hides template from user-facing pickers but preserves data.';

-- ---------------------------------------------------------------- RLS policies (write)

create policy "strategy_templates_insert"
  on public.strategy_templates
  for insert to authenticated
  with check (public.has_permission('manage_kpi_area_templates'));

create policy "strategy_templates_update"
  on public.strategy_templates
  for update to authenticated
  using (public.has_permission('manage_kpi_area_templates'))
  with check (public.has_permission('manage_kpi_area_templates'));

create policy "strategy_templates_delete"
  on public.strategy_templates
  for delete to authenticated
  using (public.has_permission('manage_kpi_area_templates'));

-- ---------------------------------------------------------------- permission label update

update public.permissions
  set label = 'Kelola Strategy Template'
  where key = 'manage_kpi_area_templates';

-- ---------------------------------------------------------------- sanity check

do $$
declare
  n_policies int;
begin
  select count(*) into n_policies
    from pg_policies
   where tablename = 'strategy_templates';
  raise notice '0061: strategy_templates policies = % (expect 4: select + insert + update + delete)', n_policies;
end $$;
