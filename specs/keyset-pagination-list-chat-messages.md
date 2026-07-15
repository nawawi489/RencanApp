# Spec — Keyset Pagination `listChatMessages` (Initiative Chat)

status: draft-final · type: feature-spec (read-path plumbing + load-older UX) · updated: 2026-07-13
sumber-kebenaran: PRD V1.8.2 · pola kanonik: `search_chat_messages` (migrasi 0044)

> [!note] Revisi owner 2026-07-13 (mengikat) — lihat **§10** untuk detail & dampak
> 1. **Scope = read-path fix only.** Realtime subscription + optimistic send + dedup-by-id **OUT OF SCOPE** (follow-up terpisah). Default spec dikonfirmasi.
> 2. **Load-older = infinite-scroll-up, tombol "Muat pesan lama" DIHAPUS total.** Ini **meng-override** `specs/inbox-chat-ui.md` FR-IN2.6/AC-IN2.9 (yang memutuskan tombol manual). Implementasi: migrasi render `[roomId].tsx` dari `ScrollView` → **inverted `FlatList`** (`onEndReached` = scroll ke atas; scroll-anchoring native mencegah jump saat prepend). `[roomId].tsx` kini **berubah** (bukan lagi "verify unchanged").

---

## 1. Problem, Goals & Non-Goals

### 1.1 Konteks

Inbox = khusus **Initiative Chat** (PRD §29–30, `prd/03 B.7`): surface percakapan follow-up kontekstual — **bukan** action queue, bukan Notifications, bukan jalur approval/evidence resmi. Perubahan ini adalah perbaikan *plumbing read-path* murni dan **tidak boleh mengubah surface produk apa pun**. Tujuan tunggal: histori chat andal (tak ada pesan hilang atau ganda saat memuat halaman lama).

### 1.2 Problem statement

`listChatMessages(roomId, page)` (`mobile/src/lib/inbox.ts:42`) memakai paginasi **offset**: `.range(page*30, page*30+29)` di atas `.order('created_at', { ascending: false })`. Dua cacat korektnes:

1. **Offset bergeser saat himpunan berubah** — tie ke mekanisme di §1.3.
2. **Tidak ada tie-break stabil** — `ORDER BY created_at DESC` **tanpa** kolom `id` berarti dua pesan ber-`created_at` identik bisa bertukar urutan antar-query → duplikat/skip di batas halaman, **bahkan tanpa** pesan baru masuk (mis. seed/insert satu transaksi).

### 1.3 Koreksi diagnosis pemicu (hasil grill — WAJIB dipegang seluruh spec)

> [!warning] Pemicu bug yang benar
> Intent & draft awal menautkan bug ke **"invalidate-refetch page-0 menggeser offset"**. Ini **keliru secara teknis**: React Query v5 me-refetch SEMUA halaman berurutan dan menghitung ulang `pageParam` tiap halaman dari `initialPageParam` — refetch-all serempak terhadap satu snapshot DB menghasilkan union **kontigu** (tanpa dup/skip), bahkan dengan offset.
>
> Pemicu **nyata** duplikat/skip adalah **`fetchNextPage` INKREMENTAL** yang dijalankan setelah dataset berubah **di antara** dua fetch: page 0 di-fetch pada T1; pesan baru dari anggota lain masuk pada T2; user menekan "Muat pesan lama" pada T3 → `.range(30,59)` kini membaca dataset yang sudah bergeser satu baris → baris batas page-0 muncul lagi di page-1 (**duplikat**), atau terlewat (**skip**). Keyset menutup kelas ini karena tiap halaman ditentukan oleh nilai `(created_at, id)` baris, bukan posisi ordinal.

> [!warning] Ketergantungan load-bearing pada React Query v5
> Korektnes keyset **saat refetch-all** (seam page-0/page-1 setelah pesan baru masuk) bergantung pada perilaku React Query v5 yang **me-RE-DERIVE `pageParam`** tiap halaman via `getNextPageParam` mulai dari `initialPageParam`. Jika cursor page-1 dipakai apa adanya dari cache (bukan di-re-derive), page-0 yang tumbuh satu baris pada refetch bisa **men-skip** baris batas. Ketergantungan ini **WAJIB** dinyatakan sebagai requirement (FR-6) dan diuji di level hook (AC-5), bukan diasumsikan.

