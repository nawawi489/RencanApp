# Rencana TDD Fase 8 — Governance & Admin Lengkap

**Proyek:** Rencanapp  
**Fase:** 8 — Governance & Admin Lengkap  
**Tanggal:** 2026-06-25  
**Status:** Siap Eksekusi  

---

## Ringkasan Fitur

Fase 8 menambahkan 10 area fitur utama ke Rencanapp:

1. **Org Structure CRUD** — departments, positions, teams, team_members via RLS org-scoped
2. **Deadline Change Request (DCR) workflow** — create → review → approve/reject, anti-self-approval, append-only logs
3. **Cancellation workflow** — child-check, CEO auto-approve vs pending approval
4. **Evaluation** — post-Initiative done, opsional, anti-self, UPSERT-able
5. **Archive + Search** — soft-delete ke 'archived', search RLS-scoped
6. **Confidential Access Rules** — two-layer RLS, CEO set rule
7. **Activity Log & Governance Violation pages** — read-only, append-only
8. **Settings subsections baru** — Card Completion Rule, Keterangan Card, Status/Prioritas, Notifications Rule via upsert_settings whitelist
9. **Video Brief + Brief Understanding** — DDL wajib, UI opsional
10. **Migration 0014** — 11 tabel baru, ALTER TABLE 7 tabel card untuk status='cancelled', seed 6 permission keys baru

---

## File Test yang Ditulis

| File | Layer | Kasus |
|------|-------|-------|
| `mobile/src/lib/__tests__/org-structure.test.ts` | Data Layer | [1]–[35] (35 kasus) |
| `mobile/src/hooks/__tests__/use-governance-admin.test.tsx` | Hooks | [F8-H1]–[F8-H38] (38 kasus) |
| `mobile/src/app/(app)/__tests__/fase8-screens.test.tsx` | UI/Screens | [F8-UI-01]–[F8-UI-28] (28 kasus) |

**Total: 101 kasus test merah**

---

## File Implementasi yang Dibuat/Dimodifikasi

### Data Layer (baru)
- `mobile/src/lib/org-structure.ts`
- `mobile/src/lib/governance-admin.ts`
- `mobile/src/lib/confidential-access.ts`
- `mobile/src/lib/activity-governance.ts`
- `mobile/src/lib/video-briefs.ts`

### Hooks (baru)
- `mobile/src/hooks/use-org-structure.ts`
- `mobile/src/hooks/use-governance-admin.ts`
- `mobile/src/hooks/use-activity-governance.ts`
- `mobile/src/hooks/use-confidential-access.ts`
- `mobile/src/hooks/use-search.ts`
- `mobile/src/hooks/use-video-briefs.ts`

### Hooks (dimodifikasi)
- `mobile/src/hooks/use-profile.ts` — verifikasi ROLE_DEFAULTS tidak bocor Fase 8 keys

### Screens (dimodifikasi)
- `mobile/src/app/(app)/settings.tsx` — tambah 9 entri SECTIONS baru

### Screens (baru)
- `mobile/src/app/(app)/settings-org-structure.tsx`
- `mobile/src/app/(app)/settings-activity-log.tsx`
- `mobile/src/app/(app)/settings-governance-violation.tsx`
- `mobile/src/app/(app)/settings-archive.tsx`
- `mobile/src/app/(app)/settings-confidential-access.tsx`
- `mobile/src/app/(app)/settings-card-completion-rule.tsx`
- `mobile/src/app/(app)/settings-card-guidance.tsx`
- `mobile/src/app/(app)/settings-status-priority.tsx`
- `mobile/src/app/(app)/settings-notifications-rule.tsx`
- `mobile/src/app/(app)/deadline-change-request.tsx`
- `mobile/src/app/(app)/cancellation.tsx`
- `mobile/src/app/(app)/evaluation.tsx`
- `mobile/src/app/(app)/search.tsx`

---

## Urutan Langkah Red → Green → Refactor

### Fase RED (Langkah 1–3) — Tulis semua test dulu

**Langkah 1 — RED** `mobile/src/lib/__tests__/org-structure.test.ts`  
Tulis 35 kasus test data layer. Semua import akan fail (file lib belum ada).  
Test yang ditulis: [1]–[35]

**Langkah 2 — RED** `mobile/src/hooks/__tests__/use-governance-admin.test.tsx`  
Tulis 38 kasus test hooks. Semua import akan fail (hook belum ada).  
Test yang ditulis: [F8-H1]–[F8-H38]

**Langkah 3 — RED** `mobile/src/app/(app)/__tests__/fase8-screens.test.tsx`  
Tulis 28 kasus test UI. Semua import akan fail (screen belum ada).  
Test yang ditulis: [F8-UI-01]–[F8-UI-28]

### Fase GREEN (Langkah 4–27) — Implementasi minimal agar test hijau

