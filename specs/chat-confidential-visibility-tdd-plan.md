# TDD Plan — Fix #64: Chat Confidential Visibility (RLS + FTS + Preview + Turunan)

> **STATUS: siap red-phase** (2026-07-15). Draft awal `/tdd-plan` (wf_b8b8acf5-233) verdict `perlu-perbaikan` — 4 bug SQL fatal & 5 blocker owner decision. Bug SQL sudah dikoreksi di §1 & §7.1. Blocker owner decision **sudah dijawab** — lihat §0. §7 tetap dipertahankan sebagai audit trail.

## 0. Keputusan Owner (2026-07-15) — MENGIKAT

Semua rekomendasi diterima:

| ID | Keputusan | Dampak pada migrasi 0059 |
|---|---|---|
| **OWNER-A** | Balik resolusi 2026-07-12 — chat sekarang honor confidential. | Update docstring 0054:22-26 menyebut resolusi baru + referensi #64. |
| **OWNER-B** | Task-reviewer/PIC non-grantee **auto-remove** dari chat_room_members saat AP jadi confidential. | `CREATE OR REPLACE recompute_chat_room_members` supaya skip AP confidential; one-shot backfill `DELETE FROM chat_room_members` untuk existing rows. Konsekuensi: room tidak muncul di list mereka = ekspektasi jelas. |
| **OWNER-C** | Mask **hanya** `last_message_body`. `unread_count` + `last_message_at` tetap muncul. | `get_chat_rooms`: `CASE WHEN <klausa b> THEN cm.body ELSE NULL END` untuk `last_message_body` saja. UI `formatPreview` (inbox.tsx:62-66) sudah fallback ke waktu. |
| **OWNER-D** | Pesan `kind='system'` **dikecualikan** dari gate confidential. | Klausa (b) ditambahi guard: `AND (chat_messages.kind = 'system' OR <klausa b confidential>)`. |
| **SCOPE-1** | Scope-in **mentions + reactions + reads** ke 0059 (bukan follow-up terpisah). | Migrasi 0059 juga DROP+CREATE 3 policy: `mentions_select`, `chat_message_reactions_select`, `chat_message_reads_select` dengan klausa (b) yang sama. Reply-quote (0056) **tidak** di-scope-in — butuh audit terpisah. |

Reference memory: `chat-confidential-64-owner-decisions.md`.


Owner target: back-end paritas 3 surface (RLS `chat_messages_select`, RPC `search_chat_messages`, RPC `get_chat_rooms`) supaya pesan chat pada action plan confidential hanya terlihat oleh member sah yang juga berhak baca AP (CEO / PIC / grantee di `confidential_access_rules`).

Referensi:
- Issue: https://github.com/nawawi489/RencanApp/issues/64
- Spec paritas: `specs/inbox-chat-attachments.md` §5.1 & §6.4
- Test pattern: `supabase/tests/db_contract/0039_fase7_cross_org_isolation.sql`
- Migrasi sumber: `supabase/migrations/0008_fase3_collab.sql` (RLS), `0054_search_chat_messages.sql` (FTS), `0057_chat_system_events.sql` (preview), `0051_hotfix_can_access_action_plan.sql` (klausa 2 canonical)

## 1. Ringkasan Fitur

**Bug:** RLS `chat_messages_select` (0008:336-341) hanya cek `is_chat_member OR can_view_workspace`. Tidak ada gate `confidential_access_rules`. Workspace-viewer non-CEO/PIC/grantee dapat SELECT pesan TEKS chat pada action plan confidential. Efek yang sama terjadi di 2 SECURITY DEFINER RPC (bypass RLS):

