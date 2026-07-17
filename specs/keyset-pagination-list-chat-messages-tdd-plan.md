# Rencana TDD — Keyset Pagination `listChatMessages` + Inverted FlatList

Spec: `specs/keyset-pagination-list-chat-messages.md` (§9 urutan red-green, §10 revisi owner infinite-scroll-up).
Branch context: baseline Jest 1168/1168 hijau, tsc/lint bersih. Migrasi maks di branch = 0044. Contract SQL baru = 0045.

---

## 1. Ringkasan fitur

- Ganti offset `.range()` pada `listChatMessages` dengan cursor keyset `(created_at, id)` — client `.from()` tetap dipertahankan (bukan RPC), otorisasi tetap RLS-driven.
- Cursor didekomposisi ke `.or('created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)')` di atas `.eq('chat_room_id')` **top-level AND** (FR-KP10 — hindari kebocoran lintas-room untuk pengguna `can_view_workspace`).
- Ordering canonical: `.order('created_at', desc).order('id', desc)`; `.limit(CHAT_PAGE_SIZE)` menggantikan `.range()`.
- Reuse `idx_chat_messages_org_room_created` (0044:47) — **tanpa migrasi baru**.
- `useChatMessages`: `initialPageParam=undefined`, `queryFn` menerima cursor object, `getNextPageParam` men-derive `{createdAt,id}` dari last item bila page penuh. Hook expose `isFetchingNextPage` (baru) menggantikan kebutuhan tombol.
- Screen `[roomId].tsx`: `ScrollView → inverted FlatList` (owner §10). Hapus tombol "Muat pesan lama"; ganti dengan `onEndReached → loadOlder`, `ListFooterComponent` indicator saat `isFetchingNextPage`. Data ke FlatList tetap desc (newest-first) — inverted yang membalik visual, JANGAN `[...].reverse()` ganda.
- OUT OF SCOPE: realtime, optimistic send, write-path, evidence/MBR/audit.

Baseline invarian:
- Read-only, client `.from()` (bukan RPC).
- `.eq('chat_room_id')` top-level; cursor hanya via `.or()` di atasnya.
- Data layer newest-first (desc); hook = derivator cursor.
- Reuse index existing.

---

## 2. File test yang tersentuh

| Layer | File | Aksi |
|---|---|---|
| data unit | `mobile/src/lib/__tests__/inbox.test.ts` | rewrite [4]/[5]; tambah [5b]-[5f]; fix harness `makeQueryThenable` (tambah `or`, akumulasi calls ke array) |
| hooks unit | `mobile/src/hooks/__tests__/use-inbox.test.tsx` | rewrite [2]/[8]; tambah "seam refetch-all" & "isFetchingNextPage exposed" |
| ui unit (RNTL) | `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx` | hapus/replace [E13]; tambah [E-KP-U1..U11] |
| ui regresi | `mobile/src/app/(app)/inbox/__tests__/roomId.search-highlight.test.tsx` | run-only (tak diubah) |
| DB contract | `supabase/tests/0045_keyset_list_chat_messages_contract.sql` (BARU) | parity RLS non-member/lintas-org, presedens `.eq/.or`, round-trip timestamp mikrodetik + offset `+` |
| spec | `specs/inbox-chat-ui.md` | FR-IN2.6 / AC-IN2.9 → infinite-scroll (owner §10) — update saat ship, bukan pre-code |

---

## 3. Strategi mocking per layer

### 3.1 Data layer (`inbox.test.ts`)
- `jest.mock('../supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }))` — hindari import chain `AsyncStorage`/`AppState`. Preseden: `cards.test.ts`.
- **Harness fix** `makeQueryThenable`:
  - Tambah method `'or'` ke daftar chainable.
  - Ganti `calls[m] = args` menjadi `calls[m] = [...(calls[m] ?? []), args]` (array of arrays). `.order` dipanggil 2x pada implementasi baru — assertion 2-call mustahil tanpa fix ini.
