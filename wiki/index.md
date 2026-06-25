---
type: index
updated: 2026-06-23
---

# RencanApp Wiki — Index

Master index of all wiki pages. Updated on every ingest.

---

## Overview

- [[overview]] — Ringkasan EMS V1.8.1: konsep card, dua workspace, fitur, dan tech stack

## Entities

- [[action-plan]] — Unit eksekusi konkret; One Time vs Repeat, Instance, Progress/Capaian/Compliance
- [[card-model]] — Hierarki card dua workspace, makna & field wajib tiap card, Kelengkapan Card
- [[database-blueprint]] — 53 tabel Postgres, tabel yang dibuang, relationship rules
- [[score-formula]] — Penilaian performa berbobot per level (Staff/Management/C-Level/CEO)
- [[surfaces]] — 5 surface: Home, Notifications, Workspace, Inbox, People (+ Settings)
- [[workspace]] — Performance vs Development workspace dan hierarki card masing-masing

## Concepts

- [[architecture]] — Pola "thick database, thin client": DB-centric serverless, business logic di Postgres (RLS/trigger/RPC)
- [[audit-governance]] — Activity Log & Governance Violation append-only; severity & integritas audit
- [[execution-loop]] — Bukti → Nilai Hasil → Review; submission versioning & evidence locking
- [[fase6-spec]] — Spec eksekutabel Fase 6 Development Workspace (AC, data contract, non-goals, TDD handoff)
- [[fase6-tdd-plan]] — Rencana TDD red→green→refactor Fase 6 + addendum kritik (missing cases & concerns)
- [[minimum-breakdown-rule]] — Jumlah minimal card turunan; tiga mode penerapan & default
- [[permission-model]] — Akses berbasis tanggung jawab (PIC/Reviewer/turunan), delegasi, RLS
- [[scope-guardrails]] — Batas scope V1.8.1: fitur masuk vs ditolak (anti-scope-creep)
- [[tech-stack]] — Expo + Supabase + RLS; alasan tiap pilihan diturunkan dari PRD

## Sources

- [[konsep-dan-fondasi]] — Ringkasan PRD 01: definisi EMS, scope, bahasa, status, makna card
- [[sistem-permission-data-governance]] — Ringkasan PRD 03: permission, surface, score, audit, DB
- [[spesifikasi-card-dan-eksekusi]] — Ringkasan PRD 02: field card, loop eksekusi, MBR, lifecycle
