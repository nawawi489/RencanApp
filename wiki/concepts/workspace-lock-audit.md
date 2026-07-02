---
type: concept
tags: [workspace, ui, audit, lock-spec, v1.82]
updated: 2026-07-02
sources: 1
---

# Workspace Lock Audit (V1.82)

Hasil audit implementasi `mobile/` terhadap `WORKSPACE_UI_LOCK_SPEC_V1.82.md` (root repo). Spec tersebut mengunci area Workspace agar mengikuti prototype final `outputs/ems-mobile-ui/index.html`; jika konflik dengan PRD umum, untuk area Workspace spec lock menang (§19.6).

Audit dilakukan 2026-07-02 pada jalur live (`LiveWorkspaceScreen`), bukan prototype stub. Skor acceptance criteria §18: **20 PASS · 7 PARTIAL · 8 FAIL** dari 35.

Halaman terkait: [[workspace]], [[surfaces]], [[minimum-breakdown-rule]], [[permission-model]], [[ui-prototype-gap]], [[workspace-lock-sprint-plan]].

---

## Kesimpulan

Perilaku dan interaksi inti sudah searah spec: tree default collapsed dengan lazy fetch, pemisahan tombol `Detail` vs panah turunan, klik badan card tidak membuka detail, dim periode-lewat dengan blokir tambah turunan, permission gating di tree, skeleton loading, error state dengan `Coba lagi`, dan §13 What Not To Build bersih penuh.

Yang belum: **lapisan visual lock hampir seluruhnya absen** (pill letter-badge, progress orb di tree, border kiri warna kategori, indentasi + connector, styling tombol), **tree baru 3 level**, **bottom nav hilang di screen turunan**, dan **guard [[minimum-breakdown-rule]] tidak diberlakukan di tree**.

---

## Temuan

ID temuan `WSA-xx` dipakai sebagai rujukan di [[workspace-lock-sprint-plan]] dan PR.

### Kritis (struktural)

- **WSA-01 — Tree tidak lengkap (3 dari 5 level).** Performance berhenti di Goal → KPI Area → Strategy; Initiative dan Action Plan tidak dirender di tree (penundaan sadar via ADR Stage 1, komentar `workspace.tsx:4`). Development berhenti di Initiative tanpa `+ Plan`. Melanggar §6.7–6.8, §7.5. Konsekuensi: AC 22/23 untuk dua level terbawah tidak bisa dinilai.
- **WSA-02 — Bottom nav hilang di semua screen turunan Workspace.** Semua detail/form (`goal/[id]`, `kpi-area/[id]`, `strategy/[id]`, `initiative/[id]`, `action-plan/*`, `development-area/[id]`, `problem-statement/[id]`, form buat card, dst.) terdaftar di Stack root `(app)/_layout.tsx:17-70` sebagai sibling `(tabs)` — nav tidak dirender sama sekali, bukan sekadar tidak aktif. Melanggar §2, AC 1. Butuh restrukturisasi route. Terkait [[surfaces]].
- **WSA-03 — Anatomi visual tree card belum diimplementasi.** Tanpa pill letter-badge kategori G/K/S/I/AP/D/P (§9), tanpa progress orb + label `Capaian`/`Progress` di tree card (§10, AC 22), tanpa border kiri 5px warna kategori, tanpa period badge, tanpa indentasi `tree-level-1..5` (12/16/20/24/28px) + connector L `#cfd8e5` (§8). Nesting via card-dalam-card; toggle turunan berupa teks `Lihat X ▸` di kiri action row, bukan panah 34px di kolom kanan. Warna `#c2410c` (Problem Statement) tidak ada di codebase. Bukti: `workspace.tsx:332-655`, `ui.tsx:144-163`.
- **WSA-04 — Guard MBR absen di tree.** Tombol `+` di tree langsung `router.push` ke form tanpa cek [[minimum-breakdown-rule]] (`workspace.tsx:154, 235-239, 296-299`). Guard hanya ada di detail pages via `activation-check.ts:106-127`, dengan tiga penyimpangan: copy bukan kalimat spec §12.3, popup punya CTA yang tetap membuka form (spec: klik tidak membuka form), dan fail-open saat data compliance kosong. Tidak ada visual redup pada tombol ter-guard MBR. Melanggar §12.3, AC 24–25.

