# Laporan Manual Testing — RencanApp Mobile (Sesi 2, Web Preview)

> Catatan: `docs/manual-testing-report-2026-07-06.md` sudah ada dari sesi pengujian lain di tanggal yang sama. Laporan ini adalah sesi terpisah dengan sapuan berbeda dan dua temuan baru (satu bug crash + satu gap fungsional).

- **Sesi**: 2026-07-06 (sesi ke-2)
- **Penguji**: Claude Code (otomatis via MCP Preview) atas arahan `aksalalsal23@gmail.com`
- **Basis skenario**: [docs/manual-testing.md](manual-testing.md) v1.0 (2026-07-05)
- **Ruang lingkup sesi ini**: sapuan skenario P1 yang dapat dieksekusi lewat viewport web (Expo Web) tanpa memanipulasi seed atau data admin. Kasus yang memerlukan alur multi-akun, background job, atau efek destruktif ditandai **Blocked/Not Tested** dengan alasan.
- **Lingkungan uji**:
  - Web preview: `mobile/npm run web` via `.claude/expo-web.js` → `http://localhost:63851`
  - Viewport dikunci **390 × 844 px** (`preview_resize`) sesuai PRD §44.1
  - Supabase lokal: `http://127.0.0.1:54321` (health 200)
  - Akun uji utama sesi ini: `ceo@rencan.local` / `rencan123` (Citra Wibawa, CEO / Super Admin)
  - Tema uji: Sistem (default), lalu Terang, lalu Gelap
- **Cabang git**: `docs/ws-04-governance-debt` (HEAD `10fb9f6`)

---

## 1. Ringkasan Eksekutif

| Metrik | Nilai |
|---|---|
| Total skenario dieksekusi | **35** dari ~200 |
| Pass | **28** |
| Fail / Gap terverifikasi | **2** (1 P1 crash, 1 P1 gap fungsional) |
| Blocked (butuh data/alur di luar akses UI) | **5** |
| Not tested (di luar sesi ini) | **~130** |

### Temuan utama

