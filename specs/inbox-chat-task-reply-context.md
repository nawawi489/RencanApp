# Spec: Reply-quote / Konteks Tugas — Action Plan membuka chat dengan konteks reply

Status: FINAL — semua keputusan owner terkunci 2026-07-13; siap disambung ke `/tdd-plan`
Versi rilis target: V2 (batch chat V2, menyusul Reaction pill — commit 42cbc6d)
Sumber yang dihormati: PRD V1.8.2 §30 (rule 2–4, komponen 10) + §44 AC-21, `specs/inbox-chat-ui.md` (§6 "DEFER ke V2"), `specs/inbox-chat-reactions.md` (pola V2 pertama), `wiki/concepts/scope-guardrails.md`, `wiki/concepts/ui-prototype-gap.md` (UI-S-IN3), migrasi `0008_fase3_collab.sql` + `0045_chat_message_reactions.sql`, `DESIGN.md §4/§7`, `mobile/src/lib/inbox.ts`.

---

## 1. Problem Statement

PRD §30 rule 2 mensyaratkan "Action Plan dapat membuka chat dengan konteks reply" dan komponen 10 mensyaratkan "Action Plan reply context banner"; §44 AC-21 menjadikannya kriteria kelulusan frontend. Kenyataan di kode hari ini lebih lemah dari yang diduga:

- **"Buka Chat" di layar Tugas** (`action-plan/[id].tsx:447`) hanya `router.push('/(tabs)/inbox')` — bahkan **tidak** deep-link ke room Initiative-nya, apalagi membawa konteks.
- **"Buka Chat Initiative"** di layar Initiative (`initiative/[id].tsx:292`) sama: mendarat di tab Inbox.
- `chat_messages` (0008) tidak punya kolom konteks/reply; `send_chat_message(p_room, p_body, p_mentions)` tidak menerima konteks.

Dampak: PIC yang ingin mendiskusikan satu Tugas harus mencari room manual lalu mengetik ulang konteks ("soal tugas X itu…"), diskusi kehilangan tautan ke card, dan AC-21 belum terpenuhi. Yang dialami: setiap PIC/Reviewer yang memakai chat dari konteks eksekusi — jalur inti execution loop.

## 2. Goals

1. Dari layar Tugas, satu tap "Buka Chat" mendarat **langsung di room Initiative yang benar** dengan konteks Tugas siap kirim (0 navigasi manual).
2. Pesan berkonteks merender **banner konteks Tugas** (PRD komponen 10) yang bisa di-tap kembali ke layar Tugas.
3. §44 AC-21 terpenuhi dan bisa dibuktikan lewat test.
4. **Nol pelonggaran governance**: room tetap 1 per Initiative (rule 3), Bukti tetap lewat Action Plan (rule 4), append-only + RLS 0008 utuh, tulis hanya via RPC SECURITY DEFINER.

## 3. Non-Goals

1. **Room chat per Action Plan** — dilarang PRD §30 rule 3.
2. **Attach evidence dari chat** — tetap DEFER/dilarang (`inbox-chat-ui.md` FR-IN4.5; bypass evidence-locking).
3. **Edit/delete pesan** — pesan immutable (FR-GOV.2 tetap).
4. **System events / trigger otomatis dari submissions** — tetap DEFER V2-lanjutan; banner di spec ini murni hasil aksi kirim user.
5. **Notifikasi baru** — pesan berkonteks tidak menghasilkan tipe notif baru; aturan mention existing tidak berubah.
6. **Realtime polish (migrasi 0052 di branch lain)** — bukan dependensi; invalidasi React Query existing cukup.

## 4. User Stories

Prioritas menurun. Semua tunduk RLS `is_chat_member()`; otorisasi di Postgres.

