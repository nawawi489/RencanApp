// Data layer Fase 3 — Inbox (Initiative Chat). Pemanggil tipis. RLS membatasi visibilitas ke
// anggota room (is_chat_member); semua tulis lewat RPC SECURITY DEFINER.
//
// FR-DATA.1 (migrasi 0018): get_chat_rooms() menambah last_message_body + last_message_author_name
// untuk preview Inbox (UI-S-IN1). Keduanya nullable: body null = room kosong; author_name null =
// author_id NULL / profil terhapus (LEFT join lateral).
import type { PersonRef } from './cards';
import { supabase } from './supabase';

export type ChatRoom = {
  id: string;
  initiative_id: string;
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

export type ChatMessage = {
  id: string;
  chat_room_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: PersonRef;
  reactions?: ChatReaction[];
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
    .select('id, chat_room_id, author_id, body, created_at, author:author_id(id, full_name, email), reactions:chat_message_reactions(emoji, reactor_id), context_entity_type, context_entity_id, context_label, reply_to_message_id, reply_to:reply_to_message_id(id, body, author_id, author:author_id(full_name))')
    .eq('chat_room_id', roomId);
  if (cursor) qb = qb.or(buildKeysetOr(cursor));
  const { data, error } = await qb
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (error) throw error;
  return ((data ?? []) as unknown as (ChatMessage & { reactions: ChatReaction[] | null; reply_to: ChatMessageReplyTo | null })[]).map(
    (row) => ({ ...row, reactions: row.reactions ?? [], reply_to: row.reply_to ?? null }),
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
    p_context_action_plan: opts?.contextActionPlan ?? null,
    p_reply_to: opts?.replyTo ?? null,
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
    p_room_id: roomId ?? null,
    p_limit: limit ?? 20,
    p_before: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
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
