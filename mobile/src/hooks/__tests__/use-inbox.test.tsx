// Hooks Fase 3 — use-inbox. Mock data layer (@/lib/inbox) agar tak menyentuh Supabase.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListChatRooms = jest.fn();
const mockListChatMessages = jest.fn();
const mockSendChatMessage = jest.fn();
const mockMarkChatMessagesRead = jest.fn();
const mockSubscribeChatRoom = jest.fn();

jest.mock('@/lib/inbox', () => ({
  CHAT_PAGE_SIZE: 30, // FR-IN2.x: hook membaca konstanta ini untuk getNextPageParam.
  listChatRooms: (...a: unknown[]) => mockListChatRooms(...a),
  listChatMessages: (...a: unknown[]) => mockListChatMessages(...a),
  sendChatMessage: (...a: unknown[]) => mockSendChatMessage(...a),
  markChatMessagesRead: (...a: unknown[]) => mockMarkChatMessagesRead(...a),
  subscribeChatRoom: (...a: unknown[]) => mockSubscribeChatRoom(...a),
  // Data-layer seen-by dipakai oleh useChatReads(Realtime) — tes-tesnya di file terpisah.
  listChatReadsForRoom: jest.fn(async () => []),
  subscribeChatReads: jest.fn(() => () => {}),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { useChatActions, useChatMessages, useChatRealtime, useInboxRooms } from '../use-inbox';

type ChatPages = { pageParams: unknown[]; pages: Record<string, unknown>[][] };

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
  mockSubscribeChatRoom.mockReset();
  mockSubscribeChatRoom.mockReturnValue(() => {});
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
    expect(mockListChatMessages).toHaveBeenCalledWith('r1', undefined);
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
    mockListChatMessages.mockImplementation(
      async (_id: string, cursor?: { createdAt: string; id: string }) =>
        cursor == null
          ? fillBatch(30, 'p0')
          : [
              {
                id: 'p1-old',
                chat_room_id: 'r1',
                author_id: 'u1',
                body: 'lama',
                created_at: '2026-06-20T05:00:00Z',
              },
            ],
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

// =========================================================== Optimistic send ==========================================================
// send(body, mentions, optimistic?): sisip pesan ke kepala page 0 sebelum server balas; rollback saat gagal.
describe('useChatActions — optimistic send', () => {
  const opt = (id: string, body: string) => ({
    id, chat_room_id: 'r1', author_id: 'me', body, created_at: '2026-06-24T02:00:00Z',
  });

  it('[O1] send dengan optimistic → temp tampil di cache SEBELUM server balas', async () => {
    const { qc, wrapper } = makeWrapper();
    qc.setQueryData<ChatPages>(['chat-messages', 'r1'], { pageParams: [0], pages: [[]] });
    // Tahan resolusi server agar state optimistik dapat diobservasi.
    let resolveSend: (v: string) => void = () => {};
    mockSendChatMessage.mockImplementation(() => new Promise<string>((res) => { resolveSend = res; }));
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });

    // Panggil send TANPA act (pola tes [4]/[6]) — onMutate menyisipkan temp; observasi via waitFor.
    const p = result.current.send('halo', [], opt('temp-1', 'halo'));
    await waitFor(() => {
      const data = qc.getQueryData<ChatPages>(['chat-messages', 'r1']);
      expect(data?.pages[0][0].id).toBe('temp-1');
    });
    resolveSend('m-real');
    await p;
  });

  it('[O2] send optimistic GAGAL → rollback cache ke snapshot (temp hilang)', async () => {
    const { qc, wrapper } = makeWrapper();
    qc.setQueryData<ChatPages>(['chat-messages', 'r1'], {
      pageParams: [0],
      pages: [[{ id: 'm0', chat_room_id: 'r1', author_id: 'u1', body: 'ada', created_at: '2026-06-24T00:00:00Z' }]],
    });
    mockSendChatMessage.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });

    await expect(result.current.send('x', [], opt('temp-2', 'x'))).rejects.toThrow('boom');
    const data = qc.getQueryData<ChatPages>(['chat-messages', 'r1']);
    expect(data?.pages[0]).toHaveLength(1);
    expect(data?.pages[0][0].id).toBe('m0');
  });

  it('[O3] send TANPA optimistic → perilaku lama (invalidate, tak sentuh cache manual)', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useChatActions('r1'), { wrapper });
    await result.current.send('halo');
    await waitFor(() => expect(mockSendChatMessage).toHaveBeenCalledWith('r1', 'halo', []));
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-messages'))).toBe(true);
    expect(keys.some((k) => k.includes('chat-rooms'))).toBe(true);
  });
});

// =========================================================== Realtime ==========================================================
// Probe: render komponen kecil yang memakai useChatRealtime (pola `render` flush effect + cleanup
// andal, seperti tes layar — renderHook di sini tak reliabel flush mount/unmount effect).
function RealtimeProbe({ roomId, onRemote }: { roomId: string; onRemote?: () => void }) {
  useChatRealtime(roomId, onRemote);
  return null;
}

describe('useChatRealtime', () => {
  // Satu render menutup subscribe-on-mount + invalidate-on-event + onRemoteInsert. Cleanup unmount
  // (unsubscribe) TIDAK di-assert di sini: react-test-renderer tak flush passive-effect cleanup
  // sinkron pada unmount(); implementasi mengembalikan unsubscribe dari useEffect (dijamin React).
  it('[R1] subscribe saat mount; event → invalidate chat-messages & chat-rooms + onRemoteInsert', async () => {
    let captured: (() => void) | null = null;
    mockSubscribeChatRoom.mockImplementation((_room: string, cb: () => void) => {
      captured = cb;
      return () => {};
    });
    const onRemote = jest.fn();
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await render(createElement(RealtimeProbe, { roomId: 'r1', onRemote }), { wrapper });
    await waitFor(() => expect(mockSubscribeChatRoom).toHaveBeenCalledWith('r1', expect.any(Function)));

    act(() => captured?.());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-messages'))).toBe(true);
    expect(keys.some((k) => k.includes('chat-rooms'))).toBe(true);
    expect(onRemote).toHaveBeenCalled();
  });

  it('[R2] roomId kosong → TIDAK subscribe', async () => {
    const { wrapper } = makeWrapper();
    await render(createElement(RealtimeProbe, { roomId: '' }), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockSubscribeChatRoom).not.toHaveBeenCalled();
  });
});

// Seen-by hook tests dipisah ke `use-chat-reads.test.tsx` — RN Testing Library render+subscribe
// dari test realtime di file ini mengontaminasi state renderHook seen-by (root-cause fiber tree
// cleanup + act boundary). Isolasi file = solusi paling andal.
