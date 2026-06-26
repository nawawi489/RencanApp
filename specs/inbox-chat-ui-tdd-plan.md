# Rencana TDD — Inbox & Chat Initiative UI V1.8.1

> Sumber kebenaran: `specs/inbox-chat-ui.md` (FINAL) + handoff `specs/inbox-chat-ui-tdd-handoff.json`.
> Keputusan owner 2026-06-26: FR-DATA.1 MASUK (migrasi `0018`). FR-DATA.2 (can_send) & semua fitur V2 DEFER.

## 1. Ringkasan fitur

Tiga area presentasi di atas backend Fase 3 yang stabil (migrasi `0008_fase3_collab.sql`):

- **UI-S-IN1 (Inbox list, `inbox.tsx`)** — Avatar (seed=room.id) + nama, preview `'{author}: {body}'` dengan fallback timestamp saat `last_message_body` null, badge unread clamp `'99+ baru'`, search by-nama client-side (anti-bypass — TANPA call jaringan baru), chip `Semua`/`Belum dibaca`, empty-state kontekstual (search/filter 0 hasil ≠ empty default), navigasi.
- **UI-S-IN2 (Thread, `inbox/[roomId].tsx`)** — PERUBAHAN perilaku: urutan kronologis-menaik (baseline `messages.map` newest-first tanpa reverse), bubble me/them via `useAuth().session.user.id`, identitas pengirim (Avatar+nama) untuk `them` dengan guard `author` null → `'?'`, default `them` saat `currentUserId` kosong, date divider device-tz + skip `created_at` invalid, guard `roomId` undefined → ErrorState, paginasi `Muat pesan lama`.
- **Composer + banner governance** — tombol circular ≥44dp `accessibilityLabel='Kirim pesan'`, disabled saat kosong/whitespace/`isSending`, send sukses (clear input + invalidate `['chat-messages',roomId]`+`['chat-rooms']`) & gagal (input tetap + error `role='alert'`), banner governance kanonik tampil + dapat ditutup, `mentions=[]`.

### Data layer (FR-DATA.1)

Perluas RPC `get_chat_rooms()` (+`last_message_body` +`last_message_author_name` via lateral join pesan terbaru, tetap `SECURITY DEFINER` + gate `is_chat_member`). Migrasi baru **`0018`** (berikutnya setelah `0017_permission_settings.sql`). Tipe TS `ChatRoom` +2 field nullable. Regen `database.types.ts`.

### Hook layer (use-inbox.ts)

`useChatMessages` perlu paginasi (`loadOlder()` + `hasMore`); `listChatMessages(roomId, page)` digabung. `useChatActions.send` HARUS reject saat gagal (tidak swallow, tidak invalidate). `useChatActions.markRead` HANYA invalidate `['chat-rooms']`.

## 2. PRASYARAT (bukan test — gate `CLAUDE.md` mobile)

Sebelum implementasi UI: daftarkan token `ChatBubble`, `DateDivider`, `ContextBanner`, `SendButton` di `DESIGN.md §7 Component tokens` (file ada di **root repo** `D:\Projects\RencanApp\DESIGN.md`, BUKAN `mobile/`), lalu implementasi var di `mobile/src/global.css`. Token desain bukan unit test, tapi gate wajib sebelum kode UI ditulis.

## 3. Daftar file test

| Layer | File |
|---|---|
| Migrasi (contract SQL) | via MCP `supabase.execute_sql` begin/rollback (bukan file jest) |
| Hooks | `mobile/src/hooks/__tests__/use-inbox.test.tsx` (extend) |
| Screen Inbox | `mobile/src/app/(app)/(tabs)/__tests__/inbox.test.tsx` (extend) |
| Screen Thread | `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx` (extend) |

## 4. Strategi mocking per layer

### Data/migrasi (FR-DATA.1)
Contract SQL via MCP `supabase.execute_sql` dalam transaksi `begin; … rollback;` (gotcha terdokumentasi: WAJIB begin/rollback). Verifikasi: (a) non-member → 0 baris, (b) member → 2 kolom baru terisi pesan terbaru benar, (c) gate `is_chat_member` tetap menggate. Setelah migrasi sah → `apply_migration` (`0018`) → `generate_typescript_types` regen `database.types.ts`. Tidak ada unit jest untuk SQL.

### Data layer `inbox.ts`
`jest.mock('../supabase', …)` + pola `makeQueryThenable()` di `inbox.test.ts` (chain `.select/.eq/.order/.range`, `rpc` stub). Untuk V1.8.1 tipe `ChatRoom` +2 field bersifat pass-through dari RPC; tidak ada test data-layer baru wajib (cukup type extension). `listChatMessages(roomId, page)` sudah menerima `page` — tinggal dipakai hook.

