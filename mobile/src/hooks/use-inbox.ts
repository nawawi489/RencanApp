// Hooks Fase 3 — Inbox (Initiative Chat). Pemanggil tipis di atas @/lib/inbox.
// Query keys: ['chat-rooms'] dan ['chat-messages', roomId].
// useChatMessages → useInfiniteQuery (FR-IN2.x): expose messages flat (urut desc, terbaru dulu),
// `loadOlder()`, dan `hasMore` (batch penuh = mungkin masih ada lagi). Screen yang membalik untuk
// display kronologis.
// markRead HANYA invalidate ['chat-rooms'] (status read berubah → ranking unread di Inbox list);
// pesan tidak berubah → jangan refetch ['chat-messages'].
// send onSuccess invalidate ['chat-messages',roomId]+['chat-rooms']; on error → reject (tak
// disembunyikan), tak ada invalidate.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CHAT_PAGE_SIZE,
  listChatMessages,
  listChatRooms,
  markChatMessagesRead,
  sendChatMessage,
  toggleChatReaction,
  type ChatCursor,
  type ChatMessage,
  type ChatRoom,
} from '@/lib/inbox';

/** Daftar room yang user ikuti + unread per room. */
export function useInboxRooms() {
  const q = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: listChatRooms,
  });

  return {
    rooms: (q.data ?? []) as ChatRoom[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Pesan dalam satu room (terbaru dulu). Hanya fetch saat roomId terisi.
 * `messages` = flatten dari `pages` (urutan desc dipertahankan: page0=terbaru, page1=lebih lama).
 * `loadOlder()` memuat halaman berikutnya via cursor keyset {createdAt,id} dari baris LAST
 * (paling lama) halaman sebelumnya; `hasMore` true selama halaman terakhir penuh
 * (== CHAT_PAGE_SIZE). `isFetchingNextPage` = passthrough dari useInfiniteQuery — dipakai
 * render layer sebagai indikator + guard onEndReached (FR-KP16).
 *
 * Korektnes seam refetch-all bergantung pada React Query v5 me-re-derive pageParam via
 * getNextPageParam mulai dari initialPageParam=undefined saat invalidateQueries — cursor
 * halaman >0 dihitung ULANG dari page 0 hasil-refetch, bukan reuse dari cache lama
 * (FR-KP-REDERIVE). Diuji hook-level (AC-4/AC-5).
 */
export function useChatMessages(roomId: string) {
  const q = useInfiniteQuery({
    queryKey: ['chat-messages', roomId],
    enabled: !!roomId,
    initialPageParam: undefined as ChatCursor | undefined,
    queryFn: ({ pageParam }) => listChatMessages(roomId, pageParam),
    getNextPageParam: (lastPage) => {
      if (lastPage.length < CHAT_PAGE_SIZE) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { createdAt: last.created_at, id: last.id };
    },
  });

  const messages = (q.data?.pages ?? []).flat() as ChatMessage[];

  return {
    messages,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
    loadOlder: () => q.fetchNextPage(),
    hasMore: !!q.hasNextPage,
    isFetchingNextPage: q.isFetchingNextPage,
  };
}

/** Aksi tulis untuk satu room: kirim pesan + tandai terbaca. */
export function useChatActions(roomId: string) {
  const qc = useQueryClient();

  const sendM = useMutation({
    mutationFn: (vars: { body: string; mentions: string[] }) =>
      sendChatMessage(roomId, vars.body, vars.mentions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages', roomId] });
      qc.invalidateQueries({ queryKey: ['chat-rooms'] });
    },
  });

  const markReadM = useMutation({
    mutationFn: () => markChatMessagesRead(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-rooms'] });
    },
  });

  const toggleReactionM = useMutation({
    mutationFn: (v: { messageId: string; emoji: string }) =>
      toggleChatReaction(v.messageId, v.emoji),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages', roomId] });
    },
  });

  return {
    send: (body: string, mentions: string[] = []) => sendM.mutateAsync({ body, mentions }),
    markRead: () => markReadM.mutateAsync(),
    isSending: sendM.isPending,
    toggleReaction: (messageId: string, emoji: string) =>
      toggleReactionM.mutateAsync({ messageId, emoji }),
    isTogglingReaction: toggleReactionM.isPending,
  };
}
