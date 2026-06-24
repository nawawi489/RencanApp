# Addendum Resolusi Blocker — Fase 3 (Home + Notifications + Inbox)

> Status: TERKUNCI. Dokumen ini adalah otoritas resolusi 5 blocker critic + 17 missing case. Disimpan ke `specs/fase-3-resolusi-blocker.md`. Setiap keputusan grounded ke kode/spec nyata dan tidak melonggarkan invarian governance (RLS, anti-self-approval, evidence locking, append-only, audit). Saat konflik, addendum ini menang atas wording lama di spec/plan.

## Prinsip lintas-blocker (konsistensi yang dikunci)

1. **"Hari ini" dihitung SATU KALI di server, di org timezone.** Sumber tunggal = helper SQL `public.org_today()` (SECURITY DEFINER) + RPC `get_org_today()` yang membungkusnya. Tidak ada `new Date()`, `todayISO()`, atau `isOverdue()` berbasis device untuk klasifikasi section. (B1 ⟺ B4)
2. **Klasifikasi section terjadi di server.** Per-section query memfilter `pic_id`/`reviewer_id = auth.uid()` dan membandingkan `deadline_at::date` (atau `deadline`) terhadap `org_today()` di sisi server. Klien tipis: hanya merender baris yang diterima. (B1, B4)
3. **Boundary timezone diuji di SQL**, bukan fake-timer jest-expo. Screen test memock `getOrgToday()`/data layer, tidak pernah memock `Date` global. (B4 ⟺ B5)
4. **Append-only ditegakkan dua-lapis**: grant tulis langsung dicabut (klien INSERT/UPDATE/DELETE → 42501) DAN tulis sah hanya via RPC SECURITY DEFINER. Test harus membedakan "client-write-blocked" vs "RPC-allowed". (B3, B5)
5. **Guard 5 RPC existing dipertahankan identik** (semantik logika, bukan formatting); side-effect notif hanya MENAMBAH baris setelah blok guard. ADD GUARD ≠ REPLACE GUARD. (B3)

---

## BLOCKER 1 — Arsitektur Home: per-section vs RPC agregat

**KEPUTUSAN TERKUNCI: Query per-section (BUKAN satu RPC agregat).**

Enam fungsi di `mobile/src/lib/home.ts`, masing-masing satu query/RPC server timezone-aware:
- `listMyActionPlans()` (sudah ada di `cards.ts:174-186`, di-reuse) — Perlu dikerjakan.
- `listPendingReviews()` (sudah ada di `cards.ts`) — Butuh review.
- `listTodayRepeatInstances()` — `action_plan_instances`, `pic_id=auth.uid()`, `status ∈ {assigned,in_progress,revision}`, `deadline_at::date = org_today()`.
- `listOverdueItems()` — union: (a) one-time AP `deadline < org_today()` & status ∉ {done,approved}; (b) instance `status = 'missed'`. Setiap baris memiliki diskriminator `kind: 'action_plan' | 'instance'`.
- `listNearDeadline()` — union AP+instance, `deadline ∈ (org_today(), org_today()+3 hari]`, tidak overlap Terlewat.
- `listRevisionNeeded()` — `status = 'revision'` di mana user PIC.

Plus satu RPC otoritas tanggal: `getOrgToday()` → `rpc('get_org_today')` → string `YYYY-MM-DD` di org tz.

**Rationale**: Spec §6.3:134 eksplisit "Default spec = per-section demi retry granular (AC-H11)"; R5 (§3:36) "Query per-section (bukan satu RPC agregat)". FR-H-10:66 + AC-H11 menuntut pull-to-refresh per-section. Pola sudah terbukti di `cards.ts:174-186` (`listMyActionPlans` + `listPendingReviews`). RPC agregat menciptakan kopling: error 1 section memblokir 6 UI section.

**Invarian governance**: Setiap query memfilter `auth.uid()` server-side; RLS (`can_access_action_plan`) tetap penegak. Tidak ada filter sensitif di klien (FR-H-01).

