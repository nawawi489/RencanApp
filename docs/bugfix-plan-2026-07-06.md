# Rencana Perbaikan — Temuan Manual Testing 2026-07-06

Sumber: [manual-testing-report-2026-07-06.md](manual-testing-report-2026-07-06.md) (sesi 1, 7 batch) dan [manual-testing-report-2026-07-06-session-2.md](manual-testing-report-2026-07-06-session-2.md) (sesi 2).

Status: rencana — belum dieksekusi. Root cause di bawah sudah diverifikasi terhadap kode di working tree branch `docs/ws-04-governance-debt` (2026-07-06), kecuali yang ditandai `[?]`.

## Ringkasan temuan

| # | ID | Severitas | Jenis | Root cause |
|---|---|---|---|---|
| 1 | BUG-01 | P1 crash | Bug | Belum pasti — perlu investigasi (kandidat tercatat) |
| 2 | BUG-02 / WS-04 | P1 gap PRD §44.9 | Bug | **Teridentifikasi** — gating per-card pakai `cardPeriodStatus`, bukan `focusPeriodStatus` |
| 3 | AP-03 | P1 fail (4 sub-masalah) | Bug | Sebagian teridentifikasi (routing Home); sisanya perlu investigasi |
| 4 | DCR-05 | P1 gap fungsional | Fitur hilang | Aksi "Minta Revisi" reviewer memang belum dibangun |
| 5 | Close-period UI | Gap (memblokir PPL-07, SCORE-*) | Fitur hilang | RPC `close_period_snapshot` ada, surface UI admin belum ada |

Prasyarat: working tree saat ini berisi perubahan Menu V1.82 UI-lock yang belum di-commit (`menu.tsx`, `workspace-screen.tsx`, dll). **Land/commit dulu perubahan itu** sebelum membuka branch bugfix, karena semua fix di bawah menyentuh file yang sama.

---

## WS-1 — BUG-01: Menu tab crash `Cannot read properties of undefined (reading 'length')`

- **Gejala**: crash saat kunjungan ke-2 tab Menu (menu → home → menu) setelah membuka form KPI Area; overlay menunjuk `ScrollView` di [menu.tsx:250](../mobile/src/app/(app)/(tabs)/menu.tsx). Recovery hanya via full reload.
- **Fakta dari kode**: semua array item (`AKSES_CEPAT`, `TEMPLATE_ITEMS`, dst.) adalah konstanta modul — tidak mungkin `undefined` kecuali saat HMR partial-reload. `.length` juga tidak dipakai pada data async di file ini. Kandidat riil:
  1. `useMyScore()` / `effectiveScore()` — payload di-destructure saat remount ([menu.tsx:227-228](../mobile/src/app/(app)/(tabs)/menu.tsx)).
  2. `useProfile().can` — array permission belum ter-load saat re-focus.
  3. Interaksi `react-native-css` ScrollView `className` dengan HMR (component stack berhenti di `ScrollViewBase`) — bila ini penyebabnya, crash **tidak akan reproduce di production bundle** dan prioritas turun.
- **Langkah**:
  1. Reproduksi di web preview persis per langkah laporan sesi 2; ambil stack lengkap (bukan hanya component stack) dari console.
  2. Uji juga tanpa HMR (production web build / dev build tanpa fast refresh) untuk memisahkan bug nyata vs artefak HMR.
  3. Fix sesuai temuan + guard defensif murah: pastikan hook yang mengembalikan array selalu default `[]` (di hook-nya, bukan tebar `?? []` di call-site).
  4. Regression test: render MenuScreen → unmount → render ulang (simulasi tab revisit) dengan mock `useMyScore`/`useProfile` yang resolve terlambat.
- **Verifikasi**: `npm test`, `npm run type-check`, lalu ulangi langkah repro manual di web preview.
- **Branch**: `fix/menu-crash-revisit`.

## WS-2 — BUG-02: WS-04 periode arsip tidak mengunci tombol turunan card