1. `chat_messages_select` — RLS langsung. Dampak: `mobile/src/lib/inbox.ts:listChatMessages` (baris 85-103, comment 79-83 menegaskan mengandalkan RLS).
2. `search_chat_messages` — RPC FTS (0054:105-125), gate inline manual mirror RLS. Dampak: `mobile/src/lib/inbox.ts:searchChatMessages` + `use-search-messages.ts`.
3. `get_chat_rooms` — RPC listing room, kolom preview `last_message_body` LATERAL join ke `chat_messages` (0057:241-273). Room-list sudah member-gated, tapi preview body bisa bocor untuk chat member yang bukan grantee. **OPEN QUESTION** owner.

**Perbaikan:** Migrasi `0059_chat_confidential_rls_fts.sql` menerapkan predikat identik di **7 permukaan**: (1) RLS `chat_messages_select`, (2) RPC `search_chat_messages`, (3) RPC `get_chat_rooms` (mask body), (4) trigger/fungsi `recompute_chat_room_members` + backfill DELETE (OWNER-B), (5) RLS `mentions_select`, (6) RLS `chat_message_reactions_select`, (7) RLS `chat_message_reads_select`. **Kerangka logisnya:**

```
klausa (a) organization_id = current_user_org()
           AND (public.is_chat_member(chat_room_id) OR public.can_view_workspace())

klausa (b) — SALINAN klausa-2 can_access_action_plan (0051:34-46), dijoin via chat_rooms,
             DENGAN exemption OWNER-D untuk system events:
           (
             chat_messages.kind = 'system'
             OR EXISTS (
               SELECT 1 FROM public.chat_rooms r
               JOIN public.action_plans ap ON ap.id = r.action_plan_id
               WHERE r.id = chat_messages.chat_room_id
                 AND (
                   NOT EXISTS (
                     SELECT 1 FROM public.confidential_access_rules cr
                     WHERE cr.entity_type = 'action_plan' AND cr.entity_id = ap.id
                   )
                   OR public.user_role_level() = 'ceo'
                   OR ap.pic_id = auth.uid()
                   OR EXISTS (
                     SELECT 1 FROM public.confidential_access_rules cr
                     WHERE cr.entity_type = 'action_plan' AND cr.entity_id = ap.id
                       AND cr.user_id = auth.uid()
                   )
                 )
             )
           )
```

Untuk `mentions_select` / `chat_message_reactions_select` / `chat_message_reads_select`, klausa (b) diadaptasi: join lewat `chat_messages.chat_room_id → chat_rooms.action_plan_id` (bukan `chat_messages.kind` — reactions/reads/mentions pada system event terlihat karena parent-nya terlihat; guard system exemption ada di RLS parent).

> ⚠️ Draft awal plan menulis `chat_messages.action_plan_id`, `is_chat_member(id, auth.uid())`, dan `users.role_level` — **semua salah** (lihat §7). Kerangka di atas sudah dikoreksi.

**JANGAN memanggil `can_access_action_plan()` langsung** — klausa-1-nya menolak Reviewer/PIC-Task, memutus member chat sah (lihat spec `inbox-chat-attachments.md` §5.1).

**Migrasi = 0059** (0058 sudah dipakai dobel di origin/staging: `0058_fix_get_chat_rooms_grant.sql` + `0058_fix_reaction_table_grants.sql`).

## 2. Daftar File Test

| Layer  | File | Peran |
|--------|------|-------|
| DB     | `supabase/tests/db_contract/0059_chat_confidential_rls_fts.sql` (BARU) | 8+ kasus kontrak (lihat §3 red + §8 tambahan) |
| DB     | `supabase/tests/db_contract/0039_fase7_cross_org_isolation.sql` | Referensi pola begin/do/rollback + set_config JWT swap |
| DB     | `supabase/tests/0054_search_chat_messages_contract.sql` | Referensi fixture sentinel prefix (baris 210-227) |
| DB     | `supabase/tests/0045_keyset_list_chat_messages_http.mjs` | **WAJIB rerun** — HTTP end-to-end lewat PostgREST, membuktikan RLS enforced di jalur klien nyata |
| Client | `mobile/src/lib/__tests__/inbox.test.ts` | Regression: bentuk panggilan tetap sama pasca-migrasi |
| Client | `mobile/src/hooks/__tests__/use-search-messages.test.tsx` | Regression: hook menyalurkan array pendek (hasil server-filter) |
| Client | `mobile/src/app/(app)/(tabs)/__tests__/inbox.test.tsx` | Kondisional: fixture rooms `last_message_body:null` bila OPEN-Q memilih MASK |

