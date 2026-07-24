# PRD FINAL V1.83 - Rencanapp Execution Project Management

## 1. Dokumen

Nama produk: Rencanapp.

Aturan penamaan: gunakan `Rencanapp` untuk semua penyebutan brand produk di UI, copy, dan dokumen spesifikasi. Gunakan `RencanApp` hanya untuk identifier teknis seperti nama repo, path, atau referensi tooling yang memang fixed.

Tagline: Rencanakan. Jalankan. Tuntaskan.

Versi PRD: V1.83.

Basis revisi:

1. PRD EMS V1.82 (source-of-truth sebelumnya, dengan seluruh catatan RWT V1.8.3 dan override 2026-06-29).
2. API Contract EMS V1.8.1.
3. Prototype mobile UI terakhir di `outputs/ems-mobile-ui/index.html`.
4. Keputusan UX terbaru hasil review prototype.
5. Reposisi V1.83: turunkan tekanan pada staff harian, dorong fitur berat (Score Formula, Governance, Activity Log, Manual Score Override) ke Admin Lanjutan.

Tujuan dokumen ini adalah menjadi source-of-truth untuk implementasi frontend agar Claude Code atau developer lain dapat membuat aplikasi yang sangat mirip dengan prototype saat ini dari sisi fitur, fungsi, UI, UX, dan psikologi penggunaan.

---

## 1B. Matriks Amandemen (keputusan final di atas basis revisi)

Satu-satunya rujukan cepat untuk "amandemen apa saja yang sudah final" di atas basis revisi (§1). Catatan detail tetap inline di section masing-masing; kolom **Lokasi / dampak** menunjuk ke sana. Tambahkan baris baru di sini setiap ada keputusan owner yang mengubah PRD, supaya handoff sesi berikutnya tidak perlu menyisir dokumen.

| Ref | Tanggal | Keputusan | Status | Lokasi / dampak |
| --- | --- | --- | --- | --- |
| RWT V1.8.3 (warisan V1.82) | — | Katalog keputusan RWT (label & semantik) dari V1.82 tetap berlaku. Yang eksplisit disebut ulang di V1.83: **RWT-04** (membership chat stabil, default A), **RWT-07** (`entity_type` Activity Log = literal historis, default A), **RWT-12** (label UI Indonesia: "Aturan Pecah Target", "Diskusi Rencana Aksi"). Katalog RWT lengkap ada di PRD V1.82. | Final | §1 basis #1; §5 penamaan; §34.4 (label MBR); §34.10 (Activity Log); bagian chat (RWT-04) |
| Override 2026-06-29 | 2026-06-29 | §18 semula melarang "Satuan" (dianggap bikin UI terasa seperti spreadsheet). Owner meng-override untuk membuka **field opsional target numerik + unit** pada area → "% gap" presisi seperti prototype. | Final (berlaku di V1.83) | §18; migrasi 0032; `lib/strategy-gap.ts`; layar Strategy form/detail; kartu Home "Gap Strategy" |
| Reposisi V1.83 | rilis V1.83 | EMS → **"Execution Project Management"**. Fitur berat (Score Formula, Governance, Activity Log, Manual Score Override) dipindah ke **Admin/Advanced**; tekanan staff harian diturunkan; **People di-de-score** (urutan kontribusi ringan, tanpa mempermalukan); **MBR opsional**. Label level & istilah UI Indonesia (RWT-12) tetap. | Final | §1 basis #5; §2–§3; §44 AC-24 |
| Owner decision 2026-07-03 | 2026-07-03 | **"Tampil redup"/dim untuk kartu periode-lewat DICABUT.** Sinyal tunggal periode-lewat = badge teks **"Periode lewat"**. Alasan: `opacity` bersarang jatuh <AA (DESIGN §4). Larangan membuat turunan baru dari kartu periode-lewat TETAP mengikat. | Final — **mengalahkan §7.7 & §11.3**, konsisten dg §37 | §44 AC-9; catatan §7.7 & §33; ref UI-S-W08 (`wiki/concepts/ui-prototype-gap`) |
| Owner decision 2026-07-22 (BL-07) | 2026-07-22 | Item "Aturan Pecah Target warning" **dipenuhi oleh gerbang MBR inline, BUKAN oleh Notifications.** Tidak ada notifikasi persisten untuk item ini, dan **tidak boleh ditambahkan** (notif akan tiba setelah user meninggalkan konteks pemicunya). | Final | Bagian Notifications (BL-07) |

