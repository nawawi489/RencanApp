# Spec: Penyelarasan layar Diskusi Rencana Aksi terhadap prototipe `#inbox-chat` (4 gap)

- **Status:** FINAL — siap `/tdd-plan` (Batch A tanpa syarat; Batch B setelah OQ-2)
- **Versi target:** V1.8.2
- **Layar:** `mobile/src/app/(app)/inbox/[roomId].tsx`
- **Prototipe pembanding:** `design.html` screen `#inbox-chat` (baris 6799–6858)
- **Branch:** `remove-status-priority-menu` · migrasi terakhir: `0058` · **spec ini menambah 0 migrasi**
- **Sumber yang dihormati:** `PRD.md` V1.8.2 §2, §5, §7.2, §9, §24.1, §30, §35, §38, §41; `prd/01-konsep-dan-fondasi.md` §12; `prd/03-sistem-permission-data-governance.md`; `specs/inbox-chat-ui.md`; `wiki/entities/surfaces.md`; `wiki/concepts/scope-guardrails.md`; `DESIGN.md`; migrasi `0005`, `0008`, `0019`, `0045`, `0046`, `0051`, `0052`, `0053`, `0056`, `0057`

---

## 1. Problem

Layar Diskusi Rencana Aksi sudah lengkap secara backend (reaction, seen-by, reply/context, system events — migrasi 0055–0057). Perbandingan screenshot prototipe vs implementasi RN pada 2026-07-14 menyisakan empat selisih. **Riset membalik premis dua di antaranya.**

**GAP 1 — Header tanpa identitas room.** Judul polos via `Stack.Screen` (`[roomId].tsx:677`); avatar grup + "N anggota" turun ke `RoomContextBar` in-body (:299-349). Prototipe memakai grid 5 kolom dengan subtitle bersegmen.

**GAP 2 — Composer tanpa tombol `+` dan paperclip. → CACAT PROTOTIPE, bukan kekurangan RN.**
Paperclip berlabel "Lampirkan bukti" (`design.html:6853-6858`) bertentangan langsung dengan **PRD §30 rule 4** ("Bukti tetap dikirim melalui Task, bukan sebagai chat biasa"), dengan `GovernanceBanner` yang sudah live dan diuji di layar yang sama, dan dengan larangan tertulis `specs/inbox-chat-ui.md` FR-IN4.5 (tabel `chat_message_attachments` **DILARANG** — bypass evidence-locking PRD §35). Skema mendukung PRD: `chat_messages` nol kolom attachment, `body` NOT NULL (memblokir pesan attachment-only). Isi menu `+` **nol sumber** — PRD §30 komponen 9 hanya menulis "Composer"; prototipe hanya punya glif tanpa perilaku. **Yang salah adalah prototipe.**

**GAP 3 — Date divider miskin konteks.** `dayLabel()` (:49-53) menghasilkan "14 Jul" tanpa label relatif. Prototipe: "Kemarin · 20.30".

**GAP 4 — Placeholder generik.** RN "Tulis pesan…" (:790). Prototipe "Tulis pesan ke tim Initiative" — **dua kali salah**: terminologi pra-rename (RWT-04: `Initiative` kini level 2, chat terikat `action_plans` level 3) dan mengasumsikan jenis room.

> [!warning] **Koreksi premis brief — tidak ada "jenis room"**
> Brief meminta "placeholder dinamis per jenis room". Dimensi itu tidak ada di skema: `chat_rooms.action_plan_id` NOT NULL UNIQUE (`0008:159`, rename `0045:77,129`), room di-seed trigger `tg_action_plan_chat_room` dari nama Action Plan. Room "SOP Shift Pagi" adalah **nama sebuah Rencana Aksi**, bukan jenis room lain. Membangun percabangan per-jenis-room = mengkodifikasi model data yang tidak ada. Yang variabel adalah **nama**, bukan jenis.

---

## 2. Goals