## 3. Urutan Red → Green → Refactor

### RED (langkah 1-10)
1. **FIXTURE-0059** — bootstrap fixture (2 org, 5 user, 1 AP confidential, 1 chat room, 3 pesan sentinel `__t064_*`, 1 confidential_access_rules). Termasuk seed valid: `role_templates` (level ceo/staff), `permissions('view_all_workspace')`, `user_permissions`, `profiles.is_active=true` — lihat §8 SEED-VALID.
2. **NEGATIVE-1** — workspace_viewer_only SELECT chat_messages → expect 0 (fail pre-fix). WAJIB `set_config('request.jwt.claims',…,true)` **DAN** `execute 'set local role authenticated'` — tanpa `set local role`, RLS di-bypass superuser dan test lolos palsu.
3. **POSITIVE-1** — member_ap SELECT → expect 3. Menjaga tidak regress akses member sah (jebakan klausa-1 can_access_action_plan).
4. **POSITIVE-2** — grantee_outside (workspace-viewer + grantee) SELECT → expect 3.
5. **POSITIVE-3** — CEO & PIC SELECT → expect 3 (validasi cabang `user_role_level='ceo'` dan `pic_id=auth.uid()`).
6. **NEGATIVE-2** — workspace_viewer_only via **named args**: `search_chat_messages(p_query := '__t064_msg', p_limit := 50)`. Assert 0 hit. *(Draft awal memakai positional `('__t064_msg', 50, null)` yang salah — `50` masuk `p_room_id uuid` → type error, lihat §7.)*
7. **POSITIVE-4** — member_ap via search_chat_messages → expect 3.
8. **CROSS-ORG** — ceo_other_org SELECT + RPC → expect 0 masing-masing.
9. **OPEN-Q-PREVIEW** — placeholder: chat member yang bukan grantee/CEO/PIC panggil `get_chat_rooms()`. Assert `last_message_body IS NULL` (default MASK-to-null). Komentar `-- OWNER DECISION 2026-07-15:` menandai keputusan pending.
10. **RED-VERIFY** — `docker exec -i supabase_db_supabase psql -U postgres -d postgres -f supabase/tests/db_contract/0059_chat_confidential_rls_fts.sql`. Harapan: NEGATIVE-1/2 (+OPEN-Q) fail, positif pass. Simpan output.

