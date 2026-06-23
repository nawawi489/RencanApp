---
type: source
tags: [ems, foundation, scope, source]
updated: 2026-06-22
sources: 1
---

# Source · 01 Konsep & Fondasi

Ringkasan [[overview|EMS V1.8.1]] file fondasi (`prd/01-konsep-dan-fondasi.md`). Berperan sebagai *north star* dan guardrail: definisi EMS, batas scope, aturan bahasa, status card, struktur workspace, dan makna tiap card.

## Inti

- **EMS = sistem eksekusi berbasis card**, bukan task manager, chat, social media, atau aplikasi KPI formal. Prinsip: "perusahaan membayar eksekusi yang punya arah, bukti, review, dan hasil".
- **Dua workspace** dengan hierarki card berbeda — lihat [[workspace]] dan [[card-model]].
- **14 tujuan produk**: dari "mengubah target besar jadi struktur eksekusi" sampai "mengedukasi user di dalam aplikasi" lewat [[card-model#Keterangan Card|Keterangan Card]].
- **Scope V1.8.1 dikunci ketat** — daftar fitur masuk vs ditolak (anti-scope-creep PRD §88). Lihat [[scope-guardrails]].
- **Bahasa UI = Bahasa Indonesia**; sejumlah istilah Inggris dipertahankan (Goal, KPI Area, Strategy, Initiative, Action Plan, dst.). Card "diaktifkan", bukan "dipublish".

## Status card (vocabulary)

- **Status utama:** Draft, Aktif, Selesai, Diarsipkan.
- **Status tambahan Action Plan:** Assigned, In Progress, Menunggu Review, Revisi Diperlukan, Terlewat, Dibatalkan.

## Guardrails permanen

- Tidak ada bobot pada planning card (bobot hanya di [[score-formula]]).
- Card turunan **selalu dibuat dari dalam induknya**, bukan pilih induk dari dropdown — lihat [[card-model#Prinsip card turunan]].
- Anti-scope-creep: tolak Feed, Announcement, HRIS, Payroll, CRM, WhatsApp/Calendar integration, AI Assistant/Review, Watcher, Routine/Checklist module, Area Goal, KPI cascade.

Berkaitan dengan: [[card-model]], [[workspace]], [[scope-guardrails]], [[overview]].