### Tinggi

- **WSA-05 — Help modal `?` (§5) tidak ada.** Tidak ada tombol `?` 26×26 di hub card Performance/Development dan seluruh copy modal (title/question/description/checks) nol hasil di codebase. Melanggar §5, bagian dari AC 3–4.
- **WSA-06 — Search input overview tidak ada.** Placeholder `Cari Goal, KPI Area, Initiative, Action Plan` (elemen pertama overview per §4.1) tidak ditemukan; route `search` ada di stack tapi tidak di-surface dari overview.
- **WSA-07 — Header button row salah.** Tombol `Edit` tidak ada di kedua pane; back berupa text-link `← Workspace` bukan pill `Kembali` (h38, min-w 92, icon panah); `+ Goal Baru` full-width dan posisinya di bawah period switcher, bukan button row paling atas. Melanggar §6.1, §7.1, AC 8–9. Bukti: `workspace.tsx:657-688, 776-787, 868-885`.
- **WSA-08 — Detail page punya CTA tambah turunan, mayoritas tanpa gating.** Semua detail page merender `+ Tambah <turunan>` — dilarang §14.4 (flow tambah seharusnya dari tree). 5 dari 6 tanpa cek `can()` sama sekali (`goal/[id].tsx:172`, `kpi-area/[id].tsx:379`, `strategy/[id].tsx:161`, `development-area/[id].tsx:223`, `problem-statement/[id].tsx:177`); hanya `initiative/[id].tsx:370` yang benar. Melanggar §14.4 + §16.1. Terkait [[permission-model]].
- **WSA-09 — Breadcrumb periode salah ruang di Development.** `periodBreadcrumb()` hardcode prefix `Goal` (`period-focus.ts:61`), sehingga pane Development menampilkan `Goal 2026 · Q3 · Juli` alih-alih `Development 2026 · …`. Melanggar §7.2.

### Sedang

- **WSA-10 — Period switcher berbentuk card besar.** Dirender sebagai card putih `rounded-2xl p-4` (`period-switcher.tsx:61`) — dilarang eksplisit §6.2 (harus collapsed pill, summary bg `#eef4fb` border `#d9e3ef`, min-h 48). Varian Development (`#eefaf8`/`#cceee8`) tidak ada; list periode tanpa deskripsi per spec; pill list `Arsip/Akan datang` bukan `Archive/Quarter`. Mode toggle Bulan/Quarter + default Bulan sudah benar.
- **WSA-11 — Identitas visual hub card hilang.** Tanpa border kiri 4px (`#1877f2`/`#0f766e`), gradient (`#f8fbff`/`#f7fffd`), min-height ~172px, progress line bawah; kicker teks biasa bukan pill; kedua card identik netral (`workspace-hub-card.tsx:38-65`).
- **WSA-12 — Copy mismatch batch.** Sebagian besar terpusat di `workspace-copy.ts`:
  - Stat Performance kolom-3 `Aktif` → spec `Notif`.
  - Stat Development `Dev Area`/`Problem` → spec `Area`/`Problem Statement`.
  - `Masuk Performance`/`Masuk Development` → spec `Masuk`.
  - `+ Goal Baru`/`+ Development Area Baru` → spec `+ Goal`/`+ Development Area`.
  - Empty state `Belum ada Goal` → spec `Belum ada Goal aktif di periode ini.` (idem Development).
  - Toast archive `Periode sudah lewat…` → spec `Periode ini sudah menjadi Archive. Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.`
  - Section title kanan `2 ruang` diganti subtitle kalimat.
- **WSA-13 — Permission key proxy tidak presisi.** `+ Strategy` digate `create_kpi_area` (`workspace.tsx:272`), `+ Problem Statement` digate `create_development_area` (`workspace.tsx:552`) — key spesifik (`create_strategy`, dst.) ada di sistem tapi tidak dipakai.
- **WSA-14 — Action sheet `⋯` placeholder.** `Ubah/Arsipkan/Salin` semua Alert "belum tersedia di V1" (`workspace.tsx:167-176`); tanpa Archive fungsional, tanpa gating admin, tanpa aksi permission/history — padahal `useArchiveActions` sudah ada di `use-governance-admin.ts:127`. Melanggar §12.2, §16 (bagian admin), AC 21 parsial.

