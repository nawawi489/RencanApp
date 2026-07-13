# Spec: System Event di Timeline Chat — PRD §30 komponen 8

Status: DRAFT — 4 keputusan owner terkunci 2026-07-13 (lihat §0); siap disambung ke `/sdd-plan` lalu `/tdd-plan`.
Versi rilis target: V2-lanjutan (batch chat V2, menyusul Reaction pill 42cbc6d + Reply-quote/Konteks Tugas 9b84b75).
Sumber yang dihormati: PRD V1.8.2 §30 (komponen 8, rule 1–4), migrasi `0008_fase3_collab.sql` (chat + `write_activity` + `list_chat_rooms` unread + review/submit RPC), `0014`/`0038`/`0040` (deadline-change RPC + resolution), `0018_fr_data1_inbox_preview.sql` (unread preview), `0046_chat_message_context_reply.sql` (pola snapshot server + append-only 2-lapis), `mobile/src/lib/inbox-timeline.ts` (`buildTimelineItems`), `mobile/src/app/(app)/inbox/[roomId].tsx`, `DESIGN.md §4/§7`, `specs/inbox-chat-task-reply-context.md` (§3 Non-Goal 4 yang men-defer fitur ini).

Catatan lintas-branch: fitur ini adalah realisasi dari Non-Goal 4 spec Reply-quote ("System events / trigger otomatis … tetap DEFER V2-lanjutan"). Ia mengasumsikan `0046` sudah merged.

---

## 0. Keputusan owner terkunci (2026-07-13)

| # | Pertanyaan | Keputusan |
|---|-----------|-----------|
| D-1 | Model penyimpanan | **Materialize baris di `chat_messages`** (`kind='system'`, `author_id NULL`, body = teks snapshot yang dirender server). Pakai ulang keyset pagination, realtime, timeline merge apa adanya. |
| D-2 | Cakupan event v1 | **Transisi status Action Plan + perubahan deadline.** (submitted → Selesai/revision, resubmit; deadline-change diminta/disetujui/ditolak.) Membership & evidence = luar cakupan (P1/P2). |
| D-3 | Interaktivitas | **Informational only** — baris tengah non-interaktif seperti date divider. Tanpa deep-link di v1. |
| D-4 | Unread / notifikasi | **Menghitung ke unread** (menandai room unread seperti pesan), **tanpa tipe notifikasi baru**, tetap muncul realtime. |

Interpretasi turunan yang diadopsi spec ini (bisa ditinjau, lihat §9 Open Questions):
- Unread system event **mengecualikan aktor** — pelaku transisi (mis. Fajar) tidak di-nudge oleh aksinya sendiri. Konsisten dengan aturan unread existing `author_id <> auth.uid()`.

---

## 1. Problem Statement

PRD §30 komponen 8 mensyaratkan "System event" sebagai salah satu dari 10 komponen timeline chat — contohnya log otomatis "Fajar mengubah status jadi Selesai" muncul sebagai baris sistem di dalam chat. Komponen ini **belum ada di kode**: `chat_messages` (0008) hanya menyimpan pesan yang diketik user; transisi status Action Plan (`review_action_plan` → `status='done'`) dan perubahan deadline hanya menulis `activity_logs` + notifikasi, tak pernah muncul di timeline diskusi.

Dampak: anggota room membuka chat dan tidak tahu apa yang berubah pada card sejak terakhir mereka lihat. "Kenapa tugas ini ditandai selesai?" atau "deadline-nya jadi geser?" harus ditanyakan manual, sering menghasilkan pesan-klarifikasi berulang. Diskusi (chat) dan kejadian (status) hidup di dua tempat terpisah, memaksa user merekonstruksi kronologi sendiri. Yang mengalami: setiap anggota room Initiative — jalur inti execution loop.

## 2. Goals

1. Setiap transisi status Action Plan dan perubahan deadline (D-2) memunculkan **satu baris sistem** di timeline room Initiative terkait, otomatis dan atomik dengan aksinya.
2. Baris sistem terbaca sebagai kronologi jelas ("{Nama} mengubah status jadi Selesai") tanpa mencemari alur pesan sebagai bubble.
3. Room dengan event baru menandai dirinya **unread** (D-4) sehingga anggota tahu ada perubahan untuk dilihat.
4. **Nol pelonggaran governance**: chat tetap append-only 2-lapis (tulis hanya via SECURITY DEFINER; grant tulis langsung tetap dicabut), room tetap 1 per Initiative (rule 3), tidak ada policy SELECT yang dilonggarkan, tidak ada tipe notifikasi baru.
5. Pakai ulang penuh mesin timeline existing (keyset pagination, realtime, mark-read) — event adalah baris `chat_messages` biasa dengan `kind='system'`, bukan sumber kedua.