- **Root cause (terverifikasi)**: `GoalRow` menghitung `past = cardPeriodStatus(goal, focus)` ([workspace-screen.tsx:758](../mobile/src/screens/workspace-screen.tsx)). Goal berperiode tahunan tidak pernah `past` di dalam tahun berjalan — pitfall ini bahkan sudah didokumentasikan di [period-focus.ts:153-156](../mobile/src/lib/period-focus.ts) dan solusinya (`focusPeriodStatus`) sudah dipakai di level section header ([workspace-screen.tsx:1431](../mobile/src/screens/workspace-screen.tsx)), tapi tidak diteruskan ke tombol add per-card.
- **Fix**:
  1. Di setiap row tree (Goal, KPI Area, Strategy, Development Area, Problem Statement): `pastLocked = cardPast || focusPast` untuk tombol `+ turunan` (`CompactActionRow` prop `past`/`addDimmed`), sehingga tekan → `showPastPeriodAlert()`. Audit juga jalur `onAddPress` di [workspace-screen.tsx:425](../mobile/src/screens/workspace-screen.tsx) — override ini melewati cek `past`, pastikan semua caller `onAddPress` menangani past sendiri.
  2. Label panel periode: `PERIODE AKTIF` hardcoded di [period-switcher.tsx:91](../mobile/src/components/period-switcher.tsx) → dinamis (`PERIODE ARSIP` bila fokus past, `PERIODE AKAN DATANG` bila future).
  3. (PRD §44.9 poin b) card tampil redup saat fokus arsip — cek apakah sudah ada; kalau belum, tambahkan dim pada card body. `[?]` konfirmasi scope ke PRD dulu.
- **Tes**: perluas `period-switcher.test.tsx` (label arsip) + test workspace: fokus Juni (arsip) → tombol `+ KPI Area` pada Goal tahunan ber-`accessibilityState.disabled=true` dan press memicu alert, bukan navigasi.
- **Verifikasi manual**: ulangi langkah BUG-02 sesi 2 (pilih Juni 2026 → cek header + tombol card Goal) dan pastikan WS-04 sesi 1 (level hub) tetap pass.
- **Branch**: `fix/ws04-archive-child-buttons`.

## WS-3 — AP-03: repeat/instance flow putus (4 sub-masalah)

### 3a. CTA "Repeat hari ini" & "Terlewat" di Home membuka parent AP (root cause terverifikasi)

[home-screen.tsx:331](../mobile/src/screens/home-screen.tsx) dan [:357](../mobile/src/screens/home-screen.tsx): `HomeItemRow` untuk instance memanggil `openActionPlan(item.action_plan_id)`. Fix: rutekan ke `/action-plan/instance/${item.id}` bila item adalah instance (cek shape data `todayRepeatQ`/`overdueQ` — bila section mencampur AP dan instance, cabangkan berdasarkan tipe item). Tergantung 3c (layar instance harus berfungsi dulu di web).

### 3b. Notif `Review Sekarang` untuk submission instance mengarah ke parent AP

Mapping klien sudah benar: `entity_type === 'action_plan_instance'` → route instance ([notifications.tsx:76-77](../mobile/src/app/(app)/(tabs)/notifications.tsx)). Artinya notifikasi `review_request` untuk submission instance dibuat dengan `entity_type='action_plan'` di sisi server/seed. Investigasi trigger/function pembuat notifikasi di migrations (dan data seed) → ubah agar review_request instance memakai `entity_type='action_plan_instance'` + `entity_id=<instance_id>`. `[?]` pastikan dulu apakah ini bug trigger atau bug seed.

### 3c. Layar `action-plan/instance/[id]` blank di web (hanya judul "Instance", tanpa network fetch)

[instance/[id].tsx](../mobile/src/app/(app)/action-plan/instance/[id].tsx) terlihat benar secara struktur (loading → error → detail), jadi "blank tanpa fetch" mencurigakan di level routing/param web (mis. `useLocalSearchParams` kosong pada direct URL, atau layout `(app)` menahan render). Investigasi dengan web preview + `preview_network`/console; fix sesuai temuan. Ini **prasyarat 3a dan 3b**.

