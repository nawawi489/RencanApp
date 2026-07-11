# Spec: Rename Workspace Performance Terminology

Status: **F0 IN PROGRESS** — 11/12 RWT DECIDED (2026-07-11); RWT-12 PENDING (tidak block F1).
Branch kerja: `feat/rename-workspace-terminology` (base: `origin/staging`).
Dokumen ini adalah SUMBER KEBENARAN eksekusi rename. Kalau bertabrakan dengan PRD/Wiki, dokumen ini menang SAMPAI PRD/Wiki di-update di F7.

**Owner decision log:**
- 2026-07-11: RWT-01..RWT-11 DECIDED = default rekomendasi (A untuk 10, B untuk RWT-03).
- 2026-07-11: PRD.md V1.8.3 di-apply (13 section) — commit F0.
- RWT-12 (Content Lead DRI + tanggal deliverable copy edukasi) DIMINTA owner sebelum F4 mulai.

---

## 1. Problem Statement

Terminologi 4-level Performance saat ini (`Goal → KPI Area → Strategy → Initiative → Action Plan`) tidak selaras dengan cara owner ingin memandu pengguna:

- Kata `Strategy` yang seharusnya berarti "area hasil" justru dipakai di level 3 (semantik "pendekatan").
- Kata `Initiative` yang seharusnya berarti "unit pekerjaan terkelola" justru dipakai di level 3 (semantik "cara").
- Level bawah `Action Plan` menyerap dua peran: item yang di-review + pekerjaan konkret harian.

Owner (2026-07-11) memutuskan RENAME BOTTOM-UP bergeser satu tingkat:

| Lama | Baru (identifier kode) | UI Bahasa Indonesia |
|---|---|---|
| KPI Area | `strategy` | Strategi |
| Strategy | `initiative` | Inisiatif |
| Initiative | `action_plan` | Rencana Aksi |
| Action Plan | `task` | Tugas |

Rename mencakup UI + kode + DB. Sekali dilakukan seluruh stack (PRD, RLS, RPC, storage policy, route, types, tests, wiki) harus konsisten pada satu landing.

## 2. Goals

- **G1** Rename 4 level hierarki + tabel turunan + kolom FK bottom-up dengan zero regression governance.
- **G2** PRD.md V1.8.2 (§2/§5/§10/§19/§20/§29–30/§31/§34.4/§34.6/§42/§43) di-update DULU di F0 sebelum F1 apply.
- **G3** Copy Indonesia dipusatkan di `mobile/src/lib/glossary.ts` + `workspace-copy.ts` sebagai single source of truth, dienforce grep-guard CI (`scripts/ci/no-loose-copy.sh`).
- **G4** Rewrite total copy edukasi (help popup, seed data, MBR modal, empty state, template library) mengikuti makna baru — bukan cari-ganti kata.
- **G5** Deliverable spec (dokumen ini) berisi 10 bagian yang diminta owner + 12 RWT decision terkonsolidasi.

## 3. Non-Goals

Lihat blok `non_goals` di StructuredOutput. Ringkas:
- Tidak menambah level baru; `Task` = rename label, bukan entitas baru.
- Tidak mengubah semantik Repeat / Instance / Evidence / PIC / Reviewer / Archive / Score Formula / MBR / Repeat Compliance.
- Tidak menambah policy INSERT/UPDATE/DELETE baru; tidak menambah kolom `weight`/`checklist_items`/`watcher_id`.
- Tidak UPDATE/DELETE row historis di tabel append-only.
- Tidak mengubah nama RPC pg_cron internal.
- Tidak mengubah query key React Query di F1–F4 (ditunda F7 opsional).

## 4. Owner Decisions (F0 Gate) — RWT-01..RWT-12

F1 TIDAK BOLEH mulai sebelum 12 RWT berikut ber-status `DECIDED: <opsi>` dengan tanggal ≥ tanggal spec.