- Assertion argumen `.or()`: cek literal string (`toMatch` regex) — memaksa encoding cursor timestamp apa-adanya (mikrodetik + offset `+`).
- Parity RLS tidak dibuktikan di sini (mock builder meniadakan RLS).

### 3.2 Hook (`use-inbox.test.tsx`)
- `jest.mock('@/lib/inbox', () => ({ CHAT_PAGE_SIZE: 30, listChatMessages: jest.fn(), sendChatMessage: jest.fn(), markChatMessagesRead: jest.fn() }))`.
- Wrapper: `QueryClient({ defaultOptions:{ queries:{ retry:false } } })` + `QueryClientProvider`. **Tidak perlu** `AuthProvider` (hook tak konsumsi session).
- `renderHook` dari `@testing-library/react-native`.
- Seam refetch-all pakai `qc.invalidateQueries({ queryKey:['chat-messages',roomId] })` + `waitFor(() => expect(mock).toHaveBeenCalledTimes(3))`.
- Skenario incremental: `mockImplementation((_id, cursor) => cursor === undefined ? batch30 : [older])`.

### 3.3 UI screen (`[roomId].test.tsx`)
- Mock `@/hooks/use-inbox` full-shape: `messages, isLoading, isError, refetch, loadOlder, hasMore, isFetchingNextPage`.
- Mock `expo-router`: `useLocalSearchParams` mutable per test (pattern eksisting).
- Query FlatList via `getByTestId('chat-list')` → introspeksi props (`inverted`, `data`, `onEndReached`, `keyExtractor`). Trigger `onEndReached` via `await act(async () => { list.props.onEndReached?.(); })`.
- Assertion indicator via `findByLabelText(/Memuat pesan lama/i)` (kontrak a11y baru).
- Realtime channel/subscribe TIDAK di-mock — screen tak menambah subscription baru.

### 3.4 DB contract (`0045_*.sql`)
- Pola `do $$ … raise notice 'PASS…' / raise exception 'FAIL: …' end $$`.
- Setup JWT per user: `set_config('request.jwt.claims', json_build_object('sub', <uuid>)::text, true)`.
- Seed multi-org multi-user (member vs non-member), lalu jalankan query keyset yang setara dengan yang di-emit client, verifikasi:
  - Non-member 0 rows (RLS).
  - Cross-org `p_before_id` tak "kebocor" karena tie-break id.
  - Presedens: `.eq` outside vs cursor `.or()` — hasil identik dengan tuple `(created_at,id) < (…)`.
  - Round-trip `2026-06-24T01:00:00.123456+00:00` lossless (mikrodetik & offset).
- Cleanup by body prefix (mengikuti 0044 contract).

---

## 4. Urutan Red → Green → Refactor

### FASE A — Data layer (`inbox.ts`)

| # | Type | Test | Deskripsi | Files |
|---|---|---|---|---|
| 1 | red | harness fix | Rewrite `makeQueryThenable`: tambah `'or'`, akumulasi calls ke array. Test lain lama tetap hijau (assertion sekarang `.toEqual([[...]])`). | `mobile/src/lib/__tests__/inbox.test.ts` |
| 2 | red | [4-rev] | Tulis test page pertama (cursor undefined) → `.limit(30)`, `.eq` top-level, `.order` 2×, tanpa `.or`. | `mobile/src/lib/__tests__/inbox.test.ts` |
| 3 | red | [5-rev] | Test page N dengan cursor → `.or('created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)')`, `.eq` tetap top-level. | `mobile/src/lib/__tests__/inbox.test.ts` |
| 4 | red | [5b] | Round-trip encoding mikrodetik + offset `+` di argumen `.or`. | idem |
| 5 | red | [5c] | Guard cursor cacat (`createdAt=undefined`) → reject Promise. | idem |
| 6 | red | [5d] | Guard roomId kosong tetap short-circuit walau cursor valid. | idem |
| 7 | red | [5e] | Batch 30 diteruskan apa-adanya (no wrap `{rows,hasMore}`). | idem |
| 8 | red | [5f] | Error propagation di jalur cursor. | idem |
| 9 | **green** | AC-1/2/3/12/16/17 | Implementasi `listChatMessages(roomId, cursor?: {createdAt,id})`: `.eq('chat_room_id',…)` → `.or(...)` (jika cursor) → `.order('created_at',{desc})` → `.order('id',{desc})` → `.limit(CHAT_PAGE_SIZE)`. Guard: `if(!roomId) return []`; `if(cursor && (!cursor.createdAt || !cursor.id)) throw new TypeError(...)`. | `mobile/src/lib/inbox.ts` |
| 10 | refactor | — | Ekstraksi helper `buildKeysetOr(cursor)` (private, tanpa export) untuk clarity; run all tests. | `mobile/src/lib/inbox.ts` |