1. **G1 — Header memuat identitas room:** back + avatar grup + judul + "N anggota" + status non-active + tombol Anggota & Rencana Aksi. Nol migrasi.
2. **G2 — GAP 2 ditutup tanpa kode**, dengan alasan tertulis dan test negatif yang menjaganya tetap tertutup.
3. **G3 — Divider berlabel relatif** ("Hari ini"/"Kemarin"/tanggal), device-tz, tanpa jam, dengan keputusan tz yang eksplisit.
4. **G4 — Placeholder diturunkan dari `room.name`.**
5. **G5 — Nol regresi governance:** GovernanceBanner, append-only 2-lapis, `is_chat_member()`, evidence locking tetap utuh.
6. **G6 — Nol migrasi, nol bucket, nol RPC baru, nol policy disentuh.**

**Nilai:** murah (3 FR, 2 modul pure, 1 perluasan select), menghapus utang nyata (collision divider antar-tahun), dan mendokumentasikan secara tertulis bahwa prototipe stale di dua titik sehingga gap-analysis berikutnya tidak mengulang temuan yang sama.

---

## 3. Non-Goals

Presence · attachment/bucket · tombol `+` · "Tautkan Tugas" · deep-link bukti di composer · jam divider · org-tz · `isError` pada `useChatRoom` · konsolidasi `inbox-timeline.ts` · migrasi inverted FlatList · refactor layar · pembalikan divergensi RN yang disengaja (GovernanceBanner, read-receipt modal, reaction pill 44px, tombol "Rencana Aksi", @mention) · perbaikan `action_plans_select` vs `can_access_action_plan()` · celah `can_access_task()` pada `send_chat_message` · resync `chat_rooms.name`.

---

## 4. Kontradiksi sumber yang dieskalasi

> [!warning] **K-1 — Prototipe `#inbox-chat` stale di dua titik**
> (a) Paperclip melanggar PRD §30 rule 4 + FR-IN4.5. (b) Copy "Initiative" pra-RWT-04. Spec menyalin **intent**, bukan **string**. → OQ-6.

> [!warning] **K-2 — Presence bukan pembacaan "status" yang benar**
> PRD §30 komponen 1 menulis "status". Di seluruh PRD "status" berarti status Card/eksekusi (§10.4, §38). Nol sumber data presence di 58 migrasi. `profiles.is_active` adalah flag akun HR — **bukan** presence, jangan dipakai.

> [!warning] **K-3 — `send_chat_message` punya celah kerahasiaan aktif (di luar scope, WAJIB dibaca)**
> `0056:62-67` memuat `tasks.name` di bawah SECURITY DEFINER tanpa `can_access_task()`. Guard yang ada hanya kesamaan `action_plan_id` — itu menjamin **relevansi**, bukan **keterbacaan**. Karena `chat_messages` append-only 2-lapis, kebocoran `context_label` bersifat **permanen tanpa jalur redaksi**. Fitur dorman hanya karena tipe vars klien tidak membawa `opts` — bukan karena ada guard. Spec ini sengaja **tidak** mengaktifkannya. → OQ-4.

### Klaim yang diverifikasi SALAH dan dibuang dari spec

| Klaim di draft | Verifikasi | Status |
|---|---|---|
| "Anggota room bisa gagal SELECT `action_plans` karena `confidential_access_rules`" | `action_plans_select` (`0046:2765`) **tidak punya** gate confidential; gate itu hanya di `can_access_action_plan()` (`0051:34-46`). Membership derived dari `action_plans.pic_id` ∪ `tasks.pic_id`/`reviewer_id`; policy mengizinkan `pic_id OR action_plan_has_my_task(id)`, dan helper itu (`0046:1480-1484`) cek `tasks.pic_id OR reviewer_id`. Irisannya **total**. | **Dibuang.** Fallback null tetap ada sebagai defensif, tanpa DB contract test (state tak tercapai). |
| "Workspace-viewer non-member: header kosong karena `chat_rooms_select` gated `is_chat_member`" | Policy sebenarnya (`0008:324-327`) = `is_chat_member(id) OR can_view_workspace()`. Viewer **membaca room normal**; yang kosong hanya roster (`chat_room_members_select`, `0008:331-333`). | **Diperbaiki** → AC-1.6, EC-3. Docstring stale `getChatRoom` (`inbox.ts:257`) — sumber kesalahan ini — ikut diperbaiki. |
| "`useChatActions` membuang `opts`" | Tipe vars = `{ body, mentions, optimistic? }` (`use-inbox.ts:156`). `opts` **tidak pernah ada**. Diff draft tidak akan type-check. | **Dibuang** bersama fitur "Tautkan Tugas". |
| "Bucket `evidence` menolak chat secara struktural; policy-nya kini mengikat `action_plans` level-3 pasca-rename" | Policy Postgres bind by **OID**, bukan nama. Bukti: `0019` menulis `FROM public.action_plans`; dump `0046:2867` atas policy sezaman berbunyi `FROM tasks ap … can_access_task(ap.id)` — rename rebind otomatis dan benar. `evidence_insert_pic_only` efektif = `tasks.id = path[2] AND tasks.pic_id = auth.uid()`, konsisten dengan `buildEvidencePath` (`storage.ts:57`, `path[2]=taskId`). | Kekhawatiran governance **tidak terbukti**. Tetapi klaim "mustahil secara struktural" **tetap dibuang** sebagai argumen utama — larangan attachment bersandar pada **FR-GOV.3 (normatif)** + test negatif, bukan pada struktur. |

