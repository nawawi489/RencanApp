---
type: source
tags: [spec, score, ranking, fase-7, ws-5, bridge, jembatan]
updated: 2026-07-19
sources: 8
status: draft-ready-for-tdd
milestone: V1.8.3-hotfix
basis: origin/staging @ d562f51 (migrasi 0077)
supersedes: draft v1 (2026-07-19 pra-grill)
---

> **Keputusan owner — dua putaran, semua terkunci 2026-07-19.**
>
> **Putaran 1** (sebelum grill):
>
> | # | Isu | Keputusan |
> |---|---|---|
> | **1** | Pemicu jalur Calculate + Snapshot | Tombol UI admin di `settings-score-formula.tsx` |
> | **2** | Eksekusi | Sync client-side (calc lalu snapshot berurutan) |
> | **3** | Semantik override manual pasca-snapshot | FREEZE (server E1 dipertahankan) |
>
> **Putaran 2** (pasca-grill; menyelesaikan 3 blocker + 1 major):
>
> | # | Isu | Keputusan |
> |---|---|---|
> | **4** | Race dua-tab (Engineer F-2/F-3) | **Migrasi 0079**: `pg_advisory_xact_lock` di calculate & close (surgical; membatalkan klaim "no migration" v1) |
> | **5** | Reminder period-end (Product F-1) | NG-8: defer ke spec follow-up `score-period-end-nudge`. Backlog explicit di §11. |
> | **6** | Escape hatch pasca-close (Governance F-9) | Accept sadar; ADR baru `wiki/concepts/score-period-immutability.md`. Koreksi = periode berikutnya. |
> | **7** | Label tombol (Product F-4) | **"Finalisasi Periode & Peringkat"** (Indonesia konsisten) |

> **Ringkasan eksekutif.** V1.83 kehilangan jembatan pengeksekusi Score/Ranking: `close_period_snapshot` menghitung `ranking_snapshots` dengan menjoin `user_score_results`, tapi `calculate_period_scores` — satu-satunya sumber baris `user_score_results` — tidak pernah dipanggil dari UI (verified: nol caller di luar test-nya sendiri). Akibatnya setiap kali Owner menekan "Tutup Periode", ranking snapshot terbuat dengan 0 baris dan seluruh fitur Ranking mati diam-diam. **Solusi**: tombol tunggal "Finalisasi Periode & Peringkat" menggantikan "Tutup Periode" di `settings-score-formula.tsx`, membuka modal dua-langkah yang menampilkan pratinjau angka lalu memanggil dua RPC berurutan dalam satu tab yang di-serialisasi server via advisory lock. Satu migrasi kecil (0079), nol perubahan RPC signature — hanya kabel client yang hilang plus guard concurrency.
>
> **Kaveat penting** (dari grill Engineering F-10): bug ini reachable **hanya untuk organisasi yang sudah punya periode aktif** (via seed SQL, migration, atau path yang sejak V1.8.2 tidak lagi ada di UI). Screen `open_period_snapshot` UI **tidak ada** di baseline. Sampai spec follow-up "buka periode" dijadwalkan, jembatan finalization ini akan bermanfaat untuk staging seed dan legacy production instances — bukan flow lengkap. NG-2 tetap.

# Spec — Jembatan Score/Ranking Finalization

## 0. Basis & metodologi verifikasi

> [!warning] Baca ini sebelum apa pun
> Baseline: **`origin/staging` @ `d562f51`** (`git fetch` 2026-07-19; migrasi tertinggi `0077_activation_bypass_and_confidential_holes.sql`).
>
> **Aturan mengikat**: verifikasi baseline dengan `git ls-tree --name-only origin/staging supabase/migrations/`, bukan `ls` di working tree — worktree ini di `d12914a` (migrasi 0075) dan tertinggal dari staging.

Fakta baseline terverifikasi (2026-07-19):

| Fakta | Nilai | Sumber |
|---|---|---|
| Migrasi tertinggi | `0077` (spec ini mengklaim **`0079`**) | `git ls-tree` |
| `calculate_period_scores(uuid) → int` | LIVE, SECURITY DEFINER, gate `manage_score_formula`, guard cross-org via 0039, revoke anon/PUBLIC via `0013:621` + sweep `0050` | `supabase/migrations/0013:500-621` + `0039:23-152` + `0050` |
| `close_period_snapshot(uuid) → int` | LIVE, SECURITY DEFINER, gate + guard sama, revoke anon/PUBLIC via `0013:672` + `0050` | `0013:625-672` + `0039:154-208` + `0050` |
| `override_user_score(uuid,uuid,numeric,text) → uuid` | LIVE, menolak periode closed (FREEZE), revoke via `0013:740` + `0050` | `0013:676-740` + `0039:211-282` |
| `open_period_snapshot(text,date,date) → uuid` | LIVE tapi **nol UI caller** — bug reachable hanya untuk org dengan periode seeded/legacy | `Grep openPeriodSnapshot mobile/src` → 2 hits (definisi + test) |
| Calculate menulis `activity_logs` | `event_kind='scores_calculated'` untuk period tsb | `0013:616-617` |
| Close menulis `activity_logs` | `event_kind='period_closed'` (verifikasi saat implementasi) | `0013:667` (perkiraan) |
| Tombol jembatan | **HILANG** — `settings-score-formula.tsx:491-495` hanya memanggil close, bukan calculate | verified |
| Modal existing | `mobile/src/components/close-period-modal.tsx` (bukan di `settings/`) | Grep-verified |
| `useCalculatePeriodScores` hook | **TIDAK ADA** | verified |
| `use-people-score.ts` path | `mobile/src/hooks/use-people-score.ts` (bukan `lib/`) | Grep alias `@/hooks/use-people-score` |
| `user_score_results` partial unique | `ux_user_score_results_one_current on (period_snapshot_id, user_id) where is_current` | `0013:146-147` |
| `ranking_snapshots` unique | `UNIQUE (period_snapshot_id, user_id)` | `0013:164` |
| Trigger `..._no_delete` | Append-only enforce di 3 tabel Fase 7 | `0013:187-193` |

> **Koreksi baseline dari draft v1**: (a) migration 0071 di draft v1 KELIRU sebagai sumber ACL revoke — sumber sebenarnya `0013` inline + `0050` sweep; (b) draft v1 mengklaim "tidak butuh migrasi" — batal, dengan migrasi 0079 tambahan (advisory lock).

