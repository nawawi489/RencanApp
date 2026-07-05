# Laporan Manual Testing — RencanApp

- **Tanggal**: 2026-07-05
- **Penguji**: Claude Code (sesi otomatis via web preview)
- **Panduan**: `docs/manual-testing.md` v1.0 (2026-07-05)
- **Build/branch**: `fix/darkmode-a11y-consistency` @ HEAD `44bddb7`
- **Lingkungan**: `mobile/` — Expo Web di `http://localhost:8091`, viewport 390×844 (desktop) & 375×812 (mobile preset), Supabase lokal (54321/54322)
- **Akun aktif**:
  - `ceo@rencan.local` (CEO / Super Admin — "Citra Wibawa")
  - `staff.sales@rencan.local` (Staff · Nyantuy Group — "Fajar Nugroho", Score 82.5)

## 1. Ringkasan Eksekutif

| Status | Jumlah |
|---|---|
| ✅ Pass | 30 |
| ⚠️ Partial / Observasi | 2 |
| ❌ Fail | 0 |
| ⛔ Blocked (tidak dapat diuji via UI dalam sesi ini) | 85+ |

**Kesimpulan cepat**: Alur inti UI (autentikasi, navigasi, home, workspace hub + pane, menu, notif, inbox, tema) **berjalan sesuai PRD V1.8.2**. Tidak ada blocker rilis yang ditemukan pada permukaan yang diuji. Sebagian besar kasus data-driven (KPI breakdown, MBR, Repeat instance, Review, DCR, Score, People closed-period, Admin CRUD, multi-role matrix) **belum dapat diverifikasi dalam sesi non-interaktif** — memerlukan multi-akun paralel, penutupan periode admin, background job, atau perubahan permission via UI Admin.

Rekomendasi: (1) jalankan seri Data/Role dengan penguji manusia bergantian akun; (2) picu manual pembuatan instance Repeat via RPC uji sebelum menguji AP-02/AP-03/AP-03b; (3) tutup satu periode uji sebelum PPL-07.

---

## 2. Hasil per Modul

### 2.1 Autentikasi (AUTH)

| ID | Prio | Hasil | Bukti |
|---|---|---|---|
| AUTH-01 | P1 | ✅ Pass | Login `ceo@rencan.local` / `rencan123` → redirect ke Home; header "Rencanaapp", greeting "Selamat pagi, Citra." |
| AUTH-02 | P1 | ✅ Pass | Submit dengan kedua field kosong → pesan "Email dan kata sandi wajib diisi." (tidak ada request) |
| AUTH-03 | P1 | ✅ Pass | Password salah → "Email atau kata sandi salah." (Bahasa Indonesia, bukan pesan Supabase mentah) |
| AUTH-04 | P2 | ✅ Pass | "Lupa password" tanpa email → "Isi email dulu untuk reset kata sandi." |
| AUTH-05 | P2 | ✅ Pass | "Lupa password" dengan email valid → pesan netral "Jika email terdaftar, link reset kata sandi sudah dikirim…" (tidak membocorkan status email) |
| AUTH-06 | P1 | ✅ Pass | Reload penuh setelah login → tetap masuk ke Home tanpa kembali ke Login |
| AUTH-07 | P1 | ✅ Pass | Menu → **Keluar** → kembali ke layar Login |
| AUTH-08 | P2 | ✅ Pass | Logout → set URL langsung `/workspace` → dialihkan ke Login (guard rute aktif) |
| AUTH-02b | P2 | ⛔ Blocked | Perlu inspeksi validator; tidak diverifikasi UI-nya di sesi ini |
| AUTH-02c | P3 | ⛔ Blocked | Toggle mata: elemen `input[type=password]` terlihat, ikon mata muncul di screenshot, tapi label a11y & toggle behavior tidak diinspeksi eksplisit |
| AUTH-02d | P3 | ⛔ Blocked | Tombol "Hubungi Admin" tampak; efek klik tidak diverifikasi |
| AUTH-09 | P3 | ⛔ Blocked | Butuh instrumen a11y tree / accessibilityState `busy` — tidak dicek di sesi ini |