**Caching `getOrgToday()`** (menutup open-risk): cache per **app session** via React Query `staleTime: Infinity`, `queryKey: ['org-today']`. Invalidasi hanya saat sign-out. Drift 1 hari di boundary tengah malam = acceptable (sama dengan window onboarding 7-hari B2).

---

## BLOCKER 2 — Onboarding hint AC-H12 butuh `profiles.created_at`

**KEPUTUSAN TERKUNCI (dua bagian):**

1. **Ekspos `created_at` di `useProfile`.** `mobile/src/hooks/use-profile.ts`: tambah `created_at` di `.select(...)` (baris 33-34), tambah `created_at: string` di tipe `CurrentProfile` (baris 6-15) dan `ProfileRow` (baris 17-25). Kolom sudah ada di DB (`0001_fase0_foundation.sql:30`, terverifikasi pada tabel `profiles`); JANGAN tambah kolom baru di 0008.

2. **Ambang "user baru" = usia < 7 hari** sejak `created_at`. Helper murni `getProfileAgeInDays(createdAt)` di `home.ts`. Render `GuidanceNote` kondisional: `profile && getProfileAgeInDays(profile.created_at) < 7`. Logika presentasi 100% klien; server tidak punya threshold.

**Rationale**: `use-profile.ts:33-37` saat ini tidak meng-select `created_at`; tipe tak punya field → test akan false-green bila tak di-map. PRD §61.10 tak mendefinisikan ambang → 7 hari adalah default rasional (standar industri onboarding) dan dikunci agar test deterministik. `created_at` adalah `timestamptz` UTC; age dihitung naïf (`Date.now() - created_at`, keduanya UTC) — konsisten, tidak butuh org tz.

**Konsistensi**: AC-H12 onboarding (klien-side, UTC) berbeda domain dari AC-H6b boundary (server-side, org tz). Tidak ada konflik: onboarding bukan klasifikasi section.

---

## BLOCKER 3 (AC-N9) — Regresi guard 5 RPC byte-for-byte

**KEPUTUSAN TERKUNCI**: Enumerasi guard konkret + suite SQL regresi + mekanisme verifikasi otomatis. Klaim "dipertahankan" tanpa enumerasi tidak bisa diaudit; ini mengangkat plan dari kabur → solid.

### Enumerasi guard (line-number terverifikasi terhadap file nyata)

> Catatan: file guard adalah `0005_fase1_card_engine.sql` (bukan `0005_fase1_cards.sql`). Citasi baris di research di-koreksi ke nilai terverifikasi di bawah.

| RPC | File:baris | Guard (urutan) |
|---|---|---|
| `submit_action_plan` | `0005:357-371` | G1 entity found (358); G2 `pic_id=auth.uid()` (359); G3 status ∈ {assigned,in_progress,revision} (360-362); G4 evidence_required (364-367); G5 result_value_required (368-371) |
| `review_action_plan_submission` | `0005:429-458` | G1 decision ∈ {approve,reject} (429-431); G2 submission found (434); G3 anti-self `a.pic_id≠auth.uid()` (438-440); G4 reviewer match ATAU `manage_others_cards`→override gov (443-452); G5 review_status pending & status submitted (453-455); G6 reason wajib utk reject (456-458) |
| `submit_action_plan_instance` | `0007:378-395` | G1 instance found (379); G2 `pic_id=auth.uid()` (380); G3 status≠missed (381); G4 status ∈ {assigned,in_progress,revision} (382-384); G5 evidence_required (388-391); G6 result_value_required (392-395) |
| `review_action_plan_instance_submission` | `0007:458-490` | G1 decision valid (458-460); G2 submission found (463); G3 submission IS instance `action_plan_instance_id≠null` (464-466); G4 anti-self `ins.pic_id≠auth.uid()` (470-472); G5 reviewer match ATAU override (474-483); G6 review_status pending & instance submitted (485-487); G7 reason wajib reject (488-490) |
| `mark_overdue_instances` | `0007:333-339` | G1 status ∈ {assigned,in_progress} (333); G2 `current_submission_id is null` (334); G3 `submitted_at is null` (335); G4 `missed_rule≠overdue_allowed` (336); G5 boundary `p_now > deadline (+grace)` (337-339) |