---

## 5. User Stories

Otorisasi layar ini ditentukan **keanggotaan room** (`is_chat_member()`), bukan peran governance. Anggota = `action_plans.pic_id` ∪ `tasks.pic_id` ∪ `tasks.reviewer_id`. Kelas keempat yang nyata: **workspace-viewer non-anggota** — bisa membaca pesan & room, tidak bisa mengirim, roster-nya kosong.

- **US-1** Sebagai anggota room, saya melihat header berisi avatar grup, nama Rencana Aksi, jumlah anggota, dan tombol Anggota + Rencana Aksi, agar tahu sedang di percakapan mana tanpa menggulir. *(FR-1)*
- **US-2** Sebagai anggota room pada Rencana Aksi yang sudah **selesai/diarsipkan**, saya melihat penanda itu di header, agar tahu diskusi ini menempel pada rencana yang sudah ditutup. *(FR-1)*
- **US-3** Sebagai workspace-viewer non-anggota, saya bisa membaca percakapan tanpa header rusak meski roster tidak terbaca. *(FR-1, EC-3)*
- **US-4** Sebagai anggota room, saya melihat "Hari ini"/"Kemarin" pada pemisah tanggal, agar cepat tahu seberapa baru percakapan. *(FR-3)*
- **US-5** Sebagai anggota room, saya melihat placeholder yang menyebut nama room, agar tidak salah kirim. *(FR-4)*
- **US-6** Sebagai organisasi, saya ingin banner "Chat bukan jalur formal" tetap berdiri dan tetap **benar** setelah keempat gap diproses — tidak ada afordans baru yang mengontradiksinya. *(FR-GOV)*

---

## 6. Functional Requirements

### FR-GOV — Mengikat seluruh spec

| ID | Requirement |
|---|---|
| **FR-GOV.1** | Baca hanya lewat jalur ber-RLS existing (`supabase.from()`). Dilarang menambah filter otorisasi di klien; dilarang melonggarkan policy. *(PRD §9)* |
| **FR-GOV.2** | Tulis hanya lewat RPC SECURITY DEFINER. `chat_messages` tetap append-only. *(0008:13, 305-315, 1020-1032)* |
| **FR-GOV.3** | **Larangan tanpa syarat:** tidak ada kolom attachment, tidak ada `chat_message_attachments`, tidak ada bucket Storage baru, tidak ada upload dari layar chat. Dasar: **normatif** (PRD §30 rule 4, §35; FR-IN4.5) — bukan argumen struktural. Penegak: FR + test negatif AC-GOV.1/GOV.2/GOV.4. |
| **FR-GOV.4** | `GovernanceBanner` tidak boleh dihapus/dilemahkan/dikontradiksi. Uji tiap kontrol baru: "bisakah dibaca sebagai jalur bukti/approval?" Ya → tolak. **Catatan penegakan:** banner bisa di-dismiss permanen per-user, jadi FR ini tidak boleh bersandar pada kehadirannya — satu-satunya jaminan yang kokoh adalah tidak membangun afordansnya sama sekali (FR-2). |
| **FR-GOV.5** | Copy wajib terminologi V1.8.2: **"Rencana Aksi"**, tidak pernah "Initiative". |
| **FR-GOV.6** | Kontrol interaktif ≥44×44 lewat **inline style** (class NativeWind tidak selalu flatten di jest — Critic §8.4, `[roomId].tsx:9-10`). Warna bukan satu-satunya sinyal. Token baru → `DESIGN.md` dulu, lalu `global.css`. |
| **FR-GOV.7** | Kelas read-only (workspace-viewer non-anggota) tetap tanpa gating — `FR-DATA.2` DEFER. Tidak ada FR di sini yang boleh memperburuknya. |

