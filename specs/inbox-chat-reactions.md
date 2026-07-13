---
type: source
tags: [spec, inbox, chat, reaction, prd-30, governance, deferred-v2]
updated: 2026-07-13
sources: 4
status: ready-for-v2-build
milestone: V2
---

> **Ringkasan eksekutif.** Spec final untuk "Reaksi (emoji reaction) pada pesan Initiative Chat" (PRD §30 komponen 6 "Reaction pill"). Fitur menambah acknowledgment ringan tingkat-pesan (toggle emoji dari whitelist tertutup) di Inbox Initiative Chat, netral-governance total (tidak menyentuh score-formula/Review/Bukti/Nilai Hasil, tidak dicatat sebagai governance_violation). Semua tulisan lewat RPC SECURITY DEFINER `toggle_chat_reaction` ber-gate `is_chat_member`; klien tak menulis langsung (revoke I/U/D). Baca via embed PostgREST yang di-gate oleh policy SELECT tabel reaksi sendiri (bukan "inheritance"). Spec ini merampatkan keputusan teknis yang tadinya bercabang menjadi satu kontrak yang dapat diuji, dan memperbaiki 5 kontradiksi internal dari grill (concurrency toggle, FK cascade vs reactor-null, whitelist single-source, indeks, reactor-names). **OWNER-2 sudah diadjudikasi (2026-07-13): DIIZINKAN** dengan pengecualian sempit tertulis di `wiki/concepts/scope-guardrails.md` dan `prd/01-konsep-dan-fondasi.md` §12. Milestone build tetap **V2**; larangan menulis kode/test di `specs/inbox-chat-ui.md` L190 tetap berlaku sampai V2 dijadwalkan.

---

# Spec — Reaksi (Emoji Reaction / "Reaction pill") pada Pesan Initiative Chat

> Status: **SIAP-EKSEKUSI, dijadwalkan V2.** Gate scope OWNER-2 sudah dicabut (adjudikasi owner 2026-07-13). Menulis kode/test menunggu V2 dijadwalkan — bukan lagi karena gate owner, tapi karena prioritas rilis. Prasyarat lain yang harus turun sebelum build: token "Reaction pill" didaftarkan di `DESIGN.md §7` + `mobile/src/global.css` (lihat §11).

## Keputusan owner terkunci (2026-07-13)

| # | Isu | Keputusan | Diimplementasi di |
|---|-----|-----------|-------------------|
| O1 | Scope (OWNER-2) | **Izinkan** dengan pengecualian sempit | `scope-guardrails.md` §"Pengecualian sempit — Reaction pill Initiative Chat"; `prd/01 §12` |
| O2 | Multiplicity per user per pesan | **Multi-emoji** (PK komposit) | §7.2 PK `(chat_message_id, reactor_id, emoji)` |
| O3 | Set emoji seed | **4 ack: `👍 ✅ 👀 🙏`** (drop `❤️🎉`) | §7.1 seed reaction_emojis |
| O4 | Eksposur `reactor_id` ke workspace-viewer | **Terima** (paritas dengan visibilitas author pesan) | §7.4 embed PostgREST |
| O5 | Notifikasi ke penulis pesan V1 | **Tidak ada** | §6 FR-RX-6.1 |
| O6 | Milestone | **V2** (build dijadwalkan terpisah) | frontmatter |

---

## 1. Problem & Konteks

Surface **Initiative Chat** (PRD.md §30) mendaftarkan **"Reaction pill"** sebagai komponen ke-6 dari 10 komponen chat kanonik (PRD.md L1194). Komponen ini **belum ada** di mana pun: tidak di UI (`MessageBubble` inline pada `mobile/src/app/(app)/inbox/[roomId].tsx`), tidak di data layer (`mobile/src/lib/inbox.ts`), tidak di skema (`supabase/migrations/0008_fase3_collab.sql` mendefinisikan `chat_rooms`/`chat_room_members`/`chat_messages`/`chat_message_reads`/`mentions` — **tanpa** `chat_message_reactions`). Bentuk teknis pernah dinaskahkan di `specs/inbox-chat-ui.md` L138 namun **di-DEFER ke V2** dengan larangan keras menulis kode (L190).

Akibat: implementasi menyimpang dari surface-spec §30, dan pengguna tak punya cara ringan memberi acknowledgment ("dilihat/oke/apresiasi") tanpa menambah pesan-balasan yang membebani thread.

## 2. Tujuan (Goals)

1. **G1** — Tutup gap komponen PRD §30.6 dengan reaksi emoji tingkat-pesan.
2. **G2** *(asumsi, bukan kebutuhan tervalidasi — lihat Open Questions)* — Kurangi pesan-balasan sepele ("oke/siap/noted") lewat acknowledgment non-verbal.
3. **G3** — Toggle idempoten & concurrency-safe per (pesan, pengguna, emoji).
4. **G4** — Agregasi ringkas per pesan: jumlah per emoji + status "saya sudah bereaksi".
5. **G5** — Patuh invarian governance tanpa pengecualian: tulis hanya via RPC `SECURITY DEFINER` ber-gate `is_chat_member`; klien tak menulis langsung; `chat_messages` tetap immutable; RLS multi-tenant satu-satunya penegak.

## 3. Non-Goals

