---
type: concept
tags: [mbr, validation, planning]
updated: 2026-07-15
sources: 1
---

# Minimum Breakdown Rule (label UI: **Aturan Pecah Target**)

Aturan jumlah minimal [[card-model|card turunan]] agar target tidak berhenti sebagai rencana besar tanpa aksi. Dikelola admin di [[surfaces#Settings|Menu → Admin Lanjutan]].

- **Backend/admin** memakai istilah `Minimum Breakdown Rule` (MBR).
- **UI user harian** memakai istilah **Aturan Pecah Target** — lebih ramah, tidak jargon.

## V1.83 §34.4: opsional per organization/workspace

Prinsip:

1. Rule bersifat **opsional** per organization/workspace (V1.83 mengizinkan Nonaktif — perubahan dari V1.82 yang default Blokir).
2. Angka minimum dikonfigurasi admin per level card, **bukan angka hard-coded** untuk semua perusahaan.
3. Jika rule Nonaktif, tombol buat turunan mengikuti permission biasa.

## Mode penerapan (V1.83)

| Mode | Perilaku |
|---|---|
| **Nonaktif** | Tombol buat turunan aktif seperti biasa. *(Baru di V1.83.)* |
| **Peringatan saja** | Tombol tetap aktif, sistem menampilkan warning. |
| **Blokir Tombol Turunan** | Tombol turunan dinonaktifkan sampai minimum terpenuhi. Klik → popup arahan. |

*(V1.82 punya 3 mode Peringatan/Blokir Aktivasi/Blokir Turunan tanpa mode Nonaktif. V1.83 menyederhanakan menjadi Nonaktif/Peringatan/Blokir.)*

## Contoh konfigurasi (bukan default hard-coded)

Angka di bawah adalah contoh V1.82 lama (RWT-09 A default 3/3/3/3). V1.83 mengubah statusnya menjadi **contoh konfigurasi** — admin bebas menaikkan/menurunkan/mematikan.

| Performance | Contoh Min | Development | Contoh Min |
|---|---|---|---|
| Strategy → Initiative | 3 | Development Area → Problem Statement | 1 |
| Initiative → Action Plan | 3 | Problem Statement → Action Plan | 1 |
| Action Plan → Task | 3 | Action Plan → Task | 3 |

Seed migrasi `0049` masih memasang default 3 (kompat V1.82); admin org tetap bisa turunkan ke 0 (efektif Nonaktif) lewat Admin Lanjutan.

## Kelengkapan Perencanaan & popup gagal

Indikator di card menampilkan progress turunan vs MBR (mis. "Initiative: 2/3, Belum Lengkap, Tambahkan 1 Initiative lagi"). Jika user coba lanjut padahal belum terpenuhi → popup "Tidak Dapat Melanjutkan" dengan pesan jelas + tombol aksi. **Jangan tampilkan error teknis mentah.**

## Catatan implementasi

> [!warning] Default 3/3/3/3 bisa meledak
> Untuk organisasi kecil, 3/3/3/3 dapat menghasilkan ratusan card wajib. Rekomendasi V1.83: mulai dari **Nonaktif** atau **Peringatan saja**, naikkan ke Blokir setelah tim terbiasa dan target-nya kompleks.

> [!info] Gap kode V1.82 → V1.83
> Kode `mobile/` saat ini hanya mendukung mode Blokir (V1.82 default hard-coded 3). Mode Nonaktif dan Peringatan saja **belum ter-implement** — admin belum bisa memilih mode di Settings. Audit gap kode masih terbuka.

Berkaitan dengan: [[card-model]], [[workspace]], [[surfaces]].
