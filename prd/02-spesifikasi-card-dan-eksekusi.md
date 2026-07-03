# Rencanaapp V1.82 — 02 · Spesifikasi Card & Alur Eksekusi

> **Untuk AI agent:** File ini adalah spesifikasi fungsional yang Anda implementasikan. Isinya: field & validasi tiap card, kelengkapan card, KPI Area Target Breakdown 100%, loop eksekusi (bukti versioning / nilai hasil / review), Action Plan repeat & instance, minimum breakdown rule, template & wizard, dan lifecycle card. Untuk konsep & makna card → [01-konsep-dan-fondasi.md](01-konsep-dan-fondasi.md). Untuk permission/data/score → [03-sistem-permission-data-governance.md](03-sistem-permission-data-governance.md). Sumber otoritatif: [../PRD.md](../PRD.md).

---

## A. Kelengkapan Card

**Kelengkapan Card** = validasi data wajib per jenis card sebelum card dapat diaktifkan. Jika belum lengkap → card tetap **Draft**, tombol **Aktifkan Card** memicu popup umum.

Aturan UX V1.82 (PRD §7.4):

1. User mengisi form.
2. User klik **Aktifkan Card**.
3. Jika ada field wajib kosong → sistem tampilkan popup umum: *"Lengkapi data wajib terlebih dahulu sebelum Card bisa diaktifkan."*
4. UI **tidak** wajib menampilkan panel besar "Kelengkapan Card" yang memenuhi layar; tidak wajib auto-scroll ke field kosong.

**Card Completion Rule (PRD §34.5):** aturan field wajib per jenis card dikelola di Settings oleh user berwenang. Validasi wajib dijalankan **backend**; frontend tidak boleh mengandalkan UI sebagai jaminan.

## B. Spesifikasi Field Tiap Card

### Goal Card (PRD §17)

**Wajib:** Nama Goal, Target Tahunan, PIC, Tahun Goal, Keterangan / Target.

Rule:
- Goal selalu **tahunan**. Periode Goal otomatis 1 Jan – 31 Des tahun aktif.
- **Tidak ada rentang tanggal manual** untuk Goal.
- Goal dapat disimpan Draft.
- Goal baru aktif setelah field wajib valid.
- Default pembuat: CEO / Super Admin (atau user berwenang).
- Tanpa bobot antar-card.

CTA: Simpan Draft, Aktifkan Card.

### KPI Area Card (PRD §18)

**Wajib:**
1. Nama KPI Area.
2. Target Tahunan.
3. PIC.
4. Ekspektasi Hasil.
5. **Pecahan Target Quarter total 100%** (lihat bagian C).
6. **Pecahan Target Bulanan dalam Quarter total 100%** (lihat bagian C).

**Opsional (override 2026-06-29, migrasi 0032):**
- `target_numeric` — basis angka untuk "% capaian vs target" presisi (mis. 1.200 customer).
- `target_unit` — satuan (mis. "customer", "Rp"). Bila KPI kualitatif, boleh dibiarkan kosong dan sistem hanya pakai `Target Tahunan` teks.

Tidak ada field:
- Masa berlaku KPI Area (otomatis mengikuti Goal tahunan).

Default form:
- Isi manual sebagai default. Tombol **Pakai Template** tersedia di dalam Data KPI Area sebagai jalan cepat.

CTA: Simpan Draft, Aktifkan Card.

### Strategy Card (PRD §20)

**Wajib:**
1. Nama Strategy.
2. Pendekatan (cara mengejar KPI Area).
3. PIC (default ikut PIC KPI Area kecuali didelegasikan).
4. **Kontribusi Quarter** (% terhadap target KPI Area di Quarter aktif).
5. Periode eksekusi.

Rule:
- Strategy berada di bawah KPI Area.
- Strategy **fokus pada Quarter aktif**; tidak punya target tahunan.
- Periode eksekusi **readonly** mengikuti Quarter aktif.
- Context bar form menampilkan KPI Area induk, bulan aktif, dan Quarter.
- "Pengaturan lanjutan" (accordion tertutup default) menampung field opsional: alasan/risiko/alternatif ringkas, catatan pendukung, reviewer opsional.
- Tanpa bobot antar-card.