- BUKAN mekanisme persetujuan/governance: reaksi tidak menjadi approval Review, tidak menyentuh submission/Bukti/Nilai Hasil (evidence-locking), tidak dicatat sebagai governance_violation, tidak memicu activity_log.
- ZERO bobot skor: reaksi tidak masuk score-formula, ranking People, atau Governance Discipline.
- BUKAN fitur social-media: tidak ada reaction feed, Story, Reels, leaderboard reaksi, notif 'trending', atau agregasi lintas-room. Konsisten dengan `scope-guardrails.md` §"Pengecualian sempit — Reaction pill Initiative Chat" yang tetap menolak *social reaction feed/Story/Reels* dan hanya mengizinkan reaction pill tingkat-pesan.
- TIDAK melonggarkan akses: non-anggota room (termasuk pemegang view_all_workspace read-only) tidak boleh menulis reaksi; baca reaksi tidak lebih longgar dari chat_messages_select.
- TIDAK mengubah immutability pesan: tidak menambah kolom mutable ke chat_messages; tidak ada edit/hapus pesan.
- BUKAN read-receipt/'Seen by' (§30.7) — di luar cakupan; privasi chat_message_reads_select (reader_id=auth.uid()) tidak disentuh.
- BUKAN reply-quote/system-events (anggota UI-S-IN3 lain tetap backlog V2).
- V1 TIDAK menampilkan daftar/nama reaktor per emoji (hanya count agregat + 'saya sudah bereaksi'); daftar nama reaktor ditunda V2.
- V1 TIDAK memicu notifikasi ke penulis pesan (anti-noise).
- Realtime bukan syarat: mengikuti pola invalidation-based ['chat-messages', roomId]; optimistic UI ditunda V2.
- Pengguna TIDAK menambah/mengunggah emoji kustom; whitelist tertutup server-side.


## 4. Keputusan Desain yang Sudah Dirampatkan (menutup percabangan grill)

| # | Isu | Keputusan V1 |
|---|-----|--------------|
| D1 | Jalur baca (embed vs RPC) | **Embed PostgREST** `reactions:chat_message_reactions(emoji, reactor_id)` pada `listChatMessages`. Keamanan bertumpu pada **policy SELECT tabel reaksi sendiri** (PostgREST menerapkan RLS tiap resource ter-embed secara independen — BUKAN "inheritance" dari `chat_messages_select`). |
| D2 | Concurrency toggle | RPC pola **DELETE-then-(INSERT ON CONFLICT DO NOTHING)** + `get diagnostics row_count`. Tidak ada 23505 bocor. |
| D3 | FK `reactor_id` | **ON DELETE CASCADE**. Reaktor dihapus → barisnya hilang → count berkurang. `reactor_id` **tak pernah null** (bagian PK). Edge-case lama yang mengasumsikan reactor null dikoreksi. |
| D4 | Whitelist emoji | **Tabel referensi `reaction_emojis`** = satu sumber kebenaran (FK dari `chat_message_reactions.emoji`). **Tidak** diduplikasi sebagai CHECK literal + daftar di body RPC. |
| D5 | Emoji delisted | Validasi `active` **hanya di jalur INSERT**; DELETE (toggle-off) tak memvalidasi → tak ada baris nyangkut permanen. |
| D6 | Indeks | PK btree leading `chat_message_id` sudah melayani agregasi per-pesan & lookup `in.(...)` satu halaman. **Tidak** ada indeks tambahan V1 (mengoreksi FR-RX-1.5 vs data-contract). |
| D7 | Nama reaktor | V1 UI = **count + reactedByMe saja**, tanpa daftar nama. Nama reaktor ditunda V2. `ChatReaction = {emoji, reactor_id}` cukup untuk hitung count & reactedByMe. |
| D8 | Optimistic UI | V1 = **invalidation-only** (`invalidate ['chat-messages', roomId]`). Optimistic ditunda V2 → AC dapat diuji deterministik. |
| D9 | Notifikasi | V1 = **tidak ada**. |
| D10 | Self-react | **Diizinkan**. |
| D11 | Multiplisitas | **Multi-emoji per user per pesan** (PK komposit). Owner boleh menegakkan eksklusif. |
| D12 | Normalisasi Unicode | `reaction_emojis` menyimpan codepoint kanonik (NFC); klien hanya mengirim dari set tetap → pencocokan string eksak deterministik, tak ada dua baris untuk "emoji sama". |

## 5. User Stories

Otorisasi reaksi **diturunkan dari keanggotaan room** (`public.is_chat_member`, `0008` L229-237), bukan peran governance. Peran hanya menjelaskan *mengapa* seseorang di room.

- **US-R1** — PIC (anggota room) menekan emoji pada sebuah pesan untuk acknowledgment cepat; tulis lewat RPC; pill muncul dengan count bertambah.
- **US-R2** — Anggota menekan lagi emoji yang sudah ia beri → toggle-off (DELETE via RPC); pill berkurang/hilang.
- **US-R3** — Reviewer bereaksi **informal**; reaksi TIDAK menjadi keputusan Review; tak ada emoji bermakna "approve".
- **US-R4** — Manager bereaksi di Initiative yang dikelolanya; **tanpa** hak istimewa peran — tetap tunduk gate keanggotaan.
- **US-R5** — CEO / `view_all_workspace` **non-anggota** hanya **membaca** agregat (gate baca ≤ `chat_messages_select`); aksi tambah/tarik reaksi tidak tersedia dan ditolak server.
- **US-R6** *(ditunda V2)* — Melihat daftar nama reaktor per emoji. V1 hanya count + reactedByMe.

## 6. Functional Requirements

