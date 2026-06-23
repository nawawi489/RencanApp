# EMS V1.8.1 — 02 · Spesifikasi Card & Alur Eksekusi

> **Untuk AI agent:** File ini adalah spesifikasi fungsional yang Anda implementasikan. Isinya: field & validasi tiap card, kelengkapan card, loop eksekusi (bukti/nilai hasil/review), Action Plan repeat, minimum breakdown rule, template, dan lifecycle card. Untuk konsep & makna card → [01-konsep-dan-fondasi.md](01-konsep-dan-fondasi.md). Untuk permission/data/score → [03-sistem-permission-data-governance.md](03-sistem-permission-data-governance.md). Sumber: [../PRD.md](../PRD.md).

---

## A. Kelengkapan Card

**Kelengkapan Card** = validasi data wajib sebelum card dapat diaktifkan. Jika belum lengkap → card tetap **Draft**, tombol **Aktifkan Card** nonaktif / tampilkan pesan validasi.

Tampilan: daftar field wajib dengan status `Lengkap` / `Belum Lengkap`, status keseluruhan, dan pesan "Lengkapi seluruh data wajib sebelum card dapat diaktifkan."

**Card Completion Rule (§43):** aturan field wajib per jenis card, dikelola di Settings oleh user berwenang. Jika ada field wajib kosong → card tidak bisa Aktif.

## B. Spesifikasi Field Tiap Card

### Goal Card
Syarat aktif: Nama Goal, Periode (Tanggal Mulai + Selesai), PIC/Owner Goal, minimal punya KPI Area sesuai rule.
- Goal tidak harus tahunan; periode sesuai kebutuhan.
- Tanpa bobot planning, tanpa metode perhitungan formal di V1.8.1.
- Default pembuat: CEO / Super Admin.

### KPI Area Card
Syarat aktif: Nama KPI Area, PIC/Owner, Periode (Mulai + Selesai), **Target**.
- **Tidak wajib:** bobot, satuan, metode perhitungan.
- Target wajib agar KPI Area tidak jadi kalimat kosong. Satuan/metode bukan input wajib karena EMS bukan software KPI formal (metadata bisa dikembangkan nanti tanpa ubah struktur).
- KPI Area bukan mesin hitung KPI formal; dipakai mengarahkan Strategy.

### Strategy Card
Card berpikir utama sebelum eksekusi, tidak boleh dangkal.
Syarat aktif: Nama Strategy, **Alasan Strategy**, **Risiko Utama**, **Alternatif Strategy**, Periode (Mulai + Selesai), PIC (otomatis dari PIC KPI Area kecuali didelegasikan).
- Tanpa bobot planning, tanpa metode perhitungan wajib.

### Initiative Card
Program eksekusi dari Strategy.
Syarat aktif: Nama Initiative, Periode (Mulai + Selesai), Target Hasil, PIC (otomatis dari PIC Strategy kecuali didelegasikan).
- Tanpa bobot planning.

### Action Plan Card
Unit eksekusi konkret, selalu di bawah Initiative. Bisa **One Time** atau **Repeat**.
Syarat aktif: Nama, PIC, Reviewer, Tanggal Mulai, Deadline, Output yang Diharapkan, Definition of Done, Prioritas, Repeat Setting (One Time/Repeat).
- Jika Repeat, tambahan wajib: Repeat Frequency, Tanggal Mulai Repeat, Tanggal Akhir Repeat, Jam Deadline, Aturan Terlewat.
- Jika bukti diwajibkan: bukti wajib sebelum submit. Jika Nilai Hasil diwajibkan: wajib diisi sebelum submit.
- Tanpa bobot planning.

## C. Action Plan One Time vs Repeat

**One Time** = pekerjaan sekali selesai. Flow:
`Assigned → In Progress → Submit Bukti/Nilai Hasil → Menunggu Review → Selesai / Revisi Diperlukan`

**Repeat** = pekerjaan berulang. Repeat **bukan entity terpisah**, hanya setting di Action Plan (seperti alarm). Saat aktif → sistem membuat **Action Plan Instance**.

### Repeat Setting
Default: **One Time**. Jika Repeat, muncul field: Repeat Frequency (Daily/Weekly/Monthly/Custom), Tanggal Mulai, Tanggal Akhir, Jam Deadline, Aturan Terlewat, Grace Period (jika dipilih), Custom date (jika frequency custom).

