---
type: concept
tags: [prd, prototype, conformance, design, v1.82]
updated: 2026-06-29
sources: 1
---

# Prototype ↔ PRD V1.82 Conformance

Penilaian apakah prototype `design.html` (8.069 baris, phone shell ~430px) sesuai dengan [[spesifikasi-card-dan-eksekusi|PRD FINAL V1.82]] (`PRD_EMS_V1.82_Rencanaapp.md`). Berbeda dari [[design-fidelity-audit]] (yang membandingkan `mobile/` vs prototype) — halaman ini membandingkan **prototype vs PRD**.

## Verdict

**Sesuai — sangat selaras.** PRD V1.82 §1 sendiri menyatakan dokumen diturunkan *dari* prototype ("Prototype mobile UI terakhir" + "Keputusan UX terbaru hasil review prototype"), jadi keselarasan tinggi memang diharapkan. Prototype memenuhi **seluruh 28 Acceptance Criteria (§44)** dan **46 screen wajib (§42)**. Hanya ada penyimpangan kecil/kosmetik.

## Cakupan screen — 46/46

Semua screen wajib §42 hadir sebagai `<section class="screen" id="...">`, termasuk yang sering terlewat: Card Completion helper (`card-completeness`), Evaluation (`evaluation-flow`), Confidential Access, Manual Score Override, Governance, Archive, Global Search. `people-ranking` ada sebagai sub-view People — persis seperti diizinkan catatan §42.

## Area yang cocok persis dengan PRD

| Area PRD | Bukti di `design.html` | Status |
|---|---|---|
| §7.1 Bottom nav: Home, Notif, Workspace, Inbox, Menu | `nav.bottom-nav` (:7293) | Persis |
| §39 Login (logo, tagline, email, password, Masuk, Lupa password, Hubungi Admin) | :5278–5317 | Lengkap |
| §7.3 Card interaction (Detail + panah + `...` + tambah turunan terpisah) | `structure-actions` di tree | Cocok |
| §7.5 Minimum Breakdown Rule kunci tombol + popup | `data-guard-message` (:5569), copy persis PRD | Cocok |
| §11.2 Period Focus (Periode aktif / Juni 2026 / Goal·Q2·Bulan / Ubah) | `period-switcher-panel` (:5525) — ada di Performance & Development | Persis |
| §7.7 Periode lewat redup + popup "Periode sudah lewat" | `showGuardToast(...,"Periode sudah lewat")` (:8016) | Cocok |
| §12/§18 KPI Area: manual default + Pakai Template, tanpa Satuan/masa berlaku, Quarter 100% + Bulanan 100% nested, catatan alasan | :5964–6061 | Sangat akurat |
| §20/§21/§22 Form Strategy/Initiative/Action Plan (field wajib, One Time/Repeat, advanced accordion) | :6078, :6118, :6491 | Cocok |
| §24 Bukti versioning, Review Setujui/Minta Revisi/Catatan + reason wajib, Nilai Hasil setelah approve | :6598, :6688 | Cocok |
| §31 Menu (Akses Cepat, Template, Pengaturan, Admin Lanjutan, Logout) | :6862–6903 | Persis |
| §32 People (tabs; row tanpa PIC/Reviewer/KPI; admin gated) | :6905–6996 | Cocok |

Lihat [[card-model]], [[minimum-breakdown-rule]], [[execution-loop]], [[surfaces]].

## Item terlarang (§5/§6) — bersih

Tidak ada Feed, Company News, Announcement, Watcher, Routine, Checklist Routine, Area Goal, Stories. Ada penegasan eksplisit di JS: *"Goal bukan bobot planning dan bukan mesin hitung KPI formal."* (:7590). Lihat [[scope-guardrails]].

## Penyimpangan kecil

1. **Header global tanpa Icon Notifications** — PRD §7.2 #3 menyebut header = logo + search pill + **icon Notifications** + avatar. Prototype hanya logo + pill "Cari" + avatar (:5343); notifikasi diakses lewat bottom nav "Notif". Penyimpangan paling nyata, tapi minor.
2. **Tab People "Q3 2026"** sementara periode aktif seed = Q2 (Juni 2026) (:6912). Cocok teks literal PRD §32, tapi PRD-nya sendiri inkonsisten (harusnya Q2). Perlu diluruskan saat implementasi.
3. **Kata "bobot" di Score Formula** — *"Total bobot aktif harus 100%"* (:7089) = bobot komponen score (sah), bukan "Bobot planning card" terlarang §6 #21. Tidak melanggar, hanya berpotensi membingungkan penamaan.

## Implikasi

Prototype ↔ PRD sudah selaras. Gap nyata ada di sisi implementasi `mobile/` terhadap prototype/PRD, bukan prototype terhadap PRD — lihat [[ui-prototype-gap]] dan [[design-fidelity-audit]].
