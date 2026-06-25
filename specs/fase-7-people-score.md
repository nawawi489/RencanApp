# Fase 7 — People & Score (Spec Final)

> Status: **PEMBLOKIR TERESOLUSI (2026-06-25)** — semua open question pemblokir sudah diputuskan product owner; lihat §0. Spec ini mengintegrasikan temuan grill PRODUK/ENGINEERING/GOVERNANCE dan mengoreksi fakta skema terhadap migrasi live 0001–0012.

## 0. Keputusan Pemblokir Terkunci (2026-06-25)

Keputusan berikut MENGIKAT dan menggantikan jawaban sementara di §9 Open Questions. TDD tidak boleh mengubahnya tanpa keputusan ulang product owner.

| # | Topik | Keputusan | Dampak kontrak |
|---|---|---|---|
| D1 | **Visibility People** | **Restriktif + atasan (PIC induk).** SELECT `user_score_results`/`ranking_snapshots` lolos jika: `user_id=auth.uid()` **ATAU** `manage_score_formula`/CEO/`view_all_workspace` **ATAU** `is_supervisor_of(target_user)`. | Butuh helper BARU `is_supervisor_of(p_user uuid)` STABLE SECURITY DEFINER. |
| D2 | **`is_supervisor_of` definisi** | True jika `auth.uid()` adalah PIC sebuah card induk yang punya turunan ber-PIC `p_user` (rantai PIC-induk → PIC-turunan: Goal/KPI/Strategy/Initiative/AP & Dev Area/PS/Initiative/AP). Non-rekursif, **inline kolom** (hindari gotcha 42501). | Helper baca tabel card LAIN, bukan self-requery. |
| D3 | **Period window** | **Anchor ke submission approved.** Completion one-time = `action_plan_submissions.review_status='approved'` yang timestamp-nya dalam `[period_start, period_end]`; repeat dari `action_plan_instances`. **Tidak** menambah `completed_at` ke `action_plans`. | Tabel Fase 1 tak diubah. Window deterministik dari kolom yang ada. |
| D4 | **`result_achievement`** | **Keluarkan dari formula Staff V1.** Bobot dire-normalisasi agar SUM=100% tanpa kategori ini. Masuk saat sumber target tersedia (Fase lanjut). | Seed Staff = 6 kategori (bukan 7), SUM=100. NG11 berlaku. |
| D5 | **`governance_discipline`** | `clamp(100 − Σ penalti, 0, 100)`. Penalti **SEKALI per tier** yang dilanggar dalam window (bukan per kejadian): low=2, medium=5, high=15, critical=40. Punya ≥1 pelanggaran di sebuah tier mengurangi penalti tier itu satu kali; maksimum total = 2+5+15+40 = 62. **Revisi review 2026-06-25** (sebelumnya aditif per kejadian). | RPC kalkulasi pakai `DISTINCT severity`; testable deterministik. |
| D6 | **Trend** | **Sparkline N periode tertutup terakhir** (skor per periode). Graceful degrade: <2 titik → tampil kosong/garis tunggal, bukan error. | Butuh query histori skor per user lintas periode tertutup + komponen sparkline. |
| D7 | **Seed level-atas** | **Defer total.** Hanya formula **Staff** di-seed AKTIF. Template Management/C-Level/CEO di-seed status `draft` (tak menghitung skor) sampai sumber data ada. | `calculate_period_scores` hanya menskor user level Staff di V1; level lain di-skip (selain NULL-skip). |
| D8 | **Development Contribution** | **Level Initiative.** `count(initiatives done WHERE problem_statement_id IS NOT NULL AND pic_id=user) ÷ total`; 0 initiative → 0%. | Kanonik; tidak dobel-hitung dengan completion/repeat. |
| D9 | **Ranking timing** | **Hanya setelah periode ditutup** (`ranking_snapshots` beku). Periode aktif: tampilkan skor berjalan TANPA ranking. | Tidak ada query ranking live; People sembunyikan ranking saat tak ada periode closed. |
| D10 | **Override approval** | **Single-actor + jejak audit kuat.** Satu pemegang `manage_score_formula` override langsung via `override_user_score`; efektif seketika (`result_kind='override'`, `is_current=true`). `approved_by` = self-attested (= `changed_by`). Anti-self tetap (`p_user ≠ auth.uid()` → `governance_violations` 'critical'); reason wajib; tercatat `activity_logs` 'score_override_applied'. **Revisi review 2026-06-25**: two-actor dibatalkan untuk V1 (org kecil sering hanya 1–2 pemegang izin → fitur mati); upgrade ke separation-of-duties saat org membesar. | **TIDAK ada** kolom `override_status` & **TIDAK ada** RPC `approve_score_override`. `user_score_results` cukup: `result_kind`/`is_current`/`override_reason`/`override_changed_by`/`override_changed_at`/`override_approved_by`(=changed_by). |
| D11 | **Tie-breaker ranking** | **Rank kembar** (skor sama → `rank_number` sama; rank berikutnya melompat). Urutan tampilan sekunder by `profiles.full_name` (A→Z). | Ranking deterministik & adil; test ranking stabil. |
| D12 | **Role change tengah periode** | Formula dikunci pada **level user saat `open_period_snapshot`**. Perubahan role berlaku periode berikutnya. | Snapshot level saat buka periode (atau resolve assignment efektif pada `period_start`). |
| D13 | **Visibility config formula** | **Transparan dalam org.** RLS SELECT `score_formula_*` org-scoped untuk semua anggota (boleh baca bobot/kategori semua level). Tulis tetap gated `manage_score_formula`. | "Tahu apa yang dinilai" mengurangi kecurigaan. |