### 1.4 Goals

- **G1** — Hilangkan duplikat & skip: ganti offset → keyset/cursor pada `listChatMessages`.
- **G2** — Cerminkan **semantik** pola kanonik repo: ordering `created_at DESC, id DESC`, cursor `before: {createdAt, id}`, handling NULL eksplisit (bukan coalesce). Mekanis: `search_chat_messages` adalah RPC SQL memakai tuple `(created_at,id) < (a,b)`; `listChatMessages` tetap client `.from()` yang **tak** mendukung tuple native → dekomposisi via `.or('created_at.lt.<ts>,and(created_at.eq.<ts>,id.lt.<id>)')`. Yang dicerminkan adalah semantik urutan+tie-break+NULL, **bukan** klausa SQL identik.
- **G3** — Perubahan minimal & non-breaking: pertahankan kontrak data layer newest-first dan bentuk output hook; screen tak berubah.
- **G4** — Pertahankan invarian governance: tetap client `.from()` di bawah RLS `chat_messages_select`; read-only; tak sentuh evidence-locking/anti-self-approval/minimum-breakdown.
- **G5** — Test regresi wajib untuk skenario duplikat/skip, termasuk **hook-level** (pemicu inkremental & seam refetch-all) dan **DB-contract** (parity RLS).

### 1.5 Non-Goals

Lihat daftar `non_goals` terstruktur. Ringkas: tanpa realtime subscription, tanpa optimistic insert, tanpa dedup-cache realtime, tanpa konversi ke RPC, tanpa replikasi `can_access_initiative` di klien, tanpa perubahan jalur tulis/evidence, tanpa membalik urutan di data layer (screen tetap yang membalik), tanpa index baru dalam perubahan ini, tanpa perubahan copy UI selain penghapusan tombol "Muat pesan lama".

> [!note] Perubahan dari draft (revisi owner §10)
> **Infinite-scroll-up kini IN SCOPE** — sebelumnya non-goal. Konsekuensi: render `[roomId].tsx` bermigrasi `ScrollView` → inverted `FlatList`; tombol "Muat pesan lama" dihapus. Realtime/optimistic tetap OUT OF SCOPE.

---

## 2. User Stories

> Fitur = plumbing read-path. Tak ada kapabilitas/peran/permission baru. Visibilitas chat ditegakkan **hanya** oleh RLS `chat_messages_select`: `organization_id = current_user_org() AND (is_chat_member(chat_room_id) OR can_view_workspace())` (`0008:337-340`). Keanggotaan room **derived server-side** (PIC/Reviewer Initiative, `prd/03 §B.7`) — klien tak menentukan/meng-cache membership.

- **US-1 — PIC Initiative (anggota room):** menggulir ke atas dan histori lama termuat otomatis (30 per batch) tanpa ganda/hilang dan tanpa posisi scroll melompat, walau rekan lain sedang mengirim pesan baru. (AC-1..AC-7, AC-21, AC-22)
- **US-2 — Reviewer Initiative (anggota room):** menggulir histori dengan andal sebelum menilai. Catatan: chat **bukan** jalur approval/evidence (keputusan resmi via Comment/Review/Status/Activity Log). Alur baca identik PIC.
- **US-3 — CEO/Owner (`view_all_workspace`, baca-saja):** membaca histori room mana pun se-org secara utuh tanpa jadi anggota. Postur confidential diwarisi apa adanya (chat tak model confidential per-room, owner 2026-07-12 `0044:22-25`); keyset **tidak** melonggarkan gate. (AC-10, AC-12)
- **US-4 — Non-anggota/lintas-org:** memanggil `listChatMessages` dengan cursor apa pun → **0 baris (silent, bukan error)**, tak membocorkan keberadaan room. (AC-10, AC-11)

---

## 3. Functional Requirements

Penomoran **FR-KP**.

### 3.1 Data layer — `listChatMessages`

