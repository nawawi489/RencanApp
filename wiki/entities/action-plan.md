---
type: entity
tags: [card, task, action-plan, execution, repeat]
updated: 2026-07-11
sources: 2
---

# Action Plan & Task (V1.8.3)

> **Rename V1.8.3 (rename-workspace-terminology):** unit eksekusi konkret sekarang bernama **Task** (dulu "Action Plan"). Program-unit di atasnya bernama **Action Plan** (dulu "Initiative"). Halaman ini menjelaskan keduanya karena keduanya sering dipahami bersamaan. Detail rename: [`specs/rename-workspace-terminology.md`](../../specs/rename-workspace-terminology.md).

## Action Plan (level 3 — Program Unit)

Program eksekusi di bawah Initiative atau Problem Statement — dulu bernama "Initiative". Field wajib aktif: Nama, Target hasil, PIC, Tim, Durasi program (mulai–berakhir). Punya **Diskusi Rencana Aksi** (chat room) otomatis setelah aktif (per RWT-04 A — chat surface tetap di level 3 struktural, dulu bernama "Initiative Chat"). Bisa memiliki Task turunan.

## Task (level 4 — unit eksekusi)

Unit eksekusi konkret di [[card-model|hierarki card]], selalu di bawah Action Plan. Menjawab "siapa melakukan apa dan kapan?". Bisa **One Time** atau **Repeat**. Semantik lama = "Action Plan" pra-rename.

### Field wajib aktif

Nama, PIC, **Reviewer** (wajib), Tanggal Mulai, Deadline, Output yang Diharapkan, Definition of Done, Prioritas, Repeat Setting. PIC eksekutor wajib ditentukan jelas (tidak otomatis ikut induk seperti card lain).

### One Time

Pekerjaan sekali selesai. Flow:
`Assigned → In Progress → Submit Bukti/Nilai Hasil → Menunggu Review → Selesai / Revisi Diperlukan`

### Repeat

Pekerjaan berulang seperti alarm. **Bukan entity terpisah** — hanya setting di Task. Field tambahan: Repeat Frequency (Daily/Weekly/Monthly/Custom), Tanggal Mulai & Akhir, Jam Deadline, Aturan Terlewat, Grace Period (jika dipilih).

#### Aturan Terlewat

| Mode | Perilaku |
|---|---|
| **Strict** | Lewat jam deadline & belum submit → langsung Terlewat (default daily control). |
| **Grace Period** | Ada toleransi waktu sebelum Terlewat. |
| **Overdue Allowed** | Boleh submit terlambat; keterlambatan tetap tercatat & memengaruhi score. |

### Instance

Task Repeat menghasilkan **Task Instance** terjadwal (dulu "Action Plan Instance"). Contoh: Daily Finance Closing periode 1–30 Juni → 30 instance. Tiap instance punya Tanggal, Jam Deadline, PIC, Reviewer, Status, Bukti, Nilai Hasil, waktu submit & review. Generasi instance & penandaan Terlewat dijalankan job terjadwal ([[tech-stack|Edge Functions + pg_cron]]) — nama pg_cron `generate_action_plan_instances` **di-FREEZE** per RWT-05 A + §7.7 (nama tetap, body update ke tabel baru).

### Progress vs Capaian vs Compliance

- **Progress** = seberapa jauh berjalan (One Time ikut status; Repeat = instance selesai / total, mis. 15/30).
- **Capaian** = apakah hasil tercapai. EMS **wajib membedakan** Progress vs Capaian (bisa selesai tapi belum tercapai).
- **Repeat Compliance** = instance selesai tepat waktu ÷ total seharusnya. Dipakai di [[surfaces#People|People]] & [[score-formula]].

Berkaitan dengan: [[card-model]], [[execution-loop]], [[score-formula]].

## Mapping identifier post-rename

| Layer | Level 3 (Action Plan) | Level 4 (Task) | Level 4 Instance |
|---|---|---|---|
| Tabel DB | `public.action_plans` (ex `initiatives`) | `public.tasks` (ex `action_plans`) | `public.task_instances` (ex `action_plan_instances`) |
| FK kolom | (dari Task) `action_plan_id` | (dari Instance) `task_id` | — |
| TS type | `ActionPlan` | `Task` | `TaskInstance` |
| Route folder | `mobile/src/app/(app)/action-plan/` | `mobile/src/app/(app)/task/` | `mobile/src/app/(app)/task/instance/` |
| Chat surface | **"Diskusi Rencana Aksi"** (di sini) | reply context banner ke Task | — |