### FASE B — Hook (`use-inbox.ts`)

| # | Type | Test | Deskripsi | Files |
|---|---|---|---|---|
| 11 | red | [2-rewrite] | Assert `mockListChatMessages` dipanggil dgn `('r1', undefined)` di page pertama. | `mobile/src/hooks/__tests__/use-inbox.test.tsx` |
| 12 | red | [8-rewrite] | AC-4 pemicu inkremental: call kedua = `{createdAt,id}` dari `lastPage.at(-1)`. Merge desc. | idem |
| 13 | red | seam refetch-all | AC-5: invalidate → call ke-3 kembali `('r1', undefined)`. Membuktikan `getNextPageParam` re-derive murni & cache tak bocor. | idem |
| 14 | red | isFetchingNextPage | Kontrak output baru; test dgn page 2 never-resolving. | idem |
| 15 | **green** | AC-6/13/9 | Ubah `initialPageParam: undefined`, `queryFn: ({pageParam}) => listChatMessages(roomId, pageParam as ChatCursor \| undefined)`, `getNextPageParam: (last) => last.length===CHAT_PAGE_SIZE ? {createdAt: last.at(-1)!.created_at, id: last.at(-1)!.id} : undefined`. Return tambahkan `isFetchingNextPage`. | `mobile/src/hooks/use-inbox.ts` |
| 16 | refactor | — | Extract type `ChatCursor = { createdAt: string; id: string }` ke `inbox.ts`, re-export dari hook bila perlu. | `mobile/src/lib/inbox.ts`, `mobile/src/hooks/use-inbox.ts` |

### FASE C — DB contract (`0045_*.sql`)

| # | Type | Test | Deskripsi | Files |
|---|---|---|---|---|
| 17 | red+green (SQL) | AC-10/11/12/17 | Buat contract test baru; jalankan lewat `docker exec supabase_db_supabase psql -f …` (per memory `supabase-local-vs-mcp-gotcha`) — harapkan `PASS` untuk 4 blok. Karena semantik sudah terkunci oleh index existing + RLS existing, harusnya lulus setelah data layer benar. | `supabase/tests/0045_keyset_list_chat_messages_contract.sql` |

Catatan: contract test menegakkan invarian server-side (parity RLS, presedens `.eq/.or`, round-trip timestamp). Jika salah satu gagal, kembali ke Fase A (encoding `.or`).

### FASE D — Screen (`[roomId].tsx`)