- **FR-KP1 — Signature cursor.** `listChatMessages(roomId: string, cursor?: { createdAt: string; id: string }): Promise<ChatMessage[]>`. `cursor` absen → page pertama (30 terbaru). `cursor` terisi → pesan strictly-older. Guard `if (!roomId) return []` dipertahankan.
- **FR-KP2 — Ordering `created_at DESC, id DESC`.** `.order('created_at',{ascending:false}).order('id',{ascending:false})`. Menghilangkan order `created_at`-saja yang jadi akar dup/skip. Catatan: `id` UUID acak (`gen_random_uuid()`) → urutan antar-tie stabil & konsisten lintas-page tapi non-kronologis (trade-off diterima, identik `search_chat_messages`).
- **FR-KP3 — Predikat cursor via `.or()`.** Saat `cursor` terisi: `.or('created_at.lt.<cursor.createdAt>,and(created_at.eq.<cursor.createdAt>,id.lt.<cursor.id>)')`, semantik identik tuple SQL 0044. Saat page 0: tanpa predikat cursor. **Dilarang** coalesce `id` cursor ke nilai baris.
- **FR-KP4 — `.limit(CHAT_PAGE_SIZE)`** menggantikan `.range()`. `CHAT_PAGE_SIZE = 30` tetap konstanta tunggal (`inbox.ts:30`).
- **FR-KP5 — Return newest-first.** Tetap `ChatMessage[]` urut `created_at desc, id desc`; data layer **tidak** membalik. Screen yang membalik (`[roomId].tsx:143`).
- **FR-KP-ENC — Encoding cursor timestamp (baru, wajib).** `cursor.createdAt` WAJIB nilai `created_at` mentah dari baris sebelumnya (round-trip lossless, presisi mikrodetik). Karena offset `+00:00` mengandung `+` yang reserved di grammar filter PostgREST, ekspresi `.or()` WAJIB divalidasi contract/integration test (AC-17) — mekanisme direkomendasikan: quote nilai timestamp dalam ekspresi `.or()` dan/atau normalisasi; ditetapkan oleh test. **Catatan:** risiko ini TIDAK inherited dari `searchChatMessages` (ia mengirim `createdAt` sebagai RPC param `p_before`, bukan filter string).

### 3.2 Hook — `useChatMessages`

- **FR-KP6 — `pageParam` = cursor.** `useInfiniteQuery`: `initialPageParam: undefined`, `queryFn: ({ pageParam }) => listChatMessages(roomId, pageParam)`.
- **FR-KP7 — `getNextPageParam`.** `lastPage.length === CHAT_PAGE_SIZE ? { createdAt: last.created_at, id: last.id } : undefined` (baris terakhir = paling lama karena desc). `hasMore` = batch penuh (kontrak `use-inbox.ts:49-50` dipertahankan).
- **FR-KP8 — Output tak berubah.** `{ messages, isLoading, isError, refetch, loadOlder, hasMore }`; `messages = pages.flat()` newest-first; `loadOlder = () => q.fetchNextPage()`; `queryKey = ['chat-messages', roomId]`. Screen tak berubah.
- **FR-KP-REDERIVE — Ketergantungan re-derive (baru, wajib).** Korektnes seam saat refetch-all bergantung pada React Query v5 me-re-derive `pageParam` via `getNextPageParam`. Ditegakkan lewat `initialPageParam` + `getNextPageParam` yang murni fungsi data page (tanpa state luar), dan **diuji di AC-5**.

### 3.3 Governance & keamanan (mengikat)

