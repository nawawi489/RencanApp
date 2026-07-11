# PRD FINAL V1.82 - EMS: Rencanapp Execution Management System

## 1. Dokumen

Nama produk: Rencanapp.

Aturan penamaan: gunakan `Rencanapp` untuk semua penyebutan brand produk di UI, copy, dan dokumen spesifikasi. Gunakan `RencanApp` hanya untuk identifier teknis seperti nama repo, path, atau referensi tooling yang memang fixed.

Tagline: Rencanakan. Jalankan. Tuntaskan.

Versi PRD: V1.82.

Basis revisi:

1. PRD EMS V1.8.1.
2. API Contract EMS V1.8.1.
3. Prototype mobile UI terakhir di `outputs/ems-mobile-ui/index.html`.
4. Keputusan UX terbaru hasil review prototype.

Tujuan dokumen ini adalah menjadi source-of-truth untuk implementasi frontend agar Claude Code atau developer lain dapat membuat aplikasi yang sangat mirip dengan prototype saat ini dari sisi fitur, fungsi, UI, UX, dan psikologi penggunaan.

---

## 2. Product Overview

Rencanapp adalah Execution Management System untuk membantu perusahaan mengubah target besar menjadi eksekusi nyata yang bisa dipantau, direview, dibuktikan, dan dipertanggungjawabkan.

Rencanapp bukan task management biasa. Task di Rencanapp bukan checklist bebas — Task tunduk Reviewer, evidence, dan Score Formula. Level "Task" adalah unit eksekusi terkecil yang ter-review, bukan to-do publik.

Rencanapp bukan aplikasi chat biasa.

Rencanapp bukan social media.

Rencanapp bukan aplikasi perhitungan KPI formal seperti spreadsheet.

Rencanapp adalah sistem eksekusi berbasis Card yang menghubungkan:

Performance Workspace:

Goal -> Strategy -> Initiative -> Action Plan -> Task

Development Workspace:

Development Area -> Problem Statement / Development Goal -> Action Plan -> Task

Prinsip utama:

Perusahaan tidak membayar kesibukan. Perusahaan membayar eksekusi yang punya arah, bukti, review, dan hasil.

---

## 3. Tujuan Produk V1.82

1. Membantu user fokus pada pekerjaan yang relevan hari ini.
2. Membuat target tahunan dapat dieksekusi dalam periode berjalan tanpa membuat user tenggelam dalam terlalu banyak card.
3. Menghubungkan Goal tahunan dengan Strategy, Initiative, Action Plan, dan Task secara rapi.
4. Membuat Development Workspace fokus pada pembangunan sistem, problem, dan perbaikan proses.
5. Mengganti follow up manual di WhatsApp dengan Diskusi Rencana Aksi yang kontekstual.
6. Memastikan setiap pekerjaan punya PIC, Reviewer jika diperlukan, deadline, output, bukti, dan review.
7. Membuat user non-teknis mudah memahami arti Goal, Strategy, Initiative, Action Plan, dan Task.
8. Membuat admin dapat mengatur permission, template, score formula, organization, rules, archive, dan governance.
9. Membuat People menampilkan performa objektif tanpa mempermalukan user.
10. Menjaga UI tetap mobile-first, minimalis, card-based, dan tidak membuat user stres.

---

## 4. Tech Stack Target

Frontend:

1. Next.js.
2. React.
3. TypeScript.
4. Mobile-first responsive web app.
5. PWA-ready.

Backend:

1. Next.js Route Handler / Server Action.
2. Supabase Auth.
3. Supabase PostgreSQL.
4. Supabase Storage.
5. RLS untuk pembacaan data sederhana.
6. Backend API wajib untuk business rule penting.

Prototype saat ini masih static HTML/CSS/JS, tetapi implementasi produksi harus memakai Next.js dan Supabase.

---

## 5. Bahasa dan Terminologi

Bahasa default UI adalah Bahasa Indonesia.

Istilah berikut tetap dipertahankan dalam bahasa Inggris (dengan label UI Bahasa Indonesia):

1. Goal.
2. Strategy (label UI: Strategi).
3. Initiative (label UI: Inisiatif).
4. Action Plan (label UI: Rencana Aksi).
5. Task (label UI: Tugas).
6. Card.
7. Workspace.
8. Notifications.
9. Inbox.
10. People.
11. PIC.
12. Reviewer.
13. Minimum Breakdown Rule.
14. Score Formula.
15. Repeat.
16. Task Instance (label UI: Instance).
17. Archive.

Catatan V1.8.3:

Istilah level pada Performance & Development bergeser bottom-up. Identifier kode (tabel DB, RPC, route folder) memakai identifier snake_case baru: `strategy`, `initiative`, `action_plan`, `task`. UI Bahasa Indonesia mengikuti label di kolom "label UI" di atas.

**RWT-12 DECIDED 2026-07-11** — DRI = owner (self), tanggal deliverable = 2026-07-11. Copy label UI di seluruh mobile client sudah shifted ke Indonesian (`Strategi/Inisiatif/Rencana Aksi/Tugas`) via script `english_to_indonesian.js`; body help-popup `glossary.ts` di-rewrite dengan voice PRD §7.8 (tenang, praktis, tidak mengintimidasi). Card guidance seed (`card_guidance_contents`) tetap PENDING follow-up karena butuh review konten setiap topik oleh subject-matter — bisa iteratif tanpa block rilis.

Istilah yang tidak digunakan:

1. Parent.
2. Child.
3. Publish.
4. Posting.
5. Watcher.
6. Routine.
7. Checklist Routine.
8. Feed.
9. Company News.
10. Announcement.
11. Area Goal.

Padanan UI:

1. Parent diganti menjadi card induk.
2. Child diganti menjadi card turunan.
3. Publish diganti menjadi Aktifkan Card.
4. Posting tidak digunakan.
5. Routine tidak digunakan. Gunakan Task Repeat.

---

## 6. Batasan Produk V1.82

Yang masuk V1.82:

