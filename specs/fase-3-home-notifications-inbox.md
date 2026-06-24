# Spec Final — Fase 3 EMS V1.8.1: Home + Notifications + Inbox

> Status: siap eksekusi (TDD-ready). Lapisan UI + data **aditif** di atas loop eksekusi & permission model Fase 1–2. Tidak ada jalur approval/penulisan baru yang melonggarkan invarian governance. Semua temuan grill yang mengikat sudah diselesaikan terhadap kode nyata (migrasi `0001`–`0007`).
> **⚠️ Addendum mengikat: `specs/fase-3-resolusi-blocker.md`** (resolusi 5 blocker + CF-1..CF-4). Bila bentrok dengan teks di bawah, addendum menang. Ringkas: Home per-section (RPC agregat dilarang), `org_today()` server = sumber tanggal tunggal, `FR-H-12` onboarding `<7 hari` via `profiles.created_at` (diekspos di `useProfile`), `governance_warning` recipient bercabang per `violation_type` (CF-1).

## 1. Problem & Goals

### 1.1 Problem
Setelah Fase 1–2, loop eksekusi sudah utuh (Owner menugaskan Action Plan → PIC submit Bukti+Nilai Hasil → Reviewer approve/reject dengan anti-self-approval → Repeat Instance ter-generate dengan Compliance terhitung). **Loop benar, tapi belum lengket.** Gejala terverifikasi di kode:
- **Home parsial.** `mobile/src/app/(app)/(tabs)/index.tsx` hanya menampilkan greeting + dua kartu prioritas + dua section (`listMyActionPlans`, `listPendingReviews`). Belum ada Repeat due today, Terlewat instance, deadline mendekat, Revisi. `isOverdue` memakai `todayISO()` berbasis **UTC/device** (`new Date().toISOString()`), tidak menyentuh `action_plan_instances`.
- **Notifications kosong.** `notifications.tsx` placeholder; tidak ada tabel `notifications`/`comments`/`mentions`.
- **Inbox kosong.** `inbox.tsx` placeholder; tidak ada tabel chat.

### 1.2 Goals
1. **Home = Today Command Center** lengkap, sadar-permission, **timezone-aware** (`organizations.timezone`): section Perlu dikerjakan, Repeat hari ini, Butuh review, Terlewat, Deadline mendekat (≤3 hari), Revisi diperlukan + onboarding hint user baru.
2. **Notifications hub** append-only dengan tab/segmentasi + unread + mark-as-read via RPC.
3. **Inbox = Initiative Chat** auto-create per Initiative, membership turunan akses, kirim pesan immutable, unread per room, mention.
4. **Invarian governance Fase 1–2 dipertahankan tanpa kompromi.**

> [!warning] Koreksi klaim "aditif murni"
> Fase 3 **memodifikasi semantik tanggal** Fase 1: `todayISO()` device/UTC → perhitungan org-timezone di server (kalkulasi overdue/today bisa bergeser 1 hari). Wajib uji boundary timezone (AC-H6b).

> [!warning] Koreksi klaim "no governance change"
> Fase 3 **me-replace** RPC `SECURITY DEFINER` existing (`submit_action_plan`, `submit_action_plan_instance`, `review_action_plan_submission`, `review_action_plan_instance_submission`, `mark_overdue_instances`) untuk menambah side-effect notifikasi. Setiap guard existing WAJIB dipertahankan byte-for-byte (AC-N9).

## 2. Non-Goals
Lihat daftar `non_goals`. Inti: tanpa Score/MBR/Kelengkapan-Card di Home, tanpa UI thread komentar penuh, tanpa Realtime, tanpa Settings notif, tanpa kolom `reviewer_id` baru di `initiatives`, dan "PIC card induk" sebagai member chat adalah no-op (Strategy = Fase 4).

## 3. Keputusan Resolusi (dari grill, dikunci terhadap kode)

