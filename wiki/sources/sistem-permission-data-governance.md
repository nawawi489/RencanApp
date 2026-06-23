---
type: source
tags: [ems, permission, governance, database, source]
updated: 2026-06-22
sources: 1
---

# Source · 03 Sistem, Permission, Data & Governance

Ringkasan referensi arsitektur (`prd/03-sistem-permission-data-governance.md`): model permission & delegasi, surface aplikasi, Score Formula, audit, Search, Settings, blueprint database, relationship rules, dan seed data.

## Inti

- **Permission berbasis tanggung jawab** (PIC / Reviewer / akses turunan), bukan granular. Delegasi bertingkat: pemilik card induk membuat turunan & menentukan PIC + Reviewer-nya. Lihat [[permission-model]].
- **Watcher dihapus** (§60) — akses luas hanya via permission "lihat seluruh Workspace".
- **5 surface**: Home, Notifications, Workspace, Inbox, People (Settings via avatar). Lihat [[surfaces]].
- **Score Formula berbobot** per level (Staff/Management/C-Level/CEO), total wajib 100%, dengan versioning. Lihat [[score-formula]].
- **Audit append-only**: Activity Log & Governance Violation, tidak bisa diedit/dihapus dari UI. Lihat [[audit-governance]].
- **Search wajib ikut permission** — user tidak boleh menemukan data yang tak boleh diaksesnya.
- **Blueprint 53 tabel** Postgres + daftar tabel yang dibuang dari V1.8.1. Lihat [[database-blueprint]].
- **Seed data**: Organization = Nyantuy Group; Development Area, Goal Template, Repeat Frequency, Status, Prioritas default.

## Success metrics

40 kriteria kelulusan V1.8.1 (§87): user hanya lihat card relevan, PIC induk lihat semua turunan, card tak aktif jika belum lengkap, Strategy wajib alasan/risiko/alternatif, MBR jalan, tanpa bobot planning tapi Score Formula berbobot, One Time & Repeat jalan, audit & surface jalan, bahasa konsisten Indonesia.

Berkaitan dengan: [[permission-model]], [[surfaces]], [[score-formula]], [[audit-governance]], [[database-blueprint]].
