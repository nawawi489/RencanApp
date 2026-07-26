// Data layer Fase 3 — Inbox (ActionPlan Chat). Pemanggil tipis. RLS membatasi visibilitas ke
// anggota room (is_chat_member); semua tulis lewat RPC SECURITY DEFINER.
//
// FR-DATA.1 (migrasi 0018): get_chat_rooms() menambah last_message_body + last_message_author_name
// untuk preview Inbox (UI-S-IN1). Keduanya nullable: body null = room kosong; author_name null =
// author_id NULL / profil terhapus (LEFT join lateral).
import type { RealtimeChannel } from '@supabase/supabase-js';

import type { PersonRef } from './cards';
import { supabase } from './supabase';

export type ChatRoom = {
  id: string;
  action_plan_id: string;
  name: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_author_name: string | null;
};

export type ChatReaction = { emoji: string; reactor_id: string };

export type ChatMessageReplyTo = {
  id: string;
  body: string;
  author_id: string | null;
  author?: PersonRef;
};

export type SystemEventType =
  | 'status_submitted'
  | 'status_done'
  | 'status_revision'
  | 'status_resubmitted'
  | 'deadline_change_requested'
  | 'deadline_change_approved'
  | 'deadline_change_rejected'
  | 'deadline_change_revision_requested'
  | 'deadline_change_resubmitted';

export type ChatAttachment = {
  path: string;
  name: string;
  mime: string;
  size: number;
  kind: 'photo';
};

export type ChatMessage = {
  id: string;
  chat_room_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  kind?: 'user' | 'system';
  system_event_type?: SystemEventType | null;
  actor_id?: string | null;
  author?: PersonRef;
  reactions?: ChatReaction[];
  attachments?: ChatAttachment[];
  context_entity_type?: string | null;
  context_entity_id?: string | null;
  context_label?: string | null;
  reply_to_message_id?: string | null;
  reply_to?: ChatMessageReplyTo | null;
};

/** Ukuran halaman listChatMessages. Diekspor agar hook (`useChatMessages`) menghitung `hasMore` dari `batch === CHAT_PAGE_SIZE` tanpa konstanta duplikat. */
export const CHAT_PAGE_SIZE = 30;

/** Cursor keyset untuk paginasi pesan chat. Nilai `createdAt` = string `created_at` dari baris
 * TERAKHIR (paling lama) halaman sebelumnya, apa adanya (round-trip lossless — presisi mikrodetik
 * + offset TZ apa adanya). `id` = UUID baris tsb sebagai tie-break. */
export type ChatCursor = { createdAt: string; id: string };

// ---------------------------------------------------------------- queries

/** Room yang user ikuti + unread per room (via RPC get_chat_rooms; unread = pesan bukan dari diri). */
export async function listChatRooms(): Promise<ChatRoom[]> {
  const { data, error } = await supabase.rpc('get_chat_rooms');
  if (error) throw error;
  return (data ?? []) as unknown as ChatRoom[];
}

/** Pesan dalam room, terbaru dulu, paginasi via keyset (spec `keyset-pagination-list-chat-messages`).
 *
 * Ordering kanonik `created_at DESC, id DESC` (mirror semantik `search_chat_messages` 0044). Saat
 * `cursor` tersedia, dekomposisi tuple `(created_at, id) < (T, X)` ke ekspresi PostgREST `.or()`
 * — PostgREST tak mendukung row-value native. `.eq('chat_room_id')` WAJIB tetap top-level AND
 * (FR-KP10): melipatnya ke dalam grup `.or()` membocorkan pesan room lain untuk pembaca
 * `can_view_workspace`. RLS `chat_messages_select` satu-satunya penegak; tetap client `.from()`.
 */