---

## 2. Product Overview

Rencanapp adalah Execution Project Management untuk membantu perusahaan memecah target besar menjadi aksi nyata yang bisa dijalankan, dipantau, direview, dibuktikan, dan dituntaskan.

Rencanapp bukan project management polos yang hanya menyimpan daftar tugas.

Rencanapp bukan task management biasa.

Rencanapp bukan aplikasi chat biasa.

Rencanapp bukan social media.

Rencanapp bukan aplikasi perhitungan indikator formal seperti spreadsheet.

Rencanapp adalah sistem eksekusi berbasis Card yang menghubungkan target perusahaan dengan pekerjaan harian:

Performance Workspace:

Goal -> Strategy -> Initiative -> Action Plan -> Task

Development Workspace:

Development Area -> Problem Statement / Development Goal -> Action Plan -> Task

Prinsip utama:

1. Target besar harus bisa dipecah menjadi struktur kerja yang mudah dipahami.
2. User tidak boleh diserbu semua turunan sekaligus; Workspace harus fokus pada periode aktif.
3. Setiap aksi harus punya PIC, deadline, output yang jelas, dan status yang bisa dipercaya.
4. Bukti, review, dan hasil dipakai untuk memastikan pekerjaan benar-benar selesai, bukan untuk mempermalukan user.
5. Fitur penilaian, score, governance, dan aturan lanjutan berada di area admin/advanced, bukan mengganggu user harian.

Kalimat produk:

Rencanakan target. Pecah jadi aksi. Jalankan sampai tuntas.

---

## 3. Tujuan Produk V1.83

1. Membantu user fokus pada pekerjaan yang relevan hari ini.
2. Membuat target perusahaan dapat dipecah menjadi aksi dalam periode berjalan tanpa membuat user tenggelam dalam terlalu banyak Card.
3. Menghubungkan Goal dengan Strategy, Initiative, Action Plan, dan Task secara rapi.
4. Membuat Development Workspace fokus pada pembangunan sistem, problem, dan perbaikan proses.
5. Mengganti follow up manual di chat luar aplikasi dengan Diskusi Rencana Aksi yang kontekstual.
6. Memastikan setiap pekerjaan punya PIC, Reviewer jika diperlukan, deadline, output, bukti, dan review.
7. Membuat user non-teknis mudah memahami arti Goal, Strategy, Initiative, Action Plan, dan Task.
8. Membuat admin dapat mengatur permission, template, organization, rules, archive, score formula, dan governance tanpa membebani user harian.
9. Membuat People menampilkan kontribusi, keterlibatan, dan beban kerja secara objektif tanpa mempermalukan user.
10. Menjaga UI tetap mobile-first, minimalis, card-based, dan tidak membuat user stres.

---

## 4. Tech Stack

Tech stack bukan lagi bagian dari PRD. Sumber kebenaran: [`wiki/concepts/tech-stack.md`](wiki/concepts/tech-stack.md) (pilihan tumpukan) dan [`wiki/concepts/architecture.md`](wiki/concepts/architecture.md) (ADR "Thick Database, Thin Client" — semua business rule di Postgres).

Ringkas: mobile-first Expo React Native (iOS + Android + web) di atas Supabase (Postgres/Auth/Storage/Realtime/Edge Functions + `pg_cron`). PRD tidak mendikte framework — perubahan tech stack ditetapkan di wiki dan tidak perlu amandemen PRD.

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
13. Minimum Breakdown Rule (label UI: Aturan Pecah Target).
14. Score Formula.
15. Repeat.
16. Task Instance (label UI: Instance).
17. Archive.

