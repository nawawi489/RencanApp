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