Penomoran `FR-RX-*`; `[GOV]` = invarian governance mengikat; `[BLOCKER]` = precondition owner.

### A. Precondition
- **FR-RX-0.1 [GOV] — RESOLVED (owner 2026-07-13).** Amandemen guardrail sudah turun di `wiki/concepts/scope-guardrails.md` §"Pengecualian sempit — Reaction pill Initiative Chat" + `prd/01-konsep-dan-fondasi.md` §12: memisahkan "Social reaction feed / Story / Reels" (tetap ditolak) dari "Reaction pill tingkat-pesan Initiative Chat" (diizinkan). Gate scope tidak lagi blocker; build dijadwalkan V2.
- **FR-RX-0.2 [GOV]** Reaksi = micro-acknowledgment antar-anggota room; tanpa leaderboard/feed/agregasi lintas-room.
- **FR-RX-0.3 [BLOCKER][DESIGN]** Token "Reaction pill" **wajib didaftarkan** di `DESIGN.md §7` + `mobile/src/global.css` (pill terpilih vs tidak, pembeda non-warna, ukuran ≥44px) **sebelum** implementasi UI dimulai.

### B. Data model
- **FR-RX-1.1 [GOV]** Tabel samping `public.chat_message_reactions` (bukan kolom pada `chat_messages` yang immutable). Pola `chat_message_reads`.
- **FR-RX-1.2** Kolom: `chat_message_id` (FK CASCADE), `reactor_id` (FK CASCADE), `emoji` (FK → `reaction_emojis`), `organization_id` (FK CASCADE, di-derive server dari room pesan), `created_at`.
- **FR-RX-1.3** PK komposit `(chat_message_id, reactor_id, emoji)` (idempotensi; multi-emoji per D11).
- **FR-RX-1.4 [GOV]** Whitelist tunggal via tabel referensi `public.reaction_emojis(emoji pk, sort_order, active)`; FK menegakkannya (D4/D5).
- **FR-RX-1.5** Enable RLS; **tanpa indeks tambahan** (D6).
- **FR-RX-1.6 [GOV]** Cross-org: `organization_id = current_user_org()` di RLS (invarian `0039`).

### C. Write path
- **FR-RX-2.1 [GOV]** Revoke `insert/update/delete` dari `authenticated, anon`. Satu-satunya jalur tulis = RPC.
- **FR-RX-2.2** RPC `toggle_chat_reaction(p_message uuid, p_emoji text) → boolean`, `security definer set search_path=''`; toggle via DELETE-then-INSERT ON CONFLICT (D2). Return `true`=reacted, `false`=un-reacted.
- **FR-RX-2.3 [GOV]** Gate `is_chat_member(room)` sebelum menulis; `organization_id` dari room, bukan input klien; `reactor_id = auth.uid()` (anti-tamper).
- **FR-RX-2.4 [GOV]** Validasi emoji-aktif **hanya pada INSERT** (D5).
- **FR-RX-2.5** `revoke execute from public, anon; grant execute to authenticated`.

### D. Read path
- **FR-RX-3.1 [GOV]** Policy SELECT `chat_message_reactions_select` = `organization_id=current_user_org() AND EXISTS(chat_messages cm WHERE cm.id=chat_message_id AND (is_chat_member(cm.chat_room_id) OR can_view_workspace()))` — **satu-satunya gate baca** (D1).
- **FR-RX-3.2** Baca via embed pada `listChatMessages`; agregasi (count, reactedByMe) dihitung client.
- **FR-RX-3.3 [GOV]** Embed tidak mengubah kontrak keyset: `.eq('chat_room_id', roomId)` tetap top-level AND; embed tak dilipat ke `.or()`.
- **FR-RX-3.4** Bentuk per pesan: `{ emoji, count, reactedByMe }` (tanpa `reactorNames` di V1, D7).

### E. UI
- **FR-RX-4.1** Pill `{emoji} {count}` per emoji di bawah `MessageBubble` hanya bila count>0.
- **FR-RX-4.2** Tap pill existing = toggle. Gestur picker tambah-reaksi = keputusan DESIGN (Open Questions).
- **FR-RX-4.3 [GOV a11y]** DESIGN §4: ≥44px; "saya bereaksi" pakai pembeda **non-warna** + `accessibilityState.selected`; solid+putih pakai `brand-dark #1564b3`; `accessibilityLabel` menyebut emoji+jumlah+status.
- **FR-RX-4.4 [GOV]** Token "Reaction pill" **didaftarkan dulu** di `DESIGN.md §7` + `mobile/src/global.css`.
- **FR-RX-4.5** Copy Bahasa Indonesia; hindari istilah medsos.

### F. Data layer & hooks
- **FR-RX-5.1** `inbox.ts`: `toggleChatReaction(messageId, emoji)` + perluas `ChatMessage.reactions`.
- **FR-RX-5.2** `use-inbox.ts`: `useMutation` → `onSuccess` invalidate `['chat-messages', roomId]` (D8).
- **FR-RX-5.3** `database.types.ts`: tambah tipe tabel + RPC (manual/regen).

### G. Notifikasi
- **FR-RX-6.1 [GOV]** V1 tanpa notifikasi. Jika diaktifkan kelak, WAJIB via `emit_notification` (skip-self, dedupe) — tanpa jalur ad-hoc.

