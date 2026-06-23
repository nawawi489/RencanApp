# PRD FINAL V1.8.1 — EMS: Execution Management System

## 1. Product Overview

EMS adalah Execution Management System untuk membantu perusahaan mengubah arah besar perusahaan menjadi eksekusi nyata yang bisa dipantau, direview, dan dipertanggungjawabkan.

EMS bukan aplikasi task management biasa.

EMS bukan aplikasi chat.

EMS bukan social media.

EMS bukan aplikasi perhitungan KPI formal.

EMS adalah sistem eksekusi perusahaan berbasis card yang menghubungkan:

Goal
→ KPI Area
→ Strategy
→ Initiative
→ Action Plan.

Untuk Development:

Development Area
→ Problem Statement / Development Goal
→ Initiative
→ Action Plan.

EMS memastikan pekerjaan perusahaan tidak berjalan liar, tidak lepas dari konteks, dan tidak bergantung pada ingatan owner/manager.

Prinsip utama EMS:

Perusahaan tidak membayar kesibukan.
Perusahaan membayar eksekusi yang punya arah, bukti, review, dan hasil.

---

## 2. Tujuan Produk

Tujuan EMS V1.8.1:

1. Mengubah target besar perusahaan menjadi struktur eksekusi yang jelas.
2. Membuat setiap pekerjaan memiliki konteks dari card induknya.
3. Mengganti follow up manual di WhatsApp menjadi sistem kerja yang terstruktur.
4. Memastikan setiap card memiliki PIC, Reviewer, deadline, output yang diharapkan, dan bukti kerja sesuai kebutuhan.
5. Memastikan Strategy tidak dibuat asal, tetapi memiliki alasan, risiko, dan alternatif.
6. Membuat Action Plan bisa sekali selesai atau berulang seperti alarm.
7. Membuat semua pekerjaan bisa dipantau dari Home, Workspace, Notifications, Inbox, dan People.
8. Membuat user hanya fokus pada card yang menjadi tanggung jawabnya.
9. Membuat PIC card induk otomatis bisa melihat seluruh card turunannya.
10. Membuat permission tetap sederhana dan tidak terlalu granular.
11. Membuat performa user bisa dihitung dari data eksekusi, bukan perasaan.
12. Membuat organisasi bisa tumbuh tanpa owner harus mengingat semua detail pekerjaan.
13. Mengedukasi user langsung di dalam aplikasi agar paham arti setiap card.
14. Mengurangi kesalahan user dalam membuat Goal, KPI Area, Strategy, Initiative, dan Action Plan.

---

## 3. Batasan Produk V1.8.1

Yang masuk V1.8.1:

1. Auth.
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
12. KPI Area Template Library.
13. Goal Card.
14. KPI Area Card.
15. Strategy Card.
16. Initiative Card.
17. Action Plan Card.
18. Action Plan One Time.
19. Action Plan Repeat.
20. Action Plan Instance.
21. Kelengkapan Card.
22. Keterangan Card.
23. Minimum Breakdown Rule.
24. Kelengkapan Perencanaan.
25. Bukti.
26. Nilai Hasil.
27. Review.
28. Activity Log.
29. Governance Violation.
30. Notifications.
31. Inbox Initiative Chat.
32. People.
33. Score Formula.
34. Repeat Compliance.
35. Basic ranking.
36. Settings.

Yang tidak masuk V1.8.1:

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
15. Routine entity.
16. Checklist Routine entity.
17. Watcher.
18. Area Goal layer.
19. KPI child table di bawah Area Goal.
20. Bobot planning card.

---

## 4. Bahasa Sistem

Bahasa utama EMS adalah Bahasa Indonesia.

Namun istilah tertentu tetap dipakai dalam Bahasa Inggris karena menjadi istilah kerja utama di sistem.

Istilah yang tetap dipakai:

1. Goal.
2. KPI Area.
3. Strategy.
4. Initiative.
5. Action Plan.
6. Card.
7. Workspace.
8. Notifications.
9. Inbox.
10. People.
11. PIC.
12. Reviewer.
13. Minimum Breakdown Rule.
14. Score Formula.

Semua label, tombol, validasi, pesan error, dan popup default menggunakan Bahasa Indonesia.

Contoh benar:

1. Kelengkapan Card.
2. Keterangan Card.
3. Kelengkapan Perencanaan.
4. Tidak Dapat Melanjutkan.
5. Belum Lengkap.
6. Lengkap.
7. Aktifkan Card.
8. Bukti.
9. Nilai Hasil.
10. Alasan Strategy.
11. Risiko Utama.
12. Alternatif Strategy.
13. Output yang Diharapkan.
14. Definition of Done.

Istilah yang harus dihindari di UI utama:

1. Parent.
2. Child.
3. Planning Completeness.
4. Publish.
5. Posting.
6. Incomplete.
7. Complete.
8. Validation Error.

Catatan:

Istilah teknis seperti parent_id boleh dipakai di database/kode, tetapi tidak ditampilkan ke user bisnis.

---

## 5. Status Utama Card

Status utama card:

1. Draft.
2. Aktif.
3. Selesai.
4. Diarsipkan.

Status tambahan untuk Action Plan:

1. Assigned.
2. In Progress.
3. Menunggu Review.
4. Revisi Diperlukan.
5. Terlewat.
6. Dibatalkan.

Istilah “publish” tidak dipakai di UI.

Card bukan diposting.

Card diaktifkan.

---

## 6. Struktur Utama Performance Workspace

Performance Workspace digunakan untuk target bisnis dan hasil perusahaan.

Struktur:

Goal
→ KPI Area
→ Strategy
→ Initiative
→ Action Plan.

Penjelasan:

Goal adalah arah besar.

KPI Area adalah area target atau area hasil yang ingin dicapai.

Strategy adalah cara utama untuk mengejar KPI Area.

Initiative adalah program eksekusi dari Strategy.

Action Plan adalah pekerjaan konkret yang dieksekusi.

Tidak ada Area Goal.

Tidak ada KPI child table di bawah Area Goal.

KPI Area langsung berada di bawah Goal.

---

## 7. Struktur Utama Development Workspace

Development Workspace digunakan untuk membangun mesin perusahaan.

Struktur:

Development Area
→ Problem Statement / Development Goal
→ Initiative
→ Action Plan.

Development Workspace digunakan untuk:

1. System Development.
2. People Development.
3. Organization Development.
4. Technology Development.
5. Infrastructure Development.
6. Brand Development.
7. Governance Development.

Development tidak wajib mengikuti pola KPI Area karena development berbasis problem, perbaikan, sistem, SOP, teknologi, organisasi, dan people.

---

## 8. Prinsip Card

Semua unit kerja utama EMS dibuat dalam bentuk card.

Contoh:

1. Goal Card.
2. KPI Area Card.
3. Strategy Card.
4. Initiative Card.
5. Action Plan Card.
6. Development Area Card.
7. Problem Statement Card.

Istilah card tetap digunakan.

Card menjadi unit visual utama di UI.

Setiap card dapat memiliki:

1. Nama.
2. Keterangan Card.
3. PIC.
4. Reviewer jika dibutuhkan.
5. Periode.
6. Deadline jika dibutuhkan.
7. Status.
8. Kelengkapan Card.
9. Kelengkapan Perencanaan jika memiliki turunan.
10. Bukti jika dibutuhkan.
11. Nilai Hasil jika dibutuhkan.
12. Komentar.
13. Activity Log.
14. Card turunan.

---

## 9. Keterangan Card

Keterangan Card adalah edukasi singkat yang menjelaskan makna setiap jenis card.

Tujuan Keterangan Card:

1. Membantu user memahami perbedaan Goal, KPI Area, Strategy, Initiative, dan Action Plan.
2. Mengurangi kesalahan user saat membuat card.
3. Membuat EMS menjadi alat kerja sekaligus alat edukasi manajemen.
4. Membantu user awam memahami struktur project management profesional.
5. Mencegah semua hal ditulis sebagai Action Plan.

Keterangan Card wajib tampil di:

1. Form buat card baru.
2. Halaman detail card.
3. Popup saat user klik icon bantuan.
4. Empty state saat belum ada card.
5. Onboarding user baru.

