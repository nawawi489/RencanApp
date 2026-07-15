# TDD Plan: Inbox Chat Attachments (Lampiran Diskusi Gambar)

**Fitur:** Lampiran gambar pada pesan Initiative Chat (PRD section 30 komponen ke-11)
**Spec:** `specs/inbox-chat-attachments.md`
**Branch:** feature branch dari `fix/chat-confidential-rls-64` atau `main`
**Milestone:** V2
**Tanggal:** 2026-07-15

---

## Ringkasan Fitur

Fitur ini membuka pengiriman gambar (JPG/PNG/WebP) sebagai lampiran diskusi informal di chat Initiative. Lampiran diskusi terpisah secara struktural dari Bukti formal (bucket berbeda, tanpa FK ke evidence, whitelist `evidence_files.kind` utuh). V1 dipotong agresif: gambar saja, caption wajib, maks 3 file x 5 MB per pesan, thumbnail inline.

**Alur data:**
1. User pilih gambar via expo-image-picker
2. Client validasi (MIME whitelist, ukuran 5MB, maks 3 file)
3. Upload ke bucket `chat-attachments` (Storage API)
4. Kirim pesan via `send_chat_message` v2 (6-param, dengan `p_attachments jsonb`)
5. Server derivasi metadata dari `storage.objects` (anti-spoof)
6. Viewing: signed URL 60s TTL per-render untuk thumbnail

---

## Daftar File Test

| # | File Test | Layer | Scope |
|---|-----------|-------|-------|
| 0 | `supabase/tests/0059_chat_attachments_contract.sql` | DB (pgTAP) | Bucket, RLS-1..7, SEC-1..3, DATA-1, GOV-1..4, RPC-1..12 (`send_chat_message` v2, `cleanup_orphan_chat_upload`), regression `chat_messages_kind_invariant` untuk system events |
| 1 | `mobile/src/lib/__tests__/storage.test.ts` | Data (pure + storage mock) | Konstanta chat, validateChatFile, validateChatAttachmentCount, buildChatAttachmentPath, uploadChatAttachment, cleanupOrphanChatUpload, getChatAttachmentSignedUrl, contentType forwarding |
| 2 | `mobile/src/lib/__tests__/inbox.test.ts` | Data (RPC mock) | sendChatMessage + p_attachments (+context+reply koeksistensi), listChatMessages select + attachments, backward compat null→[] normalisasi |
| 3 | `mobile/src/lib/__tests__/logger.test.ts` | Data (pure) | storage_path redaction (FR-ATT-SEC.3) |
| 4 | `mobile/src/hooks/__tests__/use-chat-attachment-flow.test.tsx` | Hook | useChatActions.send + attachments, useChatAttachmentFlow (2-phase, anti-double-tap, cleanup, Promise.allSettled error swallowing, invalidation, optimistic timing) |
| 5 | `mobile/src/app/(app)/inbox/__tests__/[roomId].test.tsx` | UI/Screen (existing) | Regresi text-only path, mock shape update untuk hook baru |
| 6 | `mobile/src/app/(app)/inbox/__tests__/[roomId]-attachments.test.tsx` | UI/Screen (**BARU — split di depan**) | ChatAttachButton, composer, AttachmentPreviewRow, ChatAttachmentThumbnail, handleSend, EE-4/6/7/11/14 microcopy & guards |

> **Kenapa split file `[roomId]-attachments.test.tsx` upfront:** `[roomId].test.tsx` sudah 691+ baris; menambah 18 test attachment akan mendorong ke ~1000+. Split di **Step 38** (bukan menunggu step 66 refactor) menghindari nyeri belah tengah implementasi.

---

## Urutan Langkah Red-Green-Refactor

> **Urutan menurut spec §10:** DB contract (bucket + policy + skema + RPC) → unit lib/hook → RNTL layar → regresi. Fase 0 mendahului semua kode TypeScript.

### Fase 0: Migrasi 0059 & Kontrak DB (`supabase/tests/0059_chat_attachments_contract.sql`)

