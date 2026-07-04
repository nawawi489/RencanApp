---
type: concept
tags: [workspace, ui, sprint-plan, lock-spec, v1.82]
updated: 2026-07-03
sources: 1
---

# Workspace Lock Sprint Plan

Rencana eksekusi perbaikan seluruh temuan [[workspace-lock-audit]] agar `mobile/` memenuhi prototype final Workspace (dulu diformalkan sebagai `WORKSPACE_UI_LOCK_SPEC_V1.82.md`, kini dihapus 2026-07-03 — rujukan §-nomor di bawah mengikuti penomoran spec lama). Lima sprint, diurutkan dari murah-berdampak ke struktural-berisiko. Setiap sprint harus meninggalkan jest suite hijau dan tidak menyentuh area di luar Workspace.

Aturan lintas-sprint:

1. Sebelum menyentuh UI, baca `DESIGN.md`; token warna baru dari spec (mis. `#c2410c`, `#eefaf8`, `#cfd8e5`, `#eef4fb`) didaftarkan di `DESIGN.md` dulu lalu `global.css`.
2. Copy yang dikunci spec ditaruh di `workspace-copy.ts`, bukan hardcode di komponen.
3. Tiap sprint ditutup screenshot 390px + centang ulang AC §18 yang jadi target sprint (§19.7).
4. Temuan dirujuk dengan ID `WSA-xx` di commit/PR.

---

## Sprint 1 — Copy Lock (WSA-09, WSA-12)

Estimasi: 0.5–1 hari. Risiko rendah, murni teks; menutup banyak mismatch AC sekaligus.

- [ ] `periodBreadcrumb()` menerima konteks ruang: prefix `Goal` untuk Performance, `Development` untuk Development (`period-focus.ts:61`; pemakaian di `period-switcher.tsx`).
- [ ] Stat hub Performance kolom-3: `Aktif` → `Notif` (nilai dari notifikasi terkait Performance; jika belum ada sumber data, tetap ganti label dan sambungkan ke count notif yang tersedia).
- [ ] Stat hub Development: `Dev Area` → `Area`, `Problem` → `Problem Statement`.
- [ ] Tombol hub: `Masuk Performance`/`Masuk Development` → `Masuk`.
- [ ] Section title overview: kembalikan pola kiri `Workspace` / kanan `2 ruang` (ganti subtitle kalimat).
- [ ] CTA: `+ Goal Baru` → `+ Goal`; `+ Development Area Baru` → `+ Development Area`.
- [ ] Empty state: `Belum ada Goal aktif di periode ini.` dan `Belum ada Development Area aktif di periode ini.`
- [ ] Toast periode-lewat pakai kalimat spec: `Periode ini sudah menjadi Archive. Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.` (`period-focus.ts:164-179`).
- [ ] Update snapshot/test copy yang terdampak.

Target AC: menutup porsi copy dari AC 3, 4; memperbaiki §7.2, §12.4, §15.

## Sprint 2 — Guard & Permission Correctness (WSA-04, WSA-08 sebagian, WSA-13, WSA-18)

Estimasi: 1–2 hari. Ini bug perilaku, bukan kosmetik — prioritas di atas visual.

- [ ] **Guard MBR di tree** (WSA-04): tombol `+` di `CardActionRow` dan `StrategySubRow` cek [[minimum-breakdown-rule]] via data compliance sebelum `router.push`; saat ter-guard → tombol tetap terlihat tapi redup, tap menampilkan toast copy spec §12.3 (`KPI Area ini baru punya 2 dari 3 Strategy. …baru tombol + Initiative aktif.`), tidak membuka form.
- [ ] **Selaraskan guard detail page**: copy `activation-check.ts:121` diganti kalimat spec; hapus CTA proceed yang tetap membuka form; ubah fail-open → fail-closed (atau loading state) saat data compliance belum ada.
- [ ] **Gating permission detail page** (WSA-08 bagian gating): bungkus semua `+ Tambah <turunan>` dengan `can()` yang tepat (`goal/[id]`, `kpi-area/[id]`, `strategy/[id]`, `development-area/[id]`, `problem-statement/[id]`). Penghapusan total CTA ini ditunda ke Sprint 5 (dependensi WSA-01).
- [ ] **Permission key presisi** (WSA-13): `+ Strategy` → `create_strategy`; `+ Problem Statement` → `create_problem_statement` (verifikasi key tersedia di [[permission-model]] / seed permission).
- [ ] **Sanitasi error mutation** (WSA-18): ganti `Alert.alert(..., e.message)` dengan copy ramah + log teknis ke console/telemetry.
- [ ] Test TDD: unit guard MBR per level, test gating per role (pakai pola test permission yang sudah ada).