| ID | Topik | P | Default rekomendasi | Status |
|---|---|---|---|---|
| RWT-01 | Development Workspace scope | P0 | (A) Development label UI ikut bergeser | DECIDED 2026-07-11 |
| RWT-02 | Label 'Tugas' vs PRD §2 positioning | P0 | (A) tetap 'Tugas' + PRD §2 di-update | DECIDED 2026-07-11 |
| RWT-03 | WORKSPACE_KIND warna+huruf pill | P0 | (B) warna terikat POSISI hierarki + huruf G/S/I/AP/T | DECIDED 2026-07-11 |
| RWT-04 | Chat Initiative surface level | P0 | (A) tetap di level 3 struktural, judul 'Diskusi Rencana Aksi' | DECIDED 2026-07-11 |
| RWT-05 | Score Formula source_metric | P0 | (A) FREEZE literal 'action_plan_completion' | DECIDED 2026-07-11 |
| RWT-06 | record_evaluation param transisi | P1 | (A) dual-signature 1 rilis | DECIDED 2026-07-11 |
| RWT-07 | Audit historis backfill | P1 | (A) FREEZE + read-side remap helper | DECIDED 2026-07-11 |
| RWT-08 | Query key React Query rename | P2 | (A) pertahankan, F7 opsional | DECIDED 2026-07-11 |
| RWT-09 | MBR default action_plan→task | P1 | (A) 3 (mengikuti 3/3/3/3) | DECIDED 2026-07-11 |
| RWT-10 | Label 'Instance' di UI | P2 | (A) pertahankan Inggris | DECIDED 2026-07-11 |
| RWT-11 | Deep-link stub lifetime | P2 | (A) 30 hari, drop v1.8.5 | DECIDED 2026-07-11 |
| RWT-12 | Content Lead DRI copy rewrite | P1 | (nama + tanggal) | **PENDING — owner isi sebelum F4** |

## 5. User Stories (ringkas)

- **US-1 CEO/Owner**: buat Goal → Strategi → aktifkan Goal (MBR 3/3/3 tetap, verb "Aktifkan" tetap, help popup Strategi = area hasil).
- **US-2 Manager PIC Strategi**: tambah Inisiatif dgn PIC≠Reviewer (anti-self-approval).
- **US-3 PIC Inisiatif**: pecah jadi Rencana Aksi; Repeat/Instance semantik tetap.
- **US-4 PIC Tugas**: mulai kerja, upload evidence, submit; evidence locking tetap.
- **US-5 Reviewer**: approve/reject/minta revisi; anti-self-approval dua lapis + notifikasi actionable resolve.
- **US-6 CEO/Owner F0 sign-off**: PRD update + Score Formula bobot approved sebelum F1.
- **US-7 Staff**: lihat Tugas di Home tanpa regresi visibility (RLS default-deny tetap).
- **US-8 Manager Development**: konsistensi/label Development chain sesuai RWT-01.

Detail per role + AC ada di dokumen wiki `wiki/concepts/permission-model.md` pasca-F7.

## 6. Functional Requirements (padat)

Ringkasan; detail berkode `FR-<GROUP>-<NN>` disimpan di lampiran spec.

**Mapping (FR-MAP)**: rename bottom-up 4 tabel + turunan + FK. Rename berlaku pada tabel fisik; label UI Development-side mengikuti keputusan RWT-01.

**PRD (FR-PRD)**: pasal §2/§5/§10/§19/§20/§29–30/§31/§34.4/§34.6/§42/§43 di-update di F0. F1 diblokir bila F0 belum approved.

**DB (FR-DB)**: 4 file migrasi bottom-up 0045→0048 + 1 file backfill enum 0049 + 1 file hygiene constraint 0050. Setiap file WAJIB `BEGIN;…COMMIT;` eksplisit, dijalankan via `psql --single-transaction -f`. Urutan intra-file: DROP POLICY → ALTER TABLE RENAME → RENAME COLUMN → DROP CONSTRAINT → UPDATE data → ADD CONSTRAINT → CREATE OR REPLACE FUNCTION → DROP TRIGGER → CREATE TRIGGER → grant/revoke ACL.

**RPC (FR-RPC)**: rename identifier bottom-up untuk lifecycle/eksekusi/breakdown/helper akses. Pertahankan nama internal: `generate_action_plan_instances`, `mark_overdue_instances`, `calculate_period_scores`, `close_period_snapshot`, `override_user_score`, `open_period_snapshot`, `create_submission_draft`, `write_activity`, `emit_notification`, `resolve_notifications`, `apply_goal_template`, `search_cards`, `cancel_card`, `approve_cancellation`, `archive_card`, `restore_card`. Rename identifier body-preserve untuk 30+ RPC lainnya (daftar lengkap di lampiran).

