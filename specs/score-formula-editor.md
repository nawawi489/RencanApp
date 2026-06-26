# Spec — UI-S-SF1 Score Formula Editor Inline

Status: FINAL (siap di-handoff ke `/tdd-plan`)
Versi: 1.0 (2026-06-26)
Owner: Fase 7 — People & Score
Gap referensi: [[ui-prototype-gap]] §4.10 (UI-S-SF1)

---

## 1. Problem, Goals, Non-Goals

### 1.1 Problem
`mobile/src/app/(app)/settings-score-formula.tsx` saat ini **read-only**: admin dengan gate `manage_score_formula` tidak punya cara legal untuk membuat draft baru atau mengubah bobot per kategori dari UI. Satu-satunya jalur mutasi adalah SQL langsung atau memanggil `upsert_score_formula_version` manual. Ini adalah regresi UI yang dicatat sebagai **UI-S-SF1** di `wiki/concepts/ui-prototype-gap.md` §4.10. Konsekuensi: ketergantungan DBA untuk tuning bobot, gate permission tanpa affordance, dan risiko jalur SQL ad-hoc yang melewati `activity_log`.

### 1.2 Goals (V1)
- **G1 — Create Draft**: admin membuat versi `draft` baru per template (4 level enum) via tombol "Buat Draft Baru".
- **G2 — Edit Weights Inline**: TextInput numeric integer per kategori dengan live `WeightTotalBadge` (sum=100% feedback).
- **G3 — Activate Draft**: aktifkan draft valid via RPC `activate_score_formula_version` (signature **beku**, server tetap sebagai gate K2 SUM=100).
- **G4 — Defense in depth**: 2 RPC baru di migrasi `0020` (`create_score_formula_draft`, `update_score_formula_version_weights`), `SECURITY DEFINER`, self-gate, audit, trigger immutability kolom, BEFORE DELETE guard.
- **G5 — Token-first UI**: 5 token didaftarkan di `DESIGN.md §7` sebelum kode RN.
- **G6 — Backward compat**: read-only path non-admin, `upsert_score_formula_version`, dan event `score_formula_changed` tetap utuh.

### 1.3 Non-Goals
Lihat field `non_goals` (NG1–NG15). Highlight: tidak ada create template baru, tidak ada add/remove kategori, decimal weight ditolak V1, no date picker, no retroaktif, no optimistic locking, no compound save+activate RPC, no UI discard draft, no Custom chip.

### 1.4 Invarian yang dijaga
- Thick-DB/thin-client (`wiki/concepts/architecture.md`): semua mutasi via RPC.
- AC-7.5 / K5 append-only: versi `active`/`archived` immutable; draft **diizinkan UPDATE in-place** (keputusan binding owner — lihat §6).
- K2 SUM=100 hanya di `activate` (0013:415-421).
- D13 transparansi SELECT org-wide.
- D10 governance violations: V1 menerima keterbatasan rollback semantics (0013:684-686) — silent permission_denied di V1 (Fase 8 defer autonomous tx).

---

## 2. User Stories

### US-SF1-1 — Create draft (admin)
**Sebagai** admin `manage_score_formula`, **saya ingin** membuat versi draft baru untuk template level X dengan alasan perubahan, **agar** bisa menyiapkan formula baru tanpa mengganggu yang aktif.

### US-SF1-2 — Edit weights inline (admin)
**Sebagai** admin pada draft, **saya ingin** mengubah bobot per kategori dengan feedback total 100% live, **agar** tahu kapan draft siap diaktifkan.

### US-SF1-3 — Activate draft (admin)
**Sebagai** admin dengan draft valid (sum=100, tidak dirty), **saya ingin** mengaktifkan dengan alasan, **agar** scoring berikutnya pakai formula baru.

### US-SF1-4 — Read-only viewer (anggota org)
**Sebagai** anggota org tanpa gate, **saya ingin** melihat formula aktif/historis, **agar** paham bagaimana score saya dihitung (D13).