Target AC: 24, 25; §16.1.

## Sprint 3 — Visual Lock: Tree Card Anatomy (WSA-03, WSA-15, WSA-17)

Estimasi: 2–3 hari. Satu paket komponen reusable; tidak mengubah data flow.

- [ ] Daftarkan token warna spec di `DESIGN.md` + `global.css` (blue `#1877f2`/`#145ebc`, amber `#b76b00`, violet `#6941c6`, green `#14845c`, teal `#0f766e`, orange `#c2410c`, soft variants, line `#cfd8e5`, `#d9e2ec`).
- [ ] Komponen `WorkspaceKindPill` (§9): letter badge G/K/S/I/AP/D/P, circle 18px, min-h 26, radius 999, mapping warna persis spec. Bukan icon lucide.
- [ ] `ProgressOrb` varian tree (§10, WSA-15): 50×50, angka + `%`, label visual bawah `Capaian` (Goal/KPI Area) atau `Progress` (lainnya), warna good/risk/bad.
- [ ] Refactor tree card ke anatomi spec (§6.4–6.8): grid 3 kolom (main / orb 50px / toggle panah 34px kanan; Action Plan 2 kolom tanpa panah), border kiri 5px warna kategori, period badge, subhead ringkas target/aktual dari data live.
- [ ] Indentasi `tree-level-1..5` (12/16/20/24/28px) + connector L (`#cfd8e5`, w10 h32, radius bottom-left 8) — ganti pola card-dalam-card menjadi sibling ber-margin.
- [ ] Action row lock (§11, WSA-17): `Detail` pill biru `#1877f2` teks putih h30 r999; `⋯` 34×30 r999 bg `#f8fafc` teks `⋯` saja; `+` pill blue-soft border `#cce2ff` teks `#145ebc` dengan label konteks terlihat (`+ KPI Area`, `+ Strategy`, `+ Initiative`, `+ Plan`, `+ Problem Statement`).
- [ ] Archived visual §12.4 diselaraskan komponen baru: pill abu, orb desaturasi, `+` abu.
- [ ] Cek a11y: touch target ≥44px meski tinggi visual 30px (hitbox/hitSlop), kontras AA per `DESIGN.md §4`.
- [ ] Screenshot 390px: pastikan label `+ Strategy` dkk tidak kepotong (AC 33) dan tanpa horizontal scroll (AC 31).

Target AC: 22, 23, 32, 33; porsi besar AC 3–4 level tree.

## Sprint 4 — Visual Lock: Overview, Header, Period Switcher (WSA-05, WSA-06, WSA-07, WSA-10, WSA-11)

Estimasi: 2 hari.

- [ ] **Hub card identity** (WSA-11): border kiri 4px (blue/teal), gradient (`#f8fbff`/`#f7fffd`), min-height ~172px, kicker jadi pill, progress line bawah, tombol `Masuk` + icon panah sebagai tombol nyata.
- [ ] **Help modal `?`** (WSA-05): tombol `?` 26×26 circle di kanan atas kedua hub card; modal dengan copy persis §5 (title, question, description, 3 checks per ruang); klik `?` tidak menavigasi.
- [ ] **Search input** (WSA-06): di atas card overview, placeholder `Cari Goal, KPI Area, Initiative, Action Plan`; sambungkan ke route `search` yang sudah ada; bukan filter chip.
- [ ] **Header button row** (WSA-07): pindah ke paling atas konten pane; `Kembali` pill putih h38 min-w 92 + icon panah 18px; `+ Goal` primary biru h42 r8; `Edit` secondary putih h42 (visibilitas digate admin — wiring aksi menyusul Sprint 5).
- [ ] **Period switcher** (WSA-10): ubah jadi collapsed pill (summary min-h 48, bg `#eef4fb` border `#d9e3ef`, radius 999 tertutup; varian Development `#eefaf8`/`#cceee8`), kiri label `Periode aktif` + strong + small breadcrumb, kanan pill `Ubah`; panel buka boleh tetap bottom-sheet (intent-equivalent) dengan list periode berdeskripsi + pill `Archive/Aktif/Quarter`.
- [ ] Screenshot 390px + re-cek AC overview.