### H. Governance invariants
- **FR-RX-7.1 [GOV]** Zero governance weight; bukan approval; tak menyentuh Bukti/Nilai Hasil/Review; tak dicatat `governance_violation`/`activity_log`.
- **FR-RX-7.2 [GOV]** Tidak melonggarkan policy/trigger/grant existing; `chat_message_reads_select` (`reader_id=auth.uid()`) tak disentuh.
- **FR-RX-7.3 [GOV]** RLS satu-satunya penegak otorisasi.
- **FR-RX-7.4** Migrasi `0045` (branch ini; reconcile HEAD), idempoten, + contract test SQL pola PASS/FAIL.

## 7. Data Contracts

### 7.1 Tabel referensi whitelist (sumber kebenaran tunggal)
```sql
create table if not exists public.reaction_emojis (
  emoji      text primary key,
  sort_order int not null default 0,
  active     boolean not null default true
);
-- Seed V1 = 4 acknowledgment kerja saja (owner 2026-07-13 O3).
-- Sengaja TIDAK menyeed ❤️/🎉 (ekspresi sosial) — konsisten dengan invarian
-- "ack-only" di pengecualian scope-guardrails. Tambah belakangan cukup insert row.
insert into public.reaction_emojis (emoji, sort_order) values
  ('👍',1),('✅',2),('👀',3),('🙏',4)
on conflict (emoji) do nothing;
alter table public.reaction_emojis enable row level security;
drop policy if exists reaction_emojis_select on public.reaction_emojis;
create policy reaction_emojis_select on public.reaction_emojis
  for select to authenticated using (true);
revoke insert, update, delete on public.reaction_emojis from authenticated, anon;
```

### 7.2 Tabel reaksi
```sql
create table if not exists public.chat_message_reactions (
  chat_message_id uuid not null references public.chat_messages (id)   on delete cascade,
  reactor_id      uuid not null references public.profiles (id)        on delete cascade,
  emoji           text not null references public.reaction_emojis (emoji),
  organization_id uuid not null references public.organizations (id)   on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (chat_message_id, reactor_id, emoji)
);
alter table public.chat_message_reactions enable row level security;

drop policy if exists chat_message_reactions_select on public.chat_message_reactions;
create policy chat_message_reactions_select on public.chat_message_reactions
  for select to authenticated
  using (
    organization_id = public.current_user_org()
    and exists (
      select 1 from public.chat_messages cm
      where cm.id = chat_message_id
        and (public.is_chat_member(cm.chat_room_id) or public.can_view_workspace())
    )
  );
revoke insert, update, delete on public.chat_message_reactions from authenticated, anon;
```

### 7.3 RPC toggle (concurrency-safe)
```sql
create or replace function public.toggle_chat_reaction(p_message uuid, p_emoji text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_room uuid;
  v_org  uuid;
  v_uid  uuid := auth.uid();
  v_del  int;
begin
  select chat_room_id, organization_id into v_room, v_org
    from public.chat_messages where id = p_message;
  if not found then raise exception 'Pesan tidak ditemukan.'; end if;
  if not public.is_chat_member(v_room) then
    raise exception 'Hanya anggota room yang dapat memberi reaksi.';
  end if;

  delete from public.chat_message_reactions
   where chat_message_id = p_message and reactor_id = v_uid and emoji = p_emoji;
  get diagnostics v_del = row_count;
  if v_del > 0 then
    return false;                                   -- toggle OFF (delisted tetap removable)
  end if;

  if not exists (select 1 from public.reaction_emojis where emoji = p_emoji and active) then
    raise exception 'Emoji tidak didukung.';        -- validasi hanya pada INSERT
  end if;
  insert into public.chat_message_reactions (chat_message_id, reactor_id, emoji, organization_id)
  values (p_message, v_uid, p_emoji, v_org)
  on conflict (chat_message_id, reactor_id, emoji) do nothing;
  return true;                                       -- toggle ON
end;
$$;
revoke execute on function public.toggle_chat_reaction(uuid, text) from public, anon;
grant   execute on function public.toggle_chat_reaction(uuid, text) to authenticated;
```

### 7.4 Baca (embed) & delta TypeScript
```ts
// listChatMessages(): select existing + embed reaksi (gate = RLS chat_message_reactions_select)
.select('id, chat_room_id, author_id, body, created_at,' +
        ' author:author_id(id, full_name, email),' +
        ' reactions:chat_message_reactions(emoji, reactor_id)')

export type ChatReaction = { emoji: string; reactor_id: string };
export type ChatMessage = { /* ...existing... */ reactions?: ChatReaction[] };

export async function toggleChatReaction(messageId: string, emoji: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_chat_reaction',
    { p_message: messageId, p_emoji: emoji });
  if (error) throw error;
  return data as boolean;
}
```
`database.types.ts`: tambah `Row/Insert/Update/Relationships` untuk `chat_message_reactions` + `reaction_emojis`, dan RPC `toggle_chat_reaction: { Args: { p_message: string; p_emoji: string }; Returns: boolean }`.

## 8. Kontradiksi & Adjudikasi Scope (OWNER-2 — RESOLVED 2026-07-13)