### US-SF1-5 — Audit trail (CEO/auditor)
**Sebagai** auditor, **saya ingin** setiap create/save/activate tercatat di `activity_log` dengan action key distinct, **agar** trace perubahan formula auditable.

---

## 3. Functional Requirements

### A. Permission & Access
- **FR-SF1-A-1**: Layar dapat dibuka semua anggota org (D13). Editor (input, tombol mutasi) hanya jika `has_permission('manage_score_formula')=true`.
- **FR-SF1-A-2**: Semua RPC mutasi self-gate `has_permission`. Pelanggaran raise `permission_denied` (SQLSTATE 42501). V1 TIDAK menjanjikan baris `governance_violations` (rollback realita 0013:684-686).
- **FR-SF1-A-3**: Tidak ada anti-self-approval; satu admin boleh create+save+activate.

### B. Role Chip Selector
- **FR-SF1-B-1**: Render 4 chip: Staff, Management, C-Level, CEO. Chip "Custom" **tidak dirender**.
- **FR-SF1-B-2**: Chip aktif memuat versi template level tsb (1 template per level per org).
- **FR-SF1-B-3**: Default chip = Staff.

### C. List Versi
- **FR-SF1-C-1**: List versi per template diurut `version_number DESC` dengan kolom `version_number`, `status`, `effective_date`, `created_by`, `change_reason`.
- **FR-SF1-C-2**: Versi `active`/`archived` read-only (input disabled, tombol mutasi hidden).
- **FR-SF1-C-3**: Versi `draft` editable (input enabled, tombol Simpan Draft + Aktifkan Template visible).

### D. Create Draft
- **FR-SF1-D-1**: Tombol "Buat Draft Baru" memanggil `create_score_formula_draft(p_template_id, p_change_reason, p_categories DEFAULT NULL)`. **Hybrid**: UI default kirim `p_categories=NULL` → server auto-clone categories dari versi terbaru (`MAX(version_number)`, status apapun) milik template. Jika template kosong total → server insert `categories=[]`, UI tampilkan empty-state "Hubungi DBA, kategori belum ter-seed".
- **FR-SF1-D-2**: `p_change_reason` wajib, **min 8 karakter setelah trim**, server enforce raise `change_reason_required`.
- **FR-SF1-D-3**: Versi baru = INSERT row, `version_number = MAX+1`, `status='draft'`, `created_by=auth.uid()`. **Tidak** menyentuh versi lain (AC-7.5).
- **FR-SF1-D-4**: **1 draft per template enforce**. Jika sudah ada `status='draft'` untuk template, RPC raise `draft_already_exists` dengan payload `version_id` existing. UI tampilkan modal "Buka Draft Existing".

### E. Edit Weights Inline
- **FR-SF1-E-1**: TextInput numeric (`keyboardType="numeric"`, regex `^\d{1,3}$`) per kategori. Label kategori + source_metric badge.
- **FR-SF1-E-2**: `WeightTotalBadge` di-recompute setiap onChangeText (debounce 120ms). `tone=positive` jika sum===100; `tone=warning` otherwise. Tombol "Aktifkan Template" disabled jika sum≠100 ATAU dirty ATAU change_reason invalid.
- **FR-SF1-E-3**: **Integer-only V1**. Decimal ditolak UI (regex) + RPC (range check). Negatif clamp ke 0; >100 clamp ke 100 dengan inline helper "Maks 100"; empty dihitung 0 untuk total tapi state simpan null untuk display.
- **FR-SF1-E-4**: V1 **tidak** mengizinkan add/remove kategori. Struktur kategori dikunci sejak create draft (clone dari versi sumber).