1. Login.
2. User profile.
3. Organization.
4. Department.
5. Position.
6. Team.
7. Role template.
8. User permission.
9. Performance Workspace.
10. Development Workspace.
11. Goal Template Library.
12. Strategy Template Library.
13. Goal Card.
14. Strategy Card.
15. Initiative Card.
16. Action Plan Card.
17. Task Card.
18. Task One Time.
19. Task Repeat.
20. Task Instance.
21. Period Focus Engine.
22. Strategy Target Breakdown.
23. Kelengkapan Card sebagai backend guard dan popup.
24. Keterangan Card melalui icon bantuan.
25. Minimum Breakdown Rule.
26. Kelengkapan Perencanaan sebagai backend guard dan popup.
27. Bukti.
28. Nilai Hasil.
29. Review.
30. Deadline Change Request.
31. Evaluation.
32. Activity Log.
33. Governance Violation.
34. Notifications.
35. Inbox Diskusi Rencana Aksi.
36. People.
37. Score Formula.
38. Repeat Compliance.
39. Basic Ranking.
40. Menu.
41. Settings.
42. Archive.
43. Search.
44. Confidential Access.
45. Manual Score Override.

Yang tidak masuk V1.82:

1. Feed.
2. Company News.
3. Announcement.
4. CEO Broadcast.
5. SOP Center penuh.
6. Knowledge Center.
7. HRIS penuh.
8. Payroll.
9. Inventory.
10. CRM.
11. WhatsApp integration.
12. Google Calendar integration.
13. AI Assistant.
14. AI Review.
15. Native Android/iOS.
16. Routine entity.
17. Checklist Routine entity.
18. Watcher.
19. Area Goal layer.
20. KPI child table di bawah Area Goal.
21. Bobot planning card.

---

## 7. Keputusan UX Utama V1.82

### 7.1 Bottom Navigation Final

Bottom navigation final mengikuti prototype terakhir:

1. Home.
2. Notif.
3. Workspace.
4. Inbox.
5. Menu.

People tidak tampil sebagai bottom nav utama. People masuk ke Menu.

Alasan:

1. People bukan aktivitas harian utama semua user.
2. Menu dibutuhkan sebagai pola Facebook mobile untuk akses cepat, People, template, settings, admin, archive, dan logout.
3. Settings tetap tidak tampil sebagai bottom nav mandiri.

### 7.2 Header Global

Header global memakai brand Rencanapp:

1. Logo mark Rencanapp di kiri.
2. Search pill pendek berlabel "Cari".
3. Icon Notifications.
4. Avatar/profile di kanan.

Search pill harus pendek, tidak terlalu mendominasi header.

Inbox boleh memakai header lokal yang lebih mirip chat app, tetapi tetap terasa satu keluarga dengan header global.

### 7.3 Card Interaction Rule

Tap pada area Card tidak boleh langsung membuka detail kecuali area tersebut memang button.

Setiap Card struktur harus punya:

1. Tombol "Detail" untuk masuk isi Card.
2. Icon panah untuk melihat atau menyembunyikan turunan Card.
3. Tombol `...` untuk aksi lain.
4. Tombol tambah turunan jika permission dan rule mengizinkan.

Makna:

1. Detail = masuk ke isi Card.
2. Panah = lihat turunan Card.
3. Tombol tambah = buat Card turunan.
4. `...` = edit, archive, permission action, atau action admin.

### 7.4 Kelengkapan Card Tidak Selalu Tampil

Kelengkapan Card tetap wajib sebagai rule backend, tetapi tidak boleh selalu memenuhi layar.

UI utama:

1. User mengisi form.
2. User klik Aktifkan Card.
3. Jika field wajib belum lengkap, sistem tampilkan popup umum.
4. Popup menjelaskan bahwa data wajib harus dilengkapi.
5. Sistem tidak perlu auto-scroll ke field kosong.

Contoh copy popup:

Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan.

### 7.5 Kelengkapan Perencanaan Tidak Selalu Tampil

Kelengkapan Perencanaan tetap ada sebagai rule backend, tetapi tidak harus selalu tampil sebagai panel besar.

Jika user mencoba membuat turunan saat Minimum Breakdown Rule belum terpenuhi:

1. Tombol tambah tetap terlihat.
2. Saat diklik, sistem menampilkan popup arahan.
3. Popup menjelaskan kekurangan dan Card apa yang harus dibuat dulu.

Contoh:

Strategy ini baru punya 2 dari 3 Initiative. Tambahkan 1 Initiative lagi dulu, baru tombol + Action Plan aktif.

### 7.6 Period Focus Engine

Workspace tidak menampilkan semua turunan tahunan sekaligus.

Default periode aktif:

1. Bulan berjalan.
2. User dapat memilih Quarter untuk ringkasan.
3. Goal tahunan tetap menjadi konteks.

Tujuan:

1. Staff fokus pada pekerjaan bulan ini.
2. Manager fokus pada eksekusi quarter dan bulan.
3. C-Level melihat arah tahunan tanpa kehilangan detail periode berjalan.

### 7.7 Card Periode Lewat

Card periode yang sudah lewat dibuat redup secara visual.

Rule:

1. Tetap bisa dibuka melalui Detail.
2. Tidak bisa dibuat turunan baru.
3. Tombol tambah pada Card archive atau periode lewat dikunci.
4. Jika user klik tombol tambah, tampil popup "Periode sudah lewat".

### 7.8 UI Psikologis

UI harus terasa:

1. Tenang.
2. Minimalis.
3. Tidak seperti dashboard desktop.
4. Tidak seperti tabel besar.
5. Tidak mengintimidasi user dengan log atau score terlalu dominan.
6. Tidak membuat user merasa diawasi terus.
7. Mengarahkan user ke tindakan berikutnya secara jelas.

---

## 8. Design System

### 8.1 Layout

1. Mobile-first.
2. Lebar desain utama mengikuti phone shell sekitar 390-430 px.
3. Card-based layout.
4. Bottom navigation fixed.
5. Semua detail page memakai tombol Kembali dengan desain seragam.
6. Tidak ada tabel besar di mobile.
7. Informasi list memakai card, row, pill, dan accordion.