export async function listChatMessages(
  roomId: string,
  cursor?: ChatCursor,
): Promise<ChatMessage[]> {
  if (!roomId) return [];
  let qb = supabase
    .from('chat_messages')
    .select('id, chat_room_id, author_id, body, created_at, kind, system_event_type, actor_id, author:author_id(id, full_name, email), reactions:chat_message_reactions(emoji, reactor_id), attachments, context_entity_type, context_entity_id, context_label, reply_to_message_id, reply_to:reply_to_message_id(id, body, author_id, author:author_id(full_name))')
    .eq('chat_room_id', roomId);
  if (cursor) qb = qb.or(buildKeysetOr(cursor));
  const { data, error } = await qb
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (error) throw error;
  return ((data ?? []) as unknown as (ChatMessage & { reactions: ChatReaction[] | null; reply_to: ChatMessageReplyTo | null; attachments: ChatAttachment[] | null })[]).map(
    (row) => ({ ...row, reactions: row.reactions ?? [], reply_to: row.reply_to ?? null, attachments: row.attachments ?? [] }),
  );
}

/** Ekspresi keyset PostgREST setara SQL `(created_at, id) < (T, X)`:
 *   `created_at.lt.<T> OR and(created_at.eq.<T>, id.lt.<X>)`
 * Nilai timestamp diteruskan apa adanya (round-trip lossless — mikrodetik + offset TZ);
 * parseability end-to-end diverifikasi AC-17b (contract HTTP). */
function buildKeysetOr(cursor: ChatCursor): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

// ---------------------------------------------------------------- mutations (RPC)

export type SendChatMessageOpts = {
  contextActionPlan?: string;
  replyTo?: string;
  attachments?: ChatAttachment[];
  /** Kunci idempotensi (0103): retry-manual dgn key sama mengembalikan pesan asli, bukan duplikat. */
  clientRequestId?: string;
};

/** Kirim pesan. mentions = id user (hanya yang anggota room yang diproses server). */
export async function sendChatMessage(
  roomId: string,
  body: string,
  mentions: string[] = [],
  opts?: SendChatMessageOpts,
): Promise<string> {
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_room: roomId,
    p_body: body,
    p_mentions: mentions,
    p_attachments: opts?.attachments ?? undefined,
    p_context_action_plan: opts?.contextActionPlan ?? undefined,
    p_reply_to: opts?.replyTo ?? undefined,
    p_client_request_id: opts?.clientRequestId ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

/** Tandai semua pesan room sebagai terbaca (kecuali pesan sendiri). */
export async function markChatMessagesRead(roomId: string): Promise<number> {
  const { data, error } = await supabase.rpc('mark_chat_messages_read', { p_room: roomId });
  if (error) throw error;
  return (data as number) ?? 0;
}

/** Toggle reaksi emoji pada pesan. Return true = ditambahkan, false = dihapus. */
export async function toggleChatReaction(messageId: string, emoji: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_chat_reaction', {
    p_message: messageId,
    p_emoji: emoji,
  });
  if (error) throw error;
  return data as boolean;
}

// ---------------------------------------------------------------- search (Chat FTS V1)
// RPC `search_chat_messages` — SECURITY DEFINER STABLE, gate is_chat_member OR
// (can_view_workspace AND can_access_initiative) confidential-aware. Semua guard (btrim, len<2,
// substring 200 char, LIKE-escape %/_/\, snippet ±80/240 char, limit clamp 1..30, cursor NULL
// handling, ORDER BY created_at DESC, id DESC) hidup di server. Wrapper ini TIDAK short-circuit
// query pendek — server sumber kebenaran. Realtime invalidation & debounce ranah hook.

export type ChatMessageHit = {
  messageId: string;
  chatRoomId: string;
  roomName: string;
  /**
   * chat_rooms → action_plans → initiatives; nullable karena `action_plans.initiative_id`
   * bisa NULL (orphan action_plan) — spec §4.2 return shape.
   */
  initiativeId: string | null;
  authorId: string | null;
  authorName: string | null;
  /** Server-computed ≤240 char (spec §4.2). */
  snippet: string;
  /** ISO timestamptz. */
  createdAt: string;
  /** pg_trgm similarity — observability only, ORDER BY created_at (spec §3.2 FR-11). */
  bodySimilarity: number;
};

export type SearchChatMessagesParams = {
  query: string;
  /** Batasi ke satu room (opsional). */
  roomId?: string;
  /** Default 20, server clamp 1..30. */
  limit?: number;
  /** Keyset cursor (spec §4.2). */
  before?: { createdAt: string; id: string };
};

