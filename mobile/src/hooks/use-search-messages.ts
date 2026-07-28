// Hook Chat FTS V1 — useSearchMessages. Debounce 250ms client-side, enabled guard length>=2
// (server juga menegakkan — FR-6 spec), staleTime 15s, realtime invalidation saat membership
// dicabut (FR-22). isRpcMissing = deteksi PGRST202 supaya UI degrade ke banner "belum aktif".
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { searchChatMessages, type ChatMessageHit } from '@/lib/inbox';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 250;
const STALE_MS = 15_000;

type Options = { roomId?: string };

type RpcErrorLike = { code?: string; message?: string } | null | undefined;

export function useSearchMessages(rawQuery: string, opts: Options = {}) {
  const trimmed = rawQuery.trim();
  const { roomId } = opts;
  const [debounced, setDebounced] = useState(trimmed);
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const queryClient = useQueryClient();

  // Debounce raw→debounced. Rerender terjadi tapi queryKey tidak berubah sampai delay lewat.
  useEffect(() => {
    if (trimmed === debounced) return;
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, debounced]);

  const enabled = debounced.length >= 2;

  const query = useQuery<ChatMessageHit[], RpcErrorLike>({
    queryKey: ['messages_search', debounced, roomId ?? null],
    queryFn: () => searchChatMessages({ query: debounced, roomId }),
    enabled,
    staleTime: STALE_MS,
  });

  // Realtime: DELETE chat_room_members untuk user aktif → invalidate cache messages_search.
  // Mencegah hasil menampilkan pesan room yang user sudah tidak lagi jadi anggota (FR-22).
  // Server-side filter `member_id=eq.<uid>` supaya Realtime tak menyiarkan DELETE dari room
  // orang lain; guard client-side dipertahankan sebagai belt-and-suspenders (payload lolos
  // bila filter tak dikenali server versi lama).
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`search_messages_membership:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_room_members',
          filter: `member_id=eq.${userId}`,
        },
        (payload: { eventType?: string; old?: { member_id?: string } }) => {
          if (payload.old?.member_id !== userId) return;
          queryClient.invalidateQueries({ queryKey: ['messages_search'] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const errCode = (query.error as { code?: string } | undefined)?.code;
  const isRpcMissing = query.isError && errCode === 'PGRST202';

  return {
    hits: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    isRpcMissing,
    refetch: query.refetch,
  };
}