**Policy (FR-POL)**: RLS ENABLE tanpa window unprotected. Storage.objects `evidence_*` di-DROP+CREATE dengan body `public.tasks`; jumlah policy tetap 3; TIDAK menambah UPDATE policy.

**Data (FR-DATA)**: CHECK enum di-rewrite dengan pola DROP CONSTRAINT → UPDATE data → ADD CONSTRAINT (dalam transaksi). Kolom teks: `comments.entity_type`, `cancellations.entity_type`, `confidential_access_rules.entity_type`, `deadline_change_requests.entity_type`, `minimum_breakdown_rules.parent_card_type/child_card_type`, `card_guidance_contents.card_type`, `card_completion_rules.card_type + required_fields JSONB`. Seed system MBR menambah pair `(action_plan,task,3)` bila RWT-09=A. Score Formula freeze bila RWT-05=A.

**Constraint hygiene (FR-CON)**: rename constraint via `ALTER TABLE … RENAME CONSTRAINT`, BUKAN DROP+ADD (governance-critical: `tasks_pic_ne_reviewer`, `task_instances_pic_ne_reviewer`, `strategy_breakdown_unique`, `uq_submission_version_onetime` partial index di-DROP+CREATE karena predikat).

**Mobile (FR-MOB)**: rename folder route bottom-up via 4 sub-commit `git mv` atomik. Sub-commit 3 (strategy→initiative) memerlukan intermediate rename ke `-tmp` untuk hindari collision Windows case-insensitive. Update entity-routes.ts, 5 union type, 12+ router.push callsite, PostgREST embed di cards.ts, realtime channel filter, glossary+workspace-copy. Package manager: **npm** (bukan pnpm) — command gate: `npm --prefix mobile run typecheck`, `npm --prefix mobile test`.

**UI (FR-UI)**: label pill mengikuti RWT-03. Copy edukasi rewrite total (RWT-12 DRI). Verb "Aktifkan" tetap; 5 istilah Inggris tetap (Repeat, Instance, Reviewer, Score Formula, Minimum Breakdown Rule).

**Governance (FR-GOV)**: 12 invarian non-negotiable (lihat lampiran).

**Docs (FR-DOC)**: section-scoped update di F7 dengan mapping eksplisit.

**Test (FR-TEST)**: rename identifier 45 test file + tambah `supabase/tests/rename_smoke.sql`, `entity_id_orphan_check.sql`, `mobile/tests/rename_integration.test.ts` (RN-Web + supabase testcontainers happy path 5 level). Grep-guard `scripts/ci/no-old-names.sh` + `scripts/ci/no-loose-copy.sh` + `scripts/ci/require-atomic-rename.sh`.

**Rollback (FR-ROLL)**: 5 file revert 0045R–0049R + `git revert` klien. Rollback drill dijalankan sekali di staging sebelum F1 merge ke main.

**Observability (FR-OBS)**: structured JSON log ke stdout dengan `requestId`, `event='workspace_rename'`, `phase='F1a|…|F2'` (mengikuti global CLAUDE.md). Activity log entry `schema_renamed_workspace_terminology` per org.

## 7. Data Contracts

### 7.1 Mapping tabel bottom-up

Lihat StructuredOutput `tdd_handoff.paths` untuk daftar file migrasi. Tabel utama: `action_plans→tasks`, `initiatives→action_plans`, `strategies→initiatives`, `kpi_areas→strategies`. Turunan: `action_plan_submissions→task_submissions`, `action_plan_result_values→task_result_values`, `action_plan_repeat_rules→task_repeat_rules`, `action_plan_instances→task_instances`, `kpi_area_templates→strategy_templates`, `kpi_area_target_breakdowns→strategy_target_breakdowns`.

### 7.2 Mapping FK

