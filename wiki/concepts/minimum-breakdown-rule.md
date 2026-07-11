---
type: concept
tags: [mbr, validation, planning]
updated: 2026-07-11
sources: 1
---

# Minimum Breakdown Rule (MBR)

Aturan jumlah minimal [[card-model|card turunan]] sebelum user bisa lanjut ke level berikutnya. Tujuan: memaksa breakdown yang cukup sebelum eksekusi, mencegah Goal/Strategy dangkal. Dikelola di [[surfaces#Settings|Settings]].

## Default (V1.8.3)

Per **RWT-09 A** (2026-07-11), pola 3/3/3 lama menjadi 3/3/3/**3** dengan level Task ditambahkan; seed migrasi memasang default 3, admin org boleh menurunkan ke 0.

| Performance | Min | Development | Min |
|---|---|---|---|
| Strategy → Initiative | 3 | Development Area → Problem Statement | 1 |
| Initiative → Action Plan | 3 | Problem Statement → Action Plan | 1 |
| Action Plan → Task | 3 | Action Plan → Task | 3 |

## Mode penerapan (§40)

1. **Hanya Peringatan** — user tetap bisa lanjut, sistem memperingatkan.
2. **Blokir Aktivasi** — boleh buat Draft, card tidak bisa Aktif sebelum minimum terpenuhi.
3. **Blokir Akses Turunan Berikutnya** — tidak bisa membuat card turunan berikutnya sebelum minimum terpenuhi.

## Kelengkapan Perencanaan & popup gagal

Indikator di card menampilkan progress turunan vs MBR (mis. "Initiative: 2/3, Belum Lengkap, Tambahkan 1 Initiative lagi"). Jika user coba lanjut padahal belum terpenuhi → popup "Tidak Dapat Melanjutkan" dengan pesan jelas + tombol aksi. **Jangan tampilkan error teknis mentah.**

## Catatan implementasi

> [!warning] Default 3/3/3/3 bisa meledak
> Untuk organisasi kecil, 3/3/3/3 dapat menghasilkan ratusan card wajib. Rekomendasi: mulai mode **Hanya Peringatan**, naikkan ke Blokir setelah tim terbiasa (`BUILD-PLAN.md` Fase 5).

Berkaitan dengan: [[card-model]], [[workspace]], [[surfaces]].
