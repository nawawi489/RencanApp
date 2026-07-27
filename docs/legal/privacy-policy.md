# Kebijakan Privasi — Rencanapp

**Versi**: 1.0
**Berlaku sejak**: (isi tanggal publikasi)
**Bahasa otoritatif**: Bahasa Indonesia.

Draft ini dibuat untuk memenuhi UU 27/2022 tentang Pelindungan Data Pribadi (UU PDP), Google Play Data safety, dan iOS App Privacy. Setelah diterjemahkan (bila perlu) dan diperiksa penasihat hukum, dokumen ini wajib tayang di URL publik dan tertaut dari (a) listing di App Store + Play Store, (b) layar login dan onboarding aplikasi.

---

## 1. Identitas Pengendali Data

- **Nama badan hukum**: (isi nama PT / perorangan pengelola Rencanapp)
- **Alamat surat-menyurat**: (isi alamat resmi)
- **Kontak pertanyaan / permohonan hak subjek data**: privasi@rencanapp.com (owner action: buat mailbox ini)
- **Petugas Pelindungan Data (DPO)**: (opsional untuk badan usaha kecil; wajib bila memproses data skala besar)

Pertanyaan atau permintaan yang berkaitan dengan data pribadi Anda ditangani dalam **paling lama 3×24 jam kerja** sejak diterima.

## 2. Data yang Kami Proses

Sebagai aplikasi manajemen kinerja untuk organisasi kerja, Rencanapp memproses kategori data berikut yang Anda dan organisasi Anda berikan:

| Kategori | Contoh | Tujuan |
|---|---|---|
| Identitas dasar | nama lengkap, email login, jabatan, foto profil | otentikasi, tampilan di seluruh app, direktori anggota |
| Data organisasi | organisasi tempat bekerja, departemen, atasan, role/hak akses | penegakan hak akses, pemisahan data antar-organisasi |
| Data kinerja | Card (Goal/Strategi/Inisiatif/Rencana Aksi/Tugas), skor, evaluasi, riwayat status | fungsi inti aplikasi |
| Konten yang Anda unggah | lampiran bukti, komentar, pesan chat internal | kolaborasi + arsip |
| Metadata sesi | waktu login, alamat IP, tipe perangkat, user agent | keamanan (deteksi anomali), diagnosa insiden |
| Log aktivitas | tindakan (buat/ubah/hapus Card, submit bukti, dst.) | audit dan akuntabilitas organisasi |
| Token push | Expo/FCM/APNs push token | mengirim notifikasi |
| Data crash + telemetri (opsional) | stacktrace + environment tag ter-anonim | mendeteksi bug tanpa PII (email/JWT/token direduksi otomatis sebelum kirim) |

**Kami TIDAK memproses**: nomor KTP/NIK, nomor rekening/kartu, biometrik, data anak (aplikasi hanya untuk pengguna 17+ pekerja profesional), lokasi GPS, kontak/kalender perangkat, kesehatan.

## 3. Dasar Pemrosesan (Pasal 20 UU PDP)

- **Pelaksanaan perjanjian**: sebagian besar pemrosesan didasarkan pada perjanjian antara organisasi Anda (pemberi kerja) dengan penyedia layanan Rencanapp. Organisasi berperan sebagai pengendali data pribadi karyawan; Rencanapp adalah prosesor data.
- **Kewajiban hukum**: menyimpan log tertentu untuk kepatuhan audit.
- **Kepentingan sah**: keamanan sistem (deteksi login mencurigakan, redaksi PII pada telemetri).
- **Persetujuan**: notifikasi push (dapat dicabut kapan saja lewat pengaturan sistem).

## 4. Bagaimana Kami Melindungi Data

- Enkripsi transport: seluruh koneksi via HTTPS/TLS.
- Enkripsi at-rest: database Supabase dengan enkripsi disk default.
- Isolasi antar-organisasi (multi-tenant): setiap tabel yang menyimpan data user diproteksi Row Level Security PostgreSQL. Anggota organisasi A tidak dapat membaca data organisasi B.
- Kontrol akses berbasis role: hak akses per-organisasi ditetapkan admin, dievaluasi di sisi server setiap permintaan.
- Redaksi PII pada telemetri: kata sandi, JWT, dan email otomatis disamarkan sebelum dikirim ke sistem monitoring kesalahan (Sentry).
- Prinsip minimum privilege: penyedia hanya menyimpan data yang diperlukan untuk fitur aktif; ekspor massal hanya lewat jalur yg diaudit.

## 5. Berbagi Data dengan Pihak Ketiga

Kami HANYA berbagi data pribadi dengan penyedia infrastruktur berikut, yang bertindak sebagai prosesor lanjutan:

| Prosesor | Yurisdiksi | Data yang diteruskan | Tujuan |
|---|---|---|---|
| Supabase (database + autentikasi) | Singapura (ap-southeast-1) | seluruh data aplikasi | penyimpanan + otentikasi |
| Expo / EAS (build + OTA update) | Amerika Serikat | metadata build, push token | distribusi update aplikasi + notifikasi |
| Sentry (opsional, error telemetri) | Amerika Serikat / UE | stacktrace tersanitasi | deteksi bug |
| Firebase Cloud Messaging (Android) | Amerika Serikat | push token | pengiriman notifikasi |
| Apple Push Notification Service (iOS) | Amerika Serikat | push token | pengiriman notifikasi |

Kami TIDAK menjual data pribadi Anda ke pengiklan, pialang data, atau pihak lain, dalam bentuk apa pun.

## 6. Transfer Data Lintas Batas

Pengolahan sebagian data dilakukan di server yang berlokasi di luar wilayah Indonesia (lihat tabel di atas). Kami hanya bekerja dengan penyedia yang menerapkan standar perlindungan yang setara atau lebih ketat (SOC 2, ISO 27001, GDPR-compliant DPA). Standar perlindungan setara ini adalah persyaratan Pasal 56 UU PDP.

## 7. Retensi

- Data akun aktif: selama akun Anda aktif di organisasi.
- Log aktivitas + audit: 24 bulan (kebutuhan audit + investigasi insiden).
- Data crash/telemetri: 30 hari (Sentry free-tier default).
- Setelah anonimisasi (lihat §9): baris skor dan audit tetap disimpan tanpa identitas Anda demi integritas historis, sesuai kepentingan sah organisasi.

## 8. Hak Anda sebagai Subjek Data (Pasal 5–15 UU PDP)

Anda berhak:

1. **Mengakses** data pribadi Anda — lewat fitur "Ekspor Data" di Kelola Akun.
2. **Meminta koreksi** data yang tidak akurat — lewat "Profil Saya" atau permohonan ke admin.
3. **Meminta penghapusan / anonimisasi** — lewat "Kelola Akun → Ajukan penghapusan akun" atau email ke privasi@rencanapp.com.
4. **Membatasi pemrosesan** dalam kondisi tertentu (mis. selama sengketa keakuratan data).
5. **Portabilitas** — hasil ekspor berformat JSON yang dapat dibaca mesin.
6. **Menarik persetujuan** — untuk notifikasi push, kapan saja via pengaturan sistem.
7. **Mengajukan pengaduan** ke Lembaga Pelindungan Data Pribadi (bila sudah efektif berdiri) atau ke pengendali data secara langsung.

Kami menanggapi permohonan hak subjek data dalam **paling lama 3×24 jam kerja** sejak permohonan diterima dan identitas Anda terverifikasi.

## 9. Penghapusan Akun

Karena Rencanapp memproses data kinerja yang harus dipertahankan untuk kepatuhan audit organisasi, penghapusan akun dilakukan melalui **anonimisasi**, bukan penghapusan penuh:

- Nama tampilan Anda menjadi "Pengguna [dihapus]".
- Email digantikan alamat sintetis internal (`<uuid>@anonymized.local`); Anda tidak dapat login lagi.
- Jabatan dihapus, akun dinonaktifkan.
- Metadata sesi (alamat IP, user agent) di log login dihapus.
- Baris skor + log audit historis tetap ada tetapi TIDAK LAGI terhubung ke identitas Anda.

Permintaan penghapusan dapat diajukan:

- Dari dalam aplikasi: **Menu → Kelola Akun → Ajukan penghapusan akun**.
- Melalui email ke privasi@rencanapp.com (untuk yg tidak lagi punya akses ke aplikasi).

## 10. Notifikasi Pelanggaran Data (Pasal 46 UU PDP)

Bila terjadi kegagalan pelindungan data pribadi yang berdampak pada Anda, kami akan memberitahukan Anda dan Lembaga Pelindungan Data Pribadi (bila telah beroperasi) **paling lambat 3×24 jam** sejak pelanggaran diketahui, memuat jenis data yang terdampak, dampak potensial, dan langkah mitigasi yang sedang atau akan kami lakukan.

## 11. Perubahan Kebijakan

Perubahan material atas kebijakan ini akan diberitahukan melalui banner in-app dan/atau email, minimal 30 hari sebelum berlaku efektif. Versi historis kebijakan disimpan di URL publik yang sama untuk transparansi.

## 12. Hukum dan Yurisdiksi yang Berlaku

Kebijakan ini tunduk pada hukum Republik Indonesia. Sengketa yang tidak dapat diselesaikan secara musyawarah diselesaikan di pengadilan yang berwenang di (isi wilayah).

## 13. Kontak

Pertanyaan tentang kebijakan ini atau hak subjek data Anda: **privasi@rencanapp.com**.
