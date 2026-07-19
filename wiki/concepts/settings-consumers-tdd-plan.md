---
type: concept
tags: [tdd, sdd, settings, card-completion-rule, card-guidance, activation, red-green-refactor]
updated: 2026-07-19
sources: 3
---

# Settings-consumers — TDD Plan (red → green → refactor)

Rencana test-first untuk mengeksekusi [[settings-consumers-spec]]. Owner decisions D-1..D-8 di [[settings-consumers-owner-decisions]] adalah eksekusi authority (D-8 = amandemen defer governance_violations emit, ditemukan di Map phase).

Waves: **1. DB contract SQL red** → **2. Migration 0078 green** → **3. Client unit red** → **4. Client implementation green** → **5. Refactor + integration**. Setelah semua hijau, PR.

Sudah lewat 1 kritik audit — 5 temuan (coverage + mock + sequencing) diadjudikasi di §11.

---

## 0. Preflight (developer sebelum wave 1)

Wajib clean semua sebelum tulis test pertama. Kalau sebagian gagal, STOP + laporkan owner.

- [ ] `git status` bersih atau di-stash.
- [ ] **Rebase worktree ke origin/staging tip (0077)** — worktree lokal jauh tertinggal (duplikat 0058/0059/0061 lokal). Setelah rebase, slot target = `0078`.
- [ ] Verify: `git ls-tree origin/staging supabase/migrations/ | tail -5` — konfirmasi tip = 0077.
- [ ] Verify: `supabase/migrations/0077_activation_bypass_and_confidential_holes.sql` present.
- [ ] Verify: `supabase/migrations/0067_cross_org_isolation_security_definer.sql` present (6 RPC `activate_*` prasyarat).
- [ ] Verify: `supabase/migrations/0047_reseed_card_guidance_v183.sql` present (guidance seed).
- [ ] Verify existing schema: `docker exec -i supabase_db_supabase psql -U postgres -d postgres -c "\\d public.card_completion_rules"` — pastikan tabel ada + RLS enabled.
- [ ] Verify `upsert_settings` di 0014: `grep -n "upsert_settings" supabase/migrations/0014_fase8_governance_admin.sql | head -5` — pastikan whitelist prefix asli (7 total) match spec §1.
- [ ] Salin CEO fixture ID: `11111111-1111-1111-1111-000000000001` (org A CEO, sudah di-seed).
- [ ] `cd mobile && npm install` (kalau worktree hasil rebase — memori worktree-run-tests-preview.md junction).
- [ ] `npm run test -- --listTests | head -20` — jest bisa run.
- [ ] `cd mobile && npx tsc --noEmit` — baseline hijau sebelum touch code.

**Runbook untuk apply local migration** (memori supabase-local-vs-mcp-gotcha.md):
```
docker exec -i supabase_db_supabase psql -U postgres -d postgres \
  -f supabase/migrations/0078_settings_consumers_activation_rules.sql \
  -v ON_ERROR_STOP=1
```

**Runbook DB contract test**:
```
docker exec -i supabase_db_supabase psql -U postgres -d postgres \
  -f supabase/tests/<slug>_contract.sql \
  -v ON_ERROR_STOP=1
```

**PENTING (temuan Map)**: `supabase/tests/*.sql` **BELUM di-wire ke CI**. Wave 1 tests jalan manual — CI job wiring adalah follow-up ticket separate (§9). Jangan block PR pada CI SQL runner.

---

## 1. Wave 1 — DB contract SQL (red-first, 7 file)

Semua file di `supabase/tests/`. Naming pakai slug (bukan NNNN — karena bundled bukan bound ke satu migration). Konvensi pattern konfirm dari `0064_cross_org_isolation_groupA_followups_contract.sql`:

- Header komentar (deskripsi + pola + runner command).
- `BEGIN; DO $$ ... END $$; ROLLBACK;` per section untuk isolasi.
- RLS switch: `perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true); execute 'set local role authenticated'; ... execute 'reset role';`.
- Assert: akumulasi `fails text := ''`, IF nonempty → `RAISE EXCEPTION 'FAIL <slug>-N: %', fails;`.
- CEO fixture: `11111111-1111-1111-1111-000000000001` (auth.users + profiles + org A pre-seeded).
- Org B victim: INSERT organizations + gen_random_uuid + INSERT auth.users + INSERT profiles ON CONFLICT DO UPDATE.

### 1.1 `0078_settings_consumers_card_completion_rule_contract.sql` (AC-1, AC-2..4, AC-11 cross-org, AC-13 activity log diff, AC-16 field-name reject)

**Purpose**: unit test end-to-end untuk 6 RPC `activate_*` + writer RPC + helper.

**Sections (BEGIN/ROLLBACK per section, expected all RED before Wave 2):**

- **S1 — helper enforces admin extras** (AC-1):
  - Setup: `INSERT INTO card_completion_rules (org=A, card_type='initiative', required_fields='["reason"]')`.
  - INSERT draft initiative row org A, `reason=NULL`, semua hardcoded core terisi.
  - Switch role authenticated + CEO A JWT.
  - Try `activate_initiative(p_id)` → EXPECT: `sqlstate = 'P0001'`, `sqlerrm ILIKE '%Lengkapi data wajib%'`.
  - Assert row `initiatives.status = 'draft'` post-exception (rollback via savepoint per Section).
  - **Assert `count(governance_violations WHERE entity_id=v_id) = 0`** — D-8 defer sanity, mencegah false-positive coverage.

- **S2 — locked base tetap enforced** (AC-4):
  - Setup: `card_completion_rules (org=A, initiative, required_fields='[]')`.
  - INSERT draft initiative dgn `name=NULL`.
  - Try `activate_initiative` → EXPECT sqlstate 'P0001' (locked base `name` tetap block).