**Langkah 4 — GREEN** `org-structure.ts`  
Fungsi: listDepartments, listPositions(opts?), listTeams(opts?), listTeamMembers(teamId), createDepartment, createTeam, assignTeamMember  
Menutup: [5]–[14]

**Langkah 5 — GREEN** `governance-admin.ts`  
Label maps: DCR_STATUS_LABEL, CANCELLATION_APPROVAL_STATUS_LABEL, EVALUATION_TARGET_LABEL  
Fungsi: createDeadlineChangeRequest, listDeadlineChangeRequests, reviewDeadlineChange, cancelCard, approveCancellation, recordEvaluation, archiveCard, searchCards, upsertSettings  
Menutup: [1]–[3], [15]–[33]

**Langkah 6 — GREEN** `confidential-access.ts`  
Fungsi: listConfidentialAccessRules, grantConfidentialAccess  
Menutup: [25]–[26]

**Langkah 7 — GREEN** `activity-governance.ts`  
Label map: GOVERNANCE_VIOLATION_SEVERITY_TONE  
Fungsi: listActivityLog(opts?), listGovernanceViolations(opts?)  
Menutup: [4], [27]–[30]

**Langkah 8 — GREEN** `video-briefs.ts`  
Fungsi: listVideoBriefs, getVideoBrief, markBriefUnderstood  
Menutup: [34]–[35]

**Langkah 9 — GREEN** `use-org-structure.ts`  
Hooks: useOrgStructure (queryKey ['org_structure','departments']), useTeamMembers (enabled:!!teamId), useOrgActions (mutations + isPending)  
Menutup: [F8-H1]–[F8-H7], [F8-H35]

**Langkah 10 — GREEN** `use-governance-admin.ts`  
Hooks: useDeadlineChangeRequests (enabled:!!entityId), useDeadlineChangeActions (createRequest, reviewRequest, isPending), useCancellationActions (cancel, approveCancellation), useEvaluation (enabled:!!initiativeId), useEvaluationActions (record), useArchiveActions (archive)  
Menutup: [F8-H8]–[F8-H19], [F8-H33], [F8-H34], [F8-H36]

**Langkah 11 — GREEN** Tambahkan `getEvaluation(initiativeId)` ke `governance-admin.ts`, tambahkan `getVideoBrief(initiativeId)` ke `video-briefs.ts`  
Menutup: [F8-H16], [F8-H37]

**Langkah 12 — GREEN** `use-activity-governance.ts`  
Hooks: useActivityLog (queryKey ['activity_log','page',page], read-only), useGovernanceViolations (queryKey ['governance_violations'])  
Menutup: [F8-H20]–[F8-H24]

**Langkah 13 — GREEN** `use-confidential-access.ts`  
Hooks: useConfidentialAccessRules (fail-deny: rules=[] saat loading), useConfidentialAccessActions (grant mutation)  
Menutup: [F8-H25]–[F8-H27]

**Langkah 14 — GREEN** `use-search.ts`  
Hook: useSearchCards (enabled:!!query.trim(), queryKey ['cards_search',...])  
Menutup: [F8-H28]–[F8-H29]

**Langkah 15 — GREEN** `use-video-briefs.ts`  
Hook: useVideoBrief (enabled:!!initiativeId, queryKey ['video_briefs',initiativeId])  
Menutup: [F8-H37]–[F8-H38]

**Langkah 16 — GREEN** Verifikasi `use-profile.ts` + test [F8-H30]–[F8-H32]  
ROLE_DEFAULTS tidak boleh mengandung Fase 8 keys untuk c_level. CEO bypass sudah handle semua.  
Menutup: [F8-H30]–[F8-H32]

**Langkah 17 — GREEN** Update `settings.tsx` SECTIONS array  
Tambah 9 entri baru dengan href dan permission. Render Pressable per entri dengan accessibilityRole='button'.  
Menutup: [F8-UI-01]–[F8-UI-02]

**Langkah 18 — GREEN** `settings-org-structure.tsx`  
Permission gate, SkeletonList loading, daftar departemen, tombol Tambah Departemen.  
Menutup: [F8-UI-03]–[F8-UI-05]

**Langkah 19 — GREEN** `settings-activity-log.tsx`  
Permission gate, daftar log read-only, actor_name null → 'Sistem', tidak ada tombol edit/hapus.  
Menutup: [F8-UI-06]–[F8-UI-08]

**Langkah 20 — GREEN** `settings-governance-violation.tsx`  
Permission gate (key singular: view_governance_violation), severity Badge 4-tier dengan teks label.  
Menutup: [F8-UI-09]–[F8-UI-10]

**Langkah 21 — GREEN** `deadline-change-request.tsx`  
Form DCR dengan validasi (new>old, reason required), daftar riwayat dengan status label, approver view dengan anti-self UI gate.  
Menutup: [F8-UI-11]–[F8-UI-14]

