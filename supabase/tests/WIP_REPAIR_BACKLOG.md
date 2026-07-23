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

## Un-quarantined (2026-07-23) — PR #168, migration 0090

- **`0063_push_infrastructure_contract`** — un-quarantined, all 30 assertion
  blocks green. It was the *only* coverage of the push drainer, and being
  skipped is a direct cause of the 0090 incident: `service_role` never held
  EXECUTE on `claim_push_deliveries`, so the drainer 403'd 1440×/day from the
  day 0063 shipped, and nothing caught it.

  Its quarantine note blamed z2/z3 (schema-net REVOKE and `vault.create_secret`
  needing `supabase_admin` on local). **Both were wrong.** The actual rot was
  every `insert into auth.users(id)` failing since 0083 (`handle_new_user`
  refuses to infer an org once >1 organisation exists). Execution died at block
  (j) under `ON_ERROR_STOP`, so z2 was merely the first thing *nobody had ever
  reached* — it was assumed guilty because everything past (i) was unverified.
  Fixed by passing `raw_app_meta_data.organization_id` explicitly.

  `vault.create_secret` needs no manual step either: both secrets exist on a
  migration-bootstrapped local DB, still holding `'___PLACEHOLDER___'` and
  sharing the migration's creation timestamp — the do-block created them.

  > **Live finding, not fixed here.** Guardrail G-2 is **inactive on hosted**.
  > The comment in `0063_push_infrastructure.sql:409-414` has it backwards:
  > schema `net` is owned by `supabase_admin` on staging too, so the migration's
  > `revoke usage on schema net` no-ops *there*, not locally. On staging, `anon`
  > and `authenticated` both hold USAGE on `net` **and** EXECUTE on
  > `net.http_post`. `net` is not PostgREST-exposed, so this is
  > defense-in-depth rather than a directly reachable hole, but the guardrail
  > the migration claims to install does not exist. Closing it needs a REVOKE
  > run as `supabase_admin`, which a migration cannot do. Test z2 is kept and
  > passes in CI, but only because the local image never granted the privilege
  > in the first place — a vacuous pass, flagged in-file above the block.

## Un-quarantined (2026-07-19) — PR #107 merged, migration 0076 live

- **`0017_permission_settings_contract`** — un-quarantined. PR #107 (squash-
  merged PR #105's migration as `0076_restore_user_permissions_hardening.sql`)
  landed on staging 2026-07-19. The three regressions (table write grants,
  self-modification guard, invalid-key message) are now fixed in the migration
  chain. **Pre-existing message drift**: test D_key asserts `%tidak valid%`
  (0017 original); 0041 changed the wording to `'Permission tidak dikenal'`;
  the 0076 fix restores the 0017 wording but keeps the key-name suffix —
  needs separate reconciliation if the project standardises on one style.

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

A second collision surfaced after merging in `origin/staging` (PR #104,
`0071_fix_search_chat_messages_limit_clamp.sql`, landed on staging after this
branch forked): it collided with this branch's renumbered
`0071_fix_score_ranking_rls_policies.sql`. Resolved by moving the incoming
file to `0075` (unrelated content, no ordering constraint beyond "after
0060_chat_confidential_rls_fts.sql", the migration it patches — its own
cross-references to that file were updated from the old `0059_` name).
Current highest migration on this branch: **0075**.

**✅ PR #107** (replacement for closed #105) merged to staging 2026-07-19.
Its `0072_restore_user_permissions_hardening.sql` collided with this branch's
`0072_fix_submit_task_review_notif.sql` as predicted — resolved by renaming
the incoming migration to `0076_restore_user_permissions_hardening.sql` on
this branch. Current highest migration: **0076**.

## New failures surfaced by the first fresh-bootstrap CI run (2026-07-18)

Once the migration-numbering collisions above were fixed, `supabase start`
succeeded end-to-end for the first time — and the contract suite immediately
found two more pre-existing gaps, invisible until now for the same underlying
reason as everything else in this file: nothing had ever exercised these
migrations against a genuinely empty database before this CI job existed.

| File | Rot class | Root cause |
|---|---|---|
| `0063_push_infrastructure_contract` | infra/environment parity | test `z2` (schema-net USAGE guardrail) fails on local/CI: `0063_push_infrastructure.sql`'s `revoke usage on schema net from public, authenticated, anon;` silently no-ops on Supabase LOCAL (the `net` schema is owned by `supabase_admin`; migrations run as `postgres`, not superuser, locally) and only actually takes effect on Supabase HOSTED. The migration's own comment (lines 409-414) already documents this with a manual `docker exec -U supabase_admin` workaround that was never automated. Test execution stops at `z2` (`ON_ERROR_STOP`), so `z3`-`z6` (vault secrets, cron job config) are **unverified** against a fresh bootstrap — the same migration's `vault.create_secret requires supabase_admin on local` comment suggests `z3` may have an identical gap |
**Repair priority**: `0063_push_infrastructure_contract`'s finding is
security-adjacent (an HTTP-egress guardrail not actually enforced on
local/CI) even though the author's comment suggests hosted is fine — worth
confirming hosted staging/prod really has the guardrail active before
treating this as low-urgency.

## Un-quarantined (2026-07-19) — `0073_strategy_template_crud_contract` repaired

- **`0073_strategy_template_crud_contract`** — un-quarantined (P0-5). Rewritten
  from the pgTAP draft into the extension-free `do $$ ... raise exception $$ /
  rollback` pattern the rest of the suite uses, so it now runs under
  `run-db-contract-tests.sh` (no `pgtap` dependency). Beyond restoring the
  original structural checks (org column, is_active default, 4 policies, label
  rename), it adds the **behavioural** cross-tenant proofs the pgTAP version
  lacked — the whole reason 0073 replaced the withdrawn 0061 draft:
  - DB-4: CEO of org A cannot DELETE org B's template (the headline hole).
  - DB-5: cross-org UPDATE blocked + cross-org SELECT invisible.
  - DB-6: same-org DELETE still works (guard does not over-block).
  - DB-7: `apply_goal_template` (SECURITY DEFINER) does not seed cross-org
    templates.
  Verified 7/7 PASS against a fixtures-seeded local DB, and validated with a
  negative control: reproducing the full 0061 draft (SELECT `using(true)` +
  DELETE without org scope) makes DB-4 fail as designed.
