# Spec: Inbox & Chat UI penuh untuk Initiative Chat (UI-S-IN1–IN4)

Status: FINAL — siap disambung ke `/tdd-plan`
Versi rilis target: V1.8.1
Sumber yang dihormati: PRD §57/§63/§64/§94, `wiki/concepts/ui-prototype-gap.md`, `wiki/concepts/scope-guardrails.md`, `wiki/entities/surfaces.md`, `wiki/concepts/architecture.md` (thick-DB/thin-client), `wiki/concepts/permission-model.md`, `wiki/concepts/execution-loop.md` (evidence locking), `wiki/concepts/audit-governance.md`, migrasi `supabase/migrations/0008_fase3_collab.sql`, `mobile/DESIGN.md`.

---

## 1. Problem & Goals

### Problem
Inbox adalah satu dari lima surface utama Rencanapp (`[[surfaces]]`): pusat chat per-Initiative yang anggotanya di-derive otomatis dari akses card. Backend chat sudah lengkap dan ber-governance sejak Fase 3 (migrasi `0008_fase3_collab.sql`): tabel `chat_rooms`, `chat_room_members`, `chat_messages`, `chat_message_reads`, `mentions`; RPC `send_chat_message`, `mark_chat_messages_read`, `get_chat_rooms`; semua append-only, RLS via `is_chat_member()` SECURITY DEFINER. Data layer (`mobile/src/lib/inbox.ts`) + hooks (`mobile/src/hooks/use-inbox.ts`) sudah membungkusnya.

Masalahnya murni di **lapisan presentasi** (regresi visual, bukan bug logika), terverifikasi di kode:
- **Inbox list** (`(tabs)/inbox.tsx`): `SectionCard` seragam berisi `room.name` + `last_message_at` + Badge `unread_count`. Tidak ada search, filter chips, avatar, atau preview pesan terakhir.
- **Chat thread** (`inbox/[roomId].tsx`): pesan dirender via `messages.map` (BUKAN FlatList) sebagai kartu bordered seragam `rounded-2xl border p-4`, **urutan newest-first tanpa reverse**, hanya `body` + waktu — tanpa identitas pengirim, bubble me/them, date divider. Composer: `TextInput` + tombol teks "Kirim". **Composer selalu tampil** tanpa gating.

### Goals (V1.8.1, scope terkunci)
1. **UI-S-IN1** — Inbox list dapat dipindai: search by nama room, chip `Semua`/`Belum dibaca`, avatar (identitas room), preview pesan terakhir (jika `get_chat_rooms` diperluas), unread dot + count clamp `99+`.
2. **UI-S-IN2** — Thread berbubble: bubble me/them (`useAuth().session.user.id`), sender identity (reuse `Avatar`), date divider client-side, urutan kronologis-menaik (perubahan perilaku eksplisit).
3. **UI-S-IN4 (sebagian)** — Composer circular send button + gating read-only untuk workspace-viewer (jika kontrak `can_send` diputuskan).
4. **Banner governance level-room WAJIB** — microcopy "Keputusan formal lewat Action Plan".
5. **Token desain didaftarkan dulu** di `DESIGN.md §7` + `global.css`, reuse `Avatar`/`Badge`/`Text`/`Button`.

### Keputusan scope hasil grill (biner)
**Masuk V1.8.1:** UI-S-IN1 (minus chip PIC/Review/Deadline, minus search isi pesan), UI-S-IN2 penuh, composer circular-send, banner governance.
**DEFER (butuh migrasi baru dan/atau keputusan owner):** seluruh UI-S-IN3 (reactions, read-receipt avatars, reply-quote, system events, banner konteks per-pesan) dan UI-S-IN4 attach-evidence, dan filter chip `Saya PIC`/`Review`/`Deadline`.

---

