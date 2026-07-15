---
type: concept
tags: [scope, guardrails, anti-scope-creep, decision]
updated: 2026-07-15
sources: 2
---

# Scope Guardrails

Batas scope permanen [[overview|Rencanapp V1.83]] (PRD V1.83 §6). Berfungsi sebagai guardrail anti-scope-creep: **jika ada usulan fitur dalam daftar "ditolak", tolak.**

## Masuk V1.83

Auth, User profile, Organization/Department/Position/Team, Role template & permission, dua [[workspace]], Goal & Strategy Template Library (V1.83: kosong by default), semua [[card-model|card]], [[action-plan|Task One Time/Repeat/Instance]], **Period Focus Engine** (periode aktif Bulan/Quarter, Goal tahunan konteks — §7.6), **Strategy Target Breakdown** (target tahunan dipecah ke Quarter/Bulan, total wajib 100% — §12), Kelengkapan Card (backend rule + popup), Keterangan Card, [[minimum-breakdown-rule|MBR / Aturan Pecah Target]] (V1.83: opsional 3 mode), Kelengkapan Perencanaan (backend rule + popup), [[execution-loop|Bukti/Nilai Hasil/Review]], Deadline Change Request, Evaluation (V1.83: dipicu di Action Plan), [[audit-governance|Activity Log & Governance Violation]] (V1.83: Admin Lanjutan), Notifications, Inbox Diskusi Rencana Aksi, People (di dalam [[surfaces#Menu|Menu]], V1.83 de-scoring), [[score-formula|Score Formula]] (V1.83: Admin Lanjutan), Repeat Compliance, basic ranking, Menu, Settings, Archive, Search, Confidential Access (Admin Lanjutan), Manual Score Override (Admin Lanjutan).

## Ditolak (jangan bangun)

Feed, Company News, Announcement, CEO Broadcast, SOP Center penuh, Knowledge Center, HRIS penuh, Payroll, Inventory, CRM, **External chat integration** (dulu "WhatsApp integration" — V1.83 rename generik), Google Calendar integration, AI Assistant, AI Review, Native Android/iOS, Routine entity, Checklist Routine, Watcher, **Area Goal layer**, **metric child table di bawah Area Goal** (dulu "KPI child table" — V1.83 istilah "KPI" diganti "metric/indikator"), **Bobot planning card**, Social reaction/Story/Reels.

## Guardrail filosofis

- **Tanpa bobot pada planning card** — bobot hanya ada di [[score-formula]].
- Card "diaktifkan", bukan "dipublish/diposting".
- UI Bahasa Indonesia; hindari istilah Parent/Child/Publish/Validation Error di UI bisnis.

> [!info] Kontribusi/Target Breakdown ≠ Bobot planning card
> V1.83 tetap menegakkan (dari V1.8.2) **Strategy Target Breakdown** (§12.2: total kontribusi periode wajib 100%) **dan tetap menolak** "Bobot planning card". Keduanya beda konsep dan sengaja dipisah:
> - **Diizinkan** — *target-phasing satu kartu atas dirinya sendiri*: target tahunan Strategy dipecah lintas Quarter/Bulan (baris breakdown ber-key `strategy_id + periode`). Bukan layer/hierarki baru.
> - **Ditolak** — *bobot antar-kartu untuk skor*: kartu turunan membawa bobot yang mengakumulasi ke skor parent. Itu hanya ada di [[score-formula]].
> Implementasi Target Breakdown **wajib** sebagai baris pada Strategy, **bukan** tabel kartu anak (kalau jadi tabel kartu anak = melanggar "metric child table di bawah Area Goal").

> [!info] V1.83 §18 field opsional Satuan / `target_numeric`
> Override 2026-06-29 (migrasi 0032) TETAP berlaku di V1.83: Strategy boleh punya `target_numeric` + `target_unit` opsional untuk "% gap" presisi. Bukan pelanggaran scope — ini bukan "Bobot planning card", hanya target-phasing terukur pada satu kartu.

> [!warning] Tafsiran "Native app"
> PRD melarang "Native app" sebagai scope creep. [?] Tafsiran tim: ini melarang penambahan fitur native berlebih, bukan melarang React Native sebagai fondasi mobile ([[tech-stack]]). Perlu konfirmasi pemilik produk.

Berkaitan dengan: [[overview]], [[tech-stack]], [[database-blueprint]], [[card-model]].