Catatan V1.8.3:

Istilah level pada Performance & Development bergeser bottom-up. Identifier kode (tabel DB, RPC, route folder) memakai identifier snake_case baru: `strategy`, `initiative`, `action_plan`, `task`. UI Bahasa Indonesia mengikuti label di kolom "label UI" di atas.

**RWT-12 DECIDED 2026-07-11** — DRI = owner (self), tanggal deliverable = 2026-07-11. Copy label UI di seluruh mobile client sudah shifted ke Indonesian (`Strategi/Inisiatif/Rencana Aksi/Tugas`) via script `english_to_indonesian.js`; body help-popup `glossary.ts` di-rewrite dengan voice PRD §7.8 (tenang, praktis, tidak mengintimidasi). Card guidance seed (`card_guidance_contents`) tetap PENDING follow-up karena butuh review konten setiap topik oleh subject-matter — bisa iteratif tanpa block rilis.

Catatan V1.83: repositioning ke "Execution Project Management" tidak mengubah istilah level di atas. Label UI Indonesia dari RWT-12 tetap berlaku; "Diskusi Rencana Aksi" tetap dipakai untuk chat Action Plan (bukan "Action Plan Chat").

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

## 6. Batasan Produk V1.83

Yang masuk V1.83:

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

Yang tidak masuk V1.83:

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
11. External chat integration.
12. Google Calendar integration.
13. AI Assistant.
14. AI Review.
15. Routine entity.
16. Checklist Routine entity.
17. Watcher.
18. Area Goal layer.
19. metric child table di bawah Area Goal.
20. Bobot planning card.

---

## 7. Keputusan UX Utama V1.83

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

### 7.5 Aturan Pecah Target Tidak Selalu Tampil

Aturan Pecah Target tetap ada sebagai rule backend, tetapi tidak harus selalu tampil sebagai panel besar.

Nama backend/admin dapat tetap memakai `Minimum Breakdown Rule`, tetapi UI harian lebih ramah memakai istilah `Aturan Pecah Target`.

Jika Aturan Pecah Target aktif dan user mencoba membuat turunan saat struktur minimum belum terpenuhi:

1. Tombol tambah tetap terlihat.
2. Saat diklik, sistem menampilkan popup arahan.
3. Popup menjelaskan jenis Card apa yang perlu dilengkapi dulu.
4. Angka minimum mengikuti setting admin, bukan angka hard-coded untuk semua perusahaan.

Contoh:

Lengkapi struktur minimum dulu sebelum membuat turunan berikutnya.

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

Card periode yang sudah lewat ditandai dengan badge teks "Periode lewat".

> Dim visual dicabut oleh owner decision 2026-07-03 (gagal kontras AA saat bersarang). Lihat §44 AC-9.

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

1. Card menampilkan badge teks "Periode lewat". (Dim visual dicabut 2026-07-03 — lihat §44 AC-9.)
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
2. Title: Target Perusahaan.
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
3. Title: Target Pendapatan 48 Miliar 2026.
4. Metadata: Juni aktif - Target bulan 4M - Aktual 3.1M - Risiko sedang.
5. Progress orb: Capaian 68%.
6. Actions: Detail, `...`, + Strategy.
7. Arrow: buka Strategy.

Card Strategy:

1. Label: Strategy.
2. Period badge: Juni 2026.
3. Title: Pertumbuhan Pelanggan.
4. Metadata: Aktual 620 / Target bulan 1.200 - Gap 580 - Butuh 1 Initiative.
5. Progress orb: 65%.
6. Actions: Detail, `...`, + Initiative.
7. Arrow: buka Initiative.

Card Initiative:

1. Label: Initiative.
2. Period badge: Q2 2026.
3. Title: Program Akuisisi Pelanggan Digital.
4. Metadata: Kontribusi 42% - Risiko: respon follow up lambat - Butuh 1 Action Plan.
5. Progress orb.
6. Actions: Detail, `...`, + Action Plan.
7. + Action Plan bisa dikunci Minimum Breakdown Rule.

