# WORKSPACE UI LOCK SPEC V1.82 - Rencanaapp

Dokumen ini adalah lock spec khusus Workspace agar implementasi Claude Code mengikuti prototype final Rencanaapp secara visual, interaksi, struktur, dan psikologi penggunaan.

Source of truth visual:

1. Prototype final: `outputs/ems-mobile-ui/index.html`.
2. PRD utama: `PRD.md` (V1.82 — di root repo).
3. Dokumen ini mengunci area Workspace saja.

Tujuan dokumen:

1. Menghapus ruang improvisasi Claude pada Workspace.
2. Memastikan Workspace tidak berubah menjadi dashboard desktop.
3. Memastikan card tree tetap mobile-first, rapih, mudah dipahami, dan tidak bikin user pusing.
4. Memastikan interaksi `Detail`, panah turunan, `...`, dan tombol tambah turunan tidak tertukar.

---

## 1. Prinsip Mutlak Workspace

Workspace adalah peta struktur eksekusi, bukan dashboard analitik.

Workspace harus terasa seperti mobile app:

1. Card-based.
2. Bottom navigation tetap terlihat.
3. Tidak ada table besar.
4. Tidak ada feed.
5. Tidak ada filter kategori panjang.
6. Tidak ada panel kelengkapan perencanaan yang selalu tampil.
7. Semua tree default minimize.
8. Detail card hanya dibuka lewat tombol `Detail`.
9. Panah card hanya untuk melihat atau menyembunyikan turunan card.
10. Card periode lewat boleh dibuka detailnya, tetapi tombol tambah turunan harus nonaktif.

Secara psikologis, Workspace harus membantu user menjawab:

1. "Saya sedang berada di ruang apa?"
2. "Periode aktif apa yang sedang saya lihat?"
3. "Card utama apa yang perlu saya perhatikan?"
4. "Kalau mau lihat isi card, tombol mana?"
5. "Kalau mau lihat turunannya, tombol mana?"

Jangan membuat user harus membaca banyak penjelasan panjang untuk paham.

---

## 2. Navigation Lock

Bottom nav final:

1. Home.
2. Notif.
3. Workspace.
4. Inbox.
5. Menu.

Ketika user berada di screen berikut, nav `Workspace` harus aktif:

1. Workspace overview.
2. Performance Workspace.
3. Development Workspace.
4. Development Area Detail.
5. Goal Detail.
6. KPI Area Detail.
7. Strategy Detail.
8. Initiative Detail.
9. Action Plan Detail.
10. Semua form buat card di Workspace.
11. Repeat Setting.
12. Action Plan Instance.
13. Bukti submission.
14. Nilai Hasil input.
15. Review screen.
16. Deadline Change Request.

People tidak boleh kembali masuk bottom nav. People tetap di Menu.

---

## 3. Global Layout Workspace

Viewport target:

1. Mobile-first 390 px sampai 430 px.
2. Lebar shell maksimal 430 px.
3. Background app `#f3f5f8`.
4. Card radius 8 px.
5. Section padding horizontal 14 px.
6. Bottom nav fixed.

Token visual wajib:

1. `--bg`: `#f3f5f8`.
2. `--surface`: `#ffffff`.
3. `--surface-soft`: `#f8fafc`.
4. `--text`: `#172033`.
5. `--muted`: `#667085`.
6. `--line`: `#dde3eb`.
7. `--blue`: `#1877f2`. **Amandemen a11y (DESIGN §4 mengikat):** `#1877f2` hanya untuk **aksen non-teks** (border kiri kategori, progress line, tint). Untuk **fill solid + teks putih** pakai `brand-dark #1564b3` (5.99:1); `#1877f2` gagal AA (3.6:1). Lihat §11 + §21.
8. `--blue-soft`: `#e8f2ff`.
9. `--green`: `#14845c`.
10. `--green-soft`: `#e7f7ef`.
11. `--amber`: `#b76b00`.
12. `--amber-soft`: `#fff3d7`.
13. `--red`: `#c93434`.
14. `--red-soft`: `#ffe8e8`.
15. `--violet`: `#6941c6`.
16. `--violet-soft`: `#f1ebff`.

Card base:

1. Background putih.
2. Border `1px solid rgba(221, 227, 235, .86)`.
3. Border radius 8 px.
4. Shadow halus `0 1px 2px rgba(17, 24, 39, .06)`.
5. Padding 14 px.
6. Margin bottom 12 px.

Typography:

1. Font utama Inter/system UI.
2. Headline card tree 19-21 px, weight 900-950.
3. Subhead 13-14 px, warna muted, line-height sekitar 1.4.
4. Pill label 10.5-11 px, weight 900.
5. Button 12-14 px, weight 800-900.

---

## 4. Workspace Overview Screen

Screen id target: `workspace`.

Purpose:

Menjadi halaman pintu masuk ke dua ruang eksekusi:

1. Performance.
2. Development.

Screen ini bukan tempat menampilkan semua Goal/KPI/Action Plan. Jangan jadikan halaman ini tree panjang.

### 4.1 Struktur

Urutan elemen:

1. Search input.
2. Section title `Workspace` di kiri dan `2 ruang` di kanan.
3. Card Performance.
4. Card Development.

