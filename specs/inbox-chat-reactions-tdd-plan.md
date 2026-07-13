---
type: source
tags: [tdd, plan, inbox, chat, reaction, v2, deferred]
updated: 2026-07-13
sources: 4
status: siap-eksekusi-v2-post-critic
milestone: V2
spec: specs/inbox-chat-reactions.md
---

> **Ringkasan.** Rencana test-first untuk fitur "Reaction pill" (PRD §30.6). Spec kanon: [specs/inbox-chat-reactions.md](inbox-chat-reactions.md) (commit `bfa65a6`). Milestone build = **V2**. Verdict Critic awal: perlu-perbaikan (17 concerns + 18 missing cases, arsip di §10) — **SEMUA 35 item telah diadjudikasi di §12 (revisi 2026-07-13)**; verdict pasca-revisi: **siap**. Total delta test final: +11 data, +12 hook, +17 UI (= 40 Jest) + 15 blok SQL contract. §8 telah dikoreksi in-place utk case #6/#10/#11; §12.3–12.6 memuat case tambahan; §12.2 memuat guard skor terenumerasi.

Spec kanon: `specs/inbox-chat-reactions.md`. PRD ref: §30 komponen 6 "Reaction pill". Milestone: V2 (build dijadwalkan terpisah — rencana TDD ini menjadi input eksekusi).

## 1. Ringkasan Fitur

Tambah reaksi emoji ringan (whitelist tertutup: 👍 ✅ 👀 🙏) di `MessageBubble` Initiative Chat. Semua invarian ditegakkan server-side:
- Tabel referensi `public.reaction_emojis` (single-source whitelist) + tabel samping `public.chat_message_reactions` (PK `(chat_message_id, reactor_id, emoji)`, FK CASCADE, RLS on, revoke I/U/D).
- Satu-satunya jalur tulis = RPC SECURITY DEFINER `public.toggle_chat_reaction(p_message, p_emoji) → boolean` (gate `is_chat_member`, DELETE-then-INSERT ON CONFLICT DO NOTHING, validasi emoji-aktif hanya di INSERT, `reactor_id = auth.uid()` hardcoded).
- Baca via embed PostgREST `reactions:chat_message_reactions(emoji, reactor_id)` di `listChatMessages`; agregasi `count` + `reactedByMe` dihitung client. Gate baca = policy SELECT tabel reaksi sendiri (BUKAN inheritance).
- Netral-governance total: zero bobot skor, tanpa notifikasi V1, tanpa optimistic (invalidation-only `['chat-messages', roomId]`).

## 2. Prasyarat (BUKAN spec, tapi blocker eksekusi)

- **Token "Reaction pill" di `DESIGN.md §7` + `mobile/src/global.css`** — blocker LAYER UI saja. SQL contract + data layer + hook TDD boleh berjalan lebih dulu tanpa token.
- **Nomor migrasi reconcile HEAD saat build.** Branch ini terakhir `0044_search_chat_messages.sql`; contoh path spec `0045_*` sudah dipakai di `supabase/tests/0045_keyset_list_chat_messages_contract.sql`. Rencana ini menggunakan placeholder `00XX` (pilih `HEAD_max+1`).
- **V2 dijadwalkan sebagai rilis** (mencabut larangan `specs/inbox-chat-ui.md` L190).

## 3. File Test (peta)

