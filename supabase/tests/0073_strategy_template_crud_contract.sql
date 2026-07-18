-- Contract test: 0069_strategy_template_crud
-- Verifies organization_id + is_active + org-scoped RLS.
begin;
select plan(10);

-- ---------------------------------------------------------------- TEST 1: columns
select has_column('public', 'strategy_templates', 'organization_id',
  'T1a: organization_id column exists');
select col_not_null('public', 'strategy_templates', 'organization_id',
  'T1b: organization_id NOT NULL');
select has_column('public', 'strategy_templates', 'is_active',
  'T1c: is_active column exists');
select col_default_is('public', 'strategy_templates', 'is_active', 'true',
  'T1d: is_active defaults to true');

-- ---------------------------------------------------------------- TEST 2: RLS policies exist (4 total, org-scoped)
select policies_are(
  'public', 'strategy_templates',
  array[
    'strategy_templates_select',
    'strategy_templates_insert',
    'strategy_templates_update',
    'strategy_templates_delete'
  ],
  'T2: SELECT + INSERT + UPDATE + DELETE policies exist (renamed to strategy_templates_*)'
);

-- ---------------------------------------------------------------- TEST 3-6: policy cmd wiring
select policy_cmd_is(
  'public', 'strategy_templates', 'strategy_templates_select', 'SELECT',
  'T3: select policy is for SELECT command'
);
select policy_cmd_is(
  'public', 'strategy_templates', 'strategy_templates_insert', 'INSERT',
  'T4: insert policy is for INSERT command'
);
select policy_cmd_is(
  'public', 'strategy_templates', 'strategy_templates_update', 'UPDATE',
  'T5: update policy is for UPDATE command'
);
select policy_cmd_is(
  'public', 'strategy_templates', 'strategy_templates_delete', 'DELETE',
  'T6: delete policy is for DELETE command'
);

-- ---------------------------------------------------------------- TEST 7: permission label updated
select is(
  (select label from public.permissions where key = 'manage_kpi_area_templates'),
  'Kelola Strategy Template',
  'T7: permission label renamed to "Kelola Strategy Template"'
);

select * from finish();
rollback;