Semua langkah di fase ini menulis pgTAP di `supabase/tests/` dan menjalankan via `docker exec supabase_db_supabase psql` (bukan MCP — lihat [[supabase-local-vs-mcp-gotcha]]).

| Step | Type | Test Ref | Description |
|------|------|----------|-------------|
| 0.1 | RED | BUCKET-1 | `has_table('storage', 'buckets')` + `results_eq` bucket `chat-attachments` dengan `public=false, file_size_limit=5242880, allowed_mime_types={image/jpeg,image/png,image/webp}` |
| 0.2 | GREEN | BUCKET-1 | Migrasi 0059 langkah 1: `insert into storage.buckets ... on conflict do nothing` |
| 0.3 | RED | HELPER-1,2 | `has_function('public','can_write_chat_attachment',array['uuid'])` + `has_function('public','can_read_chat_attachment',array['uuid'])`; `function_privs_are` untuk role `authenticated` (EXECUTE), `anon` & `public` (tanpa EXECUTE); test SECURITY DEFINER via `pg_proc.prosecdef=true` |
| 0.4 | GREEN | HELPER-1,2 | Buat 2 helper `security definer set search_path=''`; grant `authenticated`, revoke `public,anon` |
| 0.5 | RED | HELPER-3 (§5.1 guard) | Test skenario Reviewer Task + PIC Task **anggota room** non-CEO: `can_read_chat_attachment(room)` **true** untuk kedua peran (regresi mencegah pemanggilan `can_access_action_plan()` yang menerapkan klausa 1) |
| 0.6 | GREEN | HELPER-3 | Salin **hanya klausa 2** `can_access_action_plan` (0051:35-46); test wajib hijau tanpa memanggil fungsinya |
| 0.7 | RED | HELPER-4 | Confidential: Reviewer Task **bukan grantee** = `false`; grantee = `true`; CEO = `true`; PIC AP = `true`; non-confidential AP tanpa rule = `true` (semua 5 kasus) |
| 0.8 | GREEN | HELPER-4 | Verifikasi klausa 2 lengkap; ini seharusnya sudah hijau dari step 0.6 |
| 0.9 | RED | RLS-1..3 (INSERT) | Policy INSERT: (a) member depth-3 org=self → allowed; (b) non-member depth-3 org=self → 42501; (c) bucket `evidence` depth-3 → tidak match (policy `bucket_id` filter); (d) org segment ≠ self → 42501; (e) depth < 3 → 42501 (tolak fallback permisif) |
| 0.10 | GREEN | RLS-1..3 | Migrasi langkah 3 (policy INSERT): `bucket_id='chat-attachments' AND depth>=3 AND foldername[1]=current_user_org()::text AND can_write_chat_attachment(foldername[2]::uuid)` |
| 0.11 | RED | RLS-4..7 (SELECT) | Policy SELECT: (a) member = row visible; (b) `can_view_workspace()` non-member = visible; (c) confidential AP tanpa grant = hidden; (d) confidential AP + grantee = visible; (e) bucket `evidence` = tidak match filter |
| 0.12 | GREEN | RLS-4..7 | Policy SELECT via `can_read_chat_attachment` |
| 0.13 | RED | RLS-NONE (UPDATE/DELETE) | Assert **tidak ada** policy UPDATE/DELETE untuk `chat-attachments` (pastikan tabel `pg_policies` bersih; hapus policy = tidak ada, bukan restrictive `false`) |
| 0.14 | GREEN | RLS-NONE | Migrasi tidak mendefinisikan policy UPDATE/DELETE |
| 0.15 | RED | DATA-1 | `has_column('public','chat_messages','attachments')`; `col_type_is` = `jsonb`; `col_not_null` + `col_default_is('[]'::jsonb)` |
| 0.16 | GREEN | DATA-1 | Migrasi langkah 4: `alter table chat_messages add column if not exists attachments jsonb not null default '[]'::jsonb` |
| 0.17 | RED | DATA-2 (shape check) | `chat_messages_attachments_shape`: (a) array 0/1/2/3 = ok; (b) array 4 = 23514; (c) object bukan array = 23514; (d) element non-object = 23514; (e) element tanpa `path` = 23514; (f) `path` non-string = 23514 |
| 0.18 | GREEN | DATA-2 | Migrasi langkah 5 (CHECK) |
| 0.19 | RED | DATA-3 (kind invariant) | `chat_messages_kind_invariant` v2: (a) `kind='user'` + attachments 0/1/2/3 = ok; (b) `kind='system'` + attachments 0 = ok; (c) `kind='system'` + attachments 1 = 23514 (invariant BARU); (d) regresi 0057: `kind='system' + author_id NULL + system_event_type NOT NULL + actor_id NOT NULL` tetap ok |
| 0.20 | GREEN | DATA-3 | Migrasi langkah 6: DROP + CREATE invariant dengan aturan attachments |
| 0.21 | RED | RPC-1 (drop target) | `has_function('public','send_chat_message',array['uuid','text','uuid[]','uuid','uuid'])` = **false** setelah 0059; signature LIVE 6-param setelahnya = **true**; **tidak ada** signature 3-param yatim |
| 0.22 | GREEN | RPC-1 | Migrasi langkah 7: `drop function ... (uuid,text,uuid[],uuid,uuid)` (target 5-param dari 0056, **bukan** 3-param — no-op & bikin overload ambigu) → create signature 6-param |
| 0.23 | RED | RPC-2 (grant) | `has_function_privilege('authenticated', 'public.send_chat_message(...6-arg-signature-baru)', 'EXECUTE')` = true; `anon`, `public` = false (§5.5 grant wajib re-eksplisit setelah DROP+CREATE) |
| 0.24 | GREEN | RPC-2 | Migrasi langkah 7 tail: `revoke ... from public,anon; grant ... to authenticated` |
| 0.25 | RED | RPC-3..7 (validasi) | Skenario RPC (setup `set role authenticated; select set_config('request.jwt.claims', ...)`): (a) non-member → `Hanya anggota room...`; (b) body kosong → `Pesan tidak boleh kosong.` (guard 0008:410 tak berubah); (c) attachments 4 → error domain; (d) path bukan milik `auth.uid()` → error; (e) path `foldername[2] ≠ p_room` → error |
| 0.26 | GREEN | RPC-3..7 | Body RPC v2 (§6.7): urutan validasi 1-7, `pg_advisory_xact_lock(hashtext(path))` per path |
| 0.27 | RED | RPC-8,9 (metadata anti-spoof) | (a) `metadata->>'size' > 5242880` → error (lapis kedua di luar bucket config); (b) `metadata->>'mimetype'` non-whitelist → error; (c) klien mengirim `name/mime/size/kind` yang berbeda dari `storage.objects.metadata` → **input klien diabaikan**, `chat_messages.attachments` menyimpan nilai turunan server (preseden `context_label` 0056) |
| 0.28 | GREEN | RPC-8,9 | Derivasi server-side dari `storage.objects` |
| 0.29 | RED | RPC-10 (regresi 0056) | Pesan dengan `p_context_action_plan` + `p_reply_to` + `p_attachments` tetap: `v_context_label` server-derived, mention loop, `emit_notification` mention-only |
| 0.30 | GREEN | RPC-10 | Body RPC v2 **byte-for-byte mempertahankan** logika 0056; hanya menambah blok attachment validation |
| 0.31 | RED | RPC-11,12 (cleanup) | `cleanup_orphan_chat_upload`: (a) path tereferensi = error (tak boleh hapus objek terpakai); (b) org guard: path dengan `foldername[1] ≠ current_user_org()` = error **sebelum** set_config; (c) owner check: path milik user lain = error; (d) sukses = objek terhapus dari `storage.objects` |
| 0.32 | GREEN | RPC-11,12 | Body cleanup (§6.7 §6.6): 7 langkah dengan org guard dan `pg_advisory_xact_lock` |
| 0.33 | RED | SEC-1 (append-only) | `has_table_privilege('authenticated','public.chat_messages','INSERT')` = false; `UPDATE` = false; `DELETE` = false (grant sudah dicabut di 0008:1037-1044, verifikasi tetap benar setelah 0059) |
| 0.34 | GREEN | SEC-1 | Verifikasi (tak ada perubahan grant) |
| 0.35 | RED | SEC-2,3 (structural guards) | (a) tidak ada FK `chat_messages` → `evidence_files`/`task_submissions`; (b) whitelist `evidence_files.kind` = 9 nilai (tak ditambah); (c) `chat_messages.attachments[*].kind` ≠ subset `evidence_files.kind` (kolom bertipe berbeda konseptual) |
| 0.36 | GREEN | SEC-2,3 | Verifikasi (guard alami — tak ada langkah migrasi) |
| 0.37 | RED | REGRESI | Suite `0019_ap5_ap6_contract.sql`, `0055_chat_message_reactions_contract.sql` (jika ada), `0056_*`, `0057_*` **100% hijau tanpa modifikasi** |
| 0.38 | GREEN | REGRESI | Tidak ada perubahan test lama; hanya jalankan `supabase test db` (atau eq lokal) |
| 0.39 | REFACTOR | Fase 0 | Rapikan bagian, verifikasi urutan migrasi (Supabase CLI mengurutkan by filename), regen `database.types.ts` di akhir |