### 8.2 Card

Card utama:

1. Background putih.
2. Border halus.
3. Radius 14-18 px.
4. Shadow tipis.
5. Spacing nyaman.

Card struktur Workspace:

1. Memiliki warna kategori.
2. Memiliki progress orb.
3. Memiliki title jelas.
4. Memiliki metadata satu sampai dua baris.
5. Memiliki tombol Detail, `...`, dan tombol tambah turunan.

### 8.3 Progress Orb

Progress ditampilkan sebagai lingkaran angka seperti People.

Warna:

1. Hijau untuk sehat.
2. Amber untuk berisiko.
3. Merah untuk buruk atau tertahan.
4. Biru untuk neutral/action.

Progress orb dipakai di:

1. Workspace overview.
2. Tree card.
3. Detail header.
4. People ranking jika relevan.

### 8.4 Pill

Pill dipakai untuk:

1. Kategori Card.
2. Status.
3. Periode.
4. Permission.
5. Count ringkas.

Pill tidak boleh menggantikan tombol utama.

### 8.5 Accordion

Accordion dipakai untuk:

1. Activity Log.
2. Kelengkapan Card jika perlu.
3. Pengaturan lanjutan.
4. Tugas di People Profile.
5. Period selector.
6. Target breakdown bulanan.

Default accordion untuk data lanjutan harus tertutup.

---

## 9. User Role

Role default:

1. Super Admin.
2. CEO.
3. C-Level.
4. Manager / Head.
5. Staff.
6. Reviewer.

Permission utama:

1. Melihat Workspace sesuai scope.
2. Membuat Goal.
3. Membuat Strategy.
4. Membuat Initiative.
5. Membuat Action Plan.
6. Membuat Task.
7. Mengirim Bukti.
8. Menginput Nilai Hasil.
9. Review Bukti.
10. Mengubah deadline.
11. Mengelola user.
12. Mengelola template.
13. Mengelola Score Formula.
14. Mengelola Minimum Breakdown Rule.
15. Mengelola Card Completion Rule.
16. Melihat Activity Log.
17. Melihat Governance Violation.
18. Archive dan restore.
19. Confidential Access.
20. Manual Score Override.

Frontend tidak boleh mengandalkan UI untuk keamanan. Semua rule penting wajib divalidasi backend.

---

## 10. Core Entity

### 10.1 Performance Workspace

Hierarchy:

Goal -> Strategy -> Initiative -> Action Plan -> Task

### 10.2 Development Workspace

Hierarchy:

Development Area -> Problem Statement / Development Goal -> Action Plan -> Task

### 10.3 Task

Task punya dua mode:

1. One Time.
2. Repeat.

Repeat bukan entity terpisah. Repeat adalah setting di Task.

Jika Repeat aktif, sistem menghasilkan Task Instance.

### 10.4 Task Instance

Instance adalah pekerjaan pada tanggal tertentu hasil dari Repeat.

Instance memiliki:

1. Instance date.
2. Due time.
3. Status.
4. Bukti.
5. Review.
6. Missed status.
7. Compliance contribution.

---

## 11. Period Focus Engine

### 11.1 Prinsip

Goal bersifat tahunan.

Strategy mengikuti periode Goal tahunan.

Initiative fokus pada Quarter.

Action Plan fokus pada Quarter atau rentang program.

Task fokus pada tanggal dan deadline konkret.

Workspace default menampilkan bulan berjalan.

### 11.2 UI Periode Aktif

Pada Performance Workspace dan Development Workspace, tampil panel kompak:

1. Label: Periode aktif.
2. Nilai: Juni 2026.
3. Keterangan: Goal 2026 - Q2 - Bulan berjalan.
4. Tombol: Ubah.

Saat panel dibuka:

1. Segmented control: Bulan / Quarter.
2. List periode: Mei 2026 Archive, Juni 2026 Aktif, Q2 2026 Quarter.
3. Pilihan periode tidak boleh membuat card area menjadi sempit.

### 11.3 Periode Lewat

Jika user memilih atau melihat periode lewat:

1. Card tampil redup.
2. Label Archive muncul.
3. Detail tetap bisa dibuka.
4. Tombol tambah turunan dinonaktifkan dengan popup.

---

## 12. Target Breakdown Strategy

### 12.1 Prinsip

Strategy tidak punya masa berlaku sendiri karena mengikuti Goal tahunan.

Strategy wajib punya target tahunan.

Strategy dapat dipecah ke:

1. Quarter.
2. Bulan di dalam Quarter.

### 12.2 Total Wajib 100%

Quarter breakdown total harus 100%.

Monthly breakdown di setiap Quarter juga harus 100%.

UI wajib menampilkan progress bar total kontribusi.

Jika total tidak 100%:

1. Aktifkan Card ditahan.
2. Popup validasi muncul.
3. Sistem menjelaskan total yang belum sesuai.

### 12.3 Perubahan Periode Berjalan

Kontribusi periode berjalan boleh diedit jika permission mengizinkan.

Jika diubah:

1. Wajib isi alasan.
2. Masuk Activity Log.
3. Perubahan tidak boleh mengubah periode yang sudah closed kecuali Super Admin dengan override rule.

---

## 13. Workspace Overview

Screen: Workspace.

Tujuan:

Menjadi pintu masuk ke Performance Workspace dan Development Workspace.

Komponen:

1. Card Performance.
2. Card Development.
3. Help icon `?` di kanan atas tiap card.
4. Progress orb.
5. Tombol "Masuk".

Performance card:

1. Label: Performance.
2. Title: Target Kinerja.
3. Flow text: Goal -> Strategy -> Initiative -> Action Plan -> Task.
4. Progress: 72%.
5. Metric ringkas: Goal, Strategy, Alert.

Development card:

1. Label: Development.
2. Title: Pembangunan Sistem.
3. Flow text: Development Area -> Problem Statement -> Action Plan -> Task.
4. Progress: 58%.
5. Metric ringkas: Area, Problem Statement, Aktif.

