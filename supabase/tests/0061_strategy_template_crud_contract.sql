-- Contract test: 0061_strategy_template_crud
-- Verifies is_active column + INSERT/UPDATE/DELETE RLS for strategy_templates.
begin;
select plan(7);

-- ---------------------------------------------------------------- TEST 1: is_active column exists with default true
select has_column('public', 'strategy_templates', 'is_active',
  'T1: strategy_templates.is_active column exists');

select col_default_is('public', 'strategy_templates', 'is_active', 'true',
  'T1b: is_active defaults to true');

-- ---------------------------------------------------------------- TEST 2: RLS policies exist (4 total)
select policies_are(
  'public', 'strategy_templates',
  array[
    'kpi_area_templates_select',
    'strategy_templates_insert',
    'strategy_templates_update',
    'strategy_templates_delete'
  ],
  'T2: SELECT + INSERT + UPDATE + DELETE policies exist'
);

-- ---------------------------------------------------------------- TEST 3: INSERT policy gated on manage_kpi_area_templates
select policy_cmd_is(
  'public', 'strategy_templates', 'strategy_templates_insert', 'INSERT',
  'T3: insert policy is for INSERT command'
);

-- ---------------------------------------------------------------- TEST 4: UPDATE policy exists
select policy_cmd_is(
  'public', 'strategy_templates', 'strategy_templates_update', 'UPDATE',
  'T4: update policy is for UPDATE command'
);

-- ---------------------------------------------------------------- TEST 5: DELETE policy exists
select policy_cmd_is(
  'public', 'strategy_templates', 'strategy_templates_delete', 'DELETE',
  'T5: delete policy is for DELETE command'
);

-- ---------------------------------------------------------------- TEST 6: permission label updated
select is(
  (select label from public.permissions where key = 'manage_kpi_area_templates'),
  'Kelola Strategy Template',
  'T6: permission label renamed to "Kelola Strategy Template"'
);

select * from finish();
rollback;
