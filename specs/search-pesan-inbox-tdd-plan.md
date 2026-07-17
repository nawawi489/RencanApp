# Rencana TDD — Search Pesan Inbox (Chat FTS V1)

Spec: `specs/search-pesan-inbox.md` — RPC baru `public.search_chat_messages`, wrapper client di `mobile/src/lib/inbox.ts`, hook `useSearchMessages`, dua-section UI di tab Inbox, deep-link highlight di screen `[roomId]`.

## Ringkasan fitur
- Data: RPC SECURITY DEFINER STABLE search chat messages dengan gate `is_chat_member OR (can_view_workspace AND can_access_initiative)`, confidential-aware, LIKE-escape, snippet cap, cursor pagination.
- Wrapper: `searchChatMessages(params)` thin caller (server = sumber kebenaran).
- Hook: `useSearchMessages` — debounce 250 ms, `enabled` guard ≥2 char client, staleTime 15 s, realtime invalidation pada DELETE `chat_room_members`.
- UI Inbox: dua section (Initiative existing + Pesan baru), sub-group per room, empty state identik untuk no-match & silent-filter, banner PGRST202 degrade, deep-link `/inbox/{roomId}?highlight={id}`.
- Screen `[roomId]`: baca `?highlight`, sorot pesan; tampered → silently ignore.

## Daftar file test
| Layer | File | Kasus |
|---|---|---|
| data | `mobile/src/lib/__tests__/inbox.test.ts` (extend) | 7 |
| hooks | `mobile/src/hooks/__tests__/use-search-messages.test.tsx` (baru) | 7 |
| ui inbox | `mobile/src/app/(app)/(tabs)/__tests__/inbox.search-messages.test.tsx` (baru) | 10 |
| ui room | `mobile/src/app/(app)/inbox/__tests__/roomId.search-highlight.test.tsx` (baru) | 2 |
| db | `supabase/tests/0044_search_chat_messages_contract.sql` (baru) | kontrak lengkap (gate, escape, pagination, snippet, append-only) |

## Urutan langkah
1. **RED** — extend `inbox.test.ts` (7 kasus wrapper).
2. **GREEN** — implementasi `searchChatMessages` di `mobile/src/lib/inbox.ts` (cast `as never` sementara).
3. **RED** — buat `use-search-messages.test.tsx` (7 kasus: guard, debounce, queryKey, realtime invalidate, cleanup, passthrough, error).
4. **GREEN** — implementasi `mobile/src/hooks/use-search-messages.ts` (debounce state + useQuery + subscribe channel + removeChannel cleanup + isRpcMissing derivation).
5. **RED** — buat `inbox.search-messages.test.tsx` (10 kasus: placeholder, idle, hint 1 char, dua section+snippet+sub-group, empty identik+Hapus pencarian, read-only row, tap→router.push, skeleton vs spinner, banner PGRST202, banner network error+Coba lagi).
6. **GREEN** — refactor `mobile/src/app/(app)/(tabs)/inbox.tsx` konsumsi hook, render section Pesan, banner degrade, deep-link push.
7. **RED** — buat `roomId.search-highlight.test.tsx` (2 kasus deep-link).
8. **GREEN** — patch `mobile/src/app/(app)/inbox/[roomId].tsx` untuk baca `highlight`, tandai row, silently ignore tampered.
9. **RED** — tulis `supabase/tests/0044_search_chat_messages_contract.sql` + skeleton migrasi `0044_fr_chat_fts.sql` (index + RPC stub).
10. **GREEN** — implementasi penuh RPC + `pg_trgm` + 2 indeks + REVOKE + regen `database.types.ts` + hapus cast `as never`.
11. **REFACTOR** — ekstrak `MessageHitRow` + `MessageSection`, konstanta copy, jalankan full `npm test` + `tsc --noEmit`, update `wiki/log.md`.

## Strategi mocking
### Layer data
```ts
jest.mock('../supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn(), auth: { getUser: jest.fn() } },
}));
const { supabase } = require('../supabase');
const mockRpc = supabase.rpc as jest.Mock;
beforeEach(() => { mockRpc.mockReset().mockResolvedValue({ data: [], error: null }); });
```
Pola persis `sendChatMessage` di `inbox.test.ts` L81-107. Tidak butuh env, tidak butuh native.

### Layer hooks
- `jest.mock('@/lib/inbox', () => ({ searchChatMessages: jest.fn() }))`.
- `jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))` — hindari mock supabase.auth (lebih ringan).
- Mock supabase channel dengan handler-capture:
```ts
const handlers: Array<(p:any)=>void> = [];
const mockRemoveChannel = jest.fn();
const channelObj: any = {
  on: jest.fn((_e,_f,cb) => { handlers.push(cb); return channelObj; }),
  subscribe: jest.fn(() => channelObj),
};
jest.mock('@/lib/supabase', () => ({
  supabase: { channel: jest.fn(() => channelObj), removeChannel: mockRemoveChannel },
}));
beforeEach(() => { handlers.length = 0; mockRemoveChannel.mockReset(); });
```
- Fake timers modern; wrapper `QueryClient({ defaultOptions:{ queries:{ retry:false, gcTime:0 } } })`.
- Untuk invalidate: `jest.spyOn(qc,'invalidateQueries')` sebelum trigger `handlers[0]({eventType:'DELETE',old:{user_id:'u1'}})`.

### Layer UI
- Mock `useInboxRooms`, `useChatMessages`, hook baru `useSearchMessages`.
- Mock `expo-router` (`useRouter`, `useLocalSearchParams`, `Link` no-op).
- Mock `useAuth` sederhana.
- Snapshots dihindari; assertion pakai findByText/queryByLabelText/testID untuk highlight & banner.

### Layer DB
Bukan Jest — `supabase/tests/*.sql` dengan `set_config('request.jwt.claims',…)` untuk simulasi user; jalankan via CI Supabase.

## Risiko utama
1. Fake timers vs internal React Query — bungkus advance dgn `act`, awali `await waitFor` setelahnya.
2. `chat_messages` append-only wajib dipertahankan — RPC pure SELECT + STABLE; kontrak test hash tabel sebelum/sesudah.
3. Nomor migrasi 0044 harus divalidasi (spec menyebut 0053 tapi last migration = 0043) — cek Glob sebelum menulis.
4. LIKE-escape (%, _, \\) rawan bug plpgsql literal — kontrak SQL memisah per karakter.
5. Silent-filter (confidential/cross-org) UI harus identik dengan no-match — kasus UI kasus 5 mengunci.
6. Realtime channel leak — cleanup unmount wajib; kasus hooks kasus 5.
7. Deep-link highlight untuk pesan yang belum ter-load di list saat itu — MVP silently ignore; iterasi berikut: jump-to-message loader.
8. Regen `database.types.ts` menabrak perubahan manual — commit terpisah step 10.
9. Perubahan placeholder input inbox bisa memecahkan test lama yang match string 'Cari Initiative' — jalankan full suite di step 11.
10. Copy Indonesia belum di-i18n — konstanta lokal ok untuk MVP; catat sebagai debt.