UX:

1. Card harus terlihat bisa diklik.
2. Tombol "Masuk" harus jelas.
3. Help icon menjelaskan perbedaan Performance dan Development.

---

## 14. Performance Workspace Tree

Tujuan:

Menampilkan struktur eksekusi Performance berdasarkan periode aktif.

Default:

1. Semua tree dalam mode ringkas.
2. User membuka turunan dengan panah.
3. User membuka isi Card dengan tombol Detail.

Card Goal:

1. Label: Goal.
2. Period badge: 2026.
3. Title: Omset 48 Miliar 2026.
4. Metadata: Juni aktif - Target bulan 4M - Aktual 3.1M - Risiko sedang.
5. Progress orb: Capaian 68%.
6. Actions: Detail, `...`, + Strategy.
7. Arrow: buka Strategy.

Card Strategy:

1. Label: Strategy.
2. Period badge: Juni 2026.
3. Title: Menambah Jumlah Customer.
4. Metadata: Aktual 620 / Target bulan 1.200 - Gap 580 - Butuh 1 Initiative.
5. Progress orb: 65%.
6. Actions: Detail, `...`, + Initiative.
7. Arrow: buka Initiative.

Card Initiative:

1. Label: Initiative.
2. Period badge: Q2 2026.
3. Title: Akuisisi Customer via Meta Ads.
4. Metadata: Kontribusi 42% - Risiko: respon WA lambat - Butuh 1 Action Plan.
5. Progress orb.
6. Actions: Detail, `...`, + Action Plan.
7. + Action Plan bisa dikunci Minimum Breakdown Rule.

Card Action Plan:

1. Label: Action Plan.
2. Period badge: Juni 2026.
3. Title: Campaign Paket Hemat Pizza.
4. Metadata: Target 120 lead - PIC Rina - Review bukti tertunda.
5. Progress orb.
6. Actions: Detail, `...`, + Task.
7. Arrow: buka Task.

Card Task:

1. Label: Task.
2. Period badge: Hari ini atau tanggal.
3. Title: Upload 5 konten angle hemat.
4. Metadata: Output dan deadline.
5. Progress orb.
6. Actions: Detail, `...`.

---

## 15. Development Workspace Tree

Tujuan:

Menampilkan ruang pembangunan sistem, problem, dan inisiatif perbaikan.

Default:

1. Semua tree ringkas.
2. Struktur sama secara visual dengan Performance.
3. Warna kategori berbeda agar mudah dikenali.

Development Area:

1. Label: Development Area.
2. Title: Pembangunan Sistem.
3. Metadata: Target sistem eksekusi rapi - Notif follow up masih tercecer.
4. Progress: 58%.
5. Actions: Detail, `...`, + Problem Statement.

Problem Statement:

1. Label: Problem Statement.
2. Title: Follow up masih tersebar di WhatsApp.
3. Metadata: Dampak follow up hilang - Butuh 1 flow review resmi.
4. Actions: Detail, `...`, + Action Plan.

Action Plan:

1. Sama pola dengan Performance Action Plan.
2. Bisa membuka Diskusi Rencana Aksi.
3. Bisa membuat Task jika rule terpenuhi.

Task:

1. Sama pola dengan Performance Task.
2. Berisi output konkret, bukti, reviewer, deadline.

---

## 16. Create Card Pattern

Semua form buat Card harus memakai pola yang sama.

Pola:

1. Tombol Kembali di atas.
2. Hero card dengan pill kategori dan icon `?`.
3. Judul form.
4. Deskripsi pendek.
5. Step indicator ringkas.
6. Card form utama.
7. Pengaturan lanjutan sebagai accordion tertutup.
8. Sticky action: Simpan Draft dan Aktifkan Card.

Tidak boleh:

1. Menampilkan terlalu banyak edukasi panjang di awal.
2. Menampilkan Kelengkapan Card penuh di form awal.
3. Menampilkan tombol buat turunan di form create.
4. Menampilkan tabel besar.

---

## 17. New Goal

Tujuan:

Membuat target tahunan utama perusahaan.

Field wajib:

1. Nama Goal.
2. Target Tahunan.
3. PIC.
4. Tahun Goal.
5. Keterangan / Target.

Rule:

1. Goal selalu tahunan.
2. Periode Goal otomatis 1 Jan - 31 Des tahun aktif.
3. Tidak ada rentang tanggal manual untuk Goal.
4. Goal dapat disimpan Draft.
5. Goal baru aktif setelah field wajib valid.

CTA:

1. Simpan Draft.
2. Aktifkan Card.

---

## 18. New Strategy (Area Hasil)

Tujuan:

Membuat Strategy di bawah Goal tahunan.

Default:

1. Isi manual sebagai default.
2. Tombol Pakai Template tersedia di dalam Data Strategy.
3. Template hanya membantu mengisi data awal.

Field wajib:

1. Nama Strategy.
2. Target Tahunan.
3. PIC.
4. Ekspektasi Hasil.
5. Pecahan Target Quarter total 100%.
6. Pecahan Target Bulanan dalam quarter total 100%.

Field opsional (override 2026-06-29, migrasi 0032):

1. Target angka (`target_numeric`) — basis "% capaian vs target" presisi.
2. Satuan (`target_unit`) — mis. "customer", "Rp". OPSIONAL; Strategy kualitatif tetap pakai Target Tahunan teks.

Tidak ada field:

1. Masa berlaku Strategy.

Alasan:

1. Masa berlaku Strategy otomatis mengikuti Goal tahunan.

> Catatan override (2026-06-29): §18 semula melarang Satuan dengan alasan "Satuan membuat UI
> terasa seperti spreadsheet". Owner meng-override untuk membuka "% gap" presisi seperti prototype
> design ("65% / kurang 1.060 customer"). Target angka + Satuan kini **opsional** (bukan wajib) —
> Strategy kualitatif tetap bebas-satuan, jadi UI tidak dipaksa seperti spreadsheet. Implementasi:
> migrasi 0032 + `lib/strategy-gap.ts` (rename dari `kpi-gap.ts` di F4) + layar Strategy form/detail + kartu Home "Gap Strategy".