## 3. Non-Goals

1. **Baris sistem interaktif / deep-link ke card** — D-3 informational only. (Kolom referensi entitas tetap disimpan sebagai asuransi arsitektur → P2, lihat FR-SE-1.)
2. **Event membership** (anggota ditambah/dicabut oleh `recompute_chat_room_members`) — di luar D-2, P1.
3. **Event evidence/bukti terkirim** sebagai baris terpisah — bukti tetap lewat Action Plan (rule 4); submit sudah tercakup sebagai transisi status. P2.
4. **Tipe notifikasi baru** — transisi sudah punya notifikasi sendiri (0008/0040); baris sistem tidak menambah notif (D-4).
5. **Edit/hapus/collapse baris sistem** — immutable (append-only); peleburan deret event beruntun = P2.
6. **Reaction pill / seen-by / reply pada baris sistem** — komponen 6/7 hanya untuk pesan user; baris sistem menekan afordans itu.
7. **Backfill event historis** (transisi sebelum fitur ini rilis) — ship-forward only untuk v1 (lihat §9).

## 4. User Stories

Prioritas menurun. Semua tunduk RLS `is_chat_member()`; otorisasi di Postgres.

- **US-1 (P0)** Sebagai anggota room, saat PIC menandai sebuah Tugas Selesai (disetujui reviewer), saya melihat baris "{Reviewer} menyetujui — status jadi Selesai" muncul di timeline pada urutan waktu yang benar, agar saya tahu apa yang berubah tanpa bertanya.
- **US-2 (P0)** Sebagai anggota room, saat sebuah Tugas dikirim untuk direview atau diminta revisi, saya melihat baris sistem yang sesuai, agar kronologi eksekusi utuh di satu tempat.
- **US-3 (P0)** Sebagai anggota room, saat deadline sebuah Tugas berubah (diminta/disetujui/ditolak), saya melihat baris sistem perubahan deadline itu.
- **US-4 (P0)** Sebagai anggota room yang belum membuka chat, room saya ditandai **unread** ketika ada event baru, agar saya terdorong meninjau perubahan.
- **US-5 (P0)** Sebagai **pelaku** transisi (mis. saya sendiri menyetujui), room **tidak** ditandai unread oleh aksi saya sendiri, agar badge unread tetap bermakna.
- **US-6 (P0)** Sebagai anggota, baris sistem tampil beda dari bubble pesan (baris tengah, tanpa avatar/reaction/seen-by), agar tidak tertukar dengan chat manusia.
- **US-7 (edge/governance)** Sebagai penyerang via API, saya **tidak bisa** menyuntik baris sistem palsu ke room mana pun — tidak ada RPC/grant klien yang menulis `kind='system'`; hanya helper SECURITY DEFINER internal yang dipanggil dari RPC transisi.
- **US-8 (edge)** Sebagai user yang Tugasnya yatim (`initiative_id` null) atau room belum tercipta (Initiative belum aktif), transisi status tetap sukses tetapi **tanpa** baris sistem (di-skip diam-diam, bukan error).

## 5. Requirements

### Must-Have (P0)

**FR-SE-1 — Skema `chat_messages` (kolom sistem).**
Tambah kolom nullable (nomor migrasi berikutnya; rekonsiliasi saat build — branch ini max `0046`):
- `kind text not null default 'user'` check `in ('user','system')`.
- `system_event_type text` — enum event, check `in ('status_submitted','status_done','status_revision','status_resubmitted','deadline_change_requested','deadline_change_approved','deadline_change_rejected')`.
- `actor_id uuid references public.profiles(id) on delete set null` — pelaku (untuk pengecualian unread; **bukan** author bubble).
- `context_entity_type` / `context_entity_id` **dipakai ulang** dari 0046 untuk merujuk Action Plan sumber (asuransi P2 deep-link; tidak dirender di v1).