## 2. Non-Goals
Lihat daftar lengkap di field `non_goals`. Ringkas: tidak ada edit/delete pesan; tidak ada threaded reply; membership tetap derived server-side; chat bukan jalur formal/evidence; reactions/read-receipt-avatars/reply-quote/system-events/attach DEFER; filter chip PIC/Review/Deadline DEFER; search isi pesan DEFER; tidak ada realtime/presence/typing/feed; histori hanya page 0 + tombol "Muat pesan lama"; keanggotaan "PIC induk" tidak didukung backend; avatar = inisial+warna (bukan foto).

---

## 3. Kontradiksi sumber yang dieskalasi ke owner (BUKAN catatan kaki)

> [!warning] OWNER-1 — Reviewer Initiative sebagai chat member
> PRD §57/§64 mencantumkan "Reviewer Initiative", tetapi `recompute_chat_room_members` (0008 baris 275-296) hanya memakai `initiatives.pic_id` + `action_plans.pic_id`/`reviewer_id` — tabel `initiatives` **tidak punya** `reviewer_id`. Keputusan owner WAJIB: koreksi PRD ATAU migrasi tambah kolom + recompute. Sampai itu, peran ini dihapus dari spec/persona dan tidak ditegakkan.

> [!warning] OWNER-2 — emoji reaction vs scope-guardrails §88
> `scope-guardrails §88` melarang "Social reaction/Story/Reels". Implementasi reactions tanpa amandemen tertulis pada `scope-guardrails.md` = pelanggaran guardrail. Default rekomendasi: TOLAK reactions V1.8.1.

> [!warning] OWNER-3 — PIC card induk sebagai member room turunan
> US-16 draft mengklaim PIC Goal/KPI/Strategy otomatis jadi member room turunan; komentar `recompute` (0008 baris 263-265) menyatakan "no-op s/d Fase 4". Klaim dihapus dari spec final.

---

## 4. User Stories (scope V1.8.1)

Semua story tunduk RLS `is_chat_member()`; otorisasi di Postgres, bukan app layer. Keanggotaan derived otomatis (PIC Initiative + PIC/Reviewer Action Plan turunan). Tidak ada invite manual, tidak ada Watcher, tidak ada Reviewer Initiative (lihat OWNER-1), tidak ada keanggotaan PIC induk (lihat OWNER-3).

**Epik 1 — Inbox list (UI-S-IN1)**
- US-1: Sebagai anggota room, saya melihat daftar Inbox dengan avatar + nama Initiative + preview pesan terakhir + waktu relatif, agar tahu room aktif tanpa membukanya.
- US-2: Sebagai user banyak room, saya memilah dengan chip `Semua`/`Belum dibaca`.
- US-3: Sebagai user, saya melihat sinyal unread (dot + "N baru", clamp "99+").

**Epik 2 — Thread bubble & identitas (UI-S-IN2)**
- US-4: Saya membedakan pesan saya (kanan) vs orang lain (kiri, dengan avatar + nama).
- US-5: Saya melihat date divider antar hari untuk orientasi waktu.

**Epik 3 — Composer (UI-S-IN4 sebagian)**
- US-6: Sebagai anggota penuh, saya mengirim pesan via composer dengan tombol kirim bundar, disabled saat kosong.
- US-7: Sebagai workspace-viewer non-member, saya hanya bisa membaca (composer disembunyikan) — bila kontrak `can_send` diputuskan.

**Epik 4 — Governance guard**
- US-8: Sebagai non-member tanpa permission, membuka room → empty/error state, bukan isi pesan.
- US-9: Sebagai pengirim, mention hanya diproses untuk anggota room (non-member silent no-op). UI V1.8.1 mengirim `mentions=[]` (picker DEFER).

---

## 5. Functional Requirements