> [!note] Adjudikasi owner 2026-07-13 — kontradiksi ditutup
> **Fakta pemicu (arsip):** `PRD.md §30` L1194 mendaftarkan "Reaction pill" sebagai komponen chat, sementara `wiki/concepts/scope-guardrails.md` (baris "Ditolak") dan `prd/01-konsep-dan-fondasi.md` §12 secara historis melarang "Social reaction/Story/Reels".
>
> **Keputusan owner:** amandemen sempit — larangan tetap berlaku untuk **social reaction feed / Story / Reels** (pola broadcast+popularitas), sementara **reaction pill tingkat-pesan Initiative Chat** dikecualikan sepanjang invarian dipenuhi (zero bobot skor, tanpa feed/leaderboard, bukan approval, whitelist emoji ack tertutup, otorisasi = keanggotaan room). Teks amandemen ada di `wiki/concepts/scope-guardrails.md` §"Pengecualian sempit — Reaction pill Initiative Chat" + `prd/01 §12` (owner 2026-07-13).
>
> **Housekeeping selesai:** rujukan lama "scope-guardrails §88" di `specs/inbox-chat-ui.md` sudah dinormalisasi ke "bagian 'Ditolak (jangan bangun)' + PRD V1.8.2 §6".
>
> **§30 tetap katalog komponen** — bukan komitmen milestone. Build reaction pill dijadwalkan **V2**; larangan menulis kode/test di `specs/inbox-chat-ui.md` L190 tetap berlaku sampai V2 dijadwalkan (pembatasnya prioritas rilis, bukan lagi gate owner).

## 9. Acceptance Criteria

Given / When / Then (semua harus lulus untuk DoD):

