> Root repo: `D:/Projects/RencanApp` — seluruh path di bawah relatif terhadapnya.

# Rencana TDD — BL-10 PR-1: `search_global` (9/14 scope) + grouping + paging per-grup + anti-oracle

**Spec otoritatif:** `specs/bl-10-search-scope-38.md` (handoff terstruktur: `specs/bl-10-search-scope-38-tdd-handoff.json`).
Rencana ini **menerjemahkan** spec menjadi urutan red→green→refactor. Ia tidak mengubah satu pun keputusan di dalamnya.

---

## 1. Ringkasan fitur

Satu RPC baru `public.search_global` (migrasi `0085`) menggantikan permukaan Search layar utama:

| Aspek | Isi PR-1 |
|---|---|
| Scope | 7 card (`goal`, `strategy`, `initiative`, `action_plan`, `task`, `development_area`, `problem_statement`) + `chat` **lewat delegasi** ke `search_chat_messages` (FR-2) — 9 dari 14 termasuk grouping |
| Bentuk | `language plpgsql stable security definer set search_path = ''`, 9 kolom keluaran, **tanpa `payload jsonb`** |
| Guard biaya | Disalin **verbatim** dari `0075`: `btrim` → `length<2` early return → `substring 1..200` → escape `\ % _` + `ilike … escape '\'` → `lim = least(greatest(coalesce(p_limit,5),1),30)` |
| Otorisasi | Gate **inline per cabang** (`can_access_*`) karena RLS tidak berlaku di dalam SECURITY DEFINER; **tidak pernah** `raise exception` untuk otorisasi (FR-13) |
| Paging | Keyset `created_at DESC, id DESC` **per grup**; cursor hanya sah bila `p_scopes` berisi tepat satu scope; **tanpa OFFSET, tanpa nomor halaman global** (FR-19/FR-20) |
| Anti-oracle | Hasil kosong dan hasil tersaring-otorisasi menghasilkan payload **identik** (FR-15/FR-16); tanpa count, tanpa grup kosong, tanpa banner ber-nama-scope |
| Klien | File baru `lib/search.ts` + `hooks/use-search-global.ts`; `app/(app)/search.tsx` **ditulis ulang** jadi `SectionList` |
| Di luar cakupan | `people` (PR-2), `task_instance`/`comment`/`evidence` (PR-3), `activity_log`/`governance_violation` (PR-4) |

**Non-goal yang mengikat sepanjang rencana:**
- **NG-6** — `search_cards` (`0046:2113`), `useSearchCards`, `settings-archive.tsx`, queryKey `['cards_search']` **tidak disentuh dengan cara apa pun**. Bug LIKE tanpa escaping di `0046:2120` **sengaja dipertahankan**.
- **NG-7** — `CardEntityType`, `ENTITY_ROUTE_SEGMENT`, `push-route-resolver` tidak berubah.
- **NG-4** — hasil Search **read-only mutlak**; BL-10 tidak menambah policy tulis apa pun.

PR-1 **tidak diblokir** open question mana pun (BL10-OQ-01/02/03/05 adalah blocker PR-3/PR-4).

---

## 2. Preflight checklist (wajib selesai sebelum baris test pertama)

| # | Item | Perintah / bukti | Gate |
|---|---|---|---|
| P1 | Baseline jest hijau | `npm test -- use-search use-search-messages governance-admin push-route-resolver fase8-settings-screens fase8-lifecycle-screens app-header` | semua hijau; catat jumlah |
| P2 | Baseline tsc | `npx tsc --noEmit` | 0 error |
| P3 | Baseline DB contract | `supabase start` lalu `RENCAN_DB_CONTAINER=supabase_db_supabase scripts/ci/run-db-contract-tests.sh` | catat `N passed, 0 failed` |
| P4 | **EXPLAIN BL10-OQ-11** | lihat §3 Wave 0 | **GATE KERAS** — gagal ⇒ hentikan, tinjau FR-2 |
| P5 | Baseline NG-6 | `select md5(prosrc) … proname='search_cards'` | digest disimpan sebagai konstanta di header berkas kontrak |
| P6 | Fixture dua org tersedia | `supabase/tests/_fixtures.sql` memuat org `4b07a19f…d89` + org DCR-05 `52b0ebe1…b70` | ada; ingat aturan `raw_app_meta_data.organization_id` eksplisit (0083) |
| P7 | Nomor migrasi bebas | migrasi tertinggi = `0083` | `0085` aman |

---

## 3. Dependency graph antar wave

```
W0 Preflight (baseline + EXPLAIN OQ-11 + digest NG-6)
        │  (GATE: OQ-11 lulus)
        ▼
W1 Kerangka DB  ── struktur/ACL/kolom keluaran (0085-DB-1..5)
        ▼
W2 Guard biaya + scope `goal`  ← digabung sengaja (goal = kontrol positif; tanpa itu guard hijau palsu)
        ▼
W3 Enam scope card sisanya, satu per satu (harness 6 blok per scope)
        ▼
W4 Cabang `chat` (delegasi + truncation 240 + harness otorisasi)   ← bergantung W0/P4
        ▼
W5 Cursor keyset + anti-oracle digest + nol-emisi audit + PENGUNCI NG-6
        ▼
W5.5 Regenerasi `database.types.ts`  ← GERBANG TIPE, memisahkan lapis DB dan klien
        ▼
W6a lib/search.ts  ──┬──► W6b hooks/use-search-global.ts
                     └──► W6c app/(app)/search.tsx   (W6c hanya butuh KONTRAK kembalian hook,
                                                      jadi bisa paralel dengan W6b setelah W6a)
        ▼
W7 Regresi NG-6/NG-7 tanpa modifikasi + amandemen dokumen §10 + gerbang akhir
```

Ketergantungan yang tidak boleh dibalik:
- **W4 setelah P4.** Bentuk FR-2 belum terbukti; menulis test di atasnya lebih dulu berisiko dibuang.
- **W6 setelah W5.5.** `supabase.rpc('search_global', …)` tidak lolos `tsc` sebelum tipe diregenerasi.
- **W2 tidak boleh dipecah.** Guard tanpa kontrol positif = hijau palsu.

---

## 4. Daftar berkas test

