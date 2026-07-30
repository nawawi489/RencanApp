---
type: entity
tags: [card, hierarchy, core]
updated: 2026-07-30
sources: 2
---

# Card Model

Card adalah unit kerja & unit visual utama [[overview|EMS]]. Setiap unit kerja — dari arah besar sampai pekerjaan harian — berbentuk card. Card hidup dalam salah satu dari dua [[workspace]].

## Hierarki (V1.8.3)

- **Performance:** Goal → Strategy → Initiative → [[action-plan|Action Plan]] → [[action-plan|Task]]
- **Development:** Development Area → Problem Statement / Development Goal → [[action-plan|Action Plan]] → [[action-plan|Task]]

*(Rename V1.8.3 per RWT-01 A: dulu KPI Area/Strategy/Initiative/Action Plan bergeser satu tingkat menjadi Strategy/Initiative/Action Plan/Task; Development chain ikut.)*

## Makna & field wajib tiap card

| Card (V1.8.3) | Pertanyaan kunci | Field wajib aktif (selain Nama & Periode) |
|---|---|---|
| **Goal** | Apa yang ingin dicapai? | PIC/Owner; minimal punya Strategy sesuai [[minimum-breakdown-rule|MBR]]. Default pembuat: CEO/Super Admin. |
| **Strategy** (dulu KPI Area) | Area hasil apa yang harus bergerak? | PIC/Owner, **Target**. Tanpa bobot/satuan/metode wajib. |
| **Initiative** (dulu Strategy) | Bagaimana cara mencapai hasil itu? | **Alasan, Risiko Utama, Alternatif** (wajib agar tidak dangkal); PIC otomatis dari Strategy. |
| **Action Plan** (dulu Initiative) | Program apa yang dijalankan? | Target Hasil; PIC otomatis dari Initiative. Otomatis dapat chat room (**Diskusi Rencana Aksi** — [[surfaces#Inbox]]). |
| **Task** (dulu Action Plan) | Siapa melakukan apa & kapan? | PIC, Reviewer, Deadline, Output, Definition of Done, Prioritas, Repeat Setting. Detail: [[action-plan|Task]]. |
| **Development Area** | Area pengembangan apa? | Untuk System, People, Organization, Technology, Infrastructure, Brand, Governance. |
| **Problem Statement** | Masalah/perbaikan apa? | Dasar Action Plan Development. |

## Kelengkapan Card

Validasi data wajib sebelum card dapat **diaktifkan**. Belum lengkap → card tetap **Draft**, tombol *Aktifkan Card* nonaktif. Aturan field wajib per jenis card = *Card Completion Rule* (dikelola di [[surfaces#Settings|Settings]]). Card "diaktifkan", bukan "dipublish".

## Keterangan Card

Edukasi singkat in-app yang menjelaskan makna tiap jenis card (cegah semua ditulis sebagai Task). Wajib tampil di: form buat card, detail card, popup bantuan, empty state, onboarding.

## Prinsip card turunan

Card turunan **selalu dibuat dari dalam induknya**, bukan memilih induk dari dropdown — sehingga sistem otomatis tahu hubungan strukturnya (lihat [[database-blueprint#Relationship Rules]]).

## Guardrail

**Tidak ada bobot pada planning card.** Status card: Draft, Aktif, Selesai, Diarsipkan. Diarsipkan ≠ dihapus.

## Status card di tree Workspace

Di baris pill kartu tree Workspace, status siklus-hidup card dirender sebagai badge terpisah — jajar dengan pill jenis card (Goal/Strategi/…) dan badge periode. Aturan render:

- **Aktif → implisit** (tak ada badge). Default paling umum; mengurangi noise visual.
- **Draft / Selesai / Diarsipkan** → badge eksplisit dengan warna semantik (`STATUS_TONE`): Draft netral (abu), Selesai `success` (hijau), Diarsipkan netral.
- **Task** (status Ditugaskan/Dikerjakan/Menunggu Review/Revisi Diperlukan/Selesai/Diarsipkan) → selalu ditampilkan; enum tidak mengandung "Aktif" sehingga semua nilai membawa informasi.

Ini menutup makna ganda antara status card ("Aktif" siklus-hidup) dan periode berjalan. Label meta-row `periodState` juga diganti dari "Aktif" → "Periode berjalan" agar pembaca yang hanya membaca meta tak salah paham. Pola yang sama dipakai fix orb hub-card lobby (chip status ganti angka % ambigu — lihat [[workspace-hub-orb]] / PR #226).

Implementasi: `mobile/src/screens/workspace-screen.tsx` `CompactHeaderPills` (`statusLabel` + `statusTone` prop), `mobile/src/lib/workspace-copy.ts` `WS_TREE_COMPACT_COPY.periodState`.

Berkaitan dengan: [[workspace]], [[action-plan]], [[execution-loop]], [[minimum-breakdown-rule]], [[permission-model]].