### 2.2 Navigasi Global (NAV)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| NAV-01 | P1 | ✅ Pass | Tepat 5 tab: **Home, Notif, Workspace, Inbox, Menu**. Tidak ada "People". Sesuai PRD §44.2. |
| NAV-02 | P1 | ✅ Pass | Berpindah ke Workspace, Menu, Notif, Inbox tanpa crash |
| NAV-03 | P2 | ✅ Pass | Header "Rencanaapp" konsisten dengan subtitle kontekstual ("Pusat Kendali Hari Ini", "Peta eksekusi perusahaan", "Notifikasi resmi dan respons", "Khusus chat Initiative", "Profil, People, dan admin") |
| NAV-04 | P2 | ⚠️ Partial | Deep navigation ke Performance pane berhasil dengan tombol back di header; kasus back panjang (mis. Home → Detail Action Plan) tidak diuji karena tidak ada AP aktif untuk akun CEO |
| NAV-05 | P3 | ✅ Pass | Tidak terlihat item Feed / Company News / Announcement / Routine / Watcher / Area Goal pada Menu, Home, Workspace |

### 2.3 Home (HOME)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| HOME-01 | P1 | ✅ Pass | Greeting, "Selamat datang di RencanApp" (onboarding hint), section **Prioritas** (Terlewat / Butuh Review / Gap KPI Area — 3 chip berdampingan tanpa horizontal scroll), **Snapshot Tim** ("Perlu dipantau — 4 KPI perlu progres"), lalu daftar tugas (Perlu dikerjakan / Repeat hari ini / Butuh review Anda / Terlewat / Deadline mendekat / Revisi diperlukan) |
| HOME-02 | P1 | ✅ Pass | Row Snapshot Tim (Akuisisi Customer Baru dll.) hanya 1 CTA (tap card → Detail). Tidak ada deretan Bukti/Chat/Detail sekaligus |
| HOME-03 | P1 | ✅ Pass | Row KPI Snapshot menampilkan "0%" progress + "kurang 120 customer" / "kurang 350.000 rupiah" / "kurang 8 percent" — sinyal gap **presisi** dari `target_numeric` + `unit`. Sesuai migration 0032 |
| HOME-04 | P2 | ⛔ Blocked | Tidak ada KPI kualitatif murni pada akun ini untuk memverifikasi fallback |
| HOME-05 | P2 | ✅ Pass (sebagian) | Section "Perlu dikerjakan" menampilkan empty state ramah: "Tidak ada tugas aktif. Action Plan yang Anda jadi PIC-nya akan muncul di sini." (dan pola serupa untuk Repeat, Butuh review, Terlewat, Deadline, Revisi) |
| HOME-06 | P3 | ✅ Pass | Tidak ada shortcut duplikat nav / feed sosial / announcement pada Home |
| HOME-07 | P3 | ⛔ Blocked | Umur akun tidak dapat dikontrol dalam sesi ini |

### 2.4 Notifications (NOTIF)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| NOTIF-01 | P1 | ✅ Pass | 8 tab terlihat urut: **Semua, Perlu Tindakan, Review, Deadline, Komentar, Terlewat, Repeat, Governance** |
| NOTIF-06 | P3 | ✅ Pass | Empty state ramah: emoji 🔔 + "Belum ada notifikasi" + deskripsi jenis notifikasi |
| NOTIF-01b, 02, 02b, 03, 04, 05 | P1–P2 | ⛔ Blocked | Akun tidak memiliki notifikasi tersegmentasi; butuh trigger event (submit bukti, DCR, mention, dsb.) dari akun lain |