| Lapis | Berkas | Status | Isi |
|---|---|---|---|
| DB | `supabase/tests/0085_search_global_contract.sql` | **baru** | 0085-DB-1..DB-74 |
| Data klien | `mobile/src/lib/__tests__/search.test.ts` | **baru** | BL10-L1..L14 |
| Hook | `mobile/src/hooks/__tests__/use-search-global.test.tsx` | **baru** | BL10-H01..H17 |
| Layar | `mobile/src/app/(app)/__tests__/search.test.tsx` | **baru** | BL10-UI-01..UI-17 |
| Regresi (tidak diubah) | `mobile/src/hooks/__tests__/use-search.test.tsx`, `mobile/src/lib/__tests__/governance-admin.test.ts`, `mobile/src/app/(app)/__tests__/fase8-settings-screens.test.tsx`, `mobile/src/lib/__tests__/push-route-resolver.test.ts`, `mobile/src/components/__tests__/app-header.test.tsx` | hijau tanpa edit | harness NG-6/NG-7 |
| Regresi (satu-satunya yang sah berubah) | `mobile/src/app/(app)/__tests__/fase8-lifecycle-screens.test.tsx` | dua test dipindah | `describe('search')` ~383-399 + mock `@/hooks/use-search` ~37-42 |

Berkas produksi yang dibuat/diubah: `supabase/migrations/0085_search_global.sql` (baru), `mobile/src/lib/search.ts` (baru), `mobile/src/hooks/use-search-global.ts` (baru), `mobile/src/app/(app)/search.tsx` (ditulis ulang), `mobile/src/lib/database.types.ts` (regen).

---

## 5. Urutan langkah red → green → refactor

### Wave 0 — Preflight (tanpa perubahan produksi)

**0.1 — baseline.** P1..P3, P5..P7 di atas.

**0.2 — GATE BL10-OQ-11 (EXPLAIN).** Ini langkah paling awal yang bersifat teknis, bukan administratif: kalau planner memperlakukan delegasi `search_chat_messages` di dalam `FROM` dengan buruk, **seluruh bentuk FR-2 perlu ditinjau ulang** sebelum banyak test ditulis di atasnya.

```sql
begin;
select set_config('request.jwt.claims',
       json_build_object('sub','ca8c1471-…d6f','role','authenticated')::text, true);
set local role authenticated;

explain (analyze, verbose, costs off)
select m.chat_room_id, left(m.snippet, 240)
from public.search_chat_messages('an', null, 5, null, null) m;

explain (analyze, verbose, costs off)
select m.chat_room_id
from public.search_chat_messages('an', null, 5, now() - interval '1 day',
                                 '11111111-1111-1111-1111-111111111111'::uuid) m;
rollback;
```

Yang harus dilihat:
1. Node **`Function Scan on search_chat_messages m`** dengan `actual rows` ≤ `lim`. `search_chat_messages` adalah `language plpgsql` sehingga **tidak inlinable** — ia dieksekusi sebagai satu node dengan `limit lim` di dalamnya (`0075:85`). LIMIT internal itulah satu-satunya guard biaya; predikat luar apa pun **tidak** dapat didorong ke dalam.
2. Cursor benar-benar diteruskan **sebagai argumen ke-4/5**, bukan menjadi `Filter:` di atas Function Scan. Kalau ia jadi filter luar, paging chat akan **kehilangan baris diam-diam** (5 baris diambil di dalam, lalu difilter jadi 2 di luar) — kegagalan yang, di permukaan anti-oracle, tidak dapat dibedakan dari "baris disembunyikan".

**Gagal ⇒ berhenti.** Simpan output di scratchpad sebagai bukti keputusan.

**0.3 — digest NG-6.** Rekam `md5(prosrc)` `search_cards` untuk dipakai di blok `0085-DB-74`.

---

### Wave 1 — Kerangka DB

| Langkah | Jenis | Berkas | Test |
|---|---|---|---|
| 1 | **red** | `supabase/tests/0085_search_global_contract.sql` | `0085-DB-1..DB-5` |
| 2 | **green** | `supabase/migrations/0085_search_global.sql` | idem hijau |
| 3 | refactor | — | runner penuh |

**DB-1** tanda tangan persis via `pg_get_function_arguments`. **DB-2** `prosecdef = true` ∧ `provolatile = 's'` ∧ `proconfig` memuat `search_path=`. **DB-3** sembilan kolom keluaran berurutan + tipe via `pg_get_function_result`. **DB-4** tidak ada kolom `payload` (larangan jsonb §6.2). **DB-5** ACL: `authenticated` boleh EXECUTE, `anon` dan `public` tidak (FR-35).

Green minimal = kerangka fungsi yang **selalu mengembalikan 0 baris**, header komentar peringatan FR-7, plus:

```sql
revoke execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  from public, anon, authenticated;
grant  execute on function public.search_global(text, text[], boolean, int, timestamptz, uuid)
  to authenticated;
```

> `REVOKE … FROM authenticated` saja tidak membatalkan grant PUBLIC (preseden `0066:22-31`).

---

### Wave 2 — Guard biaya **digabung** scope `goal`

**Kenapa digabung:** kalau `search_global` masih selalu `return;`, maka "length<2 → 0 baris", "clamp → ≤30 baris", dan "escape → 0 baris" semuanya **hijau palsu**. Cabang `goal` menjadi kontrol positif yang memberi test guard taringnya.