---

## 1. Problem

### 1.1 Bug jembatan yang menyembunyikan seluruh fitur Ranking

Alur yang dimaksudkan oleh `specs/fase-7-people-score.md`:

```
Owner tekan tombol finalize pada period aktif
  ├─ calculate_period_scores(periodId)   → mengisi user_score_results (result_kind='auto', is_current=true)
  └─ close_period_snapshot(periodId)     → INSERT INTO ranking_snapshots SELECT FROM user_score_results
                                           SET period_snapshots.status = 'closed'
```

Yang **benar-benar dijalankan** di V1.83:

```
Owner tekan "Tutup Periode" pada period aktif
  └─ close_period_snapshot(periodId)     → INSERT INTO ranking_snapshots
                                           SELECT FROM user_score_results  ← KOSONG
                                           → 0 baris tersimpan
                                           SET period_snapshots.status = 'closed'
```

**Bukti** (verified 2026-07-19 branch `fix/permission-key-href-sweep`):

- `mobile/src/lib/people-score.ts:361` mendefinisikan `calculatePeriodScores`.
- `Grep -r "calculatePeriodScores" mobile/src` → 2 hits: `people-score.ts` (definisi) + `people-score.test.ts` (unit). **Nol caller UI/hook.**
- `mobile/src/hooks/use-people-score.ts` mengekspor `useClosePeriod` (WS-5) dan `useScoreOverride` — tidak ada `useCalculatePeriodScores`.
- `settings-score-formula.tsx:491-495` memanggil `useClosePeriod` langsung tanpa `calculate` sebelumnya.

### 1.2 Konsekuensi produk yang terverifikasi

1. **People screen** menampilkan "Peringkat tampil setelah periode score ditutup." selamanya, karena setiap `ranking_snapshots` baru berisi 0 baris.
2. **Orb ranking Home** (kalau ada surface yang membaca `ranking_snapshots`) menampilkan state kosong palsu.
3. **Manual Score Override** bekerja tapi tidak berdampak: override menyentuh `user_score_results`, sementara `ranking_snapshots` (yang dibaca leaderboard) sudah kosong sejak awal.
4. **Owner mengalami irreversibility diam-diam**: sekali "Tutup Periode" berhasil dengan 0 baris ranking, `close_period_snapshot` menolak dipanggil lagi (`'Periode ini sudah ditutup dan tidak bisa diubah.'`) — tidak ada jalur pemulihan (kecuali membuka periode berikutnya; lihat §2.2 NG-9).

### 1.3 Kaveat reachability (baru; dari grill Engineering F-10)

Bug ini reachable **hanya untuk organisasi yang sudah punya periode aktif** (`period_snapshots.status='active'`). Karena `open_period_snapshot` tidak dipanggil dari UI mana pun di baseline saat ini, org baru tidak bisa masuk state buggy tanpa intervensi manual (seed SQL, migrasi backfill, atau UI yang sejak V1.8.2 sudah dihapus).

**Konsekuensi untuk spec**:
- Smoke test manual (§9.6) wajib menyertakan `INSERT INTO period_snapshots ... status='active'` sebagai prasyarat.
- Setelah spec ini mendarat, jalur berikut yang harus dibangun adalah **UI buka periode** — jembatan finalize tanpa buka-periode adalah setengah-siklus. NG-2 tetap; backlog ditandai di §11.
- Sampai UI buka-periode ada, spec ini bermanfaat untuk (a) staging yang sudah di-seed, (b) legacy production org yang punya active period dari V1.8.1 atau sebelumnya.

### 1.4 Kenapa ini bukan "sekadar tambah tombol"

- **FREEZE semantics** harus dijaga: PRD §34.10 + AC-7.14 memaksa `calculate` **tidak menyentuh** baris `result_kind='override'` yang `is_current=true`. Ini sudah benar di server (`0013:596-611`) — spec ini tidak boleh menambah logika client yang melanggarnya.
- **Idempotency asymmetric SETELAH advisory lock**: `calculate` idempotent (aman retry) — tapi TANPA lock, dua sesi paralel bisa memicu partial-unique violation atau menulis ke period yang di-close mid-flight (grill Engineering F-2/F-3). Migrasi 0079 memperbaiki ini.
- **Cross-org guard** sudah dipasang di `0039` (`current_user_org()` bisa NULL untuk CEO tanpa org → `is distinct from`). Spec tidak boleh berasumsi period lain yang dilempar `periodId` bocor lintas org — RPC menolak sendiri.
- **Ranking immutability** (AC-7.20 + trigger `ranking_snapshots_no_delete`) berarti spec **tidak boleh** menambah tombol "Hitung Ulang" pasca-close.

---

## 2. Goals & Non-goals

### 2.1 Goals

**G1** — Menutup periode skor menghasilkan `ranking_snapshots` yang **tidak kosong** untuk setiap user yang punya `user_score_results.is_current=true` pada period tersebut.

**G2** — Owner mendapat modal progres eksplisit dengan **pratinjau angka pra-aksi**: "N pengguna akan diperingkat · M Override aktif" → konfirmasi → "Langkah 1/2 · Menghitung skor…" → "Langkah 2/2 · Mengunci peringkat…" → "Selesai · N pengguna masuk peringkat".

**G3** — Manual Score Override tetap efektif setelah finalization: baris `is_current` dari calculate diikuti oleh `close` yang membaca `manual_adjusted_score` (kolom sudah di-coalesce di `0013:654`).

**G4** — Jalur pemulihan untuk "calculate OK, close gagal": user boleh menekan tombol lagi; calculate re-run idempotent (dijamin serial oleh advisory lock 0079), close percobaan ulang berhasil.

**G5** *(baru)* — **Concurrent finalization aman**: dua sesi paralel (dua tab / dua device) di-serialisasi oleh advisory lock server; tidak ada partial-unique violation, tidak ada calculate menulis ke closed period.

### 2.2 Non-goals

**NG-1** — Tombol "Hitung Ulang" pasca-close (dilarang AC-7.20).

**NG-2** — Tombol "Buka Periode" (`open_period_snapshot`). Diambil sebagai backlog explicit di §11.

**NG-3** — Perubahan RPC signature atau semantic.

**NG-4** — Migrasi SQL besar. **Satu migrasi kecil (0079)** untuk advisory lock; nol perubahan skema, nol perubahan grant, nol data migration.