### 2.5 Workspace (WS)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| WS-01 | P1 | ✅ Pass | Hub menampilkan 2 pane besar: **PERFORMANCE — Target Kinerja** (Goal 3 / KPI Area 4 / Notif 2, orb 67 amber) & **DEVELOPMENT — Pembangunan Sistem** (Area 2 / Problem 2 / Notif 2, orb 100 hijau). Pola UI seragam. |
| WS-02 | P1 | ✅ Pass | Panel "PERIODE AKTIF | **Juli 2026** | Goal 2026 · Q3 · Juli | tombol **Ubah**" tampil di atas Hierarki Strategis |
| WS-03 | P1 | ✅ Pass | Ubah → modal **Pilih Periode** dengan segmented **Bulan / Quarter**; list bulan berlabel **Arsip** (Jan–Juni 2026), **Aktif** (Juli 2026), **Akan datang** (Agustus 2026). Tombol Tutup di kanan atas |
| WS-04 | P1 | ✅ Pass (sebagian) | Badge "Arsip" tampil untuk periode lewat. Efek dim + tombol turunan nonaktif+popup **belum diverifikasi** karena tidak berpindah periode dalam sesi ini |
| WS-05 | P1 | ✅ Pass | Card Goal punya **tombol Detail** + **panah `›` terpisah** untuk expand; menu ⋯ ada di sebelahnya |
| WS-07 | P2 | ✅ Pass | Card kompak di viewport 390 & 375, tidak overflow; status berupa label teks ("Aktif · Target belum ada", "Belum ada KPI") |
| WS-09 | P2 | ✅ Pass | Orb hub: **67 amber/orange**, **100 hijau**, dan **"—" (null)** pada Development pane staff Fajar (Area 0). Row KPI 0% ditampilkan sebagai band merah pada Home. Semua ambang warna terlihat |
| WS-06, WS-08, WS-10..WS-13 | P1–P2 | ⛔ Blocked | Butuh CRUD + navigasi lebih dalam; sesi difokuskan ke smoke test |

### 2.6 Menu & Tema (MENU / THEME)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| MENU-01 | P1 | ✅ Pass | Menu berisi: kartu profil (CW · Citra Wibawa · CEO / Super Admin · Nyantuy Group), TAMPILAN (Sistem/Terang/Gelap), AKSES CEPAT (People, People Ranking, Activity Log, Arsip, Cari — 5 item), TEMPLATE (Goal Template Library, KPI Area Template — 2 item), PENGATURAN (9 item: Organisasi, User & Permission, Repeat Setting, Minimum Breakdown Rule, Card Completion Rule, Keterangan Card, Status & Prioritas, Notifications Rule, Score Formula), ADMIN LANJUTAN (Governance Violation, Confidential Access — 2 item), tombol **Keluar** |
| MENU-02 | P1 | ✅ Pass | **CEO**: semua item Pengaturan (9) + Admin Lanjutan (2) aktif. **Staff Fajar**: Activity Log (Akses Cepat) redup/disabled; di grup Pengaturan hanya **Repeat Setting** yang aktif — Organisasi, User & Permission, Minimum Breakdown Rule, Card Completion Rule, Keterangan Card, Status & Prioritas, Notifications Rule, Score Formula tampil redup/disabled; di Admin Lanjutan, Governance Violation & Confidential Access juga redup. Gating permission berjalan sesuai PRD |
| MENU-03 | P1 | ✅ Pass | Toggle Terang → seluruh Menu, Home, Workspace berubah rapi ke light. Sistem/Gelap juga tersedia |
| MENU-04 | P2 | ⚠️ Partial | Grup Template/Pengaturan/Admin Lanjutan menampilkan chevron ▾ (bisa collapse); interaksi collapse tidak eksplisit diuji |
| THEME-01 | P1 | ✅ Pass | Sapuan Home/Workspace/Menu/Notif/Inbox di **dark** & **light**: tidak ditemukan teks gelap di latar gelap atau blok putih menyilaukan yang tidak disengaja |
| THEME-02 | P1 | ✅ Pass | Surface Workspace hub (pane Performance/Development) menyesuaikan tema — light: kartu putih dengan aksen brand; dark: kartu gelap dengan aksen brand yang tetap kontras |
| THEME-03 | P1 | ✅ Pass (visual) | Tombol solid "Masuk", "+ Goal", "Ubah", "Detail" tampil biru brand dengan teks putih pada kedua mode. Nilai warna eksak tidak diambil via computed style — perlu `preview_inspect` khusus untuk verifikasi `#1564b3` |
| THEME-04 | P2 | ✅ Pass (login form) | Placeholder "Email perusahaan" & "Kata sandi" terbaca di dark mode; border input terlihat |
| THEME-05 | P2 | ⛔ Blocked | Butuh perubahan OS-level theme setting; sesi non-interaktif |
| THEME-06 | P2 | ✅ Pass (sebagian) | Badge status kartu Goal ("Aktif · Target belum ada", "Belum ada KPI", "0%") menggunakan warna + label teks; ScoreBadge People tidak diperiksa (⛔ blocked) |