**Prasyarat V-1 (dari spec §9, sudah ✅ 2026-07-15):** `storage.objects` mengekspos `owner uuid`+`metadata jsonb` — nuansa upload service_role menghasilkan `owner=NULL`; RPC v2 mengasumsikan upload via JWT user. Kalau uploader shift ke Edge Function, ownership binding harus via path segment ke-3 (uploader uuid), bukan `owner`. Catat di kontrak `send_chat_message` sebagai asumsi eksplisit.

### Fase 1: Pure Functions dan Konstanta (storage.ts)

| Step | Type | Test Ref | Description |
|------|------|----------|-------------|
| 1 | RED | CA-1,2,3 | Tulis test import konstanta CHAT_FILE_MAX_BYTES, CHAT_ALLOWED_MIMES, CHAT_MAX_ATTACHMENTS |
| 2 | GREEN | CA-1,2,3 | Deklarasi 3 konstanta di storage.ts |
| 3 | RED | CA-4..10 | Tulis test validateChatFile (7 kasus: boundary, oversize, PDF, null MIME, 0 byte, webp, SVG) |
| 4 | GREEN | CA-4..10 | Implementasi validateChatFile: check size=0, MIME whitelist, size limit |
| 5 | RED | CA-11,12,13 | Tulis test validateChatAttachmentCount (boundary 3, over 4, zero OK) |
| 6 | GREEN | CA-11,12,13 | Implementasi validateChatAttachmentCount |
| 7 | RED | CA-14,15,16 | Tulis test buildChatAttachmentPath (format, no bucket prefix, >=4 segments) |
| 8 | GREEN | CA-14,15,16 | Implementasi buildChatAttachmentPath |
| 9 | REFACTOR | All CA | Rapikan section, regresi existing storage tests |

