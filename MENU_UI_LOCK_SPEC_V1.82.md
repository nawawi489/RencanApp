# MENU UI LOCK SPEC V1.82 - Rencanapp

Dokumen ini adalah lock spec khusus Menu agar implementasi Claude Code mengikuti prototype final Rencanapp secara visual, interaksi, fitur, dan psikologi penggunaan.

Source of truth visual:

1. Prototype final: `outputs/ems-mobile-ui/index.html`.
2. PRD utama: `outputs/PRD_EMS_V1.82_Rencanapp.md`.
3. Dokumen ini mengunci area Menu saja.

Tujuan dokumen:

1. Memastikan Menu tidak berubah menjadi halaman shortcut acak.
2. Memastikan People tetap tersedia di Menu.
3. Memastikan Workspace tidak masuk Menu karena sudah ada bottom nav.
4. Memastikan icon Menu selalu center di frame.
5. Memastikan heading kategori seragam.
6. Memastikan admin/settings tetap rapi, minimized, dan permission-based.

---

## 1. Prinsip Mutlak Menu

Menu adalah pusat akses sekunder.

Menu bukan Home.

Menu bukan Workspace.

Menu bukan Inbox.

Menu bukan daftar semua pekerjaan.

Menu harus membantu user menemukan:

1. Profil dirinya.
2. People.
3. Log Aktivitas.
4. Archive.
5. Template.
6. Bantuan.
7. Pengaturan.
8. Admin Lanjutan.
9. Logout.

Menu harus tetap terasa seperti mobile app modern ala Facebook Menu, tetapi tidak meniru social media secara mentah.

Secara psikologis, Menu harus memberi rasa:

1. Aman: user tahu ini tempat pengaturan dan akses sekunder.
2. Rapi: fitur dikelompokkan, bukan ditumpuk.
3. Tidak mengintimidasi: admin tools tidak langsung memenuhi layar.
4. Terarah: fitur penting ada, fitur yang tumpang tindih tidak muncul.

---

## 2. Navigation Lock

Bottom nav final:

1. Home.
2. Notif.
3. Workspace.
4. Inbox.
5. Menu.

Ketika user berada di screen berikut, nav `Menu` harus aktif:

1. Menu.
2. People.
3. People Profile.
4. People Ranking jika ada sebagai sub-view.
5. Score Formula Settings.
6. Permission Settings.
7. Goal Template Library.
8. KPI Area Template Library.
9. Repeat Rule Settings.
10. Organization Settings.
11. Minimum Breakdown Rule Settings.
12. Activity Log.
13. Governance Violation.
14. Archive.
15. Global Search.
16. Confidential Access.
17. Manual Score Override.

Jangan ubah bottom nav menjadi People.

People masuk lewat Menu.

Workspace tidak boleh masuk Menu karena sudah ada bottom nav Workspace.

---

## 3. Global Header Behavior

Menu termasuk main header screen.

Global topbar tetap tampil di Menu:

1. Logo Rencanapp kiri.
2. Search pill `Cari`.
3. Notification icon.
4. Avatar.

Local Menu header tetap ada di dalam content:

1. Title `Menu`.
2. Satu icon pengaturan di kanan.

Jangan tambahkan local search di Menu.

Menu tidak boleh memiliki dua search icon lokal.

Jika global header sudah punya search pill, local Menu cukup title dan settings icon.

---

## 4. Menu Screen Structure

Screen id target: `menu`.

Data title: `Menu`.

Data kicker: `Profil, People, dan tools admin`.

Urutan elemen wajib:

1. Local header row.
2. Profile card.
3. Category title `Akses Cepat`.
4. Akses Cepat grid.
5. Accordion `Template`.
6. Accordion `Bantuan`.
7. Accordion `Pengaturan`.
8. Accordion `Admin Lanjutan`.
9. Button `Keluar`.

Jangan ubah urutan ini.

Jangan tambahkan section baru di atas Akses Cepat.

Jangan tambahkan shortcut horizontal `Pintasan Anda`.

---

## 5. Local Header Menu

Local header memakai layout `.space-between`.

Style:

1. Margin bottom 12 px.
2. Kiri: headline `Menu`.
3. Headline font-size 28 px.
4. Headline weight mengikuti `.headline`, sekitar 850.
5. Kanan: satu icon button pengaturan.

Icon pengaturan:

1. Button class visual: `icon-button`.
2. Size 36 x 36 px.
3. Circle.
4. Background `#eef2f7`.
5. Icon gear SVG 19 x 19 px.
6. Klik masuk `organization-settings`.