Total 29 guard konkret di 5 RPC.

### Mekanisme verifikasi (otomatis, dijalankan saat 0008)

1. **Snapshot body pre/post** via `pg_proc`: `select md5(prosrc) from pg_proc where proname = ANY(...)` dijalankan SEBELUM apply 0008 (baseline dari 0005/0007) dan SETELAH. Karena body berubah (notif ditambah), checksum penuh akan berbeda — maka verifikasi memakai **guard-block extraction**: pisahkan blok dari `begin` sampai akhir guard terakhir tiap RPC, bandingkan md5 blok-guard pre vs post. Identik = lulus.
2. **Suite SQL kontrak** (`test/guard-regression.sql`): 1 test per guard (29 case) — masing-masing memanggil RPC dengan input-pelanggar konkret dan meng-assert error message identik. Dijalankan via Supabase MCP `execute_sql` setelah apply 0008. Semua case PASS = prasyarat lanjut A3.
3. **Policy**: ADD GUARD ≠ REPLACE GUARD. Bila 0008 perlu guard baru → harus dibahas di issue, bukan diselipkan.

**"Byte-for-byte" diperjelas**: yang dijaga adalah **logika guard** (kondisi + error message), BUKAN whitespace/komentar. Verifikasi = md5 blok-guard yang sudah dinormalisasi whitespace, plus suite kontrak SQL sebagai jaring kedua.

**Invarian governance**: anti-self-approval (review G3/G4), reviewer_override → `governance_violations` (review G4), evidence/result locking (submit G4/G5) semua masuk enumerasi → tidak ada yang bisa terselip.

---

## BLOCKER 4 — AC-H6b timezone boundary: layer test salah

**KEPUTUSAN TERKUNCI: Server menang.** Boundary timezone diuji di SQL/server via Supabase MCP `execute_sql`. Screen test menghapus mocking `Date`/fake-timer; sebagai gantinya memock data layer (`getOrgToday()` dan fungsi section) yang sudah mengembalikan org-tz date / item terklasifikasi.

- **SQL test (otoritatif)**: insert `action_plan_instance` dengan `deadline_at` di dua sisi tengah-malam org tz (mis. `2026-06-24 22:00 UTC` = `2026-06-25 05:00 Asia/Jakarta`), assert section yang benar (Repeat hari ini vs Deadline mendekat vs Terlewat) saat `org_today()` = tanggal lokal tertentu. Idempoten: jalankan 2× → hasil sama.
- **Screen test**: `jest.mock('@/lib/home')`, `getOrgToday` di-resolve ke string tetap (mis. `'2026-06-25'`); `listOverdueItems`/`listTodayRepeatInstances` di-resolve ke fixture. Assert count & render section. TANPA `jest.useFakeTimers()` atau mock `Date.prototype.getTimezoneOffset` (bentrok native binding jest-expo, flaky).

**Rationale**: Spec §1.1:20 + §6.3:134 "hari ini dihitung di org tz di server". `index.tsx:17-25` `todayISO()=new Date().toISOString().slice(0,10)` adalah device/UTC — arsitektur salah, harus diganti. Plan §83-84 menyebut "mock Date + getOrgToday" — addendum ini **mengoreksi**: hapus mock Date, hanya mock `getOrgToday`.

**Konsistensi dengan B1**: B1 menempatkan kalkulasi tanggal di server; B4 menempatkan test boundary di server. Keduanya identik dalam locus kebenaran = `org_today()`/`get_org_today()`. `index.tsx` tidak lagi memanggil `isOverdue()`/`todayISO()`.

**Backward-compat test existing**: 3 test home existing (greeting regex, empty states) harus tetap hijau. Test overdue lama yang mengandalkan `isOverdue` filter klien diganti: overdue count bersumber dari `listOverdueItems` (mock), bukan filter `mineQ`.