**NG-5** — Menambah permission key baru; reuse `manage_score_formula`.

**NG-6** — Auto-invoke calc+close saat status berubah (DB trigger / pg_cron). Ditolak owner putaran 1.

**NG-7** — Client-side gate FREEZE pada `manual-score-override.tsx`. Tetap bergantung server E1.

**NG-8** *(baru)* — **Reminder / notifikasi period-end**: defer ke spec follow-up `score-period-end-nudge` (backlog §11). Keputusan sadar owner putaran 2: tanpa reminder, bug re-emergence bulanan mungkin terjadi — trade-off diterima demi men-scope hotfix ini tetap kecil.

**NG-9** *(baru)* — **Escape hatch pasca-close** (mis. `reopen_period_snapshot` RPC). Ditolak owner putaran 2. Sikap resmi: "closed immutable, koreksi via periode berikutnya". Didokumentasikan di ADR `wiki/concepts/score-period-immutability.md` (dibuat sebagai bagian dari deliverable spec ini).

**NG-10** *(baru)* — **Retention / PDP anonymization**: defer. Trigger `_no_delete` di 3 tabel Fase 7 memblok cascade delete user → potensi konflik dengan right-to-erasure UU PDP Indonesia. Backlog eksplisit di §11; tidak scope V1.8.3.

**NG-11** *(baru)* — **Rate-limit / throttle**: tidak dipasang di server maupun client (di luar dismiss-lock modal). Argumen: gate `manage_score_formula` sudah membatasi surface. Trade-off diterima; audit inflation ditolerir.

**NG-12** *(baru)* — **Correlation `finalize_run_id` di activity_logs**: defer. Retry attempt akan menulis multiple event `scores_calculated` + `period_closed`; korelasi hanya via timestamp. Backlog opsional.

---

## 3. Functional Requirements

### 3.1 Data layer

**FR-DL-1** — `calculatePeriodScores(periodId: string): Promise<number>` di `mobile/src/lib/people-score.ts:361` **sudah ada, tidak diubah**.

**FR-DL-2** — `closePeriodSnapshot(periodId: string): Promise<number>` di `mobile/src/lib/people-score.ts:367` **sudah ada, tidak diubah**.

**FR-DL-3** *(baru — dari grill Product F-7)* — Tambah `previewFinalization(periodId): Promise<{ eligibleUsers: number; activeOverrides: number }>` di `mobile/src/lib/people-score.ts`. Implementasi:
- Query `count(*) FROM user_score_results WHERE period_snapshot_id=periodId AND is_current=true` → `eligibleUsers`.
- Query `count(*) FROM user_score_results WHERE period_snapshot_id=periodId AND is_current=true AND result_kind='override'` → `activeOverrides`.

Kedua query dilakukan client-side via Supabase (RLS SELECT sudah menegakkan org & permission — restored di migrasi 0071 per memory `p2-db-contract-ci`). Bila RLS SELECT tidak memadai, buat RPC `preview_finalize_period` SECURITY DEFINER dengan gate `manage_score_formula`. **Keputusan implementasi diserahkan ke fase RED di /tdd-plan** — spec cukup mengunci kontrak return.

### 3.2 Migrasi 0079 (baru — dari grill Engineering F-2/F-3)

> **Penomoran migrasi** *(diselesaikan 2026-07-19)*: slot `0078` sempat diklaim paralel oleh spec `settings-consumers` (`card_completion_rules` + `card_guidance_contents`) yang sudah shipped lokal. Resolusi: **spec ini mengalah ke `0079`**; settings-consumers memegang `0078`. Keduanya independen — nol irisan tabel/fungsi, jadi urutan apply bebas. Preseden collision `0058` (dua PR mendarat bersamaan dengan nama file berbeda; urutan apply tetap deterministik karena Supabase CLI mengurutkan nama file lengkap) menunjukkan tabrakan nomor bukan blocker selama nama file unik.

**FR-MIG-1** — Migrasi `0079_score_finalize_advisory_lock.sql` (atau `0079_...` bila settings-consumers landed dulu) menambahkan advisory transaction lock di dua RPC:

```sql
-- di atas SELECT ... INTO v_period di calculate_period_scores (0013:518)
perform pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text));

-- di atas SELECT ... FOR UPDATE di close_period_snapshot (0013:632)
perform pg_advisory_xact_lock(hashtext('score_finalize:' || p_period_id::text));
```

Efek:
- Dua sesi paralel pada `periodId` yang sama **serial-terkunci**; sesi kedua menunggu sesi pertama commit.
- Race calculate-mid-flight ↔ close (grill F-3) hilang: close menunggu calculate selesai; retry setelah error mengambil lock baru.
- Nol perubahan interface RPC. Nol dampak pada RLS/permission. Nol perubahan test lain kecuali kontrak DB baru.

**FR-MIG-2** — Migrasi 0079 dijalankan **sebelum** hook baru mendarat di produksi. Rilis order: (a) apply 0079 di staging → contract test hijau → (b) apply 0079 di prod → (c) release build client dengan hook + modal baru.

### 3.3 Hooks

**FR-H-1** — Tambah `useCalculatePeriodScores()` di `mobile/src/hooks/use-people-score.ts` (bukan `lib/` — koreksi dari grill Engineering F-1). `mutateAsync(periodId)` memanggil `calculatePeriodScores`. On success, invalidasi kunci berikut — semua bergantung prefix match TanStack Query v5 default (aktual kunci ber-suffix `periodId`/`userId`/`limit`):

- `['my_score']`
- `['user_score']`
- `['my_score_history']`
- `['user_score_history']`

**JANGAN** invalidasi `['active_period']`, `['latest_closed_period']`, atau `['ranking']` — calculate tidak mengubah status period maupun `ranking_snapshots`. Bila di masa depan ada caller yang menggunakan `useCalculatePeriodScores` **standalone** (di luar orkestrator finalize), caller harus memutuskan sendiri apakah menambah invalidasi `['ranking']`.

**FR-H-2** — `useClosePeriod` di `use-people-score.ts` **TIDAK diubah**. Invalidasi existing (`['active_period']`, `['latest_closed_period']`, `['ranking']` per WS-5) sudah cukup.

**FR-H-3** *(baru)* — Tambah `usePreviewFinalization(periodId)` sebagai `useQuery` (bukan mutation) untuk pratinjau. Enabled hanya saat modal terbuka. Refetch on mount; nol invalidasi.