Template behavior:

1. Klik Pakai Template membuka bottom sheet.
2. User memilih tipe Goal: Omset atau Profit.
3. User memilih area: Sales, Ops, Finance, HC, Growth.
4. User memilih template.
5. Setelah template dipilih, Nama Strategy, PIC rekomendasi, Target awal, dan Ekspektasi Hasil terisi otomatis.
6. User tetap bisa mengedit semua field.

CTA:

1. Simpan Draft.
2. Aktifkan Card.

---

## 19. Strategy Template Library

Template untuk Goal Omset:

Sales & Marketing:

1. Menambah Jumlah Customer.
2. Meningkatkan Basket Size.

Operations:

1. Meningkatkan Output Produk.
2. Meningkatkan Produktivitas.

Finance & Accounting:

1. Ketersediaan Arus Kas yang Memadai.
2. A/R Collection.

Human Capital:

1. Meningkatkan Kompetensi Karyawan.
2. Ketersediaan Karyawan (MPP).

Business Growth:

1. Menambah Jumlah Cabang Baru.
2. Menciptakan Produk / Brand Baru.

Template untuk Goal Profit:

Sales & Marketing:

1. Increase Sales Price.
2. Minimize Budget.

Operations:

1. Menurunkan OPEX.
2. Menurunkan Komplain Pelanggan.

Finance & Accounting:

1. Control Budgeting.

Human Capital:

1. Mengurangi Biaya Lembur.
2. Menurunkan Turnover.

Admin dapat membuat, mengedit, menonaktifkan, dan membuat versi template baru.

Update template tidak otomatis mengubah Strategy aktif.

---

## 20. New Initiative (Pendekatan Q-focused)

Tujuan:

Membuat pendekatan eksekusi untuk Strategy.

Field wajib:

1. Nama Initiative.
2. Pendekatan.
3. PIC.
4. Kontribusi Quarter.
5. Periode eksekusi.

Rule:

1. Initiative berada di bawah Strategy.
2. Initiative fokus pada Quarter aktif.
3. Initiative tidak punya target tahunan.
4. Initiative menjelaskan cara mencapai Strategy.
5. Initiative dapat dibuat Draft dan diaktifkan setelah field wajib lengkap.

UI:

1. Context bar menampilkan Strategy, bulan aktif, dan quarter.
2. Periode eksekusi readonly mengikuti quarter aktif.
3. Pengaturan lanjutan tertutup.

---

## 21. New Action Plan (Program Unit)

Tujuan:

Membuat program eksekusi di bawah Initiative atau Problem Statement.

Field wajib:

1. Nama Action Plan.
2. Target hasil.
3. PIC.
4. Tim.
5. Durasi program mulai dan berakhir.

Rule:

1. Action Plan punya Diskusi Rencana Aksi otomatis setelah aktif.
2. Action Plan dapat memiliki Task.
3. Access dihitung backend berdasarkan PIC, Reviewer, card induk, dan permission.
4. Action Plan tidak menampilkan pengaturan akses manual di form utama.

CTA:

1. Simpan Draft.
2. Aktifkan Card.

---

## 22. New Task

Tujuan:

Membuat pekerjaan konkret di bawah Action Plan.

Field wajib:

1. Jenis Task: One Time atau Repeat.
2. Nama Task.
3. Output / Ekspektasi Hasil.
4. Definition of Done.
5. Bukti yang diminta.
6. PIC.
7. Reviewer.
8. Deadline.
9. Jam Deadline.

One Time:

1. Punya satu deadline.
2. Punya satu alur Bukti dan Review.

Repeat:

1. Menggunakan Repeat Setting.
2. Menghasilkan Task Instance.

UI:

1. Jenis Task tampil sebagai pilihan ringkas.
2. Repeat tidak membuka modul baru, hanya masuk ke Repeat Setting.
3. Pengaturan lanjutan berisi Repeat Setting, jenis bukti, Nilai Hasil, dan anti self-review.

CTA:

1. Simpan Draft.
2. Aktifkan Card.

---

## 23. Repeat Setting

Repeat Setting adalah setting pada Task.

Field:

1. Frequency: Harian, Mingguan, Bulanan, Custom.
2. Tanggal mulai.
3. Tanggal berakhir.
4. Jam deadline.
5. Zona waktu.
6. Mode keterlambatan.
7. Expected instances.
8. Completed instances.
9. Missed instances.
10. Repeat Compliance.

Mode keterlambatan:

1. Ketat.
2. Ada toleransi.
3. Lewat tetap tercatat.

UI:

1. Mirip alarm app.
2. Bahasa Indonesia.
3. Ringkas dan tidak seperti spreadsheet.
4. Menampilkan kepatuhan repeat sebagai progress bar.

---

## 24. Bukti, Nilai Hasil, Review

### 24.1 Bukti

Bukti memakai versioning.

Rule:

1. Upload bukti baru tidak menghapus versi lama.
2. Reviewer melihat riwayat bukti.
3. Bukti yang sedang direview terkunci.
4. Bukti bisa berupa file, link, screenshot, atau catatan.

### 24.2 Nilai Hasil

Nilai Hasil dipakai untuk memasukkan hasil terukur ke Strategy.

Rule:

1. Nilai Hasil masuk Strategy hanya setelah review disetujui.
2. Perubahan menyimpan nilai lama, nilai baru, alasan, dan Activity Log.
3. Frontend hanya menampilkan dan mengirim request. Backend menentukan nilai sah.

### 24.3 Review

Review harus membantu, bukan terasa menghakimi.

Actions:

1. Setujui.
2. Minta Revisi.
3. Catatan.

Jika Minta Revisi, alasan wajib.

---

## 25. Deadline Change Request

User dapat meminta perubahan deadline jika pekerjaan terhambat.

Field:

1. Deadline sekarang.
2. Deadline diminta.
3. Alasan.
4. Dampak jika tidak disetujui.

