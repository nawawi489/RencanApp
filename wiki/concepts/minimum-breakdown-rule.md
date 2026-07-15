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

1. Rule bersifat **opsional** per organization/workspace.
2. Angka minimum dikonfigurasi admin per level card, **bukan angka hard-coded** untuk semua perusahaan.
3. Jika rule Nonaktif, tombol buat turunan mengikuti permission biasa.

## Mode penerapan (V1.83)

| Mode | Perilaku |
|---|---|
| **Nonaktif** | Tombol buat turunan aktif seperti biasa. *(Baru di V1.83.)* |
| **Peringatan saja** | Tombol tetap aktif, sistem menampilkan warning. |
| **Blokir Tombol Turunan** | Tombol turunan dinonaktifkan sampai minimum terpenuhi. Klik → popup arahan. |

## Contoh konfigurasi (bukan default)

Angka di bawah adalah contoh **rekomendasi** untuk organisasi dewasa — bukan default yang di-seed sistem. Admin bebas menaikkan/menurunkan/mematikan.

| Performance | Contoh | Development | Contoh |
|---|---|---|---|
| Strategy → Initiative | 3 | Development Area → Problem Statement | 1 |
| Initiative → Action Plan | 3 | Problem Statement → Action Plan | 1 |
| Action Plan → Task | 3 | Action Plan → Task | 3 |

## Kelengkapan Perencanaan & popup gagal

Indikator di card menampilkan progress turunan vs MBR (mis. "Initiative: 2/3, Belum Lengkap, Tambahkan 1 Initiative lagi"). Jika user coba lanjut padahal belum terpenuhi → popup "Tidak Dapat Melanjutkan" dengan pesan jelas + tombol aksi. **Jangan tampilkan error teknis mentah.**

## Catatan implementasi

> [!info] Status kode (audit 2026-07-15)
> Kolom `enforcement_mode` sudah ada sejak migrasi `0011:32-34` dengan tiga nilai enum: `hanya_peringatan` (= "Peringatan saja"), `blokir_aktivasi` (blokir aktivasi kartu induk — konsep V1.82 lama), `blokir_akses_turunan` (= "Blokir Tombol Turunan"). Semua enforcement jalan: trigger BEFORE INSERT di `0046:2524-2600`, gate aktivasi di `0046:337`, guard client di `mobile/src/components/mbr-completion.tsx`. Admin bisa pilih mode + ubah angka lewat `settings-mbr.tsx`.

> [!warning] Gap V1.82 → V1.83 (belum landing)
> 1. **Mode `Nonaktif` absen** — CHECK constraint `0011:32-34` hanya mengenumeratsi 3 nilai; picker di `settings-mbr.tsx:120-146` juga 3. V1.83 memerlukan nilai keempat.
> 2. **`blokir_aktivasi` justru surplus** — V1.83 §34.4 hanya mendaftar 3 mode dan activation-blocking bukan salah satunya. Perlu keputusan: migrasi drop, remap, atau tetap dipertahankan sebagai backend-only.
> 3. **Label UI "Aturan Pecah Target" nihil** — semua copy klien (`settings-mbr.tsx:172,175,186`, `menu.tsx:119`, `glossary.ts:52`) masih "Minimum Breakdown Rule". Backend boleh keep sesuai PRD §7.5, tapi render-layer wajib pindah.

> [!warning] Bug pre-existing: seed row orphan pasca-rename
> Seed sistem di `0011:61-66` semuanya `min_count = 1` (bukan 3), dan masih ber-taksonomi pre-rename: `goal→kpi_area`, `kpi_area→strategy`, `problem_statement→initiative`. Tidak ada migrasi apapun yang re-key mereka (`grep "update public.minimum_breakdown_rules"` di 51 migrasi = 0 hit). Sementara trigger post-rename di `0046:2540-2562` mencari taksonomi baru: `('goal','strategy')`, `('action_plan','task')`, `('problem_statement','action_plan')`. Tidak ada system row untuk pasangan ini → `current_minimum_breakdown_rule` NULL → fail-open. Dampak enforcement praktisnya kecil (semua row seed bermode `hanya_peringatan`/`blokir_aktivasi`, bukan `blokir_akses_turunan` yang jadi jalur trigger), tapi berarti 3 baris seed kini dead data dan 2 baris dipetakan ke pasangan yang berbeda semantiknya.

> [!warning] Bug: stale error copy
> `0046:2233` masih raise `'Aturan Goal → KPI Area dikunci...'` di dalam branch `goal`/`strategy` (KPI Area = nama pre-rename Strategy). Logic-nya benar, string-nya stale.

Berkaitan dengan: [[card-model]], [[workspace]], [[surfaces]].