Card Action Plan:

1. Label: Action Plan.
2. Period badge: Juni 2026.
3. Title: Campaign Penawaran Q2.
4. Metadata: Target 120 lead - PIC Rina - Review bukti tertunda.
5. Progress orb.
6. Actions: Detail, `...`, + Task.
7. Arrow: buka Task.

Card Task:

1. Label: Task.
2. Period badge: Hari ini atau tanggal.
3. Title: Siapkan materi campaign Q2.
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
2. Title: Follow up pekerjaan belum terpusat.
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

## 18. New Strategy

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
> migrasi 0032 + `lib/strategy-gap.ts` (rename dari `kpi-gap.ts` di F4) + layar Strategy form/detail + kartu Home "Gap Strategy". Keputusan ini tetap berlaku di V1.83.

Template behavior:

1. Klik Pakai Template membuka bottom sheet.
2. User memilih template custom yang dibuat admin, atau tetap lanjut isi manual.
3. Jika library kosong, tampil empty state dan user diarahkan memakai isi manual.
4. Jika admin sudah membuat template custom, user dapat memilih template.
5. Setelah template dipilih, Nama Strategy, PIC rekomendasi, Target awal, dan Ekspektasi Hasil terisi otomatis.
6. User tetap bisa mengedit semua field.

CTA:

1. Simpan Draft.
2. Aktifkan Card.

---

## 19. Strategy Template Library

Strategy Template kosong secara default.

Sistem tidak menyediakan template bawaan berbasis industri, divisi, atau jenis target tertentu.

Alasan:

1. EMS harus bisa dipakai lintas industri.
2. Perusahaan tidak dipaksa mengikuti struktur contoh tertentu.
3. Admin dapat membuat template sesuai bahasa dan cara kerja perusahaan.
4. User tetap bisa membuat Strategy manual tanpa template.

Empty state:

1. Judul: Belum ada Strategy Template.
2. Deskripsi: Admin dapat membuat template custom nanti. User tetap bisa membuat Strategy manual tanpa template.
3. CTA admin: Buat Strategy Template.
4. CTA user: Isi Manual.

Admin dapat membuat, mengedit, menonaktifkan, dan membuat versi template baru.

Update template tidak otomatis mengubah Strategy aktif.

---

## 20. New Initiative

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

## 21. New Action Plan

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

Evaluation digunakan saat Action Plan selesai.

Field:

1. Target tercapai atau tidak.
2. Hasil tercapai atau belum.
3. Faktor berhasil.
4. Faktor gagal.
5. Perlu jadi SOP atau tidak.
6. Perlu rollout atau tidak.

Evaluation default tidak muncul di awal. Ditampilkan saat Action Plan sudah mendekati selesai atau selesai.

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
5. Task penting hari ini.
6. Update terbaru yang relevan.

Card Fokus Hari Ini:

1. Menampilkan Task atau Repeat Task yang perlu perhatian.
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
6. Permission berubah jika relevan untuk user tersebut.
7. Aturan Pecah Target warning jika user sedang membuat turunan.
8. Warning governance hanya untuk admin/user berwenang.
9. Repeat due today.

Semantik yang ditetapkan (BL-07, keputusan owner 2026-07-22):

1. **Item 2 "Bukti dikirim" hanya berlaku saat review tidak diperlukan.** Saat review diperlukan, peristiwa yang sama sudah dilaporkan oleh item 1 ke reviewer; dua notifikasi untuk satu submit adalah duplikasi, bukan kelengkapan. Penerima item 2 adalah pembuat card.
2. **Item 4 "Deadline lewat" adalah jenis notifikasi, bukan status kartu.** Untuk Task one-time, "lewat" dihitung sebagai fakta turunan (`deadline` < hari ini pada zona waktu organisasi). Task one-time tidak memiliki status `missed`/`overdue`; hanya Task Instance (repeat) yang punya.
3. **Item 7 "Aturan Pecah Target warning" dipenuhi oleh gerbang MBR inline, bukan oleh Notifications.** Kondisinya sinkron — peringatan tampil di layar pada saat user menekan tombol turunan, lewat pemeriksaan kepatuhan Aturan Pecah Target. Tidak ada notifikasi persisten untuk item ini, dan tidak boleh ditambahkan: notifikasi akan tiba setelah user meninggalkan konteks yang menyebabkannya.

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
11. Attachment bubble — lampiran diskusi (gambar) di dalam message bubble. Bukan galeri, bukan feed, bukan tab file. Milestone V2. Lihat `specs/inbox-chat-attachments.md`.