### 3.4 UI

**FR-UI-1** *(revised)* — Ganti label tombol di `settings-score-formula.tsx:491-495` dari `"Tutup Periode"` menjadi **`"Finalisasi Periode & Peringkat"`**. Style `variant="secondary"` dipertahankan.

**FR-UI-2** *(revised)* — Rename `mobile/src/components/close-period-modal.tsx` → `mobile/src/components/finalize-period-modal.tsx`, rename komponen `ClosePeriodModal` → `FinalizePeriodModal`, update import di `settings-score-formula.tsx:19` dan usage di `:507`.

**FR-UI-3** — Modal `FinalizePeriodModal` state machine:

```
idle
  ↓ onOpen
loading-preview   ← useQuery(usePreviewFinalization) → { eligibleUsers, activeOverrides }
  ├─ error → error-preview     ← "Coba lagi" + "Batal"
  └─ ok
step1 (confirm)                 ← body menampilkan pratinjau + warning override + kalimat ireversibilitas
  ├─ dismiss (aman) → close
  ↓ user tap "Saya paham, finalisasi periode & kunci peringkat"
calculating                     ← Langkah 1/2 · Menghitung skor pengguna…
  ├─ error → error-calc          ← "Coba lagi" + "Tutup" (calculate saja)
  └─ ok
locking                         ← Langkah 2/2 · Mengunci peringkat…
  ├─ error → error-lock          ← "Coba lagi" + "Tutup" (retry calculate + close)
  └─ ok
done                            ← "Selesai · N pengguna masuk peringkat" + "Tutup"
```

**FR-UI-4** — Copy state-kosong `GuidanceNote` di `:499-502` tidak diubah. Setelah finalization sukses, invalidasi WS-5 sudah menyebabkan card refetch ke state "Belum ada periode aktif" dan People screen (`people.tsx:192-200`) menampilkan ranking baru.

**FR-UI-5** *(baru)* — `manual-score-override.tsx` **tidak diubah**. FREEZE server-side sudah menolak override periode closed dan pesan itu disurface via `surfaceServerError` (NG-7).

**FR-UI-6** *(baru — dari grill Engineering F-6)* — Modal.onRequestClose (hardware back / overlay tap) adalah no-op pada state ∈ {`loading-preview`, `calculating`, `locking`}. Dismiss diperbolehkan pada {`idle`, `step1`, `error-preview`, `error-calc`, `error-lock`, `done`}.

**FR-UI-7** *(baru — dari grill Engineering F-6)* — Mutation-level guard: `FinalizePeriodModal` merender tombol confirm dengan `disabled={calcMutation.isPending || closeMutation.isPending}` supaya multi-tap client-side tidak spawn RPC ganda. Advisory lock 0079 tetap serve sebagai backstop server.

### 3.5 Reactivity

**FR-R-1** — Setelah Step B (close) sukses:
- `useClosePeriod` invalidasi `['active_period']`, `['latest_closed_period']`, `['ranking']` (existing WS-5).
- Card kembali ke state "Belum ada periode aktif".
- People screen menampilkan ranking baru via `useRanking(latestClosed?.id)` — perlu ordering: `latest_closed_period` refetch resolve dulu, baru `useRanking(newId)` fire (verifikasi via test T-UI-3).

**FR-R-2** *(defer — NG-8)* — Reminder period-end nudge. Backlog spec `score-period-end-nudge`.

---

## 4. Data Contract

**Nol perubahan skema.** Migrasi 0079 hanya menambah `pg_advisory_xact_lock` di badan dua fungsi.

Ringkasan kolom yang dibaca / ditulis:

| Tabel | Kolom | Dibaca | Ditulis | Oleh RPC |
|---|---|---|---|---|
| `period_snapshots` | `id, organization_id, status` | ya | `status='closed', closed_at, closed_by` | close |
| `user_score_results` | seluruh | ya (close) | insert baru `result_kind='auto', is_current=true`; UPDATE lama `is_current=false` | calculate |
| `ranking_snapshots` | `period_snapshot_id` (uniq check) | uniq check | insert `rank_number, score, metric_breakdown` | close |
| `activity_logs` | — | — | insert `event_kind='scores_calculated', meta={users_scored:N}` (0013:616) + close event | calculate + close |

### 4.1 Invariants (dipertahankan spec ini; verifikasi via test)

| ID | Invariant | Sumber |
|---|---|---|
| INV-1 | Setelah calculate: setiap user org yang punya template role terpetakan ada tepat satu `user_score_results.is_current=true` per period | AC-7.14 + `0013:596-611` |
| INV-2 | Setelah close: `ranking_snapshots` **tidak kosong** ketika ada minimal 1 `user_score_results.is_current=true` | G1 — inti bug |
| INV-3 | Setelah close: `period_snapshots.status='closed'` dan `closed_at` non-null | AC-7.19 |
| INV-4 | Calculate + Close diulang pada period yang sudah closed → close raise `E1` server; UI surface tanpa modifikasi | FR-UI-3 |
| INV-5 | Override baris `is_current=true` yang di-apply SEBELUM finalization ikut ke `ranking_snapshots.score` via coalesce | `0013:654` |
| INV-6 | Override pada period closed ditolak server (`E1`) — FREEZE | `0013:700-702` |
| INV-7 *(baru)* | Dua sesi paralel `calculate(periodId)` / `close(periodId)` tidak menghasilkan partial-unique violation, tidak menghasilkan calculate-write ke closed period | Migrasi 0079 |
| INV-8 *(baru)* | Setiap attempt calculate menulis 1 baris `activity_logs` `event_kind='scores_calculated'`; setiap attempt close menulis 1 baris `event_kind='period_closed'` (verifikasi nama pasti saat implementasi) | `0013:616-617` + close event |

---

## 5. RPC Contract & ACL

Empat RPC dilibatkan. Semua sudah live dan bergrant benar per baseline. Spec **hanya**:

| RPC | Grant terakhir | Dipanggil di spec ini? |
|---|---|---|
| `calculate_period_scores(uuid)` | revoke public/anon di `0013:621`, ditegakkan `0050`. `authenticated` EXECUTE via default privileges (tidak dicabut). | **YA** — via `useCalculatePeriodScores` baru |
| `close_period_snapshot(uuid)` | revoke public/anon di `0013:672`, ditegakkan `0050`. `authenticated` EXECUTE. | **YA** — via `useClosePeriod` existing |
| `override_user_score(...)` | revoke public/anon di `0013:740`, ditegakkan `0050`. `authenticated` EXECUTE. | Tidak (server FREEZE dipertahankan) |
| `open_period_snapshot(...)` | revoke public/anon di `0013:493`, ditegakkan `0050`. `authenticated` EXECUTE. | Tidak (NG-2) |

**Gate**: setiap RPC memanggil `has_permission('manage_score_formula')` server-side. `manage_score_formula` **bukan** exclusive CEO — `has_permission` return TRUE untuk (a) `user_role_level='ceo'`, ATAU (b) baris `user_permissions.granted=true` untuk key ini (`0016:41-53`). Ini konsisten dengan keputusan owner WS-5 (memory `ws5-close-period-decisions` — "default seed = hanya CEO; delegation via `set_user_permission` dibolehkan").

**Cross-org guard**: `0039` memasang `v_period.organization_id is distinct from current_user_org()` (NULL-safety untuk CEO tanpa org). Spec ini **tidak** melewati param org — periodId cukup; RPC menolak sendiri.

**Advisory lock**: dipasang 0079 pada calculate + close; lock name `hashtext('score_finalize:' || periodId::text)`. Lock adalah transaction-scoped; auto-release saat COMMIT/ROLLBACK.

---

## 6. UI/UX

### 6.1 Perbedaan visual dari WS-5

- Label tombol berubah "Tutup Periode" → **"Finalisasi Periode & Peringkat"**.
- Modal dua-langkah tetap ada, tapi step 1 sekarang menampilkan **pratinjau angka** + **peringatan override + ireversibilitas**, dan step 2 (konfirmasi) memicu **dua RPC berurutan** dengan progres per-step visible.

### 6.2 State machine modal — lihat FR-UI-3 §3.4.

### 6.3 A11y

- `accessibilityLiveRegion="polite"` pada label progres (calculating/locking/done).
- Focus trap: modal fokus tombol utama pada tiap state.
- Solid primary button pakai `brand-dark` `#1564b3` (DESIGN §4).
- Touch target ≥44px.
- `accessibilityValue.text` untuk label progres berisi teks yang sama supaya screen reader membaca perubahan step.

### 6.4 Copy Indonesia *(revised — konsisten "pengguna", bukan "user")*

| Konteks | Label |
|---|---|
| Tombol utama | **"Finalisasi Periode & Peringkat"** |
| Modal step 1 title | "Finalisasi periode {name}?" |
| Modal step 1 preview (bila `eligibleUsers > 0`) | **"{N} pengguna akan diperingkat · {M} Manual Override aktif akan efektif."** |
| Modal step 1 preview (bila `eligibleUsers = 0`) | Warning kuning: **"Belum ada pengguna dengan template role terpetakan untuk periode ini. Melanjutkan berarti mengunci periode tanpa peringkat."** |
| Modal step 1 body | **"Skor setiap pengguna akan dihitung ulang berdasar formula aktif, lalu peringkat dibekukan dan periode ditutup. Setelah dikunci, periode ini tidak dapat dibuka kembali dari aplikasi dan Manual Override tidak bisa lagi diubah."** |
| Modal step 1 confirm | **"Saya paham, finalisasi periode & kunci peringkat"** |
| Modal step 1 cancel | "Batal" |
| Calculating label | **"Langkah 1 dari 2 · Menghitung skor pengguna…"** |
| Locking label | **"Langkah 2 dari 2 · Mengunci peringkat…"** |
| Done copy (N>0) | **"Periode {name} difinalisasi. {N} pengguna masuk peringkat."** |
| Done copy (N=0) | **"Periode {name} difinalisasi. 0 pengguna diperingkat — kemungkinan penyebab: template role belum dipetakan ke pengguna aktif. Periode berikutnya bisa diperbaiki."** |
| Done footer note | *"Butuh mengoreksi? Buat periode berikutnya di menu ini setelah UI buka-periode tersedia."* (soft escape hatch; sesuai NG-9) |
| Error-preview title | "Gagal memuat pratinjau" |
| Error-calc title | "Gagal menghitung skor" |
| Error-lock title | "Gagal mengunci peringkat" |
| Error label (concurrent race — mapping 23505 → Indonesia) | **"Perhitungan sedang berjalan di sesi lain. Muat ulang halaman dan coba lagi."** |
| Retry button | "Coba lagi" |
| Cancel/close in-error | "Tutup" |
| Generic server error surface | Pesan server dilewatkan apa adanya via `surfaceServerError` (pattern WS-5 L1-L4). Untuk error 23505 spesifik, mapping ke copy di atas dilakukan client-side. |

---

## 7. Error Handling & Rollback

### 7.1 Skenario kegagalan

| # | Skenario | Perilaku | State DB |
|---|---|---|---|
| E-1 | Calculate raise `'Periode ini sudah ditutup dan tidak bisa diubah.'` | Modal state=`error-calc`; user tutup modal | Tidak berubah |
| E-2 | Calculate raise permission denied (defense-in-depth) | Modal `error-calc`; screen sudah gated | Tidak berubah |
| E-3 | Calculate network fail | Modal `error-calc`; retry aman (idempotent + lock) | Tidak berubah atau parsial-belum-commit |
| E-4 | Calculate OK, close raise E1 (race dua-tab: session lain sudah close duluan) | Modal `error-lock`; retry akan calc-ulang + close ulang; close menolak dengan E1 lagi karena `status='closed'`; user tap "Tutup" | user_score_results terisi dari calc pertama; period tetap active atau sudah closed di session lain |
| E-5 | Calculate OK, close network fail | Modal `error-lock`; retry aman via advisory lock (0079) | Sama seperti E-3 |
| E-6 | Close raise `duplicate key value violates unique constraint "ranking_snapshots_period_snapshot_id_user_id_key"` | Sudah dicegah oleh advisory lock 0079; bila tetap terjadi (mis. advisory lock miss karena bug), client mapping 23505 → copy Indonesia di §6.4 | ranking_snapshots kemungkinan sudah ada dari session lain |
| E-7 *(baru)* | Advisory lock timeout / wait (session lain memegang lock >5s) | Server: lock antri; client tidak melihat progress; setelah lock diperoleh, calc lanjut normal. Bila client timeout HTTP (default 60s), user retry dan advisory lock memastikan hasil tetap konsisten | Konsisten |