### Keputusan minor terkait (default terkunci, bukan pemblokir)
- **Close timing** (OQ-4): **manual** oleh user berwenang via Settings (atomik, AC-7.19). Penjadwalan otomatis defer.
- **Reciprocal override** (OQ-11): dengan single-actor (D10), mitigasi = anti-self + `activity_logs` append-only (semua override auditable). Pola resiprokal (A override B, B override A) = residual risk diterima V1; terdeteksi via audit, bukan blok otomatis.
- **User non-aktif** (OQ-15): baris skor historis dipertahankan; disembunyikan dari daftar People aktif (tanpa badge), tetap tampil di `ranking_snapshots` periode tertutupnya.

### Keterbatasan teknis V1 (ditemukan saat TDD red phase 2026-06-25)
- **`governance_violations` row pada override attempts yang ditolak TIDAK persist di V1.** PostgreSQL semantics: ketika `override_user_score` melakukan `insert into governance_violations` lalu `raise exception` (anti-self / unauthorized / closed period), caller's exception handler men-rollback savepoint termasuk row violation tersebut. Tanpa autonomous transaction (butuh `dblink`/`pg_background`/Edge Function — out-of-scope V1), audit row hanya persist pada **SUCCESS path** (`activity_logs 'score_override_applied'`). Self-attempt & unauthorized-attempt logging defer ke Fase 8. AC-7.17/7.18 versi V1 hanya mengunci: exception bahasa Indonesia yang benar fires; audit row pada attempt jadi nice-to-have, tidak wajib.

### Catatan UX/operasi yang dikunci dari review (tangani saat implementasi)
- **Non-Staff tanpa skor V1** (terkait D7): CEO/C-Level/Management belum punya formula aktif → People mereka menampilkan copy eksplisit (mis. "Skor untuk level ini menyusul setelah sumber data tersedia"), **bukan** kesan bug.
- **`role_template_id` NULL** (terkait AC-7.28): user tanpa level di-skip kalkulasi → People beri indikator "Belum memiliki level" alih-alih kosong tanpa penjelasan; onboarding/seed sebaiknya mengisi `role_template_id`.
- **`period_snapshots` satu-active-per-org**: aman untuk V1 (hanya Staff, satu cadence). **Tension menunggu** saat level-atas aktif dengan cadence berbeda (mingguan vs bulanan) — perlu di-scope ulang per-cadence di fase lanjut.
- **Cakupan supervisor luas** (D1/D2): rantai PIC-induk penuh berarti PIC card tinggi melihat skor seluruh turunan ber-PIC. Diterima sadar untuk V1 ("bertanggung jawab atas cabang").

## 1. Problem & Goals

Setelah Fase 0–6, RencanApp punya loop eksekusi terkunci (Action Plan one-time + repeat, Instance, Submission + versioning, Review anti-self-approval, Repeat Compliance, Governance Violation, kontribusi Development Workspace) — semua append-only & evidence-locked. Namun belum ada cara objektif menjawab "siapa berkinerja seperti apa". Surface `People` (`mobile/src/app/(app)/(tabs)/people.tsx`) masih shell: hanya nama + email via `listOrgProfiles()`, dengan `ScoreBadge` yang merender `p.score` bila non-null. `mobile/src/lib/score.ts` hanya semantik band UI (0–100) tanpa kalkulasi/persistensi. Tidak ada satupun tabel skor di DB (0001–0012).

Fase 7 mengubah data eksekusi terkumpul menjadi **Achievement Score** yang dihitung, ber-versi, dan auditable.

**Goals:** G1 People membaca skor nyata + breakdown metrik + ranking + trend. G2 Score Formula berbobot per level dengan total wajib 100%. G3 Reuse data Fase 1–6 tanpa sumber data baru. G4 Versioning mengunci sejarah (perubahan = versi baru). G5 Manual override append-only (auto+manual+reason+changed_by+approved_by+timestamp). G6 Ranking snapshot + trend ter-freeze per periode. G7 Tujuh tabel target dengan invarian governance utuh. G8 Output eksekutabel ke `tdd-plan`.

> [!warning] Risiko adopsi (BUILD-PLAN Fase 7; PRD §87)
> "Skor di atas data kosong = mainan yang melukai kepercayaan." Codebase Fase 7 boleh dibangun sekarang; aktivasi produksi hanya setelah Fase 1–3 berjalan berminggu-minggu dengan data nyata. Spec menulis kemampuan; kapan menyalakannya = keputusan operasi.

## 2. Non-Goals

Lihat daftar `non_goals` (NG1–NG13). Inti: bukan KPI formal; tidak ada `weight` di planning card; tidak menambah metrik di luar default; tidak ada AI/sosial scoring; tidak ada label menghina; reuse permission model (`manage_score_formula` sudah di-seed Fase 0, `user_role_level()` ada di 0005); tidak ada `confidential_access_rules` (Fase 8); PIC induk tidak dihukum atas skor anak; MBR bukan gate; data layer = file BARU `people-score.ts`; tidak ada tabel `departments`.

## 3. Koreksi fakta skema (diverifikasi terhadap 0001–0012)

| Klaim grill/riset | Fakta terverifikasi | Dampak |
|---|---|---|
| `period_snapshots` "sudah ada / kolaborasi Fase 1–7" | **TIDAK ADA** di 0001–0012 (grep 0 hasil) | Tabel BARU murni di 0013. Hapus klaim "sudah ada". |
| `profiles.role_level` kolom langsung | **Tidak ada**; level via `profiles.role_template_id → role_templates.level` (`user_role_level()` 0005:11) | Resolusi level pakai helper ini; tangani `role_template_id` NULL. |
| `reuse get_repeat_compliance` per-user | `get_repeat_compliance(p_action_plan_id)` adalah **per-action-plan** (0007:518) | Butuh fungsi agregasi per-user BARU. |
| `review_pass_rate` dari `reviews` | `reviews.decision` = `'approve'/'reject'`; `action_plan_submissions.review_status` = `'approved'` (0005:97,140) | Pakai `submissions.review_status='approved'`. |
| `result_achievement` dari result values | `action_plan_result_values.value_text` TEXT, **tanpa target** (0005:111-119) | Tidak ada achievement % deterministik → defer dari V1 default (NG11). |
| severity hanya 3 tier (medium/high/critical) | Kolom CHECK = **4 tier** `low/medium/high/critical` (0007:17-18); notifikasi hanya fire medium+ (0008:587) | Normalisasi governance pakai 4 tier; 'low' tetap data valid. |
| `action_plans.completed_at` | **Tidak ada** (hanya start_date/deadline/created_at/updated_at, 0005:62-88) | Period-window kolom tanggal harus diputuskan (open question). |