Rule:

1. Chat selalu terikat Rencana Aksi (level 3 struktural — tabel `action_plans` pasca-rename).
2. Task dapat membuka chat dengan konteks reply.
3. Task tidak membuat chat terpisah.
4. **Bukti formal** — yang masuk riwayat versi, terkunci saat direview, dan dinilai Reviewer — tetap dikirim melalui Task. **Lampiran diskusi** di chat bersifat informal: tidak pernah menjadi Bukti, tidak masuk riwayat versi, tidak menjadi input Review, dan tidak berbobot dalam Score Formula. Batas ini ditegakkan struktural di database (bucket terpisah, tanpa FK ke evidence, whitelist `evidence_files.kind` utuh) — bukan hanya konvensi UI. Lihat `specs/inbox-chat-attachments.md` (amandemen owner 2026-07-15).

Catatan RWT-04 (default A): membership chat STABIL. Row `chat_rooms` yang sebelumnya
terikat `initiatives.id` (semantik lama = "program unit") sekarang terikat kolom
`action_plan_id` (identifier baru untuk entitas yang SAMA fisiknya). Tidak ada baris
di-migrate ke tabel lain. Label UI "Initiative Chat" berubah jadi "Diskusi Rencana Aksi"
murni cosmetic.

---

## 31. Menu

Tujuan:

Pintu masuk ke profil, People, bantuan, settings, archive, dan admin tools sesuai permission.

Komponen:

1. Header Menu.
2. Profile card.
3. Akses Cepat.
4. Bantuan accordion.
5. Pengaturan accordion.
6. Template accordion jika user punya akses template.
7. Admin Lanjutan accordion jika user punya akses admin.
8. Logout.

Akses Cepat:

1. People.
2. Archive.
3. Pusat Bantuan.

Template:

1. Goal Template.
2. Strategy Template.

Strategy Template kosong secara default (§19). Goal Template tetap berisi kategori dasar (Omset/Profit) — bukan daftar per-industri seperti Strategy Template lama, jadi tidak melanggar prinsip lintas-industri §19. Accordion Template hanya tampil jika user punya akses membuat/mengelola template.

Pengaturan:

1. Organisasi.
2. Repeat Setting.
3. Permission Settings jika user admin.

Admin Lanjutan:

1. Minimum Breakdown Rule / Aturan Pecah Target.
2. Score Formula.
3. Governance.
4. Confidential.
5. Override Score.
6. Log Aktivitas.

UX:

1. Icon harus berada di tengah frame.
2. Judul kategori harus seragam ukuran text.
3. Item admin hanya tampil jika permission mengizinkan.
4. Staff biasa tidak melihat Score Formula, Governance, Override Score, atau Log Aktivitas sistem sebagai shortcut utama.

---

## 32. People

Tujuan:

Melihat daftar People, urutan kontribusi, dan profil user secara objektif.

People bukan tempat mempermalukan orang dan bukan dashboard score yang agresif.

Komponen:

1. Header People.
2. Search People.
3. Filter ringan: Semua, Bulan ini, Tim Saya, Admin jika berwenang.
4. People list dengan nomor urut kontribusi.
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
5. Ringkasan kontribusi singkat.
6. Status ringan jika diperlukan.
7. Tombol Lihat Profil.

People row tidak menampilkan Trust, Achievement, score formula, governance status, atau angka teknis yang membuat user merasa dinilai berlebihan.

---

## 33. People Profile

Tujuan:

Melihat profil kontribusi dan keterlibatan user.

Komponen:

