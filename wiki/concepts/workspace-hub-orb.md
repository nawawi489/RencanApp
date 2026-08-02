---
type: concept
tags: [workspace, ui, hub-card, lobby, attainment, rollup]
updated: 2026-08-02
sources: 0
---

# Hub-card lobby: orb ruang (satu bentuk, label yang membedakan)

Lobby tab Workspace ([[surfaces]]) menampilkan dua **hub-card** (Performance & Development). Keduanya memakai **orb yang sama** (`ProgressOrb` 72px); yang membedakan makna adalah **label**, persis pola `treeOrbLabel` di tree.

| Hub | Orb | Label | Isi angka |
|---|---|---|---|
| Performance | ring 72px | **Capaian {tahun}** | mean capaian Goal terukur |
| Development | ring 72px | **Progress {tahun}** | mean status-rollup Area |

## Kenapa bentuknya TIDAK dibedakan

Sempat dirancang Development memakai bar (bukan orb) dengan alasan "tak punya capaian". Itu **salah menafsirkan** bug `c7627a6`. Bug aslinya sempit: orb yang menampilkan **KEPADATAN** (`activeCount/parentCount`) menyamar jadi capaian. Kepadatan-lah kebohongannya.

"Capaian vs Progress" bukan bug — itu justru yang **tree lakukan setiap hari**: `treeOrbLabel(kind, isMeasured)` mengembalikan `'Capaian'` untuk Goal/Strategi terukur dan `'Progress'` untuk sisanya, dengan **satu bentuk orb**. Development Area di dalam tree pun sudah dirender `<TreeOrbCell kind="development_area" …>` — orb, bukan bar. Membedakan bentuk di lobby malah membuat Development **inkonsisten dengan dirinya sendiri**: bar di lobby, orb begitu masuk.

## Kenapa Development selalu berlabel "Progress"

Lapis `measured` di badan RPC `workspace_card_progress` **hanya punya cabang Goal dan Strategy** (`goal_attainment` ∪ `strategy_attainment`). Development Area tidak pernah masuk ke sana, sehingga selalu `is_measured = false` dan jatuh ke *status-rollup*. Diverifikasi empiris 2026-08-02:

```
Sertifikasi Sistem ERP Finance | active | 0 | is_measured = f
Pelatihan Negosiasi Tim Sales  | active | 0 | is_measured = f
```

Rantai Development (Area → Problem Statement → Rencana Aksi → Tugas) tidak punya `target_numeric` di level mana pun. Jadi angkanya jujur disebut "Progress" (% pekerjaan selesai), bukan "Capaian".

## Konvensi rollup (diikuti, bukan dikarang ulang)

`deriveSpaceProgress` di `workspace-hub-stats.ts` — **satu fungsi untuk kedua ruang** — menerapkan aturan cabang `goal_attainment` RPC **satu tingkat ke atas** (kartu lvl-1 → Ruang):

1. **Populasi hanya `active`/`done`** — draft dan archived dibuang.
2. **Ada anak terukur** → mean anak **terukur saja**, label `Capaian`. Anak tak-terukur DIKELUARKAN (bukan dihitung 0), sama seperti guard `target_numeric > 0` di RPC — merata-ratakan capaian dengan status-rollup akan mencampur dua semantik.
3. **Nol anak terukur** → mean **semua** anak (homogen status-rollup), label `Progress`. Ini jalur Development.
4. **Mean tak tertimbang**; clamp 0..100 tidak diulang (RPC sudah clamp per kartu).

`null` **hanya** berarti tak ada data (kosong / gagal fetch / RLS) → UI render `—`. Mengikuti `TreeOrbCell`: kartu tak-terukur **tetap merender orb** berlabel "Progress"; `—` dicadangkan untuk `value == null` saja. (Rancangan sempat keliru menampilkan `—` saat nol kartu terukur — dikoreksi 2026-08-02.)

Perhitungan di **klien**, bukan RPC baru: RPC sudah mengembalikan `progress` + `is_measured` per kartu, jadi agregasi tinggal mean. Menambah mode agregat di SQL akan menduplikasi aturan di dua tempat.

## Scoping periode