### A. Inbox list — UI-S-IN1
- **FR-IN1.1** Search input by `room.name` (client-side atas hasil `get_chat_rooms`); tidak memicu query jaringan baru. Placeholder "Cari Initiative". `[GOV]` tidak ada bypass RLS.
- **FR-IN1.2** Filter chips: hanya `Semua` (default) + `Belum dibaca` (`unread_count>0`). Chip `Saya PIC`/`Review`/`Deadline` **tidak dirender** (DEFER — definisi produk & data belum ada).
- **FR-IN1.3** Avatar (komponen `Avatar`, seed=`room.id`) + nama room + preview pesan terakhir. Preview butuh **FR-DATA.1**; tanpa itu degrade ke timestamp.
- **FR-IN1.4** Unread treatment: dot + Badge `{n} baru`, clamp `99+ baru` saat >99. `unread_count` dipakai apa adanya dari server.
- **FR-IN1.5** Empty/loading/error existing dipertahankan + empty-state kontekstual saat filter/search 0 hasil.
- **FR-IN1.6** Tap baris → `router.push('/inbox/{room.id}')`.

### B. Thread — UI-S-IN2
- **FR-IN2.1** Bubble kiri/kanan. **Perubahan perilaku:** balik urutan pesan jadi kronologis-menaik (baseline newest-first tanpa reverse). `currentUserId = useAuth().session.user.id` (terverifikasi tersedia).
- **FR-IN2.2** Identitas pengirim per pesan "them" (Avatar + `author.full_name`); "me" boleh sembunyikan nama; `author` null → fallback "?".
- **FR-IN2.3** Date divider client-side dari `created_at`, **device timezone** (org tz tidak diekspos — known limitation V1.8.1). `created_at` invalid → skip divider.
- **FR-IN2.4** Mark-read on open (existing, idempoten, no-regress).
- **FR-IN2.5** Guard `roomId` undefined → ErrorState "Room tidak ditemukan".
- **FR-IN2.6** Paginasi: page 0 (30 terbaru) + kontrol "Muat pesan lama" untuk page berikut.

### C. Banner governance — WAJIB P0
- **FR-GOV-BANNER** Satu banner level-room non-blocking dapat-ditutup: nama Initiative (dari `room.name`) + link "Buka Initiative" + microcopy kanonik **"Keputusan formal (Review, Bukti, Nilai Hasil) lewat Action Plan — chat untuk diskusi cepat."** (Menggantikan tiga varian bercabang di draft.)

### D. Composer — UI-S-IN4 (sebagian)
- **FR-IN4.1** Tombol kirim circular (ikon panah, ≥44dp, `accessibilityLabel="Kirim pesan"`), disabled saat kosong/whitespace atau `isSending`.
- **FR-IN4.2** Kirim via `send_chat_message` (no-regress): trim body, error inline `accessibilityRole="alert"`, input tidak terhapus saat gagal, invalidate `['chat-messages',roomId]` + `['chat-rooms']`.
- **FR-IN4.3** Composer gating read-only untuk workspace-viewer non-member — **butuh kontrak `can_send`** (DATA-2); DEFER jika belum diputuskan.
- **FR-IN4.4** Mention: `mentions=[]` di V1.8.1 (picker DEFER — tidak ada RPC roster room ber-RLS).
- **FR-IN4.5** Paperclip attach-evidence: **DEFER** (sembunyikan total atau deep-link ke Action Plan submit; tabel `chat_message_attachments` DILARANG — bypass evidence-locking PRD §35).

### E. Governance invariants (mengikat)
- **FR-GOV.1** RLS sole authority; client tidak menambah/melonggarkan filter otorisasi.
- **FR-GOV.2** Append-only & immutable; tidak ada UI edit/delete.
- **FR-GOV.3** Membership derived (tanpa Reviewer Initiative, tanpa PIC induk — lihat OWNER-1/3).
- **FR-GOV.4** Inbox ≠ approval resmi → banner WAJIB (FR-GOV-BANNER).
- **FR-GOV.5** Token desain didaftarkan di `DESIGN.md §7` dulu; reuse komponen existing.