| # | Type | Test | Deskripsi | Files |
|---|---|---|---|---|
| 18 | red | remove [E13] | Hapus test lama "Muat pesan lama" (menjadi kontrak terbalik di U3/U11). | `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx` |
| 19 | red | [E-KP-U1] | `testID='chat-list'`, `inverted===true`. | idem |
| 20 | red | [E-KP-U2] | `data[0]` = newest, `data.at(-1)` = oldest (no reverse). | idem |
| 21 | red | [E-KP-U3] | Tombol "Muat pesan lama" hilang meski `hasMore=true`. | idem |
| 22 | red | [E-KP-U4] | `onEndReached()` → `loadOlder` dipanggil. | idem |
| 23 | red | [E-KP-U5] | `hasMore=false` → `onEndReached` no-op. | idem |
| 24 | red | [E-KP-U6] | `isFetchingNextPage=true` → `onEndReached` no-op. | idem |
| 25 | red | [E-KP-U7] | Indicator `Memuat pesan lama…` muncul saat `isFetchingNextPage=true`. | idem |
| 26 | red | [E-KP-U8] | Indicator tidak muncul saat `false`. | idem |
| 27 | red | [E-KP-U9] | Divider tetap 1 chip/hari saat data desc + inverted. | idem |
| 28 | red | [E-KP-U10] | `keyExtractor(item) === item.id`. | idem |
| 29 | red | [E-KP-U11] | Tidak ada role button "Muat pesan lama". | idem |
| 30 | **green** | AC-21/22, revisi AC-15 | Ganti `ScrollView` messages → `FlatList` `inverted` dgn: `data={messages}` (desc apa-adanya), `keyExtractor={m=>m.id}`, `renderItem` reuse rendering bubble+divider existing, `onEndReached={hasMore && !isFetchingNextPage ? loadOlder : undefined}`, `onEndReachedThreshold={0.3}`, `ListFooterComponent={isFetchingNextPage ? <Indicator accessibilityLabel="Memuat pesan lama"/> : null}`. Hapus tombol + `[...messages].reverse()`. Hitung ulang divider agar iterasi desc menyisipkan chip di boundary hari yang benar (chip disisipkan **sebelum** item pertama setiap hari saat iterasi desc → visual muncul di atas grup harian ketika inverted). | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| 31 | refactor | — | Ekstraksi `buildTimelineItems(messages)` (murni, unit-testable) yang menghasilkan `Array<{type:'divider',key,label} \| {type:'message',key,msg}>` — pindahkan algoritma divider keluar dari JSX. Sanity: run `roomId.search-highlight.test.tsx` (harus tetap hijau — a11y label bubble tak berubah). | `mobile/src/app/(app)/inbox/[roomId].tsx` |
| 32 | refactor | — | Evaluasi wrapper `components/screen.tsx` (ScrollView nesting FlatList) → jika RN warning muncul di jest/preview, isolate: gunakan `Screen`-variant tanpa ScrollView untuk chat room, atau `nestedScrollEnabled`. Hanya bila WARNING nyata; jangan spekulatif. | `mobile/src/app/(app)/inbox/[roomId].tsx` (mungkin `mobile/src/components/screen.tsx`) |

### FASE E — Ship prep

| # | Type | Deskripsi | Files |
|---|---|---|---|
| 33 | doc | Update spec inbox chat UI: FR-IN2.6/AC-IN2.9 → infinite-scroll (owner §10). | `specs/inbox-chat-ui.md` |
| 34 | verify | Jalankan full: `npm test` (target 1168+delta hijau), `npx tsc --noEmit`, `npx expo lint`, contract SQL 0045. | — |

---

## 5. Risiko & mitigasi

