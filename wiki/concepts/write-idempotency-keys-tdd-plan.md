---
type: concept
tags: [reliability, data-integrity, mutations, tdd, supabase, rls, spec]
updated: 2026-07-25
sources: 0
---

# TDD Plan — Write Idempotency Keys (`client_request_id`)

Companion to [[write-idempotency-keys]] (spec, PROPOSED). Basis: `origin/staging @ adca441` (PR #197 merged). Ship: PR `--base staging`. Produced via `/tdd-plan` multi-agent orchestration; corrections from the critic pass are folded in below.

> [!note] Gating decision — LOCKED 2026-07-25: **Option B (RPC security-invoker helper)**
> A plain PostgREST `.insert().select().single()` on a duplicate key returns `23505`, which every `create*` re-throws to the UI — so column + unique index alone do not satisfy AC-1. The five direct-insert callers therefore change shape from `supabase.from(TABLE).insert(...)` to `supabase.rpc('create_<entity>_idempotent', {...})`. Each RPC is `security invoker` (preserves existing RLS) and does:
> ```sql
> insert into public.<table> (...cols..., organization_id, created_by, client_request_id)
> values (...)
> on conflict (organization_id, created_by, client_request_id) where client_request_id is not null
>   do update set client_request_id = excluded.client_request_id  -- no-op → RETURNING yields existing row
> returning *;
> ```
> Consequence for the plan below: step 5 rewrites [ID-1..3] + the direct-insert callers to the `rpc` shape (not `.insert()` passthrough); step 2 adds these RPCs; the DB contract tests assert their signature + `security invoker` + dedup-returns-original. (Rejected: Option A client-side catch-`23505` — smaller diff but two round-trips and separate concurrency handling.)

## 1. Feature summary

Prevent duplicate INSERTs from **manual user retry** on 6 non-idempotent write paths. Client generates one `client_request_id` (uuid v4) **per logical submit**, holds it in state, **reuses it on retry-after-error**, and **regenerates after success / new item**. Server enforces dedup via nullable `client_request_id uuid` column + a **plain partial unique index** `(organization_id, created_by, client_request_id) where client_request_id is not null` (chat: `(chat_room_id, author_id, client_request_id)`). Chat goes through `send_chat_message`, rewritten 6→7 params (`p_client_request_id uuid default null`), DROP + re-grant ACL.

| Fn | File | Topology | Lifecycle-key owner |
|---|---|---|---|
| `createGoal` | `lib/goals.ts` | direct insert | hook `useGoalActions` |
| `createInitiative` | `lib/initiatives.ts` | direct insert | hook `useInitiativeActions` |
| `createProblemStatement` | `lib/problem-statements.ts` | direct insert | hook `useProblemStatementActions` |
| `createActionPlan` | `lib/cards.ts` | direct insert | screen `action-plan/new.tsx` (inline useMutation) |
| `createTask` | `lib/cards.ts` | direct insert | screen `task/new.tsx` (inline useMutation) |
| `sendChatMessage` | `lib/inbox.ts` | SECURITY DEFINER RPC | screen `inbox/[roomId].tsx` (`handleSend`) |

Layering: **data layer = pure passthrough** (add an optional field to `New*` / `SendChatMessageOpts`); **lifecycle key = owned by the mutation's owner** (hook for the 3 hook-backed creates; screen for the 2 inline creates + chat).

## 2. Test files

- `mobile/src/lib/__tests__/cards.test.ts` — [ID-1] createActionPlan, [ID-2] createTask, [ID-3] initiative_id coexistence (passthrough insert payload).
- `mobile/src/lib/__tests__/goals.test.ts` — **non-regression** [1] strict `toEqual` (must stay green — do NOT inject key in the lib).
- `mobile/src/lib/__tests__/inbox.test.ts` — passthrough `p_client_request_id` into `supabase.rpc('send_chat_message', …)` (present when given, `undefined` when absent).
- `mobile/src/hooks/__tests__/use-workspace.test.tsx` — [IDK-H1..H5] generate + lifecycle key in the 3 action hooks + invalidation guard.
- `mobile/src/app/(app)/__tests__/write-idempotency-keys.ui.test.tsx` (NEW) — [IDK-AP1/AP2], [IDK-TA1/TA2], [IDK-CH1/CH2].
- `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx` — **regression edits** ([E0] line 166, mention line 603, line 746): the new 4th `send()` arg breaks exact `toHaveBeenCalledWith` matchers — add `expect.objectContaining({ clientRequestId })`.
- `mobile/src/hooks/__tests__/use-inbox.test.tsx` — optimistic non-regression (O1–O3) + opts forwarding.
- `supabase/tests/idempotency_*.sql` — DB contract (column, plain partial unique index, dedup-return-original, null-path, RPC 7-arg signature + ACL). **Blocking Postgres gate.**

## 3. Red → Green → Refactor sequence

DB first (schema precedes client; old clients sending null keys keep working), then client. Client red fails at the **type-check gate** (`tsc --noEmit`) — jest-expo uses babel and does not type-check — so verify each client red via `npm run type-check`, not only `npm test`.

1. **RED (DB)** — `supabase/tests/idempotency_*.sql`: assert column + plain partial unique index + RPC 7-arg signature + ACL + dedup semantics. Fails: DB objects absent.
2. **GREEN (DB)** — new migration **`0103`** (origin/staging already has 0100–0102; the earlier "highest = 0099" was a grep artifact, caught by `supabase db reset` replaying 0001→0103): `add column client_request_id uuid` (6 tables) + **plain** `create unique index … where client_request_id is not null` (NOT `CONCURRENTLY` — new nullable column matches zero rows, builds instantly inside the migration txn) + rewrite `send_chat_message` 6→7 params (DROP → create or replace → **re-grant `authenticated`, re-revoke `public,anon`**) with the dedup block + `exception when unique_violation` handler. If **Option B**, also add the direct-insert `security invoker` RPC(s). Apply locally (`docker exec supabase_db_supabase psql`); contract green.
3. **GREEN (types)** — **hand-edit** `mobile/src/lib/database.types.ts`: add `client_request_id` to the Insert types of the 6 tables + `p_client_request_id` to `send_chat_message` Args. Do NOT use Supabase MCP `generate_typescript_types` (it targets staging, which lacks the columns until merge — established precedent is manual entry, cf. `search_chat_messages`).
4. **RED (data layer)** — [ID-1][ID-2][ID-3] in `cards.test.ts` fail `type-check` (`New*` lacks the field); red passthrough in `inbox.test.ts`.
5. **GREEN (data layer)** — add `client_request_id?: string | null` to `NewActionPlan`, `NewTask`, `NewGoal`, `NewInitiative`, `NewProblemStatement` (the `{...input}` spread forwards it automatically). Add `clientRequestId?: string` to `SendChatMessageOpts` + `p_client_request_id: opts?.clientRequestId ?? undefined` in `sendChatMessage`. type-check + tests green; `goals.test.ts [1]` stays green (lib stays pure passthrough — never mint in the lib). **If Option B**, the direct-insert callers change shape to `supabase.rpc(...)` and [ID-1..3] are rewritten accordingly.
6. **RED (hooks)** — [IDK-H1..H5] in `use-workspace.test.tsx`: `create` mints a uuid `client_request_id` (H1), reuses on retry (H2), regenerates on success (H3), + invalidation guards (H4/H5). Fails: hooks still raw passthrough.
7. **GREEN (hooks)** — in `useGoalActions`/`useInitiativeActions`/`useProblemStatementActions`: `useRef<string|null>` key; mint in `mutationFn` if empty (`crypto.randomUUID()`), forward to `create*({ ...input, client_request_id })`; **reset ref in `onSuccess`** (regenerate next item), do NOT reset on error (reuse). Preserve existing `invalidateQueries`.
8. **RED (UI)** — `write-idempotency-keys.ui.test.tsx` [IDK-AP1/AP2][IDK-TA1/TA2][IDK-CH1/CH2]. Fails: screens don't mint/thread the key.
9. **GREEN (UI)** — `action-plan/new.tsx` & `task/new.tsx`: `useRef` key, mint in `mutationFn`, thread into `createActionPlan`/`createTask` payload (reset `onSuccess` is effectively dead there — both navigate away; only reuse-on-error is exercised). `inbox/[roomId].tsx` `handleSend`: per-compose key (useRef), thread through **both** the plain `send(...)` and the `runAttachmentFlow({...send})` branch, reset after success (input clears). Preserve `if (isSending) return` + optimistic path.
10. **REFACTOR** — extract `useIdempotencyKey()` (`{ key(): string; reset(): void }`, mint-once + reset) used by the 3 hooks + 2 create screens + chat; extract `newClientRequestId()` wrapping `crypto.randomUUID()` (so screen tests can still `jest.spyOn(global.crypto,'randomUUID')`). Update the `query-client` test note (key = manual-retry defense; global mutation retry stays `false`).
11. **GATE** — `npm run type-check`, `npm run lint`, `npm test` (mobile) + DB contract gate green. PR `--base staging`.

## 4. Mocking strategy (per layer)

- **Data layer** (`lib/__tests__`): `jest.mock('../supabase', …)` declared before import (`eslint-disable import/first`); `getOrgContext` double-mocked — `mockGetUser` resolves `{ data: { user: { id:'u1' } } }`; `mockFrom` routes `'profiles'` → profiles builder (`.maybeSingle()` → `{ organization_id:'org1' }`) vs the insert builder (`.insert()` records args, `.select().single()` → `{ data:{id}, error:null }`). Assert the recorded insert payload contains `client_request_id` + `organization_id` + `created_by`. Chat: mock only `supabase.rpc`; assert `p_client_request_id` present/absent.
- **Hooks** (`use-workspace.test.tsx`): `jest.mock('@/lib/goals'|initiatives|problem-statements)` with `jest.fn()` stand-ins (severs supabase/env import); `makeWrapper()` → `QueryClient` with `retry:false`; `renderHook` + `act`. `crypto.randomUUID()` runs under jest-expo without polyfill (precedent `storage.test.ts`) → assert shape via `UUID_RE`. H2/H3 read `mockCreate*.mock.calls[0][0].client_request_id` vs `[1][0]`. Invalidation: `jest.spyOn(qc,'invalidateQueries')`.
- **UI/screen** (NEW test): `jest.setTimeout(30000)`; mock `@/lib/supabase`→`{}`, `@/lib/cards` (spread + `createActionPlan`/`createTask` fns + `getActionPlan`), `@/lib/repeat`, `@/lib/org-timezone`, `expo-router`, `@/components/user-picker`. Deterministic generator: `jest.spyOn(global.crypto,'randomUUID')` with `.mockReturnValueOnce` chaining for lifecycle cases; prefer asserting the **value threaded to the mock** over global call-count where a child might also call randomUUID. `jest.spyOn(Alert,'alert')` swallows onError. Chat reuses the `[roomId].test.tsx` harness (`jest.mock('@/hooks/use-inbox')` → `useChatActions` with `mockSend`, etc.).
- **DB contract** (`supabase/tests/*.sql`, pgTAP): `has_column`/`has_index`/`has_function('public','send_chat_message', ARRAY[…7 types…])` + `has_function_privilege('authenticated', …, 'execute')=true` & `('anon'/'public')=false`. Dedup: same key → 1 row + stable id; different key → 2 rows; null key → not caught. Apply locally via `docker exec supabase_db_supabase psql` (Supabase MCP = staging, not local).

## 5. Risks (critic-reviewed)

1. **[GATE] Open question #1 unresolved** — the available red tests lock the `.insert()` passthrough topology; if Option B (RPC) is chosen, [ID-1..3] must be rewritten to `supabase.rpc` shape. Without conflict-handling, a duplicate throws `23505` to the UI → AC-1 unmet. Lock the decision before red.
2. **`send_chat_message` DROP resets ACL to PUBLIC EXECUTE** ([[audit-trigger-fk-guard-gotcha]] neighbourhood; see [[write-idempotency-keys]] refs) — MUST re-`revoke … from public, anon` + re-`grant … to authenticated` for the **new 7-arg** signature; the `has_function_privilege` contract test guards it.
3. **`database.types.ts`** — MCP regen targets staging (lacks columns until merge). Hand-edit instead.
4. **`goals.test.ts [1]` strict `toEqual`** — safe only while the lib stays pure passthrough; a refactor that mints the key in the lib breaks it. Keep key-minting in hook/screen layers only.
5. **Lifecycle correctness** — naive mint-per-tap passes AP1/TA1/CH1 but fails AP2/TA2/CH2; a single static key fails H3/CH2. `useIdempotencyKey` must reset exactly in `onSuccess`.
6. **Migration number** — verify highest vs `origin/staging` via `git ls-tree` (origin/staging already has 0100-0102 → next 0103; a `00[0-9]{2}` grep hid them, `supabase db reset` caught it). Wrong number → collision / non-contiguous gap.
7. **`crypto.randomUUID()`** — proven in jest-expo AND production (`storage.ts`); on-device is effectively confirmed. Wrap in `newClientRequestId()` for a trivial fallback path, but do NOT add `expo-crypto`/`uuid` unless a real device failure appears.
8. **Chat optimistic regression** — the new 4th `opts` arg must not reorder `send(room,body,mentions,optimistic,opts)`; onMutate/onError/onSuccess paths stay green. The exact-arg matchers in `[roomId].test.tsx` need editing (not "non-regression").
9. **Worktree hygiene** — junction `mobile/node_modules` to main + copy `.env` before `npm test`/`type-check` ([[worktree-run-tests-preview]]).
10. **Global retry stays `false`** — the key secures MANUAL retry only; do not re-enable `mutations.retry`.

## References

- [[write-idempotency-keys]] — the spec (corrected: `author_id`, plain index, next migration 0103).
- PR #197 — removed global write-retry (the automatic trigger).
