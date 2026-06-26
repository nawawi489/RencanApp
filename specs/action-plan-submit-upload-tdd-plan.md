# Rencana TDD — UI-S-AP5 (File Upload) + UI-S-AP6 (KPI Area Linkage + Delta)

> **Status:** ready-to-execute
> **Branch dasar:** `feat/fase-7-people-score` → buat branch baru `feat/ap5-ap6-evidence-kpi`
> **Spec sumber kebenaran:** `specs/action-plan-submit-upload.md` (addendum §10 binding)
> **Handoff:** `specs/action-plan-submit-upload-tdd-handoff.json`
> **Migrasi:** `0019_fase_exec_ap5_ap6` (0018 dipakai PR #13)
> **Baseline jest:** 540/540 (post-PR #13) — target ≥570 after PR ini.

---

## 1. Ringkasan fitur

Fitur ini melengkapi loop eksekusi Action Plan (Fase 1 + Fase 4) dengan dua kemampuan yang saling-paired di layar **`submit.tsx`** (PIC side, per OD-3):

1. **AP5 — File Upload Bukti**: PIC bisa attach PNG/JPEG/WEBP/HEIC (≤10MB) + PDF dari device, multi-file (cap 5 per OD-2), upload ke bucket `evidence-bukti` dengan **2-phase commit** (ER-2: create draft → upload → finalize), Storage RLS path-scoped hardened (ER-3: `auth.uid()=pic_id`).
2. **AP6 — KPI Area Linkage**: section "Nilai Hasil" sekarang link ke KPI Area (chain Initiative→Strategy→KPI Area), menampilkan **nilai lama (server-computed via VIEW)** → **nilai baru** + DeltaArrow + ImpactApprovalCard. Backward-compat Fase 1 via OD-1 fallback (hide section bila 0 kandidat, server terima `result_values=[]`).

**Out-of-scope (DEFER, OD-3):** Reviewer-side stories R1–R3 di `action-plan/[id].tsx`, `instance/[id].tsx`, dan `SubmissionCard` — PR follow-up.

---

## 2. Test files (tabel)

| # | Layer | File | Cases |
|---|-------|------|-------|
| T1 | DB contract | `supabase/tests/0019_ap5_ap6_contract.sql` | 7 blok begin/rollback (a–g) |
| T2 | Data layer | `mobile/src/lib/__tests__/cards.test.ts` (extend) | 13 cases |
| T3 | Storage helper | `mobile/src/lib/__tests__/storage.test.ts` (baru) | ~6 cases (path, MIME, validate, signed URL) |
| T4 | Hook | `mobile/src/hooks/__tests__/use-submission.test.tsx` (baru) | 13 cases |
| T5 | Component | `mobile/src/components/__tests__/ui.test.tsx` (extend ringan) | DeltaArrow tone + AttachmentRow a11y |
| T6 | UI screen | `mobile/src/app/(app)/action-plan/__tests__/submit.test.tsx` (baru/extend) | 16 cases (AP5-U1..U9 + AP6-U1..U7) |

---

## 3. Urutan red → green → refactor

### Step 1 — REFACTOR (prasyarat gate PR)
Daftarkan token desain **sebelum** menyentuh kode UI (pola PR #13).
- Files: `DESIGN.md` §7 tambah `DA-AP5-{AttachmentRow,UploadButton,ProgressPill}` & `DA-AP6-{KpiLinkageCard,DeltaArrow,ImpactApprovalCard}`.

### Step 2 — RED (DB contract)
Tulis migrasi 0019 SKELETON (stub) + tulis full `0019_ap5_ap6_contract.sql` (7 blok begin/rollback dengan switch jwt claims `set local role authenticated`). Jalankan via `psql` → semua FAIL.

### Step 3 — GREEN (DB)
Implementasi penuh `0019_fase_exec_ap5_ap6.sql`:
- `ALTER action_plan_result_values` (`kpi_area_id`, `previous_value_server`, `previous_value_client_snapshot`, `previous_value_captured_at`, `source_note`, index)
- `ALTER action_plan_submissions` (status check + UNIQUE(action_plan_id, version_number))
- `CREATE VIEW kpi_area_current_values` (`security_invoker=true`, SUM `WHERE review_status='approved'`)
- 4 RPC SECURITY DEFINER (`create_submission_draft`, `submit_action_plan` rewrite, `cleanup_orphan_upload`, `list_kpi_area_candidates_for_action_plan`)
- helper `log_governance_violation`
- Storage bucket `evidence-bukti` + 3 RLS policy (INSERT auth.uid=pic_id via path[2], SELECT can_access_action_plan OR member chat-room, DELETE conditional draft only)

Jalankan contract → GREEN.

### Step 4 — REFACTOR (types)
Regen `mobile/src/lib/database.types.ts` via `mcp__supabase__generate_typescript_types`. BLOCKING — tanpa ini, `as never` menyembunyikan error sampai runtime.

### Step 5 — RED (data layer)
Extend `mobile/src/lib/__tests__/cards.test.ts` dengan 13 case (lihat daftar di test plan). Jalankan jest → semua FAIL (import undefined).

### Step 6 — GREEN (data layer)
Implementasi `cards.ts`:
- Hapus `submitActionPlan` lama
- `EvidenceKind` union ditambah `'file' | 'photo' | 'pdf' | 'link_generic'`
- `ResultValueInput` wajib `kpi_area_id: string`
- `EVIDENCE_KIND_LABEL.link_generic = 'Link Umum'`
- fungsi: `createSubmissionDraft`, `finalizeSubmission`, `cleanupOrphanUpload`, `listKpiAreaCandidates` (`data ?? []`), `getKpiAreaCurrentValue`

Jalankan jest → GREEN.

### Step 7 — RED (storage helper)
Tulis `mobile/src/lib/__tests__/storage.test.ts`: path construction `evidence-bukti/{org}/{ap}/{draft}/{uuid}-{filename}`, MIME→kind deterministik, validasi 10MB/file & cap 5, `createSignedUrl` TTL. FAIL — file belum ada.

### Step 8 — GREEN (storage helper)
Buat `mobile/src/lib/storage.ts`: `uploadEvidenceFile`, `classifyKind`, `validateFile`, `validateBatch`, `createEvidenceSignedUrl`. → GREEN.

### Step 9 — RED (hooks)
Tulis `mobile/src/hooks/__tests__/use-submission.test.tsx` — 13 case (useKpiCandidates 3, useKpiCurrentValue 2, useSubmissionDraft 8: state machine, cleanup compensating, no-invalidate on error, cap-5, ER-1 guard, OD-1 fallback). FAIL — file hook belum ada.

### Step 10 — GREEN (hooks)
Buat `mobile/src/hooks/use-submission.ts`:
- `useKpiCandidates(actionPlanId)` — `enabled: !!actionPlanId`, key `['kpi_candidates', actionPlanId]`
- `useKpiCurrentValue(kpiAreaId)` — key `['kpi_current_value', kpiAreaId]`
- `useSubmissionDraft()` — `useReducer` state machine: `idle → drafting → uploading → finalizing → done/error`; `runSubmission` (validasi cap 5 + ER-1, createDraft, Promise.all uploads, finalize, invalidate `['action-plan', apId]`/`['submissions', apId]`/`['kpi_current_value', kpiAreaId]`); onError panggil `cleanupOrphanUpload` untuk path ter-upload, TIDAK invalidate.

→ GREEN.

### Step 11 — RED (components)
Extend `mobile/src/components/__tests__/ui.test.tsx`: DeltaArrow tone (naik=green, turun=red, 0=neutral), AttachmentRow a11y label. FAIL — komponen belum ada.

### Step 12 — GREEN (components)
Tambah ke `mobile/src/components/ui.tsx`: `AttachmentRow`, `UploadButton`, `KpiLinkageCard`, `DeltaArrow`, `ImpactApprovalCard`. Patuhi DESIGN.md §7 (min-h 44px, accessibilityRole/Label/State eksplisit, dark mode). → GREEN.

### Step 13 — RED (UI screen)
Tulis `mobile/src/app/(app)/action-plan/__tests__/submit.test.tsx` — 16 case (AP5-U1..U9 + AP6-U1..U7). FAIL — screen belum di-refactor.

### Step 14 — GREEN (UI screen)
Refactor besar `submit.tsx`:
- Integrate `useSubmissionDraft` + `useKpiCandidates` + `useKpiCurrentValue`
- Tombol `+ Lampirkan File` → `DocumentPicker.getDocumentAsync({ multiple: true, type: ['image/*', 'application/pdf'] })`
- Render `AttachmentRow` per file (a11y `Lampiran: {name}` + `Hapus lampiran {name}`)
- Hide section Nilai Hasil bila `kpiCandidates.length === 0` (OD-1)
- KPI picker (auto-select bila 1) + KpiLinkageCard + input nilai baru + DeltaArrow + ImpactApprovalCard
- Submit button: `accessibilityState={{ disabled: isPending, busy: isPending }}` **eksplisit**
- `runSubmission` orchestrate; on error banner + `Coba upload ulang`
- Mode instance: `getInstance` → `action_plan_id parent` → feed `useKpiCandidates`

→ GREEN.

### Step 15 — REFACTOR
Ekstrak konstanta (`MAX_FILES=5`, `MAX_PER_FILE_BYTES=10MB`), hapus dead code, pastikan label via map. Jalankan **full** `npm test` → ≥570 pass, no regression.

### Step 16 — REFACTOR (dokumentasi)
Update `wiki/log.md`, `wiki/concepts/ui-prototype-gap.md` (mark UI-S-AP5/AP6 done). Spawn task PR follow-up Reviewer R1–R3.

---

## 4. Strategi mocking (ringkas per layer)

### Data layer
- `jest.mock('../supabase', ...)` top-level; `mockFrom`/`mockRpc`/`mockGetUser`/`mockStorageFrom` = `let jest.fn()` diisi `beforeEach` (TDZ-safe).
- `makeQueryThenable` + `makeSingleBuilder` reuse pola eksisting.

### Storage helper
- Mock `supabase.storage.from(bucket).upload(...)` returns `{ data: { path }, error: null }`.
- `crypto.randomUUID` di-stub deterministic via `jest.spyOn`.

### Hook
- `jest.mock('@/lib/cards', ...)` semua RPC; `jest.mock('@/lib/storage', ...)` upload.
- `jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))` hardcoded.
- `makeWrapper()` mengembalikan `QueryClientProvider` + expose `qc` untuk `jest.spyOn(qc, 'invalidateQueries')`.
- `act` + `waitFor` untuk transisi state machine.

### UI screen
- `jest.mock('expo-router', ...)` (useLocalSearchParams `jest.fn()` agar override per test untuk AP6-U7 instance mode).
- `jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))`.
- `jest.spyOn(Alert, 'alert')` untuk cap-5.
- A11y state assertion: `getByText('Submit untuk Review').parent.props.accessibilityState` (eksplisit, bukan inferensi dari `disabled`).
- Urutan 2-phase: `invocationCallOrder` cek `createDraft < upload < finalize`.

### DB contract
- Pola PR #13: `begin; ... rollback;` per blok.
- Seed sebagai `postgres`, lalu `set_config('request.jwt.claims', json_build_object('sub','<uuid>','role','authenticated')::text, true); set local role authenticated;`.
- Tanpa jwt switch → `auth.uid()=NULL` → false-green. **WAJIB** di setiap blok.

---

## 5. Risiko & mitigasi

1. **Storage RLS fragile** terhadap path schema — mitigasi: contract test (c) eksplisit Reviewer-INSERT 403 + scope policy `bucket_id='evidence-bukti'`.
2. **Orphan storage objects** bila app crash mid-flow — mitigasi: `cleanup_orphan_upload` RPC; cron cleanup orphan >24h (follow-up).
3. **VIEW performance** untuk org besar — mitigasi: index partial `WHERE review_status='approved'`; pantau via `get_advisors`.
4. **TOCTOU previous_value display** stale di UI — mitigasi: refetch on window focus, server snapshot tetap autoritatif.
5. **Backward compat row lama** (`kpi_area_id` NULL) — verifikasi constraint ER-1: NOT NULL untuk row baru via CHECK conditional, bukan column NOT NULL absolut.
6. **expo-document-picker mock flake** — `beforeEach jest.clearAllMocks()` + eksplisit `mockResolvedValue` per test.
7. **Cap 5 file** WAJIB enforce server (RPC `create_submission_draft p_attachment_count<=5`); contract test (h).
8. **Reviewer file-injection** — policy storage scoped `bucket_id='evidence-bukti'` eksplisit.
9. **`invocationCallOrder`** assertion paralel — assert hanya `createDraft < uploadStart`, antar-upload paralel sah.
10. **Migrasi 0019 conflict numbering** — pastikan PR #13 sudah merge; geser ke 0020 jika perlu.
11. **Types regen wajib** — step 4 BLOCKING; tanpa ini `as never` casting menyembunyikan error.
12. **Reviewer view DEFERRED (OD-3)** — komunikasikan ke owner: data final di DB, tampilan Reviewer upgrade di PR follow-up.

---

## 6. Definition of Done

- [ ] Step 1 token DESIGN.md commit terpisah (gate PR)
- [ ] Migrasi 0019 + 7 blok contract test GREEN via `psql`
- [ ] `database.types.ts` regen committed
- [ ] `cards.ts` + `storage.ts` GREEN (19 case)
- [ ] `use-submission.ts` GREEN (13 case)
- [ ] `ui.tsx` (5 komponen baru) GREEN
- [ ] `submit.tsx` GREEN (16 case AP5+AP6)
- [ ] `npm test` ≥570 pass, no regression
- [ ] `wiki/log.md` updated; `ui-prototype-gap.md` mark done
- [ ] PR follow-up Reviewer R1–R3 spawned
- [ ] PR #13 critic checklist reviewed (`accessibilityState` eksplisit, lazy mock TDZ-safe, jwt switch di contract, OUTPUT-filtered assertion)

---

## 7. Critic addendum — koreksi MENGIKAT (verdict: perlu-perbaikan)

Fase Critic menemukan 5 bug rencana fatal + 17 inkonsistensi + 14 missing test case. Item di bawah **menimpa** §1–§6 dan **wajib** diterapkan; tanpa ini eksekusi akan tabrakan migrasi atau false-green.

### 7.1 BLOKER — Bug rencana yang harus difix sebelum migrasi

| # | Bug | Resolusi mengikat |
|---|---|---|
| **A1** | VIEW `kpi_area_current_values` pakai `rv.value_numeric` tapi migrasi tidak `ADD COLUMN value_numeric` → CREATE VIEW syntax error | Migrasi 0019 WAJIB `add column value_numeric numeric` PLUS backfill: `update action_plan_result_values set value_numeric = nullif(value_text,'')::numeric where value_type in ('number','currency','percentage') and value_text ~ '^-?[0-9]+(\\.[0-9]+)?$'`. Sebelum SET NOT NULL kpi_area_id. |
| **A2** | Migrasi `add column kpi_area_id NOT NULL` pada tabel ber-row → gagal | Strategi 3-langkah: (1) `add column kpi_area_id uuid references kpi_areas(id) on delete restrict` (NULLABLE), (2) **JANGAN backfill** (legacy submissions tetap NULL — diterima sbg legacy mode), (3) **JANGAN** `set not null` di DB. Enforce NOT NULL hanya di RPC `submit_action_plan` untuk row BARU (kecuali OD-1 fallback). REG-5 backward-compat preserved. |
| **A3** | Inkonsistensi nama bucket: `evidence` (spec §4) vs `evidence-bukti` (ER-2/plan) | **FINAL: `evidence`** (sejalan dgn spec body §4 & policy SQL). Update semua referensi di plan steps 7/8/14 dan tests. |
| **A4** | Inkonsistensi nama RPC: `cleanup_orphan_upload` (ER-2) vs `cleanup_orphan_evidence` (spec §4.3) | **FINAL: `cleanup_orphan_upload(p_path text)`** (single path per call; lebih sederhana). Update spec §4.3 mengikuti. |
| **A5** | Spec menyebut sequential upload (FR-AP5-4) tapi plan step 14 pakai `Promise.all` parallel | **FINAL: parallel** (`Promise.all`). UX dgn progress per-row OK; lebih cepat untuk 5 file. Update spec FR-AP5-4. |
| **A6** | Nomor migrasi: spec §4.1 header tulis `0018`, addendum & plan pakai `0019`. PR #13 sudah pakai 0018. | **FINAL: `0019_fase_exec_ap5_ap6.sql`**. Pre-step: `glob supabase/migrations/00*.sql | sort | tail -1` untuk pastikan 0018 terakhir. Jika ada 0019 lain (race dgn branch lain), geser ke 0020. |
| **A7** | `submission_local_id` (lama, client-generated) masih disebut di spec §4.2 vs ER-2 (DB-generated) | **HAPUS** semua referensi `submission_local_id` dari kode/types. Path memakai `submission_id` (DB-generated via `create_submission_draft`). |
| **A8** | `log_governance_violation` SECURITY DEFINER tapi tidak ada test bahwa authenticated TIDAK bisa panggil langsung | Tambah contract block (j) di step 2: `set local role authenticated` → `perform public.log_governance_violation(...)` → harus error `permission denied`. WAJIB `revoke execute from public, anon, authenticated`. |

### 7.2 MENGIKAT — Tambahan test case yang HILANG (folded ke RED step terkait)

**Contract SQL (step 2/3 → 11 blok, bukan 7):**
- (h) UNIQUE(action_plan_id, version_number) — race 23505 saat 2 finalize sequential dgn version sama → reject kedua.
- (i) Double-submit guard: submission versi sebelumnya `review_status='pending'` → reject finalize baru ("Sesi review masih berjalan").
- (j) `value_type='percentage'` di rilis 1 → reject server (A_OQ deferred to V2).
- (k) `result_values.value_type != kpi_areas.value_type` → reject server (anti-tampering).
- (l) Storage SELECT cross-org: user org-B query path org-A → 0 rows (G2 multi-org).
- (m) Storage SELECT grandfather: path `array_length < 3` (legacy Fase 1-7) → tetap accessible bagi PIC lama.
- (n) RPC `list_kpi_area_candidates_for_action_plan` chain edges: (n1) AP tanpa initiative_id → 0 kandidat, (n2) initiative tanpa strategy_id → 0 kandidat, (n3) 2 strategy ke 1 kpi_area → distinct row.

**Data layer (step 5):**
- T13 `classifyKind('image/heic')` → `'photo'` (semua image/* → photo).
- T14 `classifyKind('image/svg+xml')` → `'photo'`.
- T15 `classifyKind('application/octet-stream')` → `'file'`.
- T16 `validateFile({size: 10485760+1})` → reject `"Ukuran melebihi 10 MB"`.
- T17 `validateFile` total batch >25 MB → reject. **Putusan**: cap total 25 MB juga.
- T18 `safeFilename('foto rapat 12/3/26.png')` → no slash, no spasi → `foto_rapat_12_3_26.png`. Tambahkan helper.

**Hooks (step 9):**
- H_HM1 `useSubmissionDraft.runSubmission` saat `actionPlanId` undefined → reject tanpa panggil RPC.
- H_HM2 Double-tap runSubmission saat sedang in-flight → idempotent (call kedua return existing promise, tidak buat draft baru).
- H_HM3 Upload gagal di file ke-N (N>0): cleanup_orphan_upload dipanggil HANYA untuk path yang sudah ter-upload (bukan dgn array kosong).
- H_HM4 Invalidate `['kpi_candidates', actionPlanId]` setelah submit sukses (cache stale guard).

**UI (step 13):**
- U_UM1 Picker auto-select saat `candidates.length === 1` → tidak render dropdown, KPI langsung selected.
- U_UM2 `value_type` chip VALUE_TYPES legacy dihapus dari UI (read-only ikut KPI Area parent).
- U_UM3 `DeltaArrow` punya `accessibilityLabel` eksplisit menyebut arah (`naik 25`, `turun 12`, `tetap`) — DESIGN.md §4 aturan warna ≠ satu-satunya sinyal.
- U_UM4 State machine: user bukan PIC → form disabled + banner "Anda bukan PIC".
- U_UM5 `ProgressPill` per row: `'Siap unggah' → 'Mengunggah' → 'OK' / 'Gagal'` (FR-AP5-5 eksplisit).
- U_UM6 Retry per-row saat 1 file gagal di tengah batch → tombol Retry hanya pada row gagal.

### 7.3 MENGIKAT — Concerns engineering (mocking & realism)

- **C1 Cancellation/unmount mid-upload**: tambah `AbortController` di `useSubmissionDraft` + cleanup di `useEffect` return. Tanpa ini → `setState on unmounted` warning + orphan files. Critic concern #12.
- **C2 expo-document-picker shape v13+**: mock factory return `{ canceled: false, assets: [{uri, name, size, mimeType}] }`. JANGAN pakai shape lama `{type:'success'}`.
- **C3 RN upload**: supabase-js `.upload()` di RN butuh `{ uri, name, type }` + FormData trick atau `fetch(uri).blob()`. Wrap di `storage.ts` helper; test pakai mock yang menerima blob/FormData generik.
- **C4 `crypto.randomUUID`**: pastikan tersedia di setupFiles (Node 20+ punya `globalThis.crypto.randomUUID`). Jika jest-expo target Node lama, polyfill di `jest.setup.ts`.
- **C5 invocationCallOrder**: assert `createDraft < uploadStart[0]` saja (parallel sah antar upload). Jangan assert antar-upload.
- **C6 Storage RLS performance**: DELETE policy sub-query ke `action_plan_submissions.status` per-object. Tambah index `(id, status) where status='draft'` di action_plan_submissions.
- **C7 VIEW grant**: WAJIB `grant select on public.kpi_area_current_values to authenticated; revoke select from public, anon;` di migrasi.
- **C8 Wiki frontmatter**: ikuti convention `CLAUDE.md` (Indonesia + frontmatter `type/tags/updated/sources`). Log entry pakai `## [YYYY-MM-DD] update | ...`.

### 7.4 Konsekuensi: bagian §1–§6 yang HARUS diubah

- **§3 step 2**: pre-step `glob 00*.sql` untuk verifikasi nomor 0019.
- **§3 step 3**: ubah strategi NOT NULL → NULLABLE + RPC enforce (per A2). Tambah `add column value_numeric` + backfill (per A1).
- **§3 step 3**: rename bucket → `evidence` (per A3). Rename RPC → `cleanup_orphan_upload` (per A4).
- **§3 step 14**: parallel upload via `Promise.all` (per A5), bukan sequential.
- **§3 step 9**: tambah AbortController (per C1).
- **§2 tabel test files**: jumlah blok contract 7 → **11** (per §7.2 contract). Jumlah test data-layer 13 → **18** (per §7.2 data). Hooks 13 → **17**. UI 16 → **22**.
- **§6 DoD**: target jest ≥**570 + ~25** = ~**595** pass (perkiraan: 11 contract + 5 data + 4 hook + 6 UI baru di luar yang sudah dihitung).

### 7.5 Eksekusi: urutan revised

1. **Pre-step**: `git pull origin main` (jika perlu) + `glob supabase/migrations/00*.sql | sort` → konfirmasi 0019 belum dipakai.
2. **Pre-step**: `npm test` baseline confirm 540 atau adjust target.
3. Step 1 PRASYARAT token DESIGN.md (sama plan).
4. Step 2-3 migrasi 0019 + contract SQL — pakai §7.1 + §7.2 fixes.
5. Step 4 regen types.
6. Steps 5-15 mengikuti plan asli + folds in §7.2 tambahan case.
7. Step 16 wiki + close UI-S-AP5/AP6 di `ui-prototype-gap.md` + update `execution-loop.md` (2-phase commit + file upload) + `evidence-kinds.md` (file/photo/pdf/link_generic in UI).
