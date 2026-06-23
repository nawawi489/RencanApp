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
