# EMS V1.8.1 — Build Plan Terfase

Turunan dari [PRD.md](PRD.md). Cakupan = 100% scope V1.8.1. Yang berubah dari Section 86 PRD hanya **urutan**: loop eksekusi harian dinaikkan ke depan supaya produk bisa dipakai dan divalidasi sejak fase awal, bukan setelah seluruh infrastruktur jadi.

## Prinsip Phasing

1. Setiap fase = vertical slice yang bisa dipakai dan diuji, bukan satu lapisan teknis.
2. Loop eksekusi (Action Plan → Bukti → Review) didahulukan karena itu pengganti follow-up WhatsApp dan sumber nilai pertama yang kelihatan.
3. Fitur paling sensitif politik (People, Score, Ranking) ditaruh belakang, setelah ada data eksekusi nyata berminggu-minggu.
4. Setiap fase punya **Gerbang Validasi**: jangan lanjut ke fase berikut sebelum kriteria keluar terpenuhi di Nyantuy Group.

---

## FASE 0 — Fondasi & Shell

**Tujuan:** Bisa login sebagai peran berbeda dan navigasi jalan. Tipis saja.

**Scope (PRD §3, §59, §81, §82):**
- Auth + `profiles`
- Seed 1 organization (Nyantuy Group) — struktur org penuh (department, position, team) **ditunda** ke Fase 8, cukup field minimal di user
- User + assignment role default (CEO/Super Admin, Manager/Head, Staff) + flag permission inti (§58)
- Mobile shell + Main Navigation (Home, Notifications, Workspace, Inbox, People sebagai shell kosong)

**Tabel DB:** `auth.users`, `profiles`, `organizations`, `role_templates`, `permissions`, `user_permissions`, `settings`, `login_logs`

**Exit / Gerbang:** Bisa login sebagai 3 peran, tiap peran melihat menu sesuai permission, navigasi 5 menu jalan.

---

## FASE 1 — Card Engine + Loop Eksekusi (WEDGE)

**Tujuan:** Owner bisa menugaskan kerja konkret ke staf, staf submit bukti, reviewer approve/reject. Ini milestone validasi pertama yang nyata.

**Scope (PRD §8, §9, §19, §24, §25, §30–35, §73, §74):**
- Card base component, Keterangan Card, Kelengkapan Card, Card Activation Rule
- Activity Log basic (append-only), Governance Violation basic
- **Action Plan One Time** di bawah container "Initiative" datar sementara (hierarki strategis menyusul di Fase 4)
- Bukti, Nilai Hasil, Submit
- Review: approve/reject, anti self-approval, reject wajib alasan
- Evidence locking, Submission versioning

**Tabel DB:** `initiatives` (dipakai datar dulu), `action_plans`, `action_plan_submissions`, `action_plan_result_values`, `evidence_files`, `reviews`, `card_completion_rules`, `card_guidance_contents`, `activity_logs`, `governance_violations`

**Deliverable/Demo:** Owner assign "Buat 20 Konten Iklan" ke staf → staf submit bukti + nilai hasil → reviewer approve. Flow Assigned → In Progress → Menunggu Review → Selesai/Revisi jalan utuh.

**Gerbang Validasi:** Jalankan 1 minggu di Nyantuy dengan kerja nyata. Apakah staf benar-benar submit bukti tanpa disuruh manual? Kalau tidak, **berhenti dan perbaiki friksi** sebelum lanjut.

---

## FASE 2 — Action Plan Repeat

**Tujuan:** Pekerjaan disiplin harian jalan otomatis seperti alarm. Ini melengkapi wedge.

**Scope (PRD §26–29, §36, §38):**
- Repeat Setting (One Time / Repeat), Repeat Rule (Daily/Weekly/Monthly/Custom)
- Generate Action Plan Instance
- Aturan Terlewat: Strict / Grace Period / Overdue Allowed
- Status Terlewat, Repeat progress, Repeat Compliance

**Tabel DB:** `action_plan_repeat_rules`, `action_plan_instances`

**Deliverable/Demo:** "Daily Finance Closing" auto-generate 30 instance, terlewat tercatat kalau lewat jam deadline, compliance 28/30 terhitung.

**Gerbang Validasi:** Jalankan daily closing + daily marketing report 2 minggu. Compliance harian masuk akal (bukan semua terlewat, bukan semua diisi asal di akhir).

---

## FASE 3 — Home + Notifications + Inbox

**Tujuan:** User tahu "hari ini harus fokus apa" dan dapat alert. Loop jadi lengket.

**Scope (PRD §61–64):**
- Home = Today Command Center (action plan hari ini, repeat due today, butuh review, terlewat, deadline mendekat, revisi)
- Notifications (review request, approval/reject, deadline reminder, repeat due, terlewat, comment/mention) + tabs
- Inbox Initiative Chat: auto-create chat room per Initiative, member by access, unread badge

**Tabel DB:** `notifications`, `comments`, `mentions`, `chat_rooms`, `chat_room_members`, `chat_messages`, `chat_message_reads`

**Gerbang Validasi:** User buka app karena dapat notif, bukan karena disuruh. Home jadi layar pertama yang dilihat tiap pagi.

---

## FASE 4 — Performance Workspace (Hierarki Strategis)

**Tujuan:** Container datar dari Fase 1 dapat induk strategisnya. Struktur Goal → KPI Area → Strategy → Initiative → Action Plan utuh.

