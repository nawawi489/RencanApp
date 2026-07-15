---
type: source
tags: [spec, inbox, chat, attachment, prd-30, governance, deferred-v2]
updated: 2026-07-15
sources: 6
status: all-owner-decisions-locked-v-checks-passed-awaiting-v2-scheduling
milestone: V2
basis: origin/staging @ aaaebf3
---

> **Keputusan owner — semua terkunci 2026-07-15.**
>
> | # | Isu | Keputusan | Diimplementasi di |
> |---|---|---|---|
> | **A** | Amandemen sempit K-1/K-2/K-3 | Pengecualian sempit + Rule 4 dipersempit + komponen 11; larangan build `specs/inbox-chat-ui.md` L192 **tetap** sampai V2 dijadwalkan | §1.4, §1.5, FR-ATT-0.1/0.2/0.3 |
> | **B** | V1 slice | Gambar saja (JPG/PNG/WebP) + caption wajib + 3 file × 5 MB/pesan + thumbnail inline; NG-3/NG-4/NG-6 diperkuat | FR-ATT-1.3, §6.2, NG-3/4/6 |
> | **C** | Visibilitas file | `(is_chat_member OR can_view_workspace) AND <predikat confidential>`; **salin klausa 2** `can_access_action_plan` — jangan panggil fungsinya (§5.1) | §6.4 `can_read_chat_attachment` |
> | **D** | Gap confidential pesan **teks** | Isu terpisah P1; di luar scope fitur ini | NG-11 (dipertahankan) + task chip follow-up |
> | **E** | Milestone | V2 — TDD menunggu penjadwalan; amandemen tertulis boleh mendarat sekarang | FR-ATT-0.2 (L192 tetap) |
> | **F** | Retensi orphan | Terima; V1 andalkan cleanup pra-commit; sweeper = isu terpisah nanti | FR-ATT-1.5 + task chip follow-up |
>
> **Verifikasi teknis:** V-1 ✅ (2026-07-15), V-2 ✅ (2026-07-15 — dengan koreksi baseline: `is_chat_member` sudah ber-grant `authenticated` via Supabase default privileges, bukan tanpa grant sebagaimana asumsi awal). Semua gate spec ini terpenuhi; yang tersisa adalah **penjadwalan V2 oleh owner** (bukan keputusan spec).

> **Ringkasan eksekutif.** Spec final untuk "Lampiran diskusi (gambar) pada pesan Initiative Chat" — komponen ke-11 PRD §30 yang belum ada. Fitur ini membuka pengiriman gambar sebagai **lampiran diskusi informal**, sambil menegakkan batas "lampiran diskusi ≠ Bukti formal" **struktural di Postgres** (bucket terpisah, tanpa FK ke evidence, whitelist `evidence_files.kind` utuh, Score Formula buta terhadap kolom lampiran). Ini **amandemen**, bukan bug: tiga sumber tertulis melarangnya hari ini. Jalur amandemen mengikuti preseden **Reaction pill** — pengecualian sempit tertulis, milestone V2, larangan build `specs/inbox-chat-ui.md` L192 tetap dihormati sampai V2 dijadwalkan. V1 dipotong agresif (gambar saja, caption wajib, thumbnail inline) — pemotongan itu menghapus tiga keputusan bloking sekaligus.

# Spec — Lampiran Diskusi (Gambar) pada Pesan Initiative Chat

## 0. Basis & metodologi verifikasi

> [!warning] Baca ini sebelum apa pun
> Spec ini ditulis terhadap **`origin/staging` @ `aaaebf3`**, setelah `git fetch`.
>
> Draft-draft sebelumnya ditulis terhadap checkout lokal `0b76499`, yang **tertinggal 32 commit** (`git rev-list --left-right --count staging...origin/staging` → `0 32`). Seluruh klaim baseline mereka — "migrasi tertinggi 0051", "tidak ada realtime/optimistic/keyset", "tidak ada spec push", "tidak ada spec reactions" — **salah**, dan beberapa keputusan bloking dibangun di atasnya.
>
> **Aturan mengikat untuk siapa pun yang melanjutkan spec ini:** verifikasi baseline dengan `git ls-tree --name-only origin/staging supabase/migrations/` setelah `git fetch` — **jangan** dengan `ls` di working tree. Itu persis mekanisme yang melahirkan kesalahan di atas.

Fakta baseline terverifikasi (2026-07-15):

| Fakta | Nilai |
|---|---|
| Migrasi tertinggi | `0058_fix_reaction_table_grants.sql` → **migrasi baru = `0059`** |
| Chat suite | **MERGED**: realtime `0052` (+ `replica identity full`), seen-by `0053`, FTS `0054`, reactions `0055`, reply-context `0056`, system events `0057`, grants `0058`×2 |
| `chat_messages` kolom | `id, organization_id, chat_room_id, author_id, body (NOT NULL), created_at, kind, system_event_type, actor_id`, + context/reply dari `0056` |
| `send_chat_message` signature LIVE | `(uuid, text, uuid[], uuid, uuid)` — `p_room, p_body, p_mentions, p_context_action_plan, p_reply_to` |
| Optimistic send | **ADA** (`use-inbox.ts` `onMutate`, `send(body, mentions, optimistic)`) |
| Keyset pagination | **ADA** (`inbox.ts` `buildKeysetOr`, `(created_at, id) < (T, X)`) |
| Bucket Storage | **hanya `evidence`** (`0005:569`), `public=false` |
| `specs/inbox-chat-reactions.md` | **ADA** — `status: ready-for-v2-build`, `milestone: V2` |
| `specs/push-notifications.md` | **ADA** |

**"Collision 0058" bukan blocker.** Kedua file (`0058_fix_get_chat_rooms_grant.sql`, `0058_fix_reaction_table_grants.sql`) sudah mendarat bersamaan di `origin/staging` via PR #60 dan #62. Urutan apply deterministik (Supabase CLI mengurutkan nama file lengkap). Ini wart penomoran, bukan nondeterminisme. **`0059` aman diklaim.**

---

## 1. Problem, Goals & Nilai

### 1.1 Problem statement (hipotesis, bukan temuan riset)

> [!note] Kejujuran epistemik
> Berikut adalah **hipotesis produk yang diturunkan dari PRD dan kode**, bukan hasil observasi pengguna. Tidak ada wawancara, telemetri, atau tiket dukungan yang mendasarinya. Preseden yang benar: `specs/inbox-chat-reactions.md` menandai goal-nya "(asumsi, bukan kebutuhan tervalidasi)". Spec ini melakukan hal yang sama.

Diskusi Rencana Aksi (PRD §30) hari ini adalah kanal **teks-saja**. Tujuan produk di `prd/01 §2` poin 5 — *"Mengganti follow up manual WhatsApp dengan Initiative Chat kontekstual"* — **diduga** tidak tercapai sepenuhnya, karena bentuk follow-up kerja paling umum di WhatsApp adalah mengirim foto/tangkapan layar sambil bertanya.

Konsekuensi struktural yang **dapat diverifikasi di kode** (ini fakta, bukan hipotesis):