### Fase 2: Storage Operations (storage.ts - mocked)

| Step | Type | Test Ref | Description |
|------|------|----------|-------------|
| 10 | RED | upload new | Test uploadChatAttachment: success, error propagation, pre-upload validation |
| 11 | GREEN | upload new | Implementasi uploadChatAttachment (mirror uploadEvidenceFile, bucket='chat-attachments') |
| 12 | RED | cleanup new | Test cleanupOrphanChatUpload: RPC call + error propagation |
| 13 | GREEN | cleanup new | Implementasi cleanupOrphanChatUpload (thin RPC caller) |
| 14 | RED | signedUrl new | Test getChatAttachmentSignedUrl: createSignedUrl(path,60), success, error |
| 15 | GREEN | signedUrl new | Implementasi getChatAttachmentSignedUrl |
| 15a | RED | contentType | Assert `.upload(path, blob, { contentType: file.mime })` — silent MIME mismatch akan ditolak validasi server meski client passed |
| 15b | GREEN | contentType | Forward `contentType` di options |

### Fase 3: Data Layer inbox.ts

| Step | Type | Test Ref | Description |
|------|------|----------|-------------|
| 16 | RED | sendChatMessage ext | Test p_attachments forwarded to RPC |
| 17 | GREEN | sendChatMessage ext | Add ChatAttachment type, extend SendChatMessageOpts, update sendChatMessage + listChatMessages select |
| 18 | RED | select check | Test listChatMessages select string contains 'attachments' |
| 19 | GREEN | select check | Verify select string (already in step 17) |
| 20 | RED | backward compat | Test send without attachments = no p_attachments in RPC |
| 21 | GREEN | backward compat | Ensure conditional p_attachments inclusion |
| 21a | RED | combined | Test `sendChatMessage({body, attachments, contextActionPlan, replyTo})` — semua 3 field diteruskan ke RPC dalam satu call (koeksistensi tak boleh regresi) |
| 21b | GREEN | combined | Verifikasi (harus sudah hijau dari steps 17+21) |
| 21c | RED | null-normalize | `listChatMessages` untuk pesan pre-migrasi (row tanpa kolom `attachments` / `attachments=null`) → dipetakan ke `attachments: []` |
| 21d | GREEN | null-normalize | Tambahkan `attachments: row.attachments ?? []` di map function |
| 22 | REFACTOR | All inbox | Clean up types, full regression |