Reviewer dapat:

1. Setujui.
2. Tolak.
3. Minta revisi alasan.

Backend membuat Notifications dan Activity Log.

---

## 26. Evaluation

Evaluation digunakan saat Initiative selesai.

Field:

1. Target tercapai atau tidak.
2. Achievement.
3. Faktor berhasil.
4. Faktor gagal.
5. Perlu jadi SOP atau tidak.
6. Perlu rollout atau tidak.

Evaluation default tidak muncul di awal. Ditampilkan saat Initiative sudah mendekati selesai atau selesai.

---

## 27. Home

Tujuan:

Pusat kendali hari ini.

Home tidak boleh menjadi feed panjang.

Komponen:

1. Header global Rencanapp.
2. Greeting singkat.
3. Fokus Hari Ini.
4. Prioritas yang pas satu layar, tidak horizontal scroll.
5. Action Plan penting hari ini.
6. Update terbaru yang relevan.

Card Fokus Hari Ini:

1. Menampilkan Action Plan atau Repeat Action Plan yang perlu perhatian.
2. CTA cukup satu: Detail.
3. Tidak menampilkan banyak CTA seperti Bukti, Chat, Detail sekaligus.

Home tidak boleh menampilkan:

1. Shortcut besar yang duplikat dengan nav.
2. Feed sosial.
3. Announcement.
4. Company news.

---

## 28. Notifications

Tujuan:

Alert dan action center.

Notifications bukan chat area.

Komponen:

1. Section New.
2. Section Earlier.
3. Row notification dengan avatar/icon, title, context, time, status read/unread.
4. Action button kecil hanya jika perlu.
5. Read marker jelas.

Jenis Notifications:

1. Review diperlukan.
2. Bukti dikirim.
3. Deadline change request.
4. Deadline lewat.
5. Mention.
6. Permission berubah.
7. Governance warning.
8. Minimum Breakdown Rule warning.
9. Repeat due today.

UX:

1. Card tidak terlalu kecil sampai membuat stres.
2. Satu layar idealnya bisa melihat beberapa item tanpa terasa padat.
3. Button action tidak boleh besar dan makan ruang.

---

## 29. Inbox

Tujuan:

Khusus Diskusi Rencana Aksi.

Inbox bukan action queue.

Inbox bukan Notifications.

Komponen:

1. Header lokal Inbox.
2. Search Rencana Aksi atau pesan.
3. Filter: Semua, Belum dibaca, Saya PIC, Review, Deadline.
4. List Diskusi Rencana Aksi.
5. Unread dot.
6. Time stamp.

Tidak ada:

1. Stories.
2. Group shortcut yang tidak penting.
3. Action queue.
4. Notifications.

---

## 30. Diskusi Rencana Aksi

Tujuan:

Tempat diskusi Rencana Aksi (Action Plan) dan konteks Task.

Komponen:

1. Chat topbar dengan back, avatar group, title, member count, status.
2. Button anggota.
3. Button buka Rencana Aksi.
4. Date divider.
5. Message bubble.
6. Reaction pill.
7. Seen by indicator.
8. System event.
9. Composer.
10. Task reply context banner.

Rule:

1. Chat selalu terikat Rencana Aksi (level 3 struktural — tabel `action_plans` pasca-rename).
2. Task dapat membuka chat dengan konteks reply.
3. Task tidak membuat chat terpisah.
4. Bukti tetap dikirim melalui Task, bukan sebagai chat biasa.

Catatan RWT-04 (default A): membership chat STABIL. Row `chat_rooms` yang sebelumnya
terikat `initiatives.id` (semantik lama = "program unit") sekarang terikat kolom
`action_plan_id` (identifier baru untuk entitas yang SAMA fisiknya). Tidak ada baris
di-migrate ke tabel lain. Label UI "Initiative Chat" berubah jadi "Diskusi Rencana Aksi"
murni cosmetic.

---

## 31. Menu

Tujuan:

Pintu masuk ke profil, People, tools admin, template, settings, archive, dan logout.

Komponen:

1. Header Menu.
2. Profile card.
3. Akses Cepat.
4. Template accordion.
5. Bantuan accordion.
6. Pengaturan accordion.
7. Admin Lanjutan accordion.
8. Logout.

Akses Cepat:

1. People.
2. Log Aktivitas.
3. Archive.

Template:

1. Goal Template.
2. Strategy Template.

Pengaturan:

1. Organisasi.
2. Repeat Setting.
3. Score Formula.
4. Permission Settings.
5. Minimum Breakdown Rule.

Admin Lanjutan:

1. Governance.
2. Confidential.
3. Override Score.

UX:

1. Icon harus berada di tengah frame.
2. Judul kategori harus seragam ukuran text.
3. Item admin hanya tampil jika permission mengizinkan.

---

## 32. People

Tujuan:

Melihat ranking dan profil pencapaian user secara objektif.

People bukan tempat mempermalukan orang.

Komponen:

1. Header People.
2. Search People.
3. Tabs: Ranking, Bulan ini, Q3 2026, Admin.
4. Ranking People list.
5. Button Lihat Profil di tiap row.
6. Admin panel kelola user jika permission admin.

People list tidak menampilkan:

1. PIC.
2. Reviewer.
3. Detail Strategy.

Karena People bersifat skala umum.

People row menampilkan:

1. Rank.
2. Avatar.
3. Nama.
4. Jabatan.
5. Achievement summary.
6. Score.
7. Tombol Lihat Profil.

---

## 33. People Profile

Tujuan:

Melihat profil pencapaian dan kontribusi user.

Komponen:

1. Profile header.
2. Nama.
3. Jabatan dan tanggal bergabung.
4. Ranking People.
5. Detail People.
6. Tugas sebagai accordion.
7. Kontribusi bulan ini.
8. Rincian Score.
9. Riwayat Score.

Header tidak menampilkan terlalu banyak angka.

Keterlibatan accordion berisi keterlibatan user di:

1. Task.
2. Action Plan.
3. Initiative.
4. Strategy.
5. Problem Statement.

