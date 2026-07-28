// Seen-by hooks — file terpisah dari use-inbox.test.tsx untuk isolasi state RN Testing Library
// (render+subscribe test realtime lain mengontaminasi renderHook di file yg sama).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListChatReadsForRoom = jest.fn();
const mockSubscribeChatReads = jest.fn();

jest.mock('@/lib/inbox', () => ({
  listChatReadsForRoom: (...a: unknown[]) => mockListChatReadsForRoom(...a),
  subscribeChatReads: (...a: unknown[]) => mockSubscribeChatReads(...a),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { useChatReads, useChatReadsRealtime } from '../use-inbox';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockListChatReadsForRoom.mockReset();
  mockListChatReadsForRoom.mockResolvedValue([]);
  mockSubscribeChatReads.mockReset();
  mockSubscribeChatReads.mockReturnValue(() => {});
});

describe('useChatReads', () => {
  it('[SEEN1] fetch reads & kelompokkan per message_id', async () => {
    mockListChatReadsForRoom.mockResolvedValueOnce([
      { chat_message_id: 'm1', reader_id: 'u2', read_at: '2026-06-24T02:00:00Z', reader: null },
      { chat_message_id: 'm1', reader_id: 'u3', read_at: '2026-06-24T02:05:00Z', reader: null },
      { chat_message_id: 'm2', reader_id: 'u2', read_at: '2026-06-24T02:10:00Z', reader: null },
    ]);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useChatReads('r1'), { wrapper });
    await waitFor(() => expect(result.current.readsByMessage.size).toBe(2));
    expect(result.current.readsByMessage.get('m1')).toHaveLength(2);
    expect(result.current.readsByMessage.get('m2')).toHaveLength(1);
    expect(mockListChatReadsForRoom).toHaveBeenCalledWith('r1');
  });

  it('[SEEN2] roomId kosong → tidak fetch', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useChatReads(''), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockListChatReadsForRoom).not.toHaveBeenCalled();
  });
});

function ReadsRealtimeProbe({ roomId }: { roomId: string }) {
  useChatReadsRealtime(roomId);
  return null;
}

describe('useChatReadsRealtime', () => {
  it('[SEEN3] subscribe saat mount; event → invalidate chat-reads', async () => {
    let captured: (() => void) | null = null;
    mockSubscribeChatReads.mockImplementation((_room: string, _myUid: string, cb: () => void) => {
      captured = cb;
      return () => {};
    });
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await render(createElement(ReadsRealtimeProbe, { roomId: 'r1' }), { wrapper });
    await waitFor(() =>
      expect(mockSubscribeChatReads).toHaveBeenCalledWith('r1', 'u1', expect.any(Function)),
    );
    act(() => captured?.());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('chat-reads'))).toBe(true);
  });

  it('[SEEN4] roomId kosong → TIDAK subscribe', async () => {
    const { wrapper } = makeWrapper();
    await render(createElement(ReadsRealtimeProbe, { roomId: '' }), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockSubscribeChatReads).not.toHaveBeenCalled();
  });
});