### Fase 4: Logger Hardening

| Step | Type | Test Ref | Description |
|------|------|----------|-------------|
| 23 | RED | FR-ATT-SEC.3 | Test sanitize redacts storage_path keys |
| 24 | GREEN | FR-ATT-SEC.3 | Add 'storagepath' to SENSITIVE_FRAGMENTS |

### Fase 5: Hook Layer (use-inbox.ts)

| Step | Type | Test Ref | Description |
|------|------|----------|-------------|
| 25 | RED | ATT-1,2 | Test useChatActions.send with/without attachments |
| 26 | GREEN | ATT-1,2 | Extend useChatActions.send signature |
| 27 | RED | AF-1 | Test useChatAttachmentFlow happy path |
| 28 | GREEN | AF-1 | Implement useChatAttachmentFlow hook |
| 29 | RED | AF-2 | Test anti-double-tap |
| 30 | GREEN | AF-2 | Add inFlight ref guard |
| 31 | RED | AF-3,4,5 | Test orphan cleanup (partial, all-fail, commit-fail) |
| 32 | GREEN | AF-3,4,5 | Implement cleanup logic with Promise.allSettled |
| 32a | RED | AF-5b (swallow) | Commit gagal **AND** cleanup gagal (Promise.allSettled member `rejected`) → error asli commit yang **di-surface** ke UI (bukan error cleanup) |
| 32b | GREEN | AF-5b | Verifikasi (`Promise.allSettled` swallowing sudah menyediakan behavior; test hanya assert error yang di-throw hook = error commit) |
| 32c | RED | AF-realtime | Realtime INSERT dengan `attachments` non-empty → cache invalidation + re-render bubble menampilkan thumbnail (integrasi payload realtime + kolom `jsonb`) |
| 32d | GREEN | AF-realtime | Verifikasi (harus sudah hijau dari extend `useChatRealtime` — payload lengkap via replica identity full 0052) |
| 33 | RED | AF-6,7 | Test cache invalidation (success yes, failure no) |
| 34 | GREEN | AF-6,7 | Wire onSuccess invalidation |
| 35 | RED | AF-8 | Test optimistic insertion timing (after upload, not before) |
| 36 | GREEN | AF-8 | Implement delayed optimistic insertion |
| 37 | REFACTOR | All AF | Review hook, extract shared logic, full hook regression |