- **US-1 (P0)** Sebagai PIC Tugas, saya menekan "Buka Chat" di layar Tugas dan langsung berada di room Initiative-nya dengan chip konteks "Membalas Tugas: {nama}" terpasang di composer, agar saya bisa bertanya tanpa mengetik ulang konteks.
- **US-2 (P0)** Sebagai anggota room, saya melihat pesan berkonteks dengan banner nama Tugas di atas isi pesan, agar saya tahu diskusi ini menempel ke card mana.
- **US-3 (P0)** Sebagai anggota room, saya men-tap banner konteks dan mendarat di layar Tugas tersebut (akses digate layar tujuan/RLS), agar saya bisa memeriksa card-nya.
- **US-4 (P0)** Sebagai pengirim, saya bisa **melepas** chip konteks sebelum kirim, agar pesan biasa tetap mudah.
- **US-5 (P1)** Sebagai anggota room, saya long-press sebuah pesan lalu memilih "Balas", dan pesan saya tampil dengan kutipan pesan asal; tap kutipan men-scroll/highlight pesan asal (reuse mekanisme `?highlight=`).
- **US-6 (P1)** Sebagai user di layar Initiative, "Buka Chat Initiative" mendarat langsung di room (tanpa konteks), bukan di tab Inbox.
- **US-7 (edge)** Sebagai user yang Tugasnya yatim (`initiative_id` null) atau room belum tercipta (Initiative belum aktif), saya tidak melihat jalan buntu: tombol menurunkan diri ke perilaku lama (tab Inbox) atau tersembunyi.
- **US-8 (edge/governance)** Sebagai non-anggota, saya tidak bisa mengirim pesan berkonteks ke room mana pun (RPC menolak), dan konteks lintas-Initiative dipalsukan via API ditolak server.

## 5. Requirements

### Must-Have (P0)

**FR-RC-1 — Deep-link Buka Chat dari Tugas.**
`action-plan/[id].tsx`: resolve room via `supabase.from('chat_rooms').select('id').eq('initiative_id', ap.initiative_id).maybeSingle()` (SELECT digate policy `chat_rooms_select`), lalu `router.push('/inbox/{roomId}?contextAp={ap.id}')`.
- `ap.initiative_id` null ATAU room 0 baris (belum aktif / tanpa akses) → fallback perilaku lama `push('/(tabs)/inbox')` (tanpa error keras).
- `[GOV]` Tidak ada pembuatan room dari klien (room hanya lahir dari trigger `initiative_chat_room`).

**FR-RC-2 — Chip konteks di composer.**
`inbox/[roomId].tsx` membaca param `contextAp`. Bila ada: tampilkan chip/banner di atas composer — label "Membalas Tugas: {nama}" + tombol tutup (≥44dp, `accessibilityLabel="Lepas konteks"`). Nama diambil dari query `getActionPlan(contextAp)` (pembuka link memegang akses; gagal/0 baris → chip tidak tampil, param diabaikan diam-diam). Kirim menyertakan konteks; menutup chip → kirim polos. Chip tidak persist antar sesi.

**FR-RC-3 — Migrasi DB + RPC (nomor berikutnya; rekonsiliasi nomor saat build — gotcha lintas-branch, branch ini max 0045).**
Kolom baru `chat_messages` (semua nullable, default null — backward compatible, tanpa backfill):
- `context_entity_type text check (context_entity_type in ('action_plan'))` — enum sengaja sempit; `action_plan_instance` menyusul (P2) tanpa ubah bentuk.
- `context_entity_id uuid` — id Action Plan.
- `context_label text` — **snapshot nama Tugas saat kirim, dihitung server** (bukan input klien).
- `reply_to_message_id uuid references public.chat_messages(id) on delete set null` — fondasi P1 reply-quote (kolom ikut migrasi ini agar satu migrasi saja).
- Constraint: `check (num_nonnulls(context_entity_type, context_entity_id) in (0, 2))`; `context_label` hanya boleh non-null saat pasangan konteks non-null.
- Index: tidak perlu (read selalu per-room via index existing).

Ganti `send_chat_message` → tambah param `p_context_action_plan uuid default null, p_reply_to uuid default null`. **DROP signature lama** sebelum create (hindari overload ambigu di PostgREST), ulangi pola grant/revoke 0008. Validasi server (semua sebelum insert):
1. Guard existing utuh byte-for-byte (body non-kosong, room ada, `is_chat_member`).
2. `p_context_action_plan` non-null → Action Plan harus ada **dan** `action_plans.initiative_id = chat_rooms.initiative_id` (anti-spoof lintas-Initiative); `context_label := action_plans.name` (server snapshot).
3. `p_reply_to` non-null → pesan asal harus ada **dan** `chat_room_id` sama (anti-quote lintas-room).
4. Konteks dan reply boleh hadir bersamaan (independen), dua-duanya opsional.
- `[GOV]` Append-only 2-lapis tetap: revoke tulis langsung tidak berubah; tidak ada policy SELECT yang dilonggarkan.