### 7.2 Rollback filosofi

- **Tidak ada compensating action client-side**. Server tidak menyediakan `undo_calculate_period_scores` — konsisten dengan K5 append-only.
- **Retry adalah rollback**. Advisory lock (0079) memastikan retry serial; calculate idempotent (aman ulang); close menolak setelah sukses (natural idempotency).
- **Pesan server diteruskan apa adanya** ke `surfaceServerError` (WS-5 pattern). Untuk error kode PG spesifik (23505 → concurrent finalize), mapping client ke copy Indonesia di §6.4.

---

## 8. Acceptance Criteria

**AC-FIN-1** — Tombol pada `settings-score-formula.tsx` menampilkan label **"Finalisasi Periode & Peringkat"** saat ada periode aktif dan user punya `manage_score_formula`.

**AC-FIN-2** — Tap tombol → modal terbuka; state awal `loading-preview` → transisi ke `step1` setelah preview loaded.

**AC-FIN-3** — Step 1 menampilkan pratinjau:
  - Bila `eligibleUsers > 0`: kalimat "N pengguna akan diperingkat · M Manual Override aktif akan efektif."
  - Bila `eligibleUsers = 0`: warning kuning dengan copy §6.4.

**AC-FIN-4** — Konfirmasi step 1 dengan copy "Saya paham, finalisasi periode & kunci peringkat" → state `calculating`; label "Langkah 1 dari 2 · Menghitung skor pengguna…"; on success → state `locking`.

**AC-FIN-5** — State `locking` menampilkan "Langkah 2 dari 2 · Mengunci peringkat…"; on success → state `done` dengan N dari return value close.

**AC-FIN-6** — `ranking_snapshots` untuk period tsb **tidak kosong** ketika ada ≥1 baris `user_score_results.is_current=true` (INV-2).

**AC-FIN-7** — Setelah `done`, invalidasi menghasilkan card refetch ke state "Belum ada periode aktif" dan People screen menampilkan ranking baru.

**AC-FIN-8a** *(revised — dari grill Engineering F-9)* — `preview.eligibleUsers=0` + user tetap konfirmasi → calc=0, close=0, modal state `done`, copy "0 pengguna diperingkat — kemungkinan penyebab template role…".

**AC-FIN-8b** *(baru — canary regression)* — Bila `calc>0` DAN `close=0` (ini regresi bug asli; seharusnya close membaca user_score_results yang barusan diisi) → modal state `error-mismatch` dengan copy **"Perhitungan selesai tapi peringkat tidak tersimpan (0 baris). Hubungi admin."** Test T-M harus assert state ini tidak boleh muncul saat lock bekerja.

**AC-FIN-9** — Kegagalan calculate → modal state `error-calc`, pesan server disurface; tombol "Coba lagi" mengulang calculate saja.

**AC-FIN-10** — Kegagalan close setelah calculate sukses → modal state `error-lock`, pesan server disurface; tombol "Coba lagi" mengulang **kedua** step (calc idempotent + advisory lock; close retry).

**AC-FIN-11** — User CEO/Owner memanggil finalization untuk periode dari organisasi lain → RPC menolak via cross-org guard `is distinct from` (0039). Client tidak butuh logic tambahan.

**AC-FIN-12** *(revised)* — User tanpa role CEO tapi punya `user_permissions.manage_score_formula=true` **DAPAT** menjalankan finalize (konsisten dengan `has_permission` semantics `0016:41-53` + keputusan owner WS-5). Screen render + RPC sukses.

**AC-FIN-13** *(revised — koreksi dari grill Governance F-4)* — Calculate **sudah menulis** `activity_logs` `event_kind='scores_calculated'` (`0013:616-617`); tidak menambah event baru. Spec ini **tidak** bertanggung-jawab menyelaraskan PRD §35 dengan kenyataan kode (event `scores_calculated` tidak masuk 15-event list PRD §35 — divergensi dokumen dicatat sebagai follow-up wiki).

**AC-FIN-14** — `manual-score-override.tsx` tetap menolak submit untuk period closed karena server E1; tidak ada gate client tambahan (NG-7).

**AC-FIN-15** — Override yang di-apply SEBELUM finalization tercermin di `ranking_snapshots.score` via coalesce (INV-5).

**AC-FIN-16** *(baru — dari grill Engineering F-6)* — `Modal.onRequestClose` no-op pada state ∈ {`loading-preview`, `calculating`, `locking`}. Dismiss di state lain diperbolehkan.

**AC-FIN-17** *(baru)* — Confirm button di-disable saat mutation calculate atau close in-flight (FR-UI-7).

**AC-FIN-18** *(baru — dari grill Engineering F-2/F-3)* — Dua sesi paralel `useCalculatePeriodScores` pada `periodId` sama serial di server via advisory lock 0079; sesi kedua menunggu, tidak menghasilkan `duplicate key value` mentah.

**AC-FIN-19** *(baru — dari grill Governance F-11)* — Bila error 23505 tetap terangkat (defense-in-depth), client mapping ke copy Indonesia "Perhitungan sedang berjalan di sesi lain. Muat ulang halaman dan coba lagi." (§6.4). Raw PG error tidak boleh sampai user.

**AC-FIN-20** *(baru)* — Setelah `done`, footer note menampilkan "Butuh mengoreksi? Buat periode berikutnya di menu ini setelah UI buka-periode tersedia." (soft escape hatch, konsisten NG-9).

---

## 9. Test Plan (handoff ke /tdd-plan)

### 9.0 Fase 0 — Migrasi 0079 advisory lock (RED wajib)

Tambah di `supabase/tests/` (kalau `db-contract-tests` CI aktif):

- **T-DB-1** `calculate_period_scores` menolak periodId org lain via 0039 guard (regresi guard) — sudah ada; pertahankan.
- **T-DB-2** `close_period_snapshot` menolak periodId org lain via 0039 guard — sudah ada; pertahankan.
- **T-DB-3** *(baru)* `authenticated` role EXECUTE calculate + close berhasil; `anon` role EXECUTE ditolak.
- **T-DB-4** *(baru)* Dua transaksi paralel `calculate_period_scores(same_period)` → transaksi kedua ANTRE (menunggu lock) → kedua-duanya commit tanpa `duplicate key value`. Verifikasi via `SELECT pg_advisory_xact_lock` tampil di `pg_stat_activity`.
- **T-DB-5** *(baru)* Transaksi paralel `calculate` (in-flight) + `close` (baru mulai) → `close` menunggu `calculate` selesai; tidak ada `user_score_results` insert setelah `status='closed'`.
- **T-DB-6** *(baru)* Concurrent calculate → close race: setelah keduanya commit, `ranking_snapshots` count = distinct `user_id` dengan `is_current=true` (INV-2 + INV-7).