| Layer | File | Fungsi |
|---|---|---|
| SQL contract | `supabase/tests/00XX_chat_message_reactions_contract.sql` | **15 blok** DO $$ ... PASS/FAIL (a-k direvisi §12.3 + l/m/n/o baru): DDL/RLS/RPC/anti-tamper residu/cascade sub-hop/netralitas skor k1+k2/seed exact-4/viewer read-vs-write/FK-only/revoke-execute |
| Data | `mobile/src/lib/__tests__/inbox.test.ts` | **11 case**: RX-1 s/d RX-9 (§8.1) + RX-10 embed di halaman cursor>0 + RX-11 normalisasi null→[] (§12.4) |
| Hooks | `mobile/src/hooks/__tests__/use-inbox.test.tsx` | **12 case**: 11 case §8.2 + HK-12 regresi invalidasi send() (§12.5) |
| UI | `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx` | **17 case**: 13 case §8.3 (case #6/#10/#11 dikoreksi in-place) + UI-14 pending-guard + UI-15 alert-clears + UI-16 label exact + UI-17 wiring per-item (§12.6) |

## 4. Urutan Langkah Red → Green → Refactor

### Fase A — SQL contract (server-first, di luar Jest; PSQL)
Server-side invariant TIDAK BISA diuji di Jest — WAJIB kontrak SQL. Jalur eksekusi: `docker exec supabase_db_supabase psql -U postgres -f supabase/tests/00XX_chat_message_reactions_contract.sql` (pola `raise notice 'PASS n' / raise exception 'FAIL: ...'`).

1. **Red-SQL** — tulis `supabase/tests/00XX_chat_message_reactions_contract.sql` (**15 blok PASS/FAIL — daftar final di §12.3**): (a) DDL tabel + PK/FK CASCADE, (b) RLS enable + policy SELECT, (c) revoke I/U/D, (d) RPC idempoten [+komentar C8/C14], (e)+(f) validasi emoji-aktif hanya INSERT + delisted removable [+flip run-time M9], (g) cross-org 0 baris [blok eksplisit M7], (h) cascade 5 sub-hop [C13/M5], (i) anti-tamper + residu positif [C9/M4], (j) tulis-langsung gagal, (k) netralitas skor k1 statik-terenumerasi + k2 operasional [C2/M6 — SQL di §12.2], (l) seed exact-4 + policy + revoke `reaction_emojis` [C7/M1], (m) workspace-viewer read-vs-write [C6/M2], (n) FK-only 23503 [C10/M3], (o) revoke execute anon RPC [M8].
2. **Green-SQL** — tulis `supabase/migrations/00XX_chat_message_reactions.sql` sesuai §7.1–7.3 spec (verbatim). Jalankan contract → **15/15 PASS**.

### Fase B — Data layer (Jest)

3. **Red-Data (RX-6 s/d RX-9)** — Extend `mobile/src/lib/__tests__/inbox.test.ts` dengan tes embed & guard keyset (RX-6, RX-7) + pass-through `reactions` (RX-8) + zero-query short-circuit (RX-9). Semua merah karena `select()` string saat ini belum berisi `reactions:chat_message_reactions(...)` dan tipe `ChatMessage.reactions` belum ada.
4. **Red-Data (RX-1 s/d RX-5)** — Tambah tes `toggleChatReaction`: mapping arg (`p_message`, `p_emoji`), boolean pass-through true/false, error identity (`toBe(err)`), verbatim messageId+emoji (no trim/normalize). Merah karena fungsi belum diekspor.
5. **Green-Data** — Di `mobile/src/lib/inbox.ts`:
   - Tambah `export type ChatReaction = { emoji: string; reactor_id: string }`.
   - Perluas `ChatMessage` dengan `reactions?: ChatReaction[]`.
   - Ubah `select()` di `listChatMessages` menjadi `'id, chat_room_id, author_id, body, created_at, author:author_id(id, full_name, email), reactions:chat_message_reactions(emoji, reactor_id)'` — **tanpa** mengubah top-level `.eq('chat_room_id', roomId)` dan **tanpa** menyentuh string di `.or()` cursor. Embed berlaku di SEMUA halaman termasuk cursor>0 (RX-10).
   - Normalisasi di mapping baris: `reactions: row.reactions ?? []` (D14/RX-11 — PostgREST bisa mengembalikan `null` utk embed kosong).
   - Tambah `export async function toggleChatReaction(messageId, emoji): Promise<boolean>` = thin caller `supabase.rpc('toggle_chat_reaction', { p_message: messageId, p_emoji: emoji })` dengan `if (error) throw error; return data as boolean;`.
   - Update `mobile/src/lib/database.types.ts`: sisipkan Row/Insert/Update/Relationships `reaction_emojis` + `chat_message_reactions`, dan entri `Functions.toggle_chat_reaction: { Args: { p_message: string; p_emoji: string }; Returns: boolean }`. **Struktur `Relationships` WAJIB mirror pola `chat_message_reads` (L695+: `foreignKeyName`/`columns`/`isOneToOne`/`referencedRelation`/`referencedColumns`)** — jalankan `supabase gen types typescript` bila memungkinkan; verifikasi resolusi relasi runtime via HTTP contract mini (§12.5) karena `tsc` hijau ≠ embed ter-resolve (C16/M18).
6. **Refactor-Data** — Jalankan `npm test -- inbox.test.ts` + `npm run type-check` → hijau. Verifikasi string `.select()` tidak diduplikasi (extract konstanta bila muncul di banyak tempat — saat ini hanya sekali di `listChatMessages`, jadi ekstraksi belum diperlukan).

### Fase C — Hook layer (Jest)

7. **Red-Hook** — Extend `mobile/src/hooks/__tests__/use-inbox.test.tsx`:
   - Mock `@/lib/inbox` dengan `toggleChatReaction: (...a) => mockToggleChatReaction(...a)`.
   - 8 tes `useChatActions.toggleReaction`: (i) mapping args, (ii) POS invalidate `['chat-messages', roomId]`, (iii) NEG `['chat-rooms']`, (iv) NEG `['notifications']`, (v) boolean pass-through, (vi) error propagate + no-invalidate, (vii) dua panggilan → 2× invalidate, (viii) isolasi `roomId` param, (ix) `isTogglingReaction` pending true→false.
   - 2 tes `useChatMessages` pass-through `reactions[]` (dengan & tanpa embed).
   - +1 tes HK-12 (M11, §12.5): regresi `send()` tetap invalidate `['chat-messages',roomId]` + `['chat-rooms']` — safety net agar penambahan `toggleReactionM` tidak mencabut invalidasi existing (`use-inbox.ts` L85-86).
8. **Green-Hook** — Di `mobile/src/hooks/use-inbox.ts` perluas `useChatActions(roomId)`:
   ```ts
   const toggleReactionM = useMutation({
     mutationFn: (v: { messageId: string; emoji: string }) =>
       toggleChatReaction(v.messageId, v.emoji),
     onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-messages', roomId] }),
   });
   return {
     send, markRead, isSending, isMarkingRead,
     toggleReaction: (messageId: string, emoji: string) =>
       toggleReactionM.mutateAsync({ messageId, emoji }),
     isTogglingReaction: toggleReactionM.isPending,
   };
   ```
   Tidak memanggil `invalidateQueries(['chat-rooms'])` maupun `['notifications']` — dijaga oleh tes negatif.
9. **Refactor-Hook** — Verifikasi tak ada duplikasi pattern; opsional ekstrak factory `makeInvalidateChatMessages(qc, roomId)` bila muncul di ≥3 mutation (belum perlu).

### Fase D — UI layer (Jest RNTL) — MENUNGGU token DESIGN turun

10. **Prasyarat token** — Update `DESIGN.md §7` menambah entri "Reaction pill" (unselected vs selected, sinyal non-warna via border+checkmark ✓, ≥44px, solid+putih = `brand-dark #1564b3`). Update `mobile/src/global.css` bila token warna baru diperlukan. Tanpa langkah ini, layer UI **tidak boleh dimulai** (FR-RX-0.3, FR-RX-4.4).
11. **Red-UI** — Extend `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx`:
    - Perluas `makeChatMessagesState` supaya messages boleh membawa `reactions: [{emoji, reactor_id}]`.
    - Perluas mock `useChatActions` bentuk **LAZY** (revisi C3, §12.6): `let mockIsTogglingReaction = false;` module-scope, dibaca di body factory — BUKAN literal `isTogglingReaction: false` (yang membuat pending-guard UI-14 tak teruji). Reset di `beforeEach`.
    - Suite `ChatRoomScreen — Reaction pill (FR-RX-4.x)` berisi **17 case**: 13 case §8.3 (case #6/#10/#11 sudah dikoreksi in-place) + UI-14..17 (§12.6). Semua merah — pill sub-komponen belum ada.
12. **Green-UI** — Di `mobile/src/app/(app)/inbox/[roomId].tsx`:
    - Tambah sub-komponen inline `ReactionPill` (Pressable dengan `style={{ minWidth: 44, minHeight: 44 }}` inline numeric — pola `SendButton` L110-124; `accessibilityRole="button"`, `accessibilityState={{ selected: reactedByMe }}`, `accessibilityLabel="Reaksi {emoji}, {count}, {saya sudah bereaksi|belum bereaksi}"`; selected menampilkan child `<Text>✓</Text>` + class `border-2` sebagai sinyal non-warna).
    - Tambah `ReactionPillRow` yang meng-aggregate `reactions` menjadi Map<emoji, {count, reactedByMe}> lalu **sort by konstanta `REACTION_EMOJI_ORDER = ['👍','✅','👀','🙏']`** (D13 §12.7 — BUKAN first-seen; emoji tak dikenal di-append by codepoint), kemudian render deret `<ReactionPill />`. Return `null` bila `reactions?.length` falsy.
    - Sisipkan `<ReactionPillRow />` di dalam `MessageBubble` di bawah body bubble, di dalam sel bubble (agar highlight border amber tetap membungkus).
    - Ambil `currentUserId = useAuth().session?.user?.id ?? null`. Handler press pill:
      ```ts
      const onPress = async () => {
        if (!currentUserId || isTogglingReaction) return;
        try { await toggleReaction(m.id, emoji);
              setReactionError(null);              // M14: sukses membersihkan alert lama
        }
        catch (e) { reportError('Reaksi', e, 'Gagal memperbarui reaksi.');
                    setReactionError('Gagal memperbarui reaksi.'); }
      };
      ```
    - Render `<Text accessibilityRole="alert">{reactionError}</Text>` inline (non-blocking, tanpa Alert modal).
    - Skeleton path (isLoading) TIDAK merender pill — `<ReactionPillRow />` hanya di dalam item list `renderItem`, bukan di skeleton.
13. **Refactor-UI** — Pastikan aggregator (`reactions → Map`) memoized per pesan (`useMemo`). Verifikasi tidak ada style Tailwind `min-w-11` menggantikan inline style (pola Critic §8.4: NativeWind flatten tak deterministik di Jest). Rapikan copy Bahasa Indonesia (hindari istilah medsos).

### Fase E — Regressi & guard

14. **Regressi**: jalankan seluruh suite Jest (`npm test`) + `npm run type-check`. Semua suite yang tidak menyentuh reaksi harus tetap hijau, khususnya:
    - `roomId.timeline.test.ts` (buildTimelineItems netral terhadap reactions field).
    - `roomId.search-highlight.test.tsx` (pesan highlight tetap render pill bila punya reactions).
    - Data-layer keyset tests (`inbox.test.ts` RX-6/RX-7 memastikan `.eq('chat_room_id')` top-level).
15. **Netralitas skor** — Verifikasi SQL contract blok k1 (guard statik terenumerasi — daftar nama fungsi NYATA di §12.2, BUKAN pattern `calculate_score_*`/`ilike '%score%'` yang meleset) + blok k2 (uji operasional `calculate_period_scores` pre/post reaksi byte-identik).

## 5. Strategi Mocking per Layer

### Data layer (`mobile/src/lib/__tests__/inbox.test.ts`)
- Modul `../supabase` sudah di-mock di file test (`jest.mock('../supabase', () => ({ supabase: { rpc: mockRpc, from: mockFrom, ... } }))` — pola L1-11 di `cards.test.ts` dan file inbox existing).
- Builder query PostgREST dipalsukan via `makeQueryThenable({ data, error })` — sudah mendukung `.select/.eq/.or/.order/.limit`. Tak perlu menambah method baru untuk embed (embed hanya string argumen `.select()`).
- Tidak butuh mock native module apapun; test murni Node/Jest.
- `mockRpc.mockResolvedValue({ data: true|false, error: null })` untuk boolean pass-through; `mockResolvedValue({ data: null, error: err })` untuk propagasi (identity via `.toBe(err)`).

### Hook layer (`mobile/src/hooks/__tests__/use-inbox.test.tsx`)
- Mock `@/lib/inbox` di top-level (mendahului import hook):
  ```ts
  jest.mock('@/lib/inbox', () => ({
    CHAT_PAGE_SIZE: 30,
    listChatMessages: (...a) => mockListChatMessages(...a),
    listChatRooms: (...a) => mockListChatRooms(...a),
    markChatMessagesRead: (...a) => mockMarkRead(...a),
    sendChatMessage: (...a) => mockSend(...a),
    toggleChatReaction: (...a) => mockToggleChatReaction(...a),
  }));
  ```
- Wrapper: `new QueryClient({ defaultOptions: { queries: { retry: false } } })` + `createElement(QueryClientProvider, { client: qc }, children)`. Ekspos `qc` supaya `jest.spyOn(qc, 'invalidateQueries')` bisa diperiksa.
- Assertion invalidasi: `spy.mock.calls.map(c => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey))` — memakai `.some(k => k === JSON.stringify([...]))` untuk POS/NEG identik pola tes existing L200+.
- `isTogglingReaction`: pakai `Promise` manual (`let resolveFn: (v: boolean) => void; mockToggleChatReaction.mockImplementation(() => new Promise(r => { resolveFn = r; }))`) + `waitFor` untuk transisi pending true→false.
- JANGAN mem-mock `@/lib/supabase` di hook test — biarkan `@/lib/inbox` yang di-mock (hook tak menyentuh supabase langsung).

### UI layer (`mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx`)
- Mock top-level yang sudah ada di file (jangan ubah struktur, hanya extend):
  - `jest.mock('@/lib/supabase', () => ({ supabase: {} }))` — mem-block native supabase-js import.
  - `jest.mock('expo-router', ...)` untuk `useLocalSearchParams`, `useRouter`, `router.setParams`.
  - `jest.mock('@/hooks/use-inbox', ...)` — perluas return `useChatActions` dengan `toggleReaction: (...a) => mockToggleReaction(...a)` dan `isTogglingReaction: mockIsTogglingReaction` di mana `let mockIsTogglingReaction = false;` module-scope dibaca **lazy** di body factory (revisi C3 — snippet lengkap di §12.6; pola sama `mockIsSending` existing L28-32). Literal `false` membuat UI-14 pending-guard tak bisa diuji.
  - `jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: mockSession }) }))` — `mockSession` mutable di top-level, dibaca lazy dalam factory. Set ke `null` untuk case guard session.
  - `jest.mock('@/lib/errors', () => ({ reportError: mockReportError, surfaceServerError: (...a) => ... }))` untuk verifikasi tanpa efek samping global.
- Extend `makeChatMessagesState({ messages, ... })` — cukup terima override `messages` yang membawa `reactions?: [{emoji, reactor_id}]`. Backward-compatible; tes lama tidak berubah.
- Assertion touch target: `Array.isArray(pill.props.style) ? Object.assign({}, ...pill.props.style.filter(Boolean)) : (pill.props.style ?? {})` — pola flatten Critic §8.4.
- Assertion tap: `fireEvent.press(pill)` → `expect(mockToggleReaction).toHaveBeenCalledWith('m1', '👍')`.
- Assertion error inline: `mockToggleReaction.mockRejectedValueOnce(new Error('boom'))` → `await screen.findByRole('alert')` (bukan `Alert.alert` — React Native Alert dilarang oleh spec §10).

### SQL contract layer (di luar Jest)
- Dijalankan sebagai owner via `docker exec supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/00XX_*.sql`.
- Pola PASS/FAIL: setiap invariant dalam blok `do $$ ... raise notice 'PASS N: <label>'; ... raise exception 'FAIL N: <label>: %', <detail>; end $$;`.
- Impersonasi user: `set local role authenticated; set local request.jwt.claims to '{"sub":"<uuid>", ...}'::text;` (mengikuti pola `0044_search_chat_messages_contract.sql`).
- Anti-tamper concurrency: uji `INSERT ON CONFLICT DO NOTHING` dengan dua panggilan berturut → assert `count(*) = 1` (bukan try/catch 23505).
- Netralitas skor: `select pg_get_functiondef(oid) from pg_proc where proname in ('recompute_...', 'calculate_score_...')` — assert `position('chat_message_reactions' in def) = 0`.

## 6. Risiko

- **Nomor migrasi bentrok**: `0045` sudah dipakai kontrak keyset; branch chat-polish menurut memory sudah di `0052`. Cek `git log --all` & `ls supabase/migrations` saat build; pilih `HEAD_max+1`.
- **NativeWind flatten test**: touch-target 44px HARUS inline numeric style (`{ minWidth: 44, minHeight: 44 }`) — kalau ditulis sebagai class Tailwind (`min-w-11`), assertion `props.style.minWidth` undefined dan tes hijau palsu.
- **RLS embed independence**: bila developer keliru mengandalkan `chat_messages_select` sebagai "inheritance" gate baca reactions, viewer non-workspace akan bocor. Contract test §b menutup ini secara eksplisit.
- **Optimistic UI creep**: spec V1 = invalidation-only. Tes NEG `['chat-rooms']` + `['notifications']` mencegah developer copy-paste dari `send()` yang meng-invalidate lebih luas.
- **Anti-tamper miss**: JANGAN pernah menerima `reactor_id` dari klien — RPC hardcode `auth.uid()`. Contract test §i menahan ini.
- **Whitelist double-source**: JANGAN tulis `CHECK (emoji IN (...))` atau daftar literal di body RPC — cukup FK ke `reaction_emojis`. Delisted emoji harus tetap DELETE-able (validasi hanya di INSERT).
- **Keyset regression**: menambah embed di `.select()` string TIDAK boleh menyentuh `.or()` cursor atau memindahkan `.eq('chat_room_id')`. Tes RX-7 mengunci ini.
- **UI menyentuh pill sebelum token turun**: jangan mulai Fase D tanpa `DESIGN.md §7` + `global.css`; SQL contract + data layer + hook boleh dulu jalan.
- **Cross-org p_message_id gap**: RPC harus derive `organization_id` dari `chat_messages`, bukan dari klien. RLS `organization_id = current_user_org()` menambal lapis kedua. Contract test §g uji cross-org 0 baris.
- **Realtime channel** *(C17 — risk kondisional)*: fitur ini invalidation-only. Bila fitur reaksi mendarat SESUDAH branch chat-polish (migrasi 0052, realtime) merge: JANGAN broadcast reaksi lewat channel `chat_messages`; pakai channel terpisah, dan tambahkan contract test "publikasi realtime `chat_message_reactions` netral/terpisah". Bukan gate DoD branch ini.
- **Session=null race**: guard `!currentUserId || isTogglingReaction` di handler press wajib — tes UI case #4, #8, dan UI-14 (§12.6) menutup ini.
- **Netralitas skor tersembunyi**: kalau ada view/materialized view baru yang lupa diaudit, guard statik `pg_get_functiondef` bisa lolos. Tambahkan check untuk `pg_get_viewdef` pada view skor bila proyek memilikinya. Guard k1 memakai enumerasi eksplisit (§12.2) — fungsi skor BARU wajib ditambahkan ke daftar oleh reviewer.
- **Ordering pill flaky di kontrak nyata** *(C5/D13 — accepted via keputusan)*: urutan baris embed PostgREST tanpa `order` TIDAK dijamin. Aggregator sort by konstanta `REACTION_EMOJI_ORDER`; jangan pernah assert first-seen/urutan server.
- **Uji concurrency ≠ concurrency riil** *(C8 — accepted limitation)*: blok (d) menguji idempotensi sekuensial; race INSERT-INSERT ditutup `ON CONFLICT DO NOTHING` by construction. Uji dua-sesi paralel = opsional, bukan gate.
- **Semantik return saat race** *(C14 — accepted, dicatat)*: toggle-on kedua yang conflict tetap return `true` (konsisten state akhir, bukan bukti baris tercipta). Perilaku spec §7.3; JANGAN "diperbaiki" tanpa amandemen spec.

## 7. Definition of Done (final pasca-revisi §12)

- SQL contract **15/15 PASS** via `psql` sebagai owner (blok a-o, daftar final §12.3; guard skor k1 terenumerasi + k2 operasional §12.2).
- `npm test` hijau (delta: **+11 data, +12 hook, +17 UI = +40 case**).
- `npm run type-check` hijau (setelah `database.types.ts` diperbarui, struktur Relationships mirror `chat_message_reads`).
- HTTP contract mini resolusi embed (§12.5): GET `chat_messages?select=id,reactions:chat_message_reactions(...)` → 200, bukan "Could not find relationship".
- Semua 25 AC di spec §9 tervalidasi (SQL menutup AC 2-6, 10-17, 20-21, 24; data layer menutup 10, 12, 22; hook menutup 22-23; UI menutup 7-9, 18-19, 22-24).
- Token "Reaction pill" tercatat di `DESIGN.md §7` + `mobile/src/global.css`.
- Tidak ada file di `mobile/src/lib` (di luar `inbox.ts` + `database.types.ts`) yang merefer `chat_message_reactions` (grep guard) — invarian netralitas skor.

---

## 8. Detail Test Case per Layer

Tabel di §3 hanya mendaftarkan jumlah. Berikut kontrak arrange/act/assert masing-masing.

### 8.1 Data layer — `mobile/src/lib/__tests__/inbox.test.ts`

#### [RX-1] toggleChatReaction memanggil rpc 'toggle_chat_reaction' dgn arg mapping camel→snake ({ p_message, p_emoji })

- **Target:** toggleChatReaction (mobile/src/lib/inbox.ts) — thin RPC caller SECURITY DEFINER (spec §7.3, D2)
- **Arrange:** `mockRpc.mockResolvedValue({ data: true, error: null }); import { toggleChatReaction } from '../inbox';`
- **Act:** `await toggleChatReaction('m-1', '👍');`
- **Assert:** `expect(mockRpc).toHaveBeenCalledWith('toggle_chat_reaction', { p_message: 'm-1', p_emoji: '👍' }); expect(mockRpc).toHaveBeenCalledTimes(1);`
- **Why red:** Fungsi toggleChatReaction belum ada di mobile/src/lib/inbox.ts (grep 0 hits). Import akan gagal / undefined at runtime sehingga expect gagal. Menegakkan invariant D-Nama-RPC + tidak mengirim reactor_id (anti-tamper: server hardcoded auth.uid()).

#### [RX-2] toggleChatReaction mengembalikan boolean true apa-adanya (toggle-on)

- **Target:** toggleChatReaction return type Promise<boolean>
- **Arrange:** `mockRpc.mockResolvedValue({ data: true, error: null });`
- **Act:** `const r = await toggleChatReaction('m-1', '✅');`
- **Assert:** `expect(r).toBe(true); expect(typeof r).toBe('boolean');`
- **Why red:** Fungsi belum ada — kompilasi/runtime gagal. Setelah dibuat, memastikan return boolean tidak dibungkus/di-cast salah (mis. `data as any` menghasilkan undefined) — invariant kontrak boolean untuk hook layer men-toggle badge selected.

#### [RX-3] toggleChatReaction mengembalikan boolean false apa-adanya (toggle-off)

- **Target:** toggleChatReaction — differentiator hasil DELETE-only vs INSERT
- **Arrange:** `mockRpc.mockResolvedValue({ data: false, error: null });`
- **Act:** `const r = await toggleChatReaction('m-1', '👍');`
- **Assert:** `expect(r).toBe(false);`
- **Why red:** Fungsi belum ada. Membedakan `false` (toggle-off / row dihapus) dari `undefined`/`null` mencegah implementasi salah `return !!data` yang akan mem-flip semantik saat data=false; false wajib diteruskan verbatim.

#### [RX-4] toggleChatReaction propagasi error identity (rethrow object apa-adanya, bukan clone)

- **Target:** toggleChatReaction — error path (RLS/gate is_chat_member gagal, emoji delisted saat INSERT)
- **Arrange:** `const err = { message: 'not a chat member', code: '42501' }; mockRpc.mockResolvedValue({ data: null, error: err });`
- **Act:** `const p = toggleChatReaction('m-1', '👍');`
- **Assert:** `await expect(p).rejects.toBe(err);`
- **Why red:** Belum ada implementasi. Identity-check (toBe, bukan toEqual) memaksa pola `if (error) throw error` — mencegah wrapping ke Error baru yang menghapus `code`/`hint` dari PostgREST yang dibutuhkan errors.ts helper untuk pesan terkurasi.

#### [RX-5] toggleChatReaction meneruskan messageId & emoji verbatim (tanpa trim/normalize/lowercase)

- **Target:** toggleChatReaction — anti-normalisasi klien; whitelist enforcement server-side (D4)
- **Arrange:** `mockRpc.mockResolvedValue({ data: true, error: null });`
- **Act:** `await toggleChatReaction('  m-1  ', '  🙏  ');`
- **Assert:** `expect(mockRpc).toHaveBeenCalledWith('toggle_chat_reaction', { p_message: '  m-1  ', p_emoji: '  🙏  ' });`
- **Why red:** Belum ada implementasi. Menegakkan bahwa validasi/normalisasi HANYA di server (reaction_emojis whitelist + RLS) — implementasi naif yang memanggil .trim()/.toLowerCase() akan pecah, membocorkan logika otorisasi ke klien.

#### [RX-6] listChatMessages select-string memuat embed 'reactions:chat_message_reactions(emoji, reactor_id)'

- **Target:** listChatMessages — jalur baca reaksi via PostgREST embed (D1); tanpa RPC baca
- **Arrange:** `const { builder, calls } = makeQueryThenable({ data: [], error: null }); mockFrom.mockReturnValue(builder);`
- **Act:** `await listChatMessages('r1');`
- **Assert:** `expect(calls.select).toHaveLength(1); expect(calls.select[0][0]).toEqual(expect.stringContaining('reactions:chat_message_reactions(emoji, reactor_id)'));`
- **Why red:** Baris 61 saat ini: select('id, chat_room_id, author_id, body, created_at, author:author_id(id, full_name, email)') — tidak mengandung substring 'reactions:chat_message_reactions'. Assert gagal sampai embed ditambahkan.

#### [RX-7] listChatMessages TIDAK memindahkan chat_room_id ke .or() cursor bahkan setelah embed reactions ditambahkan (guard AC-12, FR-KP10)

- **Target:** listChatMessages — invariant top-level AND .eq('chat_room_id') anti-kebocoran room untuk pembaca can_view_workspace
- **Arrange:** `const { builder, calls } = makeQueryThenable({ data: [], error: null }); mockFrom.mockReturnValue(builder); const cursor = { createdAt: '2026-07-10T09:00:00.000Z', id: 'm-last' };`
- **Act:** `await listChatMessages('r1', cursor);`
- **Assert:** `expect(calls.eq).toEqual([['chat_room_id', 'r1']]); expect(calls.or).toEqual([['created_at.lt.2026-07-10T09:00:00.000Z,and(created_at.eq.2026-07-10T09:00:00.000Z,id.lt.m-last)']]); expect(JSON.stringify(calls.or)).not.toEqual(expect.stringContaining('reactions')); expect(JSON.stringify(calls.or)).not.toEqual(expect.stringContaining('chat_room_id'));`
- **Why red:** Sebelum implementasi embed, guard string 'reactions' di dalam .or() tak bisa dievaluasi karena test [RX-6] belum lulus. Saat implementer menambah embed, ada risiko implementasi salah melipat embed/chat_room_id ke ekspresi .or() cursor — assert ini gagal jika embed atau chat_room_id bocor ke .or(), menegakkan FR-KP10.

#### [RX-8] listChatMessages pass-through: field reactions[] pada baris di-return apa-adanya (tanpa transform di data layer)

- **Target:** listChatMessages — ChatMessage.reactions?: ChatReaction[] = { emoji, reactor_id }[]; agregasi count/reactedByMe adalah tanggung jawab render layer (D7)
- **Arrange:** `const rows = [{ id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'halo', created_at: '2026-07-10T09:00:00.000Z', reactions: [{ emoji: '👍', reactor_id: 'u1' }, { emoji: '👍', reactor_id: 'u2' }, { emoji: '🙏', reactor_id: 'u3' }] }]; const { builder } = makeQueryThenable({ data: rows, error: null }); mockFrom.mockReturnValue(builder);`
- **Act:** `const msgs = await listChatMessages('r1');`
- **Assert:** `expect(msgs).toEqual(rows); expect(msgs[0].reactions).toEqual([{ emoji: '👍', reactor_id: 'u1' }, { emoji: '👍', reactor_id: 'u2' }, { emoji: '🙏', reactor_id: 'u3' }]);`
- **Why red:** Tipe ChatMessage saat ini (mobile/src/lib/inbox.ts L20-27) belum punya optional `reactions` — assert `msgs[0].reactions` gagal type-check (tsc) + saat run cast `as unknown as ChatMessage[]` yang lama akan menghilangkan reactions dari tipe publik. Menegakkan invariant 'data layer thin' — tak boleh agregasi count/reactedByMe di sini.

#### [RX-9] listChatMessages tidak memanggil embed reactions ketika roomId kosong (short-circuit tetap dipatuhi)

- **Target:** listChatMessages — guard AC-9 (roomId falsy → [] tanpa query) tidak boleh dilongar oleh penambahan embed
- **Arrange:** `// tidak ada mock builder — memastikan short-circuit tak menyentuh supabase`
- **Act:** `const msgs = await listChatMessages('');`
- **Assert:** `expect(msgs).toEqual([]); expect(mockFrom).not.toHaveBeenCalled();`
- **Why red:** Test ini akan tetap hijau untuk implementasi saat ini, TAPI mem-freeze regresi: bila implementer memindahkan penambahan embed sebelum guard `if (!roomId) return []`, mockFrom terpanggil dan assert gagal. Menjaga invariant zero-query saat roomId falsy setelah refactor embed.

### 8.2 Hook layer — `mobile/src/hooks/__tests__/use-inbox.test.tsx`

#### useChatActions.toggleReaction — memanggil toggleChatReaction dengan (messageId, emoji) yang benar

- **Target:** useChatActions(roomId).toggleReaction dari mobile/src/hooks/use-inbox.ts
- **Arrange:** `jest.mock('@/lib/inbox', () => ({ CHAT_PAGE_SIZE: 30, listChatMessages: (...a)=>mockListChatMessages(...a), listChatRooms: (...a)=>mockListChatRooms(...a), markChatMessagesRead: (...a)=>mockMarkRead(...a), sendChatMessage: (...a)=>mockSend(...a), toggleChatReaction: (...a)=>mockToggleChatReaction(...a) })). mockToggleChatReaction.mockResolvedValue(true). Build wrapper via new QueryClient({defaultOptions:{queries:{retry:false}}}) + QueryClientProvider (createElement). renderHook(() => useChatActions('room-1'), { wrapper }).`
- **Act:** `await result.current.toggleReaction('msg-42', '👍')`
- **Assert:** `expect(mockToggleChatReaction).toHaveBeenCalledTimes(1); expect(mockToggleChatReaction).toHaveBeenCalledWith('msg-42', '👍').`
- **Why red:** useChatActions saat ini (use-inbox.ts L78-102) hanya expose {send, markRead, isSending}. toggleReaction belum ada → TypeError: result.current.toggleReaction is not a function. Merah sampai mutation baru + surface API di-add.

#### useChatActions.toggleReaction — menginvalidasi ['chat-messages', roomId] setelah sukses (positif)

- **Target:** useChatActions(roomId).toggleReaction onSuccess invalidation
- **Arrange:** `Mock @/lib/inbox seperti case #1. mockToggleChatReaction.mockResolvedValue(true). Buat QueryClient qc, spy = jest.spyOn(qc, 'invalidateQueries'). renderHook dengan wrapper yang expose qc yang sama.`
- **Act:** `await result.current.toggleReaction('msg-1', '✅')`
- **Assert:** `const keys = spy.mock.calls.map(c => JSON.stringify((c[0] as {queryKey: unknown[]}).queryKey)); expect(keys.some(k => k === JSON.stringify(['chat-messages','room-1']))).toBe(true);`
- **Why red:** Belum ada onSuccess yang memicu invalidasi ['chat-messages', roomId] untuk fitur reaksi. Tanpa mutation baru, invalidateQueries tak terpanggil dengan key tersebut. Refetch chat-messages adalah kanal satu-satunya utk memuat ulang embed reactions (D1).

#### useChatActions.toggleReaction — TIDAK menginvalidasi ['chat-rooms'] (netralitas preview last_message)

- **Target:** useChatActions(roomId).toggleReaction (negative invalidation guard)
- **Arrange:** `Mock @/lib/inbox + mockToggleChatReaction.mockResolvedValue(true). QueryClient qc + spy = jest.spyOn(qc, 'invalidateQueries').`
- **Act:** `await result.current.toggleReaction('msg-1', '👀')`
- **Assert:** `const keys = spy.mock.calls.map(c => JSON.stringify((c[0] as {queryKey: unknown[]}).queryKey)); expect(keys.some(k => k === JSON.stringify(['chat-rooms']))).toBe(false);`
- **Why red:** Perlu regressi-guard aktif: send(existing) meng-invalidate ['chat-rooms'] (use-inbox L86). Bila developer meng-copy pola send untuk toggleReaction tanpa pikir, guard ini gagal. Sebelum fitur ada, seluruh test file bahkan tak bisa dijalankan (toggleReaction undefined) → merah.

#### useChatActions.toggleReaction — TIDAK menginvalidasi ['notifications'] (V1 no-notify)

- **Target:** useChatActions(roomId).toggleReaction (negative invalidation guard)
- **Arrange:** `Mock @/lib/inbox + mockToggleChatReaction.mockResolvedValue(false). QueryClient qc + spy = jest.spyOn(qc, 'invalidateQueries').`
- **Act:** `await result.current.toggleReaction('msg-1', '🙏')`
- **Assert:** `const keys = spy.mock.calls.map(c => JSON.stringify((c[0] as {queryKey: unknown[]}).queryKey)); expect(keys.some(k => k.includes('notifications'))).toBe(false);`
- **Why red:** Spec V1 melarang notifikasi untuk reaksi. Guard aktif memastikan mutation baru tak mem-fanout ke family notifications. Sebelum implementasi: toggleReaction tak ada → tes gagal karena undefined.

#### useChatActions.toggleReaction — meneruskan boolean apa adanya dari RPC

- **Target:** useChatActions(roomId).toggleReaction return value pass-through
- **Arrange:** `Case A: mockToggleChatReaction.mockResolvedValueOnce(true). Case B: mockToggleChatReaction.mockResolvedValueOnce(false). renderHook per case.`
- **Act:** `const rA = await result.current.toggleReaction('m1','👍'); const rB = await result.current.toggleReaction('m2','👍');`
- **Assert:** `expect(rA).toBe(true); expect(rB).toBe(false);`
- **Why red:** Belum ada function; expect(...).toBe(true) melempar 'result.current.toggleReaction is not a function'. Sesudah implementasi, keputusan API 'return boolean via mutateAsync' harus dilock — menahan regresi 'menelan' return value (mis. void).

#### useChatActions.toggleReaction — mutation error di-propagate & TIDAK memicu invalidasi

- **Target:** useChatActions(roomId).toggleReaction onError semantics
- **Arrange:** `Mock @/lib/inbox. const err = new Error('rpc failed'); mockToggleChatReaction.mockRejectedValueOnce(err). QueryClient qc + spy = jest.spyOn(qc, 'invalidateQueries').`
- **Act:** `let caught: unknown; try { await result.current.toggleReaction('m1','👍'); } catch (e) { caught = e; }`
- **Assert:** `expect(caught).toBe(err); const keys = spy.mock.calls.map(c => JSON.stringify((c[0] as {queryKey: unknown[]}).queryKey)); expect(keys.some(k => k.includes('chat-messages'))).toBe(false);`
- **Why red:** toggleReaction belum eksis → melempar TypeError, bukan err yang sama (identity check 'toBe(err)' gagal). Juga menjaga invariant: bila server tolak (mis. bukan member, emoji delisted saat INSERT), UI tak boleh mem-blink refetch yang menyembunyikan pesan error.

#### useChatActions.toggleReaction — dua panggilan berturut-turut → dua invalidasi ['chat-messages', roomId]

- **Target:** useChatActions(roomId).toggleReaction idempoten hook-level
- **Arrange:** `Mock @/lib/inbox. mockToggleChatReaction.mockResolvedValueOnce(true).mockResolvedValueOnce(false). QueryClient qc + spy = jest.spyOn(qc, 'invalidateQueries').`
- **Act:** `await result.current.toggleReaction('m1','👍'); await result.current.toggleReaction('m1','👍');`
- **Assert:** `const count = spy.mock.calls.filter(c => JSON.stringify((c[0] as {queryKey: unknown[]}).queryKey) === JSON.stringify(['chat-messages','room-1'])).length; expect(count).toBe(2); expect(mockToggleChatReaction).toHaveBeenCalledTimes(2);`
- **Why red:** Tanpa mutation baru, tes gagal karena undefined. Sesudah implementasi, mencegah regresi debounce/throttle prematur di hook layer (spec: V1 invalidation-only, tanpa optimistic — hook harus 'stupid' dan menyerahkan konkurensi ke server DELETE-then-INSERT).

#### useChatActions.toggleReaction — TIDAK menyentuh keluarga cache di luar ['chat-messages', roomId] (isolasi roomId)

- **Target:** useChatActions('room-A').toggleReaction memakai roomId dari argumen hook (bukan hardcode)
- **Arrange:** `Mock @/lib/inbox. mockToggleChatReaction.mockResolvedValue(true). renderHook(() => useChatActions('room-A'), {wrapper}). qc + spy.`
- **Act:** `await result.current.toggleReaction('m1','👍')`
- **Assert:** `const keys = spy.mock.calls.map(c => JSON.stringify((c[0] as {queryKey: unknown[]}).queryKey)); expect(keys.some(k => k === JSON.stringify(['chat-messages','room-A']))).toBe(true); expect(keys.some(k => k === JSON.stringify(['chat-messages','room-B']))).toBe(false);`
- **Why red:** Menegakkan bahwa key invalidation dibangun dari param `roomId` hook. Jika implementasi salah hardcode/nyontek dari send tapi lupa closure roomId, tes gagal. Sebelum implementasi: tak ada function → merah default.

#### useChatActions — expose isTogglingReaction sebagai mirror dari mutation.isPending

- **Target:** useChatActions(roomId).isTogglingReaction
- **Arrange:** `Mock @/lib/inbox. let resolveFn: (v: boolean) => void; mockToggleChatReaction.mockImplementation(() => new Promise<boolean>(res => { resolveFn = res; })).`
- **Act:** `act(() => { void result.current.toggleReaction('m1','👍'); }); await waitFor(() => expect(result.current.isTogglingReaction).toBe(true)); act(() => { resolveFn!(true); }); await waitFor(() => expect(result.current.isTogglingReaction).toBe(false));`
- **Assert:** `Transisi pending true→false terverifikasi via waitFor di atas.`
- **Why red:** Field `isTogglingReaction` belum ada di return type useChatActions (L97-101 hanya {send, markRead, isSending}). Screen memerlukan indikator ini utk debounce pill/menampilkan error non-blocking (spec §10). Sebelum implementasi: undefined → toBe(true) gagal.

#### useChatMessages — meneruskan field `reactions` embed dari listChatMessages apa adanya

- **Target:** useChatMessages(roomId) pass-through embed reactions
- **Arrange:** `Mock @/lib/inbox dgn mockListChatMessages.mockResolvedValueOnce([{ id: 'm1', chat_room_id: 'room-1', author_id: 'u1', body: 'hi', created_at: '2026-07-13T00:00:00Z', author: { id: 'u1', full_name: 'A', email: 'a@x' }, reactions: [{ emoji: '👍', reactor_id: 'u2' }, { emoji: '👍', reactor_id: 'u3' }] }]).`
- **Act:** `renderHook(() => useChatMessages('room-1'), {wrapper}); await waitFor(() => expect(result.current.isLoading).toBe(false));`
- **Assert:** `expect(result.current.messages[0].reactions).toEqual([{ emoji: '👍', reactor_id: 'u2' }, { emoji: '👍', reactor_id: 'u3' }]);`
- **Why red:** Tipe `ChatMessage.reactions` belum ada di mobile/src/lib/inbox.ts → TS compile fail di fixture / properti undefined di runtime. Setelah tipe ditambah, invariant 'hook tidak melumat field' terkunci — MessageBubble bergantung field ini utk agregasi count+reactedByMe.

#### useChatMessages — pesan tanpa `reactions` tetap valid (opsional, backward-compat)

- **Target:** useChatMessages(roomId) pass-through — reactions undefined
- **Arrange:** `mockListChatMessages.mockResolvedValueOnce([{ id: 'm1', chat_room_id: 'room-1', author_id: 'u1', body: 'legacy', created_at: '2026-07-13T00:00:00Z', author: { id: 'u1', full_name: 'A', email: 'a@x' } }]).`
- **Act:** `renderHook + waitFor selesai loading.`
- **Assert:** `expect(result.current.messages[0]).toHaveProperty('id','m1'); expect(result.current.messages[0].reactions).toBeUndefined();`
- **Why red:** Sebelum ChatMessage.reactions dijadikan OPTIONAL (`reactions?: ChatReaction[]`), tipe wajib bakal memaksa fixture selalu menyertakan field, dan tes lama (pesan tanpa reactions) berpotensi tak kompile. Menegakkan opsionalitas eksplisit — mencegah regresi migrasi awal saat DB belum mengembalikan array.

### 8.3 UI layer — `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx`

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > tidak merender pill row saat pesan tanpa reaksi

- **Target:** MessageBubble/ReactionPillRow di mobile/src/app/(app)/inbox/[roomId].tsx
- **Arrange:** `mockUseChatMessages return state via makeChatMessagesState({ messages: [{ id: 'm1', chat_room_id: 'r1', author_id: 'other', body: 'Halo tim', created_at: <ISO>, author: { id: 'other', full_name: 'Andi', email: null } }] }) — TANPA properti reactions. mockUseChatActions default (toggleReaction: jest.fn()). mockSession = { user: { id: 'me' } }. Render <ChatRoomScreen /> (useLocalSearchParams roomId='r1').`
- **Act:** `await screen.findByText('Halo tim'); const pill = screen.queryByLabelText(/^Reaksi /);`
- **Assert:** `expect(pill).toBeNull(); // tidak ada row placeholder, tidak ada pill saat reactions kosong/undefined`
- **Why red:** Belum ada sub-komponen ReactionPillRow di [roomId].tsx; sekaligus wiring reactions ke MessageBubble belum ada — test akan mem-force adanya branch conditional (m.reactions?.length > 0).

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > agregasi count: dua reaktor emoji sama → satu pill dengan count 2

- **Target:** Agregasi client-side count di ReactionPillRow ([roomId].tsx)
- **Arrange:** `makeChatMessagesState({ messages: [{ id: 'm1', ..., body: 'Halo', reactions: [{ emoji: '👍', reactor_id: 'a' }, { emoji: '👍', reactor_id: 'b' }] }] }). mockSession user 'me' (bukan 'a'/'b').`
- **Act:** `await screen.findByText('Halo'); const pills = screen.queryAllByLabelText(/^Reaksi 👍/);`
- **Assert:** `expect(pills.length).toBe(1); expect(screen.getByLabelText('Reaksi 👍, 2, belum bereaksi')).toBeTruthy();`
- **Why red:** Belum ada agregasi count + label a11y terformat; render saat ini tidak menampilkan pill sama sekali.

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > reactedByMe true saat currentUserId ada di reactor_id

- **Target:** Perhitungan reactedByMe via useAuth().session.user.id + accessibilityState.selected
- **Arrange:** `makeChatMessagesState({ messages: [{ id: 'm1', ..., reactions: [{ emoji: '👍', reactor_id: 'me' }, { emoji: '✅', reactor_id: 'other' }] }] }). mockSession = { user: { id: 'me' } }.`
- **Act:** `const pillLike = await screen.findByLabelText(/Reaksi 👍.*saya sudah bereaksi/); const pillCheck = screen.getByLabelText(/Reaksi ✅.*belum bereaksi/);`
- **Assert:** `expect(pillLike.props.accessibilityState.selected).toBe(true); expect(pillCheck.props.accessibilityState.selected).toBe(false);`
- **Why red:** Belum ada pembacaan currentUserId dari useAuth di dalam MessageBubble; belum ada mapping ke accessibilityState.selected.

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > reactedByMe false saat session null (guest/logout race)

- **Target:** Guard session.user.id null di perhitungan reactedByMe
- **Arrange:** `mockSession = null. makeChatMessagesState({ messages: [{ id: 'm1', ..., reactions: [{ emoji: '👍', reactor_id: 'someone' }] }] }).`
- **Act:** `const pill = await screen.findByLabelText(/^Reaksi 👍/);`
- **Assert:** `expect(pill.props.accessibilityState.selected).toBe(false);`
- **Why red:** Tidak ada guard null-safe untuk session; tanpa implementasi UI, pill tidak dirender sehingga findByLabelText throw.

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > touch target ≥44px via inline style numeric

- **Target:** ReactionPill minWidth/minHeight ≥44 (a11y §4)
- **Arrange:** `makeChatMessagesState({ messages: [{ id: 'm1', ..., reactions: [{ emoji: '👍', reactor_id: 'a' }] }] }).`
- **Act:** `const pill = await screen.findByLabelText(/^Reaksi 👍/); const flat = Array.isArray(pill.props.style) ? Object.assign({}, ...pill.props.style.filter(Boolean)) : (pill.props.style ?? {});`
- **Assert:** `expect((flat.minHeight ?? flat.height) >= 44).toBe(true); expect((flat.minWidth ?? flat.width) >= 44).toBe(true);`
- **Why red:** Pill belum ada; ketika ditambahkan, tanpa inline style numeric (hanya Tailwind class) assertion width/height akan undefined — memaksa penggunaan pola SendButton (Critic §8.4).

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > non-color signal untuk selected (border tebal atau tanda ✓)

- **Target:** ReactionPill selected menambahkan sinyal non-warna (a11y §4)
- **Arrange:** `makeChatMessagesState({ messages: [{ id: 'm1', ..., reactions: [{ emoji: '👍', reactor_id: 'me' }] }] }). mockSession user 'me'.`
- **Act:** `const pill = await screen.findByLabelText(/Reaksi 👍.*saya sudah bereaksi/); const flat = Array.isArray(pill.props.style) ? Object.assign({}, ...pill.props.style.filter(Boolean)) : (pill.props.style ?? {}); const hasCheck = within(pill).queryByText('✓') !== null;`
- **Assert:** `expect(pill.props.accessibilityState.selected).toBe(true); expect(hasCheck || (flat.borderWidth ?? 0) >= 2).toBe(true);`
- **Why red:** Belum ada styling selected; assertion selected/border/checkmark semua akan gagal karena pill tidak dirender. *(Revisi C4: JANGAN assert `props.className` — komponen diimpor dari `react-native-css/components` yang men-transform className ke style; assert child `✓` atau `flat.borderWidth >= 2`.)*

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > tap pill memanggil toggleReaction(messageId, emoji)

- **Target:** onPress ReactionPill → useChatActions().toggleReaction
- **Arrange:** `const mockToggleReaction = jest.fn().mockResolvedValue(true); perluas mockUseChatActions agar mengembalikan { send, markRead, isSending, isMarkingRead, toggleReaction: mockToggleReaction, isTogglingReaction: false }. makeChatMessagesState({ messages: [{ id: 'm1', ..., reactions: [{ emoji: '👍', reactor_id: 'a' }] }] }). mockSession user 'me'.`
- **Act:** `const pill = await screen.findByLabelText(/^Reaksi 👍/); fireEvent.press(pill);`
- **Assert:** `expect(mockToggleReaction).toHaveBeenCalledTimes(1); expect(mockToggleReaction).toHaveBeenCalledWith('m1', '👍');`
- **Why red:** useChatActions belum expose toggleReaction; MessageBubble belum memiliki handler press pada pill — tak ada pill untuk dipress.

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > tap saat session null tidak memanggil mutation

- **Target:** Guard tap saat currentUserId undefined
- **Arrange:** `mockSession = null. mockToggleReaction = jest.fn(). messages: [{ id: 'm1', ..., reactions: [{ emoji: '👍', reactor_id: 'x' }] }].`
- **Act:** `const pill = await screen.findByLabelText(/^Reaksi 👍/); fireEvent.press(pill);`
- **Assert:** `expect(mockToggleReaction).not.toHaveBeenCalled();`
- **Why red:** Tanpa guard, handler akan tetap memanggil mutation; sebelum implementasi handler tidak ada, tapi test menuntut pill tetap ter-render dan tap no-op.

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > error toggle merender alert inline tanpa merusak list pesan

- **Target:** Catch mutation → setState errorReaction → <Text accessibilityRole="alert">
- **Arrange:** `mockToggleReaction = jest.fn().mockRejectedValueOnce(new Error('boom')). messages: [{ id: 'm1', ..., body: 'Halo tim', reactions: [{ emoji: '👍', reactor_id: 'x' }] }, { id: 'm2', ..., body: 'Balasan', reactions: [] }]. mockSession user 'me'.`
- **Act:** `const pill = await screen.findByLabelText(/^Reaksi 👍/); fireEvent.press(pill); const alert = await screen.findByRole('alert');`
- **Assert:** `expect(alert).toBeTruthy(); expect(screen.getByText('Halo tim')).toBeTruthy(); expect(screen.getByText('Balasan')).toBeTruthy();`
- **Why red:** Belum ada handling catch + state error inline untuk reaksi; unhandled rejection akan meletup di test tanpa surface alert.

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > multi-emoji ordering stabil (deterministik)

- **Target:** Sortir pill deterministik via konstanta tetap `REACTION_EMOJI_ORDER = ['👍','✅','👀','🙏']` (keputusan D13 — lihat §12), BUKAN first-seen order dari reactions[]
- **Arrange:** `messages: [{ id: 'm1', ..., reactions: [{ emoji: '✅', reactor_id: 'a' }, { emoji: '👍', reactor_id: 'a' }, { emoji: '👀', reactor_id: 'b' }] }] — sengaja input TIDAK berurut konstanta.`
- **Act:** `const pills = await screen.findAllByLabelText(/^Reaksi /); const labels = pills.map(p => String(p.props.accessibilityLabel));`
- **Assert:** `expect(labels.length).toBe(3); expect(labels[0]).toMatch(/👍/); expect(labels[1]).toMatch(/✅/); expect(labels[2]).toMatch(/👀/); // urut konstanta, bukan urut input`
- **Why red:** Belum ada implementasi urutan pill; render awal tidak menampilkan pill sama sekali. *(Revisi C5: first-seen order bergantung urutan baris embed PostgREST yang TIDAK dijamin server → flaky di kontrak nyata. Aggregator WAJIB sort by konstanta tetap; emoji tak dikenal (penambahan seed masa depan) di-append by codepoint.)*

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > isLoading tidak merender pill (skeleton path)

- **Target:** Path SkeletonList vs list utama
- **Arrange:** `mockUseChatMessages return state via makeChatMessagesState({ isLoading: true, messages: [] }).`
- **Act:** `await screen.findByLabelText('Memuat…'); const pill = screen.queryByLabelText(/^Reaksi /); const list = screen.queryByTestId('chat-list');`
- **Assert:** `expect(pill).toBeNull(); expect(list).toBeNull();`
- **Why red:** Setelah pill diperkenalkan, ada risiko bocor ke path skeleton bila komponen render pill di luar branch messages; test ini mengunci scope. *(Revisi C1/M16: saat `isLoading=true`, `[roomId].tsx` L205-206 merender `<SkeletonList count={4}/>` (accessibilityLabel `'Memuat…'`, ui.tsx L403) dan FlatList `testID='chat-list'` TIDAK dirender — `findByTestId('chat-list')` versi lama akan timeout dengan pesan salah arah.)*

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > compat highlight — bubble ter-highlight tetap render pill

- **Target:** Regresi terhadap MessageBubble.isHighlighted (border-2 amber) saat ada reactions
- **Arrange:** `useLocalSearchParams returns { roomId: 'r1', highlight: 'm1' }. messages: [{ id: 'm1', ..., body: 'Pesan target', reactions: [{ emoji: '👍', reactor_id: 'x' }] }].`
- **Act:** `await screen.findByText('Pesan target'); const pill = await screen.findByLabelText(/^Reaksi 👍/);`
- **Assert:** `expect(pill).toBeTruthy(); // pill dirender berdampingan dengan bubble highlight`
- **Why red:** Belum ada wiring pill; sub-komponen highlight tidak menerima anak baru — memaksa penempatan pill row di bawah body tetapi di dalam sel bubble.

#### ChatRoomScreen — Reaction pill (FR-RX-4.x) > pesan self (author=me) tetap menampilkan pill

- **Target:** Self-react diizinkan (AC-24) — pill terlihat di bubble milik user
- **Arrange:** `messages: [{ id: 'm1', author_id: 'me', ..., body: 'Aku', reactions: [{ emoji: '👍', reactor_id: 'me' }] }]. mockSession user 'me'.`
- **Act:** `const pill = await screen.findByLabelText(/Reaksi 👍.*saya sudah bereaksi/);`
- **Assert:** `expect(pill).toBeTruthy(); expect(pill.props.accessibilityState.selected).toBe(true);`
- **Why red:** Tanpa implementasi pill sama sekali, findByLabelText throws; sekaligus mengunci invariant bahwa branch isMe tetap render pill row.

---

## 9. Urutan Langkah Terinci (Red → Green → Refactor)

> **[ARSIP — output workflow asli.]** Tabel ini menyebut "11 blok"/"13 case" versi pra-revisi. Angka dan konten final = §4 (sudah dikoreksi) + §12. Gunakan tabel ini hanya untuk urutan/tipe langkah, bukan untuk daftar blok/case.

| # | Type | Deskripsi | Files | Tes referensi |
|---|------|-----------|-------|---------------|
| 1 | red | Fase A/Red-SQL — tulis 11 blok PASS/FAIL kontrak SQL: DDL+PK/FK CASCADE, RLS+policy SELECT, revoke I/U/D, RPC idempoten (dua toggle-on → 1 row), validasi emoji-aktif hanya INSERT, delisted removable via DELETE, cross-org 0 baris, cascade hapus pesan/room/org/profil, anti-tamper (Y tak cabut reaksi X), tulis-langsung ditolak, netralitas skor byte-identik + guard statik pg_get_functiondef. Nomor file reconcile HEAD (00XX). | `supabase/tests/00XX_chat_message_reactions_contract.sql` | SQL contract 11 blok (behaviors §13 spec) |
| 2 | green | Fase A/Green-SQL — tulis migrasi baru berisi §7.1 (tabel reaction_emojis + seed 4 ack + RLS select-all + revoke I/U/D), §7.2 (tabel chat_message_reactions PK komposit + FK CASCADE + RLS + policy select organization_id=current_user_org() AND EXISTS(chat_messages ... is_chat_member OR can_view_workspace) + revoke I/U/D), §7.3 (RPC toggle_chat_reaction SECURITY DEFINER + gate is_chat_member + DELETE-then-INSERT ON CONFLICT DO NOTHING + validasi emoji-aktif hanya INSERT + grant execute authenticated). Jalankan psql -f contract → 11/11 PASS. | `supabase/migrations/00XX_chat_message_reactions.sql` | SQL contract 11 blok PASS |
| 3 | red | Fase B/Red-Data — extend mobile/src/lib/__tests__/inbox.test.ts dengan 4 case listChatMessages: [RX-6] select-string memuat 'reactions:chat_message_reactions(emoji, reactor_id)'; [RX-7] .eq('chat_room_id') top-level DAN string 'reactions'/'chat_room_id' TIDAK muncul di calls.or; [RX-8] pass-through msgs[0].reactions apa adanya (fixture 3 baris); [RX-9] roomId falsy → [] tanpa mockFrom terpanggil. | `mobile/src/lib/__tests__/inbox.test.ts` | RX-6, RX-7, RX-8, RX-9 |
| 4 | red | Fase B/Red-Data — tambah 5 case toggleChatReaction: [RX-1] mockRpc dipanggil dengan ('toggle_chat_reaction', {p_message, p_emoji}) exact; [RX-2] return true verbatim; [RX-3] return false verbatim (bukan !!data); [RX-4] rejects.toBe(err) identity; [RX-5] messageId+emoji verbatim tanpa trim/normalize. | `mobile/src/lib/__tests__/inbox.test.ts` | RX-1, RX-2, RX-3, RX-4, RX-5 |
| 5 | green | Fase B/Green-Data — di mobile/src/lib/inbox.ts: (a) tambah type ChatReaction={emoji,reactor_id}; (b) perluas ChatMessage dengan reactions?:ChatReaction[]; (c) ubah select() di listChatMessages menjadi 'id, chat_room_id, author_id, body, created_at, author:author_id(id, full_name, email), reactions:chat_message_reactions(emoji, reactor_id)' tanpa menyentuh top-level .eq maupun ekspresi .or; (d) tambah export async function toggleChatReaction(messageId, emoji): Promise<boolean> = supabase.rpc('toggle_chat_reaction', {p_message: messageId, p_emoji: emoji}), if(error) throw error; return data as boolean. Update database.types.ts: sisipkan Row/Insert/Update/Relationships reaction_emojis + chat_message_reactions dan Functions.toggle_chat_reaction {Args:{p_message:string,p_emoji:string}, Returns:boolean}. | `mobile/src/lib/inbox.ts`<br>`mobile/src/lib/database.types.ts` | RX-1..RX-9 hijau; npm run type-check hijau |
| 6 | refactor | Fase B/Refactor — jalankan npm test inbox + type-check. Verifikasi tak ada helper baru terduplikasi; string select() muncul sekali (tak perlu ekstrak konstanta belum). Cek tak ada import supabase baru di file lain (grep chat_message_reactions di mobile/src/lib → hanya inbox.ts + database.types.ts). | `mobile/src/lib/inbox.ts`<br>`mobile/src/lib/database.types.ts` | Regressi jest suite lib |
| 7 | red | Fase C/Red-Hook — extend mobile/src/hooks/__tests__/use-inbox.test.tsx: perluas mock @/lib/inbox dengan toggleChatReaction. 8 case useChatActions.toggleReaction: (i) mockToggleChatReaction dipanggil dgn ('msg-42','👍'); (ii) POS invalidateQueries key ['chat-messages', roomId]; (iii) NEG key ['chat-rooms'] tidak muncul; (iv) NEG 'notifications' substring tidak muncul; (v) return boolean true/false pass-through via mutateAsync; (vi) mockRejectedValueOnce → mutateAsync rejects.toBe(err) DAN spy invalidateQueries tidak berisi ['chat-messages']; (vii) dua panggilan berturut → 2× invalidate ['chat-messages', roomId]; (viii) hook dgn roomId='room-A' invalidate 'room-A' bukan 'room-B'. Tambah case (ix) isTogglingReaction pending true→false via Promise manual. Plus 2 case useChatMessages: [X] pass-through messages[0].reactions dari mockListChatMessages; [Y] pesan tanpa reactions → messages[0].reactions === undefined (opsionalitas). | `mobile/src/hooks/__tests__/use-inbox.test.tsx` | useChatActions.toggleReaction 9 case + useChatMessages 2 case |
| 8 | green | Fase C/Green-Hook — di mobile/src/hooks/use-inbox.ts, dalam useChatActions(roomId) tambah toggleReactionM = useMutation({ mutationFn: (v:{messageId:string;emoji:string}) => toggleChatReaction(v.messageId, v.emoji), onSuccess: () => qc.invalidateQueries({queryKey:['chat-messages', roomId]}) }). Perluas return objek: toggleReaction: (messageId, emoji) => toggleReactionM.mutateAsync({messageId, emoji}), isTogglingReaction: toggleReactionM.isPending. JANGAN memanggil invalidateQueries untuk ['chat-rooms'] maupun ['notifications']. | `mobile/src/hooks/use-inbox.ts` | 9 case useChatActions.toggleReaction + 2 case useChatMessages hijau |
| 9 | refactor | Fase C/Refactor — jalankan npm test hooks. Verifikasi bentuk mutasi konsisten dengan sendM/markReadM (satu queryKey, tanpa side-effect notif). Belum perlu ekstrak factory invalidator (baru 3 mutation, threshold ≥5). | `mobile/src/hooks/use-inbox.ts` | Regressi jest hooks suite |
| 10 | refactor | Fase D/Prasyarat — WAJIB sebelum Fase D dimulai: update DESIGN.md §7 tambah entri 'Reaction pill' (unselected vs selected, sinyal non-warna via border-2 + checkmark ✓, min 44px, solid+putih = brand-dark #1564b3), sinkron ke mobile/src/global.css bila token warna baru. Bukan test — dokumentasi + token yang memblokir UI test menghasilkan hasil deterministik. | `DESIGN.md`<br>`mobile/src/global.css` | FR-RX-0.3, FR-RX-4.4 |
| 11 | red | Fase D/Red-UI — extend mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx: (a) perluas makeChatMessagesState agar messages boleh berisi reactions:[{emoji,reactor_id}]; (b) perluas mock useChatActions dengan toggleReaction:mockToggleReaction, isTogglingReaction:false. Tambah suite 'ChatRoomScreen — Reaction pill (FR-RX-4.x)' 13 case: [1] zero-pill saat reactions kosong/undefined; [2] agregasi count 2 utk emoji sama; [3] reactedByMe=selected.true saat reactor_id=='me'; [4] session=null → selected.false, pill tetap render; [5] touch target flatten style ≥44 min/height/width; [6] non-color signal (border-2 OR text '✓'); [7] fireEvent.press pill → mockToggleReaction('m1','👍'); [8] session=null tap → mockToggleReaction not called; [9] mockRejectedValueOnce → findByRole('alert') + list pesan tetap render; [10] ordering deterministik first-seen (✅ 👍 👀); [11] isLoading true → queryByLabelText null; [12] highlight amber compat — pill tetap render; [13] self-react author='me' → pill selected true. | `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx` | Reaction pill FR-RX-4.x — 13 case |
| 12 | green | Fase D/Green-UI — di mobile/src/app/(app)/inbox/[roomId].tsx: (a) sub-komponen inline ReactionPill (Pressable) dengan style={{minWidth:44, minHeight:44}} inline numeric (bukan Tailwind class), accessibilityRole='button', accessibilityLabel=`Reaksi ${emoji}, ${count}, ${reactedByMe?'saya sudah bereaksi':'belum bereaksi'}`, accessibilityState={{selected:reactedByMe}}, className menambahkan border-2 border-brand-dark saat selected + child <Text>✓</Text>; (b) ReactionPillRow yang mengagregasi reactions ke Map<emoji,{count,reactedByMe}> dengan urutan first-seen (Array.from(new Set(reactions.map(r=>r.emoji)))), return null bila reactions?.length falsy; (c) sisipkan <ReactionPillRow /> di dalam MessageBubble di bawah body namun tetap di dalam sel bubble (agar border amber highlight tetap membungkus); (d) currentUserId = useAuth().session?.user?.id ?? null; handler press: if(!currentUserId\|\|isTogglingReaction) return; try await toggleReaction(m.id, emoji) catch e => reportError('Reaksi', e, 'Gagal memperbarui reaksi.') + setReactionError(msg); render <Text accessibilityRole='alert'>{reactionError}</Text> inline; (e) skeleton path (isLoading) TIDAK merender pill. | `mobile/src/app/(app)/inbox/[roomId].tsx` | 13 case Reaction pill FR-RX-4.x hijau |
| 13 | refactor | Fase D/Refactor — memoize aggregator per pesan (useMemo dependency [m.reactions, currentUserId]). Verifikasi inline style numeric bukan Tailwind (Critic §8.4). Rapikan copy Bahasa Indonesia. Jalankan npm test screens. | `mobile/src/app/(app)/inbox/[roomId].tsx` | Regressi jest screens suite |
| 14 | refactor | Fase E/Regressi — jalankan `npm test` + `npm run type-check` seluruh proyek. Pastikan roomId.timeline.test.ts, roomId.search-highlight.test.tsx, keyset tests, dan seluruh suite non-reaksi tetap hijau. Grep guard: `grep -r chat_message_reactions mobile/src/lib` harus hanya matched di inbox.ts + database.types.ts (netralitas skor). |  | Full jest suite + type-check |
| 15 | refactor | Fase E/Guard operasional — jalankan ulang SQL contract PASS/FAIL setelah semua migrasi tetangga (bila ada perpindahan branch). Verifikasi netralitas skor via `select pg_get_functiondef(oid) from pg_proc where proname ilike '%score%' or proname ilike '%recompute%'` — semua def tidak memuat substring 'chat_message_reactions'. | `supabase/tests/00XX_chat_message_reactions_contract.sql` | AC-18 netralitas skor |

---

## 10. Audit Critic (verdict awal: perlu-perbaikan — **SEMUA ITEM DIADJUDIKASI, lihat §12**)

> **[ARSIP — sudah ditindaklanjuti 2026-07-13.]** Sub-agent audit menemukan **17 concerns** + **18 missing cases**. Setiap item kini punya disposisi final di §12.1 (FIX / ACCEPT-LIMITATION / DECISION); case §8 yang salah telah dikoreksi in-place; case baru ada di §12.3–12.6. Daftar di bawah dipertahankan verbatim sebagai jejak audit — JANGAN kerjakan ulang dari sini; kerjakan dari §12.

### 10.1 Concerns (17)

**C1.** [Test-Bug UI case #11] `isLoading=true` path — plan meng-assert `screen.findByTestId('chat-list')` lalu `queryByLabelText(/^Reaksi /) === null`. Tapi di `[roomId].tsx` L205-239, saat `isLoading=true` render adalah `<SkeletonList count={4} />` (label 'Memuat…'), FlatList `testID='chat-list'` TIDAK dirender. `findByTestId('chat-list')` akan timeout dan test failing dengan pesan yang salah arah. Ganti asertifnya: `await screen.findByLabelText('Memuat…')` + `expect(screen.queryByLabelText(/^Reaksi /)).toBeNull()`.

**C2.** [Score-guard salah nama fungsi] Plan §k / step §15 dan mocking_strategy SQL menggunakan pattern `proname in ('recompute_...', 'calculate_score_...')` / `ilike '%score%'`. Nama fungsi skor sebenarnya di repo (dari `0013_fase7_people_score.sql`, `0020_fase_sf1_score_formula_editor.sql`, `0039_fase7_cross_org_isolation.sql`) adalah: `calculate_period_scores`, `upsert_score_formula_version`, `activate_score_formula_version`, `assign_score_formula`, `override_user_score`, `create_score_formula_draft`, `update_score_formula_version_weights`, `tg_score_formula_immutable_columns`. Pattern generik plan gagal cocok utk sebagian (mis. `upsert_score_formula_version` cocok `%score%`, tapi `calculate_period_scores` tidak cocok `calculate_score_*`). Enumerasi eksplisit atau gunakan `proname ilike '%period_score%' OR proname ilike '%score_formula%' OR proname ilike '%override_user%'`.

**C3.** [Mocking pola statis vs lazy] Existing mock di `[roomId].test.tsx` L30-33 memakai factory statis `useChatActions: () => ({ ..., isSending: mockIsSending })` di mana `mockIsSending` adalah `let` module-scope yang dibaca ulang tiap render. Rencana step §11 hanya menuliskan `toggleReaction: mockToggleReaction, isTogglingReaction: false` (literal). Ini menghambat penambahan test 'isTogglingReaction=true blocks tap'. Wajib menambahkan `let mockIsTogglingReaction = false;` module-scope + `isTogglingReaction: mockIsTogglingReaction` (lazy) supaya pending-guard bisa diuji per-test.

**C4.** [Non-color signal via className fragile] UI case #6 (non-color signal border-2 OR ✓) mengasersi `String(pill.props.className ?? '')` matches `/border(-2|-)/`. `[roomId].tsx` mengimpor Pressable/Text dari `react-native-css/components` — library ini men-transform `className` menjadi `style` (flatten ke `borderWidth` numeric), sehingga `props.className` bisa jadi kosong/undef di jest tree. Assert harus jatuh ke: (a) child `<Text>✓</Text>` via `within(pill).queryByText('✓')`, atau (b) `flatStyle.borderWidth >= 2`. Jangan mengandalkan `className` sebagai prop yang terpelihara.

**C5.** [Ordering pill tidak dijamin server-side] UI case #10 'first-seen' menuntut PostgREST mengembalikan `chat_message_reactions` embed dengan urutan insersi/reactor_id yang deterministik. PostgREST tanpa `order` explicit tidak menjamin urutan baris embed → di produksi bisa arbitrer (index scan order). Test hijau di jest karena mock builder mengembalikan array persis, tapi assert 'first-seen' akan flaky di kontrak HTTP nyata. Solusi: (i) tambah `order=emoji` di string `.select()` embed (mis. `reactions:chat_message_reactions(emoji, reactor_id, order=emoji.asc)`), atau (ii) client-side sort mem-map lewat `reaction_emojis.sort_order` (butuh embed 2-level) atau Unicode codepoint tetap. Plan harus memilih dan menyematkan sebagai contract.

**C6.** [Contract test workspace-viewer non-member missing branch] AC-13/AC-11 wajib membuktikan SEPARASI baca-vs-tulis untuk user `can_view_workspace()=true AND is_chat_member=false`: HARUS bisa SELECT baris reaksi (embed) TETAPI RPC `toggle_chat_reaction` HARUS raise 'Hanya anggota room yang dapat memberi reaksi.'. Plan §b dan §i tidak eksplisit menyebut skenario ini (hanya 'cross-org' dan 'anti-tamper'). Contract test butuh dua blok terpisah dengan user ber-`can_view_workspace()` — kelupaan → viewer-write bisa merembes tanpa terdeteksi.

**C7.** [Contract test `reaction_emojis` seed & policy kurang eksplisit] Plan §a hanya 'DDL + PK/FK CASCADE' — tidak mengecek: (i) seed set aktif = {'👍','✅','👀','🙏'} tepat 4 baris (spec §7.1 sengaja drop ❤️/🎉); (ii) policy `reaction_emojis_select` mengizinkan SELECT untuk authenticated apa adanya; (iii) `insert/update/delete` di-revoke dari authenticated+anon. Ini blocker guard 'Whitelist single-source' — kalau seed melenceng, klien bisa render emoji ekspresif yang dilarang scope-guardrail.

**C8.** [Concurrency test tidak benar-benar concurrent] Plan §d & risk menuliskan uji 'idempoten & concurrency-safe' via dua panggilan berurutan → assert count(*)=1. Ini uji IDEMPOTENSI (D2), bukan concurrency riil. Concurrency asli butuh dua transaksi paralel (dua session/dua koneksi psql). Untuk deteksi race INSERT-INSERT, `ON CONFLICT DO NOTHING` sudah menutup — tapi race DELETE-then-INSERT antar dua device yang sama user tidak diuji. Terima batasan ini eksplisit, atau tulis test yang mem-BEGIN...COMMIT dua session dengan pg_backend_pid berbeda.

**C9.** [Anti-tamper test kurang detail residu] Plan §i 'Y tak cabut reaksi X' baik. Perlu ditambah asertifikasi POSITIF: setelah Y memanggil `toggle_chat_reaction(msg,'👍')`, (a) baris X (msg,X,'👍') MASIH ADA, (b) baris Y (msg,Y,'👍') BARU TERCIPTA (bukti PK komposit mengizinkan multi-reactor per emoji, D11), (c) count baris = 2. Tanpa (a)+(b)+(c), test lolos meski PK atau reactor_id di-hijack.

**C10.** [FK whitelist test tak ada] Plan menyebut 'validasi emoji-aktif hanya INSERT' (D5) tapi tidak eksplisit menguji FK `chat_message_reactions.emoji → reaction_emojis.emoji`. Kalau seseorang men-DROP validasi RPC `if not exists (... where emoji=p_emoji and active)`, dan FK ternyata hilang/rusak, insert emoji sembarang lolos. Tambahkan uji: langsung INSERT (di context definer/superuser test) dengan emoji tak terdaftar → gagal FK 23503. Independen dari validasi active-flag.

**C11.** [UI test pending-guard (isTogglingReaction) missing] Plan Green-UI (§12) memasang `if (!currentUserId || isTogglingReaction) return;` — tapi TIDAK ADA test yang menutup cabang `isTogglingReaction=true → tap no-op`. Sebutkan case: set `mockIsTogglingReaction=true`, tap pill → `expect(mockToggleReaction).not.toHaveBeenCalled()`. Tanpa itu, developer bisa menghapus guard dan seluruh suite tetap hijau.

**C12.** [Hook test [X] pass-through reactions vs sanitasi] Test [X] mem-assert `messages[0].reactions` = fixture verbatim, tapi hook memakai `useInfiniteQuery` yang bakal me-flatten `pages` — bila listChatMessages mengembalikan array dengan `reactions: [...]` di baris terluar, flatten by `.flat()` mempertahankan struktur. Aman. Namun perhatikan: TypeScript strict + fixture Row bertipe `ChatMessage` — tanpa update tipe di `inbox.ts` yang menambahkan `reactions?: ChatReaction[]`, fixture literal ditolak `tsc`. Merah tipe di fase Red-Hook belum eksplisit dinyatakan sebagai bagian dari 'why_red' — perlu ditambahkan.

**C13.** [SQL test cascade `chat_messages` immutability] AC-16/17 menuntut CASCADE saat hapus pesan/room/org/profil + `chat_messages` tetap immutable. Plan §h menyebut cascade generic. Perlu contract sub-test spesifik: (i) DELETE `chat_messages` → baris `chat_message_reactions` sesuai chat_message_id ikut hilang; (ii) DELETE `chat_rooms` → cascade lewat chat_messages (double-hop); (iii) DELETE `profiles.id`=reactor → baris ilang (reactor_id CASCADE); (iv) SELECT count() rows di chat_messages sebelum-sesudah reaksi = identik (guard 'chat_messages tidak ter-UPDATE'). Plan mesti eksplisit; 'cascade generic' rawan sub-hop yang salah (mis. FK ke chat_room bukan chat_message).

**C14.** [Concurrency `DELETE-then-INSERT ON CONFLICT` — semantik return] Skenario race: dua device user-sama toggle-on paralel. Device-1 DELETE 0 rows → return true (INSERT). Device-2 DELETE 0 rows → INSERT ON CONFLICT DO NOTHING → return true (padahal tidak menciptakan baris baru). Semantik return true pada 'ON CONFLICT DO NOTHING' menyalahi kontrak 'true = reacted (baris tercipta)' — tetap konsisten dgn state akhir, tapi observability rusak. Bukan bug spec (spec §7.3 hardcode return true), namun contract test tidak menyorot ini. Terima atau tambahkan `get diagnostics v_ins = row_count; return v_ins > 0 or exists(...)` variant — tapi itu perubahan spec. Minimal beri catatan test agar tak dianggap regressi kelak.

**C15.** [NativeWind flatten touch-target] UI case #5 pakai `Object.assign({}, ...pill.props.style.filter(Boolean))` untuk cek `minHeight/minWidth >= 44`. Bagus—konsisten dgn pola `SendButton` L110-124. TAPI plan Green-UI §12 mengatakan `<Pressable style={{ minWidth: 44, minHeight: 44 }}>` — inline object, bukan array. Assert `Array.isArray(pill.props.style)` akan false, cabang else `pill.props.style ?? {}` yang aktif. Test harus menerima kedua bentuk (inline object atau array); saat ini formulasi bagus. Namun bila developer menaruh `className='min-h-11 min-w-11'` (tanpa style), NativeWind mungkin mem-flatten ke `minHeight` NUM tapi jest-expo tak konsisten. Sudah terflag di risk plan; catat sebagai 'harus tetap inline numeric'.

**C16.** [Type strictness `database.types.ts`] Plan step §5 menambah entri Row/Insert/Update `chat_message_reactions` dan `reaction_emojis` + RPC `toggle_chat_reaction`. Struktur Relationships di generated types Supabase memakai bentuk spesifik (foreignKeyName, columns, referencedRelation, referencedColumns). Manual entry rawan drift; type-check bisa hijau lokal tapi PostgREST embed di runtime menolak nama relasi. Direkomendasikan menjalankan `supabase gen types typescript` bila memungkinkan, atau menyertakan sub-step verifikasi struktur Relationships mirror milik `chat_message_reads` (pola tetangga terdekat).

**C17.** [Realtime channel] Memory-user note: chat-polish branch menambahkan realtime chat (migration 0052 wajib). Rencana ini bercabang dari branch sebelumnya (max 0044). Bila fitur reaksi mendarat SEBELUM realtime chat merge, aman. Bila SESUDAH, pastikan realtime subscription TIDAK mem-broadcast `chat_message_reactions` INSERT/DELETE lewat channel `chat_messages` (nama channel sama). Tak ada test untuk memastikan ini — hanya risk-note. Tambahkan contract test 'publikasi realtime `chat_message_reactions` netral / channel terpisah' bila realtime sudah landed.

### 10.2 Missing cases (18)

**M1.** [SQL] Contract test eksplisit untuk `reaction_emojis`: seed set aktif tepat = {'👍','✅','👀','🙏'} (4 baris, tak boleh ada ❤️/🎉/emoji lain aktif), policy `reaction_emojis_select` mengizinkan SELECT-authenticated, dan revoke I/U/D dari authenticated+anon.

**M2.** [SQL] Workspace-viewer non-member READ vs WRITE separation: user dengan `can_view_workspace()=true AND is_chat_member(room)=false` (i) berhasil SELECT baris `chat_message_reactions` untuk pesan di room itu (embed), (ii) DIPAKSA raise 'Hanya anggota room yang dapat memberi reaksi.' saat memanggil `toggle_chat_reaction`. Tanpa dua blok ini AC-13 & AC-11 tidak tervalidasi.

**M3.** [SQL] FK-only whitelist test: langsung `INSERT INTO chat_message_reactions (..., emoji='🚀')` dengan emoji yang tidak pernah ada di `reaction_emojis` → gagal `23503` (foreign_key_violation). Independen dari cek `active` di RPC — memastikan whitelist single-source hidup di FK, bukan hanya body RPC.

**M4.** [SQL] Anti-tamper residu POSITIF: setelah user X toggle-on '👍' pada pesan M dan user Y toggle-on '👍' pada M yang sama, assert (a) baris (M,X,'👍') MASIH ADA, (b) baris (M,Y,'👍') tercipta, (c) count=2, (d) Y memanggil `toggle_chat_reaction(M,'👍')` lagi → hanya baris (M,Y,'👍') yang hilang, baris (M,X,'👍') utuh (menghardcode reactor_id=auth.uid()).

**M5.** [SQL] Cascade sub-hop terperinci: (i) DELETE `chat_messages` id=M → baris reaksi (M,*,*) hilang; (ii) DELETE `chat_rooms` id=R (yang berisi M) → reaksi juga hilang (double-hop lewat chat_messages FK); (iii) DELETE `profiles` id=X → baris (*,X,*) hilang; (iv) DELETE `organizations` id=O → reaksi (org_id=O,*) hilang; (v) SELECT sha256(sum) atau row_count `chat_messages` sebelum vs sesudah reaksi ditambah = identik (immutability).

**M6.** [SQL] Netralitas skor operasional (BYTE-IDENTIK): (a) snapshot hasil `calculate_period_scores(p_period_id)` sebelum reaksi, (b) tambah N reaksi lintas user pada pesan dalam periode aktif, (c) recompute → assert setiap baris `period_user_scores` (kolom skor) identik pre/post. Selain guard statik `pg_get_functiondef` — plan hanya menyebutkan guard statik.

**M7.** [SQL] Cross-org p_message: user org A memanggil `toggle_chat_reaction(p_message)` dengan uuid pesan milik org B → RPC harus raise via gate is_chat_member (karena user A pasti bukan member room B), TIDAK menulis ke tabel reaksi org B. Assert 0 baris di `chat_message_reactions` untuk (msg_B, user_A, *). Plan §g menyebut generic; buat blok DO $$ eksplisit.

**M8.** [SQL] Revoke execute anon+public pada RPC: coba `set local role anon; select public.toggle_chat_reaction(...)` → gagal permission denied. Assert authenticated masih bisa (setelah gate is_chat_member). Plan §7.3 mendeklarasikan grant tapi tidak eksplisit menguji.

**M9.** [SQL] Delisted-emoji INSERT ditolak: setelah `update reaction_emojis set active=false where emoji='👀'`, user anggota room memanggil `toggle_chat_reaction(msg,'👀')` pada pesan yang BELUM ia reaksi dengan 👀 → RPC raise 'Emoji tidak didukung.' (jalur INSERT). Sekaligus verifikasi bahwa reaksi 👀 lama (jika ada) tetap bisa di-DELETE via toggle-off. Plan §e/§f overlap tapi belum menuliskan skenario 'active flag di-flip run-time'.

**M10.** [Data] listChatMessages dengan cursor terisi + embed reactions: string `.select()` argumen tetap berisi `reactions:chat_message_reactions(emoji, reactor_id)` bahkan pada halaman >0. Menutup regresi dev-cabut embed di halaman kedua akibat closure/branching.

**M11.** [Hook] Test regressi 'send() tetap invalidate ['chat-rooms']' — plan menambah toggleReaction tapi tidak boleh mencabut invalidasi existing di send(). Setelah refactor, jalankan skenario send lama → keys tetap berisi ['chat-messages',roomId] + ['chat-rooms']. Prevent regressi copy-paste.

**M12.** [Hook] useChatMessages ketika reactions berbentuk `null` (bukan `undefined`): PostgREST kadang mengembalikan `null` untuk embed 1-N kosong (bergantung versi). Assert hook meneruskan tanpa crash — atau tetapkan kontrak `null → [] normalisasi` di data layer + test-nya.

**M13.** [UI] isTogglingReaction=true → tap pill no-op: set `mockIsTogglingReaction = true`, `fireEvent.press(pill)` → `expect(mockToggleReaction).not.toHaveBeenCalled()`. Menutup guard 'if (!currentUserId || isTogglingReaction) return' cabang kedua.

**M14.** [UI] Error alert clears setelah aksi sukses berikutnya: setelah reject pertama menampilkan alert, tap emoji berbeda dan resolve — `screen.queryByRole('alert')` menjadi null. Tanpa test ini, developer bisa lupa `setReactionError(null)` di path sukses dan alert 'macet'.

**M15.** [UI] Snapshot props Pressable pill: `accessibilityLabel` mengandung count digit `2`, bukan `two` atau lokal-format lain. `Reaksi 👍, 2, belum bereaksi` — mengunci copy exact Bahasa Indonesia (spec §FR-RX-4.3 & FR-RX-4.5).

**M16.** [UI] Skeleton path benar-benar tanpa pill: ketika `isLoading:true`, assert (a) `screen.getByLabelText('Memuat…')` truthy, (b) `screen.queryByLabelText(/^Reaksi /)` null, (c) FlatList `chat-list` tidak dirender (`screen.queryByTestId('chat-list')` null). Menggantikan plan §11 yang keliru mem-`findByTestId('chat-list')` di path loading.

**M17.** [UI] Inverted FlatList masih memroses reactions per item: memastikan wiring pill di `renderItem` (bukan di layer luar) — mock messages 2 item dengan reactions berbeda, assert kedua accessibilityLabel muncul dan sesuai per bubble.

**M18.** [Type] `database.types.ts` struktur `Relationships` untuk `chat_message_reactions` valid: setidaknya satu FK menyebut `referencedRelation: 'chat_messages'`, `referencedColumns: ['id']`, sehingga PostgREST embed `reactions:chat_message_reactions(...)` di-resolve tanpa 'Could not find relationship'. Tanpa type test ini, plan bisa memancarkan runtime error walau `tsc` hijau.

---

## 11. Handoff

- **Data structured:** [inbox-chat-reactions-tdd-handoff.json](inbox-chat-reactions-tdd-handoff.json) — full JSON hasil workflow (map / tests / plan / critic). *Catatan: JSON adalah snapshot PRA-revisi; §12 di bawah adalah otoritas final untuk semua item yang direvisi.*
- **Spec kanon:** [inbox-chat-reactions.md](inbox-chat-reactions.md).
- **Ketika V2 dijadwalkan:** semua 35 item critic SUDAH diadjudikasi (§12) — eksekusi mengikuti §4 + §8 (yang telah dikoreksi in-place) + §12.3–12.6 (case tambahan). Sisa prasyarat: nomor migrasi reconcile ke `HEAD_max+1`, token DESIGN sebelum Fase D.

---

## 12. Revisi Post-Critic (2026-07-13) — semua 35 item diadjudikasi

Verifikasi codebase dilakukan sebelum adjudikasi: klaim C1 (skeleton path, `[roomId].tsx` L205-221 + `ui.tsx` L403), C2 (nama fungsi skor via grep migrasi 0013/0020/0039), C3 (mock statis `[roomId].test.tsx` L32), C4 (import `react-native-css/components`), M11 (invalidasi `send()` di `use-inbox.ts` L85-86), C16/M18 (struktur Relationships `chat_message_reads` L695+) — **semua terbukti akurat**. Tidak ada item yang ditolak karena salah faktual.

### 12.1 Tabel disposisi

| Item | Disposisi | Tindakan |
|------|-----------|----------|
| C1 + M16 | **FIX** | UI case #11 dikoreksi in-place di §8.3 (assert `findByLabelText('Memuat…')` + `queryByTestId('chat-list')` null) |
| C2 | **FIX** | Guard skor pakai enumerasi eksplisit nama fungsi nyata — lihat §12.2 |
| C3 | **FIX** | Mock `isTogglingReaction` WAJIB lazy: `let mockIsTogglingReaction = false;` module-scope, dibaca di body factory (`useChatActions: () => ({ ..., isTogglingReaction: mockIsTogglingReaction })`) — pola sama dgn `mockIsSending` existing L28-32 |
| C4 | **FIX** | UI case #6 dikoreksi in-place di §8.3 (assert `flat.borderWidth >= 2` atau child `✓`, JANGAN `props.className`) |
| C5 | **DECISION D13** | Ordering pill = konstanta client-side tetap — lihat §12.7; UI case #10 dikoreksi in-place |
| C6 + M2 | **FIX** | Blok SQL baru (m): workspace-viewer read-vs-write — lihat §12.3 |
| C7 + M1 | **FIX** | Blok SQL baru (l): seed exact-4 + policy + revoke `reaction_emojis` — lihat §12.3 |
| C8 | **ACCEPT-LIMITATION** | Uji "dua panggilan berurutan" = uji idempotensi, BUKAN concurrency riil. Race INSERT-INSERT ditutup `ON CONFLICT DO NOTHING` by construction. Uji dua-sesi paralel (dua koneksi psql + BEGIN/COMMIT interleaved) dicatat sebagai OPSIONAL — tidak menjadi gate DoD |
| C9 + M4 | **FIX** | Blok (i) anti-tamper diperluas dgn residu positif (a)-(d) — lihat §12.3 |
| C10 + M3 | **FIX** | Blok SQL baru (n): FK-only 23503 — lihat §12.3 |
| C11 + M13 | **FIX** | UI case baru #14: pending-guard — lihat §12.6 |
| C12 | **FIX** | `why_red` RX-8 ditambah: fixture literal dgn `reactions` juga MERAH-TIPE di `tsc` sebelum `ChatMessage.reactions?` ditambahkan — type-red adalah bagian sah fase Red |
| C13 + M5 | **FIX** | Blok (h) cascade diperluas sub-hop (i)-(v) — lihat §12.3 |
| C14 | **ACCEPT + CATAT** | Race dua device toggle-on: device kedua `INSERT ON CONFLICT DO NOTHING` (0 baris) tetap return `true` — konsisten dgn state akhir tapi bukan bukti baris tercipta. Sesuai spec §7.3 verbatim; BUKAN bug. Blok (d) diberi komentar test agar perilaku ini tak dianggap regresi kelak. Perubahan semantik return = perubahan spec, di luar mandat revisi ini |
| C15 | **CATAT** | UI case #5 sudah menerima kedua bentuk style (object/array). Green-UI WAJIB tetap inline numeric `{ minWidth: 44, minHeight: 44 }` — jangan diganti class Tailwind (`min-w-11`) karena flatten NativeWind tak deterministik di jest (risk §6 tetap berlaku) |
| C16 + M18 | **FIX** | Step Green-Data ditambah sub-step: struktur `Relationships` `chat_message_reactions` WAJIB mirror pola `chat_message_reads` (`database.types.ts` L695+: `foreignKeyName`/`columns`/`isOneToOne`/`referencedRelation`/`referencedColumns`); jalankan `supabase gen types typescript` bila memungkinkan; verifikasi runtime embed via HTTP contract kecil (lihat §12.5 catatan) |
| C17 | **RISK-NOTE KONDISIONAL** | Branch ini belum punya realtime chat. JIKA fitur reaksi mendarat SESUDAH branch chat-polish (migrasi 0052, realtime) merge: tambahkan contract test "publikasi realtime `chat_message_reactions` tidak lewat channel `chat_messages`". Dicatat di §6 risiko; bukan gate DoD branch ini |
| M6 | **FIX** | Blok (k) netralitas skor diperluas: uji OPERASIONAL `calculate_period_scores` pre/post reaksi byte-identik, bukan hanya guard statik — lihat §12.2 |
| M7 | **FIX** | Blok (g) cross-org dieksplisitkan sebagai blok DO $$ sendiri — lihat §12.3 |
| M8 | **FIX** | Blok SQL baru (o): revoke execute anon/public pada RPC — lihat §12.3 |
| M9 | **FIX** | Blok (e)/(f) delisted diperluas: flip `active=false` run-time → INSERT ditolak, DELETE lama tetap jalan — lihat §12.3 |
| M10 | **FIX** | Data case baru RX-10: embed bertahan di halaman cursor>0 — lihat §12.4 |
| M11 | **FIX** | Hook case baru: regresi `send()` tetap invalidate `['chat-messages',roomId]` + `['chat-rooms']` (terverifikasi `use-inbox.ts` L85-86) — lihat §12.5 |
| M12 | **DECISION D14** | Normalisasi `null → []` di data layer — lihat §12.7; data case baru RX-11 |
| M14 | **FIX** | UI case baru #15: alert clears setelah sukses berikutnya — lihat §12.6 |
| M15 | **FIX** | UI case baru #16: `accessibilityLabel` exact copy dgn digit — lihat §12.6 |
| M17 | **FIX** | UI case baru #17: wiring per-item dua bubble — lihat §12.6 |

### 12.2 Koreksi guard netralitas skor (menggantikan blok (k) lama)

Nama fungsi skor NYATA di repo (grep `create or replace function` di `0013_fase7_people_score.sql`, `0020_fase_sf1_score_formula_editor.sql`, `0039_fase7_cross_org_isolation.sql`):
`calculate_period_scores`, `open_period_snapshot`, `close_period_snapshot`, `override_user_score`, `compute_governance_discipline`, `compute_review_pass_rate`, `aggregate_repeat_metrics_per_user`, `compute_action_plan_completion`, `compute_development_contribution`, `upsert_score_formula_version`, `activate_score_formula_version`, `assign_score_formula`, `create_score_formula_draft`, `update_score_formula_version_weights`, `tg_score_formula_immutable_columns`.

Blok (k) final — dua bagian:

```sql
-- (k1) Guard statik: tak satu pun fungsi skor menyentuh chat_message_reactions
do $$
declare v_bad text;
begin
  select string_agg(proname, ', ') into v_bad
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in (
      'calculate_period_scores','open_period_snapshot','close_period_snapshot',
      'override_user_score','compute_governance_discipline','compute_review_pass_rate',
      'aggregate_repeat_metrics_per_user','compute_action_plan_completion',
      'compute_development_contribution','upsert_score_formula_version',
      'activate_score_formula_version','assign_score_formula',
      'create_score_formula_draft','update_score_formula_version_weights')
    and position('chat_message_reactions' in pg_get_functiondef(oid)) > 0;
  if v_bad is not null then
    raise exception 'FAIL k1: fungsi skor menyentuh chat_message_reactions: %', v_bad;
  end if;
  raise notice 'PASS k1: guard statik netralitas skor';
end $$;
```

```sql
-- (k2) Uji operasional (M6): recompute byte-identik pre/post reaksi
-- (a) jalankan calculate_period_scores(p_period) → snapshot period_user_scores ke temp table
-- (b) tambah N reaksi lintas user pada pesan dalam periode aktif via toggle_chat_reaction
-- (c) jalankan ulang calculate_period_scores(p_period)
-- (d) assert: SELECT count(*) FROM (snapshot EXCEPT SELECT ... FROM period_user_scores) = 0
--     dan sebaliknya (symmetric difference kosong) → skor identik pre/post.
```

Enumerasi eksplisit dipilih atas pattern `ilike` supaya penambahan fungsi skor baru yang tak ter-enumerasi memicu diskusi sadar (reviewer wajib menambah nama ke daftar), bukan lolos diam-diam.

### 12.3 Blok kontrak SQL — final 15 blok

Blok (a)-(k) tetap seperti §4 step 1 dengan ekspansi berikut; blok (l)-(o) baru:

- **(d) diperluas [C8/C14]:** dua toggle-on berurutan user sama → `count(*)=1`, tanpa 23505. KOMENTAR WAJIB di test: "uji idempotensi sekuensial, bukan concurrency dua-sesi; race INSERT-INSERT ditutup ON CONFLICT by construction; return `true` pada INSERT-yang-conflict adalah perilaku spec §7.3, bukan regresi."
- **(e/f) diperluas [M9]:** skenario run-time flip — `update reaction_emojis set active=false where emoji='👀'` → (i) member yang BELUM bereaksi 👀 memanggil toggle → raise 'Emoji tidak didukung.'; (ii) member dengan reaksi 👀 lama memanggil toggle → DELETE sukses return false (delisted tetap removable).
- **(g) dieksplisitkan [M7]:** blok DO $$ sendiri — user org A, `p_message` = pesan org B → RPC raise via `is_chat_member` (A bukan member room B); assert `count(*)=0` di `chat_message_reactions` untuk (msg_B, user_A, *).
- **(h) diperluas [C13/M5] — 5 sub-assert:** (i) DELETE pesan M → reaksi (M,\*,\*) hilang; (ii) DELETE room R → reaksi hilang double-hop via chat_messages; (iii) DELETE profiles X → reaksi (\*,X,\*) hilang; (iv) DELETE organizations O → reaksi org O hilang; (v) row_count `chat_messages` pre/post penambahan reaksi identik (immutability — reaksi tidak meng-UPDATE pesan).
- **(i) diperluas [C9/M4] — residu positif:** X toggle-on 👍 di M; Y toggle-on 👍 di M → assert (a) baris (M,X,👍) MASIH ADA, (b) baris (M,Y,👍) tercipta, (c) `count(*)=2` (bukti PK multi-reactor per emoji, D11), (d) Y toggle lagi → hanya (M,Y,👍) hilang, (M,X,👍) utuh.
- **(k) diganti [C2/M6]:** dua bagian k1+k2 — lihat §12.2.
- **(l) BARU [C7/M1]:** `reaction_emojis` — (i) seed aktif TEPAT `{'👍','✅','👀','🙏'}`: `select count(*)=4 from reaction_emojis where active` DAN `count(*)=0 where active and emoji not in (4 itu)`; (ii) SELECT sebagai authenticated berhasil; (iii) INSERT/UPDATE/DELETE sebagai authenticated gagal (revoke).
- **(m) BARU [C6/M2]:** workspace-viewer non-member (`can_view_workspace()=true AND is_chat_member(room)=false`) — (i) SELECT baris `chat_message_reactions` room itu → berhasil (baris terlihat); (ii) `toggle_chat_reaction` → raise 'Hanya anggota room yang dapat memberi reaksi.', 0 baris tertulis. Dua blok DO $$ terpisah.
- **(n) BARU [C10/M3]:** FK-only whitelist — INSERT langsung (context superuser/definer test) dgn `emoji='🚀'` yang tak ada di `reaction_emojis` → gagal `23503` foreign_key_violation. Independen dari validasi `active` di body RPC.
- **(o) BARU [M8]:** `set local role anon; select toggle_chat_reaction(...)` → permission denied; `set local role authenticated` + member → berhasil. Membuktikan grant/revoke execute RPC hidup, bukan hanya terdeklarasi.

### 12.4 Data layer — 2 case baru (total 11)

**[RX-10] embed reactions bertahan pada halaman cursor>0 (M10)** — Arrange: `makeQueryThenable` capture argumen `.select()`; panggil `listChatMessages(roomId, { cursor: { createdAt: '...', id: '...' } })`. Assert: string select TETAP mengandung `reactions:chat_message_reactions(emoji, reactor_id)` DAN `.eq('chat_room_id', roomId)` tetap dipanggil top-level. Why red: implementasi awal bisa menaruh embed hanya di jalur halaman-pertama karena branching cursor.

**[RX-11] normalisasi `reactions: null → []` (M12/D14)** — Arrange: mock respons row dengan `reactions: null` (perilaku PostgREST versi tertentu utk embed 1-N kosong). Act: `await listChatMessages(...)`. Assert: `messages[0].reactions` adalah `[]` (array kosong), BUKAN `null`/`undefined`. Why red: mapping saat ini tidak menyentuh field reactions; tanpa normalisasi, tipe `ChatReaction[]` bohong saat runtime `null`.

Selain itu **[RX-8] why_red diperluas (C12):** fixture literal dgn field `reactions` juga MERAH-TIPE di `npm run type-check` sebelum `ChatMessage.reactions?: ChatReaction[]` ditambahkan — kegagalan tsc adalah bagian sah fase Red, catat sebagai bukti merah kedua.

### 12.5 Hook layer — 1 case baru (total 12)

**[HK-12] regresi invalidasi send() (M11)** — Arrange: spy `qc.invalidateQueries`; jalankan `send('halo', [])` sukses. Assert: keys hasil spy MENGANDUNG `['chat-messages', roomId]` DAN `['chat-rooms']` (kontrak existing `use-inbox.ts` L85-86 — TIDAK boleh tercabut saat menambah `toggleReactionM`). Why red: baseline hijau hari ini; case ini gagal HANYA jika refactor Green-Hook merusak invalidasi existing — safety net anti copy-paste.

**Catatan C16/M18 (runtime embed):** setelah `database.types.ts` diisi, verifikasi resolusi relasi PostgREST nyata via satu HTTP contract kecil (pola `0045_*_http.mjs` keyset): GET `chat_messages?select=id,reactions:chat_message_reactions(emoji,reactor_id)&limit=1` terhadap Kong lokal → 200, bukan error "Could not find a relationship". `tsc` hijau TIDAK membuktikan relasi runtime.

### 12.6 UI layer — 4 case baru (total 17)

**[UI-14] pending-guard: isTogglingReaction=true → tap no-op (C11/M13)** — Arrange: `mockIsTogglingReaction = true` (module-scope lazy, pola C3); messages 1 item dgn reaksi 👍. Act: `fireEvent.press(pill)`. Assert: `expect(mockToggleReaction).not.toHaveBeenCalled()`. Why red: guard `if (!currentUserId || isTogglingReaction) return` belum ada; tanpa case ini guard bisa dihapus tanpa suite memerah.

**[UI-15] alert clears setelah sukses berikutnya (M14)** — Arrange: `mockToggleReaction.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(true)`; messages dgn 2 emoji berbeda. Act: tap pill-1 → `await screen.findByRole('alert')`; tap pill-2 → `await waitFor(...)`. Assert: `expect(screen.queryByRole('alert')).toBeNull()` setelah sukses. Why red: path sukses belum memanggil `setReactionError(null)` — alert akan "macet" tanpa case ini.

**[UI-16] accessibilityLabel exact copy dgn digit (M15)** — Arrange: messages 1 item, reaksi 👍 oleh 2 reaktor (bukan current user). Assert: `expect(pill.props.accessibilityLabel).toBe('Reaksi 👍, 2, belum bereaksi')` — digit `2` bukan kata, copy exact Bahasa Indonesia (FR-RX-4.3 + FR-RX-4.5). Why red: label belum ada; mengunci format sebelum copy menyimpang.

**[UI-17] wiring per-item: dua bubble reaksi berbeda (M17)** — Arrange: messages 2 item — m1 reaksi 👍×1, m2 reaksi ✅×2. Assert: `findByLabelText('Reaksi 👍, 1, belum bereaksi')` DAN `findByLabelText('Reaksi ✅, 2, belum bereaksi')` keduanya ada (pill dirender di `renderItem` per bubble, bukan sekali di layer luar). Why red: tak ada pill; sekaligus menutup bug agregasi lintas-pesan.

**Revisi mocking (C3):** perluasan mock `useChatActions` WAJIB bentuk lazy:
```ts
let mockIsTogglingReaction = false;
jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({
    send: mockSend, markRead: mockMarkRead, isSending: mockIsSending,
    toggleReaction: (...a: unknown[]) => mockToggleReaction(...a),
    isTogglingReaction: mockIsTogglingReaction,   // ← dibaca lazy per render, BUKAN literal false
  }),
}));
```
Reset `mockIsTogglingReaction = false` di `beforeEach` (sejajar `mockIsSending`/`mockSession` existing).

### 12.7 Keputusan desain revisi

- **D13 — Ordering pill (C5):** aggregator sort by konstanta client-side `REACTION_EMOJI_ORDER = ['👍','✅','👀','🙏'] as const` (cermin `sort_order` seed §7.1 spec); emoji di luar konstanta (penambahan seed masa depan) di-append terurut codepoint. Rasional: urutan embed PostgREST tanpa `order` eksplisit TIDAK dijamin → "first-seen" flaky di kontrak nyata; order server-side by `sort_order` butuh embed 2-level (berat); konstanta client = deterministik, teruji pure-fn, tanpa perubahan query. Konsekuensi: saat seed `reaction_emojis` berubah, konstanta ini ikut diperbarui (tercatat sebagai pasangan sinkron di komentar kode).
- **D14 — Normalisasi null (M12):** `listChatMessages` menormalkan `reactions: null → []` per baris saat mapping (satu nullish-coalescing). Rasional: PostgREST dapat mengembalikan `null` utk embed kosong tergantung versi; tipe `ChatMessage.reactions?: ChatReaction[]` tidak boleh bohong saat runtime; normalisasi di satu titik data-layer lebih murah daripada guard `?? []` tersebar di UI/hook.

### 12.8 Tally final pasca-revisi

| Layer | Sebelum | Sesudah |
|---|---|---|
| SQL contract | 11 blok | **15 blok** (a-k direvisi/diperluas + l, m, n, o baru; k → k1+k2) |
| Data (Jest) | 9 | **11** (+RX-10, RX-11) |
| Hook (Jest) | 11 | **12** (+HK-12) |
| UI (Jest RNTL) | 13 | **17** (+UI-14..17; #6/#10/#11 dikoreksi in-place) |
| **Total Jest** | 33 | **40** |

DoD §7 diperbarui menjadi: SQL contract **15/15 PASS**; delta Jest **+40**; guard skor = enumerasi eksplisit §12.2; HTTP contract mini utk resolusi embed (§12.5). Verdict pasca-revisi: **siap** — tidak ada item critic yang tersisa tanpa disposisi.