- **S3 — fallback org-NULL default** (AC-3):
  - Setup: NO row org=A, INSERT `(NULL, 'strategy', '["expected_outcome"]')`.
  - INSERT draft strategy dgn `expected_outcome=NULL`.
  - Try `activate_strategy` → EXPECT sqlstate 'P0001'.

- **S4 — cross-org isolation** (AC-11):
  - Setup: goal org B.
  - Switch role CEO A.
  - Try `activate_goal(<goal id org B>)` → EXPECT sqlstate '42501' (`current_user_org() <> v_org` guard preserved).

- **S5 — writer RPC upsert diff + activity log** (AC-13):
  - Setup: `card_completion_rules (org=A, initiative, ['reason'])` seeded.
  - Switch role CEO A (has `manage_card_completion_rule`).
  - Call `upsert_card_completion_rule('initiative', ARRAY['reason','main_risk'], 'Q3 discipline')`.
  - Assert `activity_logs` row muncul:
    - `action='card_completion_rule_updated'`
    - **`entity_type='card_completion_rule'`** (F7 critic — guard write_activity signature drift)
    - **`entity_id IS NULL`** (F7 — settings level, bukan card level)
    - `detail->>'card_type'='initiative'`
    - `detail->'before' = to_jsonb(ARRAY['reason'])`
    - `detail->'after' = to_jsonb(ARRAY['reason','main_risk'])`
    - `detail->>'reason'='Q3 discipline'`

- **S6 — writer RPC reject invalid field-name** (AC-16):
  - Switch role CEO A.
  - Call `upsert_card_completion_rule('initiative', ARRAY['garbage_field'], null)` → EXPECT sqlstate '22023', `sqlerrm ILIKE '%garbage_field tidak dikenal%'`.

- **S7 — writer RPC permission gate**:
  - INSERT staff user org A (tidak punya `manage_card_completion_rule`).
  - Switch role authenticated + Staff A JWT.
  - Call `upsert_card_completion_rule(...)` → EXPECT sqlstate '42501' (`Anda tidak berwenang mengubah...`).

- **S8 — 6 RPC coverage sample** (AC-1 tapi untuk semua 6):
  - Loop cardType di `('goal','strategy','initiative','action_plan','development_area','problem_statement')`:
    - Insert row dgn locked-base terisi, tapi salah satu configurable field kosong.
    - `card_completion_rules (org=A, cardType, [<field kosong>])`.
    - Try `activate_<cardType>` → EXPECT sqlstate 'P0001'.
  - Rasional: guard dari copy-paste error saat rewrite 6 RPC.

**Red state (Wave 1)**: sebelum migration 0078, RPC baru (`upsert_card_completion_rule`) belum ada → sqlstate `42883` (undefined_function). Sesi S1-S3 juga red karena RPC lama tak konsultasi tabel (row `card_completion_rules` diabaikan). Contract test harus FAIL keras di Wave 1 dengan pesan `FAIL settings_consumers_card_completion_rule_contract-N: <alasan>`.

**Green transition (post-Wave 2)**: apply 0078 → test hijau.

### 1.2 `0078_settings_consumers_card_guidance_contract.sql` (AC-5, AC-6, AC-16 validation)

- **S1 — org row menang** (AC-5):
  - Setup: `INSERT INTO card_guidance_contents (org=A, card_type='initiative', title='Inisiatif X', body='Custom body')`.
  - Assert seed 0047 org-NULL row `initiative` juga ada (`SELECT count()... WHERE org IS NULL AND card_type='initiative' >= 1`).
  - Switch role authenticated + CEO A.
  - `SELECT title, body FROM card_guidance_contents WHERE (org=A OR org IS NULL) AND card_type='initiative' ORDER BY org NULLS LAST LIMIT 1`.
  - Assert title='Inisiatif X', body='Custom body' (org row menang lewat RLS + client sort).

- **S2 — fallback org-NULL** (AC-6):
  - Tanpa row org=A untuk `goal`.
  - Switch role auth + CEO A.
  - SELECT sama → assert row org-NULL (seed 0047) menang.

- **S3 — writer RPC validate len title/body**:
  - Switch role CEO A (has permission).
  - Call `upsert_card_guidance('initiative', '', 'body')` → EXPECT sqlstate '22023' `%Judul wajib%`.
  - Call `upsert_card_guidance('initiative', 'x', repeat('a', 801))` → EXPECT '22023' `%maksimal 800%`.

- **S4 — writer RPC card_type whitelist**:
  - Call `upsert_card_guidance('bogus', 'x', 'x')` → EXPECT '22023' `%tidak valid%`.

- **S5 — writer RPC permission gate**:
  - Staff A → EXPECT '42501'.

- **S6 — 2 partial unique index enforce**:
  - Insert 2 row `(org=A, ct='goal')` — kedua INSERT via RPC (bukan raw). Kedua harus success dgn ON CONFLICT DO UPDATE (idempotent).
  - Raw INSERT duplikat (bypass RPC dgn service_role): EXPECT unique violation `23505`.
  - Insert 2 row `(NULL, ct='goal')` raw → EXPECT `23505` (org-NULL partial index enforce).

### 1.3 `0078_settings_consumers_legacy_cleanup_contract.sql` (AC-8, upsert_settings retain 5)

- **S1 — DELETE settings key legacy**:
  - Setup pre-migration: INSERT `settings (org=A, key='card_completion_rule_goal', value='{}')`.
  - After 0078 apply (test dijalankan post-migration): SELECT count = 0.

- **S2 — activity_logs audit trail**:
  - Setup pre-migration: seed 2 legacy keys di org A.
  - Post-migration: assert satu row `activity_logs (org=A, action='settings_legacy_purged', detail->>'keys_purged_count'='2')`.

- **S3 — upsert_settings reject prefix baru**:
  - Switch role authenticated + admin (has manage_settings).
  - Call `upsert_settings('card_completion_rule_goal', '{}')` → EXPECT `%Kunci pengaturan tidak valid%`.
  - Call `upsert_settings('card_guidance_goal', '{}')` → EXPECT sama.

