---
type: overview
tags: [ems, mobile]
updated: 2026-06-27
sources: 4
---

# RencanApp — Overview

RencanApp adalah implementasi **EMS (Execution Management System) V1.8.2** (sumber kebenaran: `PRD_EMS_V1.82_Rencanaapp.md`) — sistem yang membantu perusahaan mengubah arah besar menjadi eksekusi nyata yang bisa dipantau, direview, dan dipertanggungjawabkan. Bukan task manager biasa, chat, social media, atau aplikasi KPI formal.

## What is RencanApp?

Sistem eksekusi berbasis **card** dengan dua workspace:

- **Performance:** Goal → KPI Area → Strategy → Initiative → Action Plan
- **Development:** Development Area → Problem Statement / Development Goal → Initiative → Action Plan

Prinsip: perusahaan tidak membayar kesibukan, melainkan eksekusi yang punya arah, bukti, review, dan hasil. Target pengguna: organisasi internal (seed: Nyantuy Group), dari CEO hingga Staff. UI **Bahasa Indonesia**.

## Tech Stack

Mobile app (iOS + Android) di atas **Expo (React Native) + TypeScript**, dengan **Supabase (Postgres)** sebagai backend — Auth, Storage, Realtime, Edge Functions — dan **Postgres RLS** sebagai penegak permission. Detail & alasan: [[tech-stack]].

## Key Features

- Card hierarki dua workspace dengan Kelengkapan Card, Minimum Breakdown Rule, dan Keterangan Card (edukasi in-app).
- Action Plan One Time & Repeat (menghasilkan Instance terjadwal).
- Loop eksekusi: Bukti → Nilai Hasil → Review (dengan submission versioning & evidence locking).
- Permission berbasis tanggung jawab (PIC / Reviewer / akses turunan), lihat [[permission-model]].
- Surface (bottom nav V1.8.2 §7.1): Home, Notifications, Workspace, Inbox (Initiative Chat), **Menu** (profil/People/admin/template/settings/archive/logout). People masuk ke Menu, bukan tab mandiri.
- Period Focus Engine (§7.6): Workspace fokus periode aktif (Bulan default / Quarter), Goal tahunan konteks; KPI Area Target Breakdown total 100% (§12).
- Audit append-only: Activity Log & Governance Violation. Score Formula berbobot per level.

## Architecture

53 tabel inti di Postgres, otorisasi via RLS, real-time untuk chat & notifikasi, job terjadwal via Edge Functions + `pg_cron`. Lihat [[tech-stack]] untuk pemetaan lengkap.

## Status

Implementasi berjalan (Fase 0–8 + Inbox/Score/Theme). **Sumber kebenaran = `PRD_EMS_V1.82_Rencanaapp.md`** (root repo); ringkasan V1.8.1 di `prd/` (3 bagian) kini historis. Catatan: sebagian wiki & kode `mobile/` masih lag V1.8.1 dan sedang disinkronkan ke V1.8.2 (nav Menu, Period Focus Engine, KPI Area Target Breakdown).
