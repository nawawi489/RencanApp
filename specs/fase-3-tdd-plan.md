# Rencana TDD — Fase 3 EMS V1.8.1 (Home + Notifications + Inbox)

> Cabang: `feat/fase-0-foundation` (lanjutkan / branch baru `feat/fase-3-collab`). Runner: `npm test` (preset `jest-expo`, RNTL).
> Spec: `specs/fase-3-home-notifications-inbox.md`. Handoff: `specs/fase-3-tdd-handoff.json`.
> **⚠️ OTORITAS RESOLUSI: `specs/fase-3-resolusi-blocker.md` (CF-1..CF-4 + per-blocker) MENANG atas teks plan ini bila bentrok.** Khususnya: Home = per-section query (RPC agregat DILARANG), `org_today()`/`get_org_today()` sumber tanggal server, AC-H6b diuji di SQL bukan screen, makeQuery thenable (in/range/gte/lt terminal), append-only 2-lapis, AC-N9 = suite 29-case SQL.

## 1. Ringkasan fitur

Fase 3 adalah lapisan UI + data **aditif** di atas loop eksekusi & permission model Fase 1–2, **tanpa mengubah invarian governance**. Tiga permukaan:

1. **Home (Today Command Center)** — query per-section, sadar-permission, **timezone-aware** (`organizations.timezone`). Section: Perlu dikerjakan / Repeat hari ini / Butuh review / Terlewat / Deadline mendekat (≤3 hari) / Revisi diperlukan + onboarding hint user baru. Memperbaiki `todayISO()` device/UTC → perhitungan org-timezone di server.
2. **Notifications** — tabel append-only + tab segmentasi + unread + mark-as-read via RPC. Tipe aktif Fase 3: `review_request, approved, rejected, comment, mention, deadline_reminder, repeat_due, instance_missed, governance_warning`.
3. **Inbox (Initiative Chat)** — 1 `chat_room` per Initiative, membership tersinkron via trigger pada `action_plans`, pesan immutable, unread per-room exclude pesan sendiri, mention akses-gated.

Semua tulis lewat RPC `SECURITY DEFINER`; tabel kolaborasi hanya punya policy `SELECT` + grant tulis dicabut. 5 RPC existing (`submit_action_plan`, `submit_action_plan_instance`, `review_action_plan_submission`, `review_action_plan_instance_submission`, `mark_overdue_instances`) di-replace untuk emit notifikasi **tanpa melonggarkan guard apa pun** (regresi wajib, AC-N9).

## 2. Urutan implementasi (sesuai spec §8)

Migrasi 0008 → regen types → data layer (notifications/inbox/home) → Home date-fix + sections → Notifications → Inbox.

## 3. Daftar file test

| Layer | File test | Status |
|---|---|---|
| SQL/DB | (server-side; di luar `npm test` mobile — uji manual via Supabase MCP / psql) | baru |
| Data layer | `mobile/src/lib/__tests__/notifications.test.ts` | baru |
| Data layer | `mobile/src/lib/__tests__/inbox.test.ts` | baru |
| Data layer | `mobile/src/lib/__tests__/home.test.ts` | baru |
| Hooks | `mobile/src/hooks/__tests__/use-notifications.test.tsx` | baru |
| Hooks | `mobile/src/hooks/__tests__/use-inbox.test.tsx` | baru (opsional, lihat risiko) |
| Screen | `mobile/src/app/(app)/(tabs)/__tests__/home.test.tsx` | perluas |
| Screen | `mobile/src/app/(app)/(tabs)/__tests__/notifications.test.tsx` | baru |
| Screen | `mobile/src/app/(app)/(tabs)/__tests__/inbox.test.tsx` | baru |
| Screen | `mobile/src/app/(app)/inbox/__tests__/inbox-room.test.tsx` | baru |

## 4. Urutan langkah red → green → refactor

### Fase A — Migrasi DB & types (prasyarat; bukan test mobile)

- **A1 (red, SQL):** Tulis `supabase/migrations/0008_fase3_collab.sql` dengan DDL dependency-safe: `notifications → chat_rooms → chat_room_members → chat_messages → chat_message_reads → comments → mentions` (FK `mentions`→chat_messages+comments dibuat terakhir, CHECK exactly-one). RLS + policy SELECT-only untuk 7 tabel, revoke INSERT/UPDATE/DELETE. Helper `is_chat_member(uuid)` `SECURITY DEFINER`. Unique partial index idempotensi `(recipient_id, entity_id, type, dedupe_date)`. RPC baru (`mark_notification_read`, `mark_all_notifications_read`, `create_comment`, `send_chat_message`, `mark_chat_messages_read`, `populate_chat_room_members`, `sync_chat_member_for_action_plan`) + replace 5 RPC existing untuk emit notif. Trigger sync membership pada `action_plans`. Uji via Supabase MCP: append-only enforcement, RLS recipient/member, idempotensi unique index, membership add+revoke, mention akses-gated, governance_warning recipient (diturunkan dari `entity_id`, bukan `governance_violations.user_id`), **guard RPC regression byte-for-byte (AC-N9)**.
- **A2 (green):** Apply migrasi ke dev branch Supabase.
- **A3 (refactor/regen):** Regenerasi `mobile/src/lib/database.types.ts` (Supabase MCP `generate_typescript_types`) agar `Tables<'notifications'>`, `Tables<'chat_rooms'>`, dst. tersedia untuk type data layer.