- **FR-KP9 — Tetap `.from()` di bawah RLS.** `.eq('chat_room_id', roomId)` satu-satunya filter eksplisit; otorisasi 100% RLS `chat_messages_select`. **Dilarang** jadi RPC SECURITY DEFINER. **Dilarang** replikasi `can_access_initiative`/gate confidential di klien.
- **FR-KP10 — `.eq` top-level AND, cursor hanya via `.or()` di atasnya.** Karena RLS **tidak** menyekat per-room untuk user `can_view_workspace`, `.eq('chat_room_id')` adalah satu-satunya penyekat konteks room. Predikat harus `chat_room_id = X AND (lt OR (eq AND lt))`; **dilarang** melipat `.eq` ke dalam grup `.or()` (footgun presedens PostgREST → kebocoran pesan room lain se-org). Diuji AC-12.
- **FR-KP11 — Cursor bukan kanal bocor.** Predikat cursor hanya mempersempit di atas baris hasil-RLS; result ⊆ himpunan RLS-authorized. Non-member/lintas-org → **0 baris silent** untuk cursor apa pun (bukan error).
- **FR-KP12 — Read-only.** Tak ada jalur tulis baru; invarian tulis/evidence/MBR/audit tak tersentuh.

### 3.4 Index DB (keputusan mengikat)

- **FR-KP13 — REUSE index existing, tanpa migrasi.** Perubahan ini memakai `idx_chat_messages_org_room_created (organization_id, chat_room_id, created_at desc)` (`0044:47`) apa adanya. Tie-break `id DESC` diselesaikan lewat sort kecil dalam grup `created_at` identik (0–2 baris). **Tidak ada** migrasi baru dan **tidak ada** perubahan `database-blueprint.md` dalam perubahan ini. Index baru `(chat_room_id, created_at desc, id desc)` adalah **follow-up terpisah** (migrasi **0045** — terverifikasi max saat ini `0044`; `0052` dari memory tidak ada di branch ini) HANYA bila profiling menunjukkan sort cost, dan bila diambil WAJIB idempoten + update `database-blueprint.md`.

### 3.5 Batasan scope

- **FR-KP14 — Realtime & optimistic OUT OF SCOPE** (DEFER V1.8.1, revisi owner §10). Refresh tetap via invalidation `['chat-messages', roomId]`.
- **FR-KP15 — Load-older = infinite-scroll-up (revisi owner §10).** Memuat halaman lama terpicu **scroll ke atas** secara otomatis, bukan tombol. Tombol "Muat pesan lama" **DIHAPUS**. Ini meng-override `specs/inbox-chat-ui.md` FR-IN2.6/AC-IN2.9 — dicatat sebagai owner override, dan `specs/inbox-chat-ui.md` harus diperbarui saat perubahan ini di-ship.
- **FR-KP16 — Render migrasi `ScrollView` → inverted `FlatList` (baru, wajib).** `[roomId].tsx` saat ini memakai `ScrollView` (`baris 208`) + tombol load-older di puncak konten. Infinite-scroll-up yang benar butuh: (a) `FlatList inverted` (data urut `messages` newest-first langsung — inverted menaruh index-0/newest di bawah, jadi **tak perlu** `[...messages].reverse()`; day-divider dihitung ulang untuk urutan inverted), (b) `onEndReached` (= mendekati ujung atas = pesan terlama) memanggil `loadOlder()` dengan `onEndReachedThreshold` wajar + guard `hasMore && !isFetchingNextPage`, (c) scroll-anchoring native inverted `FlatList` mencegah lompatan posisi saat batch lama di-prepend (masalah yang tak bisa dihindari `ScrollView`). Indikator `isFetchingNextPage` (mis. spinner kecil di header inverted) menggantikan tombol. Pertahankan `key={m.id}` (data-driven, bukan index).

---

## 4. Data Contracts

Ruang lingkup = read-path client-side. **Tak ada** RPC baru, perubahan skema, perubahan grant/RLS, atau migrasi (index reuse).

### 4.1 Tabel `chat_messages` — tak berubah

Kolom cursor: `id` (uuid PK, tie-break), `chat_room_id` (filter), `organization_id` (di-inject RLS), `author_id` (nullable, `ON DELETE SET NULL`), `body`, `created_at` (timestamptz, sort key utama, presisi mikrodetik). Cursor alami = `(created_at, id)`. Tabel immutable (`revoke insert/update/delete`, `0008:1041`).

### 4.2 `listChatMessages`

