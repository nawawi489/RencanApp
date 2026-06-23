# RencanApp Wiki — Log

Append-only chronological record of wiki operations.
Format: `## [YYYY-MM-DD] <type> | <title>`

---

## [2026-06-20] init | Wiki scaffold created

- Structure initialized: `wiki/`, `wiki/entities/`, `wiki/concepts/`, `wiki/sources/`, `raw/`
- Schema written to `CLAUDE.md`
- Pages created: `index.md`, `log.md`, `overview.md` (stub)
- Next step: describe RencanApp to seed `overview.md`, then ingest source documents

## [2026-06-22] update | Rekomendasi tech stack

- Sumber dibaca: `prd/01-konsep-dan-fondasi.md`, `prd/02-spesifikasi-card-dan-eksekusi.md`, `prd/03-sistem-permission-data-governance.md`
- Pages created: `concepts/tech-stack.md`
- Pages updated: `overview.md` (mengganti stub — deskripsi EMS + ringkasan stack), `index.md`
- Key takeaways: stack mobile = Expo (React Native) + TypeScript; backend Supabase (Postgres); permission ditegakkan via Postgres RLS karena PRD menuntut akses berbasis baris data; audit append-only via trigger Postgres; real-time & cron via Supabase. Blueprint DB memakai `auth.users` → sinyal kuat Supabase.
- Terbuka: konfirmasi tafsiran PRD §108 ("Native app" sebagai scope creep) — perlu validasi pemilik produk.

## [2026-06-22] ingest | Build out wiki dari 3 file PRD + setup vault Obsidian

- Sumber dibaca ulang: `prd/01-konsep-dan-fondasi.md`, `prd/02-spesifikasi-card-dan-eksekusi.md`, `prd/03-sistem-permission-data-governance.md`
- Sources created: `konsep-dan-fondasi.md`, `spesifikasi-card-dan-eksekusi.md`, `sistem-permission-data-governance.md`
- Entities created: `card-model.md`, `action-plan.md`, `workspace.md`, `surfaces.md`, `score-formula.md`, `database-blueprint.md`
- Concepts created: `permission-model.md`, `execution-loop.md`, `minimum-breakdown-rule.md`, `audit-governance.md`, `scope-guardrails.md`
- Pages updated: `index.md` (semua entity/concept/source baru, diurutkan alfabetis)
- Dangling links terisi: `[[permission-model]]`, `[[card-model]]` (sebelumnya hanya direferensikan overview & tech-stack)
- Setup `.obsidian/`: vault config dasar (app.json wikilink mode, core plugins, graph) agar folder siap dibuka sebagai vault second-brain
- Key takeaways: kerangka second-brain kini lengkap dari fondasi → eksekusi → governance; semua saling terhubung wikilink; siap dibuka di aplikasi Obsidian.

## [2026-06-22] update | Scaffold aplikasi Fase 0 (Expo + Supabase)

- Dibuat folder `mobile/` (Expo SDK 56 + Expo Router + TypeScript) sebagai aplikasi EMS.
- Styling: NativeWind v5 (preview.4) + Tailwind v4 via `react-native-css` 3.x. Catatan: skill `expo-tailwind-setup` masih menargetkan Expo 54; versi yang benar untuk SDK 56 adalah `nativewind@5.0.0-preview.4` + `react-native-css@^3.0.7` (bukan nightly).
- Auth Supabase (sesi persisten AsyncStorage), route guard `(auth)`/`(app)`, navigasi 5 surface (Home/Notifications/Workspace/Inbox/People) + Settings.
- DB Fase 0 diterapkan via migrasi `supabase/migrations/0001_fase0_foundation.sql`: tabel `organizations`, `role_templates`, `profiles`, `permissions`, `user_permissions`, `settings`, `login_logs`; RLS berbasis org; trigger profil otomatis; seed Nyantuy Group + 4 role + 17 permission (§58).
- `.mcp.json` diubah jadi writable (hapus `--read-only`) dan ditambahkan ke `.gitignore` (berisi access token).
- Verifikasi: `tsc --noEmit` lulus; bundle web Metro+NativeWind kompilasi bersih (1465 modules). Web diset `output: "single"` (SPA) karena SSR statis bentrok dengan klien Supabase.
- Terbuka: migrasi perlu di-apply ke project Supabase setelah Claude Code direstart (agar MCP writable aktif); lalu promosikan 1 user ke role CEO dan regenerate `database.types.ts`.