### Fase B — Data layer `notifications.ts`

- **B1 (red):** Tulis `mobile/src/lib/__tests__/notifications.test.ts` (10 case [1]–[10]). Pola mock identik `repeat.test.ts`: `mockRpc`/`mockFrom` + `makeQuery` chainable, **ditambah** `auth.getUser` di objek `supabase` mock dan method `in` di builder. Jalankan `npm test` → MERAH (import gagal, modul belum ada).
- **B2 (green):** Buat `mobile/src/lib/notifications.ts`:
  - `NOTIFICATION_TYPE_LABEL` (9 tipe → label Indonesia) — case [1].
  - `NOTIFICATION_TYPE_TONE` (instance_missed/rejected/governance_warning=danger; review_request/deadline_reminder/repeat_due=warn; approved=success; comment/mention=info) — case [2].
  - `notificationTypesForTab(tab)` murni (terlewat→[instance_missed], repeat→[repeat_due], perlu_tindakan→[review_request,deadline_reminder,mention], review→[review_request], komentar→[comment,mention], governance→[governance_warning], semua→null) — case [3].
  - `listNotifications(tab?)`: `auth.getUser` → guard uid-null return `[]` tanpa `from()`; `.eq('recipient_id',uid)`; jika `notificationTypesForTab(tab)` non-null `.in('type', types)`; `.order('created_at',{ascending:false})` — case [4][5][6].
  - `markNotificationRead(id)` → `rpc('mark_notification_read',{p_notification_id:id})`, throw-on-error — case [7][8].
  - `markAllRead(tab?)` → `rpc('mark_all_notifications_read',{p_type})` (tab single→tipe-tunggal kanonik, semua→null) — case [9].
  - `unreadCount(rows)` murni: hitung hanya `is_read===false` — case [10].
  - Jalankan `npm test` → HIJAU.
- **B3 (refactor):** Ekstrak tipe `NotificationType` & `Notification = Tables<'notifications'>`; samakan gaya komentar header dengan `repeat.ts`.

### Fase C — Data layer `inbox.ts`

- **C1 (red):** Tulis `mobile/src/lib/__tests__/inbox.test.ts`. Case minimal: `listChatRooms()` (select + unread_count, guard uid-null), `getChatMessages(roomId,limit,offset)` (`.eq('chat_room_id',roomId).order('created_at',{ascending:false}).range(...)`), `sendMessage(roomId,body,mentions[])` → `rpc('send_chat_message',{p_chat_room_id,p_body,p_mentioned_user_ids})` throw-on-error, `markMessagesRead(roomId,upTo)` → `rpc('mark_chat_messages_read',{p_chat_room_id,p_up_to_message_id})`, `listChatRoomMembers(roomId)`. Pola mock = `repeat.test.ts` + `range`/`in`/`auth.getUser`. MERAH.
- **C2 (green):** Buat `mobile/src/lib/inbox.ts` (tipe `ChatRoom`, `ChatMessage`, `ChatRoomMember` dari `database.types`; `PersonRef` di-reuse dari `cards`). HIJAU.
- **C3 (refactor):** Konsolidasi argumen RPC camel→snake.

### Fase D — Data layer `home.ts`

- **D1 (red):** Tulis `mobile/src/lib/__tests__/home.test.ts`. Case: per-section query (`listTodayRepeatInstances`, `listOverdueItems`, `listNearDeadline`, `listRevisionNeeded`) memanggil RPC server timezone-aware (mis. `rpc('get_today_focus',{p_section})` atau RPC per-section) — uji nama RPC/argumen + propagasi error; `getOrgToday()` → `rpc` mengembalikan tanggal org; no-leak (query memfilter sisi server, klien hanya tipis). MERAH.
- **D2 (green):** Buat `mobile/src/lib/home.ts`: reuse `ActionPlanWithPeople`/`InstanceWithSubmissions`/`PersonRef` + label/tone; fungsi per-section memanggil RPC server-side (tanggal "hari ini" dihitung di org tz di server, bukan device). HIJAU.
- **D3 (refactor):** Re-export label/tone yang dipakai Home dari satu tempat agar `index.tsx` impor rapi.