**Scope (PRD §6, §10–14, §18, §20–23, §46–50, §51–54):**
- Goal, KPI Area, Strategy (wajib alasan/risiko/alternatif), Initiative
- Expand/collapse card tree
- Goal Template Library, KPI Area Template Library, Goal Wizard
- Delegasi PIC/Reviewer bertingkat, default PIC turunan

**Tabel DB:** `goals`, `kpi_areas`, `strategies`, `goal_templates`, `kpi_area_templates`

**Catatan:** Migrasikan Initiative datar Fase 1 ke bawah hierarki ini. Action Plan lama tetap hidup.

**Gerbang Validasi:** Owner bisa bikin 1 Goal lengkap dari wizard sampai ke Action Plan tanpa bingung.

---

## FASE 5 — Minimum Breakdown Rule + Kelengkapan Perencanaan

**Tujuan:** Struktur tidak liar, breakdown cukup sebelum lanjut.

**Scope (PRD §39–43):**
- Settings Minimum Breakdown Rule
- Kelengkapan Perencanaan indicator
- Mode: Hanya Peringatan / Blokir Aktivasi / Blokir Akses Turunan
- Popup validasi "Tidak Dapat Melanjutkan"

**Tabel DB:** `minimum_breakdown_rules`

**Catatan penting:** Mulai dengan mode **Hanya Peringatan** dan angka longgar. Default PRD (3/3/3) di UKM kecil = ledakan card wajib (1 Goal bisa jadi 135 Action Plan). Naikkan ke Blokir hanya setelah tim terbukti tidak bikin card asal.

---

## FASE 6 — Development Workspace

**Tujuan:** Jalur kedua untuk membangun mesin perusahaan (sistem, SDM, SOP).

**Scope (PRD §7, §15, §16, §39 default development):**
- Development Area → Problem Statement / Development Goal → Initiative → Action Plan
- Permission membuat Development Area
- Minimum breakdown default development (1/1/3)

**Tabel DB:** `development_areas`, `problem_statements`

**Gerbang Validasi:** 1 Development Area nyata jalan (misal "Bangun EMS" atau "Standarisasi SOP Finance").

---

## FASE 7 — People & Score

**Tujuan:** Performa user dari data eksekusi, bukan perasaan.

**Scope (PRD §44–45, §65–72):**
- People: profile, achievement score, completion, compliance, on-time, review pass, result achievement, development contribution, governance discipline, ranking, trend
- Score Formula (Staff/Management/C-Level/CEO), total wajib 100%, versioning
- Manual override score
- Ranking snapshot

**Tabel DB:** `score_categories`, `score_formula_templates`, `score_formula_versions`, `score_formula_assignments`, `user_score_results`, `ranking_snapshots`, `period_snapshots`

**Catatan paling penting:** Ini fitur paling sensitif politik dan paling mudah memicu resistensi/gaming. Aktifkan **setelah** Fase 1–3 sudah jalan berminggu-minggu dan ada data eksekusi nyata. Skor di atas data kosong = mainan yang melukai kepercayaan.

---

## FASE 8 — Governance & Admin Lengkap

**Tujuan:** Lengkapi semua admin, audit, dan struktur org penuh yang ditunda.

**Scope (PRD §51–60, §75–80, §83):**
- Org struktur penuh: Department, Position, Team, Team Members, Role Template management
- Activity Log page, Governance Violation page
- Deadline Change Request, Cancellation, Evaluation
- Archive, Search (ikut permission), Confidential Access
- Settings lengkap (Card Completion Rule, Keterangan Card, Status, Prioritas, Notifications Rule editable)
- Video brief + brief understanding (jika dipakai)

**Tabel DB:** `departments`, `positions`, `teams`, `team_members`, `deadline_change_requests`, `deadline_change_logs`, `cancellations`, `evaluations`, `confidential_access_rules`, `video_briefs`, `brief_understanding_records`

**Exit:** Seluruh 53 tabel PRD §83 terpakai. Success Metrics §87 (40 poin) lolos.

---

## Peta Fase vs PRD §86

| Build Plan | PRD §86 asli | Alasan dipindah |
|---|---|---|
| Fase 0 | Phase 1 (dipangkas) | Org penuh ditunda ke Fase 8, cukup minimal dulu |
| Fase 1 | Phase 2 + Phase 6 | Loop eksekusi dinaikkan = nilai & validasi awal |
| Fase 2 | Phase 7 | Repeat melengkapi wedge harian |
| Fase 3 | Home + Phase 8 + 9 | Bikin loop lengket sebelum tambah struktur |
| Fase 4 | Phase 3 | Hierarki strategis menyusul, bukan mendahului |
| Fase 5 | Phase 4 | — |
| Fase 6 | Phase 5 | — |
| Fase 7 | Phase 10 | Score belakang, butuh data dulu |
| Fase 8 | Phase 11 + sisa Phase 1 | Admin penuh terakhir |

## Aturan Tetap Sepanjang Build

- Anti-scope-creep PRD §88 berlaku. Tolak Feed, Announcement, AI, Watcher, Routine, Area Goal, dll. untuk V1.8.1.
- Tidak ada bobot di planning card (§44). Bobot hanya di Score Formula (§45).
- Bahasa UI Indonesia, istilah khusus dipertahankan (§4).
- Setiap card harus lengkap sebelum aktif; setiap Strategy wajib alasan/risiko/alternatif.