**FR-RC-4 — Render banner konteks (PRD komponen 10).**
Bubble dengan konteks merender banner di atas body: ikon + "Konteks Tugas" + `context_label` + chevron. Tap → `router.push('/action-plan/{context_entity_id}')`; akses ditegakkan layar tujuan (RLS 0 baris → state "tidak ditemukan" existing) — **tanpa** pre-check akses di chat.
- Rasional anti-bocor (menjawab warning `inbox-chat-ui.md` §6): label adalah **snapshot yang ditulis pengirim ber-akses saat kirim** — setara pengirim mengetik nama Tugas di body. Tidak ada lookup nama by-id saat baca, jadi tidak ada jalur baca baru yang perlu digate. Konsekuensi: label bisa basi bila Tugas di-rename (diterima; id tetap benar untuk deep-link).
- A11y (DESIGN §4): banner bukan satu-satunya sinyal — awali label dengan prefiks teks "Konteks Tugas"; touch target ≥44dp.

**FR-RC-5 — Data layer & tipe.**
`listChatMessages` select ditambah `context_entity_type, context_entity_id, context_label, reply_to_message_id, reply_to:reply_to_message_id(id, body, author_id, author:author_id(full_name))`; `ChatMessage` diperluas (semua field baru nullable/opsional). `sendChatMessage(roomId, body, mentions, opts?)` meneruskan `p_context_action_plan`/`p_reply_to`. `search_chat_messages` (0044) tidak berubah.

**FR-RC-6 — Token desain didaftarkan dulu.**
Daftarkan di `DESIGN.md §7` sebelum implementasi: `ChatContextBanner` (banner konteks di bubble + chip composer) dan `ChatQuoteChip` (kutipan reply P1). Reuse token ChatBubble/ReactionPill yang sudah ada; implement di `global.css` + NativeWind sesuai aturan CLAUDE.md.

### Nice-to-Have (P1)

**FR-RC-7 — Reply-quote antar-pesan (UI-S-IN3).** Long-press bubble → aksi "Balas" (bersanding dengan picker reaksi existing); chip kutipan di composer (author + potongan body ±80 char); bubble hasil merender kutipan; tap kutipan → set param `highlight` ke pesan asal (reuse mekanisme scroll/highlight search). Pesan asal terhapus tidak mungkin (immutable) tapi `on delete set null` menjaga kaskade room; kutipan dengan `reply_to` null → render "Pesan tidak tersedia".

**FR-RC-8 — Deep-link layar Initiative.** "Buka Chat Initiative" resolve room dengan resolver yang sama (tanpa `contextAp`); fallback identik FR-RC-1.

### Future Considerations (P2)

- **Konteks instance Tugas rutin** — perluas enum `context_entity_type` + validasi via parent `action_plans.initiative_id`; banner deep-link ke detail instance. Bentuk kolom sudah menampungnya.
- **System events** (`message_type`/`event_type` dari submissions) — tetap DEFER; jangan sampai desain kolom konteks dipakai memalsukan event (`context_*` selalu hasil composer user, bukan sistem).
- **Prefill dari layar lain** (people-profile "Chat" — UI-S-PR2 saat ini juga mendarat di tab Inbox) — resolver room yang sama bisa direuse; di luar scope ini.

## 6. Success Metrics

Tidak ada telemetry produk (belum ada Sentry/analytics — audit 2026-07-07), jadi metrik = gerbang teknis + proxy SQL:

- **Leading**: (a) jest hijau termasuk suite baru (target: semua AC §7 ter-cover); (b) DB contract test RPC baru lulus (validasi anti-spoof); (c) manual smoke: dari Tugas → room benar dalam 1 tap.
- **Lagging (proxy, query manual pasca-rilis 30 hari)**: `select count(*) from chat_messages where context_entity_id is not null` > 0 pada org aktif — bukti fitur dipakai; rasio pesan berkonteks : total sebagai baseline diskusi-menempel-card.

## 7. Acceptance Criteria (inti)