1. GATE/proses (V2 build-plan) — Given amandemen scope sudah turun (`scope-guardrails.md` §"Pengecualian sempit — Reaction pill Initiative Chat" + `prd/01 §12` — SUDAH per 2026-07-13), When implementasi hendak dimulai, Then dua prasyarat sisa WAJIB terpenuhi: (a) token "Reaction pill" terdaftar di `DESIGN.md §7` + `mobile/src/global.css` (FR-RX-0.3), DAN (b) V2 sudah dijadwalkan sebagai rilis (mencabut larangan L190 `specs/inbox-chat-ui.md`). Contract test SQL + data layer boleh berjalan lebih dulu tanpa (a); UI menunggu.
2. Toggle-on — Given saya anggota room dan pesan P belum saya reaksi dengan emoji whitelisted E, When saya memilih E pada P, Then klien memanggil rpc('toggle_chat_reaction',{p_message,p_emoji}) (bukan .from().insert), satu baris (P, reactor_id=saya, E, organization_id=org room) tercipta, RPC me-return true.
3. Toggle-off — Given saya anggota room dan SUDAH bereaksi E pada P, When saya memilih E yang sama, Then baris reaksi milik saya untuk (P,E) dihapus via RPC, RPC me-return false, count E berkurang; jika count=0 pill E tidak dirender.
4. Idempoten & concurrency-safe — Given saya sudah punya baris (P,saya,E), When dua 'add' bersamaan (mis. dua perangkat) tiba, Then tidak ada baris kedua (PK (chat_message_id,reactor_id,emoji)) dan tidak ada error unique_violation (23505) bocor ke UI (INSERT ... ON CONFLICT DO NOTHING).
5. Whitelist single-source — Given klien mengirim p_emoji yang bukan anggota reaction_emojis aktif, When toggle_chat_reaction (jalur INSERT) dieksekusi, Then RPC raise 'Emoji tidak didukung.' dan FK emoji->reaction_emojis menolak; tidak ada teks bebas tersimpan sebagai emoji; whitelist hanya didefinisikan di tabel reaction_emojis (tidak diduplikasi di CHECK literal atau body RPC).
6. Delisted-emoji removable — Given sebuah emoji dinonaktifkan (active=false) di reaction_emojis setelah user pernah bereaksi dengannya, When user men-toggle-off reaksi itu, Then DELETE berhasil (validasi active hanya di jalur INSERT), sehingga tidak ada baris nyangkut permanen.
7. Agregasi lintas-user — Given pesan P direaksi E oleh N anggota berbeda, When P dirender, Then satu pill E menampilkan count=N (bukan N pill).
8. Reaksi milik sendiri (sinyal non-warna) — Given saya termasuk yang bereaksi E pada P, When P dirender, Then pill E menandai 'saya bereaksi' dengan pembeda BUKAN-warna-saja (mis. border/checkmark) + accessibilityState.selected=true, dan accessibilityLabel menyebut emoji+jumlah+status; touch target kontrol ≥44px (DESIGN.md §4).
9. Pesan tanpa reaksi — Given P tanpa reaksi, When P dirender, Then tidak ada pill/baris reaksi (tanpa placeholder count 0).
10. Sumber baca tunggal — Given daftar pesan dimuat via listChatMessages (.from('chat_messages') keyset di bawah RLS), When reaksi ditampilkan, Then agregat diambil via SATU jalur: embed relasi reactions:chat_message_reactions(emoji,reactor_id) pada select existing, count & reactedByMe dihitung client-side; tidak ada query klien yang mem-bypass RLS.
11. Gate baca adalah policy tabel reaksi sendiri — Given embed reaksi dimuat, When RLS dievaluasi, Then keterlihatan ditegakkan oleh chat_message_reactions_select (organization_id=current_user_org() AND (is_chat_member OR can_view_workspace)) sebagai satu-satunya gate baca, BUKAN diwarisi dari chat_messages_select.
12. Embed tidak merusak keyset — Given pagination keyset aktif, When embed reactions ditambahkan ke select, Then .eq('chat_room_id',roomId) tetap top-level AND dan embed tidak dilipat ke ekspresi .or() keyset (tak membocorkan pesan/reaksi room lain).
13. Hanya anggota boleh menulis — Given saya BUKAN anggota room (mis. can_view_workspace read-only), When saya mencoba toggle di room itu, Then RPC menolak via is_chat_member sebelum menulis (raise), tidak ada baris tercipta; viewer read-only boleh MEMBACA agregat tapi tidak MENULIS.
14. Non-akses tidak melihat — Given saya bukan member dan bukan workspace-viewer, When pesan/reaksi di-query, Then RLS mengembalikan 0 baris diam-diam (pesan maupun reaksi).
15. Isolasi cross-org — Given p_message milik organization lain, When toggle atau baca dieksekusi user org berbeda, Then hasil = 0 baris/penolakan (organization_id=current_user_org()), mengikuti invarian 0039.
16. Cascade — Given ada reaksi pada pesan P, When P/room/org/profil reaktor dihapus, Then baris reaksi ikut terhapus (FK ON DELETE CASCADE); chat_messages tetap immutable; count berkurang sesuai reaktor yang hilang (reactor_id tidak pernah null karena bagian PK).
17. Immutability — Given fitur reaksi aktif, When reaksi ditambah/dihapus, Then tidak ada kolom mutable ditambahkan ke chat_messages dan tidak ada baris chat_messages di-UPDATE; seluruh state reaksi di chat_message_reactions.
18. Netralitas skor (uji operasional) — Given skor/ranking suatu periode dihitung ulang, When reaksi ditambahkan lalu recompute dijalankan, Then hasil score-formula & ranking byte-identik sebelum vs sesudah; DAN query kalkulasi skor tidak mereferensi tabel chat_message_reactions (guard statik).
19. Bukan jalur formal — Given banner governance kanonik tampil ('Keputusan formal (Review, Bukti, Nilai Hasil) lewat Action Plan — chat untuk diskusi cepat.'), When reaksi ditambahkan, Then microcopy banner tidak berubah dan tidak ada emoji yang diberi makna 'approve' oleh sistem.
20. Tulis-langsung klien ditolak (uji runtime) — Given klien authenticated, When memanggil .from('chat_message_reactions').insert()/.update()/.delete() langsung, Then GAGAL (grant I/U/D dicabut dari authenticated & anon), membuktikan RPC satu-satunya jalur tulis dan mencegah impersonasi reactor_id.
21. Anti-tamper — Given member X telah bereaksi E pada P, When member Y memanggil toggle_chat_reaction untuk (P,E), Then reaksi X TIDAK terhapus (DELETE menghardcode reactor_id=auth.uid()); Y hanya menambah/mencabut reaksinya sendiri.
22. Invalidasi setelah toggle — Given saya menekan emoji, When RPC toggle sukses, Then cache di-invalidate untuk ['chat-messages', roomId] (pola useChatActions) dan UI mencerminkan state server final (V1 invalidation-only, tanpa optimistic).
23. Gagal toggle tidak merusak state — Given RPC toggle gagal (membership dicabut mid-sesi / error jaringan), When kegagalan terjadi, Then error ditampilkan inline non-blocking via accessibilityRole='alert' (reportError/surfaceServerError), pill tetap pada state server terakhir, baca & kirim pesan tetap jalan, tanpa crash.
24. Self-react diizinkan — Given saya penulis pesan P, When saya memilih emoji E pada P, Then reaksi tercipta normal dan reactedByMe=true untuk E pada pesan sendiri.
25. Definition of Done — Given rilis fitur, Then SEMUA benar: OWNER-2 sudah diadjudikasi (izinkan) + amandemen tertulis ada di `scope-guardrails.md` §"Pengecualian sempit — Reaction pill Initiative Chat" + `prd/01 §12`; token 'Reaction pill' terdaftar DESIGN.md §7 + global.css; migrasi baru (nomor reconcile terhadap HEAD saat build) membuat reaction_emojis (seed 4 ack: 👍✅👀🙏) + chat_message_reactions (RLS enabled, revoke I/U/D) + RPC toggle_chat_reaction (SECURITY DEFINER, ON CONFLICT DO NOTHING); contract test SQL menutup is_chat_member gate tulis, cross-org 0 baris, whitelist via FK, delisted-removable, idempotensi/concurrency, cascade, anti-tamper, tulis-langsung ditolak, netralitas skor; database.types.ts diperbarui; a11y non-warna + ≥44px terpenuhi.


## 10. Edge Cases & States

- **Loading**: reaksi ikut lifecycle `useChatMessages`; `SkeletonList` existing; **tanpa** placeholder pill (hindari layout shift; mayoritas pesan 0 reaksi).
- **Empty**: pesan tanpa reaksi → tak ada baris pill; count 0 → pill hilang; thread kosong → `EmptyState` existing.
- **Error toggle**: rollback ke state server + inline `accessibilityRole="alert"` via `reportError('Reaksi', e, 'Gagal memperbarui reaksi.')`; **tanpa** Alert modal; baca/kirim pesan tetap jalan. Debounce pill yang sedang di-toggle.
- **Permission-denied**: non-member 0 baris diam-diam; workspace-viewer read-only baca-boleh/tulis-tolak (server enforce); membership dicabut mid-sesi → toggle berikut gagal + rollback.
- **Data-integrity**: hapus pesan/room/org/reaktor → CASCADE; `author_id=null` tak memengaruhi reaksi; `currentUserId` null saat mount → pill netral sampai session ada, toggle di-guard.
- **Fitur menunggu V2**: sebelum V2 dijadwalkan, komponen pill **tidak dirender sama sekali** (bukan disabled) di build V1.8.x agar tak membocorkan keberadaan fitur.