### Initiative Card (PRD §21)

**Wajib:**
1. Nama Initiative.
2. Target hasil.
3. PIC.
4. Tim.
5. Durasi program (mulai & berakhir).

Rule:
- Initiative punya **Chat Initiative otomatis** setelah aktif (lihat file 03).
- Access dihitung backend berdasarkan PIC, Reviewer, card induk, dan permission — form tidak menampilkan setting akses manual.
- Tanpa bobot antar-card.

### Action Plan Card (PRD §22)

**Wajib:**
1. Jenis Action Plan: **One Time** atau **Repeat**.
2. Nama Action Plan.
3. Output / Ekspektasi Hasil.
4. Definition of Done.
5. Bukti yang diminta (jenis).
6. PIC.
7. Reviewer.
8. Deadline.
9. Jam Deadline.

Rule:
- Jika Repeat, tambahan wajib melalui Repeat Setting (bagian D).
- Jika bukti diwajibkan, tidak bisa submit tanpa bukti.
- Jika Nilai Hasil diwajibkan, wajib diisi sebelum submit.
- "Pengaturan lanjutan" (accordion tertutup): Repeat Setting, jenis bukti detail, Nilai Hasil settings, anti self-review.
- Tanpa bobot antar-card.

## C. KPI Area Target Breakdown 100% (PRD §12)

KPI Area **tidak punya masa berlaku sendiri** — mengikuti Goal tahunan. Target dipecah ke Quarter dan Bulan.

### C.1 Total Wajib 100%
- **Quarter breakdown** total wajib 100%.
- **Monthly breakdown di dalam tiap Quarter** total wajib 100%.
- UI wajib menampilkan progress bar total kontribusi.
- Jika total ≠ 100% → **Aktifkan Card ditahan**, popup validasi menjelaskan total yang belum sesuai. Validasi dijalankan **backend**.

### C.2 Bukan Bobot
Target Breakdown = distribusi target **KPI Area itu sendiri lintas waktu**. Bukan bobot antar-card. Guardrail "tanpa bobot planning card" tetap berlaku.

### C.3 Perubahan Periode Berjalan
Kontribusi periode berjalan boleh diedit jika permission mengizinkan:
1. Wajib isi alasan.
2. Masuk Activity Log.
3. Perubahan **tidak boleh** mengubah periode yang sudah closed kecuali Super Admin dengan override rule.

## D. Action Plan One Time vs Repeat

### D.1 One Time
Pekerjaan sekali selesai. Flow:
`Assigned → In Progress → Submit Bukti/Nilai Hasil → Menunggu Review → Selesai / Revisi Diperlukan`

### D.2 Repeat
Pekerjaan berulang. **Repeat bukan entity terpisah**, hanya setting di Action Plan (seperti alarm). Saat aktif → sistem generate **Action Plan Instance** (backend job).

### D.3 Repeat Setting (PRD §23)
Field:
1. Frequency: Harian, Mingguan, Bulanan, Custom.
2. Tanggal mulai.
3. Tanggal berakhir.
4. Jam deadline.
5. Zona waktu.
6. Mode keterlambatan.
7. Expected instances (dihitung).
8. Completed instances (dihitung).
9. Missed instances (dihitung).
10. Repeat Compliance (dihitung).

**Mode keterlambatan:**
| Mode | Perilaku |
|---|---|
| **Ketat / Strict** | Lewat jam deadline & belum submit → langsung **Terlewat**. Default untuk daily control. |
| **Ada toleransi / Grace Period** | Ada toleransi waktu (mis. 30 menit) sebelum Terlewat. |
| **Lewat tetap tercatat / Overdue Allowed** | Boleh submit terlambat; keterlambatan tetap tercatat & memengaruhi discipline/score. |

UI: mirip alarm app, ringkas, tidak seperti spreadsheet, dan menampilkan Repeat Compliance sebagai progress bar.

### D.4 Action Plan Instance
Pekerjaan yang dihasilkan Action Plan Repeat. Contoh: Daily Finance Closing, Daily, 1–30 Juni → 30 instance. Tiap instance punya: Instance date, Due time, Status, Bukti, Nilai Hasil (jika wajib), Waktu submit, Review result, Waktu review, Missed status, Compliance contribution.

