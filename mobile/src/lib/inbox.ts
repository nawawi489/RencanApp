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