- **S4 — upsert_settings 5 retain prefix masih diterima**:
  - Loop di `('status_x', 'priority_x', 'notification_rule_x', 'confidential_access_mode', 'deadline_change_max_per_card')`:
    - Switch role auth + admin.
    - Call `upsert_settings(key, '{"a":1}')` → EXPECT success (no exception).
  - Assert row `settings` row per key ada.

### 1.4 `0078_settings_consumers_seed_hygiene_contract.sql` (AC-9)

- **S1 — legacy per-org seed 0005:598 cleaned**:
  - Post-0078: `SELECT count() FROM card_completion_rules WHERE required_fields::text ~ 'reviewer_id|expected_output|definition_of_done|priority|start_date|deadline'` = 0.

- **S2 — seed org-NULL default 6 baris**:
  - Assert `SELECT count() FROM card_completion_rules WHERE organization_id IS NULL AND card_type IN ('goal','strategy','initiative','action_plan','development_area','problem_statement')` = 6.
  - Assert setiap row punya `required_fields` non-empty JSONB array.
  - Assert semua field-name valid (dalam whitelist configurable).

### 1.5 `0078_settings_consumers_activation_bypass_still_blocked_contract.sql` (AC-10)

Rerun 0077 sanity — memastikan 0078 tak drop trigger.

- **S1 — trigger `%_guard_activation_bypass` masih ada di 5 tabel**:
  - `SELECT count() FROM pg_trigger WHERE tgname LIKE '%_guard_activation_bypass' AND NOT tgisinternal` = 5.

- **S2 — direct UPDATE draft→active dari authenticated blocked**:
  - Insert draft goal org A.
  - Switch role authenticated + CEO A.
  - Try `UPDATE goals SET status='active' WHERE id=v_id` → EXPECT sqlstate '42501' (trigger 0077 raise).

### 1.6 `0078_settings_consumers_rpc_acl_contract.sql` (AC-12)

- **S1 — 9 fungsi ACL bersih**:
  - Loop `v_fn` di array 9 fungsi (6 activate + enforce_helper + 2 upsert).
  - Assert `has_function_privilege('anon', v_fn, 'EXECUTE') = false`.
  - Assert `has_function_privilege('public', v_fn, 'EXECUTE') = false`.
  - Untuk 8 fungsi (kecuali `enforce_card_completion_rule`): assert `has_function_privilege('authenticated', v_fn, 'EXECUTE') = true`.
  - Untuk `enforce_card_completion_rule`: assert `authenticated = false` (definer-only caller).
  - Full signature wajib di `has_function_privilege` (pola 0062).

### 1.7 `0078_settings_consumers_writer_permission_shared_contract.sql` (D-7)

- **S1 — upsert_card_guidance reuse `manage_card_completion_rule`**:
  - Grant staff A only `manage_card_completion_rule`.
  - Switch role auth + Staff A.
  - Call `upsert_card_guidance('initiative', 'x', 'y')` → EXPECT success (no exception).
- **S2 — tanpa permission → reject**:
  - Staff A tanpa permission.
  - Call `upsert_card_guidance(...)` → EXPECT '42501'.

**Wave 1 red gate**: 7 file, semua exit dgn `RAISE EXCEPTION 'FAIL <slug>-N: ...'`. Jalankan semua manual satu-per-satu. Baru masuk Wave 2.

---

## 2. Wave 2 — Migration 0078 (green)

File: `supabase/migrations/0078_settings_consumers_activation_rules.sql`.

**Header komentar wajib** (pola 0077): tanggal, tujuan spec, referensi spec + memory + 4 prasyarat migration.

**Body outline** (verbatim dari spec §10):
1. Preflight guard: `DO $$ IF EXISTS(SELECT (org, ct), count(*) FROM card_guidance_contents GROUP BY 1 HAVING count > 1) THEN RAISE EXCEPTION 'card_guidance_contents duplicate row'; END IF; END $$;`.
2. `CREATE UNIQUE INDEX IF NOT EXISTS` — 2 partial (§3.2 spec).
3. `ALTER TABLE ENABLE ROW LEVEL SECURITY` (idempoten) + `CREATE POLICY` (SELECT own_org OR NULL, no write) — verify + add missing.
4. Cleanup legacy per-org seed 0005:598 — `DELETE FROM card_completion_rules WHERE required_fields::text ~ '<field-name lawas>'`. (verifikasi 6 field-name via grep sebelumnya).
5. Seed default org-NULL row `card_completion_rules` — 6 baris `(NULL, ct, '[...]'::jsonb)`. Untuk sekarang, isi = replika hardcoded configurable per cardType (§3.1 spec). Idempoten via `ON CONFLICT (organization_id, card_type) DO NOTHING` — NB: karena organization_id NULL, unique constraint mesti NULLS NOT DISTINCT ATAU pakai INSERT ... WHERE NOT EXISTS(...). Yang paling aman = `WHERE NOT EXISTS` guard di INSERT.
6. Helper `enforce_card_completion_rule(text, text[], jsonb)` — §4.2 spec. **CATATAN D-8**: skip INSERT ke `governance_violations` (deferred to V2).
7. Rewrite 6 RPC `activate_*` — §4.3 spec. Hardcoded core RAISE **verbatim** dari 0067 (do NOT typo); helper call ditambah setelah locked base.
8. Writer RPC `upsert_card_completion_rule(text, text[], text)` + `upsert_card_guidance(text, text, text, text)` — §4.4 spec.
9. GRANT/REVOKE — pola `REVOKE ALL FROM PUBLIC, anon; GRANT EXECUTE TO authenticated` untuk 8 fungsi (kecuali enforce helper).
10. Legacy settings audit + DELETE — §4.7 spec. `INSERT INTO activity_logs` per org sebelum DELETE.
11. Rewrite `upsert_settings` — 5 prefix retain saja. REVOKE dari public/anon (defensive re-check).
12. Sanity `DO $$` — RAISE EXCEPTION fail-fast untuk 9 fungsi (§4.8 spec).