## 4. User Stories (ringkas)

- **A — Score Manager** (`manage_score_formula`): lihat 4 template default; custom + aktifkan dengan guard 100%; versioning (perubahan = versi baru); assign versi ke level/user.
- **B — Penilaian & periode**: buka/aktifkan periode (`open_period_snapshot`); hitung skor dari data eksekusi (`calculate_period_scores`); tutup periode + freeze ranking (`close_period_snapshot`, atomik).
- **C — Manual override**: override skor dengan jejak audit append-only (`override_user_score`); anti-self-override.
- **D — People surface**: lihat profil + Achievement Score + breakdown + ranking + trend; lihat skor sendiri selalu; visibility skor orang lain dibatasi permission; tombol override hanya untuk berwenang.

## 5. Functional Requirements

Penomoran: FR-7.1 Categories, 7.2 Template/Versioning, 7.3 Assignment, 7.4 Period, 7.5 Calculation, 7.6 Override, 7.7 Ranking/Trend, 7.8 People, 7.9 Permission/RLS/Audit, 7.10 Aktivasi. **[GOV]** = invarian mengikat.

**FR-7.1** `score_categories` tabel referensi (bukan enum); `(organization_id, code, level)` unik; tiap kategori dipetakan ke satu `source_metric`. **[GOV]** tidak menambah `weight` ke planning card.

**FR-7.2** 4 template default per org. **[GOV]** Setiap perubahan = INSERT `score_formula_versions` baru. **Representasi kanonik: `status` enum (`draft`/`active`/`archived`)** — bukan `is_active` boolean. **[GOV]** Aktivasi menolak SUM(weight)≠100 (ditegakkan di RPC, bukan CHECK constraint). Tidak ada revert in-place; tidak ada hard-delete (soft-archive).

**FR-7.3** `score_formula_assignments` (`scope_level` ∈ `org_role`|`user`; `department` di-defer). Versi baru → tutup assignment lama (`end_date`), buat baru. Mendukung query "versi mana aktif untuk role X tanggal Z".

**FR-7.4** `period_snapshots` (**tabel BARU 0013**) status `draft`→`active`→`closed`. **[GOV]** Periode closed read-only mutlak. **[GOV]** Formula version terkunci **per-baris `user_score_results.score_formula_version_id`** (BUKAN kolom tunggal di `period_snapshots` — org multi-level pakai formula berbeda di periode sama). **[GOV]** `close_period_snapshot` atomik + tidak ada partial close. Satu periode `active` per org (guard).

**FR-7.5** Skor dari data eksekusi Fase 1–6, ditulis hanya via RPC `SECURITY DEFINER`. Skor = SUM(metric_value_0..100 × weight/100). Definisi metrik (computable di V1):
- `action_plan_completion` = `action_plans` one-time done ÷ ditugaskan (kolom tanggal window: open question).
- `repeat_compliance` = instance done tepat waktu ÷ total non-archived (`submitted_late`, `status='missed'`), fungsi agregasi per-user BARU.
- `on_time_rate` = instance tepat waktu ÷ total (missed MASUK penyebut); NULLIF guard.
- `review_pass_rate` = `action_plan_submissions.review_status='approved'` ÷ count(*).
- `development_contribution` = `initiatives` (`problem_statement_id` non-null & `pic_id=user`) done ÷ total; 0 dev → 0%.
- `governance_discipline` = clamp(100 − penalti_severity, 0, 100) dari `governance_violations`.
- `result_achievement`: **tanpa sumber numerik** → defer dari V1 default (open question).

**[GOV]** PIC induk tidak mewarisi skor anak. **[GOV]** `role_template_id` NULL → user di-skip deterministik. **[GOV]** MBR tidak memblokir; hanya via `governance_discipline`.

**FR-7.6** **[GOV]** Override append-only: `auto_calculated_score` immutable, baris baru `result_kind='override'`. **[GOV]** Hanya `manage_score_formula`; RPC cek server-side. **[GOV]** Anti-self-override → `governance_violations` 'critical'. **[GOV]** activity_logs `score_override_applied`. Reason wajib. Override periode closed ditolak.

**FR-7.7** Ranking di-freeze saat close (`ranking_snapshots`: rank_number, score, metric_breakdown JSONB skala 0–100). **[GOV]** Immutable setelah closed. Trend = perbandingan antar period (window/visual: open question). **[GOV]** Hanya metrik objektif, no label menghina.

**FR-7.8** People 11 item; `ScoreBadge` otomatis saat `p.score` non-null; null vs 0 dibedakan (null → GuidanceNote; 0 nyata → band attention). Breakdown = nama + persentase tanpa label bobot. Baca via `mobile/src/lib/people-score.ts`.

**FR-7.9** **[GOV]** Tulis via RPC, baca via RLS. **[GOV]** `manage_score_formula` gate formula/override. RLS `user_score_results`/`ranking_snapshots`: SELECT `user_id=auth.uid()` ATAU `manage_score_formula`/CEO/`view_all_workspace` ATAU supervisor (helper `is_supervisor_of` belum ada — open question). Tabel formula: gate RPC + RLS SELECT org-scoped. **[GOV]** activity_logs + governance_violations append-only. RPC heavy di-revoke sesuai pola 0003.

**FR-7.10** Infrastruktur boleh dibangun; aktivasi produksi pasca Fase 1–3 matang.

## 6. Data Contracts (migrasi 0013)

