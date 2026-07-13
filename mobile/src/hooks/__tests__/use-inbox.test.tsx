// Hooks Fase 3 — use-inbox. Mock data layer (@/lib/inbox) agar tak menyentuh Supabase.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListChatRooms = jest.fn();
const mockListChatMessages = jest.fn();
const mockSendChatMessage = jest.fn();
const mockMarkChatMessagesRead = jest.fn();
const mockToggleChatReaction = jest.fn();

jest.mock('@/lib/inbox', () => ({
  CHAT_PAGE_SIZE: 30, // FR-IN2.x: hook membaca konstanta ini untuk getNextPageParam.
  listChatRooms: (...a: unknown[]) => mockListChatRooms(...a),
  listChatMessages: (...a: unknown[]) => mockListChatMessages(...a),
  sendChatMessage: (...a: unknown[]) => mockSendChatMessage(...a),
  markChatMessagesRead: (...a: unknown[]) => mockMarkChatMessagesRead(...a),
  toggleChatReaction: (...a: unknown[]) => mockToggleChatReaction(...a),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { useChatActions, useChatMessages, useInboxRooms } from '../use-inbox';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockListChatRooms.mockReset();
  mockListChatMessages.mockReset();
  mockSendChatMessage.mockReset();
  mockMarkChatMessagesRead.mockReset();
  mockToggleChatReaction.mockReset();
  mockToggleChatReaction.mockResolvedValue(true);
  mockListChatRooms.mockResolvedValue([
    { id: 'r1', initiative_id: 'i1', name: 'Room A', unread_count: 2, last_message_at: '2026-06-24T01:00:00Z' },
  ]);
  mockListChatMessages.mockResolvedValue([
    { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'Halo', created_at: '2026-06-24T01:00:00Z' },
  ]);
  mockSendChatMessage.mockResolvedValue('m2');
  mockMarkChatMessagesRead.mockResolvedValue(2);
});

describe('useInboxRooms', () => {
  it('[1] mengambil daftar room via data layer dan mengekspos data saat sukses', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useInboxRooms(), { wrapper });
    await waitFor(() => expect(result.current.rooms).toHaveLength(1));
    expect(mockListChatRooms).toHaveBeenCalled();
    expect(result.current.rooms[0].name).toBe('Room A');
  });
});

describe('useChatMessages', () => {
  it('[2-rewrite] page pertama dipanggil dgn cursor undefined (bukan angka page) — keyset kanonik', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(mockListChatMessages).toHaveBeenCalledWith('r1', undefined);
  });

  it('[3] hanya enabled saat roomId terisi (roomId kosong → data layer tidak dipanggil)', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useChatMessages(''), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockListChatMessages).not.toHaveBeenCalled();
  });

  it('[3b] output hook meng-expose isFetchingNextPage (kontrak baru untuk indikator inverted FlatList)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    // Field baru wajib ada (bukan undefined) — awalnya false karena tak ada fetchNextPage berjalan.
    expect(typeof result.current.isFetchingNextPage).toBe('boolean');
    expect(result.current.isFetchingNextPage).toBe(false);
  });
});

describe('useChatActions', () => {
  it('[4] send memanggil sendChatMessage lalu invalidate chat-messages & chat-rooms', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.send('Hai', ['u2']);
    await waitFor(() => expect(mockSendChatMessage).toHaveBeenCalledWith('r1', 'Hai', ['u2'], undefined));
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-messages'))).toBe(true);
    expect(keys.some((k) => k.includes('chat-rooms'))).toBe(true);
  });

  it('[5] markRead memanggil markChatMessagesRead', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.markRead();
    await waitFor(() => expect(mockMarkChatMessagesRead).toHaveBeenCalledWith('r1'));
  });

  // [Critic §8.6] regression guard: send gagal HARUS reject + TIDAK invalidate.
  it('[6] send gagal → reject error + TIDAK invalidate chat-messages / chat-rooms', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    mockSendChatMessage.mockRejectedValueOnce(new Error('network down'));
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await expect(result.current.send('halo')).rejects.toThrow('network down');
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-messages'))).toBe(false);
    expect(keys.some((k) => k.includes('chat-rooms'))).toBe(false);
  });

  // [Critic §8.6] negative invalidation: markRead HANYA invalidate chat-rooms (jangan chat-messages,
  // karena pesan tidak berubah — hanya status read berubah → ranking unread di list).
  it('[7] markRead HANYA invalidate chat-rooms (bukan chat-messages)', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.markRead();
    await waitFor(() => expect(mockMarkChatMessagesRead).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-rooms'))).toBe(true);
    expect(keys.some((k) => k.includes('chat-messages'))).toBe(false);
  });
});