Kolom FK bergeser satu tingkat: `strategies.goal_id` (tetap); `initiatives.strategy_id` (dulu `kpi_area_id`); `action_plans.initiative_id` (dulu `strategy_id`); `tasks.action_plan_id` (dulu `initiative_id`); `task_submissions.task_id + task_instance_id`; `task_repeat_rules.task_id`; `task_instances.task_id`; `task_result_values.strategy_id`; `evaluations.action_plan_id`; `video_briefs.action_plan_id`; `chat_rooms.action_plan_id`; `strategy_target_breakdowns.strategy_id`; `reviews.task_id`. Kolom `goal_id`, `problem_statement_id`, `pic_id`, `reviewer_id`, `submission_id`, `repeat_rule_id` TETAP.

### 7.3 View

`kpi_area_current_values` → `strategy_current_values` (DROP+CREATE + re-grant `authenticated`, re-revoke `public, anon`). Klien `mobile/src/lib/cards.ts` update serentak.

### 7.4 RPC identifier catalog (ringkas)

Rename+body: `activate_kpi_area→activate_strategy` dst; `submit_action_plan→submit_task`; `review_action_plan_submission→review_task_submission`; `set_action_plan_repeat_rule→set_task_repeat_rule`; `kpi_area_breakdown_replace→strategy_breakdown_replace`; helper `*_has_my_descendant`, `can_access_*`, `is_*_pic`, `*_in_my_org` bergeser bottom-up.

Body-only (nama tetap): `generate_action_plan_instances`, `mark_overdue_instances`, `calculate_period_scores`, `close_period_snapshot`, `override_user_score`, `write_activity`, `emit_notification`, `resolve_notifications`, `create_submission_draft`, `search_cards`, `cancel_card`, dst.

`record_evaluation`: rename param `p_initiative_id→p_action_plan_id`; RWT-06 keputusan dual-signature vs breaking.

### 7.5 Enum literal mapping

`'kpi_area'→'strategy'`, `'strategy'→'initiative'`, `'initiative'→'action_plan'`, `'action_plan'→'task'`, `'action_plan_instance'→'task_instance'`. `'goal'`, `'development_area'`, `'problem_statement'` TETAP.

### 7.6 Helper compat read-side

`public.map_legacy_entity_type(text) returns text` — SECURITY INVOKER, STABLE, stateless (tidak mengakses tabel), murni CASE. Dipanggil dari view/RPC pembaca (Menu → Aktivitas, Inbox) untuk map historis; TIDAK dipakai di INSERT path.

### 7.7 pg_cron continuity

Nama RPC internal dipertahankan → tidak butuh `cron.unschedule/schedule`. Body direwrite ke `task_instances`, `tasks`.

## 8. Acceptance Criteria

Lihat StructuredOutput `acceptance_criteria`. 47 kriteria terurut F0→F7 + GOV cross-cutting + MERGE gate + OBS + NG anti-scope-creep. Setiap kriteria berformat Given/When/Then + gate teknis (grep/SQL smoke/test kontrak/CI check).

## 9. Edge Cases, Error States, Permission-Denied

**Edge lapisan DATA**: partial rename via BEGIN/COMMIT (rollback total), RLS policy tanpa window invalid, CHECK enum backfill DROP→UPDATE→ADD, audit historis freeze, Score Formula stability, pg_cron continuity, view DROP+re-grant, FK reference lag, storage policy body rewrite, chat rooms membership stability, Development chain shared tables (RWT-01), partial index recreate.

**Error states runtime**: klien kirim literal enum lama pasca-F1 → CHECK 23514 → `surfaceServerError` generik (bukan raw error); types regen lag → CI diff gate; RPC drop-lalu-create dilarang (gunakan CREATE OR REPLACE); anti-self-approval guard preserved via test kontrak; cross-org isolation preserved; MBR blocking dengan copy Bahasa Indonesia "Tidak Dapat Melanjutkan"; cache React Query stale → RQ_CACHE_VERSION bump bila RWT-08=B; deep-link stub redirect dengan permission-preserving; route folder collision di Windows via git mv 4 sub-commit; realtime channel filter update.