- **Harness `makeQueryThenable`** overwrite `calls[m]` — mustahil assert `.order` 2×. Mitigasi: fix harness sebagai step #1 sebelum test data-layer lain.
- **Encoding `+` di `.or()`** — grammar filter PostgREST bisa mem-parse `+` sebagai spasi (URL-encoded). Mitigasi: unit test [5b] menegakkan literal, dan contract test 0045 membuktikan round-trip end-to-end. Bila server menolak, quote nilai atau escape `+` → `%2B` di helper.
- **`.eq` dilipat ke dalam `.or`** — footgun umum. Mitigasi: assertion `calls.eq` harus ada dan `orArg` tidak mengandung `chat_room_id.eq`. Contract test menegakkan tak ada baris lintas-room.
- **Data desc + FlatList inverted** — godaan `[...].reverse()` ganda. Mitigasi: test [E-KP-U2] mengunci `data[0]=newest`.
- **Divider algoritma** — perubahan dari `reverse().reduce()` ke iterasi desc bisa menggeser posisi chip. Mitigasi: [E-KP-U9] + refactor ke `buildTimelineItems` (pure function).
- **Nested VirtualizedList di ScrollView** (`components/screen.tsx`) → RN warning + kehilangan virtualization. Mitigasi: step #32 refactor kondisional; test lama tetap dijaga tidak snapshot warning.
- **Baseline pergerakan branch**: memory menyebut migrasi 0052 (branch chat FTS), tapi task ini di branch dgn max 0044. Contract file 0045. Koordinasikan bila merge branch lain sebelum ship.
- **Call-site listChatMessages di luar hook** — audit: hanya `use-inbox.ts:48`. Signature change tidak memicu TS error lain, tapi verifikasi via `tsc --noEmit`.
- **`isFetchingNextPage` sebagai output baru** — konsumen (screen) sudah destrukturisasi kontrak lama; tambahan field aman (bukan breaking).
- **Regresi `[roomId].test.tsx` E0–E12** — mock hook full-shape harus mencakup `isFetchingNextPage:false` di semua test lama; jika tidak, screen yang membaca flag akan crash. Mitigasi: helper factory `makeChatMessagesState(overrides)` di test.
- **RQ v5 `initialPageParam=undefined`** — pastikan `queryFn` men-treat `pageParam === undefined` sebagai "page pertama". `as ChatCursor | undefined` cast eksplisit.
- **Realtime OUT OF SCOPE** — jangan tergoda menambah `supabase.channel(...)` di hook; test [seam refetch-all] memang menegakkan refresh via invalidation, bukan channel.

---

## 6. Definition of Done

- [ ] `mobile/src/lib/__tests__/inbox.test.ts`: harness diperluas; [4-rev]/[5-rev]/[5b]/[5c]/[5d]/[5e]/[5f] hijau; test [3] tetap hijau.
- [ ] `mobile/src/hooks/__tests__/use-inbox.test.tsx`: [2-rewrite]/[8-rewrite]/seam-refetch/isFetchingNextPage hijau; test lama tetap hijau.
- [ ] `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx`: [E-KP-U1..U11] hijau; [E13] lama dihapus; E0–E12 lain hijau.
- [ ] `mobile/src/app/(app)/inbox/__tests__/roomId.search-highlight.test.tsx`: hijau (regresi).
- [ ] `supabase/tests/0045_keyset_list_chat_messages_contract.sql`: 4 blok `PASS`.
- [ ] `npm test`: 1168 + delta ≥ jumlah test baru; 0 gagal.
- [ ] `npx tsc --noEmit`: bersih.
- [ ] `npx expo lint`: bersih.
- [ ] `specs/inbox-chat-ui.md`: FR-IN2.6/AC-IN2.9 diperbarui.
- [ ] Manual sanity `preview_start` (web): scroll ke atas memicu loadOlder, indicator muncul, tak ada duplikat/flicker.

---

## 7. Revisi post-Critic (mengikat)

Hasil audit critic 2026-07-13 (`perlu-perbaikan`): 14 missing cases + 10 concerns. Enam yang **mengubah rencana** difold ke sini; sisanya sudah tertutup Fase A–D atau menjadi catatan implementasi. Ikuti §7 di atas isi §3–§6 bila konflik.

### 7.1 CRITICAL — AC-17 (encoding `.or()` timestamp) diperkuat: pisah 2 lapis

Critic benar bahwa **`psql` tidak menyentuh parser DSL filter PostgREST**. Kontrak SQL 0045 hanya membuktikan **tuple semantics**; ia TIDAK membuktikan bahwa string `.or('created_at.lt.2026-…+00:00,…')` di-terima PostgREST tanpa error 400. Risiko #1 spec (`+` di offset diparse sebagai spasi) justru paling lemah diuji.