## [2026-06-23] update | Migrasi Fase 0 diterapkan + hardening keamanan

- Migrasi diterapkan ke Supabase (ref `fhnqwytqprsptjshoxfn`) via MCP: `0001_fase0_foundation` (7 tabel + RLS + seed Nyantuy Group: 4 role, 17 permission, trigger profil otomatis), lalu `0002`–`0004` pengetatan keamanan.
- Verifikasi: 7 tabel RLS aktif; seed benar (1 org, 4 role, 17 permission); `tsc --noEmit` lulus dengan tipe DB asli (`database.types.ts` di-regenerate dari skema live).
- Security advisors: 4 warning dari fungsi migrasi + 1 dari `rls_auto_enable` (event trigger bawaan) sudah dibersihkan via revoke EXECUTE. Tersisa 1 warning disengaja: `current_user_org()` dapat dieksekusi `authenticated` — wajib SECURITY DEFINER agar policy `profiles` tidak rekursif.
- Terbuka: belum ada user (0 profil). Setelah daftar via app, promosikan 1 user ke role CEO.

## [2026-06-23] update | Rekomendasi arsitektur menyeluruh

- Sumber dibaca: `wiki/concepts/tech-stack.md`, `permission-model.md`, `execution-loop.md`, `scope-guardrails.md`, `overview.md`, `index.md`
- Pages created: `concepts/architecture.md`
- Pages updated: `index.md` (tambah `[[architecture]]` di Concepts, alfabetis; `updated` → 2026-06-23)
- Key takeaways: arsitektur = DB-centric serverless ("thick database, thin client") di atas Supabase BaaS — bukan monolith server, bukan microservice. Business logic (permission, audit, mutasi card, scoring) ditegakkan di Postgres via RLS + trigger + RPC SECURITY DEFINER; Edge Functions hanya untuk orchestration (push notif, cron kompleks); client Expo nyaris tanpa business logic. ADR kunci: batas logic Postgres vs Edge Functions dipaku ke Postgres untuk cegah celah bypass.
- Risiko dicatat: RLS recursive/lambat (mitigasi: helper function + index/closure table), policy RLS sulit ditest (mitigasi: pgTAP sejak awal), vendor lock-in (ditoleransi — Postgres standar).

## [2026-06-23] update | Fase 1 — Card Engine + Loop Eksekusi (WEDGE)