### 2.7 Matriks Akses per Role (ROLE)

| ID | Prio | Hasil | Bukti |
|---|---|---|---|
| ROLE-01 (staff row) | P1 | ✅ Pass | Login `staff.sales@rencan.local`. **Buat Goal / KPI Area / Strategy / Initiative / AP**: tidak tersedia. Bukti: Performance pane staff tidak menampilkan tombol **+ Goal** di header "Hierarki Strategis"; card Goal "Naikkan Omset Q3 2026" hanya berisi tombol **Detail** + menu **⋯** — tidak ada pill **+ KPI Area** (bandingkan dengan CEO yang punya keduanya). Menu grup Pengaturan/Admin Lanjutan mayoritas redup untuk staff. **Submit bukti** & **Lihat People**: tersedia (belum diuji end-to-end tapi entry point ada) |
| ROLE-01 (ceo row) | P1 | ✅ Pass | CEO memiliki + Goal, + KPI Area, akses penuh Pengaturan & Admin Lanjutan (bypass total sesuai PRD) |
| ROLE-01 (management, c_level) | P1 | ⛔ Blocked | Belum login sebagai `mgr.sales@rencan.local` atau `cmo@rencan.local` — sisa matriks perlu satu pass lagi |
| ROLE-02 | P1 | ⛔ Blocked | Butuh alur User & Permission via UI Admin (grant permission ke staff → verifikasi UI berubah) |
| ROLE-03 | P2 | ⛔ Blocked | Butuh revoke permission default management |

### 2.8 Home (HOME) — dengan data (staff Fajar)

| ID | Prio | Hasil | Bukti tambahan |
|---|---|---|---|
| HOME-01 | P1 | ✅ Pass (kaya data) | Login staff → greeting "Selamat pagi, Fajar. Ada 1 prioritas utama hari ini." **Terlewat: 1 item lewat deadline**, **Butuh Review: 0**, **Gap KPI Area: 2 KPI**. Section "Perlu dikerjakan" menampilkan 2 card AP ("Desain Landing Page Referral" 50% Deadline 2026-07-15, "Checkout Harian (Repeat)" 0% Deadline 2026-09-30). Section "Terlewat" menampilkan "Checkout Harian (Repeat) — Terlewat 2026-07-03 🔁 Repeat". |
| HOME-02 | P1 | ✅ Pass | Tiap card AP di Home hanya membuka detail (1 CTA), bukan deretan tombol |
| HOME-05 | P2 | ✅ Pass | Empty state Repeat/Review/Deadline/Revisi tetap ramah, meskipun ada tugas aktif |

### 2.9 Inbox / Chat (INBOX / CHAT)

