---
type: overview
tags: [ems, mobile]
updated: 2026-07-11
sources: 4
---

# Rencanapp — Overview

Rencanapp adalah implementasi **EMS (Execution Management System) V1.8.3** (sumber kebenaran: `PRD.md` di root repo) — sistem yang membantu perusahaan mengubah arah besar menjadi eksekusi nyata yang bisa dipantau, direview, dan dipertanggungjawabkan. Bukan task manager biasa, chat, social media, atau aplikasi KPI formal.

## What is Rencanapp?

Sistem eksekusi berbasis **card** dengan dua workspace:

- **Performance:** Goal → Strategy → Initiative → Action Plan → Task
- **Development:** Development Area → Problem Statement / Development Goal → Action Plan → Task

*(V1.8.3 rename bottom-up per [`rename-workspace-terminology`](../specs/rename-workspace-terminology.md): istilah lama KPI Area/Strategy/Initiative/Action Plan bergeser satu tingkat menjadi Strategy/Initiative/Action Plan/Task. Development chain ikut per RWT-01 A.)*

Prinsip: perusahaan tidak membayar kesibukan, melainkan eksekusi yang punya arah, bukti, review, dan hasil. Target pengguna: organisasi internal (seed: Nyantuy Group), dari CEO hingga Staff. UI **Bahasa Indonesia**.

## Tech Stack

Mobile app (iOS + Android) di atas **Expo (React Native) + TypeScript**, dengan **Supabase (Postgres)** sebagai backend — Auth, Storage, Realtime, Edge Functions — dan **Postgres RLS** sebagai penegak permission. Detail & alasan: [[tech-stack]].

## Key Features

- Card hierarki dua workspace dengan Kelengkapan Card, Minimum Breakdown Rule, dan Keterangan Card (edukasi in-app).
- Task One Time & Repeat (menghasilkan Instance terjadwal).
- Loop eksekusi: Bukti → Nilai Hasil → Review (dengan submission versioning & evidence locking).
- Permission berbasis tanggung jawab (PIC / Reviewer / akses turunan), lihat [[permission-model]].
- Surface (bottom nav V1.8.2 §7.1): Home, Notifications, Workspace, Inbox (Diskusi Rencana Aksi = chat pada Action Plan), **Menu** (profil/People/admin/template/settings/archive/logout). People masuk ke Menu, bukan tab mandiri.
- Period Focus Engine (§7.6): Workspace fokus periode aktif (Bulan default / Quarter), Goal tahunan konteks; Strategy Target Breakdown total 100% (§12).
- Audit append-only: Activity Log & Governance Violation. Score Formula berbobot per level.

## Architecture

53 tabel inti di Postgres, otorisasi via RLS, real-time untuk chat & notifikasi, job terjadwal via Edge Functions + `pg_cron`. Lihat [[tech-stack]] untuk pemetaan lengkap.

## Status

Implementasi berjalan (Fase 0–8 + Inbox/Score/Theme + rename V1.8.3). **Sumber kebenaran = `PRD.md`** (root repo, V1.8.3); breakdown per-topik di `prd/` (3 bagian) sedang disinkronkan ke V1.8.3. Rename Workspace terminology (F0–F4) sudah landing dengan tsc 0 + jest 1163/1163 pada branch `feat/rename-workspace-terminology`; sisa work: F5 grep-guard + F6 rollback drill + RWT-12 copy Indonesian (Content Lead DRI PENDING).