### Hook layer `use-inbox.ts`
`jest.mock('@/lib/inbox', …)` — mock `listChatMessages` **per-argumen** (`mockImplementation((id, page) => …)`) agar page 0 vs 1 beda payload. `makeWrapper()` QueryClient `retry:false`. `jest.spyOn(qc,'invalidateQueries')` untuk mengunci key invalidasi (positif & negatif). `mutateAsync` reject diuji via `await expect(...).rejects.toThrow(...)`.

### Screen layer (Inbox + Thread)
- `jest.mock('@/lib/supabase', () => ({ supabase: {} }))` — stub agar import aman tanpa native/env.
- `jest.mock('expo-router', …)` — `useRouter().push` (Inbox), `useLocalSearchParams` (Thread). Untuk test `roomId` undefined: override `useLocalSearchParams: () => ({})`.
- `jest.mock('@/hooks/use-inbox', …)` — `useInboxRooms`/`useChatMessages`/`useChatActions` sebagai `jest.fn()` yang dipegang referensinya (untuk hitung pemanggilan = bukti anti-bypass search).
- `jest.mock('@/providers/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))` — pola dari `use-profile.test.tsx`. Untuk default-them: `useAuth: () => ({ session: null })`. Karena `useAuth` di-mock per-test berbeda, gunakan variabel mutable (`let mockSession`) yang dibaca di factory.
- RNTL v14 async: `await render(...)`, `findBy*`, dan `waitFor` untuk commit state input sebelum `fireEvent.press` (pola sudah ada di `[roomId].test.tsx` baris 87).

## 5. Urutan langkah Red → Green → Refactor

### Fase A — Data (FR-DATA.1)
1. **RED (contract)** — tulis SQL begin/rollback memverifikasi `get_chat_rooms()` mengembalikan `last_message_body`+`last_message_author_name`; jalankan → gagal (kolom belum ada).
2. **GREEN** — `0018_*.sql`: `create or replace function get_chat_rooms()` +2 kolom via lateral join pesan terbaru (`order by created_at desc limit 1`) join `profiles` untuk nama; gate `is_chat_member` tetap. Apply → contract lulus.
3. **REFACTOR** — `generate_typescript_types` regen `database.types.ts`; rapikan `ChatRoom` di `inbox.ts` (+2 field `string|null`).

### Fase B — Hooks (`use-inbox.test.tsx` + `use-inbox.ts`)
4. **RED** — tambah 4 case hook: `loadOlder` page 1 + merge `['m0','m1']`; `hasMore` true(batch 30)/false(<30); `send` gagal reject + TIDAK invalidate; `markRead` HANYA invalidate `['chat-rooms']`.
5. **GREEN** — refactor `useChatMessages` → `useInfiniteQuery` (atau state `page` + akumulasi) expose `messages` (merged, urutan stabil), `loadOlder()`, `hasMore`. Pastikan `send` propagasi error (tak ada `onError` swallow). `markRead` invalidasi terbatas.
6. **REFACTOR** — ekstrak `PAGE_SIZE` konsisten dgn `inbox.ts`; pastikan case existing [1]–[5] tetap hijau.

### Fase C — PRASYARAT token (gate, sebelum C-screen)
7. Daftarkan token di `DESIGN.md §7` + `global.css` (ChatBubble/DateDivider/ContextBanner/SendButton).

### Fase D — Inbox list (`inbox.test.tsx` + `inbox.tsx`)
8. **RED** — 8 case: Avatar(seed=room.id), preview `'Budi: Halo tim'`, fallback timestamp (no `null`/`undefined`), clamp `'99+ baru'`, search anti-bypass (no extra hook call), chip `Belum dibaca`, chip ter-defer TIDAK ada, empty-state kontekstual search-0.
9. **GREEN** — refactor `inbox.tsx`: header search `TextInput placeholder='Cari Initiative'` (filter `useMemo` client-side), chip `Semua`/`Belum dibaca` (state lokal), `renderItem` Avatar + preview + Badge clamp + dot, empty-state bercabang (search/filter/default).
10. **REFACTOR** — ekstrak `formatPreview`, `clampUnread`, komponen `RoomRow`; pastikan 4 case baseline tetap hijau (catatan: case baseline yang assert `'3 baru'` tetap valid karena <99).