### Rendah

- **WSA-15 — Komponen `ProgressOrb` menyimpang dari §10.** SVG ring stroke (bukan conic-fill + inner radial), size 56/72 (bukan 50), tanpa label visual bawah (`Capaian` hanya di accessibilityLabel), angka tanpa `%` (`ui.tsx:594-646`).
- **WSA-16 — Elemen di luar spec.** Section "Initiative Tanpa Goal" selalu tampil di pane Performance (`workspace.tsx:790-813`); TabBar internal Performance/Development di dalam pane. Spec memodelkan dua screen terpisah tanpa section flat tambahan.
- **WSA-17 — Tombol `+` icon-only.** Label konteks (`+ KPI Area`, `+ Strategy`, `+ Plan`, `+ Problem Statement`) hanya di accessibilityLabel; spec §11 mengunci label terlihat. AC 33 lolos secara trivial karena labelnya memang tidak ada.
- **WSA-18 — Alert mutation menampilkan `e.message` backend mentah** di detail pages (mis. `kpi-area/[id].tsx:216`, `strategy/[id].tsx:70`) — berisiko memunculkan error teknis ke user (§15 error rule).
- **WSA-19 — `Masuk` pindah pane via state internal.** Hub → pane memakai `useState<Tab>` di route `/workspace` yang sama (`workspace.tsx:927-935`), bukan route `performance-workspace`/`development-workspace`; tidak deep-linkable dan back gesture tidak kembali ke hub.
- **WSA-20 — Toast edukasi tap-badan-card belum ada.** Spec §12.1.4 memakai kata "boleh" (opsional); saat ini tap badan card no-op senyap — AC 19 tetap terpenuhi.

---

## Yang sudah patuh

- §13 What Not To Build bersih penuh: tanpa table/kanban/feed/timeline/filter chip panjang/`+ Workspace`/People di nav/Workspace di Menu.
- Bottom nav 5 tab benar: Home, Notif, Workspace, Inbox, Menu (AC 2, 5, 6, 7).
- Overview hanya 2 card; judul `Target Kinerja`/`Pembangunan Sistem` (bukan `Perbaikan Sistem`); meta flow-line persis spec, satu baris, tidak bold (AC 35).
- Tree default collapsed, Goal terlihat pertama, KPI Area lazy fetch saat expand (AC 15–16).
- `Detail` membuka detail page; toggle expand terpisah; klik badan card tidak membuka detail (AC 17–19).
- Periode-lewat: card dim (single-layer `PastDim`), Detail tetap bisa dibuka, tambah turunan diblokir dengan popup (AC 26–28).
- Default fokus periode = bulan berjalan, mode default `Bulan`, Quarter optional di switcher (AC 12–14).
- Loading skeleton max 3 mengikuti bentuk card; error state kecil + `Coba lagi` (§15).
- Permission gating di tree: `+` disembunyikan tanpa izin create; Detail/expand bebas untuk view access (§16, dengan catatan WSA-13).
- Aksi Bukti/Review tidak ada di tree card — hanya di Action Plan detail (§16.4).
- Activity Log di detail page berupa accordion default collapsed (§14.6).
- Detail page hanya menampilkan 1 level anak langsung, bukan tree penuh (AC 29).
- Viewport 390px aman: layout fleksibel, tanpa lebar fix yang berisiko horizontal scroll (AC 31–32).

---

## Scorecard AC §18

| Status | AC |
|---|---|
| PASS (20) | 2, 5, 6, 7, 10, 12, 13, 14, 15, 16, 17, 19, 26, 27, 28, 29, 31, 32, 34, 35 |
| PARTIAL (7) | 3, 4, 18, 20, 21, 30, 33 |
| FAIL (8) | 1, 8, 9, 11, 22, 23, 24, 25 |

Eksekusi perbaikan: lihat [[workspace-lock-sprint-plan]].