Search input:

1. Placeholder: `Cari Goal, KPI Area, Initiative, Action Plan`.
2. Search ada di atas card workspace.
3. Jangan jadikan search sebagai filter chip horizontal.

Section title:

1. Kiri: `Workspace`.
2. Kanan: `2 ruang`.
3. Margin atas 18 px, bawah 9 px.

### 4.2 Card Performance Overview

Card Performance harus persis pola ini:

1. Card class visual: `workspace-card performance-hub`.
2. Min height sekitar 172 px.
3. Border kiri 4 px warna blue `#1877f2`.
4. Background gradient putih ke `#f8fbff`.
5. Tombol bantuan `?` di kanan atas.
6. Bagian utama memakai dua kolom: konten kiri dan progress orb kanan.
7. Pill kategori: `Performance`.
8. Judul: `Target Kinerja`.
9. Meta line: `Goal → KPI Area → Strategy → Initiative → Action Plan`.
10. Meta line wajib text biasa, tidak bold.
11. Progress orb kanan: `72%`.
12. Progress line bawah: 72%.
13. Stat grid 3 kolom:
   - `Goal` / `1`.
   - `KPI Area` / `3`.
   - `Notif` / `4`.
14. Tombol masuk: `Masuk` plus icon panah kanan.

Jangan tulis ulang meta line menjadi deskripsi panjang seperti:

1. Target aktif.
2. Alert panjang.
3. Penjelasan struktur eksekusi.
4. Copy edukasi panjang.

Yang benar hanya:

`Goal → KPI Area → Strategy → Initiative → Action Plan`

### 4.3 Card Development Overview

Card Development harus persis pola ini:

1. Card class visual: `workspace-card development-hub`.
2. Min height sekitar 172 px.
3. Border kiri 4 px warna teal `#0f766e`.
4. Background gradient putih ke `#f7fffd`.
5. Tombol bantuan `?` di kanan atas.
6. Pill kategori: `Development`.
7. Judul: `Pembangunan Sistem`.
8. Meta line: `Development Area → Problem Statement → Initiative → Action Plan`.
9. Meta line text biasa, tidak bold.
10. Progress orb kanan: `58%`.
11. Progress line bawah: 58%.
12. Stat grid 3 kolom:
   - `Area` / `3`.
   - `Problem Statement` / `9`.
   - `Aktif` / `6`.
13. Tombol masuk: `Masuk` plus icon panah kanan.

Label `Perbaikan Sistem` jangan digunakan. Gunakan `Pembangunan Sistem` karena terasa lebih cocok untuk company-building, bukan sekadar memperbaiki bug.

### 4.4 Interaksi Workspace Overview

Card overview boleh terasa pressable, tetapi user harus melihat tombol `Masuk`.

Behavior:

1. Klik tombol `Masuk` Performance -> masuk `performance-workspace`.
2. Klik tombol `Masuk` Development -> masuk `development-workspace`.
3. Klik `?` -> buka modal bantuan, jangan masuk halaman.
4. Klik area card boleh masuk ruang terkait kalau implementasi membutuhkan, tetapi tombol `Masuk` wajib tetap ada sebagai affordance.

Psikologi:

1. User non-teknis butuh affordance jelas bahwa card bisa dibuka.
2. Tombol `Masuk` mengurangi kebingungan tanpa membuat card ramai.

---

## 5. Workspace Help Modal

Setiap card overview Performance dan Development wajib punya icon `?` minimalis di kanan atas.

Ukuran:

1. Width 26 px.
2. Height 26 px.
3. Border radius circle.
4. Background `rgba(238, 246, 255, .94)`.
5. Border `#cce2ff`.
6. Font 13 px, weight 900.

Content Performance:

1. Kind: `Performance`.
2. Title: `Apa itu Performance Workspace?`
3. Question: `Ruang mana yang dipakai untuk mengejar target kinerja?`
4. Description: `Performance Workspace berisi struktur eksekusi target perusahaan dari Goal sampai Action Plan.`
5. Checks:
   - `Dipakai untuk target tahunan dan pecahan bulan/quarter.`
   - `Fokus pada hasil terukur seperti omset, profit, customer, dan output.`
   - `Masuk ke ruang ini untuk melihat turunan Goal dan pekerjaan aktif.`

Content Development:

1. Kind: `Development`.
2. Title: `Apa itu Development Workspace?`
3. Question: `Ruang mana yang dipakai untuk memperbaiki sistem kerja?`
4. Description: `Development Workspace berisi area perbaikan perusahaan, Problem Statement, Initiative, dan Action Plan.`
5. Checks:
   - `Dipakai untuk membangun sistem, SOP, alur kerja, dan governance.`
   - `Fokus pada masalah yang perlu dibereskan agar eksekusi lebih rapi.`
   - `Masuk ke ruang ini untuk melihat perbaikan yang sedang berjalan.`

---

## 6. Performance Workspace Screen

Screen id target: `performance-workspace`.

Purpose:

Menampilkan struktur eksekusi target performance pada periode aktif.

Hierarchy:

`Goal → KPI Area → Strategy → Initiative → Action Plan`

