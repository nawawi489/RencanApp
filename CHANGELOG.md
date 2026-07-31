# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

Entri baru DITULIS DI ATAS (newest-first). Setelah tag rilis, seluruh isi
`## [Unreleased]` dipindahkan ke bagian bertanggal.

## [Unreleased]

### Changed
- **Rollup progress rekursif Initiative & Action Plan (Opsi B, migrasi 0118)** — orb capaian Inisiatif & Rencana Aksi kini rata-rata **rekursif** progress anak (leaf Tugas → Rencana Aksi → Inisiatif), bukan lagi `%-anak-langsung-done`. Rencana Aksi dengan Tugas 50%/80% tak lagi terbaca 0% sampai tiap Tugas `done`. Header detail Inisiatif & Rencana Aksi sinkron dengan orb tree via `useCardProgress` (fallback ke count-done klien hanya saat RPC belum termuat). Level lain (Goal/Strategy attainment, Problem Statement, Development Area) tak berubah. Read-only, `SECURITY INVOKER` (RLS instance confidential tetap berlaku per pemanggil). Kontrak: `supabase/tests/0118_recursive_rollup_contract.sql` (14 blok).

### Fixed
- Submit Tugas kini menyegarkan orb progress Inisiatif & Rencana Aksi — `useSubmissionFlow.onSuccess` meng-invalidasi `['workspace_card_progress']` (bare-prefix, segarkan semua batch). Sebelumnya angka rollup rekursif basi sampai refetch lain.

### Added
- **Sprint 5 – Prasyarat rilis** — 11 tiket menuju produksi (audit 2026-07-26).
  - S5-2 Env Supabase pindah ke EAS Dashboard; `eas.json` production tak lagi menyimpan `EXPO_PUBLIC_SUPABASE_*` placeholder.
  - S5-4 Purpose strings iOS (foto/kamera/mikrofon) dalam Bahasa Indonesia + config FCM path.
  - S5-5 `submit.production` skeleton (5 field iOS + 3 field Android, `track: internal`).
  - S5-6 Sentry pipeline lengkap: DSN forwarding di CI, sourcemap upload web, `release`+`dist` tag, `setUser` dgn id non-PII (bukan email).
  - S5-7 Draft Kebijakan Privasi + Ketentuan Layanan (UU 27/2022 PDP). Tautan di layar login.
  - S5-8 Anonimisasi akun + ekspor data — migrasi 0115, RPC `request_account_deletion` / `anonymize_account` / `export_my_data`, layar "Kelola Akun".
  - S5-9 `expo-updates` terpasang (`~56.0.23`) dgn `runtimeVersion` policy `appVersion`.
  - S5-10 Ops runbook + blueprint backup terjadwal (`pg_dump` per jam ke S3-compatible).
  - S5-11 Workflow rilis produksi (\`v*\` tag → build, submit opt-in) + CHANGELOG.

### Owner action (memblokir V1.0.0)
- S5-1 Provisioning project Supabase produksi (region Singapura).
- S5-3 Terapkan seluruh migrasi ke prod + rekonsiliasi ledger staging (`schema_migrations` tak konsisten dgn filename).

- **Sprint 4 – Kapabilitas operator** (merged 2026-07-27) — 8 tiket menutup blocker "admin tak bisa jalankan produk tanpa SQL".
  - `update_task`, `update_action_plan`, `update_initiative`, `update_development_area`, `update_problem_statement` — edit 5 tipe Card sisanya, dgn field TERKUNCI pasca-aktivasi (dasar skor).
  - `set_user_active` — offboarding + reaktivasi user, ANTI SELF-DEACTIVATE.
  - `update_user_role` — penugasan role, ANTI SELF-PROMOTE.
  - Repeat rule bisa diedit (bila belum ada instance).
  - Error state di 4 layar prioritas (audit-log, org-structure, governance-violation, goal-wizard).
  - Hapus permukaan setengah jadi (Pusat Bantuan/Support, Override Skor/Rahasia dari Admin Lanjutan).

- **Sprint 3 – Layak deploy** (merged 2026-07-27).
  - Seam platform untuk `Alert.alert` — Banner in-app di web (dulu 100 pemanggilan no-op).
  - `mutations.retry: false` + wire RPC `*_idempotent` ke klien (menutup dup-write pasca-jaringan-putus).
  - `plpgsql_check` di CI (menahan bug rename 0045 series).
  - DCR (Deadline Change Request) ditulis ulang untuk kolom pasca-rename V1.8.3.
  - Indeks `organization_id` di 29 tabel (pembacaan org-scoped tidak lagi seq-scan).
  - Notification badge pakai `head+count exact` + pagination + retensi.
  - Resolver rute push diperbaiki + tes menahan perubahan.

- **Sprint 2 – Kunci keamanan** (merged 2026-07-27).
  - `enable_signup=false` di Supabase (self-signup ditutup — organisasi 1-org tidak lagi rentan).
  - `backfill_resolve_stale_notifications` dihapus (dulu 40 fungsi callable anon).
  - 4 UPDATE policy pasang predikat FK induk (memblokir re-parenting lintas org).
  - `activate_task` cross-org guard + INSERT `tasks` predikat parent.
  - 4 fungsi review/PIC null-safe (task tanpa reviewer tak bisa lagi di-approve siapa saja).
  - Reset password diperbaiki — verifikasi JWT `iss`, tolak recovery link saat sudah login (session fixation).
  - App Links / Universal Links wajib https terverifikasi (env `EXPO_PUBLIC_APP_LINK_HOST`); `ems://` hanya utk dev.
  - Contract test isolasi 9 tabel + assertion RLS global enabled.

- **Sprint 1 – Hentikan pendarahan** (merged 2026-07-27).
  - Applied migrasi 0102–0104 ke DB staging (RPC `create_*_idempotent` yang klien sudah panggil).
  - Job `db-push` di pipeline deploy (memblokir deploy klien bila migrasi gagal).
  - Branch protection main + staging aktif (required checks: Lint/types/tests, DB contract, Rename guard; force-push diblokir).
  - Pre-push hook pakai `--changedSince=origin/staging` (dulu `--onlyChanged` no-op di tree bersih).
  - CI path filter mencakup `supabase/migrations/**`.
  - Migrasi 0105 cabut EXECUTE dari `PUBLIC`/`anon` semuanya (40→0).
  - Secret scanning + push protection + Dependabot aktif.
  - Smoke check pasca-deploy re-wired.

## [Belum ada rilis]

Tag `v0.x` belum pernah dibuat. Baseline versi ini adalah persiapan V1.0.0.