1. Profile header.
2. Nama.
3. Jabatan dan tanggal bergabung.
4. Ranking ringan.
5. Detail People.
6. Tugas sebagai accordion.
7. Kontribusi bulan ini.
8. Rincian kontribusi.
9. Score detail hanya jika user punya permission admin/management.

Header tidak menampilkan terlalu banyak angka dan tidak memakai label Trust/Achievement sebagai elemen utama.

Tugas accordion berisi keterlibatan user di:

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

Mengatur rumus score sebagai fitur admin lanjutan.

Score Formula tidak tampil di UI utama staff.

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

### 34.4 Minimum Breakdown Rule / Aturan Pecah Target

Mengatur batas minimum Card turunan agar target tidak berhenti sebagai rencana besar tanpa aksi.

Prinsip:

1. Rule ini bersifat opsional per organization/workspace.
2. Angka minimum dapat dikonfigurasi admin.
3. UI user harian memakai istilah `Aturan Pecah Target`.
4. Backend tetap boleh memakai istilah `Minimum Breakdown Rule`.
5. Jika rule nonaktif, tombol buat turunan mengikuti permission biasa.

Contoh konfigurasi Performance:

1. Strategy membutuhkan sejumlah Initiative sebelum + Action Plan aktif.
2. Initiative membutuhkan sejumlah Action Plan sebelum + Task aktif.
3. Action Plan dapat mensyaratkan sejumlah Task agar dianggap lengkap.

Contoh konfigurasi Development:

1. Development Area dapat mensyaratkan Problem Statement / Development Goal.
2. Problem Statement dapat mensyaratkan Action Plan.
3. Action Plan dapat mensyaratkan Task.

Mode yang didukung:

1. Nonaktif.
2. Peringatan saja.
3. Blokir Tombol Turunan.

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

Hanya untuk user berwenang dan tidak tampil di UI default.

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
`'task'` = unit eksekusi, `'task_instance'`). Kebijakan ini tetap berlaku di V1.83.

Default:

1. Di detail Card tampil sebagai accordion tertutup jika relevan.
2. Di Menu hanya tampil untuk admin/user berwenang.
3. Staff tidak melihat Log Aktivitas sebagai shortcut utama.

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

Governance Violation muncul saat rule penting dilanggar, tetapi UI default staff cukup menerima arahan singkat melalui popup/Notifications.

Contoh:

1. Reviewer sama dengan PIC.
2. User mencoba membuat turunan saat Aturan Pecah Target aktif dan struktur minimum belum terpenuhi.
3. User mencoba aktifkan Card dengan field wajib kosong.
4. User melewati deadline Task Repeat.
5. User mencoba akses confidential tanpa izin.
6. User mengubah target tanpa alasan.

UI admin:

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

Belum ada Task untuk periode ini. Buat Task setelah Action Plan aktif.

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

## 42. Screen List V1.83

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
34. Score Formula Settings (admin/advanced).
35. Permission Settings (admin).
36. Repeat Rule Settings.
37. Goal Template Library.
38. Strategy Template Library.
39. Organization Settings.
40. Minimum Breakdown Rule Settings (admin/advanced).
41. Activity Log (admin/permission-based).
42. Governance Violation (admin/permission-based).
43. Archive.
44. Global Search.
45. Confidential Access (admin/permission-based).
46. Manual Score Override (admin/advanced).

Screen People Ranking terpisah tidak dibuat di UI default. Urutan kontribusi cukup berada di People, bukan bottom nav dan bukan shortcut utama.

---

## 43. Seed Data Prototype

Brand:

1. Rencanapp.
2. Rencanakan. Jalankan. Tuntaskan.

User utama:

1. Rina Jaya.
2. Initial: RJ.
3. Role: Staff.
4. Urutan kontribusi: 1.
5. Status: Stabil.

Performance example:

1. Goal: Target Pendapatan 48 Miliar 2026.
2. Strategy: Pertumbuhan Pelanggan.
3. Strategy: Peningkatan Nilai Transaksi.
4. Strategy: Peningkatan Kapasitas Output.
5. Initiative: Program Akuisisi Pelanggan Digital.
6. Action Plan: Campaign Penawaran Q2.
7. Task: Siapkan materi campaign Q2.

Development example:

1. Development Area: Pembangunan Sistem.
2. Problem Statement: Follow up pekerjaan belum terpusat.
3. Action Plan: Bangun alur review terpusat.
4. Task: Finalisasi flow review mobile.

Inbox example:

1. Campaign Penawaran Q2.
2. Pindahkan Review ke sistem kerja.
3. Optimasi Alur Konversi.
4. Standarisasi Proses Review.

People example:

1. Rina Jaya - Urutan kontribusi 1 - Stabil.
2. Arman Malik - Urutan kontribusi 2 - Stabil.
3. Maya Sari - Urutan kontribusi 3 - Perlu dukungan.
4. Dika Saputra - Urutan kontribusi 4 - Stabil.

---

## 44. Acceptance Criteria

Frontend dianggap sesuai V1.83 jika:

1. Mobile-first dan nyaman di viewport 390 px.
2. Bottom nav final: Home, Notif, Workspace, Inbox, Menu.
3. Header global Rencanapp konsisten.
4. Menu default berisi People, Archive, Pusat Bantuan, dan akses settings/admin sesuai permission.
5. Workspace memakai card tree dengan Detail dan panah terpisah.
6. Performance dan Development punya pola UI yang sama.
7. Periode aktif default bulan berjalan.
8. User dapat memilih Bulan atau Quarter.
9. Card periode lewat tampil redup dan tidak bisa dibuat turunan baru. — **Bagian "tampil redup" DICABUT (owner decision 2026-07-03).** Kartu periode-lewat tidak lagi didim di layer manapun; sinyal periode-lewat adalah badge teks "Periode lewat". Alasan: dim `opacity-50` bersarang jatuh ke 0.125 di level-3 dan gagal kontras AA (DESIGN §4) — lihat [[ui-prototype-gap]] UI-S-W08. Bacaan ini yang berlaku, mengalahkan §7.7 dan §11.3; §37 ("boleh diberi visual redup") konsisten dengannya. Larangan membuat turunan baru TETAP mengikat.
10. Goal bersifat tahunan.
11. Strategy mengikuti Goal tahunan.
12. Strategy punya pecahan target Quarter dan Bulan total 100%.
13. New Strategy default manual, template sebagai solusi cepat via popup.
14. Kelengkapan Card tidak memenuhi layar, tetapi divalidasi saat Aktifkan Card.
15. Minimum Breakdown Rule / Aturan Pecah Target mengunci tombol turunan dengan popup jika rule aktif.
16. Task mendukung One Time dan Repeat.
17. Repeat menghasilkan Task Instance.
18. Bukti memakai versioning.
19. Nilai Hasil masuk Strategy setelah review.
20. Diskusi Rencana Aksi hanya untuk Rencana Aksi (Action Plan).
21. Task dapat membuka chat dengan konteks reply.
22. Notifications bukan chat.
23. Inbox bukan action queue.
24. People menampilkan urutan kontribusi ringan tanpa mempermalukan user.
25. Admin settings mengikuti permission.
26. Activity Log tidak menjadi shortcut default staff dan hanya tampil sesuai permission.
27. Search dan Archive mengikuti permission.
28. Tidak ada Feed, Company News, Announcement, Routine, Checklist Routine, Watcher, Area Goal.

---

## 45. Final Product Statement

Rencanapp V1.83 adalah mobile-first execution governance app yang membantu perusahaan menjalankan target tahunan menjadi eksekusi bulanan, quarter, dan harian tanpa membuat user bingung.

User staff melihat pekerjaan yang perlu dilakukan.

Manager melihat struktur eksekusi dan blocker.

C-Level melihat target, gap, risiko, dan progres.

Admin mengatur sistem, permission, template, dan governance.

UI harus familiar seperti aplikasi mobile modern, tetapi tetap fokus pada kerja, bukan social media.