Keterangan Card harus pendek, praktis, dan mudah dipahami.

---

## 10. Keterangan Goal Card

Goal menjawab:

Apa yang ingin dicapai?

Definisi:

Goal adalah tujuan utama yang ingin diraih dalam suatu periode.

Contoh:

1. Meningkatkan Omset Penjualan.
2. Meningkatkan Profit.
3. Membuka 10 Outlet Baru.
4. Meningkatkan Kualitas Operasional.

Contoh tampilan UI:

Goal
Apa yang ingin dicapai?

Goal adalah tujuan utama yang ingin diraih dalam suatu periode.

Contoh:

Meningkatkan Omset Penjualan.
Meningkatkan Profit.
Membuka 10 Outlet Baru.

---

## 11. Keterangan KPI Area Card

KPI Area menjawab:

Area hasil apa yang harus bergerak?

Definisi:

KPI Area adalah area hasil yang harus meningkat atau berubah agar Goal tercapai.

Contoh:

1. Menambah Jumlah Customer.
2. Meningkatkan Basket Size.
3. Menurunkan OPEX.
4. Meningkatkan Kompetensi Karyawan.
5. Menambah Jumlah Cabang Baru.

Contoh tampilan UI:

KPI Area
Area hasil apa yang harus bergerak?

KPI Area adalah area hasil yang harus meningkat atau berubah agar Goal tercapai.

Contoh:

Menambah Jumlah Customer.
Meningkatkan Basket Size.
Menurunkan OPEX.

---

## 12. Keterangan Strategy Card

Strategy menjawab:

Bagaimana cara mencapai hasil tersebut?

Definisi:

Strategy adalah pendekatan utama yang dipilih untuk mencapai KPI Area.

Strategy harus memiliki alasan, risiko, dan alternatif agar tidak dibuat berdasarkan feeling.

Contoh:

1. Scale Meta Ads WA Order.
2. Meningkatkan Repeat Order Customer.
3. Ekspansi Area Sulawesi Selatan.
4. Referral Program.
5. Partnership Komunitas.

Contoh tampilan UI:

Strategy
Bagaimana cara mencapai hasil tersebut?

Strategy adalah pendekatan utama yang dipilih untuk mencapai KPI Area.

Sebelum membuat Strategy, pastikan Anda bisa menjawab:

1. Kenapa Strategy ini dipilih?
2. Apa risikonya?
3. Apa alternatifnya jika Strategy ini gagal?

---

## 13. Keterangan Initiative Card

Initiative menjawab:

Program atau proyek apa yang akan dijalankan?

Definisi:

Initiative adalah program atau proyek yang dieksekusi untuk menjalankan Strategy.

Contoh:

1. Campaign Paket Hemat Januari.
2. Program Referral Customer.
3. Pembukaan Outlet Sidrap.
4. Daily Finance Control.
5. Build EMS V1.8.

Contoh tampilan UI:

Initiative
Program atau proyek apa yang akan dijalankan?

Initiative adalah program atau proyek yang dieksekusi untuk menjalankan Strategy.

Contoh:

Campaign Paket Hemat Januari.
Pembukaan Outlet Sidrap.
Build EMS V1.8.

---

## 14. Keterangan Action Plan Card

Action Plan menjawab:

Aktivitas konkret siapa melakukan apa dan kapan?

Definisi:

Action Plan adalah pekerjaan konkret yang harus diselesaikan oleh PIC tertentu dengan deadline yang jelas.

Action Plan bisa sekali selesai atau berulang.

Contoh:

1. Buat 20 Konten Iklan.
2. Survey 5 Lokasi Potensial.
3. Training Tim Outlet Baru.
4. Daily Finance Closing.
5. Weekly Stock Audit.

Contoh tampilan UI:

Action Plan
Aktivitas konkret siapa melakukan apa dan kapan?

Action Plan adalah pekerjaan konkret yang harus diselesaikan oleh PIC tertentu dengan deadline yang jelas.

Contoh:

Buat 20 Konten Iklan.
Survey 5 Lokasi Potensial.
Daily Finance Closing.

---

## 15. Keterangan Development Area Card

Development Area menjawab:

Area pengembangan apa yang sedang dibangun?

Definisi:

Development Area adalah area pembangunan mesin perusahaan, sistem, organisasi, SDM, teknologi, brand, atau governance.

Contoh:

1. System Development.
2. People Development.
3. Organization Development.
4. Technology Development.
5. Brand Development.
6. Governance Development.

Contoh tampilan UI:

Development Area
Area pengembangan apa yang sedang dibangun?

Development Area adalah area pembangunan mesin perusahaan agar perusahaan lebih kuat dan tidak bergantung pada owner.

---

## 16. Keterangan Problem Statement / Development Goal Card

Problem Statement menjawab:

Masalah apa yang ingin diselesaikan?

Development Goal menjawab:

Perbaikan apa yang ingin dicapai?

Definisi:

Problem Statement / Development Goal adalah masalah atau target perbaikan yang menjadi dasar pembuatan Initiative Development.

Contoh:

1. Perusahaan belum punya sistem follow up selain WhatsApp.
2. SOP finance belum konsisten.
3. Training outlet belum standar.
4. Struktur organisasi belum jelas.
5. Data pekerjaan belum bisa ditrack.

Contoh tampilan UI:

Problem Statement / Development Goal
Masalah apa yang ingin diselesaikan?

Tuliskan masalah atau target perbaikan yang menjadi alasan dibuatnya Initiative Development.

---

## 17. Popup Bantuan Card

Setiap tombol tambah card harus memiliki akses bantuan singkat.

Contoh saat user klik + Strategy:

Popup:

Apa itu Strategy?

Strategy adalah cara utama untuk mencapai KPI Area.

Tanyakan pada diri Anda:

Bagaimana cara mencapai hasil tersebut?

Sebelum lanjut, pastikan Strategy memiliki:

1. Alasan.
2. Risiko.
3. Alternatif.

Tombol:

1. Buat Strategy.
2. Tutup.

Contoh saat user klik + Initiative:

Popup:

Apa itu Initiative?

Initiative adalah program atau proyek yang dijalankan untuk mengeksekusi Strategy.

Tanyakan pada diri Anda:

Program apa yang harus dijalankan agar Strategy ini bergerak?

Tombol:

1. Buat Initiative.
2. Tutup.

---

## 18. Prinsip Card Turunan

Card turunan selalu dibuat dari dalam card induknya.

Contoh:

1. KPI Area dibuat dari dalam Goal Card.
2. Strategy dibuat dari dalam KPI Area Card.
3. Initiative dibuat dari dalam Strategy Card.
4. Action Plan dibuat dari dalam Initiative Card.
5. Problem Statement dibuat dari dalam Development Area Card.
6. Development Initiative dibuat dari dalam Problem Statement / Development Goal Card.

User tidak memilih card induk secara manual dari dropdown utama.

Karena card turunan dibuat dari dalam card induknya, sistem otomatis mengetahui hubungan strukturnya.

Maka “card induk” tidak perlu menjadi syarat manual di Kelengkapan Card.

---

## 19. Kelengkapan Card

Kelengkapan Card adalah validasi data wajib sebelum card dapat diaktifkan.

Jika Kelengkapan Card belum lengkap, card tetap Draft.

Tombol Aktifkan Card tidak aktif atau menampilkan pesan validasi.

Contoh tampilan:

Kelengkapan Card

Nama Action Plan: Lengkap
PIC: Lengkap
Reviewer: Belum Lengkap
Deadline: Lengkap
Output yang Diharapkan: Belum Lengkap
Definition of Done: Belum Lengkap

Status: Belum Lengkap

Pesan:

Lengkapi seluruh data wajib sebelum card dapat diaktifkan.

---

## 20. Goal Card

Goal Card adalah card arah besar perusahaan.

Syarat aktif Goal Card:

1. Nama Goal.
2. Periode.
3. PIC/Owner Goal.
4. Minimal memiliki KPI Area sesuai rule yang berlaku.

Goal wajib memiliki:

