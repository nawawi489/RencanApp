# EMS V1.8.1 — 03 · Sistem, Permission, Data & Governance

> **Untuk AI agent:** File ini adalah referensi arsitektur & sistem. Isinya: model permission & delegasi, surface aplikasi (Home/Notifications/Inbox/People), Score Formula, audit (Activity Log, Governance Violation), Search, Settings, blueprint database, relationship rules, seed data, dan metrik sukses. Untuk konsep → [01-konsep-dan-fondasi.md](01-konsep-dan-fondasi.md). Untuk spesifikasi card → [02-spesifikasi-card-dan-eksekusi.md](02-spesifikasi-card-dan-eksekusi.md). Urutan build → [../BUILD-PLAN.md](../BUILD-PLAN.md). Sumber: [../PRD.md](../PRD.md).

---

## A. Model Permission & Delegasi

### Delegasi bertingkat (§51–53)
Prinsip: **yang memiliki card induk dapat membuat card turunan dan menentukan PIC + Reviewer-nya.**
- PIC KPI Area → buat Strategy + tentukan PIC/Reviewer Strategy.
- PIC Strategy → buat Initiative + tentukan PIC/Reviewer Initiative.
- PIC Initiative → buat Action Plan + tentukan PIC/Reviewer Action Plan.

**Default PIC turunan (§52):** jika tidak diubah, PIC turunan otomatis ikut PIC induk (mis. PIC KPI Area = CFO → Strategy & Initiative otomatis CFO). **Pengecualian:** Action Plan wajib punya PIC eksekutor yang ditentukan jelas (boleh beda per staff).

**Reviewer (§54):** ditentukan pembuat card turunan. Action Plan **wajib** punya Reviewer. Strategy/Initiative boleh punya Reviewer sesuai kebutuhan. Default reviewer bisa ikut PIC induk atau dipilih manual. **PIC tidak boleh approve pekerjaannya sendiri.**

### Hak Akses Default (§55–57) — berbasis tanggung jawab
User **tidak** melihat semua card. Akses otomatis:
1. PIC card → lihat card itu.
2. Reviewer → lihat card yang direview.
3. PIC card induk → lihat **seluruh** turunannya (Goal→KPI→Strategy→Initiative→Action Plan→Instance sesuai levelnya).

**Lihat ≠ Edit:** PIC induk boleh lihat semua turunan, tapi edit/approve/ubah data tetap ikut wewenang. Mis. CFO lihat semua di bawah KPI Area-nya tapi tidak boleh ubah bukti yang sudah dikirim staff di luar flow sah. **Audit trail tidak boleh rusak.**

**Workflow user** hanya menampilkan: card di mana dia PIC, card di mana dia Reviewer, turunan card miliknya, + card lain jika punya permission "lihat seluruh Workspace". Staff tidak lihat card divisi lain by default.

### Permission yang bisa dicustom di User Settings (§58)
Bukan system rule (system rule = akses PIC/Reviewer/turunan, tidak perlu permission). Yang custom: boleh membuat Goal / KPI Area / Development Area / Strategy / Initiative / Action Plan; lihat seluruh Workspace; kelola card orang lain; ubah Settings; kelola User & Permission; kelola Goal Template / KPI Area Template / Minimum Breakdown Rule / Card Completion Rule; lihat Activity Log; lihat Governance Violation; kelola Score Formula.

### Default Role Permission (§59)
| Role | Default |
|---|---|
| **CEO / Super Admin** | Semua: buat semua card, lihat seluruh Workspace, kelola card orang lain, Settings, User & Permission, template, Score Formula. |
| **C-Level** | Sesuai area authority: buat KPI Area jika diizinkan; buat Strategy/Initiative/Action Plan jika jadi PIC induknya; lihat seluruh turunan miliknya. |
| **Management / Manager / Head** | Buat Development Area jika diizinkan; buat Strategy/Initiative/Action Plan jika jadi PIC induknya; tentukan PIC/Reviewer turunan yang dibuatnya; lihat seluruh turunan miliknya. |
| **Staff** | Lihat card yang dia PIC/Reviewer; kerjakan Action Plan miliknya; submit Bukti & Nilai Hasil; comment; lihat Notifications, Inbox (sebagai member), People (sesuai visibility). **Tidak** boleh buat card, lihat seluruh Workspace, kelola card orang lain, ubah Settings. |

### Watcher dihapus (§60)
EMS V1.8.1 **tidak** memakai Watcher. Tidak ada watcher table, tidak ada "Add Watcher", tidak ada watcher notification. Akses luas diberi via permission "lihat seluruh Workspace".

## B. Surface Aplikasi

**Main Navigation (§81):** Home, Notifications, Workspace, Inbox, People. (Settings via avatar/profile menu, bukan di bottom nav.)