| # | Isu | Keputusan final | Bukti kode |
|---|-----|-----------------|-----------|
| R1 | comments di Fase 3 vs Fase 8 | Tabel `comments`+`mentions` + RPC `create_comment` minimal **masuk Fase 3**; UI thread penuh defer Fase 8 | BUILD-PLAN §77 |
| R2 | "Reviewer Initiative" sebagai member chat | **DIBUANG.** `initiatives` tak punya `reviewer_id`. Member = PIC Initiative + PIC/Reviewer Action Plan turunan | `0005:47-60` |
| R3 | recipient `governance_warning` | Diturunkan dari **PIC/Reviewer card terdampak** (via `entity_id`) + pemegang `view_governance_violation`; **bukan** `governance_violations.user_id` (berisi pelaku untuk `reviewer_override`) | `0005:446-447` (pelaku), `0007:347` (PIC) |
| R4 | permission key governance | Pakai **`view_governance_violation`** (bukan karangan `view_violations`) | `0001:214` |
| R5 | arsitektur Home | **Query per-section** (bukan satu RPC agregat) agar retry/error per-section bertahan; "hari ini" tetap dihitung di server (org tz) per query/helper | `index.tsx` pola per-section |
| R6 | ambang deadline mendekat | **3 hari, final** (tag `[?]` dihapus); Settings = Fase 8 | keputusan dikunci |
| R7 | timing auto-create chat room | **On Initiative activate** (draft→active); room disembunyikan dari Inbox saat draft | `initiatives.status` `0005:56` |
| R8 | idempotensi cron notif | **Unique partial index** `(recipient_id, entity_id, type, tanggal-lokal-org)` + `on conflict do nothing` | — |
| R9 | `view_all_workspace` di chat | **Read-only**: lihat room, **tidak boleh** kirim pesan | governance hole prevention |
| R10 | `perlu_dikerjakan` status filter | Sertakan `revision` agar konsisten `listMyActionPlans` | `cards.ts:182` |
| R11 | comments `action_plan_instance` | RLS join `instance.action_plan_id` → `can_access_action_plan`, atau larang entity_type instance | tak ada `can_access_*` instance |

## 4. User Stories (ringkas, per-peran)
PIC & Reviewer adalah peran **per-card**; role default (CEO/C-Level/Management/Staff) menentukan luas akses baca, bukan isi Home. Home tetap **personal** untuk semua role — CEO dengan `view_all_workspace` tetap hanya melihat card yang ia PIC/Reviewer di Home.
- **US-H1** PIC: Home menampilkan tugas hari ini (Action Plan + Repeat Instance) yang jadi tanggung jawabnya.
- **US-H2** PIC: melihat item Revisi yang harus diperbaiki.
- **US-H3** PIC: melihat Terlewat & deadline mendekat tersorot.
- **US-H4** Reviewer: melihat antrean review (anti-self-approval otomatis).
- **US-H5** Semua: onboarding hint saat baru (PRD §61.10).
- **US-N1..N8** Reviewer/PIC: review request, approval/reject, deadline/repeat reminder, terlewat, mention, governance warning, tab "Perlu Tindakan", unread+mark-read.
- **US-I1..I7** Anggota Initiative: chat room otomatis, membership turunan akses, kirim pesan immutable, unread per room, mention, chat ≠ keputusan.

## 5. Functional Requirements

### 5.1 Home (`FR-H-*`)
- **FR-H-01 (WAJIB)** Semua section sadar-permission via RLS + helper (`can_access_action_plan`/`can_access_initiative`); client tidak memfilter data sensitif.
- **FR-H-02 (WAJIB)** GreetingHero + blok Prioritas (jumlah Terlewat + jumlah Butuh Review).
- **FR-H-03 (WAJIB)** "Perlu dikerjakan": Action Plan one-time `pic_id=auth.uid()`, status ∈ {assigned, in_progress, revision}, urut deadline asc.
- **FR-H-04 (WAJIB)** "Butuh review Anda": `reviewer_id=auth.uid()`, status submitted.
- **FR-H-05 (WAJIB)** "Repeat jatuh tempo hari ini": `action_plan_instances` PIC=user, `deadline_at::date` = hari ini **di org timezone**, status ∈ {assigned, in_progress, revision}; submitted/done/archived/missed dikecualikan.
- **FR-H-06 (WAJIB)** "Revisi diperlukan": status revision di mana user PIC. Reviewer melihat re-submit di antrean review, bukan diduplikasi.
- **FR-H-07 (WAJIB)** "Terlewat": (a) one-time AP `deadline<today-org` & status bukan done/approved; (b) instance `missed`. Tone danger + label teks.
- **FR-H-08 (WAJIB)** "Deadline mendekat": deadline ∈ (today-org, today-org+3 hari]. Tidak duplikat dengan Terlewat.
- **FR-H-09 (SEBAIKNYA)** Ringkasan progress pribadi = hitungan sederhana, tanpa Score/compliance%. Default tidak diisi jika ambigu.
- **FR-H-10 (WAJIB)** Refresh on focus + pull-to-refresh; tanpa Realtime/interval.
- **FR-H-11 (WAJIB)** Tidak ada Feed/sosial/MBR/Kelengkapan Card di Home.
- **FR-H-12 (WAJIB)** Onboarding hint user baru (PRD §61.10).
- **FR-H-13 (WAJIB)** Loading/error/empty per section.