Sesudah:
```ts
export type ChatCursor = { createdAt: string; id: string };

export async function listChatMessages(
  roomId: string,
  cursor?: ChatCursor,
): Promise<ChatMessage[]> {
  if (!roomId) return [];
  let qb = supabase
    .from('chat_messages')
    .select('id, chat_room_id, author_id, body, created_at, author:author_id(id, full_name, email)')
    .eq('chat_room_id', roomId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })       // tie-break BARU
    .limit(CHAT_PAGE_SIZE);                    // ganti .range()
  if (cursor) {
    qb = qb.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    ); // encoding/quoting timestamp ditentukan test (FR-KP-ENC / AC-17)
  }
  const { data, error } = await qb;
  if (error) throw error;
  return (data ?? []) as unknown as ChatMessage[];
}
```
Cursor selalu **wholly-absent** (page 0) atau **wholly-present** (dari baris nyata) — tak ada cursor parsial; cabang `p_before_id is null` (0044) tidak diperlukan. Response tak berubah: `ChatMessage[]` newest-first.

### 4.3 `useChatMessages`

```ts
const q = useInfiniteQuery({
  queryKey: ['chat-messages', roomId],
  enabled: !!roomId,
  initialPageParam: undefined as ChatCursor | undefined,
  queryFn: ({ pageParam }) => listChatMessages(roomId, pageParam),
  getNextPageParam: (lastPage) =>
    lastPage.length === CHAT_PAGE_SIZE
      ? { createdAt: lastPage[lastPage.length - 1].created_at, id: lastPage[lastPage.length - 1].id }
      : undefined,
});
```
Output diperluas menjadi `{ messages, isLoading, isError, refetch, loadOlder, hasMore, isFetchingNextPage }`. Field `isFetchingNextPage: boolean` = passthrough dari `useInfiniteQuery` — dipakai render layer (`[roomId].tsx`) sebagai indikator saat auto-load-older (FR-KP16, AC-21/22) dan sebagai guard `onEndReached` (mencegah refetch ganda). Field lain tak berubah. Consumer lama yang men-destrukturisasi subset tetap aman (tambah field, bukan hapus).

### 4.4 Tipe & index

- `database.types.ts` tak berubah. `ChatMessage` tak berubah. Ekspor `ChatCursor` (bentuk identik `SearchChatMessagesParams.before` — pertimbangkan menyatukan).
- Index: reuse (FR-KP13); tak ada perubahan `database-blueprint.md` dalam perubahan ini.

---

## 5. Acceptance Criteria

Lihat daftar `acceptance_criteria` terstruktur (AC-1 … AC-20), semuanya Given/When/Then dan dapat diuji. Sorotan yang mengubah/menambah dari draft:

- **AC-4 ditulis ulang** ke pemicu nyata (`fetchNextPage` inkremental antar-perubahan dataset), hook-level.
- **AC-5 baru** — seam page-0/page-1 saat invalidate→refetch-all; menguji ketergantungan re-derive React Query (hook-level RNTL).
- **AC-10/AC-11 dinaikkan** ke lapisan **DB-contract RLS nyata** (preseden `0044-DB-*`), bukan query-builder mock.
- **AC-12 baru** — presedens PostgREST `.eq` top-level AND (anti-kebocoran room).
- **AC-15 DIREVISI (owner §10)** — bukan lagi "tidak ada perubahan UX". Sekarang: load-older **terpicu scroll**, tombol "Muat pesan lama" **tidak lagi dirender**; copy Bahasa Indonesia lain & urutan kronologis (oldest atas, newest bawah) dipertahankan. Dikunci via RNTL/snapshot.
- **AC-17 baru** — round-trip timestamp lossless + `.or()` parseable (contract test), menggantikan open question.
- **AC-19 mengikat** — index reuse, tanpa migrasi/perubahan blueprint dalam perubahan ini.
- **AC-20** — harness `makeQueryThenable` tambah `'or'` + akumulasi `.order` agar dua-call bisa di-assert.
- **AC-21 baru (owner §10)** — GIVEN inverted `FlatList` dengan `hasMore=true` WHEN user menggulir mendekati ujung atas (pesan terlama) THEN `onEndReached` memanggil `loadOlder()` tepat sekali per batas (guard `hasMore && !isFetchingNextPage`), memuat 30 pesan lebih lama via cursor; saat `hasMore=false`, `onEndReached` tidak menyulut fetch. Diuji RNTL (simulasikan `onEndReached`).
- **AC-22 baru (owner §10)** — GIVEN batch lama di-prepend saat scroll WHEN inverted `FlatList` merender item baru THEN posisi scroll relatif user TIDAK melompat (scroll-anchoring inverted). Ini alasan migrasi dari `ScrollView` (yang melompat). Diverifikasi via test perilaku/RNTL atas pemakaian `inverted` + tidak adanya `[...].reverse()` manual yang melawan anchoring.