| Langkah | Jenis | Berkas | Test |
|---|---|---|---|
| 4 | **red** | kontrak | `DB-6` positif, `DB-7` length<2 (early return, **bukan** exception), `DB-8` truncation 200, `DB-9` escaping `% _ \`, `DB-10` clamp 1..30 (`p_limit=100→30`, `0→1`, `null→5`) |
| 5 | **green** | migrasi | guard verbatim 0075 + cabang UNION `goals` (order+limit **di dalam** subquery) |
| 6 | **red** | kontrak | `DB-11..DB-15` = harness otorisasi (lihat §6) |
| 7 | **green** | migrasi | perbaiki cabang goal sampai hijau |
| 8 | refactor | kontrak | tulis pola harness sebagai komentar template di kepala berkas |

`DB-9` bentuk konkret — **direvisi 2026-07-22, lihat §9.4**. Bentuk lama (seed `Aman` + `100% Target`, query `'%%'` lalu `'0% T'`) hanya separuh diskriminatif: assertion `'%%'` memang merah bila escaping dicabut (pola jadi `%%%%` → `Aman` ikut terjaring), tetapi assertion positif `'0% T'` **hijau baik escaping benar maupun rusak** — pola rusak `%0% T%` dibaca sebagai *apa saja · `0` · apa saja · `" T"` · apa saja*, yang tetap cocok dengan `100% Target`.

Bentuk baru memakai **pasangan diskriminatif per metakarakter**. Seed: `ab`, `a%b`, `a_b`, `a\b`.

| Query | Escaping benar | Escaping dicabut | Yang membuatnya merah |
|---|---|---|---|
| `a%` | hanya `a%b` | `ab`, `a%b`, `a_b`, `a\b` | `ab` muncul padahal tak punya `%` literal |
| `a_` | hanya `a_b` | keempat baris | `ab` muncul; `_` jadi wildcard 1-karakter |
| `a\b` | hanya `a\b` | `ab` (backslash dimakan sebagai escape) | baris yang benar justru HILANG |

Tiap baris tabel wajib meng-assert **dua arah**: himpunan yang muncul **dan** himpunan yang tidak. Assertion satu arah ("`a%b` muncul") lolos pada implementasi tanpa escaping sama sekali.

---

### Wave 3 — Enam scope card sisanya (satu per satu)

Untuk setiap scope, **red enam blok → green satu cabang UNION**. Tidak ada penggabungan.

| Scope | Tabel | Gate | Blok |
|---|---|---|---|
| `strategy` | `public.strategies` | `can_access_strategy` | DB-16..21 |
| `initiative` | `public.initiatives` | `can_access_initiative` | DB-22..27 |
| `action_plan` | `public.action_plans` | `can_access_action_plan` | DB-28..33 |
| `task` | `public.tasks` | `can_access_task` | DB-34..39 |
| `development_area` | `public.development_areas` | `can_access_development_area` | DB-40..45 |
| `problem_statement` | `public.problem_statements` | `can_access_problem_statement` | DB-46..51 |

Tambahan yang melekat pada scope tertentu:
- `action_plan`: assert `pg_get_functiondef` **tidak** mengandung `map_legacy_entity_type` (§6.4 melarangnya di jalur search).
- `task`: assert kolom `created_at` **ada** di `public.tasks` — satu-satunya `created_at` yang spec tandai belum terverifikasi (FR-18).

**Refactor W3:** baca ulang badan fungsi — tujuh subquery seragam, **nol** `raise exception` (blok `DB-52`), tidak ada `coalesce`/`is not distinct from` pada perbandingan org (FR-9), semua referensi schema-qualified.

---

### Wave 4 — Cabang `chat` (delegasi)

| Langkah | Jenis | Test |
|---|---|---|
| 9 | **red** | `DB-53` delegasi perilaku, `DB-54` larangan salin-tempel, `DB-55` truncation 240, `DB-56` proyeksi memilih kolom |
| 10 | **green** | cabang UNION memanggil `public.search_chat_messages(q, null, lim, p_cursor_ts, p_cursor_id)` di dalam `FROM` |
| 11 | **red** | `DB-57..DB-60` harness otorisasi chat (termasuk satu kasus confidential) |
| 12 | **green** | biasanya nihil perubahan — kemerahan di sini = sinyal delegasi tidak murni |

**`DB-53` adalah bukti FR-2 yang sesungguhnya** dan jauh lebih kuat daripada memeriksa `prosrc` (tahan terhadap salin-tempel yang diformat ulang):

```sql
begin;
create or replace function public.search_chat_messages(
  p_query text, p_room_id uuid default null, p_limit int default 20,
  p_before timestamptz default null, p_before_id uuid default null)
returns table (message_id uuid, chat_room_id uuid, room_name text, initiative_id uuid,
               author_id uuid, author_name text, snippet text,
               created_at timestamptz, body_similarity real)
language sql stable security definer set search_path = '' as $$
  select '…'::uuid, '…'::uuid, 'KANARI-STUB', null::uuid, null::uuid,
         'KANARI', 'KANARI-BODY', now(), 0::real
