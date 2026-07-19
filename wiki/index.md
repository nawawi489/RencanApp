---
type: index
updated: 2026-07-16
---

# Rencanapp Wiki — Index

Master index of all wiki pages. Updated on every ingest.

---

## Overview

- [[overview]] — Ringkasan Execution Project Management V1.83: konsep card, dua workspace, fitur, tech stack, de-scoring People, Admin Lanjutan gating

## Entities

- [[action-plan]] — Unit eksekusi konkret; One Time vs Repeat, Instance, Progress/Capaian/Compliance
- [[card-model]] — Hierarki card dua workspace, makna & field wajib tiap card, Kelengkapan Card
- [[database-blueprint]] — 53 tabel Postgres, tabel yang dibuang, relationship rules
- [[score-formula]] — Penilaian performa berbobot per level (Staff/Management/C-Level/CEO); V1.83 Admin Lanjutan only, tidak tampil di UI utama staff
- [[surfaces]] — Bottom nav V1.83: Home (Fokus Task), Notifications, Workspace, Inbox (Diskusi Rencana Aksi), **Menu** (People de-scoring + Admin Lanjutan gated)
- [[workspace]] — Performance vs Development workspace dan hierarki card masing-masing

## Concepts

- [[architecture]] — Pola "thick database, thin client": DB-centric serverless, business logic di Postgres (RLS/trigger/RPC)
- [[audit-governance]] — Activity Log & Governance Violation append-only; severity & integritas audit
- [[design-fidelity-audit]] — Perbandingan menyeluruh app vs prototype tim desain; scorecard 7 dimensi, gap tertutup, keputusan token/auth terbuka
- [[evidence-kinds]] — Whitelist `evidence_files.kind` (termasuk `link_generic`) + aturan mapping link untuk UI
- [[execution-loop]] — Bukti → Nilai Hasil → Review; submission versioning & evidence locking
- [[fase6-spec]] — Spec eksekutabel Fase 6 Development Workspace (AC, data contract, non-goals, TDD handoff)
- [[fase6-tdd-plan]] — Rencana TDD red→green→refactor Fase 6 + addendum kritik (missing cases & concerns)
- [[minimum-breakdown-rule]] — Jumlah minimal card turunan (label UI "Aturan Pecah Target"); V1.83 opsional 3 mode (Nonaktif/Peringatan/Blokir), angka konfigurabel admin
- [[permission-model]] — Akses berbasis tanggung jawab (PIC/Reviewer/turunan), delegasi, RLS
- [[prototype-prd-conformance]] — Prototype `design.html` vs PRD V1.82: 46/46 screen + 28 AC terpenuhi; penyimpangan kecil (header notif, tab People Q3)
- [[score-period-immutability]] — ADR: periode skoring closed tidak dapat dibuka kembali dari aplikasi; koreksi = periode berikutnya (owner 2026-07-19, MERGE-BLOCKER Fase 4)
- [[scope-guardrails]] — Batas scope V1.83: fitur masuk vs ditolak (anti-scope-creep); §18 Satuan opsional TETAP diizinkan
- [[tech-stack]] — Expo + Supabase + RLS; alasan tiap pilihan diturunkan dari PRD
- [[ui-prototype-gap]] — Backlog UI ber-ID dari perbandingan `design.html` (46 layar) vs implementasi `mobile/`. Spec turunan pertama: `specs/inbox-chat-ui.md` (UI-S-IN1/IN2, dari sdd-plan 2026-06-26)
- [[workspace-lock-audit]] — Audit `mobile/` vs prototype final Workspace (spec lock V1.82 kini dihapus): 20 PASS · 7 PARTIAL · 8 FAIL dari 35 AC; temuan ber-ID WSA-01..20
- [[workspace-lock-sprint-plan]] — Lima sprint eksekusi perbaikan temuan WSA: copy lock → guard/permission → anatomi tree card → overview/header/switcher → route & tree lengkap
- [[ws-04-governance-debt]] — WS-04 archive-period gating UI-only (2026-07-05 OQ-1 Opsi A); `.insert()` langsung ber-RLS tanpa cek periode; kondisi kapan wajib re-open backend hardening

## Sources

- [[konsep-dan-fondasi]] — Ringkasan PRD 01: definisi EMS, scope, bahasa, status, makna card
- [[kredensial-login]] — 6 akun uji Nyantuy Group (CEO/CMO/2 Manager/2 Staff) di Supabase lokal + peta ke case ADM/ROLE/SCORE/PPL-07
- [[sistem-permission-data-governance]] — Ringkasan PRD 03: permission, surface, score, audit, DB
- [[spesifikasi-card-dan-eksekusi]] — Ringkasan PRD 02: field card, loop eksekusi, MBR, lifecycle

## Test Reports

- [[test-reports/2026-06-26-manual-qa]] — Pengujian manual menyeluruh V1.8.1 (Fase 0–8): Jest 463/463, DB contract A–D Fase 8 + sampling Fase 3–7, 16 skenario E2E per role, advisor triage
