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

## [2026-06-26] update | Eksekusi TDD Inbox & Chat (P0 UI-S-IN1..IN4)

- **Hasil:** Jest **540/540 pass** (sebelumnya 512 → +28). TSC bersih. Lint: 0 issue baru dari fase ini (3 error pre-existing di `settings-permission-users.tsx`). Advisor security: 0.
- **Fase A — Data (FR-DATA.1):** migrasi **0018_fr_data1_inbox_preview** apply (DROP+CREATE `get_chat_rooms()` +2 kolom). Contract `supabase/tests/0018_inbox_preview_contract.sql` lulus 6 invarian (T1 preview, T2 non-member 0 baris dgn jwt switch, T3 empty room, T4 null author LEFT join, T5 tie id desc, T6 outer order nulls last). Per Critic §8.1 — auth context eksplisit via `set_config('request.jwt.claims')` + `execute 'set local role authenticated'`, seed sbg postgres dulu (insert revoked dari authenticated). `database.types.ts` di-regen; `ChatRoom` di [`inbox.ts`](mobile/src/lib/inbox.ts) +2 field nullable; `CHAT_PAGE_SIZE` diekspor.
- **Fase B — Hooks:** 10/10 pass. `useChatMessages` direfactor ke `useInfiniteQuery` → `loadOlder()` + `hasMore`. Regression guards baru: send-fail tidak invalidate; markRead invalidate HANYA `['chat-rooms']`. Critic §8.7: baseline case [2] di-rewrite ke `toHaveBeenCalledWith('r1', 0)`.
- **Fase C — Token gate:** ChatBubble / DateDivider / ContextBanner / SendButton didaftarkan di [`DESIGN.md §7`](DESIGN.md) sesuai aturan `mobile/CLAUDE.md` (token diregistrasi sebelum kode UI). Critic §8.4: SendButton WAJIB inline `{width:44,height:44}` + `accessibilityState={{disabled}}` eksplisit (NativeWind class tak selalu flatten di jest).
- **Fase D — Inbox list:** 14/14 pass. Avatar seed=room.id, preview `'{author}: {body}'` (fallback `body` saat author null; fallback timestamp saat body null), clamp 99/100 boundary (Critic §8.5 off-by-one), search by-nama (Critic §8.2: assert OUTPUT terfilter, bukan call-count), chip Semua/Belum dibaca, chip ter-defer (Saya PIC/Review/Deadline) sengaja tidak dirender (scope-lock), empty-state kontekstual per search/filter.
- **Fase E — Thread:** 18/18 pass. Urutan kronologis-menaik via `[...messages].reverse()`, bubble me/them via `useAuth().session?.user?.id` (default 'them' saat null), Avatar+nama untuk them (author null → '?'), DateDivider per-hari device-tz + skip invalid created_at, satu hari = tepat satu divider, `roomId` undefined → ErrorState + markRead TIDAK dipanggil, composer SendButton circular (inline 44/44, `accessibilityLabel='Kirim pesan'`), anti double-submit (`isSending` → button disabled), gagal-send → input tetap + `role='alert'`, GovernanceBanner "Chat bukan jalur formal: …" dgn tombol Tutup, `Muat pesan lama` saat hasMore.
- **Closes backlog:** UI-S-IN1, UI-S-IN2, UI-S-IN3 (banner governance varian — bukan banner reply-AP yang ter-defer), UI-S-IN4 (circular SendButton); UI-G-005 (search pill bagian dari Inbox list, bukan topbar — belum). Catatan: regresi "chat polos" pada [[ui-prototype-gap]] kini tertutup.
- **Item ter-defer (sengaja tidak dieksekusi V1):** reactions, reply-quote, banner per-pesan reply-AP, system events, attach-evidence paperclip, chip Saya PIC/Review/Deadline, workspace-viewer composer gating (FR-IN4.3) — tetap di backlog.