- **AC-1** Given PIC di layar Tugas dengan `initiative_id` terisi dan room ada, When tap "Buka Chat", Then mendarat di `/inbox/{roomId}` dengan chip "Membalas Tugas: {nama}" tampil.
- **AC-2** Given `initiative_id` null ATAU room tak terjangkau, When tap "Buka Chat", Then fallback ke tab Inbox tanpa crash/error keras.
- **AC-3** Given chip konteks tampil, When user menutup chip lalu kirim, Then pesan tersimpan tanpa kolom konteks.
- **AC-4** Given kirim dengan konteks, Then baris `chat_messages` berisi `context_entity_type='action_plan'`, id benar, dan `context_label` = nama Tugas **versi server** (klien tidak bisa memasok label — negative test: label spoof tidak mungkin karena tidak ada param label).
- **AC-5** Given RPC dipanggil langsung dengan `p_context_action_plan` milik Initiative LAIN, Then exception (pesan error eksplisit), tidak ada insert. Idem `p_reply_to` dari room lain.
- **AC-6** Given non-anggota memanggil RPC dengan konteks valid, Then ditolak guard `is_chat_member` existing.
- **AC-7** Given pesan berkonteks di thread, Then banner "Konteks Tugas: {label}" render di atas body; tap → layar Tugas; bila pembaca tak punya akses AP, layar tujuan menampilkan state "tidak ditemukan" (bukan bocor data — satu-satunya yang terlihat adalah label snapshot).
- **AC-8** Given pesan lama (kolom null), Then thread render persis seperti sekarang (regresi nol; suite existing tetap hijau).
- **AC-9 (P1)** Given balas via long-press, Then bubble baru merender kutipan; tap kutipan → pesan asal ter-highlight (param `highlight`).
- **AC-10** `npm test`, `npm run type-check`, `npm run lint` hijau; token terdaftar di `DESIGN.md §7` sebelum kode UI.

## 8. Timeline & Dependencies

- **Urutan**: migrasi+RPC (kontrak DB dulu, contract test) → data layer/tipe → UI composer+banner (P0) → reply-quote (P1, boleh fase terpisah).
- **Dependensi**: tidak ada. Reaction pill V2 sudah landed (42cbc6d) — pola build V2 (spec → tdd-plan → adjudikasi critic) tinggal diulang.
- **Gotcha mengikat**: (a) nomor migrasi WAJIB direkonsiliasi saat build — branch ini max `0045`, branch lain sudah sampai `0052`; (b) `DROP` signature lama `send_chat_message` sebelum create signature baru; (c) worktree butuh junction `node_modules` + copy `.env` untuk jest (memory `worktree-run-tests-preview`).

## 9. Decisions Locked (owner 2026-07-13)

Semua OQ terkunci dari sesi ini — rekomendasi diadopsi sebagai keputusan owner. Rasional dipertahankan sebagai jejak untuk peninjau berikut.

- **D-1 (was OQ-1) — LOCKED: terima label bocor terkontrol.** Anggota room yang tak punya akses sebuah Action Plan tetap melihat `context_label` (nama Tugas snapshot) di banner. Rasional: label adalah teks yang ditulis pengirim ber-akses saat kirim — setara mengetik nama itu di body pesan. Tidak ada RPC baca baru yang perlu digate; deep-link tap-banner tetap dinding RLS layar tujuan. **Implikasi TDD**: negative test = pembaca non-akses AP masih *melihat label* tapi tap-banner → layar Tugas menampilkan "tidak ditemukan" (bukan bocor field lain).
- **D-2 (was OQ-2) — LOCKED: kolom P0, UI reply-quote fast-follow.** Kolom `reply_to_message_id` + validasi same-room ikut migrasi P0 (satu migrasi, hindari drift). UI long-press → "Balas" → chip kutipan + render bubble kutipan diship sebagai **fast-follow terpisah** setelah P0 landed (P1 dipertahankan sebagai P1, bukan didorong ke P0). Rasional: mempersempit ripple UI P0 (chip konteks Tugas saja) menurunkan risiko regresi thread; kolom sudah siap tanpa migrasi kedua.
- **D-3 (was OQ-3) — LOCKED: konteks instance Tugas rutin = P2.** Enum `context_entity_type` tetap sempit ke `'action_plan'` di P0. Perluasan ke `'action_plan_instance'` (dengan validasi via parent `action_plans.initiative_id`) menyusul jika permintaan muncul; bentuk kolom sudah menampung.
- **D-4 (was OQ-4) — LOCKED: chip auto-lepas setelah kirim sukses.** Satu pesan = satu konteks. Setelah `send_chat_message` resolve tanpa error, chip dibersihkan dari state composer. Kirim gagal → chip tetap (retry masih membawa konteks). Rasional: mencegah pengiriman berkonteks tak-sengaja untuk pesan lanjutan yang niatnya polos.

