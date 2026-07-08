# Rencanapp V1.82 — 03 · Sistem, Permission, Data & Governance

> **Untuk AI agent:** File ini adalah referensi arsitektur & sistem. Isinya: model permission & delegasi, surface aplikasi V1.82 (Home / Notif / Workspace / Inbox / Menu — People pindah ke Menu), Score Formula, audit (Activity Log, Governance Violation), Search, Settings, backend-mandatory rules, blueprint database, relationship rules, seed data. Untuk konsep → [01-konsep-dan-fondasi.md](01-konsep-dan-fondasi.md). Untuk spesifikasi card → [02-spesifikasi-card-dan-eksekusi.md](02-spesifikasi-card-dan-eksekusi.md). Urutan build → [../BUILD-PLAN.md](../BUILD-PLAN.md). Sumber otoritatif: [../PRD.md](../PRD.md).

---

## A. Model Permission & Delegasi

### A.1 Delegasi bertingkat
Prinsip: **yang memiliki card induk dapat membuat card turunan dan menentukan PIC + Reviewer-nya.**
- PIC KPI Area → buat Strategy + tentukan PIC/Reviewer Strategy.
- PIC Strategy → buat Initiative + tentukan PIC/Reviewer Initiative.
- PIC Initiative → buat Action Plan + tentukan PIC/Reviewer Action Plan.

**Default PIC turunan:** jika tidak diubah, PIC turunan otomatis ikut PIC induk (mis. PIC KPI Area = CFO → Strategy & Initiative otomatis CFO). **Pengecualian:** Action Plan wajib punya PIC eksekutor yang ditentukan jelas.

**Reviewer:** ditentukan pembuat card turunan. Action Plan **wajib** punya Reviewer. Strategy/Initiative boleh punya Reviewer sesuai kebutuhan. Default reviewer bisa ikut PIC induk atau dipilih manual. **PIC tidak boleh approve pekerjaannya sendiri** (backend-enforced).

### A.2 Hak Akses Default — berbasis tanggung jawab
User **tidak** melihat semua card. Akses otomatis:
1. PIC card → lihat card itu.
2. Reviewer → lihat card yang direview.
3. PIC card induk → lihat **seluruh** turunannya (Goal → KPI Area → Strategy → Initiative → Action Plan → Instance sesuai levelnya).

**Lihat ≠ Edit:** PIC induk boleh lihat semua turunan, tapi edit/approve/ubah data tetap ikut wewenang. CFO lihat semua di bawah KPI Area-nya tapi tidak boleh ubah bukti staff di luar flow sah. **Audit trail tidak boleh rusak.**

**Workflow user** hanya menampilkan card yang: dia PIC, dia Reviewer, turunan card miliknya, + card lain jika punya permission "lihat seluruh Workspace". Staff tidak lihat card divisi lain by default.

### A.3 Permission yang bisa dicustom (PRD §9, §34.1)
Bukan system rule (system rule = akses PIC/Reviewer/turunan, tidak perlu permission). Yang custom:

1. Melihat Workspace sesuai scope.
2. Membuat Goal / KPI Area / Development Area / Strategy / Initiative / Action Plan.
3. Mengirim Bukti / Menginput Nilai Hasil / Review Bukti.
4. Mengubah deadline.
5. Mengelola user.
6. Mengelola template (Goal / KPI Area / MBR / Card Completion Rule).
7. Mengelola Score Formula.
8. Melihat Activity Log / Governance Violation.
9. Archive & restore.
10. Confidential Access.
11. Manual Score Override.

**Setiap perubahan permission wajib:** Alasan, Actor, Nilai lama, Nilai baru, Activity Log.

### A.4 Default Role Permission
| Role | Default |
|---|---|
| **Super Admin / CEO** | Semua: buat semua card, lihat seluruh Workspace, kelola card orang lain, Settings, User & Permission, template, Score Formula, Confidential, Override. |
| **C-Level** | Sesuai area authority: buat KPI Area jika diizinkan; buat Strategy/Initiative/Action Plan jika jadi PIC induknya; lihat seluruh turunan miliknya. |
| **Management / Manager / Head** | Buat Development Area jika diizinkan; buat Strategy/Initiative/Action Plan jika jadi PIC induknya; tentukan PIC/Reviewer turunan yang dibuatnya; lihat seluruh turunan miliknya. |
| **Staff** | Lihat card yang dia PIC/Reviewer; kerjakan Action Plan miliknya; submit Bukti & Nilai Hasil; comment; lihat Notif, Inbox (member), People (via Menu). **Tidak** boleh buat card, lihat seluruh Workspace, kelola card orang lain, ubah Settings. |
| **Reviewer** | Sub-role fungsional: bisa review Bukti pada card yang ditugaskan; tidak otomatis punya akses turunan card. |