| ID | Prio | Hasil | Catatan |
|---|---|---|---|
| INBOX-01 | P1 | ✅ Pass (sebagian) | Header "Inbox — Khusus chat Initiative", segmented **Semua / Belum dibaca**, list 2 room ("SOP Shift Pagi — Citra Wibawa: hai", "Skrip Reminder WA H+5 — Belum ada pesan"). **Gap [?]**: filter tambahan yang disebut PRD §29 (Saya PIC, Review, Deadline) **tidak ada** — sesuai catatan gap di panduan uji |
| CHAT-*, INBOX-02..03 | P1–P2 | ⛔ Blocked | Butuh dua akun aktif untuk verifikasi kirim-terima; reply-context AP butuh AP + room aktual |

---

## 3. Smoke Test §24 — Ringkasan

| # | Checkpoint | Hasil |
|---|---|---|
| 1 | AUTH-01, AUTH-07 — login & logout | ✅ Pass |
| 2 | NAV-01 — bottom nav 5 tab | ✅ Pass |
| 3 | HOME-01, HOME-03 — Home + % gap KPI | ✅ Pass (gap presisi terlihat: "kurang 120 customer" dst.) |
| 4 | WS-02, WS-04, WS-05 — periode aktif, archive dim, card tree | ✅ Pass (WS-04 sebagian: badge Arsip terlihat; dim + popup belum diuji lintas periode) |
| 5 | KPI-04, KPI-06 — validasi breakdown 100% | ⛔ Blocked (butuh alur New KPI Area) |
| 6 | INIT-02 — kunci MBR | ⛔ Blocked (butuh Initiative + MBR belum terpenuhi) |
| 7 | AP-02 — repeat menghasilkan instance | ⛔ Blocked (butuh background job/RPC uji) |
| 8 | EVD-02, REV-01 — bukti versioning, approve → nilai masuk KPI | ⛔ Blocked (butuh dua aktor: PIC & Reviewer) |
| 9 | CHAT-01, CHAT-03 — chat dua arah + reply context AP | ⛔ Blocked (butuh dua akun paralel) |
| 10 | PPL-02, PPL-06 — People list + profil | ⛔ Blocked (belum dibuka; visibility bergantung D9 periode tertutup) |
| 11 | MENU-02 — gating permission menu | ✅ Pass (CEO + Staff dibandingkan; staff Fajar hanya bisa akses "Repeat Setting" di grup Pengaturan) |
| 12 | THEME-01 — sapuan dark mode singkat | ✅ Pass |

---

## 4. Modul yang Belum Diuji (Blocked) — dengan Alasan Konkret

| Modul | Alasan |
|---|---|
| GOAL-01..06 | Butuh alur multi-step membuat Goal & KPI Area — perlu waktu lanjutan atau eksekusi bertahap |
| KPI-01..10 | Sama; khususnya KPI-04..06b (validasi 100%) memerlukan pengisian breakdown quarter/bulan |
| STR / INIT / AP / EVD / REV | Sebagian besar rantai eksekusi butuh state data (Initiative aktif, PIC AP, Reviewer, bukti) yang belum disiapkan di seed default untuk akun uji |
| DCR-01..06 | Butuh AP terhambat + reviewer permission |
| EVAL-01..02 | Butuh data evaluasi periode |
| PPL-01..08 | Aturan D9: hanya tampil dari periode **tertutup**; sesi ini tidak melakukan penutupan periode |
| SCORE-01..05 | Butuh dua aktor (pengaju + penyetuju) berbeda; sesi hanya login sebagai CEO |
| ADM-01..15 | Butuh eksekusi CRUD tiap layar admin — di luar cakupan smoke test |
| SRCH-01..03 | Belum menjelajahi Search |
| ROLE-01 (management, c_level) | Sudah diverifikasi untuk **staff** dan **ceo**; belum login sebagai `mgr.sales@rencan.local` / `mgr.ops@rencan.local` / `cmo@rencan.local` |
| ROLE-02, ROLE-03 | Butuh grant/revoke permission via UI Admin (ADM-02) |
| A11Y-01, 04, 05 | Butuh pengukuran DOM presisi (touch target), instrumen screen reader, & perubahan Dynamic Type OS |
| STATE-01..06 | Butuh throttling koneksi, mematikan Supabase, file rusak, input ekstrem — di luar sesi ini |