// =========================================================== Paginasi keyset (FR-KP6/7/8) ==========================================================
// useChatMessages → useInfiniteQuery. Order: desc (newest first dari data layer);
// merge halaman = page0 (terbaru) ++ page1 (lebih lama). Screen yang membalik untuk display kronologis.
// pageParam = ChatCursor | undefined; getNextPageParam derive dari last item lastPage.
describe('useChatMessages — paginasi keyset', () => {
  function fillBatch(n: number, prefix: string, createdAt = '2026-06-24T01:00:00Z') {
    return Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      chat_room_id: 'r1',
      author_id: 'u1',
      body: `b${i}`,
      created_at: createdAt,
    }));
  }

  it('[8-rewrite] loadOlder memanggil dgn cursor {createdAt,id} dari LAST item page 0 (AC-4: pemicu inkremental)', async () => {
    // Page 0 = 30 items, semua created_at sama → id last = 'p0-29' menjadi tie-break cursor.
    // Page 1 (via cursor) = 1 pesan lama.
    const page0 = fillBatch(30, 'p0', '2026-06-25T00:00:00.000Z');
    const older = {
      id: 'p1-old',
      chat_room_id: 'r1',
      author_id: 'u1',
      body: 'lama',
      created_at: '2026-06-20T05:00:00.000Z',
    };
    mockListChatMessages.mockResolvedValueOnce(page0).mockResolvedValueOnce([older]);

    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(30));

    // Call #1 = page pertama (cursor undefined).
    expect(mockListChatMessages).toHaveBeenNthCalledWith(1, 'r1', undefined);

    await result.current.loadOlder();
    await waitFor(() => expect(result.current.messages).toHaveLength(31));

    // Call #2 = cursor dari LAST item page 0 (paling lama karena data desc).
    expect(mockListChatMessages).toHaveBeenNthCalledWith(2, 'r1', {
      createdAt: '2026-06-25T00:00:00.000Z',
      id: 'p0-29',
    });

    // Urutan desc dipertahankan: page0 (terbaru) ++ page1 (lebih lama).
    expect(result.current.messages[0].id).toBe('p0-0');
    expect(result.current.messages[30].id).toBe('p1-old');
  });

  it('[8b] AC-5 seam refetch-all: invalidate → RQ v5 me-refetch SEMUA halaman + re-derive cursor dari page 0 hasil-refetch (4 calls total)', async () => {
    // Set-up: 4 respons berurutan (RQ v5 default refetchAll=true untuk infinite query).
    // Batch A (initial), Batch B (post-invalidate) sengaja beda "top" — mensimulasikan pesan
    // baru dari anggota lain masuk di antara paginasi. Cursor page 1 setelah refetch WAJIB
    // dihitung ulang dari LAST item batch B (bukan reuse dari cache batch A).
    const batchA = fillBatch(30, 'a', '2026-06-25T00:00:00.000Z');
    const olderA = {
      id: 'old-a',
      chat_room_id: 'r1',
      author_id: 'u1',
      body: 'x',
      created_at: '2026-06-20T00:00:00.000Z',
    };
    const batchB = fillBatch(30, 'b', '2026-06-26T00:00:00.000Z'); // top ter-shift
    const olderB = {
      id: 'old-b',
      chat_room_id: 'r1',
      author_id: 'u1',
      body: 'y',
      created_at: '2026-06-20T00:00:00.000Z',
    };

    mockListChatMessages
      .mockResolvedValueOnce(batchA) // call#1 page 0 initial
      .mockResolvedValueOnce([olderA]) // call#2 page 1 initial (cursor dari batchA last)
      .mockResolvedValueOnce(batchB) // call#3 page 0 refetch
      .mockResolvedValueOnce([olderB]); // call#4 page 1 refetch (cursor dari batchB last — re-derived!)

    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(30));
    await result.current.loadOlder();
    await waitFor(() => expect(result.current.messages).toHaveLength(31));

    // Trigger seam refetch-all — mensimulasikan onSuccess send (invalidate).
    await qc.invalidateQueries({ queryKey: ['chat-messages', 'r1'] });
    await waitFor(() => expect(mockListChatMessages).toHaveBeenCalledTimes(4));

    // Call #3 = page 0 refetch, cursor undefined (initialPageParam).
    expect(mockListChatMessages).toHaveBeenNthCalledWith(3, 'r1', undefined);
    // Call #4 = page 1 refetch, cursor dihitung ulang dari LAST item batchB (b-29 @ 2026-06-26)
    //          — BUKAN reuse cursor batchA (a-29 @ 2026-06-25). Ini mengunci ketergantungan
    //          FR-KP-REDERIVE (React Query v5 re-derive pageParam via getNextPageParam pada refetch).
    expect(mockListChatMessages).toHaveBeenNthCalledWith(4, 'r1', {
      createdAt: '2026-06-26T00:00:00.000Z',
      id: 'b-29',
    });
  });

  it('[9] hasMore=true saat batch penuh (== PAGE_SIZE=30)', async () => {
    mockListChatMessages.mockResolvedValueOnce(fillBatch(30, 'p0'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(30));
    expect(result.current.hasMore).toBe(true);
  });

  it('[10] hasMore=false saat batch < PAGE_SIZE', async () => {
    mockListChatMessages.mockResolvedValueOnce(fillBatch(5, 'p0'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(5));
    expect(result.current.hasMore).toBe(false);
  });
});