### Fase E — Hook `use-notifications.ts`

- **E1 (red):** Tulis `mobile/src/hooks/__tests__/use-notifications.test.tsx` (6 case). Pola = `use-repeat-instances.test.tsx`: `jest.mock('@/lib/notifications')`, `makeWrapper()` (QueryClient retry:false), `jest.mock('@/providers/auth-provider')` untuk gate enabled (case [6]). MERAH.
- **E2 (green):** Buat `mobile/src/hooks/use-notifications.ts`: `useNotifications(tab?)` → `useQuery` (enabled `!!session`), derivasi `unreadCount` (is_read===false), filter per tab via `notificationTypesForTab`, `markRead(id)` + `markAllRead()` memanggil data layer lalu `invalidateQueries(['notifications'])`. HIJAU.
- **E3 (refactor):** Samakan bentuk return dengan `useRepeatInstances` (`{ notifications, isLoading, unreadCount, markRead, markAllRead, refresh }`).

### Fase F — Hook `use-inbox.ts` (opsional)

- **F1 (red):** `mobile/src/hooks/__tests__/use-inbox.test.tsx`: `useInboxRooms()` + `useChatMessages(roomId)` (pagination, enabled gate). MERAH.
- **F2 (green):** Buat `mobile/src/hooks/use-inbox.ts`. HIJAU.
- **F3 (refactor):** Konsolidasi invalidasi cache room/messages.

### Fase G — Home screen (perluas)

- **G1 (red):** Perluas `mobile/src/app/(app)/(tabs)/__tests__/home.test.tsx`: 6 section baru; loading/error/empty independen (AC-H11/H13); overdue count menyertakan instance missed (FR-H-07); greeting+overdue pakai org tz boundary (AC-H6b, mock `Date` + `getOrgToday`); onboarding hint user baru vs lama (AC-H12). Tambah `jest.mock('@/lib/home')`. MERAH.
- **G2 (green):** Refactor `mobile/src/app/(app)/(tabs)/index.tsx`: ganti `todayISO()`/`dateLabel` device→server org-tz (via `home.ts`/hook); wire 6 section via query per-section; PriorityCard overdue dari sumber server "Terlewat" (bukan filter `mineQ` klien); render `GuidanceNote` onboarding kondisional. HIJAU. **Jaga 3 test home existing tetap hijau** (greeting regex, empty states).
- **G3 (refactor):** Generalisasi `Section` agar menerima query instance maupun action plan; pindahkan helper tanggal ke `home.ts`.

### Fase H — Notifications screen

- **H1 (red):** `mobile/src/app/(app)/(tabs)/__tests__/notifications.test.tsx`: render 8 tab; filter tab Terlewat=instance_missed & Repeat=repeat_due tanpa double-count (AC-N3/N4); badge unread + `markNotificationRead` saat tap + `router.push` ke entity; entity hilang → pesan ramah tanpa leak (FR-N-07). Mock `@/lib/supabase`, `@/lib/notifications`, `@/hooks/use-notifications`, `expo-router`. MERAH.
- **H2 (green):** Implementasi `mobile/src/app/(app)/(tabs)/notifications.tsx` (tab bar + list per tab + unread + mark-as-read + navigasi RLS-gated). HIJAU.
- **H3 (refactor):** Ekstrak `TabBar` reusable bila perlu untuk Inbox.

### Fase I — Inbox list & room detail

- **I1 (red):** `mobile/src/app/(app)/(tabs)/__tests__/inbox.test.tsx`: daftar room + badge unread per room; tap → `router.push('/inbox/r1')`. `mobile/src/app/(app)/inbox/__tests__/inbox-room.test.tsx`: render pesan + kirim via `sendMessage('r1', body, mentions)`; preserve teks + error inline saat gagal (AC-I4); mention @user parse → mentions[] dan non-member ditandai (AC-I6); mark-as-read exclude pesan sendiri (AC-I5). Mock `useLocalSearchParams`/`useProfile`/`@/lib/inbox`. MERAH (route `[roomId].tsx` belum ada).
- **I2 (green):** Implementasi `mobile/src/app/(app)/(tabs)/inbox.tsx` + buat `mobile/src/app/(app)/inbox/[roomId].tsx` (composer pessimistic, mention parsing client-side terhadap member list, mark-as-read on scroll). HIJAU.
- **I3 (refactor):** Ekstrak `MessageComposer` + `MentionInput`; rapikan state preserve-on-fail.

### Fase J — Verifikasi akhir

- **J1:** `npm test` full hijau. **J2:** Regresi server (AC-N9) via Supabase MCP: re-run guard snapshot RPC existing. **J3:** `npx tsc --noEmit` di `mobile/`.

## 5. Risiko (lihat field `risks`)

## 6. Strategi mocking (lihat field `mocking_strategy`)