### Fase E — Thread (`[roomId].test.tsx` + `[roomId].tsx`)
11. **RED** — 11 case: urutan kronologis-menaik, bubble me/them, identitas them (Avatar+nama), author null→`'?'`, currentUserId kosong→default them, date divider antar-hari + skip invalid, `roomId` undefined→ErrorState `'Room tidak ditemukan'` + markRead TIDAK dipanggil, tombol kirim circular `'Kirim pesan'` ≥44dp, disabled kosong/whitespace/isSending, gagal→input tetap+`role='alert'` & sukses→clear, banner governance kanonik + closeable, `Muat pesan lama` saat ada paginasi.
12. **GREEN** — refactor `[roomId].tsx`: guard `roomId` undefined→ErrorState (sebelum `markRead` effect), `const ordered = useMemo(() => [...messages].reverse())` (atau sort asc), `useAuth()` untuk `currentUserId`, komponen `MessageBubble` (me/them, Avatar+nama them, guard author null `'?'`, default them saat currentUserId kosong), `DateDivider` group device-tz + skip invalid, banner governance state `dismissed`, composer `SendButton` circular accessible + disabled logic, `Muat pesan lama` → `loadOlder()`.
13. **REFACTOR** — ekstrak `MessageBubble`/`DateDivider`/`GovernanceBanner`/`SendButton` ke komponen lokal atau `ui.tsx`; pertahankan case baseline (markRead-on-mount, error/empty/loading state) tetap hijau — perhatikan baseline test mempress `getByRole('button', { name: 'Kirim' })` yang berubah jadi `getByLabelText('Kirim pesan')`, jadi case lama [data→kirim] perlu di-update sebagai bagian RED Fase E.

### Fase F — Verifikasi penuh
14. `npm test` full suite hijau; tidak ada regresi pada 240+ test lain. Lint + typecheck.

## 6. Catatan penting baseline yang berubah (bukan tambahan, tapi PERUBAHAN)

- `[roomId].test.tsx` case existing `'data → render pesan; kirim'` mempress `getByRole('button',{name:'Kirim'})` dan tidak mock `useAuth`. Setelah composer jadi circular + me/them dibutuhkan, case ini WAJIB di-rewrite (label `'Kirim pesan'`, tambah mock `useAuth`). Masukkan ke RED Fase E, jangan dianggap regresi tak sengaja.
- `useChatMessages` saat ini return `{messages,isLoading,isError,refetch}`; menambah `loadOlder`/`hasMore` aman bagi konsumen lama.

## 7. Risiko

Lihat §8 (addendum critic) — risiko digabung dengan koreksi mengikat.

---

## 8. Addendum Critic — koreksi MENGIKAT (verdict: perlu-perbaikan)

Fase Critic menemukan beberapa jebakan "false-green". Item di bawah **wajib** diterapkan; tanpa ini plan §5 bisa lulus karena alasan yang salah.

### 8.1 BLOKER — Contract FR-DATA.1 butuh auth context eksplisit
`get_chat_rooms()` = `security definer set search_path=''` dan bergantung penuh pada `auth.uid()` (lewat `is_chat_member` + `unread_count`). Di dalam `begin; … rollback;` lewat MCP `execute_sql`, **`auth.uid()` = NULL** kecuali di-set. Tanpa ini: 0 baris untuk SEMUA orang → assertion "member lihat 2 kolom" & "non-member 0 baris" lulus karena alasan salah (false-green factory).

WAJIB di tiap contract tx:
1. Seed `chat_rooms/chat_room_members/chat_messages/profiles` **sebagai role owner/postgres dulu** (grant `insert` sudah di-revoke dari `authenticated`, jadi seeding tak bisa sebagai authenticated).
2. Baru `set local role authenticated;` + `set local "request.jwt.claims" = '{"sub":"<uuid>"}';` (SET LOCAL hanya hidup dalam tx).
3. Buktikan selisih baris **digerakkan keanggotaan**, dengan **dua sub berbeda** (member uuid vs non-member uuid) dalam tx terpisah — bukan sekadar "ada/0 baris".

### 8.2 BLOKER — Assertion "anti-bypass search" salah secara semantik
Case "jumlah panggilan `useInboxRooms` TIDAK bertambah setelah `changeText`" **FALSE by React** — tiap re-render memanggil hook lagi. Dan `supabase` di-stub `{}` di screen test → tak ada `rpc` untuk di-spy. **Ganti** assertion jadi: search murni `useMemo` atas rooms yang sudah di-fetch → buktikan **output terfilter** (hanya room cocok yang dirender), drop klaim call-count sepenuhnya.