### GREEN (langkah 11-17, expanded per SCOPE-1 + OWNER-B)
11. **GREEN-1-RLS** — `supabase/migrations/0059_chat_confidential_rls_fts.sql`: `DROP POLICY IF EXISTS chat_messages_select ON chat_messages;` + `CREATE POLICY` dengan klausa (a)+(b) yang **join lewat chat_rooms** (lihat kerangka §1, sudah termasuk `kind='system'` exemption per OWNER-D). Verifikasi kolom via `\d chat_rooms` — pastikan `action_plan_id` masih ada pasca-rename 0045.
12. **GREEN-2-FTS** — `CREATE OR REPLACE FUNCTION search_chat_messages(...)` copy dari 0054 (signature 5-arg: `p_query text, p_room_id uuid, p_limit int, p_before timestamptz, p_before_id uuid`), sisipkan klausa (b) di WHERE gate (lines 111-117). **Wajib** akhiri dengan `REVOKE EXECUTE ... FROM public, anon; GRANT EXECUTE ... TO authenticated;`. Update docstring 0054 head-comment (baris 15-26): balik resolusi 2026-07-12, tunjuk #64 + migrasi 0059 sebagai sumber kebenaran gate baru (OWNER-A).
13. **GREEN-3-PREVIEW** — `CREATE OR REPLACE FUNCTION get_chat_rooms()` (copy 0057:241-273). Modifikasi **hanya** kolom `last_message_body` LATERAL join: `CASE WHEN <klausa b> THEN cm.body ELSE NULL END` (OWNER-C: unread_count + last_message_at TIDAK di-mask). System events tetap tampil karena `kind='system'` lolos klausa (b).
14. **GREEN-4-RECOMPUTE** (OWNER-B) — `CREATE OR REPLACE FUNCTION recompute_chat_room_members(p_action_plan uuid)` (copy 0046:1815-1853). Tambah guard di awal: bila AP confidential (ada baris di `confidential_access_rules where entity_type='action_plan' and entity_id=p_action_plan`), hanya masukkan user yang: (a) `ap.pic_id`, (b) `user_role_level='ceo'`, (c) baris di CR. Task-reviewer/PIC di luar 3 kategori tsb **tidak** di-add. **One-shot backfill** di bagian bawah migrasi: `DELETE FROM chat_room_members crm USING chat_rooms r, action_plans ap WHERE crm.chat_room_id=r.id AND r.action_plan_id=ap.id AND EXISTS(cr for ap) AND crm.member_id NOT IN (ap.pic_id, ceo_ids, grantee_ids)`.
15. **GREEN-5-TURUNAN** (SCOPE-1) — DROP + CREATE POLICY untuk `mentions_select` (0008:361-372), `chat_message_reactions_select` (0055), `chat_message_reads_select` (0008:344-347) dengan klausa (b) yang sama — tapi TANPA exemption `kind='system'` (system events tetap terlihat sudah otomatis via RLS parent; mentions/reactions/reads pada pesan confidential yang di-mask harus ikut hilang). Wajib akhiri masing-masing dengan grant paritas yang benar (mengikuti pola aslinya, biasanya sudah `TO authenticated`).
16. **GREEN-VERIFY** — apply migrasi lokal, rerun test kontrak → semua 11+ kasus hijau (8 core + 3 turunan + backfill assertion). Iterasi klausa (bukan test) bila gagal.
17. **HTTP-VERIFY + MOBILE-REGRESSION** — 
    a. Rerun `supabase/tests/0045_keyset_list_chat_messages_http.mjs` (end-to-end lewat PostgREST + JWT nyata) — bukti RLS enforced di jalur client.
    b. `cd mobile && npm test -- --testPathPattern='(inbox|use-search-messages|cards)'` → harus lulus tanpa modifikasi produksi.

### REFACTOR (langkah 18-21)
18. **REFACTOR-DEDUP** — evaluasi ekstrak helper `can_read_chat_message(p_room uuid)` DEFINER (pola 0051). Gate dengan `EXPLAIN ANALYZE` baseline VS post — skip bila degrade >20%. Baseline harus diukur SEBELUM migrasi (lihat §7.5).
19. **REFACTOR-DOCS** — cross-link paritas di `specs/inbox-chat-attachments.md` §6.4 + pointer ke migrasi 0059.
20. **REFACTOR-WIKI** — append `wiki/log.md` entry `## [2026-07-15] update | Fix #64 chat confidential visibility (RLS + FTS + preview + turunan + backfill auto-remove)`.
21. **SHIP** — commit atomik `feat(chat/security): tighten confidential visibility on RLS + FTS + preview + mentions/reactions/reads + auto-remove non-grantee members (fixes #64)`. Semua 5 keputusan owner sudah locked (§0) — PR bisa langsung dibuat.

## 4. Strategi Mocking (Ringkas)

