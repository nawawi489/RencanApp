// Hooks Fase 3 — Inbox (ActionPlan Chat). Pemanggil tipis di atas @/lib/inbox.
// Query keys: ['chat-rooms'] dan ['chat-messages', roomId].
// useChatMessages → useInfiniteQuery (FR-IN2.x): expose messages flat (urut desc, terbaru dulu),
// `loadOlder()`, dan `hasMore` (batch penuh = mungkin masih ada lagi). Screen yang membalik untuk
// display kronologis.
// markRead HANYA invalidate ['chat-rooms'] (status read berubah → ranking unread di Inbox list);
// pesan tidak berubah → jangan refetch ['chat-messages'].
// send onSuccess invalidate ['chat-messages',roomId]+['chat-rooms']; on error → reject (tak
// disembunyikan), tak ada invalidate.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { useAuth } from '@/providers/auth-provider';
import {
  CHAT_PAGE_SIZE,
  getChatRoom,
  listChatMessages,
  listChatReadsForRoom,
  listChatRooms,
  listChatRoomMembers,
  markChatMessagesRead,
  sendChatMessage,
  toggleChatReaction,
  subscribeChatReads,
  subscribeChatRoom,
  type ChatCursor,
  type ChatMessage,
  type ChatRead,
  type ChatRoom,
  type SendChatMessageOpts,
} from '@/lib/inbox';

/** Bentuk cache useInfiniteQuery untuk ['chat-messages', roomId]. */
type ChatPages = { pageParams: unknown[]; pages: ChatMessage[][] };

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

/** Detail room (nama + action_plan_id) untuk topbar konteks. */
export function useChatRoom(roomId: string) {
  const q = useQuery({
    queryKey: ['chat-room', roomId],
    enabled: !!roomId,
    queryFn: () => getChatRoom(roomId),
  });
  return { room: q.data ?? null, isLoading: q.isLoading };
}

/** Anggota room (avatar group, daftar anggota, picker @mention). */
export function useChatRoomMembers(roomId: string) {
  const q = useQuery({
    queryKey: ['chat-room-members', roomId],
    enabled: !!roomId,
    queryFn: () => listChatRoomMembers(roomId),
  });
  return { members: q.data ?? [], isLoading: q.isLoading };
}

/**
 * Read-receipt (seen-by) untuk semua pesan di room, dikelompokkan per message_id (O(1) lookup di
 * bubble). Pure useQuery + memo — subscribe realtime dipisah ke `useChatReadsRealtime` (pola sama
 * dgn `useChatMessages` + `useChatRealtime`) agar unit test hook stabil.
 */
export function useChatReads(roomId: string) {
  const q = useQuery({
    queryKey: ['chat-reads', roomId],
    enabled: !!roomId,
    queryFn: () => listChatReadsForRoom(roomId),
  });

  const byMessage = useMemo(() => {
    const map = new Map<string, ChatRead[]>();
    for (const r of q.data ?? []) {
      const arr = map.get(r.chat_message_id) ?? [];
      arr.push(r);
      map.set(r.chat_message_id, arr);
    }
    return map;
  }, [q.data]);

  return { readsByMessage: byMessage, isLoading: q.isLoading };
}

/** Berlangganan INSERT chat_message_reads dan invalidate ['chat-reads', roomId]. */
export function useChatReadsRealtime(roomId: string) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const myUid = session?.user?.id ?? '';
  useEffect(() => {
    if (!roomId || !myUid) return;
    const unsubscribe = subscribeChatReads(roomId, myUid, () => {
      qc.invalidateQueries({ queryKey: ['chat-reads', roomId] });
    });
    return unsubscribe;
  }, [roomId, myUid, qc]);
}

/**
 * Aksi tulis untuk satu room: kirim pesan + tandai terbaca.
 * `send` menerima `optimistic` opsional (bubble tampil instan sebelum server balas): disisipkan
 * ke kepala page 0 cache; onError rollback ke snapshot; onSuccess invalidate (refetch mengganti
 * temp dengan baris server). Tanpa `optimistic` perilaku lama dipertahankan (invalidate saja).
 */
export function useChatActions(roomId: string) {
  const qc = useQueryClient();

  const sendM = useMutation({
    mutationFn: (vars: { body: string; mentions: string[]; optimistic?: ChatMessage; opts?: SendChatMessageOpts }) =>
      sendChatMessage(roomId, vars.body, vars.mentions, vars.opts),
    onMutate: async (vars) => {
      if (!vars.optimistic) return { prev: undefined as ChatPages | undefined };
      await qc.cancelQueries({ queryKey: ['chat-messages', roomId] });
      const prev = qc.getQueryData<ChatPages>(['chat-messages', roomId]);
      qc.setQueryData<ChatPages>(['chat-messages', roomId], (old) => {
        const opt = vars.optimistic!;
        if (!old?.pages?.length) return { pageParams: [0], pages: [[opt]] };
        const pages = old.pages.slice();
        pages[0] = [opt, ...pages[0]];
        return { ...old, pages };
      });
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      // Rollback hanya bila kita sempat menulis optimistik (prev ter-snapshot).
      if (ctx && ctx.prev !== undefined) {
        qc.setQueryData(['chat-messages', roomId], ctx.prev);
      }
    },
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

  // Identitas objek stabil → `renderRow` di inbox/[roomId] tak berubah tiap render, jadi bubble
  // pesan tidak re-render pada tiap ketikan composer. `mutateAsync` dari React Query stabil lintas
  // render; alias ke lokal supaya deps eksplisit (bukan objek hasil useMutation yang identitasnya
  // berganti tiap render dan akan mematikan memo).
  const sendAsync = sendM.mutateAsync;
  const markReadAsync = markReadM.mutateAsync;
  const toggleReactionAsync = toggleReactionM.mutateAsync;
  const isSending = sendM.isPending;
  const isTogglingReaction = toggleReactionM.isPending;
  return useMemo(
    () => ({
      send: (body: string, mentions: string[] = [], optimistic?: ChatMessage, opts?: SendChatMessageOpts) =>
        sendAsync({ body, mentions, optimistic, opts }),
      markRead: () => markReadAsync(),
      isSending,
      toggleReaction: (messageId: string, emoji: string) => toggleReactionAsync({ messageId, emoji }),
      isTogglingReaction,
    }),
    [sendAsync, markReadAsync, toggleReactionAsync, isSending, isTogglingReaction],
  );
}

/**
 * Berlangganan pesan baru realtime untuk satu room. Saat ada INSERT (dari anggota mana pun),
 * invalidate ['chat-messages', roomId] + ['chat-rooms'] agar percakapan & unread tetap live.
 * `onRemoteInsert` opsional (mis. markRead ulang saat layar terbuka) dibaca via ref → callback
 * bisa berubah tanpa memicu re-subscribe.
 */
export function useChatRealtime(roomId: string, onRemoteInsert?: () => void) {
  const qc = useQueryClient();
  const cbRef = useRef(onRemoteInsert);
  // Sinkron callback via effect (bukan saat render) agar tak melanggar react-hooks/refs.
  useEffect(() => {
    cbRef.current = onRemoteInsert;
  });

  useEffect(() => {
    if (!roomId) return;
    const unsubscribe = subscribeChatRoom(roomId, () => {
      qc.invalidateQueries({ queryKey: ['chat-messages', roomId] });
      qc.invalidateQueries({ queryKey: ['chat-rooms'] });
      cbRef.current?.();
    });
    return unsubscribe;
  }, [roomId, qc]);
}