### A.5 Watcher dihapus
Rencanapp V1.82 **tidak** memakai Watcher. Tidak ada watcher table, tidak ada "Add Watcher", tidak ada watcher notification. Akses luas diberi via permission "lihat seluruh Workspace".

## B. Surface Aplikasi (V1.82)

### B.1 Bottom Navigation Final (PRD §7.1)
Bottom nav utama: **Home · Notif · Workspace · Inbox · Menu**.

**People tidak tampil sebagai bottom nav utama; People diakses lewat Menu.**

Settings tidak tampil sebagai bottom nav mandiri; diakses lewat Menu.

### B.2 Header Global (PRD §7.2)
1. Logo mark Rencanapp di kiri.
2. Search pill pendek berlabel "Cari".
3. Icon Notifications.
4. Avatar / profile di kanan.

Inbox boleh memakai header lokal ala chat app tapi tetap terasa satu keluarga.

### B.3 Home (PRD §27) — Fokus Hari Ini
Pusat kendali hari ini. **Bukan feed panjang.**

Menampilkan: Header global, greeting singkat, kartu **Fokus Hari Ini** (Action Plan / Repeat / review perlu perhatian), prioritas satu layar (no horizontal scroll), Action Plan penting hari ini, update terbaru relevan, kartu **Gap KPI Area** (dari `target_numeric`).

Kartu Fokus Hari Ini: CTA cukup satu (**Detail**), tidak menampilkan banyak CTA sekaligus.

**Tidak menampilkan:** shortcut besar yang duplikat dengan nav, Feed, Announcement, Company News, Posting, Social activity.

### B.4 Notifications (PRD §28) — Alert & Action Center
**Bukan chat area.**

Section: New, Earlier. Row: avatar/icon, title, context, time, status read/unread. Action button kecil hanya jika perlu.

Jenis: Review diperlukan, Bukti dikirim, Deadline change request, Deadline lewat, Mention, Permission berubah, Governance warning, MBR warning, Repeat due today.

UX: card tidak terlalu kecil, action button tidak makan ruang.

### B.5 Workspace Overview (PRD §13)
Pintu masuk ke Performance Workspace dan Development Workspace. Komponen: kartu **Performance** (Target Kinerja), kartu **Development** (Pembangunan Sistem), icon `?` di kanan atas tiap kartu, progress orb, tombol **Masuk**.

### B.6 Performance & Development Tree (PRD §14–15)
Default: semua tree mode **ringkas**. User buka turunan dengan **panah**, buka isi card dengan **Detail**.

Tiap card node menampilkan: label kategori, period badge (mis. 2026 / Juni 2026 / Q2 2026 / Hari ini), title, metadata 1–2 baris, progress orb, actions **Detail · `...` · + Turunan** (jika permission & MBR mengizinkan).

Panel **Periode aktif** kompak: `Periode aktif: Juni 2026 · Goal 2026 – Q2 – Bulan berjalan · [Ubah]`. Segmented control **Bulan / Quarter**; list periode: Archive (redup) · Aktif · Quarter.

### B.7 Inbox & Initiative Chat (PRD §29–30)
Inbox = **khusus Initiative Chat**. Bukan action queue, bukan Notifications.

Komponen Inbox: header lokal, search Initiative/pesan, filter (Semua, Belum dibaca, Saya PIC, Review, Deadline), list chat, unread dot, timestamp.

Initiative Chat: setiap Initiative otomatis punya chat room saat aktif. Member = PIC Initiative, Reviewer Initiative, PIC/Reviewer Action Plan di bawahnya, PIC induk yang punya akses turunan. **Tanpa akses Initiative → tidak bisa buka chat-nya.**

**Inbox bukan tempat approval resmi** — keputusan resmi tetap via Comment / Review / Status / Activity Log. Bukti tetap dikirim melalui Action Plan, bukan sebagai chat biasa.

Action Plan dapat membuka chat dengan **konteks reply**, tidak membuat chat terpisah.

### B.8 Menu (PRD §31) — surface baru V1.82
Pintu masuk ke profil, People, tools admin, template, settings, archive, dan logout. Pola mirip menu drawer Facebook mobile.