### Home (§61) — Today Command Center
Menjawab "hari ini saya harus fokus apa?". Menampilkan: Action Plan hari ini, Repeat jatuh tempo hari ini, card butuh review, card Terlewat, deadline mendekat, revisi harus diperbaiki, ringkasan progress pribadi, ringkasan card tanggung jawab user, peringatan Kelengkapan Card, keterangan untuk user baru.
**Tidak menampilkan:** Feed, Announcement, Company News, Posting, Social activity.

### Notifications (§62)
Pusat alert & tindakan. Isi: review request, approval, rejection, komentar, mention, deadline reminder, deadline change request, Action Plan Terlewat, Repeat due today, governance warning, card diaktifkan, card butuh dilengkapi, MBR warning.
Tabs: Semua, Perlu Tindakan, Review, Deadline, Komentar, Terlewat, Repeat, Governance.

### Inbox & Initiative Chat (§63–64)
Inbox = pusat chat Initiative. Setiap Initiative otomatis punya chat room. **Inbox bukan tempat approval resmi** — keputusan resmi tetap via Comment, Review, Status, Activity Log. Chat tidak menggantikan Review/Bukti/Nilai Hasil.
Member chat ikut akses card: PIC Initiative, Reviewer Initiative, PIC/Reviewer Action Plan di bawahnya, PIC induk yang punya akses turunan. Tanpa akses Initiative → tidak bisa buka chat-nya.

### People (§65)
Tempat melihat performa user (objektif). Menampilkan: Profile, Achievement Score, Action Plan Completion, Repeat Compliance, On-Time Rate, Review Pass Rate, Result Achievement, Development Contribution, Governance Discipline, Ranking, Trend performa.
**Bukan tempat mempermalukan.** Dilarang label "karyawan terburuk / staff malas / manager gagal". Hanya data objektif.

## C. Score Formula (§45, §66–72)

Planning card **tanpa bobot**, tapi **Score Formula punya bobot** (untuk hitung performa user). Bisa dicustom dari Settings. **Total bobot aktif wajib 100%** — jika bukan 100%, formula tidak bisa diaktifkan. Wajib **versioning**; score periode tertutup tidak boleh berubah diam-diam.

### Default formula per level
| Level | Kategori (bobot) |
|---|---|
| **Staff** | Action Plan Completion 20%, Repeat Compliance 20%, Result Achievement 15%, On-Time Rate 15%, Review Pass Rate 10%, Development Contribution 10%, Governance Discipline 10%. |
| **Management** | KPI Area Achievement 25%, Performance Goal Contribution 15%, Development Contribution 10%, Strategy Completion Rate 15%, Initiative Completion Rate 10%, Team Repeat Compliance 10%, Team Result Achievement 5%, Review Speed & Quality 5%, Governance Discipline 5%. |
| **C-Level** | Goal Achievement 30%, KPI Area Achievement 30%, Development Contribution 15%, Strategic Initiative Achievement 15%, Cross-functional Execution 5%, Governance Discipline 5%. |
| **CEO** | Company Goal Achievement 35%, Profit/Growth Achievement 20%, Strategic Portfolio Health 15%, Organization Development Score 15%, Leadership Team Health 10%, Governance Discipline 5%. |

> "KPI Area Achievement" di score = kategori penilaian performa, **bukan** bobot planning card.

### Score Formula Versioning (§71)
Tiap perubahan = version baru. Simpan: template name, version number, kategori score, bobot kategori, source data, effective date, created by, approved by (jika ada), change reason, created at. Score historis tetap memakai formula periode tersebut.

### Manual Override Score (§72)
Bukan default; hanya user berwenang. Wajib simpan: auto calculated score, manual adjusted score, reason, changed by, approved by (jika perlu), changed at, Activity Log. **Tidak boleh menghapus hasil perhitungan otomatis.**

## D. Audit & Governance

### Activity Log (§73) — **append-only**, tidak bisa diedit/dihapus dari UI
Mencatat antara lain: card dibuat/diedit/diaktifkan/selesai/diarsipkan, PIC/Reviewer diganti, bukti & nilai hasil dikirim, review approve/reject, deadline change (request/approved/rejected), instance dibuat/terlewat, MBR & Card Completion Rule diubah, Keterangan Card diubah, permission diubah, card gagal aktif karena validasi, user coba akses tanpa permission, Score Formula diubah/diaktifkan.

### Governance Violation (§74)
Mencatat pelanggaran aturan sistem, mis.: coba aktifkan card belum lengkap, coba lanjut turunan saat MBR belum terpenuhi, coba approve sendiri, coba ubah bukti tersubmit, ubah permission tanpa izin, lewat deadline Repeat, terlalu sering ubah deadline, arsip tanpa izin, lihat Workspace tanpa akses, ubah Score Formula tanpa izin.
Severity: Low, Medium, High, Critical.