### 8.3 MENGIKAT — `useAuth` mock (TDZ footgun)
`auth-provider.useAuth()` melempar tanpa provider → screen test WAJIB `jest.mock('@/providers/auth-provider', …)`. Karena `jest.mock` di-hoist di atas import: factory **harus baca variabel lazily di dalam body fungsi** (`useAuth: () => ({ session: mockSession })`), dan `mockSession` dideklarasi `var` (atau di-set di `beforeEach`) — **bukan** `const` initializer. Salah tulis → `ReferenceError`. Pola id:'u1' vs `session:null` (default-them) di-set per test via variabel mutable ini.

### 8.4 MENGIKAT — Testability ≥44dp & accessibilityState
- Assert `style.width/height>=44` **rapuh** di NativeWind/react-native-css (className tak selalu flatten ke angka di jest). Sebagai gantinya buktikan target lewat **inline style numerik eksplisit** atau `hitSlop` pada `SendButton`, plus `accessibilityRole='button'` + token desain. Jika tetap mau angka, beri `SendButton` `style={{width:44,height:44}}` inline (green-step requirement, bukan sekadar assertion).
- `SendButton` WAJIB expose `accessibilityState={{ disabled }}` eksplisit (bukan hanya prop `disabled`) agar `getByLabelText('Kirim pesan').props.accessibilityState` terbaca.

### 8.5 MENGIKAT — Tambahan case yang hilang (masukkan ke RED terkait)
- **Contract FR-DATA.1:** (a) `author_id` NULL/profil terhapus → `last_message_author_name` NULL via **LEFT join** (room tetap muncul, jangan inner-drop); (b) **tie `created_at`** dua pesan sama timestamp → tiebreaker `id desc` (deterministik); (c) **room kosong** (0 pesan) → ketiga kolom NULL tapi room TETAP muncul; (d) urutan `order by last_message_at desc nulls last` **tetap** (jangan regresi akibat lateral join).
- **Inbox:** boundary clamp **99→'99 baru' & 100→'99+ baru'** (off-by-one); preview saat `body` ada tapi `author_name` NULL → tetapkan render (mis. fallback nama, jangan `'null: …'`); kombinasi chip `Belum dibaca` + search 0 hasil → empty-state kontekstual yang benar.
- **Thread:** anti double-submit (`isSending` → press kedua TIDAK panggil `send` dua kali); success path circular-button buktikan invalidate **DUA** key + clear input (jangan hilang coverage saat case lama di-rewrite); satu hari = **tepat satu** divider (bukan duplikat); divider dihitung ulang atas array **ter-merge** setelah `loadOlder` (bukan per-page); `getAllByLabelText`/`within()` untuk hindari "multiple elements" saat ≥2 pesan "them" dari nama sama.

### 8.6 Catatan kontrak hook
- `send`-gagal-reject (Fase B step 4 case 3) **sudah hijau** terhadap kode sekarang (regression guard, bukan red sejati). Kerja produksi nyata Fase B = `loadOlder`/`hasMore` + flatten/ordering `useInfiniteQuery`. Jangan biarkan "red" palsu menutupi itu; tambah case multi-page ordering (bukan hanya `['m0','m1']`).
- Banner governance `dismissed` = `useState` lokal → **akan muncul lagi** saat re-mount/navigasi ulang. Tetapkan apakah itu intended (spec ambiguous) + satu case mengunci perilakunya.

### 8.7 Risiko lain (dari fase Plan, tetap berlaku)
- Baseline `[roomId].test.tsx` case `'data → render pesan; kirim'` pakai `getByRole('button',{name:'Kirim'})` & tak mock `useAuth` → **WAJIB di-rewrite** di RED Fase E (label `'Kirim pesan'` + mock useAuth). Bukan regresi tak sengaja.
- Date divider: pakai fixtur `created_at` yang jelas beda hari di UTC (mis. `2026-06-23T10:00Z` vs `2026-06-24T10:00Z`) agar deterministik lintas tz runner; skip `created_at` invalid tanpa crash.
- Migrasi `0018` ubah signature `get_chat_rooms` (+2 kolom) → **regen `database.types.ts` wajib**; jika lupa, generated vs hand-defined `ChatRoom` divergen dan `as unknown as` menyembunyikan error sampai runtime.
- Token gate (§2) adalah **hard prerequisite** sebelum green-step screen (langkah 9 & 12) — DESIGN.md di **root repo**, bukan `mobile/DESIGN.md`.