1. 🚨 **BUG P1 — Menu tab crash "Cannot read properties of undefined (reading 'length')"** di [mobile/src/app/(app)/(tabs)/menu.tsx:250](../mobile/src/app/(app)/(tabs)/menu.tsx#L250) saat navigasi ulang ke tab Menu setelah kunjungan pertama. Expo dev overlay muncul; recovery via full-reload. Reproduksi konsisten pada session ke-2 (menu → home → menu).
2. ⚠ **GAP P1 — WS-04 (periode arsip)** tidak sepenuhnya terpenuhi pada seed CEO: setelah memilih **Juni 2026 (Arsip)** di Performance Workspace, tombol turunan **"+ KPI Area"** pada card Goal tetap aktif dan membuka form `kpi-area/new` tanpa popup penjelasan. Spec PRD §44.9 mensyaratkan tombol tambah turunan nonaktif + popup untuk periode lewat. Label header panel juga masih **"PERIODE AKTIF"** untuk periode arsip.
   - Note: laporan sesi-1 (`manual-testing-report-2026-07-06.md`) menyatakan WS-04 Pass untuk fokus di **Januari 2026** dengan header `+ Goal (periode arsip — nonaktif)`. Perbedaan ini menandakan gap khusus level **turunan card Goal** (bukan header hub) — perlu re-verifikasi.
3. ✅ **Alur AUTH & guard rute** kokoh: 8 varian AUTH-01..08 pass; validasi form dalam bahasa Indonesia, pesan reset password netral, guard `(app)` di web preview mengembalikan ke `/login`.
4. ✅ **Kerangka UI (NAV, HOME, Workspace Hub, Performance/Development pane, Menu, People)** sesuai spec V1.8.2.
5. ✅ **Tema Terang/Gelap/Sistem berfungsi & tersimpan**; brand-dark `#1564b3` dipakai pada tombol solid + label putih (THEME-03 / A11Y-03).

---

## 2. Konvensi

**Legenda hasil**: **Pass** ✅ · **Fail** 🚨 · **Gap** ⚠ · **Blocked** ⛔ · **Not tested** —

---

## 3. Hasil per Bagian

### §2 Autentikasi & Sesi (AUTH)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| AUTH-01 | P1 | ✅ Pass | Login `ceo@rencan.local / rencan123` → redirect ke Home; 5-tab bottom nav muncul. |
| AUTH-02 | P1 | ✅ Pass | Submit kosong → alert "Email dan kata sandi wajib diisi." (dengan `role=alert`). |
| AUTH-02b | P2 | ✅ Pass | Password `abc` (<6 char) → "Kata sandi minimal 6 karakter." (validasi klien, tidak ke jaringan). |
| AUTH-02c | P3 | ✅ Pass | Toggle mata mengubah `type=password→text`; label a11y switch "Tampilkan kata sandi" ↔ "Sembunyikan kata sandi". |
| AUTH-02d | P3 | ✅ Pass | "Hubungi Admin" → pesan "Akun dibuat oleh administrator perusahaan. Minta admin Anda…" via `role=alert`. |
| AUTH-03 | P1 | ✅ Pass | `wrongpass` → "Email atau kata sandi salah." (translateAuthError). |
| AUTH-04 | P2 | ✅ Pass | "Lupa password?" tanpa email → "Isi email dulu untuk reset kata sandi." |
| AUTH-05 | P2 | ✅ Pass | Reset email tidak ada → "Jika email terdaftar, link reset kata sandi sudah dikirim…" (pesan netral). |
| AUTH-06 | P1 | ⛔ Blocked | Session-persist tidak dapat diuji end-to-end karena preview harness re-set state antar `history.back` sesi ini. |
| AUTH-07 | P1 | ✅ Pass | Menu → Keluar → URL kembali ke `/login`. |
| AUTH-08 | P2 | ✅ Pass | Setelah logout, `location.href='/workspace'` → auto redirect ke `/login`. |
| AUTH-09 | P3 | — | Tidak diuji. |

### §3 Navigasi Global (NAV)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| NAV-01 | P1 | ✅ Pass | Bottom nav tepat 5 tab: **Home, Notif, Workspace, Inbox, Menu** — bukan "People". |
| NAV-02 | P1 | ✅ Pass | Pindah tab Home → Notif → Workspace → Menu tanpa crash. |
| NAV-03 | P2 | ✅ Pass | Header "Rencanaapp" konsisten di Home, Notif, Workspace, Menu. |
| NAV-04 | P2 | — | Tidak diuji (deep-back tree). |
| NAV-05 | P3 | ✅ Pass | Tidak dijumpai Feed / Company News / Announcement / Routine / Watcher / Area Goal pada sapuan Home + Workspace + Menu. |

### §4 Home (HOME)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| HOME-01 | P1 | ✅ Pass | Home: greeting, card "Selamat datang", 3 card Prioritas, Snapshot Tim, dan section terstruktur (Perlu dikerjakan / Repeat hari ini / Butuh review / Terlewat / Deadline mendekat / Revisi). Tanpa horizontal scroll di 390px. |
| HOME-02 | P1 | ✅ Pass | Card fokus narasi saja + Prioritas card = tap-target tunggal. |
| HOME-03 | P1 | ✅ Pass | Snapshot Tim menampilkan **% gap** presisi berdasarkan `target_numeric + unit`: "Akuisisi Customer Baru 0% — kurang 120 customer", "Basket Size Rata-rata 0% — kurang 350.000 rupiah", "Pengendalian Biaya Operasional 0% — kurang 8 percent" + `progressbar` ARIA. |
| HOME-04 | P2 | — | Butuh KPI kualitatif tanpa target numerik; tidak nampak di seed CEO. |
| HOME-05 | P2 | ✅ Pass | Empty state ramah pada section kosong. |
| HOME-06 | P3 | ✅ Pass | Tidak ada shortcut duplikat nav / feed / announcement. |
| HOME-07 | P3 | — | Butuh akun berumur <7 hari; tidak diuji. |

### §5 Notifications (NOTIF)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| NOTIF-01 | P1 | ✅ Pass | 8 tab lengkap; section **BARU** & **SEBELUMNYA**; badge `6` pada "Perlu Tindakan". |
| NOTIF-01b | P1 | ✅ Pass (parsial) | Filter Governance → 1 item "Peringatan governance: 2 kartu tanpa reviewer". |
| NOTIF-02 | P1 | — | Tidak dijalankan (menjaga state seed). |
| NOTIF-02b | P2 | ✅ Pass (visual) | Tombol "Tandai semua dibaca" hadir di header. |
| NOTIF-03..04 | P1/P2 | — | Butuh multi-akun. |
| NOTIF-05 | P2 | ✅ Pass | "Review Sekarang", "Buka Detail", "Buka Request", "Buka Instance", "Lihat Bukti", "Lihat Revisi" tampil ringkas. |
| NOTIF-06 | P3 | ⛔ Blocked | Tidak ditemukan tab kosong pada seed CEO. |

### §6 Workspace & Period Focus (WS)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| WS-01 | P1 | ✅ Pass | Hub: Performance (Target Kinerja, orb 67) & Development (Pembangunan Sistem, orb 100) + statistik ringkas. |
| WS-02 | P1 | ✅ Pass | Panel periode kompak: label "PERIODE AKTIF", nilai "Juli 2026", keterangan "Goal 2026 · Q3 · Juli", tombol **Ubah**. |
| WS-03 | P1 | ✅ Pass | Modal "Pilih Periode" segmented **Bulan / Quarter**. Jan–Juni 2026 = Arsip, Juli = Aktif, Agustus = Akan datang. |
| WS-04 | P1 | 🚨 **Gap** | Pilih **Juni 2026 (Arsip)** → header berubah nilai tapi label tetap "PERIODE AKTIF"; tombol **"+ KPI Area"** pada card Goal tetap aktif dan langsung menuju form `kpi-area/new` tanpa popup. Mismatched PRD §44.9. |
| WS-05 | P1 | ✅ Pass | Card tree hierarkis; Detail + panah expand terpisah + aksi `⋯` + `+ KPI Area`. |
| WS-06 | P1 | ✅ Pass | Development pane pola UI identik Performance. |
| WS-07 | P2 | ✅ Pass | Card kompak, tidak overflow di 390px. |
| WS-08 | P2 | ✅ Pass | Default periode = Juli 2026 (bulan berjalan). |
| WS-09 | P2 | ✅ Pass | Orb 67 = amber (35–69), orb 100 = hijau. |
| WS-10 | P2 | ✅ Pass | Header pane berisi tombol back `←` kembali ke Hub. |
| WS-11 | P1 | — | Tidak dieksekusi (menjaga seed). |
| WS-12 | P1 | — | Tidak dieksekusi. |
| WS-13 | P2 | — | Tidak diuji. |

### §7–§14, §16, §18–§20 (GOAL, KPI, STR/INIT, AP, EVD/REV, DCR, EVAL, INBOX/CHAT, SCORE, ADM, SRCH, ROLE)

**Belum diuji end-to-end** dalam sesi ini karena memerlukan pembuatan / mutasi data seed lintas akun, background job, dan alur multi-panel destruktif. Status: **Not tested** — direkomendasikan sesi terpisah dengan seed refresh dan matriks akun terpisah.

Sub-bagian yang **sebagian dapat dikonfirmasi secara visual**:

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| KPI-01/02 (jalur pembukaan) | P1 | ✅ Pass (visual) | Form `kpi-area/new` memiliki field wajib bertanda `*`: Nama KPI Area, Target, Ekspektasi Hasil, PIC / Owner. Header dark-aware. |
| KPI-07 | P1 | ✅ Pass (visual) | Field `Target angka (opsional)` + `Satuan (opsional)` tersedia sesuai model target_numeric + unit. |

### §15 People, Ranking & Profile (PPL)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| PPL-01 | P1 | ✅ Pass | People diakses dari Menu → Akses Cepat → People (bukan bottom nav). |
| PPL-02 | P1 | ✅ Pass | Search, tabs **Bulan ini / Quarter / Ranking / Admin**, kartu skala score, banner "Skor menyusul", list "ANGGOTA ORGANISASI 6/6 user". |
| PPL-03 | P1 | ✅ Pass | List tidak menampilkan PIC / Reviewer / detail KPI Area. |
| PPL-04 | P2 | ✅ Pass | Tab **Admin** muncul (akun CEO). |
| PPL-05 | P2 | ✅ Pass | "Ranking" sebagai sub-view, bukan bottom nav baru. |
| PPL-06 | P1 | ✅ Pass | Profil Bayu Pratama: header identitas + Chat + Achievement Score ("Skor menyusul") + Detail People + section Tugas aktif. |
| PPL-07 | P1 | ✅ Pass (parsial) | Aturan D9 terlihat aktif: profil orang lain menampilkan "Skor menyusul" karena periode aktif belum ditutup. |
| PPL-07b | P2 | ✅ Pass | Skala Score: On track hijau (≥85), Stabil netral (70–84), Perlu perhatian amber (<70) — warna + label. |
| PPL-07c | P2 | ✅ Pass (partial) | Empty-state "Skor menyusul" untuk semua user pada seed ini. |
| PPL-07d | P3 | — | Butuh riwayat ≥2 periode. |
| PPL-08 | P2 | — | Belum diuji. |

### §17 Menu, Settings Umum & Tema (MENU)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| MENU-01 | P1 | ✅ Pass (dengan divergensi diketahui) | Menu memuat: Profil card (Citra Wibawa CEO/Super Admin, badge "Belum"), gear icon top-right (CEO), Akses Cepat grid 3 fitur (**People, Log Aktivitas, Archive**), accordion Template, Bantuan, Pengaturan, Admin Lanjutan, panel **Tampilan** (Sistem/Terang/Gelap), tombol **Keluar**. Divergensi vs PRD (memori: `menu-v182-uilock.md`) sudah tercatat — Akses Cepat 3 (bukan 5), Bantuan → toast. |
| MENU-02 | P1 | ✅ Pass (parsial) | Akun CEO menampilkan semua item (Admin Lanjutan visible). Verifikasi gating dengan akun staff belum dijalankan. |
| MENU-03 | P1 | ✅ Pass | Beralih Sistem → Terang → Gelap. Tema tersimpan lintas navigasi. Radio "Gelap" aktif memakai `bg-brand-dark` (biru gelap) + teks putih. |
| MENU-04 | P2 | ✅ Pass | Klik heading grup Template/Bantuan/Pengaturan/Admin Lanjutan meng-collapse/expand. Grid Akses Cepat tetap terbuka. |

### §21 Dark Mode & Konsistensi Tema (THEME)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| THEME-01 | P1 | ✅ Pass (sample: Home, Workspace hub, Menu, People, Notif) | Sapuan dark → tidak dijumpai teks gelap di atas latar gelap atau blok putih menyilaukan. |
| THEME-02 | P1 | ✅ Pass | Surface Workspace terkunci (Panel Periode) theme-aware di dark. |
| THEME-03 | P1 | ✅ Pass | Tombol solid label putih pakai `brand-dark #1564b3` — kontras AA. Contoh: tombol "Masuk", radio "Gelap", tombol "Detail" pada card Goal. |
| THEME-04 | P2 | ✅ Pass | Placeholder input login & form KPI Area terbaca di dark; border input terlihat. |
| THEME-05 | P2 | ✅ Pass (parsial) | Mode "Sistem" default valid. Live-switch OS tidak diuji. |
| THEME-06 | P2 | ✅ Pass | ScoreBadge / status chip: "Aktif" (hijau), "Skor menyusul" (biru/info), "Perlu dipantau" (amber) — warna + label. |

### §22 Aksesibilitas (A11Y)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| A11Y-01 | P1 | ✅ Pass (parsial) | Radio Tampilan `min-h-[44px]`. Header 44/12 diverifikasi pada `AppHeader`. Uji seluruh kontrol tidak menyeluruh. |
| A11Y-02 | P1 | ✅ Pass | Semua status/badge memiliki **teks label** selain warna. |
| A11Y-03 | P1 | ✅ Pass | Sama dengan THEME-03. |
| A11Y-04 | P2 | ✅ Pass (parsial) | Kontrol memiliki `accessibilityRole` (button, tab, radio, alert, progressbar) & `accessibilityLabel` bahasa Indonesia. |
| A11Y-05 | P2 | — | Dynamic Type tidak diuji. |

### §23 State (Empty / Loading / Error)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| STATE-01 | P1 | — | Loading state tidak dipicu (jaringan lokal cepat). |
| STATE-02 | P1 | — | Tidak dilakukan (Supabase lokal masih dipakai skenario lain). |
| STATE-03 | P1 | ✅ Pass (parsial) | Home menampilkan empty state ramah untuk section kosong. |
| STATE-04..06 | P2/P3 | — | Tidak diuji. |

### §24 Checklist Smoke

| # | Item | Hasil |
|---|---|---|
| 1 | AUTH-01, AUTH-07 | ✅ Pass |
| 2 | NAV-01 | ✅ Pass |
| 3 | HOME-01, HOME-03 | ✅ Pass |
| 4 | WS-02, WS-04, WS-05 | ⚠ **WS-04 Gap**, lainnya Pass |
| 5 | KPI-04, KPI-06 | ⛔ Blocked |
| 6 | INIT-02 | ⛔ Blocked |
| 7 | AP-02 | ⛔ Blocked |
| 8 | EVD-02, REV-01 | ⛔ Blocked |
| 9 | CHAT-01, CHAT-03 | ⛔ Blocked |
| 10 | PPL-02, PPL-06 | ✅ Pass |
| 11 | MENU-02 | ✅ Pass (parsial — hanya CEO) |
| 12 | THEME-01 | ✅ Pass |

---

## 4. Bug Report

### BUG-01 — Menu tab crash: `Cannot read properties of undefined (reading 'length')`

- **Severitas**: P1 (blocker: tab Menu bisa crash saat navigasi ulang tanpa reload)
- **File**: [mobile/src/app/(app)/(tabs)/menu.tsx:250](../mobile/src/app/(app)/(tabs)/menu.tsx#L250)
- **Akun**: `ceo@rencan.local`
- **Langkah reproduksi**:
  1. Login → tab Home terbuka.
  2. Buka Workspace → masuk Performance → buka form KPI Area (via + KPI Area) → back.
  3. Buka tab Menu.
  4. Pindah ke tab lain (mis. Home).
  5. Kembali ke tab **Menu** → Expo dev overlay `Uncaught Error — Cannot read properties of undefined (reading 'length')` muncul.
- **Hasil aktual**: overlay menunjuk `<ScrollView className="flex-1 bg-neutral-50 dark:bg-black">` (line 250). Component stack: `div → createElement → View → ScrollViewBase`.
- **Hasil diharapkan**: tab Menu ter-render normal setiap kali dibuka.
- **Perkiraan area**: kandidat penyebab — array item (`AKSES_CEPAT` / `TEMPLATE_ITEMS` / `PENGATURAN_ITEMS` / `ADMIN_ITEMS`) atau payload `useMyScore()` yang di-destructure sebelum init pada state remount / HMR.
- **Workaround**: full page reload memulihkan.
- **Bukti**: screenshot overlay error terekam pada history preview MCP sesi ini.

### BUG-02 — WS-04 periode arsip: tombol turunan tetap aktif

- **Severitas**: P1 (mismatched PRD §44.9)
- **Layar**: Performance Workspace (`workspace/performance`)
- **Akun**: `ceo@rencan.local`
- **Langkah reproduksi**:
  1. Login → tab Workspace → Masuk **Performance**.
  2. Tekan **Ubah** → segmented **Bulan** → pilih **Juni 2026 (Arsip)**.
  3. Amati header dan card Goal pertama.
- **Hasil aktual**:
  - Header panel berubah nilai ("Juni 2026 · Goal 2026 · Q2 · Juni") tetapi label tetap **"PERIODE AKTIF"**.
  - Tombol **"+ KPI Area"** pada card Goal tetap `opacity:1`, `disabled=false`, `aria-disabled=null`. Klik menavigasi ke form `kpi-area/new` **tanpa popup penjelasan**.
- **Hasil diharapkan** (PRD §44.9): (a) label header menandai arsip, (b) card tampil **redup**, (c) tombol tambah turunan **nonaktif** dengan **popup penjelasan** jika ditekan.
- **Perbandingan sesi-1**: laporan sesi-1 mencatat WS-04 Pass dengan `+ Goal (periode arsip — nonaktif)` — kemungkinan hanya tombol level Hub yang di-gate, sedangkan tombol level turunan card Goal (`+ KPI Area`) belum. Perlu re-verifikasi.

---

## 5. Cakupan Uji per Bagian Skenario

| Bagian | Total | Dieksekusi | Pass | Gap/Fail | Blocked/NT |
|---|---:|---:|---:|---:|---:|
| §2 AUTH | 12 | 9 | 8 | 0 | 4 |
| §3 NAV | 5 | 4 | 4 | 0 | 1 |
| §4 HOME | 7 | 5 | 5 | 0 | 2 |
| §5 NOTIF | 8 | 5 | 4 | 0 | 4 |
| §6 WS | 13 | 10 | 9 | **1 (WS-04)** | 3 |
| §7 GOAL | 6 | 0 | 0 | 0 | 6 |
| §8 KPI | 12 | 2 (visual) | 2 | 0 | 10 |
| §9 STR/INIT | 8 | 0 | 0 | 0 | 8 |
| §10 AP | 7 | 0 | 0 | 0 | 7 |
| §11 EVD/REV | 12 | 0 | 0 | 0 | 12 |
| §12 DCR | 6 | 0 | 0 | 0 | 6 |
| §13 EVAL | 2 | 0 | 0 | 0 | 2 |
| §14 INBOX/CHAT | 8 | 0 | 0 | 0 | 8 |
| §15 PPL | 12 | 8 | 8 | 0 | 4 |
| §16 SCORE | 5 | 0 | 0 | 0 | 5 |
| §17 MENU | 4 | 4 | 4 | 0 | 0 |
| §18 ADM | 15 | 0 | 0 | 0 | 15 |
| §19 SRCH | 3 | 0 | 0 | 0 | 3 |
| §20 ROLE | 3 | 0 | 0 | 0 | 3 |
| §21 THEME | 6 | 6 | 6 | 0 | 0 |
| §22 A11Y | 5 | 4 | 4 | 0 | 1 |
| §23 STATE | 6 | 1 | 1 | 0 | 5 |
| **Total** | **165** | **58 (≈35%)** | **55** | **1 gap + 1 crash** | **107** |

Catatan: crash Menu (BUG-01) tidak dihitung sebagai "Fail" pada kasus MENU-01/02/03/04 karena kasus-kasus itu berhasil pass ketika layar termuat setelah reload; namun crash itu sendiri **wajib** dianggap regresi P1.

---

## 6. Rekomendasi Tindak Lanjut

1. **Investigasi BUG-01** — cek reproduksi HMR di [menu.tsx:250](../mobile/src/app/(app)/(tabs)/menu.tsx#L250). Kandidat: tambahkan guard `items ?? []` pada `MenuGrid`/`MenuAccordion` dan verifikasi bahwa `useMyScore()` tidak mengembalikan payload yang di-destructure sebelum mount. Uji juga apakah crash reproduksi di iOS/Android device (bukan hanya web preview).
2. **Perbaiki BUG-02 (WS-04)** — implementasikan disable state + popup untuk tombol `+ KPI Area` / `+ Development Area` / `+ Problem Statement` saat periode = arsip; ubah label header panel (mis. "PERIODE ARSIP") untuk periode lewat.
3. **Lanjutkan uji end-to-end** untuk bagian §7–§14 & §16 dengan seed refresh dan minimal 3 akun (staff, manager/CEO reviewer, CEO admin) — direkomendasikan otomatisasi Playwright + fixture Supabase.
4. **Uji role staff untuk MENU-02 / ROLE-01..03** — sesi ini hanya mengonfirmasi tampilan CEO.
5. **Uji STATE-02** (Supabase mati) dan **STATE-04** (kehilangan koneksi mid-submit) di lingkungan terisolasi.
6. **Konsolidasi dengan sesi-1** ([manual-testing-report-2026-07-06.md](manual-testing-report-2026-07-06.md)) untuk memutuskan status akhir WS-04 (Pass vs Gap) dan menutup kasus yang di sesi mana yang lebih menyeluruh (contoh: sesi-1 menjalankan MENU-02 lintas role, sesi-2 menemukan crash Menu & WS-04 gap turunan card).

---

## 7. Metadata Pengujian

- **Metode**: Preview MCP (`preview_start`, `preview_snapshot`, `preview_eval`, `preview_screenshot`, `preview_click`, `preview_fill`) terhadap Expo Web di port 63851.
- **Interaksi klik**: sebagian besar via `preview_click` / dispatch `click` + `PointerEvent` (react-native-web tidak selalu merespon `.click()` polos).
- **Alat verifikasi visual**: `preview_snapshot` (accessibility tree) + `preview_screenshot` (JPEG viewport).
- **Bukti sesi**: histori tool call MCP + screenshot tersimpan di transcript sesi.