---

## 34. Settings dan Admin

### 34.1 Permission Settings

Mengatur hak akses user, role, scope, dan perubahan permission.

Setiap perubahan permission wajib:

1. Alasan.
2. Actor.
3. Nilai lama.
4. Nilai baru.
5. Activity Log.

### 34.2 Score Formula

Mengatur rumus score.

Wajib mendukung:

1. Staff formula.
2. Management formula.
3. C-Level formula.
4. CEO formula.
5. Versioning.
6. Effective date.
7. Closed period lock.

### 34.3 Organization

Mengatur:

1. Organization.
2. Department.
3. Position.
4. Team.
5. Reporting line.
6. Role Template.

### 34.4 Minimum Breakdown Rule

Mengatur batas minimum Card turunan.

Default Performance:

1. Strategy minimal 3 Initiative sebelum + Action Plan aktif.
2. Initiative minimal 3 Action Plan sebelum + Task aktif.
3. Action Plan minimal 3 Task sebagai standar eksekusi lengkap.
4. Task tidak punya MBR default (level operasional harian). Seed migrasi 0049 memasang default 3 sesuai RWT-09 A; admin org bisa turunkan ke 0 lewat Settings.

Default Development:

1. Development Area minimal 1 Problem Statement / Development Goal.
2. Problem Statement minimal 1 Action Plan.
3. Action Plan minimal 3 Task.

Mode default: Blokir Tombol Turunan.

### 34.5 Card Completion Rule

Mengatur field wajib per jenis Card.

Tidak perlu tampil sebagai panel utama user. Dipakai saat Aktifkan Card.

### 34.6 Keterangan Card Settings

Mengatur isi bantuan pada icon `?`.

Isi harus:

1. Pendek.
2. Praktis.
3. Tidak seperti tutorial panjang.
4. Membantu user memahami makna Card.

### 34.7 Notifications Rule

Mengatur kapan Notifications muncul.

### 34.8 Archive

Mengatur item yang diarsipkan, restore, dan visibility.

### 34.9 Confidential Access

Mengatur akses khusus dengan alasan, approval, dan log.

### 34.10 Manual Score Override

Hanya untuk user berwenang.

Tidak menghapus score otomatis.

Semua override wajib masuk Activity Log dan Governance.

---

## 35. Activity Log

Activity Log adalah riwayat permanen.

Activity Log tidak boleh terasa mengintimidasi.

Catatan V1.8.3 (RWT-07 default A): row historis Activity Log yang menyimpan literal
`entity_type = 'kpi_area' | 'strategy' | 'initiative' | 'action_plan' | 'action_plan_instance'`
TIDAK di-backfill demi audit integrity. Read-side rendering memakai helper
`public.map_legacy_entity_type(text)` untuk menampilkan label baru; row baru menulis literal enum
V1.8.3 (`'strategy'` = area hasil, `'initiative'` = pendekatan, `'action_plan'` = program unit,
`'task'` = unit eksekusi, `'task_instance'`).

Default:

1. Di detail Card tampil sebagai accordion tertutup.
2. Di Menu ada screen Log Aktivitas untuk pencarian.

Event yang dicatat:

1. Card dibuat.
2. Card diaktifkan.
3. Card diedit.
4. Card diarsipkan.
5. Permission berubah.
6. Review disetujui.
7. Review ditolak.
8. Deadline change request.
9. Nilai Hasil diajukan.
10. Score Formula berubah.
11. Minimum Breakdown Rule berubah.
12. Card Completion Rule berubah.
13. Keterangan Card berubah.
14. Confidential Access diberikan.
15. Manual Score Override.

---

## 36. Governance Violation

Governance Violation muncul saat rule penting dilanggar.

Contoh:

1. Reviewer sama dengan PIC.
2. User mencoba membuat turunan saat Minimum Breakdown Rule belum terpenuhi.
3. User mencoba aktifkan Card dengan field wajib kosong.
4. User melewati deadline Task Repeat.
5. User mencoba akses confidential tanpa izin.
6. User mengubah target tanpa alasan.

UI:

1. Menampilkan severity.
2. Menampilkan entity terkait.
3. Menampilkan penyebab.
4. Menampilkan CTA selesaikan.
5. Menyediakan resolution note.

---

## 37. Archive

Archive menyimpan data yang tidak tampil di Workspace aktif.

Archived Card:

1. Tidak tampil di Workspace aktif.
2. Tetap bisa ditemukan oleh user berwenang di Search atau Archive.
3. Bisa dibuka detail.
4. Tidak bisa dibuat turunan baru.
5. Bisa dipulihkan jika permission mengizinkan.

Periode lewat boleh diberi visual redup tanpa selalu masuk archive permanen.

---

## 38. Search

Search harus mengikuti permission.

Search mendukung:

1. Goal.
2. Strategy.
3. Initiative.
4. Action Plan.
5. Task.
6. Task Instance.
7. Development Area.
8. Problem Statement.
9. People.
10. Comment.
11. Chat.
12. Bukti.
13. Activity Log.
14. Governance Violation.

Search result harus dikelompokkan.

User tidak boleh menemukan data yang tidak boleh dia akses.

---

## 39. Login

Login mengikuti style mobile app dengan brand Rencanapp.

Komponen:

1. Logo Rencanapp besar.
2. Nama Rencanapp.
3. Tagline.
4. Email perusahaan.
5. Password.
6. Tombol Masuk.
7. Lupa password.
8. Hubungi Admin.

Rule:

1. Akun dibuat oleh admin.
2. Tidak ada public self-register.
3. Supabase Auth digunakan di produksi.

---

## 40. Empty, Loading, Error State

Setiap screen wajib punya:

1. Empty state.
2. Loading state.
3. Error state.

Prinsip:

1. Empty state menjelaskan apa yang harus dilakukan berikutnya.
2. Loading memakai skeleton card, bukan spinner besar.
3. Error state menggunakan bahasa yang tenang dan actionable.

Contoh empty:

Belum ada Action Plan untuk periode ini. Buat Action Plan setelah Initiative aktif.