- **DB (utama, wajib):** TIDAK ada mock. Impersonasi via `set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role','authenticated')::text, true)` + `execute 'set local role authenticated'` (pola 0039). Semua di `begin;/rollback;` + sentinel prefix `__t064_`. Pre-clean `delete from chat_messages where body like '__t064_%'` di header test agar aman kalau rollback sebelumnya gagal.
- **Data-layer client:** `jest.mock('../supabase', ...)` — tetap pola yang ada; **tidak** menambah test enforcement (mustahil verified sisi client karena mock).
- **Hooks:** `jest.mock('@/lib/inbox', ...)`, mock `useAuth`, mock Supabase realtime dengan captured handlers. QueryClient `retry:false, gcTime:0` dalam wrapper `createElement(QueryClientProvider, ...)`.
- **UI:** Hanya jika OPEN-Q memilih MASK — tambah 1 fixture varian di `inbox.test.tsx` mock `useInboxRooms.rooms` dengan `last_message_body:null` → assert `formatPreview` fallback ke waktu.

**Larangan:** JANGAN pakai MCP Supabase untuk DDL — arahkan ke `docker exec supabase_db_supabase psql` (memory `supabase-local-vs-mcp-gotcha`).

## 5. Risiko & Mitigasi

- Drift 3 surface → satu migrasi 0059 + docstring pengingat.
- Salah panggil `can_access_action_plan()` → POSITIVE-1 menguji member biasa.
- OPEN-Q preview belum diputuskan → default MASK-to-null; PR menunggu ack owner.
- Nomor migrasi 0058 dobel → cek `git ls-tree origin/staging supabase/migrations/` sebelum push; audit order-of-apply dua file 0058 di staging (lihat §7 MIGRATION-NUMBERING).
- MCP Supabase ≠ DB lokal → gunakan `docker exec supabase_db_supabase psql`.
- Skema `action_plan_id` (di `chat_rooms`, BUKAN `chat_messages`) → verifikasi `\d chat_rooms` sebelum menulis predikat.
- Planner cost naik → langkah 16 gate refactor via explain analyze baseline.
- Cross-org grantee leak (kalau `confidential_access_rules` tak punya `organization_id`) → CROSS-ORG test wajib + kasus CR-CROSS-ORG (§8).
- Fixture pollution → pre-clean di header test.
- HTTP fixture 0045 mungkin bergantung visibility non-member → rerun & sesuaikan seed user, bukan produksi.
- Owner 2026-07-12 pernah memutuskan "chat tidak model confidential per-room" (docstring 0054:22-26) — fix ini membalik keputusan itu. **Perlu re-konfirmasi owner sebelum menulis SQL.**

## 6. Definition of Done

- [ ] 8+ kasus di `0059_chat_confidential_rls_fts.sql` hijau di DB lokal.
- [ ] HTTP fixture 0045 hijau tanpa modifikasi produksi (seed test boleh disesuaikan).
- [ ] `npm test` di `mobile/` hijau tanpa modifikasi produksi client.
- [ ] Docstring 0054 diperbarui menyebut paritas + bug #64.
- [ ] `specs/inbox-chat-attachments.md` §6.4 punya cross-link ke 0059.
- [ ] `wiki/log.md` punya entry `## [2026-07-15] update | Fix #64`.
- [ ] PR reference `Fixes #64`, checklist owner untuk keputusan §8 (MASK-to-null default) ada di deskripsi.
- [ ] Output `psql -f 0059_*` (hijau) dilampirkan di PR.

---

## 7. KOREKSI dari Critic (WAJIB dibaca sebelum implementasi)

Verdict `/tdd-plan` critic: **perlu-perbaikan**. 4 bug fatal + 5 gap paritas + 8 gap test coverage.

### 7.1 Fatal (migrasi tidak akan parse)