### F. Data-layer (prasyarat)
- **FR-DATA.1** (untuk FR-IN1.3, **DIKONFIRMASI MASUK V1.8.1 — owner 2026-06-26**): perluas `get_chat_rooms()` menambah `last_message_body` + `last_message_author_name` (lateral join `last`-by-`created_at`, tetap SECURITY DEFINER + `where is_chat_member(r.id)`). Tipe TS `ChatRoom` +2 field. RLS dampak: nihil. Butuh migrasi baru (nomor berikutnya). Preview `'{author}: {body}'`; fallback timestamp hanya saat `last_message_body` null.
- **FR-DATA.2** (untuk FR-IN4.3): RPC `get_room_access(roomId)→{can_read, can_send}` atau terima ambiguitas empty-state (gating DEFER). Keputusan diperlukan.

---

## 6. Data Contracts

### Sudah ada — reuse tanpa perubahan
- `get_chat_rooms()` → `(id, initiative_id, name, unread_count, last_message_at)`; `unread_count` sudah mengecualikan pesan sendiri; gated `is_chat_member` (0008 baris 463-468).
- `listChatMessages(roomId, page)` → select `chat_messages` + `author:author_id(id, full_name, email)`, order `created_at desc`, range 30. **Thread membaca via SELECT TABEL LANGSUNG** (bukan RPC) → otorisasi sepenuhnya policy `chat_messages_select` (`is_chat_member OR can_view_workspace`, baris 340).
- `send_chat_message(p_room, p_body, p_mentions)`, `mark_chat_messages_read(p_room)` — append-only, member-gated.
- Komponen `Avatar({name, seed, size})` (ui.tsx:321) + `avatar-color.ts` — **reuse, token tidak perlu didaftarkan ulang**.
- `useAuth().session.user.id` (auth-provider) — sumber `currentUserId`, terverifikasi dipakai di settings.tsx:96 & use-profile.ts:80. **Bukan open question.**

### Delta tipe TS (V1.8.1)
```ts
export type ChatRoom = {
  id: string; initiative_id: string; name: string;
  unread_count: number; last_message_at: string | null;
  last_message_body: string | null;          // FR-DATA.1 (opsional P0)
  last_message_author_name: string | null;    // FR-DATA.1 (opsional P0)
};
// ChatMessage TIDAK berubah di V1.8.1 (reply_to/message_type/event_type DEFER ke V2).
```

### DEFER ke V2 (butuh migrasi baru — desain tercatat, tidak diimplementasi V1.8.1)
- Reactions: tabel `chat_message_reactions` + RPC `toggle_chat_reaction`/`get_chat_message_reactions` — **gate OWNER-2**.
- Read receipt: RPC `get_chat_message_reads(p_room)` SECURITY DEFINER ber-gate `is_chat_member` — **jangan longgarkan policy `chat_message_reads_select` (`reader_id = auth.uid()`)** — gate DEFER-1 (privasi seen).
- Reply-quote: kolom `reply_to_id` self-FK + validasi same-room di RPC.
- System events: `message_type`/`event_type`/`linked_entity_*` + trigger dari `action_plan_submissions`; tidak bisa dipalsukan via composer.
- Banner konteks per-pesan linked-entity: harus validasi `can_access_action_plan` (bukan sekadar tampilkan nama dari `linked_entity_id`) agar tidak bocor.

### Dampak RLS
Tidak ada policy tabel chat existing yang dilonggarkan di V1.8.1. FR-DATA.1 hanya menambah kolom output ke RPC SECURITY DEFINER yang sudah `is_chat_member`-gated.

---

## 7. Acceptance Criteria
Lihat field `acceptance_criteria` (Given/When/Then lengkap, ditandai `FE-only` / `butuh kontrak`). DoD rilis biner: **AC-DOD-V1.8.1**.

---