1. **Satu-satunya jalur mengirim gambar di produk adalah alur submit Bukti Task** (`mobile/src/app/(app)/task/submit.tsx` + `mobile/src/lib/storage.ts`), dan alur itu dirancang untuk artefak **formal** — versioned, terkunci saat direview.
2. **Non-PIC secara struktural tidak bisa mengunggah apa pun.** `evidence_insert_pic_only` (`0019:290-301`) mensyaratkan `foldername[2]::uuid` = Task yang `pic_id = auth.uid()`. Reviewer atau PIC induk yang ingin menunjukkan contoh visual **tidak punya jalur teknis apa pun**.

Jadi klaim yang bisa dipertahankan bukan "orang frustrasi", melainkan: **produk tidak menyediakan jalur untuk gambar informal, dan pihak yang paling mungkin membutuhkannya (Reviewer) justru yang paling pasti ditolak.**

### 1.2 Kenapa ini bukan "sekadar tambah paperclip"

Pemisahan chat vs Bukti **terkode di database**, bukan di UI:

| Lapis | Penegakan | Sumber |
|---|---|---|
| Bucket | Hanya satu bucket, `evidence`, `public=false` | `0005:569` |
| INSERT | Hanya PIC Task, path wajib memuat `task_id` miliknya | `0019` `evidence_insert_pic_only` |
| UPDATE | **Tidak ada policy UPDATE sama sekali** (evidence locking) | `0019:340` |
| DELETE | Hanya saat submission `status='draft'` | `0019` `evidence_delete_draft_only` |
| Tulis chat | Grant `insert/update/delete` dicabut dari `authenticated`+`anon`; tulis hanya via RPC DEFINER | `0008:1037-1044` |

### 1.3 Kontradiksi terhadap sumber — apa yang diamandemen

| # | Sumber | Bunyi | Tindakan |
|---|---|---|---|
| K-1 | `PRD.md:1211` §30 Rule 4 | "Bukti tetap dikirim melalui Task, bukan sebagai chat biasa." | **Persempit** (§1.4) |
| K-2 | `prd/03 §B.7` (~L110) | Duplikat Rule 4 | **Persempit** identik — jangan tinggalkan yatim |
| K-3 | `specs/inbox-chat-ui.md:104` FR-IN4.5 | "Paperclip attach-evidence: **DEFER** … tabel `chat_message_attachments` **DILARANG**" | **Perbarui bersyarat** (bukan cabut total — lihat §1.5) |

PRD §30 mendaftar **tepat 10 komponen**; attachment tidak ada → butuh **komponen ke-11**.

**Koreksi sitasi (dibawa ke amandemen):** FR-IN4.5 menyitir *"bypass evidence-locking PRD §35"*. **PRD §35 adalah Activity Log.** Evidence locking yang benar = **PRD §24.1** (L1024-1026) + `prd/02 §E.1` (L169-170). Komentar `0019:322,340` mewarisi sitasi salah yang sama.

**`scope-guardrails.md` TIDAK melarang attachment.** Daftar "Ditolak" (L18) = Feed/News/Announcement/Social reaction/Story/Reels. "Inbox Initiative Chat" ada di daftar "Masuk V1.8.2". Gate-nya murni K-1/K-2/K-3.

### 1.4 Usulan redaksi amandemen

**PRD §30 Rule 4 (baru):**
> 4. **Bukti formal** — yang masuk riwayat versi, terkunci saat direview, dan dinilai Reviewer — tetap dikirim melalui Task. **Lampiran diskusi** di chat bersifat informal: tidak pernah menjadi Bukti, tidak masuk riwayat versi, tidak menjadi input Review, dan tidak berbobot dalam Score Formula.

**PRD §30 Komponen 11 (baru):** `Attachment bubble` — lampiran diskusi di dalam message bubble. Bukan galeri, bukan feed, bukan tab file.

**`prd/03 §B.7`:** perubahan paralel. Kalimat pertama ("Inbox bukan tempat approval resmi") **tidak berubah**.

**`wiki/concepts/scope-guardrails.md` + `prd/01 §12`:** tambah §"Pengecualian sempit — Lampiran diskusi Initiative Chat", mengikuti pola yang sudah ada untuk Reaction pill.

Rasional untuk owner: amandemen ini **menajamkan** Rule 4. Hari ini "Bukti lewat Task" ditegakkan dengan **melarang semua file di chat** — instrumen tumpul yang ikut memblokir klarifikasi visual yang sah. Setelah amandemen, garisnya digeser ke tempat yang benar (formal vs informal) dan ditegakkan **struktural di DB**.

### 1.5 Kelas amandemen & jalur yang dipilih

> [!warning] Jangan lebih-lebihkan preseden Reaction pill di depan owner
> `specs/inbox-chat-reactions.md` **ADA** dan merupakan template gaya yang benar (tabel "Keputusan owner terkunci" O1–O6). Tapi **kelasnya lebih ringan**: Reaction pill sudah terdaftar di PRD §30 sebagai komponen 6, jadi amandemennya hanya **menutup gap** antara PRD dan `scope-guardrails`. Attachment: (a) tidak terdaftar di §30, **dan** (b) dilarang Rule 4 eksplisit, **dan** (c) namanya disebut sebagai DILARANG di spec FINAL.

**Yang ditiru dari preseden reactions adalah jalurnya, bukan bobotnya:**

- Reactions **tidak mencabut** larangan build `specs/inbox-chat-ui.md` L192. Ia menempuh **pengecualian sempit tertulis**, lalu **tetap tunduk** pada larangan itu sampai V2 dijadwalkan ("Milestone build tetap V2; larangan menulis kode/test di L190 tetap berlaku sampai V2 dijadwalkan").
- Spec ini melakukan hal yang sama: FR-IN4.5 **diperbarui menjadi bersyarat** ("dibuka bersyarat, lihat spec ini, build V2"), larangan L192 **tetap berlaku**. Ini lebih murah dan lebih jujur daripada menuntut pencabutan total.

### 1.6 Goals

| # | Goal | Ukuran keberhasilan |
|---|---|---|
| G-1 | Anggota room bisa melampirkan gambar tanpa melewati alur Bukti Task | Anggota room **non-PIC** berhasil kirim lampiran; Storage tidak menolak |
| G-2 | Batas "lampiran ≠ Bukti" ditegakkan **struktural** | Tanpa FK ke `evidence_files`/`task_submissions`; bucket terpisah; whitelist `evidence_files.kind` tidak bertambah; Score Formula tidak pernah membaca kolom lampiran |
| G-3 | Otorisasi lampiran tidak lebih longgar dari pesan yang memuatnya | Baca ≥ ketat dari `chat_messages_select`; tulis di-gate `is_chat_member` di RPC |
| G-4 | Validasi MIME & ukuran **server-side** | Bucket config (`file_size_limit`/`allowed_mime_types`) **dan** re-verify RPC via `storage.objects.metadata` |
| G-5 | Zero bobot governance | Tidak masuk ranking/Score; tidak menghasilkan `activity_log`/`governance_violation` pada jalur normal; tidak muncul di riwayat versi Bukti |

> **Catatan G-5 vs draft sebelumnya:** goal "percobaan tak berwenang tercatat" **DIHAPUS**. Alasannya di §5.5 — secara struktural tidak dapat dipenuhi di V1.

### 1.7 Ringkasan nilai & biaya jujur