### 6.1 Header Button Row

Urutan tombol:

1. `Kembali`.
2. `+ Goal`.
3. `Edit`.

Button row berada paling atas konten screen.

Back button:

1. Bentuk pill.
2. Height 44 px (amandemen touch target §4 rule 1; sebelumnya 38). Surface theme-aware (§21).
3. Min width 92 px.
4. Icon panah kiri 18 px.
5. Text `Kembali`.
6. Background putih.
7. Border line.
8. Font 13 px, weight 900.

`+ Goal`:

1. Primary button, fill `brand-dark #1564b3` (bukan `#1877f2` — amandemen a11y AA, §21).
2. Height 44 px (amandemen touch target §4 rule 1; sebelumnya 42).
3. Radius 12 px (token `rounded-xl`; sebelumnya 8).
4. Text `+ Goal` putih.

`Edit`:

1. Secondary button, surface theme-aware (light: putih; dark: netral-900 — §21).
2. Height 44 px (amandemen; sebelumnya 42).
3. Radius 12 px (amandemen; sebelumnya 8).

Spacing:

1. Setelah button row, beri ruang visual sebelum periode aktif.
2. Jangan membuat periode aktif terlalu menempel ke `+ Goal`.

### 6.2 Period Switcher Performance

Periode aktif tidak boleh terlihat seperti card besar.

Gunakan style collapsed pill/panel ringan:

1. Elemen `details`.
2. Default: tertutup.
3. Margin `8px 2px 12px`.
4. Border radius 999 px saat tertutup.
5. Background transparent luar.
6. Summary min height 48 px.
7. Summary background `#eef4fb`.
8. Border `#d9e3ef`.
9. Kiri: label dan periode.
10. Kanan: pill `Ubah`.

Copy summary:

1. Label kecil uppercase: `Periode aktif`.
2. Strong: `Juni 2026`.
3. Small: `Goal 2026 · Q2 · Bulan berjalan`.
4. Pill kanan: `Ubah`.

Saat dibuka:

1. Border radius 14 px.
2. Background putih.
3. Shadow halus.
4. Tampilkan mode toggle dan list periode.

Mode toggle:

1. Dua tombol: `Bulan` dan `Quarter`.
2. Default aktif: `Bulan`.
3. Active button putih, text blue.
4. Inactive button text muted.

List periode:

1. `Mei 2026` - `Selesai · capaian bulan 82%` - pill `Archive`.
2. `Juni 2026` - `Bulan berjalan · tree aktif` - pill `Aktif`.
3. `Q2 2026` - `April - Juni · tampilan quarter` - pill `Quarter`.

Jangan tampilkan:

1. Card periode aktif besar.
2. Panel `Pilih periode lain` terpisah.
3. Penjelasan panjang di bawah selector.
4. Scope chips besar seperti `2026`, `Q2`, `Juni` jika membuat area sempit.

### 6.3 Tree Default State

Default Performance:

1. Semua tree group collapsed.
2. Yang terlihat pertama hanya Goal utama.
3. Turunan KPI Area tidak tampil sampai user klik panah Goal.

Ini penting secara psikologis karena user tidak boleh langsung diserbu banyak card.

### 6.4 Goal Card

Goal card anatomy:

1. Card class visual: `tree-card goal-card`.
2. Grid 3 kolom:
   - Main content.
   - Progress orb 50 px.
   - Tree toggle 34 px.
3. Border kiri 5 px warna blue.
4. Pill: `Goal`.
5. Period badge: `2026`.
6. Title: `Omset 48 Miliar 2026`.
7. Subhead: `Juni aktif · Target bulan 4M · Aktual 3.1M · Risiko sedang`.
8. Actions:
   - `Detail`.
   - `...`.
   - `+ KPI Area`.
9. Progress orb:
   - Value `68%`.
   - Label bawah `Capaian`.
10. Toggle panah kanan di paling kanan.

Important:

1. `Detail` membuka `goal-detail`.
2. Panah membuka/menutup KPI Area.
3. Klik badan card tidak membuka detail. Jika diklik, tampil toast:
   `Untuk membuka isi Card, gunakan tombol Detail di dalam Card.`

### 6.5 KPI Area Card

KPI Area anatomy:

1. Card class visual: `tree-card kpi-card`.
2. Border kiri 5 px warna amber.
3. Tree level 1 margin kiri 12 px.
4. Pill: `KPI Area`.
5. Period badge: `Juni 2026`.
6. Title: `Menambah Jumlah Customer`.
7. Subhead: `Aktual 620 / Target bulan 1.200 · Gap 580 · Butuh 1 Strategy`.
8. Actions:
   - `Detail`.
   - `...`.
   - `+ Strategy`.
9. Progress orb:
   - Value `65%`.
   - Label `Capaian`.
10. Panah membuka/menutup Strategy.

KPI Area lain di seed:

1. `Meningkatkan Basket Size`.
   - Subhead: `Aktual 72.000 / Target 95.000 · Gap 23.000 · Risiko tinggi`.
   - Progress `48%`.
2. `Meningkatkan Output Produk`.
   - Subhead: `Aktual 9.240 / Target 12.000 · Gap 2.760 · On track`.
   - Progress `77%`.