### 9.1 Fase 1 — Kontrak data-layer (RED)

Tambah di `mobile/src/lib/__tests__/people-score.test.ts`:

- **T-DL-1** `calculatePeriodScores` sukses → return int
- **T-DL-2a** Calculate raise `'Periode ini sudah ditutup dan tidak bisa diubah.'` → throw Error dengan message persis
- **T-DL-2b** Calculate raise `'Periode tidak ditemukan.'` (cross-org / not-found) → throw Error persis
- **T-DL-2c** Calculate raise `'Anda tidak berwenang…'` (permission denied) → throw Error persis
- **T-DL-2d** Calculate network fail → throw Error dengan message network
- **T-DL-3** `previewFinalization` sukses → return `{ eligibleUsers, activeOverrides }`
- **T-DL-4** `previewFinalization` bila 0 rows → return `{ eligibleUsers: 0, activeOverrides: 0 }` (bukan throw)

### 9.2 Fase 2 — Hook baru (RED)

Tambah di `mobile/src/hooks/__tests__/use-people-score.test.tsx`:

- **T-H-1** `useCalculatePeriodScores.mutateAsync(periodId)` return int
- **T-H-2** on success: invalidasi 4 kunci prefix (`my_score`, `user_score`, `my_score_history`, `user_score_history`). Verifikasi via `queryClient.getQueryCache().findAll(['my_score'])` bahwa entries yang match prefix ter-invalidate. **JANGAN** invalidasi `active_period`/`latest_closed_period`/`ranking`.
- **T-H-3** error passthrough (semua 4 branch WS-5 style)
- **T-H-4** `usePreviewFinalization` return `{ eligibleUsers, activeOverrides }` dari query
- **T-H-5** `usePreviewFinalization` disabled saat modal tertutup (query `enabled: false`)

### 9.3 Fase 3 — Modal orkestrator (RED)

Buat file baru `mobile/src/components/__tests__/finalize-period-modal.test.tsx` (greenfield — modal existing WS-5 tidak punya test file baseline):

- **T-M-1** Open modal → state `loading-preview` → setelah `usePreviewFinalization` resolve → state `step1` dengan copy pratinjau (N>0)
- **T-M-2** `usePreviewFinalization` return N=0 → state `step1` dengan warning kuning; tombol confirm tetap ada
- **T-M-3** `usePreviewFinalization` error → state `error-preview` dengan tombol "Coba lagi" + "Batal"
- **T-M-4** Confirm step 1 (dengan tap tombol "Saya paham, finalisasi periode & kunci peringkat") → state `calculating`; label "Langkah 1 dari 2 · Menghitung skor pengguna…"
- **T-M-5** Calculate sukses → state `locking`; label "Langkah 2 dari 2 · Mengunci peringkat…"
- **T-M-6** Close sukses → state `done`; copy `"Periode {name} difinalisasi. {N} pengguna masuk peringkat."` untuk N>0
- **T-M-7** Close sukses N=0 → state `done`; copy "0 pengguna diperingkat — kemungkinan penyebab template role…"
- **T-M-8a** Calc raise E1 → state `error-calc`; pesan server disurface; tombol "Coba lagi" memicu calc saja (bukan close)
- **T-M-8b** Calc raise permission denied → state `error-calc`; pesan server disurface
- **T-M-8c** Calc network fail → state `error-calc`
- **T-M-9a** Close raise E1 setelah calc sukses → state `error-lock`; retry memicu calc + close (dua-step re-run); pastikan calc idempotent (mock RPC assert dipanggil 2x tanpa error)
- **T-M-9b** Close raise unique_violation (23505) → state `error-lock`; **copy Indonesia** "Perhitungan sedang berjalan di sesi lain. Muat ulang halaman dan coba lagi." bukan raw PG error
- **T-M-10** Modal.onRequestClose no-op saat state ∈ {`loading-preview`, `calculating`, `locking`} (T-M-16 backup: hardware back di Android)
- **T-M-11** Confirm button disabled saat `calcMutation.isPending || closeMutation.isPending`
- **T-M-12** A11y: label progres pakai `accessibilityLiveRegion="polite"` + `accessibilityValue.text`
- **T-M-13** Setelah `done`, `onClose` dipanggil dan mengembalikan focus ke button pemicu di parent
- **T-M-14** `AC-FIN-8b` canary: mock RPC calc=5, close=0 → state `error-mismatch` dengan copy "Perhitungan selesai tapi peringkat tidak tersimpan"

### 9.4 Fase 4 — Wire UI (GREEN)

- **T-UI-0** *(baru — dari grill Engineering F-7)* — Update SEMUA test WS-5 di `settings-score-formula-screen.test.tsx` yang mengassert `'Tutup Periode'` menjadi `'Finalisasi Periode & Peringkat'`. Enumerate: line 275, 278, 285, 290, 294, 302, 309, 313, 329, 342, 359, 375, 391, 407. Ini bagian dari deliverable, bukan follow-up.
- **T-UI-1** Screen render tombol berlabel "Finalisasi Periode & Peringkat" saat ada periode aktif + user punya `manage_score_formula`
- **T-UI-2** Tap tombol membuka `FinalizePeriodModal` (state initial `loading-preview`)
- **T-UI-3** Setelah `done`, ordering invalidasi: `latest_closed_period` resolve → People screen `useRanking(newId)` fire → ranking baru terrender (bukan flicker "Peringkat tampil setelah…")
- **T-UI-4** Non-CEO user dengan `user_permissions.manage_score_formula=true` bisa render tombol dan menjalankan finalize (AC-FIN-12)

### 9.5 Fase 5 — Smoke manual (GREEN + ADR)

Setelah GREEN:

1. Prasyarat: seed periode aktif via SQL kalau org uji belum punya:
   ```sql
   -- run via docker exec supabase_db_supabase psql (per memory supabase-local-vs-mcp-gotcha)
   insert into period_snapshots (organization_id, period_name, period_start, period_end, status)
   values ('<org-id>', 'Juli 2026', '2026-07-01', '2026-07-31', 'active');
   ```