**Nilai:** klarifikasi visual selesai di dalam konteks Rencana Aksi. Untuk arsitektur: batas formal/informal berpindah dari "aturan yang dihafal" ke **invarian yang ditegakkan Postgres**.

> [!warning] Klaim yang DICABUT dari draft sebelumnya
> Draft mengklaim "evidence trail justru **lebih bersih**". **Tidak berdasar, dan arahnya berlawanan dengan risiko utama fitur ini** — yaitu bukti nyata mendarat di chat lalu tidak pernah diformalkan ke Task. Membuka jalur informal sama masuk akalnya membuat evidence trail lebih **miskin**. Klaim ini diganti dengan risiko eksplisit di §8.

**Biaya jujur (bukan reuse):**

- **Menampilkan gambar = greenfield 100%.** `createSignedUrl`/`getPublicUrl` = **nol hasil** di `mobile/src`. Bukti Task pun hanya dirender **teks** (`submission-card.tsx`: `ev.text_content || ev.url || ev.file_name || '—'`). Klaim "upload file sudah ada" benar untuk **upload**, menyesatkan untuk **display**.
- **`expo-image-picker` belum terpasang** (`mobile/package.json` hanya `expo-document-picker@^56.0.4`) → dependency baru + kemungkinan prebuild. NativeWind dipin `5.0.0-preview.4`, dilarang bump.
- Bucket baru + 2 policy Storage + 2 RPC + 4 helper/constraint + amandemen 5 dokumen.

### 1.8 Alternatif yang dipertimbangkan & ditolak

| Alternatif | Kenapa ditolak |
|---|---|
| **(a) Perbaiki alur Bukti saja** — preview lebih baik + deep-link dari chat ke `task/submit` | Tidak menyelesaikan problem inti: Reviewer/PIC induk **bukan PIC Task**, jadi `evidence_insert_pic_only` tetap menolak mereka. Alternatif ini melayani PIC yang sudah terlayani, dan mengabaikan pihak yang benar-benar buntu. |
| **(b) Longgarkan siapa yang boleh melampirkan di Task** (izinkan Reviewer upload ke bucket `evidence`) | **Membobol ER-3 anti-Reviewer-file-injection** (`supabase/tests/0019_ap5_ap6_contract.sql:19,156`) dan bersinggungan dengan anti-self-approval. Menukar masalah UX dengan lubang governance. Ditolak keras. |
| **(c) Status quo** — arahkan ke WhatsApp | Justifikasi tunggal Initiative Chat (`prd/01 §2` poin 5) gugur. Tapi **sah dipilih** jika owner menilai biaya §1.7 tidak sepadan — itulah gunanya OWNER-E. |
| **(d) Bucket `evidence` direuse untuk chat** | **Ditolak secara teknis**, bukan trade-off. Lihat §6.3. |

---

## 2. Non-Goals

| # | Non-goal | Alasan mengikat |
|---|---|---|
| NG-1 | **Promosi lampiran chat → Bukti Task** (tombol, RPC, pointer, copy objek) | PRD §24.1 mensyaratkan versioning + lock-saat-direview; chat append-only tapi **tidak** ber-versi dan **tidak** ter-lock → struktural tidak memenuhi syarat. Promosi via pointer membuka lubang ER-3 (Reviewer **adalah** anggota room). |
| NG-2 | **Deep-link "Kirim sebagai Bukti"** | Ditunda V2 **secara tegas** (bukan "opsional"). V1 punya satu cerita tunggal: chat tidak menyebut Bukti selain lewat banner governance yang sudah shipped. |
| NG-3 | **Lampiran dokumen (PDF/docx/xlsx)** | Dokumen terbaca sebagai artefak formal dan mempersempit jarak terhadap Rule 4. V2. |
| NG-4 | **Pesan lampiran-tanpa-caption** | Caption **wajib** di V1. Konsekuensi disengaja: `body NOT NULL` (`0008:182`) + guard `'Pesan tidak boleh kosong.'` (`0008:410`, dipertahankan byte-for-byte di `0056:53`) **tidak disentuh**. |
| NG-5 | **Perubahan `get_chat_rooms()` / preview Inbox** | Konsekuensi langsung NG-4: pesan selalu punya body → preview tidak pernah kosong. RPC tersentuh turun 3→2. |
| NG-6 | **Viewer ukuran penuh / tap-to-zoom** | Thumbnail inline saja. Display = greenfield (§1.7); viewer adalah scope kedua. |
| NG-7 | **Galeri / tab File / agregasi lintas-room / feed** | `scope-guardrails.md` menolak Feed/Story/Reels permanen. |
| NG-8 | **Edit/hapus pesan; hapus lampiran oleh user** | `chat_messages` immutable by design. Satu-satunya penghapusan objek = cleanup orphan **pra-commit** (§6.6). |
| NG-9 | **Notifikasi/push tersendiri** | Alasan **produk** (anti-noise + paritas dengan pesan induk), bukan "spec push tidak ada" — `specs/push-notifications.md` **ADA**. Lampiran mewarisi aturan mention apa adanya. |
| NG-10 | **Indexing Search** | `prd/03:212` menjadikan "Chat" dan "Bukti" dua jenis hasil terpisah. Nama file di grup "Bukti" = batas amandemen bocor di lapis Search meski lapis data bersih. |
| NG-11 | **Menutup gap confidential pada pesan TEKS** | `chat_messages_select` (`0008:336-341`) tidak memeriksa `confidential_access_rules`. Gap **sudah ada**, bukan disebabkan fitur ini. Ditutup untuk **file** saja; gap teks dinaikkan terpisah (OWNER-D). |
| NG-12 | **Menyelesaikan OWNER-1/OWNER-3** (ambiguitas membership) | Model akses mewarisi `is_chat_member()` apa adanya. |
| NG-13 | **Menyentuh policy bucket `evidence`** | Policy Storage berbagi satu tabel lintas bucket. Policy baru **wajib** memfilter `bucket_id`. |

---

## 3. User Stories

**Basis otorisasi yang diwarisi** (fitur ini tidak menambah/melonggarkan peran apa pun):

| Sumbu | Aturan | Sumber |
|---|---|---|
| Keanggotaan room | Derived server-side; PIC Action Plan + PIC/Reviewer Task turunan; dicabut otomatis | `0008:266-298` |
| Baca pesan | `is_chat_member(room) OR can_view_workspace()` | `0008:336-341` |
| Tulis pesan | `is_chat_member(room)` saja | `0008:413-415` |

**Asimetri yang mengikat semua story:** baca lebih longgar daripada tulis. Workspace-viewer non-member **sudah** bisa membaca isi chat hari ini. Lampiran mewarisi asimetri ini persis. Ini **mengoreksi asumsi "hanya anggota room yang boleh lihat"** — asumsi itu tidak sesuai baseline, dan menerapkannya akan membuat file **lebih ketat daripada caption di bubble yang sama**.

### Epik 1 — Mengirim (anggota room)