### 6.6 Strategy Card

Strategy anatomy:

1. Card class visual: `tree-card strategy-card`.
2. Border kiri 5 px warna violet.
3. Tree level 2 margin kiri 16 px.
4. Pill: `Strategy`.
5. Period badge bisa `Q2 2026` jika strategy berbasis quarter.
6. Title contoh: `Akuisisi Customer via Meta Ads`.
7. Subhead: `Kontribusi 42% · Risiko: respon WA lambat · Butuh 1 Strategy`.
8. Actions:
   - `Detail`.
   - `...`.
   - `+ Initiative` atau guarded `+ Initiative`.
9. Progress orb:
   - Value `63%`.
   - Label `Progress`.
10. Panah membuka/menutup Initiative.

Guard behavior:

Jika KPI Area belum punya minimum Strategy, tombol `+ Initiative` tetap terlihat tetapi guarded.

Guard message:

`KPI Area ini baru punya 2 dari 3 Strategy. Tambahkan 1 Strategy lagi dulu, baru tombol + Initiative aktif.`

### 6.7 Initiative Card

Initiative anatomy:

1. Card class visual: `tree-card initiative-card`.
2. Border kiri 5 px warna green.
3. Tree level 3 margin kiri 20 px.
4. Pill: `Initiative`.
5. Period badge: `Juni 2026`.
6. Title contoh: `Campaign Paket Hemat Pizza`.
7. Subhead: `Target 120 lead · PIC Rina · Review bukti tertunda`.
8. Actions:
   - `Detail`.
   - `...`.
   - `+ Plan` atau guarded `+ Plan`.
9. Progress orb:
   - Value `55%`.
   - Label `Progress`.
10. Panah membuka/menutup Action Plan.

Guard behavior:

Jika Strategy belum punya minimum Initiative, tombol `+ Plan` tetap terlihat tetapi guarded.

Guard message:

`Strategy ini baru punya 2 dari 3 Initiative. Tambahkan 1 Initiative lagi dulu, baru tombol + Action Plan aktif.`

### 6.8 Action Plan Card

Action Plan anatomy:

1. Card class visual: `tree-card action-card`.
2. Grid hanya 2 kolom:
   - Main content.
   - Progress orb.
3. Tidak ada panah karena Action Plan adalah level terakhir.
4. Border kiri 5 px warna blue.
5. Pill: `Action Plan`.
6. Period badge optional:
   - `Hari ini`.
   - `Juni 2026`.
7. Title contoh: `Upload 5 konten angle hemat`.
8. Subhead: `Output: link folder + screenshot budget · Jatuh tempo hari ini 17.00`.
9. Actions:
   - `Detail`.
   - `...`.
10. Progress orb:
   - `50%`, `0%`, `90%`, dst.
   - Label `Progress`.

Action Plan tidak punya tombol `+`.

---

## 7. Development Workspace Screen

Screen id target: `development-workspace`.

Purpose:

Menampilkan struktur pembangunan sistem dan problem perusahaan pada periode aktif.

Hierarchy:

`Development Area → Problem Statement → Initiative → Action Plan`

Pola UI harus sama dengan Performance Workspace.

### 7.1 Header Button Row

Urutan tombol:

1. `Kembali`.
2. `+ Development Area`.
3. `Edit`.

Back button harus sama persis dengan Performance.

Jangan membuat icon panah Development lebih kecil atau berbeda.

### 7.2 Period Switcher Development

Sama dengan Performance, tetapi copy:

1. Label kecil: `Periode aktif`.
2. Strong: `Juni 2026`.
3. Small: `Development 2026 · Q2 · Bulan berjalan`.
4. Pill kanan: `Ubah`.

Saat dibuka, list:

1. `Mei 2026` - `2 perbaikan selesai · 1 dipantau` - pill `Archive`.
2. `Juni 2026` - `Bulan berjalan · tree aktif` - pill `Aktif`.
3. `Q2 2026` - `April - Juni · tampilan quarter` - pill `Quarter`.

Visual development:

1. Summary background `#eefaf8`.
2. Border `#cceee8`.

### 7.3 Development Area Card

Development Area anatomy:

1. Card class visual: `tree-card devarea-card`.
2. Border kiri 5 px warna teal `#0f766e`.
3. Pill: `Development Area`.
4. Period badge: `Juni 2026`.
5. Title: `Pembangunan Sistem`.
6. Subhead: `Target: sistem eksekusi rapi · Notif: follow up masih tercecer`.
7. Actions:
   - `Detail`.
   - `...`.
   - `+ Problem Statement`.
8. Progress orb: `58%`.
9. Panah membuka/menutup Problem Statement.

### 7.4 Problem Statement Card

Problem Statement anatomy:

1. Card class visual: `tree-card problem-card`.
2. Border kiri 5 px warna orange/red `#c2410c`.
3. Pill: `Problem Statement`.
4. Period badge: `Juni 2026`.
5. Title contoh: `Follow up masih tersebar di WhatsApp`.
6. Subhead: `Dampak: follow up hilang · Butuh 1 flow review resmi`.
7. Actions:
   - `Detail`.
   - `...`.
   - `+ Initiative`.