## 11. Open Questions

### Terkunci (owner 2026-07-13) — jangan buka ulang tanpa alasan kuat

1. ~~OWNER-2 (scope)~~ — **RESOLVED: izinkan** dengan pengecualian sempit tertulis di `scope-guardrails.md` + `prd/01 §12`. Framing "guardrail stale" tetap ditolak; yang berubah bukan longgarnya guardrail, tapi tajamnya garis: yang dilarang = *social reaction feed / Story / Reels* (pola broadcast+popularitas), yang diizinkan = *reaction pill tingkat-pesan* yang zero bobot skor dan tanpa feed/leaderboard.
2. ~~MILESTONE~~ — **RESOLVED: V2**. Adjudikasi scope tidak menyeret jadwal build; V2 tetap.
3. ~~SET EMOJI FINAL~~ — **RESOLVED: seed V1 = 4 ack `👍 ✅ 👀 🙏` saja.** `❤️`/`🎉` sengaja tidak diseed (konsisten dengan invarian "ack-only" pengecualian scope). Menambah nanti = satu insert row. **Housekeeping design tetap wajib**: token pill terdaftar `DESIGN.md §7` + `global.css` (lihat FR-RX-0.3).
4. ~~MULTIPLISITAS~~ — **RESOLVED: multi-emoji per user per pesan.** PK komposit `(message, reactor, emoji)`. Concurrency-safe murni per baris; ekspektasi pengguna familiar (Slack/Discord). Mudah dipersempit ke eksklusif nanti (tambah constraint) daripada sebaliknya.
5. ~~PRIVASI REAKTOR (eksposur `reactor_id` ke workspace-viewer read-only)~~ — **RESOLVED: terima.** Paritas dengan visibilitas isi+author pesan yang sudah diberikan `can_view_workspace`. V1 UI tetap tidak menampilkan nama reaktor; `reactor_id` hanya di payload, tidak di layar. Jika kelak butuh disembunyikan, keputusan itu satu paket dengan US-R6 "daftar nama reaktor" (V2).
6. ~~NOTIFIKASI V1~~ — **RESOLVED: tidak ada.** Konsisten anti-noise. Bila kelak diaktifkan, WAJIB via `emit_notification` (skip-self, dedupe, rate-limit) — jangan buat jalur notif ad-hoc.

### Masih terbuka (untuk fase BUILD-PLAN V2)

7. **NOMOR MIGRASI** — reconcile sekuensial terhadap HEAD `main` aktual saat V2 dijadwalkan (branch ini terakhir 0044; memory mencatat 0052 di branch chat-polish). Bukan keputusan spec, murni operasional.
8. **CONFIDENTIAL ACCESS** — konfirmasi bahwa visibilitas reaksi di Initiative confidential tidak membocorkan sinyal melampaui pembatasan Confidential card yang mendasari; butuh contract test khusus jika confidential room dilibatkan. Belum ada preseden; putuskan bersama V2 build-plan.
9. **METRIK KEBERHASILAN PRODUK (G2)** — klaim "reaksi mengurangi pesan-balasan sepele" adalah ASUMSI. Tentukan proxy metrik (mis. penurunan pesan 1-kata) atau turunkan G2 jadi asumsi eksplisit saat V2 planning.


## 12. Handoff ke TDD

**Feature (untuk `/tdd-plan`)**: lihat `tdd_handoff.feature`. Urutan merah→hijau yang disarankan:
1. Contract test SQL `supabase/tests/0045_*` (server-first, invarian governance): whitelist FK, gate `is_chat_member` tulis, cross-org 0 baris, toggle idempoten/concurrency, delisted-removable, cascade, anti-tamper, tulis-langsung ditolak, netralitas skor.
2. Data layer `inbox.ts` (`toggleChatReaction`, embed select) + tipe.
3. Hook `use-inbox.ts` (mutation + invalidate).
4. UI `MessageBubble` pill (a11y non-warna, ≥44px).

**Precondition non-teknis sebelum TDD dijalankan (V2)**:
- Amandemen `scope-guardrails.md` + `prd/01 §12`: **sudah turun 2026-07-13** (gate scope tidak lagi blocker).
- Token "Reaction pill" di `DESIGN.md §7` + `mobile/src/global.css` (FR-RX-0.3): **belum** — wajib turun sebelum layer UI dimulai (contract test SQL + data layer boleh berjalan lebih dulu tanpa token).
- Larangan menulis kode/test di `specs/inbox-chat-ui.md` L190 masih berlaku sampai V2 dijadwalkan sebagai rilis — pembatasnya sekarang prioritas rilis, bukan lagi gate owner.

**Paths**: lihat `tdd_handoff.paths`.


---

## 13. Testable Behaviors (untuk /tdd-plan)