$$;
-- hasil search_global(…, array['chat']) HARUS ikut berubah menjadi baris kanari
rollback;   -- WAJIB rollback, bukan drop (DROP mereset ACL ke PUBLIC EXECUTE)
```

`DB-55`: `search_chat_messages` mengembalikan `cm.body` **utuh** (`0075:57`) — yang dipotong 200 char di sana adalah *query*, bukan snippet. Fixture butuh pesan >240 char; assert `length(snippet) = 240` di hasil `search_global` sementara RPC chat sendiri masih 400.

`DB-56`: `initiative_id` dan `body_similarity` **tidak punya padanan** di kontrak keluaran — proyeksi harus memilih kolom, bukan `m.*`.

---

### Wave 5 — Cursor, anti-oracle, pengunci NG-6

| Langkah | Jenis | Test |
|---|---|---|
| 13 | **red** | `DB-61` exception bentuk-request multi-scope, `DB-62` cursor + `p_scopes` null, `DB-63` satu scope sah, `DB-64` tiga halaman tanpa duplikasi/kehilangan, `DB-65` cursor menunjuk baris terhapus (EE-09), `DB-66` tidak ada `OFFSET`, `DB-67` scope tak dikenal = 0 baris **tanpa** exception (FR-22) |
| 14 | **green** | validasi bentuk-request di awal badan + predikat keyset `(created_at, id) < (p_cursor_ts, p_cursor_id)` di 7 cabang card |
| 15 | **red** | `DB-68..DB-71` anti-oracle + nol-emisi audit |
| 16 | **green** | umumnya nihil perubahan |
| 17 | **red** | `DB-72..DB-74` **pengunci NG-6** |
| 18 | refactor | review terhadap checklist FR + runner penuh |

**Anti-oracle dibuktikan setara-byte, bukan "mirip" (permintaan c):**

```sql
-- untuk (i) kata kunci yang tidak match apa pun, dan
--       (ii) kata kunci yang match baris yang seluruhnya tersaring otorisasi
select coalesce(md5(string_agg(t::text, '|' order by t::text)), '∅')
from public.search_global(q, p_scopes, false, 5, null, null) t;
```

Kedua digest harus **sama persis**, keduanya 0 baris, dan **keduanya tidak melempar apa pun** (`DB-69`). Pesan exception cursor pun statis, tidak bergantung identitas/data.

`DB-70` (FR-32): selisih `count(*)` pada `activity_logs` dan `governance_violations` sebelum/sesudah 100 panggilan oleh dua aktor = **0**; ditambah penegak mekanis `provolatile='s'` (DB-2) dan uji panggilan di dalam `set transaction read only`.

**Pengunci NG-6 (permintaan a)** — tiga jaring supaya tidak ada yang "merapikan" `search_cards`:

| Blok | Assertion |
|---|---|
| `DB-72` | `pg_get_functiondef(search_cards)` **tidak** mengandung `escape` dan tidak mengandung `btrim` — bug FR-6 sengaja dipertahankan |
| `DB-73` | Perbedaan perilaku berpasangan: `search_cards('%', null, false)` **tetap** mengembalikan baris (wildcard hidup), sedangkan `search_global('%%', array['goal'])` tidak |
| `DB-74` | `md5(prosrc)` `search_cards` = digest baseline P5; pesan galat menjelaskan bahwa mengubah `search_cards` melanggar NG-6 dan bukan bagian PR ini |

---

### Wave 5.5 — Gerbang tipe

**Langkah 19 (refactor).** Regenerasi `mobile/src/lib/database.types.ts` dari **DB lokal 54322** (bukan Supabase MCP — MCP menunjuk project staging). Verifikasi entry `search_global` mendarat di samping `search_cards` (~3866) dan `search_chat_messages` (~3874); `npx tsc --noEmit`.

---

### Wave 6 — Klien

**W6a — `mobile/src/lib/search.ts` (lapis murni + wrapper)**

| Langkah | Jenis | Test |
|---|---|---|
| 20 | **red** | `BL10-L1` (14 scope berurutan), `L2` (snapshot 14 label + `Object.keys` sepadan), `L3`/`L4` (`cardScopeOf` 7 card / 7 null), `L9` (mapper snake→camel), `L10` (tepat 9 kunci; field asing ditolak) |
| 21 | **green** | konstanta + tipe + `cardScopeOf` (switch eksplisit) + **`mapSearchHit` sebagai fungsi top-level** |
| 22 | **red** | `L5` (nama RPC + 6 parameter + default), `L6` (passthrough cursor; **tanpa** validasi klien), `L7` (`%`/`_`/`\` dan spasi tepi utuh), `L8` (tidak short-circuit <2 char), `L11` (snippet tidak dipotong ulang), `L12` (`data null → []`; error dilempar utuh termasuk `PGRST202`), `L13` (payload identik dua sebab), `L14` (tidak pernah `rpc('search_cards')`) |
| 23 | **green** | `searchGlobal` sebagai pemanggil tipis |

Tekanan desain yang disengaja: `mapSearchHit` **wajib diekspor terpisah**. Kalau ia jadi closure di dalam fungsi async (pola yang terlanjur ada di `inbox.ts`), `import { mapSearchHit }` gagal dan `L9/L10/L11` merah — itu memang tujuannya.

`L10` juga menutup kanal anti-oracle di hulu: mapper harus memilih 9 field satu per satu; `{ ...row }` akan meloloskan `total_count`/`storage_path`.

**W6b — `mobile/src/hooks/use-search-global.ts`**

| Langkah | Jenis | Test |
|---|---|---|
| 24 | **red** | `H01` enabled, `H02` debounce 250 ms, `H03` queryKey `['search_global', …]`, `H04` **NG-6** (tidak ada `cards_search`), `H05` passthrough tanpa field turunan, `H06` kembalian identik dua sebab, `H07` query mentah, `H08` `PGRST202 → isRpcMissing`, `H09` `staleTime === 0`, `H10` tanpa realtime channel, `H16` tanpa `keepPreviousData`, `H17` default limit 5 tanpa clamp klien |
| 25 | **green** | `useSearchGlobal` (cetakan `use-search-messages.ts`, **kecuali** `staleTime: 0` alih-alih 15 s, dan **tanpa** blok realtime) |
| 26 | **red** | `H11` scopes selalu tepat satu, `H12` cursor dari baris terakhir (tanpa `offset`/`page`), `H13` halaman tidak penuh → `hasNextPage false`, `H14` error halaman berikutnya tidak menghapus hasil, `H15` queryKey terpisah per scope + isolasi kegagalan |
| 27 | **green** | `useSearchScopePage` (`useInfiniteQuery`, cetakan `useChatMessages` di `use-inbox.ts`, **bukan** pola offset `use-activity-governance.ts`) |

**W6c — `mobile/src/app/(app)/search.tsx`**

| Langkah | Jenis | Test |
|---|---|---|
| 28 | **red** | test **render murni** dulu: `UI-01`, `UI-02`, `UI-03`, `UI-04`, `UI-05`, `UI-06`, `UI-07`, `UI-08`, `UI-10`, `UI-11`, `UI-16`, `UI-17` |
| 29 | **green** | tulis ulang layar: `SectionList`, komponen `ui.tsx` dipakai apa adanya, konstanta `COPY` lokal, komentar baris 1 dikoreksi (§10.4) |
| 30 | **red** | test **interaksi** di akhir berkas: `UI-09`, `UI-12`, `UI-13`, `UI-14`, `UI-15` |
| 31 | **green** | handler tap, "Lihat semua", retry inline per grup, "Hapus pencarian" |
| 32 | refactor | pindahkan `describe('search')` lama dari `fase8-lifecycle-screens.test.tsx` |

Detail yang menentukan hijau/merah:
- Urutan section dibangun sebagai `SEARCH_SCOPES.filter(s => byScope.has(s))` — **iterasi konstanta**, bukan `Map` insertion-order seperti `groupHitsByRoom`. Itulah beda halus yang diuji `UI-03`.
- `UI-05` membandingkan `JSON.stringify(toJSON())` dua render setelah menormalkan **hanya** teks query yang diketik user. Ini kesetaraan struktural, bukan kemiripan copy.
- `UI-11`: afordans "Lihat semua" dirender dari `hits.length === limit` — fungsi dari baris yang **sudah terlihat aktor**, jadi bukan oracle atas data pihak lain. Footer `— akhir hasil —` hanya untuk grup yang punya hasil.
- **Semua test yang menekan tombol berada di akhir berkas** (memori `rn-css-pressable-test-blank-render`).

---

### Wave 7 — Regresi & penutup

**Langkah 33 (refactor) — harness NG-6/NG-7, hijau tanpa satu baris pun diubah:**

```
npx jest src/hooks/__tests__/use-search.test.tsx \
         src/lib/__tests__/governance-admin.test.ts \
         'src/app/(app)/__tests__/fase8-settings-screens.test.tsx' \
         src/lib/__tests__/push-route-resolver.test.ts \
         src/components/__tests__/app-header.test.tsx
```

Kalau salah satu menuntut modifikasi, itu **bukti pelanggaran** — kembalikan perubahan, jangan sesuaikan test.

**Pengecualian tunggal yang direncanakan:** `fase8-lifecycle-screens.test.tsx` — dua test `[F8-UI-20a]`/`[F8-UI-20b]` (~383-399) dihapus dan mock `@/hooks/use-search` (~37-42) dilepas, karena layar Search ditulis ulang. Ini **bukan** izin menyentuh jalur Arsip.

**Langkah 34 (refactor) — amandemen dokumen §10 (wajib ikut PR-1):** `prd/03-sistem-permission-data-governance.md:213`; `specs/search-pesan-inbox.md` §1.3/FR-1 dan §8 (tandai stale); `wiki/entities/database-blueprint.md` (dokumentasikan `search_global` **dan** `search_cards`); `wiki/concepts/permission-model.md:31`; `wiki/concepts/feature-gap-backlog.md` (BL-10a..BL-10d); plus `wiki/index.md` + `wiki/log.md`.

**Langkah 35 (refactor) — gerbang akhir:** `npm test` penuh · `npx tsc --noEmit` · `npm run lint` (React Compiler: `react-hooks/set-state-in-effect` = ERROR di CI, tidak tertangkap jest/tsc) · runner DB contract penuh · `scripts/no-old-names.sh` (rename-guard memblokir `deploy-staging`) · `gh pr create --base staging` **eksplisit**.

---

## 6. Harness otorisasi per scope (diulang identik 7×)

Empat aktor disiapkan **di dalam transaksi test**, dengan `set local row_security = off` saat menyemai lalu impersonasi (pola `0067`):

```sql
perform set_config('request.jwt.claims',
        json_build_object('sub', v_uid, 'role','authenticated')::text, true);