8. Progress orb: `44%`.
9. Panah membuka/menutup Initiative.

Problem Statement lain:

1. `SOP review belum dipaksa sistem`.
   - Subhead: `Info penting: reviewer bisa sama dengan PIC`.
   - Progress `31%`.
2. `Log Aktivitas belum jadi kebiasaan`.
   - Subhead: `Info penting: keputusan belum selalu tercatat`.
   - Progress `18%`.

### 7.5 Development Initiative dan Action Plan

Development Initiative memakai komponen yang sama seperti Performance Initiative.

Contoh:

1. `Bangun EMS V1`.
   - Subhead: `Target prototype siap review · PIC Product Ops · 58%`.
   - Progress `58%`.
2. `Pindahkan review dari WA ke EMS`.
   - Subhead: `Target review tercatat · PIC Arman · 25%`.
   - Progress `25%`.
3. `Kunci alur bukti`.
   - Subhead: `Target bukti tidak hilang · PIC QA · 10%`.
   - Progress `10%`.

Development Action Plan contoh:

1. `Finalisasi UI blueprint mobile`.
2. `Atur accordion Workspace`.
3. `Siapkan test case permission`.

Action Plan tetap level terakhir dan tidak punya panah.

---

## 8. Tree Layout Detail

Tree indentation:

1. Level root: margin kiri 0.
2. `tree-level-1`: margin kiri 12 px.
3. `tree-level-2`: margin kiri 16 px.
4. `tree-level-3`: margin kiri 20 px.
5. `tree-level-4`: margin kiri 24 px.
6. `tree-level-5`: margin kiri 28 px.

Connector line:

1. Setiap level turunan punya connector L-shape.
2. Position absolute.
3. Left `-10px`.
4. Top `-10px`.
5. Width 10 px.
6. Height 32 px.
7. Border-left 2 px `#cfd8e5`.
8. Border-bottom 2 px `#cfd8e5`.
9. Border bottom-left radius 8 px.

Tree spacing:

1. `.tree-group` margin bottom 10 px.
2. `.tree-children` margin top 10 px.
3. `#performance-workspace > .tree-group` margin top 12 px.
4. `#development-workspace > .tree-group` margin top 12 px.

Tree default:

1. `.tree-group.is-collapsed > .tree-children { display: none; }`.
2. Arrow icon rotates -90 deg when collapsed.
3. Saat expanded, arrow menghadap bawah.

---

## 9. Workspace Pill System

Pill `.workspace-kind` wajib konsisten.

Base:

1. Min height 26 px.
2. Inline-flex.
3. Align center.
4. Gap 6 px.
5. Border radius 999 px.
6. Padding `4px 9px 4px 5px`.
7. Font 11 px, weight 900.
8. Letter spacing 0.

Circle prefix:

1. Width 18 px.
2. Height 18 px.
3. Border radius 50%.
4. Text putih.
5. Font 10 px, weight 900.

Mapping:

1. Goal:
   - Text blue `#145ebc`.
   - Background `#e8f2ff`.
   - Border `#cce2ff`.
   - Circle text `G`.
   - Circle background `#1877f2`.
2. KPI Area:
   - Text amber `#b76b00`.
   - Background `#fff3d7`.
   - Border `#ffe1a1`.
   - Circle text `K`.
   - Circle background `#b76b00`.
3. Strategy:
   - Text violet `#6941c6`.
   - Background `#f1ebff`.
   - Border `#dfd1ff`.
   - Circle text `S`.
   - Circle background `#6941c6`.
4. Initiative:
   - Text green `#14845c`.
   - Background `#e7f7ef`.
   - Border `#c9ebda`.
   - Circle text `I`.
   - Circle background `#14845c`.
5. Action Plan:
   - Text blue `#145ebc`.
   - Background `#eef6ff`.
   - Border `#cce2ff`.
   - Circle text `AP`.
   - Circle background `#145ebc`.
   - Circle font 8 px.
6. Development Area:
   - Text teal `#0f766e`.
   - Background `#e6fffb`.
   - Border `#99f6e4`.
   - Circle text `D`.
   - Circle background `#0f766e`.
7. Problem Statement:
   - Text `#c2410c`.
   - Background `#fff7ed`.
   - Border `#fed7aa`.
   - Circle text `P`.
   - Circle background `#c2410c`.

Jangan ubah kategori menjadi icon lucide bebas. Prototype memakai letter badge agar kategori langsung terbaca.

---

## 10. Progress Orb Lock

Progress harus berbentuk lingkaran angka.

Base:

1. Width 50 px.
2. Height 50 px.
3. Border radius 50%.
4. Angka di tengah.
5. Background conic gradient.
6. Inner putih radial gradient.
7. Border `#d9e2ec`.
8. Font 12 px, weight 900.
9. Label di bawah orb memakai `data-label`.

Label:

1. Goal dan KPI Area: `Capaian`.
2. Strategy, Initiative, Action Plan: `Progress`.
3. Development Area dan Problem Statement boleh `Progress`.

Color:

1. Good green: `#14845c`.
2. Risk amber: `#b76b00`.
3. Bad red: `#c93434`.
4. Goal default blue.
5. KPI amber.
6. Strategy violet.
7. Initiative green.

Jangan pakai horizontal progress bar sebagai pengganti orb di card tree.

---

## 11. Action Buttons Lock

Dalam setiap card tree, action row wajib urutan:

1. `Detail`.
2. `...`.
3. `+ Turunan` jika card masih punya level berikutnya.

Action row class: `structure-actions`.

Button `Detail`:

1. Height 30 px (touch target dijamin `hitSlop` ≥44px, DESIGN §4).
2. Radius 999 px.
3. Background `brand-dark #1564b3` (amandemen a11y AA 5.99:1 — bukan `#1877f2` 3.6:1, §21).
4. Text putih.
5. Font 12 px, weight 900.

Button `...`:

1. Width 34 px.
2. Height 30 px.
3. Radius 999 px.
4. Background `#f8fafc` (light) / netral-900 dark — theme-aware (§21).
5. Border line (light `#e2e8f0` / dark netral-700).
6. Text hanya `⋯`.
7. Tidak boleh ada label `More`, `Lainnya`, atau icon lain yang membuat lebar berubah.

Button `+ Turunan`:

1. Height 30 px.
2. Radius 999 px.
3. Background blue-soft.
4. Border `#cce2ff`.
5. Text blue `#145ebc`.
6. Label sesuai konteks:
   - Goal: `+ KPI Area`.
   - KPI Area: `+ Strategy`.
   - Strategy: `+ Initiative`.
   - Initiative: `+ Plan`.
   - Development Area: `+ Problem Statement`.
   - Problem Statement: `+ Initiative`.
   - Action Plan: tidak ada tombol tambah.

Jangan menampilkan banyak CTA seperti `Bukti`, `Chat`, `Review` di card tree. Itu masuk detail page, Home, Notifications, atau Inbox.

---

## 12. Interaction Rules

### 12.1 Detail vs Panah

Ini aturan paling penting.

1. Tombol `Detail` membuka isi card.
2. Panah membuka atau menutup turunan card.
3. Klik badan card tidak boleh membuka detail.
4. Klik badan card boleh memunculkan toast edukasi:
   `Untuk membuka isi Card, gunakan tombol Detail di dalam Card.`

Rasional:

Jika klik card membuka detail dan panah juga ada, user bingung mana yang membuka isi dan mana yang membuka turunan. Pemisahan ini menjaga fokus mental user.

### 12.2 More Action

Tombol `...` membuka action sheet.

Action sheet berisi aksi sekunder:

1. Edit Card.
2. Archive.
3. Permission/history jika user punya akses.

Jangan taruh semua aksi sekunder langsung di card.

### 12.3 Guarded Button

Jika Minimum Breakdown Rule belum terpenuhi:

1. Tombol tambah turunan tetap terlihat.
2. Visual tombol redup.
3. Klik tombol tidak membuka form.
4. Muncul toast arahan.

Contoh toast:

1. KPI Area belum cukup Strategy:
   `KPI Area ini baru punya 2 dari 3 Strategy. Tambahkan 1 Strategy lagi dulu, baru tombol + Initiative aktif.`
2. Strategy belum cukup Initiative:
   `Strategy ini baru punya 2 dari 3 Initiative. Tambahkan 1 Initiative lagi dulu, baru tombol + Action Plan aktif.`

### 12.4 Archived Period

Jika periode sudah lewat:

1. Card tampil redup seperti lampu dimatikan.
2. Detail tetap bisa dibuka.
3. Tombol tambah turunan nonaktif/guarded.
4. Klik tambah turunan menampilkan toast:
   `Periode ini sudah menjadi Archive. Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.`

Archived visual:

1. Background gradient `#fafbfc` ke `#f3f5f8`.
2. Border kiri jadi `#98a2b3`.
3. Pill jadi abu.
4. Orb saturasi turun.
5. Tombol tambah turunan abu.

---

## 13. What Not To Build

Claude tidak boleh menambahkan atau mengubah Workspace menjadi:

1. Dashboard desktop.
2. Table.
3. Kanban.
4. Feed.
5. Timeline besar.
6. Filter chip `Semua / Strategic / Repeat / Draft / Butuh revisi`.
7. Panel kelengkapan perencanaan yang selalu tampil.
8. Widget analytics terlalu besar.
9. Banyak CTA dalam satu card.
10. Card auto-open detail saat diklik.
11. People di bottom nav.
12. Workspace di Menu.
13. `+ Workspace`.
14. Penjelasan panjang di overview card.
15. Keterangan target aktif/alert panjang di overview card.

---

## 14. Detail Page Relation

Ketika user klik `Detail` dari Workspace:

1. Masuk ke detail page card terkait.
2. Detail page harus fokus pada isi card tersebut.
3. Jangan tampilkan turunan card penuh di detail page.
4. Jangan tampilkan tombol tambah turunan besar di detail page.
5. Jangan tampilkan Kelengkapan Card besar secara default.
6. Activity Log boleh ada sebagai accordion/minimized, bukan panel besar.
7. Keterangan Card boleh lewat icon `?`, bukan card deskripsi besar yang memenuhi layar.