### FR-1 — Header identitas room

| ID | Requirement | Prio |
|---|---|---|
| FR-1.1 | Header 4 slot: back · avatar grup · blok judul+subtitle · aksi kanan. | P0 |
| FR-1.2 | Back tetap `HeaderBack` global 44×44 (`(app)/_layout.tsx:41`). Tidak ada implementasi back baru. | P0 |
| FR-1.3 | Judul = `room.name`; fallback `"Diskusi Rencana Aksi"`. | P0 |
| FR-1.4 | **Jalur teknis: `Stack.Screen options={{ headerTitle: () => <Node/>, headerRight: () => <Node/> }}`.** Dilarang `headerShown:false` — akan membuang override `HeaderBack` global + gesture back native untuk satu layar. | P0 |
| FR-1.5 | Subtitle: segmen 1 = `{N} anggota`; segmen 2 = status **hanya bila non-active**. Pemisah `·` hanya muncul saat kedua segmen ada. | P0 |
| FR-1.6 | Peta status → copy: `done` → `"Rencana Aksi selesai"`, `archived` → `"Rencana Aksi diarsipkan"`. `active`, `draft`, `null`, `undefined`, dan nilai tak dikenal → **segmen tidak dirender**. Rasional `active`: trigger (`0046:2651`) hanya membuat room saat `status='active'` → menampilkannya adalah **tautologi**. Rasional `draft`: **unreachable** — room-nya tidak pernah ada. | P0 |
| FR-1.7 | Status di-fetch dengan **memperluas `getChatRoom()`** + key `['chat-room', roomId]` existing. Dilarang hook/query baru. Nol migrasi. | P0 |
| FR-1.8 | Aksi kanan: tombol **"Anggota"** (buka `MembersModal` existing) + **"Rencana Aksi"** (deep-link existing). Keduanya ≥44×44 inline, `accessibilityRole="button"`, label id-ID. Label kanonik (di-assert AC): `"Anggota"`, `"Rencana Aksi"`. | P0 |
| FR-1.9 | Avatar grup pindah ke header; **`RoomContextBar` in-body dihapus** — "N anggota" tepat satu kali di layar. | P0 |
| FR-1.10 | Segmen presence **tidak dibangun** (K-2). | ditolak |
| FR-1.11 | Header dilarang menampilkan kontrol tambah/hapus anggota (membership derived; `recompute_chat_room_members` di-revoke dari `authenticated`, `0008:266-301`). | P0 |
| FR-1.12 | Deep-link "Rencana Aksi" **tidak** melakukan pre-flight otorisasi — layar tujuan yang menegakkan gate-nya. Pre-check = duplikasi otorisasi di klien (langgar FR-GOV.1). | P0 |

> **Divergensi terdokumentasi (bukan bug):** status dibaca lewat `action_plans_select`, yang **lebih longgar** dari `can_access_action_plan()`. Konsekuensi: seorang Task-PIC yang bukan AP-PIC dapat melihat `"Rencana Aksi selesai"` untuk AP yang helper kanonik akan tolak. Marginal info nol: nama AP sudah terekspos sebagai `room.name` dan tombol deep-link sudah ada. Divergensi `action_plans_select` vs `can_access_action_plan()` adalah temuan pre-existing → eskalasi terpisah, tidak diperbaiki diam-diam di sini.

### FR-2 — Composer `+` / paperclip: **TUTUP TANPA KODE**