- Migrasi 0045 membuat tabel referensi reaction_emojis (seed 6 emoji, RLS select-all authenticated, revoke I/U/D) sebagai satu-satunya sumber kebenaran whitelist.
- Migrasi 0045 membuat chat_message_reactions dengan PK (chat_message_id,reactor_id,emoji), FK emoji->reaction_emojis, FK chat_message_id/reactor_id/organization_id ON DELETE CASCADE, RLS enabled, dan revoke insert/update/delete dari authenticated+anon.
- chat_message_reactions_select policy: organization_id=current_user_org() AND EXISTS(chat_messages cm WHERE cm.id=chat_message_id AND (is_chat_member(cm.chat_room_id) OR can_view_workspace())).
- RPC toggle_chat_reaction(p_message uuid,p_emoji text) returns boolean, SECURITY DEFINER set search_path='': resolve room+org dari pesan; raise jika pesan tak ada; raise jika bukan is_chat_member; DELETE (message,auth.uid(),emoji) -> jika terhapus return false; else validasi emoji aktif lalu INSERT ON CONFLICT DO NOTHING -> return true; grant execute hanya ke authenticated.
- Contract test PASS: anggota room dapat toggle-on (true) lalu toggle-off (false); baris tercipta/terhapus sesuai.
- Contract test FAIL/negatif: can_view_workspace non-member ditolak menulis tetapi dapat SELECT agregat; non-akses mendapat 0 baris; user org berbeda mendapat 0 baris/penolakan.
- Contract test concurrency/idempoten: dua INSERT (message,reactor,emoji) sama tidak menghasilkan 23505 (ON CONFLICT DO NOTHING).
- Contract test whitelist: emoji di luar reaction_emojis ditolak oleh FK + RPC raise; emoji delisted (active=false) tetap bisa di-DELETE (toggle-off).
- Contract test anti-tamper: reactor_id pada DELETE selalu auth.uid(); member Y tak dapat mencabut reaksi member X.
- Contract test tulis-langsung: authenticated .insert()/.delete() ke chat_message_reactions gagal (grant dicabut).
- Contract test cascade: hapus pesan/room/org/profil reaktor menghapus baris reaksi; chat_messages tak ter-UPDATE.
- Contract test netralitas skor: recompute score-formula byte-identik sebelum/sesudah reaksi; guard bahwa query skor tidak menyentuh chat_message_reactions.
- inbox.ts: listChatMessages memperluas select dengan reactions:chat_message_reactions(emoji,reactor_id) tanpa memindahkan .eq('chat_room_id',roomId) atau memasukkan embed ke ekspresi .or() keyset.
- inbox.ts: toggleChatReaction(messageId,emoji) memanggil rpc('toggle_chat_reaction') dan me-return boolean; ChatMessage.reactions?:{emoji,reactor_id}[].
- use-inbox.ts: useMutation(toggleChatReaction) onSuccess invalidate ['chat-messages', roomId]; error -> reportError inline.
- UI MessageBubble: render satu pill per emoji {emoji count} hanya bila count>0; pill 'reactedByMe' pakai pembeda non-warna + accessibilityState.selected + accessibilityLabel; kontrol ≥44px.
- UI: pesan tanpa reaksi tidak merender baris pill; toggle di-guard hingga currentUserId!=null; count besar dirender apa adanya (tanpa clamp sampai DESIGN menetapkan).
- database.types.ts: entri Row/Insert/Update/Relationships chat_message_reactions + reaction_emojis, dan RPC toggle_chat_reaction {Args:{p_message,p_emoji}, Returns:boolean} ditambah manual/regen.

## 14. TDD Handoff — Ringkasan Fitur

> Emoji reaction (Reaction pill, PRD §30.6) pada pesan Initiative Chat. Tabel referensi reaction_emojis (whitelist single-source, seed 6 emoji, active flag) + tabel samping chat_message_reactions (PK (chat_message_id,reactor_id,emoji), FK emoji->reaction_emojis, semua FK ON DELETE CASCADE, organization_id denormalized). Satu-satunya jalur tulis = RPC SECURITY DEFINER toggle_chat_reaction(p_message,p_emoji)->boolean: gate is_chat_member, DELETE-then (INSERT ON CONFLICT DO NOTHING) untuk toggle idempoten & concurrency-safe, validasi emoji-aktif hanya pada INSERT (delisted tetap removable), reactor_id=auth.uid() (anti-tamper). RLS: chat_message_reactions_select = current_user_org() AND (is_chat_member OR can_view_workspace) sebagai satu-satunya gate baca; revoke I/U/D dari authenticated+anon. Baca via embed PostgREST reactions:chat_message_reactions(emoji,reactor_id) di listChatMessages (count+reactedByMe dihitung client, TANPA nama reaktor di V1), tanpa merusak keyset (.eq top-level, tak masuk .or()). Netral-governance total (uji recompute skor identik + guard statik). V1: invalidation-only (tanpa optimistic), TANPA notifikasi, self-react diizinkan, multi-emoji per user. Mobile: MessageBubble render pill (a11y non-warna, ≥44px), useMutation invalidate ['chat-messages',roomId]. BLOCKER non-teknis: OWNER-2 (amandemen tertulis scope-guardrails.md + prd/01 §12) + token DESIGN.md §7 wajib turun sebelum menulis kode/test; target rilis default V2.

### Paths yang tersentuh

- `supabase/migrations/0045_chat_message_reactions.sql`
- `supabase/tests/0045_chat_message_reactions_contract.sql`
- `supabase/migrations/0008_fase3_collab.sql`
- `mobile/src/lib/inbox.ts`
- `mobile/src/hooks/use-inbox.ts`
- `mobile/src/lib/database.types.ts`
- `mobile/src/app/(app)/inbox/[roomId].tsx`
- `DESIGN.md`
- `mobile/src/global.css`
- `wiki/concepts/scope-guardrails.md`
- `prd/01-konsep-dan-fondasi.md`
- `specs/inbox-chat-ui.md`