## 8. Edge Cases & Error/Empty/Loading States
- Inbox loading → `SkeletonList`; error → `ErrorState`+retry; kosong → `EmptyState`; filter/search 0 hasil → empty kontekstual + reset (AC-IN1.8).
- `last_message_at=null` → "Belum ada pesan"; timestamp NaN → string kosong; preview hilang → fallback nama room (tidak render "undefined").
- `unread_count>99` → "99+ baru" (AC-IN1.3).
- Thread `roomId` undefined → ErrorState "Room tidak ditemukan" (AC-IN2.8), bukan empty.
- Room valid tapi kosong → EmptyState + composer aktif (kirim pesan pertama).
- Non-member ditolak RLS (0 baris diam-diam) → tampak "kosong"; **pembedaan tegas non-member vs kosong butuh kontrak `get_room_access`** (DATA-2) — sampai itu, ambiguitas diterima sebagai keterbatasan, dan composer gating workspace-viewer DEFER.
- `author_id=null` (penulis terhapus / system) → guard sebelum `Avatar`, fallback "?"/"Sistem", tidak crash.
- `currentUserId` belum termuat → default semua bubble ke "them" (AC-IN2.4).
- Date divider device-tz (org tz tidak diekspos); `created_at` invalid → skip.
- handleSend: anti double-submit, trim, error spesifik dari `e.message` ("Pesan tidak boleh kosong." / "Hanya anggota room…"), input tidak ter-reset saat gagal, no optimistic insert (V1.8.1).
- Membership dicabut mid-sesi → kirim gagal di server; tampil error inline; banner read-only membantu (idealnya).
- Paginasi >30 → "Muat pesan lama" (AC-IN2.9).

---

## 9. Open Questions
Lihat field `open_questions` (OWNER-1/2/3 eskalasi kontradiksi; DATA-1/2 kontrak; DEFER-1..4 fitur V2; BRAND-1 token; OPT-1 optimistic UI).

---

## 10. Handoff ke TDD

**Fitur:** Inbox & Chat Initiative UI V1.8.1 — presentasi murni + 1 perubahan data layer opsional (FR-DATA.1), di atas backend 0008.

**Urutan TDD yang disarankan (red-green-refactor):**
1. **Prasyarat (bukan test):** daftarkan token ChatBubble / DateDivider / ContextBanner / SendButton di `DESIGN.md §7` + `global.css`.
2. **Tahap 1 — Inbox list:** test render Avatar(seed=room.id) + nama; unread dot/badge + clamp 99+; search by-name + anti-bypass (tidak ada call jaringan baru); dua chip + filter; empty kontekstual; navigasi. Preview pesan terakhir: jika FR-DATA.1 dikerjakan, test '{author}: {body}'; jika tidak, test fallback timestamp.
3. **Tahap 2 — Thread:** test urutan kronologis-menaik (elemen pertama = created_at terlama) sebagai PERUBAHAN dari baseline; bubble me/them (mock `useAuth`); sender Avatar + nama (them); guard author null → "?"; default "them" saat currentUserId kosong; date divider + skip invalid; guard roomId undefined → ErrorState; markRead sekali + invalidate.
4. **Tahap 3 — Composer + banner:** test tombol circular ≥44dp/label; disabled kosong/isSending; send sukses (kosongkan input + invalidate) & gagal (input tetap + error alert); banner governance kanonik tampil + dapat ditutup; mentions=[].
5. **(Kondisional) FR-IN4.3:** hanya jika kontrak `can_send` (DATA-2) diputuskan.

**Mock yang dibutuhkan:** `useAuth` (sudah pola di `__tests__/use-profile.test.tsx`: `{ session: { user: { id: 'u1' } } }`), `useInboxRooms`/`useChatMessages`/`useChatActions`, `supabase.rpc`/`.from`.

**File/area tersentuh:** lihat field `tdd_handoff.paths`.

**Larangan keras untuk TDD:** jangan menulis test/kode untuk reactions, read-receipt avatars, reply-quote, system events, banner konteks per-pesan, attach-evidence, atau filter chip PIC/Review/Deadline — semua DEFER V2 dan/atau gated keputusan owner.
