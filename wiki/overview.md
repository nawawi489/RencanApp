---
type: overview
tags: [ems, mobile]
updated: 2026-06-22
sources: 3
---

# RencanApp — Overview

RencanApp adalah implementasi **EMS (Execution Management System) V1.8.1** — sistem yang membantu perusahaan mengubah arah besar menjadi eksekusi nyata yang bisa dipantau, direview, dan dipertanggungjawabkan. Bukan task manager biasa, chat, social media, atau aplikasi KPI formal.

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
- Surface: Home, Notifications, Workspace, Inbox (Initiative Chat), People (skor performa).
- Audit append-only: Activity Log & Governance Violation. Score Formula berbobot per level.

## Architecture

53 tabel inti di Postgres, otorisasi via RLS, real-time untuk chat & notifikasi, job terjadwal via Edge Functions + `pg_cron`. Lihat [[tech-stack]] untuk pemetaan lengkap.

## Status

Tahap perencanaan. PRD dipecah jadi 3 bagian di `prd/` (konsep & fondasi, spesifikasi card, sistem & governance). Tech stack direkomendasikan 2026-06-22.