---

## 5. Bugs / Observasi

Tidak ada bug baru yang teramati pada permukaan yang diuji.

**Observasi**:
1. **[Obs-1] INBOX-01 gap PRD §29** — filter tambahan "Saya PIC / Review / Deadline" tidak muncul. Sesuai catatan panduan uji sebagai *known gap*. Tidak berdampak fungsional bagi flow inti Inbox.
2. **[Obs-2] Bottom nav `Element.click()` via CDP** — beberapa tab (Notif/Inbox) tidak mau berpindah lewat `a.click()` biasa dari console; navigasi lewat `preview_click` selector atau `window.location.href='/…'` berjalan normal. Ini kemungkinan efek listener pointerdown Expo Router di web dan **bukan bug user-facing**. Hanya catatan bagi tooling QA otomatis.

---

## 6. Bukti Screenshot

Screenshot yang diambil (embedded di transcript sesi):

1. Home — dark mode (viewport 390) — Prioritas, Snapshot Tim, KPI gap presisi
2. Workspace hub — dark mode — 2 pane Performance/Development + orb
3. Login — dark mode — form email/password + Hubungi Admin
4. Menu — light mode — profil CEO, TAMPILAN toggle, Akses Cepat, Template, Pengaturan
5. Workspace hub — light mode — konsistensi tema
6. Performance pane — light mode — panel Periode Aktif + Hierarki Strategis
7. Modal **Pilih Periode** — segmented Bulan/Quarter, badge Arsip/Aktif/Akan datang
8. Menu — light mode — staff Fajar — Akses Cepat (Activity Log **redup**), Score badge 82.5 · Stabil
9. Menu — light mode — staff Fajar — grup Pengaturan (hanya **Repeat Setting** bold, sisanya redup) + Admin Lanjutan redup
10. Performance pane — light mode — staff Fajar — header "Hierarki Strategis" TANPA + Goal; card Goal TANPA pill + KPI Area (kontras dengan CEO)

---

## 7. Rekomendasi Lanjutan

1. **Sesi multi-akun**: jalankan pass berikutnya dengan 2 window/preview browser paralel (PIC ↔ Reviewer, Pengaju ↔ Penyetuju) untuk menutup EVD/REV/DCR/SCORE.
2. **Prep data**:
   - Tutup satu periode uji (mis. Juni 2026) sebelum PPL-07/07b/07c/07d.
   - Trigger RPC pembuatan Repeat instance sebelum AP-03/AP-03b (§1.3.3).
   - Siapkan 1 KPI kualitatif (tanpa `target_numeric`) untuk HOME-04.
3. **Uji role matrix**: buat rutinitas smoke test khusus login `staff.sales@rencan.local` → cek Menu (MENU-02) & aksi Buat Strategy/Initiative/AP (ROLE-01).
4. **A11Y presisi**: pakai `preview_inspect` untuk mengambil computed style `background-color` tombol solid — konfirmasi eksak `#1564b3` (brand-dark) (THEME-03/A11Y-03) dan mengukur bounding-box tombol utama (A11Y-01).
5. **Regresi otomatis**: pertimbangkan playwright script yang menjalankan skenario smoke test §24 tiap PR menuju `main` untuk mendeteksi regresi tema & nav lebih cepat.

---

*Laporan ini dihasilkan otomatis oleh Claude Code dalam sesi non-interaktif. Kasus yang bertanda ⛔ Blocked BUKAN gagal — belum dieksekusi, dengan alasan tertulis di kolom Catatan/§4.*
