# DB Contract Test — Repair Backlog

These `*.wip.sql` files are **quarantined** (skipped by
`scripts/ci/run-db-contract-tests.sh`, which excludes `*.wip.sql`). They were
authored before the DB contract suite was wired into CI and have since rotted
against schema/behaviour changes — the exact failure mode P2 exists to prevent.
None of them pass against the current schema.

**To repair one:** re-author it against the current schema, confirm it passes via
`RENCAN_DB_CONTAINER=supabase_db_supabase bash scripts/ci/run-db-contract-tests.sh`
(after temporarily renaming it back to `*.sql`), then drop the `.wip` suffix so CI
gates on it. The canonical fixtures in `_fixtures.sql` seed the org/CEO/roles the
pre-0045 tests hardcode.

| File | Rot class | Root cause |
|---|---|---|
| `0018_inbox_preview_contract` | schema | `initiatives` now requires `strategy_id` (goal→strategy→initiative rename); test attaches an initiative with no strategy parent |
| `0019_ap5_ap6_contract` | dropped object | tests the dropped `kpi_areas` table + renamed `kpi_area_current_values` view (V1.8.3) |
| `0038_dcr05_minta_revisi_contract` | runner-incompatible | uses `raise 'ROLLBACK_OK'` as its **pass** signal (needs block-by-block exec); rewrite to `begin … rollback` + raise-only-on-FAIL |
| `0040_notification_resolution_contract` | schema | `initiatives.strategy_id` NOT NULL |
| `0055_chat_message_reactions_contract` | schema | `chat_messages.chat_room_id` NOT NULL; test inserts a message with no room |
| `0074_goal_attainment_contract` | behaviour | attainment rollup computed 0 vs expected 70 (fixture/behaviour drift) |
| `fase3_per_user_contract` | schema + stale UUID | hardcoded permission UUID (use lookup by key) **and** `initiatives.strategy_id` NOT NULL |
| `fase4_performance_workspace_contract` | dropped object | tests the dropped `kpi_areas` table throughout (V1.8.3 rename to `strategies`) |
| `fase5_minimum_breakdown_rules_contract` | behaviour | `minimum_breakdown_rules` goal→kpi unlock assertion drifted |
| `fase6_development_workspace_contract` | schema | expected `initiatives` problem-statement column / single-parent check no longer present |
| `fase7_people_score_contract` | scenario | score not computed for the period (needs close/calculate fixture) |
| `fase8_governance_admin_contract` | schema + runner-incompatible | `evaluations.initiative_id` removed; also `raise 'ROLLBACK_OK'` sentinel style |
| `ws3b_notif_instance_entity_contract` | schema | `initiatives.strategy_id` NOT NULL |

## Highest-priority follow-ups

1. **Behavioural `submit_task` review-notif test** — the shipped
   `submit_task_review_notif_contract.sql` is wiring-level only; add the full
   `goal→strategy→initiative→action_plan` end-to-end assertion here.
2. The `initiatives.strategy_id` cluster (`0018`, `0040`, `ws3b`, `fase3`) shares
   one fix: build a valid `goal→strategy→initiative` chain in each scenario.

## Un-quarantined — depends on the 0072 permission-hardening fix

- **`0017_permission_settings_contract`** — un-quarantined; the three regressions
  it catches (table write grants, self-modification guard, invalid-key message)
  are fixed by `0072_restore_user_permissions_hardening.sql` on branch
  `claude/elegant-vaughan-e76148` (PR #105 → staging). This test will fail
  until that fix lands in the migration chain. **Pre-existing message drift**:
  test D_key asserts `%tidak valid%` (0017 original); 0041 changed the wording
  to `'Permission tidak dikenal'`; the PR #105 fix restores the 0017 wording
  but keeps the key-name suffix — needs separate reconciliation if the project
  standardises on one style.

## Migration renumbering (2026-07-18) — collides with PR #105

Fresh `supabase start` (the CI db-contract job's bootstrap) failed with
`duplicate key value violates unique constraint "schema_migrations_pkey"`:
three pairs/triples of migration files shared the same numeric prefix
(`0058` x2, `0059` x3, `0061` x2) — pre-existing on `origin/staging`, never
caught because nothing had ever applied every migration from a truly empty
database before this CI job existed. Confirmed via the remote project's
`schema_migrations` table that each file is already tracked there under its
own distinct real timestamp version, decoupled from the local `00NN_` filename
— so renumbering the local files does not touch already-applied remote state.

Fixed by cascading every migration from `0058_fix_reaction_table_grants.sql`
through `0070_workspace_card_progress_attainment.sql` forward by however many
slots were needed to make every prefix unique, **preserving the exact original
apply order** (no file changed position relative to any other). New range:
`0058` through `0074`. Matching contract test files were renamed to track
their migration's new number, and self-referencing header comments were
updated.

**⚠️ PR #105** (`claude/elegant-vaughan-e76148`, adds
`0072_restore_user_permissions_hardening.sql`) will collide with this branch's
new `0072_fix_submit_task_review_notif.sql` once both land on staging. That
PR's migration must be renumbered to the next free slot (`0075` or later,
whatever is free at merge time) before or during its merge — do not merge
PR #105 as-is once this branch has landed without re-checking for a
`0072` collision first.
