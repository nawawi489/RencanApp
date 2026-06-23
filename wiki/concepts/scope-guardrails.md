---
type: concept
tags: [scope, guardrails, anti-scope-creep, decision]
updated: 2026-06-22
sources: 1
---

# Scope Guardrails

Batas scope permanen [[overview|EMS V1.8.1]] (PRD §88). Berfungsi sebagai guardrail anti-scope-creep: **jika ada usulan fitur dalam daftar "ditolak", tolak untuk V1.8.1.**

## Masuk V1.8.1

Auth, User profile, Organization/Department/Position/Team, Role template & permission, dua [[workspace]], Goal & KPI Area Template Library, semua [[card-model|card]], [[action-plan|Action Plan One Time/Repeat/Instance]], Kelengkapan Card, Keterangan Card, [[minimum-breakdown-rule|MBR]], Kelengkapan Perencanaan, [[execution-loop|Bukti/Nilai Hasil/Review]], [[audit-governance|Activity Log & Governance Violation]], Notifications, Inbox Initiative Chat, People, [[score-formula|Score Formula]], Repeat Compliance, basic ranking, Settings.

## Ditolak (jangan bangun)

Feed, Company News, Announcement, CEO Broadcast, SOP Center penuh, Knowledge Center, HRIS penuh, Payroll, Inventory, CRM, WhatsApp integration, Google Calendar integration, AI Assistant, AI Review, Routine entity, Checklist Routine, Watcher, Area Goal layer, KPI child table, Bobot planning card, Social reaction/Story/Reels.

## Guardrail filosofis

- **Tanpa bobot pada planning card** — bobot hanya ada di [[score-formula]].
- Card "diaktifkan", bukan "dipublish/diposting".
- UI Bahasa Indonesia; hindari istilah Parent/Child/Publish/Validation Error di UI bisnis.

> [!warning] Tafsiran "Native app"
> PRD melarang "Native app" sebagai scope creep. [?] Tafsiran tim: ini melarang penambahan fitur native berlebih, bukan melarang React Native sebagai fondasi mobile ([[tech-stack]]). Perlu konfirmasi pemilik produk.

Berkaitan dengan: [[overview]], [[tech-stack]], [[database-blueprint]], [[card-model]].