type ChatMessageHitRow = {
  message_id: string;
  chat_room_id: string;
  room_name: string;
  initiative_id: string;
  author_id: string | null;
  author_name: string | null;
  snippet: string;
  created_at: string;
  body_similarity: number;
};

/**
 * Cari pesan chat by body (FTS V1). Semua otorisasi & escaping di server.
 * Typed via manual entry di `database.types.ts` (mengikuti migrasi 0044); regen otomatis
 * saat `supabase gen types typescript` dijalankan berikutnya akan meng-idempoten-kan blok
 * `search_chat_messages` di sana.
 */
export async function searchChatMessages(
  params: SearchChatMessagesParams,
): Promise<ChatMessageHit[]> {
  const { query, roomId, limit, before } = params;
  const { data, error } = await supabase.rpc('search_chat_messages', {
    p_query: query,
    p_room_id: roomId ?? undefined,
    p_limit: limit ?? 20,
    p_before: before?.createdAt ?? undefined,
    p_before_id: before?.id ?? undefined,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as ChatMessageHitRow[];
  return rows.map((r) => ({
    messageId: r.message_id,
    chatRoomId: r.chat_room_id,
    roomName: r.room_name,
    initiativeId: r.initiative_id,
    authorId: r.author_id,
    authorName: r.author_name,
    snippet: r.snippet,
    createdAt: r.created_at,
    bodySimilarity: r.body_similarity,
  }));
}
// ---------------------------------------------------------------- lookups

/** Metadata room untuk topbar konteks (nama + Rencana Aksi terkait). RLS member-gated. */
export type ChatRoomDetail = { id: string; name: string; action_plan_id: string };

/** Anggota room (untuk avatar group, daftar anggota, dan picker @mention). */
export type ChatMember = { id: string; full_name: string | null; email: string | null };

/**
 * Room id untuk sebuah Rencana Aksi (deep-link "Buka Chat" dari Tugas → room yang benar).
 * RLS chat_rooms member-gated: non-anggota → null (pemanggil fallback ke tab Inbox generik).
 */
export async function getRoomIdForActionPlan(actionPlanId: string): Promise<string | null> {
  if (!actionPlanId) return null;
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('action_plan_id', actionPlanId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * PRD §24.3 aksi ke-3 "Catatan" — umpan balik reviewer yang NON-TERMINAL.
 *
 * Tidak menyentuh `reviews` / `task_submissions.review_status`: submission tetap
 * `pending` dan status Tugas tidak berubah. Catatan mendarat sebagai pesan biasa di
 * Diskusi Rencana Aksi, ditandai konteks Tugas yang direview (`p_context_action_plan`)
 * supaya PIC melihat catatan itu menempel pada Tugas yang benar.
 *
 * Entri Activity Log belum ditulis: `write_activity` dicabut dari `authenticated`
 * (migrasi 0062, anti audit-log palsu), jadi butuh RPC SECURITY DEFINER baru —
 * di-defer, lihat catatan BL-08 di [[ui-prototype-gap]].
 */
export async function postReviewNote(args: {
  /** Tugas yang direview — jadi konteks pesan. */
  taskId: string;
  /**
   * Induk Rencana Aksi dari `taskId` — dipakai me-resolve room. WAJIB induk dari
   * `taskId` itu sendiri: `send_chat_message` menolak konteks yang tidak sebidang
   * (`a.action_plan_id = v_room.action_plan_id`, guard 0056 → 'Tugas tidak berada
   * dalam Action Plan room ini.'). Null = Tugas jalur Development (induknya Problem
   * Statement, bukan Rencana Aksi) atau data induk belum termuat.
   */
  actionPlanId: string | null | undefined;
  body: string;
}): Promise<string> {
  const body = args.body.trim();
  if (!body) throw new Error('Catatan tidak boleh kosong.');
  // Dibedakan dari kasus room-null di bawah: tanpa guard ini, Tugas yang induknya
  // belum termuat (atau jalur Development yang memang tak punya Rencana Aksi) akan
  // jatuh ke pesan "tidak tersedia untuk Anda" — terbaca sebagai masalah izin,
  // padahal bukan.
  if (!args.actionPlanId) {
    throw new Error('Tugas ini belum terhubung ke Diskusi Rencana Aksi.');
  }
  const roomId = await getRoomIdForActionPlan(args.actionPlanId);
  // RLS chat_rooms member-gated → null saat reviewer bukan anggota room. Pesan eksplisit
  // lebih berguna daripada melempar error RPC mentah dari send_chat_message.
  if (!roomId) throw new Error('Diskusi Rencana Aksi tidak tersedia untuk Anda.');
  return sendChatMessage(roomId, body, [], { contextActionPlan: args.taskId });
}

/** Detail room (nama + action_plan_id) untuk topbar. RLS menolak non-anggota → null. */
export async function getChatRoom(roomId: string): Promise<ChatRoomDetail | null> {
  if (!roomId) return null;
  const { data, error } = await supabase
    .from('chat_rooms')
    .select('id, name, action_plan_id')
    .eq('id', roomId)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatRoomDetail | null) ?? null;
}

/** Anggota room via chat_room_members → profiles (RLS: anggota boleh lihat daftar anggota). */
export async function listChatRoomMembers(roomId: string): Promise<ChatMember[]> {
  if (!roomId) return [];
  const { data, error } = await supabase
    .from('chat_room_members')
    .select('member:member_id(id, full_name, email)')
    .eq('chat_room_id', roomId);
  if (error) throw error;
  return ((data ?? []) as unknown as { member: ChatMember | null }[])
    .map((r) => r.member)
    .filter((m): m is ChatMember => m != null);
}

/** Read-receipt satu pesan: siapa membacanya, kapan. */
export type ChatRead = {
  chat_message_id: string;
  reader_id: string;
  read_at: string;
  reader: ChatMember | null;
};

/**
 * Semua read-receipt pesan dalam sebuah room (setelah migrasi 0053 anggota boleh lihat reads
 * anggota lain di room yang sama). Pemanggil mengelompokkan per message_id di sisi klien.
 */
export async function listChatReadsForRoom(roomId: string): Promise<ChatRead[]> {
  if (!roomId) return [];
  const { data, error } = await supabase
    .from('chat_message_reads')
    .select(
      'chat_message_id, reader_id, read_at, reader:reader_id(id, full_name, email), message:chat_message_id!inner(chat_room_id)',
    )
    // Filter pada relasi embed: hanya reads untuk pesan di room ini.
    .eq('message.chat_room_id', roomId);
  if (error) throw error;
  return ((data ?? []) as unknown as ChatRead[]).map((r) => ({
    chat_message_id: r.chat_message_id,
    reader_id: r.reader_id,
    read_at: r.read_at,
    reader: r.reader,
  }));
}

/**
 * Berlangganan INSERT `chat_message_reads` (migrasi 0053 memasukkan tabel ke publication).
 * Filter server-side by room tak bisa (tabel tak punya kolom chat_room_id) → RLS + invalidate
 * pada setiap event; klien refetch daftar reads yang sudah tersaring per room.
 */
export function subscribeChatReads(roomId: string, onChange: () => void): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`chat-reads-${roomId}`)
    .on(
      'postgres_changes' as never,
      { event: 'INSERT', schema: 'public', table: 'chat_message_reads' } as never,
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------- realtime

/**
 * Berlangganan INSERT `chat_messages` untuk satu room (Supabase Realtime, migrasi 0052 memasukkan
 * tabel ke publication `supabase_realtime`). RLS tetap berlaku: hanya anggota room menerima event.
 * `onChange` dipanggil pada setiap pesan baru (dari siapa pun) — pemanggil me-refetch/invalidate.
 * Mengembalikan fungsi unsubscribe (lepas channel).
 */
export function subscribeChatRoom(roomId: string, onChange: () => void): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`chat-room-${roomId}`)
    .on(
      // supabase-js typing untuk postgres_changes ketat pada literal event; cast aman.
      'postgres_changes' as never,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `chat_room_id=eq.${roomId}`,
      } as never,
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