**Dependency-ordering kritis (koreksi research)**: `organizations.timezone` dibuat di `0007:13`, BUKAN 0001. Maka helper `org_today()` di 0008 boleh mengandalkannya. `org_today()` HARUS dibuat sebelum RPC/policy mana pun di 0008 yang memakainya.

---

## BLOCKER 5 — 5 misalignment infra spec-test

**KEPUTUSAN TERKUNCI (5 bagian):**

### 5.1 Builder mock thenable + terminal `in`/`range`/`limit`
`repeat.test.ts:33-49` `makeQuery` hanya me-resolve dari `order/single/maybeSingle`. Fase 3 butuh `.in()` (intermediate), `.range()`, `.gte()`, `.lt()`, `.limit()` (terminal). Tambah ke builder:
- Intermediate (return `builder`): `select, eq, in, gte, lt, lte, neq, or`.
- Terminal (return `Promise.resolve(result)`): `order, single, maybeSingle, range, limit`.
- Tambah `auth.getUser` di objek `supabase` mock (guard uid-null pola `cards.ts:160-162`).
Helper baru `makeQueryThenable(result)` di file test bersama; `repeat.test.ts` migrasi opsional (tidak wajib jika hijau).

### 5.2 Matriks append-only per-tabel (bukan sekadar "update gagal")
7 tabel × 4 op (client INSERT, RPC INSERT, client UPDATE, RPC UPDATE). Hanya `notifications.is_read` mutable via RPC (`mark_notification_read`/`mark_all_notifications_read`); 6 tabel lain immutable total. Diuji di Fase A via `execute_sql` dengan konteks unauthenticated/authenticated:

| Tabel | Client INSERT | RPC INSERT | Client UPDATE | RPC UPDATE |
|---|---|---|---|---|
| notifications | ✗ 42501 | ✓ (server emit) | ✗ 42501 | ✓ mark_notification_read |
| chat_rooms | ✗ | ✓ (auto on activate) | ✗ | ✗ |
| chat_room_members | ✗ | ✓ populate/sync | ✗ | ✗ |
| chat_messages | ✗ | ✓ send_chat_message | ✗ | ✗ |
| chat_message_reads | ✗ | ✓ mark_chat_messages_read | ✗ | ✗ |
| comments | ✗ | ✓ create_comment | ✗ | ✗ |
| mentions | ✗ | ✓ (side-effect create_comment/send_chat_message) | ✗ | ✗ |

### 5.3 Kontrak RPC mention + governance_warning
- **Mention akses-gated (AC-I6, FR-N-10)**: `create_comment`/`send_chat_message` terima `p_mentioned_user_ids[]`. Sebelum buat record `mentions`, validasi tiap id: untuk chat → `id ∈ chat_room_members`; untuk comment → `id` punya akses entity. Tidak akses → **silent no-op** (tidak throw, tidak buat mention). Diuji konkret di SQL (Fase A) + mock kontrak di data-layer test (Fase C).
- **governance_warning recipient (R3, FR-N-08)**: trigger `after insert on governance_violations` (severity ≥ medium) → emit ke **PIC+Reviewer card terdampak** (via `entity_id`) + pemegang `view_governance_violation`, **BUKAN** `governance_violations.user_id` (berisi pelaku override). Diuji: override reviewer AP X → warning ke PIC+Reviewer X, bukan reviewer pelaku. Grounded `0005:447` (user_id=pelaku), `0007:347` (pic), R4 `0001:214` (`view_governance_violation`).

### 5.4 Per-section sebagai kanonik (lihat B1) — dikunci, mock per-section bukan agregat.

### 5.5 `profiles.created_at` + boundary di SQL (lihat B2 + B4) — dikunci.

**Invarian governance**: append-only matrix menegakkan immutability audit/collab; mention gating mencegah leak akses; governance_warning recipient mencegah bocornya identitas pelaku override.

---