execute 'set local role authenticated';   -- RLS aktif mulai di sini
…
execute 'reset role';
```

| Aktor | Identitas | Peran dalam test |
|---|---|---|
| **A1** | CEO org bersama `ca8c1471…d6f` (org `4b07a19f…d89`) | kontrol positif |
| **A2** | Staff org bersama (profil baru, role template `06771d3b…`), tanpa permission & tanpa penugasan | kontrol **tersaring** / reduksi-RLS |
| **A3** | CEO org DCR-05 `1111…0001` (org `52b0ebe1…b70`) | kontrol **lintas-org** |
| **A4** | profil `organization_id` NULL (preseden 0067) | kontrol **fail-closed** |

> Setiap `INSERT auth.users` **wajib** membawa `raw_app_meta_data.organization_id` eksplisit (guard 0083) — kelalaian menjatuhkan seluruh suite secara fatal di prelude.

Enam blok per scope:

1. **positif** — A1 menemukan baris; kolom keluaran cocok kontrak (`sort_ts = created_at`, `sort_id = id`, `parent_id` null untuk card).
2. **negatif** — kata kunci tanpa match ⇒ **0 baris, bukan error**.
3. **lintas-org** — baris org bersama tidak terlihat oleh A3.
4. **reduksi-RLS (permintaan b)** — bentuk himpunan, tanpa menyalin predikat gate:

```sql
-- KONTROL POSITIF dulu — tanpa dua assertion ini, uji EXCEPT di bawah hijau secara vakum
-- (himpunan kosong EXCEPT apa pun = kosong, termasuk saat RPC rusak total & nol baris).
select count(*) from public.<tabel> where name ilike pat escape '\'  -- ber-RLS, sebagai A2
  --> HARUS > 0 : aktor memang berhak melihat sesuatu, jadi premis uji ini hidup
select count(*) from public.search_global(q, array['<scope>'], true, 30, null, null)
  --> HARUS > 0 : RPC benar-benar mengembalikan baris untuk aktor ini