**Order-of-ops rationale**:
- Preflight guard SEBELUM unique index (kalau seed duplikat, indexcreate akan crash tanpa pesan berguna).
- Cleanup 0005:598 SEBELUM seed default (biar seed tak conflict).
- Helper SEBELUM rewrite RPC (RPC panggil helper).
- GRANT/REVOKE + sanity di akhir (semua fungsi harus sudah CREATE OR REPLACE).

**Green transition Wave 1 → 2**:
- Apply 0078 lokal.
- Jalankan semua 7 test dari Wave 1. Expected: all PASS. Kalau ada FAIL:
  - Kalau assert body 'Lengkapi data wajib' tapi RPC actual raise pesan lain → RPC 0078 typo di error string.
  - Kalau `governance_violations count = 1` (bukan 0) → INSERT lolos rollback? Cek D-8 amendment; kalau memang tak sengaja implement, ubah AC pola atau helper.
  - Kalau `settings_legacy_purged` count mismatch → pre-seed row salah.
  - Kalau ACL sanity gagal → GRANT/REVOKE step lupa untuk salah satu fungsi.

**Wave 2 gate**: apply 0078 → 7 SQL contract test hijau lokal + tsc/lint client masih hijau baseline. Baru masuk Wave 3.

---

## 3. Wave 3 — Client unit red (5 file test + 1 rewrite)

Semua pakai jest-expo preset, `retry: false` di local QueryClient, `jest.setTimeout(30000)`, `await render(...)` idiom (memori Map §4).

### 3.1 `mobile/src/lib/__tests__/card-rules.test.ts` — NEW (AC-3, AC-6 fallback)

Konvensi (mengikuti [mobile/src/hooks/__tests__/use-mbr.test.tsx]):
- Mock supabase minimal: `jest.mock('@/lib/supabase', () => ({ supabase: <inline builder> }))`.
  - Untuk `.from('card_completion_rules').select(...)` chain — pakai spread pattern: `{ from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: ..., or: ..., order: jest.fn().mockResolvedValue({ data: [...], error: null }) }) }) }`.
- Test cases:
  - `getCompletionRule(orgId, ct)` — org row menang atas NULL row.
  - `getCompletionRule` — NULL row menang bila org kosong.
  - `getCompletionRule` — empty `[]` bila kedua kosong.
  - `getCompletionRule` — throws saat query error (bukan silent-swallow).
  - `getGuidance(orgId, ct)` — org row menang.
  - `getGuidance` — NULL row menang.
  - `getGuidance` — fallback `glossaryFor(ct)` bila 0 row + query error handled.

**Red state**: file `mobile/src/lib/card-rules.ts` belum ada → import error, jest gagal parse. Kalau file dibuat kosong: semua test fail.

### 3.2 `mobile/src/lib/__tests__/activation-check.test.ts` — REWRITE (AC-2 popup generic, AC-4 locked base)

Existing 104 baris (Map §7): 3 describe, 11 test, semua sync. Rewrite:

- `missingRequiredFor` **jadi async** (7 test):
  - Mock: `jest.mock('@/lib/card-rules', () => ({ getCompletionRule: jest.fn() }))`.
  - `beforeEach` set default `mockedGetCompletionRule.mockResolvedValue({ requiredFields: [] })`.
  - Per test set specific `mockResolvedValueOnce({ requiredFields: ['reason'] })` untuk skenario admin extras.
  - **Additional test**: `getCompletionRule` throws → fallback ke HARDCODED_CORE only + `logger.warn` dipanggil.
    - `jest.spyOn(logger, 'warn')` — introduce pattern baru (Map §5 tak ada precedent, tapi ini pola paling minimal).
  - **Additional test**: locked base `name` tak bisa di-uncheck admin (AC-4): `mockResolvedValue({ requiredFields: [] })` + card `name=null` → expect `['Nama']` di missing.
  - **Additional test per cardType** (F1 critic): loop 6 cardType, seed card dgn cardType-specific locked base NULL (`target_value=null` untuk goal, `expected_outcome=null` untuk strategy, `impact=null` untuk problem_statement, dst.) + `mockResolvedValue({ requiredFields: [] })`. Assert missing.length ≥ 1 per cardType. Menutup silent-PASS jika HARDCODED_CORE per-tipe drift.
- `guardActivationFields` **jadi async** (3 test):
  - Signature: `guardActivationFields(cardType, card, alertImpl?): Promise<boolean>`.
  - Rewrite test: `expect(await guardActivationFields(...)).toBe(true)` + `expect(alertSpy).toHaveBeenCalledWith('Aktifkan Card', 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.')`.
  - **New test AC-2**: assert alert message **generic** (tidak menyebut nama field), bahkan saat missing.length > 1.
- `mbrBreakdownGuardMessage` — tetap sync, tak diubah.

**Red state**: existing test suite crash (Promise<boolean> tak match `.toBe(true|false)` sync). Setelah rewrite: semua fail karena impl belum async.

### 3.3 `mobile/src/components/__tests__/card-help-trigger.test.tsx` — NEW (AC-5, AC-7 no glossary flash)

