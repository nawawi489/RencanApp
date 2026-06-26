# Spec — UI-S-AP5 (File Upload Bukti) + UI-S-AP6 (KPI Area Linkage + Delta)

Status: ready-for-TDD (paired)
Backlog: `wiki/concepts/ui-prototype-gap.md` — UI-S-AP5 (P0), UI-S-AP6 (P0)
Surface utama: `mobile/src/app/(app)/action-plan/submit.tsx`
Migrasi: `supabase/migrations/0019_fase_exec_ap5_ap6.sql` (0018 dipakai untuk FR-DATA.1 Inbox preview di PR #13; nomor 0019 untuk fitur ini per addendum §10.4)
Tanggal: 2026-06-26

## 1. Problem, Goals, Non-Goals

### 1.1 Problem statement

Layar `submit.tsx` adalah satu-satunya surface tempat PIC mengirim bukti dan nilai hasil Action Plan ke Reviewer. Loop ini adalah jantung Fase 1/Fase 4. Saat ini ada dua gap P0:

- **AP5 (file upload absen)**: PIC hanya bisa kirim `text_note` atau link. Kode `EVIDENCE_KINDS` di submit.tsx tidak include `file/photo/screenshot/pdf` meski whitelist DB sudah ada di migrasi 0015. Komentar file mengakui "Upload file menyusul (skema & bucket sudah siap)". Akibatnya bukti screenshot/PDF mengandalkan layanan eksternal (Drive) — melanggar self-contained evidence dan menyulitkan audit.
- **AP6 (linkage KPI Area absen)**: Section "Nilai Hasil" generik (label + value_type + value). Tidak ada kolom `kpi_area_id` di `action_plan_result_values`; tidak ada delta nilai lama→baru; Reviewer tidak punya konteks impact saat approve. Rantai Goal → Strategy → KPI Area → Action Plan pecah di titik ini.

### 1.2 Goals

- G1: PIC bisa melampirkan file PNG/JPEG/WEBP/HEIC (≤10MB) + PDF (total ≤25MB, max 10 file) dari device, upload ke Supabase Storage bucket `evidence` SEBELUM RPC submit.
- G2: Storage RLS path-scoped DIHARDENED — INSERT cek `auth.uid()=action_plans.pic_id` (bukan sekadar `can_access_action_plan`); UPDATE/DELETE total revoke; SELECT include OR clause grandfather untuk path legacy.
- G3: Evidence locking dipertahankan: tidak ada UI edit/hapus untuk file submission yang sudah submitted. Pre-submit delete via RPC `cleanup_orphan_evidence` (SECURITY DEFINER, verify PIC + path tidak ter-reference).
- G4: Kolom baru `action_plan_result_values.kpi_area_id uuid NULL REFERENCES kpi_areas(id) ON DELETE RESTRICT` + index partial. NULL hanya valid untuk action_plan tanpa KPI Area kandidat (backward-compat Fase 1).
- G5: RPC baru `list_kpi_area_candidates_for_action_plan` (chain initiative→strategy→kpi_area, SECURITY DEFINER); RPC `submit_action_plan` VALIDASI kpi_area_id ∈ kandidat (bukan sekadar se-organisasi).
- G6: Source of truth tunggal untuk "nilai lama" = VIEW `kpi_area_current_values` dengan `security_invoker=true`, SUM hanya `review_status='approved'`. Tidak ada denormalisasi `kpi_areas.current_value`; RPC review tidak disentuh.
- G7: `previous_value_server` (server-computed dari VIEW saat INSERT, autoritatif) + `previous_value_client_snapshot` (UI saat user submit, untrusted display-only) keduanya disimpan; Reviewer-side dan delta baca `previous_value_server`.
- G8: RPC `log_governance_violation` (SECURITY DEFINER) menjadi satu-satunya path INSERT ke `governance_violations` (tabel saat ini tanpa INSERT policy untuk app role — gap audit ditutup).
- G9: Reviewer-side UI consumer (SubmissionCard update) MASUK scope rilis ini — render attachment + KpiLinkageCard + delta. Layar review terpisah TIDAK dibuat.
- G10: Token visual didaftar di `DESIGN.md §7` (DA-AP5-*, DA-AP6-*) dalam commit terpisah SEBELUM kode UI. Mengikuti pola PR #13 (Inbox).
- G11: Deploy ATOMIC — migrasi 0018 + RPC + types regen + UI baru dalam satu PR. Strategi backward-compat untuk app lama: lihat OQ-1.

### 1.3 Non-goals

Lihat field `non_goals` di structured output.

### 1.4 Catatan terhadap [[score-formula]] (must-acknowledge)

Meskipun spec ini TIDAK mengubah formula scoring, source-of-truth "current_value" KPI Area DE-FACTO berpindah ke VIEW agregasi approved result_values. Sebelumnya tidak ada perhitungan otomatis. Owner WAJIB memvalidasi konsistensi dengan ekspektasi PRD §Capaian sebelum merge.

## 2. User Stories

### 2.1 PIC (pelaksana)

- **P1**: Lampirkan file PNG/PDF dari device → sequential upload sebelum RPC → versioning + locking dipertahankan.
- **P2**: Pilih KPI Area dari picker (kandidat hasil RPC chain resolver) + isi nilai baru → kartu KPI linkage menampilkan nilai lama + delta arrow.
- **P3**: Lihat kartu "Dampak Approval" SEBELUM submit (kontradiksi awal di-resolve: di-render juga di PIC view, bukan hanya Reviewer).
- **P4**: Submit ulang setelah Reject → versi baru, file tidak auto-carry-over.
- **P5**: Hapus attachment pre-submit → client panggil `cleanup_orphan_evidence` RPC (bukan Storage DELETE langsung, karena RLS revoke).

### 2.2 Reviewer

- **R1**: Lihat attachment di SubmissionCard dengan tombol "Buka" (signed URL TTL 5 menit).
- **R2**: Lihat KpiLinkageCard dengan delta dari `previous_value_server` → new value.
- **R3**: Approve/Reject tidak menyentuh evidence/result_values (immutable). Anti-self-approval ditegakkan.

### 2.3 Manager / KPI Area Owner

- **M1**: (DATA CONTRACT ONLY) FK `kpi_area_id` memungkinkan listing nilai hasil per KPI Area di masa depan. UI listing OUT OF SCOPE rilis ini.
- **M2**: VIEW `kpi_area_current_values` otomatis reflect kontribusi baru pasca-approval (tanpa trigger).

### 2.4 CEO / Workspace Viewer

- **C1**: Audit trail bukti + KPI linkage visible via scope `can_view_workspace`. Storage RLS hardening menutup multi-org leakage.
- **C2**: Setiap governance violation (storage denied, kpi out-of-scope, pending double-submit) tercatat di `governance_violations` via RPC.

## 3. Functional Requirements

### 3.1 AP5 — File Upload

| ID | Requirement |
|---|---|
| FR-AP5-1 | Tombol "+ Lampirkan File" buka native picker (expo-document-picker untuk file generik, expo-image-picker untuk image). **Single-file per add** (multi-select out of scope rilis 1, AC-9..AC-12). |
| FR-AP5-2 | Kind auto-deduce dari MIME: `image/png|jpeg|webp|heic` → `photo`; filename mengandung "screenshot|ss" → `screenshot`; `application/pdf` → `pdf`; lainnya → `file`. User TIDAK override. |
| FR-AP5-3 | Validasi client: size ≤10MB/file, total ≤25MB/submission, count ≤10 file, MIME whitelist `image/png|jpeg|webp|heic` + `application/pdf`. |
| FR-AP5-4 | Sequential upload (await per file) ke `<org>/<action_plan_id>/<submission_local_id>/<uuid>-<safe_filename>` via `supabase.storage.from('evidence').upload(path, blob, {upsert:false})`. submission_local_id dibuat client SEKALI per submit attempt, dipakai SAMA di Storage path + RPC parameter + jadi PRIMARY KEY `action_plan_submissions.id`. |
| FR-AP5-5 | UI progress per row (Siap unggah → Mengunggah → OK → Gagal); Submit disabled selama ada uploading; retry per row. |
| FR-AP5-6 | Compensating action: RPC submit gagal → client panggil `cleanup_orphan_evidence(p_action_plan_id, p_paths[])`; activity_log entry 'submit_failed_with_cleanup'. |
| FR-AP5-7 | Evidence locking post-submit: tidak ada tombol edit/hapus untuk attachment versi tersubmit; Storage RLS revoke DELETE/UPDATE total. |
| FR-AP5-8 | Pre-submit delete (sebelum tap Submit, attachment sudah ter-upload): client panggil `cleanup_orphan_evidence` (bukan Storage DELETE). |
| FR-AP5-9 | Backward compat: kind existing (text_note, report, link_doc, link_gdrive, link_generic) tetap berfungsi. EVIDENCE_KINDS klien diperluas jadi superset. |

### 3.2 AP6 — KPI Area Linkage + Delta

| ID | Requirement |
|---|---|
| FR-AP6-1 | Kolom baru: `kpi_area_id uuid NULL REFERENCES kpi_areas(id) ON DELETE RESTRICT`, `previous_value_server numeric NULL`, `previous_value_client_snapshot text NULL`, `previous_value_captured_at timestamptz NULL`, `source_note text NULL` (max 280 char). NULL hanya valid jika kandidat=0. |
| FR-AP6-2 | RPC `list_kpi_area_candidates_for_action_plan(p_action_plan_id uuid)` SECURITY DEFINER return [{id, name, value_type, target, current_value_numeric}]. Chain: action_plan → initiative → strategy → kpi_area. Filter by `can_access_kpi_area` ATAU PIC action_plan (whichever lebih luas — explicit di body). |
| FR-AP6-3 | UI picker: jika kandidat=1 auto-select; >1 dropdown required; =0 section AP6 banner "Card belum dikaitkan ke KPI Area; nilai hasil tercatat tanpa linkage". |
| FR-AP6-4 | "Nilai lama" baca dari VIEW `kpi_area_current_values` via RPC `get_kpi_area_snapshot(p_kpi_area_id)` SECURITY DEFINER (current_value_numeric, last_approved_at). |
| FR-AP6-5 | "Nilai baru" input — value_type DIPAKSA dari KPI Area config (read-only, bukan user pilih). Validasi inline. |
| FR-AP6-6 | Delta arrow `lama → baru` + label tekstual `+25`/`-12` + warna +/- (warna BUKAN satu-satunya sinyal). |
| FR-AP6-7 | RPC submit_action_plan VALIDASI kpi_area_id ∈ kandidat (bukan se-org); out-of-scope → raise + `log_governance_violation`. |
| FR-AP6-8 | RPC submit_action_plan menyimpan `previous_value_server = SUM dari VIEW saat INSERT` (autoritatif); `previous_value_client_snapshot` apa adanya (untrusted). Reviewer-side & delta render dari `previous_value_server`. |
| FR-AP6-9 | Percentage value_type DITOLAK di rilis 1 (banner "belum didukung"); SUM untuk number/currency. |
| FR-AP6-10 | Kartu "Dampak Approval" di-render DI PIC view juga (bukan hanya Reviewer); copy didefinisikan di i18n constant. |

### 3.3 Governance lintas-AP5/AP6

| ID | Requirement |
|---|---|
| FR-GOV-1 | Anti-self-approval (constraint `action_plans_pic_ne_reviewer`) tidak diubah. RPC review_action_plan_submission tidak disentuh. |
| FR-GOV-2 | Storage RLS bucket `evidence` policy baru: `INSERT` cek `bucket_id='evidence' AND folder[1]=current_user_org()::text AND auth.uid()=(select pic_id from action_plans where id=folder[2]::uuid)`. `SELECT` cek `bucket_id='evidence' AND folder[1]=current_user_org()::text AND can_access_action_plan(folder[2]::uuid)` OR grandfather `array_length(foldername,1) < 3`. `UPDATE`/`DELETE` tidak ada policy (revoke total). |
| FR-GOV-3 | RLS table-level untuk `action_plan_result_values` tetap inherit dari submission. Penambahan kpi_area_id TIDAK melonggarkan visibility. |
| FR-GOV-4 | Audit log: setiap submit menulis activity_logs dengan detail jsonb {evidence_count, file_count, link_count, text_count, kpi_areas_touched: uuid[], submission_local_id}. |
| FR-GOV-5 | RPC `log_governance_violation(p_kind text, p_entity_type text, p_entity_id uuid, p_metadata jsonb)` SECURITY DEFINER, satu-satunya path INSERT. Trigger: storage denied, kpi out-of-scope, pending double-submit, evidence kind bypass. |
| FR-GOV-6 | RPC submit_action_plan menolak versi baru jika versi sebelumnya `review_status='pending'`. |
| FR-GOV-7 | createSignedUrl TTL 300 detik untuk preview file. |
| FR-GOV-8 | Token desain didaftar di DESIGN.md §7 dengan ID DA-AP5-*, DA-AP6-* dalam commit terpisah sebelum kode UI. |
| FR-GOV-9 | UNIQUE constraint `action_plan_submissions(action_plan_id, version_number)` untuk mencegah race; client tidak retry otomatis (banner "Sesi lain submit. Reload."). |

## 4. Data Contracts

### 4.1 Migrasi `supabase/migrations/0018_fase_exec_ap5_ap6.sql`

```sql
-- 4.1.1 (AP6) Linkage + snapshot
alter table public.action_plan_result_values
  add column if not exists kpi_area_id uuid references public.kpi_areas(id) on delete restrict,
  add column if not exists previous_value_server numeric,
  add column if not exists previous_value_client_snapshot text,
  add column if not exists previous_value_captured_at timestamptz,
  add column if not exists source_note text;

alter table public.action_plan_result_values
  add constraint if not exists source_note_length check (source_note is null or char_length(source_note) <= 280);

create index if not exists idx_result_values_kpi_area
  on public.action_plan_result_values(kpi_area_id) where kpi_area_id is not null;

-- 4.1.2 (Cross) UNIQUE versioning
alter table public.action_plan_submissions
  add constraint if not exists submissions_action_plan_version_unique unique (action_plan_id, version_number);

-- 4.1.3 (AP6) VIEW agregasi approved-only (FIX bug draft awal: filter di SUM, bukan hanya count)
create or replace view public.kpi_area_current_values
with (security_invoker = true) as
select
  k.id as kpi_area_id,
  k.organization_id,
  sum(
    case
      when s.review_status = 'approved'
        and rv.value_type in ('number','currency')
        and rv.value_text ~ '^-?[0-9]+(\.[0-9]+)?$'
      then rv.value_text::numeric
      else 0
    end
  ) as numeric_total,
  count(rv.id) filter (where s.review_status = 'approved') as approved_entries,
  max(s.reviewed_at) filter (where s.review_status = 'approved') as last_approved_at
from public.kpi_areas k
left join public.action_plan_result_values rv on rv.kpi_area_id = k.id
left join public.action_plan_submissions s on s.id = rv.submission_id
group by k.id, k.organization_id;

revoke all on public.kpi_area_current_values from public, anon;
grant select on public.kpi_area_current_values to authenticated;

-- 4.1.4 (AP5) Storage RLS hardening
drop policy if exists "evidence_objects_insert" on storage.objects;
create policy "evidence_objects_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.current_user_org()::text
    and auth.uid() = (
      select pic_id from public.action_plans
      where id = ((storage.foldername(name))[2])::uuid
    )
  );

drop policy if exists "evidence_objects_select" on storage.objects;
create policy "evidence_objects_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and (
      -- New convention path
      (
        (storage.foldername(name))[1] = public.current_user_org()::text
        and public.can_access_action_plan(((storage.foldername(name))[2])::uuid)
      )
      -- Grandfather legacy path (Fase 1-7) — bypass strict path check, inherit visibility from evidence_files row
      or (
        array_length(storage.foldername(name), 1) < 3
        and exists (
          select 1 from public.evidence_files ef
          join public.action_plan_submissions sub on sub.id = ef.submission_id
          where ef.storage_path = name
            and public.can_access_action_plan(sub.action_plan_id)
        )
      )
    )
  );
-- UPDATE/DELETE: NO POLICY → total revoke for authenticated.
```

### 4.2 RPC `submit_action_plan` — signature baru

```sql
-- Signature: (p_action_plan_id uuid, p_submission_local_id uuid, p_note text, p_evidence jsonb, p_result_values jsonb) returns uuid
-- p_submission_local_id menjadi PRIMARY KEY action_plan_submissions.id
-- Validasi tambahan:
-- 1. Versi sebelumnya tidak pending (FR-GOV-6)
-- 2. Storage path prefix = <current_user_org>/<p_action_plan_id>/<p_submission_local_id>/ (per evidence kind file)
-- 3. Setiap kpi_area_id ∈ list_kpi_area_candidates_for_action_plan(p_action_plan_id); jika kandidat>0 dan kpi_area_id NULL → reject
-- 4. value_type result_value == kpi_areas.value_type (read-only, dipaksa)
-- 5. value_type 'percentage' rejected di rilis 1
-- 6. Compute previous_value_server dari VIEW kpi_area_current_values; simpan bersama previous_value_client_snapshot
-- 7. Setiap reject memanggil log_governance_violation dengan kind eksplisit
-- 8. write_activity dengan detail jsonb lengkap (FR-GOV-4)
```

### 4.3 RPC baru

- `list_kpi_area_candidates_for_action_plan(p_action_plan_id uuid)` SECURITY DEFINER — return `setof (id uuid, name text, value_type text, target text, current_value_numeric numeric)`. Body: WITH RECURSIVE atau JOIN chain `action_plan → initiative → strategy → kpi_area`; filter by `can_access_kpi_area(id)` OR `auth.uid() = (select pic_id from action_plans where id = p_action_plan_id)`.
- `get_kpi_area_snapshot(p_kpi_area_id uuid)` SECURITY DEFINER — return `(id uuid, name text, value_type text, target text, current_value_numeric numeric, approved_entries int, last_approved_at timestamptz)`; cek `can_access_kpi_area` di body.
- `cleanup_orphan_evidence(p_action_plan_id uuid, p_paths text[])` SECURITY DEFINER — verify `auth.uid() = action_plans.pic_id`; foreach path: cek `not exists(select 1 from evidence_files where storage_path = path)`; hapus via `storage.objects` delete; tulis activity_logs entry per path.
- `log_governance_violation(p_kind text, p_entity_type text, p_entity_id uuid, p_metadata jsonb)` SECURITY DEFINER — INSERT ke `governance_violations` dengan `caller = auth.uid()`, `created_at = now()`.

### 4.4 TypeScript types & data layer

Regenerate `mobile/src/lib/database.types.ts` via `supabase gen types typescript`. Update `mobile/src/lib/cards.ts`:

```ts
export const EVIDENCE_KIND_FILE = ['file','photo','screenshot','pdf'] as const;
export const EVIDENCE_KIND_LINK = ['link_doc','link_gdrive','link_generic'] as const;
export const EVIDENCE_KIND_TEXT = ['text_note','report'] as const;
export type EvidenceKind = typeof EVIDENCE_KIND_FILE[number] | typeof EVIDENCE_KIND_LINK[number] | typeof EVIDENCE_KIND_TEXT[number];

export type EvidenceInput = {
  kind: EvidenceKind;
  storage_path?: string | null;
  url?: string | null;
  text_content?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
};

export type ResultValueInput = {
  label: string | null;
  value_type: string;   // dipaksa dari KPI Area
  value_text: string | null;
  kpi_area_id: string | null;  // NULL hanya valid jika kandidat=0
  previous_value_client_snapshot?: string | null;  // audit-only
  source_note?: string | null;
};

export async function submitActionPlan(args: {
  actionPlanId: string;
  submissionLocalId: string;  // generated client uuid v4 SEKALI per submit
  note?: string;
  evidence: EvidenceInput[];
  resultValues: ResultValueInput[];
}): Promise<string>;
```

Helper baru `mobile/src/lib/storage.ts`: `uploadEvidenceFile`, `getSignedEvidenceUrl`, `cleanupOrphanEvidence`.
Helper baru `mobile/src/lib/governance.ts`: `logGovernanceViolation` (mostly tidak dipanggil client — RPC server-side; ada untuk client-side compensating).

## 5. Acceptance Criteria

Lihat field `acceptance_criteria` di structured output untuk daftar 50 AC Given/When/Then yang dapat diuji.

## 6. Edge Cases & Error States

### 6.1 Loading & state machine

| State | Trigger | UI |
|---|---|---|
| loading.action_plan | initial fetch | Skeleton, Submit disabled |
| loading.kpi_context | candidates resolver belum resolve | Skeleton AP6 row + label "Memuat..." |
| error.action_plan_not_found | RLS hide / 404 | Empty state generic (tidak bocor "tidak boleh lihat") |
| state.read_only | user bukan PIC | Form disabled, banner "Anda bukan PIC" |
| state.already_locked | status='done' | Banner success + tombol "Lihat versi terakhir" |
| state.pending_review | versi terakhir pending | Banner warning + Submit disabled (FR-GOV-6) |

### 6.2 AP5 edge

- Picker cancel → no error, button tetap enabled.
- Permission OS denied → toast + deep-link Settings.
- Size/MIME invalid → inline error, no Storage call.
- Upload gagal → row state Gagal + retry per row; Submit disabled selama uploading.
- Storage 403 → toast + switch read-only mode + log governance violation.
- Pre-submit delete → RPC `cleanup_orphan_evidence` (bukan Storage DELETE).
- Compensating cleanup saat RPC submit gagal → otomatis.

### 6.3 AP6 edge

- Kandidat=0 (Fase 1 legacy) → banner + kpi_area_id NULL diizinkan (RPC branch).
- KPI Area visibility hilang antara pilih dan submit → RPC reject + governance violation + toast.
- KPI Area FK ON DELETE RESTRICT mencegah delete selama ada result_value reference.
- Percentage value_type → banner block di rilis 1.
- Non-numeric pada value_type number/currency → inline validation; Submit disabled.

### 6.4 Concurrency

- 2 device submit barengan → UNIQUE constraint (action_plan_id, version_number) → satu reject 23505 → banner "Sesi lain submit. Reload." (tidak retry otomatis).
- KPI Area di-archive (jika kolom status ada — verify OQ-9) → RPC reject dengan governance error spesifik.

## 7. Open Questions

Lihat field `open_questions` di structured output (10 OQ severity high/medium yang harus diselesaikan owner sebelum TDD execution).

## 8. Handoff ke TDD

### 8.1 Strategi red→green→refactor

1. **DB contract tests** (paling kritis, jalankan dulu di `__contract__/`):
   - 0018_storage_rls_evidence: INSERT denial untuk non-PIC; SELECT lulus untuk PIC/Reviewer/scope; grandfather path legacy; UPDATE/DELETE rejected.
   - 0018_view_kpi_area_current_values: SUM hanya approved; security_invoker filter RLS pemanggil.
   - 0018_rpc_submit_action_plan: signature baru; semua validasi (path mismatch, kpi out-of-scope, pending double-submit, percentage block, value_type enforce); previous_value_server populated; activity_log shape.
   - 0018_rpc_list_kpi_area_candidates: chain resolver; PIC bypass; Fase 1 NULL chain.
   - 0018_rpc_cleanup_orphan_evidence: verify caller=PIC; path tidak ter-reference; activity_log.
   - 0018_rpc_log_governance_violation: satu-satunya INSERT path.

2. **Integration tests** (Jest, mobile):
   - cards.test.ts: submitActionPlan flow (mock supabase); error mapping; compensating cleanup.
   - storage.test.ts: uploadEvidenceFile path convention; size/MIME validation; signed URL TTL.

3. **UI tests** (React Native Testing Library):
   - submit.test.tsx: state machine (loading/read_only/pending_review/locked); AttachmentRow lifecycle; KpiLinkageCard render; delta arrow reactivity; percentage block banner; Submit disabled selama upload.

4. **Manual verification**:
   - Run di iOS simulator + Android emulator.
   - Verify Reviewer-side SubmissionCard render attachment + delta.
   - Verify DESIGN.md §7 berisi DA-AP5-* dan DA-AP6-* sebelum komponen di-merge.

### 8.2 File yang akan disentuh

Lihat field `tdd_handoff.paths`.

### 8.3 Urutan commit (mengikuti pola PR #13)

1. `docs(design): daftar token DA-AP5-* DA-AP6-* di DESIGN.md §7` (atomic, dokumentasi dulu).
2. `db(0018): migrasi schema + VIEW + RPC + Storage RLS hardening` + contract tests.
3. `feat(lib): cards.ts EvidenceKind + ResultValueInput + storage.ts helpers` + unit tests.
4. `feat(ui): AttachmentRow + KpiLinkageCard + DeltaArrow + ImpactApprovalCard components` (TDD red-green).
5. `feat(ui): submit.tsx integrasi state machine + RPC baru` (TDD red-green refactor).
6. `feat(ui): SubmissionCard update untuk Reviewer render attachment + delta`.
7. `chore(wiki): update execution-loop.md + evidence-kinds.md + ui-prototype-gap.md (close UI-S-AP5, UI-S-AP6) + log.md`.

### 8.4 Critic addendum mengikat

- TIDAK boleh skip `auth.uid()=pic_id` di Storage INSERT policy (kunci Reviewer file injection vulnerability).
- TIDAK boleh skip filter `review_status='approved'` di VIEW SUM (bug numeric_total termasuk pending).
- TIDAK boleh skip `previous_value_server` server-computed (audit anti-TOCTOU).
- TIDAK boleh skip `log_governance_violation` di setiap reject path RPC.
- TIDAK boleh deploy migrasi tanpa UI baru (breaking change RPC signature; minimum app version atau backward-compat default per OQ-1).

### 8.5 Definition of Done

- Semua 50 AC lulus (test suite ≥85% line coverage di file yang disentuh).
- DB contract tests hijau di CI.
- DESIGN.md §7 berisi semua DA-AP5-* + DA-AP6-* token, commit DESIGN.md terpisah dan mendahului kode UI.
- Wiki updated: `wiki/concepts/ui-prototype-gap.md` close UI-S-AP5 + UI-S-AP6; `wiki/log.md` ada entry; `wiki/concepts/execution-loop.md` reflect file upload + KPI linkage.
- Open questions OQ-1..OQ-10 di-resolve atau dieskalasi ke owner sebelum merge.
- Reviewer-side SubmissionCard tested manual + screenshot di PR description.
- No regression Fase 1-7 tests (jest 240/240 minimum).

---

## 10. Addendum Reconciliation — MENGIKAT (Grill 3-lensa: perlu-perbaikan)

Tiga lensa Grill (produk, engineering, governance) menemukan 10 kontradiksi internal serius di §1–§8. Addendum ini **menimpa** §1–§8 di setiap titik konflik. Owner decisions tertanggal 2026-06-26.

### 10.1 OWNER DECISIONS (locked 2026-06-26)

| # | Decision | Resolusi |
|---|---|---|
| **OD-1** | **Fase 1 KPI Area fallback** | **Sembunyikan section Nilai Hasil** jika `list_kpi_area_candidates_for_action_plan` mengembalikan 0 baris. PIC tetap submit bukti. Tidak ada bypass RLS, tidak ada auto-link ke ancestor. Override `result_value_required` flag: jika candidate list kosong, server **diam-diam menerima** `result_values=[]` tanpa raise "Nilai Hasil wajib". |
| **OD-2** | **Multi-file picker** | **Multi-select per add** (`expo-document-picker multiple:true`) + **cap 5 file per submission** (server validasi `length(p_evidence_files) <= 5`). UX: pesan "Maksimum 5 file" jika user coba add file ke-6. |
| **OD-3** | **Reviewer view (Story R1–R3)** | **DEFER ke PR follow-up** (`feat(ap-review): UI-S-AP5b/AP6b — render attachment & KPI delta di Reviewer view`). Scope PR ini **hanya PIC side** (submit.tsx + komponen baru). Non-goal #1 di §1.3 STAY. Commit step 6 di §8.3 **DIHAPUS**. SubmissionCard tidak disentuh. |

### 10.2 ENGINEERING RECONCILIATION

| # | Topik | Resolusi mengikat |
|---|---|---|
| **ER-1** | `kpi_area_id` di `action_plan_result_values` | **NOT NULL** di schema baru (kolom baru, no backward-compat issue: tidak ada row eksisting yang punya kolom ini). RPC `submit_action_plan` reject NULL. Backward-compat untuk **klien lama** ditangani via deploy-atomic: migrasi 0018 + app version bump bareng. **Hapus** klausa "nullable" di §4 / FR-AP6-1 / FR-AP6-9. |
| **ER-2** | Storage path & submission id | **2-phase commit**: (a) RPC `create_submission_draft(p_action_plan_id, p_attachment_count)` → returns `submission_draft_id` (UUID DB-generated yang akan jadi `submission_id` final), (b) client upload file ke path `evidence-bukti/{org_id}/{action_plan_id}/{submission_draft_id}/{uuid}-{filename}`, (c) RPC `submit_action_plan(p_submission_draft_id, p_evidence_files[], p_result_values[])` finalize. **Hapus** `submission_local_id` client-generated. Path memakai `submission_id` yang sama dengan baris di DB → audit join-able. |
| **ER-3** | Storage INSERT RLS | Tambah klausa eksplisit `auth.uid() = (select pic_id from action_plans where id = (storage.foldername(name))[2]::uuid)`. **Hanya PIC** boleh upload ke path action_plan miliknya. Reviewer / workspace viewer / PIC initiative parent tidak boleh INSERT. Anti-Reviewer-file-injection. |
| **ER-4** | Storage DELETE policy | **Allow DELETE** untuk PIC pada path miliknya **HANYA jika** submission terkait belum di-finalize (status='draft'). Setelah finalize → REVOKE (evidence locking PRD §35). Cleanup orphan via RPC server-side `cleanup_orphan_upload(p_path)` yang re-check ownership + status. |
| **ER-5** | KPI agregat (VIEW vs trigger) | **VIEW saja** (`kpi_area_current_values`) dengan `WHERE review_status='approved'`. **HAPUS** FR-AP6-7 (trigger/RPC post-approval). VIEW auto-update saat status berubah dari pending → approved (next read sees new SUM). Lebih sederhana, ACID, tak ada trigger drift risk. |
| **ER-6** | Auto-classify file `kind` | **Deterministik by MIME** (single source of truth — hapus heuristik source-folder di FR-AP5-2): `image/*` → `photo`; `application/pdf` → `pdf`; selain itu → `file`. **Hapus** kind `screenshot` dari mapping client (DB whitelist tetap, tapi UI tidak pernah emit). |
| **ER-7** | `governance_violation` INSERT | Definisikan helper SECURITY DEFINER `public.log_governance_violation(p_org, p_kind text, p_entity_type text, p_entity_id uuid, p_detail jsonb)` di migrasi 0018 (revoke execute from public/anon/authenticated). Dipanggil dari RPC `submit_action_plan` / `create_submission_draft` / `cleanup_orphan_upload` saat anti-self-approval / path mismatch / orphan cleanup gagal. Pola yang sama dengan Fase 5 MBR violations. |
| **ER-8** | `previous_value_server` (anti-TOCTOU) | Server-side: di RPC `submit_action_plan`, untuk setiap result_value, **server membaca** `kpi_area_current_values.numeric_total` SAAT INI sebagai `previous_value_text` dan tulis ke baris audit. Client TIDAK mengirim `previous_value_text` (drop dari `p_result_values[]` shape). Anti-TOCTOU. |
| **ER-9** | `link_generic` di UI | **In-scope tambahan kecil**: tambah `link_generic` ke EVIDENCE_KINDS submit.tsx (whitelist 0015 sudah ada). One-line change. |
| **ER-10** | Baseline test count | **540/540** (post-PR #13, bukan 240/240). Update §8.5 Definition of Done. |

### 10.3 KONSEKUENSI: bagian yang HARUS dihapus/diubah di §1–§8

- **§1.3 Non-goal #1** — STAY (per OD-3, scope hanya PIC).
- **§1.3 Non-goal #9** — HAPUS atau ubah jadi "Multi-select diperbolehkan, max 5 per submission" (per OD-2).
- **§2 Stories R1, R2, R3** — pindah ke spec follow-up (jangan dihapus, beri marker `[DEFER → PR follow-up reviewer-view]`).
- **§3 FR-AP5-1** — ubah jadi "multi-select, max 5 per submission".
- **§3 FR-AP5-2** — sederhanakan: kind auto-deduce by MIME saja (per ER-6).
- **§3 FR-AP5-4** — path memakai `submission_id` (per ER-2).
- **§3 FR-AP5-6 + A8** — `storage.remove()` client-side hanya untuk pre-finalize draft + RLS DELETE dibatasi (per ER-4). Cleanup orphan post-finalize via RPC `cleanup_orphan_upload`.
- **§3 FR-AP5-7** — evidence locking dimulai saat **finalize** (RPC `submit_action_plan` sukses), bukan saat upload. Pre-finalize = draft, bisa delete.
- **§3 FR-AP6-1** — `kpi_area_id` **NOT NULL** + Fase 1 fallback per OD-1.
- **§3 FR-AP6-2 (B11)** — fallback: section Nilai Hasil HIDDEN jika candidate list 0 (per OD-1).
- **§3 FR-AP6-3** — VIEW only `WHERE review_status='approved'` (per ER-5).
- **§3 FR-AP6-6** — `previous_value_server` server-computed (per ER-8).
- **§3 FR-AP6-7** — **HAPUS** (VIEW menggantikan trigger, per ER-5).
- **§3 FR-AP6-9** — hapus klausa "kpi_area_id=NULL diizinkan untuk submission baru".
- **§3 FR-GOV-2** — Storage INSERT policy memakai `auth.uid() = pic_id` eksplisit (per ER-3).
- **§3 FR-GOV-7** — signed URL TTL <=5min via `createSignedUrl` (storage-js v2 client-side dgn anon key tunduk RLS; TTL = soft control).
- **§4.1 schema action_plan_result_values** — `kpi_area_id uuid NOT NULL references kpi_areas(id) on delete restrict`.
- **§4.2 VIEW** — tambah `WHERE review_status='approved'` filter.
- **§4.3 Storage RLS** — INSERT + DELETE policy per ER-3, ER-4.
- **§5 AC** — tambah AC baru: A_OD1 (picker kosong → section hidden), A_OD2 (cap 5 file), A_ER3 (Reviewer try upload → 403), A_ER4 (delete pre-finalize OK, post-finalize blocked), A_ER8 (previous_value server-computed, client tidak kirim).
- **§7 Open Questions** — OQ-1, OQ-2, OQ-6, OQ-7, OQ-8 → RESOLVED via §10 ini. Yang TERSISA: OQ-3 (size limit MIME whitelist), OQ-4 (deploy plan klien lama), OQ-5 (telemetri produk). **Putusan default**: OQ-3 = max 10MB per file + whitelist `image/* application/pdf` (sisanya `file` kind, tetap diterima). OQ-4 = deploy-atomic (migrasi + app version bareng; klien lama yang panggil RPC tanpa kolom baru akan error 400, acceptable). OQ-5 = no telemetri (defer).
- **§8.3 commit urutan** — HAPUS step 6 (SubmissionCard reviewer). Step 5 jadi final commit kode (selain wiki step 7).
- **§8.5 DoD** — baseline jest **540/540** (per ER-10).

### 10.4 Snapshot kontrak data final (pasca-reconcile)

**Schema baru** (migrasi 0019_fase_exec_ap5_ap6 — angka migrasi berikutnya setelah 0018 inbox preview):

```sql
-- action_plan_result_values kolom baru
alter table public.action_plan_result_values
  add column kpi_area_id uuid not null references public.kpi_areas(id) on delete restrict,
  add column previous_value_text text; -- server-computed snapshot via RPC

-- action_plan_submissions status (untuk 2-phase finalize)
alter table public.action_plan_submissions
  add column status text not null default 'draft'
    check (status in ('draft', 'submitted'));
-- finalize: update status='submitted' di RPC submit_action_plan

-- VIEW (per ER-5)
create or replace view public.kpi_area_current_values
with (security_invoker = true)
as select
  rv.kpi_area_id,
  sum(case when rv.value_type in ('number','currency','percentage') then rv.value_numeric else 0 end) as numeric_total,
  count(*) filter (where rv.value_type = 'text') as text_count,
  max(s.reviewed_at) as last_approved_at
from public.action_plan_result_values rv
join public.action_plan_submissions s on s.id = rv.submission_id
where s.review_status = 'approved'
group by rv.kpi_area_id;
```

**RPC contracts** (3 RPC baru):

1. `create_submission_draft(p_action_plan_id uuid, p_attachment_count int) returns uuid` — buat baris `action_plan_submissions` status='draft', return id. Server validate: `auth.uid() = pic_id` AP, `count <= 5`. Log governance violation jika gagal.
2. `submit_action_plan(p_submission_draft_id uuid, p_evidence_files jsonb[], p_result_values jsonb[]) returns uuid` — finalize draft → status='submitted', insert evidence_files + result_values. Server-compute `previous_value_text` dari VIEW (ER-8). Reject jika `kpi_area_id NULL` (per ER-1) KECUALI `list_kpi_area_candidates_for_action_plan(ap_id)` mengembalikan 0 baris (per OD-1, terima `result_values=[]`).
3. `cleanup_orphan_upload(p_path text) returns void` — verifikasi path matches draft AP user, status='draft', storage.remove(). Log governance violation jika path bukan miliknya.

### 10.5 Verifikasi: Definition of Done (override §8.5)

- 50 AC §5 + AC baru §10.3 lulus.
- DB contract tests hijau (begin/rollback pattern dgn `set local role authenticated` + jwt claims, per Critic §8.1 PR #13).
- DESIGN.md §7 token DA-AP5-*/DA-AP6-* terdaftar SEBELUM kode UI.
- Wiki updated: close UI-S-AP5 + UI-S-AP6, log entry, execution-loop.md reflect 2-phase commit.
- Jest **540/540 baseline + ~30 case baru** (estimate: 5 lib, 8 RPC contract, 10 component, 10 screen).
- Advisor security 0 isu untuk migrasi 0019.
- Tidak ada perubahan ke action-plan/[id].tsx atau SubmissionCard (per OD-3).