Mengikuti pola 0005–0012: helper `SECURITY DEFINER set search_path=''`, `revoke execute … from public, anon`, tulis-via-RPC, baca-via-RLS, `write_activity` append-only. Tidak ada `weight` di planning card.

### Tabel (ringkas DDL)
- **`score_categories`** (org, code, label, level, source_metric, archived_at; unique (org,code,level)).
- **`score_formula_templates`** (org, name, level, is_default, archived_at, created_by).
- **`score_formula_versions`** (org, template_id, version_number, level, `categories jsonb` `[{code,weight,source_metric}]`, **`status` ∈ draft/active/archived**, effective_date, change_reason, created_by, approved_by nullable, activated_at; unique (template_id,version_number)). Bobot 100% di RPC activate, bukan CHECK.
- **`score_formula_assignments`** (org, formula_version_id, scope_level ∈ org_role/user, role_level, user_id, start_date, end_date, assigned_by). `department` di-defer.
- **`period_snapshots`** (org, period_name, period_start, period_end, status draft/active/closed, closed_at, closed_by, created_by; check period_end≥period_start). **TANPA** `active_formula_version_id`. Partial unique: satu `active` per org.
- **`user_score_results`** (org, period_snapshot_id, user_id, score_formula_version_id, `auto_calculated_score numeric(6,2)` immutable, `manual_adjusted_score`, `metric_breakdown jsonb` (skala 0–100), override_reason/changed_by/approved_by/changed_at, **`result_kind` ∈ 'auto'|'override'**, `is_current bool`, calculated_at). Partial unique (period_snapshot_id,user_id) where is_current. `effective_score = coalesce(manual_adjusted_score, auto_calculated_score)`.
- **`ranking_snapshots`** (org, period_snapshot_id, user_id, rank_number, score numeric(6,2), metric_breakdown jsonb; unique (period_snapshot_id,user_id)).

### RPC
| RPC | Param | Return | Gate |
|---|---|---|---|
| `upsert_score_formula_version` | template_id, categories, change_reason | uuid (draft) | `manage_score_formula` |
| `activate_score_formula_version` | version_id, effective_date | void | permission + SUM(weight)=100 |
| `assign_score_formula` | version_id, scope_level, role_level, user_id, start_date | uuid | permission; tutup lama |
| `open_period_snapshot` | period_name, start, end | uuid (active) | permission; guard 1 active/org |
| `calculate_period_scores` | period_snapshot_id | int | permission; idempotent; tidak menimpa override |
| `close_period_snapshot` | period_snapshot_id | int | permission; atomik |
| `override_user_score` | period_snapshot_id, user_id, manual_score, reason | uuid | permission + anti-self + reason wajib |

**Idempotency vs override:** `calculate_period_scores` men-supersede baris `result_kind='auto'` (is_current=false → insert auto baru) TANPA menyentuh baris `result_kind='override'`. `auto_calculated_score` tidak pernah hilang.

### TypeScript / data layer
File BARU `mobile/src/lib/people-score.ts` (paralel `cards.ts`/`repeat.ts`). `score.ts` tetap murni semantik UI. `effectiveScore(r) = r.manual_adjusted_score ?? r.auto_calculated_score`. Reads: `getActivePeriod`, `listRanking`, `getMyScore`. Writes: `overrideUserScore` (via `supabase.rpc`). People enrichment: read-RPC `list_people_with_scores` (Opsi 1, bila visibility restriktif) vs client JOIN (Opsi 2) — tergantung keputusan visibility.

## 7. Acceptance Criteria

Lihat daftar `acceptance_criteria` (AC-7.1 … AC-7.35), Given/When/Then dapat diuji. Sorotan: AC-7.6 (version per-baris), AC-7.14 (idempotency tidak menimpa override), AC-7.28 (role via role_template_id + NULL skip), AC-7.29 (satu active/org), AC-7.23 (null vs 0), AC-7.26 (RLS read negatif).

## 8. Edge Cases & Error States

Reuse `SkeletonList`/`ErrorState`/`EmptyState`/`GuidanceNote` (`mobile/src/components/ui.tsx`). Reads ditolak RLS → list kosong (graceful, bukan error). Writes ditolak RPC → exception Indonesia. Empty (belum ada periode/skor) = state normal (GuidanceNote, bukan ErrorState). Pesan kunci: "Total bobot Score Formula harus tepat 100%. Saat ini X%.", "Anda tidak bisa mengubah score Anda sendiri.", "Alasan override wajib diisi.", "Periode ini sudah ditutup dan tidak bisa diubah.", "Anda tidak berwenang mengelola Score Formula.", "Penutupan periode gagal dan dibatalkan. Coba lagi." Clamp skor 0–100. Tie-breaker ranking & tampilan user non-aktif = open question.

## 9. Open Questions

Lihat daftar `open_questions`. PEMBLOKIR sebelum RLS read-path & surface final: (a) visibility People + helper `is_supervisor_of`, (b) definisi Trend, (c) period-window kolom tanggal per metrik, (d) rumus `governance_discipline` & resolusi `result_achievement`, (e) defer/seed metrik level-atas tanpa sumber data.

## 10. Handoff ke TDD

Lihat `tdd_handoff`. Migrasi target `0013_fase7_people_score.sql` (7 tabel baru + RPC + RLS + seed). Keputusan kanonik (jangan diubah TDD): version per-baris `user_score_results`; status enum (bukan is_active); bobot 100% di RPC; override append-only + `result_kind`; level via `role_template_id` (+ NULL skip); `review_pass_rate` dari `submissions.review_status`; agregasi repeat per-user BARU; metric scale 0–100; severity 4 tier di kolom; V1 hanya seed-aktif formula fully-computable (Staff). Invarian governance wajib lulus. Data layer = `mobile/src/lib/people-score.ts`. Sebelum menulis RLS read-path & surface Trend, resolusikan PEMBLOKIR di §9.

---