**Permission-denied copy** (Bahasa Indonesia, PRD §5 pasca-update):
- RLS filter row: "Kamu tidak punya akses ke Tugas/Rencana Aksi/Inisiatif/Strategi ini." + tombol "Kembali".
- Anti-self-approval: "Kamu adalah PIC Tugas ini. Approval harus dilakukan oleh Reviewer, bukan PIC sendiri."
- MBR block: "Tidak Dapat Melanjutkan" + body kontekstual per level.
- Evidence lock (defense-in-depth): "Bukti tersubmit tidak dapat diubah. Silakan buat submission baru."
- Confidential Access: "Ini adalah [Strategi|...] dirahasiakan. Kamu tidak termasuk dalam daftar akses." + tombol "Minta Akses".
- Cross-org: "Kamu tidak berhak mengelola data organisasi lain."
- Aktivasi Card belum lengkap: "Tugas ini belum lengkap. Field wajib diisi: PIC, Reviewer, Deadline."

**Empty states**: "Belum ada Strategi." / "Belum ada Inisiatif." / "Belum ada Rencana Aksi." / "Belum ada Tugas di Rencana Aksi ini." dengan CTA route baru.

**Loading states**: "Memuat Strategi..." dst dari `WS_LOADING_COPY` (perlu ditambah).

## 10. Fase Eksekusi F0–F7

- **F0 Owner-lock (manual gate)**: PRD update + 12 RWT decision + copy DRI. Selesai = PRD.md di-commit + RWT semua DECIDED.
- **F1 DB rename (0045–0048 + hygiene 0050)**: bottom-up bottom-up dalam 4 file transaksi eksplisit + 1 file hygiene constraint via `ALTER…RENAME CONSTRAINT`. Selesai = pg_class bersih + `supabase gen types typescript --local` + `npm --prefix mobile run typecheck` hijau.
- **F2 Enum backfill + helper compat (0049)**: DROP CONSTRAINT → UPDATE data → ADD CONSTRAINT + orphan check + map_legacy_entity_type. Selesai = semua CHECK enum baru + 0 orphan.
- **F3 RPC/trigger/policy body rewrite**: 40+ RPC + trigger `log_card_creation`/MBR/deadline_guard/chat. Selesai = 5/5 cross-org contract test + 4-skenario governance smoke + policy body 0 dangling.
- **F4 Mobile client rewrite**: 4 sub-commit `git mv` route bottom-up + union type + entity-routes + PostgREST embed + realtime filter + glossary. Selesai = `npm typecheck` + `npm test` + RN-Web e2e happy path hijau.
- **F5 Test symbol rename + smoke/integration baru**: 45 file test + rename_smoke.sql + rename_integration.test.ts + grep-guard scripts. Selesai = baseline ≥978 hijau + CI guard green.
- **F6 Rollback drill di staging**: apply F1a lalu 0045R, assert pg_class kembali. Selesai = drill terekam di specs/.
- **F7 Docs section-scoped + hygiene**: PRD/DESIGN/wiki/specs update dengan mapping eksplisit + entry wiki/log.md per fase. Selesai = grep-guard `no-old-names.sh` = 0 di source.

**Merge gate**: F1+F2 (dan idealnya F3+F4) dalam SATU PR dengan CI check `require-atomic-rename` menolak PR yang menyentuh migrasi tanpa klien (atau sebaliknya).

## 11. Dokumentasi target update F7 (section-scoped)

- `PRD.md`: §2, §5, §10, §12, §19, §20, §29-30, §31, §34.4, §34.6, §35, §42, §43.
- `prd/01-konsep-dan-fondasi.md`: §1, §4, §6, §10.
- `prd/02-spesifikasi-card-dan-eksekusi.md`: §A per card + §B form.
- `DESIGN.md`: §Workspace (palet pill + huruf) + §a11y.
- `wiki/index.md`, `wiki/overview.md`, `wiki/log.md` (entry per fase).
- `wiki/concepts/`: architecture, execution-loop, permission-model (Delegasi bertingkat), scope-guardrails (redaksi larangan level baru), audit-governance (catatan compat historis), minimum-breakdown-rule (default table), tech-stack.
- `wiki/entities/`: workspace, card-model, database-blueprint (+ tabel mapping history↔now), action-plan → task.md (RWT-13 editorial), surfaces, score-formula.
- `specs/*.md`: 23 file rewrite section stale.

## 12. Test Strategy

