# Rollback Plan — V1.8.3 Workspace Terminology Rename

Status: **APPROVED PATH** — 2026-07-11.
Scope: emergency reversal for the rename shipped as migrations `0045_rename_workspace_terminology.sql` + `0046_rewrite_bodies_and_policies.sql`.
Owner sign-off required to execute production rollback (Super Admin + CTO).

Companion documents:
- [rename-workspace-terminology.md](rename-workspace-terminology.md) — forward spec.
- [rename-workspace-terminology-prd-mapping.md](rename-workspace-terminology-prd-mapping.md) — PRD section mapping.
- Forward migrations under `supabase/migrations/0045_*.sql` + `0046_*.sql`.
- Revert helper: `supabase/migrations/0045R_revert_workspace_terminology.sql` (DDL shape only).

---

## When to invoke

Only when **all** of these are true after production merge:

1. A blocker regression is confirmed post-deploy that traces to the rename (not to unrelated F0–F4 work).
2. Forward fix within 24h is unfeasible (patch on top of the new schema is riskier than reverting).
3. Owner + Super Admin authorize the rollback (recorded in `wiki/log.md`).

Otherwise: forward-fix. The rename touches ~2900 lines of SQL and ~200 mobile files; partial rollback is not offered.

---

## Rollback stages

Rollback is **not a single migration** because `0046` REPLACED functions and policies without preserving their pre-state text. Reverting the DDL shape is straightforward; restoring the pre-`0046` runtime behavior requires re-applying the historical migration set on the reverted shape.

### R0. Pre-checks (2 min)

- Confirm no in-flight production writes (put the app in maintenance if possible).
- `pg_dump --schema-only --no-owner --no-privileges` of current DB → snapshot for audit.
- Verify `git rev-parse HEAD` on the branch that landed the rename.
- Freeze new deploys.

### R1. Schema-shape revert (5 min)

Apply `supabase/migrations/0045R_revert_workspace_terminology.sql`.

- Renames tables/columns/indexes/view back to pre-`0045` names (bottom-up reversed).
- Single `BEGIN/COMMIT` transaction — either all succeed or all roll back.
- **Post-condition:** `pg_class` shape matches the pre-`0045` state.

Local apply (staging drill):
```powershell
docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
  < supabase/migrations/0045R_revert_workspace_terminology.sql
```

After this step, functions/policies/triggers still reference the NEW-NAME identifiers (from `0046`). They will start erroring on every call. This is expected — proceed to R2 immediately.

### R2. Function/policy restore (30–60 min)

Two options; pick one:

**Option A — Restore from `pg_dump` snapshot (recommended):**

Requires that a snapshot was taken BEFORE `0045` was applied to production (Supabase daily backup, or manual `pg_dump` at deploy time).

```sh
# Selective restore of pg_proc + pg_policy tables via pg_restore, OR
# full restore of public schema with --clean and re-apply RLS grants.
pg_restore --clean --if-exists --schema=public --data-only \
  --exclude-table='public.*' \
  --include-function='public.*' \
  <snapshot.dump>
```

**Option B — Re-apply historical migrations 0005..0044:**

Run migrations `0005_fase1_card_engine.sql` .. `0044_*` in order against the reverted schema. Each `CREATE OR REPLACE FUNCTION` / `CREATE POLICY` reinstates the pre-rename definition. Slower (~60 min in local test) and requires no seed conflict.

```sh
for m in supabase/migrations/00{05,06,07,08,09}_*.sql \
         supabase/migrations/00{10..44}_*.sql; do
  echo "Applying $m"
  docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$m"
done
```

**Warning:** any migration between `0005` and `0044` that INSERTs seed data will run again. Wrap in a smoke check before running against production.

### R3. Mobile client rollback (10 min)

The mobile client (F4 commit `b90ff87` + copy commit `d53a41a`) uses the new names.
Rollback options:

1. **Revert PR #52 forward-commits** on the working branch:
   ```sh
   git revert --no-edit d53a41a b90ff87 5b4dede c850a4c f90ba06 e3c115c
   ```
   This produces a revert PR that returns the client to pre-rename state.
2. **Ship a previous release** if a signed build ≤ `1.8.2` is available in EAS.

Either way: publish a fresh EAS Update / build so users don't hit RPC errors.

### R4. Verification (5 min)

Local drill (executed at merge time):

```sh
# 1. Ensure DB reverted:
docker exec supabase_db_supabase psql -U postgres -d postgres -c "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('kpi_areas','strategies','initiatives','action_plans',
                      'action_plan_instances','action_plan_submissions',
                      'action_plan_result_values','action_plan_repeat_rules',
                      'kpi_area_templates','kpi_area_target_breakdowns');
"
# expected: 10

# 2. Ensure new-name tables are gone:
docker exec supabase_db_supabase psql -U postgres -d postgres -c "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('tasks','task_instances','task_submissions',
    'task_result_values','task_repeat_rules','strategy_templates',
    'strategy_target_breakdowns','strategy_current_values');
"
# expected: 0

# 3. Sanity RPC:
docker exec supabase_db_supabase psql -U postgres -d postgres -c "
  SELECT public.kpi_area_has_my_descendant('00000000-0000-0000-0000-000000000000'::uuid);
"
# expected: f (no error → body restored)
```