## E. Search (§79) & Settings (§80)

**Search** mendukung: Goal, KPI Area, Strategy, Initiative, Action Plan, Instance, Development Area, Problem Statement, People, Comment, Chat, Bukti, Activity Log, Governance Violation. **Search wajib ikut permission** — user tidak boleh menemukan data yang tidak boleh diaksesnya.

**Settings** (via avatar/profile, bukan bottom nav): User & Permission, Role Template, Organization, Department, Position, Team, Goal Template Library, KPI Area Template Library, Minimum Breakdown Rule, Card Completion Rule, Keterangan Card, Status, Prioritas, Notifications Rule, Score Formula, Activity Log, Governance Violation, Archive, Confidential Access.

## F. Database Entity Blueprint (§83) — 53 core tables

`auth.users`, `profiles`, `organizations`, `departments`, `positions`, `teams`, `team_members`, `role_templates`, `permissions`, `user_permissions`, `goal_templates`, `kpi_area_templates`, `goals`, `kpi_areas`, `strategies`, `development_areas`, `problem_statements`, `initiatives`, `action_plans`, `action_plan_repeat_rules`, `action_plan_instances`, `action_plan_result_values`, `action_plan_submissions`, `evidence_files`, `reviews`, `comments`, `mentions`, `notifications`, `chat_rooms`, `chat_room_members`, `chat_messages`, `chat_message_reads`, `video_briefs`, `brief_understanding_records`, `deadline_change_requests`, `deadline_change_logs`, `cancellations`, `evaluations`, `activity_logs`, `governance_violations`, `period_snapshots`, `minimum_breakdown_rules`, `card_completion_rules`, `card_guidance_contents`, `score_categories`, `score_formula_templates`, `score_formula_versions`, `score_formula_assignments`, `user_score_results`, `ranking_snapshots`, `confidential_access_rules`, `settings`, `login_logs`.

**Removed dari V1.8.1 (jangan dibuat):** `area_goals`, separate `kpis` table di bawah area_goals, `routine_action_plan_templates`, `routine_generated_instances`, `routine_checklist_items`, `routine_contribution_links`, `routine_effectiveness_rules`, `checklist_routine`, `watchers`, planning weight fields.

## G. Relationship Rules (§84)

1. Goal memiliki banyak KPI Area; KPI Area wajib di bawah Goal.
2. Strategy wajib dibuat dari KPI Area; Initiative Performance wajib dari Strategy.
3. Development Area punya banyak Problem Statement; Initiative Development wajib dari Problem Statement.
4. Action Plan wajib dari Initiative; Action Plan Repeat menghasilkan Instance; Instance wajib di bawah Action Plan.
5. Chat room otomatis dibuat untuk Initiative.
6. PIC card induk otomatis akses seluruh turunannya; Reviewer otomatis akses card yang direview.
7. Card guidance content terkait `card_type`.

## H. Seed Data Default (§85)

- **Organization:** Nyantuy Group.
- **Development Area default:** Organization, People, System, Technology, Infrastructure, Brand, Governance Development.
- **Goal Template:** Meningkatkan Omset Penjualan, Meningkatkan Profit.
- **Repeat Frequency:** Daily, Weekly, Monthly, Custom.
- **Aturan Terlewat:** Strict, Grace Period, Overdue Allowed.
- **Status:** Draft, Aktif, Selesai, Diarsipkan, Assigned, In Progress, Menunggu Review, Revisi Diperlukan, Terlewat, Dibatalkan.
- **Prioritas:** Rendah, Sedang, Tinggi, Kritis.
- **Card Guidance default:** pertanyaan kunci tiap card (lihat file 01 §8).

## I. Build & Success

- **Urutan build:** PRD §86 menyediakan 11 fase. Gunakan versi terfase yang sudah dioptimalkan untuk pengiriman nilai awal di [../BUILD-PLAN.md](../BUILD-PLAN.md) (9 fase vertical slice, cakupan identik).
- **Success Metrics (§87):** 40 kriteria kelulusan V1.8.1, mis.: user hanya lihat card relevan; PIC induk lihat semua turunan; card tidak aktif jika belum lengkap; Strategy wajib alasan/risiko/alternatif; MBR jalan; tanpa bobot planning; bobot Score Formula tetap ada; Action Plan One Time & Repeat jalan; instance bisa Terlewat; bukti & nilai hasil & review jalan; PIC tidak bisa approve sendiri; Activity Log, Governance Violation, Notifications, Inbox, People jalan; bahasa konsisten Indonesia; tanpa istilah posting/publish; tanpa feed/announcement.
