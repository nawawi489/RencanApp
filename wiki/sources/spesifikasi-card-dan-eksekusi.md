---
type: source
tags: [ems, spec, execution, source]
updated: 2026-06-22
sources: 1
---

# Source · 02 Spesifikasi Card & Eksekusi

Ringkasan spesifikasi fungsional (`prd/02-spesifikasi-card-dan-eksekusi.md`): field & validasi tiap card, kelengkapan, loop eksekusi, Action Plan repeat, MBR, template, dan lifecycle card.

## Inti

- **Kelengkapan Card** = validasi field wajib sebelum card bisa Aktif; sebelum lengkap card tetap Draft. Aturan per jenis card via *Card Completion Rule* (§43). Lihat [[card-model#Kelengkapan Card]].
- **Field wajib tiap card** berbeda — paling ketat: Strategy (wajib Alasan, Risiko, Alternatif) dan Action Plan (PIC, Reviewer, deadline, output, DoD, repeat setting). Detail di [[card-model]] dan [[action-plan]].
- **Action Plan One Time vs Repeat** — Repeat bukan entity terpisah, hanya setting; saat aktif menghasilkan [[action-plan#Instance|Action Plan Instance]] terjadwal.
- **Loop eksekusi** Bukti → Nilai Hasil → Review dengan submission versioning & evidence locking — lihat [[execution-loop]].
- **Minimum Breakdown Rule (MBR)** — jumlah minimal card turunan; tiga mode penerapan. Lihat [[minimum-breakdown-rule]].
- **Template & Wizard** — Goal Template Library + Goal Wizard 7-step; template tidak otomatis mengubah Goal aktif (§50).
- **Lifecycle** — Deadline Change Request, Cancellation, Evaluation, Archive. **Diarsipkan ≠ dihapus; hard delete tidak dipakai untuk governance entities.**

## Catatan implementasi

> [!warning] MBR default bisa meledak
> Default 3/3/3 untuk organisasi kecil dapat menghasilkan ratusan card wajib. Rekomendasi: mulai mode **Hanya Peringatan**, naikkan ke Blokir setelah tim terbiasa (lihat `BUILD-PLAN.md` Fase 5).

Berkaitan dengan: [[card-model]], [[action-plan]], [[execution-loop]], [[minimum-breakdown-rule]].