1. Tanggal Mulai.
2. Tanggal Selesai.

Goal tidak harus selalu tahunan.

Goal bisa memiliki periode sesuai kebutuhan.

Contoh:

Goal: Meningkatkan Omset Penjualan.
Tanggal Mulai: 01 Januari 2027.
Tanggal Selesai: 31 Desember 2027.

Contoh lain:

Goal: Membuka Outlet Sidrap.
Tanggal Mulai: 01 Juli 2027.
Tanggal Selesai: 30 September 2027.

Goal tidak memiliki bobot planning.

Goal tidak memiliki metode perhitungan formal di V1.8.1.

Goal dibuat oleh user yang memiliki permission membuat Goal.

Default:

CEO / Super Admin.

---

## 21. KPI Area Card

KPI Area Card adalah area target atau area hasil di bawah Goal.

KPI Area bukan mesin hitung KPI formal.

KPI Area digunakan untuk mengarahkan Strategy dan eksekusi.

Syarat aktif KPI Area Card:

1. Nama KPI Area.
2. PIC/Owner KPI Area.
3. Periode.
4. Target.

KPI Area wajib memiliki:

1. Tanggal Mulai.
2. Tanggal Selesai.

KPI Area tidak wajib memiliki:

1. Bobot.
2. Satuan.
3. Metode perhitungan.

Catatan:

Target tetap wajib agar KPI Area tidak menjadi kalimat kosong.

Namun satuan dan metode perhitungan tidak wajib menjadi input card karena EMS V1.8.1 bukan software KPI formal.

Jika nanti dibutuhkan, metadata target bisa dikembangkan tanpa mengubah struktur utama.

---

## 22. Strategy Card

Strategy Card adalah card berpikir utama sebelum eksekusi.

Strategy Card tidak boleh dangkal.

Strategy adalah alasan mengapa perusahaan memilih cara tertentu untuk mengejar KPI Area.

Syarat aktif Strategy Card:

1. Nama Strategy.
2. Alasan Strategy.
3. Risiko Utama.
4. Alternatif Strategy.
5. Periode.
6. PIC Strategy otomatis dari PIC KPI Area, kecuali didelegasikan.

Strategy wajib memiliki:

1. Tanggal Mulai.
2. Tanggal Selesai.

Strategy tidak memiliki bobot planning.

Strategy tidak wajib memiliki metode perhitungan.

Contoh:

Nama Strategy:

Scale Meta Ads WA Order.

Alasan Strategy:

Meta Ads saat ini menjadi channel paling cepat menghasilkan leads dan order.

Risiko Utama:

Biaya iklan naik, creative fatigue, closing WA turun.

Alternatif Strategy:

Referral customer, partnership komunitas, organic content, database repeat customer.

Periode:

01 Januari 2027 - 31 Maret 2027.

---

## 23. Initiative Card

Initiative Card adalah program eksekusi dari Strategy.

Syarat aktif Initiative Card:

1. Nama Initiative.
2. Periode.
3. Target Hasil.
4. PIC Initiative otomatis dari PIC Strategy, kecuali didelegasikan.

Initiative wajib memiliki:

1. Tanggal Mulai.
2. Tanggal Selesai.

Initiative tidak memiliki bobot planning.

Contoh:

Strategy:

Scale Meta Ads WA Order.

Initiative:

Campaign Paket Hemat Pizza Nyantuy.

Target Hasil:

Meningkatkan order paket hemat dan menambah customer baru selama periode campaign.

Periode:

01 Januari 2027 - 31 Januari 2027.

---

## 24. Action Plan Card

Action Plan Card adalah unit eksekusi konkret.

Action Plan selalu berada di bawah Initiative.

Action Plan bisa:

1. One Time.
2. Repeat.

Syarat aktif Action Plan Card:

1. Nama Action Plan.
2. PIC.
3. Reviewer.
4. Tanggal Mulai.
5. Deadline.
6. Output yang Diharapkan.
7. Definition of Done.
8. Prioritas.
9. Repeat Setting:

   * One Time.
   * Repeat.

Jika Action Plan Repeat, tambahan wajib:

1. Repeat Frequency.
2. Tanggal Mulai Repeat.
3. Tanggal Akhir Repeat.
4. Jam Deadline.
5. Aturan Terlewat.

Jika bukti diwajibkan:

Bukti wajib dikirim sebelum submit.

Jika Nilai Hasil diwajibkan:

Nilai Hasil wajib diisi sebelum submit.

Action Plan tidak memiliki bobot planning.

---

## 25. Action Plan One Time

Action Plan One Time adalah pekerjaan sekali selesai.

Contoh:

1. Buat SOP Closing Harian.
2. Buat dashboard finance.
3. Training staff finance.
4. Audit outlet Parepare.
5. Buat campaign creative.
6. Finalisasi database EMS.
7. Buat PRD final.

Flow:

Assigned
→ In Progress
→ Submit Bukti / Nilai Hasil
→ Menunggu Review
→ Selesai atau Revisi Diperlukan.

---

## 26. Action Plan Repeat

Action Plan Repeat adalah pekerjaan berulang.

Repeat bukan entity terpisah.

Repeat hanya setting di Action Plan, seperti aplikasi alarm.

Contoh:

1. Daily Finance Closing.
2. Daily Marketing Report.
3. Weekly Stock Audit.
4. Monthly Payroll Check.
5. Daily Testing EMS.
6. Weekly Bug Review.

Saat Repeat aktif, sistem membuat Action Plan Instance.

---

## 27. Repeat Setting

Saat membuat Action Plan, user memilih Repeat Setting:

1. One Time.
2. Repeat.

Default:

One Time.

Jika memilih Repeat, muncul field:

1. Repeat Frequency.
2. Tanggal Mulai.
3. Tanggal Akhir.
4. Jam Deadline.
5. Aturan Terlewat.
6. Grace Period jika dipilih.
7. Custom date jika frequency custom.

Repeat Frequency:

1. Daily.
2. Weekly.
3. Monthly.
4. Custom.

---

## 28. Action Plan Instance

Action Plan Instance adalah pekerjaan yang dihasilkan dari Action Plan Repeat.

Contoh:

Action Plan:

Daily Finance Closing.

Repeat:

Daily.

Periode:

1–30 Juni.

Sistem membuat 30 Action Plan Instance.

Setiap instance punya:

1. Tanggal.
2. Jam Deadline.
3. PIC.
4. Reviewer.
5. Status.
6. Bukti.
7. Nilai Hasil jika diwajibkan.
8. Waktu submit.
9. Review result.
10. Waktu review.

---

## 29. Aturan Terlewat

Untuk Action Plan Repeat, sistem mendukung Aturan Terlewat.

Mode:

1. Strict.
2. Grace Period.
3. Overdue Allowed.

### 29.1 Strict

Jika lewat jam deadline dan belum submit, instance langsung Terlewat.

Contoh:

Daily Finance Closing deadline 23:00.

Jam 23:01 belum submit.

Status:

Terlewat.

### 29.2 Grace Period

Sistem memberi toleransi waktu.

Contoh:

Deadline 23:00.

Grace period 30 menit.

Lewat 23:30 baru Terlewat.

### 29.3 Overdue Allowed

User masih boleh submit terlambat, tetapi status keterlambatan tetap tercatat dan memengaruhi discipline/score jika score aktif.

Default untuk daily control:

Strict.

---

## 30. Bukti

Bukti digunakan untuk membuktikan pekerjaan dilakukan.

Jenis bukti:

1. File.
2. Foto.
3. Screenshot.
4. PDF.
5. Link Google Drive.
6. Link dokumen.
7. Catatan teks.
8. Rekap laporan.

Jika bukti diwajibkan, Action Plan tidak bisa submit tanpa bukti.

Bukti yang sudah disubmit tidak boleh dihapus atau diubah oleh PIC.

Jika revisi diperlukan, PIC mengirim versi baru.

---

## 31. Nilai Hasil

Nilai Hasil digunakan untuk melaporkan output terukur dari pekerjaan.

Contoh:

Daily Finance Closing:

Nilai Hasil:

Selisih kas hari ini = Rp0.

Daily Marketing Report:

Nilai Hasil:

Leads = 120.
Closing = 18.
Omset campaign = Rp4.500.000.

Daily Complaint Check:

Nilai Hasil:

Jumlah komplain = 2.

Nilai Hasil bisa berupa:

1. Number.
2. Currency.
3. Percentage.
4. Boolean.
5. Text.
6. Option.
7. Link.

---

## 32. Bukti vs Nilai Hasil

Bukti menjawab:

Apakah pekerjaan dilakukan?

Nilai Hasil menjawab:

Apa hasil pekerjaan tersebut?

Contoh:

Action Plan:

Daily Finance Closing.

Bukti:

File closing harian.

Nilai Hasil:

Selisih kas = Rp0.

Checklist bukan fokus utama V1.8.1.

Yang penting adalah bukti, Nilai Hasil, submit, dan review.

---

## 33. Review

Review adalah proses validasi hasil kerja.

Action Plan wajib memiliki Reviewer.

Reviewer bisa approve atau reject.

Jika review diwajibkan:

Action Plan tidak bisa Selesai tanpa approval Reviewer.

PIC tidak boleh approve pekerjaannya sendiri.

Reject wajib memiliki alasan.

Jika reject:

Status menjadi Revisi Diperlukan.

PIC harus submit ulang versi baru.

---

## 34. Submission Versioning

Setiap submit menghasilkan submission version.

Submission lama tidak hilang.

Jika ditolak, submission lama tetap tersimpan.

Jika revisi dikirim, sistem membuat versi baru.

Fields minimal:

1. Submitted by.
2. Submitted at.
3. Submission note.
4. Bukti.
5. Nilai Hasil jika ada.
6. Version number.
7. Review status.
8. Review reason.
9. Reviewed by.
10. Reviewed at.

---

## 35. Evidence Locking

Bukti yang sudah disubmit terkunci.

PIC tidak bisa menghapus bukti lama.

PIC tidak bisa mengganti bukti lama secara diam-diam.

Jika ada revisi, sistem membuat bukti versi baru.

Reviewer bisa melihat semua versi bukti.

---

## 36. Progress

Progress menunjukkan pekerjaan berjalan sejauh apa.

Progress bukan Capaian.

Progress untuk Action Plan One Time mengikuti status.

Contoh:

Draft = 0.
In Progress = berjalan.
Menunggu Review = hampir selesai.
Selesai = 100%.

Progress untuk Action Plan Repeat dihitung dari instance.

Contoh:

Daily Finance Closing 30 hari.

15 instance selesai.

Progress:

15 / 30.

---

## 37. Capaian

Capaian menunjukkan apakah hasil yang diharapkan tercapai.

Contoh:

Action Plan selesai, tetapi Nilai Hasil buruk.

Daily Finance Closing selesai dikirim, tetapi selisih kas Rp500.000.

Maka:

Progress selesai.

Capaian belum sesuai.

EMS wajib membedakan:

Progress = pekerjaan berjalan.
Capaian = hasil tercapai.

---

## 38. Repeat Compliance

Repeat Compliance mengukur kedisiplinan user menyelesaikan Action Plan Repeat.

Formula default:

Instance selesai tepat waktu ÷ total instance yang seharusnya dikerjakan.

Contoh:

Expected instance: 30.
Selesai tepat waktu: 28.
Terlewat: 2.

Repeat Compliance:

28 / 30.

Repeat Compliance digunakan di People dan Score Formula.

Repeat Compliance bukan bobot planning card.

---

## 39. Minimum Breakdown Rule

Minimum Breakdown Rule adalah aturan jumlah minimal card turunan sebelum user bisa melanjutkan proses tertentu.

Fitur ini ada di Settings.

Default Performance Workspace:

1. KPI Area → Strategy = minimal 3.
2. Strategy → Initiative = minimal 3.
3. Initiative → Action Plan = minimal 3.

Default Development Workspace:

1. Development Area → Problem Statement / Development Goal = minimal 1.
2. Problem Statement / Development Goal → Initiative = minimal 1.
3. Initiative → Action Plan = minimal 3.

---

## 40. Mode Minimum Breakdown Rule

Mode Penerapan:

1. Hanya Peringatan.
2. Blokir Aktivasi.
3. Blokir Akses Turunan Berikutnya.

### 40.1 Hanya Peringatan

User tetap bisa lanjut, tetapi sistem menampilkan peringatan.

### 40.2 Blokir Aktivasi

User boleh membuat Draft, tetapi card tidak bisa Aktif sebelum minimum terpenuhi.

### 40.3 Blokir Akses Turunan Berikutnya

User tidak bisa membuat card turunan berikutnya sebelum minimum terpenuhi.

Contoh:

KPI Area baru memiliki 2 dari 3 Strategy.

Sistem menolak akses membuat Initiative.

Pesan:

Tambahkan 1 Strategy lagi agar akses ke Initiative terbuka.

---

## 41. Kelengkapan Perencanaan

Kelengkapan Perencanaan adalah indikator di card untuk menampilkan apakah jumlah card turunan sudah memenuhi Minimum Breakdown Rule.

Contoh:

Kelengkapan Perencanaan

Strategy:
2 / 3

Status:
Belum Lengkap

Pesan:

Tambahkan 1 Strategy lagi agar akses ke Initiative terbuka.

Jika lengkap:

Kelengkapan Perencanaan

Strategy:
3 / 3

Status:
Lengkap

Pesan:

Anda dapat melanjutkan ke Initiative.

---

## 42. Popup Gagal Melanjutkan

Jika user mencoba membuat card turunan tetapi Minimum Breakdown Rule belum terpenuhi, sistem menampilkan popup.

Contoh:

Tidak Dapat Melanjutkan

KPI Area ini baru memiliki 2 dari 3 Strategy yang diwajibkan.

Tambahkan 1 Strategy lagi agar akses ke Initiative terbuka.

Tombol:

1. Tambah Strategy.
2. Tutup.

Sistem tidak boleh hanya menampilkan error teknis.

---

## 43. Card Completion Rule

Card Completion Rule adalah aturan field wajib setiap jenis card.

Fitur ini dapat dikelola di Settings oleh user berwenang.

Contoh Action Plan Card wajib:

1. Nama Action Plan.
2. PIC.
3. Reviewer.
4. Tanggal Mulai.
5. Deadline.
6. Output yang Diharapkan.
7. Definition of Done.
8. Prioritas.

Jika ada field wajib kosong, card tidak bisa Aktif.

---

## 44. Tidak Ada Bobot Planning Card

EMS V1.8.1 tidak memiliki bobot pada struktur planning card.

Tidak ada bobot pada:

1. Goal.
2. KPI Area.
3. Strategy.
4. Initiative.
5. Action Plan.
6. Development Area.
7. Problem Statement.

Alasan:

EMS bukan aplikasi perhitungan KPI formal.

EMS adalah aplikasi eksekusi.

Yang penting:

1. Card lengkap.
2. Breakdown cukup.
3. Action Plan berjalan.
4. Bukti masuk.
5. Nilai Hasil dilaporkan.
6. Review sah.
7. Progress dan Capaian bisa dipantau.

---

## 45. Bobot Score Formula Tetap Ada

Yang dihapus hanya bobot di level input planning card.

Bobot untuk perhitungan performa user tetap ada.

Score Formula tetap menggunakan bobot.

Contoh Staff Score Formula:

1. Action Plan Completion = 20%.
2. Repeat Compliance = 20%.
3. On-Time Rate = 15%.
4. Review Pass Rate = 10%.
5. Result Achievement = 15%.
6. Development Contribution = 10%.
7. Governance Discipline = 10%.

Total harus 100%.

Score Formula harus bisa dicustom dari Settings.

Score Formula harus memiliki versioning.

Score Formula digunakan untuk People, Ranking, dan Achievement Score.

---

## 46. Goal Template Library

EMS memiliki Goal Template Library.

Goal Template adalah blueprint.

Goal Template bukan Goal aktif.

Goal Template membantu user membuat Goal dan KPI Area tanpa mulai dari nol.

Flow:

1. Klik + Goal.
2. Pilih Blank Goal atau Gunakan Goal Template.
3. Pilih Goal Template.
4. Pilih divisi/function.
5. Pilih KPI Area Template.
6. Isi Target.
7. Tentukan PIC KPI Area.
8. Generate Goal dan KPI Area Card.

Tidak ada bobot KPI Area.

Tidak ada satuan/metode perhitungan wajib.

---

## 47. Template KPI Area — Goal: Meningkatkan Omset Penjualan

### Sales & Marketing (CMO)

1. Menambah Jumlah Customer.
2. Meningkatkan Basket Size.

### Operations (COO)

1. Meningkatkan Output Produk.
2. Meningkatkan Produktivitas.

### Finance & Accounting (CFO)

1. Ketersediaan Arus Kas yang Memadai.
2. A/R Collection.

### Human Capital (CHRO)

1. Meningkatkan Kompetensi Karyawan.
2. Ketersediaan Karyawan (MPP).

### Business Growth (CBO)

1. Menambah Jumlah Cabang Baru.
2. Menciptakan Produk / Brand Baru.

---

## 48. Template KPI Area — Goal: Meningkatkan Profit

### Sales & Marketing (CMO)

1. Increase Sales Price.
2. Minimize Budget.

### Operations (COO)

1. Menurunkan OPEX.
2. Menurunkan Komplain Pelanggan.

### Finance & Accounting (CFO)

1. Control Budgeting.

### Human Capital (CHRO)

1. Mengurangi Biaya Lembur.
2. Menurunkan Turnover.

### Business Growth (CBO)

1. Ketersediaan Pendanaan Ekspansi Outlet Baru.
2. Efisiensi Biaya Ekspansi.

---

## 49. Goal Wizard

Goal Wizard digunakan untuk membuat Goal dari template.

Step 1:

Pilih:

1. Blank Goal.
2. Gunakan Goal Template.

Step 2:

Jika Gunakan Goal Template, pilih:

1. Meningkatkan Omset Penjualan.
2. Meningkatkan Profit.

Step 3:

Pilih divisi/function:

1. Sales & Marketing (CMO).
2. Operations (COO).
3. Finance & Accounting (CFO).
4. Human Capital (CHRO).
5. Business Growth (CBO).

Step 4:

Pilih KPI Area Template.

Step 5:

Isi target untuk setiap KPI Area.

Step 6:

Tentukan PIC/Owner KPI Area.

Step 7:

Generate Goal dan KPI Area Card.

---

## 50. Template Update Rule

Goal Template dan KPI Area Template bisa diedit oleh user yang punya permission.

Namun perubahan template tidak otomatis mengubah Goal aktif yang sudah berjalan.

Alasan:

Goal aktif mungkin sudah memiliki KPI Area, Strategy, Initiative, dan Action Plan.

Template update hanya berlaku untuk pembuatan Goal berikutnya.

Jika ingin menambahkan KPI Area dari template ke Goal aktif, sistem dapat menyediakan:

1. Terapkan KPI Area dari Template.
2. Pulihkan Item Template yang Belum Ada.

Aksi tersebut hanya menambahkan item yang belum ada.

Tidak boleh menghapus atau menimpa data aktif.

---

## 51. Delegasi PIC dan Reviewer

EMS memakai delegasi bertingkat.

Prinsip utama:

Yang memiliki card induk dapat membuat card turunan dan menentukan PIC serta Reviewer card turunan tersebut.

Contoh:

PIC KPI Area dapat membuat Strategy dan menentukan PIC/Reviewer Strategy.

PIC Strategy dapat membuat Initiative dan menentukan PIC/Reviewer Initiative.

PIC Initiative dapat membuat Action Plan dan menentukan PIC/Reviewer Action Plan.

---

## 52. Default PIC Turunan

Jika PIC card turunan tidak diubah, sistem otomatis mengikuti PIC card induknya.

Contoh:

PIC KPI Area:

CFO.

CFO membuat Strategy tanpa mengganti PIC.

Maka PIC Strategy otomatis CFO.

PIC Strategy membuat Initiative tanpa mengganti PIC.

Maka PIC Initiative otomatis CFO.

Namun Action Plan berbeda.

Action Plan wajib memiliki PIC eksekutor yang ditentukan secara jelas.

---

## 53. PIC Action Plan

PIC Action Plan bisa berbeda-beda karena Action Plan adalah unit kerja eksekusi.

Contoh:

Initiative:

Daily Finance Control.

Action Plan:

1. Daily Finance Closing — PIC: Staff Finance A.
2. Cek Mutasi Bank — PIC: Staff Finance B.
3. Upload Rekap Harian — PIC: Staff Finance C.

PIC Action Plan wajib dipilih.

Reviewer Action Plan wajib dipilih.

---

## 54. Reviewer

Reviewer ditentukan oleh pembuat card turunan.

Action Plan wajib memiliki Reviewer.

Strategy dan Initiative dapat memiliki Reviewer sesuai aturan card completion atau kebutuhan organisasi.

Default Reviewer bisa mengikuti PIC card induk atau dipilih manual.

PIC tidak boleh approve pekerjaannya sendiri.

---

## 55. Hak Akses Default

EMS memakai prinsip akses berbasis tanggung jawab.

User tidak melihat semua card secara default.

User hanya melihat card yang relevan dengan tanggung jawabnya.

Akses otomatis:

1. PIC card otomatis melihat card tersebut.
2. Reviewer otomatis melihat card tersebut.
3. PIC card induk otomatis melihat seluruh card turunannya.
4. PIC Goal otomatis melihat KPI Area, Strategy, Initiative, dan Action Plan di bawah Goal.
5. PIC KPI Area otomatis melihat Strategy, Initiative, dan Action Plan di bawah KPI Area.
6. PIC Strategy otomatis melihat Initiative dan Action Plan di bawah Strategy.
7. PIC Initiative otomatis melihat Action Plan di bawah Initiative.
8. PIC Action Plan otomatis melihat Action Plan Instance miliknya.

---

## 56. Akses Lihat Tidak Sama dengan Akses Edit

PIC card induk boleh melihat seluruh turunan.

Namun edit, approve, dan ubah data tetap mengikuti wewenang.

Contoh:

CFO memiliki KPI Area Control Budgeting.

CFO dapat melihat semua Strategy, Initiative, dan Action Plan di bawah KPI Area tersebut.

Namun CFO tidak boleh mengubah bukti yang sudah dikirim oleh Staff Finance jika bukan flow yang sah.

Audit trail tidak boleh rusak.

---

## 57. Workflow User

Workflow user hanya menampilkan card yang relevan:

1. Card yang dia menjadi PIC.
2. Card yang dia menjadi Reviewer.
3. Card turunan dari card yang dia miliki.
4. Card tambahan jika dia memiliki permission melihat seluruh Workspace.

Staff tidak melihat card divisi lain secara default.

Manager/Head melihat card yang menjadi tanggung jawabnya dan seluruh turunannya.

CEO/Super Admin dapat melihat seluruh Workspace jika permission aktif.

---

## 58. Permission di User Settings

Permission tidak dibuat terlalu granular.

Tidak perlu permission custom untuk:

1. Melihat card sebagai PIC.
2. Melihat card sebagai Reviewer.
3. Melihat turunan card yang dimiliki.
4. Menentukan PIC turunan.
5. Menentukan Reviewer turunan.

Itu semua adalah system rule.

Permission yang bisa dicustom di User Settings:

1. Boleh membuat Goal.
2. Boleh membuat KPI Area.
3. Boleh membuat Development Area.
4. Boleh membuat Strategy.
5. Boleh membuat Initiative.
6. Boleh membuat Action Plan.
7. Boleh melihat seluruh Workspace.
8. Boleh mengelola card milik orang lain.
9. Boleh mengubah Settings.
10. Boleh mengelola User & Permission.
11. Boleh mengelola Goal Template.
12. Boleh mengelola KPI Area Template.
13. Boleh mengelola Minimum Breakdown Rule.
14. Boleh mengelola Card Completion Rule.
15. Boleh melihat Activity Log.
16. Boleh melihat Governance Violation.
17. Boleh mengelola Score Formula.