| ID | Requirement | Prio |
|---|---|---|
| FR-2.1 | Paperclip **tidak dibangun**. Cacat prototipe (PRD §30 rule 4; FR-IN4.5). | P0 (larangan) |
| FR-2.2 | Tombol `+` **tidak dibangun**, termasuk sebagai shell. Isi menunya nol sumber; default guardrail (`prd/01` §12; PRD §2) = tolak. | P0 (larangan) |
| FR-2.3 | Upload/attachment dari chat **tidak dibangun** (FR-GOV.3). | P0 (larangan) |
| FR-2.4 | Gap ini **DIHITUNG TERTUTUP** oleh keputusan tertulis + test negatif AC-GOV.4. Bukan tertunda, bukan diblokir, dan **tidak memblokir `/tdd-plan`**. Membalikkannya = amandemen PRD §30 tertulis dengan invarian eksplisit (pola preseden Reaction pill 2026-07-13), bukan revisi spec UI. | P0 |

### FR-3 — Date divider

| ID | Requirement | Prio |
|---|---|---|
| FR-3.1 | Label: `"Hari ini"` / `"Kemarin"` / format absolut `d MMM` id-ID. | P0 |
| FR-3.2 | **Timezone = DEVICE tz.** Menegaskan ulang FR-IN2.3. Tidak ada `org_timezone`, tidak ada `get_org_today()`. | P0 |
| FR-3.3 | **Tanpa jam** (semantik tak terdefinisi di sumber manapun; bubble sudah membawa jamnya). | P0 |
| FR-3.4 | Logika pure di `mobile/src/lib/chat-day.ts`: `dayKey(iso)` + `dividerLabel(iso, nowIso)`. `now` **di-inject**, tidak pernah `Date.now()` internal. | P0 |
| FR-3.5 | Builder `rows` **mengelompokkan berdasarkan `dayKey`**, bukan label tampilan. Menutup bug existing: label `"23 Jun"` bertabrakan lintas tahun → dua hari merge jadi satu divider. | P0 |
| FR-3.6 | Key divider = `` `d-${dayKey}` `` — buang message id. Menstabilkan key saat optimistic `temp-*` diganti baris server. | P0 |
| FR-3.7 | `todayKey` masuk deps `useMemo` `rows` (kini `[ordered]`) agar label tidak basi melewati tengah malam. Refresh terjadi pada render berikutnya — **diterima**, tanpa timer. | P1 |
| FR-3.8 | `lib/inbox-timeline.ts` tetap yatim (kontraknya inverted FlatList). `formatTime`/`formatReadAt` tidak disentuh — ketiganya device-tz, layar konsisten dengan dirinya sendiri. | P0 (batas) |

### FR-4 — Placeholder composer

| ID | Requirement | Prio |
|---|---|---|
| FR-4.1 | `composerPlaceholder(roomName)` di `mobile/src/lib/chat-placeholder.ts` → `` `Tulis pesan ke ${trim(name)}` ``. | P0 |
| FR-4.2 | Fallback `"Tulis pesan…"` saat null/undefined/whitespace. | P0 |
| FR-4.3 | Tanpa percabangan jenis room; tanpa literal "Initiative"; **tanpa aturan truncation** — `TextInput` melakukan clipping natifnya. | P0 |
| FR-4.4 | `placeholderTextColor` tetap `usePlaceholderColor()`. Validasi kirim tidak berubah. | P0 |

---

## 7. Data Contracts

### DC-0 — Prinsip
Baca via `supabase.from()` + RLS penegak tunggal; tulis hanya via RPC SECURITY DEFINER. **Nol policy dibuat/diubah/dilonggarkan. Nol migrasi. Nol bucket. Nol RPC baru. `database.types.ts` tidak perlu di-regenerate** (tidak ada DDL).

### DC-1 — `getChatRoom` (FR-1)

```ts
export type ActionPlanStatus = 'draft' | 'active' | 'done' | 'archived';

export type ChatRoomDetail = {
  id: string;
  name: string;
  action_plan_id: string;
  /** null = embed ditolak/belum termuat → UI sembunyikan segmen, jangan error. */
  action_plan_status: ActionPlanStatus | null;
};
```

