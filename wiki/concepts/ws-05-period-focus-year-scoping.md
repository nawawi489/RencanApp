---
type: concept
tags: [period-focus, ws-05, workspace, goal, scoping, opsi-a]
updated: 2026-08-01
sources: 1
---

# WS-05 Period Focus — Goal Di-scope ke TAHUN (Opsi A)

Performance & Development Workspace tree memakai **Period Focus Engine** untuk memilih periode aktif. WS-05 menetapkan arah desain **Opsi A (PRD-patuh, §11.1 / §7.6)** untuk cara periode men-scope kartu:

> **Goal bersifat TAHUNAN dan selalu tampil sebagai konteks; period switcher men-scope TURUNAN (bulan/quarter), bukan Goal. Yang men-scope Goal hanya dimensi TAHUN.**

Owner mengonfirmasi tidak ada konsep "goal bulanan"; seed lokal telah dibetulkan menjadi goal tahunan.

## Dua dimensi periode

Period focus punya **dua** dimensi yang di-scope berbeda:

1. **Dimensi TAHUN** — men-scope **Goal** (dan Development Area). Goal 2025 tidak boleh tampil saat fokus 2026.
2. **Dimensi bulan/quarter** — men-scope **konteks turunan** (badge "Periode lewat", gerbang tambah-turunan), **bukan** memfilter Goal keluar. Goal tahunan tetap tampil di **semua** bulan/quarter dalam tahunnya.

Kekeliruan yang harus dihindari: memukul rata scoping ke sub-periode (bulan/quarter) sehingga goal tahunan hilang di bulan-bulan non-fokus. Itu **bukan** Opsi A.

## Celah #1 — kebocoran lintas-tahun (BUG, ditutup)

`listGoals()` menarik SEMUA goal tanpa filter apa pun → goal tahun lain (mis. 2025) **bocor** ke tree saat fokus 2026 (sebelumnya hanya diberi badge "Periode lewat", yang justru menyamarkan bug sebagai fitur).

**Fix (data-layer + client, TDD):**

- Pure helper `overlapsFocusYear(card, year)` di `mobile/src/lib/period-focus.ts`:
  - Beririsan bila `period_start <= 31 Des tahun-fokus` **AND** `period_end >= 1 Jan tahun-fokus`.
  - Batas `null` = tak-terbatas pada sisinya (`start` null = "sejak selamanya", `end` null = "sampai selamanya").
  - Kartu **tanpa periode** (null start & end) = **selalu tampil** — konsisten `cardPeriodStatus` yang memperlakukan null sebagai `'current'`.
  - Tanggal date-only `"YYYY-MM-DD"` → perbandingan leksikografik setara kronologis (tak perlu `parse Date`).
- Difilter **client-side** (`useMemo`, aman React Compiler — bukan query→state via `useEffect`) di `usePerformanceItems` + `useDevelopmentItems` (`mobile/src/screens/workspace-screen.tsx`), memakai `focus.year`.
- **Development Area dicerminkan** (pola byte-for-byte sama dengan Goal).

### Hub lobby sengaja TIDAK di-scope

`HubView` (lobby 2 hub-card) memakai `useGoals`/`useDevelopmentAreas` langsung sebagai **ringkasan lintas-waktu**, jadi hitungan hub-card ("N Goal") tetap **total** — tidak pecah oleh scoping pane. Lihat [[workspace-hub-orb]].

## Celah #2 — copy empty-state jujur

`WS_COPY.emptyGoalTitle` lama = `'Belum ada Goal aktif di periode ini.'` menyiratkan scoping periode-level (bulan) yang — per Opsi A — tidak ada. Diganti menjadi:

- `emptyGoalTitle` → **`'Belum ada Goal di tahun ini.'`**
- `emptyDevAreaTitle` → **`'Belum ada Development Area di tahun ini.'`**

Copy Indonesia; lulus guard `no-english-strings`.

## Celah #3 — turunan periode-lewat TETAP TAMPIL (bukan bug, escalated)

Pertanyaan: apakah §7.6 ("Workspace tidak menampilkan semua turunan tahunan sekaligus") memandatkan **memfilter/menyembunyikan** turunan di luar periode aktif?