Contoh error:

Data belum bisa dimuat. Coba ulang, atau hubungi admin jika masalah berlanjut.

---

## 41. API dan Backend Rule

Frontend tidak boleh menjalankan logic penting sendirian.

Logic wajib backend:

1. Aktifkan Card.
2. Validasi Kelengkapan Card.
3. Validasi Minimum Breakdown Rule.
4. Validasi target breakdown 100%.
5. Generate Task Instance.
6. Submit Bukti.
7. Submit Nilai Hasil.
8. Review approve/reject.
9. Anti self-approval.
10. Deadline change approval.
11. Permission change.
12. Score Formula activation.
13. Activity Log creation.
14. Governance Violation creation.
15. Archive.
16. Confidential access.
17. Manual Score Override.
18. Repeat missed checker.

API response mengikuti format:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Lengkapi data wajib terlebih dahulu."
  }
}
```

---

## 42. Screen List V1.82

Screens wajib:

1. Login.
2. Home.
3. Notifications.
4. Workspace.
5. Performance Workspace.
6. Development Workspace.
7. Development Area Detail.
8. New Development Area.
9. New Problem Statement / Development Goal.
10. Problem Statement Detail.
11. Goal Detail.
12. New Goal.
13. New Strategy.
14. New Initiative.
15. New Action Plan.
16. Strategy Detail.
17. Initiative Detail.
18. Action Plan Detail.
19. Task Detail.
20. New Task.
21. Repeat Setting.
22. Evidence Submission.
23. Result Value Input.
24. Task Instance Detail.
25. Review.
26. Deadline Change Request.
27. Card Completion helper.
28. Evaluation.
29. Inbox.
30. Diskusi Rencana Aksi.
31. Menu.
32. People.
33. People Profile.
34. Score Formula Settings.
35. Permission Settings.
36. Repeat Rule Settings.
37. Goal Template Library.
38. Strategy Template Library.
39. Organization Settings.
40. Minimum Breakdown Rule Settings.
41. Activity Log.
42. Governance Violation.
43. Archive.
44. Global Search.
45. Confidential Access.
46. Manual Score Override.

People Ranking terpisah tidak wajib menjadi screen utama karena ranking sudah ada di People. Jika tetap dibuat, posisinya sebagai sub-view People, bukan bottom nav baru.

---

## 43. Seed Data Prototype

Brand:

1. Rencanapp.
2. Rencanakan. Jalankan. Tuntaskan.

User utama:

1. Rina Jaya.
2. Initial: RJ.
3. Role: Staf Marketing.
4. Score: 86.
5. Rank: 1.

Performance example:

1. Goal: Omset 48 Miliar 2026.
2. Strategy: Menambah Jumlah Customer.
3. Strategy: Meningkatkan Basket Size.
4. Strategy: Meningkatkan Output Produk.
5. Initiative: Akuisisi Customer via Meta Ads.
6. Action Plan: Campaign Paket Hemat Pizza.
7. Task: Upload 5 konten angle hemat.

Development example:

1. Development Area: Pembangunan Sistem.
2. Problem Statement: Follow up masih tersebar di WhatsApp.
3. Action Plan: Bangun EMS V1.
4. Task: Finalisasi UI blueprint mobile.

Inbox example:

1. Campaign Paket Hemat Pizza.
2. Pindahkan Review dari WA ke EMS.
3. Outlet Promo Landing Flow.
4. SOP Finance Development.

People example:

1. Rina Jaya - Score 86 - Rank 1.
2. Arman Malik - Score 82 - Rank 2.
3. Maya Sari - Score 78 - Rank 3.
4. Dika Saputra - Score 74 - Rank 4.

---

## 44. Acceptance Criteria

Frontend dianggap sesuai V1.82 jika:

1. Mobile-first dan nyaman di viewport 390 px.
2. Bottom nav final: Home, Notif, Workspace, Inbox, Menu.
3. Header global Rencanapp konsisten.
4. Menu menjadi akses People, Template, Settings, Admin, Archive, Logout.
5. Workspace memakai card tree dengan Detail dan panah terpisah.
6. Performance dan Development punya pola UI yang sama.
7. Periode aktif default bulan berjalan.
8. User dapat memilih Bulan atau Quarter.
9. Card periode lewat tampil redup dan tidak bisa dibuat turunan baru.
10. Goal bersifat tahunan.
11. Strategy mengikuti Goal tahunan.
12. Strategy punya pecahan target Quarter dan Bulan total 100%.
13. New Strategy default manual, template sebagai solusi cepat via popup.
14. Kelengkapan Card tidak memenuhi layar, tetapi divalidasi saat Aktifkan Card.
15. Minimum Breakdown Rule mengunci tombol turunan dengan popup.
16. Task mendukung One Time dan Repeat.
17. Repeat menghasilkan Task Instance.
18. Bukti memakai versioning.
19. Nilai Hasil masuk Strategy setelah review.
20. Diskusi Rencana Aksi hanya untuk Rencana Aksi (Action Plan).
21. Task dapat membuka chat dengan konteks reply.
22. Notifications bukan chat.
23. Inbox bukan action queue.
24. People menampilkan ranking objektif tanpa mempermalukan user.
25. Admin settings mengikuti permission.
26. Activity Log default tidak intimidatif.
27. Search dan Archive mengikuti permission.
28. Tidak ada Feed, Company News, Announcement, Routine, Checklist Routine, Watcher, Area Goal.

---

## 45. Final Product Statement

Rencanapp V1.82 adalah mobile-first execution governance app yang membantu perusahaan menjalankan target tahunan menjadi eksekusi bulanan, quarter, dan harian tanpa membuat user bingung.

User staff melihat pekerjaan yang perlu dilakukan.

Manager melihat struktur eksekusi dan blocker.

C-Level melihat target, gap, risiko, dan progres.

Admin mengatur sistem, permission, template, dan governance.

UI harus familiar seperti aplikasi mobile modern, tetapi tetap fokus pada kerja, bukan social media.