## Lampiran A — Acceptance Criteria (Given/When/Then)

1. AC-7.1 (bobot 100% wajib untuk aktivasi) — GIVEN sebuah score_formula_versions berstatus 'draft' dengan SUM(categories[*].weight) ≠ 100 (mis. 95 atau 105) WHEN user dengan manage_score_formula memanggil RPC activate_score_formula_version(version_id, effective_date) THEN RPC raise exception 'Total bobot Score Formula harus tepat 100%. Saat ini X%.', status versi TETAP 'draft', dan tidak ada user_score_results dihitung dari versi itu.
2. AC-7.2 (bobot tepat 100% bisa diaktifkan + versi lama dinonaktifkan) — GIVEN draft version dengan SUM(weight)=100 untuk (org, template/level) tertentu WHEN user berwenang mengaktifkannya THEN status versi → 'active', activated_at terisi, versi 'active' sebelumnya untuk template yang sama → 'archived', dan satu activity_logs bertipe 'score_formula_activated' tercatat (append-only).
3. AC-7.3 (seed default V1 = hanya kategori computable) — GIVEN org baru ter-seed Fase 7 WHEN default disiapkan THEN ter-seed score_categories + 4 template default (Staff/Management/C-Level/CEO); HANYA template/versi yang seluruh kategorinya computable dari Fase 0–6 yang otomatis diaktifkan; default Staff (7 kategori, SUM=100, tanpa result_achievement bila result_achievement belum punya sumber target) executable penuh. Template level-atas yang mengandung kategori non-computable disimpan sebagai 'draft' (tidak auto-active) sampai sumber data/override tersedia. Sumber kebenaran bobot = wiki score-formula.md (Management = 25+15+15+10+10+10+5+5+5 = 100%).
4. AC-7.4 (tidak ada weight di planning card) — GIVEN skema setelah migrasi 0013 WHEN schema diperiksa THEN tidak ada kolom weight/bobot pada goals, kpi_areas, strategies, initiatives, action_plans, development_areas, problem_statements; bobot HANYA di score_formula_versions.categories (JSONB).
5. AC-7.5 (perubahan formula = versi baru, bukan UPDATE in-place) — GIVEN template dengan versi aktif V1 WHEN user berwenang mengubah kategori/bobot via upsert_score_formula_version THEN INSERT baris score_formula_versions baru (version_number bertambah, status 'draft', created_by, change_reason, created_at); baris V1 tidak di-UPDATE dan tetap utuh.
6. AC-7.6 (skor historis pakai formula versi periodenya — terkunci per-baris) — GIVEN period P1 'closed' dan user_score_results P1 menunjuk score_formula_version_id=V1, lalu formula berubah ke V2 WHEN user_score_results P1 dibaca THEN skor P1 tetap merujuk V1 (FK user_score_results.score_formula_version_id=V1) dan tidak ter-recalculate oleh V2. (Catatan kanonik: version terkunci PER-BARIS user_score_results, BUKAN satu active_formula_version_id di period_snapshots.)
7. AC-7.7 (periode tertutup read-only) — GIVEN period_snapshots.status='closed' WHEN ada upaya UPDATE/DELETE baris periode itu, atau INSERT/UPDATE user_score_results/ranking_snapshots untuk periode itu via RPC THEN RPC menolak ('Periode ini sudah ditutup dan tidak bisa diubah.') dan data periode tertutup tidak berubah.
8. AC-7.8 (skor dihitung dari data eksekusi nyata Fase 1–6) — GIVEN user dengan data eksekusi pada window [period_start, period_end] WHEN RPC calculate_period_scores(period_id) dijalankan THEN user_score_results.auto_calculated_score = round(SUM(metric_value_kategori_0..100 × weight/100), 2) memakai formula versi efektif user; tidak ada sumber data di luar tabel Fase 1–6; result_kind baris = 'auto'.
9. AC-7.9 (repeat_compliance & on_time_rate dari data instance terkunci, agregasi per-user BARU) — GIVEN action_plan_instances milik user (pic_id=user) pada window dengan status submitted_late/done/missed WHEN metrik dihitung THEN repeat_compliance = (instance done tepat waktu) ÷ (total instance non-archived yang seharusnya dikerjakan), bersumber kolom terkunci (submitted_late, status='missed'), via fungsi agregasi per-user BARU (BUKAN reuse get_repeat_compliance(p_action_plan_id) yang per-action-plan). Pembagi on_time_rate didefinisikan eksplisit (missed MASUK penyebut).
10. AC-7.10 (metrik tanpa data dasar = 0%, tanpa division-by-zero) — GIVEN user tanpa instance / tanpa submission pada periode WHEN on_time_rate/review_pass_rate dihitung THEN count(*)=0 menghasilkan metric=0 (NULLIF guard, bukan error), perhitungan tidak crash, skor tetap terbentuk. (Berlaku hanya untuk kategori yang sumbernya ADA tapi kosong; kategori tanpa sumber data sama sekali tidak ikut V1 default — lihat NG11.)
11. AC-7.11 (review_pass_rate dari submissions, kolom benar) — GIVEN action_plan_submissions milik user (submitted_by=user) pada window WHEN review_pass_rate dihitung THEN nilainya = count(review_status='approved') ÷ count(*) dari action_plan_submissions (BUKAN dari tabel reviews.decision yang memakai 'approve'/'reject'); resubmit (reject→revisi) dihitung submission baru.
12. AC-7.12 (governance_discipline dari governance_violations, 4 tier nyata) — GIVEN user dengan/atau tanpa governance_violations (severity low/medium/high/critical — kolom CHECK 0007 mendukung 4 tier) pada window WHEN governance_discipline dihitung THEN nilai = 100 − normalisasi(penalti berbobot severity), di-clamp ke [0,100]; bobot penalti per severity ditetapkan konkret di kontrak (lihat open question untuk angka final bila belum dikunci).
13. AC-7.13 (PIC induk tidak menanggung skor turunan) — GIVEN user A PIC induk dari card yang PIC eksekutornya user B WHEN skor A dihitung THEN skor A hanya dari action_plan/instance di mana A pic_id sendiri, tidak diwarisi dari B.
14. AC-7.14 (idempotency calculate TIDAK menimpa override) — GIVEN periode aktif yang sudah dihitung dan satu user_score_results-nya sudah di-override (result_kind='override', is_current=true) WHEN calculate_period_scores dijalankan ULANG THEN baris auto lama di-supersede (is_current=false) dan baris auto baru di-insert, TETAPI baris override (result_kind='override') TIDAK dihapus/ditimpa dan tetap is_current=true; auto_calculated_score historis tidak pernah hilang.
15. AC-7.15 (override append-only menyimpan auto+manual+reason+approver) — GIVEN user_score_results dengan auto_calculated_score terisi WHEN user berwenang memanggil override_user_score(period, user, manual_score, reason) dengan reason non-kosong THEN baris BARU di-INSERT (result_kind='override', menyalin auto_calculated_score utuh, mengisi manual_adjusted_score/override_reason/override_changed_by/override_changed_at), baris current sebelumnya is_current=false, dan satu activity_logs 'score_override_applied' {previous_auto, new_manual, reason, changed_by, approved_by} tercatat.
16. AC-7.16 (override tanpa reason ditolak) — GIVEN override_user_score dipanggil dengan reason kosong/null WHEN dieksekusi THEN raise exception 'Alasan override wajib diisi.' dan tidak ada perubahan.
17. AC-7.17 (override menolak user tanpa wewenang + catat violation) — GIVEN user tanpa manage_score_formula WHEN ia memanggil override_user_score (menembus UI guard) THEN RPC raise exception 'Anda tidak berwenang mengelola Score Formula.', tidak ada perubahan skor, dan satu governance_violations severity 'critical' tertulis.
18. AC-7.18 (anti-self-override) — GIVEN user berwenang U WHEN U memanggil override_user_score dengan p_user_id = auth.uid() THEN raise exception 'Anda tidak bisa mengubah score Anda sendiri.' dan satu governance_violations severity 'critical' tertulis.
19. AC-7.19 (close periode atomik membekukan skor + ranking) — GIVEN periode aktif dengan skor user sudah dihitung WHEN user berwenang memanggil close_period_snapshot(period_id) THEN dalam SATU transaksi: ranking_snapshots (rank_number, score, metric_breakdown) ter-insert per user, period_snapshots.status→'closed' + closed_at + closed_by terisi; bila ada bagian gagal seluruhnya rollback (tidak ada partial close).
20. AC-7.20 (ranking snapshot immutable setelah closed) — GIVEN ranking_snapshots untuk periode closed WHEN ada upaya re-rank/UPDATE/DELETE THEN ditolak; ranking historis tetap utuh.
21. AC-7.21 (clamp skor 0–100) — GIVEN penalti governance_discipline yang menghasilkan nilai < 0 sebelum cap WHEN skor disimpan THEN metric & skor akhir di-clamp ke [0,100] sebelum INSERT (scoreBand() di score.ts mengasumsikan 0–100).
22. AC-7.22 (People menampilkan Achievement Score + metrik objektif) — GIVEN periode aktif dengan skor terisi dan user punya akses People WHEN People dibuka THEN menampilkan Profile, Achievement Score (ScoreBadge dari p.score non-null), serta Action Plan Completion, Repeat Compliance, On-Time Rate, Review Pass Rate, Result Achievement, Development Contribution, Governance Discipline, Ranking, Trend (sesuai metrik yang aktif di formula). Breakdown menampilkan nama kategori + persentase, TANPA label bobot.
23. AC-7.23 (null vs 0 dibedakan di People) — GIVEN user yang skornya BELUM dihitung (tidak ada user_score_results) vs user dengan auto_calculated_score=0 nyata WHEN People dirender THEN ScoreBadge TIDAK muncul untuk yang null (p.score==null → GuidanceNote 'Score menyusul'), TAPI MUNCUL band 'attention' untuk skor 0 nyata. Skor 0 di atas data kosong tidak ditampilkan sebagai 'hasil final'.
24. AC-7.24 (tidak ada label mempermalukan) — GIVEN data skor apa pun termasuk rank terbawah WHEN People menampilkan user THEN hanya data objektif; tidak ada label 'karyawan terburuk/staff malas/manager gagal'; band terendah = 'Perlu perhatian'.
25. AC-7.25 (editor Score Formula hanya untuk berwenang, defense-in-depth) — GIVEN user tanpa manage_score_formula WHEN ia membuka Settings THEN menu/editor Score Formula tidak tampil DAN RPC formula menolak panggilan langsung di server.
26. AC-7.26 (RLS read negatif konkret) — GIVEN Staff X yang BUKAN diri sendiri, bukan supervisor/PIC-induk Staff Y, bukan pemegang manage_score_formula/CEO/view_all_workspace WHEN X query user_score_results milik Y via PostgREST langsung THEN 0 baris kembali (graceful, BUKAN error); Search atas skor mengikuti RLS yang sama (PRD §79). (Catatan: bergantung pada keputusan visibility + helper is_supervisor_of — open question pemblokir.)
27. AC-7.27 (skor sendiri selalu terbaca) — GIVEN Staff S WHEN S query user_score_results/ranking_snapshots miliknya THEN RLS mengizinkan user_id = auth.uid() membaca barisnya sendiri.
28. AC-7.28 (resolusi level via role_template_id + handling NULL) — GIVEN user dengan role_template_id NULL (tidak punya level) WHEN calculate_period_scores berjalan THEN user tsb di-SKIP secara deterministik (tidak error, tidak menggagalkan atomicity batch) dan tercatat alasan skip; level diresolusi via profiles.role_template_id → role_templates.level (BUKAN kolom profiles.role_level yang tidak ada).
29. AC-7.29 (satu periode active per organisasi) — GIVEN org sudah punya period_snapshots.status='active' WHEN open_period_snapshot dipanggil lagi untuk org yang sama THEN ditolak (partial unique index atau RPC guard) dengan pesan jelas.
30. AC-7.30 (semua perubahan formula & override append-only di audit) — GIVEN operasi buat versi / aktifkan versi / override skor / tutup periode WHEN berhasil THEN masing-masing menulis activity_logs (score_formula_changed / score_formula_activated / score_override_applied / period_closed) yang tidak bisa diedit/dihapus dari UI.
31. AC-7.31 (no hard delete pada tabel skor/audit) — GIVEN score_formula_templates/versions, user_score_results, ranking_snapshots, period_snapshots, activity_logs, governance_violations WHEN ada permintaan hapus THEN tidak ada cascade/hard delete; template & versi hanya soft-archive (archived_at/status='archived'), sisanya append-only.
32. AC-7.32 (MBR tidak memblokir perhitungan skor) — GIVEN governance_violations terkait MBR pada periode WHEN skor dihitung THEN pelanggaran MBR hanya menurunkan metrik Governance Discipline; tidak ada logika MBR yang membatalkan perhitungan, dan tidak ada bobot card dibuat.
33. AC-7.33 (mobile tidak menulis langsung ke tabel skor) — GIVEN mobile client (mobile/src/lib/people-score.ts) WHEN operasi tulis skor (calculate/override/close) dipicu THEN semua lewat supabase.rpc(...); baca lewat select PostgREST ter-RLS; tidak ada .insert()/.update()/.delete() langsung ke tabel skor dari client.
34. AC-7.34 (RPC heavy di-revoke dari authenticated bila sistem) — GIVEN RPC calculate_period_scores & close_period_snapshot WHEN grant diperiksa THEN keduanya SECURITY DEFINER set search_path='' dan di-revoke dari public, anon; bila ditetapkan sebagai RPC sistem, juga di-revoke dari authenticated (dipanggil hanya via jalur terotorisasi) — keputusan grant/revoke spesifik dikunci di kontrak.
35. AC-7.35 (metric_breakdown skala 0–100 konsisten) — GIVEN metric_breakdown JSONB di user_score_results & ranking_snapshots WHEN diinspeksi THEN tiap nilai metrik pada skala 0–100 (bukan 0–1), konsisten dengan effectiveScore, ranking.score, dan ScoreBadge/scoreBand.