## 10. Handoff ke TDD

**Fitur**: Reply-quote / Konteks Tugas — deep-link Tugas → room + banner konteks (P0) dengan kolom fondasi reply-quote (UI reply-quote = fast-follow P1 terpisah).

**Urutan TDD yang disarankan (red-green-refactor)**:
1. **Prasyarat (bukan test)**: daftarkan token `ChatContextBanner` (banner konteks di bubble + chip composer) di `DESIGN.md §7` + `global.css`. Rekonsiliasi nomor migrasi (branch ini max `0045`; branch lain sampai `0052`).
2. **Tahap 1 — DB contract** (migrasi baru): kolom nullable + constraint num_nonnulls; `send_chat_message` DROP+CREATE dengan dua param opsional; grant/revoke ulang pola 0008. Contract test: (a) insert konteks sah, `context_label` = server snapshot; (b) cross-Initiative → exception; (c) `p_reply_to` cross-room → exception; (d) non-member → guard existing; (e) call tanpa dua param baru = perilaku identik 0008 (backward compat).
3. **Tahap 2 — Data layer & tipe**: `listChatMessages` select diperluas + `reply_to` join; `sendChatMessage(roomId, body, mentions, opts?)` opts baru. Test round-trip nullable/non-null; pesan lama (null) tetap render tanpa banner.
4. **Tahap 3 — UI Tugas → Chat**: `action-plan/[id].tsx` "Buka Chat" resolve room via `chat_rooms.select('id').eq('initiative_id', ap.initiative_id).maybeSingle()` → push `/inbox/{roomId}?contextAp={ap.id}`; test (a) happy path, (b) `initiative_id` null → fallback `/(tabs)/inbox`, (c) room 0 baris → fallback.
5. **Tahap 4 — Composer chip + kirim berkonteks**: `inbox/[roomId].tsx` baca `contextAp`, `getActionPlan(contextAp)` untuk nama (0 baris → chip tidak render, param diabaikan diam-diam), chip tutup ≥44dp `accessibilityLabel="Lepas konteks"`, kirim menyertakan konteks; test auto-lepas setelah sukses (D-4), retry saat gagal masih membawa konteks.
6. **Tahap 5 — Bubble render banner**: banner "Konteks Tugas: {label}" di atas body; tap → `router.push('/action-plan/{context_entity_id}')`; a11y prefiks teks + touch target ≥44dp; test pembaca non-akses tetap lihat label tapi layar tujuan "tidak ditemukan" (D-1).
7. **Tahap 6 — Layar Initiative "Buka Chat Initiative"** (P0-ringan): resolver room yang sama tanpa `contextAp`; fallback identik.
8. **(Fast-follow P1 — terpisah)**: reply-quote UI long-press → Balas → chip kutipan → bubble kutipan → tap kutipan set `?highlight=`. Kolom & validasi sudah ada dari Tahap 1.

**Larangan keras untuk TDD**:
- Tidak ada RPC baca baru untuk gate label (D-1 sudah kunci).
- Tidak ada tabel `chat_message_attachments` (evidence-locking PRD §35 — konsisten `inbox-chat-ui.md` FR-IN4.5).
- Tidak ada trigger otomatis dari `action_plan_submissions` yang menulis pesan berkonteks (system events tetap DEFER V2-lanjutan).
- Tidak ada pembuatan room dari klien; room tetap lahir dari trigger `initiative_chat_room`.
- Nomor migrasi WAJIB direkonsiliasi saat build (branch drift).
- `DROP` signature `send_chat_message` lama sebelum `CREATE` signature baru (hindari overload ambigu di PostgREST).