## Ringkasan 17 missing case yang ditutup
Onboarding boundary (2), append-only matrix (7-baris), tab no-double-count (instance_missed vs repeat_due), unread exclude-own, mention non-member silent no-op, getChatMessages range pagination, getOrgToday handling, overdue count dari server, governance_warning recipient, no-leak per-section, guard regression suite — semuanya termuat di `new_test_matrix`.

---

## Koreksi Final Critic (TERKUNCI — menang atas teks di atas bila bentrok)

Empat must-fix dari audit adversarial critic, dikunci sebagai keputusan final:

### CF-1 — `governance_warning` recipient bercabang per `violation_type`
Aturan "BUKAN `governance_violations.user_id`" TIDAK seragam. Trigger `after insert on governance_violations` (severity ≥ medium) bercabang:
- **`reviewer_override`** → `user_id` = PELAKU (`auth.uid()`, lihat `0005:447` / `0007:478`). JANGAN jadikan recipient. Recipient = PIC + Reviewer card terdampak (via `entity_id`) + pemegang `view_governance_violation` di org.
- **`instance_missed`** → `user_id` = PIC KORBAN (`0007:347`). BOLEH jadi recipient. Recipient = PIC korban (`user_id`) + Reviewer card + pemegang `view_governance_violation`.
- Hindari notifikasi ganda: `recipient_id` di-`distinct`; exclude actor bila actor = recipient untuk reviewer_override.
- Test SQL: `governance-warning.sql` punya **dua case terpisah** (reviewer_override vs instance_missed) yang membuktikan routing recipient berbeda.

### CF-2 — Backward-compat `useProfile` + null-guard `getProfileAgeInDays`
- `getProfileAgeInDays(createdAt: string | null | undefined): number` → kembalikan `Infinity` bila `createdAt` null/undefined/invalid (hint TERSEMBUNYI, tidak crash).
- 3 test home existing (`home.test.tsx`) yang memock `useProfile` WAJIB diupdate di G0/G2 untuk menyertakan `created_at` agar tidak mengirim `undefined`.
- Onboarding hint tampil hanya bila `getProfileAgeInDays(profile.created_at) < 7`.

### CF-3 — Sumber tanggal otoritatif = `org_today()` SERVER, bukan cache klien
- Klasifikasi section (server) DAN `dedupe_date` cron (server) WAJIB memakai `public.org_today()` di dalam fungsi SQL — TIDAK menerima tanggal dari klien.
- `getOrgToday()` (React Query, `staleTime: Infinity`, `queryKey: ['org-today']`) hanya untuk `dateLabel`/orkestrasi UI. NILAINYA TIDAK PERNAH dikirim balik sebagai parameter tanggal ke RPC section/cron (mencegah reintroduksi bug device-tz yang justru diperbaiki B4).
- Drift cache klien 1 hari di boundary tengah malam = acceptable (UI label saja); server tetap benar.

### CF-4 — Gate AC-N9 = suite kontrak SQL 29-case (md5 advisory)
- Gerbang mengikat AC-N9 = `test/guard-regression.sql` berisi **29 case input-pelanggar** (per guard, per 5 RPC) yang WAJIB tetap `raise exception` identik setelah 0008. Fail = blocker, jangan land.
- md5 "blok-guard whitespace-normalized" diturunkan ke status **advisory** (bantu reviewer, bukan gate) karena algoritma normalisasi tak deterministik antar-reviewer.
- Append-only matrix 7-tabel × {INSERT,UPDATE,DELETE} via `execute_sql` adalah jaring kedua yang mengikat.

### Gap minor yang dicatat (bukan blocker land, tapi ditangani saat koding)
- Test "9 type → tepat satu tab/diketahui": setiap dari 9 `notification.type` ter-map eksplisit (orphan type tertangkap).
- AC-H11 refetch-isolation: assert `queryKey` per-section terpisah sehingga refetch satu section tak men-trigger 5 lainnya.
- Mention-on-initiative: konfirmasi helper akses (`can_access_initiative`) dipakai untuk gating mention `entity_type='initiative'` sebelum menulis test `[A-I6]`.