```ts
const { data, error } = await supabase
  .from('chat_rooms')
  .select('id, name, action_plan_id, action_plan:action_plan_id(status)')
  .eq('id', roomId)
  .maybeSingle();
if (error) throw error;
// map eksplisit — JANGAN `data as ChatRoomDetail`; cast lama (inbox.ts:266) harus dibongkar
// karena embed ter-generate non-nullable (isOneToOne + FK NOT NULL) sementara runtime bisa null.
```

- **Cache:** reuse `['chat-room', roomId]`. Entri cache lama tidak punya field ini → `undefined`. **`undefined` dan `null` diperlakukan identik** (segmen disembunyikan) — AC-1.5.
- **Jalur error:** `if (error) throw error` tetap ada. Embed salah nama → **throw** → naik ke ErrorBoundary root. Mitigasi: nama embed diuji di test data-layer (AC-1.15).
- **`useChatRoom` sengaja TIDAK diperluas dengan `isError`.** "Loading" dan "gagal/ditolak" menghasilkan perilaku header yang **identik** (AC-1.2) → pembedaannya tidak dapat diobservasi, jadi tidak dispesifikasi.
- **RLS:** setiap aktor yang bisa membuka layar ini sudah berhak membaca `action_plans.status` (AP-PIC via `pic_id`; Task-PIC/Reviewer via `action_plan_has_my_task`; viewer via `can_view_workspace`). Embed **tidak** memperluas permukaan data; ia menghemat round-trip.

### DC-2 — Composer (FR-2)
Nol perubahan. `send_chat_message` dipakai apa adanya dengan 3 argumen (`p_context_action_plan` / `p_reply_to` tetap tidak dikirim). Tipe vars `useChatActions` **tidak** diubah.

### DC-3 — Divider (FR-3)

```ts
/** 'YYYY-MM-DD' pada device tz; null bila iso invalid (pemanggil SKIP divider — kontrak [E6]). */
export function dayKey(iso: string): string | null;

/** 'Hari ini' | 'Kemarin' | '23 Jun' | null. `nowIso` di-inject → deterministik tanpa fake timers. */
export function dividerLabel(iso: string, nowIso: string): string | null;
```
Skema tidak berubah (`chat_messages.created_at` sudah `timestamptz`).

### DC-4 — Placeholder (FR-4)

```ts
export function composerPlaceholder(roomName: string | null | undefined): string {
  const n = roomName?.trim();
  return n ? `Tulis pesan ke ${n}` : 'Tulis pesan…';
}
```

### DC-5 — Ringkasan dampak

| Artefak | Berubah? |
|---|---|
| Migrasi SQL / `supabase/tests/*` / `supabase/revert/` | **TIDAK** |
| Policy RLS / grant / signature RPC / Storage / Realtime | **TIDAK** |
| `mobile/src/lib/database.types.ts` | **TIDAK** |
| `mobile/src/hooks/use-inbox.ts` | **TIDAK** |
| `mobile/src/lib/inbox.ts` | YA — `ChatRoomDetail` +1 field, `getChatRoom` embed + map eksplisit, docstring stale diperbaiki |
| `mobile/src/lib/chat-day.ts`, `chat-placeholder.ts` | YA — modul baru |
| `mobile/src/app/(app)/inbox/[roomId].tsx` | YA — header node, builder `rows`, placeholder, hapus `RoomContextBar` |

> **Catatan sengaja tidak diperbaiki:** `database.types.ts:592` masih menyebut `chat_rooms_initiative_id_fkey`. Constraint FK memang tidak ikut di-rename di `0045` (hanya index) — tipe itu **benar** merefleksikan DB.

---

## 8. Acceptance Criteria

Daftar Given/When/Then lengkap ada di bagian `acceptance_criteria`. Konvensi: **AC-1.x** (FR-1), **AC-3.x** (FR-3), **AC-4.x** (FR-4), **AC-GOV.x** (lintas-FR), **AC-DOD** (gate).

**Catatan penegakan:** AC-GOV.1 dan AC-GOV.2 adalah **review-gate / assertion statis atas diff**, bukan test jest maupun contract SQL. Ditandai demikian secara eksplisit; tidak ada tag `[DB]` karena DC-5 menyatakan `supabase/tests/*` tidak berubah.

### Traceability 4 gap → status akhir