### Fase 6: UI/Screen Layer ([roomId].tsx)

| Step | Type | Test Ref | Description |
|------|------|----------|-------------|
| 38 | RED | ATT-1 UI | Test ChatAttachButton renders with a11y |
| 39 | GREEN | ATT-1 UI | Add ChatAttachButton to composer |
| 40 | RED | ATT-2 UI | Test ChatAttachButton disabled when sending |
| 41 | GREEN | ATT-2 UI | Wire disabled state |
| 42 | RED | ATT-3,4 UI | Test Kirim disabled/enabled with attachments + caption |
| 43 | GREEN | ATT-3,4 UI | Extend composer disabled guard |
| 44 | RED | ATT-5 UI | Test AttachmentPreviewRow in composer |
| 45 | GREEN | ATT-5 UI | Add preview area with ProgressPill |
| 46 | RED | ATT-6 UI | Test remove button fires callback |
| 47 | GREEN | ATT-6 UI | Wire remove handler |
| 48 | RED | ATT-7 UI | Test retry button on failed upload |
| 49 | GREEN | ATT-7 UI | Add retry UI |
| 50 | RED | ATT-8 UI | Test ChatAttachmentThumbnail in bubble |
| 51 | GREEN | ATT-8 UI | Add thumbnail rendering in MessageBubble |
| 52 | RED | ATT-9 UI | Test Skeleton loading state |
| 53 | GREEN | ATT-9 UI | Add Skeleton placeholder |
| 54 | RED | ATT-10 UI | Test error state + 'Muat ulang' |
| 55 | GREEN | ATT-10 UI | Add error/retry state |
| 56 | RED | ATT-11,15 UI | Regression: no thumbnails on text-only/system messages |
| 57 | GREEN | ATT-11,15 UI | Verify conditional rendering |
| 58 | RED | ATT-12 UI | Test 3 attachments = 3 thumbnails |
| 59 | GREEN | ATT-12 UI | Verify loop rendering |
| 60 | RED | ATT-13 UI | Test handleSend passes attachment paths |
| 61 | GREEN | ATT-13 UI | Extend handleSend |
| 62 | RED | ATT-14 UI | Test caption preserved on send failure |
| 63 | GREEN | ATT-14 UI | Ensure error recovery preserves text |
| 64 | RED | ATT-16,17,18 UI | Test client-side validation microcopy (count, size, MIME) |
| 65 | GREEN | ATT-16,17,18 UI | Wire picker validation + microcopy display |
| 65a | RED | EE-4 UI | Microcopy "Tambahkan keterangan singkat untuk gambar ini." tampil saat attachments ada + caption kosong (inline, `accessibilityLiveRegion="polite"`) |
| 65b | GREEN | EE-4 UI | Wire microcopy tepat di atas composer input |
| 65c | RED | EE-6 UI | Picker cancelled (`result.canceled === true`) = **tidak ada** error, tidak ada file ditambahkan, tidak ada toast — diam adalah perilaku benar |
| 65d | GREEN | EE-6 UI | Early return saat cancelled sebelum validasi |
| 65e | RED | EE-7 UI | Picker reject permission = microcopy "Izinkan akses galeri di Pengaturan…" + tombol Settings (call `Linking.openSettings`) |
| 65f | GREEN | EE-7 UI | Wire permission error handler; tombol Settings via `Linking` |
| 65g | RED | EE-11 UI | Double-tap Kirim rapid saat attachments pending: `mockRunSend` dipanggil **satu kali** (integrasi hook `useChatAttachmentFlow.inFlight` di layar) |
| 65h | GREEN | EE-11 UI | Verifikasi `disabled` state + `accessibilityState.disabled=true` selama send |
| 65i | RED | EE-14 UI | Non-member (mock `useIsRoomMember` = false): composer + tombol paperclip **tidak dirender** (bukan disabled — hilang dari DOM); banner governance yang existing tetap tampil |
| 65j | GREEN | EE-14 UI | Conditional render composer berdasarkan membership signal |
| 66 | REFACTOR | All UI | Ekstrak komponen, cek kepatuhan DESIGN.md §7, verifikasi mock shape `useChatActions` factory di beforeEach terupdate konsisten |
| 67 | REFACTOR | Full suite | Regresi menyeluruh: `npm test -- --runInBand` + `npm run type-check` |

