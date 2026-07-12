# Spec — Search Pesan Inbox (Chat FTS V1)

Status: FINAL untuk implementasi (semua OQ diresolusi 2026-07-12 — lihat §10). Menutup PRD §29 komponen 2 (Search Initiative atau pesan) dan menutup AC-27 PRD V1.8.2 khusus jalur search pesan. Un-defer status DEFER di `specs/inbox-chat-ui.md` L26/L32.

Referensi kanonik: **PRD.md L1166 (§29)** dan **§38** — istilah kanonik "Initiative" (bukan "Rencana Aksi"; Action Plan tidak punya chat room terpisah per PRD §30 rule 3).

---

## 1. Problem & Goals

### 1.1 Problem
Search Inbox saat ini (mobile/src/app/(app)/(tabs)/inbox.tsx L82-95) hanya memfilter `chat_rooms.name` client-side. Body pesan tidak pernah disentuh. Ini melanggar PRD §29 dan menutup kelulusan AC-27 V1.8.2.

### 1.2 Goals
- G1 — Search dual-source di Inbox: `chat_rooms.name` (existing) + `chat_messages.body` (baru).
- G2 — Server-side matching di Postgres via RPC SECURITY DEFINER; client tidak menerima body mentah.
- G3 — Gate permission ketat: `is_chat_member(chat_room_id) OR (can_view_workspace() AND can_access_initiative(initiative_id))`. Gate ini **tereduksi persis** menjadi predikat RLS `chat_messages_select` (0008) — search tidak lebih permisif dari baca langsung. Catatan: chat TIDAK memodelkan confidential per-room (owner 2026-07-12); view_all_workspace menjangkau semua chat in-org by design (lihat §8 + US-3).
- G4 — Silent-filter, cross-org isolation, org NULL → 0 baris.
- G5 — Hasil dikelompokkan (§38): section Initiative lalu section Pesan (sub-group per room).
- G6 — Read-only, append-only chat_messages tetap utuh, no Activity Log per query, no raw query logged.
- G7 — Un-DEFER specs/inbox-chat-ui.md dalam PR yang sama.

### 1.3 Non-Goals
Lihat blok `non_goals` di StructuredOutput. Ringkas: Chat-only V1; Comment/Bukti/Activity Log/GV/People = debt Global Search; Inbox-only surface; tidak ada AI/semantic; tidak ada rate limit V1; tidak ada auto-refresh realtime hasil search; snippet cukup substring (bukan ts_headline).

---

## 2. User Stories

- US-1 PIC menemukan pesan lama di room-nya via kata kunci di isi pesan.
- US-2 Reviewer/Manager cross-check konteks pesan lintas room tempat ia member.
- US-3 CEO/Owner (view_all_workspace) menjangkau semua chat di org-nya (chat tidak model confidential per-room — owner 2026-07-12).
- US-4 PIC induk Strategy TIDAK mendapat jalur pintas ke room turunan (status quo permission-model — search tidak melebarkan hak).
- US-5 Semua user: tidak ada network call untuk keystroke tunggal; debounce, empty=idle.
- US-6 Owner/Admin governance: search tidak menyediakan jalur tulis/approval/bukti/eksfiltrasi bulk.

---

## 3. Functional Requirements

### 3.1 Surface & Cakupan
- FR-1 Entry point HANYA header lokal tab Inbox (`mobile/src/app/(app)/(tabs)/inbox.tsx`). Global Search `/search` TIDAK dibebani cakupan pesan V1.
- FR-2 Placeholder input: **"Cari Initiative atau pesan"**.
- FR-3 Cakupan V1: `chat_messages` saja. Comment/Bukti/Activity Log/GV/People = debt.
- FR-4 Read-only mutlak. Tidak ada tombol approve/reject/mark-evidence di hasil.