| # | Bug di draft awal | Perbaikan |
|---|---|---|
| F1 | `chat_messages.action_plan_id` — kolom **tidak ada** di `chat_messages` (0008:177-184 hanya `chat_room_id`). | Join via `chat_rooms.action_plan_id` — lihat kerangka §1. |
| F2 | `is_chat_member(id, auth.uid())` — signature salah. Fungsi aktual (0008:229): `public.is_chat_member(p_room uuid)` — 1 argumen, `auth.uid()` implicit. | `is_chat_member(chat_room_id)` — 1 argumen saja. |
| F3 | `EXISTS (SELECT 1 FROM users u WHERE u.role_level='ceo')` — tabel `public.users` tidak ada; `auth.users` tak punya `role_level`. | `public.user_role_level() = 'ceo'` — helper kanonik (dipakai 0051:39). |
| F4 | `search_chat_messages('__t064_msg', 50, null)` positional — arg `50` masuk ke `p_room_id uuid` → `invalid input syntax for type uuid: "50"`. Signature: `(p_query text, p_room_id uuid, p_limit int, p_before timestamptz, p_before_id uuid)`. | Named args: `search_chat_messages(p_query := '__t064_msg', p_limit := 50)`. |

### 7.2 GRANT paritas (silent leak risiko)

- **GRANT-1** — `CREATE OR REPLACE FUNCTION` **tidak** menghapus GRANT lama. Kalau signature RPC berubah (mis. plan menambah arg), maka overload baru = **anon bisa CALL by default**. Wajib akhiri setiap `CREATE OR REPLACE` dengan `REVOKE EXECUTE ... FROM public, anon; GRANT EXECUTE ... TO authenticated;`
- **GRANT-2** — kalau refactor step 16 dilakukan (helper `can_read_chat_message`), helper DEFINER wajib `GRANT EXECUTE ... TO authenticated; REVOKE ... FROM public, anon;` pola 0051.

### 7.3 Owner-decision — SEMUA SUDAH DIJAWAB (2026-07-15)

Lihat §0 di puncak dokumen untuk keputusan mengikat. Sub-poin di bawah dipertahankan sebagai audit trail atas pertanyaan yang diajukan:

- **OWNER-A** — Docstring 0054:22-26 kutip resolusi 2026-07-12: "chat tidak model confidential per-room". Fix #64 membalik itu. Butuh konfirmasi owner eksplisit **sebelum** menulis SQL (bukan sekadar checklist PR).
- **OWNER-B (skenario paling terlihat user)** — Task-reviewer/task-PIC yang jadi chat_room_members via `recompute_chat_room_members` (0046:1815-1853) tapi bukan AP.pic_id/grantee/CEO: mereka buka room, lolos klausa (a), gagal klausa (b) → **melihat 0 pesan**. Pilihan owner: (i) block gate (mereka blind), (ii) hapus mereka dari chat_room_members saat AP jadi confidential, (iii) auto-grant CR untuk member yang di-add. Plan draft hanya mask preview — tidak menutup jalur `listChatMessages`.
- **OWNER-C** — `unread_count` di `get_chat_rooms` untuk non-grantee: inc atau 0? Kalau body di-mask tapi counter jalan, badge tetap muncul = leak timing/existence. Sama untuk `last_message_at` (side-channel timing).
- **OWNER-D** — apakah pesan `kind='system'` (0057) dikecualikan dari gate confidential? System message umumnya bukan konten sensitif — argumen kuat untuk exempt via `AND (kind='system' OR <klausa b>)`.

### 7.4 Permukaan turunan yang belum ditutup

Plan draft hanya menyentuh 3 permukaan issue. Ini gap paritas yang perlu keputusan scope-in / follow-up issue:

- **mentions** (`mentions_select` 0008:361-372) — non-grantee yang di-mention di pesan confidential bisa `select` baris mention → infer keberadaan pesan.
- **chat_message_reactions** (0055) — non-grantee bisa `select` reactions → konfirmasi keberadaan pesan + siapa yang react.
- **chat_message_reads / chat_message_reads_seen_by** (0053) — sama.
- **chat_message_context_reply** (0056) — reply-quote bisa membocorkan snippet parent-confidential ke pesan child yang tidak-confidential (butuh verifikasi apakah body parent di-embed di kolom).