Konvensi (mengikuti [mobile/src/app/(app)/__tests__/settings-mbr-screen.test.tsx]):
- Mock `getGuidance`: `jest.mock('@/lib/card-rules', () => ({ getGuidance: jest.fn() }))`.
- Mock session hook: `jest.mock('@/providers/auth-provider', () => ({ useSession: () => ({ orgId: 'org-A' }) }))`.
- Mock `Alert.alert`: `jest.spyOn(Alert, 'alert').mockImplementation(() => {})`.
- Test cases:
  - **AC-5**: `mockedGetGuidance.mockResolvedValue({ title: 'Custom', body: 'Custom body' })`. Render, `fireEvent.press`, `await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Custom', 'Custom body'))`.
  - **AC-7 no glossary flash** (F2 critic — deterministik, no timing budget):
    ```ts
    const { queryByText } = await render(<CardHelpTrigger topic="goal" />, { wrapper: wrapper() });
    // First render, sync — Alert belum dipanggil, konten UI tak boleh mengandung glossary title
    expect(queryByText(glossaryFor('goal').title)).toBeNull();
    ```
    Assertion synchronous di first render + BEFORE `waitFor` resolve query. Tidak pakai fake timers. Skeleton (aria-busy) acceptable.
  - **onError fallback**: `mockedGetGuidance.mockRejectedValue(new Error('offline'))`. Press → `await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(glossaryFor('goal').title, glossaryFor('goal').body))`.

### 3.4 `mobile/src/app/(app)/__tests__/settings-card-completion-rule-screen.test.tsx` — NEW (AC-15 dirty prompt, AC-16 client-side reject)

Salin skeleton dari `settings-mbr-screen.test.tsx`:
- Wrapper QueryClient retry:false + jest.setTimeout(30000).
- Mock permission hook: `useHasPermission → true` by default.
- Mock data-layer: `jest.mock('@/lib/card-rules', () => ({ getCompletionRule: jest.fn(), upsertCompletionRule: jest.fn() }))`.
- Test cases:
  - **Gated permission**: `useHasPermission → false` → render "tidak memiliki akses" copy.
  - **Prefill on cardType change**: default cardType='goal', assert `getCompletionRule` dipanggil dgn 'goal', checklist state = server rows.
  - **Locked section chip render**: `HARDCODED_CORE['goal']` labels ada di UI dgn `accessibilityState.disabled=true`.
  - **Submit invalidate + call RPC**: press `Simpan`, `await waitFor(() => expect(upsertCompletionRule).toHaveBeenCalledWith({ cardType: 'goal', requiredFields: [...], reason: undefined }))`.
  - **AC-15 dirty prompt**: toggle checkbox, press cardType picker ke 'strategy', **Alert.alert confirm** muncul.
  - **AC-16 client-side reject**: (kalau UI menyediakan free-text field-name, harus reject arbitrary. Kalau UI checklist saja whitelist, test tak perlu — verify via unit "kandidat field-name = whitelist only".)
  - **Task cardType tidak muncul di picker** (§5.4).

### 3.5 `mobile/src/app/(app)/__tests__/settings-card-guidance-screen.test.tsx` — NEW

Skeleton sama:
- Mock `upsertCardGuidance` + `getGuidance`.
- Test cases:
  - Gated permission (`useHasPermission('manage_card_completion_rule') → false`).
  - Prefill on cardType change.
  - Title max 120 char client-side counter.
  - Body max 800 char.
  - Submit invalidate + RPC call.
  - Dirty prompt on cardType change (AC-15).
  - Task cardType MUNCUL di picker (§34.6 whitelist termasuk task).

### 3.6 [PINDAH KE WAVE 5] `auth-provider.test.tsx` AC-14 — regression pin, bukan red-green

F4 critic: existing `queryClient.clear()` di [auth-provider.tsx:86] sudah cover AC-14 tanpa modifikasi apapun. Test dari lahir GREEN — bukan TDD red-green wave.

Pindahkan ke **Wave 5 §5.2** sebagai **regression pin** (defensive test, mencegah future refactor accidentally drop `.clear()`). Ini bukan RED-first — tak masuk wave 3 gate.

**Red state**: file 3.1–3.5 test import module client baru yang belum ada → jest fail dengan resolve error. 3.6 amend test fail bila `queryClient.clear` typo di implementasi (unlikely — tapi ini regression coverage).

**Wave 3 gate**: 5 file + 1 amend, run `npm test -- --testPathPattern='card-(rules|help-trigger)|settings-card|activation-check|auth-provider'`. Semua RED (import error, test fail). Baru masuk Wave 4.

---

## 4. Wave 4 — Client implementation (green)

Ordering penting — dependency chain: helper → hook → screen → call sites.

### 4.1 `mobile/src/lib/card-rules.ts` — NEW helper

```ts
import { supabase } from './supabase';
import { glossaryFor, type GlossaryTopic } from './glossary';
import { logger } from './logger';

export type CardTypeGated = 'goal'|'strategy'|'initiative'|'action_plan'|'development_area'|'problem_statement';
export type CardTypeGuided = CardTypeGated | 'task';

export async function getCompletionRule(orgId: string, cardType: CardTypeGated): Promise<{ requiredFields: string[] }> {
  const { data, error } = await supabase
    .from('card_completion_rules')
    .select('required_fields, organization_id')
    .eq('card_type', cardType)
    .or(`organization_id.eq.${orgId},organization_id.is.null`)
    .order('organization_id', { nullsFirst: false });
  if (error) throw error;
  const first = data?.[0];
  if (!first) return { requiredFields: [] };
  return { requiredFields: (first.required_fields as string[]) ?? [] };
}

export async function getGuidance(orgId: string, cardType: CardTypeGuided): Promise<{ title: string; body: string }> {
  try {
    const { data, error } = await supabase
      .from('card_guidance_contents')
      .select('title, body, organization_id')
      .eq('card_type', cardType)
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .order('organization_id', { nullsFirst: false });
    if (error) throw error;
    const first = data?.[0];
    if (first?.title && first?.body) return { title: first.title, body: first.body };
  } catch (err) {
    logger.warn({ event: 'card_guidance_fetch_failed', cardType, err });
  }
  return glossaryFor(cardType as GlossaryTopic);
}

export async function upsertCompletionRule(cardType: CardTypeGated, requiredFields: string[], reason?: string): Promise<void> {
  const { error } = await supabase.rpc('upsert_card_completion_rule', {
    p_card_type: cardType,
    p_required_fields: requiredFields,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function upsertCardGuidance(cardType: CardTypeGuided, title: string, body: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('upsert_card_guidance', {
    p_card_type: cardType,
    p_title: title,
    p_body: body,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}
```