Lobby memakai hook yang **sama** dengan pane (`usePerformanceItems`/`useDevelopmentItems`), jadi ikut di-scope ke tahun fokus. Dua alasan:

1. Capaian lintas-tahun tak bermakna — merata-ratakan Goal 2025 yang 100% dengan Goal 2026 yang 5% menghasilkan angka yang tak bisa ditindaklanjuti.
2. Set ID identik dengan pane → `useCardProgress` berbagi queryKey React Query. Terverifikasi 2026-08-02: pada `/workspace/performance` yang me-mount HubView **dan** pane sekaligus, hanya **1** request `workspace_card_progress` terjadi (ter-dedupe).

Konsekuensi yang disengaja: hitungan stat row kini per-tahun-fokus, bukan total lintas-waktu (membalik pilihan sebelumnya). Tahun ditulis eksplisit di caption orb (`Capaian 2026`) agar scope tidak ambigu.

## Riwayat keputusan

Elemen ini berubah tiga kali. Baca ketiganya sebelum mengubah lagi.

1. **Sebelum 2026-07-29 — orb `activeCount/parentCount`.** Persen "kepadatan aktivitas" yang tampil identik dengan orb capaian di tree. Kejadian nyata: user membaca orb hub `100` padahal semua Goal capaiannya `0%`. Warnanya pun menyesatkan — mengikuti ambang capaian, jadi "2 dari 3 Goal aktif" tampil amber ("perlu perhatian") padahal bukan kondisi buruk.
2. **2026-07-29 (`c7627a6`) — chip `N/M {parent} aktif`.** Jujur, tapi **redundan**: kedua angkanya sudah tampil persis di stat row tepat di bawahnya (`{parent}` dan `{parent} aktif`). Chip juga diam-diam berfungsi menambal label stat row kolom-3 yang ambigu ("Aktif" — aktif Goal atau aktif Strategi?).
3. **2026-08-02 (sekarang) — orb ruang sungguhan.** Chip dihapus; label kolom-3 dieksplisitkan jadi `Goal aktif`/`Area aktif` (memperluas prinsip owner QA 2026-07-24 "label == value"); kedua ruang dapat orb dari RPC, dibedakan label `Capaian`/`Progress`.

Opsi yang ditolak di putaran ini:

- **Bentuk berbeda per ruang** (ring vs bar) — sempat diimplementasi lalu dibatalkan. Menyalahartikan bug (1) sebagai "capaian vs progress tak boleh sebentuk", padahal itu konvensi tree. Efeknya Development jadi inkonsisten dengan dirinya sendiri (bar di lobby, orb di tree).
- **Hapus indikator sepenuhnya** — menghilangkan bobot visual lobby tanpa perlu; masalahnya redundansi, bukan keberadaan indikator.
- **Stat row lintas-waktu + orb per-tahun** — dua angka beda scope dalam satu kartu, jenis ketidakcocokan halus yang memicu seluruh riwayat ini.
- **Development tanpa RPC** — menyia-nyiakan cache-hit dan konsistensi; `useCardProgress(devIds)` berbagi queryKey dengan pane Development, jadi biayanya nol.

## Catatan ekspektasi

Angka capaian jujur **akan terlihat rendah** pada organisasi yang baru mulai (data uji lokal: `4%`), karena hanya menghitung nilai hasil yang **sudah disetujui** terhadap target numerik. Itu benar dan disengaja. Jangan "memperbaiki" rumus agar angkanya terlihat bagus — itu jalan kembali ke ambiguitas.

## Lokasi kode

- `mobile/src/components/workspace-hub-card.tsx` — hub-card + `HubProgressOrb` (dipakai kedua ruang).
- `mobile/src/lib/workspace-hub-stats.ts` — `deriveSpaceProgress` (kedua ruang), `derive*HubStats`.
- `mobile/src/screens/workspace-screen.tsx` — `HubView` (lobby) merangkai indikator + scoping periode.
- `mobile/src/lib/__tests__/workspace-hub-stats.test.ts` — mengunci 4 prinsip konvensi rollup.
- `mobile/src/components/__tests__/workspace-hub-card.test.tsx` — regresi chip-dihapus, `—` vs `0%`, bentuk beda per ruang.