Batasan (constraint) yang mengikat invarian D-1/D-3:
- Baris sistem: `kind='system'` ⇒ `author_id IS NULL` **dan** `system_event_type IS NOT NULL` **dan** `actor_id IS NOT NULL`.
- Baris user: `kind='user'` ⇒ `system_event_type IS NULL` **dan** `actor_id IS NULL`.
- `body` tetap `not null` — menampung teks snapshot yang dirender server (FR-SE-3).

*AC:*
- [ ] Insert `kind='system'` dengan `author_id` non-null ditolak constraint.
- [ ] Insert `kind='system'` tanpa `system_event_type` atau tanpa `actor_id` ditolak.
- [ ] Baris `kind='user'` existing (0008) lolos tanpa migrasi data (default `'user'`, kolom baru null).

**FR-SE-2 — Helper emit + call-site di RPC transisi.**
Helper internal `public.emit_chat_system_event(p_initiative uuid, p_actor uuid, p_type text, p_body text, p_context_ap uuid)` `SECURITY DEFINER set search_path=''`:
- Resolusi room: `select id, organization_id from chat_rooms where initiative_id = p_initiative`. **0 baris → RETURN diam-diam** (US-8: room belum ada / Tugas yatim).
- Insert baris `kind='system'` (author_id NULL, actor_id=p_actor, body=p_body, context = action_plan/p_context_ap) dalam **transaksi yang sama** dengan aksi pemicunya (atomik: jika RPC transisi rollback, baris ikut hilang).
- Grant: `revoke execute … from public, anon, authenticated;` — **hanya** dipanggil dari RPC SECURITY DEFINER lain (pola `emit_notification` 0008).

Call-site (semua RPC ini sudah `SECURITY DEFINER`, sudah memanggil `write_activity`):
| RPC (migrasi) | Transisi | `p_type` |
|---|---|---|
| `submit_action_plan` / `submit_action_plan_instance` (0008) | → `submitted` | `status_submitted` |
| `review_action_plan` (0008) approve | → `done` | `status_done` |
| `review_action_plan` (0008) reject | → `revision` | `status_revision` |
| resubmit setelah revisi (jalur submit ulang) | → `submitted` (dari `revision`) | `status_resubmitted` |
| `create_deadline_change_request` (0014) | permintaan | `deadline_change_requested` |
| `review_deadline_change` (0038/0040) approve/reject | keputusan | `deadline_change_approved` / `_rejected` |

*AC:*
- [ ] `review_action_plan(approve)` pada Tugas dengan room aktif menyisipkan tepat 1 baris `status_done` di room Initiative-nya, `created_at` = waktu aksi.
- [ ] RPC transisi yang gagal (mis. reviewer tak berhak) **tidak** meninggalkan baris sistem (atomisitas).
- [ ] Transisi pada Tugas tanpa room (Initiative belum aktif) tetap sukses, **0** baris sistem, tanpa exception.

**FR-SE-3 — Teks snapshot (server-rendered, immutable, id-ID).**
`body` dihitung server saat event (bukan input klien), snapshot nama aktor + label status — **immutable** setelah insert (pola `context_label` 0046). Template id-ID (final saat build, patuh penamaan `Rencanapp`):
- `status_submitted` → "{Aktor} mengirim untuk direview"
- `status_done` → "{Aktor} menyetujui — status jadi Selesai"
- `status_revision` → "{Aktor} meminta revisi"
- `status_resubmitted` → "{Aktor} mengirim ulang setelah revisi"
- `deadline_change_requested` → "{Aktor} meminta perubahan deadline"
- `deadline_change_approved` → "{Aktor} menyetujui perubahan deadline"
- `deadline_change_rejected` → "{Aktor} menolak perubahan deadline"

*AC:*
- [ ] Nama aktor di-snapshot: mengganti nama profil setelahnya **tidak** mengubah body baris lama.
- [ ] Body tidak pernah menerima string dari klien (tak ada parameter body di call-site publik).

**FR-SE-4 — Unread menghitung baris sistem (kecuali aktor).**
Amandemen kolkulasi `unread_count` di `list_chat_rooms` (0008 ~ln 465) **dan** inbox preview (0018 ~ln 29). Query existing memakai `author_id <> auth.uid()`; karena baris sistem `author_id IS NULL`, `NULL <> uid = NULL` → **ter-eksklusi diam-diam**. Ganti prediket "bukan dari saya" menjadi:
```
(cm.kind = 'user'   and cm.author_id <> auth.uid())
or (cm.kind = 'system' and cm.actor_id is distinct from auth.uid())
```
`mark_room_read` / `chat_message_reads` dipakai ulang tanpa perubahan (baris sistem adalah `chat_messages`, FK reads valid).