---

## Strategi Mocking

### Layer 1: Data (storage.test.ts, inbox.test.ts)

```typescript
// storage.test.ts — mock ../supabase
jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    storage: { from: (...a: unknown[]) => mockStorageFrom(...a) },
  },
}));
// mockStorageFrom returns { upload: mockUpload, createSignedUrl: mockCreateSignedUrl }
// global.fetch mocked for URI-to-blob

// inbox.test.ts — mock ../supabase (existing pattern)
jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));
// mockFrom returns makeQueryThenable builder
```

**Pure functions need NO mock:** validateChatFile, validateChatAttachmentCount, buildChatAttachmentPath, classifyKind, safeFilename.

### Layer 2: Hooks (use-chat-attachment-flow.test.tsx)

```typescript
// Mock data layer at module boundary
jest.mock('@/lib/inbox', () => ({
  CHAT_PAGE_SIZE: 30,
  sendChatMessage: (...a: unknown[]) => mockSendChatMessage(...a),
  listChatMessages: (...a: unknown[]) => mockListChatMessages(...a),
  // ... other exports
}));

jest.mock('@/lib/storage', () => ({
  uploadChatAttachment: (...a: unknown[]) => mockUploadChatAttachment(...a),
  cleanupOrphanChatUpload: (...a: unknown[]) => mockCleanupOrphanChatUpload(...a),
}));

// Render via makeWrapper pattern
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}
```

### Layer 3: UI ([roomId].test.tsx)

```typescript
// Mock hooks at hook boundary (existing pattern)
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));
jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({
    send: mockSend, markRead: mockMarkRead, isSending: mockIsSending,
    pendingAttachments: mockPendingAttachments,
    addAttachment: mockAddAttachment,
    removeAttachment: mockRemoveAttachment,
    retryAttachment: mockRetryAttachment,
  }),
  useChatAttachmentFlow: () => ({ runSend: mockRunSend }),
  useChatRealtime: () => {},
  // ... other hooks
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...a: unknown[]) => mockImagePicker(...a),
  MediaTypeOptions: { Images: 'Images' },
}));
```

---

## Risiko

1. **database.types.ts belum di-regen** — Setelah Fase 0 GREEN, `npx supabase gen types typescript --local` wajib sebelum Fase 3 (kompilasi TS akan gagal tanpa `Database['public']['Functions']['send_chat_message']['Args']['p_attachments']`).

2. **crypto.randomUUID di Jest** — `buildChatAttachmentPath` bergantung pada `crypto.randomUUID`. Preseden `buildEvidencePath` sudah memakainya dan tests pass — Node 19+ di jest-expo menyediakan native. Mitigasi: verifikasi di step CA-14 dulu; kalau gagal, mock di `jest.setup.ts` bukan per-file.

3. **expo-image-picker dependency baru** — `npx expo install expo-image-picker` **sebelum** Step 65a-j. Kalau butuh prebuild, tandai risiko di PR: `--dev-client` bukan Expo Go compatible.

4. **Signed URL minting 100% greenfield** — Tidak ada penggunaan `createSignedUrl` di codebase. Mock shape belum teruji. Mitigasi: unit test data-layer terlebih dahulu (Step 14-15), lalu integrasi hook.

5. **`useChatActions.send` signature cascading update** — Existing test `[4]` mengasser `send('Hai', ['u2'])` positional. Menambah 4th arg `opts` = **breaking** ke 30+ existing tests. **Mitigasi: pindah ke object-arg** `send({body, mentions, optimistic, attachments})` dan update seluruh call-site di Step 25-26 sebagai bagian dari GREEN (bukan tinggal). Fallback: tambah `opts?` **opsional** dengan default `{}`, existing test tetap hijau (`send(body, mentions, optimistic)` masih legal).