### F. Simpan Draft
- **FR-SF1-F-1**: Tombol "Simpan Draft" memanggil `update_score_formula_version_weights(p_version_id, p_categories, p_change_reason)`. RPC: (1) self-gate, (2) cek `status='draft'` (raise `cannot_edit_non_draft`), (3) validasi shape (array non-empty, item `{code, weight, source_metric}`, weight integer 0–100, code unik), (4) UPDATE in-place **hanya** kolom `categories`, `change_reason`, `updated_at` (kolom kunci dijaga trigger `tg_score_formula_immutable_columns`), (5) write_activity `score_formula_weights_updated`.
- **FR-SF1-F-2**: Sum≠100 **diterima** saat save (K2 hanya di activate). Tombol Aktifkan tetap disabled di UI.
- **FR-SF1-F-3**: `change_reason` wajib min 8 char di RPC.
- **FR-SF1-F-4**: Tombol disabled jika `categories` deep-equal dengan server state (no-op).
- **FR-SF1-F-5**: Concurrency last-write-wins. Setelah save sukses, klien lain refetch via invalidate query; jika hash categories berbeda dengan state lokal pre-write, UI tampilkan banner "Bobot diperbarui pengguna lain — memuat versi terbaru".

### G. Activate
- **FR-SF1-G-1**: Tombol "Aktifkan Template" memanggil `activate_score_formula_version(p_version_id, p_effective_date)` existing (signature **beku**).
- **FR-SF1-G-2**: UI V1 hard-code `p_effective_date = current_date` (tidak render date picker).
- **FR-SF1-G-3**: Migrasi 0020 menambah guard di RPC activate (via wrapper atau ALTER FUNCTION): jika `p_effective_date < current_date` raise `retroactive_activation_forbidden`.
- **FR-SF1-G-4**: K2 server enforce SUM=100 (existing 0013:415-421); raise `score_weights_must_sum_100`.
- **FR-SF1-G-5**: Aktivasi otomatis arsipkan versi active sebelumnya (existing).
- **FR-SF1-G-6**: **No auto-save sebelum activate**. Tombol Activate disabled saat `dirty=true`; tooltip "Simpan draft dulu sebelum aktivasi". Menjamin atomicity audit trail.

### H. Audit & Governance
- **FR-SF1-H-1**: 3 action key baru: `score_formula_draft_created`, `score_formula_weights_updated`, `score_formula_activated`. Payload minimal: `template_id, level, version_number, change_reason`; untuk weights_updated tambahkan `categories_before, categories_after, sum_weights`; untuk activated tambahkan `effective_date, archived_version_id`.
- **FR-SF1-H-2**: Event legacy `score_formula_changed` (dari `upsert_score_formula_version` 0013:392) **tetap utuh** (backward compat). Activity Log viewer di-extend mengenali 4 key.
- **FR-SF1-H-3**: RLS SELECT D13 tidak berubah.
- **FR-SF1-H-4**: REVOKE direct DML pada `score_formula_versions` dipertahankan (0013:817-818).
- **FR-SF1-H-5**: Trigger baru `tg_score_formula_immutable_columns` (BEFORE UPDATE): menolak perubahan kolom `organization_id|template_id|level|version_number|created_by`, dan menolak UPDATE pada row `status IN ('active','archived')`.
- **FR-SF1-H-6**: Extend `tg_block_delete_append_only` (0013:175-193) ke `score_formula_versions` di migrasi 0020.

### I. Tokens (Pre-Code)
- **FR-SF1-I-1**: 5 token didaftarkan di `DESIGN.md §7` dengan nilai konkret sebelum file UI baru di-edit: `WeightInput` (border, padding, font-size, error tone), `RoleChipGroup` (selected tone=brand, idle tone=neutral, gap, radius), `WeightTotalBadge` (positive tone=success, warning tone=amber, padding, font), `FormulaStickyFooter` (background, shadow, safe-area padding, dual-button layout), `VersionStatusBadge` (reuse existing draft/active/archived tones).

### J. UX Feedback
- **FR-SF1-J-1**: Toast positive setelah RPC sukses; toast critical dengan pesan exception (kecuali permission_denied → "Anda tidak memiliki izin").
- **FR-SF1-J-2**: Spinner + disabled state pada tombol selama RPC pending; input dikunci saat updateWeights pending (cegah konflik state).
- **FR-SF1-J-3**: Modal "Buang perubahan?" saat pindah chip atau leave dengan dirty=true (default focus "Batal").