- **US-1** — Sebagai **anggota room**, saya melampirkan gambar ke pesan chat agar bisa menunjukkan konteks visual tanpa membuka alur submit Bukti Task. *Guard:* non-member yang menembus UI tetap ditolak RPC.
- **US-2** — Sebagai **pengirim**, saya melihat progres upload (Siap unggah → Mengunggah → Selesai → Gagal). *Reuse:* `AttachmentRow` + `ProgressPill` (`ui.tsx:955-1008`, `DESIGN.md:165-166`) sudah punya 4-state + "Coba lagi" + a11y label.
- **US-3** — Sebagai **pengirim yang uploadnya gagal**, saya bisa "Coba lagi" atau membuang file itu, dan **caption saya tidak hilang** (no-regress FR-IN4.2).
- **US-4** — Sebagai **pengirim**, saya ditolak lebih awal (client) **dan** di server jika file melebihi batas atau MIME tidak diizinkan.

### Epik 2 — Melihat (anggota room)

- **US-5** — Sebagai **anggota room**, saya melihat lampiran sebagai **thumbnail di dalam bubble**. *Greenfield 100%* (§1.7).
- **US-6** — Sebagai **anggota room**, unread saya tetap benar tanpa perubahan apa pun: lampiran tetap **satu baris `chat_messages`**.

### Epik 3 — Baca-saja (CEO / pemegang `view_all_workspace` non-member)

- **US-7** — Sebagai **viewer non-member**, saya bisa melihat lampiran di room non-confidential (paritas dengan kemampuan saya membaca pesannya hari ini), tetapi **tidak** bisa mengunggah. Sisi baca digate policy SELECT; sisi tulis digate `is_chat_member` di RPC. **Jangan pakai satu helper untuk keduanya.**

### Epik 4 — Confidential

- **US-8** — Sebagai **user tanpa grant Confidential**, saya **tidak** melihat lampiran pada Action Plan confidential. Ini satu-satunya tempat spec ini **sengaja menyimpang dari paritas**, dan menyimpangnya ke arah **lebih ketat**.
- **US-9** — Sebagai **Reviewer Task anggota room** yang **merupakan grantee**, saya **tetap** bisa melihat lampiran. *(Story ini ada khusus untuk menangkap regresi §6.4.)*

### Epik 5 — Batas terhadap Bukti

- **US-10** — Sebagai **PIC Task**, saat saya tergoda memakai chat untuk bukti, banner governance yang **sudah shipped** mengarahkan saya. *Reuse microcopy kanonik* (`[roomId].tsx:20`): **"Keputusan formal (Review, Bukti, Nilai Hasil) lewat Action Plan — chat untuk diskusi cepat."** Jangan karang microcopy baru.
- **US-11** — Sebagai **Reviewer**, lampiran chat **tidak pernah** muncul sebagai Bukti di layar Review saya.
- **US-12** — Sebagai **siapa pun**, jumlah lampiran saya **tidak** mempengaruhi skor/ranking/Governance Discipline.

### Alur utama (happy path V1)

```
Anggota room buka /inbox/{roomId}
  → banner governance (existing, shipped)
  → tap paperclip → picker gambar
  → validasi client (MIME + ukuran) → AttachmentRow "Siap unggah"
  → ketik caption (WAJIB) → tap Kirim
     ├─ upload ke bucket chat-attachments  ┐ pola 2-phase ER-2
     └─ RPC send_chat_message (commit)     ┘ (anti double-tap via inFlight ref)
  → optimistic bubble tampil (onMutate SUDAH ADA di use-inbox.ts)
  → gagal? → rollback optimistic + Promise.allSettled(cleanup) utk path ter-upload
  → sukses → event realtime membawa payload LENGKAP (jsonb + replica identity full)
            → dedup temp vs server by id → satu bubble
  → unread & preview Inbox otomatis benar (nol perubahan get_chat_rooms)
```

---

## 4. Functional Requirements

Penomoran: `FR-ATT-<grup>.<n>`. `[BLOCKED]` = menunggu keputusan owner (§9).

### 4.0 Gate amandemen

