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

## [2026-06-24] update | sdd-plan Fase 3 (Home + Notifications + Inbox)

- Workflow sdd-plan dijalankan (14 agent): Research(4 lens) → Draft(6 bagian) → Grill(produk/eng/governance) → Synthesize.
- Spec final disimpan: specs/fase-3-home-notifications-inbox.md (43 acceptance criteria, 20 testable behaviors, 7 open questions).
- Handoff TDD: specs/fase-3-tdd-handoff.json (migrasi 0008_fase3_collab.sql; tabel notifications, comments, mentions, chat_rooms, chat_room_members, chat_messages, chat_message_reads).
- Keputusan kunci grill: Reviewer Initiative dibuang (initiatives tak punya reviewer_id); Home jadi timezone-aware (organizations.timezone) menggantikan todayISO() device/UTC; RPC submit/review di-replace untuk emit notif tanpa melonggarkan guard; idempotensi cron via unique partial index; governance_warning recipient diturunkan dari PIC/Reviewer card terdampak.
- Lanjut: jalankan tdd-plan dengan handoff ini.

## [2026-06-24] update | tdd-plan Fase 3 (Home + Notifications + Inbox)

- Workflow tdd-plan dijalankan (8 agent): Map(3 area) → Tests(3 layer) → Plan(27 langkah red/green/refactor) → Critic.
- Rencana TDD disimpan: specs/fase-3-tdd-plan.md (27 langkah, strategi mock 4 layer: data/hook/screen/SQL, urut A→J).
- Critic verdict: PERLU-PERBAIKAN (17 missing case, 11 concern). Blocker utama sebelum koding:
  1. Kontradiksi spec↔test: home.test mengunci RPC get_today_focus/getOrgToday, padahal spec §6.2 default = query per-section + helper SQL org_today(). Harus diputuskan dulu (per-section vs RPC agregat).
  2. Onboarding AC-H12 butuh profiles.created_at yang BELUM diekspos useProfile → risiko false-green.
  3. AC-N9 guard regression byte-for-byte belum punya daftar input-pelanggar konkret per guard.
  4. AC-H6b timezone boundary lebih tepat diuji di SQL, bukan screen (fake timers bentrok jest-expo).
  5. makeQuery perlu range/in/limit terminal vs intermediate; append-only test harus bedakan tulis-klien-gagal vs tulis-via-RPC-sukses (notifications.is_read mutable via RPC).
- Status: planning Fase 3 lengkap (spec + TDD). Implementasi belum dimulai; selesaikan 5 blocker di atas dulu.

## [2026-06-24] update | Resolusi 5 blocker Fase 3 (siap koding)

- Workflow fase3-resolve-blockers (7 agent): Research(5 blocker) → Synthesize → Critic.
- Addendum terkunci: specs/fase-3-resolusi-blocker.md (resolusi B1-B5 + CF-1..CF-4). Pointer ditambahkan di spec & plan (addendum menang bila bentrok).
- Keputusan kunci: B1 Home = per-section query (RPC agregat get_today_focus DILARANG, pecah retry AC-H11); org_today()+get_org_today() server = sumber tanggal tunggal, hapus todayISO()/isOverdue() device. B2 expose profiles.created_at di useProfile + onboarding <7 hari. B3 enumerasi 29 guard di 5 RPC → suite kontrak SQL guard-regression. B4 AC-H6b boundary diuji di SQL bukan screen. B5 makeQuery thenable (in/range/gte/lt terminal) + append-only 2-lapis.
- Critic must-fix dikunci: CF-1 governance_warning recipient bercabang per violation_type (reviewer_override=pelaku skip, instance_missed=PIC korban pakai); CF-2 useProfile mock+null-guard getProfileAgeInDays→Infinity; CF-3 dedupe/section pakai org_today() server bukan cache klien; CF-4 gate AC-N9 = 29-case SQL (md5 advisory).
- Status: blocker tuntas. Mulai implementasi TDD langkah 1 (migrasi 0008 + use-profile + data layer).

## [2026-06-24] update | Fase 3 implementasi: data layer + migrasi 0008 (GREEN)

- Migrasi supabase/migrations/0008_fase3_collab.sql ditulis (BELUM diterapkan): 7 tabel append-only (notifications, chat_rooms, chat_room_members, chat_messages, chat_message_reads, comments, mentions) + helper org_today()/is_chat_member()/emit_notification(); RPC tulis (mark_notification_read, send_chat_message, mark_chat_messages_read, create_comment, get_chat_rooms) + RPC Home per-section (get_today_repeat_instances, get_overdue_items, get_near_deadline_items, get_org_today); trigger auto-create chat room saat Initiative active + sync member + governance_warning (CF-1 bercabang per type); REPLACE 5 RPC existing (guard identik + emit notif); pg_cron emit_deadline_notifications; RLS SELECT-only + revoke tulis langsung (append-only 2-lapis).
- Data layer + test (jest hijau): use-profile.ts (expose created_at + getProfileAgeInDays null-guard, G0), notifications.ts, inbox.ts, home.ts. Helper test makeQueryThenable (B5.1) mendukung in/range/order di posisi mana pun.
- Hasil: npm test FULL 91/91 hijau, 0 regresi (home.test.tsx existing tetap hijau). tsc: error TS hanya pada nama RPC/tabel baru yang belum ada di database.types.ts (EXPECTED — butuh regen setelah 0008 diterapkan).
- GATE berikut (butuh keputusan): terapkan 0008 ke project Supabase dev (fhnqwytqprsptjshoxfn) → regen types → tsc hijau → suite kontrak SQL 29-case (AC-N9) + append-only matrix. Lalu hook + screen.

## [2026-06-24] update | Migrasi 0008 diterapkan ke dev + drift schema ditemukan

- 0008_fase3_collab.sql DITERAPKAN ke project dev fhnqwytqprsptjshoxfn (apply_migration). database.types.ts diregen (7 tabel + RPC baru).
- DRIFT PENTING: DB dev TIDAK punya can_access_initiative (file repo 0005 punya, deployed pakai initiative_has_my_action_plan inline di policy initiatives_select). Repo migrations 0005+ tampak tidak sinkron dengan DB deployed. 0008 menambah can_access_initiative (semantik live) untuk rekonsiliasi. Perlu audit sinkronisasi migrasi repo vs DB nanti.
- Hardening: revoke execute fungsi trigger (tg_initiative_chat_room/tg_action_plan_sync_chat/tg_governance_warning) dari REST (advisor WARN) via migrasi fase3_harden_trigger_functions.
- Verifikasi DB: (a) AC-N9 guard-presence 5 RPC replaced — semua guard (anti-self-approval/evidence/reviewer/reject-reason) tetap ada + emit_notification ditambah. (b) Append-only: 7 tabel RLS on + 0 grant tulis langsung authenticated. (c) Advisor security: hanya pola SECURITY DEFINER executable yang sudah jadi pola proyek + leaked-password (config auth) — tak ada lint baru kritis.
- Sisa: tsc + jest re-verify (running), lalu hook + screen Home/Notifications/Inbox; suite kontrak SQL 29-case per-user (butuh harness JWT) sebagai gate AC-N9 penuh.

## [2026-06-24] lint | Audit drift migrasi repo vs DB deployed

- Pemicu: dugaan drift can_access_initiative (ada di repo 0005, tak ada di live).
- HASIL: FALSE ALARM. 0006_fase1_fix_returning_rls.sql baris 65 `drop function if exists can_access_initiative(uuid)` setelah mengganti policy initiatives_select/action_plans_select ke initiative_has_my_action_plan/i_am_initiative_pic. Apply 0001->0008 berurutan MEREPRODUKSI skema live. 0008 membuat ulang can_access_initiative (dipakai comments/mentions, aman: cross-table bukan self-table).
- Diaudit & COCOK: fungsi (43), policy (30, termasuk supersede 0006), trigger (11 incl on_auth_user_created di auth.users), tabel (26). rls_auto_enable = fungsi bawaan platform Supabase (0004 hanya revoke), bukan drift.
- SATU divergensi nyata: riwayat migrasi. schema_migrations remote = 9 record; repo = 8 file. Statement REVOKE 3 fungsi trigger diterapkan sbg migrasi terpisah fase3_harden_trigger_functions (20260624104539) tapi sebelumnya dilipat ke file 0008. Skema identik; hanya ledger beda.
- PERBAIKAN (repo-only, tanpa ubah live): pindahkan 3 revoke trigger ke file baru 0009_fase3_harden_trigger_functions.sql + hapus dari 0008. Kini 9 file <-> 9 record sejajar 1:1.
- Kesimpulan: tidak perlu migrasi korektif skema; repo sudah jadi sumber kebenaran yang mereproduksi live.

## [2026-06-24] update | Fase 3 UI selesai (Home + Notifications + Inbox/chat)

- Brownfield (main loop): TabBar ditambah ke components/ui.tsx; route inbox/[roomId] didaftarkan di (app)/_layout.tsx; Home (index.tsx) ditulis ulang per-section: hapus todayISO()/isOverdue() device → dateLabel dari getOrgToday() server, 6 section retry-granular (Perlu dikerjakan, Repeat hari ini, Butuh review, Terlewat, Deadline mendekat, Revisi), Prioritas dari listOverdueItems server (error→"Gagal memuat." bukan 0), onboarding GuidanceNote (<7 hari via getProfileAgeInDays). home.test.tsx diperbarui (mock @/lib/home, tanpa mock Date — boundary di SQL).
- Greenfield (workflow fase3-ui-build, 2 agent paralel + verify): use-notifications.ts + notifications.tsx (TabBar 8 tab, unread badge, mark read/all, 4 state); use-inbox.ts + inbox.tsx (daftar room + unread) + inbox/[roomId].tsx (chat: daftar pesan + composer + markRead on mount).
- Verifikasi independen: npm test 124/124 (18 suite), tsc 0 error.
- Sisa Fase 3: suite kontrak SQL 29-case per-user (gate AC-N9 penuh, butuh harness JWT) belum; polish UX chat (urutan pesan terbaru-dulu, composer di dalam scroll) opsional.

## [2026-06-24] update | Suite kontrak SQL per-user Fase 3 HIJAU (gate AC-N9 tuntas)

- Dijalankan via Supabase MCP execute_sql sebagai DO block transaksional (auth.uid() disimulasikan via request.jwt.claims; auth.users insert → trigger handle_new_user buat profil staff; rollback paksa via raise → nol polusi). Disimpan: supabase/tests/fase3_per_user_contract.sql (5 blok, bentuk psql begin/rollback + raise-on-fail).
- T1 one-time guards (12): submit_action_plan S1-S5 + review_action_plan_submission R1-R7 (decision invalid, not-found, anti-self-approval, non-reviewer, reject-reason, reviewer_override logging, already-reviewed) — ALL_PASS.
- T2 instance guards (14): submit_action_plan_instance I1-I6 + review_action_plan_instance_submission RI1-RI8 (termasuk bukan-submission-instance, anti-self instance) — ALL_PASS.
- T3 append-only: 7 tabel tolak INSERT langsung authenticated (42501) + notifications UPDATE/DELETE ditolak; RLS recipient (PIC lihat sendiri, OUT 0, no leak) + chat member (member lihat room, non-member tidak) — ALL_PASS.
- T4 governance_warning CF-1: reviewer_override → PIC+Reviewer+holder(view_governance_violation), pelaku DIKECUALIKAN; instance_missed → Reviewer+holder, PIC TIDAK via gov-path; low severity diabaikan. Cron idempotency (AC-N10): emit_deadline_notifications 2x → 1 notif — ALL_PASS.
- T5 mention gating (AC-I6): mention member → row+notif, non-member → nihil; non-member tak bisa kirim; mark_chat_messages_read kecualikan pesan sendiri (AC-I5) — ALL_PASS.
- STATUS: Fase 3 SELESAI PENUH (DB + data layer + hooks + screens + suite kontrak per-user). Tidak ada gap fitur/verifikasi yang tersisa; hanya 2 polish UX chat opsional (urutan pesan, composer pinned).

## [2026-06-25] update | Fase 6 SDD spec + TDD plan (multi-agent)
- Pages created: [[fase6-spec]] (sdd-plan, 14 agen), [[fase6-tdd-plan]] (tdd-plan, 8 agen)
- Pages updated: [[index]]
- Key takeaways:
  - Fase 6 = Development Workspace (Development Area → Problem Statement → Initiative → Action Plan), jalur eksekusi kedua EMS.
  - Tabel baru: development_areas, problem_statements; kolom initiatives.problem_statement_id (CHECK single-parent strategy_id XOR problem_statement_id).
  - Migration target: supabase/migrations/0012_fase6_development_workspace.sql. Initiative & Action Plan reuse Fase 1-5; MBR enforcement yang di-defer Fase 5 di-flip ON.
  - Grill SDD 3× "perlu-perbaikan" → must-fix difold ke AC final (AC-G6/G7/G8 trigger sibling-count, AC-C3 FK null-safe backward-compat).
  - Critic TDD verdict "perlu-perbaikan": 11 missing cases (MC-1..MC-11) + 8 concerns (CN-1..CN-8) diappend sebagai §5 addendum — gap kritis: regresi 42501 INSERT...RETURNING, null-safety problem_statement_in_my_org, gate MBR blokir_aktivasi belum terkunci.

## [2026-06-25] update | Fase 6 Development Workspace — IMPLEMENTED & VERIFIED
- Files added: supabase/migrations/0012_fase6_development_workspace.sql; supabase/tests/fase6_development_workspace_contract.sql; mobile/src/lib/{development-areas,problem-statements}.ts (+ tests); mobile/src/app/(app)/development-area/{new,[id]}.tsx; mobile/src/app/(app)/problem-statement/{new,[id]}.tsx
- Files updated: mobile/src/lib/cards.ts (NewInitiative.problem_statement_id + listInitiatives filter); workspace-copy.ts (WS_TABS + WS_DEV_COPY); use-workspace.ts (5 new queries + 2 action hooks); workspace.tsx (dual-tab Performance/Development); initiative/new.tsx (problemStatementId param); _layout.tsx (4 routes); database.types.ts (regen); use-mbr.test.tsx + use-profile.test.tsx (Fase 6 dev card types + create_development_area gating tests)
- Status verifikasi:
  - DB contract: 12/12 PASS via MCP execute_sql per-block (schema, single_parent, INSERT-RETURNING 42501 MC-1, permission CN-7, null-safe CN-8, visibility chain, activate DA+PS+MBR gate MC-4/CN-5, MBR flip, trigger mode 2, guidance seed).
  - Jest: 276/276 PASS (35 suites). tsc 0 errors.
  - UI live: Expo web preview, dual-tab Workspace render & switch OK; Development pane shows + button + EmptyState dengan copy benar.
- Critic gaps closed: MC-1 (42501 INSERT...RETURNING DA+PS), MC-4 (MBR blokir_aktivasi gate untested), CN-5 (gate ambigu), CN-7 (server-side has_permission deny C-Level w/o grant), CN-8 (problem_statement_in_my_org null-safe untuk Performance Initiative backward-compat).
- Belum di-commit. Branch: feat/fase-4-performance-workspace.

## [2026-06-26] qa | Manual QA menyeluruh V1.8.1

- Pages created: [[test-reports/2026-06-26-manual-qa]]
- Pages updated: [[index]]
- Highlights:
  - Jest mobile: **463/463 PASS** (53 suite)
  - DB contract: 4/4 Fase 8 + 5/5 sampling Fase 3-7 PASS
  - 16 skenario E2E per role (CEO/Manager/Staff) — semua PASS
  - Advisor: 0 BLOCKER, 1 HIGH (leaked-password protection off), 4 MEDIUM perf
  - Findings F-1..F-8; verdict GO setelah F-2/F-3/F-4 (~30 menit kerja)

## [2026-06-26] update | QA follow-up fixes V1.8.1 — migrasi 0015 (F-1/F-3/F-4/F-5/F-6)

- Files added: supabase/migrations/0015_qa_followup_fixes.sql; wiki/concepts/evidence-kinds.md
- Files updated: wiki/test-reports/2026-06-26-manual-qa.md (§ Remediation); wiki/log.md; wiki/index.md
- Diterapkan ke DB live (project fhnqwytqprsptjshoxfn) via apply_migration + diverifikasi:
  - **F-3** duplicate unique → DROP CONSTRAINT settings_organization_id_key_key. Advisor duplicate_index 1→0.
  - **F-4** auth.uid() → (select auth.uid()) di 42 policy (DO-block idempoten). Advisor auth_rls_initplan 42→0; 0 bare auth.uid() tersisa.
  - **F-6** composite index (entity_type,entity_id) di notifications + governance_violations (activity_logs sudah ada).
  - **F-1** evidence_files.kind + 'link_generic' (lihat [[evidence-kinds]]).
  - **F-5** handle_new_user hormati raw_app_meta_data->>'role_level' (service-role only; default tetap staff).
- Re-test pasca-fix:
  - Live RLS impersonation (Staff/Manager/CEO): score privacy & notif isolation intact (ceo_scores=0, foreign_notifs=0 untuk non-CEO); workspace differentiation utuh (Staff 2 aps vs CEO 3).
  - Security advisor: tetap 81 SECURITY DEFINER (by-design) + 1 leaked-password (F-2).
- Sisa (non-migrasi): **F-2** leaked-password protection = toggle dashboard Auth→Security (1 klik, tak bisa via MCP). **F-7** notif body & **F-8** smoke-test mobile (Detox/EAS) = ditunda.

## [2026-06-26] update | Backlog UI dari perbandingan prototype

- Pages created: [[ui-prototype-gap]] — perbandingan 46 layar `design.html` vs `mobile/src/app/`, ditulis sebagai backlog ber-ID (`UI-G-###` lintas-layar, `UI-N-###` navigasi, `UI-S-###` per-layar).
- Pages updated: `index.md` (entry baru + tanggal).
- Diagnosis: prototype = dashboard kaya visual; app = utility eksekusi fungsional & governance-correct. Dua regresi nyata: Inbox/chat polos (UI-S-IN1–IN4) dan Score Formula read-only (UI-S-SF1).
- Gap sistemik utama: tidak ada progress orb sistemik (UI-G-001), Log Aktivitas panel (UI-G-002), stepper + Draft & Aktifkan footer (UI-G-004), search pill di topbar (UI-G-005).
- Gap struktural utama: tab "Menu" hilang ke People (UI-N-001), Workspace hub-card → tab-switcher (UI-N-002), pohon hanya 2 level (UI-N-003).
- Prioritisasi P0–P3 ditulis langsung di dokumen untuk dipakai sebagai backlog tim UI.

## [2026-06-26] update | Spec sdd-plan: Inbox & Chat UI (UI-S-IN1–IN4)

- Files created (specs/, bukan wiki): `specs/inbox-chat-ui.md` (spec final) + `specs/inbox-chat-ui-tdd-handoff.json`.
- Pages updated: `index.md` (catatan spec turunan di entry [[ui-prototype-gap]]).
- Dijalankan via skill `/sdd-plan` (workflow 4 fase, 14 agen, ~1.2M token): Research → Draft → Grill (produk/eng/governance) → Synthesize.
- TEMUAN UTAMA: backend chat SUDAH lengkap sejak Fase 3 (migrasi 0008 — chat_rooms/messages/reads/mentions, RPC send/mark/get ber-RLS is_chat_member). Gap UI-S-IN murni lapisan presentasi, KECUALI UI-S-IN3 (reactions/read-receipt/reply-quote/system-events) yang butuh migrasi baru → DEFER ke V2.
- SCOPE V1.8.1 terkunci: UI-S-IN1 (minus chip PIC/Review/Deadline + search isi pesan), UI-S-IN2 penuh, composer circular-send, banner governance WAJIB. FR-DATA.1 (extend get_chat_rooms utk preview) opsional P0.
- 3 KEPUTUSAN OWNER TERBUKA (memblok sebagian scope): OWNER-1 Reviewer Initiative bukan chat member (initiatives tak punya reviewer_id — koreksi PRD atau migrasi); OWNER-2 emoji reaction vs scope-guardrails §88 (default TOLAK); OWNER-3 PIC induk bukan member room turunan (klaim US-16 dihapus).
- Handoff siap ke `/tdd-plan`; prasyarat: daftarkan token ChatBubble/DateDivider/ContextBanner/SendButton di DESIGN.md §7 dulu.

## [2026-06-26] update | Rencana TDD: Inbox & Chat UI

- Files created: `specs/inbox-chat-ui-tdd-plan.md` (rencana red→green→refactor + addendum critic).
- Dijalankan via skill `/tdd-plan` (workflow 4 fase, 8 agen): Map → Tests → Plan → Critic.
- Keputusan owner terkunci: FR-DATA.1 MASUK → migrasi baru **0018** (extend get_chat_rooms +last_message_body +last_message_author_name).
- Urutan: Fase A data/migrasi → B hooks (loadOlder/hasMore) → C token gate DESIGN.md → D inbox list → E thread → F verifikasi suite.
- Critic verdict **perlu-perbaikan** → addendum mengikat (§8) ditambahkan: (1) contract FR-DATA.1 WAJIB set jwt claims + seed-as-owner (tanpa ini false-green); (2) assertion anti-bypass search salah semantik → ganti ke output terfilter; (3) useAuth mock TDZ footgun; (4) ≥44dp testability pakai inline style + accessibilityState eksplisit; (5) tambahan case off-by-one clamp, null author, tie created_at, room kosong, anti double-submit.
- Siap dieksekusi (kode test-first). Belum ada kode ditulis — menunggu owner lanjut implementasi.

## [2026-07-01] update | prototype fidelity mode

- Completed batches: shell, tabs, people, detail, forms
- Verification: route smoke tests + side-by-side visual QA against `design.html`
- Remaining gaps: none blocking

## [2026-06-26] update | Eksekusi TDD Inbox & Chat (P0 UI-S-IN1..IN4)

- **Hasil:** Jest **540/540 pass** (sebelumnya 512 → +28). TSC bersih. Lint: 0 issue baru dari fase ini (3 error pre-existing di `settings-permission-users.tsx`). Advisor security: 0.
- **Fase A — Data (FR-DATA.1):** migrasi **0018_fr_data1_inbox_preview** apply (DROP+CREATE `get_chat_rooms()` +2 kolom). Contract `supabase/tests/0018_inbox_preview_contract.sql` lulus 6 invarian (T1 preview, T2 non-member 0 baris dgn jwt switch, T3 empty room, T4 null author LEFT join, T5 tie id desc, T6 outer order nulls last). Per Critic §8.1 — auth context eksplisit via `set_config('request.jwt.claims')` + `execute 'set local role authenticated'`, seed sbg postgres dulu (insert revoked dari authenticated). `database.types.ts` di-regen; `ChatRoom` di [`inbox.ts`](mobile/src/lib/inbox.ts) +2 field nullable; `CHAT_PAGE_SIZE` diekspor.
- **Fase B — Hooks:** 10/10 pass. `useChatMessages` direfactor ke `useInfiniteQuery` → `loadOlder()` + `hasMore`. Regression guards baru: send-fail tidak invalidate; markRead invalidate HANYA `['chat-rooms']`. Critic §8.7: baseline case [2] di-rewrite ke `toHaveBeenCalledWith('r1', 0)`.
- **Fase C — Token gate:** ChatBubble / DateDivider / ContextBanner / SendButton didaftarkan di [`DESIGN.md §7`](DESIGN.md) sesuai aturan `mobile/CLAUDE.md` (token diregistrasi sebelum kode UI). Critic §8.4: SendButton WAJIB inline `{width:44,height:44}` + `accessibilityState={{disabled}}` eksplisit (NativeWind class tak selalu flatten di jest).
- **Fase D — Inbox list:** 14/14 pass. Avatar seed=room.id, preview `'{author}: {body}'` (fallback `body` saat author null; fallback timestamp saat body null), clamp 99/100 boundary (Critic §8.5 off-by-one), search by-nama (Critic §8.2: assert OUTPUT terfilter, bukan call-count), chip Semua/Belum dibaca, chip ter-defer (Saya PIC/Review/Deadline) sengaja tidak dirender (scope-lock), empty-state kontekstual per search/filter.
- **Fase E — Thread:** 18/18 pass. Urutan kronologis-menaik via `[...messages].reverse()`, bubble me/them via `useAuth().session?.user?.id` (default 'them' saat null), Avatar+nama untuk them (author null → '?'), DateDivider per-hari device-tz + skip invalid created_at, satu hari = tepat satu divider, `roomId` undefined → ErrorState + markRead TIDAK dipanggil, composer SendButton circular (inline 44/44, `accessibilityLabel='Kirim pesan'`), anti double-submit (`isSending` → button disabled), gagal-send → input tetap + `role='alert'`, GovernanceBanner "Chat bukan jalur formal: …" dgn tombol Tutup, `Muat pesan lama` saat hasMore.
- **Closes backlog:** UI-S-IN1, UI-S-IN2, UI-S-IN3 (banner governance varian — bukan banner reply-AP yang ter-defer), UI-S-IN4 (circular SendButton); UI-G-005 (search pill bagian dari Inbox list, bukan topbar — belum). Catatan: regresi "chat polos" pada [[ui-prototype-gap]] kini tertutup.
- **Item ter-defer (sengaja tidak dieksekusi V1):** reactions, reply-quote, banner per-pesan reply-AP, system events, attach-evidence paperclip, chip Saya PIC/Review/Deadline, workspace-viewer composer gating (FR-IN4.3) — tetap di backlog.

## [2026-06-26] update | Eksekusi TDD AP5 (file upload) + AP6 (KPI linkage)

- **Hasil sementara:** migrasi 0019 apply + contract 10 invarian PASS; storage.test 25/25; cards.test 17/17; use-submission 13/13; submit.test 10/10. Full suite + tsc verify Fase F berikutnya.
- **Fase A — Data (migrasi 0019_fase_exec_ap5_ap6):**
  - ALTER `action_plan_result_values` +kpi_area_id (NULLABLE per ER-1/A2 backward-compat) +value_numeric +previous_value_text
  - ALTER `action_plan_submissions` +status check ('draft'/'submitted') untuk 2-phase finalize
  - VIEW `kpi_area_current_values` (security_invoker, WHERE review_status='approved')
  - 3 RPC baru: `create_submission_draft`, `submit_action_plan` (REPLACE signature lama — BREAKING per OQ-4 deploy-atomic), `cleanup_orphan_upload` (set GUC storage.allow_delete_query untuk bypass protect_delete trigger)
  - Helper `log_governance_violation` SECURITY DEFINER (revoke dari authenticated)
  - `list_kpi_area_candidates_for_action_plan` (Fase 1 fallback per OD-1: initiative.strategy_id NULL → 0 baris)
  - Storage RLS bucket `evidence`: INSERT `auth.uid()=pic_id` (ER-3 anti-Reviewer-injection); SELECT `can_access_action_plan`; DELETE conditional draft (ER-4 evidence locking)
  - Bug rencana yg di-fix saat eksekusi: VIEW perlu kolom `value_numeric` (A1); ADD COLUMN NOT NULL → diganti NULLABLE+RPC enforce (A2); bucket name = 'evidence' (A3); RPC name `cleanup_orphan_upload` (A4); sequential→parallel upload (A5); migrasi 0019 (0018 PR #13) (A6); ambiguous `name` → `objects.name` table-qualified; drop policy lama `evidence_objects_insert/select` yg permisif; severity 'warning'→'medium' (governance_violations_severity_check).
- **Fase B — Data layer:** `cards.ts` +EVIDENCE_KIND_LABEL.link_generic (ER-9), `ResultValueInput` +kpi_area_id+value_numeric, `createSubmissionDraft`/`finalizeSubmission`/`listKpiAreaCandidates`/`getKpiAreaCurrentValue`. New `storage.ts`: `classifyKind` (MIME deterministik per ER-6), `validateFile` (10MB cap), `validateBatch` (5 file + 25MB cap), `safeFilename`, `buildEvidencePath`, `uploadEvidenceFile`, `cleanupOrphanUpload`. New `file-picker.ts` wrapper expo-document-picker.
- **Fase C — Hooks:** new `use-submission.ts`: `useKpiCandidates`, `useKpiCurrentValue`, `useSubmissionFlow` (state machine + anti double-tap guard di API surface bukan mutationFn — useMutation tidak share in-flight promise; pakai useRef + mutateAsync wrapper).
- **Fase D — Komponen UI:** ui.tsx +UploadButton +AttachmentRow +ProgressPill +KpiLinkageCard +DeltaArrow (a11y label eksplisit menyebut arah — DESIGN §4) +ImpactApprovalCard +IMPACT_APPROVAL_COPY konstanta.
- **Fase E — Refactor submit.tsx:** integrasi 2-phase commit + UploadButton + KpiResultRow (KPI picker auto-select bila 1 kandidat, sembunyikan section bila 0 per OD-1, DeltaArrow + ImpactApprovalCard saat valid value). Mode instance (repeat) tetap pakai jalur lama (OD-3 out of scope).
- **Closes backlog:** UI-S-AP5, UI-S-AP6 ✅. wiki/concepts/ui-prototype-gap.md di-update.
- **DEFER V2 sengaja:** Reviewer-side render attachment + KPI delta di SubmissionCard/action-plan[id]/instance[id] (OD-3 → PR follow-up); telemetri analytics (OQ-5); telemetri governance_violation untuk reject path (V1 limitation — exception rollback log; butuh autonomous tx, preseden Fase 7 OQ-1).

## [2026-06-27] update | Eksekusi UI-S-SF1 Score Formula editor inline

- **Hasil:** Jest **600/600 pass** (sebelumnya 588 → +12). TSC bersih. Lint 0 issue baru (13 pre-existing). Advisor 0.
- **Fase A — Migrasi 0020 + Contract 13 invarian:** trigger `tg_score_formula_immutable_columns` (block UPDATE non-draft + kolom kunci); extend `tg_block_delete_append_only` ke `score_formula_versions`; RPC `create_score_formula_draft` (1-draft enforce + hybrid clone + change_reason min 8); RPC `update_score_formula_version_weights` (UPDATE in-place + categories_set_mismatch guard + integer-only); patch `activate_score_formula_version` (reject retroaktif). Audit: 3 event baru (`score_formula_draft_created`, `score_formula_weights_updated`, `score_formula_activated`).
- **Fase B — Data layer:** `people-score.ts` +types `FormulaLevel`/`CreateScoreFormulaDraftInput`/`UpdateFormulaVersionWeightsInput` +wrappers `createScoreFormulaDraft`/`updateFormulaVersionWeights`. Test 6 case baru (+33 existing).
- **Fase C — Hooks:** `useFormulaActions` extend `createDraft`/`updateWeights` (+isCreatingDraft/isUpdatingWeights flags). Test 3 case baru.
- **Fase D — Refactor screen:** `DraftEditor` inline (TextInput numeric integer 0..100 per kategori, total badge live, sticky footer Save+Activate dgn `accessibilityState` eksplisit). `LevelChips` 4 chip (Staff/Mgmt/C-Level/CEO — Custom hidden per DEC-9). CTA "Buat Draft" per level kosong. 8 test screen baru (12 total).
- **Bug rencana yg di-fix saat eksekusi:** kolom `description` di score_formula_templates tidak ada (pakai `name` saja); severity governance ∈ {low|medium|high|critical} (existing helper), 'warning' tolak (sama dgn PR #14); `setState` di `useEffect` (anti-pattern) → ganti `key={version.id + categories-hash}` reset pattern; 3 fail screen test awal (label `Aktifkan v${n}` bukan `versi ${n}`, total label format `Total: 100%` bukan `Total bobot:`, F-3 disabled state assertion bukan reject test).
- **Closes:** ~~UI-S-SF1~~ ✅ di [[ui-prototype-gap]]. Sisa P0: UI-G-001 (progress orb sistemik).
- **DEFER V2 sengaja:** Buat template baru, edit nama/level template, Custom level, Role assignment surface, Audit log UI explorer, Discard draft RPC, Etag concurrency (LWW only), governance_violations log reject path (V1 limitation Fase 7 OQ-1 — exception rollback).

## [2026-06-27] update | UI-G-001 ProgressOrb sistemik

- **Hasil:** Jest **614/614 pass** (sebelumnya 600 → +14: 9 unit lib/progress + 5 UI ProgressOrb). Tidak ada migrasi.
- **Fase A — Komponen visual:** `ProgressOrb` baru di `mobile/src/components/ui.tsx` (SVG ring dua lapis pakai `react-native-svg`); size diskrit **56** / **72** (stroke 6 / 8); angka persen di tengah (`font-extrabold` 16/20); tone otomatis dari nilai (`<35` danger / `35–69` warn / `70–99` brand / `100` success), override via prop `tone`; **A11y mengikat** — `accessibilityRole='progressbar'` + `accessibilityLabel` selalu menyebut persen + label tone eksplisit (mis. "Capaian 68 persen, Berjalan. 2/3 selesai"). Helper terekspor: `orbToneFor()` untuk pengujian deterministik. Token didaftarkan di `DESIGN.md §7` Table sebagai baris `ProgressOrb (UI-G-001)`.
- **Fase B — Derivasi capaian:** new `mobile/src/lib/progress.ts` — `ratioDoneOfChildren(children)` (% non-archived yang `done`; total 0 → 0), `childrenSublabel(children)` ("N/M selesai" atau "Belum ada turunan"), `computeActionPlanProgress({status, repeat, compliancePercent})` (repeat → compliancePercent; one-time → status-based heuristik: draft 0 / assigned 10 / revision 30 / in_progress 50 / submitted 80 / done 100). 9 unit test.
- **Fase C — Integrasi header detail:** 5 layar diubah ringan (header card → `flex-row` dgn title-block + orb size 72 di kanan): `goal/[id].tsx` (orb dari `kpiQ.kpiAreas`), `kpi-area/[id].tsx` (dari `strategies`), `strategy/[id].tsx` (dari `initiatives`), `initiative/[id].tsx` (dari `plansQ.data`), `action-plan/[id].tsx` (orb pakai `useRepeatInstances` ter-enable bila repeat → `compliancePercent`; one-time → status). Sublabel: container = "N/M selesai" / "Belum ada turunan"; AP repeat = "On-time compliance"; AP one-time = label status.
- **Closes:** ~~UI-G-001~~ ✅ di [[ui-prototype-gap]]. Backlog **P0 kini bersih** (UI-S-IN1..IN4, UI-S-SF1, UI-G-001, UI-S-AP5, UI-S-AP6 semua selesai). Fokus berikut: P1 (UI-S-K01 Pecahan Target Q/M, UI-S-S01 Kontribusi Q%, UI-S-G01 Target Tahunan, UI-S-PR1 Dampak Problem Statement, dst.).
- **Catatan derivasi:** angka indikatif murni klien — tidak menggantikan metrik server (Repeat Compliance utk AP repeat tetap dari hook existing). Bila kebijakan tone berubah (mis. ambang `<35` digeser), satu titik perubahan: `orbToneFor()` di `ui.tsx`.

## [2026-06-27] update | Theme switch (Sistem / Terang / Gelap)

- **ThemeProvider baru** `mobile/src/providers/theme-provider.tsx` — preferensi 3 mode dipersist di `AsyncStorage` (`rencanaapp:theme`). Terapkan via `Appearance.setColorScheme()` agar NativeWind v5 (react-native-css) memperbarui varian `dark:*` realtime. `useThemePreference()` aman tanpa provider (fallback default — test-friendly).
- **`_layout.tsx`** dibungkus `<ThemeProvider>` sebelum `<AuthProvider>`. `expo-router` ThemeProvider + `StatusBar` ikut nilai `effective` (`'light' | 'dark'`).
- **Settings UI** — section "Tampilan" baru di paling atas `(app)/settings.tsx`: segmented 3 chip (Sistem/Terang/Gelap), `accessibilityRole='radiogroup'` + tiap chip `radio` dgn `selected` state. Touch target ≥44px sesuai DESIGN §4.
- **Login screen** — gradient & semua teks/border/input dapat varian `dark:*`; gradient pakai `useThemePreference().effective` (`['#000','#0b1220']` vs `['#fff','#eef4fb']`); placeholder & icon color pun beradaptasi.
- **Jest setup** — file baru `mobile/jest.setup.js` mock `@react-native-async-storage/async-storage` lewat mock resmi (`jest/async-storage-mock`). Ditambah ke `setupFiles` di `package.json`. Tanpa ini, import `theme-provider` → `AsyncStorage` null di Node test runner.
- **Tes:** 66 suite / 614 tes hijau; typecheck bersih.
- **DESIGN.md §12** ditambah dokumentasi mode switch + aturan: layar/komponen baru wajib sediakan varian `dark:*` untuk bg/border/text serta gunakan `effective` untuk warna non-tailwind.

## [2026-06-27] update | Sinkronkan wiki ke PRD V1.8.2

- **Pemicu:** `/autoplan` atas "deltas vs PRD". Temuan: bukan konflik — `PRD_EMS_V1.82_Rencanaapp.md` (root) sudah memutuskan semuanya; **wiki & kode `mobile/` yang lag di V1.8.1.** Owner menetapkan V1.8.2 sumber kebenaran.
- **Pages updated:** [[surfaces]] (bottom nav → `Home·Notif·Workspace·Inbox·Menu`, People masuk Menu, +Period Focus Engine; warning kode lag P0), [[scope-guardrails]] (V1.8.2 §6: +Period Focus Engine +KPI Area Target Breakdown; callout **Kontribusi/Target Breakdown ≠ Bobot planning card**), [[overview]] (V1.8.2 + status implementasi), [[ui-prototype-gap]] (**UI-N-001 RESOLVED = Menu**), `index.md` (ringkasan surfaces + tanggal).
- **Koreksi review:** flag §88 "100% split = bobot planning card" yang sempat CRITICAL **VOID** — V1.8.2 sengaja memisah Target Breakdown (diizinkan, baris pada KPI Area) dari Bobot planning card (tetap ditolak). Implementasi breakdown wajib baris `kpi_area_id+periode`, **bukan** tabel kartu anak.
- **Belum disentuh (eksekusi berikut):** `mobile/src/app/(app)/(tabs)/_layout.tsx` masih People = tab 5 → **fix P0**. Sekuens S0–S4 + watch migrasi di `~/.gstack/projects/nawawi489-RencanApp/feat-sf1-prd-reconciliation-plan-20260627.md`.

## [2026-06-28] update | S0 nav Menu — implementasi PRD V1.8.2 §7.1

- **Pemicu:** TODOS.md S0 (sequencing keras S0→S4). Kode `mobile/` masih People = tab 5; PRD V1.8.2 = `Home·Notif·Workspace·Inbox·Menu`, People masuk Menu.
- **Hasil tes:** 67 suite / **617 tes pass**; `tsc --noEmit` bersih. Tidak ada migrasi DB.
- **Files moved:** `mobile/src/app/(app)/(tabs)/people.tsx` → `(app)/people.tsx` (jadi stack route non-tab, header lewat `<Stack.Screen name="people" title="People">` di `(app)/_layout.tsx`). Test `(tabs)/__tests__/people.test.tsx` → `(app)/__tests__/people.test.tsx` (import `'../people'` tetap valid).
- **Files added:** `mobile/src/app/(app)/(tabs)/menu.tsx` (re-export `SettingsScreen` kanonik dari `../settings`); `mobile/src/app/(app)/(tabs)/__tests__/menu.test.tsx` (3 tes: re-export identity, row People → push `/people`, row People Ranking → push `/people-ranking`).
- **Files edited:** `(tabs)/_layout.tsx` ganti `Tabs.Screen name="people"` → `name="menu"` (title "Menu", icon `menu-outline`, kicker "Profil, People, dan admin"). `(app)/settings.tsx` tambah 2 baris non-gate di puncak `SECTIONS`: **People** → `/people`, **People Ranking** → `/people-ranking` (sesuai PRD §31 People dipindah ke Menu). `(app)/_layout.tsx` tambah `<Stack.Screen name="people" title="People">`.
- **Keputusan struktur:** `/settings` tetap ada sebagai alias stack-route (file `(app)/settings.tsx` adalah sumber kebenaran; tab `/menu` cuma re-export). Avatar di `AppHeader` masih `push('/(app)/settings')` → memunculkan hub yang sama tapi sebagai stack screen dengan back-button — perilaku "buka profil" prototype tetap.
- **Closes:** ~~UI-N-001~~ ✅ di [[ui-prototype-gap]]. Backlog nav: tersisa UI-N-002 (Workspace hub-card) butuh putusan produk.
- **Next:** S1 — Period Focus Engine (§7.6/§7.7) sebagai fondasi sebelum S2 (KPI Area Target Breakdown + Σ=100%).

## [2026-06-28] update | S1 Period Focus Engine — PRD §7.6 / §7.7 / §11.2

- **Pemicu:** TODOS.md S1 (gate sebelum S2 Target Breakdown). PRD V1.8.2 §7.6 menetapkan Workspace fokus pada periode aktif (Bulan default, Quarter rollup, Goal tahunan konteks) dan §7.7 mengatur kartu periode lewat (redup + lock tambah turunan).
- **Hasil tes:** 70 suites / **665 tests pass** (+48 baru dari 617). `tsc --noEmit` bersih. Tidak ada migrasi DB (data periode dihitung client-side dari `period_start`/`period_end` yang sudah ada di setiap tabel kartu sejak Fase 4/5/6).
- **Files added:**
  - `mobile/src/lib/period-focus.ts` — pure helpers `PeriodMode`/`PeriodFocus`, `defaultFocus(now)`, `formatPeriodLabel`, `periodBreadcrumb`, `periodWindow`, `cardPeriodStatus(card, focus)` (past/current/future), `enumerateMonths(year, now)` / `enumerateQuarters(year, now)`, `parseFocusJson` (validator JSON persisted), `isSameFocus`, `quarterOfMonth`. Semua menerima `now: Date` eksplisit agar deterministik.
  - `mobile/src/providers/period-focus-provider.tsx` — `PeriodFocusProvider` (state persist di AsyncStorage `rencanaapp:period-focus`, default = bulan dari `new Date()` saat mount; test inject `now`). `usePeriodFocus()` fallback-aman tanpa provider.
  - `mobile/src/components/period-switcher.tsx` — panel kompak (label "Periode aktif" + nilai + breadcrumb "Goal 2026 · Q2 · Juni" + tombol "Ubah") + bottom-sheet `Modal` (segmented Bulan/Quarter + list 12 bulan / 4 quarter dgn pill **Aktif** / **Arsip** / **Akan datang**). Token DESIGN.md mengikat (touch ≥44 px, `bg-brand-dark` solid+teks putih, varian `dark:*`).
  - 3 test file baru: `lib/__tests__/period-focus.test.ts` (29 unit pure), `providers/__tests__/period-focus-provider.test.tsx` (5 case: default, hydrate, persist, toggle mode, fallback no-provider), `components/__tests__/period-switcher.test.tsx` (4 case: compact panel, modal open, select baris, toggle Quarter).
- **Files edited:**
  - `mobile/src/app/_layout.tsx` — bungkus `<PeriodFocusProvider>` di antara ThemeProvider & AuthProvider.
  - `mobile/src/app/(app)/(tabs)/workspace.tsx` — pasang `<PeriodSwitcher />` di header kedua pane (Performance & Development). `GoalRow` / `DevelopmentAreaRow` / `InitiativeRow` plus baris ekspan KPI Area / Problem Statement: jika `cardPeriodStatus(card, focus) === 'past'` → `opacity-50` + Badge "Periode lewat" + `accessibilityLabel` berakhiran "· Periode lewat".
  - `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx` — bungkus wrapper dgn `PeriodFocusProvider now={Jun 2026}`, +3 case S1 (PeriodSwitcher visible; Goal past → label "Periode lewat"; Goal aktif → tanpa label).
- **Closes:** ~~UI-G-010~~ ✅ + ~~UI-S-W03~~ ✅ di [[ui-prototype-gap]]. Backlog P0 nav/period tuntas; gate S2 (Target Breakdown) terbuka.
- **DEFER ke fase berikut (sengaja):**
  - **Filter query** by period — V1 hanya dim visual; PRD §7.6 "tidak tampil semua turunan sekaligus" dibaca sebagai panduan UX, bukan filter ketat (kartu past tetap visible & dapat dibuka). Filter ketat butuh keputusan produk + extend `useGoals/useKpiAreas/...` (parameter `periodId`/window).
  - **PeriodSwitcher di People profil & Home** — Workspace fokus dulu, surface lain mengikuti.
  - **Lock tombol "tambah turunan"** + popup "Periode sudah lewat" — masuk **S3** (Card Interaction Rule) yang sekaligus menyentuh tombol Detail/panah/`⋯`/+.
- **Next:** S2 — KPI Area Target Breakdown + Σ=100% per Q/Bulan (§12), membutuhkan migrasi DB baru (baris breakdown ber-key `kpi_area_id + period_type + period_key + contribution_pct`).

## [2026-06-28] update | S1 Period Focus Engine + S2 KPI Area Target Breakdown

**S1 — Period Focus Engine (PRD V1.8.2 §7.6/§7.7) ✅**
- **lib/period-focus.ts** baru — pure helpers: types (PeriodMode, PeriodFocus, CardPeriodStatus, PeriodOption), `formatPeriodLabel`, `periodBreadcrumb`, `periodWindow`, `quarterOfMonth`, `cardPeriodStatus(card, focus)`, `defaultFocus(now)`, `enumerateMonths/Quarters(year, now)`, `parseFocusJson` (validasi storage). Semua menerima `now: Date` agar deterministik (jest setup repo melarang Date.now/Math.random).
- **providers/period-focus-provider.tsx** baru — state {mode, year, month?, quarter?} persisted di AsyncStorage (`rencanaapp:period-focus`). Default Bulan berjalan. `useMode` toggle Bulan↔Quarter mempertahankan year, pilih M/Q dari anchor `initialNow`. Fallback aman tanpa provider (pola dgn theme-provider). Di-wrap di root `_layout.tsx` sebelum AuthProvider.
- **components/period-switcher.tsx** baru (UI-G-010 / UI-S-W03 / §11.2) — panel kompak "Periode aktif" + label + breadcrumb "Goal Y · Qx · Bulan" + tombol "Ubah". Modal bottom-sheet: segmented Bulan/Quarter + list 12 bulan / 4 quarter dgn pill Arsip/Aktif/Akan datang.
- **Workspace integration** — PeriodSwitcher di header Performance & Development pane. `GoalRow`/`DevelopmentAreaRow`/`InitiativeRow` (+ child KPI Area & Problem Statement saat expand) menerapkan `opacity-50` + Badge "Periode lewat" bila `cardPeriodStatus` past. Filter data via period belum di-apply (PRD §7.7 hanya minta dim, bukan hide).
- **Closes:** ~~UI-G-010~~ ✅; ~~UI-S-W03~~ ✅ (referensi UI-G-010 — sudah ter-render di Workspace). Lock "+" per-card tertunda ke S3 (Card Interaction Rule).

**S2 — KPI Area Target Breakdown + Σ=100% (PRD V1.8.2 §12) ✅**
- **Migrasi 0021_fase_s2_kpi_area_target_breakdown.sql** baru — tabel `public.kpi_area_target_breakdowns` (kolom: organization_id, kpi_area_id, period_type ∈ {quarter,month}, period_key, parent_quarter_key, contribution_pct numeric(6,3), reason, created_by, created_at, updated_at). UNIQUE (kpi_area_id, period_type, period_key). CHECK shape (Q-only vs month+parent_q). FK cascade ke kpi_areas. RLS aktif: SELECT mirror policy kpi_areas; INSERT/UPDATE/DELETE ditutup (mutasi via RPC). Append-only delete block via existing `tg_block_delete_append_only`.
- **RPC `kpi_area_breakdown_replace(p_kpi_area_id, p_quarter jsonb, p_month jsonb, p_reason text)`** — SECURITY DEFINER. Validasi: reason ≥ 8 char, Σ Quarter = 100 (4 entri), Σ Month = 100 per parent Quarter (3 entri/Q). Permission via helper `can_edit_kpi_area_breakdown` (PIC / creator / manage_others_cards / is_goal_pic). Atomic upsert (ON CONFLICT). Snapshot old → emit `write_activity('kpi_area', id, 'target_breakdown_updated', {old, new, reason})`.
- **lib/kpi-area-breakdown.ts** baru — types (BreakdownRow, QuarterKey, MonthKey), pure helpers (`quarterOfMonthKey`, `sumOf`, `validateQuarter100`, `validateMonth100PerQuarter`, `indexQuarterRows`, `indexMonthRowsPerQuarter`), API thin client (`listKpiAreaBreakdown`, `replaceKpiAreaBreakdown`). Catatan: client untyped lokal (cast) — `database.types.ts` belum di-regen utk migrasi 0021; server tetap penegak (RLS+RPC).
- **hooks/use-workspace.ts** — tambah `useKpiAreaBreakdown(kpiAreaId)` (queryKey `['kpi_area_breakdown', id]`) dan `useKpiAreaBreakdownActions(kpiAreaId).replace`.
- **components/kpi-area-breakdown-panel.tsx** baru (UI-S-K01) — panel inline di `kpi-area/[id]`. View: Quarter chips (Q1..Q4 dgn pct + Σ live, tone success bila 100%) + Bulan-per-Quarter card (opsional bila ada data). Edit modal (gated: PIC/creator/manage_others_cards): tab Quarter (4 input numerik) + tab Bulan (4 sub-section × 3 input). Bar Σ live. Field "Alasan perubahan" wajib ≥ 8 char. Save disabled bila Σ Quarter ≠ 100, atau Bulan diaktifkan tapi salah satu Q ≠ 100, atau reason kurang. Monthly opsional: jika semua nol kirim `month=null` ke RPC.
- **Test baru:** `lib/__tests__/kpi-area-breakdown.test.ts` (9 unit pure helpers), `components/__tests__/kpi-area-breakdown-panel.test.tsx` (9 integration: gating Ubah, read state, modal prefill, Σ live, Save call RPC, monthly opsional).

**Hasil:** **72 suite / 694 tes hijau** (sebelumnya 67/617); `tsc --noEmit` bersih.

**Closes ui-prototype-gap:** ~~UI-G-010~~, ~~UI-S-W03~~, ~~UI-S-K01~~. DEFER (sengaja, di luar §12): UI-S-G01 (Goal Target Tahunan + Tahun) dan UI-S-S01 (Strategy Kontribusi Q% — kemungkinan view atas breakdown KPI Area parent, bukan field tulis baru) → kandidat S3/Cat-3.

**Catatan migrasi 0021:** belum di-apply ke remote (perlu langkah ops: `supabase db push` atau MCP `apply_migration`). Setelah apply, jalankan `supabase gen types typescript` agar `database.types.ts` mengenali tabel `kpi_area_target_breakdowns` dan RPC `kpi_area_breakdown_replace` — saat itu cast lokal di `lib/kpi-area-breakdown.ts` dapat dihapus.

**Next:** S3 — Card Interaction Rule (§7.3/§7.7) sistemik (Detail vs panah vs ⋯ vs +) lalu S4 — Completeness popups.

## [2026-06-28] update | S3 Card Interaction Rule + dim past (§7.3 / §7.7)

**Yang dibangun:**
- **components/row-actions-menu.tsx** baru (UI-G-009) — bottom-sheet Modal generik. API: `<RowActionsMenu open onClose title? items=[{label,onPress,destructive?,disabled?}]/>`. Aksi otomatis tutup sheet sebelum `onPress`. Tombol Tutup eksplisit. Destructive → red-600/red-400; disabled → non-Pressable + muted color. Touch ≥44px.
- **lib/period-focus.ts** — helper baru `showPastPeriodAlert(cardLabel?, alertImpl?)` (lazy-import `react-native` Alert; injectable utk test).
- **Workspace `(tabs)/workspace.tsx`** refactor besar:
  - Hapus full-row Pressable→detail dari `GoalRow`, `DevelopmentAreaRow`, `InitiativeRow` (§7.3 "Tap area non-button tidak buka detail"). Title kini plain Text.
  - Komponen `CardActionRow` baru: baris aksi tiap tree-card berisi `[▾ Lihat …]` (toggle expand), `[Detail]` (push), `[⋯]` (RowActionsMenu), `[+]` (tambah turunan; locked-with-alert bila past period).
  - `GoalRow` "+" → `/kpi-area/new?goalId=…` (gated `can('create_kpi_area')`). `DevelopmentAreaRow` "+" → `/problem-statement/new?developmentAreaId=…`. `InitiativeRow` (flat) tak punya "+" (anak terdalam tree).
  - Child rows di expand (KPI Area di bawah Goal, Problem Statement di bawah DevArea) ikut pola: title plain + tombol Detail eksplisit.
  - `defaultRowActions(cardLabel)` — set V1 placeholder: Ubah / Arsipkan / Salin (Alert "Belum tersedia"). Aksi nyata menyusul saat archive/copy/edit RPC tersedia.
- **Detail screens "+" lock** (§7.7) — 5 layar: `goal/[id].tsx`, `kpi-area/[id].tsx`, `strategy/[id].tsx`, `initiative/[id].tsx`, `development-area/[id].tsx`, `problem-statement/[id].tsx`. Tiap tombol "+ Tambah X" sekarang panggil handler yang cek `cardPeriodStatus(parent, focus) === 'past'` → `showPastPeriodAlert(parent.name)` + return, else push route create.

**Tests baru / disesuaikan:**
- `components/__tests__/row-actions-menu.test.tsx` (3 case: render items+Tutup, urutan onClose→onPress, disabled non-Pressable).
- `(tabs)/__tests__/workspace.test.tsx` extend (4 case S3): Detail button → push & tap title TIDAK push; "+" current → push route create; "+" past → `Alert.alert` "Periode sudah lewat" + tidak push; "⋯" → RowActionsMenu terbuka (judul sheet). Dua test S1 lama disesuaikan label baru.

**Hasil:** **73 suite / 701 tes pass** (sebelumnya 72/694; +1 suite +7 tes); `tsc --noEmit` bersih. Tidak ada migrasi DB.

**Closes:** ~~UI-G-009~~ ✅ di [[ui-prototype-gap]]. Card Interaction Rule §7.3 + dim past §7.7 sekarang sistemik di Workspace (top-down) + ter-apply ke 6 detail screen "+" buttons.

**DEFER ke iterasi berikut:**
- RowActionsMenu items "Ubah/Arsipkan/Salin" masih placeholder — perlu RPC sisi server (archive_*, duplicate_*, edit lifecycle) sebelum aksi nyata.
- Hapus draft action: belum tersurat di backlog UI-G-009; akan menyusul saat RPC tersedia.
- Period switcher di People profil (UI-G-010 expand): di luar lingkup S3.

**Next:** S4 — Completeness popups (§7.4 / §7.5).

## [2026-06-28] update | S4 Completeness popups (§7.4 / §7.5)

**Yang dibangun:**
- **lib/activation-check.ts** baru — pure helpers:
  - `missingRequiredFor(cardType, card)`: kembali daftar label field kosong sesuai aturan server `activate_*` (Goal: name/PIC/periode; KPI Area: + Target; Strategy: + Alasan/Risiko Utama/Alternatif; Initiative: + Target Hasil; Development Area & Problem Statement: shared).
  - `guardActivationFields(cardType, card, alertImpl?)`: §7.4 pre-flight popup "Lengkapi data wajib" — return `true` bila terblokir (caller berhenti). Alert injectable utk test.
  - `confirmAddDescendantIfIncomplete({compliance, parentLabel, childLabel, onProceed, alertImpl?})`: §7.5 popup arahan saat "+ Tambah". Bila MBR sudah memenuhi atau data belum tersedia → `onProceed()` langsung. Bila belum memenuhi → Alert "Kelengkapan Perencanaan" dgn rasio "X dari Y" + CTA "Tutup" / "+ Tambah X" (CTA proceed → server tetap penegak akhir).
- **6 detail screen** di-wire:
  - **§7.4** (Aktifkan pre-flight): `goal/[id]`, `kpi-area/[id]`, `strategy/[id]`, `initiative/[id]`, `development-area/[id]`, `problem-statement/[id]` — setiap `handleActivate` panggil `guardActivationFields` di depan, return bila terblokir (sebelum `guardMbrActivation` + `activateM.mutate()`).
  - **§7.5** (+ Tambah arahan): wrap existing `handleAddX` (yg sudah cek past period dari S3) dgn `confirmAddDescendantIfIncomplete` — past-period lock di depan, lalu MBR guidance, lalu `router.push(create-route)`. Goal screen tambah `useMbrCompliance('goal', id)` (lainnya sudah punya).

**Catatan §7.4/§7.5 penting:**
- Sinyal persisten (`MbrCompletionIndicator` panel) tetap tampil — keputusan owner "keep signal + popup".
- Popup tidak menggantikan rule backend; klien hanya UX shortcut. Server tetap RAISE bila field wajib kosong saat user override popup.
- Popup §7.5 sengaja boleh proceed (bukan blok) supaya UX tidak terlalu kaku — mode `blokir_akses_turunan` server akan tolak saat sampai ke RPC.

**Tests baru/disesuaikan:**
- `lib/__tests__/activation-check.test.ts` (13 unit: missingRequiredFor per tipe + guardActivationFields blok vs lewat + confirmAddDescendantIfIncomplete proceed/popup/CTA).
- `strategy/__tests__/mbr-completion.test.tsx` + `initiative/__tests__/mbr-completion.test.tsx`: tambah `pic_id: 'u1'` di fixture draft (sebelumnya field optional di test, kini guard wajib).

**Hasil:** **74 suite / 714 tes pass** (sebelumnya 73/701; +1 suite +13 tes); `tsc --noEmit` bersih. Tidak ada migrasi DB.

**TODOS S0-S4 SELESAI.** Sisa backlog Cat-3 (UI-S-OR1/GV1/AL1/AR1/PRM1/KT1/AP7, UI-G-005, UI-S-SF2) paralel-safe — kandidat PR berikutnya.

## [2026-06-28] update | Cat-3 sweep 9 backlog items (UI-G-005, UI-S-AL1/AP7/AR1/GV1/OR1/PRM1/KT1, UI-S-SF2 mark)

**Yang dibangun (9 item; 1 migrasi 0022; tidak ada feature break):**

### Migrasi 0022 — Cat-3 bundle DB foundations:
- **`restore_card(entity_type, entity_id)`** RPC — kebalikan archive_card; status → 'draft' + archived_at=null. Permission PIC/manage_others. Activity log `card_restored`.
- **`governance_violations` ALTER** — kolom `resolution_status` (open/resolved/dismissed) + `resolution_note` + `resolved_at` + `resolved_by`. Index `idx_gv_resolution_status`.
- **`resolve_governance_violation(id, note, status='resolved')`** RPC — gate `view_governance_violation`, reason ≥ 8 char, idempotent (hanya update 'open' → throw bila sudah ditutup). Activity log `violation_resolved`.
- **`create_position(name, dept?, desc?)`** + **`create_role_template(name, level)`** RPC — pola sama dgn create_team/department; gate `manage_positions`/`manage_settings`.
- **`user_permissions.scope` kolom** (own/team/dept/org default 'org') + **`set_user_permission_scope(user, key, scope)`** RPC — gate `manage_users_permissions`; upsert (granted default true bila baris baru). Activity log `permission_scope_updated`.

### UI per-item:
- **UI-G-005** — Search pill di `components/app-header.tsx` (Ionicons `search-outline` 44px) → `/search`. Sebelum avatar.
- **UI-S-AL1** — `settings-activity-log.tsx` rewrite: TextInput search (q vs action+entity_type+label), 7 filter chip kategori (Semua/Dibuat/Diubah/Arsip-Batal/Review/Periode-Skor/Permission), timestamp per row, empty-filtered state.
- **UI-S-AP7** — `action-plan/instance/[id].tsx` tambah SectionCard "Ringkasan Hari Ini" (Badge `Hari Ini N/M` + chips Target/Selesai/Submitted/Terlewat/Grace + compliancePercent overall) + SectionCard "Panduan Hari Ini" (4 bullet kuratorial V1).
- **UI-S-SF2** — sudah live di SF1 (LevelChips Staff/Mgmt/C-Level/CEO; Custom hidden per DEC-9). Tanpa kode baru — tandai di wiki.
- **UI-S-AR1** — `settings-archive.tsx` rewrite: 8 filter chip per entity type (Semua/Goal/KPI/Strategy/Initiative/AP/DevArea/Problem), tombol "Pulihkan ke Draft" per row dgn confirm modal + RPC `restore_card`. Tidak ada hapus permanen.
- **UI-S-GV1** — `settings-governance-violation.tsx` rewrite: 4 filter chip status (Semua/Terbuka/Selesai/Diabaikan), badge resolution di header card, tombol "Selesaikan" + "Lihat entity" → route detail. Modal bottom-sheet Selesaikan dgn 3 CTA: Batal / Diabaikan / Tandai Selesai (note ≥ 8 char).
- **UI-S-OR1** — `settings-org-structure.tsx` rewrite ke 4-tab (Departemen/Posisi/Tim/Role) dgn `TabBar`. Tiap tab pakai pola DepartmentTab existing — list + form add inline. Hook `useOrgActions` ditambah `createPosition` + `createRoleTemplate`. Hook baru `usePositions`/`useTeams`/`useRoleTemplates`.
- **UI-S-PRM1** — `settings-permission-users.tsx` PermToggle expand: scope pill row di bawah toggle (only saat granted+not locked) dgn 4 option (Own/Tim/Dept/Org). Hook `useUserPermissionScopes` (read `user_permissions.scope` + `permissions.key`) + `useScopeActions().setScope` → RPC `set_user_permission_scope`.
- **UI-S-KT1** — Layar mandiri baru `settings-kpi-area-templates.tsx` (route `/settings-kpi-area-templates`) — read-only V1, grouping per Goal Template (proxy divisi), TextInput cari, link "Edit di Template ›" ke Goal Template Library. Row di hub Menu `settings.tsx`. Stack screen di `(app)/_layout.tsx`. Lib `listAllKpiAreaTemplates` (join `goal_templates(id,name)`).

**Tests baru/disesuaikan:**
- Test `fase8-settings-screens.test.tsx`: F8-UI-07 (activity log) + F8-UI-27 (archive) update untuk spec baru.
- Test `use-permissions-admin.test.tsx` + `use-org-structure.test.tsx`: tambah mock `@/lib/supabase` + `@/lib/governance-admin` (lib baru di-import transitively oleh hooks).
- Test `settings-permission-users.test.tsx`: tambah dummy mock untuk `useUserPermissionScopes` + `useScopeActions`.

**Hasil:** **74 suite / 714 tes pass** (= S4 baseline, +0 tes karena Cat-3 fokus surface, bukan logic baru); `tsc --noEmit` bersih. Migrasi 0022 sudah di-apply ke remote + `database.types.ts` regen.

**Advisors security check (security):** 5 WARN baru — kelima SECURITY DEFINER RPC baru (restore_card, resolve_governance_violation, create_position, create_role_template, set_user_permission_scope) — pola intentional sama dgn semua RPC fase sebelumnya.

**SELURUH BACKLOG `ui-prototype-gap.md` Cat-3 SELESAI** untuk PR scope ini. Sisa P2/P3 backlog (UI-N-002 hub-card workspace, UI-N-003 tree 4-5 level, UI-G-002 log panel sistemik, dst.) tetap perlu putusan produk terpisah.

## [2026-06-28] update | Sweep backlog ui-prototype-gap (UI-S-EV1, UI-G-002, UI-S-H05, UI-S-PR1, UI-S-AR1 metadata)

Lima item P2/P3 yang bisa dieksekusi tanpa keputusan produk diselesaikan dalam satu sweep — semuanya bersandar pada schema/data yang sudah ada (tidak ada migrasi baru).

**Item terselesaikan:**
- **UI-S-EV1** — `evaluation.tsx` tambah komponen `CheckboxRow` (≥44px touch target) + dua flag `should_become_sop` / `rollout_needed` + textarea `rollout_notes` (conditional saat rollout aktif). RPC `record_evaluation` sudah terima 3 param sejak migrasi 0014 — UI sebelumnya hanya pakai 3 dari 6 field schema.
- **UI-G-002** — Panel "Log Aktivitas" sistemik. Komponen baru `components/activity-log-panel.tsx` (collapsible, lazy fetch saat expand, batasi 10 entri terbaru dgn link ke Activity Log lengkap). `lib/activity-governance.ts::listEntityActivityLog(entityType, entityId)` + hook `useEntityActivityLog`. Ter-wire di 7 layar detail: Goal/KPI/Strategy/Initiative/DevArea/ProblemStatement/ActionPlan.
- **UI-S-H05** — `greeting-hero.tsx` ubah caption uppercase → pill `bg-white/20 rounded-full px-3 py-1` (match prototype).
- **UI-S-PR1** — `people-profile/[id].tsx` header rich chrome. `lib/cards.ts::getOrgProfileDetail(id)` join `role_templates(name, level)` + ambil `position_title`/`is_active`/`created_at`. Header sekarang: Avatar 88px + nama + Badge Aktif/Nonaktif + role+level + position_title + email + "Bergabung <tanggal>". Cover image ditunda (tidak ada kolom di schema).
- **UI-S-AR1 metadata** — `settings-archive.tsx` tampilkan tanggal arsip per row. Helper baru `lib/activity-governance.ts::getArchiveMetadata(entityType, entityId)` lookup entri terbaru `card_archived` di `activity_logs`. UI memakai `useQueries` (1 query per row) — listing arsip umumnya kecil. Nama actor (resolusi `actor_id` → nama) ditunda.

**Tidak diubah / sengaja diskip (perlu putusan produk):**
- UI-N-002 / UI-S-W01 (Workspace hub-card) — perlu putusan IA.
- UI-N-003 / UI-S-W02 (Tree 4–5 level) — perlu putusan IA.
- UI-G-007/008 (hue brand, radius kartu) — perlu putusan tim desain.
- UI-S-H01–H03 (Snapshot Tim + Fokus kaya) — perlu data Snapshot Tim (belum ada di server).
- UI-S-PR2/PR3/PR4 (chat/tugaskan, ranking card besar, detail+tugas+kontribusi) — ditunda untuk PR berikut.
- UI-S-OR1 partial "Garis laporan" — perlu schema graph hubungan posisi (tabel `position_reports_to` belum ada).

**Verifikasi:** `tsc --noEmit` bersih; jest **74 suite / 714 tes pass** (= baseline). Tidak ada migrasi baru — bersandar pada `activity_logs` (sejak 0001), `evaluations` (sejak 0014), `role_templates` (sejak 0001). Tidak ada perubahan RLS / RPC server.

## [2026-06-28] update | Sweep people-profile rich chrome (UI-S-PR2/PR3/PR4 partial)

Lanjutan sweep tanpa migrasi — fokus 3 item P2 di people-profile yang masih bisa dieksekusi.

**Item terselesaikan:**
- **UI-S-PR2** — `people-profile/[id].tsx` action row dengan tombol "Chat" + overflow `⋯`. Kedua tombol route ke `/(tabs)/inbox` (V1: belum ada DM rooms — chat via Inbox tab kontekstual ke AP/Initiative). Tombol hidden saat profil milik diri sendiri (anti-self). "Tugaskan" diskip karena Action Plan butuh konteks Initiative — bukan dari halaman profile.
- **UI-S-PR3** — Ranking card besar. `SectionCard` dgn tile `#N` brand-dark 64×64 di kiri + nama periode tertutup di kanan. Tampil hanya bila ada `ranking_snapshots` entry untuk user ini di periode tertutup terbaru (D9: ranking hanya tampil setelah periode close).
- **UI-S-PR4 partial** — Detail People + Tugas collapsible:
  - "Detail People" `SectionCard`: row Status/Hak akses/Posisi/Email dari `getOrgProfileDetail` (di-fetch utk PR1).
  - "Tugas aktif" collapsible (lazy fetch saat user expand) via `listActionPlansByPic(userId)` baru di [`cards.ts`](mobile/src/lib/cards.ts) — query status `assigned/in_progress/submitted/revision`; RLS otomatis filter. Tampilkan badge status + deadline; tap row → buka AP detail.
  - "Kontribusi Bulan Ini" + "Atasan" **ditunda** (perlu schema reporting-graph yang belum ada).

**Verifikasi:** `tsc --noEmit` bersih; jest **74 suite / 714 tes pass** (= baseline). Tidak ada migrasi baru.

## [2026-06-28] update | Sweep edukasi/polish (UI-G-006 help trigger + UI-S-MBR1 demo visual)

**Item terselesaikan:**
- **UI-G-006** — `components/card-help-trigger.tsx` (tombol bulat "?" 24×24, tap → native Alert) + `lib/glossary.ts` (13 topik stabil: goal/kpi_area/strategy/initiative/action_plan/development_area/problem_statement/mbr/score_formula/achievement_score/activity_log/evaluation/target_breakdown). Konten ringkas ≤2 kalimat per topik. Ter-wire di Goal detail (section "KPI Area"), KPI Area detail (section "Strategy"), dan Settings MBR (helper text). Sisa surface: tinggal `<CardHelpTrigger topic="..." />` di sebelah judul.
- **UI-S-MBR1** — `MbrExampleCard` di `settings-mbr.tsx` (Badge "Edukasi" + mock card Strategy "Tingkatkan retensi" 1/2 (50%) + tombol "Aktifkan Strategy" opacity-40 + caption dialog "Butuh minimal 2 Initiative; saat ini 1."). Murni visual edukatif — tidak terhubung ke data nyata.

**Verifikasi:** `tsc --noEmit` bersih; jest **74 suite / 714 tes pass** (= baseline). Tidak ada migrasi baru. Tidak ada perubahan RLS/RPC.

## [2026-06-28] update | UI-N-003 Stage 1 — Tree 3-level inline (B′ kompromi)

Konteks: keputusan CEO review hari ini (lihat sesi `/plan-ceo-review` di transcript). Approach B′ dipilih
sebagai kompromi rasional antara Approach A (kosmetik) dan Approach B/C (tree 5-level penuh, risiko
mendegradasi UX mobile untuk org besar). Stage 2 (hub-card UI-N-002 Approach A) akan dikejar setelah
Stage 1 terbukti dipakai.

**Item terselesaikan (UI-N-003 Stage 1):**
- **Performance pane:** Workspace tree dari 2-level → **3-level inline** (Goal → KPI Area → Strategy).
  - `KpiAreaSubRow` (level-2) baru — sebelumnya inline `<View>` non-expandable. Sekarang punya `CardActionRow` dgn "Lihat Strategy" / "Tutup" / Detail / ⋯ / "+ Strategy" (gated `create_kpi_area` proxy + past-period lock).
  - `StrategySubRow` (level-3) baru — tampilan kompak `rounded-xl bg-white border` p-2.5 text-sm dgn aksesi-label spesifik. `+ Initiative` button gated `create_initiative` + past-period `Alert`.
- **Development pane (symmetric):** DevArea → Problem Statement → Initiative inline.
  - `ProblemStatementSubRow` (level-2) baru — expandable ke Initiative children.
  - `InitiativeSubRow` (level-3) baru — Detail + ⋯ (Action Plan tetap stack-nav).
- **Hooks updated** — `useStrategies(kpiAreaId, enabled=true)` + `useProblemStatementInitiatives(psId, enabled=true)` sekarang menerima `enabled` agar lazy (sama dgn pattern `useKpiAreas`/`useProblemStatements`). Fetch hanya jalan saat user expand baris parent.

**Tap-count impact:**
- Goal → Strategy: **3 tap → 1 tap** (cukup expand Goal + expand KPI di workspace).
- Goal → Initiative (Development): **3 tap → 1 tap** (DevArea expand + PS expand).
- Initiative → AP & Strategy → Initiative (Performance) tetap stack-nav (4-5 level penuh ditunda — mobile real-estate concern per CEO review).

**Decisions ter-konfirmasi (per Open Questions Q1-Q4):**
- Q1 ✅ Symmetry Development pane: ya — pola identik di kedua pane.
- Q2 ✅ `+ Initiative` button wire-up nyata (bukan placeholder) → push `/initiative/new?strategyId=...` / `/initiative/new?problemStatementId=...`.
- Q3 ✅ Empty state inline saat child level kosong → text guidance, bukan collapse otomatis.
- Q4 ✅ MBR gating untuk Strategy → Initiative tidak ditambah inline di workspace (akan tampil saat masuk Strategy detail; pattern existing `confirmAddDescendantIfIncomplete` jaga konsistensi).

**Tests baru:** 9 tes baru di `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`:
- UI-N-003·1 lazy fetch `enabled=false → true` saat expand
- UI-N-003·2 expand/collapse Strategy level
- UI-N-003·3 empty state Strategy
- UI-N-003·4 error state Strategy + retry
- UI-N-003·5 `+ Initiative` push route
- UI-N-003·6 past period Strategy → Alert tidak push
- UI-N-003·7 permission `create_initiative=false` → tombol "+" hidden
- UI-N-003·8 RowActionsMenu dari Strategy ⋯
- UI-N-003·DEV·1 Development pane symmetric (DevArea→PS→Initiative)

**Verifikasi:** `tsc --noEmit` bersih; jest **74 suite / 723 tes pass** (+9 tes baru). Tidak ada migrasi DB; semua hook layer sudah ada sejak Fase 4/6 — hanya ditambah parameter `enabled` di 2 hook untuk lazy.

## [2026-06-28] update | UI-N-002 Stage 2 — Workspace hub-card lobby (Approach A)

Lanjutan Stage 1. Stage 2 dipilih sebagai polish kosmetik setelah deep tree (Stage 1) shipped.
Per CEO review: Approach A = hub-only (S effort, zero query baru), tanpa stack route baru.

**Item terselesaikan (UI-N-002 Stage 2):**
- **`HubView` di workspace.tsx** — default state `tab='hub'`. Render 2 `WorkspaceHubCard` (Performance + Development). Tap hub → `setTab('performance')` / `setTab('development')` → pindah ke pane existing (deep tree dari Stage 1).
- **`components/workspace-hub-card.tsx`** — komponen reusable, komposisi: kicker uppercase + title + meta line (jalur card) + `ProgressOrb` 72px (orb % = `Math.round(active/non-archived * 100)`); 3-stat row 1/3 columns; "Masuk ›" CTA brand-dark. Tap di area card ATAU di CTA → `onEnter()`. AccessibilityLabel agregat: `"{enterLabel}: {parentCount} {parentStatLabel}, {childCount} {childStatLabel}"` agar SR & tes mudah inspect angka tanpa scrub UI.
- **`lib/workspace-hub-stats.ts`** — helper `derivePerformanceHubStats(goals)` + `deriveDevelopmentHubStats(devAreas)`. Orb = `ratioActive` (active/non-archived). `parentCount` = goals/devAreas length. `childCount` = sum embedded `kpi_areas[0].count` / `problem_statements[0].count`. `activeCount` = goals/devAreas yg status=active. Empty (0 parent) → orb null → render "—" fallback (bukan 0% misleading).
- **`PaneTopHeader` extended** — tombol "← Workspace" muncul di header tiap pane (Performance/Development) sebelum `<TabBar>`. Tap → `onBackToHub()` → `setTab('hub')`. TabBar tetap untuk switching dalam pane.
- **Copy ditambah** — `WS_HUB_COPY` di `workspace-copy.ts` (locked constants).

**Tap-count impact:**
- Sebelum Stage 1+2: Workspace tab → TabBar tap (kalau perlu) → Goal expand → KPI Area detail → Strategy detail → ... → AP (4+ tap)
- Setelah Stage 1+2: Workspace tab → Hub card tap (1) → Goal expand → KPI expand → Strategy detail (2-3 tap untuk Strategy). Hub menambah 1 tap upfront tapi memberikan context ringkasan + lobby feel intentional yang preview-able.

**Decisions implementasi (per CEO review Step 0E):**
- **Orb agg method:** `ratioActive` simple (active/non-archived %) — bukan children-aware progress (mahal). Cukup mewakili "kepadatan aktivitas" di lobby.
- **Navigation pattern:** Tap hub → swap state inline (no new stack route). Existing pane jadi "deeper view"; tombol "← Workspace" balik ke hub. Simpler dari prototype 1:1 (dedicated stack screen) tapi same UX intent.
- **Hub stats source:** Parent count (Goal/DevArea), child count via embedded count (KPI Area/Problem Statement), active count. Notif count skip (perlu query `useNotifications` tambahan yang tidak fit "zero query baru" constraint).
- **Empty state:** 0 parent → orb null → "—" fallback. Tetap render hub-card (bukan empty state besar) agar user paham bisa entry.

**Tests baru:** 6 tes baru di `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`:
- UI-N-002·1 default state = hub view (no pane content)
- UI-N-002·2 tap hub Performance → pane Performance + back button
- UI-N-002·3 tap hub Development → pane Development
- UI-N-002·4 tombol "← Workspace" balik ke hub
- UI-N-002·5 hub-card stats agregat (2 Goal, 5 KPI, 1 aktif)
- UI-N-002·6 hub-card empty → orb "—" fallback

Test `[5a] loading useGoals → SkeletonList` diadaptasi: ubah ke `renderScreen(null)` agar tahan di hub (hub view sendiri tampil SkeletonList saat goals loading — masih valid intent).

**Helper test baru:** `renderScreen(autoEnter?)` — default 'performance' (auto-tap "Masuk Performance" → tetap kompatibel dgn 41 tes existing yg expect pane). Pass `null` untuk tes hub-specific.

**Verifikasi:** `tsc --noEmit` bersih; jest **74 suite / 729 tes pass** (+6 tes baru, +9 dari Stage 1 = 15 total tes Stage 1+2). Tidak ada migrasi baru. Tidak ada perubahan RLS/RPC.

**Status backlog UI-N-002 + UI-N-003 (sepenuhnya tutup):**
- ~~UI-N-002 Workspace hub-card~~ ✅ Stage 2 done.
- ~~UI-N-003 Tree 4-5 level~~ ✅ Stage 1 done (3-level kompromi; Initiative+AP stack-nav per CEO review mobile real-estate concern).
- ~~UI-S-W01 hub-card~~ ✅ (= UI-N-002).
- UI-S-W02 tree 4-5 level: 3-level done; 5-level penuh ditunda — bila org membutuhkan, bisa di-ship sebagai expansion phase berikutnya.

## [2026-06-28] update | UI-S-G01 + UI-S-S01 — Goal Target Tahunan & Strategy Kontribusi Q%

**Cakupan:** Tutup dua field wajib PRD V1.8.2 yang masih kosong di form `goal/new.tsx` dan `strategy/new.tsx` (referensi PRD §17 dan §20).

**Migrasi 0023 — `0023_fase_s2_goal_strategy_target_fields.sql`:**
- `ALTER TABLE public.goals ADD COLUMN target_value text` — free-form (selaras dgn `kpi_areas.target text`); satuan tak dipaksa (PRD §18 "Satuan membuat UI terasa seperti spreadsheet").
- `ALTER TABLE public.strategies ADD COLUMN contribution_pct numeric(6,3)` + CHECK `[0..100] OR NULL`.
- "Tahun Goal" tidak butuh kolom baru — derive dari `EXTRACT(YEAR FROM period_start)`; form set `YYYY-01-01`/`YYYY-12-31`.

**Form changes:**
- `goal/new.tsx`: hapus dua DateField → ganti satu input "Tahun Goal" (4-digit, default tahun berjalan). Tambah "Target Tahunan" text input. Periode otomatis dari tahun (PRD §17 "Tidak ada rentang tanggal manual untuk Goal").
- `strategy/new.tsx`: tambah input "Kontribusi Quarter (%)" numeric (0–100, support koma/titik). NULL diizinkan saat Draft; gate Σ=100% per sibling KPI Area ditunda (akan di-enforce saat aktivasi via trigger atau RPC follow-up).

**Catatan governance:** `strategies.contribution_pct` adalah BOBOT KONTRIBUSI PLANNING (% Strategy ke output KPI Area), BUKAN bobot skor. Bobot skor tetap eksklusif di `score_formula` ([[scope-guardrails]] tetap kering).

**Types:** Manual patch `database.types.ts` (generated output 117k char, terlalu besar untuk full overwrite) — tambah `target_value` di goals Row/Insert/Update dan `contribution_pct` di strategies Row/Insert/Update.

**Verifikasi:** `npx tsc --noEmit` bersih; `npx jest --silent` → **74 suite / 729 tes pass** (tidak ada test baru — form tak punya unit test sebelumnya; perubahan murni input → API tipis).

**Backlog status:**
- ~~UI-S-G01~~ ✅ done.
- ~~UI-S-S01~~ ✅ done (Σ siblings enforce ditunda).

**Sisa TODOS.md untuk dipertimbangkan berikutnya:**
- Σ=100% per sibling KPI Area saat aktivasi Strategy (gate trigger atau RPC `activate_strategy` patch).
- Score Formula versioning + effective-date + audit (Cat-3 baris 56).

## [2026-06-28] update | UI-S-S01 follow-up + Score Formula audit display

**Cakupan:** Dua tutup pekerjaan lanjut dari TODOS.md baris terakhir.

### 1. UI-S-S01 follow-up — gate Σ=100% kontribusi Strategy
- **Migrasi 0024 — `0024_fase_s2_activate_strategy_contribution_gate.sql`:** patch `activate_strategy` RPC:
  - `contribution_pct IS NULL` → reject "Kontribusi Quarter wajib diisi sebelum aktivasi".
  - Σ contribution_pct sib aktif + ini ≠ 100 (toleransi 0.001 numeric(6,3)) → reject dgn nilai aktual.
  - Active siblings warisan (pra-0023) dgn NULL → coalesce ke 0.
- **Contract test:** `fase4_performance_workspace_contract.sql` patched — positive activation set `contribution_pct=100`.
- **Catatan:** unit jest mock RPC; tidak terpengaruh.

### 2. Score Formula UI — versioning + effective-date + audit display
- Field-field (`version_number`, `status`, `effective_date`, `activated_at`, `change_reason`, `approved_by`) sudah ada di DB sejak migrasi 0020. Yang kurang: tampilan di `FormulaVersionCardReadOnly`.
- **`settings-score-formula.tsx`:** card versi read-only sekarang render:
  - "Aktif sejak YYYY-MM-DD" (status=active) atau "Pernah aktif sejak YYYY-MM-DD" (archived).
  - `change_reason` quote italic.
  - "Diaktifkan YYYY-MM-DD" dari `activated_at`.
- Tidak ada perubahan RPC/DB; pure UI surface.

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass** (score-formula screen test fokus 12/12 pass).

**Backlog status:**
- TODOS.md "Σ=100% sibling enforce" → ✅ done.
- TODOS.md Cat-3 baris 56 "Score Formula sisa SF2 + versioning/effective-date/audit" → ✅ done (SF2 sebelumnya; versioning+effective+audit ditampilkan sekarang).

**Sisa TODOS.md teratas yang masih terbuka:**
- Tidak ada — semua S0-S4 + Cat-3 + S2 follow-up + SF audit display sudah landed.
- Backlog `ui-prototype-gap.md` masih punya item P2/P3 non-TODOS (UI-G-003 MetaGrid, UI-G-004 Wizard stepper, UI-S-H01..H03 Home, dll. — 🔒 perlu putusan produk).

## [2026-06-28] update | 3 field wajib PRD V1.8.2: K03 + I01 + AP Jam Deadline

**Cakupan:** Tutup 3 field wajib yang masih hilang dari form sebagai checklist PRD V1.8.2 (di luar TODOS.md, tapi diminta "lanjut selama masih dalam lingkup PRD").

**Migrasi 0025 — `0025_fase_prd_wajib_fields.sql`:**
- `kpi_areas.expected_outcome text` — PRD §18 baris 4 "Ekspektasi Hasil".
- `initiatives.team_id uuid` FK `teams(id)` ON DELETE SET NULL — PRD §21 baris 4 "Tim".
- `action_plans.deadline_time text` + CHECK `^([01][0-9]|2[0-3]):[0-5][0-9]$` — PRD §22 baris 9 "Jam Deadline".

**Form changes:**
- `kpi-area/new.tsx` — tambah `LabeledInput` Ekspektasi Hasil (multiline, required), validasi save.
- `initiative/new.tsx` — `TeamChipSelector` baru (query `listTeams({activeOnly:true})` dari `org-structure.ts`), tap chip = pick, tap chip aktif = unset. Hint "Belum ada tim. Admin dapat menambah tim di Menu → Org Structure → Tim." saat list kosong.
- `action-plan/new.tsx` — Jam Deadline dihoist ke top-level wajib (validasi `TIME_RE` selalu, bukan hanya repeat path). State `timeOfDay` dilebur ke `deadlineTime`; repeat-config tetap pakai nilai sama (single source of truth).

**Catatan governance:** semua kolom NULL-able di DB; UI menegakkan wajib di Save. Activate RPC gate per field belum dipatch (V1: gate UI cukup). Bila perlu hard gate, follow-up patch `activate_kpi_area` & `activate_initiative` & `activate_action_plan`.

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass** (form tidak punya unit test; semua test layer existing tahan).

**Backlog status (ui-prototype-gap.md):**
- ~~UI-S-K03 Ekspektasi Hasil~~ ✅
- ~~UI-S-I01 Initiative Tim~~ ✅
- AP Jam Deadline (di luar tabel ID; PRD §22.9) ✅

**Sisa item PRD-mandated yang masih perlu putusan/non-trivial:**
- Activate RPC gate per field (K03/I01/AP Jam) — bukan blocker V1.
- UI-S-K02 KPI Area template picker di `kpi-area/new` (§18 — template available) — non-trivial (butuh bottom sheet + RPC apply ke single KPI Area).
- Σ=100% Strategy Kontribusi siblings di activation — done sblmnya via 0024.

## [2026-06-28] update | Activate RPC hard-gates (0026) + UI-S-K02 KPI Area template picker

### 1. Migrasi 0026 — Defense-in-depth aktivasi
- `activate_kpi_area` patched: + `coalesce(trim(k.expected_outcome), '') = ''` di kelengkapan; pesan jadi "(nama, PIC, periode, Target, Ekspektasi Hasil wajib)" (PRD §18).
- `activate_initiative` patched: + `i.team_id is null`; pesan jadi "(nama, target hasil, periode, PIC, Tim wajib)" (PRD §21).
- `activate_action_plan` patched: + `coalesce(trim(a.deadline_time), '') = ''` di kedua cabang (one-time & repeat); pesan menyebut "Jam Deadline wajib" (PRD §22.9).
- **Contract test:** `fase4_performance_workspace_contract.sql` `kpi_notarget` pattern di-update dari `%Target wajib%` → `%Kelengkapan KPI Area%` (stabil lintas-migrasi, masih menangkap penolakan).
- **Fase5 contract test:** tidak berubah — TEST5 generic catch (`exception when others then null`) tetap valid.

### 2. UI-S-K02 — KPI Area Template picker
- Komponen `KpiAreaTemplatePicker` di `kpi-area/new.tsx` (inline; tidak butuh komponen shared baru).
- Query `listKpiAreaTemplates(parentGoal.goal_template_id)` (sudah ada di `lib/goals.ts`).
- Filter berdasarkan `goal_template_id` parent Goal; grouped per `division_label` (Sales/Ops/Finance/HC/Growth).
- Tap row template → prefill `name`. PRD §18 minta "Nama, PIC rekomendasi, Target awal, Ekspektasi Hasil" — V1 hanya `name` karena schema `kpi_area_templates` belum punya kolom hint Target/Ekspektasi; bisa di-extend follow-up.
- Bottom-sheet pattern reuse pola `period-switcher.tsx` (Modal animationType="slide" transparent).
- Disabled hint saat `goal_template_id` null: "Template tidak tersedia (Goal ini tidak dibuat dari template)."

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass**.

**Backlog status:**
- ~~UI-S-K02 KPI Area template picker~~ ✅ done (V1; extend Target/Ekspektasi hint = follow-up).
- Activate RPC defense-in-depth untuk K03/I01/AP Jam Deadline ✅ done.

**Sisa item dalam lingkup PRD V1.8.2 yang masih bisa dikerjakan:**
- Extend `kpi_area_templates` dgn `target_hint` + `expected_outcome_hint` (PRD §18 step 5).
- Backlog UI-S-PR1 Problem Statement Dampak + Bukti awal (lebih ke design.html-driven).
- UI-S-K01 KPI Area breakdown panel di Edit mode (sudah view; edit modal sudah ada).
- UI-S-AP6 result-value-input pemisahan (sudah done sebelumnya).
- Polish visual P3 (UI-G-007/G-008 brand hue/radius) — perlu putusan tim desain.

## [2026-06-28] update | Template hints + AP Bukti deskriptif (PRD §18 + §22.5)

**Migrasi 0027 — `0027_fase_template_hints_ap_bukti.sql`:**
- `kpi_area_templates.target_hint text` + `expected_outcome_hint text` — supaya picker bisa prefill lengkap (PRD §18 step 5: "Setelah template dipilih, Nama KPI Area, PIC rekomendasi, Target awal, dan Ekspektasi Hasil terisi otomatis").
- `action_plans.evidence_description text` — PRD §22.5 "Bukti yang diminta" sebagai FIELD DESKRIPSI (selain toggle `evidence_required`).

**UI changes:**
- `kpi-area/new.tsx` `KpiAreaTemplatePicker.onPick`: tap template → `setName(t.name); if(target_hint) setTarget(...); if(expected_outcome_hint) setExpectedOutcome(...)`. Backward-compat: kalau hint null (seed lama belum populate), prefill hanya nama (legacy behavior).
- `action-plan/new.tsx` tambah `LabeledInput` "Bukti yang Diminta" (multiline) di Detail section setelah DoD.

**Catatan:** Seed data `kpi_area_templates` belum dipopulate `target_hint`/`expected_outcome_hint` (PRD §47-48 hanya kasih NAMA template, bukan hint). Admin/CEO bisa isi via Goal Template Library (UI-S-KT1) — tapi UI edit hint belum ada. Follow-up: tambah input hint di settings-kpi-area-templates form edit.

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass**.

**Backlog status:**
- ~~UI-S-K02 template prefill lengkap~~ ✅ schema-wise (UI edit hint masih perlu).
- UI-S-AP4 evidence_description ✅; context-bar parent Initiative masih.

**Status menyeluruh PRD V1.8.2 setelah sweep #5:** semua wajib-field hard-mandated (Goal §17, KPI Area §18, Strategy §20, Initiative §21, AP §22 termasuk Jam Deadline & Bukti yang diminta) sudah ada di schema + form + activation gate.

## [2026-06-28] update | AP evidence gate (0028) + AP context-bar parent + Goal Template hint display

**Migrasi 0028 — AP gate `evidence_description`:**
- `activate_action_plan` (versi terakhir 0026 → 0028): tambah predikat kedua cabang (one-time + repeat) — bila `evidence_required = true` DAN `coalesce(trim(evidence_description), '') = ''` → reject "Bukti yang Diminta wajib dideskripsikan saat Bukti diwajibkan (PRD §22.5)".
- Bila toggle Bukti dimatikan (`evidence_required=false`), deskripsi boleh kosong → tidak blokir.

**AP form polish (UI-S-AP4 sisa):**
- Context-bar parent Initiative di atas GuidanceNote: card kecil "Initiative induk: <nama>" via `getInitiative(initiativeId)`. Hilang saat query belum siap (lazy null).

**Goal Template Library display hint (`settings-goal-templates.tsx`):**
- KPI Area Template row di-expand sekarang juga tampilkan `target_hint` + `expected_outcome_hint` bila non-null ("Target awal: ..." / "Ekspektasi Hasil: ..."). Read-only V1; edit hint masih lewat DB direct atau admin RPC follow-up.

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass**.

**Backlog status:**
- ~~AP gate `evidence_description`~~ ✅ 0028
- ~~AP context-bar parent Initiative~~ ✅
- ~~Display hint di Goal Template Library~~ ✅ (read-only; edit form = follow-up)

**Status menyeluruh PRD V1.8.2 setelah 5 sweeps + polish:**
| Form/RPC | Wajib PRD | Schema | UI | Activate gate |
|---|---|---|---|---|
| Goal §17 | Target Tahunan + Tahun | ✅ | ✅ | — (Goal aktif via field cek di activate_goal lama) |
| KPI Area §18 | Target + Ekspektasi + Template prefill + Pecahan Q/M | ✅ | ✅ | ✅ 0026 |
| Strategy §20 | Kontribusi Q | ✅ | ✅ | ✅ 0024 Σ=100% |
| Initiative §21 | Tim | ✅ | ✅ | ✅ 0026 |
| AP §22 | Jam Deadline + Bukti yang diminta (deskriptif) | ✅ | ✅ | ✅ 0026 Jam + 0028 Bukti |

Sisa item dalam lingkup PRD V1.8.2 yang tersisa relatif kecil:
- Edit UI hint Goal Template Library (admin populate via UI, bukan DB direct).
- KPI Area Template seed update untuk fill `target_hint`/`expected_outcome_hint` per PRD §47-48.
- UI-S-PR1 Problem Statement Dampak + Bukti awal (design.html-driven, non-PRD-mandated).
- Polish visual P3 (UI-G-007/G-008 brand hue/radius) — perlu putusan tim desain.

## [2026-06-28] update | Seed 19 KPI Area Template hints (PRD §47-48)

**Migrasi 0029 — `0029_fase_seed_kpi_area_template_hints.sql`:**
- UPDATE 19 baris `kpi_area_templates` dgn `target_hint` + `expected_outcome_hint` idiomatic Indonesia.
- Idempotent (`WHERE target_hint IS NULL AND expected_outcome_hint IS NULL`).
- Verifikasi `select count(*) filter (where target_hint is null) from public.kpi_area_templates` → 0 missing dari 19 baris total.

**Style guideline yg dipakai:**
- Tidak prescribe angka konkret (pakai placeholder X/Y/Z/Rp X) — admin/CEO tinggal sesuaikan ke konteks org.
- Target = aksi terukur (Naikkan/Turunkan/Buka/Jaga ...).
- Ekspektasi Hasil = signal observable (laporan bulanan, dashboard, naik konsisten 3 bulan, dll.).

**Dampak fitur:**
- Picker di `kpi-area/new` (UI-S-K02) sekarang prefill 3 field per PRD §18 step 5: Nama + Target awal + Ekspektasi Hasil.
- `settings-goal-templates` browse view sekarang juga tampilkan dua label "Target awal: ..." dan "Ekspektasi Hasil: ..." per row KPI Area Template.

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass**.

**Status backlog dalam lingkup PRD V1.8.2:**
- ~~Seed update template hints~~ ✅
- Sisa dalam lingkup: Edit UI hint admin (CRUD form di `settings-goal-templates`) — non-blocking, V1 seed cukup. Polish visual P3 yang masih perlu putusan desain.

## [2026-06-28] update | UI-S-PR1 Problem Statement Dampak + Bukti awal (PRD §15)

**Migrasi 0030 — `0030_fase_problem_statement_impact_evidence.sql`:**
- `problem_statements.impact text` + CHECK `impact IS NULL OR impact IN ('high','medium','low')`.
- `problem_statements.initial_evidence text` (deskripsi/link bukti awal).
- NULL-able V1; gate aktivasi belum (follow-up bila perlu).

**Form `problem-statement/new.tsx`:**
- Komponen `ImpactSelector` inline (3 chip High/Medium/Low, tap aktif = unset, brand-dark solid saat selected).
- "Bukti Awal" multiline input (placeholder: "mis. screenshot dashboard, link laporan, atau ringkasan observasi").
- Context-bar "Development Area induk: <nama>" di atas GuidanceNote (selaras pola AP/Initiative parent context-bar).
- Validasi save: Dampak wajib dipilih (Alert "Belum lengkap").

**PRD alignment:** §15 metadata Problem Statement contoh: "Dampak follow up hilang - Butuh 1 flow review resmi." — Dampak adalah metadata mandatory di tree row. Design.html prototype 9 mendukung pilihan High/Med/Low.

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass**.

**Status backlog:**
- ~~UI-S-PR1 Dampak + Bukti awal + context-bar parent~~ ✅

## [2026-06-28] update | Activate gates Goal target_value + Problem Statement impact (0031)

**Migrasi 0031 — defense-in-depth aktivasi:**
- `activate_goal` patched: tambah `coalesce(trim(g.target_value), '') = ''` di kelengkapan; pesan jadi "(nama, PIC, periode, Target Tahunan wajib)" (PRD §17).
- `activate_problem_statement` patched: tambah `p.impact is null` di kelengkapan; pesan jadi "(nama, PIC, periode, Dampak wajib)" (PRD §15 metadata). MBR gate `problem_statement→initiative` blokir_aktivasi tetap utuh.

**Contract test patches:**
- `fase4_performance_workspace_contract.sql` seed Goal di TEST3 dapat `target_value='Target Tahunan'` agar test "goal_nokpi" tetap mencapai cek minimum KPI Area (bukan ke-stall di kelengkapan).
- `fase6_development_workspace_contract.sql` seed Problem Statement di TEST9 dapat `impact='medium'` agar PIC DA bisa aktifkan PS via jalur is_development_area_pic.

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass**.

**Status menyeluruh defense-in-depth PRD V1.8.2 (semua activate gate per card):**
| Card | Wajib PRD | Activate gate | Migrasi |
|---|---|---|---|
| Goal §17 | Target Tahunan | ✅ | 0031 |
| KPI Area §18 | Ekspektasi Hasil | ✅ | 0026 |
| Strategy §20 | Kontribusi Q (Σ=100%) | ✅ | 0024 |
| Initiative §21 | Tim | ✅ | 0026 |
| Action Plan §22 | Jam Deadline + Bukti deskripsi | ✅ | 0026 + 0028 |
| Problem Statement §15 | Dampak | ✅ | 0031 |

**Sisa item dalam lingkup PRD V1.8.2:**
- Polish visual P3 (UI-G-007/G-008) — butuh putusan tim desain.
- UI-S-DA1 Development Area Visibilitas (PRD tidak mandatkan; design.html driven; MINOR).
- Admin edit UI hint template via form (non-blocking).

## [2026-06-28] update | Display PRD wajib fields di header layar detail

**Cakupan:** Field-field yang ditambah lewat 0023/0025/0027/0030 tidak terlihat di layar Detail — user input tapi nggak yakin tersimpan. Patch ini menampilkan semuanya di MetaGrid header / DetailField:

- `goal/[id].tsx` MetaGrid + "Target Tahunan" (PRD §17).
- `kpi-area/[id].tsx` MetaGrid + "Ekspektasi Hasil" (PRD §18).
- `strategy/[id].tsx` MetaGrid + "Kontribusi Q" formatted "X%" (PRD §20).
- `initiative/[id].tsx` MetaGrid + "Tim" — resolve via `listTeams()` query + `.find(t => t.id === initiative.team_id)?.name` (PRD §21).
- `problem-statement/[id].tsx` MetaGrid + "Dampak" (High/Medium/Low labels) + `DetailField` "Bukti Awal" (PRD §15 + UI-S-PR1).
- `action-plan/[id].tsx` MetaGrid Deadline jadi "YYYY-MM-DD · HH:MM" (gabung `deadline` + `deadline_time`, PRD §22.9) + `Field` "Bukti yang Diminta" (PRD §22.5).

**Verifikasi:** `npx tsc --noEmit` bersih; jest **74 suite / 729 tes pass**.

**Status sweep #10 / total 10 sweep hari ini:**
- 9 migrasi (0023-0031) + display polish di 6 layar detail.
- End-to-end loop tertutup: form input → DB persist → activate gate → detail display.

## [2026-06-29] update | Design fidelity audit + Home/header/login gap closure

- Pages created: [[design-fidelity-audit]] (scorecard 7 dimensi app vs prototype tim desain).
- Pages updated: index.md (Concepts + tanggal).
- Perubahan kode `mobile/`:
  - Home `(tabs)/index.tsx`: `TaskRow` kaya (badge tipe + `ProgressBar` + %); kartu prioritas ke-3 "Gap KPI Area" + section "Snapshot Tim" via `listKpiNeedsAttention()` (sinyal "belum ada progres approved", state-based, tanpa migrasi).
  - `app-header.tsx`: search pill berlabel "Cari".
  - `(auth)/login.tsx`: "Lupa password?" fungsional (`resetPasswordForEmail`).
- Verifikasi: `tsc --noEmit` bersih; jest **74 suite / 731 tes pass** (+4 tes baru).
- Keputusan owner terbuka: brand hue `#208aef` vs `#1877f2`, muat Inter, model auth (self-signup vs admin-only). KPI "% gap" presisi diblok skema target numerik (target masih teks bebas).
- Key takeaway: detail/People/Workspace fidelity tinggi; gap sisa adalah token identity + auth model, bukan layout.

## [2026-06-29] update | KPI Area target numerik + unit (override PRD §18) → "% gap" presisi

- Override owner: PRD §18 semula melarang Satuan ("UI terasa seperti spreadsheet"); ditambah `target_numeric` + `target_unit` **opsional** agar "% gap" prototype ("65% / kurang 1.060 customer") bisa dihitung.
- Migrasi: `0032_fase_kpi_area_numeric_target.sql` (kolom + CHECK ≥0; kolom teks `target` dipertahankan).
- Kode: `lib/kpi-gap.ts` (pure `computeKpiGap`/`formatRemaining`/`groupThousands`); `lib/home.ts` `listKpiNeedsAttention` gap-aware (koersi `numeric`→`Number`); `kpi-areas.ts` NewKpiArea/Patch; layar `kpi-area/new.tsx` (input opsional), `kpi-area/[id].tsx` (kartu "Capaian vs Target"), Home Snapshot rows + kartu Gap-KPI.
- Docs: PRD §18 diperbarui (catatan override); [[design-fidelity-audit]] bagian KPI gap.
- Verifikasi: `tsc --noEmit` bersih; jest **75 suite / 741 tes pass** (+10: 9 `kpi-gap` + assertion Home).
- Catatan: migrasi 0032 perlu di-apply ke DB (belum di-push dari sesi ini).

## [2026-06-29] query | Prototype design.html vs PRD V1.82

- Pages created: [[prototype-prd-conformance]].
- Pages updated: index.md (Concepts).
- Analisis: `design.html` (8.069 baris) dibandingkan baris-demi-baris dengan PRD V1.82 (§1–§45).
- Key takeaways:
  - 46/46 screen wajib (§42) hadir; `people-ranking` sebagai sub-view (diizinkan §42).
  - 28/28 Acceptance Criteria (§44) terpenuhi; item terlarang (§5/§6) bersih (no Feed/Announcement/Watcher/Routine/Area Goal/Bobot planning).
  - Penyimpangan kecil: (1) header global tanpa icon Notifications (§7.2), (2) tab People "Q3 2026" saat periode aktif Q2 (cocok teks PRD tapi PRD inkonsisten), (3) kata "bobot" di Score Formula (sah, bukan bobot planning terlarang).
  - PRD diturunkan dari prototype (§1) → keselarasan tinggi memang diharapkan; gap nyata ada di sisi `mobile/`.

## [2026-06-29] update | Wire orphan screens: Deadline Change Request + Evaluation

- Pages updated: (none — implementation only)
- Audit `mobile/` vs prototype menemukan 2 layar yatim (route + test ada, tapi tanpa entry point dari layar induk):
  - **Deadline Change Request** (PRD §25) — sekarang dipicu dari `action-plan/[id].tsx` lewat tombol "Ajukan Ubah Deadline" di dalam SectionCard Brief Kerja. Tampil hanya untuk PIC, status `assigned|in_progress|revision`, dan one-time (repeat pakai instance).
  - **Evaluation** (PRD §26) — sekarang dipicu dari `initiative/[id].tsx` lewat SectionCard "Evaluasi Initiative" + tombol. Tampil saat initiative `active|done`. Anti-self gating tetap ditangani layar evaluation (banding `picId` vs profile).
- Verifikasi: `tsc --noEmit` bersih; jest **75 suite / 741 tes pass** (38 tes di suite terdampak: initiative, action-plan, fase8-lifecycle).
- Sisa gap dari audit prototype↔mobile: Repeat Rule Settings global (belum ada layar; per-AP repeat sudah berfungsi), Menu grid berkategori (kosmetik), Role Template label tanpa href.

## [2026-06-29] update | Menu categorization per PRD §31 + drop orphan Role Template

- Pages updated: (none — implementation only)
- `settings.tsx` (di-export oleh tab Menu) sebelumnya = daftar datar 18 entri tanpa kategori. PRD §31 mewajibkan 4 kategori:
  - **Akses Cepat**: People, People Ranking, Activity Log, Arsip, Cari
  - **Template**: Goal Template Library, KPI Area Template
  - **Pengaturan**: Organisasi, User & Permission, MBR, Card Completion Rule, Keterangan Card, Status & Prioritas, Notifications Rule, Score Formula
  - **Admin Lanjutan**: Governance Violation, Confidential Access
- "Role Template" dihapus dari menu — dikelola di dalam layar Organisasi (`settings-org-structure.tsx`) sehingga label di Menu hanya jadi item mati.
- "Manual Score Override" tidak ditambahkan ke Menu — butuh `userId`+`periodId` per orang, entry point tetap dari People Profile.
- Refactor: `SECTIONS: SettingsSection[]` → `SETTINGS_GROUPS: SettingsGroup[]`; render loop sekarang nested (group header → list items). Semua `accessibilityLabel` + `href` dipertahankan agar tes existing (menu.test, settings-permission-link, settings-score-link, settings-goal-templates) tetap hijau.
- Verifikasi: `tsc --noEmit` bersih; jest **75 suite / 741 tes pass** (66 di 10 suite settings/menu terdampak).
- Sisa gap audit: Repeat Rule Settings global (layar belum dibuat; per-AP repeat sudah jalan).

## [2026-06-29] update | Repeat Setting global (Menu > Pengaturan) — gap audit terakhir ditutup

- Pages updated: (none — implementation only)
- Layar baru `settings-repeat-rules.tsx` — inventory read-only seluruh `action_plan_repeat_rules` yang user boleh lihat (RLS). Tiap row tappable → buka Action Plan induk.
- Lib baru: `listAllRepeatRules()` di `mobile/src/lib/repeat.ts` — query `*, action_plan:action_plans(id, name, status)` order by `updated_at desc`.
- Route registration: `Stack.Screen name="settings-repeat-rules"` di `(app)/_layout.tsx` (header title "Repeat Setting").
- Menu entry baru di `settings.tsx` grup **Pengaturan** — label "Repeat Setting" → `/settings-repeat-rules` (tanpa permission gate; RLS yang membatasi data).
- Filosofi: PRD §23 — "Repeat Setting adalah setting pada Action Plan". Layar global ini sengaja read-only/inventory, edit jadwal tetap per-AP (form `new-action-plan` & navigasi balik via row).
- Tes baru `__tests__/settings-repeat-rules.test.tsx` (3 case: empty state, render row, tap → push). Pakai pola `await render(...)` (mandatory di codebase ini).
- Verifikasi: `tsc --noEmit` bersih; jest **76 suite / 744 tes pass** (+3 tes baru).
- **Status audit mobile vs prototype: 100% screen tercakup** — DCR + Evaluation wired, Role Template orphan dihapus, Menu kategorisasi §31, Repeat Setting global hadir. Sisa = polish kosmetik (Menu grid berkategori, Help sub-section, Snapshot Tim → real data).

## [2026-06-29] update | Menu profile-card polish: Score badge + tappable

- Pages updated: (none — implementation only)
- `settings.tsx` profile card sebelumnya = Avatar + nama + email + role/org (statis, tidak bisa di-tap). Prototype Menu (PRD §31) menampilkan **Score badge + "Lihat profil kamu"** + tappable ke People Profile.
- Perubahan:
  - Import `Badge`, `ScoreBadge` dari `components/ui`, `useMyScore` dari `hooks/use-people-score`, `effectiveScore` dari `lib/people-score`.
  - Profile card sekarang `Pressable` dengan `accessibilityLabel="Buka profil saya"` → push `/people-profile/<userId>`.
  - Baris email dihapus (sudah ditampilkan di People Profile); baris role berubah jadi "Lihat profil kamu" sebagai default ramah pengguna.
  - Right slot: `ScoreBadge` saat skor tersedia, `Badge "Belum" neutral` saat belum.
- Verifikasi: `tsc --noEmit` bersih; jest **76 suite / 744 tes pass** (6 suite settings/menu terdampak — 18 tes — semua hijau; query score yang gagal di test environment di-handle react-query dengan `retry:false` → fallback ke "Belum").
- Penutup audit: gap struktural prototype↔mobile sudah ditutup. Sisa polish opsional = ikon per-row menu, grid 2-kolom kategori (Akses Cepat), Help sub-section.

## [2026-06-29] update | Menu polish: Akses Cepat grid 2-col + group count

- Pages updated: (none — implementation only)
- `SettingsGroup` ditambah optional `layout?: 'list' | 'grid'` (default list) dan `SettingsSection` ditambah optional `description?` (sublabel di tile grid).
- Group "Akses Cepat" sekarang render sebagai **2-col grid of cards** (5 item: People, People Ranking, Activity Log, Arsip, Cari) dengan label + description (mis. "Ranking & profil", "Riwayat sistem"). Matches prototype Menu yang menjadikan Akses Cepat surface utama (full visibility, bukan accordion).
- Group lain (Template, Pengaturan, Admin Lanjutan) tetap **list dengan chevron** — sesuai prototype yang menjadikannya accordion (secondary).
- Header tiap group sekarang punya count item di kanan (mis. "5 item") — fidelity prototype.
- Tile non-aktif (no permission) tampil `opacity-60` + warna teks abu — feedback visual jelas tanpa menghilangkan label.
- Verifikasi: `tsc --noEmit` bersih; jest **76 suite / 744 tes pass** (11 suite menu/settings — 69 tes — semua hijau; accessibilityLabel dipertahankan).

## [2026-06-29] update | Menu accordion: secondary groups collapsible (PRD §31)

- Pages updated: (none — implementation only)
- PRD §31 menyebut "Template accordion / Pengaturan accordion / Admin Lanjutan accordion". Sebelumnya semua grup di mobile = always-expanded list.
- Perubahan `settings.tsx`:
  - State `collapsed: Record<string, boolean>` + helper `toggleGroup(title)`.
  - Header grup non-grid sekarang `Pressable` dengan `accessibilityLabel="Group <title>"`, `accessibilityState={{ expanded }}`, chevron `▾`/`▸` di kanan.
  - Default **open** (tidak collapse) untuk mempertahankan ergonomi mobile-app convention + menghindari refactor 3 tes settings yang langsung `findByLabelText('User & Permission' | 'Score Formula' | ...)`. User dapat collapse manual saat ingin compact view.
  - Akses Cepat (`layout='grid'`) selalu tampil — tidak punya toggle.
- Verifikasi: `tsc --noEmit` bersih; jest **76 suite / 744 tes pass** (semua tetap hijau karena default open).
- Polish lengkap untuk PRD §31 spec Menu: profile card (Score+tap), grup terkategori, Akses Cepat grid, count item per grup, accordion behavior pada grup secondary.

## [2026-07-02] query | Audit live vs design.html + gap ikon kartu

- Verifikasi live app (Expo web @430px, akun seed lokal `ceo@rencan.local`) terhadap `design.html`: struktur & copy layar utama (Login, Home, Notif, Workspace, Inbox, Menu, People, KPI Area detail) sejajar prototype; token brand hue + Inter masih keputusan terbuka (UI-G-007).
- Temuan baru dari owner: prototype memakai tile ikon SVG berwarna di setiap `menu-card` + `icon-button` di hero row, sedangkan app hanya punya ikon di login/app-header/tab bar — kartu Menu polos.
- Pages updated: [[ui-prototype-gap]] (item baru **UI-G-011** tile ikon per kartu, masuk P3; ikon library `@expo/vector-icons` sudah tersedia).
- Catatan akses: kredensial demo remote tidak dikenali Supabase lokal (mobile/.env → 127.0.0.1:54321); audit memakai user seed.

## [2026-07-02] update | UI-G-011 tile ikon per kartu Menu

- Komponen baru `IconTile` di `mobile/src/components/ui.tsx` (Ionicons `@expo/vector-icons`, 6 tone bg-soft + warna ikon selaras palet app DESIGN §8, dark-mode via `useColorScheme`, disembunyikan dari a11y — label teks tetap sumber makna DESIGN §4).
- `settings.tsx`: field `icon`+`tone` per item `SETTINGS_GROUPS` (18 item, 5 tone) + render tile di grid (40px) & list row (36px). Inactive → tone neutral.
- Token didaftarkan lebih dulu di `DESIGN.md` §7 (baris `IconTile`) + §10 (library Ionicons + aturan ikon≠satu-satunya sinyal), sesuai aturan CLAUDE.md.
- Verifikasi: `tsc --noEmit` bersih; jest `ui-feedback` 20/20 (termasuk test IconTile baru) + `settings-repeat-rules` 3/3 + `settings-score-link` 2/2. Live DOM (Expo web @430px): 19 tile render, 19 glyph unik, 5 tone warna ikon tepat (#1564b3/#6d28d9/#15803d/#b91c1c/#b45309).
- Ditunda: icon-button bulat di hero Inbox/People (dampak kecil).

## [2026-07-02] update | Polish backlog UI P1: 5 item detail screen ditutup

- Survey feasibility (Explore agent) atas 6 item terbuka `wiki/concepts/ui-prototype-gap.md` §4.5/4.6/4.7 (UI-S-GD1, KD1-3, DA2, ID1, AP3, H04) — semua feasible tanpa migrasi schema baru. UI-S-H04 (konsolidasi 6 section Home) ditunda ke sesi lain (risiko restructuring lebih tinggi, severity MINOR, banyak test existing).
- **UI-S-GD1** (`goal/[id].tsx`): kartu "Progress vs Capaian" — `ratioActiveOfChildren` (baru, `lib/progress.ts`) untuk "Progress kerja" + `ratioDoneOfChildren` (reuse) untuk "Capaian hasil", 2× `ProgressBar`.
- **UI-S-KD1** sudah ada sebelumnya (kartu "Capaian vs Target" dari commit KPI gap tracking) — hanya perlu update status backlog.
- **UI-S-KD2/KD3** (`kpi-area/[id].tsx`): `listKpiAreaResultValueSources` (baru, `lib/cards.ts`, join `action_plan_result_values`→`action_plan_submissions`→`action_plans`) → kartu `NilaiHasilCard` (proposed pending + "Buka Review") dan panel `SumberNilaiHasilPanel` (riwayat submission lintas AP, tap→buka AP). "Input Nilai Hasil" langsung dari KPI Area **diskip** — result value harus terikat 1 Action Plan (PIC/evidence), tak ada target aman dari layar ini.
- **UI-S-DA2** (`development-area/[id].tsx`): `DevAreaSummaryStrip` 3-tile (Progress/Problem Statement/Initiative) — `listInitiativesByProblemStatementIds` (baru, `lib/cards.ts`, 1 query batched `.in()`, bukan N+1).
- **UI-S-ID1**: sudah terimplementasi ("Buka Chat Initiative" di `ExecSpaceCard`) — diverifikasi, tidak ada perubahan kode.
- **UI-S-AP3** (`action-plan/[id].tsx`): tombol "Buka Chat" ditambah di header kartu Brief Kerja; "Ajukan Ubah Deadline" inline sudah ada sebelumnya.
- Pages updated: [[ui-prototype-gap]] (5 item ditandai selesai di §4.5/4.6/4.7 + §5 P1).
- Verifikasi: `tsc --noEmit` bersih; jest **86 suite / 774 tes pass** (+10 tes baru: `ratioActiveOfChildren`, `listInitiativesByProblemStatementIds`, `listKpiAreaResultValueSources`), tidak ada regresi.

## [2026-07-02] update | Design review tab Workspace (audit + 12 fix atomik)

- `/design-review` scoped ke tab Workspace (Expo web + seed lokal, login CEO). Skor desain B- → A-; AI slop B+ (satu-satunya hit blacklist = system-ui yang memang keputusan owner DESIGN §11).
- **Bug kritis (FINDING-001):** `workspace-hub-card.tsx` membagi `orbPercent/100` padahal `ProgressOrb` menerima 0–100 → orb lobby selalu render ~1% tone danger. Fix + regression test `workspace-hub-card.test.tsx` (3 tes).
- **A11y/kontras mengikat (DESIGN §4):** back-link 36→44px; avatar header 34→44px hit area; `text-brand-dark` +`dark:text-brand` (7 titik); kicker `neutral-400` (2.5:1) → token muted `neutral-500` + varian dark; `accessibilityRole="header"` di 5 judul layar/section.
- **Token & hirarki:** `SectionCard` kini cat surface `bg-white dark:bg-neutral-950` (inset level-2 `bg-neutral-50` jadi terbaca; elevasi dark level-3 tidak lagi terbalik); tombol tree `rounded-lg`→`rounded-xl` (10 titik); heading section `text-lg`→`text-xl` (peran H2 §3); pill `emerald`→`green` (§2); Detail level-3 tidak lagi `flex-1` (prominence konsisten antar level); `HubView` kini `ScrollView` (Dynamic Type §4.5).
- Ditunda ke backlog: [[ui-prototype-gap]] **UI-S-W05** (glyph unicode → Ionicons; string terkunci test) + **UI-S-W06** (chrome pane menumpuk — keputusan struktur). Polish kecil (p-2.5, max-width web desktop) dicatat di laporan.
- Verifikasi: jest **87 suite / 777 tes pass**; live re-scan touch target <44px = 0; tanpa console error. Laporan lengkap + screenshot before/after: `~/.gstack/projects/nawawi489-RencanApp/designs/design-audit-20260702/`.
- Commits: 12 commit `style(design): FINDING-0NN — …` di `feat/sf1-score-formula-editor`.

## [2026-07-02] update | Design consultation tab Workspace (analisa + 2 fix UI-S-W07/W08)

- `/design-consultation` scoped ke tab Workspace: analisa kode vs `DESIGN.md` + backlog [[ui-prototype-gap]]; 2 temuan baru langsung dieksekusi.
- **UI-S-W07:** expand level-1 (`GoalRow`/`DevelopmentAreaRow`) tanpa state loading/kosong/error — tap "Lihat KPI Area" pada Goal kosong terasa seperti tombol mati. Fix: paritas level-2 (`SkeletonList` + `ErrorState` retry + hint kosong); +4 tes [W07·1..4].
- **UI-S-W08:** dim "periode lewat" `opacity-50` bertumpuk multiplikatif di tree bersarang (0.5³ = 0.125 di level-3 → gagal kontras AA, DESIGN §4). Fix: `PastDim` single-layer (hanya node past teratas; `ancestorPast` threading; inline style agar flatten deterministik di jest); badge teks per node tetap tampil; +2 tes [W08·1..2].
- Feedback lain dicatat tanpa eksekusi (butuh putusan owner): **UI-S-W04** subhead gap % per node (prioritas berikut — infrastruktur `target_numeric` 0032 sudah ada), **UI-S-W06** struktur chrome (usulan: gabung back-link+H1, H1 = nama ruang, demosi CTA "+ Goal Baru"), menu ⋯ berisi placeholder semua, gate izin "+" pakai proxy permission yang salah objek.
- Pages updated: [[ui-prototype-gap]] (§4.3 + baris UI-S-W07/W08 ✅ implemented).
- Verifikasi: `tsc --noEmit` bersih; jest **87 suite / 783 tes pass** (+6); live Expo web (login CEO seed, fokus Desember 2026): 5 badge "Periode lewat" tampil, 2 node dim, opacity efektif tiap node dim = tepat 0.5 (tanpa penumpukan); console error 0.
- Commits: `99d739b` (UI-S-W07), `fe46e18` (UI-S-W08) di `feat/sf1-score-formula-editor`.

## [2026-07-02] update | Review UI/UX — audit kepatuhan DESIGN.md + batch fix

- Sweep `mobile/src/` terhadap `DESIGN.md` §2/§3/§4/§12 (kontras AA, a11y mengikat, dark mode, konsistensi token) via 3 agen audit paralel (warna/kontras, aksesibilitas, konsistensi komponen). Fondasi sehat: `SectionCard` 196×/38 layar, tidak ada `bg-brand` polos + teks putih, dark mode konsisten, ikon = Ionicons saja.
- **AA contrast (fix di sumber → menjalar):** `Button` success `green-600→700`, badge unread `Tabs` `red-500→700`, `ScoreSparkline` delta `-600→700` (`ui.tsx`); tombol Setujui/Tolak custom (`deadline-change-request.tsx`) + `TypeBadge` `emerald-600→green-700` (`home-screen.tsx`); sweep teks error/alert `text-red-600` polos → `text-red-700 dark:text-red-400` (~14 file).
- **A11y §4:** `SectionCard` press `accessibilityRole`; chip Priority/Chip/weekday `action-plan/new` ekspos `tab`/`checkbox` + selected/checked; `user-picker` trigger/close/opsi role+label+44px + `text-brand`→`brand-dark`; `hitSlop` `card-help-trigger` & eye-toggle login; 2 segmented control (`settings-permission-users`, `settings-org-structure`) 32/36→44px + `rounded-full`; 3 filter-chip settings 36→44px.
- **Dark mode §12:** splash `dark:bg-black`; ikon search header via `useColorScheme`; 10 kartu hero detail `dark:bg-neutral-900→950` selaras `SectionCard`.
- **Tipografi §3:** `font-medium→font-semibold` di sumber (`LabeledInput`, `StatPill`) + turunan.
- **Housekeeping:** hapus 10 file mati template Expo (themed-text/view, web-badge, animated-icon ×3, ui/collapsible, constants/theme, hooks/use-theme, prototype/tokens/theme) — nol importer live (verified); register token `placeholder` + wordmark login `text-green-700` di `DESIGN.md`.
- Residual sengaja ditunda sebagai backlog baru [[ui-prototype-gap]] §2.1: **UI-G-012** (palette drift emerald→green), **UI-G-013** (mikro-tipografi text-[10px]/[11px]), **UI-G-014** (fill grafis green-600 ProgressBar/legend), **UI-G-015** (hex dekoratif login belum terdaftar). Semua kosmetik/palet, lulus 3:1 — bukan kegagalan AA.
- Pages updated: [[ui-prototype-gap]] (§2.1 baru + UI-G-012..015), `DESIGN.md` (token placeholder §2), `MEMORY.md` n/a.
- Verifikasi: `tsc --noEmit` bersih; jest **87 suite / 783 tes pass** (clean serial run — kegagalan pada run paralel `--ci` = flake timeout kontensi CPU, bukan regresi); ~39 file diedit, 10 file mati dihapus (614 deletions). Belum di-commit (working tree `feat/sf1-score-formula-editor`).

## [2026-07-02] update | Audit Workspace vs Lock Spec V1.82 + sprint plan eksekusi

- Audit `mobile/` terhadap `WORKSPACE_UI_LOCK_SPEC_V1.82.md` (root repo) via 4 agen paralel: overview/nav (§2/§4/§5), Performance tree (§6/§8–§11), Development tree + interaksi (§7/§12), detail pages + states (§13–§16).
- Skor AC §18: **20 PASS · 7 PARTIAL · 8 FAIL** dari 35. Perilaku inti patuh (tree collapsed, Detail vs panah, past-period dim, §13 bersih penuh); lapisan visual lock hampir seluruhnya absen.
- Temuan kritis: WSA-01 tree baru 3 level (Initiative/Action Plan tak dirender), WSA-02 bottom nav hilang di screen turunan (route di Stack root), WSA-03 anatomi tree card (pill letter-badge/orb/border/indentasi/connector) belum ada, WSA-04 guard MBR absen di tree.
- Temuan tinggi: WSA-05 help modal `?` absen, WSA-06 search overview absen, WSA-07 header row tanpa `Edit`, WSA-08 CTA tambah turunan di detail page tanpa gating (5/6 tanpa `can()`), WSA-09 breadcrumb Development pakai prefix `Goal`.
- Pages created: [[workspace-lock-audit]] (temuan WSA-01..20 + scorecard), [[workspace-lock-sprint-plan]] (5 sprint: copy lock → guard/permission → anatomi tree card → overview/header/switcher → route & tree lengkap).
- Pages updated: [[index]].
- Keputusan owner tertunda: nasib section "Initiative Tanpa Goal" (WSA-16), sumber data stat `Notif` hub Performance, pembalikan ADR Stage 1 (tree 4–5 level).

## [2026-07-02] update | Sprint 1 Copy Lock selesai (WSA-09, WSA-12)

- Eksekusi Sprint 1 [[workspace-lock-sprint-plan]] test-first (TDD red-green).
- WSA-09: `periodBreadcrumb(focus, space)` — prefix `Development` untuk pane Development (`period-focus.ts`), diteruskan via prop `space` di `PeriodSwitcher`.
- WSA-12 copy batch (`workspace-copy.ts`): `+ Goal Baru`→`+ Goal`; `+ Development Area Baru`→`+ Development Area`; empty state `Belum ada Goal/Development Area aktif di periode ini.`; tombol hub `Masuk` (a11y label tetap membedakan ruang via `enterA11y`); stat hub kolom-3 `Aktif`→`Notif`, Development `Dev Area`→`Area`, `Problem`→`Problem Statement`; section title overview kiri `Workspace`/kanan `2 ruang`; toast archive spec §12.4 di `showPastPeriodAlert`.
- Deviasi tercatat (keputusan owner): nilai stat `Notif` sementara memakai `activeCount` sampai sumber data notifikasi diputuskan (relabel-only).
- Verifikasi: `tsc --noEmit` bersih; jest **87 suite / 787 tes pass**. Screenshot 390px ditunda (tak ada simulator di sesi ini).

## [2026-07-03] update | Sprint 2 Guard & Permission selesai (WSA-04, WSA-08, WSA-13, WSA-18)

- Eksekusi Sprint 2 [[workspace-lock-sprint-plan]] test-first.
- WSA-04 guard MBR: (a) tree — `StrategySubRow` "+ Initiative" ter-guard oleh kepatuhan `kpi_area→strategy` parent (di-fetch `KpiAreaSubRow` lewat `useMbrCompliance(expanded ? 'kpi_area' : '', id)`), tap → Alert kalimat spec §12.3 (`mbrBreakdownGuardMessage`), tombol redup, tidak push; (b) detail — `confirmAddDescendantIfIncomplete` diubah: pesan spec §12.3, hapus CTA proceed (hanya "Tutup"), fail-open→fail-closed saat compliance undefined.
- WSA-08 gating: CTA `+ Tambah <turunan>` di 5 detail page dibungkus `can()` (goal→create_kpi_area, kpi-area→create_strategy, strategy/problem-statement→create_initiative, development-area→create_problem_statement).
- WSA-13 key presisi: tree `+ Strategy`→`create_strategy`, `+ Problem Statement`→`create_problem_statement` (bukan proxy).
- WSA-18 sanitasi error: helper baru `lib/errors.ts` `alertFriendlyError()` (copy ramah ke user + `console.error` detail teknis); dipakai di 6 detail page menggantikan `Alert.alert(..., e.message)`.
- Deviasi: guard MBR tree fail-OPEN saat data compliance masih loading (hindari false-block; server tetap penegak akhir), berbeda dari detail-page yang fail-closed.
- Verifikasi: `tsc --noEmit` bersih; jest **88 suite / 797 tes pass**.

## [2026-07-03] update | Sprint 3 Visual — bagian testable selesai (WSA-03, WSA-17)

- Eksekusi Sprint 3 [[workspace-lock-sprint-plan]] test-first untuk bagian yang bisa diverifikasi via jest (lingkungan ini tak punya simulator RN untuk QA visual/screenshot).
- WSA-17 (label tombol tambah terlihat): `CardActionRow` dapat prop `addButtonLabel`; tree kini render teks `+ KPI Area` / `+ Strategy` / `+ Initiative` / `+ Problem Statement` (bukan hanya `+` icon dgn accessibilityLabel). Menutup AC 33 secara nyata.
- WSA-03 (letter-badge pill §9): komponen baru `components/workspace-kind-pill.tsx` (`WorkspaceKindPill` + map `WORKSPACE_KIND` warna terkunci spec) diintegrasikan ke semua card tree (Goal/KPI/Strategy/Initiative/Development Area/Problem Statement). Warna kategori didaftarkan di `DESIGN.md §2` (Workspace category).
- Verifikasi: `tsc --noEmit` bersih; jest **89 suite / 804 tes pass**.
- BELUM (butuh QA device/simulator, bukan hanya jest): ProgressOrb varian tree (conic-fill + label Capaian/Progress, WSA-15), border-kiri 5px warna kategori, indentasi `tree-level-1..5` + connector L (§8), geometri tombol persis (Detail pill biru h30 / `⋯` 34×30 / `+` blue-soft border `#cce2ff`), desaturasi archived (§12.4). Direkomendasikan dikerjakan di sesi dengan simulator agar bisa screenshot 390px.

## [2026-07-03] update | Sprint 3/4 lanjut — orb, help modal, search, back pill

- Lanjutan eksekusi [[workspace-lock-sprint-plan]] test-first (bagian yang bisa diverifikasi via jest; QA pixel 390px tetap butuh simulator).
- WSA-15 (Sprint 3): komponen `TreeProgressOrb` + `treeOrbColor` di `ui.tsx` (50px, angka + `%`, label bawah Capaian/Progress, warna good `#14845c`/risk `#b76b00`/bad `#c93434` spec §10). Building block siap; integrasi nilai live per-card tree ditunda (butuh data progress anak yang belum di-fetch di baris tree).
- WSA-05 (Sprint 4): `WorkspaceHelpModal` + `WS_HELP_COPY` (copy §5 terkunci); tombol `?` 26×26 di kedua hub card, buka modal, TIDAK menavigasi. 
- WSA-06 (Sprint 4): search launcher di HubView (placeholder `Cari Goal, KPI Area, Initiative, Action Plan`) → route `/search`.
- WSA-07 (Sprint 4, sebagian): back jadi pill `← Kembali` (min-w 92, border) — a11y label "Kembali ke Workspace" tetap. `Edit` button + reposisi `+ Goal` ke button row atas ditunda (gate admin + wiring Sprint 5).
- Verifikasi: `tsc --noEmit` bersih; jest **90 suite / 813 tes pass**.

## [2026-07-03] update | Sprint 3/4 visual lock lengkap — untuk QA simulator

- Lanjutan [[workspace-lock-sprint-plan]]: geometri pixel-spec dilay-down; verifikasi visual final butuh simulator 390px (out of session tools).
- WSA-03/17 (Sprint 3): action row lock spec §11 — `CardActionRow` + Strategy/Initiative inline pill diseragamkan: Detail solid biru `#1877f2` teks putih h30 r999; `⋯` 34×30 r999 bg `#f8fafc` border `#e2e8f0`; `+` h30 blue-soft bg `#eef6ff` border `#cce2ff` teks `#145ebc`. hitSlop menjaga touch target ≥44px (DESIGN §4).
- WSA-03 (§6.4–6.8 + §8): tree card di-wrap border kiri 5px warna kategori + indent `TREE_LEVEL_INDENT` (Goal/DevArea level-0=0, KPI/PS level-2=16, Strategy/Initiative level-3=20). Konstanta terkunci di `components/workspace-kind-pill.tsx` (`WORKSPACE_KIND_BORDER`, `TREE_LEVEL_INDENT`) + tes.
- WSA-11 (Sprint 4): `WorkspaceHubCard` dapat prop `space`; border kiri 4px (`#1877f2`/`#0f766e`), bg tint spec (`#f8fbff`/`#f7fffd`), min-h 172, kicker jadi pill dgn tint kategori, progress line bawah, tombol `Masuk` sebagai tombol biru/teal nyata (bukan teks link).
- WSA-10 (Sprint 4): `PeriodSwitcher` diubah jadi collapsed pill min-h 48 radius 999 (Performance `#eef4fb`/`#d9e3ef`, Development `#eefaf8`/`#cceee8`); tombol `Ubah` warna ruang.
- WSA-07 (Sprint 4): `PaneTopHeader` refactor — button row paling atas: `Kembali` pill + spacer + optional `Edit` (secondary) + primary (`+ Goal` / `+ Development Area`, h42 r8 biru). Tombol `+ Goal` lama di bawah PeriodSwitcher dihapus.
- Verifikasi: `tsc --noEmit` bersih; jest **90 suite / 815 tes pass**. Yang belum: nilai orb tree per-card (butuh data progress anak yang belum di-fetch di tree row), tree connector L-shape 10×32 `#cfd8e5` (butuh positioning absolute + calc yang lebih hati-hati — lebih aman diverifikasi di simulator dulu), Sprint 5 struktural (WSA-01/02/14/16/19/20).

## [2026-07-03] update | Sprint 5 WSA-01 — tree 4–5 level lengkap (verified live)

- WSA-01: tree Workspace kini render penuh 5 level. Performance: Goal → KPI Area → Strategy → Initiative → Action Plan. Development: Development Area → Problem Statement → Initiative → Action Plan.
- `StrategySubRow` + `InitiativeSubRow` di-refactor pakai `CardActionRow` (expand toggle terpadu); `InitiativeSubRow` dapat prop `level` (4 di Performance, 3 di Development) + expand → Action Plan; komponen baru `ActionPlanSubRow` (leaf: Detail + ⋯, tanpa panah/tambah, spec §6.8).
- Hooks baru/diperluas di `use-workspace.ts`: `useStrategyInitiatives(id, enabled)` (lazy), `useInitiativeActionPlans(id, enabled)`. `CardActionRow` diperluas: `onAddPress` (override handler tekan, utk guard MBR) + `addDimmed`.
- Fix nested-button (ditemukan via QA Expo web): `WorkspaceHubCard` sebelumnya `Pressable` membungkus tombol `?` + `Masuk` → `<button>` di dalam `<button>` (invalid HTML, a11y buruk). Kartu diubah jadi `View`; `Masuk` jadi satu-satunya tombol pembawa `onEnter` (spec §4.4: card-tap opsional). 0 nested button di DOM.
- QA live (Expo web, viewport 390px, akun ceo@rencan.local): hub 2-card + `?` modal + search + period pill + header row + tree 5-level dikonfirmasi render benar (warna kategori, letter pill, indent, Action Plan leaf).
- Verifikasi: `tsc --noEmit` bersih; jest **90 suite / 818 tes pass**.

## [2026-07-03] update | Sprint 5 WSA-14 — action sheet fungsional

- WSA-14: aksi sekunder `⋯` card tree tidak lagi placeholder. Hook baru `useTreeRowActions(entityType, id, name)` di workspace.tsx: `Ubah` → detail page (per `ENTITY_ROUTE_SEGMENT`), `Arsipkan` (destructive) → konfirmasi Alert → `useArchiveActions().archive({entityType, entityId})`, error disanitasi via `alertFriendlyError`. Server (RPC `archive_card`) tetap penegak izin. Diwire ke 8 baris (Goal/KPI/Strategy/Initiative/ActionPlan/DevArea/ProblemStatement/flat Initiative); menu `Salin` (di luar spec §12.2) dihapus.
- Catatan test: menekan item RowActionsMenu (state update onClose) HARUS dibungkus `act()`; press di luar act mencemari scheduler act dan bikin render test berikutnya time-out (di-debug via bisect). `period-switcher.test.tsx` diberi `jest.setTimeout(20000)` (cold-start render pertama, pola sama suite RN berat lain).

## [2026-07-03] update | Sprint 5 WSA-08 tahap 2 + WSA-16 + WSA-20 (defer)

- WSA-08 tahap 2 (§14.4): CTA "+ Tambah <turunan>" DIHAPUS dari 6 detail page (goal/kpi-area/strategy/development-area/problem-statement/initiative) — kini tree Workspace jadi satu-satunya jalur tambah turunan. `handleAdd*`, `confirmAddDescendantIfIncomplete`, gating `can()` untuk CTA + import terkait dibersihkan; `useMbrCompliance` dipertahankan di page yg pakai `guardMbrActivation` (aktivasi). Test kpi-area di-update: assert CTA tak pernah dirender.
- WSA-16: keputusan owner = pindah "Initiative Tanpa Goal" ke Search/Menu. Section + `InitiativeRow` + `useFlatInitiatives` dihapus dari pane Performance (di luar spec §6); initiative yatim tetap diakses via route `/search`. Test [1] di-update.
- WSA-20 (opsional §12.1.4): DITUNDA by design. Toast edukasi tap-badan-card tidak dipasang — modal Alert per tap = UX buruk, dan Pressable pembungkus judul memicu update pressed-state yang merapuhkan scheduler act di test (butuh act-wrap seluruh press judul). AC 20 sudah terpenuhi (tap badan = no-op senyap).
- WSA-02/WSA-19 (restrukturisasi route): DITUNDA ke PR terpisah — implementasi benar butuh nest route detail Workspace di bawah tab (mengubah path `/goal/[id]` dst.), yang memutus deep-link dari Home/Notif/Inbox/People ke route yg sama. Persis "reorganisasi global" yg dilarang §19.2. Perlu regresi deep-link menyeluruh + keputusan produk (pola tab-hidden-on-detail adalah pola umum yg valid).
- Verifikasi: `tsc --noEmit` bersih; jest **90 suite / 818 pass** (serial).

## [2026-07-03] qa | QA visual tree Workspace di web preview (login live ceo@rencan.local)
- Eksekusi QA visual [[workspace-lock-sprint-plan]] Sprint 3/4 di Expo web (localhost) + Supabase lokal, data nyata (bukan fixture prototype). Login `ceo@rencan.local`, dark mode (OS).
- TERVERIFIKASI OK: tree 5 level penuh (Goal→KPI Area→Strategy→Initiative→Action Plan, WSA-01); border-kiri 5px warna kategori persis spec (blue #1877f2 / amber #b76b00 / violet #6941c6 / green #14845c); indentasi progresif per level; kind-pill huruf G/K/S/I/AP benar; Action Plan = leaf 2-kolom tanpa panah/`+`; action row Detail/`⋯`/`+ <turunan>` label terlihat; header row (Kembali/+ Goal), period switcher collapsed pill, search input — semua render benar.
- BUG DITEMUKAN + DIPERBAIKI:
  1. **Hub card invisible di dark mode** (`workspace-hub-card.tsx`): bg terkunci light (#f8fbff/#f7fffd) tapi anak pakai `dark:` → judul/orb jadi putih-di-atas-putih (~1.03:1). Fix: surface + border netral kini theme-aware via `useColorScheme` (light mode tetap hex spec; dark mode bg #0a0a0a border #262626), border-kiri identitas dipertahankan. Kontras judul kini ~19:1. Verified live.
  2. **Status Action Plan bocor enum mentah** (`workspace.tsx` `StatusBadge`): hanya pakai `PLANNING_STATUS_LABEL` → Action Plan tampil `in_progress`. Fix: `TREE_STATUS_LABEL` gabung PLANNING+INITIATIVE+ACTION_PLAN label map → kini `Dikerjakan`. Verified live.
- GAP TERSISA (deferred, bukan regresi): (a) ProgressOrb belum dirender di card tree — `TreeProgressOrb` sudah ada tapi butuh fetch progress anak per baris (WSA-15 integrasi live); (b) connector L-shape §8 belum ada — nesting masih card-dalam-card + border-kiri (tanpa horizontal scroll, AC 31 OK, tapi deviasi visual §8); (c) judul level dalam ter-truncate ("Launch Program …", "Desain Landi…") karena indentasi kumulatif menyempitkan lebar.
- Verifikasi: `tsc --noEmit` bersih; jest workspace 52/52 + use-workspace 17/17 + hub-card 3/3 pass.

## [2026-07-03] update | Sprint 3 lanjut — truncation fix (§6) + L-connector (§8); orb tetap ditunda
- Lanjutan QA visual [[workspace-lock-sprint-plan]] di web preview (data live, dark mode).
- **#3 Truncation judul** — 7 baris tree (Goal/KPI/Strategy/Initiative/Action Plan/Problem Statement/Development Area): status badge dipindah ke baris kind-pill (dua chip berdampingan, `flex-row justify-between`); judul kini punya baris penuh sendiri (`numberOfLines={2}`, tanpa `flex-1` berebut lebar dengan badge). Verified: "Launch Program Referral" & "Desain Landing Page Referral" kini tampil penuh (sebelumnya "Launch Program …" / "Desain Landi…"). Layout forward-compatible: kolom kanan tetap kosong untuk orb nanti.
- **#2 Connector L-shape (§8)** — komponen `TreeConnector` (overlay absolute non-interaktif) dipasang di 5 baris turunan (KPI Area/Strategy/Initiative/Action Plan/Problem Statement; root Goal/DevArea tanpa connector). Geometri terverifikasi di DOM persis spec: `position:absolute, left/top -10px, 10×32px, border-left+bottom 2px #cfd8e5, radius bottom-left 8px`. Satu connector per card turunan.
- **#1 Progress orb tree (WSA-15, AC 22) — TETAP DITUNDA (butuh data contract).** Spec §6.4–6.8/§10 mewajibkan orb 50px per card, tapi nilai capaian induk (Goal/KPI/Strategy/Initiative) butuh agregasi status anak → dengan tree lazy-fetch = N+1 query per card collapsed (pola yg sengaja dihindari). `progress.ts` klien hanya bisa hitung Action Plan (status-based) tanpa fetch; induk butuh rollup server (view/RPC `workspace_card_progress`). Orb parsial (hanya AP) melanggar keseragaman anatomi → all-or-nothing. Rekomendasi: kerjakan sbagai task data-contract tersendiri (TDD): tambah kolom capaian/progress ke query list tiap entitas atau view agregat, lalu wire `TreeProgressOrb` ke kolom kanan. Ini item lock terbesar yg tersisa.
- Verifikasi: `tsc --noEmit` bersih; jest workspace 52/52 + use-workspace 17/17 pass. (Screenshot harness error `UnknownVizError` transient — verifikasi lewat DOM snapshot + computed-style eval.)

## [2026-07-03] update | WSA-15 progress orb tree — data contract + wiring (TDD, verified live)
- Implementasi penuh [[workspace-progress-orb-tdd-plan]] (AC 22, spec §6.4–6.8/§10) via TDD red→green→refactor. Keputusan owner dikunci: rumus induk = %anak-langsung-done (identik `ratioDoneOfChildren`); SECURITY INVOKER (capaian per-visibilitas); induk tanpa anak → 0%; AP repeat tanpa compliance → '—'.
- **DB**: migration `0037_wsa15_workspace_card_progress.sql` — RPC `workspace_card_progress(p_card_ids uuid[]) → (card_id, progress int)`, INVOKER + `set search_path=''`, agregasi anak LANGSUNG non-archived per tipe kartu (goal→kpi_areas, kpi→strategies, strategy/ps→initiatives, initiative→action_plans, dev_area→problem_statements). Diterapkan ke DB lokal (docker exec psql). `database.types.ts` ditambah tipe RPC.
- **Data**: `progress.ts` +`treeOrbLabel(kind)` (Goal/KPI='Capaian', lain='Progress') +`actionPlanTreeProgress` (reuse `computeActionPlanProgress`; repeat tanpa compliance→null). Modul baru `workspace-progress.ts` `fetchCardProgress(ids)→Map` (guard ids kosong, clamp 0–100, propagasi error).
- **Hook**: `useCardProgress(ids)` di `use-workspace.ts` — queryKey `['workspace_card_progress', sortedIds]`, `enabled: ids.length>0` (lazy, 1 RPC per kontainer expanded, bukan per row), `progressOf(id)` null-safe (0≠null). Invalidasi `['workspace_card_progress']` ditambah di: useGoalActions/useKpiAreaActions/useStrategyActions/useDevelopmentAreaActions/useProblemStatementActions (create+activate), useArchiveActions (archive), + action-plan `refresh()` (activate/start/review→done).
- **UI**: komponen `TreeOrbCell` (orb 50px atau '—' bila null) diwire ke 7 row + 8 kontainer. Kolom kanan tiap card diisi orb; leaf Action Plan dihitung klien (status/compliance).
- **Verifikasi live** (login ceo@rencan.local, DB lokal): Goal/KPI orb 'Capaian' (rollup RPC), Strategy/Initiative 'Progress', Action Plan 'Progress 50%' (in_progress→heuristik klien, ring amber `treeOrbColor`). Label & warna sesuai spec §10.
- **Test**: +25 test (13 data `workspace-progress.test.ts` + 7 hook `use-workspace.test.tsx` + 5 UI `workspace.test.tsx`). Full suite **91 suite / 843 tes pass**, `tsc --noEmit` bersih.
- CATATAN: migration 0037 baru di DB LOKAL; remote perlu `supabase db push` saat deploy. Follow-up minor: di 390px level terdalam (Initiative/AP) badge status & orb agak berdempet — perlu polish real-estate (mis. sembunyikan status di level dalam atau perkecil).

## [2026-07-03] update | Penuntasan sisa [[workspace-lock-sprint-plan]]: WSA-20, polish 390px, WSA-19
- Menutup sisa sprint plan (Sprint 5) yang sebelumnya ditunda; verifikasi live (Expo web, login ceo@rencan.local, DB lokal, 390px).
- **WSA-20 (§12.1.4)**: toast edukasi tap-badan-card kini TERPASANG (bukan lagi ditunda). `WorkspaceToastHost` (overlay bawah, auto-dismiss 2.6s, timer di-`unref`+`mounted`-guard → aman jest) + context; `TreeCardBody` memasang **Pressable overlay absolut** di atas baris konten (BUKAN pembungkus/ancestor) supaya `fireEvent.press` judul tak mem-bubble & membocorkan pressed-state antar-test (akar kerapuhan yang dulu jadi alasan penundaan). Tap badan → toast "Untuk membuka isi Card, gunakan tombol Detail di dalam Card."; tombol Detail/⋯/+/panah tetap menang. +1 test.
- **Polish 390px**: baris pill+status tiap tree card dapat `flexWrap: 'wrap'` + `rowGap` → di level terdalam badge status turun baris alih-alih berdempet dgn orb (menutup follow-up QA WSA-15).
- **WSA-19 (route restructure — SLICE AMAN, keputusan owner)**: pane Workspace jadi **route deep-linkable** di dalam nested stack tab. `workspace.tsx` (route) → dipindah ke `src/screens/workspace-screen.tsx` (shared, export `HubScreen`/`PerformanceScreen`/`DevelopmentScreen`); route baru `(tabs)/workspace/{_layout,index,performance,development}.tsx` (`unstable_settings.initialRouteName='index'` sbagai anchor). "Masuk" → `router.push('/workspace/performance'|'/development')`; TabBar antar-pane → `router.replace`; "Kembali" → `back()` bila ada history, else `replace('/workspace')`. **Tab bar tetap terlihat di pane** (parsial WSA-02) & back gesture kembali ke hub. TIDAK memutus deep-link `/goal/[id]` dkk (route detail tetap di root). +2 test (WSA-19·1/2). Verifikasi live: hub → Masuk → `/workspace/performance` (tab bar visible, Hierarki Strategis render) → Kembali → `/workspace`. ✓
- **WSA-02 (tab bar di halaman detail leaf) & full-reorg**: DITOLAK by owner decision (opsi "slice aman"). Nge-nest `/goal/[id]` dkk di bawah tab akan memutus deep-link Home/Notif/Inbox/People/Search (dilarang §19.2); pola tab-hidden-on-detail dinyatakan valid & diterima. Ditutup sebagai resolved-by-decision.
- **Test**: full suite **91 suite / 846 tes pass** (843 + WSA-20 + WSA-19·1/2), `tsc --noEmit` bersih.
- **SISA (deploy-only, di luar sesi)**: `supabase db push` migration 0037 ke remote — tak ada remote ter-link di repo (tak ada `config.toml`/`project-ref`/CLI) & Supabase MCP ≠ DB lokal app; aksi deploy-time milik environment owner.

## [2026-07-03] update | Hapus WORKSPACE_UI_LOCK_SPEC_V1.82 (turun status ke sumber kebenaran prototype + PRD)
- Keputusan owner: file `WORKSPACE_UI_LOCK_SPEC_V1.82.md` (root repo) **dihapus**. Alasan: tujuan awalnya hanya memaksa `mobile/` mengikuti prototype final; sprint lock sudah selesai ([[workspace-lock-sprint-plan]]), jadi lock mengikat tak lagi diperlukan. Sumber kebenaran Workspace kembali ke `PRD.md` (V1.82) + prototype `outputs/ems-mobile-ui/index.html`.
- Rujukan dibersihkan: `DESIGN.md` (§ kategori Workspace + doktrin a11y §2 kini berdiri sendiri di atas §4, tak lagi merujuk §19.6 lock), `CLAUDE_WORKSPACE_PATCH_PROMPT_V1.82.md` (baris source-of-truth lock dibuang), [[workspace-lock-audit]] + [[workspace-lock-sprint-plan]] + [[index]] (deskripsi menyebut spec sudah dihapus; §-nomor lama dipertahankan sebagai referensi historis).
- **Aturan a11y TIDAK berubah**: nilai AA (fill solid `brand-dark #1564b3`, surface theme-aware dark mode, touch target 44px/radius 12) tetap mengikat karena bersumber `DESIGN.md §4`, bukan dari lock. Implementasi `mobile/` tak disentuh — sudah sesuai.
- Pages updated: [[workspace-lock-audit]], [[workspace-lock-sprint-plan]], [[index]]; files: `DESIGN.md`, `CLAUDE_WORKSPACE_PATCH_PROMPT_V1.82.md`. Deleted: `WORKSPACE_UI_LOCK_SPEC_V1.82.md`.

## [2026-07-03] update | AppHeader back button generik + konsolidasi tap-badan-card → Detail
- **AppHeader** (`app-header.tsx`) jadi pemegang tunggal affordance back untuk Workspace: tampil bila `router.canGoBack()` ATAU sub-route `workspace/performance`|`workspace/development` (fallback `replace('/workspace')` saat deep-link tanpa history); root tab tidak pernah menampilkan back meski `canGoBack()` true. Judul kontekstual ("Performance"/"Development") menggantikan judul statis "Workspace" di pane. +7 test baru `app-header.test.tsx`.
- **Konsolidasi tombol Detail + toast WSA-20**: tombol "Detail" terpisah di `CardActionRow` DIHAPUS; tap di badan card manapun (pill+judul+orb, overlay penuh accessibilityLabel `Buka detail X`) langsung `router.push` ke detail — menggantikan pola lama (Detail button terpisah) DAN toast edukasi WSA-20 (`WorkspaceToastHost`, `WS_COPY.bodyTapHint` dihapus, sudah tidak dipakai).
- **`PastDim` opacity dihapus** (owner decision 2026-07-03): kartu periode-lewat TIDAK lagi didim `opacity: 0.5` di layer manapun — badge teks "Periode lewat" jadi satu-satunya sinyal visual (DESIGN §4 tetap terpenuhi: warna/opacity bukan satu-satunya sinyal, badge teks selalu ada).
- `TREE_LEVEL_INDENT` (§8) diperlebar: 12/16/20/24/28 → 16/32/48/64/80 (readability level dalam).
- Pane Performance/Development pindah dari `FlatList` ke `ScrollView` + `.map()` (imbas hilangnya `PaneTopHeader`/`TabBar` internal — perpindahan pane sepenuhnya lewat Hub).
- **Catatan drift**: desain (`docs/superpowers/specs/2026-07-03-workspace-full-drill-down-design.md`) + plan TDD (`docs/superpowers/plans/2026-07-03-workspace-full-drill-down.md`) sudah APPROVED untuk mengganti tree inline ini sepenuhnya dengan navigasi full drill-down per level (route eksplisit + shell generik). Belum diimplementasikan — task 1-7 plan tsb semua belum dieksekusi; perubahan di entry log ini murni polish di atas tree inline yang masih berlaku.
- **Test**: full suite **92 suite / 855 tes pass**, `tsc --noEmit` bersih. 3 tes lama (`S3-1`, `WSA-20`, `W08·1/2`) diupdate agar sesuai perilaku baru (bukan regresi — direview eksplisit dgn owner).

## [2026-07-04] update | Rollout workspace tree mobile optimization

- Indent tree dikompresi untuk level dalam agar hierarki mobile tidak cepat terdorong ke kanan.
- Progress orb non-root dibuat compact supaya kolom kanan lebih stabil pada lebar sempit.
- Action row dipadatkan tanpa menghilangkan affordance utama untuk expand, aksi lain, dan tambah turunan.
- `useCardProgress` distabilkan dengan normalisasi ID dan referensi yang lebih konsisten untuk mengurangi churn render subtree.

## [2026-07-04] update | Rollout workspace compact card anatomy

- Nested card tree diubah ke anatomi compact yang hampir selebar parent agar hierarki tetap muat inline di satu layar.
- Cluster progress orb dan chevron dipindah ke kanan atas supaya header tiap card lebih ringkas dan ritmenya konsisten.
- Action row diseragamkan ke pola `Detail`, `...`, dan `+ Child` untuk Performance dan Development.
- Meta card diringkas ke 1-2 baris agar konteks utama tetap terbaca tanpa membuat tinggi card cepat membengkak.
- Final pass compact anatomy: header semua level sekarang memakai kombinasi `kind pill + period pill`, sehingga ritme visual lebih dekat ke prototype.
- Status dan sinyal `Periode lewat` dipindah dari badge header ke meta compact agar area atas card tetap bersih.
- Helper meta dipecah per card type supaya Performance dan Development merakit copy compact dengan pola yang sejajar.
- Orb compact diperkecil lagi dan action row dibesarkan sedikit agar keseimbangan visual mendekati prototype tanpa mengorbankan ruang tree.
- Polish final setelah review screenshot: indent level dalam dikompresi lagi agar child card terasa lebih lebar dan tidak cepat kehilangan ruang baca.
- Connector dipendekkan dan cluster `orb + chevron` dirapatkan supaya subtree terlihat lebih seperti kartu bertumpuk daripada lorong sempit.
- Copy meta dibersihkan dari status teknis yang berulang; fokusnya sekarang ke target, risiko, bukti, deadline, dan kebutuhan child.
- Spacing vertical antarblok di tiap card dipadatkan lagi agar lebih banyak level yang muat dalam satu viewport mobile.

## [2026-07-05] update | spec+design session — resolve PPL-02/PPL-06 blockers (OQ-5/6/7/9)

- Owner decisions on the four open questions gating PPL-02/PPL-06 in `docs/spec-ui-testfix-2026-07-05.md`:
  - **OQ-5** (PPL-06 riwayat cross-user) → **Cross-user, RLS-gated**: add `listUserScoreHistory(userId)`; RLS eksisting (0013:799–805) sudah mengizinkan self/supervisor/manage_score_formula/view_all_workspace — no migration. Out-of-scope viewer → `[]`.
  - **OQ-6** (PPL-06 "Kontribusi bulan ini") → **jumlah Action Plan `completed` periode aktif**; sengaja beda makna dari Achievement Score/Rincian Score. Kosong → GuidanceNote "Skor menyusul".
  - **OQ-7** (PPL-02 tab Quarter) → **DEFER (placeholder)** sampai data quarterly-rollup skoring ada (Fase 7 aktivasi); anti-conflation PeriodFocus ≠ period_snapshots tetap mengikat.
  - **OQ-9** (PPL-02 tab Admin) → **entry-point ke layar admin eksisting** (link ke User & Permission, Score Formula, dst.), gate `manage_score_formula`; tanpa surface baru.
- Pages updated: `docs/spec-ui-testfix-2026-07-05.md` (FR-PPL02.3/.5, FR-PPL06.2/.4, §8 RESOLVED block, §9 handoff, AC-PPL06-2, status header).
- Result: PPL-02 & PPL-06 **tidak lagi terblokir** untuk `tdd-plan`. Pemblokir tersisa hanya OQ-1 (WS-04 server scope) & OQ-4 (THEME-01 root cause), keduanya di luar PPL.

## [2026-07-05] update | tdd-plan PPL-02 & PPL-06 (multi-agent workflow)

- **Trigger:** `/tdd-plan` workflow (8 agents, 90 tool calls, ~10 menit) setelah OQ-5/6/7/9 resolved (session sebelumnya di [log.md] hari yang sama).
- **Output:** `docs/tdd-plan-ppl02-ppl06-2026-07-05.md` — 12 langkah red→green→refactor terbagi 5 fase (Data → Hooks → UI People → UI People-Profile → Refactor pasca-hijau).
- **Test files direncanakan:**
  - `mobile/src/lib/__tests__/people-score.test.ts` (+13 kasus data: `listUserScoreHistory`, `countCompletedActionPlansInPeriod`, `PEOPLE_TAB_COPY`).
  - `mobile/src/hooks/__tests__/use-people-score.test.tsx` (+5 kasus: `useUserScoreHistory`, invalidation `override → user_score_history`).
  - `mobile/src/app/(app)/menu/__tests__/people.test.tsx` (+8 kasus PPL-02-1..8).
  - `mobile/src/app/(app)/menu/__tests__/people-profile.test.tsx` (+7 kasus PPL-06-1..7).
- **API baru (tanpa migrasi):**
  - `listUserScoreHistory(userId, limit=6)` di `mobile/src/lib/people-score.ts` — RLS eksisting 0013:799-815 sudah izinkan self/supervisor/manage_score_formula/view_all_workspace.
  - `countCompletedActionPlansInPeriod(userId, period)` di `mobile/src/lib/cards.ts` — metrik "Kontribusi bulan ini".
  - Konstanta `PEOPLE_TAB_COPY` + `ADMIN_TAB_ENTRIES`.
  - Hook `useUserScoreHistory(userId, limit)` + perluasan `useScoreOverride` invalidation.
- **Critic verdict:** `perlu-perbaikan` — 21 missing cases + 18 concerns.
  - **Top blocker semantik:** OQ-6 belum kunci apakah "AP selesai bulan ini" = filter `deadline` window atau `completed_at` window (SEMANTIC-D9 + Missing M3/M4). Filter `deadline` mengeksklusi late completions dan AP tanpa deadline — kemungkinan salah semantik produk. **Butuh keputusan owner sebelum RED D9.**
  - **Top blocker security:** RLS 0013:799-815 sebagai kontrak visibility PPL-06 tidak diuji unit (mock tidak cukup) — plan tidak menjadwalkan pgTAP/psql smoke. Rekomendasi tambah `supabase/tests/*.sql` untuk kontrak `listUserScoreHistory` RLS.
  - **Top blocker UX cross-user:** M2 — viewer di luar scope RLS action_plans → count return 0 → UI render "0" LITERAL, ambigu vs "0 nyata". Butuh disambiguation (GuidanceNote "Skor menyusul untuk viewer di luar scope").
- **Next actions dianjurkan sebelum jalankan RED:**
  1. Owner konfirmasi semantik OQ-6: filter `deadline` atau `completed_at`?
  2. Owner konfirmasi UX untuk RLS-deny 0 vs 0 nyata (Missing M2).
  3. Ekstrak `makeQueryThenable` helper ke shared file (STRATEGI-MOCK-1) sebelum RED.
  4. Refactor `useRouter` mock di `people.test.tsx` ke top-level `mockPush` (STRATEGI-MOCK EXPO-ROUTER-MOCK).

## [2026-07-05] update | Fase A subset RED→GREEN (listUserScoreHistory + PEOPLE_TAB_COPY)

- **Scope:** subset aman dari Fase A tdd-plan — D1–D6 (`listUserScoreHistory`) + TC1 (`PEOPLE_TAB_COPY`). Defer D7–D11 (`countCompletedActionPlansInPeriod`) sampai owner mengunci OQ-6 detail (deadline window vs completed_at window; UX RLS-deny 0 vs 0 nyata).
- **Files edited:**
  - `mobile/src/lib/__tests__/people-score.test.ts` — tambah 7 RED test (TC1 + UH1–UH6), reuse `makeQueryThenable` file-local (STRATEGI-MOCK-1 di-address dengan reuse-in-place, tanpa extract helper — file lain tidak butuh).
  - `mobile/src/lib/people-score.ts` — tambah konstanta `PEOPLE_TAB_COPY` + fungsi `listUserScoreHistory(userId, limit=6)` pola mirror `listMyScoreHistory` tanpa `auth.getUser()` (RLS server-side yang menyaring).
- **Verifikasi:**
  - RED: sebelum implementasi, 7 test fail dengan `TypeError: not a function` / undefined untuk symbol persis yang di-import — proper RED bukan import error spurious.
  - GREEN: `npx jest --testPathPattern=people-score` → 59/59 pass (52 lama + 7 baru).
  - Regresi full-suite: 6 fail / 859 pass di 3 file yang **tidak** aku sentuh (`workspace.test.tsx`, `tree-progress-orb.test.tsx`, `workspace-screen.tsx`). Diverifikasi pre-existing via `git stash` baseline — 6 fail identik di baseline.
  - `npx tsc --noEmit` → 5 error identik di baseline (workspace/tree-progress-orb/workspace-screen), semua di file yang tak aku sentuh.
- **Kontrak baru yang dikunci test:**
  - `listUserScoreHistory('')` → `[]` tanpa fetch, tanpa `auth.getUser` (guard input).
  - `listUserScoreHistory('u', n)` → `.from('user_score_results').eq('user_id', 'u').eq('is_current', true).limit(n)`, TIDAK panggil `auth.getUser` (RLS server-side yang menyaring viewer).
  - Sort DESC by `period_start` (safety-net client-side untuk foreignTable order).
  - RLS deny → `[]` graceful (bukan error), default `limit=6`, propagasi error apa adanya.
  - `PEOPLE_TAB_COPY = {monthly:'Bulan ini', quarterly:'Quarter', ranking:'Ranking', admin:'Admin', quarterlyPlaceholder:/quarter|kuartal/i}`.
- **Blocker berikutnya (untuk lanjut Fase A):** owner memutuskan OQ-6 detail (deadline vs completed_at window) + Missing-M2 (UX untuk RLS-deny 0 vs 0 nyata). Setelah itu D7–D11 bisa RED di `cards.test.ts`.
- **Rekomendasi lanjut tanpa blocker OQ-6:** langsung ke Fase B (hooks layer — `useUserScoreHistory` + `useScoreOverride` invalidation `user_score_history`) karena tidak bergantung pada `countCompletedActionPlansInPeriod`.

## [2026-07-05] update | Fase B RED→GREEN (useUserScoreHistory hook + override invalidation)

- **Scope:** Fase B tdd-plan step 4–5. Layer hooks di atas `listUserScoreHistory` yang landed Fase A. Tetap aman dari blocker OQ-6 karena tidak menyentuh `countCompletedActionPlansInPeriod`.
- **Files edited:**
  - `mobile/src/hooks/__tests__/use-people-score.test.tsx` — tambah 4 RED test (B1–B4 useUserScoreHistory) + perluas assertion test [10] useScoreOverride (B5) untuk memasukkan `['user_score_history']` di invalidation list. Mock `listUserScoreHistory` ditambahkan ke `jest.mock('@/lib/people-score', ...)`.
  - `mobile/src/hooks/use-people-score.ts` — tambah hook `useUserScoreHistory(userId, limit=6)` (queryKey `['user_score_history', userId, limit]`, `enabled: !!userId`, pola mirror `useMyScoreHistory`) + perluas `useScoreOverride` `onSuccess` dengan `invalidateQueries({ queryKey: ['user_score_history'] })` (append, existing 4 invalidasi dipertahankan).
- **Verifikasi:**
  - RED: 5 test fail sebelum GREEN — 4 dgn `TypeError: useUserScoreHistory is not a function`, 1 dgn diff jelas menunjukkan `['user_score_history']` absen dari `spy.mock.calls`. 14 test lama pass tanpa regresi.
  - GREEN: `npx jest --testPathPattern="use-people-score|people-score"` → 63/63 pass (dua suite: 44 hook + 59 data, kombinasi).
  - Full-suite: 6 fail / 863 pass / 869 total. Baseline setelah Fase A: 6 fail / 859 pass / 865 total. Delta = +4 pass (B1–B4, sesuai). Fail-set identik dengan baseline (workspace.test.tsx / tree-progress-orb.test.tsx / workspace-screen.tsx pre-existing).
  - `npx tsc --noEmit` → 5 error identik baseline.
- **Kontrak baru yang dikunci test:**
  - `useUserScoreHistory('', n)` → `enabled=false`, tidak fetch, `history=[]`.
  - `useUserScoreHistory(userId, n)` → `queryKey ['user_score_history', userId, n]`, passthrough `listUserScoreHistory(userId, n)`.
  - RLS deny (mock resolve `[]`) → `history=[]`, `isError=false` (graceful).
  - Default `limit=6` saat argumen tak diberi.
  - `useScoreOverride(...).override(...)` `onSuccess` → invalidate ALL of `['my_score']`, `['user_score']`, `['ranking']`, `['my_score_history']`, `['user_score_history']`.
- **Sisa Fase A/B pending:** hanya D7–D11 (`countCompletedActionPlansInPeriod`) yang blocked pada keputusan owner OQ-6 detail. Tidak menghalangi Fase C (UI People) atau Fase D (UI Profile) selama seksi Kontribusi bulan ini di-DEFER dulu sampai OQ-6 terkunci.

## [2026-07-05] update | Fase C RED→GREEN (PPL-02 tab structure di people.tsx)

- **Scope:** Fase C tdd-plan step 6–7. Tab structure Bulan ini / Quarter / Ranking / Admin di layar People. Quarter = placeholder DEFER (OQ-7). Admin = entry-point ke layar admin eksisting, gate `manage_score_formula` (OQ-9). PPL-02 ditutup di suite ini.
- **Files edited:**
  - `mobile/src/app/(app)/__tests__/people.test.tsx` — tambah 8 RED test (PPL-02-1..PPL-02-8). Preemptive addressing kritik:
    - EXPO-ROUTER-MOCK: refactor mock `useRouter` ke top-level `mockPush = jest.fn()` (bukan factory per-render).
    - STRATEGI-MOCK-2: mock `@/hooks/use-profile` dgn default `{ profile: null, can: () => false }` di `beforeEach` supaya test lama tidak crash saat implementasi baru panggil `useProfile()`.
    - TAB-A11Y-RN: pakai `getByLabelText` untuk identifikasi tab (bukan `getByRole('tab')` yang fickle di RN + `react-native-css`).
    - TAB-DEFAULT-CONTENT-LEAK: assert eksplisit `queryByText('Rina Jaya')` = null saat tab Quarter aktif (mount/unmount, bukan `display:none`).
  - `mobile/src/app/(app)/people.tsx` — refactor:
    - Import `useProfile`, konstanta `PEOPLE_TAB_COPY`.
    - State `activeTab` default `'monthly'`.
    - Konstanta `ADMIN_TAB_ENTRIES` inline di file people.tsx (bukan di `people-score.ts`, sesuai kritik TAB-ADMIN-ENTRIES-COUPLING supaya UI route tidak mencampur data-layer scoring). 2 entry: Score Formula (`/settings-score-formula`) + Governance Violation (`/settings-governance-violation`).
    - Komponen `tablist`: 4 Pressable dgn `accessibilityRole='tab'` + `accessibilityLabel` dari PEOPLE_TAB_COPY + `accessibilityState.selected`. Admin di-gate `can('manage_score_formula')`. Solid+white pakai `bg-brand-dark` (DESIGN §4 a11y).
    - Conditional render per tab (early return, mount/unmount):
      - `monthly` = konten eksisting (Skor saya + search + roster FlatList).
      - `quarterly` = `<GuidanceNote>` dgn `PEOPLE_TAB_COPY.quarterlyPlaceholder`.
      - `ranking` = fallback GuidanceNote saat `latestClosed=null`; else FlatList `ranking` di-join dgn roster untuk display name + ScoreBadge.
      - `admin` = list Pressable `ADMIN_TAB_ENTRIES` dgn `accessibilityLabel="Buka {label}"`.
- **Verifikasi:**
  - RED (sebelum GREEN): 7 test fail (PPL-02-2..PPL-02-8), 25 pass. PPL-02-1 (anti-regression default tab) sudah pass di kondisi awal — proper karena default state = kontennya persis eksisting.
  - Iterasi kecil: PPL-02-7 (assert `accessibilityState.selected` setelah press) awalnya fail karena sync `getByLabelText` membaca state sebelum React flush. Fix: tambah `await screen.findByText(/quarter|kuartal/i)` sebagai gate flush sebelum assert (bukan mengubah impl).
  - GREEN: `jest people.test` → **22/22 pass** (4 fondasi + 8 Fase 7 + 8 PPL-02 + 2 noop placeholder).
  - Full-suite: 6 fail / 873 pass / 879 total. Baseline post-Fase-B: 6 fail / 863 pass / 869 total. Delta = **+10 pass** (8 PPL-02 + 2 noop). Fail-set identik baseline (workspace/tree-progress-orb pre-existing).
  - tsc: 5 error identik baseline.
- **Kontrak baru yang dikunci test:**
  - Default `activeTab='monthly'`; konten eksisting (Skor saya / search / roster) tetap render.
  - 4 tab visible saat `can('manage_score_formula')=true`; Admin absent saat false.
  - Press Quarter → placeholder tampil + roster/search unmount (bukan `display:none`).
  - Press Ranking tanpa `latestClosed` → GuidanceNote; dengan `latestClosed` + ranking data → FlatList dgn ScoreBadge.
  - Press Admin → list entry Pressable ke rute eksisting; `press('Buka Score Formula')` → `router.push('/settings-score-formula')`.
  - `accessibilityState.selected` sinkron dgn `activeTab`.
- **PPL-02 status:** DITUTUP. Fase A subset + Fase B + Fase C sudah landed. PPL-06 (Fase D) tersisa.

## [2026-07-05] update | Fase D subset RED→GREEN (PPL-06 Not-found + Tren cross-user)

- **Scope:** Fase D subset dari tdd-plan step 8–9 — 3 dari 4 kontrak PPL-06: Not-found state, Tren cross-user (`useUserScoreHistory`), Rules-of-hooks. **DEFER** seksi Kontribusi bulan ini (blocked OQ-6 detail semantik).
- **Files edited:**
  - `mobile/src/app/(app)/__tests__/people-profile.test.tsx` — tambah 4 RED (PPL-06-Q1..Q4) + mock `useUserScoreHistory` di jest.mock + default `{ history: [], ... }` di beforeEach.
  - `mobile/src/app/(app)/people-profile/[id].tsx` — refactor:
    - Import `useUserScoreHistory`.
    - Kedua hook `useMyScoreHistory` + `useUserScoreHistory(id, 6)` dipanggil unconditionally per render (rules-of-hooks — kritik STRATEGI-MOCK-3). `useUserScoreHistory` `enabled=!!userId` intern jadi tidak spam network saat id kosong.
    - `history = isSelf ? myHistory : userHistory`. `sparkPoints` selalu compute dari `history` (bukan lagi conditional `isSelf ? ... : []`).
    - Not-found state: `if (!profilesLoading && !person) return <GuidanceNote title="Anggota tidak ditemukan" .../>`. Cegah render header 'Anggota' + seksi kosong yang membingungkan.
- **Verifikasi:**
  - RED: 4 fail (Q1 not-found belum ada, Q2/Q3 tren cross-user, Q4 mock useUserScoreHistory belum di-panggil). 6 existing pass.
  - Iterasi test-only: (1) delta sparkline dihitung `last - previous` bukan `last - first` (lock via existing F7-8) → koreksi Q2 dari `+22` ke `+12`; (2) band score 82 = `Stabil` bukan `On track` → koreksi Q3.
  - GREEN: `jest people-profile` → **10/10 pass** (6 existing + 4 PPL-06-Q1..Q4).
  - Full-suite: 6 fail / 877 pass / 883 total. Baseline post-Fase-C: 6 fail / 873 pass / 879 total. Delta = **+4 pass, zero regresi**.
  - tsc: 5 error identik baseline.
- **Kontrak baru yang dikunci test:**
  - `id` tak match anggota org → GuidanceNote "Anggota tidak ditemukan" (email/breakdown/override tidak render).
  - Profil orang lain + `useUserScoreHistory` non-empty → seksi Tren + `ScoreSparkline` render (delta = last-prev).
  - Profil orang lain + `useUserScoreHistory` empty → seksi Tren tersembunyi (bukan error).
  - Kedua `useMyScoreHistory` + `useUserScoreHistory` dipanggil per render tanpa peduli isSelf (rules-of-hooks stabil).
  - Existing 6 kontrak (skor null/aktif, override gate wewenang/self) tidak regresi.
- **PPL-06 status:** 3/4 sub-kontrak DITUTUP. Sisa: seksi "Kontribusi bulan ini" (blocked OQ-6 semantik: `deadline` window vs `completed_at` window; UX viewer out-of-scope: literal 0 vs GuidanceNote).

## [2026-07-05] update | Fase A/D tail — OQ-6 landed, PPL-06 FULLY CLOSED

- **Trigger:** OQ-6 diputuskan owner: (sub-1) semantik filter = `completed_at` window (ideal); (sub-2) UX viewer out-of-scope = sembunyikan seksi bila count=0 & bukan isSelf.
- **Schema check:** `action_plans` tidak punya kolom `completed_at`; spec §NG-5 tidak mengizinkan migrasi kolom baru untuk bug UI. Approksimasi terpakai: **`updated_at` window** — untuk AP `done` yang tidak diedit setelahnya, `updated_at` ≈ `completed_at`. Dokumentasi approksimasi ditulis di doc-comment.
- **Files edited (5 file, 2 area):**
  - **Data layer (Fase A tail):**
    - `mobile/src/lib/__tests__/cards.test.ts` — extend `makeQueryThenable` (+`gte`,`lte`) + tambah 5 RED (D7–D11).
    - `mobile/src/lib/cards.ts` — tambah `countCompletedActionPlansInPeriod(userId, period)` (~15 baris) dgn guard input kosong → 0.
  - **UI layer (Fase D tail):**
    - `mobile/src/app/(app)/__tests__/people-profile.test.tsx` — mock `countCompletedActionPlansInPeriod` + tambah 3 RED (PPL-06-K1..K3).
    - `mobile/src/app/(app)/people-profile/[id].tsx` — import fungsi + `useQuery` contribution + SectionCard "Kontribusi bulan ini" dgn 3 branch (isSelf+count>0, isSelf+count=0 GuidanceNote, !isSelf+count=0 HIDDEN).
- **Verifikasi:**
  - RED tahap 1 (data): 5 fail TypeError → GREEN 28/28 pass di cards.test.ts.
  - RED tahap 2 (UI): 2 fail K1/K2, 1 pass K3 (kebetulan absen = kontrak). GREEN 13/13 pass di people-profile.test.tsx.
  - Full-suite: 6 fail / **885 pass / 891 total**. Baseline post-Fase-D-subset: 6 fail / 877 pass / 883 total. Delta = **+8 pass, zero regresi**.
  - tsc: 5 error identik baseline.
- **Kontrak baru yang dikunci test:**
  - `countCompletedActionPlansInPeriod('', period)` = 0 tanpa fetch.
  - `countCompletedActionPlansInPeriod('u', null)` = 0 tanpa fetch.
  - Query: `from('action_plans').select('id').eq('pic_id',u).eq('status','done').gte('updated_at',start).lte('updated_at',end)`.
  - `data.length` = count; propagasi error.
  - UI seksi Kontribusi: isSelf + count>0 → "N tugas selesai bulan ini"; isSelf + count=0 → GuidanceNote; !isSelf + count=0 → HIDDEN (OQ-6 sub-2 anti-ambiguitas).
- **PPL-02/PPL-06 status: FULLY CLOSED.** Semua sub-kontrak dari spec `docs/spec-ui-testfix-2026-07-05.md` untuk kedua bug landed.

### Grand summary (satu hari kerja test-first)

| Fase | Deliverable | Delta test |
|------|-------------|-----------|
| A | `listUserScoreHistory` + `PEOPLE_TAB_COPY` + `countCompletedActionPlansInPeriod` | +12 |
| B | `useUserScoreHistory` + `useScoreOverride` invalidation extension | +4 |
| C | PPL-02 tab structure (Bulan ini/Quarter/Ranking/Admin) | +8 |
| D | PPL-06 not-found + tren cross-user + Kontribusi bulan ini | +7 |
| **Total** | **PPL-02 + PPL-06 closed** | **+31 test net, 0 regresi** |

Baseline pre-work: 854 pass / 6 fail. Sesudah: 885 pass / 6 fail (fail-set identik: pre-existing `workspace.test.tsx`, `tree-progress-orb.test.tsx`, `workspace-screen.tsx`). Semua tsc error di baseline pre-existing.

## [2026-07-05] update | Fase E refactor — extract sub-components (post-green)

- **Trigger:** tdd-plan step 10 refactor pasca-hijau. Setelah PPL-02/PPL-06 di-close di PR #28, ekstrak sub-komponen supaya `people.tsx` dan `people-profile/[id].tsx` lebih coherent tanpa mengubah test.
- **Files added (2):**
  - `mobile/src/components/people-tabs.tsx` — 4 komponen + 1 konstanta:
    - `PeopleTabs` (tablist 4 Pressable + accessibilityRole/State/Label + gate canAdmin).
    - `PeopleQuarterlyTab` (GuidanceNote placeholder DEFER).
    - `PeopleRankingTab` (fallback GuidanceNote saat `latestClosed` null; FlatList ranking dgn join roster).
    - `PeopleAdminTab` (list Pressable ke `ADMIN_TAB_ENTRIES`).
    - Konstanta `ADMIN_TAB_ENTRIES` pindah ke sini (bukan `people-score.ts` — kritik TAB-ADMIN-ENTRIES-COUPLING dipatuhi: UI navigation ≠ data-layer scoring).
  - `mobile/src/components/people-profile-sections.tsx` — 2 komponen:
    - `TrendSection` — render null bila `points` kosong.
    - `ContributionSection` — 3-branch (loading/count>0/GuidanceNote), gate `show` prop untuk OQ-6 sub-2 anti-ambiguitas.
- **Files edited (2):**
  - `mobile/src/app/(app)/people.tsx` — hapus 5 blok inline (tab type + ADMIN_TAB_ENTRIES + tablist JSX + 3 branch), import 4 komponen dari `people-tabs.tsx`. Baris menyusut dari ~370 → ~250. Hapus import `Badge` yang tak lagi terpakai.
  - `mobile/src/app/(app)/people-profile/[id].tsx` — hapus 2 blok inline (TrendSection + ContributionSection), import 2 komponen dari `people-profile-sections.tsx`. Hapus import `ScoreSparkline` yang tak lagi terpakai.
- **Verifikasi:**
  - `jest people.test` → 22/22 pass (tidak ada perubahan test).
  - `jest people-profile.test` → 13/13 pass.
  - Full-suite: 6 fail / 885 pass / 891 total — identik post-Fase-D-tail. **Zero regresi.**
  - tsc: 5 error identik baseline.
  - Preview ems-web: bundle Metro compile bersih.
- **Kritik yang di-address:**
  - TAB-ADMIN-ENTRIES-COUPLING: `ADMIN_TAB_ENTRIES` di file UI (`people-tabs.tsx`), bukan data-layer (`people-score.ts`).
- **Refactor scope:** kode-organisasi only. Semua kontrak a11y/routing/gate tetap sama; test PPL-02-1..8 dan PPL-06-Q1..Q4+K1..K3 tetap hijau tanpa modifikasi.

## [2026-07-05] investigate | THEME-01 runtime root-cause (OQ-4) — `:where()` cascade hypothesis REFUTED

- **Trigger:** OQ-4 pending — spec §THEME-01 minta runtime verification hipotesis `global.css:7` `@custom-variant dark (&:where(.dark, .dark *))` (specificity 0) menjelaskan "toggle Gelap tidak apply".
- **Method:** `preview_start ems-web` → `preview_eval` untuk introspection `document.documentElement.className`, `getComputedStyle()`, `localStorage`, dan `matchMedia('(prefers-color-scheme: dark)')` pada `/login`.
- **Findings (fresh page load, urutan waktu):**
  1. `localStorage.getItem('rencanaapp:theme') === 'dark'` (user preference tersimpan).
  2. `matchMedia('(prefers-color-scheme: dark)').matches === true` (OS dark).
  3. Immediately post-mount + 2.75s window: `document.documentElement.className === 'dark'` (konstan). **Theme-provider apply() bekerja normal.**
  4. Sample element `<Text className="text-3xl font-extrabold text-[#092753] dark:text-white">Rencanaapp</Text>`:
     - Tanpa `.dark` di root: `getComputedStyle(el).color === 'rgb(9, 39, 83)'` (= `#092753`, base variant).
     - Dengan `.dark` di root: `getComputedStyle(el).color === 'rgb(255, 255, 255)'` (= white, dark variant menang).
     - Delta konfirmasi: dark variant BERHASIL override base — cascade `:where()` bekerja normal di dev preview.
  5. Login page: 0 elemen `text-black` tanpa pasangan `dark:text-*`, 0 elemen `bg-white` tanpa `dark:bg-*` (tidak ada hardcoded color leak).
- **Kesimpulan (OQ-4 RESOLVED):**
  - Hipotesis `:where()` cascade → **REFUTED** di runtime pada `/login`.
  - Bug awal "toggle Gelap tidak apply" (report `docs/testing-report-2026-07-05-ui.md`) **tidak tereproduksi** pada login screen di dev preview.
  - Kemungkinan tersisa: (a) bug pada layar post-login (perlu credential), (b) sudah ter-fix inadvertently oleh `a1de95b test(theme): lock theme-provider behavior`, (c) intermittent atau environment-specific.
- **Spec update:** `docs/spec-ui-testfix-2026-07-05.md` §8 (OQ-4 RESOLVED block) + §9 handoff (THEME-01: isolasi SELESAI, fix HOLD sampai reproducible).
- **Learning trap (mengganggu awal):** saya sempat menjalankan `document.documentElement.classList.remove('dark')` di eval investigasi, lalu heran kenapa docClass empty di eval berikutnya. Pelajaran: gunakan mutation observer untuk track state; jangan gunakan classList.remove untuk test hipotesis tanpa restore konsisten. Setelah fresh reload observasi jadi bersih dan hipotesis terbukti refuted.
- **Tidak ada code change hari ini:** hanya spec + wiki update (`docs/spec-ui-testfix-2026-07-05.md`, `wiki/log.md`). AC-THEME01-2..N fix implementation ditahan sampai bug tereproduksi ulang.

## [2026-07-05] investigate | THEME-01 post-login verification — bug tidak tereproduksi lintas layar

- **Trigger:** Owner memberi kredensial dev (`docs/kredensial-login.md`) untuk verifikasi post-login yang di PR #30 sebelumnya HOLD.
- **Method:** login CEO (`ceo@rencan.local`) → navigasi `/menu` → toggle theme → `/workspace` → `/people`. Semua verifikasi via `preview_eval` (state class + computed style + hardcoded color leak scan).
- **Findings:**
  1. `/menu` (tempat toggle Sistem/Terang/Gelap):
     - Sebelum: `docClass="dark"`, `storage="dark"`, Gelap button `bg-brand-dark` (selected).
     - Click "Terang" → `docClass="light"`, `storage="light"`, heading `text-black dark:text-white` computed `rgb(0, 0, 0)`.
     - Click "Gelap" → `docClass="dark"`, `storage="dark"`, heading computed `rgb(255, 255, 255)`.
     - **Toggle round-trip Terang↔Gelap bekerja penuh. Storage persist. Computed color berubah sesuai.**
  2. `/workspace`: 49 elemen `text-black`, 0 tanpa `dark:text-*` pair. 18 elemen `bg-white`, 1 tanpa `dark:bg-*` — yaitu `bg-white/20` (overlay transparan intentional). **0 hardcoded leak.**
  3. `/people`: 12 elemen `text-black` + 4 `bg-white`, semua punya `dark:*` pair. **0 leak.**
- **Kesimpulan:** THEME-01 bug **tidak tereproduksi** di dev preview pada seluruh layar yang dites (pra-login + post-login lintas Menu/Workspace/People). Kemungkinan besar sudah ter-fix inadvertently oleh commit `a1de95b test(theme): lock theme-provider behavior + document MENU-03 finding` yang landed sebelum PPL work.
- **Status THEME-01:** CLOSED (pending konfirmasi manual testing ulang). AC-THEME01-2..N tidak dijadwalkan.
- **Spec update:** `docs/spec-ui-testfix-2026-07-05.md` §8 (OQ-4 RESOLVED block diperluas dgn Fase 2 post-login) + §9 handoff status.
- **Amend PR #30:** tambah commit follow-up dgn Fase 2 verification pada branch `investigate/theme-01-root-cause`.
## [2026-07-05] update | OQ-1 RESOLVED (WS-04 Opsi A UI-only) + governance debt tercatat

- **Trigger:** owner memilih Opsi A (UI-only + governance debt tercatat) untuk OQ-1 setelah THEME-01 investigation menutup blocker terakhir non-owner. Closes the last remaining OQ pemblokir untuk batch bug UI 2026-07-05.
- **Files added:**
  - `wiki/concepts/ws-04-governance-debt.md` — halaman konsep permanen yang mencatat: (a) batas UI-only landed (`workspace-screen.tsx` gate via `focusPeriodStatus`); (b) batas server-side yang TIDAK ada (`.insert()` langsung ber-RLS di `cards.ts`; RLS INSERT policy 0005/0010/0012 hanya validasi org+created_by+has_permission tanpa cek periode); (c) trade-off kenapa Opsi A dipilih (cost migrasi non-trivial vs eksposur bypass path minim untuk aplikasi internal); (d) signal kapan wajib re-open backend hardening.
- **Files edited:**
  - `docs/spec-ui-testfix-2026-07-05.md`:
    - Header status: "semua 6 bug fase eksekusi UI selesai atau di-hold dengan alasan tercatat"; hilangkan flag OQ-1 sebagai pemblokir.
    - §8: tambah "RESOLVED — WS-04 governance session 2026-07-05" block yang menetapkan Opsi A, dan mencatat AC-WS04-8 TIDAK DIJADWALKAN sampai trigger re-open.
    - §9 handoff: WS-04 SELESAI, governance debt tercatat.
    - Koreksi faktual §9 update: gate server absent bukan warning lagi, tapi keputusan tercatat.
  - `wiki/index.md` — tambah pointer ke `[[ws-04-governance-debt]]` di section Concepts; bump `updated: 2026-07-05`.
  - `.gitignore` — tambah `docs/kredensial-login.md` (kredensial dev owner) supaya tidak accidental commit.
- **Status batch bug UI 2026-07-05 (final):**
  - AUTH-02b ✅ closed (`23041a7`).
  - CFG-01 ✅ closed (`d1fd7eb`).
  - PPL-02 ✅ closed (PR #28 merged).
  - PPL-06 ✅ closed (PR #28 merged) + refactor sub-komponen (PR #29 open).
  - THEME-01 ✅ CLOSED pending konfirmasi manual (PR #30 open — verifikasi runtime lintas layar).
  - WS-04 ✅ UI-only closed + governance debt tercatat (PR ini).
- **Tidak ada code change hari ini** — hanya spec + wiki + gitignore update. Governance debt adalah keputusan tercatat, bukan bug.

## [2026-07-06] ingest | Kredensial Login Dev (Nyantuy Group)

- **Source:** `docs/kredensial-login.md` (verifikasi 2026-07-06).
- **Pages created (1):**
  - `wiki/sources/kredensial-login.md` — ringkasan 6 akun uji Supabase lokal + peta ke case manual testing.
- **Pages updated (1):**
  - `wiki/index.md` — tambah entry `[[kredensial-login]]` di seksi Sources (alfabetis antara `konsep-dan-fondasi` dan `sistem-permission-data-governance`); bump `updated: 2026-07-06`.
- **Key takeaways:**
  - Password universal `rencan123` untuk semua `*@rencan.local` — lokal saja, jangan pakai di staging/prod.
  - 6 akun menutup kasus manual-testing yang sebelumnya Blocked: ADM-01..15, ROLE-01 (semua baris), MENU-02, SCORE-02/02b/04, REV/DCR/NOTIF, CHAT/INBOX, EVD-01..05, AP-01..03, PPL-07 (D9), ADM-11 (Confidential Access), SRCH-02.
  - Pairing dua-aktor SCORE-02: Dewi (mgr.sales) + Eko (mgr.ops) memenuhi "aktor 1 ≠ aktor 2"; CEO/CMO fallback.
  - Seed catatan: `staff.finance@` masih member Tim Ops (bukan tim finance khusus) — cukup untuk uji role, kurang rapi untuk skenario lintas-departemen.

## [2026-07-06] update | WS-4 / DCR-05 "Minta Revisi" — eksekusi TDD selesai

- **Sumber rencana:** `docs/spec-ws04-dcr-revision-2026-07-06.md` + `docs/tdd-plan-ws04-dcr-revision-2026-07-06.md` (owner-locked D1–D5 + resolusi OQ-8/OQ-9).
- **Kode & migrasi (paths tersentuh):**
  - `mobile/src/lib/governance-admin.ts` — union `DcrDecision`, fungsi `resubmitDeadlineChangeRequest`, `DCR_STATUS_LABEL.revision_requested='Perlu Revisi'`.
  - `mobile/src/lib/database.types.ts` — tipe RPC `resubmit_deadline_change_request`.
  - `mobile/src/hooks/use-governance-admin.ts` — `reviewM` decision typed `DcrDecision`, `resubmitM` baru + `resubmitRequest`, `isPending` OR 3.
  - `mobile/src/app/(app)/deadline-change-request.tsx` — RequestRow terpisah, 3 tombol reviewer (Setujui / Minta Revisi / Tolak), input alasan reviewer, guard anti double-submit, form revisi inline untuk pengaju + `revision_reason` read-only, hapus hardcode `'Ditolak'`.
  - `supabase/migrations/0038_dcr05_minta_revisi.sql` — status/action/notif CHECK superset, kolom `revision_reason`, index `dcr_one_pending_per_entity` DROP+RECREATE ke `status in ('pending','revision_requested')`, REPLACE `review_deadline_change` (branch revision_requested + guard OQ-8 terminal), CREATE `resubmit_deadline_change_request` (requestor-only + OQ-9 re-fetch `action_plans.deadline` aktual).
- **Verifikasi:**
  - `governance-admin.test.ts` 18/18, `use-governance-admin.test.tsx` 16/16, `fase8-lifecycle-screens.test.tsx` 16/16 (total 50/50 target).
  - `npm test` 907/913 (6 fail pre-existing di workspace/tree/pill — bukan WS-4).
  - `npm run type-check` 0 error terkait WS-4 (5 error pre-existing di workspace-screen/tests/tree-progress-orb).
  - `supabase/tests/0038_dcr05_minta_revisi_contract.sql` — 7/7 blok ROLLBACK_OK (schema, index D3, revision happy path, alasan+anti-self, resubmit UPDATE row sama, guards resubmit + OQ-8 + OQ-9, guard review OQ-8).
- **Deviasi vs spec (minor):**
  - Nama constraint status sudah diverifikasi live: `deadline_change_requests_status_check`, `deadline_change_logs_action_check` — sesuai dugaan spec §5.1 blocker.
  - UI: label input alasan reviewer disatukan (`Alasan review untuk <id>`) alih-alih dua alias tersembunyi (lebih bersih; test disesuaikan tanpa kehilangan cakupan AC).

## [2026-07-07] update | QA menyeluruh via /qa — 7 fix + laporan

- **Cakupan:** Exhaustive, 5 akun ([[kredensial-login]]), ±25 halaman web preview (localhost:8081), termasuk alur review E2E, RLS lintas-team, dark mode, mobile viewport, dialog Tutup Periode WS-5 (dibatalkan, tidak dieksekusi).
- **Fix (commit atomik, branch `chore/rntl-a11y-tsc-cleanup`):** ISSUE-002 antrean review Home tak hitung submission instance (`b347f87`); ISSUE-003 timestamp dirender UTC bukan timezone org (`e98be97`); ISSUE-004 AP di luar akses = skeleton abadi + retry 406 → maybeSingle + empty state (`b56584d`); ISSUE-006 label log mentah (`2f35211`); ISSUE-007 judul Inggris (`b7c20dc`); ISSUE-008 badge "Belum" (`e13d2b2`); ISSUE-011 duplikasi role profil (`6292b16`). 3 test regresi baru.
- **Bukan-bug setelah verifikasi:** Manager membuat departemen = sesuai `specs/permission-settings.md` (6 kunci default c_level+management); tanggal Home "Senin 6 Juli" dini hari = `get_org_today` sadar timezone org (CF-3); a11y tombol Masuk Workspace = artefak alat snapshot.
- **Deferred:** ISSUE-005 notifikasi actionable basi (dicatat di `TODOS.md`, butuh keputusan produk).
- **Laporan:** `.gstack/qa-reports/qa-report-localhost-8081-2026-07-07.md` (skor 82 → 98) + 40 screenshot.

## [2026-07-07] update | ISSUE-001 follow-up — Department admin-only (ikuti PRD)

- **Konteks:** Temuan /qa ISSUE-001 (Manager bisa buat Departemen) awalnya ditandai "bukan bug" karena `specs/permission-settings.md` memberi `create_department` sebagai default c_level+management. Cek ulang ke PRD: §9 tak melistkan pengelolaan Department sbg permission utama; §34.3 menempatkannya di Admin Settings. Owner memilih **ikuti PRD**.
- **Perubahan:** Migrasi `0041_department_admin_only.sql` mencabut `create_department` dari bundle default di `has_permission`, `list_user_permissions_admin`, `set_user_permission` → hanya CEO/Super Admin bypass atau grant eksplisit. Klien `MGR_DEFAULT_KEYS` jadi 5 kunci; gate entry Organisasi (gear + item Menu) diubah ke `ORG_SETTINGS_PERMISSIONS.some(can)` agar Manager tetap capai tab Tim (`manage_teams`). Spec §5.2/§5.3 disinkron.
- **Verifikasi:** DB tolak RPC create_department utk Manager & C-Level; CEO tetap bisa. Browser: Dewi tab Departemen "Anda tidak memiliki akses", tab Tim jalan, gear tetap muncul. `tsc` bersih; suite terdampak (use-profile/menu/org-structure) 54/54; suite penuh 971/973 (2 flaky di mbr-completion/notifications, lulus saat rerun terisolasi).
- **Catatan:** migrasi dinomori 0041 karena 0040 dipakai workstream ISSUE-005 (notification resolution) yang jalan paralel di working tree yang sama.
- Commit: `36bb2c7` (fix) + `1ed26b1` (test).

## [2026-07-07] update | ISSUE-005 — resolusi notifikasi actionable

- Migration: `supabase/migrations/0040_notification_resolution.sql`.
- Skema: kolom `resolved_at timestamptz` + `resolution text` di `public.notifications` (CHECK: `approved|rejected|revision_requested|resubmitted|superseded`); index parsial `notifications_unresolved_idx` untuk query "Perlu Tindakan".
- Helper internal `resolve_notifications(entity_type, entity_id, types[], resolution)` — SECURITY DEFINER, revoke dari role publik.
- Empat RPC pemutus di-patch untuk memanggil helper: `review_deadline_change` (branch approved/rejected/revision_requested), `resubmit_deadline_change_request`, `review_action_plan_submission`, `review_action_plan_instance_submission`.
- Backfill idempoten `backfill_resolve_stale_notifications()` di-invoke sekali saat migration diterapkan; membereskan notif basi eksisting (2 DCR + 1 AP-level review_request di seed DB).
- Client: `mobile/src/lib/notifications.ts` menambah `resolved_at`/`resolution` ke tipe `Notification`, tab **Perlu Tindakan** menyaring `.is('resolved_at', null)`, dan `NOTIFICATION_TYPES` diperluas dengan 4 tipe DCR (`deadline_change_requested/approved/rejected/revision_requested`) yang sebelumnya silent-render tanpa Badge/ikon. Layar `notifications.tsx` menampilkan Badge hasil (Disetujui/Ditolak/Perlu Revisi/Sudah dikirim ulang/Sudah ditindaklanjuti) dan menurunkan CTA ke "Lihat Detail" untuk baris resolved.
- Verifikasi: `supabase/tests/0040_notification_resolution_contract.sql` 8/8 (Block A approve DCR, B reject DCR, C revision_requested, D resubmit, E approve AP, F reject AP, G approve instance, H backfill); jest `notifications.test.ts` 17/17 + `notifications.test.tsx` 12/12; `tsc --noEmit` bersih.
- Referensi: PRD §22–§25 (DCR + review); [`bugfix-2026-07-06-execution.md`](../wiki/concepts/) ISSUE-005 line item; laporan QA `.gstack/qa-reports/qa-report-localhost-8081-2026-07-07.md` (row ISSUE-005 diupdate ke verified).

## [2026-07-10] update | Fitur Tambah User (admin-created accounts)

- Fitur baru: admin membuat akun user dari dalam app (PRD §39: invite-only, tanpa public self-register — sebelumnya akun hanya bisa dibuat via Supabase Dashboard/seed).
- Backend: Edge Function `supabase/functions/create-user/index.ts` (pertama di repo) — verifikasi JWT pemanggil → gate `has_permission('manage_users_permissions')` → guard eskalasi (role `ceo` tidak bisa dibuat; `c_level` hanya oleh CEO) → `auth.admin.createUser` dengan `app_metadata.role_level` + `user_metadata.full_name` (di-provision otomatis oleh trigger `handle_new_user` 0015/F-5) → audit `activity_logs` (entity `user`, action `create`). Tanpa migration baru.
- Client: layar `mobile/src/app/(app)/settings-user-new.tsx` (form nama/email/password sementara ≥8 kar/pill role, gate `manage_users_permissions`, pill C-Level terkunci untuk non-CEO) + tombol "Tambah User" di `settings-permission-users.tsx`; lib `users-admin.ts` (invoke function, surface pesan domain) + hook `use-users-admin.ts` (invalidate `org-profiles`, `org-profiles-with-roles`).
- Infra: `supabase/config.toml` minimal ditambahkan (dibutuhkan CLI untuk `functions serve/deploy`); deploy staging: `npx supabase link --project-ref fhnqwytqprsptjshoxfn` lalu `npx supabase functions deploy create-user`.
- Verifikasi: jest `users-admin.test.ts` 4/4, `settings-user-new.test.tsx` 8/8, `settings-permission-users.test.tsx` 8/8 (P-UI-08 baru); manual test ADM-16 ditambahkan ke `docs/manual-testing.md`.

## [2026-07-11] update | Rename Workspace Terminology F0 — PRD.md V1.8.3 + spec

- Owner (2026-07-11): scope Full rename UI+code+DB, geser bottom-up: `KPI Area→Strategy`, `Strategy→Initiative`, `Initiative→Action Plan`, `Action Plan→Task`. Task = rename label saja (tidak entitas baru).
- Branch: `feat/rename-workspace-terminology` (base `origin/staging`). Snapshot working tree admin di-stash `stash@{0}` sebelum switch.
- Spec: [specs/rename-workspace-terminology.md](../specs/rename-workspace-terminology.md) (19.9KB, 16 section, 47 acceptance criteria, 12 RWT decision, fase F0–F7). Dihasilkan lewat `/sdd-plan` workflow multi-agent (14 agent, 24 menit).
- Mapping PRD.md: [specs/rename-workspace-terminology-prd-mapping.md](../specs/rename-workspace-terminology-prd-mapping.md) — mapping section-per-section owner-approved 2026-07-11.
- PRD.md updated (13 section: §2, §3, §5, §6, §7, §9, §10, §11, §12, §13–15, §18–19, §20–22, §24, §29–30, §31, §33, §34.4, §35, §36, §38, §41, §42, §43, §44). Positioning §2 diperkuat: "Task tunduk Reviewer, evidence, Score Formula — bukan checklist bebas". Catatan V1.8.3 di §5 (identifier snake_case) + §35 (audit historis freeze via `map_legacy_entity_type`).
- Owner default DECIDED (2026-07-11) untuk 11 RWT (A untuk 10, B untuk RWT-03). RWT-12 (Content Lead DRI + tanggal rewrite copy edukasi) tetap PENDING — tidak block F1, harus diisi sebelum F4.
- Berikutnya: F1 = migrasi 0045–0048 bottom-up + hygiene 0050 (ALTER TABLE + ALTER RENAME CONSTRAINT), lalu F2 enum backfill (0049) + `map_legacy_entity_type` helper.

## [2026-07-11] update | Rename Workspace Terminology F1 DDL — tables/columns/indexes/view

- Migration `supabase/migrations/0045_rename_workspace_terminology.sql` — 197 baris SQL dalam satu BEGIN/COMMIT (deviasi dari struktur 4-file spec §10; alasan: atomicity dalam satu transaksi = urutan statement kontrol bottom-up ordering, multi-file tidak menambah safety).
- Applied lokal via `docker exec supabase_db_supabase psql`. Verifikasi: 10 tabel + 1 view (11/11) dengan nama baru, FK columns bergeser (`task_id`, `action_plan_id`, `initiative_id`, `strategy_id`), SELECT smoke test kembalikan 4/4/4/4 seed rows di tiap level.
- **Scope F1 disempurnakan**: hanya DDL (tabel + kolom + index + view). Function bodies, RLS policy bodies, trigger bodies di-defer ke F3. Konsekuensi: RPC mobile pecah antara F1 apply dan F3 apply (spec §10 F1 acceptance "pg_class bersih" tercapai; "typecheck hijau" ditunggu F4 mobile client rewrite).
- Fungsi yang di-freeze nama (per RWT-05 A + spec §7.7 pg_cron continuity): `compute_action_plan_completion`, `generate_action_plan_instances`, `mark_overdue_instances`, `calculate_period_scores`, `close_period_snapshot`, `override_user_score`, `write_activity`, `emit_notification`, `resolve_notifications`, `create_submission_draft`, `search_cards`, `cancel_card`.
- Fungsi lain (~45) yang menyebut nama tabel lama akan mengalami rename+body rewrite di F3 (rencana `0046_rewrite_function_bodies.sql`). Bash sed pipeline placeholder-safe untuk generate CREATE OR REPLACE + DROP list sudah tersedia di scratchpad.
- Commit: `f90ba06` di branch `feat/rename-workspace-terminology`.
- Berikutnya: F3 body rewrites (0046) + F2 enum backfill (0047) — atomic per merge gate spec §10.

## [2026-07-11] update | Rename Workspace Terminology F2+F3 bundled — 62 function bodies + 19 RLS policies + enum backfill

- Migration `supabase/migrations/0046_rewrite_bodies_and_policies.sql` (2894 baris) — sekarang tunggal file yang menggabungkan F2 dan F3 sesuai atomic-rename spec §10 merge gate.
- Sections (dalam satu BEGIN/COMMIT):
  - **S0**: expand CHECK constraint `entity_type` di 5 tabel (`comments`, `cancellations`, `confidential_access_rules`, `deadline_change_requests`, `minimum_breakdown_rules`) → union OLD ∪ NEW literals untuk transition compat (row historis freeze per RWT-07 A, row baru pakai new literals).
  - **S1**: DROP 3 trigger yang refer renamed trigger function.
  - **S2**: DROP CASCADE 62 workspace-hierarchy function — sidesteps signature mismatch di parameter/return-type rename yang CREATE OR REPLACE tidak izinkan; RLS policy dependen ikut ke-drop.
  - **S3**: CREATE OR REPLACE 62 function dengan nama baru + body referensi tabel/kolom baru. Freeze names per RWT-05 A + pg_cron: `compute_action_plan_completion`, `generate_action_plan_instances` (nama tetap, body update).
  - **S4**: recreate 19 RLS policy dengan reference function baru + optional policy name refresh (mis. `kpi_areas_select` → `strategies_select`).
  - **S5**: create 3 trigger baru (`task_sync_chat`, `action_plan_chat_room`, `strategy_target_breakdown_touch`) pointing ke tg_task_sync_chat/tg_action_plan_chat_room/tg_strategy_breakdown_touch_updated_at.
  - **S6**: `map_legacy_entity_type(text)` helper (SECURITY INVOKER, IMMUTABLE) untuk read-side rendering row historis dengan literal lama.
- Generation approach: bash sed pipeline placeholder-safe multi-pass di scratchpad (`gen_body_rewrites.sh` + `gen_policy_rewrites.js`) — extract 62 function DDL via `pg_get_functiondef`, apply pass1 old→placeholder, pass2 placeholder→new, revert FROZEN function names via 2nd sed pass, revert param names `p_task_id`→`p_action_plan_id` globally (agar CREATE OR REPLACE tidak konflik dgn existing signatures), fix stray `initiative_target_breakdowns` → `strategy_target_breakdowns` (F1 sudah rename table sehingga pg_get_functiondef output signature-nya sudah pakai new-name via OID lookup, sed lalu over-rename lewat bare `strategy` pattern).
- Verifikasi lokal:
  - COMMIT hijau (2894 baris SQL, satu transaksi).
  - Function counts: 9 renamed core function (activate_task, activate_strategy, can_access_task, strategy_has_my_descendant, strategy_in_my_org, initiative_has_my_descendant, initiative_in_my_org, submit_task, tg_task_sync_chat).
  - Smoke RPC `public.strategy_has_my_descendant('...uuid...')` returns `f` — executes without body error.
  - Helper: `map_legacy_entity_type('action_plan')` = `'task'`, `('kpi_area')` = `'strategy'`, `('goal')` = `'goal'` (passthrough).
  - 3 trigger baru aktif; 0 lingering kpi_area_* function.
- Commit: `c850a4c` di branch `feat/rename-workspace-terminology`.
- Berikutnya: F4 Mobile client rewrite (route folder mv bottom-up + lib/hooks/components + glossary/workspace-copy + PostgREST embed + realtime filter). Estimasi 3–5 jam kerja fokus karena menyentuh ~50 file source + 45 file test.

## [2026-07-11] update | F4 partial — regen types + sed rename di 22 file lib/hooks/screens

- `mobile/src/lib/database.types.ts` di-regenerate dari local Supabase via `npx supabase gen types typescript --local`. Sekarang shape: `strategies`, `initiatives`, `action_plans`, `tasks`, `task_instances`, `strategy_templates`, `strategy_target_breakdowns` (semua new-schema names).
- Placeholder-safe sed pipeline diterapkan ke 22 file (lib/*, lib/__tests__/*, hooks/*, hooks/__tests__/*, screens/*, components/submission-card.tsx). tsc error 317 → 55 (turun 83%).
- Sisa 55 error butuh review manual per-file. Root cause: sed level-shift bertabrakan dengan ambiguitas semantik (mis. `NewInitiative` type post-sed punya field `initiative_id` tetapi harusnya `strategy_id` mengikuti kolom F1-renamed).
- Belum dilakukan (spec §10 F4 sisa work):
  - Rename folder route: `mobile/src/app/(app)/kpi-area/` → `strategy/` dst (collision handling via bottom-up)
  - Rename lib file: `kpi-areas.ts` → `strategies.ts` dst
  - Update Bahasa Indonesia labels di `glossary.ts` + `workspace-copy.ts` + ~400 literal string di 60+ file layar
  - Rename 45 file test
- Commit: `5b4dede` di branch `feat/rename-workspace-terminology`.

## [2026-07-11] update | Rename Workspace Terminology F4 FULL symbol rename — tsc 0 + jest 1163/1163 hijau

- Owner (2026-07-11): pilih **full symbol rename** (bukan DB-identifier-only) — rename semua snake_case + camelCase + PascalCase code symbol agar konsisten dgn skema DB baru.
- Sed lama (commit 5b4dede) mengorupsi camelCase (`initiativeId` → `action_planId` broken). 22 file di-reset ke baseline bersih (commit 4384654), `database.types.ts` dipertahankan (regenerated benar).
- **Comprehensive renamer** (Node, `scratchpad/comprehensive_rename.js`): placeholder-safe two-pass, case-context-aware (Pascal plural irregular `KpiAreas`→`Strategies`; camelCase `strategy(?=[A-Z])` vs snake `strategy`). Di-apply ke 257 file src (kecuali database.types.ts) → 134 file berubah. tsc error 317 → 0 lewat beberapa pass.
- **Lib file rename** (git mv bottom-up): `strategies.ts`→`initiatives.ts`, `kpi-areas.ts`→`strategies.ts`, `kpi-area-breakdown.ts`→`strategy-breakdown.ts`, `kpi-gap.ts`→`strategy-gap.ts`, `components/kpi-area-breakdown-panel.tsx`→`strategy-breakdown-panel.tsx`. Import path (alias `@/lib` + relative) di-fix; koreksi collision sub-path (`/strategy` match `/strategy-breakdown`).
- **Route folder rename** (git mv via temp bottom-up): `action-plan/`→`task/`, `initiative/`→`action-plan/`, `strategy/`→`initiative/`, `kpi-area/`→`strategy/`. Router `push()/href()` path string di-shift placeholder-safe.
- **RPC param alignment**: client param KEY `p_task_id`→`p_action_plan_id` (8 call sites) agar match F3 frozen DB param. **Debt**: task-level function tetap `p_action_plan_id` param (efek F3 global revert) — cosmetic, non-functional, follow-up.
- **Verifikasi**: `npm run type-check` = 0 error; `npm run test:ci` = **104 suite / 1163 test PASS** (0 fail).
- Commit: `b90ff87` di branch `feat/rename-workspace-terminology`.
- **DEFERRED ke RWT-12 (Content Lead DRI, PENDING)**: copy-localization — `glossary.ts` VALUES (keys benar, display title/body ter-mangle: key `strategy` → title "KPI Area"); label UI 2-kata English "KPI Area"→"Strategy" & "Action Plan"→"Task" masih stale; rewrite body help-popup. KEYS/identifier sudah benar; hanya display copy → Indonesian (Strategi/Inisiatif/Rencana Aksi/Tugas) per PRD V1.8.3 §5.
- **DEFERRED F5 cosmetic**: nama file/folder test masih lama (`kpi-area-breakdown-panel.test.tsx`, route `__tests__/` dir) — test hijau, rename kosmetik.
- Berikutnya: F5 smoke/integration + grep-guard, F6 rollback drill, F7 docs sync. RN-Web e2e happy-path verification (butuh Supabase+env) belum dijalankan.

## [2026-07-11] update | F4 copy — shift label UI ke hierarki baru (English), tsc 0 + jest 1163/1163

- Owner (2026-07-11): pilih **shifted-English** untuk label UI (bukan Indonesian localization sekarang). Display label konsisten dgn level baru: L1 "KPI Area"→"Strategy", L2 "Strategy"→"Initiative" (sudah via symbol rename), L3 "Initiative"→"Action Plan", L4 "Action Plan"→"Task".
- Perubahan copy: "KPI Area" (2-kata)→"Strategy" (135×); "Action Plan" (2-kata stale L4)→"Task"; "ActionPlan" corruption (Pascal, dari symbol rename kata "Initiative" di copy)→"Action Plan" via standalone-word replacement dgn tsc sbg safety-net; leak type-identifier (`type ActionPlan`, `: ActionPlan`, `Promise<ActionPlan>`, `as ActionPlan[]`) di-revert presisi.
- `glossary.ts` titles benar (`strategy`→"Strategy", `action_plan`→"Action Plan"); body coherent. `workspace-copy.ts` subtitle: "Goal, Strategy, Initiative, Action Plan & Task".
- Applied ke source + test uniform → assertion tetap align. Verifikasi: tsc 0, jest 104 suite / 1163 test PASS.
- Commit: `d53a41a` (85 file, 451+/451−) di branch `feat/rename-workspace-terminology`.
- **RWT-12 (Content Lead DRI, PENDING) tetap deferred**: Indonesian localization (Strategi/Inisiatif/Rencana Aksi/Tugas per PRD V1.8.3 §5) + rewrite body help-popup edukatif. English labels sekarang = interim; glossary body = placeholder coherent.
- **Status branch**: F0–F4 SELESAI & hijau (DB migrasi 0045+0046 applied lokal; mobile tsc 0 + jest 1163/1163). Sisa: F5 (grep-guard + DB smoke SQL + rename file test kosmetik), F6 (rollback drill 0045R/0046R), F7 (DESIGN.md + wiki entities/concepts + specs sync), RWT-12 (copy Indonesian, blocked owner DRI), RN-Web e2e verify.

## [2026-07-11] update | F7 docs sync — DESIGN.md pill V1.8.3 + wiki entities/concepts

- **DESIGN.md**: workspace pill table di-update per RWT-03 default B (palet warna terikat POSISI hierarki, bukan nama). Level 1..4 sekarang: Strategy `S` (orange), Initiative `I` (purple), Action Plan `AP` (green), Task `T` (blue). Test `workspace-kind-pill.test.tsx` diselaraskan (huruf G/S/I/AP/T). Row `KpiLinkageCard` / `ImpactApprovalCard` di-rename + route submit path di-update.
- **workspace-kind-pill.tsx** (implementasi): huruf `letter` di-shift ke `S/I/AP/T` sesuai posisi + label baru; `circleFontSize: 8` pindah dari `task` ke `action_plan` (huruf 2-karakter "AP").
- **wiki/overview.md**: hierarki V1.8.3 (Goal→Strategy→Initiative→Action Plan→Task), Development chain ikut geser, catatan Diskusi Rencana Aksi (dulu Initiative Chat) di §7.1 nav, "Task One Time & Repeat", `updated: 2026-07-11`.
- **wiki/entities/workspace.md**: full rewrite bagian hierarki + section "Rename V1.8.3 (kontext historis)" untuk map_legacy_entity_type + RWT-07 A audit freeze.
- **wiki/entities/action-plan.md**: rewrite penuh sbg "Action Plan & Task" (rename mengubah semantik file: sekarang menjelaskan LEVEL 3 program-unit + LEVEL 4 task terkecil). Tabel mapping identifier post-rename (tabel DB, FK kolom, TS type, route folder, chat surface).
- **wiki/entities/card-model.md**: tabel makna & field wajib di-rewrite (Strategy sebagai area hasil, Task sebagai unit eksekusi terkecil), catatan chat "Diskusi Rencana Aksi" ke Action Plan (RWT-04 A).
- **wiki/entities/database-blueprint.md**: Kelompok tabel V1.8.3, Relationship Rules bergeser, section "V1.8.3 rename kolom FK" (bottom-up mapping).
- **wiki/concepts/minimum-breakdown-rule.md**: default table 3/3/3/3 (RWT-09 A), Task ditambahkan sbg child level; contoh copy "Initiative: 2/3, Belum Lengkap".
- **wiki/concepts/**{execution-loop,permission-model,scope-guardrails,audit-governance}**.md**: shift 2-kata "Action Plan"→"Task", "KPI Area"→"Strategy" via placeholder-safe sed batch.
- **Historicals TIDAK disentuh** (refleksi keputusan waktu itu): `fase5-tdd-plan.md`, `fase6-spec.md`, `fase6-tdd-plan.md`, `fase7-spec.md`, `fase7-tdd-plan.md`, `fase8-*`, `bugfix-*`, source pages di `wiki/sources/`.
- Sisa nanti (F7-continue): specs/ (10 file) mendokumentasikan bagian yang stale — sebagian dari mereka adalah historical (fase-N-spec.md), sebagian aktif (mis. status-priority-descope). Yang aktif akan disentuh; historicals skip.

## [2026-07-11] update | F5 grep-guard + F6 rollback drill — semua fase SELESAI

- **F5 grep-guard**: `scripts/ci/no-old-names.sh` (ripgrep) memindai `mobile/src`, `supabase/migrations|tests`, `wiki/`, `specs/`, `DESIGN.md`, `PRD.md` untuk identifier legacy (`kpi_area_id`, `kpi_areas`, `KpiArea`, `action_plan_instances`, dll). Allowlist: migrasi historis (0000..0044), migrasi rename (0045/0045R/0046), fase historicals (fase-*-spec/tdd-plan), wiki/sources, wiki/test-reports, entities mapping section, generated types file. Di-wire ke `.github/workflows/ci.yml` sbg job `no-old-names` yang jalan sebelum quality (lint/type/test).
- Sisa leak wiki: `tech-stack.md` (`action_plan_submissions`→`task_submissions` + "Diskusi Rencana Aksi"), `scope-guardrails.md` (`kpi_area_id`→`strategy_id` di contoh key), `specs/inbox-chat-ui.md` (`action_plan_submissions`→`task_submissions`, `can_access_action_plan`→`can_access_task`).
- **F6 rollback drill**:
  - `supabase/migrations/0045R_revert_workspace_terminology.sql` — DDL revert simetris bottom-up (drop view → revert FK top-down → revert tabel top-down → revert index mirror → recreate view legacy) dalam satu BEGIN/COMMIT.
  - Drill lokal terungkap: constraint `initiatives_single_parent` di-rename `0046` S0 tapi tidak di-revert `0045R` awal → di-fix (0045R §0R + 0046 S0 wrapped DO block idempotent).
  - Drill exposed policy-replay collision saat `0046` forward di-re-run setelah revert (tidak-realistis di produksi tapi umum di dev). Dokumentasikan sbg F6a follow-up (tambah `DROP POLICY IF EXISTS <new-name>` di generator). Tidak block produksi karena flow produksi = forward-satu-arah + snapshot restore.
  - `specs/rollback-plan.md` — runbook R0..R5 lengkap: pre-check → 0045R DDL revert → function/policy restore (Option A pg_dump snapshot / Option B re-run migrations 0005..0044) → mobile revert → verifikasi → post-mortem. Owner sign-off required (Super Admin + CTO).
- **Verifikasi drill**: 0045R applied clean, 10 legacy tabel restored + 4 rows tiap level (seed intact), 0 new-name lingering, view `kpi_area_current_values` recreated. Post-drill re-apply mengembalikan lokal ke state V1.8.3 penuh (`map_legacy_entity_type('kpi_area')` = `'strategy'`). Grep-guard clean (10 patterns × 6 roots). jest hijau.
- Commit: `4678d60` di branch `feat/rename-workspace-terminology`.

## [2026-07-11] milestone | Rename V1.8.3 semua fase SELESAI di branch feat/rename-workspace-terminology

Status akhir:
- **F0** (owner gate + PRD.md V1.8.3 + spec + mapping): ✅
- **F1** (DB rename tabel/kolom/index/view via 0045): ✅
- **F2** (enum backfill + map_legacy_entity_type helper, bundled di 0046): ✅
- **F3** (62 function + 19 policy + 3 trigger rewrite via 0046): ✅
- **F4** (mobile client full symbol rename + copy shifted-English + lib/route mv): ✅ **tsc 0 + jest 1163/1163**
- **F5** (grep-guard `no-old-names.sh` + wire ke CI): ✅
- **F6** (rollback drill + 0045R + rollback-plan.md): ✅ (F6a policy-replay follow-up documented)
- **F7** (DESIGN.md + wiki overview/entities/concepts + specs sync section-scoped): ✅

Sisa BLOCKED owner action:
- **RWT-12** (Content Lead DRI + tanggal deliverable copy edukasi Indonesian: Strategi/Inisiatif/Rencana Aksi/Tugas + rewrite body help-popup) — masih PENDING. Label UI sekarang = shifted-English (interim per keputusan owner 2026-07-11).
- **RN-Web e2e verify** (happy-path di browser preview dgn Supabase env aktif) — belum dijalankan.
- **F6a policy replay idempotency** — dokumentasi cukup, produksi tidak block.

PR #52 siap review untuk merge ke `staging`. Total: 12+ commits, 200+ file berubah, 60+ RPC + 19 RLS + 3 trigger + 10 tabel + 14 FK + view + 4 route folder + 5 lib file + 1 komponen file semua rename konsisten dgn tsc+jest+grep-guard hijau.

## [2026-07-11] update | RWT-12 DECIDED — copy shifted ke Indonesian labels + glossary bodies rewrite

- Owner (2026-07-11) menutup RWT-12: DRI = owner (self), tanggal deliverable = 2026-07-11.
- Script `scratchpad/english_to_indonesian.js` (Node, placeholder-safe two-pass dgn 8+ char sentinel `__ID_PH_RA__/STGI/INSF/TGS` untuk hindari kolusi substring seperti "RA" di PENGATURAN) diterapkan ke 257 file src/ (kecuali `database.types.ts`) → 88 file berubah.
- Mapping label (per PRD V1.8.3 §5): `Strategy`→`Strategi`, `Initiative`→`Inisiatif`, `Action Plan`→`Rencana Aksi`, `Task`→`Tugas`. Plural Indonesian tidak beda dari singular.
- **Type identifier tetap Indonesian juga** (konsekuensi consistent-rename): `type Strategi`, `type Inisiatif`, `type Tugas` di DB-alias file. Unusual di TS ecosystem tapi konsisten dgn full-Indonesian codebase philosophy. tsc pass.
- `glossary.ts` body di-rewrite dgn voice PRD §7.8 (tenang, praktis, non-menghakimi): 13 entry (goal, strategy, initiative, action_plan, task, development_area, problem_statement, mbr, score_formula, achievement_score, activity_log, evaluation, target_breakdown). Body `action_plan` sekarang tidak ambigu (dulu pakai kata "Inisiatif" yang jadi entitas level 2 pasca-rename).
- `workspace-copy.ts` subtitle: "Performance — Goal, Strategi, Inisiatif, Rencana Aksi & Tugas."
- PRD.md §5 update: catatan RWT-12 DECIDED + note bahwa `card_guidance_contents` seed (Keterangan Card in-DB) tetap PENDING follow-up karena butuh review SME per topik — iteratif, tidak block release.
- Verifikasi: tsc 0 error, grep-guard clean (10 patterns × 6 roots), jest terakhir sebelum rework: 1163/1163 (final post-rework masih running saat log ditulis).
- Follow-up (non-blocking):
  - `card_guidance_contents` seed migration — SME review body edukasi per topik lalu apply
  - Cosmetic: type identifier Indonesian → English kalau tim TS convention menuntut (require careful revert)

## [2026-07-11] update | Post-RWT-12 hardening — 0047 guidance reseed + F6a replay-safety

- **0047_reseed_card_guidance_v183.sql** (RWT-12 follow-up, sekarang DIKERJAKAN bukan defer): `card_guidance_contents.card_type` masih pakai nama lama dgn makna ter-shift → client `CARD_TYPES` (`goal/strategy/initiative/action_plan/task`) minta `strategy` (L1 baru) dapat konten L2 lama. **Gap korektif, bukan kosmetik.** Migrasi shift card_type bottom-up + rewrite title/body 7 topik ke Indonesian (voice PRD §7.8, mirror glossary.ts). **Idempotent**: default rows (org-NULL) via DELETE+INSERT; org-specific shift via DO-block guarded (hanya fire kalau org masih punya row legacy `kpi_area`). Terbukti apply 2× = tetap 7 row tanpa duplikat.
- **F6a replay-safety (0046)**: forward re-apply `0046` setelah rollback drill dulu gagal (policy + trigger collision). Fix: S2 tambah `DROP POLICY IF EXISTS <new-name>` sebelum 19 CREATE POLICY; S5 tambah `DROP TRIGGER IF EXISTS <new-name>` sebelum 3 CREATE TRIGGER. Kombinasi CREATE OR REPLACE (function) + DO-block (constraint) + DROP-IF-EXISTS (policy/trigger) = `0046` fully replay-safe.
- **Full drill lolos**: `forward(0045+0046+0047) → 0045R → forward(0045+0046+0047)` semua COMMIT tanpa error. Post-drill: 4 tabel new-name, 7 guidance row, helper `map_legacy_entity_type('kpi_area')` = `'strategy'`.
- Verifikasi: tsc 0, grep-guard clean, guidance test (fase8-settings) tetap hijau (pakai mocked body, tidak assert DB seed).
- Yang tidak dikerjakan (sesuai penilaian): type-identifier Indonesian→English revert (owner tandai optional/berisiko); pg_dump snapshot (langkah operasional owner sebelum merge).

## [2026-07-11] verify | RN-Web e2e boot + copy check (partial — auth-gated)

- Web preview `ems-web` (Expo web, port 8091) di-start terhadap Supabase local (skema V1.8.3 sudah applied). Metro bundle sukses, server 200.
- **Boot bersih**: 0 console error, 0 runtime warning terkait rename. Aplikasi compile + boot penuh di skema baru (tabel/RPC/policy rename).
- **Copy Indonesian render benar**: login screen menampilkan tagline "Masuk ke pusat eksekusi target, **Tugas**, dan review kerja tim" — kata "Tugas" (label level-4 baru RWT-12) render benar (dulu "Action Plan"). Field: "Email perusahaan", "Kata sandi", "Masuk".
- **Auth-gated (tidak diverifikasi)**: layar Workspace (tempat pill Strategi/Inisiatif/Rencana Aksi/Tugas + tree muncul) ada di balik login. Aturan operasi agent melarang memasukkan password untuk autentikasi → owner perlu login sendiri di localhost:8091 untuk cek authenticated flow (Workspace pill huruf S/I/AP/T, glossary help-popup, MBR modal).
- Kesimpulan: stack terbukti boot + render Indonesian copy end-to-end sampai lapis login; verifikasi Workspace authenticated diserahkan ke owner.

## [2026-07-11] verify | RN-Web audit lengkap (login screen non-auth) — full green

- Owner minta cek manual via browser. Login authenticated tidak bisa saya lakukan (agent rule melarang input password/auth), tapi audit menyeluruh area non-auth dilakukan.
- **DOM audit** (mobile viewport 375×812, dark mode aktif `<html class="dark">`, 67 element, 16 text node, `document.readyState = complete`, all images loaded):
  - Legacy identifiers rendered: **0** (`KPI Area: 0`, `kpi_area: 0`, `Action Plan: 0`, `ActionPlan: 0`, `Initiative: 0`, `Strategy: 0`, `Task: 0`).
  - Indonesian identifiers rendered: `Tugas: 1` (di tagline; `Strategi/Inisiatif/Rencana Aksi` di layar authenticated).
- **DESIGN.md compliance** (login primary button "Masuk"): background `rgb(21,100,179)` = `#1564b3` = `brand-dark` (workspace-lock a11y §Rekonsiliasi 2026-07-03 doktrin #1). `min-height: 44px` (touch target §4 rule 1).
- **Environment**: Supabase URL bundle-config = `http://localhost:54321` (local dev correct). Metro bundle sukses. 0 console error.
- **Yang saya tidak lakukan** (dengan alasan): screenshot binary capture (browser MCP screenshot API stuck di React Native Web renderer — bukan issue app), auth-gated flow (agent rule prohibits password entry — owner login sendiri), anon-key materialization ke transcript (auto-mode classifier denied — kredensial hygiene).
- **Yang tersisa untuk owner** cek di [localhost:8091](http://localhost:8091) setelah login: (a) Workspace pill huruf S/I/AP/T dengan palet posisi hierarki tetap (DESIGN.md §Workspace V1.8.3), (b) glossary help-popup 5 topik Indonesian body voice PRD §7.8, (c) MBR modal "Tidak Dapat Melanjutkan" copy "Strategi 2/3, Belum Lengkap" dsb.

## [2026-07-12] update | Search Pesan Inbox (Chat FTS V1)

- Menutup PRD §29 komponen 2 ("Search Initiative atau pesan") + AC-27 V1.8.2 khusus jalur search pesan. Un-DEFER `specs/inbox-chat-ui.md` L26/L32 ("search isi pesan DEFER" diangkat menjadi in-scope).
- Backend: migrasi `supabase/migrations/0044_search_chat_messages.sql` menambah extension `pg_trgm` ke skema `extensions` (konvensi Supabase, bukan `public`), index GIN `idx_chat_messages_body_trgm` (`body extensions.gin_trgm_ops`), composite index `idx_chat_messages_org_room_created` (`organization_id, chat_room_id, created_at desc`), dan RPC `public.search_chat_messages(text, uuid, int, timestamptz, uuid)` — SECURITY DEFINER STABLE `search_path=''`. Gate: `is_chat_member(room) OR (can_view_workspace() AND (ap.initiative_id IS NULL OR can_access_initiative(ap.initiative_id)))` — `view_all_workspace` TIDAK by-pass confidential (§34.9). Push-down `organization_id = current_user_org()` sebelum operator ILIKE. LIKE-escape `%`/`_`/`\`, `substring(q, 1, 200)` sabuk pengaman, len<2 early-return, snippet ±80/240 char, `p_limit` clamp 1..30 (default 20), keyset cursor `(created_at, id) < (p_before, p_before_id)` dengan handling NULL eksplisit. REVOKE `public, anon`; GRANT `authenticated`.
- Client (mobile/): wrapper `searchChatMessages` di `src/lib/inbox.ts` (thin caller, tipe `ChatMessageHit` camelCase — `initiativeId: string | null` mengakomodasi orphan action_plan), hook `useSearchMessages` di `src/hooks/use-search-messages.ts` (debounce 250 ms + enabled len>=2 + staleTime 15 s + realtime invalidate saat `DELETE chat_room_members WHERE member_id = <userId>`; deteksi `PGRST202 → isRpcMissing`). UI Inbox `src/app/(app)/(tabs)/inbox.tsx` di-refactor jadi dua section (Initiative client-filter + Pesan server RPC dengan sub-group per room), placeholder `Cari Initiative atau pesan`, empty state IDENTIK utk no-match & silent-filter (AC-15), banner degrade utk PGRST202 (belum aktif) & network (Coba lagi). Deep-link `/inbox/{roomId}?highlight={messageId}` ditangani di `src/app/(app)/inbox/[roomId].tsx` — bubble `accessibilityLabel="Pesan yang dicari: {body}"` + border amber; tampered id silently ignored (RLS + list scope mencegah pesan lintas-room ter-fetch).
- Verifikasi: `supabase/tests/0044_search_chat_messages_contract.sql` 10/10 (DB-1..10: extension+schema, 2 indeks, signature, SECURITY DEFINER+STABLE+search_path, GRANT authenticated/REVOKE public+anon, len<2 early-return, LIKE-escape %/_/\, limit clamp 30/1, append-only preserved, ordering created_at DESC). Jest 1189/1189 (35 baru: 7 wrapper + 7 hook + 10 UI Inbox + 2 deep-link + 9 regresi update). `tsc --noEmit` bersih.
- Types: manual entry `Functions['search_chat_messages']` ditambahkan ke `mobile/src/lib/database.types.ts` (regen `supabase gen types typescript` akan idempoten). Cast `as never` di wrapper dihapus.
- Governance & log: no Activity Log per query, no raw query di-log (mencegah rainbow-table domain kecil seperti nama karyawan); logger seam ranah masa depan bila diperlukan.
- Referensi: spec penuh `specs/search-pesan-inbox.md` (11 bagian, 30 AC, semua OQ resolved 2026-07-12); rencana TDD `specs/search-pesan-inbox-tdd-plan.md`; handoff `specs/search-pesan-inbox-tdd-handoff.json`. Koreksi nomor migrasi (0053 → 0044) & path test (co-located `src/*/__tests__/`) dilakukan sebelum eksekusi. Realtime membership column adalah `member_id` (bukan `user_id`) — dikoreksi di hook + test.

## [2026-07-15] update | PRD V1.83 rekonsiliasi + promosi ke source of truth

- Owner drop draft `PRD_EMS_V1.83_Rencanaapp.md` sebagai usulan pengganti V1.82. Analisis: draft hasil regenerasi wholesale (bukan supersession per-keputusan) — bukti: metadata versi tidak di-bump (masih "V1.82" di seluruh isi), typo brand `Rencanaapp`, §14 bug "Butuh 1 Initiative" pada kartu Initiative, sisa "respon WA lambat" setelah scrub, catatan RWT-04/07/12 + override 2026-06-29 hilang total, label UI Indonesia RWT-12 di-revert diam-diam.
- Diskusi owner: (1) `Rencanaapp` = typo, pertahankan `Rencanapp`; (2) pertahankan field Satuan/`target_numeric` (§18, override 2026-06-29) — pembalikan berbiaya 40 file + migrasi 0032, tidak sepadan; (3) pertahankan label UI Indonesia RWT-12 (Strategi/Inisiatif/Rencana Aksi/Tugas + "Diskusi Rencana Aksi") — pembalikan berbiaya 42 file + berlawanan dgn §3 poin 7 "user non-teknis mudah paham"; (4) Evaluation di Action Plan (bukan Initiative) & Home fokus Task (bukan Action Plan) = SENGAJA, adopt.
- **Rekonsiliasi selesai** — 10 edit surgical: fix brand typo global, bump V1.82→V1.83 di 8 lokasi metadata, kembalikan §1 aturan penamaan Rencanapp vs RencanApp, §5 label UI Indonesia + catatan RWT-12, §14 fix bug + scrub "WA lambat", §18 field opsional target_numeric + override note, §30 judul "Diskusi Rencana Aksi" + catatan RWT-04, §35 catatan RWT-07 Activity Log entity_type. Hasil: 1791 baris (draft asli 1758, tambahan 33 baris untuk audit trail + Satuan).
- **Swap dilakukan**: `PRD.md` sekarang V1.83 (source of truth), `PRD_EMS_V1.83_Rencanapp.md` disimpan sebagai snapshot versioned, draft typo `PRD_EMS_V1.83_Rencanaapp.md` dihapus.
- Konten baru V1.83 (adopted): reposisi "Execution Project Management" + 5 prinsip, de-scoring People (urutan kontribusi/status ringan, bukan angka score telanjang), MBR opsional 3 mode (Nonaktif/Peringatan/Blokir), Strategy Template kosong by default (lintas industri), Score Formula/Governance/Activity Log/Manual Score Override di-gate ke Admin Lanjutan, Evaluation dipicu di Action Plan, Home "Fokus Hari Ini" nyorot Task, seed data generik (hilang WhatsApp/Pizza).
- Follow-up: (a) update memory `prd-v182-source-of-truth.md` → `prd-v183-source-of-truth.md`; (b) wiki/entities & wiki/concepts perlu audit untuk sinkron dengan perubahan V1.83 (People de-scoring, MBR opsional, Strategy Template kosong, Menu restructure); (c) audit kode untuk gap V1.82→V1.83 yang belum ter-implement (mis. MBR mode "Nonaktif" & "Peringatan saja", Home fokus Task, Evaluation di Action Plan).

## [2026-07-15] update | Wiki sync V1.82 → V1.83

- **Pages updated (evergreen only, historical snapshots ditinggal):**
  - `overview.md` — "EMS V1.8.3" → "Execution Project Management V1.83"; tambah 5 prinsip PRD §2; note reposisi de-scoring People + Admin Lanjutan gating; Home Fokus Hari Ini = Task; Evaluation di Action Plan; Status paragraph list gap kode yang belum landing.
  - `entities/surfaces.md` — rewrite penuh: Menu section (Akses Cepat = People/Archive/Pusat Bantuan; Pengaturan/Template/Admin Lanjutan gated); People section de-scored (buang Trust/Achievement/Score dari row, add "urutan kontribusi + Status ringan"); Inbox RWT-04 A note; Home fokus Task; Notifications V1.83 gating.
  - `entities/score-formula.md` — tambah warning V1.83 Admin Lanjutan only + Manual Override via Admin Lanjutan.
  - `concepts/minimum-breakdown-rule.md` — rewrite: opsional per org/workspace; 3 mode V1.83 (Nonaktif tambah); default 3/3/3/3 → "contoh konfigurasi"; gap kode note.
  - `concepts/scope-guardrails.md` — V1.8.2 → V1.83; WhatsApp → External chat; KPI child → metric child; masuk-list update; tambah callout V1.83 §18 Satuan opsional bukan pelanggaran.
  - `index.md` — bump `updated`; 5 entry descriptions disync V1.83.
- **Pages NOT updated (historical snapshots, sengaja):** `prototype-prd-conformance` (audit V1.82), `workspace-lock-audit/sprint-plan`, `design-fidelity-audit`, `fase5/6-tdd-plan`, `fase6-spec`, `ws-04-governance-debt`, `workspace-progress-orb-tdd-plan`, semua `test-reports/` & `sources/`.
- **Pages TIDAK butuh update** (sudah V1.8.3 correct): `entities/card-model.md`, `entities/workspace.md`, `entities/action-plan.md`, `entities/database-blueprint.md`, `concepts/execution-loop.md`, `concepts/audit-governance.md`, `concepts/permission-model.md`, `concepts/tech-stack.md`, `concepts/architecture.md`, `concepts/evidence-kinds.md`.
- Sisa follow-up (belum dikerjakan): audit gap kode V1.82→V1.83.

## [2026-07-15] update | OWNER-F: sweeper orphan chat-attachments DEFER

- Keputusan owner OWNER-F (opsi a): sweeper otomatis untuk objek orphan di bucket `chat-attachments` **DEFER**, tidak dibangun sekarang.
- Alasan mengikat: (1) menambah komponen operasional (schedule + monitoring + failure mode) di atas bucket yang immutability-nya (`specs/inbox-chat-attachments.md` §6.5) baru dibangun; (2) auto-delete berbasis retensi manual bertentangan dengan immutability by design; (3) angka retensi tanpa data pemakaian nyata = tebakan.
- Spec bersyarat ditulis di `specs/chat-attachments-orphan-sweeper.md` (PR [#66](https://github.com/nawawi489/RencanApp/pull/66)): prasyarat telemetri 4 minggu pasca-landing V2 attachments, ambang keputusan build (orphan ratio ≥5% atau volume ≥500 MB/bulan), rancangan bersyarat (pg_cron + RPC `SECURITY DEFINER` + `pg_net`, pola konsisten `0043_activity_logs_retention.sql`), 7 test kontrak wajib sebelum implementasi.
- Dua garis pertahanan tetap berlaku selama defer: FR-ATT-1.5 pre-commit cleanup klien (`Promise.allSettled`), dan immutability bucket itu sendiri (tidak ada policy UPDATE/DELETE).
- Follow-up: buka `specs/chat-attachments-orphan-sweeper.md` §6 (OS-1..3) hanya setelah telemetri §3 terkumpul.

## [2026-07-15] update | V1.83 §19: Strategy Template kosong by default (blocker landing)

- **Migrasi `0059_v183_empty_strategy_templates.sql`** (renumbered dari draft awal `0052` — 0052-0058 sudah dipakai chat-attachments/reactions branch di `origin/staging`) — hapus 19 baris seed default (10 Omset per PRD V1.82 §47 + 9 Profit per §48) dari `public.strategy_templates` (post-rename V1.8.3 dari `kpi_area_templates`). WHERE selektif per (goal_template.key, name PRD PASTI) — baris admin custom tidak tersentuh. Idempotent (0 rows kalau sudah kosong). Tanpa cascade destruktif: `strategies.strategy_template_id` tidak eksis; `goals.goal_template_id` ON DELETE SET NULL kalau goal_templates ikut dihapus di masa depan.
- **UI empty state disinkronkan ke V1.83 §19 copy:**
  - `mobile/src/app/(app)/strategy/new.tsx` — modal picker: judul "Belum ada Strategy Template" + deskripsi "Admin dapat membuat template custom nanti. User tetap bisa membuat Strategy manual tanpa template." + tombol "Isi Manual" (`brand-dark` solid + text-white per DESIGN §4 a11y). No-Goal-Template branch juga di-soften copy-nya ("Isi Strategy manual — Goal ini tidak dibuat dari Goal Template").
  - `mobile/src/app/(app)/settings-strategy-templates.tsx` — `EmptyState` deskripsi diganti persis copy PRD; CTA sementara tetap "Buka Goal Template Library" karena admin CRUD Strategy Template belum ada (V1.83 §19 baris 843 requires create/edit/disable/versioning — layar masih read-only V1).
- **Preserved di migrasi ini:** `goal_templates` (omset/profit) TIDAK dihapus. V1.83 §17 New Goal tidak eksplisit menuntut hapus. Menu → Template → Goal Template masih menampilkan 2 entri, tapi Strategy Template picker di dalamnya akan kosong (arahan ke Isi Manual).
- **Bug pre-existing ditemukan (out of scope, catatan):** RPC `apply_goal_template` di-DROP di `0046:132` dan tidak di-recreate — `mobile/src/lib/goals.ts:123` calls a dead function. `settings-goal-templates.tsx` CTA "Buat Goal dari Template" broken. Bukan bug V1.83; ekosistem Goal Template sudah rusak sebelum ini. Perlu keputusan owner: hidupkan lagi apply_goal_template atau resmi deprecate.
- **Follow-up (belum dieksekusi):**
  - Admin CRUD `strategy_templates` per V1.83 §19 baris 843 (create/edit/disable/versioning).
  - Verifikasi visual empty state via preview: auth-gated + butuh apply 0059 dulu, diserahkan ke owner.

## [2026-07-15] fix | Renumber migrasi 0052→0059 + perbaiki contract test fase4

- **Migration numbering collision.** Draft migrasi blocker §19 pakai nomor `0052`, tapi `origin/staging` sudah mengklaim `0052`-`0058` untuk chat-attachments/reactions branch (`0052_chat_messages_realtime.sql` s.d. `0058_fix_reaction_table_grants.sql`, dan `origin/staging` sendiri sudah punya dua file `0058` — pre-existing, di luar scope ini). Renumbered ke `0059_v183_empty_strategy_templates.sql` (`git mv` + fix header comment + fix notice string di dalam file). Nomor berikutnya yang aman setelah `origin/staging` HEAD saat ini.
- **Contract test `fase4_performance_workspace_contract.sql` TEST 1 diperbaiki** (baris 36-45): dua bug ditutup sekaligus —
  1. Nama tabel `kpi_area_templates` (pre-rename V1.8.3) → `strategy_templates`. Test ini sudah broken sejak migrasi 0045 rename tabel; migrasi 0059 tidak menyebabkannya, tapi menandaskannya.
  2. Assertion dibalik dari "seed 10 Omset + 9 Profit + CFO 'Control Budgeting' harus ADA" (kontrak V1.82) menjadi "seed default HARUS KOSONG (count=0), row 'Control Budgeting' tidak boleh survive" (kontrak V1.83 §19). Test sekarang membuktikan migrasi 0059 bekerja, bukan hanya tidak crash.
- Verifikasi tambahan: tidak ada test mobile (`goals.test.ts`) yang menganggap seed default ada — satu match "A/R Collection" di sana adalah fixture key mock RPC, bukan assert terhadap DB.
- Migrasi 0059 sendiri (safety claims FK) diverifikasi ulang: `strategies` tidak punya FK ke `strategy_templates`; `goals.goal_template_id` = `ON DELETE SET NULL` — DELETE seed aman tanpa cascade destruktif.

## [2026-07-15] fix | Code review PR #67 — 4 temuan diperbaiki

`/code-review` (8-angle, high effort) atas diff `origin/staging...HEAD` menemukan 8 temuan; 4 correctness-relevant diperbaiki, 4 cleanup minor diserahkan sebagai follow-up.

- **KOREKSI: klaim "apply_goal_template adalah dead function" di entry `[2026-07-15] update | V1.83 §19` di atas TIDAK BENAR.** Verifikasi ulang: `0046:132` DROP diikuti `0046:430` CREATE OR REPLACE — RPC hidup, dipanggil dari `mobile/src/lib/goals.ts:114`, di-wire ke tombol live "Buat Goal dari Template" (`settings-goal-templates.tsx:73` → `goal-wizard.tsx`). Body RPC melakukan `INSERT INTO strategies ... SELECT ... FROM strategy_templates WHERE goal_template_id = ...` — begitu migrasi 0059 mengosongkan tabel itu, RPC tetap sukses tapi menghasilkan Goal dengan **nol Strategy turunan**, tanpa error, tanpa peringatan. Root cause salah baca: saya percaya klaim migrasi 0059 sendiri tanpa membaca ulang body function-nya.
  - Fix: `mobile/src/app/(app)/goal-wizard.tsx` step 2 sekarang menampilkan catatan eksplisit saat `kpiTemplates.length === 0`, menjelaskan Goal akan dibuat tanpa Strategy dan mengarahkan isi manual — bukan silent zero-row.
  - Fix: komentar migrasi 0059 dikoreksi (bukan diedit sejarah — ditambah blok `CORRECTION` baru).
  - **Keputusan yang TIDAK diambil:** RPC tidak diubah untuk raise exception saat 0 match — itu justru akan mem-permanen-broken seluruh flow wizard (semua org baru mulai dengan strategy_templates kosong per §19). 0-Strategy tetap perilaku valid, hanya perlu transparan.
- **Contract test TEST 4 & TEST 6 (`fase4_performance_workspace_contract.sql`)** diupdate count assertion dari `apply_kpi_count(10)`/`apply_count(10)` (hardcoded, era V1.82 seed) ke `count=0` (V1.83 kontrak) — TAPI ditemukan TEST 3/4/5/6 di file yang sama **sudah tidak bisa dieksekusi sejak sebelum PR ini**: masih referensi tabel pre-rename `kpi_areas` (dibuang saat rename V1.8.3 ke `strategies`) dan kolom `initiatives.strategy_id`/`kpi_area_id`. Debt terpisah, bukan disebabkan 0059 — flagged inline di test file, TIDAK dimodernisasi penuh (scope besar, di luar 4 temuan review ini, butuh keputusan owner soal `restore_goal_template_items` dan taksonomi kolom).
- **Migrasi 0059 DELETE WHERE clause diperketat** dari 2-tuple `(goal_template_id, name)` ke 3-tuple `(goal_template_id, division, name)`, cocok dengan unique key asli tabel (`0010:35`). Sebelumnya: admin yang bikin custom template dengan nama sama-persis seed tapi division BEDA (mis. "Control Budgeting" di bawah `coo` alih-alih seeded `cfo`) akan ikut terhapus — melanggar klaim "admin custom aman" migrasi sendiri. Diverifikasi programatik: 19/19 tuple baru diff nol terhadap seed asli di `0010` (tidak under-match, tidak over-match).
- **PRD.md §31 & wiki/concepts/scope-guardrails.md diperbaiki**: kalimat "Template kosong secara default" (ditulis mengikuti daftar Goal Template + Strategy Template) dipersempit eksplisit ke Strategy Template saja — sebelumnya kontradiksi dengan migrasi 0059 sendiri yang secara eksplisit MEMPERTAHANKAN 2 baris `goal_templates` (omset/profit).
- **4 temuan cleanup minor dari review — SELESAI:**
  - `strategy/new.tsx` empty-state + button hand-rolled → diganti `EmptyState` component (reuse `action` prop → `Button variant="secondary"` otomatis).
  - Migrasi 0059 sanity DO-block: hapus redundant `count(*)` full-table scan (total rows informational saja); sisakan hanya `n_default` (omset/profit rows = 0) yang relevan.
  - Contract test TEST 1: hapus EXISTS check spesifik (`'Control Budgeting'`) yang sudah logically-implied oleh count=0 profit di atasnya.

## [2026-07-16] query | Audit kepatuhan PRD V1.83 penuh + tindak lanjut

- **Audit dilakukan** (subagent, read-only) atas seluruh 45 section H2 `PRD.md` vs kode `mobile/` + migrasi + wiki. Hasil: mayoritas section **DONE**; 2 **PARTIAL** ditemukan:
  1. **§19 Strategy Template CRUD** — admin panel `settings-strategy-templates.tsx` masih read-only (sudah dicatat di entry [2026-07-15] di atas, belum dieksekusi).
  2. **§32 People row** — row tidak menampilkan **nomor urut kontribusi (rank)** maupun tombol "Lihat Profil" eksplisit; hanya nama + avatar + subhead.
- **Push Notifications status dikoreksi**: Fase 1 (PR #71) yang sebelumnya tercatat "OPEN" di memory ternyata sudah **MERGED** ke staging 2026-07-15. Fase 2 (outbox drainer, branch `feat/push-notifications-fase2`, commit 2-A..2-G) sudah code-complete tapi belum di-PR.
- **Tindakan diambil (2026-07-16):**
  1. **PR #73** dibuka: `feat/push-notifications-fase2` → `staging` (migrasi `0060_push_infrastructure.sql` + `push-fanout` Edge Function + pg_net/pg_cron drainer + retensi 30h).
  2. **Gap §32 ditutup** — `mobile/src/app/(app)/people.tsx`: tambah `RankBadge` (lingkaran nomor urut, hanya untuk user dengan data ranking dari periode closed terakhir) + label "Lihat Profil" menggantikan chevron polos. De-scoring tetap dijaga: rank menunjukkan posisi, bukan nilai skor. 3 test baru ditambahkan di `__tests__/people.test.tsx` (17/17 pass), `tsc --noEmit` bersih.
- **Gap §19 Strategy Template CRUD CLOSED (PR #75, branch `feat/strategy-template-crud-v183`):**
  - Migrasi `0061_strategy_template_crud.sql`: kolom `is_active boolean default true` + 3 RLS policy (INSERT/UPDATE/DELETE) gated `manage_kpi_area_templates` + rename label permission.
  - Data layer: `createStrategyTemplate`, `updateStrategyTemplate`, `deleteStrategyTemplate` di `goals.ts`.
  - UI rewrite `settings-strategy-templates.tsx`: list+search, create/edit modal, toggle active/inactive, delete confirmation.
  - Contract test 7 pgTAP + 8 RNTL test (4-state + create/edit/toggle/badge). Jest 1377/1377, tsc clean.
  - **Gotcha RNTL:** useMutation `onSuccess: invalidateQueries` menghasilkan async leak via React Query global `notifyManager` — meracuni `screen` singleton RNTL utk test berikutnya. Fix: pindahkan create test (satu-satunya yang trigger mutasi) ke describe terakhir.
- **Memory disinkronkan:** `push-notifications-shipped.md` dikoreksi (Fase 1 MERGED bukan OPEN); `prd-v183-source-of-truth.md` + `app-scaffold.md` di-update.

## [2026-07-17] update | PRD §4 dihapus + §6 dibersihkan (tech stack pindah ke wiki)

Hasil audit hulu-ke-hilir menemukan PRD §4 mewajibkan Next.js + PWA sementara aplikasi shipped Expo React Native (mobile-first, native iOS+Android). Owner konfirmasi divergensi tech stack sudah final; PRD tidak lagi memegang keputusan stack.

- **`PRD.md` §4** — konten Next.js/PWA dihapus, diganti pointer ke `wiki/concepts/tech-stack.md` (pilihan tumpukan) + `wiki/concepts/architecture.md` (ADR Thick-DB/Thin-Client). Nomor section dipertahankan (§4 tetap ada sebagai stub pointer) supaya cross-ref internal PRD dan wiki tidak putus.
- **`PRD.md` §6** — "Native Android/iOS" dihapus dari daftar out-of-scope (kontradiktif dengan realita produk).
- **`README.md` §"Status Deployment"** — koreksi klaim "belum ada CI/CD terpusat"; CI aktif di `.github/workflows/ci.yml` dan gate `deploy-staging.yml`.

Wiki tech-stack + architecture sudah tetap konsisten; tidak perlu update di sana. `wiki/overview.md` tidak menyentuh detail stack sehingga tetap valid.

## [2026-07-19] update | Fase 4 Jembatan Score/Ranking Finalization — spec + TDD + kode landed

Bug jembatan V1.83: `close_period_snapshot` menghitung `ranking_snapshots` dari `user_score_results` KOSONG karena `calculatePeriodScores` nol caller UI/hook — setiap "Tutup Periode" menghasilkan 0 baris ranking, mematikan fitur Ranking diam-diam. Diperbaiki via 6 fase (0-5), Strategi A (RED+GREEN gabung per fase).

**Pages created:**
- [[score-period-immutability]] — ADR governance (MERGE-BLOCKER B-3)
- Spec: `specs/score-ranking-finalization-bridge.md` (v2 pasca-grill; 7 keputusan owner, 20 AC, 7 backlog item)
- TDD plan: `specs/score-ranking-finalization-tdd-plan.md` + `specs/score-ranking-finalization-tdd-handoff.json`

**Pages updated:**
- [[index]] — entry [[score-period-immutability]] ditambah alfabetis di Concepts

**Kode terwujud (branch `claude/nifty-tu-077d71`):**
- Fase 0: migrasi `0079_score_finalize_advisory_lock.sql` (`pg_advisory_xact_lock('score_finalize:'||p_period_id)` di calc + close, mencegah race dua-tab R1/R2) + kontrak `0079_..._contract.sql` T-DB-1..7 (cross-org guard, ACL `authenticated`/`anon`, static regex advisory lock, end-to-end bug-fix confirmation, override coalesce INV-5)
- Fase 1: `previewFinalization(periodId)` di `mobile/src/lib/people-score.ts` (2 count query `is_current=true` + subset `result_kind='override'`) + 7 test T-DL-2a..d + T-DL-3..5 (55/55 hijau)
- Fase 2: `useCalculatePeriodScores`, `usePreviewFinalization` di `mobile/src/hooks/use-people-score.ts` (invalidasi 4 key skor tanpa sentuh ranking/active/latest) + 7 test T-H-1..5 (34/34 hijau)
- Fase 3: `mobile/src/components/finalize-period-modal.tsx` orkestrator 9-state (loading-preview → step1 → calculating → locking → done + 4 error variants) + mapping PG code 23505 → copy Indonesia + canary AC-FIN-8b + 14 test T-M-1..16 (14/14 hijau)
- Fase 4: `mobile/src/app/(app)/settings-score-formula.tsx` label "Tutup Periode" → **"Finalisasi Periode & Peringkat"**, hapus prop-driven `onConfirm`/`onError`, delete `close-period-modal.tsx`; screen test rewrite hapus 8 WS5-UI test modal-internals (coverage pindah ke modal suite) + T-UI-2/2b/4 baru (15/15 hijau)
- Fase 5: ADR wiki + log entry

**Keputusan owner terkunci** (2 putaran, 2026-07-19):
1. Trigger = tombol UI admin
2. Eksekusi = sync client-side
3. Override pasca-close = FREEZE (server E1 dipertahankan)
4. Race dua-tab = migrasi 0079 advisory lock
5. Reminder period-end = NG-8 defer ke spec follow-up `score-period-end-nudge` (B-1 HIGH)
6. Escape hatch pasca-close = accept sadar (ADR di sini)
7. Label = "Finalisasi Periode & Peringkat"

**Gotcha kritikal**:
- RNTL `render()` = **async function** — WAJIB `await render(...)` di test komponen; jika tidak, `screen` proxy melempar `\`render\` function has not been called`
- Pesan server E3 = `'Anda tidak berwenang mengelola Score Formula.'` (BUKAN "mengubah periode ini" — critic BLOCKER-1)
- Migrasi 0079 CREATE OR REPLACE preserve ACL (BUKAN DROP+CREATE)
- Penomoran migrasi: slot 0078 diserahkan ke `settings-consumers` (sudah shipped lokal duluan); migrasi ini memakai **0079**. Keduanya independen, nol irisan tabel/fungsi

**Backlog dibuka (7 item)**: B-1 `score-period-end-nudge` HIGH, B-2 `score-open-period-ui` HIGH, B-3 ADR MERGE-BLOCKER (SHIPPED bersama fase ini), B-4 divergensi PRD §35 vs kode `scores_calculated` event, B-5 retention PDP, B-6 correlation `finalize_run_id`, B-7 rate-limit.

**Verifikasi otomatis semua hijau**: jest per-fase 55/55, 34/34, 14/14, 15/15; `tsc --noEmit` exit 0; type-check tidak butuh regen `database.types.ts` (nol perubahan signature RPC).

## [2026-07-19] update | Smoke Fase 5 dijalankan — bug UI nyata ditemukan + diperbaiki

Smoke manual dijalankan end-to-end di Supabase local (Docker `supabase_db_supabase`, 3 hari uptime). Migrasi 0079 di-apply live (`docker exec ... < 0079_score_finalize_advisory_lock.sql`), tercatat manual di `schema_migrations` karena worktree filesystem migrasi tertinggal dari yang ter-apply di DB lokal (gotcha: [[worktree-run-tests-preview]] — DB lokal punya 0069/0070 yang tidak ada di filesystem worktree branch ini).

**Kontrak DB (`supabase/tests/0079_score_finalize_advisory_lock_contract.sql`) — 3 bug fixture ditemukan + diperbaiki sebelum 7/7 PASS:**
1. T-DB-1/T-DB-2 pakai kolom `profiles.role_level` yang **tidak ada** di skema — level diturunkan dari `role_templates.level` via FK `role_template_id`. Fixture diperbaiki (kolom dihapus; level user fixture memang tidak relevan untuk skenario cross-org).
2. T-DB-6 hardcode `calc harus = 3` — gagal karena org dev seed sudah punya staff lain di luar 3 yang ditambahkan fixture (`calc=4`). Diperbaiki: hitung `v_expected_staff` dinamis dari populasi staff sungguhan sebelum assert.
3. T-DB-7 mengambil `score_formula_versions` via `select ... where status='active' limit 1` **tanpa filter org** — berpotensi false-positive PASS dari formula org lain. Diperbaiki: seed formula sendiri di-scope `v_org`.

Setelah perbaikan: **7/7 PASS**, termasuk T-DB-6 end-to-end (calc=4, close=4, ranking=4 — bukti langsung bug jembatan tertutup) dan T-DB-7 (override coalesce score=95.00).

**Smoke UI (browser preview `ems-web`, login `ceo@rencan.local`) — 1 bug produksi ditemukan + diperbaiki:**

Modal `done` state (menampilkan "N pengguna masuk peringkat" + footer escape hatch) **ter-unmount seketika** sebelum sempat terlihat user. Root cause: `settings-score-formula.tsx` merender `{period ? (<FinalizePeriodModal period={period} .../>) : null}` — begitu `useClosePeriod` invalidasi `['active_period']` pasca-close sukses, `period` dari hook jadi `null`, dan modal ikut ter-unmount karena digate langsung oleh `period` live. Race antara query refetch vs modal internal state — tidak tertangkap unit test manapun (mock hook di test tidak pernah benar-benar berubah value mid-test).

**Fix**: `settings-score-formula.tsx` — ganti `showCloseModal: boolean` dengan `finalizingPeriod: PeriodSnapshot | null`, di-snapshot SEKALI saat tombol ditekan (`onPress={() => setFinalizingPeriod(period)}`), modal digate oleh snapshot ini bukan `period` live. Modal sekarang bertahan sampai user tekan "Tutup" secara eksplisit.

**Verifikasi fix**: jest `settings-score-formula-screen` + `finalize-period-modal` rerun → **29/29 hijau**; `tsc --noEmit` exit 0; retest browser end-to-end — modal `done` persisten, People screen menampilkan "Peringkat periode Agustus 2026 (Smoke Retest)" dengan 1 user ranked (Dewi Anggraini, rank #1) — **bukti visual pertama bahwa fitur Ranking yang mati sejak V1.83 sekarang hidup.**

**Trigger append-only terverifikasi hidup**: percobaan cleanup `DELETE FROM ranking_snapshots` untuk data smoke ditolak trigger `tg_block_delete_append_only` — bukti langsung ADR [[score-period-immutability]] bekerja sesuai desain, bahkan terhadap data uji milik sendiri.

**Data smoke tersisa di DB lokal** (harmless, tidak bisa dihapus by design): 2 period closed (`a28ba739…`, `e7666488…`) org `52b0ebe1…`, 1 `score_formula_versions` level=staff status=active. Tidak perlu dibersihkan — lokal saja, bukan staging/prod.

**Update spec/plan**: `specs/score-ranking-finalization-tdd-plan.md` §9.5/9.6 smoke checklist TERBUKTI akurat. Tambahan follow-up: kontrak `0079_..._contract.sql` di-patch permanen (3 fixture fix di atas) — versi baru sudah di file, bukan hanya dijalankan lalu dibuang.

**Catatan rebase (2026-07-19)**: branch awalnya dicabang dari `main` (`d12914a`) sementara PR menargetkan `staging`; keduanya divergen dua arah (main 12 commit unik, staging 96). Diperbaiki dengan `git rebase --onto origin/staging d12914a` sehingga PR hanya membawa 1 commit kerja ini. Semua file kode yang disentuh terbukti **identik** antara main dan staging sebelum rebase, jadi nol konflik pada kode; satu-satunya konflik adalah file log ini (dua entry berbeda tanggal, keduanya dipertahankan).

## [2026-07-19] sdd-plan | settings-consumers bundled spec (§34.5 + §34.6)

- Pages created: [[settings-consumers-spec]] (wiki/concepts/) — bundled SDD spec closing 2 config black-holes.
- Pages updated: wiki/index.md concepts list; memory settings-consumers-owner-decisions.md (D-1..D-7 locked + reframe post-research).
- Key takeaways:
  - Premise pivot: writer UI [settings-card-completion-rule.tsx] + [settings-card-guidance.tsx] target `public.settings` key store yang salah. Storage kanonik `card_completion_rules` (0005:145) + `card_guidance_contents` (0005:154) sudah ada + seeded (0047).
  - 6 RPC activate_* (bukan 5) hardcode required-field RAISE; migration 0078 (post-rebase ke origin/staging tip 0077) inject helper `enforce_card_completion_rule` yang consult tabel dedicated + emit `governance_violations` (PRD §36 #3).
  - Two-layer required: HARDCODED_CORE (PRD-wired, locked) + admin-configurable overlay per (org, cardType). UI disclose lock section supaya admin tidak bingung.
  - Owner decisions locked D-1..D-7 termasuk D-7 reuse `manage_card_completion_rule` untuk §34.6 (tanpa amandemen PRD §9).
  - 3 grill critics (product/eng/gov) → 17 finding integrated + 2 dilarutkan sebagai owner decision (D-7) atau non-goal (task/0077 pre-existing bug).
  - Siap sambung ke /tdd-plan (4 wave: DB contract → migration → client unit → client impl).

## [2026-07-19] tdd-plan | settings-consumers TDD plan (post-spec)

- Pages created: [[settings-consumers-tdd-plan]] (wiki/concepts/) — 5-wave red-green-refactor untuk spec settings-consumers.
- Pages updated: [[settings-consumers-spec]] amendment D-8 (governance_violations emit deferred karena single-tx rollback bug, mirror Fase 7 dokumentasi limitation); wiki/index.md concepts list.
- Key takeaways:
  - **Amendment D-8** ditemukan di Map phase — `governance_violations` INSERT dalam RAISE path helper akan rolled-back karena single-transaction; Fase 7 sudah dokumentasikan pola sama dan defer ke "Fase 8 dblink/pg_background". Spec §4.2 + AC-1 diamandemen; test S1 assert count=0 (bukan 1) untuk mencegah false-positive coverage.
  - **Big finding**: DB contract test suite (`supabase/tests/*.sql`) belum di-wire ke CI meski memori [[p2-db-contract-ci]] mengklaim demikian. Diflag sebagai FUT-1 (tambah job baru di ci.yml) + FUT-4 (correct wiki + memori).
  - **Test naming**: rename semua ke `0078_settings_consumers_*_contract.sql` (sesuai konvensi NNNN_*_contract, aman glob CI).
  - **HARDCODED_CORE per cardType** eksplisit (6 baris) — critic F1 mencegah silent-PASS drift saat existing activation-check.ts fall-through kosong untuk goal/dev_area/problem_statement.
  - **AC-14 auth-provider** dari lahir GREEN karena existing `queryClient.clear()` sudah cover — critic F4 pindah ke Wave 5.2 sebagai regression pin (bukan red-green wave 3).
  - Grill critic 8 finding all-adopt; adjudikasi lengkap di plan §10.
- Next: eksekutor bisa mulai dari §0 preflight checklist di plan.

## [2026-07-19] fix | Deploy staging gagal karena flake CI — bukan bug kode

Setelah PR #111 (settings-consumers) merge, workflow **Deploy Staging** untuk `5e85bd6` gagal. Job `Lint, types & tests` merah di step **`npm run test:ci`**; akibatnya step `Export & deploy to EAS Hosting` **di-skip** — staging diam-diam tertinggal satu commit.

**Terbukti flake, bukan bug.** Empat bukti independen:

| Bukti | Hasil |
|---|---|
| CI di PR #111 sebelum merge (isi identik) | pass (7m19s) |
| `npm run test:ci` lokal di commit `5e85bd6` persis | **1504/1504 lulus** (127 suite, 247s) |
| CI pasca-merge ke staging | gagal (6m12s) |
| `gh run rerun --failed`, nol perubahan kode | **pass** → deploy lanjut sukses |

Juga diverifikasi bahwa ini **bukan efek PR #110**: `git diff 8c5b38a 5e85bd6` tidak menyentuh satu pun file jembatan Score/Ranking (score-formula, people-score, finalize-modal).

**Hipotesis penyebab (belum terbukti):** run yang gagal justru lebih cepat (6m12s) daripada yang lulus (7m19s). Assertion gagal biasanya tetap menuntaskan seluruh suite, jadi durasi lebih pendek mengarah ke proses jest berhenti di tengah — kandidat utama tekanan memori/worker crash di runner. Tidak bisa dipastikan: log CI gagal diunduh (timeout berulang ke `results-receiver.actions.githubusercontent.com`).

**Diagnosis tanpa log** (berhasil, layak diulang): `gh api .../actions/runs/<id>/jobs` untuk step yang gagal + timing tiap step, lalu bandingkan dengan `gh pr checks <pr>` dan reproduksi lokal di SHA yang sama.

**Kalau berulang** — perlakukan sebagai masalah nyata, jangan re-run terus: naikkan `NODE_OPTIONS=--max-old-space-size` pada step `test:ci`, lalu cari suite terberat. `--runInBand` sudah aktif, jadi paralelisme bukan penyebab.

**Pelajaran operasional:** gate test merah ⇒ deploy di-skip ⇒ **merge ≠ live**. Digabung dengan fakta CI tidak menjalankan `db push`, sempat muncul kondisi **migrasi 0078 sudah live di DB staging tapi client-nya belum ter-deploy**. Setelah merge PR yang menyentuh DB + client, cek dua hal terpisah: run Deploy Staging hijau, DAN migrasi benar-benar ter-apply. Detail di memori `ci-flake-test-ci` + [[score-period-immutability]] konteks migrasi.

Pasca re-run: ketiga job hijau, staging ter-deploy `5e85bd6`, dan verifikasi regresi ringan lolos — tombol "Finalisasi Periode & Peringkat" tetap utuh, console bersih.

## [2026-07-20] update | Buka Periode UI — menutup NG-2 jembatan finalisasi

- Pages created: `concepts/score-open-period-ui.md`
- Pages updated: `concepts/score-period-immutability.md` (escape hatch kini nyata, bukan janji bersyarat), `index.md`
- Konteks: `open_period_snapshot` hidup di DB sejak migrasi 0013 tapi nol caller UI — organisasi tanpa periode hasil seed tidak bisa memasuki Score/Ranking sama sekali. Jembatan finalisasi (PR #110) menyelesaikan setengah siklus; ini setengah lainnya.
- Keputusan owner: modal dua langkah (form → konfirmasi verbatim), bukan satu langkah. Alasan: membuka periode ireversibel dari dua arah — trigger BEFORE DELETE menolak penghapusan, dan guard satu-aktif-per-org membuat salah tanggal memblokir periode yang benar.
- Cakupan: nol migrasi, nol perubahan signature RPC. `useOpenPeriod` (invalidate TEPAT `['active_period']`), `OpenPeriodModal`, wiring empty-state `settings-score-formula.tsx`.
- Validasi klien menutup lubang server: `period_name` menerima string kosong/spasi di DB (hanya NOT NULL); periode 1 hari sah karena CHECK-nya `period_end >= period_start`.
- Test: 5 hook + 16 modal + 5 wiring screen. Satu test lama dibalik kontraknya — `[ex WS5-UI-02]` sebelumnya mengunci KETIADAAN UI buka-periode.

## [2026-07-20] update | Backlog fitur di bawah ambang P-slot dicatat

- Pages created: `concepts/feature-gap-backlog.md`
- Pages updated: `index.md`
- 12 item diberi ID stabil `BL-01..BL-12` dari audit fitur (gap app vs PRD, bukan app vs prototype — [[ui-prototype-gap]] tetap terpisah).
- Triage per ukuran: 5 XS layak langsung jadi chip task (BL-01 ranking tie, BL-03 dim past-period, BL-08 aksi "Catatan", BL-11 ikon notifikasi header, BL-12 label governance violation); 4 S; 3 butuh scoping (BL-07 notifikasi §28, BL-09 archive, BL-10 search §38).
- Dua yang paling dekat ambang P-slot: **BL-02** (AC-11 FAIL — `strategy/new` expose DateRangeField, seharusnya inherit periode Goal) dan bagian **invalidate query key salah** di BL-09 (bug diam: restore berhasil tapi list tidak menyegar).
- BL-09 sengaja ditandai "bukan satu bug" — tiga penyebab berbeda dalam satu baris backlog, harus dipecah sebelum dikerjakan.
- Status: item belum diverifikasi ulang terhadap `mobile/src/` saat pencatatan `[?]`; konfirmasi gap sebelum mengerjakan.

## [2026-07-20] update | BL-12 dikerjakan + halaman backlog direkonstruksi

- Pages created: `concepts/feature-gap-backlog.md` — **file dari entry sebelumnya ternyata tidak pernah masuk ke branch mana pun.** Entry `[2026-07-20] update | Backlog fitur di bawah ambang P-slot dicatat` mencatat `Pages created`, tapi `git ls-tree` di `origin/main` maupun `origin/staging` tidak menemukan file-nya; hanya `index.md` yang menautkan → wikilink menggantung.
- Pages updated: `index.md` (BL-01..BL-12 → BL-01..BL-13 + catatan rekonstruksi)
- **Rekonstruksi:** tabel dibangun ulang dari entry log sumber, satu-satunya jejak tersisa. Entry itu menyebut 9 dari 12 ID; **BL-04, BL-05, BL-06 tidak dapat dipulihkan** dan ditandai UNKNOWN daripada dikarang. Row BL-01..BL-11 mewarisi `[?]` — sumbernya menyatakan item belum diverifikasi ulang terhadap `mobile/src/`.
- **BL-12 DONE** — label Indonesia untuk `violation_type` di Settings › Governance Violation.
  - `violation_type` bertipe `text` **tanpa CHECK constraint** (0005), jadi himpunan tipe sah ditelusuri dari setiap penulis baris: INSERT langsung di 0005/0007/0008/0014/0038/0040/0046/0063/0064 + `log_governance_violation()` di 0019/0046 → **11 tipe**.
  - `minimum_breakdown_not_met` = false lead: hanya ada di contract test fase5; migrasi 0011 eksplisit hanya `RAISE` pada gate-block tanpa menulis baris. Tetap dipetakan untuk baris lama, dikecualikan dari daftar tipe wajib di test.
  - Fallback berlapis (tak dikenal → nilai mentah; null/kosong → `—`) karena kolom bebas berarti tipe baru bisa muncul tanpa perubahan client. Test 20/20, `tsc --noEmit` bersih.
- **BL-13 dibuka (OPEN):** `violation_type` tidak punya sumber kebenaran. Migrasi dengan tipe baru — atau salah ketik tipe lama — lolos semua gate CI (kolom `text` bebas, contract test tidak mengenumerasi tipe, Jest tidak melihat migrasi). Fallback BL-12 menahan dampaknya jadi kosmetik → degradasi diam-diam. Dua opsi dicatat (CHECK constraint vs tabel lookup + FK); hanya lookup yang membuat drift dapat diuji di CI.
- **Gotcha proses:** cabang kerja awal dibuat dari `main`, sedangkan konvensi PR = `staging`. `main` dan `staging` sudah divergen (12 commit `main` absen dari `staging`), jadi `git rebase origin/staging` mencoba memutar ulang ke-12 commit itu dan konflik di seluruh repo. Solusi: cabang baru dari `origin/staging` + pindahkan perubahan kode (3 file identik di kedua branch), tulis ulang bagian wiki terhadap isi `staging`.

## [2026-07-20] update | CI pindah ke self-hosted runner setelah kuota Actions terblokir

- Pages created: `entities/self-hosted-runner.md`
- Pages updated: `index.md`
- **Pemicu:** seluruh run CI gagal dengan **nol step tereksekusi** sejak ~07:36 UTC, di semua branch termasuk `staging`. Anotasi check-run: *"The job was not started because recent account payments have failed or your spending limit needs to be increased."* Repo privat + paket Free = 2.000 menit/bulan; terukur ~10,1 menit per run × 200+ run/30 hari.
- **Diagnosis penting:** jangan salah baca sebagai kegagalan kode. Cirinya `steps=0` — job tidak pernah mulai. Ambil alasannya dari `gh api repos/<o>/<r>/check-runs/<id>/annotations`, bukan dari log job (kosong).
- **Dua jalur ditempuh:** (1) gating job by changed-path agar muat kuota — [[log#2026-07-20-ci-budget|PR #122]], hemat terukur 24% (bukan 50-60% seperti perkiraan awal); (2) runner self-hosted [[self-hosted-runner]] — PR #123.
- **Terbukti:** menit self-hosted tidak dihitung terhadap kuota. Job self-hosted jalan sukses saat semua job hosted menolak start.
- **Jujur soal trade-off:** `quality` 9,3 menit di WSL vs 6,9 menit di runner GitHub — **35% lebih lambat**. Yang dibeli ketersediaan + biaya nol, bukan kecepatan.
- **`db-contract` sengaja tidak dipindah** — `supabase start`/`stop` di runner yang berbagi Docker dengan mesin dev akan bentrok port dan berpotensi merobohkan stack dev developer. Konsekuensinya job itu mati selama kuota terblokir; perubahan DB butuh verifikasi manual.
- **Dua jebakan yang ditemukan saat setup** (keduanya bergejala senyap): cache npm Actions menggantung di step `Post Setup Node` (177 MB, load average 0,33 → bukan CPU-bound) sehingga dicabut; dan WSL mematikan distro saat idle sehingga job menggantung `queued` atau ter-*cancel* di tengah — ditutup dengan keepalive Startup folder yang memulihkan diri (terverifikasi: `wsl --terminate Ubuntu` → pulih ~25 detik).
- **Keamanan:** user `runner` sengaja TIDAK diberi sudo tanpa password. Konsekuensi lanjutan: **repo tidak boleh dijadikan publik** selama runner terpasang — meniadakan opsi "repo publik agar Actions gratis".
## [2026-07-20] fix | Akar flake CI ditemukan: anggaran timeout async, bukan tekanan memori

Menutup pertanyaan terbuka dari entri [2026-07-19] di atas. Hipotesis lama (**tekanan memori / worker crash**, dengan resep menaikkan `NODE_OPTIONS=--max-old-space-size`) **terbukti salah**. Penyebabnya dua batas waktu yang terlalu ketat untuk stack ini.

**Dua knob berbeda, sering dikira satu:**

| Knob | Default | Dipakai oleh | Status sebelum fix |
|---|---|---|---|
| `testTimeout` jest | 5000ms | seluruh body test | ditambal `jest.setTimeout(30000)` yang **disalin manual ke 45 dari 128 file**; 83 sisanya telanjang |
| `asyncUtilTimeout` RNTL | 1000ms | `findBy*`, `waitFor` | **tidak pernah diset di mana pun** |

`jest.setTimeout()` **tidak** memengaruhi `asyncUtilTimeout` — inilah salah paham yang membuat tambalan lama tampak sudah menutup masalah padahal tidak. `repeat-ui.test.tsx` bahkan memasang `jest.setTimeout(30000)` dengan komentar "cold transform bisa >5s", tapi tetap gagal di `findByText` pada 1000ms.

**Bukti deterministik (probe delay, tanpa membebani CPU):** render `TaskDetailScreen` dengan `listInstances` sengaja resolve setelah 1500ms — data selalu sampai, tidak ada yang membatalkan/menimpa state:
- `asyncUtilTimeout: 1000` → gagal `Unable to find an element with text: 2026-06-01` — **persis pesan yang muncul di CI**
- `asyncUtilTimeout: 5000`, delay identik → lulus

Jadi ini **bukan race** (berbeda dari race `card-help-trigger`): tidak ada assert yang berlomba dengan state, hanya kehabisan waktu tunggu.

**A/B terkontrol** (base sama, beban CPU sama 6 proses, hanya config berbeda): tanpa fix → 2 gagal (`repeat-ui` + `finalize-period-modal`, pasangan yang sama persis dengan yang terlihat di CI); dengan fix → 128 suite / 1548 tes hijau. Tanpa beban, keduanya hijau — itulah sebabnya flake ini tak pernah muncul di laptop yang senggang dan rutin muncul di runner.

**Fix:** pindahkan anggaran ke satu tempat — `testTimeout: 20000` + `setupFilesAfterEnv` → `configure({ asyncUtilTimeout: 5000 })` di `mobile/jest.setup.after-env.js`. File test baru ikut aman tanpa perlu ingat menyalin `jest.setTimeout`.

**Catatan kalibrasi:** beban CPU ekstrem (12 proses, durasi suite 146–218s vs 37–49s) membuat **semua** anggaran jebol termasuk yang 30s — di titik itu pengukuran berhenti diskriminatif. Pakai beban sedang saat menguji flake timeout, bukan beban maksimum.

`--runInBand` di `test:ci` memang mematikan paralelisme jest, tapi tidak menolong: runner CI tetap lambat per-render, dan anggaran 1000ms-lah yang jebol.
## [2026-07-20] update | BL-11 / UI-G-016: icon Notifications di header global (PRD §7.2 #3)

- Pages updated: [[ui-prototype-gap]] (baris baru UI-G-016, dipetakan = BL-11, + ringkasan status), [[prototype-prd-conformance]] (penyimpangan kecil #1 ditandai ditutup di app).
- > [!warning] `concepts/feature-gap-backlog.md` **tidak ada di repo** meski entri log 2026-07-20 mencatatnya sebagai "Pages created" dan [[index]] baris 34 menautkannya. Baris BL-11 karena itu tidak bisa diperbarui di tempatnya — status ditulis di UI-G-016. Halaman backlog perlu dibuat ulang (BL-01..BL-12) oleh yang memegang hasil audit aslinya; jangan direkonstruksi dari tebakan.
- Kode: `mobile/src/components/app-header.tsx` — Ionicons `notifications-outline` (22px) di antara search pill dan avatar, tap → `router.push('/(app)/(tabs)/notifications')`, target sentuh `min-h-[44px] min-w-[44px]`, warna brand-dark `#1564b3` / blue-300 `#93c5fd` (DESIGN §10/§12). Variabel `searchIconColor` di-rename `brandIconColor` karena kini dipakai dua ikon.
- Badge unread masuk scope karena hook `useUnreadCount()` sudah ada: badge merah `bg-red-700` clamp `99+`, disembunyikan saat `isLoading`/`isError` (hook sengaja meng-surface keduanya supaya badge tidak fail-silent jadi "0"). Jumlah unread ikut masuk `accessibilityLabel` — warna bukan satu-satunya sinyal (DESIGN §4).
- Test: 7 kasus baru di `src/components/__tests__/app-header.test.tsx` (tampil selalu, koeksistensi dengan back, badge angka, clamp 99+, tanpa badge saat 0, loading, error). Suite 16/16 hijau; `tsc --noEmit` + eslint bersih.
## [2026-07-20] update | BL-01 ditutup — daftar People konsumsi `rank_number` dari DB

- Gap dikonfirmasi ulang terhadap `mobile/src/` (status `[?]` pada entri backlog di atas kini terjawab untuk BL-01): `people.tsx` menurunkan angka rank dari counter berjalan atas roster terurut (1,2,3…), sedangkan `people-profile/[id].tsx` menampilkan `ranking_snapshots.rank_number` dari DB. Keputusan D11 menetapkan rank kembar (1,1,3), jadi kedua layar menampilkan angka berbeda untuk orang yang sama begitu ada seri.
- Perbaikan: `rankByUser` dibangun langsung dari `useRanking(...)` → `Map<user_id, rank_number>`. Urutan tampilan roster (score DESC, lalu nama A→Z) tidak berubah; hanya angka badge yang kini bersumber dari DB.
- Test: 1 test tie baru di `src/app/(app)/__tests__/people.test.tsx` (rank_number 1,1,3 → dua badge "Peringkat 1", satu "Peringkat 3", nol "Peringkat 2"). Suite people/ranking 20/20 pass.
- **Inkonsistensi wiki ditemukan** `[?]`: `wiki/concepts/feature-gap-backlog.md` dirujuk oleh `index.md` dan entri log `[2026-07-20] update | Backlog fitur di bawah ambang P-slot` ("Pages created"), tetapi file-nya tidak ada di `origin/staging`, `origin/main`, maupun branch remote mana pun. Isi BL-01..BL-12 (termasuk triage XS/S/M/L) karenanya tidak dapat dipulihkan dari repo; baris BL-01 belum bisa dicoret di halaman aslinya. Perlu keputusan pemilik: buat ulang halaman atau cabut rujukannya dari `index.md`.
## [2026-07-20] update | Verifikasi 12 item backlog terhadap kode

- Pages updated: `concepts/feature-gap-backlog.md` (tabel §1 diganti hasil verifikasi + bukti file:line; triage §2 ditulis ulang), `concepts/ui-prototype-gap.md` (koreksi UI-S-W08)
- Metode: 4 agen paralel membaca `mobile/src/`, `supabase/migrations/`, `PRD.md`. Hasil: **7 CONFIRMED apa adanya · 4 terkoreksi · 1 gugur**.
- **Menggantikan rekonstruksi entry `[2026-07-20] BL-12 dikerjakan + halaman backlog direkonstruksi`.** Halaman hasil audit asli (yang saat itu belum ter-commit) kini masuk repo, jadi tabel rekonstruksi diganti seluruhnya: BL-04/05/06 yang ditandai UNKNOWN terisi, dan `[?]` di BL-01..BL-11 dicabut karena semuanya sudah punya bukti `file:line`. §BL-12 + §BL-13 dari rekonstruksi **dipertahankan utuh** — keduanya analisis terverifikasi, bukan tebakan. Peringatan "jangan direkonstruksi dari tebakan" di entry BL-11 dengan ini terjawab.
- **BL-03 gugur sebagai bug kode** — dim past-period dihapus SELURUHNYA dan dikunci tes `[W08·1..2]` `countOpacityHalf === 0`. Koreksi atas draf pertama entri ini: `PastDim` **memang pernah ada** (shipped 2026-07-02), lalu dicabut owner 2026-07-03 — bukan "tidak pernah ada di source". Baris UI-S-W08 karenanya bukan salah-tulis melainkan tidak dimutakhirkan setelah pencabutan.
- **Akar BL-03 = dokumentasi.** PRD §44 AC-9 masih mewajibkan "tampil redup" (diulang §7.7 + §11.3; §37 permisif dan tidak konflik), sementara kode sengaja tidak. Selama PRD tidak dimutakhirkan, setiap audit app-vs-PRD akan melahirkan ulang temuan ini.
- **BL-09(a) gugur** — `includeArchived: true` sudah di-pass (`settings-archive.tsx:32`). Sisa (b) row tanpa onPress dan (c) invalidate key salah: `['search']` vs key asli `['cards_search', ...]`; tidak ada query mana pun ber-key `['search']` → no-op total, restore tidak pernah menyegarkan list.
- **BL-04 terkoreksi** — bukan "hanya strategy→initiative di-guard". Hanya 1 dari 6 tombol tambah ter-guard (`initiative→action_plan`), dan itu memakai data kepatuhan strategy→initiative sebagai cascade (WSA-04). Tombol `+ Inisiatif` milik strategy sendiri tidak ter-guard; `goal/[id].tsx` nol pemakaian MBR. Perlu keputusan produk dulu, bukan bug.
- **BL-07 terkoreksi** — §28 mendefinisikan 9 tipe (bukan 4 yang hilang dari daftar tak-bernomor); 5 jalan, 4 absen. 3 dari 4 belum ada di CHECK constraint 13-tipe (0038) → butuh migrasi. Gap 100% server-side; `lib/notifications.ts` sudah mirror tepat.
- **BL-08 naik ukuran XS→S** — kedua RPC review hard-reject decision ketiga (`if p_decision not in ('approve','reject') then raise`), jadi butuh migrasi, bukan patch UI. → **DIKOREKSI 2026-07-20 oleh chip task BL-08 (branch `claude/pensive-goodall-42169f`): temuan RPC benar, kesimpulan "butuh migrasi" tidak berlaku.** Ia hanya mengikat bila Catatan = nilai `decision` ketiga; owner memutuskan non-terminal, sehingga Catatan tidak pernah masuk jalur RPC review. Sudah SELESAI dengan nol migrasi. Kenaikan XS→S tetap tepat (butuh keputusan produk + fungsi data layer, bukan sekadar tombol).
- **BL-06** juga butuh migrasi (`action_plan_repeat_rules` tanpa kolom timezone; deadline dihitung dari `organizations.timezone`).
- Chip task: BL-03 sudah terlanjur dijalankan user sebelum verifikasi selesai — perlu dibatalkan supaya tidak memerahkan tes W08.

## [2026-07-20] update | BL-09(c) selesai — restore arsip meng-invalidate key yang benar

- Pages updated: `concepts/feature-gap-backlog.md` (BL-09(c) dicoret)
- Kode: `mobile/src/app/(app)/settings-archive.tsx` — `qc.invalidateQueries({queryKey:['search']})` → `['cards_search']`, cocok dengan key `useSearchCards` (`['cards_search', trimmed, entityTypes, includeArchived]`). Prefix-match react-query kini kena; sebelumnya nol query ber-key `['search']` sehingga invalidate no-op total dan daftar arsip tidak pernah menyegar setelah restore sukses.
- Test: `[F8-UI-28]` di `fase8-settings-screens.test.tsx` — spy `QueryClient.invalidateQueries`, jalankan tombol "Pulihkan" dari dialog konfirmasi, assert key `['cards_search']`. Red check dilakukan: dengan key lama test GAGAL, dengan key baru LULUS.
- `npm run type-check` bersih.
- BL-09(b) (row arsip tanpa `onPress`) masih terbuka; BL-09(a) sudah gugur saat verifikasi.
## [2026-07-20] update | BL-08 — aksi review ke-3 "Catatan" (PRD §24.3)

- **Pages updated:** [[ui-prototype-gap]] — item baru **UI-G-017** (alias BL-08) di §2 + §2.2 baru untuk sisa yang ter-defer.
- **Temuan awal:** halaman `wiki/concepts/feature-gap-backlog.md` yang dirujuk task **tidak ada**, dan ID `BL-08` tidak muncul di mana pun di repo. Backlog ber-ID satu-satunya = [[ui-prototype-gap]] (`UI-G-###`/`UI-S-###`), jadi item didaftarkan di sana dengan alias BL-08.
- **Semantik "Catatan" tidak tersurat di PRD.** `PRD.md` §24.3 hanya menuliskan tiga nama aksi + "Jika Minta Revisi, alasan wajib" — tidak menyebut apakah Catatan menulis comment, submission note, atau activity_log, maupun apakah ia terminal. Diangkat ke owner; **putusan: NON-TERMINAL** (kirim umpan balik tanpa menyetujui/menolak).
- **DB tidak mendukung aksi ke-3** (diverifikasi sebelum menulis kode): `reviews.decision` CHECK `('approve','reject')` (`0005:140`), `task_submissions.review_status` CHECK `('pending','approved','rejected')` (`0005:97`), dan guard RPC `if p_decision not in ('approve','reject') then raise` (`0046:1976`). Karena putusannya non-terminal, ketiganya **tidak disentuh** — tidak ada migrasi.
- **Implementasi (chat-only, nol perubahan DB):**
  - `lib/inbox.ts::postReviewNote` — resolve room Rencana Aksi (`getRoomIdForActionPlan`, RLS member-gated) lalu `send_chat_message` dengan `p_context_action_plan` = id Tugas yang direview. Guard body kosong + pesan jelas saat reviewer bukan anggota room.
  - `components/review-submission-panel.tsx` — mode ketiga "Catatan". Aksi terminal disembunyikan saat form terbuka (cegah tap tak sengaja); `onNote` async sehingga form **hanya reset saat kirim berhasil** — teks tidak hilang bila jaringan gagal.
  - Ter-wire di `task/[id].tsx` + `task/instance/[id].tsx`. Mutasi Catatan sengaja **tidak** memanggil `refresh()` — tidak ada status yang berubah.
- **Test:** 8 test komponen baru (`review-submission-panel.test.tsx`, termasuk assert non-terminal `onDecide` tidak terpanggil + teks bertahan saat gagal) + 10 test data layer (`inbox.test.ts` — termasuk assert hanya `send_chat_message` yang dipanggil, tiga varian `actionPlanId` kosong, dan invariant lintas-AP 0056). **Jest 1573/1573, 129 suite, tsc bersih, lint 0 error** — diverifikasi setelah rebase ke `staging` (angka lama 1419/119 diukur pada base yang tertinggal 106 commit, jadi tidak lagi berlaku).
- **Ter-defer (butuh migrasi 0080+):** entri Activity Log. `write_activity` dicabut dari `authenticated` di `0062` (anti audit-log palsu) → hanya bisa lewat RPC SECURITY DEFINER baru. Rinci di [[ui-prototype-gap]] §2.2, termasuk pertanyaan terbuka "siapa yang boleh meninggalkan Catatan".

## [2026-07-20] update | Rekonsiliasi dim "periode lewat": PRD AC-9 vs owner decision 2026-07-03

- **Pemicu:** audit gap app-vs-PRD memunculkan item BL-03 ("AC-9 parsial: label teks ada, redup visual tidak ter-apply"). Investigasi menunjukkan ini **bukan bug** — dim memang sengaja dihapus owner decision 2026-07-03 — tetapi wiki + PRD tidak pernah mencatat pencabutannya, sehingga setiap audit baru akan melahirkan ulang temuan yang sama.
- **Akar masalah dokumentasi:** baris [[ui-prototype-gap]] UI-S-W08 masih berbunyi "IMPLEMENTED 2026-07-02 — `PastDim` single-layer", padahal `PastDim` dihapus sehari sesudahnya. Audit membaca baris itu sebagai kontrak yang berlaku, mengecek `mobile/src`, dan mencatat selisihnya.
- **Konflik nyata yang ditemukan:** `PRD.md` §44 **AC-9** mensyaratkan "Card periode lewat **tampil redup**". Owner decision 2026-07-03 melanggar AC tertulis ini, bukan sekadar menyimpang dari halaman wiki. §7.7 dan §11.3 mengulang syarat yang sama; §37 justru permisif ("boleh diberi visual redup") — jadi PRD tidak konsisten dengan dirinya sendiri.
- **Keputusan owner (2026-07-20):** dim tetap tidak dipasang; decision 2026-07-03 berlaku. Dokumen yang disesuaikan ke keputusan, bukan sebaliknya. Kode `mobile/` **tidak disentuh**.
- Pages updated: [[ui-prototype-gap]] (UI-S-W08 → RESOLVED-BY-DECISION + rujukan silang ke PRD AC-9).
- Files updated: `PRD.md` — catatan pencabutan kanonik di §44 AC-9 (menegaskan larangan tambah-turunan TETAP mengikat); §7.7 + §11.3 diubah dari "redup" ke badge teks + pointer ke AC-9.
- **Sinyal periode-lewat yang berlaku:** badge teks "Periode lewat" (`WS_TREE_COMPACT_COPY.periodState`). DESIGN §4 terpenuhi lewat teks, bukan warna/opacity. Tes [W08·1..2] menjaga arah ini (`countOpacityHalf === 0`) — dim tidak bisa masuk kembali tanpa mematahkan tes.
- **Tindak lanjut BL-03 (selesai):** saat entri ini pertama ditulis, `wiki/concepts/feature-gap-backlog.md` masih **untracked** di checkout utama sehingga baris BL-03 tak bisa ditutup di tempatnya. Halaman itu kini sudah ter-commit lewat PR #119 dengan BL-03 ditandai "BUKAN GAP KODE — keputusan owner 2026-07-03" beserta riwayat `PastDim` yang benar. Sempat ada rekonstruksi halaman yang sama dari sesi lain (merged lewat #117, baris BL-03 masih `OPEN`) — versi terverifikasi dari #119 yang berlaku; catatan penutup ditinggalkan di #117.

## [2026-07-21] update | `db-contract` pindah ke runner self-hosted + panduan pemantauan CI

- **Pemicu:** `db-contract` satu-satunya job yang tersisa di runner GitHub-hosted. Sejak kuota terblokir ia tidak pernah jalan — dan gagalnya berbentuk `steps=0`, bukan merah, sehingga terbaca seperti skip yang wajar. Akibatnya perubahan DB masuk tanpa verifikasi kontrak sama sekali.
- **Keberatan lama tetap valid:** `supabase start` mem-boot sembilan container dan mengikat 54321/54322 di host yang sama dengan stack dev. Yang diganti stack-nya, bukan runner-nya: satu container `supabase/postgres` tanpa port ter-publish (psql lewat `docker exec`), sehingga bentrok port mustahil secara struktural.
- **Tiga tambalan wajib** (`scripts/ci/db-bootstrap.sql`), semuanya gagal senyap bila hilang: tabel `storage` (normalnya dibuat storage-api) → replay mati di `0005`; `auth.users` bentuk GoTrue (image hanya punya skeleton 2017) → fixtures mati di INSERT user pertama; `auth.uid()` yang membaca `request.jwt.claims` + default privileges diperketat — yang pertama membuat ~20 kontrak gagal "tidak berwenang", yang kedua membuat kontrak ACL `0078` **lolos palsu**.
- **Baseline:** 29 passed / 0 failed, identik dengan run `supabase start` hijau terakhir; 1 m 52 s vs 2 m 54 s versi hosted (satu container, bukan sembilan).
- **Prasyarat lingkungan yang ditemukan lewat kegagalan nyata:** WSL integration Docker Desktop harus aktif untuk distro `Ubuntu` (tanpa itu `docker` cuma binary Windows lewat interop — `command -v` tetap lolos, karena itu preflight menguji `docker info`), dan user `runner` harus anggota grup `docker` disertai restart service.
- Pages updated: [[self-hosted-runner]] (bagian `db-contract` dikoreksi, prasyarat Docker, panduan pemantauan 4 lapisan + tabel gejala), [[index]].
- **Risiko yang dicatat, bukan ditutup:** gate DB kini bergantung pada Docker Desktop yang sedang berjalan di mesin developer; bila mati, `db-contract` gagal di preflight tanpa sinyal apa pun ke GitHub. Grup `docker` juga setara root — menguatkan larangan menjadikan repo publik.
- **Autostart Docker (susulan):** `AutoStart` internal Docker Desktop bernilai `False`, jadi dipasang `rencanapp-docker-autostart.vbs` di Startup folder. Yang ditunggu skrip itu adalah `docker info` dijawab dari dalam distro sebagai user `runner`, BUKAN keberadaan proses aplikasi — teramati proses `Docker Desktop.exe` berjalan sementara engine WSL-nya mati, dan job CI melihat engine. Belum teruji melewati login sungguhan.

## [2026-07-21] update | Jalur CI self-hosted dicabut — kembali ke `ubuntu-latest`

- **Keputusan owner:** cabut seluruh jalur self-hosted. Alasannya kecepatan dan biaya perawatan, **bukan** kegagalan teknis — jalurnya sendiri terbukti bekerja (30 kontrak DB hijau di runner sendiri, 1 m 52 s).
- **Biaya yang jadi penentu:** `quality` 9,3 mnt vs 6,9 mnt hosted (~35% lebih lambat), dan dalam satu hari pemakaian jalur ini menuntut perhatian berkali-kali — WSL integration, grup `docker`, socket AF_UNIX yatim pasca-reboot, port disita Hyper-V, NAT WSL roboh setelah `net stop winnat`. Waktu merawat runner melampaui menit CI yang dihemat.
- **Yang dikembalikan:** semua job (`changes`, `no-old-names`, `quality`, `db-contract`, `deploy`) → `ubuntu-latest`; `db-contract` kembali memakai `supabase start`; `cache: npm` dipulihkan.
- **Yang DIPERTAHANKAN dengan sengaja:** job gating `changes`. Ia bukan bagian dari self-hosted dan justru makin bernilai di runner berbayar — memutuskan job mahal mana yang perlu jalan.
- **Yang dihapus:** `scripts/ci/start-db-container.sh`, `scripts/ci/db-bootstrap.sql`, registrasi runner, service systemd, keepalive + autostart VBS, keanggotaan grup `docker`.
- **Konsekuensi yang harus disadari:** kuota Actions masih terblokir, jadi job hosted **tidak jalan sama sekali** (`steps=0`, bukan merah). CI efektif mati sampai ada solusi lain. PR revert ini sendiri pun tidak bisa diverifikasi CI.
- Pages updated: [[self-hosted-runner]] (ditandai DICABUT + alasan; isi teknis dipertahankan sebagai catatan sejarah agar jebakannya tidak ditemukan ulang), [[index]].

## [2026-07-21] update | BL-05 selesai — dua field faktor §26 masuk form Evaluasi

- **Pemicu:** [[feature-gap-backlog]] BL-05 — PRD §26 mendefinisikan 6 field evaluasi, form `evaluation.tsx` hanya mengumpulkan 4. `success_factors` dan `failure_factors` tidak pernah dikirim. `lessons_learned` yang sudah ada adalah field berbeda, bukan substitusi keduanya.
- **Jalur backend sudah lengkap sejak awal:** kolom `evaluations.success_factors`/`.failure_factors` bertipe `text[]` (`0046:1882-1893`), RPC `record_evaluation` sudah menerima `p_success_factors`/`p_failure_factors` (`0046:1857`), `lib/governance-admin.ts:110-124` sudah mem-forward. Yang putus hanya satu lapis: form tidak mengisinya. **Nol migrasi.**
- **Keputusan desain (list vs blok teks):** kolomnya `text[]`, jadi UI mengumpulkan list sungguhan — satu textarea per field dengan konvensi **satu faktor per baris**, tiap baris non-kosong jadi satu elemen array. Bukan satu blok teks yang dibungkus jadi array satu elemen: konsumen hilir (laporan/agregasi) harus bisa menghitung faktor, dan itu mustahil bila seluruh isian menumpuk di satu elemen.
- **Chip/tag editor dinamis ditolak sengaja.** Ia menambah N tombol hapus yang masing-masing wajib ≥44px + label screen reader (DESIGN §4.1, §4.4) untuk keuntungan yang tidak nyata pada teks pendek, sementara `LabeledInput multiline` sudah menjadi idiom form di layar yang sama (Hasil, Lesson learned, Catatan rollout) dan tidak mengunci tinggi kontainer teks (DESIGN §4.5).
- **Urutan field mengikuti PRD §26:** Target → Hasil → Faktor berhasil → Faktor gagal → tindak lanjut (SOP/rollout). Pre-fill UPSERT round-trip lewat `join('\n')` / `split('\n')`.
- **Jebakan tes yang muncul:** `fireEvent.changeText` lalu langsung `fireEvent.press` menghasilkan `record()` dengan array kosong — press mendahului flush state, sama bentuknya dengan race di [[ci-flake-test-ci]]. Perbaikannya menunggu `input.props.value` lebih dulu, pola yang sudah dipakai `[F8-UI-18]`. Tanpa itu tes gagal sekaligus menyeret tes tetangga (`F8-UI-19`, dua tes `search`) ikut merah — kegagalan berantai, bukan regresi nyata di layar-layar itu.
- Files updated: `mobile/src/app/(app)/evaluation.tsx`, `mobile/src/app/(app)/__tests__/fase8-lifecycle-screens.test.tsx` (`[F8-UI-18b]` kirim, `[F8-UI-18c]` pre-fill round-trip).
- Pages updated: [[feature-gap-backlog]] (BL-05 → DONE, PR #138).
- **Verifikasi:** `npm test` 130 suite / 1591 tes hijau; `npm run type-check` bersih. PR #138 → `staging`.
## [2026-07-20] update | B-1 score-period-end-nudge — pengingat periode skoring

Menutup backlog **B-1** dari [[score-ranking-finalization-bridge]] §11.2 (dulu NG-8). Melengkapi trio: [[score-open-period-ui]] (jalan masuk) → finalisasi (jalan keluar) → **nudge** (yang mengingatkan agar jalan keluar benar-benar ditempuh).

**Masalah**: finalisasi dan buka-periode keduanya manual, dan tidak ada yang memberi tahu admin bahwa periode akan/sudah berakhir. Tanpa pengingat, gejala bug lama bisa muncul kembali **tanpa ada bug**: periode berlalu, tombol tak ditekan, ranking tak terbit — dari sisi pengguna tak bisa dibedakan dari kerusakan.

**Keputusan owner (2026-07-20):**

| # | Isu | Keputusan |
|---|---|---|
| 1 | Tipe notif | Tipe **baru** `period_closing_reminder`, bukan reuse `deadline_reminder` |
| 2 | Kadens | **H-7, H-3, H-1** |
| 3 | Setelah `period_end` lewat | **Terus ingatkan harian** sampai difinalisasi, copy dibedakan |
| 4 | Kanal | **In-app + push** |

Alasan #1: `inlineAction()` di `notifications.tsx` men-hardcode href `/task/...`. Reuse memang nol perubahan, tapi CTA akan membuang admin ke layar yang salah — penghematan yang menyamarkan bug UX. Dengan `entity_type='period_snapshot'`, CTA kini "Buka Score Formula".

Alasan #3: kondisi "periode sudah lewat tapi belum ditutup" adalah persis skenario yang melahirkan bug asli. Berhenti mengingatkan di `period_end` meninggalkan lubang tepat di titik paling berbahaya.

**Implementasi** — migrasi `0081_period_closing_reminder.sql`, meniru preseden `emit_deadline_notifications` (`0008:973`):
- Constraint `notifications_type_check` diperluas (superset 0038 + 1 tipe).
- `emit_period_closing_reminders()` SECURITY DEFINER: loop periode `active`, hitung `period_end - org_today(org)`, kirim bila selisih ∈ {7,3,1} atau < 0. Penerima = pemegang `manage_score_formula` (CEO by role ATAU delegasi `user_permissions`), mengikuti semantik `has_permission` (`0016:41-53`).
- **Anti-duplikat**: `dedupe_date = org_today(org)` + partial unique `uq_notifications_dedupe` (`0008:145`) → satu notif per penerima per periode per hari, berapa kali pun cron jalan. Tanggal selalu dihitung server (CF-3).
- `is_push_worthy` fallback + `PUSH_WORTHY_TYPES` client diperluas — keduanya **harus sinkron**, kalau tidak push diam-diam tak terkirim; ditegakkan lewat assertion di `push-notifications.test.ts`.
- pg_cron `emit-period-closing-reminders` `0 7 * * *` UTC (14:00 WIB); slot 06:00/20:00/03:00/00:05 sudah terpakai. Pola unschedule-dulu agar idempoten.

**Sengaja tidak**: menyentuh periode `draft`; auto-finalisasi (ireversibel per [[score-period-immutability]], tidak boleh dipicu timer); eskalasi ke atasan; kanal email/WA.

**Verifikasi**: kontrak `0081_period_closing_reminder_contract.sql` **7/7 PASS** — termasuk T-N-2 (memicu di H-7/H-3/H-1, **diam** di H-5/H-2), T-N-4 (3× panggil → tetap 1 baris), T-N-5 (draft & closed tidak di-nudge), T-N-6 (staff tanpa izin tidak menerima), T-N-7 (ACL emitter + regresi whitelist push). `tsc` bersih, lint 0 error.

**Gotcha menambah tipe notifikasi** (9 titik, semuanya wajib): constraint DB → `NOTIFICATION_TYPES` → `NOTIFICATION_TYPE_LABEL` → `NOTIFICATION_TYPE_TONE` → `notificationTypesForTab` (jangan biarkan orphan) → `TYPE_ICON` → `inlineAction` → `is_push_worthy` + `PUSH_WORTHY_TYPES` → test. Tiga `Record<NotificationType, …>` membuat `tsc` menangkap yang terlewat, tetapi tab-mapping dan `inlineAction` **tidak** — keduanya gagal diam-diam.


## [2026-07-21] update | BL-04 — cascade MBR menyeluruh + rekonsiliasi penamaan baris aturan

- **Temuan yang mengubah bentuk tiket.** BL-04 masuk sebagai "cakupan guard UI kurang" (1 dari 6 tombol ter-guard). Verifikasi terhadap DB staging menunjukkan akarnya di lapisan data: rename `0045` menggeser nama tabel kartu, `0046`/`0065` menulis ulang RPC ke penamaan baru, tapi isi `minimum_breakdown_rules` tidak pernah ikut dipindah. Hasilnya **3 dari 6 cabang** `check_minimum_breakdown_compliance` tidak menemukan baris aturannya (`goal→strategy`, `action_plan→task`, `problem_statement→action_plan`) dan fail-open permanen — memasang guard UI saja akan menghasilkan no-op senyap yang sama persis dengan yang dilaporkan.
- **Jebakan penamaan ternyata terbalik dari dugaan awal.** Komentar `CardType` di `settings-mbr.ts` ("`kpi_area` = level Strategi") menggambarkan keadaan **pra-0046**; RPC sekarang tidak mengenal `kpi_area` sama sekali dan memakai `strategy` untuk level Strategi. Pemetaan cascade karena itu ditulis eksplisit di `mobile/src/lib/mbr-cascade.ts` dan dikunci tes yang membandingkannya dengan hierarki independen — bukan dicocokkan dari string mentah.
- **Dua cacat lain tersingkap saat verifikasi.** (a) `activate_problem_statement` menghitung `public.initiatives WHERE problem_statement_id`, kolom yang hanya ada di `action_plans` — dibuktikan di staging dengan `42703`; laten karena mode default tak pernah menyentuh cabang itu, tapi menjadi kegagalan total begitu aturan PS diset `blokir_aktivasi`. (b) `check_minimum_breakdown_compliance` masih memegang PUBLIC EXECUTE, sisa `DROP ... CASCADE` di `0046` — kelas bug yang sama yang melahirkan contract `0066`.
- **Perbaikan gerbang mode.** Guard cascade lama hanya melihat `is_compliant`, sehingga `hanya_peringatan` dan `blokir_aktivasi` ikut menahan tombol tambah. Kini hanya `blokir_akses_turunan`; ketiga mode lain dikunci tes di kelima aturan.
- PR: #141
- Files created: `supabase/migrations/0082_mbr_rule_naming_and_ps_activation.sql`, `supabase/tests/0082_mbr_rule_naming_contract.sql`, `mobile/src/lib/mbr-cascade.ts` + tesnya.
- Files updated: `mobile/src/screens/workspace-screen.tsx` (4 tombol ter-guard, dari 1), `mobile/src/lib/settings-mbr.ts` (label `kpi_area` dibedakan — Settings sebelumnya merender dua kartu "Strategi → Strategi").
- Pages updated: [[feature-gap-backlog]] (baris BL-04 → DONE, §2 triage, §4 baru berisi keputusan owner + akar + utang tersisa).
- **Verifikasi:** `npm test` 1624 passed / 131 suite; `npm run type-check` bersih; migrasi + contract test dijalankan di Postgres lokal nyata (5 blok PASS), termasuk uji idempotensi (re-apply tidak menggeser baris kedua kali).
- **Utang yang sengaja ditinggalkan (rinci di [[feature-gap-backlog]] §4.5):** penegakan `blokir_akses_turunan` sepenuhnya di klien — trigger `tg_enforce_mbr_block_child` tidak terpasang di tabel mana pun sejak `0046`, **dan** badan fungsinya meleset satu tingkat sehingga akan mengunci dirinya sendiri bila dipasang ulang apa adanya.


## [2026-07-22] update | Rekonsiliasi slot migrasi 0080–0082 (PR #118 / #120 / #141)

- **Masalah:** tiga PR terbuka sama-sama menomori migrasinya `0080`. Slot dibagi ulang menurut umur PR: **#118 → `0080`** (revoke anon/PUBLIC 4 RPC submit/review), **#120 → `0081`** (pengingat periode skoring, B-1), **#141 → `0082`** (penamaan baris aturan MBR + aktivasi PS, BL-04). Urutan merge mengikuti nomor.
- **Jebakan saat menggeser #141:** migrasinya memakai prefiks sentinel dua fase `mig0080__`, dan Fase B membuangnya lewat `substring(... from 10)` — offset hardcoded. `mig0082__` sama-sama 9 karakter sehingga offset tetap sahih; prefiks dengan panjang berbeda akan merusak seluruh nama baris aturan tanpa error. ID assertion kontrak ikut digeser ke `0082-DB-1..5`.
- **Rujukan "butuh migrasi 0080+"** untuk utang Activity Log (RPC `post_review_note`, lihat [[ui-prototype-gap]] §2.2) sudah usang begitu slot 0080–0082 terpakai — diperbarui jadi **`0083+`** di [[feature-gap-backlog]] dan [[ui-prototype-gap]]. Entri log lama sengaja **tidak** diubah: log ini append-only, dan klaim itu benar pada saat ditulis.
- **Catatan CI:** ketiga PR ini tidak mendapat sinyal otomatis — GitHub Actions berhenti jalan sejak 2026-07-21 (kuota) dan `.circleci/config.yml` memfilter semua job ke `only: [main, staging]`, sehingga branch fitur tidak terjamah. `mergeStateStatus=CLEAN` berarti "tidak ada required check", bukan "check hijau". Verifikasi ketiganya dilakukan lokal (migrasi + contract test di Postgres nyata, `jest`, `tsc`, `lint`).


## [2026-07-22] update | BL-02 selesai — Strategi mewarisi periode Goal induk (PRD §44 AC-11 PASS)

- **Pemicu:** BL-02 di [[feature-gap-backlog]] — satu-satunya pelanggaran AC harfiah terhadap PRD yang tersisa. PRD §12.1 (baris 540-544) menyatakan *"Strategy tidak punya masa berlaku sendiri karena mengikuti Goal tahunan"*, tetapi `strategy/new.tsx` merender `DateRangeField` editable dan mengirim ketikan user sebagai `period_start`/`period_end`. Goal induk sudah di-fetch tapi hanya `goal_template_id` + `pic_id` yang dibaca.
- **Perubahan:** `DateRangeField` + state periode dicabut dari form; periode disalin dari Goal induk saat submit; nilai warisan tampil **read-only** lewat token `Field` (DESIGN §7).
- **Keputusan desain 1 — tampilkan, jangan sembunyikan.** Periode ikut menentukan status "periode lewat" dan kelayakan aktivasi. Bila ditetapkan diam-diam, user yang aktivasinya ditolak tak punya jalan menghubungkannya ke Goal. Ditampilkan beserta kalimat penjelas asalnya.
- **Keputusan desain 2 — Goal tanpa periode → blokir, bukan kirim NULL.** `activate_strategy` (0078) mem-gate `period_start`/`period_end` NOT NULL, jadi Strategy ber-periode NULL adalah Draft yang **tidak pernah bisa diaktifkan** dan errornya muncul jauh dari penyebabnya. Simpan diblokir di titik pembuatan dengan pesan yang menunjuk perbaikan sebenarnya.
- **Keputusan desain 3 — warisan disalin saat pembuatan, bukan dibaca ulang saat render.** Kolom `strategies.period_*` tetap material karena gate aktivasi membacanya dari baris Strategy. Konsekuensi yang **diterima secara sadar**: mengubah periode Goal tidak mem-backfill Strategi yang sudah ada. Itu di luar cakupan AC-11 dan butuh keputusan produk sendiri.
- **Temuan verifikasi yang layak dicatat:**
  - `strategies.period_start/end` **nullable** (0010) — hanya ada CHECK urutan. Yang mengikat adalah gate aktivasi, bukan constraint kolom. Jangan mengandalkan NOT NULL yang tidak ada.
  - `activate_strategy` didefinisi ulang **3×** (0010 → 0024 → **0078 = yang berlaku**). Ketiganya mem-gate periode; membaca 0024 saja memberi gambaran usang (masih memakai `kpi_area_id` pra-reposisi).
  - **Nol permukaan lain** mengedit periode Strategy: `DraftCompletion` di `strategy/[id].tsx` hanya target + PIC, `[id].tsx:273` cuma menampilkan. Tipe `StrategyPatch` masih mengizinkan `period_*` tapi nol call-site UI — AC tertutup penuh, bukan setengah.
  - **Nol tes lama dihapus.** Tidak ada file tes untuk `strategy/new.tsx` sebelum ini; `workspace.test.tsx` hanya menguji routing. Tes baru `[BL02-1..3]` yang mengunci kontrak.
- **Jebakan tes yang ditemukan (berguna untuk file tes layar berikutnya):** di setup ini `screen` belum terikat sampai tick berikutnya — akses langsung setelah `render()` melempar *"render function has not been called"*; pakai `await render(...)` (pola `[E0]` di `inbox/[roomId].test.tsx`). Juga `fireEvent.changeText` butuh flush eksplisit sebelum event berikutnya, kalau tidak submit membaca state kosong. Assert periode wajib `findBy*`, bukan `waitFor(getGoal dipanggil)` — "dipanggil" hanya berarti query start, dan versi pertama tes ini lolos sendirian tapi merah di suite penuh persis karena itu ([[ci-flake-test-ci]]).
- Pages updated: [[feature-gap-backlog]] (BL-02 → dicoret + DONE #140; §2 triage; catatan ambang P-slot).
- Files updated: `mobile/src/app/(app)/strategy/new.tsx`, `mobile/src/app/(app)/strategy/__tests__/new-period-inherit.test.tsx` (baru).
- **Verifikasi:** `npm test` 131 suite / 1592 tes hijau · `npm run type-check` bersih · `npm run lint` 0 error. PR #140 → `staging`. Nol migrasi.

## [2026-07-22] update | BL-02 dijalankan live — copy periode dipecah jadi 4 state

- **Pemicu:** menjalankan layar `strategy/new` di app lokal (Expo web + Supabase lokal), bukan hanya jest. Dua temuan yang tidak mungkin muncul dari unit test.
- **Temuan 1 — copy menuduh hal yang salah.** Form menampilkan "Goal induk belum punya periode" padahal Goal-nya punya periode; yang terjadi RLS menyaringnya habis. `getGoal` memakai `maybeSingle()` sehingga **Goal tak terbaca dan Goal berperiode kosong sama-sama pulang sebagai `null`** — indistinguishable kecuali `data` diperiksa terpisah dari `data.period_*`.
- **Perbaikan:** state periode dipecah eksplisit (`PeriodState` + tabel `PERIOD_COPY`): `loading` · `error` (koneksi, bukan data Goal) · `unreachable` (dihapus / di luar akses) · `no-period` (isi periode di Goal). Keempatnya tetap memblokir simpan — yang berubah hanya perbaikan yang ditunjuk. Judul + isi `Alert` membaca tabel yang sama supaya teks layar dan dialog tidak bisa lepas sinkron.
- Tes `[BL02-4]` (`getGoal → null`) dan `[BL02-5]` (`getGoal` reject) mengunci keduanya, **berikut assert negatif** bahwa copy "belum punya periode" tidak muncul di kedua state itu.
- **Temuan 2** — akar penyebab tampilan salah itu ternyata seed lokal, dicatat terpisah di entri berikutnya.
- **Verifikasi:** `npm test` 131 suite / **1594** tes hijau · type-check bersih · lint 0 error. Ketiga state reachable dicek langsung di app.
- Files updated: `mobile/src/app/(app)/strategy/new.tsx`, `mobile/src/app/(app)/strategy/__tests__/new-period-inherit.test.tsx`. PR #140.

## [2026-07-22] fix | Seed lokal: profil & data terpisah org — dua aturan pemilihan org yang bertabrakan

- **Gejala:** login `ceo@rencan.local` berhasil, tapi Workspace **kosong** dan layar turunan melaporkan Goal tidak ditemukan. Bukan bug app dan bukan bug RLS — profil CEO memang berada di org berbeda dari Goal-nya. Kegagalan **senyap total**: nol error, data hanya tampak hilang.
- **Akar masalah — dua aturan yang tidak pernah disepakati:**
  - Baris data seed memakai `(select id from public.organizations limit 1)` **tanpa `order by`** → non-deterministik begitu ada lebih dari satu org (51× di `seed_dummy.sql`, 14× di `seed_scenario_close.sql`).
  - Profil **tidak lewat ekspresi itu sama sekali** — dibuat trigger `handle_new_user` yang memakai `order by created_at limit 1` (org **tertua**).
- **Pemicu yang membuatnya meledak:** DB contract tests menyuntikkan `Contract Fixtures Org` + `DCR-05 Fixtures Org` dengan `created_at` **epoch 1970**. Org fixture otomatis MENANG aturan "tertua", jadi setiap profil yang dibuat sesudah contract test dijalankan mendarat di org fixture, sementara data seed mendarat di tempat lain.
- **Perbaikan:** satu temp table `_seed_org` (`on commit drop`) me-resolve org **sekali**, deterministik — `Nyantuy Group` (org kanonik migrasi 0001, satu-satunya dengan set `role_templates` lengkap `ceo/c_level/management/staff`), fallback org tertua, `raise` bila nihil. Semua 65 call-site membacanya.
- **Dua detail yang ikut menentukan benar/tidaknya:**
  - `seed_dummy.sql` kini **ikut men-set `profiles.organization_id`** — menyamakan profil dengan datanya sekaligus **memperbaiki profil yang terlanjur salah org** dari run lama. File tetap idempoten, jadi menjalankan ulang = obatnya.
  - `role_template_id` diturunkan dari `_seed_org`, **bukan** `p.organization_id`; kalau tidak ia tetap menunjuk role_template milik org lama setelah profil dipindah.
  - `seed_scenario_close.sql` mencerminkan org dari profil CEO dummy agar otomatis mengikuti ke mana pun `seed_dummy` menaruhnya — bukan menurunkan sendiri.
- **Sengaja TIDAK disentuh:** `seed_staging.sql` (sudah memakai id org eksplisit); `supabase/tests/*` yang juga memakai `limit 1` tanpa urutan — fixture memang berhak punya org sendiri; dan `handle_new_user` — aturan "org tertua" miliknya adalah perilaku app, hanya salah karena fixture mem-backdate `created_at`. Mengubahnya di sini akan melebar dari perbaikan seed. **Utang terbuka**, layak ditinjau terpisah.
- **Verifikasi:** `seed_dummy.sql` jalan 2× (idempoten) → 6 profil `@rencan.local` semuanya di Nyantuy Group dengan level role benar; goals/strategies/tasks/profiles satu org; `seed_scenario_close.sql` jalan bersih sampai `close_period_snapshot`. Di app, `ceo@rencan.local` kini melihat 2 Goal + 4 Strategi (sebelumnya kosong).
- Files updated: `supabase/seed_dummy.sql`, `supabase/seed_scenario_close.sql`. Nol migrasi, nol perubahan `mobile/`. PR #140.


## [2026-07-22] update | BL-09(b) selesai — baris arsip bisa dibuka; BL-09 tertutup; slot `actions` di SectionCard

- **Perbaikan.** Baris di Settings > Arsip mati: kartu dirender sebagai `<SectionCard>` telanjang, jadi satu-satunya kontrol adalah "Pulihkan ke Draft" dan user tak bisa memeriksa isi card sebelum memutuskan. Pola navigasi dari `search.tsx` dipakai ulang apa adanya — `ENTITY_ROUTE_SEGMENT` + fallback `undefined` supaya kartu tetap **non-pressable** alih-alih push path rusak saat tipe entitas tak punya segmen.
- **Verifikasi pra-coding (dua pertanyaan yang bisa membatalkan tiket).** (1) Ketujuh `entity_type` yang bisa dikembalikan `search_cards` (`0046:2128-2153`, tujuh cabang `union all`) seluruhnya terpetakan dan tiap segmen punya direktori rute nyata — sama persis dengan 7 filter chip layar ini. Fallback tetap dipertahankan sebab `SearchResult.entity_type` bertipe `string`, bukan `CardEntityType`. (2) Ketujuh layar detail — bukan hanya dua — mengambil card lewat `maybeSingle()` **tanpa filter status**, dan `PLANNING_STATUS_LABEL`/`INITIATIVE_STATUS_LABEL`/`ACTION_PLAN_STATUS_LABEL` + `STATUS_TONE` semuanya punya entri `archived`. Card terarsip merender halaman baca-saja bernas: badge "Diarsipkan", metadata, turunan, activity log — CTA aksi tak muncul karena digerbangi `status === 'draft'`. Tidak ada layar yang error atau jatuh ke empty state, jadi navigasi ini tidak mengarah ke tampilan rusak.
- **A11y.** `SectionCard` dapat prop `accessibilityLabel` opsional. Kartu pressable sebelumnya hanya punya `accessibilityRole="button"` tanpa label — DESIGN §4.4 mewajibkan keduanya, dan tanpa label screen reader cuma membaca gabungan teks anak sehingga tujuan tap tidak jelas.
- **Cacat a11y yang tersingkap — diperbaiki di akar, bukan dihindari.** `Pressable` RN default `accessible={true}`; di iOS itu meleburkan seluruh anak jadi **satu** elemen a11y, jadi tombol yang bersarang di kartu pressable berhenti bisa difokus VoiceOver dan aksinya **tak terjangkau**. Kelas kegagalan diam: jari tetap bisa menekan tombolnya, jadi lolos QA visual. `SectionCard` diberi slot **`actions`** yang dirender sebagai *sibling* region pressable — padding/border pindah ke wadah statis, region pressable menyisakan `gap-2` supaya jarak visual tak bergeser. Survei seluruh `src/`: dari **10** pemakaian `SectionCard` ber-`onPress`, tepat **2** yang menyarangkan kontrol (`settings-archive.tsx` "Pulihkan ke Draft"; `task/[id].tsx` `InstanceRow` "Submit Bukti & Nilai Hasil") — keduanya dipindah; delapan sisanya murni teks/badge. Aturan didaftarkan di **DESIGN §4 aturan 6** + tabel §6 supaya mengikat untuk kontainer pressable buatan sendiri juga.
- **`accessibilityLabel` sengaja opsional.** Tanpa label RN membacakan gabungan teks anak, yang untuk kartu ringkas (`search.tsx`, `InstanceRow`) justru lebih kaya. Begitu label eksplisit dipasang ia **menutup** teks anak dari pembacaan — karena itu label baris arsip memuat tipe & status: `Buka detail <nama>, <tipe>, diarsipkan`.
- **Regresi yang ditangkap tesnya sendiri.** `actions` mula-mula hanya dirender di cabang pressable, sehingga baris dengan entity type tak terpetakan justru **kehilangan tombol Pulihkan**-nya — persis populasi yang paling butuh. Ditangkap `[UI-SC-5]` sebelum commit; cabang statis kini ikut merender `actions`.
- PR: #144 (nol migrasi).
- Files updated: `mobile/src/app/(app)/settings-archive.tsx`, `mobile/src/app/(app)/task/[id].tsx`, `mobile/src/components/ui.tsx`, `DESIGN.md`, `mobile/src/components/__tests__/ui-feedback.test.tsx`, `mobile/src/app/(app)/__tests__/fase8-settings-screens.test.tsx`.
- Pages updated: [[feature-gap-backlog]] (baris BL-09 → DONE + §2 triage + catatan penutup di callout "BL-09 bukan satu bug").
- **Verifikasi:** `npm test` **1634 passed / 131 suite**; `npm run type-check` bersih; `npm run lint` 0 error. Tes baru: `[F8-UI-29]` tipe terpetakan → `push('/action-plan/a1')` (sekalian mengunci bahwa `action_plan` memetakan ke segmen ber-tanda-hubung); `[F8-UI-30]` tipe tak terpetakan → tak ada kontrol "Buka detail", `push` tak pernah dipanggil, tombol Pulihkan tetap ada; `[F8-UI-31]` tombol Pulihkan tetap target a11y terpisah; `[UI-SC-1..5]` di `ui-feedback.test.tsx`, dengan `[UI-SC-3]` sebagai assertion **struktural** lewat `within()` (tombol `actions` bukan keturunan region pressable).
- **Jebakan harness (bukan cacat produk).** Menekan `Pressable` `react-native-css` ber-varian `active:` membuat render **berikutnya** di file tes yang sama jadi kosong (`toJSON()` → `null`). Direproduksi terisolasi, lalu dilokalisasi ke urutan tes: `[UI-SC-5]` ditempatkan sebelum tes yang menekan region pressable. Tidak ada penyusunan ulang kode produksi yang mengubahnya — jangan buang waktu men-debug komponennya kalau pola ini muncul lagi.
- **BL-09 kini tertutup seluruhnya**: (a) gugur saat verifikasi, (c) di #119, (b) di #144. Satu baris backlog berisi tiga klaim berbeda menghasilkan satu klaim palsu, satu bug diam, dan satu cacat UX — argumen memverifikasi tiap klaim sebelum menjadwalkan, bukan menaksir tiket secara utuh.


## [2026-07-22] update | BL-13 selesai — gate CI untuk `violation_type` (opsi 3), opsi CHECK & tabel lookup ditolak

- **Keputusan: opsi 3 — gate CI, nol perubahan schema.** Wiki mencatat dua opsi (CHECK constraint; tabel lookup + FK) dan menyimpulkan opsi 2 menang karena "menjadikan drift dapat diuji, bukan sekadar dilarang". Opsi ketiga — test jest yang mem-parse `supabase/migrations/*.sql` lalu membandingkannya dengan `GOVERNANCE_VIOLATION_TYPE_LABEL` — memenuhi kriteria yang sama persis dengan ongkos dua file test-only.
- **Kenapa opsi 2 ditolak, bukan sekadar "lebih mahal".** Ia mem-verifikasi peta label terhadap **isi tabel seed**, yang tetap salinan manual dari literal di body PL/pgSQL — jadi rantai duplikasinya cuma bergeser satu langkah, tidak putus. Migrasi yang menambah emitter tanpa menambah baris seed tetap lolos CI dan baru gagal saat **runtime produksi** (FK menolak INSERT-nya), pada tabel best-effort yang beberapa emitter-nya berada tepat di jalur `raise exception` — kegagalan tulis governance di sana bisa menelan pesan penolakan yang sebenarnya. Opsi 3 mem-verifikasi terhadap kode emitter itu sendiri, yaitu tempat nilainya benar-benar lahir.
- **Kenapa opsi 1 ditolak.** CHECK constraint hanya melarang; peta client tak pernah ikut tahu, jadi degradasi diam-diam yang jadi keluhan BL-13 tidak tersentuh. Ia juga menuntut migrasi ALTER per tipe baru dan harus terus meloloskan tipe lama yang sudah pensiun.
- **Pelajaran scoping.** Kedua opsi yang tercatat berupa perubahan DB karena gap-nya *dibingkai* sebagai gap schema ("kolom `text` tanpa constraint"). Dibingkai ulang sebagai "drift antara dua artefak yang sama-sama bisa dibaca CI", ongkosnya turun dari migrasi + seed + RLS + FK pada tabel append-only yang panas menjadi dua file test. Pembingkaian gap ikut menentukan ruang solusi yang terlihat.
- **Parser = seluruh risikonya, jadi direkonsiliasi bukan dipercaya.** Dua jalur emisi wajib ditangkap; menangkap satu saja menghasilkan gate hijau yang buta separuh permukaan. Jalur A `insert into public.governance_violations (…) values (…)` → **21 site literal**; jalur B `perform public.log_governance_violation(uid, '<tipe>', …)` → **14 site literal**. Hasil: **tepat 11 tipe**, cocok dengan hitungan audit BL-12. Splitter sadar kurung bersarang (`jsonb_build_object(…)`) dan escape `''`, dan mengambil `violation_type` secara **posisional** dari daftar kolom (5 bentuk daftar kolom berbeda ada di repo, termasuk yang tanpa `entity_type`/`entity_id`).
- **Kemunculan yang bukan call-site dibuang di parser**, bukan di-allowlist: `create … function log_governance_violation(` dan `revoke execute on function …(` daftar argumennya berisi nama tipe (`uuid, text, …`), yang tanpa filter akan tampil sebagai tiga site "dinamis" palsu dan mengencerkan allowlist sampai tak bermakna.
- **Site non-literal memerahkan test, tidak dilewati.** Emitter dinamis (`v_type`, `case … end`) tak bisa diketahui statis; `[BL13-6]` menuntut tiap ekspresi non-literal ada di allowlist yang sudah ditinjau. Ini backstop untuk helper emisi **baru** juga — body-nya tertangkap jalur A sebagai ekspresi non-literal. Satu-satunya allowlist hari ini: `p_violation_type` di body helper 0019.
- **Daftar tipe sengaja tidak ditulis ulang di test** — itu akan jadi salinan manual ketiga. Yang dijaga: lantai jumlah site **per jalur** (bukan total, supaya satu jalur mati tidak tertutupi jalur lain), ≥11 tipe, `emitted ⊆ label map`, `label map \ emitted ⊆ KNOWN_UNEMITTED`, dan allowlist non-literal. Daftar hardcoded 11 tipe di test BL-12 diganti keluaran parser → **peta label kini satu-satunya salinan manual yang tersisa**.
- **`minimum_breakdown_not_met`**: dipertahankan di peta (pertahanan untuk baris lama) tapi dikecualikan lewat `KNOWN_UNEMITTED` ber-komentar — ia hanya ada di `supabase/tests/fase5_minimum_breakdown_rules_contract.wip.sql`; 0011 hanya `RAISE` pada gate-block tanpa menulis baris. Label yatim **lain** tetap memerahkan `[BL13-5]`.
- **Gate dibuktikan merah, bukan diasumsikan.** Empat skenario drift disuntik ke migrasi scratch/peta lalu dicabut: tipe palsu lewat jalur A → `[BL13-4]` merah; tipe palsu lewat jalur B → `[BL13-4]` merah; emitter dinamis → `[BL13-6]` merah; label yatim di client → `[BL13-5]` merah. Tiap skenario memerahkan assertion yang tepat, bukan sekadar "ada yang merah".
- **Batas yang diterima & sinyal re-open.** Gate menjaga sinkronisasi migrasi↔client, bukan integritas data di DB — nilai sampah yang ditulis di luar migrasi tetap masuk. Opsi 2 kembali ke meja hanya bila audit menuntut himpunan tipe yang *enumerable dari DB*.
- PR: #145 (nol migrasi, nol perubahan runtime — dua file test-only + satu komentar).
- Files created: `mobile/src/test-support/governance-violation-types.ts`, `mobile/src/lib/__tests__/governance-violation-types.contract.test.ts`.
- Files updated: `mobile/src/lib/__tests__/activity-governance.test.ts` (daftar hardcoded → keluaran parser), `mobile/src/lib/activity-governance.ts` (komentar peta menunjuk ke gate; daftar nomor migrasi yang sudah basi dicabut — ia menyebut 0063/0064 yang tak pernah meng-emit dan melewatkan 0067/0068/0072/0078 yang meng-emit).
- Pages updated: [[feature-gap-backlog]] (baris BL-13 → DONE, §BL-13 ditulis ulang jadi keputusan + bukti, §2 triage, utang penutup §BL-12), [[index]].
- **Verifikasi:** `npm test` **1645 passed / 133 suite**, `npm run type-check` bersih, `npm run lint` 0 error.


## [2026-07-22] update | BL-15 — tiga kegagalan senyap di `create-user` jadi terlihat pemanggil

- **Asal: turunan investigasi BL-14 (#146).** Investigasi itu memperkecil taksiran risiko trigger (tidak ada signup publik; `create-user` mengoreksi org-nya sendiri) tapi menemukan koreksi itu **best-effort dan senyap saat gagal**. Tiga cabang berakhir sama: user di org warisan trigger, HTTP 200, pemanggil tidak diberi tahu.
- **Keputusan bentuk: sukses + field `warning`, bukan menggagalkan request.** Di titik koreksi row `auth.users` sudah terlanjur ada, jadi 5xx menghasilkan akun hantu — ada di DB, tak terlihat admin, dan retry-nya pasti mentok `409 email_exists` tanpa jalan maju. Kompensasi `admin.deleteUser` berarti menghapus akun yang sebenarnya valid demi kegagalan sekunder, dan punya mode gagalnya sendiri yang lebih buruk. Akun tetap nyata dan bisa login; yang gagal hanya penempatannya, dan itu bisa dibetulkan manual lewat User & Permission.
- **Syarat yang membuat pilihan itu sah: field-nya wajib dipakai pemanggil.** Field respons yang ditelan call-site cuma versi lain dari log yang tak terlihat — cacat yang sama, tempat berbeda. Karena itu rantainya ditutup sampai layar, bukan berhenti di function.
- **Kontrak respons.** `200 { user_id, requestId, warning }`; `warning: null` pada jalur benar, atau `{ code, message }` dengan `code` ∈ `actor_org_missing` | `role_template_missing` | `profile_role_pin_failed`. `message` = copy Indonesia terkurasi (WSA-18 — user tidak melihat detail teknis), `code` untuk diagnosa. **Semua `log()` yang ada dipertahankan**; ini soal respons, bukan pengganti log. Log `user_created` dapat field `placement` (`ok` atau kode kegagalan).
- **Hole 1 dulunya bahkan tidak punya log.** `if (orgId)` melewati seluruh blok koreksi tanpa jejak apa pun. Sekarang `log('error','actor_org_missing')` + warning. Dua hole lain sudah punya log; yang ditambahkan adalah jalannya ke pemanggil.
- **`role_template_missing` sengaja tidak menulis `organization_id` sendirian.** Menggeser org tanpa role-nya menghasilkan profil dengan `role_template_id` milik org lain — inkonsistensi silang-org yang lebih sulit didiagnosis daripada dibiarkan utuh lalu dilaporkan. Update tetap atomik: dua kolom atau tidak sama sekali.
- **UI merender warning sebagai hasil yang BERBEDA, bukan sukses dengan catatan.** Judul Alert "User dibuat — perlu diperiksa", banner inline persisten (Alert satu kali tidak cukup — sinyalnya hilang begitu ditutup), dan **tidak** `router.back()` — mengikuti pola jalur error yang sudah ada di layar itu (`[U-UI-08]`).
- **Guard permission/anti-eskalasi tidak disentuh** (`has_permission('manage_users_permissions')`, blok `c_level` non-CEO, role `ceo` tak tersedia). Trigger `handle_new_user` juga tidak disentuh — owner mengunci single-org untuk V1; arah perbaikan trigger tetap keputusan terbuka di BL-14.
- **DEPLOYED 2026-07-22.** Edge Function tidak ikut ter-deploy oleh merge; ia butuh langkah sendiri. `create-user` **v1 → v2** di project staging `fhnqwytqprsptjshoxfn`, status ACTIVE, `verify_jwt` tetap `true`. Sumber terpasang diverifikasi identik dengan file repo; v1 yang ditimpa juga diverifikasi identik dengan `origin/staging`, jadi tidak ada drift yang tertimpa diam-diam.
- **Jalur deploy: Supabase MCP, BUKAN `supabase link`.** CLI `link` menuntut access token + prompt interaktif yang tidak tersedia di sesi headless. `deploy_edge_function` lewat MCP menembak project yang sama tanpa perlu link. Catatan ini mengoreksi asumsi lama "deploy butuh `supabase link`".
- **Urutan merge/deploy tidak punya jendela rusak ke arah mana pun.** Server baru mengirim `warning: null` pada jalur benar sehingga client lama mengabaikannya; server lama tidak mengirim `warning` sehingga `readWarning` mengembalikan `null`. Deploy mendahului merge di sini, dan itu aman.
- PR: (lihat header PR) — nol migrasi, nol perubahan schema.
- Files updated: `supabase/functions/create-user/index.ts`, `mobile/src/lib/users-admin.ts`, `mobile/src/app/(app)/settings-user-new.tsx`, `mobile/src/lib/__tests__/users-admin.test.ts`, `mobile/src/app/(app)/__tests__/settings-user-new.test.tsx`.
- Pages updated: [[feature-gap-backlog]] (baris BL-15 baru → DONE, §BL-15 keputusan + batas).
- **Verifikasi:** `npm run type-check` bersih; `npm run lint` 0 error (0 warning di file yang disentuh); jest suite terdampak hijau — `users-admin` 7/7 (`[U-LIB-05..07]` baru: warning diteruskan, `message` kosong → fallback, bentuk asing → `null`), `settings-user-new` 9/9 (`[U-UI-09]` baru: alert beda + banner inline + tidak kembali). Edge Function tidak punya harness tes di repo dan `deno` tidak terpasang di mesin ini — kebenarannya bersandar pada review + tes call-site.
## [2026-07-22] update | BL-14 — keputusan single-org turun; guard `RAISE` polos DIHENTIKAN sebelum ditulis (nol migrasi)

- **Keputusan owner.** V1 dikunci **single-org**. `handle_new_user` tidak boleh lagi menebak organisasi diam-diam; ia harus gagal keras begitu asumsinya tidak berlaku. Pertanyaan produk yang menggantung di baris BL-14 sejak audit 2026-07-20 tertutup — tidak ada lagi `[?]` soal "apakah V1 memang single-org".
- **Implementasi dihentikan di gerbang verifikasi, sesuai instruksi tiket.** Bentuk yang diminta (`RAISE` bila `count(*) from public.organizations > 1`) **tidak jadi ditulis**: ia mematikan seluruh gate DB contract test. Nol migrasi dikirim di PR ini.
- **Bukti.** `scripts/ci/run-db-contract-tests.sh` memakai **satu database bersama tanpa reset antar file**, menerapkan prelude `supabase/tests/_fixtures.sql` lebih dulu, dan memperlakukan kegagalan prelude sebagai **FATAL** (`exit 1`). Prelude itu sendiri membuat **2 org** — baris 43 (`Contract Fixtures Org`, `created_at='epoch'`) dan baris 87 (`DCR-05 Fixtures Org`, `epoch + 1s`) — lalu menyisipkan `auth.users` di baris **100**, yaitu **sesudah** org kedua ada. Guard raise di baris 100 → nol contract file jalan. Bukan "beberapa test merah": gate-nya nol.
- **Dan tidak berhenti di prelude.** Karena prelude commit dan tak ada reset, `count(*) organizations ≥ 2` jadi **permanen** untuk sisa run, sehingga tiap `insert into auth.users` berikutnya ikut raise. Di luar `*.wip.sql`: **18 file** menyisipkan `auth.users`, **12** di antaranya membuat org tambahan sendiri.
- **Kenapa ini bukan fixture yang tinggal dirapikan.** Lima dari 12 file itu adalah suite **cross-org isolation** (`0039`, `0067`, `0068`, `0063_push_ac_fan6_cross_org`, `0079`; plus `0073` yang membuat 3 org tanpa `auth.users`) yang *harus* punya dua org untuk menguji hal yang mereka uji. Guard yang melarang org kedua eksis dan test yang mensyaratkan org kedua eksis tidak bisa hidup di satu database.
- **Definisi yang hidup dikoreksi.** Body `handle_new_user` yang berlaku ada di **`0015_qa_followup_fixes.sql:45`**, bukan `0001` seperti tercatat di baris backlog. 0015 menambahkan penghormatan pada `raw_app_meta_data->>'role_level'`; pemilihan **org** tak berubah sejak 0001. `0002`/`0003`/`0066` hanya menyentuh GRANT. Catatan untuk implementasi nanti: wajib `create or replace` — `drop … cascade` mereset ACL ke `PUBLIC EXECUTE` (membatalkan REVOKE 0003 + 0066) sekaligus melepas trigger `on auth.users`.
- **Akar biaya yang tersingkap.** Yang mahal bukan trigger-nya, melainkan **ketergantungan test suite pada fallback diam "org tertua"** — 18 file mengandalkan `auth.users` berubah jadi profil tanpa pernah menyebut org. Perilaku yang dinilai terlalu berbahaya untuk produksi ternyata dipakai fixture sebagai kenyamanan.
- **Tiga opsi didokumentasikan, rekomendasi opsi 2** (jalur eksplisit `raw_app_meta_data.organization_id` + `RAISE` hanya sebagai fallback, lalu prelude + 18 file test disetel eksplisit; ukuran M, mekanis). Opsi 3 (penegakan di luar runtime, assertion `count(*) = 1` terhadap staging/produksi) layak bila lebar diff fixture dinilai terlalu berisiko. Keputusan bentuk = milik owner.
- **Batas verifikasi.** Analisis ini **statis** — pembacaan `_fixtures.sql` + runner CI; tidak ada database lokal yang jalan di sesi ini, jadi kegagalannya tidak dieksekusi. Jalur baris 87 → baris 100 tidak punya cabang.
- **Di luar cakupan (sengaja):** tiga lubang kegagalan-diam di `supabase/functions/create-user/index.ts` — dilacak terpisah sebagai bugfix biasa.
- PR: #147 (nol migrasi, nol perubahan runtime — wiki-only); konteks investigasi #146.
- Pages updated: [[feature-gap-backlog]] (baris BL-14, §2 triage, §5 baru), [[log]].


## [2026-07-22] update | BL-14 selesai — opsi 2: penempatan org eksplisit + guard single-org (migrasi 0083)

- **Keputusan owner: opsi 2** dari tiga opsi yang di-scoping di PR #147. `handle_new_user` kini punya jalur penempatan **eksplisit** lewat `raw_app_meta_data.organization_id`, dan `RAISE` hanya sebagai fallback saat key absen **dan** org lebih dari satu. Opsi 1 (`RAISE` polos) sudah ditolak karena mematikan seluruh gate DB contract test; opsi 3 (assertion di luar runtime) ditolak karena tidak memenuhi bunyi keputusan "trigger gagal keras".
- **Lima cabang, nol tebakan.** Key ada + org terdaftar → dipakai. Key ada + bukan UUID → `RAISE` `22023`. Key ada + org tak terdaftar → `RAISE` `23503` (**bukan** fallback diam ke org tertua — itu justru bug aslinya dalam bentuk lain). Key absen + org > 1 → `RAISE` `P0001`, guard BL-14. Key absen + org ≤ 1 → **persis perilaku lama**.
- **`raw_app_meta_data` dipilih sebagai jalur, bukan kolom/parameter baru.** Ia hanya bisa di-set service_role / Admin API dan tidak bisa di-set user saat self-signup — pola yang sudah dipakai `role_level` sejak 0015 F-5, jadi tidak ada permukaan kepercayaan baru yang dibuka.
- **Kasus NOL org sengaja tidak diubah.** `profiles.organization_id` nullable (`0001:24`), jadi user pertama di database kosong tetap dapat profil ber-org NULL seperti hari ini. Gejalanya berbeda dan di luar cakupan BL-14; diff dijaga tetap satu ide.
- **`create or replace`, bukan `drop`+`create`.** `drop function ... cascade` akan mereset ACL fungsi ke `PUBLIC EXECUTE` (membatalkan REVOKE 0003 + 0066) **dan** ikut menghapus trigger `on_auth_user_created`, mematikan provisioning profil tanpa satu pun error. `T-BL14-8` mengunci keduanya sebagai backstop.
- **Biaya pemanggil, terukur: 21 file.** Prelude fixtures + 18 file contract test + 2 file seed. `seed_staging.sql` wajib ikut — ia membuat org 2 & 3 sendiri di PART 1, jadi tanpa perubahan PART 2-nya gagal total; 13 user-nya dipetakan ke org lewat prefix uuid (org1=3, org2=6, org3=4, cocok dengan komentar per-grup). `seed_dummy.sql` menitipkan `(select id from _seed_org)` sehingga profil mendarat di org yang sama dengan seluruh data file itu — menutup sisa utang yang sengaja ditinggalkan #140 ("trigger-nya belum").
- **Efek samping yang diinginkan.** Suite berhenti bergantung pada sihir "org tertua": fixture yang dulu menulis `auth.users` lalu memperbaiki org-nya lewat `UPDATE` susulan kini menyatakan org di muka. Tes jadi menguji penempatan, bukan menambalnya. Akar biaya perubahan ini memang di situ — 18 file mengandalkan fallback diam sebagai kenyamanan.
- **Kontrak baru** `supabase/tests/0083_handle_new_user_explicit_org_contract.sql`, `T-BL14-1..8`: (1) guard menolak tebakan + nol profil tertinggal; (2) **isi pesan** dikunci — harus menyebut sebab *dan* `raw_app_meta_data.organization_id`, bukan sekadar "ada raise", karena guard yang gagal membingungkan cuma menukar satu kegagalan diam dengan satu kegagalan lain; (3) penempatan eksplisit menang atas org tertua (memakai org DCR yang sengaja **bukan** yang tertua); (4) org hantu ditolak; (5) nilai non-UUID ditolak; (6) regresi `role_level` 0015; (7) **single-org tanpa key tetap jalan**, diuji dengan menyisakan tepat satu org di dalam transaksi ber-`rollback`; (8) ACL + trigger utuh.
- **Premis tes dibuat gagal-berisik, bukan lolos diam.** `T-BL14-1` menuntut fixtures benar-benar punya >1 org dan `T-BL14-3` menuntut org tertua benar-benar org fixtures; kalau fixtures suatu saat berubah, tes memberi tahu premisnya bergeser alih-alih hijau tanpa menguji apa pun.
- **Verifikasi: gate DB contract dijalankan (CircleCI).** Run pertama (build 107) **32 lolos, 1 gagal** — satu-satunya yang merah adalah kontrak baru itu sendiri di `T-BL14-7`. Seluruh 18 file contract yang disunting **lolos pada run pertama**, jadi migrasi + perubahan pemanggil terbukti benar; yang salah hanya teknik teardown tes barunya. Bukti bahwa kegagalan ini milik perubahan ini dan bukan warisan: `db-contract` **hijau** pada dua commit wiki-only di branch yang sama (build 98 & 95) dan pada `origin/staging` (build 89), lalu merah tepat pada commit yang membawa 0083.
- **Jebakan yang ditemukan: FK cascade ≠ DELETE boleh jalan.** `T-BL14-7` menyisakan satu org lewat `delete from public.organizations where id <> ...`. Sebelum menulisnya seluruh FK ke `organizations` diperiksa — semuanya `cascade`/`set null`, nol `restrict` — dan disimpulkan aman. Meleset: yang memblokir bukan constraint melainkan **trigger `before delete`** `tg_block_delete_append_only`, terpasang di **8 tabel** (0013/0014/0020/0021), sebagian target cascade dari `organizations`. Aturan yang bisa dipakai ulang: *"boleh di-cascade"* dijawab `pg_constraint`; *"boleh dihapus"* dijawab `pg_constraint` **dan** `pg_trigger`.
- **Perbaikannya data-driven, bukan daftar tabel.** Trigger dilepas dengan query `pg_trigger` by `tgfoid` (daftar hardcoded akan basi begitu tabel append-only ke-9 lahir) dan **hanya di dalam transaksi tes** — DDL Postgres transaksional, jadi `rollback` memasangnya kembali. Aturan append-only diperlakukan sebagai rintangan teardown, bukan dilonggarkan permanen.
- **Catatan lingkungan (bukan soal repo).** Suite ini tidak bisa dijalankan lokal di sesi tsb: Docker Desktop 4.82.0 di mesin dev crash saat start di Inference manager (`remove …/run/dockerInference: The file cannot be accessed by the system`) — socket AF_UNIX yatim yang tak bisa dihapus `fsutil`/`del \\?\`. `EnableInference=false` **tidak** menolong (log menunjukkan setting terbaca tapi manager tetap di-init). Workaround yang jalan: rename direktori `%LOCALAPPDATA%\Docker\run` (Docker membuat ulang) — tapi hanya bertahan satu siklus start. Tiga direktori `run.stale-*` yang sudah ada sebelumnya menunjukkan ini berulang. Verifikasi akhirnya lewat CI, yang memang gate sebenarnya.
- Files created: `supabase/migrations/0083_handle_new_user_explicit_org.sql`, `supabase/tests/0083_handle_new_user_explicit_org_contract.sql`.
- Files updated: `supabase/tests/_fixtures.sql` + 18 file contract test, `supabase/seed_dummy.sql`, `supabase/seed_staging.sql`.
- Pages updated: [[feature-gap-backlog]] (baris BL-14 → DONE, §2 triage, §5.1/5.4 keputusan, §5.6 baru berisi implementasi), [[log]].

## [2026-07-22] update | Spec BL-10 Search §38 (sdd-plan, 14 agen)

- Pages created: `specs/bl-10-search-scope-38.md` + `specs/bl-10-search-scope-38-tdd-handoff.json`
- Workflow `/sdd-plan` 4 fase (Research → Draft → Grill → Synthesize), 14 agen, nol error.
- **Keputusan arsitektur (FR-1):** SATU RPC multi-scope `search_global`, bukan fan-out per-scope. Alasannya bukan round-trip melainkan otorisasi — satu permukaan yang bisa dikunci satu berkas contract test; kegagalan parsial per-scope hilang by construction, sehingga tak ada banner degrade yang bisa jadi kanal sampingan.
- **Chat didelegasikan, bukan disalin** (FR-2): `search_chat_messages` dipanggil sebagai set-returning function di dalam `FROM`. Preseden mengikat: regresi 0060→0075 kehilangan limit clamp + guard + truncation karena `create or replace` penuh.
- **Bug ditemukan sepanjang jalan (FR-6):** `search_cards` (0046:2120) merangkai `'%'||lower(trim(q))||'%'` **tanpa escaping** → `%` yang diketik user jadi wildcard sungguhan. `search_global` wajib escape; `search_cards` sendiri tidak disentuh (NG-6).
- **Peringatan yang harus ikut migrasi (FR-7):** `search_global` SECURITY DEFINER + `search_path=''` berarti **RLS tabel tidak berlaku di dalamnya** — tidak ada jaring pengaman kedua. Komentar "RLS-scoped via RPC" di `search.tsx:1` menyesatkan dan dikoreksi.
- **Anti-oracle digeneralisasi per-grup** (FR-15/FR-16): dilarang differentiator yang merupakan fungsi data pihak lain — header grup kosong, "(0)", count per grup, total count, nomor halaman global, banner error bernama scope. Grup yang belum dirilis juga tidak dirender kosong (AC-16).
- **Rilis bertahap 4 PR:** PR-1 9/14 scope (7 card + chat + grouping + paging per-grup, migrasi 0084) → PR-2 People (0085) → PR-3 task_instance/comment/evidence (0086) → PR-4 audit scope (0087, paling akhir karena 2 keputusan owner belum final + menyentuh tabel append-only). Grouping ikut PR-1 tanpa pengecualian.
- **12 open question**, 4 blocking: BL10-OQ-01/02 (owner, blokir PR-4), OQ-03 (owner, blokir PR-3), OQ-04 (eng, blokir PR-4).
- **§11 mengoreksi premis yang beredar di draft awal** — a.l. "Activity Log & Governance Violation adalah data admin" TIDAK akurat (kedua policy ber-OR dengan self-row, 0005:557-565); "snippet chat sudah ≤240 char" salah (0075:57 mengembalikan body utuh); angka "90 hari" dan "staleTime 15 detik" tanpa dasar sumber, dibuang.
- Catatan proses: workflow mengembalikan spec sebagai nilai balik, **tidak menulis ke disk** — file di atas ditulis manual dari output. Perlu diingat untuk pemakaian `/sdd-plan` berikutnya.
## [2026-07-22] update | Rencana TDD BL-10 PR-1 (tdd-plan, 8 agen) — verdict "perlu-perbaikan"

- Pages created: `specs/bl-10-pr1-tdd-plan.md`
- Workflow `/tdd-plan` di-scope ke **PR-1 saja** (9/14 scope, migrasi 0084); 8 agen, nol error.
- **Verdict fase Grill: `perlu-perbaikan`** — 20 kasus belum tercakup + 14 kekhawatiran. Rencana TIDAK siap dieksekusi apa adanya; addendum kritik dilampirkan sebagai §9 karena markdown bawaan workflow tidak memuatnya.
- **Dua temuan false-green** (test lulus tanpa menguji apa pun) diprioritaskan: (1) test reduksi-RLS bisa hijau vakum — `RPC EXCEPT RLS` juga kosong saat RPC mengembalikan 0 baris karena bug, jadi butuh kontrol positif; (2) test escaping `search_global('%%')` menghasilkan pola yang tidak cocok apa pun sehingga hijau tanpa diskriminasi — butuh pasangan diskriminatif. Keduanya menyerang justru dua hal yang saya minta dipertajam.
- **Tiga kemungkinan gagal mekanis:** react-query v5 tidak menyimpan `staleTime` di `Query.options`; `SET LOCAL` di luar transaksi eksplisit = no-op berwarning; kontradiksi internal antara assertion `pg_get_functiondef` dan kewajiban komentar header migrasi.
- **Ditolak sejak awal:** mengunci NG-6 lewat `md5(prosrc)` — akan memerahkan perbaikan keamanan `search_cards` yang sah di masa depan dengan pesan membingungkan. Kunci perbedaan PERILAKU, bukan digest sumber.
- Temuan riset yang berguna: `search_chat_messages` adalah `language plpgsql` sehingga **tidak inlinable** — dieksekusi sebagai satu Function Scan ber-LIMIT internal, jadi predikat luar tidak bisa didorong masuk (menjawab sebagian BL10-OQ-11). Test delegasi bisa dibuat kuat lewat `create or replace` stub di dalam transaksi lalu `rollback` — bukti jauh lebih kuat daripada memeriksa `prosrc`.
- Fixture lintas-org sudah tersedia (`supabase/tests/_fixtures.sql`, dua organisasi). Catatan mengikat: sejak 0083 setiap INSERT `auth.users` WAJIB menyertakan `raw_app_meta_data.organization_id`, kalau tidak trigger `handle_new_user` raise dan seluruh suite gagal fatal.
- Catatan proses (kedua kalinya): workflow mengembalikan hasil sebagai nilai balik, **tidak menulis ke disk**, dan `markdown`-nya **tidak memuat critic** — keduanya harus dirakit manual.

## [2026-07-22] update | Slot migrasi BL-10 digeser 0084→0085 (hindari tabrakan dgn BL-07 #154)

- Pages updated: `specs/bl-10-search-scope-38.md`, `specs/bl-10-search-scope-38-tdd-handoff.json`, `specs/bl-10-pr1-tdd-plan.md`
- Spec BL-10 memesan 0084–0087 saat ditulis (terakhir di repo `0083`), tapi PR #154 (BL-07) sudah mengklaim `0084_bl07_notifications_missing_types.sql` dan belum merge. Keputusan owner: **BL-10 yang menggeser**, #154 tidak diganggu.
- Pemetaan baru: PR-1 `0085` · PR-2 `0086` · PR-3 `0087` · PR-4 `0088`. Berkas contract test ikut bergeser.
- Baris "migrasi berikutnya tersedia" di spec §0 diberi alasan eksplisit + peringatan: nomor di dokumen adalah **rencana, bukan reservasi**; verifikasi `ls supabase/migrations/ | tail` DAN PR terbuka sesaat sebelum membuat berkas, karena beberapa sesi bekerja paralel.
- Jebakan teknis saat menggeser (layak diingat): `\b0084\b` **tidak** cocok pada `0084_search_global.sql` karena underscore adalah word character, sehingga substitusi pertama hanya mengenai angka telanjang dan menghasilkan campuran tak konsisten. Pola yang benar `(?<![0-9])0084(?![0-9])`, dijalankan **menurun** (0087→0088 lebih dulu) agar hasil substitusi tidak tertimpa langkah berikutnya. Diverifikasi lewat hitungan per-berkas sebelum/sesudah — harus cerminan persis, tergeser satu.
- Entri log lama yang menyebut "migrasi 0084" untuk BL-10 **sengaja tidak diedit** (log append-only; itu catatan keputusan pada waktunya).
## [2026-07-22] update | BL-01 baris basi dikoreksi — backlog kini nol item siap-kerja

- **BL-01 sudah selesai sejak 2026-07-20** (PR #116, `83fa35f`, nol migrasi), tapi tabel §1 masih menandainya ✅ CONFIRMED (gap terbuka). Sebabnya sempit dan berulang: PR merge **13:42 UTC 2026-07-20**, hari yang sama dengan audit 4-agen yang menuliskan barisnya — audit membaca pohon sebelum fix mendarat, lalu barisnya tidak pernah dimutakhirkan.
- **Diverifikasi ulang terhadap kode hidup**, bukan dari log: `people.tsx:80-84` membangun `rankByUser` dari `r.rank_number` dengan komentar D11 eksplisit; nol derivasi berbasis indeks (`rank += 1`, `index + 1`) tersisa di `people.tsx` maupun `people-profile/[id].tsx`. Terkunci tes `people.test.tsx` "tie renders rank_number kembar dari DB, bukan index+1" dengan fixture `1,1,3`.
- **Efek pada triage.** Bucket "XS murni" kini kosong. Digabung dengan bucket "S" (kosong sejak #144) dan "butuh migrasi DB" (kosong sejak BL-06), **nol item siap-kerja tersisa** di halaman ini.
- **Sisa sebenarnya: dua item, keduanya butuh spec.** BL-07 (Notifications, M) dan BL-10 (Search, L). Keduanya duduk di "butuh scoping/spec dulu" bukan karena besar melainkan karena masing-masing menyimpan keputusan produk yang PRD tidak jawab — lihat catatan baru di kepala §2.
- **Pelajaran (senada BL-09 & UI-S-W08).** Audit bertanggal menghasilkan baris yang basi pada hari penulisannya sendiri bila ada PR mendarat di jendela yang sama. Baris backlog yang mengklaim gap perlu diverifikasi terhadap **kode**, bukan terhadap entri log yang melahirkannya — ini kali ketiga halaman ini menyimpan klaim yang benar-untuk-satu-hari.
- Pages updated: [[feature-gap-backlog]] (baris BL-01 → DONE, §2 bucket XS + catatan sisa pekerjaan), [[log]].

## [2026-07-22] update | BL-07 di-scoping — "4 emitter + satu CHECK" salah ukur

- **Scoping, bukan implementasi.** Seluruh temuan diverifikasi terhadap `supabase/migrations/*` **dan DB staging**, bukan diturunkan dari entri log. Hasilnya: dari 4 gap yang tercatat, **satu kemungkinan bukan gap notifikasi**, **satu jauh lebih besar dari yang tertulis**, dan **dua memang mekanis**. Rinci di [[feature-gap-backlog]] §6.
- **"Bukti dikirim" bertumpuk dengan "Review diperlukan".** `review_request` dikirim **ke reviewer, saat submit, actor = PIC** (`0072:116`) — itu persis peristiwa "Bukti dikirim". Menambah tipe kedua di titik sama = reviewer ternotifikasi dua kali. **Lubang nyata ada di sebelahnya**: emitter ber-gate `review_required and reviewer_id is not null`, sehingga saat `review_required = false` submission langsung `done` (`0007:429-438`) dan **nol notifikasi terkirim ke siapa pun**. Bacaan itu membuat kedua baris PRD punya isi tanpa duplikasi. → **D-BL07-1**.
- **"Deadline lewat" one-time adalah gap STATE MACHINE.** Task one-time sudah dapat `deadline_reminder` untuk deadline *mendekat* (`0046:1120-1130`). Yang tak ada adalah keadaan **lewat**: `tasks.status` (CHECK live staging) = `draft·assigned·in_progress·submitted·done·revision·archived·cancelled` — **tanpa** `missed`/`overdue`, berbeda dari `task_instances` yang punya `missed`. Task one-time secara struktural tak bisa "lewat", jadi tak ada state untuk dinotifikasikan. Menambahnya menjalar ke CHECK + sapuan cron + **potensi skoring**. → **D-BL07-2**; rekomendasi: notifikasi murni tanpa menyentuh status, "lewat" jadi fakta turunan `deadline < org_today()`.
- **"MBR warning" kemungkinan bukan gap.** §28 item 7 berbunyi "jika user sedang membuat turunan" — **kondisi sinkron**, bukan peristiwa asinkron, dan sudah disurfacekan saat itu juga lewat `check_minimum_breakdown_compliance` yang menggerbangi tombol turunan. Berpola sama dengan BL-03 & BL-09(a): baris PRD yang terbaca sebagai gap padahal permukaannya sudah ada dalam bentuk lain. → **D-BL07-3**; rekomendasi: tutup sebagai koreksi PRD.
- **"Permission berubah" satu-satunya yang mekanis.** `set_user_permission` (versi hidup `0076`) tak mengirim apa pun; penerima tak ambigu. XS, nol keputusan produk.
- **Temuan sampingan — staging tertinggal 0081.** CHECK hidup di staging **masih 13 tipe**, tanpa `period_closing_reminder`, dan `emit_period_closing_reminders` **tidak ada** di `pg_proc`. Sementara `lib/notifications.ts:22` sudah memuat tipe ke-14 itu — **client mendahului DB**. Instans lain dari [[staging-db-migrasi-tertinggal]]; jadi prasyarat BL-07: verifikasi penerapan lewat **efek di schema**, bukan `schema_migrations`.
- **Ukuran dikoreksi** dari M tunggal menjadi per-sub-item XS..L. Satu migrasi menampung seluruh tipe baru yang disetujui (pola superset 0038/0081), jadi memutuskan D-BL07-1..3 sekaligus lebih murah daripada tiga migrasi berurutan.
- Pages updated: [[feature-gap-backlog]] (baris BL-07 → scoped, §6 baru), [[log]].


## [2026-07-22] update | BL-07 selesai — 3 tipe Notifications §28, migrasi 0084, nol perubahan state machine

- **Keputusan owner turun sesuai rekomendasi scoping** (§6): D-BL07-1 "Bukti dikirim" hanya di jalur `review_required = false`; D-BL07-2 "Deadline lewat" = notifikasi murni; D-BL07-3 MBR warning ditutup sebagai koreksi PRD. Tiga tipe baru: `evidence_submitted`, `deadline_overdue`, `permission_changed`; CHECK jadi **17 tipe**.
- **Yang tidak dibangun sama pentingnya dengan yang dibangun.** Dari 4 gap yang tercatat, hanya 3 jadi kode. `evidence_submitted` **tidak pernah** menyala saat review diperlukan — reviewer sudah menerima `review_request` untuk peristiwa yang sama, dan tipe kedua di titik itu hanya akan menotifikasi dua kali. Yang ditutup justru jalur yang selama ini **nol notifikasi**: `review_required = false` → submission langsung `done`, bukti masuk, tak seorang pun tahu.
- **D-BL07-2 ditegakkan secara struktural.** Cron `emit_deadline_notifications` tidak menyentuh `tasks.status`; "lewat" tetap fakta turunan `deadline < org_today()` ber-`dedupe_date` (maks 1×/tugas/hari). `T-BL07-6` gagal bila `update public.tasks` muncul di badan fungsi itu; `T-BL07-7` gagal bila `tasks.status` suatu saat memperoleh `missed`/`overdue`. Jadi keputusan ini tidak bergantung pada ingatan siapa pun — kalau premisnya bergeser, tes yang memberi tahu.
- **D-BL07-3 ditutup di PRD, bukan di kode.** §28 kini punya blok "Semantik yang ditetapkan" (item 2, 4, dan 7). Tanpa itu audit app-vs-PRD berikutnya melahirkan ulang temuan yang sama — persis nasib BL-03, yang sampai sekarang masih dilahirkan ulang karena pencabutannya tidak pernah masuk PRD.
- **Badan fungsi direproduksi apa adanya lewat skrip ber-assert**, bukan salin-tempel. Empat fungsi (`submit_task` ← 0072, `submit_task_instance` + `emit_deadline_notifications` ← 0046, `set_user_permission` ← 0076) diekstrak dari sumbernya lalu disisipi delta; skrip **gagal keras** bila pola sisipan tidak cocok tepat satu kali. `create or replace` di keempatnya — `drop … cascade` akan mereset ACL ke `PUBLIC EXECUTE` dan membatalkan REVOKE 0066/0076/0080 ([[anon-public-rpc-grant-gotcha]]).
- **Push sengaja tidak disentuh.** Ketiga tipe in-app saja; `is_push_worthy` (0081) tidak diubah karena **0081 sendiri belum mendarat di staging**. Tes `[BL07-4]` mengunci client agar tidak mendahului DB — kesalahan itu persis yang membuat `period_closing_reminder` menggantung: client sudah memuat tipe ke-14 sementara CHECK hidup di staging masih 13.
- **Verifikasi terhadap database sungguhan, bukan hanya pembacaan file.** Migrasi diterapkan ke Postgres lokal (`supabase_db_supabase`) dan efeknya diperiksa di schema: CHECK 17 tipe, keempat badan fungsi memuat emitter barunya, ACL tanpa `PUBLIC`/`anon`. `T-BL07-1..8` **8/8 lolos**. Mobile: **133 suite / 1653 tes** hijau, type-check bersih, lint nol error.
- **Tes membuktikan dirinya menggigit.** `T-BL07-4` gagal lebih dulu: assertion menuntut penerima = `created_by` tapi ditulis seolah argumen tipe ada tepat setelahnya, padahal urutan `emit_notification` adalah `(org, penerima, actor, tipe, …)`. Yang salah assertion-nya, bukan kodenya — dan sebuah assertion yang tidak pernah bisa gagal tidak menguji apa pun.
- **Sisa backlog: satu item.** Hanya BL-10 (Search, L) yang tersisa, masih di bucket "butuh scoping/spec dulu".
- Files created: `supabase/migrations/0084_bl07_notifications_missing_types.sql`, `supabase/tests/0084_bl07_notification_types_contract.sql`.
- Files updated: `PRD.md` (§28 semantik), `mobile/src/lib/notifications.ts`, `mobile/src/app/(app)/(tabs)/notifications.tsx`, `mobile/src/lib/__tests__/notifications.test.ts`.
- Pages updated: [[feature-gap-backlog]] (baris BL-07 → DONE, §2 triage, §6.7 yang dikirim), [[log]].

## [2026-07-22] update | BL-06 selesai — "Zona waktu" §23 dibaca sebagai TAMPILAN (nol migrasi)

- **Interpretasi yang dipilih: (A) tampilan**, bukan (B) override per-rule. Ukuran item dikoreksi **S→M ⇒ XS**, dan BL-06 dipindah dari bucket "butuh migrasi DB" ke "XS murni" — bucket "butuh migrasi DB" kini kosong. Seluruh biaya migrasi yang tercatat sebelumnya berasal dari asumsi override yang tidak pernah diminta PRD.
- **Bukti 1 — PRD menyebut zona waktu tepat sekali.** `grep -i -E "zona waktu|timezone|time zone|WIB|WITA|UTC"` atas `PRD.md` mengembalikan **satu** baris: `966:5. Zona waktu.` Nol kalimat normatif di §7, §28, atau bagian deadline/cron. Field ini nama telanjang tanpa semantik.
- **Bukti 2 — daftar §23 memang mencampur input dan tampilan.** Item 7–10 (Expected/Completed/Missed instances + Repeat Compliance) semuanya turunan read-only yang sudah dirender sebagai metrik. Membaca item 5 sebagai tampilan mengikuti idiom daftarnya sendiri; membacanya sebagai input justru yang menyimpang.
- **Bukti 3 — schema tak pernah menyediakan tempatnya.** `task_repeat_rules` (nama hidup pasca-rename `0045:51`) tanpa kolom timezone sejak dibuat (`0007:22-47`), dan nol `ALTER TABLE ... repeat_rules` menambahkannya. Diverifikasi pada **DB staging** via `information_schema.columns`: 15 kolom, tak satu pun timezone.
- **Bukti 4 — zona dinyatakan eksplisit milik organisasi.** `0007:11` "timezone organisasi (deadline_at dihitung pada zona ini)"; `0007:61` `deadline_at ... @ org timezone`; `0081:16` "Tanggal SELALU dihitung server via org_today (timezone org)".
- **Kenapa (B) tidak dimulai.** `public.org_today(p_org)` (`0008:21-27`) berpremis "hari ini" milik organisasi. Di bawah (B) premis itu jadi ber-skop rule dan tiap perbandingan `deadline_at at time zone <tz>` vs `org_today()` jadi ambigu — termasuk deteksi instance terlewat & reminder deadline. Pertanyaan terbuka yang harus dijawab lebih dulu: **zona mana yang memutuskan sebuah instance terlewat.** PRD tidak menanyakannya. Bila (B) suatu saat diminta owner, itu spec `/sdd-plan`, bukan tiket backlog.
- **Yang dikirim.** `mobile/src/lib/org-timezone.ts` (`getOrgTimezone()` di bawah RLS `org_select_own` + `orgTimezoneLabel()` murni: WIB/WITA/WIT) dan keterangan read-only `repeat-timezone` di `repeat-config` pada `task/new.tsx`. Gagal/loading **jatuh ke default org** (`Asia/Jakarta`) — field hiasan tidak boleh menjatuhkan form yang memuatnya. Zona di luar peta tampil apa adanya, tanpa singkatan karangan.
- **Verifikasi.** `npm test` **134 suite / 1659 tes hijau**, `npm run type-check` bersih, `npm run lint` nol error pada file yang disentuh. Dikunci `[1..7]` (org-timezone) + `[10..12]` (repeat-ui), termasuk anti-regresi bahwa baris ini tidak berubah jadi kontrol per-rule dan bahwa zona yang tampil benar-benar zona org (`Asia/Makassar` → WITA), bukan WIB hardcoded.
- **Jebakan tes yang ditemukan.** `toHaveTextContent('Asia/Jakarta (WIB)')` memperlakukan argumen string sebagai sumber regex → `(WIB)` jadi grup tangkap dan tanda kurungnya tak pernah dicocokkan. Pakai `getByText('...')` untuk teks ber-metakarakter regex. Terpisah: hint memakai casing PRD "Jam deadline" (§23 field 4), sengaja beda dari label field "Jam Deadline", agar `getByText(/Jam Deadline/)` di tes `[3]` tidak menangkap dua elemen.
- Files created: `mobile/src/lib/org-timezone.ts`, `mobile/src/lib/__tests__/org-timezone.test.ts`.
- Files updated: `mobile/src/app/(app)/task/new.tsx`, `mobile/src/app/(app)/task/__tests__/repeat-ui.test.tsx`, `DESIGN.md` (§7 token `TimezoneNote`).
- Pages updated: [[feature-gap-backlog]] (baris BL-06 → DONE + ukuran dikoreksi, §2 triage dua bucket, §BL-06 baru), [[log]].

## [2026-07-22] update | BL-10 rencana TDD — dua temuan false-green ditutup

- Pages updated: `specs/bl-10-pr1-tdd-plan.md` (§5 langkah 4 `DB-9`, §6.4 langkah 4, §9.4 baru)
- **Missing #6 (escaping) — kritik aslinya separuh benar.** Verifikasi ulang: assertion negatif `'%%'` SUDAH diskriminatif (escaping dicabut → pola `%%%%` → `Aman` ikut terjaring → merah). Yang tidak diskriminatif adalah assertion **positif** `'0% T'`: pola rusak `%0% T%` dibaca *apa saja · `0` · apa saja · `" T"` · apa saja* sehingga tetap cocok dengan `100% Target` — hijau di kedua dunia. Diganti pasangan diskriminatif per metakarakter (`%`, `_`, `\`) dengan kewajiban assert dua arah. Baris `a\b` menutup arah kegagalan berlawanan: bukan baris salah ikut muncul, melainkan **baris benar justru hilang** karena backslash dimakan sebagai escape.
- **Missing #2 (reduksi-RLS) — ditutup dengan dua kontrol positif** sebelum uji `EXCEPT`: sisi RLS harus > 0 baris (aktor memang berhak melihat sesuatu) dan sisi RPC harus > 0 baris (RPC benar-benar bekerja untuk aktor itu). Tanpa keduanya, `EXCEPT` kosong tak terbedakan antara "RPC ⊆ RLS" dan "RPC rusak total, nol baris".
- Pemilihan aktor A2 sekaligus jadi penjaga premis — ia sengaja melihat *sebagian*; bila fixture berubah sehingga A2 tak berhak apa pun, kontrol pertama merah dan menyatakan premisnya bergeser. Pola yang sama dipakai `T-BL14-1`/`T-BL14-3` di kontrak 0083.
- §9.1 (daftar 20 missing case) **tidak diedit** — dibiarkan sebagai catatan sejarah fase Grill; penutupan dicatat terpisah di §9.4.
- **Masih terbuka:** tiga kegagalan mekanis (Concern #1 `staleTime` react-query v5, #3 `SET LOCAL` no-op di luar transaksi, #2 kontradiksi `pg_get_functiondef`) + penolakan `md5(prosrc)` sebagai penegak NG-6 (Concern #4).

## [2026-07-22] update | BL-10 rencana TDD — tiga kegagalan mekanis + md5(prosrc) ditutup

- Pages updated: `specs/bl-10-pr1-tdd-plan.md` (§6.4 kerangka transaksi, baris H09, baris `DB-74`, §9.5 baru)
- **Concern #1 (`staleTime`) diverifikasi ke `node_modules`**: react-query **5.101.2**; `staleTime` hidup di `FetchQueryOptions`/observer options, BUKAN di `QueryOptions` polos yang jadi tipe `Query.options`. Jadi `getAll()[0].options.staleTime` memang `undefined`.
- **Tapi perbaikannya bukan yang disarankan critic.** Critic mengusulkan pindah ke `query.observers[0].options.staleTime` — itu tetap menguji internal cache dan tetap pecah saat react-query berubah bentuk. H09 diubah jadi **uji perilaku**: `staleTime = 0` ⇒ mount ulang memicu refetch. Alasan yang sama dipakai menolak `md5(prosrc)`.
- **Concern #3 (`SET LOCAL`)** ditutup dengan menyalin verbatim kerangka `0067_cross_org_isolation_contract.sql:118-148` + tiga aturan eksplisit: `begin;`/`rollback;` di LUAR blok `do`, tanpa `rollback` di dalamnya, dan **tanpa `set local row_security = off`** pada blok penguji reduksi-RLS (ia mematikan hal yang sedang diuji). Pelanggaran aturan pertama = impersonasi tak pernah terjadi, seluruh assertion otorisasi jalan sebagai superuser, semua hijau tanpa menguji apa pun — false-green sekelas §9.4 tapi menjangkiti seluruh harness.
- **Concern #2 (kontradiksi `pg_get_functiondef`)**: `DB-52/54/66/71` melarang token yang justru diwajibkan muncul di komentar header FR-7 + komentar per cabang. Assertion kini dijalankan atas badan yang komentarnya dilucuti (`--` sampai akhir baris + blok `/* */`), dinyatakan sekali sebagai helper di kepala berkas kontrak.
- **Concern #4 — `md5(prosrc)` ditolak sebagai penegak NG-6.** `DB-74` diturunkan jadi peringatan; penegak utama `DB-73` (perbedaan PERILAKU berpasangan). Pesan galatnya wajib menyebut bahwa baseline P5 boleh diperbarui bila perubahan `search_cards` disengaja.
- **Status §9:** dua false-green (§9.4) + tiga mekanis & digest (§9.5) tertutup. Sisa §9.1/§9.2 = penambahan cakupan dan kerapuhan assertion — nyata tapi tidak menghasilkan hijau-palsu, boleh ditangani sambil wave berjalan.

## [2026-07-23] update | BL-10 PR-1 selesai — `search_global` 9/14 scope (migrasi 0085)

- Files created: `supabase/migrations/0085_search_global.sql`, `supabase/tests/0085_search_global_contract.sql`, `mobile/src/lib/search.ts`, `mobile/src/hooks/use-search-global.ts`, + 3 berkas test klien, `specs/bl-10-pr1-wave0-preflight.md`
- Files updated: `mobile/src/app/(app)/search.tsx` (ditulis ulang jadi `SectionList`), `database.types.ts`, `prd/03`, `specs/search-pesan-inbox.md`, [[database-blueprint]], [[permission-model]], [[feature-gap-backlog]]
- Dikerjakan lewat 8 wave red-green di worktree, mengikuti `specs/bl-10-pr1-tdd-plan.md`. **Setiap wave diverifikasi MERAH lebih dulu**, bukan retrospektif.
- **Gerbang keras Wave 0 (BL10-OQ-11) LOLOS** — delegasi `search_chat_messages` di dalam `FROM` menghasilkan satu `Function Scan` ber-LIMIT internal, cursor diteruskan sebagai argumen ke-4/5 tanpa `Filter` di luar. Tapi `EXPLAIN` hanya membuktikan **bentuk rencana**: kedua rencana mengembalikan jumlah baris sama karena seluruh pesan lebih tua dari ambang, jadi penyaringan dibuktikan terpisah dengan cursor diskriminatif.
- **Temuan yang tersingkap sepanjang jalan:** `search_cards` (0046:2120) merangkai pola LIKE **tanpa escaping** — `%` yang diketik user jadi wildcard sungguhan. Sengaja **tidak** diperbaiki (NG-6) dan perbedaannya dikunci `DB-73` sebagai perbedaan PERILAKU, bukan digest.
- **`DB-52` dipertajam, bukan ditambahi.** Bentuk lamanya melarang semua `raise exception` — benar sampai Wave 3, tapi SALAH begitu FR-19 hadir. Assertion diarahkan ke SIFAT exception (tidak boleh menyebut `auth.uid`/`can_access`/`has_permission`), bukan jumlahnya nol.
- **Empat false-green ditemukan dan ditutup selama eksekusi**, semuanya jenis "test hijau tanpa menguji apa pun": (1) `JSON.stringify(screen.toJSON())` melempar circular pada pohon berisi, tapi TIDAK melempar pada pohon kosong — `UI-06` sempat hijau begitu; (2) `unmount()` tanpa `act` merusak render test sesudahnya (dua kali, W6b dan W6c); (3) `jest.useFakeTimers()` di H02 membocorkan timer beku ke 8 test lain; (4) generator cabang SQL menghasilkan `escape ''` dan `$;` — keduanya ketahuan hanya karena migrasi gagal sintaks sehingga test tetap merah.
- **Jebakan lingkungan yang dicatat di berkas test:** aktor uji chat harus memenuhi DUA syarat — anggota room DAN org-nya sama dengan org pesan. Prelude `_fixtures.sql` commit dan tidak pernah reset, sehingga ia memindahkan aktor `…0001` ke org DCR-05 dan membuat pengamatan Wave 0 tidak berlaku lagi sesudahnya.
- Verifikasi: DB contract **34 lolos** (baseline 33 + 1 baru; kegagalan `0079` pra-ada karena sisa data uji manual, tidak disentuh). `tsc` bersih. 5 berkas regresi NG-6/NG-7 hijau **tanpa satu baris pun diubah** — `git status` kosong untuk kelimanya.
- BL-10 dipecah: **BL-10a DONE**, BL-10b (People) berikutnya, BL-10c/BL-10d diblokir open question.

## [2026-07-23] update | BL-10b selesai — scope People (migrasi 0086)

- Files created: `supabase/migrations/0086_search_global_people.sql`, `supabase/tests/0086_search_global_people_contract.sql`
- Files updated: `mobile/src/app/(app)/search.tsx` (rute People), test layar (+`BL10-UI-18`), [[feature-gap-backlog]]
- Gate tersederhana dari 14 scope: `organization_id = current_user_org() OR id = auth.uid()`, tanpa permission gate. Menutup utang FR-8.5.3 Fase 8 yang shipped 7 dari 8 entity type tanpa catatan keputusan.
- **`email` sengaja bukan field match dan tidak diproyeksikan** (§6.3). `DB-78` menguji DUA arah: tidak bocor di kolom keluaran, DAN tidak bisa dicari. **Diverifikasi merah** dengan menambahkan `p.email ilike pat` ke cabang — assertion `email_dapat_dicari` menyala tepat.
- Rute People ditangani terpisah di `hrefForHit`, **bukan** lewat `ENTITY_ROUTE_SEGMENT` — peta itu ber-key `CardEntityType` (7 tipe card) dan NG-7 melarang memperluasnya.
- `create or replace` penuh, bukan `drop`+`create`: `drop ... cascade` akan mereset ACL fungsi ke `PUBLIC EXECUTE` dan membatalkan revoke 0085. Konsekuensinya seluruh badan fungsi ditulis ulang di 0086 — itu harga yang memang harus dibayar.
- **Dua kerusakan generator berulang** dari Wave 3, keduanya tertangkap sebelum commit: JS `String.replace` memakan `$$` sehingga penutup dollar-quote jadi `$;`, dan escaping bertingkat menghasilkan `escape '\'` alih-alih `escape '\'`. Pelajaran yang sama: verifikasi isi berkas yang di-generate, jangan percaya hitungan dari skrip generatornya sendiri.
- Verifikasi: DB contract **35 lolos** (naik dari 34; kegagalan `0079` pra-ada), jest penuh **1705/1705**, `tsc` bersih, lint 0 error, rename-guard clean.
