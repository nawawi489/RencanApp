---
type: concept
tags: [reliability, data-integrity, mutations, react-query, supabase, rls, adr, spec]
updated: 2026-07-25
sources: 0
---

# Write Idempotency Keys — de-duplicate non-idempotent inserts

Spec status: **PROPOSED** (follow-up to PR #197). Not yet scheduled. Depends on no prior work; can land independently.

## Context

PR #197 set React Query `mutations: { retry: false }` (see [[architecture]] thin-client rules and `mobile/src/lib/query-client.ts`). That removed the **automatic** duplicate-INSERT trigger: a dropped ACK on a committed INSERT no longer re-fires the same write inside `mutateAsync`.

The **residual** risk remains: a user who submits, sees a network error (the ACK was lost but the row *did* commit server-side), and taps "Save/Send" again creates a genuine duplicate. Nothing on the server rejects the second write because every payload column is legitimately identical-but-new. This spec closes that hole with a client-supplied idempotency key so that "the same logical submit, sent twice" collapses to one row and returns the original.

Affected write paths (all currently carry **no** idempotency key):

| Function | File | Topology | Target |
|---|---|---|---|
| `createGoal` | `lib/goals.ts` | direct insert | `goals` |
| `createActionPlan` | `lib/cards.ts` | direct insert | `action_plans` |
| `createTask` | `lib/cards.ts` | direct insert | `tasks` |
| `createInitiative` | `lib/initiatives.ts` | direct insert | `initiatives` |
| `createProblemStatement` | `lib/problem-statements.ts` | direct insert | `problem_statements` |
| `sendChatMessage` | `lib/inbox.ts` | SECURITY DEFINER RPC | `send_chat_message` → `chat_messages` |

## Goal / Non-goal

- **Goal**: "same logical submit sent twice" produces exactly one row; the second attempt returns the first row's identity as a success (not an error, not a duplicate).
- **Goal**: mechanism is race-safe under true concurrency (two in-flight requests with the same key), not just sequential retry.
- **Non-goal**: cross-device or long-lived idempotency. Keys are per-compose-session and short-lived.
- **Non-goal**: re-enabling global write retry. Keys make a *specific* opt-in retry safe, but the global default stays `false`.
- **Non-goal**: lifecycle RPCs (`activate*`, `start_task`, reactions, `mark_chat_messages_read`). Those are idempotent-by-state or naturally safe; out of scope.

## Design

### Key model

- The **client** generates a UUID (`client_request_id`) per *logical* submit and reuses it across retries of that same submit.
- The key is generated **once** when the compose action is first fired and held in component/mutation state. It is reused if the submit errors and the user retries; it is regenerated only after a confirmed success or when a new item is started. This stability across manual retries is the whole point — a key regenerated on every tap defeats the mechanism.
- Persisted on the created row as a nullable `client_request_id uuid` column. Nullable so historical rows and any future server-side inserts are unaffected.

### Server mechanism — two topologies

**A. Direct-insert tables** (`goals`, `action_plans`, `tasks`, `initiatives`, `problem_statements`)

1. Add `client_request_id uuid` (nullable).
2. Add a **partial unique index** scoped to the natural owner:
   ```sql
   create unique index concurrently <table>_client_request_id_uidx
     on public.<table> (organization_id, created_by, client_request_id)
     where client_request_id is not null;
   ```
   Scoping to `(organization_id, created_by)` keeps keys collision-free across tenants/users and matches the `created_by = auth.uid()` insert pattern already in each `create*`.
3. Return-the-original on conflict. **Recommended**: a thin `security invoker` RPC per table (or one generic helper) doing:
   ```sql
   insert into public.<table> (...cols..., organization_id, created_by, client_request_id)
   values (...)
   on conflict (organization_id, created_by, client_request_id)
     where client_request_id is not null
     do update set client_request_id = excluded.client_request_id  -- no-op, lets RETURNING fire
   returning *;
   ```
   The no-op `do update` is what makes `RETURNING` yield the **existing** row on a duplicate without mutating data or firing meaningful audit churn. `security invoker` preserves existing RLS (no new SECURITY DEFINER surface — see [[permission-model]]).

   **Lighter alternative** (no RPC): keep the PostgREST `.insert()`, and on `23505` against the new index, re-`select` the existing row by `(organization_id, created_by, client_request_id)` and return it. Simpler diff, but two round-trips on the conflict path and a small TOCTOU window that the unique index still makes safe. **Decision needed** — see Open questions.

**B. Chat RPC** (`send_chat_message`)

1. Add `client_request_id uuid` to `chat_messages` + the same partial unique index scoped to `(chat_room_id, sender_id, client_request_id)`.
2. Add `p_client_request_id uuid default null` as a **new trailing param**. Per the RPC-signature gotcha ([[../MEMORY|anon-public-rpc-grant-gotcha]]): this means `drop function` the current 6-param signature and `create or replace` the 7-param version, then **re-`grant execute` to `authenticated` and re-`revoke` from `public, anon`** — a DROP resets the ACL. Preserve the existing body byte-for-byte (guards, mention loop, `emit_notification`, attachment validation) and add only the dedup block.
3. Inside the function, after room/membership guards: if `p_client_request_id is not null`, `select id into v_existing from public.chat_messages where chat_room_id = p_room and sender_id = v_uid and client_request_id = p_client_request_id; if found, return v_existing;` then insert with the key. Keep the unique index as the race backstop (two concurrent calls: loser hits `23505` → catch and return the winner's id).

### Client changes

- Add optional `clientRequestId: string` to each `New*` input type and thread it into the insert/RPC params.
- Generate with `crypto.randomUUID()` (RN 0.85 / Hermes exposes it; fall back to `expo-crypto` `randomUUID()` if unavailable — verify on device).
- Hold the key in the compose screen's state (or in the mutation `variables`), regenerate on success. This is the only behavioral change users could notice, and only in the retry-after-error path.

## Acceptance criteria

1. Submitting the same logical create twice (same `client_request_id`) yields **one** row; the second call returns the first row's id as success.
2. Two concurrent requests with the same key → one row, no unhandled `23505` surfaced to the UI.
3. Distinct submits (distinct keys) with otherwise-identical payloads still create distinct rows (no false merge).
4. Omitting the key (null) preserves today's behavior exactly — no unique-index collisions on legacy/null rows.
5. RLS unchanged: chat RPC re-granted to `authenticated` only; direct-insert RPCs are `security invoker`. Verified by a contract test asserting `anon`/`public` cannot execute.
6. `npm run type-check`, `npm test`, `npm run lint` green.

## Test plan

- **DB contract** (`supabase/tests/`, the blocking Postgres gate — see [[../MEMORY|p2-db-contract-ci]]): per table, insert twice with same `(org, created_by, client_request_id)` → assert one row + returned id stable; assert distinct keys → two rows; assert null key path unaffected; assert `send_chat_message` dedup + re-grant ACL (execute allowed for `authenticated`, denied for `anon`).
- **Jest** (`mobile/src/lib/__tests__/`): mock supabase; assert each `create*` forwards `client_request_id`; assert the conflict/`23505` path returns the existing row rather than throwing.
- **Regression guard**: extend the [[../MEMORY|query-client]] test — the network-retry test already asserts writes don't auto-retry; add a note that keys are the manual-retry defense so the two mechanisms aren't confused later.

## Rollout / sequencing

1. One migration adds columns + `create index concurrently` (partial unique) for the five direct-insert tables and `chat_messages`. **`concurrently` cannot run inside a txn block** — verify the CI runner applies it outside a transaction, or split into its own statement. Number = next free migration; per [[../MEMORY|migration-preflight-checks]] **verify the remote's highest applied number against `origin/staging` before assigning** (local checkout can lag; 0070 is reserved for the goal-attainment rollup).
2. Second logical unit (same or follow-up migration): the `send_chat_message` 7-param rewrite + re-grant, and the direct-insert helper RPCs (if the RPC option is chosen).
3. Client wiring last, behind the schema — old clients sending null keys keep working, so DB can land first without a lockstep app release.
4. PR against `staging` per `mobile/AGENTS.md` and [[../MEMORY|pr-base-branch-gotcha]] (`--base staging`).

## Open questions (owner decision)

- **RPC vs catch-23505** for direct inserts. RPC is atomic, race-safe, single round-trip, returns the row cleanly — but adds five (or one generic) `security invoker` functions to maintain. Catch-23505 is a smaller diff but two round-trips on conflict. **Recommendation: RPC helper**, for race-safety and a single return path.
- **Key scope**: `(organization_id, created_by, ...)` assumes one logical submit never legitimately repeats within a user+org. True for all six paths today. Confirm no batch/import path needs to reuse a key across rows.
- **`crypto.randomUUID()` availability** on the pinned Hermes/RN 0.85 runtime — confirm on device before committing to it vs `expo-crypto`.

## References

- PR #197 — removed global write-retry (the automatic trigger). This spec covers the residual manual-retry vector.
- `mobile/src/lib/query-client.ts`, `query-retry.ts` — retry policy (queries only).
- [[permission-model]], [[architecture]] — RLS + thick-DB constraints any new RPC must honor.
