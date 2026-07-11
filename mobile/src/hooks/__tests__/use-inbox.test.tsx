// Hooks Fase 3 — use-inbox. Mock data layer (@/lib/inbox) agar tak menyentuh Supabase.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListChatRooms = jest.fn();
const mockListChatMessages = jest.fn();
const mockSendChatMessage = jest.fn();
const mockMarkChatMessagesRead = jest.fn();

jest.mock('@/lib/inbox', () => ({
  CHAT_PAGE_SIZE: 30, // FR-IN2.x: hook membaca konstanta ini untuk getNextPageParam.
  listChatRooms: (...a: unknown[]) => mockListChatRooms(...a),
  listChatMessages: (...a: unknown[]) => mockListChatMessages(...a),
  sendChatMessage: (...a: unknown[]) => mockSendChatMessage(...a),
  markChatMessagesRead: (...a: unknown[]) => mockMarkChatMessagesRead(...a),
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
  mockListChatRooms.mockResolvedValue([
    { id: 'r1', action_plan_id: 'i1', name: 'Room A', unread_count: 2, last_message_at: '2026-06-24T01:00:00Z' },
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
  it('[2] mengambil pesan room via data layer (Critic §8.7 baseline rewrite: useInfiniteQuery memanggil dgn pageParam=0)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(mockListChatMessages).toHaveBeenCalledWith('r1', 0);
  });

  it('[3] hanya enabled saat roomId terisi (roomId kosong → data layer tidak dipanggil)', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useChatMessages(''), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockListChatMessages).not.toHaveBeenCalled();
  });
});

describe('useChatActions', () => {
  it('[4] send memanggil sendChatMessage lalu invalidate chat-messages & chat-rooms', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.send('Hai', ['u2']);
    await waitFor(() => expect(mockSendChatMessage).toHaveBeenCalledWith('r1', 'Hai', ['u2']));
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

// =========================================================== Paginasi (FR-IN2.x) ==========================================================
// useChatMessages → useInfiniteQuery. Order: desc (newest first dari data layer);
// merge halaman = page0 (terbaru) ++ page1 (lebih lama). Screen yang membalik untuk display kronologis.
describe('useChatMessages — paginasi', () => {
  function fillBatch(n: number, prefix: string) {
    return Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      chat_room_id: 'r1',
      author_id: 'u1',
      body: `b${i}`,
      created_at: '2026-06-24T01:00:00Z',
    }));
  }

  it('[8] loadOlder memanggil halaman berikutnya & merge desc (terbaru → lama)', async () => {
    // Page 0 = 30 items (penuh → hasNextPage=true → loadOlder bukan no-op).
    // Page 1 = 1 item 'p1-old' (akan ditambahkan setelah page 0 → posisi indeks 30).
    mockListChatMessages.mockImplementation(async (_id: string, page: number) =>
      page === 0
        ? fillBatch(30, 'p0')
        : [{ id: 'p1-old', chat_room_id: 'r1', author_id: 'u1', body: 'lama', created_at: '2026-06-20T05:00:00Z' }],
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatMessages('r1'), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(30));

    await result.current.loadOlder();
    await waitFor(() => expect(result.current.messages).toHaveLength(31));
    // Urutan desc dipertahankan: page0 (terbaru) ++ page1 (lebih lama).
    expect(result.current.messages[0].id).toBe('p0-0');     // newest dari page 0
    expect(result.current.messages[30].id).toBe('p1-old');  // older dari page 1 ada di akhir
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