6. **Timing optimistic insertion** — Pola baru: bubble muncul SETELAH upload, bukan saat onMutate. **Dual-path risk:** text-only lewat `useChatActions.send` (onMutate lama), text+attachments lewat `useChatAttachmentFlow.runSend` (onMutate baru). Kedua path menulis ke cache key sama. Mitigasi: test [AF-8] + tambahan test integrasi di UI yang memverifikasi text-only path tetap pakai jalur lama (regresi).

7. **Hook mock shape untuk UI** — `jest.mock('@/hooks/use-inbox')` factory di `[roomId].test.tsx` harus diperbarui menambah `pendingAttachments`, `addAttachment`, `removeAttachment`, `retryAttachment`, `useChatAttachmentFlow`. **Update mock di beforeEach di file existing SEBELUM Step 38** (bukan setelah), agar test file baru `[roomId]-attachments.test.tsx` bisa import shared mock helper.

8. **safeFilename bug FALSE POSITIVE** — Klaim yang beredar bahwa `.replace(/[ -]/g, '')` menghapus 0x20–0x2D **salah**. Dump bytes: `2f 5b 00 2d 1f 7f 5d 2f 67` = `/[\x00-\x1F\x7F]/g` (control chars, sesuai docstring). Terminal render lossy menyembunyikan `\x00`/`\x1F`/`\x7F`. **Reuse apa adanya**; **jangan buka isu**. Spec §5.6 mengikat.

9. **NativeWind class vs inline style** — Touch target ≥44×44 HARUS inline style `{width:44,height:44}`, bukan className (tidak flatten di jest). Preseden: `SendButton`, `wiki/log.md` L232.

10. **Fase 0 apply DDL** — MCP Supabase ≠ DB lokal app (54321/54322). Migrasi apply via `docker exec supabase_db_supabase psql -U postgres -d postgres -f supabase/migrations/0059_*.sql`. Lihat [[supabase-local-vs-mcp-gotcha]].

11. **`global.fetch` mock shared state** — `storage.test.ts` sudah punya global fetch mock (line 16-18). Test baru `uploadChatAttachment` **reuse** mock yang sama; jangan override — akan pecah existing `uploadEvidenceFile` tests [S21-S23]. Kalau butuh response berbeda, `mockFetch.mockImplementationOnce`.

---

## Catatan Eksekusi

**Fase 0 (DB):**
- Apply migrasi lokal: `docker exec -i supabase_db_supabase psql -U postgres -d postgres < supabase/migrations/0059_chat_message_attachments.sql`
- Jalankan contract test: `docker exec -i supabase_db_supabase psql -U postgres -d postgres < supabase/tests/0059_chat_attachments_contract.sql`
- Regen types di akhir Fase 0: `npx supabase gen types typescript --local > mobile/src/lib/database.types.ts`
- Verifikasi 0059 = migrasi tertinggi via `git ls-tree --name-only origin/staging supabase/migrations/ | tail` (bukan `ls`; [[verify-baseline-origin-staging]])

**Fase 1-6 (mobile):**
- Jalankan `npm test -- storage.test` setelah setiap green step di Fase 1-2
- Jalankan `npm test -- inbox.test` setelah setiap green step di Fase 3
- Jalankan `npm test -- logger.test` setelah setiap green step di Fase 4
- Jalankan `npm test -- use-chat-attachment-flow` setelah setiap green step di Fase 5
- Jalankan `npm test -- roomId` setelah setiap green step di Fase 6 (dua file: `[roomId].test.tsx` regresi + `[roomId]-attachments.test.tsx` baru)
- Final: `npm test -- --runInBand` untuk full regression
- `npm run type-check` setelah setiap fase selesai
- Regresi wajib: `supabase/tests/0019_ap5_ap6_contract.sql` (ER-3 anti-Reviewer-file-injection) — **tanpa modifikasi**