*AC:*
- [ ] Anggota non-aktor: `unread_count` bertambah 1 setelah satu event baru yang belum dibaca.
- [ ] Aktor: `unread_count` **tidak** bertambah oleh event yang ia picu (US-5).
- [ ] Membuka room (mark-read) menurunkan `unread_count` termasuk baris sistem.

**FR-SE-5 — Render baris sistem di timeline.**
`mobile/src/lib/inbox-timeline.ts`: perluas `TimelineItem` menjadi union bertiga — `{ type: 'system'; key; msg }` selain `'divider'` | `'message'`. `buildTimelineItems` meneruskan baris `kind==='system'` sebagai item `system` (bukan divider; tetap ikut transisi hari sehingga divider tetap benar). `[roomId].tsx` merender komponen baru `SystemEventRow` — baris tengah, teks muted, **tanpa** avatar/bubble/reaction pill/seen-by/afordans reply (D-3, US-6). Token didaftarkan di `DESIGN.md §7` dulu (mengikuti aturan `mobile/AGENTS.md`), lalu diimplement di `global.css` + NativeWind. Patuh a11y `DESIGN.md §4` (kontras teks muted memadai; bukan hanya warna sebagai sinyal — sertakan bentuk/posisi tengah).

*AC:*
- [ ] `buildTimelineItems` dengan campuran pesan+system menghasilkan item `system` di urutan `created_at` yang benar; divider harian tidak rusak.
- [ ] `SystemEventRow` tidak merender avatar, reaction pill, seen-by, maupun long-press reply.
- [ ] Input `[]` → `[]` (tak ada regresi kontrak divider existing).

**FR-SE-6 — Read path menyertakan baris sistem (satu aliran).**
`listChatMessages` / RPC keyset pagination (`0044`/`0045`) dan realtime menyertakan baris `kind='system'` di **satu** aliran terurut `created_at` (gratis — mereka baris `chat_messages`). SELECT harus memuat kolom baru (`kind`, `system_event_type`, `actor_id`) agar klien bisa mendiskriminasi. Tipe `ChatMessage` (`mobile/src/lib/inbox.ts`) diperluas dengan field opsional itu.

*AC:*
- [ ] Satu halaman keyset yang memuat pesan dan event mengembalikan keduanya, terurut, satu cursor.
- [ ] Realtime insert baris sistem muncul di room yang terbuka tanpa refetch manual (mengikuti mekanisme realtime chat yang berlaku; bila migrasi realtime belum di-apply di lingkungan, invalidasi React Query existing cukup).

**FR-SE-7 — Governance & isolasi (regresi-guard).**
- Tidak ada jalur tulis klien untuk `kind='system'`: `send_chat_message` (0046) tetap menulis `kind` default `'user'`; helper emit dicabut dari `authenticated`.
- RLS tidak dilonggarkan: baris sistem tampak ke `is_chat_member` sama seperti pesan; lintas-org tetap terisolasi (org_id di-set dari room).
- Tidak ada tipe notifikasi baru; `emit_notification` tidak dipanggil oleh helper emit.

*AC:*
- [ ] Panggilan langsung `emit_chat_system_event` sebagai `authenticated` ditolak (grant dicabut).
- [ ] Anggota room A tidak melihat baris sistem room B (RLS).
- [ ] Tidak ada baris `notifications` baru dari event sistem.

### Nice-to-Have (P1)

- **FR-SE-8 — Event membership.** Baris "{Aktor} menambahkan {Nama}" saat `recompute_chat_room_members` menambah/mencabut anggota. Ditunda karena bukan transisi status dan bervolume tinggi (bisa berisik).
- **FR-SE-9 — Uji realtime eksplisit** setelah migrasi realtime chat (0052, branch lain) merged — kontrak "event muncul <1s tanpa refetch".

### Future Considerations (P2 — asuransi arsitektur)

