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

export type ChatMessage = {
  id: string;
  chat_room_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: PersonRef;
};

/** Ukuran halaman listChatMessages. Diekspor agar hook (`useChatMessages`) menghitung `hasMore` dari `batch === CHAT_PAGE_SIZE` tanpa konstanta duplikat. */
export const CHAT_PAGE_SIZE = 30;

// ---------------------------------------------------------------- queries

/** Room yang user ikuti + unread per room (via RPC get_chat_rooms; unread = pesan bukan dari diri). */
export async function listChatRooms(): Promise<ChatRoom[]> {
  const { data, error } = await supabase.rpc('get_chat_rooms');
  if (error) throw error;
  return (data ?? []) as unknown as ChatRoom[];
}

/** Pesan dalam room, terbaru dulu, paginasi via offset. RLS menolak non-anggota. */
export async function listChatMessages(roomId: string, page = 0): Promise<ChatMessage[]> {
  if (!roomId) return [];
  const from = page * CHAT_PAGE_SIZE;
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, chat_room_id, author_id, body, created_at, author:author_id(id, full_name, email)')
    .eq('chat_room_id', roomId)
    .order('created_at', { ascending: false })
    .range(from, from + CHAT_PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as unknown as ChatMessage[];
}

// ---------------------------------------------------------------- mutations (RPC)

/** Kirim pesan. mentions = id user (hanya yang anggota room yang diproses server). */
export async function sendChatMessage(
  roomId: string,
  body: string,
  mentions: string[] = [],
): Promise<string> {
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_room: roomId,
    p_body: body,
    p_mentions: mentions,
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