| Gap brief | FR | Status akhir |
|---|---|---|
| GAP 1 header | FR-1 | **DITUTUP** (avatar+judul+N anggota+status non-active+2 aksi). Presence **DITOLAK** (K-2). |
| GAP 2 composer `+`/paperclip | FR-2 | **DITUTUP TANPA KODE** — cacat prototipe; dijaga AC-GOV.4. |
| GAP 3 date divider | FR-3 | **DITUTUP** (label relatif, device-tz). Jam **DITOLAK**; bonus: bug collision antar-tahun ditutup. |
| GAP 4 placeholder | FR-4 | **DITUTUP** (interpolasi `room.name`). Premis "jenis room" **DIKOREKSI**. |

---

## 9. Edge Cases

| ID | Kondisi | Perilaku wajib |
|---|---|---|
| EC-1 | `roomId` kosong | `ErrorState` "Room tidak ditemukan"; `markRead` tidak dipanggil; header kaya tidak dirender. *(no-regress)* |
| EC-2 | `room === null` (loading **atau** gagal/ditolak) | Judul fallback `"Diskusi Rencana Aksi"`; subtitle tidak dirender (bukan skeleton, bukan "0 anggota" — angka salah lebih buruk daripada tak ada angka); tombol "Rencana Aksi" tidak dirender. Kedua sebab **sengaja tidak dibedakan** (DC-1). |
| EC-3 | Workspace-viewer non-anggota | `chat_rooms_select` = `is_chat_member OR can_view_workspace` → **room terbaca, header terisi**. `chat_room_members_select` → **roster kosong** → avatar grup, "N anggota", tombol "Anggota" semuanya hilang. Pesan tetap terbaca. Tidak crash. |
| EC-4 | `members.length === 0` | Segmen "N anggota" tidak dirender. **Jangan render "0 anggota"** — 0 adalah artefak RLS, bukan fakta. |
| EC-5 | `action_plan_status` = `active`/`draft`/`null`/`undefined`/tak dikenal | Segmen status hilang senyap; subtitle = "8 anggota" tanpa `·` menggantung. Tidak ada error, tidak ada string mentah bocor. |
| EC-6 | `archived_at` non-null tapi `status='active'` (drift) | Sumber tunggal = `status`. `archived_at` **tidak di-fetch** dan diabaikan. (Field `action_plan_archived` di draft dibuang — nol konsumen.) |
| EC-7 | `action_plans.initiative_id` NULL (orphan AP) | Header tidak menautkan induk, tidak crash, tidak render "undefined". |
| EC-8 | `created_at` invalid | `dayKey → null` → divider di-skip, pesan tetap dirender. *(no-regress [E6])* |
| EC-9 | Pesan mengapit tengah malam device-tz | Dua divider berbeda. Benar, bukan bug. |
| EC-10 | 23 Jun 2025 vs 23 Jun 2026 | **Dua divider** (grouping `dayKey`). Implementasi lama merge keduanya — bug yang ditutup FR-3.5. |
| EC-11 | Optimistic `temp-*` → baris server | Tepat satu divider "Hari ini"; key stabil (FR-3.6); tidak berkedip/berduplikasi. |
| EC-12 | `loadOlder` memprepend halaman lama | Invarian satu-hari-satu-divider tetap berlaku di titik sambung. |
| EC-13 | Room berisi hanya `kind='system'` | System event ikut memicu divider, tanpa pengecualian. |
| EC-14 | Layar mounted melewati tengah malam | Label refresh pada render berikutnya (FR-3.7). Basi sementara **diterima**; tidak ada timer. |
| EC-15 | `room.name` sangat panjang | `TextInput` melakukan clipping natif. Tidak ada elipsis manual, tidak ada ambang. |
| EC-16 | `room.name` basi | `chat_rooms.name` adalah **snapshot aktivasi** — trigger `AFTER INSERT OR UPDATE OF status` (`0046:2884-2886`) menulis `name` sekali; rename AP tidak pernah dipropagasi. Judul (FR-1.3) dan placeholder (FR-4.1) bisa berbeda dari kartu tujuan tombol "Rencana Aksi". **Perilaku existing, diterima** → OQ-5. |
| EC-17 | Composer read-only (viewer non-anggota) | Tetap tampil, gagal di server saat Kirim, error inline terkurasi, input tidak ter-reset. Keterbatasan existing (`FR-DATA.2` DEFER) — tidak diperburuk. |
| EC-18 | Banner sudah di-dismiss | Nol afordans composer baru dibangun (FR-2) → nol ketegangan. Ini alasan tambahan menolak deep-link bukti di composer: FR-GOV.4 tidak boleh bersandar pada banner yang bisa hilang. |