### 3.2 Query Behavior
- FR-5 Empty/whitespace → hook `enabled=false`, no RPC call, UI = daftar room default.
- FR-6 Panjang minimum: 2 karakter setelah `btrim`. Guard DI SERVER (plpgsql wrapper: early return bila `<2`).
- FR-7 Batas atas p_query: 200 karakter. RPC melakukan `substring(1,200)` sebagai sabuk pengaman.
- FR-8 Debounce input 250ms sebelum queryKey React Query berubah. AbortController auto-cancel in-flight saat key baru.
- FR-9 Escape LIKE wildcards (`%`, `_`, `\`) di `p_query` sebelum menyusun pattern — hindari user mengetik `%` match segalanya.
- FR-10 Case-insensitive (pg_trgm ILIKE otomatis case-fold). Tidak ada stemming Bahasa (Postgres core tidak menyediakan regconfig `indonesian`).
- FR-11 Ordering: **`ORDER BY created_at DESC, id DESC`** deterministik. Kolom `body_similarity` dikembalikan untuk observability, TIDAK dipakai untuk order V1.
- FR-12 Pagination: default `p_limit=20`, hard cap server-side `LEAST(GREATEST(p_limit,1),30)`. Keyset cursor `(created_at, id) < (p_before, p_before_id)` dengan handling NULL eksplisit (bukan coalesce ke cm.id).
- FR-13 Return `snippet text` (server-computed substring ±80 char di sekitar match, cap 240 char). **Tidak** mengembalikan body utuh.
- FR-14 Grouping UI: dua section — Initiative (client-side filter atas useInboxRooms) lalu Pesan (RPC), sub-group per room dalam section Pesan.

### 3.3 Governance
- FR-15 Gate RPC: `public.is_chat_member(cm.chat_room_id) OR (public.can_view_workspace() AND public.can_access_initiative(r.initiative_id))`. Gate WAJIB tetap sinkron (≤ seketat) RLS `chat_messages_select` (0008) — RPC SECURITY DEFINER mem-bypass RLS jadi menegakkan gate-nya sendiri. Confidential per-room TIDAK ditegakkan di chat (owner 2026-07-12); bila kelak dibutuhkan, perketat `can_access_initiative` DAN gate ini bersamaan.
- FR-16 Push-down `organization_id = public.current_user_org()` sebelum operator matching (planner memakai index composite).
- FR-17 User `is_active=false` → `current_user_org()` NULL → 0 baris tanpa exception.
- FR-18 RPC hardening: `security definer set search_path = ''`, semua identifier qualified `public.*`, `revoke execute … from public, anon`.
- FR-19 TIDAK menulis Activity Log per query. TIDAK mem-persist raw query text ATAU hash query di tabel readable user.
- FR-20 Empty-state UI copy IDENTIK untuk no-match dan silent-filtered — no differentiator visual/hint/count.
- FR-21 Deep-link `/inbox/{roomId}?highlight={messageId}` divalidasi di screen detail via fetch by-id yang tetap MELEWATI RLS `chat_messages_select` — tampered highlight silently ignored.
- FR-22 Invalidasi cache saat membership berubah: hook mendengarkan realtime event `chat_room_members` DELETE untuk user aktif → `queryClient.invalidateQueries({queryKey:['messages_search']})`.

---

## 4. Data Contracts

### 4.1 Migration `0044_search_chat_messages.sql`
> Verified 2026-07-12: migrasi terakhir di repo = `0043_activity_logs_retention.sql`. Nomor next-available = **0044** (spec draft sebelumnya menyebut ≥0053 — koreksi via `ls supabase/migrations/`).

```sql
-- Konvensi Supabase: install extension ke skema `extensions`, bukan `public`.
-- Repo ini konsisten pakai skema `extensions` (lihat supabase/seed_dummy.sql L25 utk pgcrypto).
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_chat_messages_body_trgm
  on public.chat_messages using gin (body extensions.gin_trgm_ops);

create index if not exists idx_chat_messages_org_room_created
  on public.chat_messages (organization_id, chat_room_id, created_at desc);
```

### 4.2 RPC `public.search_chat_messages`

Signature (plpgsql wrapper untuk guard defensif + escape):

```sql
create or replace function public.search_chat_messages(
  p_query      text,
  p_room_id    uuid        default null,
  p_limit      int         default 20,
  p_before     timestamptz default null,
  p_before_id  uuid        default null
)
returns table (
  message_id       uuid,
  chat_room_id     uuid,
  room_name        text,
  initiative_id    uuid,
  author_id        uuid,
  author_name      text,
  snippet          text,
  created_at       timestamptz,
  body_similarity  real
)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text;
  pat text;
  lim int := least(greatest(coalesce(p_limit, 20), 1), 30);
begin
  q := btrim(coalesce(p_query, ''));
  if length(q) < 2 then
    return;
  end if;
  q := substring(q from 1 for 200);
  -- escape LIKE wildcards
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    cm.id,
    cm.chat_room_id,
    r.name,
    r.initiative_id,
    cm.author_id,
    p.full_name,
    -- snippet ±80 char di sekitar match, cap 240 char
    substring(
      substring(cm.body from greatest(position(lower(q) in lower(cm.body)) - 80, 1)),
      1, 240
    ) as snippet,
    cm.created_at,
    extensions.similarity(cm.body, q) as body_similarity
  from public.chat_messages cm
  join public.chat_rooms r on r.id = cm.chat_room_id
  left join public.profiles p on p.id = cm.author_id
  where cm.organization_id = public.current_user_org()
    and (p_room_id is null or cm.chat_room_id = p_room_id)
    and (
      public.is_chat_member(cm.chat_room_id)
      or (public.can_view_workspace() and public.can_access_initiative(r.initiative_id))
    )
    and cm.body ilike pat escape '\'
    and (
      p_before is null
      or (p_before_id is null and cm.created_at < p_before)
      or (p_before_id is not null and (cm.created_at, cm.id) < (p_before, p_before_id))
    )
  order by cm.created_at desc, cm.id desc
  limit lim;
end;
$$;

revoke execute on function
  public.search_chat_messages(text, uuid, int, timestamptz, uuid)
  from public, anon;
```

Catatan implementasi:
- Bila `public.can_access_initiative` tidak ada dengan signature yang sesuai, implementer wajib memakai helper eksisting yang menghormati `confidential_access_rules` (verifikasi di supabase/migrations/0008 & 0014). Bila helper tidak ada, tambahkan helper baru sebagai bagian migrasi ini (bukan sebagai debt).
- `stable` — RPC tidak menulis; verifikasi via test kontrak.

### 4.3 Client Wrapper — `mobile/src/lib/inbox.ts`
```ts
export type ChatMessageHit = {
  messageId: string;
  chatRoomId: string;
  roomName: string;
  initiativeId: string;
  authorId: string | null;
  authorName: string | null;
  snippet: string;              // ≤240 char, server-computed
  createdAt: string;            // ISO
  bodySimilarity: number;       // observability only
};

export type SearchChatMessagesParams = {
  query: string;
  roomId?: string;
  limit?: number;               // default 20, clamp 1..30
  before?: { createdAt: string; id: string };
};

export async function searchChatMessages(
  params: SearchChatMessagesParams
): Promise<ChatMessageHit[]>;
```

### 4.4 Hook — `mobile/src/hooks/use-search-messages.ts`
- `queryKey: ['messages_search', trimmed, roomId ?? null]`
- `enabled: trimmed.length >= 2`
- `staleTime: 15_000`
- Debounce 250ms di layer hook (bukan RPC).
- Mendengarkan Supabase Realtime channel `chat_room_members` DELETE untuk `user_id = currentUserId` → `invalidateQueries(['messages_search'])`.

### 4.5 Types
`mobile/src/lib/database.types.ts` diregenerasi post-migration.

---

## 5. UI (Inbox tab)

- Placeholder: `Cari Initiative atau pesan`.
- Query kosong: mode default (daftar room dari `useInboxRooms()`).
- Query panjang 1 char: hint `Ketik minimal 2 karakter untuk mencari pesan`, no fetch.
- Query ≥2 char: SkeletonList untuk section Pesan; section Initiative render instan (client filter).
- Empty result: `EmptyState` copy `Tidak ada pesan yang cocok dengan pencarianmu` + tombol `Hapus pencarian`. Copy IDENTIK untuk no-match dan silent-filtered.
- Loading refetch: spinner header, jangan flash skeleton di atas hasil lama.
- Error network/5xx: banner inline + `Coba lagi`; daftar room default tetap tampil di bawah banner.
- RPC not-found (PGRST202): banner `Pencarian pesan belum aktif di lingkungan ini`; degrade ke perilaku name-only lama (client-side).
- Tap hit pesan → `router.push('/inbox/{roomId}?highlight={messageId}')`.
- Screen `[roomId].tsx`: parse `highlight`, fetch by-id via wrapper yang TETAP tunduk RLS chat_messages_select; scroll-to-message best-effort; fallback ke posisi default bila belum ter-load atau access denied.
- Chip filter Semua/Belum-dibaca hanya memfilter grup Initiative.
- Hit pesan TIDAK menampilkan tombol approve/reject/mark-evidence.

---

## 6. Acceptance Criteria
Lihat blok `acceptance_criteria` (30 kriteria Given/When/Then). Mapping test-layer:
- DB contract (`supabase/tests/`): AC-4, 5, 6, 7, 8, 10, 11, 12, 13, 16, 20, 22, 23, 27.
- Unit hook (jest): AC-9, 14, 21, 25.
- Component RNTL: AC-1, 2, 3, 15, 17, 18, 19, 26.
- Integration/end-to-end: AC-24 (types), AC-28 (files), AC-29 (manual), AC-30 (gabungan).

---

## 7. Edge Cases & Error States

Ringkasan (detail di §3.2, §5):
- Empty query / whitespace → no fetch (§3.2 FR-5).
- 1 char → hint, no fetch.
- >200 char → truncated server-side ke 200.
- Operator FTS liar / karakter spesial → escape LIKE wildcards, RPC tidak throw, 0 hasil.
- Unicode/emoji → matching literal via ILIKE case-fold; emoji-only umumnya no-hit.
- Race keystroke → React Query cancel via AbortController.
- Non-member room → silent 0-baris.
- User is_active=false → 0 baris.
- Cross-org → push-down filter, 0 baris.
- Confidential Initiative + view_all_workspace → pesan MUNCUL (chat tidak model confidential per-room; owner 2026-07-12). Konsisten dengan RLS chat existing, bukan kebocoran baru.
- Membership dicabut selagi cache hidup → realtime invalidate (FR-22).
- Deep-link tampered → validasi RLS-aware, silently ignored (FR-21).
- Network offline → banner inline + retry, room list default tetap tampil.
- RPC 5xx → surfaceServerError generic; TIDAK expose SQLSTATE ke user.
- RPC not-found → degrade name-only.
- Author deleted → LEFT JOIN, author_name='Pengguna dihapus'.

---

## 8. Logging & Governance

- Logger seam (bukan console.log). Event: `search_messages` dengan `{requestId, userId, queryLength, resultCount, hasHit, roomScope?}`. **TIDAK** mengandung p_query, body, author_name, messageId.
- No hash query (mencegah rainbow-table pada domain kecil seperti nama karyawan).
- No Activity Log per query. Audit agregat opsional via metrics sink (OQ-7), bukan tabel Postgres user-readable.
- chat_messages tetap append-only; REVOKE INSERT/UPDATE/DELETE dari 0008 utuh.
- Anti-timing-oracle: kedua path (silent-filter vs no-match) melewati gate + LIMIT yang sama.

> [!note] AC-6 confidential — RESOLVED (owner 2026-07-12): chat tidak model confidential per-room
> Temuan review: klaim AC-6/FR-15 awal ("view_all_workspace TIDAK meng-short-circuit confidential")
> mengandalkan `can_access_initiative` yang confidential-aware. Faktanya fungsi terdeploy
> (`can_access_initiative`, 0014) TIDAK memfilter `confidential_access_rules` — body-nya short-circuit di
> `can_view_workspace()`, dan `initiatives` tak punya kolom confidential. Gate RPC `is_chat_member OR
> (can_view_workspace AND can_access_initiative)` **tereduksi persis** menjadi predikat RLS
> `chat_messages_select` (`is_chat_member OR can_view_workspace`) — **NOL kebocoran baru**, search
> mengembalikan tepat himpunan pesan yang sudah bisa dibaca via RLS tabel.
> **Keputusan owner:** perlemah AC-6 — chat memang TIDAK memodelkan confidential per-room; view_all_workspace
> (CEO/Owner) menjangkau semua chat in-org by design (US-3). AC-6 lama ("confidential → 0 baris") dicabut;
> AC-5 (view_all_workspace melihat pesan non-member) adalah perilaku yang benar. Bila confidential per-room
> kelak dibutuhkan, itu perubahan lintas-app di `can_access_initiative` (bukan hanya chat) + perketat gate
> RPC ini bersamaan — di luar scope V1.

---

## 9. Amandemen Sumber Terkait (Wajib di PR yang Sama)

1. `specs/inbox-chat-ui.md` L26/L32: hapus status DEFER, referensikan spec ini.
2. `mobile/src/app/(app)/(tabs)/inbox.tsx` L1-4: perbarui komentar scope-lock ("Filter & search lokal — TIDAK ada fetch baru" menjadi tidak berlaku).
3. `wiki/entities/database-blueprint.md`: catat extension pg_trgm + 2 indeks baru pada chat_messages.
4. `wiki/concepts/ui-prototype-gap.md` L174: append entry closure.
5. `wiki/log.md`: append entry `## [YYYY-MM-DD] update | search pesan inbox v1`.
6. `docs/manual-testing.md` L297: INBOX-03 pindah dari P2 pending → aktif.

---

## 10. Open Questions — RESOLVED (owner sign-off 2026-07-12)

Semua OQ blocking sudah dijawab; dicatat di sini agar spec self-contained tanpa perlu buka StructuredOutput.

- **OQ-1 (pg_trgm availability):** RESOLVED — pg_trgm 1.6 tersedia default di image Supabase (verified: `pg_available_extensions`). Boleh enable di staging & prod.
- **OQ-2 (skema install):** RESOLVED — install ke skema **`extensions`** (bukan `public`), mengikuti konvensi Supabase & pola repo (`seed_dummy.sql` L25). Migration & RPC di §4.1/§4.2 sudah pakai qualifier `extensions.gin_trgm_ops` + `extensions.similarity(...)`.
- **OQ-3 (unaccent):** RESOLVED — **SKIP** V1. Bahasa Indonesia minim diakritik; unaccent dalam indexed expression butuh wrapper IMMUTABLE tersendiri (bawaan STABLE). Manfaat vs kompleksitas tidak sepadan.
- **OQ-4 (stemming BI):** RESOLVED — **SKIP** V1. Postgres core tak punya regconfig `indonesian`; matching pg_trgm/ILIKE substring sudah menangkap variasi imbuhan (`%jual%` ↔ `penjualan`).
- **OQ-5 (ranking):** RESOLVED — **`ORDER BY created_at DESC, id DESC`** V1. Intent search chat = recall temporal, bukan relevance ranking. `body_similarity` tetap dikembalikan untuk observability; ganti ORDER BY di masa depan tak melanggar kontrak.
- **OQ-6 (copy):** RESOLVED — final:
  - Placeholder: `Cari Initiative atau pesan`
  - Hint 2-char: `Ketik minimal 2 karakter untuk mencari pesan`
  - Empty state: `Tidak ada pesan yang cocok dengan pencarianmu` (IDENTIK utk no-match & silent-filtered)
- **OQ-7 (audit sink):** RESOLVED — cukup **metrics agregat via logger sink existing**; TIDAK bikin tabel Postgres `search_events_agg`.
- **OQ-8 (rate limit):** RESOLVED — **TIDAK ada rate limit V1**. Debounce 250ms + min 2 char + LIMIT clamp 30 + GIN index sudah membatasi biaya. App internal per-org, risiko abuse rendah. Monitor via Sentry/Supabase logs; tambah kalau ada pola abuse nyata.
- **OQ-9 (realtime hasil search):** RESOLVED — snapshot per query; user re-submit untuk refresh (sudah tercermin FR-11/FR-22).
- **OQ-10 (archived rooms):** RESOLVED — default server INCLUDE (tidak ada filter is_archived di RPC).
- **OQ-11 (koreksi istilah PRD):** RESOLVED — istilah PRD "Initiative" dipakai; kesalahan penulisan intent user ("Rencana Aksi") dicatat di commit message, TIDAK butuh perubahan PRD.md.

---

## 11. Handoff ke TDD

Lihat `tdd_handoff` di StructuredOutput. Urutan test-first yang disarankan (red-green-refactor):

1. **DB contract test** dulu (`supabase/tests/0044_search_chat_messages_contract.sql`) — cover AC-4 s/d AC-27 sisi DB. Ini pin invariansi governance sebelum RPC ditulis.
2. **Migration** — extension + 2 indeks + RPC plpgsql (§4.2) → contract test hijau.
3. **Regen types** — `mobile/src/lib/database.types.ts`.
4. **Wrapper client** + jest unit — extend `mobile/src/lib/__tests__/inbox.test.ts` (blok `describe('searchChatMessages')`).
5. **Hook** + jest — `mobile/src/hooks/__tests__/use-search-messages.test.tsx` (debounce, enabled guard, realtime invalidation).
6. **UI Inbox** + RNTL — placeholder, dua-section, empty state identik, hit tanpa tombol tulis, tap → router.push dengan highlight.
7. **Screen [roomId]** + RNTL — validasi highlight RLS-aware, tampered param silently ignored.
8. **Amandemen dokumen** (§9) — bagian dari checklist rilis PR.
9. **Manual QA** INBOX-03 (docs/manual-testing.md L297).
10. **Non-regresi**: pastikan chat-polish 2026-07-12 (realtime, optimistic send, unread badge), search_cards, get_chat_rooms tidak berubah semantiknya.