Target AC: 3, 4, 8 (porsi tombol), 9 (porsi tombol), 11.

## Sprint 5 — Struktural: Route & Tree Lengkap (WSA-01, WSA-02, WSA-08 penghapusan CTA, WSA-14, WSA-16, WSA-19, WSA-20)

Estimasi: 3–5 hari. Paling berisiko; kerjakan terakhir setelah lapisan visual/behavior stabil.

- [ ] **Tree 4–5 level** (WSA-01): render Initiative di bawah Strategy dan Action Plan di bawah Initiative (Performance), serta Action Plan di bawah Initiative (Development), memakai komponen Sprint 3 dengan lazy fetch per expand. Merevisi ADR Stage 1 — catat pembalikan keputusannya.
- [ ] **Hapus CTA `+ Tambah <turunan>` di detail page** (WSA-08 final, §14.4) setelah tree lengkap menjadi satu-satunya jalur tambah turunan.
- [~] **Route restructure** (WSA-02): PARSIAL via slice aman — tab bar kini terlihat di **pane** Workspace (nested stack `(tabs)/workspace/`). Tab bar di **halaman detail leaf** (`/goal/[id]` dkk) DITOLAK by owner decision: nge-nest route detail memutus deep-link Home/Notif/Inbox/People/Search (§19.2); pola tab-hidden-on-detail diterima valid. Resolved-by-decision (2026-07-03).
- [x] **Route pane terpisah** (WSA-19): DONE — `Masuk` → route deep-linkable `/workspace/performance`·`/workspace/development` (nested stack, `initialRouteName='index'` anchor, back gesture ke hub). Screen dipindah ke `src/screens/workspace-screen.tsx`. Verifikasi live 390px. TIDAK memutus deep-link detail.
- [ ] **Action sheet fungsional** (WSA-14): wire `Arsipkan` ke `useArchiveActions`, `Ubah` ke form edit; tambah permission/history untuk admin; gate per [[permission-model]]; hapus placeholder Alert.
- [ ] **Keputusan owner — "Initiative Tanpa Goal"** (WSA-16): section ini di luar spec §6. Opsi: (a) hapus dari pane, pindah aksesnya ke search/Menu; (b) pertahankan dengan persetujuan owner sebagai deviasi tercatat. Jangan hapus sepihak — ada kebutuhan data nyata (initiative yatim).
- [x] **Toast edukasi body-tap** (WSA-20): DONE — tap badan card → toast `Untuk membuka isi Card, gunakan tombol Detail di dalam Card.` via `WorkspaceToastHost` + `TreeCardBody` (Pressable overlay absolut, bukan pembungkus, agar test-safe). Menutup AC 20 secara harfiah.
- [ ] Verifikasi akhir: jalankan seluruh AC §18 (35 item) di viewport 390px, screenshot, dan update [[workspace-lock-audit]] dengan skor baru.

Target AC: 1, 18, 20, 21, 29 (penuh), dan penuntasan 3–4.

---

## Dependensi & keputusan terbuka

1. **WSA-08 dua tahap**: gating dulu (Sprint 2), penghapusan CTA setelah tree lengkap (Sprint 5) — sebelum tree 4-level ada, detail page Initiative adalah satu-satunya jalur buat Action Plan.
2. **Restrukturisasi route (WSA-02/19)** menyentuh `(app)/_layout.tsx` yang dipakai screen non-Workspace; §19.2 melarang mengubah area lain — scope perubahan harus dijaga hanya penambahan nested stack Workspace, bukan reorganisasi global.
3. **"Initiative Tanpa Goal" (WSA-16)** dan **sumber data stat `Notif` di hub Performance** butuh keputusan owner.
4. **ADR Stage 1** (tree 3 level) dibalik di Sprint 5 — perlu dicatat di ADR/log alasan pembalikan: lock spec V1.82 mengunci tree penuh.

Progress dicatat di `wiki/log.md` per sprint selesai.