- Migrasi `supabase/migrations/0005_fase1_card_engine.sql` diterapkan ke Supabase (10 tabel baru): `initiatives` (datar sementara), `action_plans`, `action_plan_submissions`, `action_plan_result_values`, `evidence_files`, `reviews`, `card_completion_rules`, `card_guidance_contents`, `activity_logs`, `governance_violations`. Total 17 tabel live (7 Fase 0 + 10 Fase 1).
- Loop eksekusi ([[execution-loop]]) ditegakkan via RPC SECURITY DEFINER: `activate_initiative`, `activate_action_plan` (cek Kelengkapan Card + anti self-review), `start_action_plan`, `submit_action_plan` (submission versioning + Bukti/Nilai Hasil), `review_action_plan_submission` (approve→Selesai / reject→Revisi, alasan wajib, **anti self-approval** blok keras).
- Evidence locking & versioning: tabel submission/evidence/result/review tanpa policy INSERT/UPDATE/DELETE — hanya RPC yang menulis, sehingga bukti tidak bisa diubah diam-diam ([[audit-governance]]). Visibilitas via helper `can_access_initiative`/`can_access_action_plan` (SECURITY DEFINER, bebas rekursi) sesuai [[permission-model]].
- Override reviewer (pemegang `manage_others_cards` me-review non-tunjuk) dicatat ke `governance_violations` (jalur commit, bukan jalur raise).
- UI mobile: Workspace (daftar Initiative + buat), detail Initiative + Action Plan, form buat card (Draft → Aktifkan), detail Action Plan (Start/Submit/Review inline), form Submit Bukti + Nilai Hasil (baris dinamis), riwayat submission per versi; Home wired ke "Perlu dikerjakan" + "Butuh review". Keterangan Card tampil sebagai GuidanceNote dari `card_guidance_contents`.
- Verifikasi: smoke-test e2e 3 user (owner/staff/reviewer) — self-approval & reject-tanpa-alasan terblok, alur Assigned→In Progress→Menunggu Review→Selesai dan reject→Revisi→resubmit(v2)→Selesai jalan utuh; semua data uji dibersihkan. `tsc --noEmit` lulus; `database.types.ts` di-regenerate.
- Catatan: upload file bukti ke Storage bucket `evidence` (sudah dibuat, terkunci) menyusul — form Fase 1 mendukung catatan teks & link. Lint `expo lint` gagal karena bug native-binding `unrs-resolver` (lingkungan, bukan kode).
- Gerbang Validasi (manual): jalankan 1 minggu kerja nyata di Nyantuy — apakah staf submit bukti tanpa disuruh. Belum terlewati.

## [2026-06-23] update | Pengujian manual UI Fase 1 (web) + 2 bug fix

- Menjalankan app via Expo web + browser preview, login bergantian sebagai 3 user uji (CEO/staff/reviewer) menelusuri seluruh wedge: login → Home (per-peran) → Workspace → buat & aktifkan Initiative → buat & aktifkan Action Plan (picker PIC/Reviewer, FK embed nama) → staf Mulai Kerjakan → Submit Bukti+Nilai Hasil (versi 1) → reviewer Setujui → **Selesai**. Semua transisi status & RPC jalan di UI nyata. Data uji + 3 user dibersihkan.
- **Bug 1 (ditemukan & diperbaiki):** query profil pakai `.single()` tanpa filter `id`, mengandalkan RLS. Karena policy `profiles` mengizinkan lihat seluruh anggota org, hasilnya >1 baris → PostgREST 406 → profil undefined → `can('create_initiative')` false → tombol buat hilang. Fix: tambah `.eq('id', uid)` di `use-profile.ts` & `settings.tsx`. (Lolos di Fase 0 karena baru 1 profil.)
- **Bug 2 (ditemukan & diperbaiki, migrasi `0006_fase1_fix_returning_rls.sql`):** `INSERT ... RETURNING` (dipakai supabase-js `.select()`) gagal RLS 42501 di `initiatives` & `action_plans`. Sebab: policy SELECT memanggil fungsi SECURITY DEFINER yang meng-query ULANG tabel yang sama — baris baru belum terlihat snapshot fungsi di tengah statement → false. Fix: policy SELECT mengevaluasi kolom baris sendiri langsung (org/pic/reviewer/created_by) + helper definer hanya untuk cek lintas-tabel (`initiative_has_my_action_plan`, `i_am_initiative_pic`); `can_access_initiative` dibuang.
- Catatan UX web: `router.replace` dari rute modal (form buat) tidak men-dismiss overlay modal di web (native dismiss normal). Mobile-first, dicatat sebagai quirk web.
- Pelajaran: `tsc` + uji logika DB tidak menangkap dua bug di atas; keduanya hanya muncul saat integrasi UI↔PostgREST dijalankan. Uji manual wajib untuk slice baru.