---

## 4. Data Contracts

### 4.1 Skema
**Tidak ada perubahan tabel.** `score_formula_versions` & `score_formula_templates` dari 0013 cukup.

### 4.2 RPC Baru (migrasi `0020_fase7_score_formula_editor.sql`)

#### `create_score_formula_draft`
```sql
CREATE FUNCTION public.create_score_formula_draft(
  p_template_id   uuid,
  p_change_reason text,
  p_categories    jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```
Validasi:
1. `has_permission('manage_score_formula')` else raise `permission_denied`.
2. `length(trim(p_change_reason)) >= 8` else raise `change_reason_required`.
3. Template milik `auth_org_id()` else raise `organization_mismatch`.
4. Tolak jika sudah ada row `status='draft'` untuk template → raise `draft_already_exists` (DETAIL berisi `version_id` existing).
5. Jika `p_categories IS NULL`: clone dari versi `MAX(version_number)` template; jika tidak ada versi → `categories := '[]'::jsonb`.
6. Jika `p_categories` diisi: validasi shape (array, item `{code text, weight int 0-100, source_metric text}`, code unik).
7. INSERT row baru status='draft', version_number=MAX+1.
8. `write_activity('score_formula_draft_created', entity_id, payload={template_id, level, version_number, change_reason})`.

#### `update_score_formula_version_weights`
```sql
CREATE FUNCTION public.update_score_formula_version_weights(
  p_version_id    uuid,
  p_categories    jsonb,
  p_change_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```
Validasi:
1. self-gate.
2. `length(trim(p_change_reason)) >= 8` else `change_reason_required`.
3. Row milik org user else `organization_mismatch`.
4. `status='draft'` else `cannot_edit_non_draft`.
5. Shape valid (per item integer 0–100, code unik, set kategori IDENTIK dengan kategori sebelumnya — V1 tidak izinkan add/remove → raise `categories_set_mismatch` jika set code berubah).
6. UPDATE in-place kolom `categories`, `change_reason`, `updated_at`.
7. `write_activity('score_formula_weights_updated', payload={version_id, change_reason, categories_before, categories_after, sum_weights})`.

#### Patch `activate_score_formula_version` (signature beku, body augmented)
- Tambah guard awal: `IF p_effective_date < current_date THEN RAISE 'retroactive_activation_forbidden'`.
- Sisanya identik (K2, archival, audit).

#### Trigger
- `tg_score_formula_immutable_columns` BEFORE UPDATE pada `score_formula_versions`.
- Extend `tg_block_delete_append_only` ke `score_formula_versions`.

#### Grants
```sql
REVOKE EXECUTE ON FUNCTION public.create_score_formula_draft(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_score_formula_draft(uuid, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_score_formula_version_weights(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_score_formula_version_weights(uuid, jsonb, text) TO authenticated;
```

### 4.3 TypeScript Wrapper (`mobile/src/lib/people-score.ts`)
```ts
export type ScoreFormulaDraftInput = {
  templateId: string;
  changeReason: string;          // min 8 char trimmed
  categories?: ScoreFormulaCategory[] | null;  // null → server auto-clone
};

export type ScoreFormulaWeightsUpdateInput = {
  versionId: string;
  categories: ScoreFormulaCategory[];
  changeReason: string;
};

export async function createScoreFormulaDraft(input: ScoreFormulaDraftInput): Promise<string> { /* rpc */ }
export async function updateScoreFormulaVersionWeights(input: ScoreFormulaWeightsUpdateInput): Promise<void> { /* rpc */ }
```

### 4.4 Hook (`mobile/src/hooks/use-people-score.ts`)
Extend `useFormulaActions()` dengan `createDraft` + `updateWeights` (React Query useMutation). Invalidate `['score-formula-versions', orgId]` on success.

