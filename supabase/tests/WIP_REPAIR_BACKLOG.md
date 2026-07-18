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
| `0070_goal_attainment_contract` | behaviour | attainment rollup computed 0 vs expected 70 (fixture/behaviour drift) |
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

## Un-quarantined — depends on migration 0072

- **`0017_permission_settings_contract`** — un-quarantined; the three regressions
  it catches (table write grants, self-modification guard, invalid-key message)
  are fixed by `0072_restore_user_permissions_hardening.sql` (PR #105 → staging).
  This test will fail until 0072 lands in the migration chain. **Pre-existing
  message drift**: test D_key asserts `%tidak valid%` (0017 original); 0041
  changed the wording to `'Permission tidak dikenal'`; 0072 restores the 0017
  wording but keeps the key-name suffix — needs separate reconciliation if the
  project standardises on one style.
