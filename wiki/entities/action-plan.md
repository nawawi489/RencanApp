---
type: entity
tags: [card, action-plan, execution, repeat]
updated: 2026-06-22
sources: 2
---

# Action Plan

Unit eksekusi konkret di [[card-model|hierarki card]], selalu di bawah Initiative. Menjawab "siapa melakukan apa dan kapan?". Bisa **One Time** atau **Repeat**.

## Field wajib aktif

Nama, PIC, **Reviewer** (wajib), Tanggal Mulai, Deadline, Output yang Diharapkan, Definition of Done, Prioritas, Repeat Setting. PIC eksekutor wajib ditentukan jelas (tidak otomatis ikut induk seperti card lain).

## One Time

Pekerjaan sekali selesai. Flow:
`Assigned → In Progress → Submit Bukti/Nilai Hasil → Menunggu Review → Selesai / Revisi Diperlukan`

## Repeat

Pekerjaan berulang seperti alarm. **Bukan entity terpisah** — hanya setting di Action Plan. Field tambahan: Repeat Frequency (Daily/Weekly/Monthly/Custom), Tanggal Mulai & Akhir, Jam Deadline, Aturan Terlewat, Grace Period (jika dipilih).

### Aturan Terlewat

| Mode | Perilaku |
|---|---|
| **Strict** | Lewat jam deadline & belum submit → langsung Terlewat (default daily control). |
| **Grace Period** | Ada toleransi waktu sebelum Terlewat. |
| **Overdue Allowed** | Boleh submit terlambat; keterlambatan tetap tercatat & memengaruhi score. |

## Instance

Action Plan Repeat menghasilkan **Action Plan Instance** terjadwal. Contoh: Daily Finance Closing periode 1–30 Juni → 30 instance. Tiap instance punya Tanggal, Jam Deadline, PIC, Reviewer, Status, Bukti, Nilai Hasil, waktu submit & review. Generasi instance & penandaan Terlewat dijalankan job terjadwal ([[tech-stack|Edge Functions + pg_cron]]).

## Progress vs Capaian vs Compliance

- **Progress** = seberapa jauh berjalan (One Time ikut status; Repeat = instance selesai / total, mis. 15/30).
- **Capaian** = apakah hasil tercapai. EMS **wajib membedakan** Progress vs Capaian (bisa selesai tapi belum tercapai).
- **Repeat Compliance** = instance selesai tepat waktu ÷ total seharusnya. Dipakai di [[surfaces#People|People]] & [[score-formula]].

Berkaitan dengan: [[card-model]], [[execution-loop]], [[score-formula]].