## Lampiran B — Testable Behaviors

- activate_score_formula_version menolak SUM(categories[*].weight) ≠ 100 dengan exception berbahasa Indonesia; status versi tetap 'draft'.
- activate_score_formula_version dengan SUM=100 men-set status='active', mengisi activated_at, meng-arsipkan versi active sebelumnya per template, dan menulis activity_logs 'score_formula_activated'.
- upsert_score_formula_version meng-INSERT baris versi baru (version_number naik, status 'draft') tanpa meng-UPDATE versi lama.
- calculate_period_scores menulis user_score_results.auto_calculated_score = round(SUM(metric_0..100 × weight/100),2) dengan result_kind='auto', is_current=true, score_formula_version_id terisi per user.
- Re-run calculate_period_scores men-supersede baris auto (is_current=false → insert auto baru) TANPA menghapus/menimpa baris result_kind='override' yang is_current.
- Fungsi agregasi per-user BARU menghitung repeat_compliance & on_time_rate dari action_plan_instances (pic_id=user, exclude archived) memakai kolom submitted_late & status='missed'; pembagi on_time_rate menyertakan 'missed'.
- review_pass_rate dihitung dari action_plan_submissions.review_status='approved' ÷ count(*) (submitted_by=user), BUKAN dari reviews.decision.
- Metrik dengan count(*)=0 menghasilkan 0 (NULLIF guard) bukan division-by-zero.
- governance_discipline = clamp(100 − penalti_severity, 0, 100) dari governance_violations (user_id=user) pada window; nilai akhir dalam [0,100].
- User dengan role_template_id NULL di-SKIP deterministik oleh calculate_period_scores (tidak error, tidak menggagalkan batch), level diresolusi via role_templates.level.
- override_user_score menolak reason kosong; menolak p_user_id=auth.uid() (anti-self) + menulis governance_violations 'critical'; menolak user tanpa manage_score_formula + menulis governance_violations 'critical'.
- override_user_score sukses meng-INSERT baris result_kind='override' (menyalin auto_calculated_score utuh, mengisi manual_adjusted_score/reason/changed_by/changed_at), men-set baris current lama is_current=false, dan menulis activity_logs 'score_override_applied'.
- override_user_score & calculate_period_scores menolak periode status='closed' dengan exception.
- close_period_snapshot atomik: insert ranking_snapshots per user + set status='closed'+closed_at; gagal di tengah → rollback penuh (tidak ada partial close); menulis activity_logs 'period_closed'.
- ranking_snapshots & user_score_results periode closed menolak UPDATE/DELETE.
- open_period_snapshot menolak pembuatan periode kedua saat sudah ada status='active' untuk org (partial unique index/guard).
- RLS user_score_results/ranking_snapshots: SELECT user_id=auth.uid() selalu lolos; user di luar scope visibility mendapat 0 baris (bukan error).
- people-score.ts effectiveScore(r) mengembalikan manual_adjusted_score ?? auto_calculated_score (skala 0–100).
- People merender ScoreBadge hanya saat p.score non-null; p.score null → GuidanceNote 'Score menyusul'; skor 0 nyata → band 'attention'.
- metric_breakdown JSONB menyimpan tiap metrik pada skala 0–100 konsisten dengan scoreBand().
- Tidak ada kolom weight pada goals/kpi_areas/strategies/initiatives/action_plans/development_areas/problem_statements setelah 0013.
- calculate_period_scores & close_period_snapshot adalah SECURITY DEFINER set search_path='' dan di-revoke dari public, anon (dan authenticated bila RPC sistem).