### Action Plan Instance
Pekerjaan yang dihasilkan Action Plan Repeat. Contoh: Daily Finance Closing, Daily, periode 1–30 Juni → sistem buat 30 instance. Tiap instance punya: Tanggal, Jam Deadline, PIC, Reviewer, Status, Bukti, Nilai Hasil (jika wajib), Waktu submit, Review result, Waktu review.

### Aturan Terlewat (untuk Repeat)
| Mode | Perilaku |
|---|---|
| **Strict** | Lewat jam deadline & belum submit → langsung **Terlewat**. (Default untuk daily control.) |
| **Grace Period** | Ada toleransi waktu (mis. 30 menit) sebelum Terlewat. |
| **Overdue Allowed** | Boleh submit terlambat; keterlambatan tetap tercatat & memengaruhi discipline/score jika score aktif. |

## D. Loop Eksekusi: Bukti, Nilai Hasil, Review

### Bukti (§30)
Membuktikan pekerjaan dilakukan. Jenis: File, Foto, Screenshot, PDF, Link Google Drive, Link dokumen, Catatan teks, Rekap laporan.
- Jika diwajibkan, Action Plan tidak bisa submit tanpa bukti.
- Bukti yang sudah disubmit **tidak boleh dihapus/diubah** oleh PIC. Revisi = kirim versi baru.

### Nilai Hasil (§31)
Melaporkan output terukur. Tipe: Number, Currency, Percentage, Boolean, Text, Option, Link.
Contoh: Daily Finance Closing → "Selisih kas = Rp0"; Daily Marketing Report → "Leads=120, Closing=18, Omset=Rp4.500.000".

### Bukti vs Nilai Hasil (§32)
- **Bukti** menjawab: apakah pekerjaan dilakukan?
- **Nilai Hasil** menjawab: apa hasil pekerjaan itu?
Checklist bukan fokus V1.8.1. Yang penting: bukti, Nilai Hasil, submit, review.

### Review (§33)
Validasi hasil kerja. Action Plan **wajib** punya Reviewer. Reviewer bisa approve/reject.
- Jika review diwajibkan, Action Plan tidak bisa Selesai tanpa approval.
- **PIC tidak boleh approve pekerjaannya sendiri.**
- Reject wajib punya alasan → status jadi **Revisi Diperlukan** → PIC submit ulang versi baru.

### Submission Versioning (§34)
Tiap submit = submission version baru. Submission lama tidak hilang. Jika ditolak, submission lama tetap tersimpan; revisi = versi baru.
Fields minimal: Submitted by, Submitted at, Submission note, Bukti, Nilai Hasil (jika ada), Version number, Review status, Review reason, Reviewed by, Reviewed at.

### Evidence Locking (§35)
Bukti yang sudah disubmit terkunci. PIC tidak bisa hapus/ganti bukti lama diam-diam. Revisi = bukti versi baru. Reviewer bisa lihat semua versi.

## E. Progress, Capaian, Compliance

- **Progress (§36)** = pekerjaan berjalan sejauh apa. One Time mengikuti status (Draft=0, In Progress=berjalan, Menunggu Review=hampir, Selesai=100%). Repeat dihitung dari instance (mis. 15/30).
- **Capaian (§37)** = apakah hasil tercapai. Bisa Progress selesai tapi Capaian belum (mis. closing terkirim tapi selisih kas Rp500.000). **EMS wajib membedakan Progress vs Capaian.**
- **Repeat Compliance (§38)** = kedisiplinan menyelesaikan Action Plan Repeat. Formula default: `instance selesai tepat waktu ÷ total instance seharusnya` (mis. 28/30). Dipakai di People & Score Formula. Bukan bobot planning card.

## F. Minimum Breakdown Rule (MBR)

Aturan jumlah minimal card turunan sebelum user bisa lanjut. Dikelola di Settings.

**Default Performance:** KPI Area→Strategy = min 3; Strategy→Initiative = min 3; Initiative→Action Plan = min 3.
**Default Development:** Development Area→Problem Statement = min 1; Problem Statement→Initiative = min 1; Initiative→Action Plan = min 3.