- **FR-ATT-0.1 ✅ LANDED (PR #65, 2026-07-15)** — Amandemen tertulis mendarat di: `PRD.md` §30 Rule 4 + daftar komponen; `prd/03 §B.7`; `wiki/concepts/scope-guardrails.md` §pengecualian sempit; `prd/01 §12`; `specs/inbox-chat-ui.md` FR-IN4.5.
- **FR-ATT-0.2** — Larangan build `specs/inbox-chat-ui.md` **L192 tetap berlaku** sampai V2 dijadwalkan (preseden reactions).
- **FR-ATT-0.3 ✅** — Koreksi sitasi §35 → §24.1 landed bersama FR-ATT-0.1 (§1.3).
- **FR-ATT-0.4 ✅ DESIGN.md LANDED (2026-07-15)** — Token `ChatAttachButton` + `ChatAttachmentBubble` + `ChatAttachmentThumbnail` didaftarkan di `DESIGN.md §7` (Fase-0; preseden: 3 token reaction). **`global.css` tidak butuh entri baru** — semua warna/radius direuse dari skala existing (`brand-dark`, `neutral-100/800`, `Skeleton`, radius `xl`), sama seperti preseden `ReactionPill` yang juga nol penambahan `global.css`.

### 4.1 Composer & pengiriman

- **FR-ATT-1.1** — Tombol lampir ≥44×44 dengan **inline style** `{width:44,height:44}` + `accessibilityLabel` — bukan hanya class NativeWind (preseden mengigit: `SendButton`, `wiki/log.md` L232 — class tidak selalu flatten di jest).
- **FR-ATT-1.2 [BLOCKED]** — Sumber = `expo-image-picker` (**dependency baru**, butuh persetujuan + kemungkinan prebuild).
- **FR-ATT-1.3** — **Caption wajib.** `body NOT NULL` dan guard `0008:410` **tidak disentuh**.
- **FR-ATT-1.4** — Alur kirim **2-phase**: upload → RPC commit. Meniru `use-submission.ts:63-139`. Anti double-tap via `inFlight` ref share promise.
- **FR-ATT-1.5** — Kegagalan commit setelah upload sukses memicu `cleanup_orphan_chat_upload` via `Promise.allSettled`, **hanya** untuk path ter-upload.
- **FR-ATT-1.6** — **Optimistic send DIPAKAI, bukan dibangun ulang.** `useChatActions.send(body, mentions, optimistic)` dengan `onMutate` **sudah ada** di `origin/staging`. Progress upload tampil di **composer** (`ProgressPill`); bubble optimistic muncul **setelah** upload selesai, saat RPC commit dimulai. *(Ini merekonsiliasi kontradiksi draft: FR lama bilang "composer only", EE lama bilang "bubble optimistic dengan ProgressPill" — dua UX untuk satu momen.)*
- **FR-ATT-1.7** — Error via `surfaceServerError` (domain) / `reportError` (tak terduga). **Jangan** tampilkan SQLSTATE/pesan Postgres/status HTTP/path Storage (PRD §40).

### 4.2 Storage

- **FR-ATT-2.1** — **Bucket baru wajib; reuse `evidence` ditolak secara teknis** (§6.3).
- **FR-ATT-2.2** — `chat-attachments`, `public = false`. Public URL bukan opsi.
- **FR-ATT-2.3** — Path: `{org_id}/{room_id}/{group_id}/{uuid}-{safe_filename}`, syarat `array_length(storage.foldername(name),1) >= 3`. **Jangan tiru fallback `< 2 AND can_view_workspace()`** dari `evidence_select_authorized` (`0046:2867`).
- **FR-ATT-2.4** — Policy **wajib** memfilter `bucket_id`. RLS `storage.objects` berlaku lintas bucket di satu tabel.
- **FR-ATT-2.5** — Segmen org **wajib divalidasi** `= current_user_org()::text`. Segmen path dikontrol klien; tanpa validasi ia adalah identitas yang tidak pernah diverifikasi.
- **FR-ATT-2.6** — Signed URL **TTL 60 detik**, di-mint **per-render**. Alasan mengikat: membership derived & dicabut otomatis (`0008:266-298`); URL berumur panjang = akses yang tidak bisa dicabut.

### 4.3 Render

- **FR-ATT-3.1** — Thumbnail di dalam bubble. Bukan galeri/grid/feed.
- **FR-ATT-3.2** — State gagal/retry tidak mengandalkan warna saja (`DESIGN §4`). `ProgressPill` sudah mencontohkan pola benar.
- **FR-ATT-3.3** — Signed URL di-mint saat **render**, bukan saat fetch page — agar TTL 60s tidak kedaluwarsa di halaman keyset yang ter-cache.

### 4.4 Governance

- **FR-ATT-GOV.1** — **Append-only 2-lapis.** Policy SELECT saja + REVOKE insert/update/delete + tulis hanya via RPC DEFINER (pola `0008:1037-1044`).
- **FR-ATT-GOV.2** — **Zero bobot governance** (§1.6 G-5).
- **FR-ATT-GOV.3** — **Empat penjaga struktural** (§6.8). Jika keempatnya dipenuhi, bukti tidak bisa bocor lewat chat **bahkan jika UI salah**.
- **FR-ATT-GOV.4** — **Promosi → Bukti DILARANG di V1** (NG-1).
- **FR-ATT-GOV.5** — Tulis di-gate `is_chat_member` di RPC; baca di-gate policy SELECT. **Jangan pakai satu helper untuk keduanya.**
- **FR-ATT-GOV.6 [BLOCKED]** — Gate baca = `(is_chat_member OR can_view_workspace()) AND <predikat confidential>` (§6.4).

### 4.5 Keamanan

- **FR-ATT-SEC.1** — **Validasi MIME + ukuran WAJIB server-side, dua lapis.** Ini **pelanggaran guardrail permanen** jika client-only (`prd/01 §12`, PRD §41, `prd/03 §F`: *"Keamanan bukan tugas frontend"*). Preseden negatif yang **tidak boleh diulang**: `FILE_MAX_BYTES = 10MB` (`storage.ts:18`) dideklarasikan sebagai keputusan ("OQ-3 default") tapi **hanya ditegakkan klien**.
- **FR-ATT-SEC.2** — Batas jumlah ditegakkan RPC **dan** CHECK (preseden server-side: `submit_task` menolak `> 5` evidence, `0046:2340`).
- **FR-ATT-SEC.3** — `sanitize()` (`logger.ts:151-190`) meredaksi `JWT_PATTERN` → signed URL `?token=eyJ...` otomatis `[REDACTED_JWT]`. **Namun** `storage_path` **tidak** ada di `SENSITIVE_FRAGMENTS` → **wajib ditambahkan**. Jangan log `file_name` (bisa PII: `KTP-budi.jpg`).

---

## 5. Jebakan yang wajib dihormati

### 5.1 `can_access_action_plan` akan mengunci anggota room sah

> [!warning] Temuan paling penting di spec ini
> Rekomendasi draft sebelumnya — gate `is_chat_member AND can_access_action_plan(room.action_plan_id)` — **akan memblokir Reviewer Task dan PIC Task dari lampiran di room mereka sendiri.**

`can_access_action_plan` (`0051:23-46`) punya **dua klausa konjungtif**:

```sql
AND ( can_view_workspace() OR ap.pic_id = auth.uid()
      OR ap.created_by = auth.uid() OR i.pic_id = auth.uid() )   -- klausa 1
AND ( NOT EXISTS(confidential rule) OR user_role_level()='ceo'
      OR ap.pic_id = auth.uid() OR EXISTS(grantee) )              -- klausa 2
```

Header `0051` menyatakan eksplisit: *"action_plans (no reviewer_id column)"*. **Klausa 1 tidak mengenal Reviewer Task maupun PIC Task.** Sementara `recompute_chat_room_members` (`0008:266-298`) menjadikan mereka **anggota room**.

**Solusi:** salin **hanya klausa 2** ke helper berdiri sendiri. Lihat §6.4.

### 5.2 Audit violation pada reject path tidak persist

> [!warning] Klaim "ditolak DAN tercatat" adalah AC yang mustahil hijau

`0019:13` menyatakan: *"log_governance_violation di reject path **TIDAK survive rollback transaksi** (preseden Fase 7 V1 limitation — butuh autonomous tx / Edge Function untuk persist). **Hanya untuk SUCCESS path.**"* Dikonfirmasi `0020:16`.

**Konsekuensi:** G-5 draft ("percobaan tak berwenang tercatat") **dicabut**. AC-RPC-6 secara eksplisit **tidak** meng-assert violation log. Menaikkan ini menjadi kapabilitas nyata = scope baru (autonomous tx / Edge Function).

### 5.3 Severity lowercase

`0019:11`: *"severity ∈ {low|medium|high|critical} (bukan 'warning' — check constraint `governance_violations_severity_check` di migrasi **0014**)"*. Seluruh call-site live memakai lowercase. **`'High'` gagal 23514.**

> Sitasi `0005:178` sebagai potret tabel `governance_violations` **salah** — `0005` tidak punya kolom `severity`; kolom + CHECK datang dari `0014`.

### 5.4 Target DROP `send_chat_message`

`0056:34` **sudah** melakukan `drop function if exists public.send_chat_message(uuid, text, uuid[])`. Signature **live** = `(uuid, text, uuid[], uuid, uuid)` (`0056:36-41`, grant di `0056:119-120`).

Men-drop signature 3-param lagi = **no-op**, lalu `create` versi baru menghasilkan **overload ambigu PostgREST** — persis kegagalan yang aturan ini klaim dicegah. **Target yang benar: signature 5-param.**

### 5.5 DROP menghapus ACL

`0058_fix_get_chat_rooms_grant.sql` header: *"0046 recreated get_chat_rooms() via DROP+CREATE without an explicit GRANT EXECUTE TO authenticated (**DROP wipes prior ACLs**). 0057 then assumed 'CREATE OR REPLACE preserves existing authenticated grant' and revoked public/anon on top of that — leaving no role with EXECUTE besides the function owner. **Result: every authenticated user got 42501 loading Inbox.**"*

Setiap DROP+CREATE wajib disusul grant eksplisit + test `has_function_privilege`.

### 5.6 `safeFilename()` — FALSE POSITIVE yang harus dihentikan

> [!warning] Jangan buka isu untuk ini
> Klaim yang beredar di draft **dan** di review: *"`safeFilename()` punya bug `.replace(/[ -]/g,'')` = range 0x20–0x2D yang menghapus spasi dan `!\"#$%&'()*+,-`; `Laporan Q3 - final.pdf` → `LaporanQ3final.pdf`."*
>
> **DIBANTAH.** Dump codepoint pada `origin/staging`:
> ```
> const clean = (name ?? '')<0x0a>    .replace(/[<0x00>-<0x1f><0x7f>]/g, '')
> ```
> Regex sebenarnya `/[\x00-\x1F\x7F]/g` — **control characters**, persis sesuai docstring *"Hilangkan karakter NUL & control"*. Kesalahan berasal dari membaca control char lewat tampilan lossy.
>
> **`safeFilename()` dan `classifyKind()` AMAN direuse apa adanya.**

---

## 6. Data Contracts

### 6.1 Migrasi

**Nomor: `0059`.** Satu file: `supabase/migrations/0059_chat_message_attachments.sql`.

### 6.2 Bucket

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
```

### 6.3 Kenapa bucket `evidence` ditolak secara teknis

Policy live `evidence_select_authorized` (`0046:2867-2868`):

```sql
USING ((bucket_id = 'evidence') AND (
  ((array_length(storage.foldername(name),1) >= 2) AND EXISTS (
     SELECT 1 FROM tasks ap
     WHERE ap.id = ((storage.foldername(objects.name))[2])::uuid
       AND can_access_task(ap.id)))
  OR ((array_length(storage.foldername(name),1) < 2) AND can_view_workspace())))
```

1. Path chat (depth ≥ 2) masuk cabang pertama, meng-cast `foldername[2]` (= `room_id`) ke uuid, join ke `tasks` → **tidak pernah match**.
2. Menekan path ke depth `< 2` jatuh ke fallback `can_view_workspace()` → **terbaca semua workspace-viewer tanpa gate room**.
3. `evidence_insert_pic_only` (`0019:290-301`) mensyaratkan `ap.pic_id = auth.uid()` → **anggota room non-PIC secara struktural tidak bisa upload**.

> [!note] Rasional yang DIPERBAIKI dari draft
> Draft mengargumenkan bucket terpisah lewat "kontrak mutabilitas saling eksklusif" (evidence no-UPDATE vs "chat butuh model retensi berbeda"). **Argumen itu gugur** karena NG-8 menetapkan chat juga no-delete di V1. Kesimpulan tetap benar, **rasionalnya diganti**: poin 3 di atas cukup dan tidak dapat dibantah.

### 6.4 Helper otorisasi

```sql
-- Pola 0051: SECURITY DEFINER + GRANT eksplisit ke authenticated.
-- Policy storage TIDAK memanggil is_chat_member langsung (0008:237 revoke dari
-- public/anon tanpa grant ke authenticated) — helper ini memanggilnya sebagai owner.

create or replace function public.can_write_chat_attachment(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_chat_member(p_room);
$$;

create or replace function public.can_read_chat_attachment(p_room uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.action_plans ap on ap.id = r.action_plan_id
    where r.id = p_room
      and r.organization_id = public.current_user_org()
      -- sumbu 1: paritas baca dengan chat_messages_select (0008:336-341)
      and (public.is_chat_member(p_room) or public.can_view_workspace())
      -- sumbu 2: confidential — SALINAN KLAUSA 2 can_access_action_plan (0051:35-46).
      -- JANGAN panggil can_access_action_plan(): klausa 1-nya tidak mengenal
      -- Reviewer Task / PIC Task → anggota room sah akan terkunci. Lihat §5.1.
      and (
        not exists (
          select 1 from public.confidential_access_rules cr
          where cr.entity_type = 'action_plan' and cr.entity_id = ap.id
        )
        or public.user_role_level() = 'ceo'
        or ap.pic_id = auth.uid()
        or exists (
          select 1 from public.confidential_access_rules cr
          where cr.entity_type = 'action_plan' and cr.entity_id = ap.id
            and cr.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.can_read_chat_attachment(uuid)  to authenticated;
grant execute on function public.can_write_chat_attachment(uuid) to authenticated;
revoke execute on function public.can_read_chat_attachment(uuid)  from public, anon;
revoke execute on function public.can_write_chat_attachment(uuid) from public, anon;
```

### 6.5 Policy Storage

| Op | Gate |
|---|---|
| INSERT | `bucket_id='chat-attachments' AND depth>=3 AND foldername[1]=current_user_org()::text AND can_write_chat_attachment(foldername[2]::uuid)` |
| SELECT | `bucket_id='chat-attachments' AND depth>=3 AND foldername[1]=current_user_org()::text AND can_read_chat_attachment(foldername[2]::uuid)` |
| UPDATE | **tidak ada policy** — objek immutable |
| DELETE | **tidak ada policy** — hapus hanya via RPC DEFINER (§6.6) |

### 6.6 Skema `chat_messages`

**Kolom `jsonb`, bukan tabel anak.** Alasan yang **kini dapat diklaim jujur** (`0052` terverifikasi: `alter publication supabase_realtime add table public.chat_messages` + `alter table public.chat_messages replica identity full`):

| | Kolom `attachments jsonb` (**dipilih**) | Tabel anak |
|---|---|---|
| Realtime | Payload INSERT **lengkap dalam satu event** | **Tidak** ikut publication → pesan tiba tanpa lampiran, klien re-fetch |
| Unread | Otomatis benar (satu baris `chat_messages`) | Risiko pecah |
| RLS | Mewarisi `chat_messages_select` — nol policy baru | Policy sendiri + risiko drift |

> **Catatan kejujuran:** memilih `jsonb` alih-alih tabel bernama `chat_message_attachments` **bukan** cara menghindari FR-IN4.5. Larangan itu menyasar **kapabilitas**, bukan identifier. Dipilih atas dasar atomisitas realtime; gate produk tetap harus dibuka owner.

```sql
alter table public.chat_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.chat_messages
  add constraint chat_messages_attachments_shape check (
    jsonb_typeof(attachments) = 'array'
    and jsonb_array_length(attachments) <= 3
    and not exists (
      select 1 from jsonb_array_elements(attachments) e
      where jsonb_typeof(e) <> 'object'
         or e->>'path' is null
         or jsonb_typeof(e->'path') <> 'string'
    )
  );
```

Bentuk elemen (semua **kecuali `path`** dihitung server):

```jsonc
{ "path": "org/room/group/uuid-nama.jpg",  // satu-satunya input klien
  "name": "nama.jpg",                       // server
  "mime": "image/jpeg",                     // storage.objects.metadata
  "size": 123456,                           // storage.objects.metadata
  "kind": "photo" }                         // classifyKind(mime), server
```

> `kind` di sini **BUKAN** `evidence_files.kind` (whitelist 9 nilai, CHECK dari `0015`, gagal `23514` di luar whitelist). Whitelist itu **tidak boleh ditambah** — ia penjaga alami batas §6.8.

**Constraint `0057` wajib DROP+CREATE** (bukan kondisional — kolom `kind` **ada** di `origin/staging`):

```sql
alter table public.chat_messages drop constraint chat_messages_kind_invariant;
alter table public.chat_messages add constraint chat_messages_kind_invariant check (
  (kind = 'system' and author_id is null
                   and system_event_type is not null
                   and actor_id is not null
                   and jsonb_array_length(attachments) = 0)   -- BARU
  or
  (kind = 'user'   and system_event_type is null
                   and actor_id is null)
);
```

### 6.7 RPC

#### `send_chat_message` v2

```sql
-- Target DROP = signature LIVE 5-param dari 0056. Lihat §5.4.
drop function if exists public.send_chat_message(uuid, text, uuid[], uuid, uuid);

create or replace function public.send_chat_message(
  p_room                uuid,
  p_body                text,
  p_mentions            uuid[] default '{}',
  p_context_action_plan uuid   default null,
  p_reply_to            uuid   default null,
  p_attachments         jsonb  default '[]'::jsonb   -- [{ "path": "..." }] — HANYA path
) returns uuid language plpgsql security definer set search_path = '' as $$
```

**Body wajib mempertahankan seluruh logika `0056`** (`v_context_type`/`v_context_id`/`v_context_label` server-derived, `p_reply_to`, mention loop, `emit_notification` mention-only). Menghilangkan parameter context/reply = **mematikan reply-quote & konteks Tugas yang sudah shipped**.

Urutan validasi (semua sebelum INSERT):

1. `pg_advisory_xact_lock(hashtext(path))` untuk setiap path (menutup TOCTOU vs cleanup — §6.6 RPC).
2. `is_chat_member(p_room)` → else `'Hanya anggota room yang dapat mengirim pesan.'`.
3. Guard `0008:410` **tidak berubah**: `coalesce(trim(p_body),'') = ''` → `'Pesan tidak boleh kosong.'`.
4. `jsonb_array_length(p_attachments) <= 3` → else pesan domain.
5. Per path: `exists` di `storage.objects` dengan `bucket_id='chat-attachments'` **AND** `owner = auth.uid()` **AND** `(storage.foldername(name))[2]::uuid = p_room` (mengunci ownership + room-binding).
6. `metadata->>'size' <= 5242880` **AND** `metadata->>'mimetype'` ∈ whitelist (**lapis kedua** — bucket config bisa berubah tanpa migrasi).
7. Derive `name`/`mime`/`size`/`kind` **dari `storage.objects`** — kunci dari klien **diabaikan** (anti-spoof, preseden `0056`: `context_label` *"dihitung SERVER, bukan input klien"*).

```sql
revoke execute on function public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb) from public, anon;
grant  execute on function public.send_chat_message(uuid, text, uuid[], uuid, uuid, jsonb) to authenticated;
```

#### `cleanup_orphan_chat_upload(p_path text)`

Pola `cleanup_orphan_upload` (`0019:265-282`) + **org guard wajib** (preseden `0039` cross-org + `0046:906-925`):

```
1. pg_advisory_xact_lock(hashtext(p_path))       -- TOCTOU
2. parts := storage.foldername(p_path)
   array_length(parts,1) >= 3 else raise         -- guard bentuk
3. parts[1]::uuid = current_user_org() else raise -- ORG GUARD, sebelum set_config
4. objek exists AND owner = auth.uid() else raise
5. path BELUM tereferensi chat_messages.attachments else raise
6. set_config('storage.allow_delete_query','true', true)   -- bypass protect_delete
7. delete from storage.objects where ...
```

> `p_path` adalah **string bebas yang dikontrol penuh oleh pemanggil** dan RPC ini **mem-bypass trigger `storage.protect_delete`**. Org guard bukan kehati-hatian berlebihan — ia preseden yang sudah mengikat (`0039`).

### 6.8 Empat penjaga struktural

1. Bucket berbeda (`chat-attachments` ≠ `evidence`) — anggota room non-PIC tidak akan pernah bisa menulis ke `evidence`.
2. **Tidak ada FK** dari `chat_messages.attachments` ke `task_submissions`/`evidence_files`.
3. **`evidence_files.kind` whitelist tidak ditambah** → kind chat ditolak `23514`.
4. `score-formula` tidak pernah membaca `chat_messages`.

Bila keempatnya terpenuhi, bukti tidak bisa bocor lewat chat **bahkan jika UI salah**.

### 6.9 Kontrak TS

```ts
export type ChatAttachment = {
  path: string; name: string; mime: string; size: number; kind: 'photo';
};
export type ChatMessage = {
  /* ...existing */ attachments: ChatAttachment[];  // default []
};
```

`listChatMessages` `.select(...)` menambah `attachments`. `sendChatMessage(...)` mengirim **hanya `[{path}]`**. Regen `database.types.ts` **wajib** setelah migrasi.

---

## 7. Edge Cases & Error States

Kelas error menentukan helper `errors.ts`:

| Kelas | Helper | Recovery |
|---|---|---|
| **A** Precheck client | pesan statis | ganti file |
| **B** Upload Storage | `reportError` inline | retry **per-file** |
| **C** Commit RPC | `surfaceServerError` | retry pesan |
| **D** Render/thumbnail | `reportError` non-blocking | muat ulang |
| **E** Permission-denied | `surfaceServerError` | **tidak ada retry** — terminal |

> Precheck client **wajib** tapi **tidak pernah** dianggap penegakan (`prd/01 §12`). Setiap aturan Kelas A punya kembaran server di §6.7.

| ID | Kondisi | Microcopy / perilaku |
|---|---|---|
| EE-1 | Ukuran > 5 MB | `File terlalu besar. Maksimal 5 MB per gambar.` |
| EE-2 | MIME di luar whitelist | `Jenis file ini tidak didukung. Kirim gambar (JPG, PNG, atau WebP).` — sebut yang **didukung** |
| EE-3 | Jumlah > 3 | `Maksimal 3 gambar per pesan.` |
| EE-4 | Caption kosong + ada lampiran | `Tambahkan keterangan singkat untuk gambar ini.` (konsekuensi NG-4) |
| EE-5 | File 0 byte | `File tidak bisa dibaca. Coba pilih ulang.` |
| EE-6 | Picker dibatalkan | **Bukan error.** Diam adalah perilaku yang benar |
| EE-7 | Izin OS galeri ditolak | `Izinkan akses galeri di Pengaturan untuk mengirim gambar.` + tombol Settings |
| EE-8 | Upload 1 file gagal | `ProgressPill` → `Gagal` + **Coba lagi** per-file |
| EE-9 | Commit gagal setelah upload | rollback optimistic + cleanup semua path batch; caption **tidak hilang** |
| EE-10 | App di-background saat upload | **V1: tidak ada resume.** Orphan tertinggal (OWNER-F). Jangan janjikan resume di UI |
| EE-11 | Double-tap Kirim | share promise `inFlight` → nol duplikat; tombol `disabled` + `accessibilityState` |
| EE-12 | Nama file duplikat dalam batch | Bukan error — path pakai `{uuid}-{name}` |
| EE-13 | Keanggotaan dicabut **saat** upload | Commit gagal; cleanup **ikut gagal** (caller bukan member) → orphan tertinggal. Diterima (OWNER-F) |
| EE-14 | Non-member menembus UI | Ditolak RPC. Composer + paperclip **tidak dirender** — jangan render lalu tolak |
| EE-15 | Signed URL kedaluwarsa saat bubble di layar | Placeholder + **Muat ulang**. Kelas **D** (transien), **bukan** permission-denied |
| EE-16 | Thumbnail memuat | Skeleton berukuran tetap — **jangan reflow** |

**Empty state** (`[roomId].tsx:193` `"Belum ada pesan"`) **tidak berubah** — jangan tambah CTA "kirim gambar"; chat adalah diskusi, bukan galeri.

**A11y:** touch target ≥44px **inline style**; state gagal wajib ikon **dan** teks; error inline `accessibilityLiveRegion="polite"`.

---

## 8. Risiko

| Risiko | Mitigasi | Deteksi |
|---|---|---|
| **Bukti nyata mendarat di chat dan tidak pernah diformalkan** — risiko utama, dan lawan langsung dari klaim "evidence trail lebih bersih" yang dicabut (§1.7) | Banner governance existing; caption wajib memaksa artikulasi; NG-1/NG-2 menutup jalur promosi | **Belum ada.** Batas ditegakkan di lapis data, bukan lapis perilaku. Diangkat sebagai isu terbuka |
| Reviewer menilai dari foto di chat, bukan dari Bukti | Struktural: lampiran tidak pernah muncul di layar Review | Belum ada |
| Orphan menumpuk | Cleanup pra-commit | OWNER-F |

---

## 9. Keputusan Owner

> Satu tabel. Satu rekomendasi per isu. Menggantikan ~50 open question tersebar dengan ID tak saling merujuk.

| # | Isu | Opsi | Rekomendasi | Status |
|---|---|---|---|---|
| **A** ✅ | Amandemen sempit (K-1/K-2/K-3) | (a) pengecualian sempit + Rule 4 dipersempit + komponen 11, larangan build L192 tetap; (b) cabut FR-IN4.5 total; (c) tolak | **(a)** — jalur preseden reactions, paling murah | **LOCKED (a) 2026-07-15** |
| **B** ✅ | V1 slice | (a) gambar saja + caption wajib + 3 file/5 MB + thumbnail inline; (b) tambah dokumen/attachment-only/viewer | **(a)** — menghapus 3 blocker; biaya UX "caption wajib" nyata & disengaja | **LOCKED (a) 2026-07-15** |
| **C** ✅ | Visibilitas | (a) `(is_chat_member OR can_view_workspace) AND <confidential>`; (b) paritas penuh (warisi gap); (c) member-only | **(a)** — sengaja menyimpang dari preseden reactions O4; gambar ≠ teks | **LOCKED (a) 2026-07-15** |
| **D** ✅ | Gap confidential pesan **teks** | (a) isu terpisah P1; (b) gabung V2 | **(a)** — di luar scope, jangan perbaiki diam-diam | **LOCKED (a) 2026-07-15** — follow-up dispawn ke task chip terpisah |
| **E** ✅ | Milestone | (a) V2; (b) V1.8.3 | **(a)** — preseden reactions; biaya §1.7 jujur di depan | **LOCKED (a) 2026-07-15** — TDD menunggu V2 dijadwalkan; amandemen tertulis boleh mendarat sekarang |
| **F** ✅ | Retensi orphan | (a) terima + isu terpisah; (b) pg_cron sweeper | **(a)** — (b) memperkenalkan auto-delete pada bucket yang immutability-nya sedang dibangun | **LOCKED (a) 2026-07-15** — V1 andalkan FR-ATT-1.5 pra-commit; sweeper dispawn ke task chip terpisah |

### Verifikasi pra-TDD (teknis, **bukan** keputusan owner)

| # | Item | Kenapa bloking |
|---|---|---|
| **V-1** 🔴 | `storage.objects` mengekspos `owner` (uuid vs `owner_id` text?) dan `metadata` berisi `size`/`mimetype`, terbaca dari RPC DEFINER | **Seluruh** validasi server-side (G-4, AC-RPC-5/6/7, AC-SEC-1) berdiri di atasnya. Repo belum pernah menyentuh `storage.objects` di luar policy. Jika gagal → penegakan tersisa hanya bucket config = **penurunan postur keamanan yang harus dinyatakan**, bukan didiamkan. Verifikasi: `docker exec supabase_db_supabase psql` |
| **V-2** ✅ | Helper `can_*_chat_attachment` dapat dievaluasi role `authenticated` di policy `storage.objects` | `0008:237` revoke `is_chat_member` dari public/anon **tanpa** grant ke authenticated. Mitigasi sudah dipilih (§6.4: helper DEFINER ber-grant eksplisit). `0051` membuktikan kelas bug "42883 silently at runtime" nyata. **LULUS 2026-07-15** — policy chain works end-to-end. **Koreksi baseline:** klaim "tanpa grant ke authenticated" faktual salah — `proacl` live = `{postgres,authenticated,service_role}` (grant datang dari Supabase default privileges saat `CREATE FUNCTION`; revoke `0008:237` hanya menyentuh `public, anon`). Helper DEFINER tetap benar sebagai defense-in-depth. |

---

## 10. Handoff ke TDD

**Prasyarat:** OWNER-A/B/C terkunci + V-1/V-2 selesai + V2 dijadwalkan (larangan `specs/inbox-chat-ui.md` L192 dicabut).

**Basis:** `origin/staging` @ `aaaebf3` setelah `git fetch`. Migrasi = **`0059`**.

**Urutan Fase-0 (prasyarat non-kode):**
1. Amandemen mendarat: PRD §30 (Rule 4 + komponen 11), `prd/03 §B.7`, `scope-guardrails.md`, `prd/01 §12`, `specs/inbox-chat-ui.md` FR-IN4.5.
2. Token `ChatAttachmentBubble` + `ChatAttachmentThumbnail` di `DESIGN.md §7` + `global.css`.
3. V-1 diverifikasi via `docker exec supabase_db_supabase psql`.
4. Keputusan dependency `expo-image-picker` (+ prebuild).

**Urutan red-green:**
1. DB contract: bucket + policy (RLS-1..7, SEC-1..3) — **termasuk US-9 Reviewer-grantee** sebagai guard §5.1.
2. DB contract: skema + constraint (DATA-1, SEC-2/3, GOV-1..4).
3. DB contract: RPC (RPC-1..12) — **termasuk regresi reply/context AC-RPC-4**.
4. Unit: lib/hook (UI-4..7, DATA-2/3, LOG-1/2).
5. RNTL: layar (UI-1..3, UI-8/9).
6. Regresi: chat suite + `0019_ap5_ap6_contract.sql` + jest penuh.

**Jebakan yang WAJIB dibawa ke TDD:**
- §5.1 — **jangan** panggil `can_access_action_plan()`; salin klausa 2 saja.
- §5.2 — **jangan** tulis test "ditolak DAN tercatat"; reject path ter-rollback.
- §5.3 — severity **lowercase**.
- §5.4 — DROP target = signature **5-param** `0056`.
- §5.5 — setiap DROP+CREATE wajib re-grant + test `has_function_privilege`.
- §5.6 — `safeFilename()` **tidak punya bug**; reuse apa adanya; jangan buka isu.
- Gotcha RNTL: `await render(...)`, probe untuk effect hook.
- Gotcha DB: MCP Supabase ≠ DB lokal app; apply DDL via `docker exec supabase_db_supabase psql`.
- Gotcha baseline: verifikasi migrasi via `git ls-tree origin/staging`, **bukan** `ls`.