### 4.5 Error Catalog
| Code | Sumber | UI |
|---|---|---|
| `permission_denied` (42501) | self-gate semua RPC | toast "Anda tidak memiliki izin" |
| `change_reason_required` | length < 8 | inline error "Min 8 karakter" |
| `organization_mismatch` | cross-org | toast destructive generic |
| `draft_already_exists` | create saat sudah ada draft | modal "Buka Draft Existing" |
| `cannot_edit_non_draft` | update status != draft | toast + refetch read-only |
| `categories_set_mismatch` | add/remove kategori V1 | toast "Struktur kategori dikunci" |
| `invalid_categories_shape` | shape/range invalid | toast + highlight field |
| `score_weights_must_sum_100` | activate sum≠100 | toast "Bobot harus 100%" |
| `version_not_draft` | activate non-draft | toast + refetch |
| `retroactive_activation_forbidden` | effective_date<today | toast (V1 tidak expose picker) |

---

## 5. Acceptance Criteria

Lihat field `acceptance_criteria` (AC-SF1-01 s/d AC-SF1-30). Setiap AC ditulis Given/When/Then dan dapat diuji via:
- **RN component test**: AC 01, 02, 04, 05, 09, 10, 11, 14, 20, 23, 29.
- **DB contract test (pgTAP / sql)**: AC 03, 06, 07, 08, 12, 13, 15, 16, 17, 18, 19, 21, 24, 25, 26, 30.
- **Integration test**: AC 22, 27, 28.

---

## 6. Keputusan Binding (Resolusi Grill) — **MENGIKAT** (override §3/§4/§5/§7)

> **Aturan tegas:** Di mana pun §3 (functional reqs), §4 (data contracts), §5 (acceptance), atau §7 (edge cases) bertentangan dengan §6, **§6 menang**. Implementor TDD wajib treat §6 sebagai source-of-truth atomik 15-poin. Setiap inkonsistensi yg ditemukan saat eksekusi → patuhi §6 + catat di log.

1. **AC-7.5 vs UPDATE-in-place draft**: UPDATE in-place pada row `status='draft'` **diizinkan**. AC-7.5 ditafsirkan berlaku pada versi `active`/`archived` (rekam historis); draft adalah scratch-pad pre-activation. Penegakan struktural via trigger `tg_score_formula_immutable_columns` yang menolak UPDATE pada status non-draft DAN menolak perubahan kolom kunci pada draft.
2. **Nama RPC**: pakai `create_score_formula_draft` + `update_score_formula_version_weights` (prefix `score_` untuk konsistensi dengan tabel & RPC existing).
3. **Sumber bobot awal saat create**: hybrid — `p_categories DEFAULT NULL` → server auto-clone dari MAX(version_number).
4. **change_reason min length**: **8 karakter** trimmed di server (sejajar override_user_score 0013:694-696). UI ikuti.
5. **Integer vs decimal weight**: integer-only V1.
6. **Save sum≠100**: diizinkan (UX save-and-continue), badge warning, Activate disabled.
7. **Pre-flight auto-save**: **dihapus**. Tombol Activate disabled saat dirty. Atomicity audit.
8. **Audit taksonomi**: 3 event baru + retain `score_formula_changed` legacy. Activity Log viewer di-extend.
9. **Chip Custom**: tidak dirender V1 (hard delete dari prototype reference).
10. **Effective date**: V1 hard-code current_date di UI + server reject retroaktif.
11. **Multi-draft per template**: 1 draft per template enforce; create kedua raise `draft_already_exists` dengan UI "Buka Draft Existing".
12. **Add/remove kategori**: V1 dikunci (`categories_set_mismatch` guard).
13. **Concurrency**: last-write-wins + banner refetch (no etag V1).
14. **governance_violations pada permission_denied**: V1 menerima keterbatasan rollback (silent). Defer autonomous tx Fase 8.
15. **Defense-in-depth DB**: trigger `tg_score_formula_immutable_columns` + extend `tg_block_delete_append_only` ke `score_formula_versions` wajib di 0020.

---

## 7. Edge Cases & Error States