Komponen:
1. Header Menu.
2. Profile card.
3. **Akses Cepat**: People, Log Aktivitas, Archive.
4. **Template** (accordion): Goal Template, KPI Area Template.
5. **Bantuan** (accordion).
6. **Pengaturan** (accordion): Organisasi, Repeat Setting, Score Formula, Permission Settings, Minimum Breakdown Rule.
7. **Admin Lanjutan** (accordion): Governance, Confidential, Override Score.
8. Logout.

UX: icon di tengah frame, judul kategori seragam ukuran, item admin hanya tampil jika permission mengizinkan.

### B.9 People (PRD §32) — via Menu
Tempat melihat ranking dan profil pencapaian user (objektif). **People bukan tempat mempermalukan orang.** Dilarang label "karyawan terburuk / staff malas / manager gagal".

Komponen: header People, search, tabs (Ranking, Bulan ini, Quarter, Admin), list ranking + tombol **Lihat Profil**, admin panel jika permission admin.

People list **tidak** menampilkan PIC, Reviewer, atau detail KPI Area (karena People bersifat skala umum).

People row: Rank, Avatar, Nama, Jabatan, Achievement summary, Score, tombol Lihat Profil.

### B.10 People Profile (PRD §33)
Komponen: Profile header, Nama, Jabatan & tanggal bergabung, Ranking People, Detail People, **Tugas** (accordion — keterlibatan di Action Plan / Initiative / Strategy / KPI Area / Problem Statement), Kontribusi bulan ini, Rincian Score, Riwayat Score.

Header **tidak** menampilkan terlalu banyak angka.

## C. Score Formula (PRD §34.2)

Planning card **tanpa bobot antar-card**, tapi **Score Formula punya bobot antar-kategori** (untuk hitung performa user). Bisa dicustom dari Settings. **Total bobot aktif wajib 100%** — jika bukan 100%, formula tidak bisa diaktifkan. Wajib **versioning + effective date + closed period lock**; score periode tertutup tidak boleh berubah diam-diam.

### C.1 Default formula per level
| Level | Kategori (bobot) |
|---|---|
| **Staff** | Action Plan Completion 20%, Repeat Compliance 20%, Result Achievement 15%, On-Time Rate 15%, Review Pass Rate 10%, Development Contribution 10%, Governance Discipline 10%. |
| **Management** | KPI Area Achievement 25%, Performance Goal Contribution 15%, Development Contribution 10%, Strategy Completion Rate 15%, Initiative Completion Rate 10%, Team Repeat Compliance 10%, Team Result Achievement 5%, Review Speed & Quality 5%, Governance Discipline 5%. |
| **C-Level** | Goal Achievement 30%, KPI Area Achievement 30%, Development Contribution 15%, Strategic Initiative Achievement 15%, Cross-functional Execution 5%, Governance Discipline 5%. |
| **CEO** | Company Goal Achievement 35%, Profit/Growth Achievement 20%, Strategic Portfolio Health 15%, Organization Development Score 15%, Leadership Team Health 10%, Governance Discipline 5%. |

> "KPI Area Achievement" di Score Formula = **kategori penilaian performa**, bukan bobot planning card. Juga tidak sama dengan Target Breakdown KPI Area (yang mendistribusi target satu KPI Area lintas waktu — lihat file 02 bagian C).

### C.2 Score Formula Versioning
Tiap perubahan = version baru. Simpan: template name, version number, kategori score, bobot kategori, source data, effective date, created by, approved by (jika ada), change reason, created at. Score historis tetap memakai formula periode tersebut.

### C.3 Manual Score Override (PRD §34.10)
Bukan default; hanya user berwenang. Wajib simpan: auto calculated score, manual adjusted score, reason, changed by, approved by (jika perlu), changed at, Activity Log. **Tidak boleh menghapus hasil perhitungan otomatis.**

## D. Audit & Governance

### D.1 Activity Log (PRD §35) — append-only, tidak bisa diedit/dihapus dari UI

Default UI: accordion tertutup di detail card + screen Log Aktivitas di Menu.

Event yang dicatat (a.l.):
- Card dibuat / diedit / diaktifkan / selesai / diarsipkan.
- PIC / Reviewer diganti.
- Bukti & Nilai Hasil dikirim (per submission version).
- Review approve / reject.
- Deadline change (request / approved / rejected).
- Instance dibuat / terlewat.
- MBR & Card Completion Rule diubah.
- Keterangan Card diubah.
- **KPI Area Target Breakdown periode berjalan diedit** (dengan alasan).
- Permission diubah.
- Card gagal aktif karena validasi (Kelengkapan Card / Target 100%).
- User coba akses tanpa permission.
- Score Formula diubah / diaktifkan / versioning.
- Confidential Access diberikan.
- Manual Score Override.