- **FR-SE-10 — Baris sistem tappable → deep-link ke card.** Kolom `context_entity_type/id` sudah disimpan (FR-SE-1) sehingga ini murni pekerjaan UI kelak, tanpa migrasi ulang.
- **FR-SE-11 — Collapse deret event beruntun** ("3 perubahan status") agar timeline tak banjir saat banyak transisi berdekatan.
- **FR-SE-12 — Backfill historis** dari `activity_logs` menjadi baris sistem untuk room lama (sekali jalan, idempoten).
- **FR-SE-13 — Lokalisasi** body di luar id-ID (saat i18n app ada).

## 6. Success Metrics

Instrumentasi analitik belum terpasang di repo (lihat memory `prod-readiness`), jadi target di bawah bersifat hipotesis yang diverifikasi lewat test + observasi kualitatif.

**Leading (hari–minggu):**
- **Kelengkapan**: 100% transisi berhak-room memunculkan tepat 1 baris sistem (dibuktikan test kontrak FR-SE-2, bukan analitik) — ini gerbang korrektness, bukan metrik adopsi.
- **Akurasi unread**: 0 kasus aktor di-nudge oleh aksinya sendiri (test FR-SE-4).
- **Penurunan pesan-klarifikasi status**: proksi kualitatif — berkurangnya pesan bertanya "kenapa selesai / kok deadline geser".

**Lagging (minggu–bulan):**
- Waktu-ke-paham perubahan card menurun (anggota lihat kronologi di chat, bukan menyusun ulang).
- Berkurangnya duplikasi pertanyaan status di room.

**Metode ukur:** test kontrak DB (kelengkapan/unread/governance), test unit `buildTimelineItems`, dan tinjauan kualitatif thread. Bila analitik dipasang kelak, tambahkan rasio "room dibuka setelah event" sebagai sinyal adopsi.

## 7. Open Questions

- **[owner, non-blocking]** Pengecualian aktor dari unread (§0 turunan) — spec mengadopsi *kecualikan aktor*. Konfirmasi, atau pilih "hitung untuk semua termasuk aktor" (lebih sederhana, tapi badge kurang bermakna). *Bisa diputuskan saat sdd-plan; default = kecualikan.*
- **[owner, non-blocking]** Backfill historis (FR-SE-12) — v1 ship-forward only. Konfirmasi bahwa room lama tak perlu event retro saat rilis.
- **[eng, non-blocking]** Apakah `resubmit`/submit-instance benar-benar melewati satu RPC yang bisa disisipi, atau perlu dua call-site terpisah? Diverifikasi saat sdd-plan membedah RPC 0008.
- **[design, non-blocking]** Token `SystemEventRow` di `DESIGN.md §7`: sejauh mana beda visual dari `DateDivider` (keduanya baris tengah muted) agar tak tertukar — usul: ikon kecil + teks, divider tetap polos.
- **[eng, non-blocking]** Volume: satu Initiative ramai bisa menumpuk banyak event; apakah keyset page size existing perlu disesuaikan? Kemungkinan tidak untuk v1 (P2 collapse menangani ekstrem).

## 8. Timeline Considerations

- **Dependensi keras**: `0046` (kolom konteks + pola snapshot) sudah merged — spec pakai ulang `context_entity_*`.
- **Dependensi lunak**: migrasi realtime chat (0052, branch lain) — bukan blocker; invalidasi React Query existing cukup untuk v1 (FR-SE-6 AC).
- **Urutan**: fitur ke-3 batch chat V2 (setelah Reaction pill 42cbc6d + Reply-quote 9b84b75). Tak ada deadline kontraktual.
- **Rekonsiliasi nomor migrasi** saat build (gotcha lintas-branch; branch ini max 0046 → berikutnya 0047, verifikasi).
- **Fasing bila kebesaran**: P0 (status + deadline, render, unread, governance) satu rilis; P1 membership menyusul; P2 tappable/collapse/backfill sesuai kebutuhan.

## 9. Alur eksekusi berikutnya

1. `/sdd-plan` → kunci data-contract presisi (nama kolom final, enum, signature helper) + AC yang bisa dites.
2. `/tdd-plan` → red-green: test kontrak DB (FR-SE-2/4/7), test unit `buildTimelineItems` (FR-SE-5), test render `SystemEventRow`.
3. Daftarkan token `SystemEventRow` di `DESIGN.md §7` sebelum menyentuh `global.css` (aturan `mobile/AGENTS.md`).
