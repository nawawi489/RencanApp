---
type: overview
tags: [ems, mobile]
updated: 2026-07-15
sources: 4
---

# Rencanapp — Overview

Rencanapp adalah implementasi **Execution Project Management V1.83** (sumber kebenaran: `PRD.md` di root repo) — sistem yang membantu perusahaan memecah target besar menjadi aksi nyata yang bisa dijalankan, dipantau, direview, dibuktikan, dan dituntaskan. Bukan project management polos, task manager biasa, chat, social media, atau aplikasi indikator formal.

Reposisi V1.83 (dari "Execution Management System" V1.82) menurunkan tekanan pada staff harian: fitur berat (Score Formula, Governance, Activity Log, Manual Score Override) di-gate ke Admin Lanjutan, People di-de-scoring (urutan kontribusi + status ringan alih-alih angka score telanjang).

## What is Rencanapp?

Sistem eksekusi berbasis **card** dengan dua workspace:

- **Performance:** Goal → Strategy → Initiative → Action Plan → Task
- **Development:** Development Area → Problem Statement / Development Goal → Action Plan → Task

*(V1.8.3 rename bottom-up per [`rename-workspace-terminology`](../specs/rename-workspace-terminology.md): istilah lama KPI Area/Strategy/Initiative/Action Plan bergeser satu tingkat menjadi Strategy/Initiative/Action Plan/Task. Development chain ikut per RWT-01 A. Label UI Bahasa Indonesia per RWT-12: Strategi/Inisiatif/Rencana Aksi/Tugas.)*

Prinsip V1.83 (5 poin, PRD §2): (1) target besar bisa dipecah jadi struktur kerja yang mudah dipahami; (2) user tidak diserbu semua turunan sekaligus, Workspace fokus periode aktif; (3) tiap aksi punya PIC, deadline, output, status yang dipercaya; (4) bukti/review/hasil untuk memastikan pekerjaan selesai, bukan mempermalukan user; (5) fitur penilaian/score/governance/aturan lanjutan di area admin/advanced.

Target pengguna: organisasi internal (seed: Nyantuy Group), dari CEO hingga Staff. UI **Bahasa Indonesia**. Tagline: "Rencanakan target. Pecah jadi aksi. Jalankan sampai tuntas."

## Tech Stack

Mobile app (iOS + Android) di atas **Expo (React Native) + TypeScript**, dengan **Supabase (Postgres)** sebagai backend — Auth, Storage, Realtime, Edge Functions — dan **Postgres RLS** sebagai penegak permission. Detail & alasan: [[tech-stack]].

## Key Features

- Card hierarki dua workspace dengan Kelengkapan Card, Minimum Breakdown Rule (label UI "Aturan Pecah Target"), dan Keterangan Card (edukasi in-app).
- Task One Time & Repeat (menghasilkan Instance terjadwal).
- Loop eksekusi: Bukti → Nilai Hasil → Review (dengan submission versioning & evidence locking).
- Permission berbasis tanggung jawab (PIC / Reviewer / akses turunan), lihat [[permission-model]].
- Surface (bottom nav V1.83 §7.1): Home (Fokus Hari Ini = Task), Notifications, Workspace, Inbox (Diskusi Rencana Aksi = chat pada Action Plan), **Menu** (profil/People/bantuan/settings/archive + Admin Lanjutan bila punya izin). People masuk ke Menu, bukan tab mandiri.
- Period Focus Engine (§7.6): Workspace fokus periode aktif (Bulan default / Quarter), Goal tahunan konteks; Strategy Target Breakdown total 100% (§12).
- Audit append-only: Activity Log & Governance Violation — V1.83 di-gate ke Admin Lanjutan, staff hanya menerima arahan singkat via popup/Notifications.
- Score Formula berbobot per level — V1.83 fitur admin lanjutan, tidak tampil di UI utama staff.
- Evaluation dipicu di **Action Plan** (bukan Initiative) saat mendekati selesai atau selesai.

## Architecture

53 tabel inti di Postgres, otorisasi via RLS, real-time untuk chat & notifikasi, job terjadwal via Edge Functions + `pg_cron`. Lihat [[tech-stack]] untuk pemetaan lengkap.

## Status

Implementasi berjalan (Fase 0–8 + Inbox/Score/Theme + rename V1.8.3 + push notif spec). **Sumber kebenaran = `PRD.md`** (root repo, V1.83, promoted 2026-07-15); breakdown per-topik di `prd/` (3 bagian) belum disinkronkan ke V1.83. Perubahan V1.83 belum semua ter-implement di kode — audit gap masih terbuka: MBR mode "Nonaktif" & "Peringatan saja", Home Fokus Hari Ini pada Task (masih Action Plan), Evaluation di Action Plan (masih Initiative), People de-scoring (row masih tampilkan Score/Achievement).