Rekomendasi: **scope-in mentions + reactions + reads ke 0059** (relatif murah, gate sama), **scope-out reply-quote ke follow-up** (butuh design decision terpisah).

### 7.5 REFACTOR-BASELINE

Kriteria "skip jika degrade >20%" (step 16 draft) tanpa baseline pra-migrasi = selalu "aman". Perlu langkah 15b:

```
docker exec supabase_db_supabase psql -U postgres -d postgres -c \
  "EXPLAIN ANALYZE SELECT * FROM chat_messages WHERE chat_room_id = '<uuid>' ORDER BY created_at DESC LIMIT 30"
```

Simpan output pre-migrasi, ukur post-migrasi, delta terukur = gate keputusan refactor.

### 7.6 MIGRATION-NUMBERING audit

Dua file 0058 di origin/staging membuktikan pola filename-ordering sudah dilanggar. Selain memilih 0059, audit sekali: apakah dua 0058 apply dalam urutan yang benar di staging saat ini? (Kalau tidak, GRANT reaction table mungkin overwritten sebelum GRANT get_chat_rooms — perlu di-check terpisah, bukan bagian PR ini.)

---

## 8. Tambahan Test Cases dari Critic

Tambahkan ke `0059_chat_confidential_rls_fts.sql`:

| ID | Skenario | Expected |
|---|---|---|
| SEED-VALID | Pra-test: raise notice bila `role_templates(level='ceo')`, `permissions('view_all_workspace')`, `user_permissions` untuk workspace_viewer_only, `profiles.is_active=true` tidak lengkap. | Skip berujung FAIL, bukan skip diam. |
| POSITIVE-5 | Task-reviewer chat member, non-grantee (skenario OWNER-B). | Sesuai keputusan owner (0 atau 3). |
| POSITIVE-6 | System event (`kind='system'`, `author_id=NULL`). Impersonasi non-grantee member. | Sesuai keputusan OWNER-D (0 atau 1). |
| NEGATIVE-3 | Mentions leak — workspace_viewer_only `select count from mentions where chat_message_id in (<sentinel>)`. | 0 (jika mentions_select di-extend). |
| NEGATIVE-4 | Reactions leak — sama untuk `chat_message_reactions`. | 0 (jika 0055 policy di-extend). |
| OPEN-Q-listChatMessages | Room member non-grantee `select count from chat_messages where chat_room_id=<room>`. | Sesuai OWNER-B. |
| OPEN-Q-unread | `select unread_count from get_chat_rooms() where id=<room>` untuk non-grantee member. | 0 atau counter aktual (OWNER-C). |
| REPLY-QUOTE-1 | Pesan child dengan `context_entity_type='chat_message', context_entity_id=<parent-confidential>`. Impersonasi non-grantee di room lain. | Child tidak menyertakan quote body parent (butuh verifikasi apakah body di-embed di kolom). |
| CR-CROSS-ORG | Grantee org A dengan CR row pointing ke UUID AP org B. | 0 rows (klausa (a) `organization_id=current_user_org()` menang). |
| IDEMPOTENSI | Apply 0059 dua kali. | `pg_policies` count = 1 untuk `chat_messages_select`. |
| GRANT-PARITY | `has_function_privilege('anon', 'search_chat_messages(...)', 'EXECUTE')` = false; `authenticated` = true. | Enforced. |
| HTTP-E2E | Pola `0045_http.mjs`: JWT viewer non-grantee → `GET /rest/v1/chat_messages?chat_room_id=eq.<room>`. | `[]`. |

---

## 9. Perbandingan dengan Referensi Paritas

`specs/inbox-chat-attachments.md` §6.4 `can_read_chat_attachment` sudah menerapkan pola yang sama untuk file lampiran (Storage RLS). Predikat di §1 di atas adalah versi mirror untuk row `chat_messages`. Wajib **sinkron 1:1** — jika attachment gate berubah, gate ini juga berubah (dan sebaliknya). Cross-link di §6.4 setelah 0059 landing.