-- baru kemudian bentuk himpunannya
select id from public.search_global(q, array['<scope>'], true, 30, null, null)
except
select id from public.<tabel> where name ilike pat escape '\';   -- dijalankan ber-RLS
```

   `EXCEPT` harus **kosong** (RPC ⊆ RLS). Dijalankan sebagai **A2** — aktor yang RLS-nya benar-benar memotong.

   > [!warning] Kenapa dua kontrol positif itu wajib (§9.4)
   > `EXCEPT` kosong punya **dua** sebab: RPC benar-benar subset RLS (yang ingin dibuktikan), **atau** RPC mengembalikan nol baris karena rusak. Keduanya tak terbedakan tanpa kontrol positif. Aktor A2 dipilih justru karena ia melihat *sebagian* — kalau suatu saat fixture berubah sehingga A2 tak berhak apa pun, kontrol pertama merah dan memberi tahu bahwa premisnya bergeser, bukan diam-diam lolos.
5. **fail-closed** — A4 mendapat 0 baris.
6. **arsip (FR-31)** — baris `status = 'archived'` hanya muncul bila `p_include_archived = true`.

Kenapa seketat ini: `search_global` adalah `SECURITY DEFINER` + `search_path=''`, sehingga **RLS tabel tidak berlaku di dalamnya dan tidak ada jaring pengaman kedua** (FR-7). Satu cabang UNION yang lupa gate = kebocoran senyap. Reviewer wajib menghitung **6 × 7 card + 4 chat** blok sebelum approve.

---

## 7. Strategi mocking per lapis

### 7.1 DB — tanpa mock

Runner `scripts/ci/run-db-contract-tests.sh`: `_fixtures.sql` dulu, lalu setiap `tests/*.sql` (kecuali `_*.sql` dan `*.wip.sql`) dengan `psql -v ON_ERROR_STOP=1`. Tanpa pgTAP; konvensi:

```sql
do $$
declare fails text := '';
begin
  …
  if fails <> '' then raise exception 'FAIL 0085-DB-n: %', fails; end if;
  raise notice 'PASS 0085-DB-n';
end $$;
```

"Merah" = psql exit non-zero. Setiap blok penyemai dibungkus `begin; … rollback;`.
Pengganti mock: **impersonasi JWT** (§6) dan **stub `search_chat_messages` di dalam transaksi** (§Wave 4) — dipulihkan dengan `rollback`, **tidak pernah** `drop function` (DROP mereset ACL RPC ke PUBLIC EXECUTE).

### 7.2 `lib/search.ts`

```ts
const mockRpc = jest.fn();
jest.mock('../supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));
// eslint-disable-next-line import/first
import { SEARCH_SCOPES, SEARCH_SCOPE_LABEL, cardScopeOf, mapSearchHit, searchGlobal } from '../search';
```

`beforeEach` mereset `mockRpc` dan menyetel `{ data: [], error: null }`. Untuk `L14` tambahkan `jest.mock('../governance-admin', () => ({ searchCards: mockSearchCards }))`.
Lapis **murni tanpa mock apa pun**: `SEARCH_SCOPES`, `SEARCH_SCOPE_LABEL`, `cardScopeOf`, `mapSearchHit`. Tidak ada native module yang tersentuh di berkas ini.

### 7.3 Hook

Mock **data layer**, bukan jaringan:

```ts
jest.mock('@/lib/search', () => ({
  ...jest.requireActual('@/lib/search'),
  searchGlobal: (...a: unknown[]) => mockSearchGlobal(...a),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { channel: mockChannel, removeChannel: mockRemoveChannel } }));
```

`requireActual` menjaga konstanta tetap nyata (mencegah hijau palsu di atas label palsu). Stub `channel`/`removeChannel` dipakai `H10`.
Provider: **hanya** `QueryClientProvider`, helper `makeWrapper()` lokal per berkas (repo tidak punya test-utils bersama), `retry: false`, `gcTime: 0`. `useSearchGlobal` sengaja **tidak** membaca `useAuth`, sehingga `@/providers/auth-provider` tidak perlu di-mock sama sekali.
**Debounce tanpa fake timers** — `rerender` berurutan + `waitFor` nyata (`asyncUtilTimeout: 5000` global di `jest.setup.after-env.js`). Fake timers + react-query v5 bermasalah di suite ini.
queryKey diperiksa lewat cache: `qc.getQueryCache().getAll().map(q => JSON.stringify(q.queryKey))`; `staleTime` lewat `…find(...).options.staleTime`.

### 7.4 Layar

Mock **hook**, bukan data layer:

```ts
jest.mock('@/hooks/use-search-global', () => ({
  useSearchGlobal: (...a) => mockUseSearchGlobal(...a),
  useSearchScopePage: (...a) => mockUseSearchScopePage(...a),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), Stack: { Screen: () => null } }));
jest.mock('@/hooks/use-search', () => ({ useSearchCards: mockUseSearchCards })); // khusus UI-16
```

`@/lib/search` dibiarkan **nyata** supaya label dan rute diuji terhadap konstanta sungguhan. `jest.setTimeout(30000)`. Wrapper `QueryClientProvider` lokal.
Konvensi wajib repo: `// eslint-disable-next-line import/first` di atas import yang menyusul blok `jest.mock`.

---

## 8. Risiko

1. **BL10-OQ-11 belum terbukti.** Gagalnya EXPLAIN di Wave 0 membatalkan bentuk FR-2 — karena itu ia gerbang keras, bukan saran. Menulis wave 4 lebih dulu = pekerjaan yang mungkin dibuang.
2. **Hijau palsu di wave guard.** Guard tanpa kontrol positif lolos di atas fungsi yang selalu kosong. Wave 2 tidak boleh dipecah.
3. **NG-6 dilanggar dengan itikad baik.** Contract test menuntut escaping ⇒ godaan memperbaiki `search_cards` atau menambal di TypeScript. Jaring: `DB-72/73/74` + `L7`/`H07`. Kalau `DB-74` merah karena refactor yang dianggap sah, itu keputusan **owner**, bukan penyesuaian test.
4. **Tidak ada jaring pengaman kedua.** SECURITY DEFINER + `search_path=''` ⇒ satu cabang lupa gate = kebocoran lintas-org senyap. Mitigasi = harness 6 blok per scope, dihitung saat review.
5. **Anti-oracle tidak dapat dites negatif secara tuntas.** Strategi: potong bahannya di hulu (9 field, hook tanpa state turunan) + kesetaraan byte (md5 di DB, `JSON.stringify(toJSON())` di UI). Sisa risiko: afordans "Lihat semua" **hampir** menjadi count; dibenarkan hanya karena ia fungsi dari baris yang sudah terlihat aktor.
6. **Guard 0083 di fixture.** `auth.users` tanpa `raw_app_meta_data.organization_id` menjatuhkan seluruh suite di prelude — kegagalan tampak seperti masalah infrastruktur.
7. **Gerbang tipe.** Regen `database.types.ts` harus dari DB lokal 54322, bukan Supabase MCP (MCP = project staging).
8. **Jebakan Pressable.** `fireEvent.press` pada Pressable ber-`active:` mengosongkan render test **berikutnya**. Semua test tap di akhir berkas; jangan mendebug komponennya.
9. **`fase8-lifecycle-screens.test.tsx`.** Satu-satunya test existing yang sah gugur; risikonya adalah penyalahgunaan sebagai preseden untuk "menyesuaikan" test Arsip.
10. **React Compiler lint.** Debounce via `useEffect` + `setState` berpotensi memicu `react-hooks/set-state-in-effect` (ERROR di CI, luput dari jest/tsc). Salin bentuk `use-search-messages.ts` persis dan jalankan `npm run lint`.
11. **Flake CI.** `test:ci` merah 2× sementara lokal hijau ⇒ curigai **race** press-sebelum-query-resolve, bukan OOM; deploy staging bisa di-skip diam-diam.
12. **rename-guard.** `scripts/no-old-names.sh` memblokir `deploy-staging` bila migrasi/wiki baru menyebut nama pra-0045. Literal warisan seperti `action_plan_instance` di §6.4 adalah **nilai data** — pastikan konteks/EXCLUDES tidak membuat guard merah.
13. **ACL & DROP.** Jangan `DROP … CASCADE` di 0085 — ACL RPC akan reset ke PUBLIC EXECUTE. Gunakan `create or replace` + blok revoke/grant FR-35.
14. **Staging tertinggal.** CI tidak `db push`; verifikasi **efek** di schema staging (fungsi + ACL), bukan isi `schema_migrations`.

---

## 9. Addendum kritik adversarial (fase Grill)

> [!warning] Verdict fase Grill: **perlu-perbaikan**
> Rencana di atas BELUM siap dieksekusi apa adanya. Temuan di bawah dihasilkan agen kritik yang tugasnya membantah rencana, dan sebagian menyerang justru bagian yang paling penting: beberapa test yang dirancang bisa HIJAU tanpa membuktikan apa pun. Tutup dulu yang bertanda severity tinggi sebelum baris test pertama ditulis.

### 9.1 Kasus yang belum tercakup (20)

1. Ordering keluaran UNION ALL tidak diuji. Spec §6.2 menaruh `order by … limit lim` DI DALAM tiap subquery — Postgres TIDAK menjamin urutan itu bertahan di keluaran UNION ALL (Append/parallel bebas mengacak). Tidak ada test DB yang mengassert baris satu grup keluar `created_at desc, id desc` dari satu respons RPC, dan klien dilarang `sort()` (FR-21). DB-64 hanya menguji himpunan gabungan 3 halaman.
2. Test reduksi-RLS (DB-13 dkk) bisa hijau secara vakum: `RPC EXCEPT RLS` juga kosong ketika RPC mengembalikan 0 baris karena bug. Belum ada kontrol positif — assert sisi RLS untuk A2 NON-KOSONG dan ada minimal satu baris yang terlihat A1 tetapi tidak terlihat A2 (subset SEJATI, bukan trivial).
3. `p_scopes = '{}'::text[]` dan `p_scopes = array[null]::text[]` tidak diuji. `array_length('{}',1)` = NULL sehingga guard cursor `array_length(p_scopes,1) <> 1` bernilai NULL → exception bentuk-request TIDAK dilempar padahal request ilegal.
4. Cursor separuh (`p_cursor_ts` diisi, `p_cursor_id` NULL, atau sebaliknya) tidak diuji, padahal perilakunya divergen: cabang card `(created_at,id) < (ts,NULL)` bernilai NULL → semua baris hilang diam-diam; cabang chat (0075:78-82) menangani `p_before_id is null` secara eksplisit.
5. Cursor milik scope lain (sortTs/sortId dari hit chat diteruskan dengan `scopes:['goal']`) tidak diuji di DB maupun hook — bentuk request sah tetapi halaman yang dihasilkan salah.
6. DB-9 tidak membuktikan escaping: `search_global('%%')` menjadi pola `%\%\%%` yang tidak cocok 'Aman' maupun '100% Target' — hijau tanpa diskriminasi. Butuh pasangan diskriminatif: baris `ab` + query `a%` harus 0 baris, baris `a%b` + query `a%` harus 1 baris; idem untuk `_` dan backslash.
7. EE-02 (query hanya whitespace/tab/newline) tidak diuji, termasuk bahwa `'  ab  '` LOLOS guard sementara `' a '` tidak.
8. Interaksi `p_include_archived` dengan cabang chat tidak diuji (FR-31: scope turunan tanpa filter arsip): tidak ada test bahwa hasil chat identik untuk true/false, dan bahwa pesan di action plan terarsip tetap muncul.
9. Isi kolom `subtitle`/`snippet`/`status` untuk 7 scope card tidak diassert (§6.3 mewajibkan subtitle & snippet NULL, status = status baris). DB-6 hanya memeriksa title/parent_id/sort_ts/sort_id, sehingga cabang yang membocorkan description/notes ke snippet lolos.
10. Case-folding non-ASCII dan perbedaan `ilike` (search_global) vs `lower() like` (search_cards 0046:2120) tidak diuji sama sekali.
11. Tabrakan UUID lintas scope tidak diuji di UI: dua hit dengan `id` sama pada scope berbeda (keyExtractor `scope:id`).
12. Scope tak dikenal DARI SERVER: bila DB staging sudah punya 0086/0087 sementara bundle app masih PR-1, `search_global` mengembalikan scope yang layar belum dukung tap-nya. Skew app-vs-DB nyata di proyek ini, tanpa test.
13. FR-34 (observability via logger seam terstruktur: JSON, requestId, hanya metrik agregat, dilarang melog isi query/PII) sama sekali tidak ada di rencana — tidak ada langkah, file, maupun test. `mobile/src/lib/logger.ts` sudah dipakai errors.ts/activation-check.ts. Ini MUST §5.7 sekaligus aturan global proyek.
14. FR-23 (pill 'Cari' di header global → /search) tidak diuji; app-header.test.tsx hanya terdaftar sebagai regresi 'tidak disentuh'.
15. `/inbox/[roomId]` menghormati `?highlight=` tidak diverifikasi. UI-14 hanya mengassert URL yang di-push; bila layar inbox mengabaikan param itu, PR-1 mengirim deep link mati tanpa satu test pun merah.
16. Reset state per-grup saat query berubah: 'Lihat semua' aktif untuk scope X lalu query diubah — queryKey berubah tetapi state lokal 'grup diperluas' bisa bertahan dan merender grup basi/kosong.
17. EE-12 (sesi kadaluwarsa) dan EE-13 (offline → cache terakhir) tidak diuji; wrapper test memakai `gcTime: 0` yang justru meniadakan perilaku EE-13.
18. Jalur biaya/timeout: 8 cabang `ilike '%…%'` di atas 7 tabel tanpa index trigram (NG-13) tidak punya guard test. Kode 57014 hanya di-mock di lapis hook (H08); preflight EXPLAIN hanya untuk delegasi chat, tidak untuk cabang card.
19. Kelayakan fixture A4 (`profiles.organization_id` NULL) tidak diverifikasi. Bila kolom NOT NULL atau trigger 0083 menolak, seluruh harness fail-closed (6 blok × 7 scope) tidak dapat dibangun — harus jadi item preflight.
20. ACL: tidak ada assertion untuk `service_role`, tidak ada test pemulihan ACL bila kelak dipakai DROP+CREATE, dan tidak ada langkah/test untuk reload schema cache PostgREST setelah 0085 (PGRST202 di staging hanya state UI ter-mock).

### 9.2 Kekhawatiran atas rencana (14)

1. [MEKANIS — kemungkinan besar gagal] H09 membaca `qc.getQueryCache().getAll().find(...).options.staleTime`. Di react-query v5, `Query.options` bertipe QueryOptions dan tidak menyimpan opsi observer (`staleTime`, `enabled`, `select`, `placeholderData`). Assertion akan membaca `undefined` dan merah karena alasan yang salah, berisiko 'diperbaiki' dengan melonggarkan test. Pakai `query.observers[0].options.staleTime`. Sama untuk klaim membaca `enabled` dari cache.
2. [KONTRADIKSI INTERNAL] DB-52/DB-54/DB-66/DB-71 mengassert `pg_get_functiondef` TIDAK mengandung `raise exception`, `is_chat_member`, `can_access_confidential_chat`, ` offset `, `insert into`. Tetapi langkah 5 mewajibkan komentar header FR-7 dan langkah 35 mewajibkan komentar per cabang yang menyebut policy padanan — komentar itu hampir pasti memuat token yang dilarang. Assertion teks harus dijalankan atas prosrc yang komentarnya dilucuti, atau memakai token lebih sempit (mis. `from public.chat_messages`).
3. [MEKANIS] Pola isolasi `begin; set local row_security = off; … rollback;` dicampur blok `do $$ … $$` dan `execute 'set local role authenticated'`. `SET LOCAL` di luar blok transaksi eksplisit hanyalah no-op berwarning, dan `ROLLBACK` di dalam DO block tidak legal saat ada transaksi eksplisit terbuka. Salin persis pola yang sudah jalan di 0067/0054 alih-alih mendeskripsikan gabungan yang mungkin tidak dapat dieksekusi — kalau salah, kegagalan tampak seperti 'gate bocor' padahal row_security tidak pernah menyala.
4. [BRITTLE] Pengunci NG-6 lewat `md5(prosrc)`: digest sensitif lingkungan dan akan merah untuk perbaikan keamanan search_cards yang sah di masa depan, dengan pesan membingungkan. DB-72 juga hanya lolos karena 0046 memakai `trim(` bukan `btrim` — perubahan format tanpa makna membaliknya. Jadikan DB-73 (perbedaan PERILAKU berpasangan) penegak utama dan turunkan digest jadi peringatan.
5. [REALISME MOCK] `expect(mockSearchCards).not.toHaveBeenCalled()` (L14) dan `expect(mockUseSearchCards).not.toHaveBeenCalled()` (UI-16) vakum ketika modulnya memang tidak di-import: factory tidak pernah dieksekusi sehingga assertion tidak mungkin gagal. Berguna sebagai harness regresi, tetapi jangan diklaim sebagai bukti NG-6 — buktinya adalah `mockRpc.mock.calls.map(c => c[0])` dan absennya key `cards_search`.
6. [BRITTLE] UI-05 membandingkan `JSON.stringify(screen.toJSON())` dua render sebagai kesetaraan byte. Prop non-deterministik (id a11y generated, kelas react-native-css, node Animated) membuatnya flaky. Definisikan normalisasi eksplisit di depan, atau bandingkan subset ternormalisasi (teks + accessibilityLabel + urutan node).
7. [BRITTLE] UI-10 `getAllByRole('button')).toHaveLength(2)` terikat afordans insidental. SectionCard memang memasang `accessibilityRole="button"` saat pressable (ui.tsx:196), tetapi 'Lihat semua', 'Hapus pencarian', dan aksi EmptyState juga button — akan merah karena perubahan tak terkait. Cukup assert ketiadaan label mutasi.
8. [COPY TIDAK COCOK KODE] UI-06 menebak accessibilityLabel EmptyState '…. Hapus pencarian'; implementasi nyata (ui.tsx:330) memakai `${title}. ${description}` dan aksi punya label sendiri (ui.tsx:347). Assertion harus dibaca dari kode, bukan ditebak, agar wave UI tidak dimulai dengan merah palsu.
9. [DELEGASI] DB-53 (stub swap) valid tetapi bergantung pada: (a) `create or replace` mempertahankan tanda tangan 5-arg dan tipe hasil 9 kolom persis, kalau tidak Postgres menolak 'cannot change return type'; (b) dijalankan sebagai owner fungsi (postgres) — hanya sah di DB lokal/CI, tidak dapat dipakai memverifikasi staging. Batas ini harus tertulis karena rencana juga menjanjikan verifikasi efek di staging.
10. [GUARD GANDA] `q` yang sudah di-btrim+truncate diteruskan ke search_chat_messages yang menerapkan lagi btrim/truncate/escape sendiri. Idempoten hari ini, tetapi tidak ada test yang mengunci bahwa cabang card dan chat mencocokkan prefiks 200 char yang SAMA (query 250 char yang berbeda pada char 201-250).
11. [PAGING CHAT] DB-64 (tanpa duplikasi/kehilangan di batas halaman) hanya untuk goal. Cabang chat memakai jalur cursor yang berbeda total (argumen ke-4/5 milik 0075), justru yang paling mungkin salah. Butuh DB-64 versi chat.
12. [WAKTU & FLAKE] ~17 kasus hook memakai debounce 250 ms dengan timer nyata; H02 bahkan mengassert 'segera setelah rerender belum dipanggil'. Digabung riwayat ci-flake-test-ci dan rn-css-pressable-test-blank-render, wave 6 berisiko flake tertinggi. Pertimbangkan menyuntikkan nilai debounce lewat opsi hook (default 250) agar test dapat memakai 0-10 ms tanpa fake timers.
13. [URUTAN GERBANG] `no-old-names.sh` baru dijalankan di langkah terakhir, padahal 0085 dan amandemen wiki hampir pasti memuat literal warisan (`action_plan_instance` di tabel dispatch §6.4). Jalankan segera setelah migrasi ditulis — memori rename-guard-gates-deploy: biayanya staging merah dan tidak ter-deploy.
14. [GERBANG TANPA KRITERIA] Rencana tidak menetapkan siapa yang memutuskan bila PREFLIGHT-2 (EXPLAIN OQ-11) gagal, dan tidak menetapkan ambang kuantitatif yang disepakati sebelumnya. Tanpa itu, gerbang keras yang benar secara prinsip akan diputuskan sendiri oleh implementor di tengah jalan.

### 9.3 Prioritas penutupan (bacaan saya)

Dua temuan berikut adalah **false-green**: test lulus tanpa menguji apa pun, jadi menutupnya lebih mendesak daripada menambah cakupan.

- **Missing #2 — reduksi-RLS bisa hijau secara vakum.** `RPC EXCEPT RLS` juga kosong ketika RPC mengembalikan 0 baris karena bug. Wajib ada kontrol positif: assert sisi RLS non-kosong DAN minimal satu baris benar-benar terlihat.
- **Missing #6 — DB-9 tidak membuktikan escaping.** `search_global('%%')` menghasilkan pola yang tidak cocok apa pun, jadi hijau tanpa diskriminasi. Butuh pasangan diskriminatif (baris `ab` + query `a%` harus 0 baris; baris `a%b` + query `a%` harus 1 baris).

Berikutnya, tiga yang kemungkinan besar gagal secara mekanis saat dijalankan: **Concern #1** (react-query v5 tidak menyimpan `staleTime` di `Query.options`), **Concern #3** (`SET LOCAL` di luar transaksi eksplisit = no-op berwarning), dan **Concern #2** (kontradiksi internal antara assertion `pg_get_functiondef` dan kewajiban komentar header migrasi).

**Concern #4** juga layak ditolak sekarang: mengunci NG-6 lewat `md5(prosrc)` akan memerahkan perbaikan keamanan `search_cards` yang sah di masa depan dengan pesan yang membingungkan. Kunci perbedaan perilakunya, bukan digest sumbernya.

### 9.4 Penutupan dua temuan false-green (2026-07-22)

Dua temuan berprioritas tertinggi di §9.3 sudah **ditutup di badan rencana**; §9.1 dibiarkan apa adanya sebagai catatan sejarah fase Grill.

**Missing #6 — escaping (§5 langkah 4, `DB-9`).** Kritik aslinya menyebut DB-9 "hijau tanpa diskriminasi"; pemeriksaan ulang menunjukkan itu **separuh benar**. Assertion negatif `'%%'` sebenarnya sudah diskriminatif — bila escaping dicabut, polanya menjadi `%%%%` dan `Aman` ikut terjaring sehingga test merah. Yang tidak diskriminatif adalah assertion **positif** `'0% T'`: pola rusak `%0% T%` dibaca *apa saja · `0` · apa saja · `" T"` · apa saja* dan tetap cocok dengan `100% Target`, jadi ia hijau di kedua dunia.

Diganti dengan pasangan diskriminatif per metakarakter (`%`, `_`, `\`) dan kewajiban meng-assert dua arah. Baris `a\b` juga menutup arah kegagalan yang berlawanan — bukan "baris salah ikut muncul", melainkan **baris benar justru hilang** karena backslash dimakan sebagai escape.

**Missing #2 — reduksi-RLS (§6.4 langkah 4).** Ditutup dengan dua kontrol positif yang dijalankan **sebelum** uji `EXCEPT`: sisi RLS harus mengembalikan > 0 baris (aktor memang berhak melihat sesuatu) dan sisi RPC harus > 0 baris (RPC benar-benar bekerja untuk aktor itu). Tanpa keduanya, `EXCEPT` kosong tidak dapat dibedakan antara "RPC subset RLS" dan "RPC rusak total, nol baris".

Pilihan aktor A2 sekaligus jadi penjaga premis: ia sengaja aktor yang melihat *sebagian*. Bila fixture berubah sehingga A2 tak berhak apa pun, kontrol pertama merah dan menyatakan premisnya bergeser — pola yang sama dipakai `T-BL14-1`/`T-BL14-3` di kontrak 0083.

**Belum ditutup** — tiga kegagalan mekanis (Concern #1 `staleTime` react-query v5, #3 `SET LOCAL` no-op, #2 kontradiksi `pg_get_functiondef`) dan penolakan `md5(prosrc)` (Concern #4). Semuanya masih berlaku dan harus diselesaikan sebelum wave yang bersangkutan dimulai.