### 3d. Kontradiksi "Repeat Compliance 2/4 (50%)" vs "Belum ada instance" di detail AP parent

Dua sumber data berbeda: compliance (RPC) vs daftar "Instance Terjadwal" (`useRepeatInstances`, kemungkinan difilter rentang tanggal/fokus periode). Investigasi filter di [action-plan/[id].tsx](../mobile/src/app/(app)/action-plan/[id].tsx) + hook `use-repeat-instances`; selaraskan (daftar kosong padahal compliance menghitung 4 instance = filternya salah window, atau copy section harus menjelaskan window-nya).

- **Urutan dalam WS-3**: 3c → 3a → 3b → 3d.
- **Tes**: tambah kasus di `instance-detail.test.tsx` (param langsung), test routing Home (item repeat → push route instance), dan test/verifikasi DB untuk 3b bila trigger diubah (pola test kontrak DB yang sudah ada).
- **Branch**: `fix/ap03-repeat-instance-flow` (satu PR; 3b bisa dipisah bila menyentuh migration).

## WS-4 — DCR-05: aksi "Minta Revisi" reviewer belum ada

- **Fakta**: [deadline-change-request.tsx](../mobile/src/app/(app)/deadline-change-request.tsx) hanya punya `Setujui`/`Tolak`; `reviewRequest` hanya menerima `approved|rejected`.
- **Ini fitur, bukan bugfix** — butuh keputusan owner sebelum implementasi:
  1. Status baru request (mis. `revision_requested`) + siapa yang bisa mengubahnya kembali.
  2. Alur pemohon: edit alasan lalu resubmit request yang sama, atau request baru?
  3. Notifikasi ke pemohon.
- **Rekomendasi**: jalankan spec-first via `sdd-plan` (selaras PRD §DCR), lalu `tdd-plan`. Scope teknis kasarnya: migration enum/status + RPC review, data layer `reviewRequest`, UI tombol ketiga + field alasan revisi, notifikasi.
- **Branch**: `feat/dcr-request-revision` (setelah spec disetujui).

## WS-5 — Surface UI close-period (pemblokir PPL-07, SCORE-*, PPL-05 penuh)

- **Fakta**: backend RPC `close_period_snapshot` sudah ada; tidak ada satu pun entry point UI admin (dikonfirmasi 2 sesi uji, sampai Score Formula & semua item Menu Pengaturan/Admin).
- **Ini fitur** — butuh keputusan owner: di mana surface-nya (kandidat natural: layar Score Formula yang sudah menampilkan periode aktif), siapa pemegang izin, konfirmasi destruktif seperti apa (penutupan periode bersifat final per D9).
- **Rekomendasi**: spec-first via `sdd-plan`. Setelah ada, PPL-07/SCORE-* di kedua laporan bisa ditutup.
- **Branch**: `feat/close-period-admin` (setelah spec disetujui).

---

## Urutan eksekusi yang disarankan

1. **Commit/land dulu** perubahan Menu V1.82 di working tree (prasyarat semua WS).
2. **WS-2** (BUG-02) — root cause sudah pasti, fix kecil, PRD-mismatch P1. Paling cepat memberi nilai.
3. **WS-1** (BUG-01) — crash P1; mulai dari langkah pemisahan HMR vs bug nyata karena hasilnya menentukan bobot fix.
4. **WS-3** (AP-03) — paling besar; kerjakan berurutan 3c → 3a → 3b → 3d.
5. **WS-4 & WS-5** — ajukan keputusan owner / spec-first; implementasi setelah spec terkunci.

Tiap WS: branch sendiri, PR ke `main`, wajib `npm test` + `npm run type-check` dari `mobile/`, plus verifikasi manual mengulangi langkah repro pada laporan asal. Setelah semua WS-1..3 selesai, jadwalkan sesi manual testing lanjutan untuk re-verifikasi AP-03/WS-04 dan menutup kasus Blocked yang bergantung padanya.