**Aksi:**
- **Split AC-17** menjadi:
  - **AC-17a — tuple semantics** (SQL, `psql`): dua baris berjarak 1 mikrodetik di batas tidak ter-skip/dup. Tetap di 0045.
  - **AC-17b — filter parseable end-to-end** (integrasi HTTP): panggilan `.from().or(...)` ke Kong lokal (`http://127.0.0.1:54321`) TIDAK error 400 dan mengembalikan row set yang sama dengan tuple SQL.
- **Tambah step #17b (setelah #17)** di Fase C: buat `supabase/tests/0045_keyset_list_chat_messages_http.test.ts` — bukan mock, pakai `@supabase/supabase-js` real client ke Kong lokal, seed via SQL, jalankan `.or()` dengan timestamp offset `+00:00` + presisi mikrodetik, assert (a) `error === null`, (b) rows cocok dengan hasil query SQL setara. Rekomendasi encoder default: **round-trip apa-adanya**; jika HTTP menolak → helper `encodeKeysetOr(cursor)` yang `encodeURIComponent(cursor.createdAt)` (di-lock oleh test ini).
- **Fallback jika Kong lokal belum tersedia di runner**: batasi ke local dev machine (skip via `describe.skipIf(!process.env.SUPABASE_LOCAL_URL)`), tapi WAJIB dijalankan sebelum PR. Jangan gate di CI silent — log skip di ringkasan `npm test`.

### 7.2 CRITICAL — Seam refetch-all: assert 4 panggilan, bukan 3

Critic benar. React Query v5 default `refetchPage: 'all'` → `invalidateQueries` sesudah page 0+1 termuat memicu **dua** refetch berurutan (page 0 undefined, lalu page 1 dengan cursor **baru** yang dihitung ulang dari page 0 hasil-refetch). Assertion `toHaveBeenCalledTimes(3)` di step #13 akan flaky.

**Aksi:** ganti step #13:
- Skenario: `mockImplementation` yang mengembalikan batch 30 di call ke-1, `[older]` di call ke-2, batch 30 (baris paling atas berubah) di call ke-3, `[older]` di call ke-4.
- Assert **`toHaveBeenCalledTimes(4)`**.
- Assert call#3 args = `('r1', undefined)` DAN call#4 args = `('r1', {createdAt, id})` di mana `createdAt/id` = last item batch call#3 (bukan call#1) → membuktikan re-derive murni.

### 7.3 SET ROLE authenticated wajib eksplisit di 0045

`set_config('request.jwt.claims', …)` saja **tidak** memicu RLS bila session bertindak sebagai `postgres`/superuser (RLS di-bypass). Semua blok DB-1..DB-4 bisa PASS palsu.

**Aksi:** header contract SQL 0045 WAJIB menyertakan `set local role authenticated;` di setiap blok `do $$ …`. Verifikasi pola persis dari `supabase/tests/0044_search_chat_messages_contract.sql` sebelum menulis.

### 7.4 Parity RLS: pisahkan matriks 3 skenario, bukan gabung "non-member"

Critic benar. RLS `chat_messages_select` = `org=current AND (is_chat_member OR can_view_workspace)` — parity WAJIB uji **3** kasus terpisah, bukan digabung:
- (a) member same-org → boleh.
- (b) non-member `can_view_workspace` same-org → boleh (validasi cursor tidak bocor room A dari view-wide reader saat query room B).
- (c) non-member cross-org → 0 baris.

**Aksi:** step #17 (blok DB) tambah kasus (b) eksplisit; test [E-KP-DB2]/[DB3] tidak boleh menggabung (b) dan (c).

### 7.5 [5c] "guard cursor cacat" DI-DROP dari Fase A

Critic tepat: spec §4.2 tidak memuat cabang throw — cursor selalu wholly-absent (page 0) atau wholly-present (dari baris nyata). Menambah runtime type-check adalah over-engineering di luar spec.