### 4.2 `mobile/src/lib/activation-check.ts` — REWRITE async

- Import `getCompletionRule` + `logger`.
- Define `HARDCODED_CORE: Record<CardTypeGated, string[]>` **eksplisit per cardType** (F1 critic — jangan fall-through kosong):

  | cardType | locked base HARDCODED_CORE |
  |---|---|
  | goal | `['name','pic_id','period_start','period_end','target_value']` |
  | strategy | `['name','pic_id','period_start','period_end','target','expected_outcome']` |
  | initiative | `['name','pic_id','period_start','period_end','reason','main_risk','alternative']` |
  | action_plan | `['name','pic_id','period_start','period_end','target_result','team_id']` |
  | development_area | `['name','pic_id','period_start','period_end']` |
  | problem_statement | `['name','pic_id','period_start','period_end','impact']` |

  Ini menutup gap existing `activation-check.ts:75-78` yang fall-through kosong untuk goal/development_area/problem_statement.
- `missingRequiredFor(cardType, card, orgId?)` async: fetch extras, merge dgn HARDCODED_CORE[cardType], filter isEmpty(card[field]), map to labels.
- `guardActivationFields(cardType, card, alertImpl?, orgId?)` async: return Promise<boolean>. Alert copy generic.

### 4.3 6 call site update (async)

Files (Map §7 & spec §5.2):
- [mobile/src/app/(app)/goal/[id].tsx:35]
- [mobile/src/app/(app)/strategy/[id].tsx:211]
- [mobile/src/app/(app)/initiative/[id].tsx:55]
- [mobile/src/app/(app)/action-plan/[id].tsx:234]
- [mobile/src/app/(app)/development-area/[id].tsx:116]
- [mobile/src/app/(app)/problem-statement/[id].tsx:70]

Tiap file: `guardActivationFields` sudah dalam handler async — tambah `await`, tambah `orgId` param dari session hook.

### 4.4 `mobile/src/components/card-help-trigger.tsx` — REWRITE

Hook `useCardGuidance(topic)` dgn React Query. UX policy: skeleton pendek atau prefetch, bukan glossary fallback saat loading.

### 4.5 `settings-card-completion-rule.tsx` REWRITE

Form baru (§5.4 spec):
- Segmented picker 6 opsi (task drop).
- Section "Wajib bawaan sistem" — disabled chip list dari HARDCODED_CORE.
- Section "Wajib tambahan" — multi-select checklist configurable.
- Prefill on cardType change via `useQuery(['card-rules','completion',orgId,ct], () => getCompletionRule(orgId,ct))`.
- Dirty prompt (custom hook `useDirtyPrompt` atau inline useState + confirm).
- Submit → `useMutation(({ct, fields}) => upsertCompletionRule(ct, fields))` + invalidate.
- Delete jalur `upsertSettings` lama.

### 4.6 `settings-card-guidance.tsx` REWRITE

Sama pola:
- 7 opsi picker.
- LabeledInput title (max 120) + body (max 800, multiline).
- Prefill + dirty prompt + submit + invalidate.

### 4.7 Sign-out (verify only, no code change)

`queryClient.clear()` di [auth-provider.tsx:86] sudah cover AC-14. Tak ada perubahan. Test 3.6 amend hanya verify.

**Green transition Wave 3 → 4**: setelah tiap file, jalankan test terkait. 

- Setelah 4.1: `card-rules.test.ts` hijau.
- Setelah 4.2: `activation-check.test.ts` hijau.
- Setelah 4.4: `card-help-trigger.test.tsx` hijau.
- Setelah 4.5/4.6: 2 screen test hijau.
- Setelah 4.3: `tsc` hijau (call sites await).
- Full `npm test` — semua suites hijau (regression sanity untuk test unrelated).

**Wave 4 gate**: `npm run test:ci` + `npx tsc --noEmit` + `npm run lint` semua hijau. Baru masuk Wave 5.

---

## 5. Wave 5 — Refactor + regression + integration

Setelah semua hijau, refactor (jangan ubah behavior):

### 5.1 Refactor pass
- **Dedup**: Kalau `HARDCODED_CORE` di `activation-check.ts` overlap dgn label mapping, extract ke shared const.
- **Cache invalidation**: audit apakah `useMutation.onSuccess` di 2 writer screen invalidate query cukup. Kalau tidak — tambah `qc.invalidateQueries({ queryKey: ['card-rules'] })` di one central place.
- **DESIGN.md sync**: kalau writer UI perkenal chip "Wajib bawaan sistem" — cek DESIGN.md token disabled state.

### 5.2 Regression pin — auth-provider AC-14 (pindahan §3.6)
- `mobile/src/providers/__tests__/auth-provider.test.tsx` — tambah 1 test defensive:
  - Setup: `qc.setQueryData(['card-rules', 'completion', 'org-A', 'goal'], { requiredFields: ['reason'] })`.
  - Trigger `signOut()`.
  - Assert `qc.getQueryData(['card-rules', 'completion', 'org-A', 'goal'])` === undefined.
- Purpose: pin behavior existing `queryClient.clear()` di [auth-provider.tsx:86] — future refactor yang drop `.clear()` akan tersandung.

### 5.3 Integration test manual (owner-friendly)

**Runbook eksekusi Wave 1–4 (rekap):**
```
docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f supabase/migrations/0078_settings_consumers_activation_rules.sql

for f in supabase/tests/0078_settings_consumers_*.sql; do
  docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
# expect: 7/7 GREEN (25 PASS + 1 SKIP fresh-DB)

cd mobile && npx jest --no-coverage
# expect: 122/122 suites, 1428/1428 tests (baseline 1427 + AC-14 pin)

cd mobile && npx tsc --noEmit  # expect: 0 error
cd mobile && npx expo lint     # expect: 0 error (42 warnings pre-existing)
```

