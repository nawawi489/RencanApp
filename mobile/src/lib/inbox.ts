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
const PAGE_SIZE = CHAT_PAGE_SIZE;

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
  const from = page * PAGE_SIZE;
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, chat_room_id, author_id, body, created_at, author:author_id(id, full_name, email)')
    .eq('chat_room_id', roomId)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
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