### 7.1 Loading
- Skeleton saat `useScoreFormulaTemplates` / `useScoreFormulaVersions` loading.
- Tombol mutasi disabled + spinner saat mutation pending; TextInput `editable={false}` saat updateWeights pending.

### 7.2 Empty
- Org tanpa template seed → empty card "Hubungi admin / jalankan seed".
- Template tanpa versi sama sekali → CTA "Buat Draft Pertama" (server insert categories=[] + UI banner "Hubungi DBA, kategori belum ter-seed").
- Template hanya archived → CTA buat draft (server auto-clone dari archived terbaru).

### 7.3 Permission denied mid-session
- RPC error 42501 → toast "Izin tidak cukup", refetch permission state, flip ke read-only.

### 7.4 Validation
- Karakter non-digit ditolak regex; >100 clamp; negatif clamp ke 0; empty=null display tapi 0 untuk sum.
- change_reason <8 char → tombol disabled + inline error.

### 7.5 Lifecycle
- Edit versi active/archived: input read-only, footer hide. Klien bypass call → RPC raise `cannot_edit_non_draft`.
- Activate dirty → tombol disabled (no auto-save).
- Pindah chip / leave dengan dirty → modal konfirmasi (default focus Batal).

### 7.6 Concurrency
- A save dulu, B save → keduanya sukses (LWW). A menerima invalidate cache; jika hash kategori berbeda dengan state lokal pre-write → banner "Bobot diperbarui pengguna lain".
- Aktivasi paralel: versi yang sudah di-activate akan menyebabkan call kedua raise `version_not_draft`.

### 7.7 Audit failure
- `write_activity` di RPC sama transaksi → gagal = rollback total. UI toast "Gagal menyimpan, coba lagi".

### 7.8 Network
- React Query retry default; preserve state lokal; retry inline.

### 7.9 RPC tidak ditemukan (pre-0020 build)
- `function does not exist` → toast "Fitur belum aktif di server, update aplikasi".

---

## 8. Open Questions (V2+ Backlog)

Lihat field `open_questions` (OQ-FINAL-1 s/d 7). Semua sudah **bukan blocker** V1 — diputuskan defer.

---

## 9. Handoff ke TDD

### 9.1 Feature ringkas
Lihat `tdd_handoff.feature`.

### 9.2 File yang kemungkinan tersentuh
Lihat `tdd_handoff.paths`.

### 9.3 Urutan TDD yang disarankan (pola PR #13/#14)
1. **DESIGN.md §7 token registration** (binding pre-code, lint guard).
2. **Migrasi 0020 contract test (red)**: SECURITY DEFINER, grants, search_path, trigger immutability, BEFORE DELETE guard, retroactive guard.
3. **Migrasi 0020 implementation (green)**.
4. **RPC behavioral test (red→green)**: per error code di §4.5 + happy paths.
5. **mobile lib/people-score.ts wrapper + types (red→green)**.
6. **mobile hooks/use-people-score.ts mutations (red→green)**.
7. **RN component test settings-score-formula.tsx (red→green)**: setiap AC UI level.
8. **Activity Log viewer extension (red→green)** mengenali 4 action key.
9. **Refactor + Critic addendum** (PR pola #13/#14): cek lint token, copy toast, accessibility (touch target 44px, contrast), i18n keys.
10. **Wiki update**: `wiki/concepts/ui-prototype-gap.md` UI-S-SF1 mark resolved, `wiki/entities/score-formula.md` ditambahkan section "Editor inline (0020)", `wiki/log.md` append entry.

### 9.4 Definition of Done
- 30 AC pass.
- DB contract test 0020 hijau (pgTAP atau equivalent).
- RN test 100% AC UI-level.
- Lint DESIGN.md token guard hijau.
- Activity Log viewer menampilkan 4 action key di test integrasi.
- `wiki/concepts/ui-prototype-gap.md` UI-S-SF1 status: DONE.
- `wiki/log.md` entry baru: `## [YYYY-MM-DD] update | UI-S-SF1 Score Formula Editor Inline shipped`.