**Skenario manual (login sebagai CEO fixture / user staging):**
- Login CEO A → open settings-card-completion-rule → toggle `main_risk` untuk initiative → simpan → verify chip locked "Wajib bawaan sistem" ada + configurable checklist tampil.
- Login user org A → create initiative dgn `main_risk=NULL` → tap Aktifkan → EXPECT popup 'Aktifkan Card' + 'Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.' (generic, no field names).
- Login CEO A → open settings-card-guidance → pilih goal, set custom title+body → simpan.
- User A open goal detail → tap `?` → EXPECT custom guidance (skeleton pendek dulu, lalu server response).
- Sign-out CEO A + sign-in staff org B → open goal detail → tap `?` → EXPECT org-B guidance atau org-NULL default (BUKAN org-A cache).

### 5.4 Preview browser (opsional)
`preview_start` mobile web variant kalau mau screenshot proof (memori worktree-run-tests-preview.md — RN-Web input/click quirks di web).

---

## 6. Owner check-points (mid-flight)

Tempat di mana test red bisa expose keputusan yang harus escalate. Trimmed to 3 (F6 critic drop CP-3 non-decision dan CP-5 automated preflight):

- **CP-1 (Wave 1 S1)**: Kalau `governance_violations count` di S1 ternyata **> 0** (INSERT ada persist entah bagaimana), owner harus tahu — spec D-8 defer mungkin premature. Konsultasi sebelum melanjutkan.
- **CP-2 (Wave 2 step 5)**: Seed default org-NULL `card_completion_rules` — isi awal per cardType harus di-align dgn expectation admin. Kalau owner mau isi berbeda dari hardcoded (mis. lebih longgar untuk mendorong admin config), amend seed di step ini.
- **CP-3 (Wave 4.5 UI writer)**: Kalau daftar whitelist configurable per cardType terasa arbitrary bagi admin — konsultasi tambah tooltip per field-name. Rekomendasi: pass fase 1 tanpa tooltip, follow-up bila QA menemukan.

---

## 7. Handoff artifact untuk implementer

**Dependency graph** (F5 critic — Wave 4 bisa paralel sebagian):
```
0 (preflight) → 1.1..1.7 (parallel-safe SQL red) → 2 (migration green) → rerun 1.* PASS
                                                          ↓
3.1 → 3.2 (activation-check red) ─────────────────────────┐
                                                          ├→ 4.1 (card-rules helper)
3.3 (card-help-trigger red) ──────────────────────────────┤       ↓
3.4 (settings-cr writer red) ─────────────────────────────┼→ 4.2 (activation-check green) ─┐
3.5 (settings-guidance writer red) ───────────────────────┘       ↓                        │
                                                          4.4 / 4.5 / 4.6 (parallel)       │
                                                          4.3 (6 call site await) ←────────┘
                                                                  ↓
                                                          5 (refactor + regression + integration)
                                                                  ↓
                                                              PR draft
```
Wave 3 test files boleh disusun paralel manusia (unrelated). Wave 4.4/4.5/4.6 bergantung 4.1+4.2 saja (bukan pada 4.3), jadi bisa dieksekusi sebelum 4.3. 4.3 blocking hanya `tsc --noEmit`.

**Sequence eksekusi (checklist linier untuk implementer solo):**

```
[ ] 0. Preflight (§0)
[ ] 1.1 supabase/tests/0078_settings_consumers_card_completion_rule_contract.sql (red)
[ ] 1.2 supabase/tests/0078_settings_consumers_card_guidance_contract.sql (red)
[ ] 1.3 supabase/tests/0078_settings_consumers_legacy_cleanup_contract.sql (red)
[ ] 1.4 supabase/tests/0078_settings_consumers_seed_hygiene_contract.sql (red)
[ ] 1.5 supabase/tests/0078_settings_consumers_activation_bypass_still_blocked_contract.sql (red)
[ ] 1.6 supabase/tests/0078_settings_consumers_rpc_acl_contract.sql (red)
[ ] 1.7 supabase/tests/0078_settings_consumers_writer_permission_shared_contract.sql (red)
[ ] 2.  supabase/migrations/0078_settings_consumers_activation_rules.sql (green)
[ ] 2.  Rerun Wave 1 SQL — expect ALL PASS
[ ] 3.1 mobile/src/lib/__tests__/card-rules.test.ts (red)
[ ] 3.2 mobile/src/lib/__tests__/activation-check.test.ts (red — rewrite)
[ ] 3.3 mobile/src/components/__tests__/card-help-trigger.test.tsx (red)
[ ] 3.4 mobile/src/app/(app)/__tests__/settings-card-completion-rule-screen.test.tsx (red)
[ ] 3.5 mobile/src/app/(app)/__tests__/settings-card-guidance-screen.test.tsx (red)
[ ] 4.1 mobile/src/lib/card-rules.ts (green)
[ ] 4.2 mobile/src/lib/activation-check.ts (green rewrite)
[ ] 4.4 mobile/src/components/card-help-trigger.tsx (green rewrite)
[ ] 4.5 mobile/src/app/(app)/settings-card-completion-rule.tsx (green rewrite)
[ ] 4.6 mobile/src/app/(app)/settings-card-guidance.tsx (green rewrite)
[ ] 4.3 6 call site update (goal/strategy/initiative/action-plan/development-area/problem-statement)
[ ] 5.1 Refactor pass
[ ] 5.2 auth-provider.test.tsx regression pin (AC-14)
[ ] 5.3 Integration manual
[ ] 6.  PR draft (base=staging; format komit ikut convention repo)
```

**Baseline gates sebelum PR:**
- `cd mobile && npm run test:ci` → all green.
- `cd mobile && npx tsc --noEmit` → 0 error.
- `cd mobile && npm run lint` → 0 error.
- 7 SQL contract test → PASS manual.
- Preview browser integration path (opsional).

