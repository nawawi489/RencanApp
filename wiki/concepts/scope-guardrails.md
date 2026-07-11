---
type: concept
tags: [scope, guardrails, anti-scope-creep, decision]
updated: 2026-06-27
sources: 2
---

# Scope Guardrails

Batas scope permanen [[overview|EMS V1.8.2]] (PRD V1.8.2 §6). Berfungsi sebagai guardrail anti-scope-creep: **jika ada usulan fitur dalam daftar "ditolak", tolak.**

## Masuk V1.8.2

Auth, User profile, Organization/Department/Position/Team, Role template & permission, dua [[workspace]], Goal & Strategy Template Library, semua [[card-model|card]], [[action-plan|Task One Time/Repeat/Instance]], **Period Focus Engine** (periode aktif Bulan/Quarter, Goal tahunan konteks — §7.6), **Strategy Target Breakdown** (target tahunan dipecah ke Quarter/Bulan, total wajib 100% — §12), Kelengkapan Card (backend rule + popup), Keterangan Card, [[minimum-breakdown-rule|MBR]], Kelengkapan Perencanaan (backend rule + popup), [[execution-loop|Bukti/Nilai Hasil/Review]], [[audit-governance|Activity Log & Governance Violation]], Notifications, Inbox Initiative Chat, People (di dalam [[surfaces#Menu slot 5 V1.8.2 §7.1 §31|Menu]]), [[score-formula|Score Formula]], Repeat Compliance, basic ranking, Menu, Settings, Archive, Search, Confidential Access, Manual Score Override.

## Ditolak (jangan bangun)

Feed, Company News, Announcement, CEO Broadcast, SOP Center penuh, Knowledge Center, HRIS penuh, Payroll, Inventory, CRM, WhatsApp integration, Google Calendar integration, AI Assistant, AI Review, Native Android/iOS, Routine entity, Checklist Routine, Watcher, **Area Goal layer**, **KPI child table di bawah Area Goal**, **Bobot planning card**, Social reaction/Story/Reels.

## Guardrail filosofis

- **Tanpa bobot pada planning card** — bobot hanya ada di [[score-formula]].
- Card "diaktifkan", bukan "dipublish/diposting".
- UI Bahasa Indonesia; hindari istilah Parent/Child/Publish/Validation Error di UI bisnis.

> [!info] Kontribusi/Target Breakdown ≠ Bobot planning card
> V1.8.2 memasukkan **Strategy Target Breakdown** (§12.2: total kontribusi periode wajib 100%) **dan tetap menolak** "Bobot planning card". Keduanya beda konsep dan sengaja dipisah:
> - **Diizinkan** — *target-phasing satu kartu atas dirinya sendiri*: target tahunan Strategy dipecah lintas Quarter/Bulan (baris breakdown ber-key `strategy_id + periode`). Bukan layer/hierarki baru.
> - **Ditolak** — *bobot antar-kartu untuk skor*: kartu turunan membawa bobot yang mengakumulasi ke skor parent. Itu hanya ada di [[score-formula]].
> Implementasi Target Breakdown **wajib** sebagai baris pada Strategy, **bukan** tabel kartu anak (kalau jadi tabel kartu anak = melanggar "KPI child table di bawah Area Goal").

> [!warning] Tafsiran "Native app"
> PRD melarang "Native app" sebagai scope creep. [?] Tafsiran tim: ini melarang penambahan fitur native berlebih, bukan melarang React Native sebagai fondasi mobile ([[tech-stack]]). Perlu konfirmasi pemilik produk.

Berkaitan dengan: [[overview]], [[tech-stack]], [[database-blueprint]], [[card-model]].