---

## 6. Edge Cases & States

- **E1 Loading awal (page 0, cursor NULL):** cabang tanpa `.or()`; skeleton `<SkeletonList count={4}/>`. Handling NULL eksplisit.
- **E2 Empty room:** `[]` → `<EmptyState "Belum ada pesan"/>`; `hasMore=false`.
- **E3 Halaman terakhir parsial / transisi 0-baris:** batch<30 → `getNextPageParam=undefined` → `hasMore=false` → `onEndReached` tak lagi menyulut fetch; scroll ke atas mentok tanpa fetch berulang.
- **E3b Daftar belum overflow satu layar (owner §10):** bila total pesan < satu viewport, `onEndReached` bisa memicu lebih awal — guard `hasMore && !isFetchingNextPage` mencegah fetch ganda; karena tombol dihapus, andalkan guard ini (bukan fallback tombol). Uji: room dengan 31 pesan di layar tinggi tidak memuat page-2 berulang.
- **E4 Tie `created_at` identik:** ordering `created_at DESC, id DESC` + predikat cursor menyertakan tie-break `id` → tanpa dup/skip.
- **E5 Pesan baru saat paginasi (pemicu nyata):** inkremental `fetchNextPage` — keyset kebal karena berbasis nilai `(created_at,id)`, bukan posisi. Seam refetch-all kontigu via re-derive (E5b/AC-5).
- **E6 Dedup by `id`:** tak diperlukan selama invalidate-refetch (RQ mengganti seluruh cache halaman); `key={m.id}` cukup. Dedup-by-`id` runtime hanya relevan bila realtime/optimistic kelak diaktifkan (OUT OF SCOPE).
- **E7 Error fetch:** `throw` → `<ErrorState onRetry={refetch}/>`; retry dari page 0 (cursor NULL). Tak ada surface error baru untuk `loadOlder`.
- **E8 Izin ditolak/non-anggota/lintas-org:** **silent 0 rows** untuk cursor apa pun; tampil sebagai empty state (tak membedakan "kosong" vs "tak berhak" — by design). Read bukan peristiwa audit.
- **E9 `roomId` kosong:** `[] ` tanpa query; `enabled:!!roomId`.
- **E10 `author_id` NULL:** konsumen toleran null; cursor hanya `created_at,id`.
- **E11 Index:** reuse existing (sort kecil di grup tie); bukan regresi (identik cara search bekerja).
- **E12 Regresi test wajib:** lihat §7.

---

## 7. Test Plan (regresi wajib)

Baseline Jest **1168/1168** tetap hijau.

**Harness (`inbox.test.ts:32`)** — WAJIB: tambah `'or'` ke daftar method; berhenti meng-overwrite `calls[m]` untuk `.order` (akumulasi ke array atau assert via `builder.order.mock.calls`) agar dua-call `.order('created_at',desc)` lalu `.order('id',desc)` dapat di-assert.

**Ditulis ulang:**
- `inbox.test.ts` [4]/[5] (assert `.range [0,29]/[30,59]`) → assert `.limit(30)` + `.order` x2 + `.or()` cursor (tanpa cursor → `.or` tak dipanggil).
- `use-inbox.test.tsx` [2] (`listChatMessages('r1', 0)`) & [8] (mock `page` numerik) → cursor `undefined` / `{createdAt,id}`.

**Baru — data layer:** tie `created_at` identik di batas → union tanpa dup/skip (AC-3).