Activity Log **tidak boleh terasa mengintimidasi**.

### D.2 Governance Violation (PRD §36)
Mencatat pelanggaran aturan sistem, contoh:
- Reviewer sama dengan PIC (anti self-approval).
- Coba lanjut turunan saat MBR belum terpenuhi.
- Coba aktifkan Card dengan field wajib kosong.
- Coba aktifkan KPI Area saat Target Breakdown ≠ 100%.
- Lewat deadline Action Plan Repeat.
- Terlalu sering ubah deadline.
- Coba ubah bukti tersubmit.
- Ubah target tanpa alasan.
- Ubah permission tanpa izin.
- Lihat Workspace tanpa akses.
- Coba akses Confidential tanpa izin.
- Ubah Score Formula tanpa izin.

Severity: Low, Medium, High, Critical.

UI: severity, entity terkait, penyebab, CTA selesaikan, resolution note.

## E. Search (PRD §38) & Settings (PRD §34)

### E.1 Search
**Search wajib ikut permission** — user tidak boleh menemukan data yang tidak boleh diaksesnya.

Cakupan: Goal, KPI Area, Strategy, Initiative, Action Plan, Action Plan Instance, Development Area, Problem Statement, People, Comment, Chat, Bukti, Activity Log, Governance Violation. Hasil dikelompokkan per jenis.

### E.2 Settings (via Menu)
User & Permission, Role Template, Organization, Department, Position, Team, Goal Template Library, KPI Area Template Library, Minimum Breakdown Rule, Card Completion Rule, Keterangan Card, Status, Prioritas, Repeat Setting, Notifications Rule, Score Formula, Activity Log, Governance Violation, Archive, Confidential Access, Manual Score Override.

## F. Backend-Mandatory Rules (PRD §41)

Frontend tidak boleh menjalankan logic penting sendirian. **Backend wajib** memvalidasi:

1. Aktifkan Card.
2. Kelengkapan Card.
3. Minimum Breakdown Rule.
4. **Target Breakdown Quarter/Bulan total 100%**.
5. Generate Action Plan Instance dari Repeat.
6. Submit Bukti (versioning + locking).
7. Submit Nilai Hasil (hanya masuk KPI Area setelah review approve).
8. Review approve / reject.
9. Anti self-approval (PIC ≠ Reviewer untuk approve).
10. Deadline change approval.
11. Permission change (dengan alasan + Activity Log).
12. Score Formula activation (total 100%, versioning, closed period lock).
13. Activity Log creation (append-only).
14. Governance Violation creation.
15. Archive & restore.
16. Confidential access.
17. Manual Score Override.
18. Repeat missed checker (auto-mark Terlewat setelah deadline lewat sesuai mode).