> ⚠️ **Catatan implementasi (rekomendasi):** untuk organisasi kecil, default 3/3/3 dapat meledak jadi ratusan card wajib. Mulai dengan mode **Hanya Peringatan** dan naikkan ke Blokir setelah tim terbiasa. Lihat [../BUILD-PLAN.md](../BUILD-PLAN.md) Fase 5.

### Mode Penerapan (§40)
1. **Hanya Peringatan** — user tetap bisa lanjut, sistem menampilkan peringatan.
2. **Blokir Aktivasi** — boleh buat Draft, card tidak bisa Aktif sebelum minimum terpenuhi.
3. **Blokir Akses Turunan Berikutnya** — tidak bisa membuat card turunan berikutnya sebelum minimum terpenuhi.

### Kelengkapan Perencanaan (§41) & Popup Gagal (§42)
Indikator di card menampilkan progress turunan vs MBR (mis. "Strategy: 2/3, Belum Lengkap, Tambahkan 1 Strategy lagi agar akses ke Initiative terbuka"). Jika lengkap → "3/3, Lengkap, Anda dapat melanjutkan ke Initiative".
Jika user coba lanjut padahal belum terpenuhi → popup "Tidak Dapat Melanjutkan" dengan pesan jelas + tombol [Tambah Strategy] [Tutup]. **Jangan tampilkan error teknis mentah.**

## G. Template & Wizard

### Goal Template Library (§46)
Goal Template = blueprint, bukan Goal aktif. Membantu user buat Goal & KPI Area tanpa mulai dari nol.
Flow: + Goal → Blank/Gunakan Template → pilih Goal Template → pilih divisi/function → pilih KPI Area Template → isi Target → tentukan PIC KPI Area → generate Goal & KPI Area. Tanpa bobot, tanpa satuan/metode wajib.

### Template KPI Area bawaan
**Goal "Meningkatkan Omset Penjualan":** CMO (Menambah Customer, Meningkatkan Basket Size); COO (Output Produk, Produktivitas); CFO (Arus Kas, A/R Collection); CHRO (Kompetensi Karyawan, Ketersediaan MPP); CBO (Cabang Baru, Produk/Brand Baru).
**Goal "Meningkatkan Profit":** CMO (Increase Sales Price, Minimize Budget); COO (Menurunkan OPEX, Menurunkan Komplain); CFO (Control Budgeting); CHRO (Mengurangi Lembur, Menurunkan Turnover); CBO (Pendanaan Ekspansi, Efisiensi Biaya Ekspansi).

### Goal Wizard (§49)
7 step: (1) Blank/Template → (2) pilih Goal Template → (3) pilih divisi/function → (4) pilih KPI Area Template → (5) isi target tiap KPI Area → (6) tentukan PIC/Owner → (7) generate Goal & KPI Area Card.

### Template Update Rule (§50)
Template bisa diedit oleh user berwenang, **tapi tidak otomatis mengubah Goal aktif** (karena Goal aktif mungkin sudah punya turunan). Update hanya berlaku untuk Goal berikutnya. Aksi opsional "Terapkan KPI Area dari Template" / "Pulihkan Item Template yang Belum Ada" hanya **menambah** item yang belum ada — tidak menghapus/menimpa data aktif.

## H. Lifecycle Card

### Deadline Change Request (§75)
PIC tidak boleh ubah deadline langsung jika card sudah aktif — hanya bisa **request**. Request wajib: deadline lama, deadline baru, alasan, dampak jika ditolak, bukti pendukung (jika ada). Reviewer/user berwenang approve/reject. Semua masuk Activity Log.

### Cancellation (§76)
Card bisa dibatalkan jika tidak relevan. Wajib alasan (prioritas berubah, solusi diganti, resource/budget tidak tersedia, salah asumsi, risiko terlalu besar, dll). Cancelled card **tidak dihapus**, tetap masuk riwayat.

### Evaluation (§77)
Initiative selesai idealnya punya Evaluation: target tercapai/tidak, hasil utama, faktor berhasil, faktor gagal, lesson learned, yang dipertahankan, yang diperbaiki, perlu jadi SOP/tidak, perlu rollout ke area lain/tidak.

### Archive (§78)
Card selesai/tidak aktif bisa diarsipkan. **Diarsipkan ≠ dihapus.** Archived card tidak tampil di Workspace aktif tapi masih bisa dicari user berwenang. **Hard delete tidak digunakan untuk governance entities.**