---

## 59. Default Role Permission

### 59.1 CEO / Super Admin

Default dapat:

1. Membuat Goal.
2. Membuat KPI Area.
3. Membuat Development Area.
4. Membuat Strategy.
5. Membuat Initiative.
6. Membuat Action Plan.
7. Melihat seluruh Workspace.
8. Mengelola card milik orang lain.
9. Mengelola Settings.
10. Mengelola User & Permission.
11. Mengelola template.
12. Mengelola Score Formula.

### 59.2 C-Level

Default dapat sesuai area authority:

1. Membuat KPI Area jika diberi izin.
2. Membuat Strategy jika menjadi PIC KPI Area.
3. Membuat Initiative jika menjadi PIC Strategy.
4. Membuat Action Plan jika menjadi PIC Initiative.
5. Melihat seluruh turunan card miliknya.

### 59.3 Management Level / Manager / Head

Default dapat:

1. Membuat Development Area jika diberi izin.
2. Membuat Strategy jika menjadi PIC KPI Area.
3. Membuat Initiative jika menjadi PIC Strategy.
4. Membuat Action Plan jika menjadi PIC Initiative.
5. Menentukan PIC/Reviewer card turunan yang dibuatnya.
6. Melihat seluruh turunan card miliknya.

### 59.4 Staff

Default dapat:

1. Melihat card yang dia menjadi PIC.
2. Melihat card yang dia menjadi Reviewer.
3. Mengerjakan Action Plan miliknya.
4. Submit Bukti.
5. Submit Nilai Hasil jika diwajibkan.
6. Comment pada card yang dia akses.
7. Melihat Notifications.
8. Melihat Inbox yang dia menjadi member.
9. Melihat People sesuai visibility.

Staff default tidak dapat:

1. Membuat Goal.
2. Membuat KPI Area.
3. Membuat Development Area.
4. Membuat Strategy.
5. Membuat Initiative.
6. Membuat Action Plan.
7. Melihat seluruh Workspace.
8. Mengelola card milik orang lain.
9. Mengubah Settings.

---

## 60. Watcher Dihapus

EMS V1.8.1 tidak memakai Watcher.

Alasan:

1. Permission menjadi lebih sederhana.
2. PIC card induk otomatis melihat seluruh turunannya.
3. Reviewer otomatis melihat card yang harus direview.
4. User yang perlu akses luas bisa diberi permission melihat seluruh Workspace.
5. Tidak perlu fitur add watcher.

Database tidak perlu memiliki watcher table.

UI tidak perlu memiliki Add Watcher.

Notifications tidak perlu memiliki watcher notification.

---

## 61. Home

Home adalah Today Command Center.

Home menjawab:

Hari ini saya harus fokus apa?

Home menampilkan:

1. Action Plan hari ini.
2. Action Plan Repeat yang jatuh tempo hari ini.
3. Card yang butuh review.
4. Card yang Terlewat.
5. Deadline mendekat.
6. Revisi yang harus diperbaiki.
7. Ringkasan progress pribadi.
8. Ringkasan card yang menjadi tanggung jawab user.
9. Peringatan Kelengkapan Card jika relevan.
10. Keterangan singkat untuk user baru jika belum onboarding.

Home tidak menampilkan:

1. Feed.
2. Announcement.
3. Company News.
4. Posting.
5. Social activity.

---

## 62. Notifications

Notifications adalah pusat alert dan tindakan.

Notifications menampilkan:

1. Review request.
2. Approval.
3. Rejection.
4. Komentar.
5. Mention.
6. Deadline reminder.
7. Deadline change request.
8. Action Plan Terlewat.
9. Action Plan Repeat due today.
10. Governance warning.
11. Card diaktifkan.
12. Card butuh dilengkapi.
13. Minimum Breakdown Rule warning.

Tabs:

1. Semua.
2. Perlu Tindakan.
3. Review.
4. Deadline.
5. Komentar.
6. Terlewat.
7. Repeat.
8. Governance.

---

## 63. Inbox

Inbox adalah pusat chat Initiative.

Setiap Initiative otomatis memiliki chat room.

Inbox bukan tempat approval resmi.

Keputusan resmi tetap melalui:

1. Comment.
2. Review.
3. Status.
4. Activity Log.

Chat digunakan untuk diskusi cepat.

Chat tidak menggantikan Review.

Chat tidak menggantikan Bukti.

Chat tidak menggantikan Nilai Hasil.

---

## 64. Initiative Chat

Setiap Initiative otomatis memiliki chat room.

Member chat mengikuti akses card:

1. PIC Initiative.
2. Reviewer Initiative jika ada.
3. PIC Action Plan di bawah Initiative.
4. Reviewer Action Plan di bawah Initiative.
5. PIC card induk yang memiliki akses turunan.

Jika user tidak memiliki akses ke Initiative, user tidak bisa membuka chat Initiative tersebut.

---

## 65. People

People adalah tempat melihat performa user.

People menampilkan:

1. Profile.
2. Achievement Score.
3. Action Plan Completion.
4. Repeat Compliance.
5. On-Time Rate.
6. Review Pass Rate.
7. Result Achievement.
8. Development Contribution.
9. Governance Discipline.
10. Ranking.
11. Trend performa.

People bukan tempat mempermalukan orang.

Tidak boleh ada label:

1. Karyawan terburuk.
2. Staff malas.
3. Manager gagal.

People hanya menampilkan data objektif.

---

## 66. Score Formula

Score Formula digunakan untuk menghitung performa user.

Score Formula memiliki bobot.

Bobot Score Formula tetap ada.

Bobot Score Formula berbeda dari bobot planning card.

Planning card tidak punya bobot.

Score Formula punya bobot.

Score Formula harus bisa dicustom dari Settings.

Total bobot Score Formula aktif wajib 100%.

Jika total bobot bukan 100%, formula tidak bisa diaktifkan.

Score Formula harus memiliki versioning.

Score periode yang sudah ditutup tidak boleh berubah diam-diam.

---

## 67. Default Staff Score Formula

Default Staff Score Formula:

1. Action Plan Completion = 20%.
2. Repeat Compliance = 20%.
3. Result Achievement = 15%.
4. On-Time Rate = 15%.
5. Review Pass Rate = 10%.
6. Development Contribution = 10%.
7. Governance Discipline = 10%.

Total = 100%.

---

## 68. Default Management Level Score Formula

Default Management Level Score Formula:

1. KPI Area Achievement = 25%.
2. Performance Goal Contribution = 15%.
3. Development Contribution = 10%.
4. Strategy Completion Rate = 15%.
5. Initiative Completion Rate = 10%.
6. Team Repeat Compliance = 10%.
7. Team Result Achievement = 5%.
8. Review Speed & Review Quality = 5%.
9. Governance Discipline = 5%.

Total = 100%.

Catatan:

Istilah KPI Area Achievement di score bukan bobot planning card.

Ini adalah kategori penilaian performa manager berdasarkan pencapaian area yang dia tangani.

---

## 69. Default C-Level Score Formula

Default C-Level Score Formula:

1. Goal Achievement = 30%.
2. KPI Area Achievement = 30%.
3. Development Contribution = 15%.
4. Strategic Initiative Achievement = 15%.
5. Cross-functional Execution = 5%.
6. Governance Discipline = 5%.

Total = 100%.

---

## 70. Default CEO Score Formula

Default CEO Score Formula:

1. Company Goal Achievement = 35%.
2. Profit / Growth Achievement = 20%.
3. Strategic Portfolio Health = 15%.
4. Organization Development Score = 15%.
5. Leadership Team Health = 10%.
6. Governance Discipline = 5%.

Total = 100%.

---

## 71. Score Formula Versioning

Setiap perubahan Score Formula membuat version baru.

Data yang disimpan:

1. Template name.
2. Version number.
3. Kategori score.
4. Bobot kategori.
5. Source data.
6. Effective date.
7. Created by.
8. Approved by jika ada.
9. Change reason.
10. Created at.

Score historis tetap memakai formula yang berlaku pada periode tersebut.

---

## 72. Manual Override Score

Manual override score bukan default.