**Verdict: TIDAK. Perilaku badge sekarang sudah spec-compliant. Jangan implementasi hiding.**

- **§11.3** eksplisit **MEWAJIBKAN** turunan periode-lewat tetap **tampil**: badge teks "Periode lewat", Detail tetap bisa dibuka, tombol tambah turunan dinonaktifkan dengan popup.
- **§7.7 + owner decision 2026-07-03**: dim visual dicabut (gagal kontras AA saat bersarang), badge teks jadi **sinyal tunggal**, larangan membuat turunan dari kartu periode-lewat **tetap** mengikat.
- **§7.6** "tidak menampilkan semua turunan tahunan sekaligus" = **progressive disclosure** (tree ringkas + expand via panah, §14 "Semua tree dalam mode ringkas") — **sudah** terimplementasi.
- Menyembunyikan/memfilter turunan akan **MELANGGAR §11.3** ("Detail tetap bisa dibuka").

Jika produk kelak menginginkan hiding turunan di luar periode aktif, itu **perubahan perilaku** yang butuh keputusan produk lewat `/sdd-plan` — bukan bug yang boleh diperbaiki diam-diam.

## Interaksi dengan engine periode lain

- `cardPeriodStatus(card, focus)` — status window MILIK CARD (`past|current|future`); null → `current`.
- `focusPeriodStatus(focus, now)` — status periode FOKUS yang dipilih user (arsip bila bulan/quarter fokus < sekarang).
- `isAddLocked(card, focus, now)` = `cardPeriodStatus === 'past' || focusPeriodStatus === 'past'` — gerbang tunggal untuk badge "Periode lewat" + kunci tombol "+ turunan". Lihat [[ws-04-governance-debt]] untuk catatan gating archive UI-only.
- `overlapsFocusYear(card, year)` — **dimensi tahun** (WS-05); dipakai untuk filter LIST, bukan untuk badge/lock.

**Konsekuensi penting:** Goal tahunan (mis. `2026-01-01..2026-12-31`) **tak pernah** `'past'` via periodenya sendiri di dalam tahun fokusnya (selalu overlap). Jadi badge "Periode lewat" pada Goal hanya muncul lewat **fokus arsip** (`focusPeriodStatus`), bukan periode milik card. Tes yang dulu memakai goal berperiode 2025 untuk mensimulasikan "goal past" harus direlokasi ke mekanisme fokus arsip.

## Implikasi tes

- Bukti kebocoran lintas-tahun: `workspace.test.tsx` `[S1-2/WS-05]` (goal 2025 hilang, goal 2026 tampil saat fokus 2026) + `[WS-05·null]` (goal null tetap tampil) + `[WS-05·empty]` (hanya goal 2025 → EmptyState "…di tahun ini.").
- Pure helper: `lib/__tests__/period-focus.test.ts` blok `overlapsFocusYear`.
- Tes lama yang **mengabadikan perilaku bocor** (`S1-2`, `S3-3`, `W08·1`) diperbarui ke model tahunan (lock "+" & badge via fokus arsip Januari 2026).

## Referensi

- Spec: PRD `PRD.md` §7.6 (Period Focus Engine), §7.7 (Card Periode Lewat), §11.1–§11.3, §14 (Performance Workspace Tree); owner decision 2026-07-03 (dim dicabut).
- Implementasi: `mobile/src/lib/period-focus.ts` (`overlapsFocusYear`), `mobile/src/screens/workspace-screen.tsx` (`usePerformanceItems`/`useDevelopmentItems`), `mobile/src/lib/workspace-copy.ts` (copy empty-state).
- PR: [#234](https://github.com/nawawi489/RencanApp/pull/234) → `staging` (1963 jest hijau).
- Related: [[workspace]] — hierarki dua ruang & tree tempat scoping ini berlaku.
- Related: [[ws-04-governance-debt]] — gating archive-period (dimensi bulan/quarter) yang saat ini UI-only.
- Related: [[minimum-breakdown-rule]] — gerbang tambah-turunan lain di tree card yang sama.