Jangan tambahkan search icon lokal di header Menu.

Jangan tambahkan plus button di header Menu.

Jangan membuat headline terlalu besar dari 28 px.

---

## 6. Profile Card

Profile card wajib tampil langsung di bawah local header.

Purpose:

Memberi jalan cepat ke profil user sendiri tanpa menaruh `Profil Saya` sebagai card shortcut terpisah.

Anatomy:

1. Card class visual: `card menu-profile-card pressable`.
2. Klik card masuk `people-profile`.
3. Grid 3 kolom:
   - Avatar 54 px.
   - Text profile.
   - Pill score.
4. Padding 12 px.
5. Gap 11 px.
6. Align center.

Content:

1. Avatar: `RJ`.
2. Avatar size 54 x 54 px.
3. Avatar background gradient `#ffd6a5` ke `#ff8a5c`.
4. Title: `Rina Jaya`.
5. Subhead: `Staf Marketing · Lihat profil kamu`.
6. Pill kanan: `Score 86`.

Do not:

1. Jangan tambahkan card `Profil Saya` di Akses Cepat.
2. Jangan tampilkan KPI Area/PIC/Reviewer di profile card.
3. Jangan tampilkan terlalu banyak angka ranking di card ini.

---

## 7. Akses Cepat Section

Category title:

1. Kiri: `Akses Cepat`.
2. Kanan: `3 fitur`.
3. Min height 42 px.
4. Padding horizontal 2 px.
5. Font size kiri 14 px.
6. Font weight kiri 900.
7. Font size kanan 12 px.
8. Font weight kanan 850.
9. Warna kanan muted.

Akses Cepat grid:

1. Class visual: `menu-grid menu-main-grid`.
2. Dua kolom.
3. Gap 10 px.
4. Margin bottom 12 px.

Items wajib:

1. People.
2. Log Aktivitas.
3. Archive.

Tidak boleh ada:

1. Workspace.
2. Home.
3. Action Plan Hari Ini.
4. Kirim Bukti.
5. Input Hasil.
6. Inbox.
7. Cari Card.
8. Profil Saya.

Alasan:

Fitur-fitur tersebut sudah punya tempat di Home, Workspace, Inbox, atau global search. Menaruhnya lagi di Menu membuat user bingung dan terasa duplikatif.

---

## 8. Menu Card Component

Semua card fitur di Menu memakai `.menu-card`.

Base style:

1. Min height 112 px.
2. Display grid.
3. Align content space-between.
4. Text align left.
5. Padding 14 px.
6. Border radius 8 px.
7. Background white.
8. Border `1px solid rgba(221, 227, 235, .88)`.
9. Shadow `0 2px 8px rgba(17, 24, 39, .055)`.

Text:

1. `strong` title:
   - Display block.
   - Margin top 8 px.
   - Font size 16 px.
   - Line height 1.2.
2. `span` description:
   - Display block.
   - Margin top 3 px.
   - Color muted.
   - Font size 11 px.
   - Font weight 750.
   - Line height 1.3.

Jangan membuat card terlalu pendek sampai text terasa sesak.

Jangan membuat card tinggi seperti dashboard.

---

## 9. Menu Icon Lock

Masalah yang harus dihindari:

Icon lari dari tengah frame.

Icon harus selalu center.

Base `.menu-icon`:

1. Width 40 px.
2. Height 40 px.
3. Display inline-grid.
4. Place-items center.
5. Border radius 8 px.
6. Margin 0.
7. Padding 0.
8. Line-height 1.
9. Position relative.
10. Text align center.
11. Font size 15 px.
12. Font weight 900.

SVG icon:

1. Width 22 px.
2. Height 22 px.
3. Stroke width 2.15.
4. Display block.
5. Position absolute.
6. Left 50%.
7. Top 50%.
8. Transform translate(-50%, -50%).
9. Margin 0.
10. Overflow visible.

Text icon seperti `?`, `CS`, `R`:

1. Harus center menggunakan inline-grid.
2. Jangan memakai line-height default yang membuat icon terlihat naik/turun.

Color mapping:

1. Default blue:
   - Color `#1877f2`.
   - Background `#e8f2ff`.
2. Green:
   - Color `#14845c`.
   - Background `#e7f7ef`.
3. Violet:
   - Color `#6941c6`.
   - Background `#f1ebff`.
4. Amber:
   - Color `#b76b00`.
   - Background `#fff3d7`.
5. Red:
   - Color `#c93434`.
   - Background `#ffe8e8`.

Acceptance visual:

1. Icon People berada tepat di tengah kotak.
2. Icon Log Aktivitas berada tepat di tengah kotak.
3. Icon Archive berada tepat di tengah kotak.
4. Icon Pusat Bantuan `?` tidak naik/turun.
5. Icon Support `CS` tidak naik/turun.
6. Icon Repeat Setting `R` tidak naik/turun.

---

## 10. Akses Cepat Items

### 10.1 People

Target screen: `people`.

Content:

1. Icon: users SVG.
2. Icon color: default blue.
3. Title: `People`.
4. Description: `Ranking & profil`.

People wajib ada di Akses Cepat.

Jangan hilangkan People dari Menu.

### 10.2 Log Aktivitas

Target screen: `activity-log`.

Content:

1. Icon: clock SVG.
2. Icon color: green.
3. Title: `Log Aktivitas`.
4. Description: `Riwayat sistem`.

### 10.3 Archive

Target screen: `archive-view`.

Content:

1. Icon: archive/trash-like SVG sesuai prototype.
2. Icon color: red.
3. Title: `Archive`.
4. Description: `Card selesai`.

Archive ada di Akses Cepat karena user perlu akses cepat ke card selesai/arsip sesuai permission.

---

## 11. Accordion Section Lock

Accordion section memakai `.menu-section`.

Base:

1. Margin bottom 10 px.
2. Border radius 8 px.
3. Background transparent.

Summary:

1. Min height 42 px.
2. Display flex.
3. Align center.
4. Justify between.
5. Padding `0 2px`.
6. Font size 14 px.
7. Font weight 900.
8. Color `#26364f`.
9. Cursor pointer.

Heading accordion harus sama ukuran dengan `Akses Cepat`.

Artinya:

1. `Akses Cepat`.
2. `Template`.
3. `Bantuan`.
4. `Pengaturan`.
5. `Admin Lanjutan`.

Semua harus terlihat sebagai kategori yang sama levelnya.

Arrow:

1. CSS pseudo after.
2. Width 8 px.
3. Height 8 px.
4. Border right 2 px `#667085`.
5. Border bottom 2 px `#667085`.
6. Closed rotate 45 deg.
7. Open rotate 225 deg.
8. Margin right 4 px.

Default state:

1. Semua accordion closed by default.
2. User buka section jika perlu.

Rasional:

Admin/settings tidak boleh langsung memenuhi layar karena membuat user biasa merasa aplikasi berat dan terlalu teknis.

---

## 12. Template Section

Accordion title: `Template`.

Items:

1. Goal Template.
2. KPI Area Template.

Goal Template:

1. Target screen: `goal-template-library`.
2. Icon color: green.
3. Title: `Goal Template`.
4. Description: `Library Goal`.

KPI Area Template:

1. Target screen: `kpi-template-library`.
2. Icon color: amber.
3. Title: `KPI Area Template`.
4. Description: `Buat & edit`.

Do not:

1. Jangan masukkan Workspace template di sini.
2. Jangan masukkan Action Plan hari ini.
3. Jangan masukkan template sebagai shortcut terbuka di luar accordion.

---

## 13. Bantuan Section

Accordion title: `Bantuan`.

Items:

1. Pusat Bantuan.
2. Support.

Pusat Bantuan:

1. Icon text: `?`.
2. Icon default blue.
3. Title: `Pusat Bantuan`.
4. Description: `Panduan EMS`.

Support:

1. Icon text: `CS`.
2. Icon color: green.
3. Title: `Support`.
4. Description: `Hubungi admin`.

Icon `?` dan `CS` harus center.

Jangan ubah `Bantuan` menjadi `Help & Support` karena bahasa UI default Indonesia.

---

## 14. Pengaturan Section

Accordion title: `Pengaturan`.

Items:

1. Organisasi.
2. Repeat Setting.
3. Score Formula.
4. Permission Settings.
5. Minimum Breakdown Rule.

### 14.1 Organisasi

Target screen: `organization-settings`.

Content:

1. Icon color: amber.
2. Title: `Organisasi`.
3. Description: `Tim dan role`.

### 14.2 Repeat Setting

Target screen: `repeat-rule-settings`.

Content:

1. Icon text: `R`.
2. Icon color: green.
3. Title: `Repeat Setting`.
4. Description: `Jadwal Action Plan`.

Icon `R` harus center.

### 14.3 Score Formula

Target screen: `score-settings`.

Content:

1. Icon color: violet.
2. Title: `Score Formula`.
3. Description: `Rumus score`.