Format response standar:
```json
{ "success": true, "data": {}, "meta": {} }
```
Error:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Lengkapi data wajib terlebih dahulu." } }
```

## G. Database Entity Blueprint

Baseline V1.8.1 (53 core tables) tetap berlaku sebagai fondasi. V1.82 menambah/menyesuaikan kolom & tabel untuk fitur baru; nama pastinya mengikuti implementasi migrasi Supabase (lihat `supabase/migrations/`).

**Baseline (dari V1.8.1):**
`auth.users`, `profiles`, `organizations`, `departments`, `positions`, `teams`, `team_members`, `role_templates`, `permissions`, `user_permissions`, `goal_templates`, `kpi_area_templates`, `goals`, `kpi_areas`, `strategies`, `development_areas`, `problem_statements`, `initiatives`, `action_plans`, `action_plan_repeat_rules`, `action_plan_instances`, `action_plan_result_values`, `action_plan_submissions`, `evidence_files`, `reviews`, `comments`, `mentions`, `notifications`, `chat_rooms`, `chat_room_members`, `chat_messages`, `chat_message_reads`, `video_briefs`, `brief_understanding_records`, `deadline_change_requests`, `deadline_change_logs`, `cancellations`, `evaluations`, `activity_logs`, `governance_violations`, `period_snapshots`, `minimum_breakdown_rules`, `card_completion_rules`, `card_guidance_contents`, `score_categories`, `score_formula_templates`, `score_formula_versions`, `score_formula_assignments`, `user_score_results`, `ranking_snapshots`, `confidential_access_rules`, `settings`, `login_logs`.

**Perluasan V1.82 (nama pasti ikut migrasi):**
- `kpi_areas.target_numeric numeric(20,4) NULL` + `kpi_areas.target_unit text NULL` (migrasi 0032 — override PRD §18 opsional).
- Struktur **Target Breakdown Quarter & Bulan** (kontribusi %, versioning perubahan periode berjalan dengan alasan, log audit).
- Struktur **Period Focus Engine** (periode aktif per user/org, snapshot per periode).

**Removed dari V1.82 (jangan dibuat):** `area_goals`, separate `kpis` table di bawah area_goals, `routine_action_plan_templates`, `routine_generated_instances`, `routine_checklist_items`, `routine_contribution_links`, `routine_effectiveness_rules`, `checklist_routine`, `watchers`, planning weight fields antar-card.

## H. Relationship Rules

1. Goal memiliki banyak KPI Area; KPI Area wajib di bawah Goal.
2. KPI Area punya target tahunan; Target Breakdown Quarter total 100%; Target Breakdown Bulan (dalam tiap Quarter) total 100%.
3. Strategy wajib dibuat dari KPI Area; Initiative Performance wajib dari Strategy.
4. Development Area punya banyak Problem Statement; Initiative Development wajib dari Problem Statement.
5. Action Plan wajib dari Initiative; Action Plan Repeat menghasilkan Instance; Instance wajib di bawah Action Plan.
6. Chat room otomatis dibuat untuk Initiative saat aktif.
7. PIC card induk otomatis akses seluruh turunannya; Reviewer otomatis akses card yang direview.
8. Card guidance content terkait `card_type`.
9. Nilai Hasil masuk KPI Area hanya setelah review approve.

## I. Seed Data Default

- **Organization:** Rencanapp / Nyantuy Group.
- **Development Area default:** Organization, People, System, Technology, Infrastructure, Brand, Governance Development.
- **Goal Template:** Meningkatkan Omset Penjualan, Meningkatkan Profit.
- **Repeat Frequency:** Harian, Mingguan, Bulanan, Custom.
- **Mode keterlambatan:** Ketat (Strict), Ada toleransi (Grace Period), Lewat tetap tercatat (Overdue Allowed).
- **Status:** Draft, Aktif, Selesai, Diarsipkan, Assigned, In Progress, Menunggu Review, Revisi Diperlukan, Terlewat, Dibatalkan.
- **Prioritas:** Rendah, Sedang, Tinggi, Kritis.
- **Card Guidance default:** pertanyaan kunci tiap card (lihat file 01 §10).

**Prototype seed** (untuk demo/dev): User utama Rina Jaya (Staf Marketing, Score 86, Rank 1); Goal "Omset 48 Miliar 2026"; KPI Area "Menambah Jumlah Customer" / "Meningkatkan Basket Size"; Strategy "Akuisisi Customer via Meta Ads"; Initiative "Campaign Paket Hemat Pizza"; Action Plan "Upload 5 konten angle hemat".

## J. Build & Success

- **Urutan build:** lihat [../BUILD-PLAN.md](../BUILD-PLAN.md) — 9 fase vertical slice, cakupan = 100% scope V1.82.
- **Acceptance Criteria V1.82 (PRD §44):** 28 kriteria kelulusan, ringkas: mobile-first 390px; bottom nav final Home/Notif/Workspace/Inbox/Menu; header global Rencanapp konsisten; Menu jadi akses People/Template/Settings/Admin/Archive/Logout; Workspace pakai card tree dengan Detail & panah terpisah; Performance & Development pola UI sama; periode default bulan berjalan; pilih Bulan/Quarter; card periode lewat redup + tidak bisa buat turunan baru; Goal tahunan; KPI Area ikut Goal tahunan; KPI Area punya pecahan target Quarter & Bulan total 100%; New KPI Area default manual, template lewat popup; Kelengkapan Card tidak memenuhi layar, divalidasi saat Aktifkan Card; MBR mengunci tombol turunan dengan popup; Action Plan One Time & Repeat; Repeat menghasilkan Instance; Bukti versioning; Nilai Hasil masuk KPI Area setelah review; Initiative Chat hanya untuk Initiative; Action Plan bisa buka chat dengan konteks reply; Notifications bukan chat; Inbox bukan action queue; People ranking objektif tanpa mempermalukan; Admin settings ikut permission; Activity Log tidak intimidatif; Search & Archive ikut permission; **tanpa Feed, Company News, Announcement, Routine, Checklist Routine, Watcher, Area Goal**.
