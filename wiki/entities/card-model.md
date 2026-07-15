---
type: entity
tags: [card, hierarchy, core]
updated: 2026-06-22
sources: 2
---

# Card Model

Card adalah unit kerja & unit visual utama [[overview|EMS]]. Setiap unit kerja — dari arah besar sampai pekerjaan harian — berbentuk card. Card hidup dalam salah satu dari dua [[workspace]].

## Hierarki

- **Performance:** Goal → KPI Area → Strategy → Initiative → [[action-plan|Action Plan]]
- **Development:** Development Area → Problem Statement / Development Goal → Initiative → [[action-plan|Action Plan]]

## Makna & field wajib tiap card

| Card | Pertanyaan kunci | Field wajib aktif (selain Nama & Periode) |
|---|---|---|
| **Goal** | Apa yang ingin dicapai? | PIC/Owner; minimal punya KPI Area sesuai [[minimum-breakdown-rule|MBR]]. Default pembuat: CEO/Super Admin. |
| **KPI Area** | Area hasil apa yang harus bergerak? | PIC/Owner, **Target**. Tanpa bobot/satuan/metode wajib. |
| **Strategy** | Bagaimana cara mencapai hasil itu? | **Alasan, Risiko Utama, Alternatif** (wajib agar tidak dangkal); PIC otomatis dari KPI Area. |
| **Initiative** | Program apa yang dijalankan? | Target Hasil; PIC otomatis dari Strategy. Otomatis dapat chat room ([[surfaces#Inbox]]). |
| **Action Plan** | Siapa melakukan apa & kapan? | PIC, Reviewer, Deadline, Output, Definition of Done, Prioritas, Repeat Setting. Detail: [[action-plan]]. |
| **Development Area** | Area pengembangan apa? | Untuk System, People, Organization, Technology, Infrastructure, Brand, Governance. |
| **Problem Statement** | Masalah/perbaikan apa? | Dasar Initiative Development. |

## Kelengkapan Card

Validasi data wajib sebelum card dapat **diaktifkan**. Belum lengkap → card tetap **Draft**, tombol *Aktifkan Card* nonaktif. Aturan field wajib per jenis card = *Card Completion Rule* (dikelola di [[surfaces#Settings|Settings]]). Card "diaktifkan", bukan "dipublish".

## Keterangan Card

Edukasi singkat in-app yang menjelaskan makna tiap jenis card (cegah semua ditulis sebagai Action Plan). Wajib tampil di: form buat card, detail card, popup bantuan, empty state, onboarding.

## Prinsip card turunan

Card turunan **selalu dibuat dari dalam induknya**, bukan memilih induk dari dropdown — sehingga sistem otomatis tahu hubungan strukturnya (lihat [[database-blueprint#Relationship Rules]]).

## Guardrail

**Tidak ada bobot pada planning card.** Status card: Draft, Aktif, Selesai, Diarsipkan. Diarsipkan ≠ dihapus.

Berkaitan dengan: [[workspace]], [[action-plan]], [[execution-loop]], [[minimum-breakdown-rule]], [[permission-model]].
