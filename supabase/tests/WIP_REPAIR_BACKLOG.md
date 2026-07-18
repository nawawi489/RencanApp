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
| `0017_permission_settings_contract` | behaviour/grant drift — **confirmed real security regression, fix drafted but not yet merged here** | `authenticated`/`anon` hold direct INSERT/UPDATE/DELETE on `public.user_permissions` (undone by 0036's bulk grant); `set_user_permission` lost its self-modification guard (dropped by 0041's rewrite) — a staff user holding delegated `manage_users_permissions` can self-grant other permissions; invalid-key wording also drifted. Fix exists as `0072_restore_user_permissions_hardening.sql` on branch `claude/elegant-vaughan-e76148` (PR #105 → staging), but that PR's diff is unexpectedly large (100+ files, many unrelated deletions — looks like a stale base) and has **not** been reviewed/merged. Do not un-quarantine until 0072 is cherry-picked here (or lands on staging) and this test re-verifies green |
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

## Investigated, fix drafted but NOT merged

- **`0017_permission_settings_contract`** — the suspected grant/behaviour drift
  was confirmed as a real security regression (not test staleness): see the row
  above. A fix (`0072_restore_user_permissions_hardening.sql`) has been drafted
  on branch `claude/elegant-vaughan-e76148` (PR #105 → staging), but that PR's
  diff is unexpectedly large (100+ files, many unrelated deletions — likely a
  stale base) and has not been reviewed or merged. **Remains quarantined here**
  until 0072 is cherry-picked onto this branch (or lands on staging first) and
  the test is re-verified green. Do not treat this as resolved based on commit
  messages alone — check `ls supabase/migrations/ | grep 0072` before trusting
  any "resolved" claim.