**PR title contoh**: `feat(governance): consumers §34.5 + §34.6 settings — pivot ke tabel dedicated + hard-block RPC (spec settings-consumers)`.

**PR base**: `staging` (bukan main — memori pr-base-branch-gotcha.md).

---

## 8. Related

- [[settings-consumers-spec]] — spec sumber (v2 + D-8 amendment).
- [[settings-consumers-owner-decisions]] — D-1..D-8.
- [[migration-preflight-checks]] — nomor + CI runner.
- [[anon-public-rpc-grant-gotcha]] — ACL reset pola.
- [[p2-db-contract-ci]] — DB contract test as CI gate (**temuan Map: BELUM wired ke CI** — tugas terpisah).
- [[worktree-run-tests-preview]] — junction node_modules + .env untuk jest/tsc.
- [[supabase-local-vs-mcp-gotcha]] — apply migration lokal via docker exec.
- [[rls-insert-returning-gotcha]] — kalau ada `.insert().select().single()` pattern di RPC baru, hindari.
- [supabase/tests/0064_cross_org_isolation_groupA_followups_contract.sql](supabase/tests/0064_cross_org_isolation_groupA_followups_contract.sql) — template konvensi SQL contract.
- [supabase/tests/0062_revoke_authenticated_internal_rpcs_contract.sql](supabase/tests/0062_revoke_authenticated_internal_rpcs_contract.sql) — template ACL sanity.
- [mobile/src/app/(app)/__tests__/settings-mbr-screen.test.tsx](mobile/src/app/(app)/__tests__/settings-mbr-screen.test.tsx) — template screen test.
- [mobile/src/hooks/__tests__/use-mbr.test.tsx](mobile/src/hooks/__tests__/use-mbr.test.tsx) — template hook + data-layer mock.

---

## 9. Follow-up tickets (di luar scope PR ini)

- **FUT-1 CI wiring untuk `supabase/tests/*.sql`** — Map §2 menemukan tests BELUM di-run otomatis. Tambah job baru di `.github/workflows/ci.yml`: postgres service container + loop `psql -v ON_ERROR_STOP=1 -f 0*_contract.sql`. Ini menjadikan claim [[p2-db-contract-ci]] real. Naming `0078_*` di plan ini sudah aman untuk glob future.
- **FUT-2 Autonomous-tx untuk governance_violations emit** (D-8 unlock) — pola `pg_background` atau `dblink`. Coordinate dgn Fase 7 backlog (yang punya masalah sama). Kalau infra hadir, `enforce_card_completion_rule` bisa emit + AC-1 di-restore.
- **FUT-3 UI writer permission-settings (#35)** — memori `ui-mockup-implementation.md` menyebut 1 screen sisa. Kalau writer permission surface baru dibuat, mungkin bisa surface `manage_card_completion_rule` di sana untuk staff dgn wewenang delegasi.
- **FUT-4 Update wiki [[p2-db-contract-ci]] + memory p2-db-contract-ci.md** — sinkron dengan realitas: tests **manual only**, N wired via FUT-1. Future agent yang baca memori tidak boleh salah asumsi "sudah CI-gated". Update setelah FUT-1 landed.

---

## 10. Adjudikasi kritik audit (post-map + post-critic)

13 temuan total → semua diintegrasikan atau di-flag sebagai check-point/follow-up.

**Map phase (5 temuan):**

| # | Sudut | Severity | Temuan | Resolusi |
|---|---|---|---|---|
| M-1 | Test infra | must-fix | DB contract tests BELUM di CI (claim spec p2-db-contract-ci meleset) | §9 FUT-1 + §0 note "manual only" untuk PR ini |
| M-2 | Spec bug | must-fix-pre-tdd | `governance_violations` INSERT dalam RAISE path rollback (single-tx) | Spec §4.2 amendment + AC-1 amendment + D-8 memory + §9 FUT-2 |
| M-3 | Test convention | must-fix | Mock data-layer wrapper (bukan supabase chain) — pola `use-mbr.test.tsx` | §3.1, §3.4, §3.5 pakai pola ini |
| M-4 | Redundancy | nice | `queryClient.clear()` di sign-out sudah cover AC-14 tanpa modifikasi | §4.7 verify only, tak edit auth-provider.tsx |
| M-5 | New pattern | nice | Logger seam `spyOn` — introduce pattern (Map §5 tak precedent) | §3.2 explicit spec |

**Critic phase (8 temuan):**

| # | Sudut | Severity | Temuan | Resolusi |
|---|---|---|---|---|
| F-1 | Coverage | must-fix | HARDCODED_CORE per cardType tak dispesifikasi — silent-PASS risk | §4.2 tabel eksplisit 6 baris + §3.2 test per cardType |
| F-2 | Flaky | must-fix | AC-7 timing test flaky dengan waitFor + fake timer | §3.3 sync assertion at first render, no timing budget |
| F-3 | Naming | must-fix | Naming SQL anomali `settings_consumers_*` vs repo `NNNN_*` | Rename semua ke `0078_settings_consumers_*` (aman untuk glob CI) |
| F-4 | TDD purity | must-fix | 3.6 auth-provider AC-14 lahir GREEN — bukan red-green | Pindah ke Wave 5.2 sebagai regression pin |
| F-5 | Efficiency | nice | Wave 4 sequencing over-serialize | §7 dependency graph + linier checklist tetap ada |
| F-6 | Check-point | nice | CP-3 (MBR async) non-decision, CP-5 (guidance dup) automated preflight | Drop 2 CP; sisa 3 genuine |
| F-7 | Coverage | nice | AC-13 S5 tak assert `entity_type` + `entity_id` schema | §1.1 S5 tambah 2 assert |
| F-8 | Doc | nice | FUT untuk correct wiki `[[p2-db-contract-ci]]` claim missing | §9 FUT-4 |

#stub: **False** — plan v2 post-critic, siap eksekusi.