Detail page berbeda dari tree:

1. Tree = struktur dan hubungan.
2. Detail = isi card, target, PIC, reviewer, catatan, bukti, review, activity log.

---

## 15. Empty, Loading, Error State Workspace

Empty Workspace Overview:

1. Tetap tampil dua ruang Performance dan Development.
2. Jika belum ada data, stat menjadi 0.
3. Tombol `Masuk` tetap ada.
4. Jangan tampil blank screen.

Empty Performance Tree:

1. Tampilkan period switcher.
2. Tampilkan empty card dengan copy singkat:
   `Belum ada Goal aktif di periode ini.`
3. CTA sesuai permission: `+ Goal`.

Empty Development Tree:

1. Tampilkan period switcher.
2. Copy:
   `Belum ada Development Area aktif di periode ini.`
3. CTA sesuai permission: `+ Development Area`.

Loading:

1. Gunakan skeleton card, bukan spinner besar.
2. Skeleton mengikuti bentuk card tree.
3. Maksimal 3 skeleton agar layar tidak terasa penuh.

Error:

1. Card kecil dengan copy jelas.
2. CTA `Coba lagi`.
3. Jangan tampil error teknis backend mentah.

---

## 16. Permission Visibility

User tanpa permission create:

1. Tombol `+ Goal`, `+ KPI Area`, `+ Strategy`, `+ Initiative`, `+ Plan`, `+ Development Area`, `+ Problem Statement` disembunyikan atau disabled sesuai aturan produk.
2. Jika disabled, beri alasan via toast.

User bisa view:

1. Bisa buka `Detail` jika punya akses view.
2. Bisa expand/collapse tree jika punya akses melihat struktur.

Admin:

1. Bisa lihat `Edit`.
2. Bisa akses `...` untuk archive dan pengaturan permission.

Reviewer/PIC:

1. Aksi Bukti/Review tidak ditaruh di card tree.
2. Aksi tersebut ada di detail Action Plan, Notifications, atau Home.

---

## 17. Seed Data Wajib Untuk Parity Prototype

Gunakan data contoh ini agar tampilan awal mirip prototype.

Performance:

1. Goal: `Omset 48 Miliar 2026`, 68%, periode `2026`.
2. KPI Area:
   - `Menambah Jumlah Customer`, 65%, `Juni 2026`.
   - `Meningkatkan Basket Size`, 48%.
   - `Meningkatkan Output Produk`, 77%.
3. Strategy di bawah `Menambah Jumlah Customer`:
   - `Akuisisi Customer via Meta Ads`, 63%.
   - `Program First Order`, 42%.
   - `Referral & Database Customer`, 28%.
4. Initiative di bawah `Akuisisi Customer via Meta Ads`:
   - `Campaign Paket Hemat Pizza`, 55%.
   - `Retarget Pengunjung WA`, 35%.
   - `Alur Promo Outlet`, 20%.
5. Action Plan di bawah `Campaign Paket Hemat Pizza`:
   - `Upload 5 konten angle hemat`, 50%.
   - `Setup tracking WA leads per outlet`, 0%.
   - `Review budget iklan 24 jam`, 0%.

Development:

1. Development Area: `Pembangunan Sistem`, 58%.
2. Problem Statement:
   - `Follow up masih tersebar di WhatsApp`, 44%.
   - `SOP review belum dipaksa sistem`, 31%.
   - `Log Aktivitas belum jadi kebiasaan`, 18%.
3. Initiative:
   - `Bangun EMS V1`, 58%.
   - `Pindahkan review dari WA ke EMS`, 25%.
   - `Kunci alur bukti`, 10%.
4. Action Plan:
   - `Finalisasi UI blueprint mobile`, 90%.
   - `Atur accordion Workspace`, 50%.
   - `Siapkan test case permission`, 0%.

---

## 18. Acceptance Criteria Workspace

Workspace dianggap sesuai prototype jika semua checklist ini terpenuhi:

1. Bottom nav menunjukkan `Workspace` aktif di semua screen Workspace dan turunannya.
2. Workspace Overview hanya menampilkan dua card utama: Performance dan Development.
3. Card Performance punya `?`, `Performance`, `Target Kinerja`, flow text satu baris, orb 72%, stat 3 kolom, tombol `Masuk`.
4. Card Development punya `?`, `Development`, `Pembangunan Sistem`, flow text satu baris, orb 58%, stat 3 kolom, tombol `Masuk`.
5. Tidak ada `+ Workspace`.
6. Tidak ada People di bottom nav.
7. Tidak ada Workspace di Menu sebagai shortcut utama.
8. Performance screen punya tombol `Kembali`, `+ Goal`, `Edit`.
9. Development screen punya tombol `Kembali`, `+ Development Area`, `Edit`.
10. Tombol kembali Performance dan Development sama ukuran dan desainnya.
11. Periode aktif tampil sebagai collapsed pill/panel kecil, bukan card besar.
12. Period switcher default `Juni 2026`.
13. Default mode periode adalah `Bulan`.
14. Quarter hanya optional di dalam period switcher.
15. Semua tree default collapsed.
16. Goal terlihat pertama, KPI Area baru terlihat setelah panah Goal dibuka.
17. Klik tombol `Detail` membuka detail.
18. Klik panah membuka turunan.
19. Klik badan card tidak membuka detail.
20. Klik badan card menampilkan toast edukasi jika perlu.
21. Tombol `...` membuka action sheet.
22. Card tree memakai progress orb lingkaran, bukan progress bar horizontal.
23. Setiap kategori memakai warna dan letter badge yang konsisten.
24. Guarded button tetap terlihat tetapi tidak membuka form.
25. Guarded button menampilkan toast arahan.
26. Card periode lewat tampil redup.
27. Card periode lewat tetap bisa detail.
28. Card periode lewat tidak bisa dibuat turunan baru.
29. Detail page tidak menampilkan tree turunan penuh.
30. Kelengkapan Card dan Kelengkapan Perencanaan tidak tampil sebagai panel besar di Workspace.
31. UI tetap nyaman di viewport 390 px tanpa horizontal scroll.
32. Text card tidak saling tabrakan.
33. Tombol `+ Strategy`, `+ Initiative`, `+ Plan` tidak kepotong.
34. Tidak ada filter panjang `Semua / Strategic / Repeat / Draft / Butuh revisi` di Workspace.
35. Tidak ada keterangan panjang yang membuat card overview terlalu tinggi.

---

## 19. Claude Code Implementation Instruction

Jika dokumen ini diberikan ke Claude Code, gunakan instruksi berikut:

1. Revisi hanya area Workspace dan turunannya.
2. Jangan ubah Home, Notifications, Inbox, People, Login, atau Menu.
3. Jangan ubah bottom nav kecuali memastikan `Workspace` aktif sesuai rule.
4. Jadikan prototype final `outputs/ems-mobile-ui/index.html` sebagai visual reference.
5. Implementasi harus meniru struktur, spacing, warna, copy, dan behavior dokumen ini.
6. Jika ada konflik antara PRD umum dan dokumen ini, untuk area Workspace ikuti dokumen ini.
7. Setelah implementasi, lakukan screenshot mobile 390 px dan cek acceptance criteria.

---

## 20. Final Workspace Statement

Workspace Rencanaapp V1.82 adalah peta eksekusi mobile-first.

Workspace harus terasa tenang, bertingkat, dan jelas.

User tidak boleh bingung antara membuka isi card dan membuka turunan card.

User tidak boleh merasa diserbu terlalu banyak card saat pertama masuk.

Card tree harus membuat target tahunan, target bulan berjalan, Strategy, Initiative, dan Action Plan terasa bisa dieksekusi, bukan seperti dokumen organisasi yang berat.

---

## 21. Amandemen A11y & Dark Mode (owner 2026-07-03)

Konteks: §19.6 menyatakan lock menang atas **PRD umum** untuk area Workspace. Lock **tidak** menyatakan menang atas `DESIGN.md §4` (aksesibilitas **mengikat**). Audit light/dark menemukan lock mengunci nilai yang gagal WCAG AA. Keputusan owner: **Opsi A** — a11y mengikat menang, lock **diperbarui** agar konsisten (bukan dilanggar, bukan dikecualikan). Doktrin ini memperluas preseden `workspace-hub-card.tsx` ke **semua** kontrol Workspace terkunci.

**Aturan mengikat (menang atas nilai light-only di §3/§6/§9/§11):**

1. **Fill solid + teks putih → `brand-dark #1564b3`** (5.99:1), berlaku sama di light & dark. Terkena: `Detail` (§11), `+ Goal`/`+ Development Area` primary header (§6.1), `Ubah` period switcher Performance (§6.2). `#1877f2` (3.6:1) **hanya** boleh untuk aksen non-teks (border kiri kategori §8, progress line, tint). `Ubah` Development `#0f766e` (4.8:1) sudah lulus, dipertahankan.
2. **Surface & border netral terkunci = theme-aware.** Nilai terang terkunci (`#ffffff`, `#f8fafc`, `#eef4fb`, dst.) berlaku **hanya light mode**; di **dark mode** ikut gelap (`useThemePreference().effective` → netral-900 `#171717` / border netral-700 `#404040`). Terkena: `⋯`, `+ Turunan`, `Kembali`, `Edit`, panel periode collapsed. Cegah "light island" + jaga teks anak kontras AA.
3. **Tint kategori / aksen hue tetap** di kedua mode (letter-badge pill §9, kicker/border hub-card, `+ Turunan` blue-soft). Teks gelap di atas tint tetap terbaca — by design, bukan pelanggaran.
4. **Touch target header row = 44px, radius = 12px** (token `rounded-xl`). Sebelumnya 42/38px & radius 8 — gagal §4 rule 1 + §5.

Implementasi: [`workspace-screen.tsx`](mobile/src/screens/workspace-screen.tsx) (`CardActionRow`, `ActionPlanSubRow`, `PaneTopHeader`), [`period-switcher.tsx`](mobile/src/components/period-switcher.tsx), [`workspace-hub-card.tsx`](mobile/src/components/workspace-hub-card.tsx). Sinkron dgn `DESIGN.md §2` (Rekonsiliasi a11y Workspace).