### 14.4 Permission Settings

Target screen: `permission-settings`.

Content:

1. Icon color: green.
2. Title: `Permission Settings`.
3. Description: `Role & akses`.

### 14.5 Minimum Breakdown Rule

Target screen: `rules-settings`.

Content:

1. Icon default blue.
2. Title: `Minimum Breakdown Rule`.
3. Description: `Aturan turunan`.

Do not:

1. Jangan ganti `Repeat Setting` menjadi `Routine`.
2. Jangan ganti `Permission Settings` menjadi bahasa lain jika PRD mempertahankan istilah ini.
3. Jangan tampilkan semua setting sebagai list besar tanpa accordion.

---

## 15. Admin Lanjutan Section

Accordion title: `Admin Lanjutan`.

Items:

1. Governance.
2. Confidential.
3. Override Score.

Admin Lanjutan permission:

1. Hanya tampil untuk role admin/super admin sesuai permission.
2. Jika user tidak punya akses, section bisa disembunyikan.
3. Jangan tampilkan fitur admin lanjutan untuk staff biasa.

Governance:

1. Target screen: `governance-violation`.
2. Icon color: red.
3. Title: `Governance`.
4. Description: `Guard violation`.

Confidential:

1. Target screen: `confidential-access`.
2. Icon color: amber.
3. Title: `Confidential`.
4. Description: `Akses khusus`.

Override Score:

1. Target screen: `manual-score-override`.
2. Icon color: violet.
3. Title: `Override Score`.
4. Description: `Akses berwenang`.

Do not:

1. Jangan taruh Admin Lanjutan di bottom nav.
2. Jangan tampilkan sebagai dashboard besar.
3. Jangan tampilkan admin tools di Akses Cepat.

---

## 16. Logout

Button logout wajib berada di bagian bawah Menu.

Text: `Keluar`.

Style:

1. Full width.
2. Min height 48 px.
3. Radius 8 px.
4. Background `#dfe5eb`.
5. Text `#172033`.
6. Font size 15 px.
7. Font weight 900.
8. Margin `4px 0 12px`.

Jangan gunakan text `Logout` karena UI default Indonesia.

Jangan buat tombol logout merah besar karena secara psikologis terlalu mengancam untuk menu biasa.

---

## 17. What Not To Build

Claude tidak boleh menambahkan ke Menu:

1. Workspace.
2. Home.
3. Inbox.
4. Notifications.
5. Action Plan Hari Ini.
6. Kirim Bukti.
7. Input Hasil.
8. Cari Card.
9. Profil Saya sebagai shortcut.
10. Feed.
11. Company News.
12. Announcement.
13. Shortcut horizontal `Pintasan Anda`.
14. Card rekomendasi.
15. Widget ranking besar.
16. Grafik score besar.
17. Task list.
18. KPI Area detail.
19. PIC/Reviewer list.
20. Tombol `+ Workspace`.

Menu harus tetap menjadi pusat akses sekunder, bukan halaman kerja harian.

---

## 18. Permission Visibility

Semua item Menu mengikuti permission.

Visible untuk semua user:

1. Profile card.
2. People jika user boleh melihat ranking/profile.
3. Log Aktivitas sesuai scope sendiri/tim.
4. Archive sesuai scope.
5. Bantuan.
6. Keluar.

Visible untuk admin/authorized:

1. Template.
2. Pengaturan.
3. Admin Lanjutan.
4. Score Formula.
5. Permission Settings.
6. Minimum Breakdown Rule.
7. Confidential.
8. Override Score.

Jika item tidak boleh diakses:

1. Bisa disembunyikan.
2. Atau disabled dengan toast singkat.

Jangan tampilkan screen kosong setelah user klik fitur tanpa izin.

---

## 19. Subpage Back Behavior

Semua subpage dari Menu wajib punya tombol `Kembali`.

Back button memakai komponen `.workspace-back` yang sama dengan screen lain:

1. Pill.
2. Icon panah kiri 18 px.
3. Text `Kembali`.
4. Min width 92 px.
5. Height 38 px.

Subpage yang kembali ke Menu:

1. People.
2. People Profile jika dibuka dari Menu/People.
3. Goal Template Library.
4. KPI Area Template Library.
5. Repeat Rule Settings.
6. Organization Settings.
7. Rules Settings.
8. Activity Log.
9. Governance Violation.
10. Archive.
11. Confidential.
12. Manual Score Override.

Jika user masuk People dari Menu, bottom nav tetap `Menu` aktif.

---

## 20. State

### 20.1 Empty State