**Baru — hook-level (RNTL, KRITIS):**
1. Pemicu inkremental (AC-4): load page 0 → sisipkan pesan baru di puncak → `fetchNextPage` → tanpa dup/skip.
2. Seam refetch-all (AC-5): load page 0+1 → sisipkan pesan baru → `invalidateQueries` → union kontigu (membuktikan re-derive `pageParam`).

**Baru — DB-contract (Postgres + RLS nyata, preseden `supabase/tests/0044_*_contract.sql`):**
- Parity non-member & lintas-org → 0 baris untuk cursor apa pun, tanpa error (AC-10).
- Cursor room A ke room B → nol kebocoran (AC-11).
- Presedens `.eq` top-level AND `.or()` cursor → tak menyerap `.eq` (AC-12).
- Round-trip timestamp presisi mikrodetik + `.or()` parseable, boundary exact (AC-17).

**Baru — snapshot/RNTL:** UX tak berubah (tombol "Muat pesan lama", urutan kronologis, skeleton/empty/error) (AC-15).

---

## 8. Open Questions

**Diputuskan owner 2026-07-13 (lihat §10) — tidak lagi terbuka:**
- ~~(1) realtime/optimistic scope~~ → **OUT OF SCOPE** (read-path fix saja).
- ~~(2) model load-older~~ → **infinite-scroll-up, tombol dihapus** (override FR-IN2.6).

**Masih terbuka (non-blocking):**
- Justifikasi severity/prioritas produk (default: fix korektnes preventif — diperkuat oleh keputusan infinite-scroll yang membuat `fetchNextPage` sering terpicu otomatis, memperbesar peluang bug inkremental muncul).
- Index follow-up 0045, penyatuan tipe `ChatCursor`, mekanisme encoding `.or()` — diikat oleh AC-17/AC-19 + test.
- `onEndReachedThreshold` konkret & bentuk indikator `isFetchingNextPage` (header inverted) — detail implementasi, diserahkan ke tahap TDD/UI.

---

## 9. Handoff ke TDD

**Fitur:** ganti offset `listChatMessages` → keyset `listChatMessages(roomId, cursor?)` (`created_at DESC, id DESC`, cursor `{createdAt,id}`, `.or()` dekomposisi), + `useChatMessages` (`useInfiniteQuery` cursor). Semantik mirror `search_chat_messages` (0044), tetap client `.from()` di bawah RLS.

**Urutan red-green (disarankan):**
1. Data layer: page 0 tanpa cursor (AC-1), cursor decomposition (AC-2, AC-16), tie `created_at` (AC-3), `.eq` top-level (AC-12 unit-level pada builder), harness `'or'`+order-accumulate (AC-20). Tulis ulang [4]/[5].
2. Hook: `getNextPageParam` cursor (AC-6), output contract (AC-13), guard (AC-9). Tulis ulang [2]/[8].
3. Hook-level RNTL: pemicu inkremental (AC-4) + seam refetch-all (AC-5) — inti korektnes.
4. DB-contract: parity RLS (AC-10/AC-11), presedens `.or()` (AC-12), round-trip timestamp (AC-17).
5. Render migrasi (owner §10): `[roomId].tsx` `ScrollView` → inverted `FlatList`; hapus tombol; `onEndReached`→`loadOlder()` (AC-21); scroll-anchoring (AC-22); AC-15 direvisi (tombol tak dirender). RNTL/snapshot.

**Invarian yang tak boleh dilanggar:** tetap `.from()` (bukan RPC); `.eq('chat_room_id')` top-level AND; data layer newest-first (inverted `FlatList` yang menampilkan kronologis — jangan gabung `[...].reverse()` dengan `inverted` karena saling meniadakan & merusak anchoring); read-only; index reuse (tanpa migrasi/blueprint dalam perubahan ini); realtime/optimistic OUT OF SCOPE.