// =========================================================== Reaction hook (Fase C) ==========================================================
describe('useChatActions — toggleReaction', () => {
  it('[HK-1] mapping args: memanggil toggleChatReaction(messageId, emoji)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.toggleReaction('msg-42', '👍');
    expect(mockToggleChatReaction).toHaveBeenCalledWith('msg-42', '👍');
  });

  it('[HK-2] POS invalidate: sukses → invalidate chat-messages,roomId', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.toggleReaction('msg-1', '✅');
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-messages') && k.includes('r1'))).toBe(true);
  });

  it('[HK-3] NEG invalidate: sukses TIDAK invalidate chat-rooms', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.toggleReaction('msg-1', '👍');
    await waitFor(() => expect(mockToggleChatReaction).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-rooms'))).toBe(false);
  });

  it('[HK-4] NEG invalidate: sukses TIDAK invalidate notifications', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.toggleReaction('msg-1', '👀');
    await waitFor(() => expect(mockToggleChatReaction).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('notifications'))).toBe(false);
  });

  it('[HK-5] boolean pass-through: return true (toggle-on) dari data layer', async () => {
    mockToggleChatReaction.mockResolvedValueOnce(true);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    const val = await result.current.toggleReaction('msg-1', '👍');
    expect(val).toBe(true);
  });

  it('[HK-5b] boolean pass-through: return false (toggle-off) dari data layer', async () => {
    mockToggleChatReaction.mockResolvedValueOnce(false);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    const val = await result.current.toggleReaction('msg-1', '👍');
    expect(val).toBe(false);
  });

  it('[HK-6] error propagate + no-invalidate', async () => {
    const err = new Error('RLS denied');
    mockToggleChatReaction.mockRejectedValueOnce(err);
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await expect(result.current.toggleReaction('msg-1', '👍')).rejects.toThrow('RLS denied');
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-messages'))).toBe(false);
  });

  it('[HK-7] dua panggilan berturut → 2× invalidate chat-messages', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.toggleReaction('msg-1', '👍');
    await result.current.toggleReaction('msg-1', '👍');
    const chatMsgInvalidations = spy.mock.calls.filter(
      (c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey).includes('chat-messages'),
    );
    expect(chatMsgInvalidations.length).toBe(2);
  });

  it('[HK-8] isolasi roomId: invalidate hanya roomId yang diberikan ke hook', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r99'), { wrapper });
    await result.current.toggleReaction('msg-1', '👍');
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    const chatMsgKeys = keys.filter((k) => k[0] === 'chat-messages');
    expect(chatMsgKeys.every((k) => k[1] === 'r99')).toBe(true);
  });

  it('[HK-9] isTogglingReaction starts false, becomes true during pending', async () => {
    let resolveToggle: (v: boolean) => void;
    mockToggleChatReaction.mockImplementationOnce(
      () => new Promise<boolean>((r) => { resolveToggle = r; }),
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    expect(result.current.isTogglingReaction).toBe(false);
    const promise = result.current.toggleReaction('msg-1', '👍');
    await waitFor(() => expect(result.current.isTogglingReaction).toBe(true));
    resolveToggle!(true);
    await promise;
    await waitFor(() => expect(result.current.isTogglingReaction).toBe(false));
  });
});

describe('useChatMessages — reactions pass-through', () => {
  it('[HK-10] messages expose reactions[] from data layer', async () => {
    mockListChatMessages.mockResolvedValueOnce([
      { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'hi', created_at: '2026-07-10T00:00:00Z', reactions: [{ emoji: '👍', reactor_id: 'u2' }] },
    ]);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].reactions).toEqual([{ emoji: '👍', reactor_id: 'u2' }]);
  });

  it('[HK-11] messages expose empty reactions[] when no reactions', async () => {
    mockListChatMessages.mockResolvedValueOnce([
      { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'hi', created_at: '2026-07-10T00:00:00Z', reactions: [] },
    ]);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].reactions).toEqual([]);
  });
});

describe('useChatActions — regresi send() invalidation (HK-12)', () => {
  it('[HK-12] send() tetap invalidate chat-messages + chat-rooms setelah toggleReaction ditambahkan', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.send('halo');
    await waitFor(() => expect(mockSendChatMessage).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-messages'))).toBe(true);
    expect(keys.some((k) => k.includes('chat-rooms'))).toBe(true);
  });
});