### 5.2 Notifications (`FR-N-*`)
- **FR-N-01 (WAJIB)** Tabel `notifications` append-only (id, organization_id, recipient_id, actor_id null, type, entity_type, entity_id, title, body, is_read, read_at, created_at). Tanpa policy/grant UPDATE/DELETE.
- **FR-N-02 (WAJIB)** Tabel Tipe Notifikasi Fase 3 (otoritatif, sinkron enum CHECK + AC-N5):

| Tipe (PRD §62) | Status Fase 3 | Alasan / fase |
|---|---|---|
| review_request | **AKTIF** | submit → reviewer |
| approved | **AKTIF** | review approve → PIC |
| rejected | **AKTIF** | review reject/revisi → PIC |
| comment | **AKTIF** | `comments` ada Fase 3 |
| mention | **AKTIF** | `mentions` ada Fase 3 |
| deadline_reminder | **AKTIF** | cron harian |
| repeat_due | **AKTIF** | cron harian |
| instance_missed | **AKTIF** | `mark_overdue_instances` |
| governance_warning | **AKTIF** | trigger gov violation |
| deadline_change_request | **DEFER Fase 8** | fitur sumber belum ada |
| card_needs_completion | **DEFER Fase 5** | MBR |
| mbr_warning | **DEFER Fase 5** | MBR |
| card_activated | **DEFER** | tak ada nilai retensi jelas |

- **FR-N-03 (WAJIB)** Notifikasi ditulis **hanya server**. Client tidak insert langsung.
- **FR-N-04 (WAJIB)** RLS SELECT: `recipient_id = auth.uid()`.
- **FR-N-05 (WAJIB)** Tab: Semua, Perlu Tindakan, Review, Deadline, Komentar, Terlewat, Repeat, Governance. `instance_missed` → hanya tab Terlewat (kanonik); Repeat = {repeat_due}; Perlu Tindakan = {review_request, deadline_reminder, mention}.
- **FR-N-06 (WAJIB)** Unread per-notifikasi; `mark_notification_read(id)`/`mark_all_notifications_read(type?)` membalik flag, immutable sekali set, cek `recipient_id=auth.uid()` di dalam RPC.
- **FR-N-07 (WAJIB)** Tap → tujuan via entity_type/entity_id; tunduk RLS; entity hilang → pesan ramah.
- **FR-N-08 (WAJIB)** `governance_warning` recipient = PIC/Reviewer card terdampak + pemegang `view_governance_violation`; severity ≥ medium; title/body ≤ nama entity.
- **FR-N-09 (WAJIB)** Polling = on-focus + manual refresh; tanpa push.
- **FR-N-10 (WAJIB)** `comments`+`mentions` di-ship; parsing `@user` di client, **validasi akses di server** sebelum membuat notifikasi mention.

