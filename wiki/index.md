---
type: index
updated: 2026-08-02
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
- [[self-hosted-runner]] — **DICABUT 2026-07-21.** Runner CI `rencanapp-wsl` (Ubuntu/WSL2) yang sempat dipakai saat kuota Actions terblokir; disimpan sebagai catatan jebakan bila jalur ini dipertimbangkan lagi
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
- [[feature-gap-backlog]] — Backlog di bawah ambang P-slot (BL-01..BL-14): gap app vs PRD + inkonsistensi perilaku, tiap baris berbukti `file:line`; BL-02/08/09/11/12/13 DONE, BL-03 ditutup sebagai keputusan owner, BL-14 (org signup) satu-satunya utang terbuka yang butuh scoping
- [[minimum-breakdown-rule]] — Jumlah minimal card turunan (label UI "Aturan Pecah Target"); V1.83 opsional 3 mode (Nonaktif/Peringatan/Blokir), angka konfigurabel admin
- [[permission-model]] — Akses berbasis tanggung jawab (PIC/Reviewer/turunan), delegasi, RLS
- [[prototype-prd-conformance]] — Prototype `design.html` vs PRD V1.82: 46/46 screen + 28 AC terpenuhi; penyimpangan kecil (header notif, tab People Q3)
- [[score-open-period-ui]] — Tombol "Buka Periode" + modal konfirmasi dua langkah; menutup NG-2 (RPC `open_period_snapshot` sebelumnya nol caller UI); nol migrasi
- [[score-period-end-nudge]] — Pengingat H-7/H-3/H-1 + harian saat terlambat, tipe notif `period_closing_reminder` + pg_cron harian; menutup B-1 (tanpa ini gejala bug lama bisa kambuh tanpa ada bug)
- [[score-period-immutability]] — ADR: periode skoring closed tidak dapat dibuka kembali dari aplikasi; koreksi = periode berikutnya (owner 2026-07-19, MERGE-BLOCKER Fase 4)
- [[search-mining-monitor]] — Runbook BL-18 opsi 3: pantau penambangan data lewat Search dari `edge_logs` (`sb.auth_user`), bukan dari telemetri klien; kueri, prosedur ambang, dan bagian ops yang masih terbuka
- [[scope-guardrails]] — Batas scope V1.83: fitur masuk vs ditolak (anti-scope-creep); §18 Satuan opsional TETAP diizinkan
- [[settings-consumers-spec]] — Bundled SDD spec §34.5 + §34.6: tutup config black-hole (writer → tabel dedicated `card_completion_rules` + `card_guidance_contents`; hardcoded core + admin layer); v2 + D-8 amendment (governance_violations emit deferred, single-tx rollback bug); target migrasi 0078 post-rebase
- [[settings-consumers-tdd-plan]] — TDD plan red-green-refactor untuk [[settings-consumers-spec]]: 5 wave (7 SQL contract red → migration 0078 green → 5 client test red → 6 impl green → refactor+regression+integration); dependency graph + owner check-points + 4 follow-up ticket (CI wiring, autonomous-tx, permission UI, wiki correction)
- [[tech-stack]] — Expo + Supabase + RLS; alasan tiap pilihan diturunkan dari PRD
- [[ui-prototype-gap]] — Backlog UI ber-ID dari perbandingan `design.html` (46 layar) vs implementasi `mobile/`. Spec turunan pertama: `specs/inbox-chat-ui.md` (UI-S-IN1/IN2, dari sdd-plan 2026-06-26)
- [[workspace-card-progress]] — Server rollup `workspace_card_progress` (orb capaian): evolusi 0037→0074 attainment→0102 push-down→**0118 rollup rekursif Initiative/AP (Opsi B)**; gotcha view agregat tanpa filter meng-scan seluruh approved set tiap referensi; isolasi level + kebocoran confidential level-instance; benchmark 0118 vs 0102 **realistic OK / stress-case ~7x lebih lambat** (can_access_task RLS per-instance) + gotcha ANALYZE + hand-typed prosrc; resep verifikasi ekuivalensi 0-mismatch
- [[workspace-hub-orb]] — Hub-card lobby: orb capaian sungguhan (RPC `workspace_card_progress`), satu bentuk dua label ("Capaian" Performance / "Progress" Development) — mirror `treeOrbLabel` tree; riwayat 3 putaran (orb kepadatan ambigu → chip redundan → orb sungguhan)
- [[workspace-lock-audit]] — Audit `mobile/` vs prototype final Workspace (spec lock V1.82 kini dihapus): 20 PASS · 7 PARTIAL · 8 FAIL dari 35 AC; temuan ber-ID WSA-01..20
- [[workspace-lock-sprint-plan]] — Lima sprint eksekusi perbaikan temuan WSA: copy lock → guard/permission → anatomi tree card → overview/header/switcher → route & tree lengkap
- [[write-idempotency-keys]] — IMPLEMENTED (migrasi 0103 + client layer, branch `feat/write-idempotency-keys`): client_request_id + partial unique index + 5 RPC `create_*_idempotent` (ON CONFLICT DO NOTHING) agar retry-manual user tak menduplikasi INSERT non-idempoten (goals/action_plans/tasks/initiatives/problem_statements + send_chat_message)
- [[write-idempotency-keys-tdd-plan]] — Rencana TDD red→green→refactor untuk [[write-idempotency-keys]]: DB(0103)→types(hand-edit)→data→hooks→UI; gate keputusan OQ-1 (RPC helper vs catch-23505); fix critic (author_id≠sender_id, index polos bukan CONCURRENTLY)
- [[ws-04-governance-debt]] — WS-04 archive-period gating UI-only (2026-07-05 OQ-1 Opsi A); `.insert()` langsung ber-RLS tanpa cek periode; kondisi kapan wajib re-open backend hardening
- [[ws-05-period-focus-year-scoping]] — Opsi A (PRD §11.1/§7.6): Goal tahunan di-scope ke TAHUN fokus (`overlapsFocusYear`), bukan bulan/quarter; menutup kebocoran lintas-tahun (goal 2025 bocor saat fokus 2026); copy empty-state "…di tahun ini."; #3 turunan periode-lewat TETAP tampil per §11.3 (bukan bug); badge "Periode lewat" pada Goal hanya via fokus arsip

## Sources

- [[konsep-dan-fondasi]] — Ringkasan PRD 01: definisi EMS, scope, bahasa, status, makna card
- [[kredensial-login]] — 9 akun lokal aktif per 2026-08-02: 3 fixture contract-test (`@fixtures.local`) + 6 akun Nyantuy Group (`@rencan.local`, dipulihkan setelah sempat hilang 2026-07-30); password `rencan123` semua
- [[sistem-permission-data-governance]] — Ringkasan PRD 03: permission, surface, score, audit, DB
- [[spesifikasi-card-dan-eksekusi]] — Ringkasan PRD 02: field card, loop eksekusi, MBR, lifecycle

## Test Reports

- [[test-reports/2026-06-26-manual-qa]] — Pengujian manual menyeluruh V1.8.1 (Fase 0–8): Jest 463/463, DB contract A–D Fase 8 + sampling Fase 3–7, 16 skenario E2E per role, advisor triage