- **Rename symbol** 45 test file existing (jest + supabase pgtap).
- **DB smoke** baru (`supabase/tests/rename_smoke.sql`): `pg_class` bersih, kolom FK baru, policy hadir, CHECK enum baru, `map_legacy_entity_type` deterministik, jumlah policy storage evidence = 3, seed MBR 3/3/3/3.
- **Integration happy path** (`mobile/tests/rename_integration.test.ts`): Goal→Strategy→Inisiatif→Rencana Aksi→Tugas lifecycle create→activate→submit→review→close period.
- **4-skenario governance smoke**: self-approve, evidence UPDATE, MBR block, cross-org RPC — semua tercatat di `governance_violations` dengan label baru.
- **Grep-guard CI**: `scripts/ci/no-old-names.sh`, `scripts/ci/no-loose-copy.sh`, `scripts/ci/require-atomic-rename.sh`.
- **Rollback drill** (F6): apply 0045→0045R lokal, assert pg_class kembali.
- **Types regen determinism**: CI diff `supabase gen types --local` vs HEAD = kosong.

## 13. Rollback Plan

- **R1 F1a apply tapi F1b gagal**: F1b auto-rollback via BEGIN/COMMIT. Fix + re-apply, atau apply 0045R untuk revert F1a.
- **R2 CI/QA fail pasca-F1d**: apply 0045R–0049R + `git revert` klien F2–F4 di staging.
- **R3 pg_cron memicu selama window revert**: karena nama RPC internal dipertahankan, cron tetap valid.
- **R4 audit rows baru tercatat literal baru**: rollback DDL tidak menghapus audit; helper `map_legacy_entity_type` diperluas map dua arah bila perlu.
- **R5 Drill wajib**: F6 sekali di staging sebelum F1 merge ke main sebagai gate PR.

## 14. Kontradiksi terhadap sumber yang ditandai

- **K1 PRD §2 vs 'Tugas'**: RWT-02 keputusan owner + PRD §2 update.
- **K2 PRD §5 daftar Inggris**: 4 istilah dihapus, ditambahkan padanan UI Indonesia; Instance/Repeat/Reviewer/PIC/Score Formula/MBR tetap Inggris.
- **K3 PRD §20 Strategy semantik**: rewrite total (area hasil, bukan pendekatan Q-focused).
- **K4 PRD §29-30 Initiative Chat**: RWT-04 keputusan owner (default: tetap di level 3 struktural, judul jadi "Diskusi Rencana Aksi").
- **K5 NG-4 Development scope vs realita FK-MAP-02**: RWT-01 memutuskan (default: Development label UI ikut bergeser).
- **K6 wiki/concepts stale**: F7 rewrite section-scoped.

## 15. Handoff ke TDD

Lihat StructuredOutput `tdd_handoff.feature` dan `tdd_handoff.paths`.

**Input `/tdd-plan` yang direkomendasikan** (setelah F0 approved):

```
/tdd-plan "Fase F1+F2+F3 rename workspace terminology bottom-up
(migrasi 0045-0050 + RPC rewrite + policy body + trigger)
dengan invariant governance preserved (RLS, anti-self-approval,
evidence lock, cross-org isolation 0039, MBR 3/3/3/3, append-only
audit, entity_id orphan check). Package manager npm.
Constraint hygiene via ALTER TABLE RENAME CONSTRAINT (bukan DROP+ADD).
map_legacy_entity_type SECURITY INVOKER + STABLE + stateless.
pg_cron RPC name dipertahankan. Score Formula freeze default RWT-05=A.
record_evaluation dual-signature transisi default RWT-06=A."
```

Untuk F4 klien mobile: `/tdd-plan` terpisah dengan fokus route folder rename bottom-up + union type sinkron + PostgREST embed clean + copy Indonesia terpusat.

## 16. Lampiran

Bagian lampiran (mapping FR-<GROUP>-<NN> lengkap, tabel index index/trigger/constraint, daftar 40+ RPC dengan status rename/body-only, wiki page target update section-per-section, script CI implementasi) disimpan sebagai draft terpisah di `specs/rename-workspace-terminology-appendix.md` untuk menjaga file utama tetap navigable.

---

**End of Spec.** Menunggu owner sign-off 12 RWT decision sebelum F1 mulai.