**Langkah 22 — GREEN** `cancellation.tsx`  
Form reason, error child aktif, feedback CEO vs non-CEO.  
Menutup: [F8-UI-15]–[F8-UI-16]

**Langkah 23 — GREEN** `evaluation.tsx`  
Guard status 'done', anti-self pre-flight, UPSERT pre-fill.  
Menutup: [F8-UI-17]–[F8-UI-19]

**Langkah 24 — GREEN** `search.tsx`  
Search input, EmptyState saat query kosong, hasil dengan label entity_type.  
Menutup: [F8-UI-20]

**Langkah 25 — GREEN** `settings-confidential-access.tsx`  
Permission gate, daftar rules dengan user_name/entity_type/access_level.  
Menutup: [F8-UI-21]–[F8-UI-22]

**Langkah 26 — GREEN** `settings-card-completion-rule.tsx`  
Permission gate, form min_comments + require_evidence, submit via upsertSettings.  
Menutup: [F8-UI-23]–[F8-UI-24]

**Langkah 27 — GREEN** `settings-status-priority.tsx`, `settings-notifications-rule.tsx`, `settings-archive.tsx`, `settings-card-guidance.tsx`  
Masing-masing permission gate + form/list + upsertSettings integration.  
Menutup: [F8-UI-25]–[F8-UI-28]

### Fase REFACTOR (Langkah 28–31) — Setelah semua test hijau

**Langkah 28 — REFACTOR** Ekstrak test helpers data layer ke `__tests__/test-helpers.ts`  
**Langkah 29 — REFACTOR** Ekstrak makeWrapper ke `hooks/__tests__/test-helpers.tsx`  
**Langkah 30 — REFACTOR** Type-safe SECTIONS array di settings.tsx  
**Langkah 31 — REFACTOR** Komponen AccessDenied reusable di `components/ui/AccessDenied.tsx`  

---

## Strategi Mocking Per Layer

### Layer Data (`mobile/src/lib/__tests__/*.test.ts`)
```typescript
const mockFrom = jest.fn();
const mockRpc  = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...a) => mockGetUser(...a) },
    from:  (...a) => mockFrom(...a),
    rpc:   (...a) => mockRpc(...a),
  },
}));
```
- `makeQueryThenable({data, error})`: builder chainable dengan select/eq/order/limit/is/in + `.then()`.
- `makeSingleBuilder({data, error})`: builder dengan `.single()` / `.maybeSingle()`.
- Multi-tabel: `mockFrom.mockImplementation((table) => ...)`.
- RPC: `mockRpc.mockResolvedValue({data, error})` atau `mockResolvedValue({data:null, error:{message}})`.

### Layer Hooks (`mobile/src/hooks/__tests__/*.test.tsx`)
```typescript
jest.mock('@/lib/org-structure', () => ({
  listDepartments: (...a) => mockListDepartments(...a),
  // … semua exports
}));
// eslint-disable-next-line import/first
import { useOrgStructure } from '../use-org-structure';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}
```
- `jest.mock('@/lib/...')` SEBELUM `import` hook.
- `jest.spyOn(qc, 'invalidateQueries')` untuk verifikasi invalidasi cache.

### Layer UI (`mobile/src/app/(app)/__tests__/*.test.tsx`)
```typescript
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: mockCan }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.setTimeout(30000);
```
- Mock semua hooks Fase 8 via `jest.mock('@/hooks/...')`.
- `wrapper()` factory dengan fresh `QueryClient` per describe block.

---

## Risiko

1. **makeQueryThenable** perlu 'upsert' dan 'maybeSingle' di loop builder untuk mendukung getEvaluation.
2. **Ambiguitas file test**: 35 kasus data layer di satu file — pertimbangkan pisah 4 file (org-structure, governance-admin, confidential-access, activity-governance).
3. **markBriefUnderstood**: RPC vs from().upsert() — tentukan sebelum implementasi agar mock konsisten.
4. **getEvaluation** tidak ada di daftar test eksplisit namun dibutuhkan oleh useEvaluation hook.
5. **ROLE_DEFAULTS** — harus ditulis test [F8-H31] sebelum menyentuh use-profile.ts.
6. **QueryClient isolation** — makeWrapper() harus buat instance baru per test (bukan shared).
7. **expo-router useLocalSearchParams** — mock harus menyertakan params sesuai kebutuhan tiap screen test.
8. **database.types.ts** — 11 tabel baru belum ada sampai migration 0014 dijalankan; perlu type casting manual sementara.
9. **useActivityLog read-only** — pastikan hook tidak mengekspos mutation property apapun.
10. **searchCards return type** — definisikan type SearchResult = {id, entity_type, name, status} untuk type safety.