## E. Loop Eksekusi: Bukti, Nilai Hasil, Review (PRD §24)

### E.1 Bukti (versioning wajib)
Membuktikan pekerjaan dilakukan. Jenis: File, Foto, Screenshot, PDF, Link (Google Drive / dokumen), Catatan teks.

Rule:
- Jika diwajibkan, Action Plan tidak bisa submit tanpa bukti.
- **Upload bukti baru tidak menghapus versi lama.** Bukti yang sudah disubmit terkunci — PIC tidak boleh hapus/ubah diam-diam.
- Bukti yang sedang direview terkunci.
- Reviewer bisa melihat riwayat versi.
- Revisi = kirim versi baru.

### E.2 Nilai Hasil
Melaporkan output terukur. Tipe: Number, Currency, Percentage, Boolean, Text, Option, Link.

Rule V1.82:
- **Nilai Hasil masuk KPI Area hanya setelah review disetujui.**
- Perubahan menyimpan nilai lama, nilai baru, alasan, dan Activity Log.
- Frontend hanya menampilkan & mengirim request; backend menentukan nilai sah.

Contoh: Daily Finance Closing → "Selisih kas = Rp0"; Daily Marketing Report → "Leads=120, Closing=18, Omset=Rp4.500.000".

### E.3 Bukti vs Nilai Hasil
- **Bukti** menjawab: apakah pekerjaan dilakukan?
- **Nilai Hasil** menjawab: apa hasil pekerjaan itu?

Checklist bukan fokus V1.82. Yang penting: bukti, Nilai Hasil, submit, review.

### E.4 Review
Validasi hasil kerja. Action Plan **wajib** punya Reviewer.

Actions: Setujui, Minta Revisi, Catatan.

Rule:
- Jika review diwajibkan, Action Plan tidak bisa Selesai tanpa approval.
- **PIC tidak boleh approve pekerjaannya sendiri** (anti self-approval divalidasi backend).
- **Minta Revisi wajib alasan** → status jadi **Revisi Diperlukan** → PIC submit ulang versi baru.
- Review harus membantu, bukan terasa menghakimi.

### E.5 Submission Versioning
Tiap submit = submission version baru. Submission lama tidak hilang.

Fields minimal: Submitted by, Submitted at, Submission note, Bukti (versi), Nilai Hasil (jika ada), Version number, Review status, Review reason, Reviewed by, Reviewed at.

## F. Progress, Capaian, Compliance

- **Progress** = pekerjaan berjalan sejauh apa. One Time mengikuti status (Draft=0, In Progress=berjalan, Menunggu Review=hampir, Selesai=100%). Repeat dihitung dari instance (mis. 15/30).
- **Capaian** = apakah hasil tercapai. Bisa Progress selesai tapi Capaian belum (mis. closing terkirim tapi selisih kas Rp500.000). **UI wajib membedakan Progress vs Capaian.**
- **Repeat Compliance** = kedisiplinan menyelesaikan Action Plan Repeat. Formula default: `instance selesai tepat waktu ÷ total instance seharusnya` (mis. 28/30). Dipakai di People & Score Formula. Bukan bobot planning.
- **KPI Gap** = `Aktual ÷ Target periode berjalan` (butuh `target_numeric`). Ditampilkan di Home ("Gap KPI Area") dan detail KPI Area. Untuk KPI kualitatif (tanpa `target_numeric`) → fallback ke sinyal tanpa persentase.

## G. Minimum Breakdown Rule (MBR)

Aturan jumlah minimal card turunan sebelum user bisa lanjut. Dikelola di Settings (PRD §34.4).

**Default Performance:** KPI Area → Strategy = min 3; Strategy → Initiative = min 3; Initiative → Action Plan = min 3.
**Default Development:** Development Area → Problem Statement = min 1; Problem Statement → Initiative = min 1; Initiative → Action Plan = min 3.

**Mode default V1.82: Blokir Tombol Turunan** (tombol tambah tetap terlihat; saat diklik popup arahan muncul menjelaskan card apa yang harus dibuat dulu). Mode lain masih tersedia dari Settings:

1. **Hanya Peringatan** — user tetap bisa lanjut, sistem menampilkan peringatan.
2. **Blokir Aktivasi** — boleh buat Draft, card tidak bisa Aktif sebelum minimum terpenuhi.
3. **Blokir Tombol Turunan** *(default V1.82)* — tidak bisa lanjut buat card turunan berikutnya sebelum minimum terpenuhi.

### Kelengkapan Perencanaan (PRD §7.5)
Rule backend tetap ada, **tetapi tidak wajib jadi panel besar** di UI. Perilaku standar:

1. Tombol tambah turunan tetap terlihat.
2. Saat diklik, jika MBR belum terpenuhi → popup arahan (contoh: *"KPI Area ini baru punya 2 dari 3 Strategy. Tambahkan 1 Strategy lagi dulu, baru tombol + Initiative aktif."*).
3. **Jangan tampilkan error teknis mentah.**

## H. Template & Wizard

### H.1 Goal Template Library (PRD §19)
Goal Template = blueprint, bukan Goal aktif. Membantu user membuat Goal & KPI Area tanpa mulai dari nol. Admin dapat membuat, mengedit, menonaktifkan, dan versioning.

**Update template tidak otomatis mengubah KPI Area aktif** — hanya berlaku untuk KPI Area berikutnya.

### H.2 Template KPI Area bawaan
**Goal "Meningkatkan Omset Penjualan":**
- Sales & Marketing: Menambah Jumlah Customer, Meningkatkan Basket Size.
- Operations: Meningkatkan Output Produk, Meningkatkan Produktivitas.
- Finance & Accounting: Ketersediaan Arus Kas, A/R Collection.
- Human Capital: Meningkatkan Kompetensi Karyawan, Ketersediaan Karyawan (MPP).
- Business Growth: Menambah Cabang Baru, Menciptakan Produk/Brand Baru.

**Goal "Meningkatkan Profit":**
- Sales & Marketing: Increase Sales Price, Minimize Budget.
- Operations: Menurunkan OPEX, Menurunkan Komplain Pelanggan.
- Finance & Accounting: Control Budgeting.
- Human Capital: Mengurangi Biaya Lembur, Menurunkan Turnover.

### H.3 New KPI Area — Template Behavior (PRD §18)
Isi manual sebagai **default**. Template hanya membantu sebagai jalan cepat:

1. Klik **Pakai Template** membuka bottom sheet.
2. User memilih tipe Goal: Omset atau Profit.
3. User memilih area: Sales, Ops, Finance, HC, Growth.
4. User memilih template.
5. Setelah template dipilih, Nama KPI Area, PIC rekomendasi, Target awal, dan Ekspektasi Hasil terisi otomatis.
6. User tetap bisa mengedit semua field.

## I. Lifecycle Card

### I.1 Deadline Change Request (PRD §25)
PIC tidak boleh ubah deadline langsung jika card sudah aktif — hanya bisa **request**. Field: Deadline sekarang, Deadline diminta, Alasan, Dampak jika tidak disetujui. Reviewer dapat **Setujui / Tolak / Minta revisi alasan**. Semua menghasilkan Notifications + Activity Log.

### I.2 Cancellation
Card bisa dibatalkan jika tidak relevan. Wajib alasan (prioritas berubah, solusi diganti, resource/budget tidak tersedia, salah asumsi, risiko terlalu besar, dll). **Cancelled card tidak dihapus**, tetap masuk riwayat.

### I.3 Evaluation (PRD §26)
Initiative yang selesai (atau mendekati selesai) memicu Evaluation. Field: Target tercapai/tidak, Achievement, Faktor berhasil, Faktor gagal, Perlu jadi SOP atau tidak, Perlu rollout atau tidak.

Evaluation default **tidak muncul di awal** — ditampilkan hanya saat Initiative sudah mendekati selesai atau selesai.

### I.4 Archive (PRD §37)
Card selesai/tidak aktif bisa diarsipkan. **Diarsipkan ≠ dihapus.** Archived card tidak tampil di Workspace aktif, tetap bisa ditemukan user berwenang lewat Search atau Archive, dan bisa dipulihkan jika permission mengizinkan. **Hard delete tidak digunakan** untuk governance entities.

Periode lewat boleh diberi visual redup tanpa selalu masuk archive permanen.