**Aksi:** hapus step #5 (test [5c]) dari Fase A dan bagian implementasi guard `throw new TypeError` di step #9. Cursor cacat = kontrak internal broken; TypeScript sudah menegakkan bentuknya. Bila ingin defensive, batasi ke `if (__DEV__ && cursor && (!cursor.createdAt || !cursor.id)) console.warn(...)` — tanpa throw dan tanpa test.

### 7.6 [5f] jangan hardcode kode error Postgres

Kode `42883` spesifik server/versi → rapuh. **Aksi:** step #8 (test [5f]) assert error di-rethrow apa adanya via `toBe(originalErrorObject)` (identity), TIDAK mengunci `.code`/`.message`.

### 7.7 Pre-check ScrollView-nested-FlatList SEKALI, bukan spekulatif

Step #32 kondisional bisa memicu perubahan wrapper `components/screen.tsx` di tengah eksekusi. **Aksi:** sisipkan **step 17.5 (pre-check)** sebelum Fase D: `Read mobile/src/components/screen.tsx`; jika ia membungkus konten dengan `ScrollView`, keputusan diambil di depan — opsi A: parameterkan `<Screen scrollable={false}>`, opsi B: bypass wrapper untuk `[roomId].tsx`. Kunci sebelum menulis test UI, hindari refactor menjalar di akhir siklus.

### 7.8 Regresi test [E0]-[E12]: satu step diskrit untuk migrasi mockReturnValue

Critic benar bahwa `isFetchingNextPage` sebagai output baru bisa membuat 13 test lama flaky bila `mockUseChatMessages.mockReturnValue({...})` inline tidak menyertakannya.

**Aksi:** tambah **step #18-pre** eksplisit di Fase D: audit semua `mockUseChatMessages.mockReturnValue(...)` di `[roomId].test.tsx`; ganti panggilan inline dengan `makeChatMessagesState(overrides)` factory yang default `isFetchingNextPage:false`. Satu commit khusus (bukan diselundup ke green step).

### 7.9 Spec §4.3 (kontrak output hook) perlu diperluas eksplisit

`isFetchingNextPage` = field baru pada return hook. Spec §4.3 hanya menyebutnya di §3.5 FR-KP16 tanpa merapikan kontrak output.

**Aksi:** saat step #33 (update `specs/inbox-chat-ui.md`), sekalian **update `specs/keyset-pagination-list-chat-messages.md` §4.3** — tambah `isFetchingNextPage: boolean` ke daftar output hook. Bukan pre-code; ship-doc.

### 7.10 Cek konflik nomor migrasi sebelum menulis 0045

Critic tepat. **Aksi:** sebelum `Write supabase/tests/0045_*.sql`, jalankan `ls supabase/migrations supabase/tests | sort | tail` dan verifikasi tak ada `0045_*` yang muncul (mis. bila branch chat-realtime merge duluan). Bila konflik, geser ke nomor berikutnya + update semua referensi di plan/spec.

### 7.11 Ringkasan step order pasca-revisi

Urutan efektif eksekusi:
1. Fase A step 1 → 2 → 3 → 4 → **[5 DI-DROP]** → 6 → 7 → **8 (identity assert)** → 9 → 10.
2. Fase B step 11 → 12 → **13 (assert 4 calls)** → 14 → 15 → 16.
3. Fase C step 17 (SQL, dgn `set local role authenticated`, matriks parity 3 kasus) → **17b (HTTP, AC-17b baru)**.
4. **17.5 (pre-check screen.tsx wrapper).**
5. **18-pre (migrasi mockReturnValue ke factory).**
6. Fase D step 18–32 seperti semula.
7. Fase E step 33 (update DUA spec: inbox-chat-ui.md + §4.3 spec keyset).

Semua concern lain (test flakiness FlatList mock, wrapper factory shape, dsb.) tercakup di §3 Strategi Mocking + §5 Risiko yang sudah ada; tak butuh perubahan struktural.