**Paths:** `mobile/src/lib/inbox.ts`, `mobile/src/hooks/use-inbox.ts`, `mobile/src/lib/__tests__/inbox.test.ts`, `mobile/src/hooks/__tests__/use-inbox.test.tsx`, `mobile/src/app/(app)/inbox/[roomId].tsx` (**BERUBAH** — migrasi inverted `FlatList` + hapus tombol), `mobile/src/app/(app)/inbox/__tests__/` (RNTL scroll/anchoring), `supabase/tests/0045_keyset_list_chat_messages_contract.sql` (baru), `specs/inbox-chat-ui.md` (perbarui FR-IN2.6/AC-IN2.9 → infinite-scroll saat ship), referensi `supabase/migrations/0044_search_chat_messages.sql`, `wiki/entities/database-blueprint.md` (hanya jika follow-up index diambil).

---

## 10. Revisi Owner — 2026-07-13 (mengikat)

Dua keputusan owner setelah grill, mengikat untuk eksekusi:

### 10.1 Scope = read-path fix only
Intent awal menyebut "realtime insert + optimistic send + dedup". Grill memverifikasi chat **belum punya** realtime/optimistic (DEFER V1.8.1) dan bug yang dilaporkan **tuntas** oleh keyset saja (pemicu nyata = `fetchNextPage` inkremental saat pesan anggota lain masuk). **Keputusan: ship keyset sebagai read-path fix; realtime/optimistic/dedup-by-id menjadi fitur follow-up dengan spec sendiri.** Tidak ada perubahan dari default spec.

> [!warning] Koordinasi lintas-branch — chat realtime belum di-merge
> Diverifikasi 2026-07-13 pada branch ini (`claude/competent-gauss-beaa49`): migrasi maksimum = **0044**, dan **tidak ada** realtime/`.channel()`/`postgres_changes` di file chat/inbox. Ada branch lain (belum merge) yang menambah **realtime chat + optimistic send + migrasi 0052**. Bila branch itu merge lebih dulu, premis spec ini bergeser: (a) realtime akan ADA → dedup-by-id (UUID PK) menjadi relevan pada jalur penyisipan realtime; (b) nomor migrasi follow-up index bukan lagi 0045. **Sebelum eksekusi, cek ulang apakah realtime chat sudah masuk `main`/branch kerja** — bila ya, angkat kembali keputusan §10.1 dan koordinasikan dedup dengan implementasi realtime tsb.

### 10.2 Load-older = infinite-scroll-up, tombol dihapus
**Keputusan: ganti tombol manual "Muat pesan lama" dengan auto-load saat scroll ke atas; tombol dihapus total (tanpa fallback).**

- **Override tercatat:** ini membalik keputusan produk di `specs/inbox-chat-ui.md` FR-IN2.6/AC-IN2.9 (tombol manual). Perbarui spec itu saat perubahan di-ship.
- **Dampak scope (penting):** render `[roomId].tsx` saat ini = `ScrollView` + tombol load-older di puncak (`baris 208-217`). Infinite-scroll-up yang benar mengharuskan migrasi ke **inverted `FlatList`** — bukan sekadar menambah `onScroll` ke `ScrollView`, karena prepend ke `ScrollView` menyebabkan **lompatan posisi scroll** yang hanya diselesaikan native oleh inverted `FlatList` (scroll-anchoring). Ini memperluas perubahan dari "data-layer + hook" menjadi juga **refactor render layer**. Konsekuensi teknis: hapus `[...messages].reverse()` (inverted `FlatList` sudah membalik tampilan), hitung ulang day-divider untuk urutan inverted, `onEndReached`+threshold sebagai pemicu load-older, indikator `isFetchingNextPage` menggantikan tombol. Ditangkap oleh FR-KP16, AC-21, AC-22.
- **Sinergi dengan keyset:** infinite-scroll memicu `fetchNextPage` otomatis & sering → memperbesar frekuensi pemicu bug inkremental → menguatkan urgensi keyset (bukan realtime).

> Jika refactor render dianggap terlalu besar untuk satu perubahan, opsi pemisahan: PR-1 = keyset (data-layer + hook, tombol tetap sementara), PR-2 = inverted `FlatList` + hapus tombol. Kedua PR tetap dalam scope spec ini; urutan diserahkan ke tahap TDD.