### 5.3 Inbox (`FR-I-*`)
- **FR-I-01 (WAJIB)** 1 `chat_rooms` per Initiative (unique initiative_id), auto-create **on activate**; room draft tidak tampil di Inbox.
- **FR-I-02 (WAJIB)** `populate_chat_room_members` = union { PIC Initiative, PIC+Reviewer setiap Action Plan turunan }. Tanpa "Reviewer Initiative". "PIC card induk" = no-op.
- **FR-I-03 (WAJIB)** Sync via trigger `AFTER INSERT/UPDATE OF pic_id,reviewer_id ON action_plans`: **tambah** member baru + **cabut** member yang kehilangan peran terakhir.
- **FR-I-04 (WAJIB)** RLS SELECT `chat_rooms`/`chat_messages` = member OR `view_all_workspace` (read-only). Cek member di policy + RPC.
- **FR-I-05 (WAJIB)** `send_chat_message` insert immutable; **menolak non-member** walau `view_all_workspace`.
- **FR-I-06 (WAJIB)** Daftar room (member) + pesan paginasi.
- **FR-I-07 (WAJIB)** Unread per room via `chat_message_reads` append-only; hitung mengecualikan pesan `author_id=user`.
- **FR-I-08 (WAJIB)** Mention chat → notifikasi (akses-gated server); pesan biasa tidak memicu notifikasi.
- **FR-I-09 (WAJIB)** Chat bukan kanal keputusan.

### 5.4 Governance lintas-surface (`FR-G-*`)
RLS non-negotiable; anti-self-approval; evidence locking; audit + collab append-only; bahasa/a11y konsisten; timezone-aware; archived tidak ditampilkan; scope guardrails PRD §88.

## 6. Data Contracts

### 6.1 Migrasi `0008_fase3_collab.sql` — urutan DDL dependency-safe (WAJIB)
Urutan create: `notifications` → `chat_rooms` → `chat_room_members` → `chat_messages` → `chat_message_reads` → `comments` → `mentions`. **`mentions` dibuat terakhir** (FK ke `chat_messages` + `comments`). Aktifkan RLS + policy SELECT-only untuk 7 tabel; cabut grant INSERT/UPDATE/DELETE langsung dari `authenticated`.

Kolom inti:
- `notifications`: id, organization_id, recipient_id→profiles, actor_id→profiles(null), type CHECK(9 nilai aktif), entity_type, entity_id, title, body, is_read default false, read_at, created_at. **Idempotensi cron**: kolom `dedupe_date date` (diisi RPC = tanggal-lokal-org) + `unique (recipient_id, entity_id, type, dedupe_date)`.
- `comments`: entity_type CHECK(action_plan|action_plan_instance|initiative), entity_id, author_id, body.
- `mentions`: comment_id(null), chat_message_id(null), mentioned_user_id, CHECK exactly-one-parent.
- `chat_rooms`: organization_id, initiative_id UNIQUE, name.
- `chat_room_members`: chat_room_id, member_id, unique(chat_room_id, member_id).
- `chat_messages`: organization_id, chat_room_id, author_id, body.
- `chat_message_reads`: chat_message_id, reader_id, unique(chat_message_id, reader_id).

### 6.2 RPC baru (`SECURITY DEFINER set search_path = ''`)
`mark_notification_read(p_notification_id)`; `mark_all_notifications_read(p_type default null)`; `create_comment(p_entity_type, p_entity_id, p_body, p_mentioned_user_ids[])`; `send_chat_message(p_chat_room_id, p_body, p_mentioned_user_ids[])` (pemanggil ∈ members, `view_all_workspace` tidak cukup); `mark_chat_messages_read(p_chat_room_id, p_up_to)`; `populate_chat_room_members(p_initiative_id)`; `sync_chat_member_for_action_plan(p_action_plan_id)` (add+revoke). Helper `is_chat_member(uuid)` SECURITY DEFINER.

Side-effect notifikasi (RPC existing yang di-replace, guard wajib dipertahankan): submit_* → review_request; review_* → approved/rejected; mark_overdue_instances → instance_missed (idempoten); create_comment/send_chat_message → mention (akses-gated); cron `notify-deadlines` → deadline_reminder + repeat_due (idempoten, `actor_id=null`); trigger `after insert on governance_violations` (severity≥medium) → governance_warning ke PIC/Reviewer card terdampak + pemegang view_governance_violation.