Jika diperlukan, hanya user berwenang yang bisa melakukan.

Manual override wajib menyimpan:

1. Auto calculated score.
2. Manual adjusted score.
3. Reason.
4. Changed by.
5. Approved by jika perlu.
6. Changed at.
7. Activity Log.

Manual override tidak boleh menghapus hasil perhitungan otomatis.

---

## 73. Activity Log

Activity Log wajib append-only.

Tidak bisa diedit atau dihapus dari UI.

Activity Log mencatat:

1. Card dibuat.
2. Card diedit.
3. Card diaktifkan.
4. Card selesai.
5. Card diarsipkan.
6. PIC diganti.
7. Reviewer diganti.
8. Bukti dikirim.
9. Nilai Hasil dikirim.
10. Review approve.
11. Review reject.
12. Deadline change request.
13. Deadline change approved.
14. Deadline change rejected.
15. Action Plan Instance dibuat.
16. Action Plan Instance Terlewat.
17. Minimum Breakdown Rule diubah.
18. Card Completion Rule diubah.
19. Keterangan Card diubah jika bisa diedit dari Settings.
20. Permission diubah.
21. Card gagal diaktifkan karena validasi.
22. User mencoba akses tanpa permission.
23. Score Formula diubah.
24. Score Formula diaktifkan.

---

## 74. Governance Violation

Governance Violation mencatat pelanggaran aturan sistem.

Contoh:

1. User mencoba mengaktifkan card yang belum lengkap.
2. User mencoba melanjutkan turunan saat Minimum Breakdown Rule belum terpenuhi.
3. User mencoba approve pekerjaannya sendiri.
4. User mencoba mengubah bukti yang sudah disubmit.
5. User mencoba mengubah permission tanpa izin.
6. User melewati deadline Action Plan Repeat.
7. User terlalu sering mengubah deadline.
8. User mengarsipkan card tanpa izin.
9. User mencoba melihat Workspace tanpa akses.
10. User mengubah Score Formula tanpa izin.

Severity:

1. Low.
2. Medium.
3. High.
4. Critical.

---

## 75. Deadline Change Request

PIC tidak boleh mengubah deadline langsung jika card sudah aktif.

PIC hanya bisa request perubahan deadline.

Request wajib memiliki:

1. Deadline lama.
2. Deadline baru yang diminta.
3. Alasan.
4. Dampak jika ditolak.
5. Bukti pendukung jika ada.

Reviewer atau user berwenang dapat approve/reject.

Semua perubahan masuk Activity Log.

---

## 76. Cancellation

Card bisa dibatalkan jika sudah tidak relevan.

Cancellation wajib memiliki alasan.

Alasan contoh:

1. Prioritas berubah.
2. Solusi diganti.
3. Resource tidak tersedia.
4. Salah asumsi.
5. Budget tidak tersedia.
6. Tidak relevan lagi.
7. Risiko terlalu besar.

Cancelled card tidak dihapus.

Card tetap masuk riwayat.

---

## 77. Evaluation

Initiative yang selesai idealnya memiliki Evaluation.

Evaluation berisi:

1. Target tercapai atau tidak.
2. Hasil utama.
3. Faktor berhasil.
4. Faktor gagal.
5. Lesson learned.
6. Yang harus dipertahankan.
7. Yang harus diperbaiki.
8. Perlu jadi SOP atau tidak.
9. Perlu rollout ke area lain atau tidak.

---

## 78. Archive

Card yang sudah selesai atau tidak aktif dapat diarsipkan.

Diarsipkan bukan dihapus.

Archived card tidak tampil di Workspace aktif, tetapi masih bisa dicari oleh user berwenang.

Hard delete tidak digunakan untuk governance entities.

---

## 79. Search

Search harus mendukung:

1. Goal.
2. KPI Area.
3. Strategy.
4. Initiative.
5. Action Plan.
6. Action Plan Instance.
7. Development Area.
8. Problem Statement.
9. People.
10. Comment.
11. Chat.
12. Bukti.
13. Activity Log.
14. Governance Violation.

Search harus mengikuti permission.

User tidak boleh menemukan data yang tidak boleh dia akses.

---

## 80. Settings

Settings diakses melalui avatar/profile menu.

Settings tidak masuk bottom navigation utama.

Settings berisi:

1. User & Permission.
2. Role Template.
3. Organization.
4. Department.
5. Position.
6. Team.
7. Goal Template Library.
8. KPI Area Template Library.
9. Minimum Breakdown Rule.
10. Card Completion Rule.
11. Keterangan Card.
12. Status.
13. Prioritas.
14. Notifications Rule.
15. Score Formula.
16. Activity Log.
17. Governance Violation.
18. Archive.
19. Confidential Access.

---

## 81. Main Navigation

Menu utama EMS V1.8.1:

1. Home.
2. Notifications.
3. Workspace.
4. Inbox.
5. People.

Makna:

Home = fokus hari ini.
Notifications = alert dan tindakan.
Workspace = struktur card.
Inbox = chat Initiative.
People = performa user.

---

## 82. Mobile UX

EMS V1.8.1 harus mobile-first.

UI menggunakan pola card-based layout.

Card harus mudah dibuka/tutup.

Tree harus mendukung expand/collapse.

Tap card = buka detail.

Tap arrow = buka/tutup turunan.

Tombol aksi utama harus jelas:

1. Tambah KPI Area.
2. Tambah Strategy.
3. Tambah Initiative.
4. Tambah Action Plan.
5. Aktifkan Card.
6. Submit Bukti.
7. Submit Nilai Hasil.
8. Approve.
9. Reject.

Keterangan Card harus tampil singkat dan tidak memenuhi layar.

Keterangan Card bisa dilipat/dibuka jika terlalu panjang.

---

## 83. Database Entity Blueprint

Core tables:

1. users / auth.users.
2. profiles.
3. organizations.
4. departments.
5. positions.
6. teams.
7. team_members.
8. role_templates.
9. permissions.
10. user_permissions.
11. goal_templates.
12. kpi_area_templates.
13. goals.
14. kpi_areas.
15. strategies.
16. development_areas.
17. problem_statements.
18. initiatives.
19. action_plans.
20. action_plan_repeat_rules.
21. action_plan_instances.
22. action_plan_result_values.
23. action_plan_submissions.
24. evidence_files.
25. reviews.
26. comments.
27. mentions.
28. notifications.
29. chat_rooms.
30. chat_room_members.
31. chat_messages.
32. chat_message_reads.
33. video_briefs.
34. brief_understanding_records.
35. deadline_change_requests.
36. deadline_change_logs.
37. cancellations.
38. evaluations.
39. activity_logs.
40. governance_violations.
41. period_snapshots.
42. minimum_breakdown_rules.
43. card_completion_rules.
44. card_guidance_contents.
45. score_categories.
46. score_formula_templates.
47. score_formula_versions.
48. score_formula_assignments.
49. user_score_results.
50. ranking_snapshots.
51. confidential_access_rules.
52. settings.
53. login_logs.

Removed from V1.8.1:

1. area_goals.
2. separate kpis table under area_goals.
3. routine_action_plan_templates.
4. routine_generated_instances.
5. routine_checklist_items.
6. routine_contribution_links.
7. routine_effectiveness_rules.
8. checklist_routine.
9. watchers.
10. planning weight fields.

---

## 84. Relationship Rules

Relationship utama:

1. Goal memiliki banyak KPI Area.
2. KPI Area wajib berada di bawah Goal.
3. Strategy wajib dibuat dari KPI Area.
4. Initiative Performance wajib dibuat dari Strategy.
5. Development Area memiliki banyak Problem Statement / Development Goal.
6. Initiative Development wajib dibuat dari Problem Statement / Development Goal.
7. Action Plan wajib dibuat dari Initiative.
8. Action Plan Repeat menghasilkan Action Plan Instance.
9. Action Plan Instance wajib berada di bawah Action Plan.
10. Chat room otomatis dibuat untuk Initiative.
11. PIC card induk otomatis mendapat akses ke seluruh turunannya.
12. Reviewer otomatis mendapat akses ke card yang direview.
13. Card guidance content terkait dengan card_type.

