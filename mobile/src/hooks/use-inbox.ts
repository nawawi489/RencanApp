// Hooks Fase 3 — Inbox (Initiative Chat). Pemanggil tipis di atas @/lib/inbox.
// Query keys: ['chat-rooms'] dan ['chat-messages', roomId]. Mutasi invalidate keduanya.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listChatMessages,
  listChatRooms,
  markChatMessagesRead,
  sendChatMessage,
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

/** Pesan dalam satu room (terbaru dulu). Hanya fetch saat roomId terisi. */
export function useChatMessages(roomId: string) {
  const q = useQuery({
    queryKey: ['chat-messages', roomId],
    queryFn: () => listChatMessages(roomId),
    enabled: !!roomId,
  });

  return {
    messages: (q.data ?? []) as ChatMessage[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
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

  return {
    send: (body: string, mentions: string[] = []) => sendM.mutateAsync({ body, mentions }),
    markRead: () => markReadM.mutateAsync(),
    isSending: sendM.isPending,
  };
}