**Loading/Empty (no-regress, tidak disentuh):** `SkeletonList count={4}`; `ErrorState` "Gagal memuat pesan" + retry; `EmptyState` 💬 "Belum ada pesan" dengan composer tetap aktif; non-member ditolak RLS tampak identik dengan kosong (diterima sampai `FR-DATA.2`); `author_id` null → "?"/"Sistem"; `GovernanceBanner` dismissible per-user via AsyncStorage.

---

## 10. Open Questions

Daftar lengkap ada di bagian `open_questions`.

- **OQ-2 adalah satu-satunya yang memblokir** (Batch B: keputusan + copy segmen status).
- **OQ-1 (GAP 2) dan OQ-3 (timezone)** adalah **konfirmasi dengan default berlaku** — tidak memblokir `/tdd-plan`.
- **OQ-4** (celah `can_access_task` pada `send_chat_message`), **OQ-5** (`chat_rooms.name` snapshot), **OQ-7** (FR-IN4.4 stale) adalah eskalasi di luar scope.
- **OQ-6** adalah deliverable dokumentasi (tandai `design.html` #inbox-chat stale).

---

## 11. Handoff ke TDD

### Batch A — mulai sekarang, tanpa keputusan owner
1. `mobile/src/lib/chat-day.ts` — `dayKey`, `dividerLabel`. Test leaf tanpa RNTL, **tanpa fake timers** (`nowIso` parameter).
2. `mobile/src/lib/chat-placeholder.ts` — `composerPlaceholder`. Test leaf.
3. `[roomId].tsx` — ganti `dayLabel`; builder `rows` grouping `dayKey` + key `` `d-${dayKey}` `` + deps `[ordered, todayKey]`; pasang placeholder.

### Batch B — setelah OQ-2
4. `lib/inbox.ts` — `ChatRoomDetail` + embed + map eksplisit; test data-layer **wajib** kasus `action_plan: null`; docstring `inbox.ts:257` diperbaiki.
5. `[roomId].tsx` — `headerTitle`/`headerRight` node; hapus `RoomContextBar`.

### Test existing yang tersentuh
- **[E5]** (`[roomId].test.tsx:213`) — fixture `2026-06-23`/`24` + jam sistem nyata. **Hijau hari ini (2026-07-14), tapi time bomb**: merah bila suite jalan pada 2026-06-24/25. **WAJIB pin clock** (`jest.useFakeTimers().setSystemTime`). Draft berselisih ("tetap hijau" vs "wajib di-update") — keduanya salah; yang benar: tetap hijau **tapi wajib disuntik clock**.
- **[E6]** (:231) kontrak null — **wajib tetap hijau**.
- **[E12]** (:301) string `GOVERNANCE_BANNER` — **wajib tetap hijau, tidak boleh dilemahkan**.
- **[E8]** (:256) 44dp inline — pola untuk kontrol header baru.
- **[E13]** (:744-752) "Muat pesan lama" — jangan disentuh.

**Aturan fake timers (menutup kontradiksi draft):** test **fungsi pure** → `nowIso` sebagai parameter, tanpa fake timers. Test **komponen** → fake timers untuk memin clock. Tidak ada instruksi yang berlawanan.

### Larangan keras
Presence/`channel.track()` · attachment/bucket/`@/lib/storage`/`@/lib/file-picker` · tombol `+` · paperclip · deep-link bukti di composer · "Tautkan Tugas"/`opts` `send_chat_message` · jam divider · `org_timezone`/`get_org_today` · impor `lib/inbox-timeline.ts` · migrasi inverted FlatList · `isError` pada `useChatRoom`.

### Gate
Dari `mobile/`: `npm test` · `npm run type-check` · `npm run lint`.