## Lampiran C — Open Questions

1. [PRODUK — PEMBLOKIR RLS] Visibility People belum didefinisikan PRD §59.4 ('Staff boleh lihat People sesuai visibility'). Siapa boleh lihat skor siapa? Ranking GLOBAL se-org (papan peringkat publik) ATAU per-tim/restriktif (sendiri + atasan/PIC-induk + manage_score_formula + view_all_workspace)? Keputusan ini menentukan: RLS SELECT user_score_results/ranking_snapshots, apakah helper is_supervisor_of() diperlukan, scope ranking_snapshots (perlu scope_id?), dan apakah People pakai read-RPC (Opsi 1) vs client JOIN (Opsi 2). HARUS diputuskan produk sebelum RLS read-path final ditulis (AC-7.26 default restriktif sampai diklarifikasi).
2. [ENG/GOV — PEMBLOKIR RLS] Helper is_supervisor_of(user_id) BELUM ADA di skema (0001–0012; hanya is_problem_statement_pic ada). Bila visibility restriktif dipilih, helper PIC-induk→PIC-anak harus didefinisikan secara non-rekursif tanpa kena gotcha 42501 (inline kolom, bukan self-requery). Bila tidak ada chain supervisor formal, putuskan visibility tanpa cabang 'atasan'.
3. [PRODUK — PEMBLOKIR SURFACE] Definisi Trend belum ada (PRD §65 hanya 'Trend performa'). Window/granularitas (per-periode? 7/30 hari? semester?) dan visual (sparkline vs ↑/↓ + delta) tidak terdefinisi. Item People ke-11 tidak dapat diimplementasi/ditest tanpa keputusan ini.
4. [PRODUK/GOV] Trigger & timing close periode + pembuatan snapshot: manual oleh user berwenang via Settings, terjadwal (pg_cron seperti Fase 2 mark_overdue_instances), atau otomatis di batas periode? Granularitas periode (mingguan/bulanan/semester/custom) belum ditetapkan. Spec mengasumsikan close manual + atomik (AC-7.19).
5. [ENG — PEMBLOKIR KALKULASI] Period windowing: kolom tanggal mana yang memfilter tiap metrik? action_plans TIDAK punya completed_at/done_at (hanya start_date, deadline, created_at, updated_at — verified 0005:62-88). 'Action Plan Completion dalam periode' tidak deterministik. Putuskan: pakai deadline, updated_at-saat-done, action_plan_instances.deadline_at (repeat), ATAU tambah kolom completed_at di 0013.
6. [ENG/GOV — PEMBLOKIR KALKULASI] result_achievement tidak punya sumber numerik: action_plan_result_values menyimpan value_text TEXT + value_type TANPA target/expected (verified 0005:111-119). Tidak ada 'achievement %' yang bisa diturunkan. Putuskan: (a) keluarkan dari V1 default & re-normalisasi bobot ke 100% (rekomendasi spec — NG11), (b) tambah kolom target di 0013, atau (c) definisikan proxy dari kolom yang ada.
7. [GOV — PEMBLOKIR KALKULASI] Rumus konkret governance_discipline: bobot penalti numerik per severity (low/medium/high/critical) dan normalisasi ke 0–100 belum ditetapkan PRD §74. Tanpa angka tetap, metrik tidak deterministik/testable. (Catatan: kolom severity CHECK mendukung 4 tier; notifikasi hanya fire untuk medium+.)
8. [ENG] Definisi Development Contribution: initiative-level (initiatives where problem_statement_id is not null & pic_id=user, count done÷total) ATAU action-plan-instance-level di dalam Development? Dua definisi memberi angka berbeda; pilih satu kanonik.
9. [PRODUK/ENG — PEMBLOKIR SEED LEVEL-ATAS] Metrik Management/C-Level/CEO tanpa sumber data Fase 0–6: Profit/Growth, Leadership Team Health, Strategic Portfolio Health, Cross-functional Execution, dan agregat KPI Area/Goal Achievement/Strategy Completion/Team metrics belum dipetakan ke tabel/rumus. Untuk V1 spec men-defer template level-atas (NG11). Konfirmasi: defer total, ATAU seed sebagai draft manual-input-only, ATAU subset computable saja?
10. [GOV] Semantik approved_by override: single-actor (changed_by berwenang = override langsung berlaku, approved_by opsional/self-attested) ATAU two-actor wajib (separation of duties, approved_by ≠ changed_by ≠ target)? PRD §72 menyimpan kolom tapi tidak menyatakan approval wajib. Mempengaruhi kekuatan anti-abuse override.
11. [GOV] Risiko residual reciprocal override (A override B, B override A): anti-self-override hanya memblok self. Perlu deteksi/catat pola resiprokal sebagai governance_violations, atau diterima sebagai residual risk?
12. [GOV] RLS SELECT score_formula_* (categories/templates/versions/assignments): config 'transparan dalam org' ATAU bobot formula sensitif (mengungkap apa yang dinilai)? Apakah Staff boleh membaca konfigurasi formula CEO?
13. [ENG] User pindah role_level di tengah periode (Staff→Management): formula mana berlaku — aktif saat periode dibuka, saat dihitung, atau saat ditutup? score_formula_assignments punya date range tapi pemilihan saat perubahan role tidak didefinisikan.
14. [PRODUK] Tie-breaker ranking saat skor identik (urutan alfabet, tanggal join, metrik sekunder, rank kembar?) tidak didefinisikan; tanpa aturan, ranking_snapshots.rank_number non-deterministik dan test ranking tidak stabil.
15. [PRODUK] User non-aktif/keluar org dengan skor historis: disembunyikan dari daftar aktif People (row dipertahankan) atau tetap tampil dengan penanda?
16. [PRODUK] Ranking live vs post-close: apakah ranking ditampilkan live dari user_score_results selama periode aktif, atau hanya muncul setelah close (ranking_snapshots di-freeze)?