### 6.3 Home: bentuk data
Rekomendasi: **query per-section** (pola `listMyActionPlans`), filter `pic_id`/`reviewer_id=auth.uid()`, "hari ini" dihitung di org timezone (helper SQL `org_today()` atau `deadline_at at time zone org.tz`). Jika dipilih RPC `get_today_focus`, ia WAJIB: (a) discriminated item `{ kind: 'action_plan'|'instance', shared fields }`; (b) filter `auth.uid()` eksplisit per section (definer bypass RLS); (c) `perlu_dikerjakan` menyertakan `revision`. Default spec = per-section demi retry granular (AC-H11).

### 6.4 RLS baru
notifications: `recipient_id=auth.uid()`. comments: org + akses sesuai entity_type (instance→`can_access_action_plan(instance.action_plan_id)`). mentions: parent visible OR `mentioned_user_id=auth.uid()`. chat_rooms/chat_messages: `is_chat_member(...)` OR `can_view_workspace()`. chat_room_members: room milik user. chat_message_reads: `reader_id=auth.uid()`. Chat membership = sumber kebenaran keanggotaan, diturunkan konsisten dari aturan akses Initiative (`can_access_initiative`), tidak menciptakan definisi visibilitas kedua yang menyimpang.

### 6.5 Data layer (client tipis)
`mobile/src/lib/notifications.ts`, `inbox.ts`, `home.ts` (atau extend `cards.ts`). Reuse `PersonRef` + label/tone maps. Regen `database.types.ts`.

## 7. Acceptance Criteria
Lihat `acceptance_criteria` (Given/When/Then): AC-H1..H14, AC-N1..N11, AC-I1..I7, AC-G1..G8.

## 8. Edge Cases & Error States
- **Permission ditolak = tidak terlihat** (list kosong → EmptyState), bukan error; error hanya saat deep-link by-id ke entity di luar scope (RPC/`.single()` throw → ErrorState "Tidak dapat diakses", tanpa membocorkan keberadaan).
- **Loading**: skeleton hanya `isLoading && !data`; refetch menahan data lama. Tab bar Notifications & composer Inbox render segera.
- **Kirim pesan gagal**: pessimistic; teks composer dipertahankan; inline error.
- **mark-as-read gagal**: idempoten, retry diam; tidak blocking.
- **Item basi (no realtime)**: tap item yang berubah → RPC menolak → inline "Item sudah berubah, menyegarkan…" + refetch.
- **Notifikasi → entity diarsipkan/dihapus**: notifikasi tetap; detail "Item tidak lagi tersedia"; tetap bisa ditandai dibaca.
- **Mention ke user tanpa akses**: silent no-op (validasi server).
- **Membership berubah pasca-room**: add + revoke via trigger.
- **Boundary timezone & due-today**: AC-H6b, AC-H8b.
- **Boundary count error**: kartu prioritas → "—", bukan "0".

## 9. Open Questions
Lihat `open_questions` (severity gating, recipient governance_warning per violation_type, batas UI komentar, metrik ringkasan progress pribadi, Realtime khusus Inbox, visibilitas PIC induk, kebijakan denormalized title/body). Semua non-blocking untuk struktur inti; default tertulis disediakan.

## 10. Handoff ke TDD
- **Migrasi `0008` dulu** (red: tabel/RPC/RLS belum ada). Uji append-only (tanpa UPDATE/DELETE policy + grant dicabut), RLS recipient/member, idempotensi unique index, helper `is_chat_member`.
- **RPC guard regression**: snapshot perilaku guard existing → uji tetap menyala setelah side-effect notifikasi (AC-N9).
- **Server-side tests**: timezone boundary (AC-H6b), no-leak per-section/get_today_focus (AC-G2), membership add+revoke (AC-I2b), mention akses-gated (AC-I6), governance_warning recipient (AC-N8), cron idempotency (AC-N10).
- **Client tests**: per-section loading/error/empty (AC-H11/H13), onboarding hint (AC-H12), tab no-double-count (AC-N3/N4), composer preserve-on-fail (AC-I4), unread exclude-own (AC-I5).
- **Urutan implementasi**: (1) 0008 migrasi, (2) regen types, (3) data layer modules, (4) Home server-side date fix + section queries, (5) Notifications, (6) Inbox. Jalankan via skill `tdd-plan` dengan `feature` + `paths` di `tdd_handoff`.