---

## 85. Seed Data Default

Seed data default:

Organization:

Nyantuy Group.

Development Area default:

1. Organization Development.
2. People Development.
3. System Development.
4. Technology Development.
5. Infrastructure Development.
6. Brand Development.
7. Governance Development.

Goal Template:

1. Meningkatkan Omset Penjualan.
2. Meningkatkan Profit.

Repeat Frequency:

1. Daily.
2. Weekly.
3. Monthly.
4. Custom.

Aturan Terlewat:

1. Strict.
2. Grace Period.
3. Overdue Allowed.

Status:

1. Draft.
2. Aktif.
3. Selesai.
4. Diarsipkan.
5. Assigned.
6. In Progress.
7. Menunggu Review.
8. Revisi Diperlukan.
9. Terlewat.
10. Dibatalkan.

Prioritas:

1. Rendah.
2. Sedang.
3. Tinggi.
4. Kritis.

Card Guidance default:

1. Goal: Apa yang ingin dicapai?
2. KPI Area: Area hasil apa yang harus bergerak?
3. Strategy: Bagaimana cara mencapai hasil tersebut?
4. Initiative: Program atau proyek apa yang akan dijalankan?
5. Action Plan: Aktivitas konkret siapa melakukan apa dan kapan?
6. Development Area: Area pengembangan apa yang sedang dibangun?
7. Problem Statement / Development Goal: Masalah atau perbaikan apa yang ingin diselesaikan?

---

## 86. MVP Build Priority

### Phase 1 — Foundation

1. Auth.
2. Profile.
3. Organization.
4. Department.
5. Position.
6. Team.
7. Role Template.
8. User Permission.
9. Mobile shell.
10. Main Navigation.

### Phase 2 — Card System

1. Card base component.
2. Keterangan Card.
3. Kelengkapan Card.
4. Card Activation Rule.
5. Activity Log basic.
6. Governance Violation basic.

### Phase 3 — Performance Workspace

1. Goal.
2. KPI Area.
3. Goal Template Library.
4. KPI Area Template Library.
5. Goal Wizard.
6. Strategy.
7. Initiative.
8. Action Plan.
9. Expand/collapse card tree.

### Phase 4 — Minimum Breakdown Rule

1. Settings Minimum Breakdown Rule.
2. Kelengkapan Perencanaan indicator.
3. Blokir Aktivasi.
4. Blokir Akses Turunan Berikutnya.
5. Popup validasi.

### Phase 5 — Development Workspace

1. Development Area.
2. Problem Statement / Development Goal.
3. Initiative.
4. Action Plan.
5. Permission membuat Development Area.

### Phase 6 — Action Plan Execution

1. Bukti.
2. Nilai Hasil.
3. Submit.
4. Review.
5. Approve.
6. Reject.
7. Anti self-approval.
8. Evidence locking.
9. Submission versioning.

### Phase 7 — Repeat Action Plan

1. Repeat Setting.
2. Repeat Rule.
3. Generate Action Plan Instance.
4. Strict / Grace / Overdue.
5. Terlewat.
6. Repeat progress.
7. Repeat compliance.

### Phase 8 — Notifications

1. Review request.
2. Approval/rejection.
3. Deadline alert.
4. Repeat due today.
5. Terlewat.
6. Comment/mention.

### Phase 9 — Inbox

1. Initiative chat.
2. Auto-create chat room.
3. Chat member by access.
4. Unread badge.

### Phase 10 — People & Score

1. Profile.
2. Ranking.
3. Action Plan completion.
4. Repeat compliance.
5. On-time rate.
6. Review pass rate.
7. Score Formula.
8. Score versioning.

### Phase 11 — Governance & Admin

1. Activity Log page.
2. Governance Violation page.
3. Archive.
4. Search.
5. Confidential Access.

---

## 87. Success Metrics V1.8.1

EMS V1.8.1 dianggap berhasil jika:

1. User bisa login.
2. User hanya melihat card yang relevan.
3. PIC card induk otomatis melihat seluruh card turunannya.
4. CEO/Super Admin bisa membuat Goal.
5. CEO/Super Admin bisa membuat KPI Area.
6. Manager/Head bisa membuat Development Area jika diberi izin.
7. PIC KPI Area bisa membuat Strategy.
8. PIC Strategy bisa membuat Initiative.
9. PIC Initiative bisa membuat Action Plan.
10. Pembuat card turunan bisa menentukan PIC dan Reviewer.
11. Action Plan PIC bisa berbeda-beda sesuai staff eksekutor.
12. Card tidak bisa aktif jika Kelengkapan Card belum terpenuhi.
13. Setiap card menampilkan Keterangan Card.
14. User memahami arti Goal, KPI Area, Strategy, Initiative, dan Action Plan dari dalam aplikasi.
15. Strategy Card wajib punya alasan, risiko, dan alternatif.
16. Minimum Breakdown Rule berjalan.
17. Kelengkapan Perencanaan tampil di card.
18. Akses turunan berikutnya bisa diblokir jika rule aktif.
19. Tidak ada bobot di planning card.
20. Bobot Score Formula tetap ada.
21. Tidak ada satuan/metode perhitungan wajib di KPI Area.
22. Tidak ada Routine entity.
23. Tidak ada Checklist Routine entity.
24. Tidak ada Watcher.
25. Action Plan bisa One Time.
26. Action Plan bisa Repeat.
27. Repeat menghasilkan Action Plan Instance.
28. Action Plan Instance bisa Terlewat jika tidak submit tepat waktu.
29. Bukti bisa dikirim.
30. Nilai Hasil bisa dikirim jika diwajibkan.
31. Reviewer bisa approve/reject.
32. PIC tidak bisa approve sendiri.
33. Activity Log jalan.
34. Governance Violation jalan.
35. Notifications jalan.
36. Inbox Initiative Chat jalan.
37. People menampilkan performa objektif.
38. Bahasa sistem konsisten Indonesia dengan istilah khusus yang disepakati.
39. Tidak ada istilah posting/publish di UI utama.
40. Tidak ada feed/company news/announcement di EMS V1.

---

## 88. Anti-Scope Creep Rules

EMS V1.8.1 tidak boleh melebar ke fitur berikut sebelum core stabil:

1. Feed.
2. Company News.
3. Announcement.
4. SOP Center penuh.
5. HRIS.
6. Payroll.
7. Inventory.
8. CRM.
9. WhatsApp integration.
10. AI Assistant.
11. AI Review.
12. Native app.
13. Social reaction.
14. Story.
15. Reels.
16. Watcher.
17. Routine module.
18. Checklist module.
19. Area Goal.
20. KPI cascade automation.

Jika AI coding agent mengusulkan fitur tersebut, tolak untuk V1.8.1.

---

## 89. Final Product Statement

EMS V1.8.1 adalah sistem eksekusi berbasis card.

Setiap pekerjaan harus turun dari struktur besar.

Performance:

Goal
→ KPI Area
→ Strategy
→ Initiative
→ Action Plan.

Development:

Development Area
→ Problem Statement / Development Goal
→ Initiative
→ Action Plan.

Setiap card harus lengkap sebelum aktif.

Setiap card harus memiliki keterangan singkat agar user memahami maknanya.

Setiap Strategy harus punya alasan, risiko, dan alternatif.

Setiap card turunan dibuat dari dalam card induknya.

Setiap PIC card induk otomatis dapat melihat semua card turunannya.

Setiap card turunan bisa didelegasikan ke PIC dan Reviewer yang sesuai.

Action Plan bisa sekali selesai atau berulang seperti alarm.

EMS tidak menilai orang dari banyaknya card yang dibuat, tetapi dari eksekusi yang jelas, bukti yang masuk, Nilai Hasil yang dilaporkan, review yang sah, dan kontribusi yang terlihat terhadap arah perusahaan.

Final philosophy:

Kerja yang benar bukan sekadar ramai aktivitas.

Kerja yang benar adalah pekerjaan yang punya konteks, lengkap, dipahami maknanya, didelegasikan dengan jelas, dieksekusi tepat waktu, punya bukti, direview, dan menghasilkan dampak yang bisa dipantau.