Jika Akses Cepat tidak ada permission:

1. Tetap tampil profile card.
2. Tampilkan card kecil:
   `Belum ada akses cepat untuk akun ini.`
3. Jangan kosongkan seluruh Menu.

Jika Template tidak ada akses:

1. Sembunyikan accordion Template.

Jika Admin Lanjutan tidak ada akses:

1. Sembunyikan accordion Admin Lanjutan.

### 20.2 Loading State

Gunakan skeleton:

1. Profile card skeleton.
2. 3 menu-card skeleton.
3. 2 accordion row skeleton.

Jangan gunakan spinner besar.

### 20.3 Error State

Jika Menu gagal load:

1. Tampilkan card kecil.
2. Copy: `Menu belum bisa dimuat. Coba lagi.`
3. Tombol: `Coba lagi`.
4. Jangan tampil error teknis backend mentah.

---

## 21. Acceptance Criteria Menu

Menu dianggap sesuai prototype jika semua checklist ini terpenuhi:

1. Bottom nav tetap `Home`, `Notif`, `Workspace`, `Inbox`, `Menu`.
2. Menu nav aktif saat screen Menu dan semua subpage Menu.
3. Global header tetap tampil di Menu.
4. Local Menu header hanya punya title `Menu` dan satu icon pengaturan.
5. Tidak ada search icon lokal tambahan di Menu.
6. Profile card tampil langsung di bawah header.
7. Profile card klik masuk `people-profile`.
8. Profile card menampilkan `Rina Jaya`, `Staf Marketing · Lihat profil kamu`, `Score 86`.
9. `Akses Cepat` menampilkan `3 fitur`.
10. Akses Cepat hanya berisi People, Log Aktivitas, Archive.
11. People tidak hilang dari Menu.
12. Workspace tidak muncul di Menu.
13. Home tidak muncul di Menu.
14. Inbox tidak muncul di Menu.
15. Action Plan Hari Ini tidak muncul di Menu.
16. `Profil Saya` tidak muncul sebagai shortcut karena profile card sudah ada.
17. Semua menu-card memakai grid 2 kolom.
18. Semua menu-card min height sekitar 112 px.
19. Semua icon berada center di frame 40 x 40 px.
20. Icon Pusat Bantuan `?` center.
21. Icon Support `CS` center.
22. Icon Repeat Setting `R` center.
23. Heading kategori `Akses Cepat`, `Template`, `Bantuan`, `Pengaturan`, `Admin Lanjutan` seragam ukuran dan weight.
24. Accordion closed by default.
25. Template section hanya berisi Goal Template dan KPI Area Template.
26. Bantuan section hanya berisi Pusat Bantuan dan Support.
27. Pengaturan section berisi Organisasi, Repeat Setting, Score Formula, Permission Settings, Minimum Breakdown Rule.
28. Admin Lanjutan berisi Governance, Confidential, Override Score.
29. Admin Lanjutan bisa disembunyikan jika user bukan admin.
30. Tombol `Keluar` ada di bawah dengan style abu, bukan merah besar.
31. Tidak ada horizontal overflow di viewport 390 px.
32. Text card tidak kepotong.
33. Icon SVG tidak lari dari frame.
34. Tidak ada duplicate search icon di Menu.
35. Tidak ada fitur di luar PRD/prototype yang masuk Menu.

---

## 22. Claude Code Implementation Instruction

Jika dokumen ini diberikan ke Claude Code, gunakan instruksi berikut:

1. Revisi hanya area Menu dan subpage routing yang membuat nav Menu aktif.
2. Jangan ubah Home, Notif, Workspace, Inbox, People detail UI kecuali link dari Menu diperlukan.
3. Jangan ubah bottom nav.
4. Jangan tambahkan fitur baru di Menu.
5. Ikuti struktur, copy, spacing, icon, dan accordion dari dokumen ini.
6. Jika ada konflik antara PRD umum dan dokumen ini, untuk area Menu ikuti dokumen ini.
7. Setelah implementasi, cek viewport 390 px dan acceptance criteria.

---

## 23. Final Menu Statement

Menu Rencanapp V1.82 adalah pusat akses sekunder yang rapi.

Menu harus membuat user merasa aplikasi mudah dikendalikan.

People wajib mudah ditemukan.

Workspace tidak boleh muncul di Menu karena sudah menjadi bottom nav utama.

Admin tools harus ada untuk user berwenang, tetapi tidak boleh memenuhi layar user biasa.

Icon harus presisi di tengah frame agar UI terasa matang dan tidak berantakan.