2. Login user dengan `manage_score_formula` (CEO atau user dengan `user_permissions` granted).
3. Settings → Score Formula.
4. Tap "Finalisasi Periode & Peringkat" → observasi preview → konfirmasi → observasi 3 label progres (loading-preview / calculating / locking) → state `done`.
5. Buka People screen → assert ranking terlihat, ≥1 baris untuk N>0.
6. Screenshot 3 state modal + People screen.
7. ADR `wiki/concepts/score-period-immutability.md` di-commit sebagai bagian PR (menjelaskan NG-9 keputusan sadar).

---

## 10. Handoff ke /tdd-plan

**Fase yang dianjurkan** untuk `/tdd-plan`:

| # | Fase | Deliverable RED | Deliverable GREEN | Blocker resolusi |
|---|---|---|---|---|
| 0 | Migrasi 0079 advisory lock | T-DB-1..6 | `supabase/migrations/0079_score_finalize_advisory_lock.sql` | Grill Eng F-2/F-3 |
| 1 | Data-layer + preview | T-DL-1..4 | `previewFinalization` di people-score.ts | Grill Prod F-7 |
| 2 | Hooks | T-H-1..5 | `useCalculatePeriodScores`, `usePreviewFinalization` di `hooks/use-people-score.ts` | Grill Eng F-1 (path) |
| 3 | Modal orkestrator | T-M-1..14 | `FinalizePeriodModal` (rename dari `close-period-modal.tsx`) | Grill Prod F-2/F-5/F-6, Eng F-6/F-8 |
| 4 | Wire UI + update WS-5 tests | T-UI-0..4 | ubah label + wire modal + update 14 assertion label WS-5 | Grill Eng F-7 |
| 5 | Smoke manual + ADR | screenshot 3 state + ADR wiki | ADR `wiki/concepts/score-period-immutability.md` | Grill Gov F-9 |

**Seed yang harus disiapkan `/tdd-plan`**:

- Mocks: `supabase.rpc('calculate_period_scores', {p_period_id})` return int/error 4-branch
- Mock `supabase.from('user_score_results').select('count', ...).eq(...)` untuk previewFinalization
- Test utility untuk mock `useCalculatePeriodScores.mutateAsync` dan `usePreviewFinalization`
- Fixture `period_snapshots` + `user_score_results` untuk kontrak DB (T-DB-4..6)
- Test double untuk `useClosePeriod` (existing, tidak diubah)

**Guard yang tidak boleh dilewatkan tester**:

1. FREEZE server E1 message text (jangan hardcode di client — assert passthrough) — kecuali 23505 mapping
2. Cross-org guard `is distinct from` — CEO tanpa org sebagai edge case (`current_user_org()` NULL)
3. Idempotency calculate: retry setelah sukses parsial harus tetap green
4. Advisory lock: T-DB-4/5/6 wajib membuktikan serialization
5. Label WS-5 update: T-UI-0 wajib (14 line-item)
6. AC-FIN-8b canary: jangan lewatkan; ini alat deteksi regresi bug asli

---

## 11. Referensi & backlog

### 11.1 Sumber & jangkar

- `PRD.md` §34.2 Score Formula (line 1345-1359) — Closed period lock, versioning, 4 level
- `PRD.md` §34.10 Manual Score Override (line 1431-1437) — Activity Log wajib
- `PRD.md` §35 Activity Log — event list (catatan: `scores_calculated` tidak masuk 15-event list, divergensi dokumen)
- `specs/fase-7-people-score.md` §0 D9/D10/D12 + AC-7.7/7.14/7.19/7.20/7.29 — governance invariants Fase 7
- `supabase/migrations/0013_fase7_people_score.sql` K1-K5 (governance invariants), line 472-740 (RPC definitions)
- `supabase/migrations/0016_security_hardening.sql:41-53` — `has_permission` semantics (CEO OR granted delegation)
- `supabase/migrations/0039_fase7_cross_org_isolation.sql` — cross-org guard `is distinct from`
- `supabase/migrations/0050_revoke_anon_execute.sql` — sweep revoke anon/PUBLIC
- `mobile/src/lib/people-score.ts` — data-layer
- `mobile/src/hooks/use-people-score.ts` — hook seam (path benar; koreksi dari draft v1)
- `mobile/src/app/(app)/settings-score-formula.tsx:461-504` — insertion point tombol
- `mobile/src/components/close-period-modal.tsx` — modal existing (akan direname)
- `mobile/src/app/(app)/people.tsx:69, :192-200` — reactive downstream
- `mobile/src/app/(app)/manual-score-override.tsx` — FREEZE downstream (tidak diubah)
- Memory: `fase7-people-score-decisions`, `ws5-close-period-decisions`, `fase7-cross-org-isolation-fix`, `p2-db-contract-ci`, `anon-public-rpc-grant-gotcha`, `user-permissions-hardening-regression`

### 11.2 Backlog explicit (dibuka oleh spec ini)

| ID | Item | Alasan defer | Owner | Priority |
|---|---|---|---|---|
| **B-1** | Spec follow-up `score-period-end-nudge` (reminder + push notif 7/3/0 hari) | NG-8; tanpa ini bug loop bulanan berpotensi kambuh — trade-off diterima owner untuk hotfix cepat | Product | HIGH |
| **B-2** | Spec follow-up `score-open-period-ui` (UI untuk `open_period_snapshot`) | NG-2; jembatan finalize tanpa buka-periode adalah setengah-siklus | Product | HIGH |
| **B-3** | ADR `wiki/concepts/score-period-immutability.md` | NG-9; escape hatch decision must be documented sebelum spec merge | Delivered bersama spec ini | MERGE-BLOCKER |
| **B-4** | Divergensi doc: PRD §35 tidak menyebut event `scores_calculated` yang ditulis kode | AC-FIN-13 catatan | Documentation | LOW |
| **B-5** | Retention / PDP anonymization untuk `user_score_results` + `ranking_snapshots` | NG-10 defer | Governance | MEDIUM (compliance) |
| **B-6** | `finalize_run_id` correlation di activity_logs | NG-12 defer | Governance | LOW |
| **B-7** | Rate-limit / throttle di calculate + close | NG-11 defer | Engineering | LOW |