Mobile:
```sh
cd mobile && npm run type-check && npm run test:ci
# expected: 0 tsc error + all jest suites pass (against the reverted branch)
```

### R5. Post-rollback

- Update `wiki/log.md` with dated entry describing the rollback (root cause, decision, executor).
- Regenerate `mobile/src/lib/database.types.ts` on the reverted branch to match reverted schema.
- Send heads-up to the team; annotate PR #52 with a "REVERTED" note.

---

## Drill artefak (2026-07-11)

Drill dijalankan lokal dgn urutan: **forward 0045+0046 → 0045R → forward 0045 → forward 0046 replay**.

Temuan:

1. **`0045R` DDL revert bersih** — 10 tabel legacy (`kpi_areas`, `strategies`, `initiatives`, `action_plans` + turunan) restored, 0 sisa new-name, view `kpi_area_current_values` recreated, SELECT `count(*)` di setiap level = 4 (seed intact).
2. **Constraint gap terungkap & diperbaiki**: `0046` S0 me-rename `initiatives_single_parent` → `action_plans_single_parent` yang tidak di-revert `0045R` awal. Fix: `0045R` §0R menambahkan revert constraint (DO-block idempotent), dan `0046` S0 dibungkus DO-block idempotent — sekarang drill roundtrip DDL bekerja.
3. **Policy + trigger replay bentrok — FIXED (F6a, 2026-07-11)**. Awalnya, forward re-apply `0046` setelah drill gagal karena (a) `CREATE POLICY <new-name>` collide dgn policy new-name sisa initial apply, dan (b) `CREATE TRIGGER <new-name>` collide (trigger survive rename-roundtrip via OID). **Fix diterapkan**: `0046` S2 sekarang `DROP POLICY IF EXISTS <new-name> ON <table>` sebelum tiap `CREATE POLICY` (19×), dan S5 `DROP TRIGGER IF EXISTS <new-name>` sebelum tiap `CREATE TRIGGER` (3×). Kombinasi CREATE OR REPLACE (function) + DO-block (constraint) + DROP-IF-EXISTS (policy/trigger) membuat `0046` **fully replay-safe**.
4. **`0047` idempotency — FIXED**. Reseed guidance awalnya pakai stateful `UPDATE card_type` bottom-up yang men-shift ulang saat re-run (menciptakan duplikat `task`). **Fix**: S2 default rows pakai `DELETE + INSERT` (idempotent), S1 org-specific shift dibungkus DO-block yang hanya fire kalau org masih punya row legacy `kpi_area`. Terbukti: apply 2× → tetap 7 row default, tanpa duplikat.
5. **Full drill lolos (2026-07-11)**: `forward(0045+0046+0047) → 0045R → forward(0045+0046+0047)` semua COMMIT tanpa error. Post-drill state: 4 tabel new-name, 7 guidance row, `map_legacy_entity_type('kpi_area')` = `'strategy'`. tsc + jest tetap hijau (jest 1163/1163 stabil).

## Local staging drill (F6 acceptance)

At merge time, run this end-to-end on a scratch local DB and record the result in `wiki/log.md`:

```sh
# Fresh local DB, all forward migrations applied
docker exec -i supabase_db_supabase psql -U postgres -d postgres -c "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('tasks','strategies','initiatives','action_plans');
"
# expected: 4 (post-rename)

# Apply revert
docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/0045R_revert_workspace_terminology.sql

# Check shape reverted
docker exec -i supabase_db_supabase psql -U postgres -d postgres -c "
  SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('kpi_areas','strategies','initiatives','action_plans');
"
# expected: 4 (pre-rename shape)
```

Then re-apply `0045` + `0046` to leave local DB in current state.

---

## Known non-reversible items

- Historical `activity_logs`/`notifications`/`governance_violations` rows written between `0046` apply and rollback that used NEW `entity_type` literals (`'task'`, `'strategy'`, etc.). These will fail the ORIGINAL CHECK constraints. Two options:
  1. Backfill: `UPDATE activity_logs SET entity_type = <legacy>` mapping new→old before re-enforcing constraints.
  2. Leave the expanded CHECK constraints (0046 S0) in place — they accept both.

- Row-level state changes (submissions, evaluations, etc.) made during the window between deploy and rollback are preserved but their FK columns reference the new column names. `0045R` renames them back before the constraint is re-checked, so this works transparently.

- User memories/preferences that captured NEW terminology (client-side cache, notification history) are ephemeral and self-heal.

---

## Contacts & sign-off

- Rollback executor: to be assigned by Super Admin.
- Content Lead for user comms during rollback: RWT-12 DRI (PENDING).
