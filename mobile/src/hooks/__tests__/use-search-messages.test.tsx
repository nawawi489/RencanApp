// Hooks Chat FTS V1 — use-search-messages. Mock @/lib/inbox, @/providers/auth-provider,
// @/lib/supabase (channel). Menguji: enabled guard <2 char, debounce 250ms, queryKey shape,
// realtime invalidation saat DELETE chat_room_members untuk user aktif, cleanup channel saat
// unmount, passthrough data sukses, deteksi PGRST202 (RPC belum di-apply → banner degrade UI).
// Governance/pagination/snippet ranah kontrak DB (supabase/tests/0044_*.sql).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockSearchChatMessages = jest.fn();
const mockRemoveChannel = jest.fn();
const capturedHandlers: ((p: { eventType: string; old?: { member_id?: string } }) => void)[] = [];
const channelObj: {
  on: (...args: unknown[]) => unknown;
  subscribe: (...args: unknown[]) => unknown;
  _name?: string;
} = {
  on: (_event: unknown, _filter: unknown, cb: unknown) => {
    capturedHandlers.push(cb as (p: { eventType: string; old?: { member_id?: string } }) => void);
    return channelObj;
  },
  subscribe: () => channelObj,
};
const mockChannelFactory = jest.fn((name: string) => {
  channelObj._name = name;
  return channelObj;
});

jest.mock('@/lib/inbox', () => ({
  searchChatMessages: (...a: unknown[]) => mockSearchChatMessages(...a),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u-me' } } }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (name: string) => mockChannelFactory(name),
    removeChannel: (ch: unknown) => mockRemoveChannel(ch),
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { useSearchMessages } from '../use-search-messages';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockSearchChatMessages.mockReset();
  mockRemoveChannel.mockReset();
  mockChannelFactory.mockClear();
  capturedHandlers.length = 0;
  mockSearchChatMessages.mockResolvedValue([]);
});

describe('useSearchMessages — guard', () => {
  it('[1] query kosong/1 char → searchChatMessages TIDAK dipanggil (enabled=false)', async () => {
    const { wrapper } = makeWrapper();
    const { rerender } = await renderHook(({ q }: { q: string }) => useSearchMessages(q), {
      wrapper,
      initialProps: { q: '' },
    });
    await waitFor(() => expect(true).toBe(true));
    expect(mockSearchChatMessages).not.toHaveBeenCalled();

    await rerender({ q: 'a' });
    await waitFor(() => expect(true).toBe(true));
    expect(mockSearchChatMessages).not.toHaveBeenCalled();
  });
});

describe('useSearchMessages — debounce & fetch', () => {
  it('[2] rapid typing "c"→"cp"→"cpl" dalam <250ms → hanya query final terkirim 1x', async () => {
    const { wrapper } = makeWrapper();
    const { rerender } = await renderHook(({ q }: { q: string }) => useSearchMessages(q), {
      wrapper,
      initialProps: { q: 'c' },
    });
    // 'c' < 2 char → tidak fetch.
    await waitFor(() => expect(true).toBe(true));
    expect(mockSearchChatMessages).not.toHaveBeenCalled();

    await rerender({ q: 'cp' });
    // Belum 250ms — belum ada call.
    expect(mockSearchChatMessages).not.toHaveBeenCalled();
    await rerender({ q: 'cpl' });

    // Setelah > 250ms nilai final yang terkirim.
    await waitFor(
      () =>
        expect(mockSearchChatMessages).toHaveBeenCalledWith({ query: 'cpl', roomId: undefined }),
      { timeout: 2000 },
    );
    expect(mockSearchChatMessages).toHaveBeenCalledTimes(1);
  });

  it('[3] roomId opsional diteruskan ke data layer dan masuk queryKey', async () => {
    const { qc, wrapper } = makeWrapper();
    await renderHook(() => useSearchMessages('cpl', { roomId: 'r-9' }), { wrapper });
    await waitFor(() =>
      expect(mockSearchChatMessages).toHaveBeenCalledWith({ query: 'cpl', roomId: 'r-9' }),
    );
    const cacheKeys = qc
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(
      cacheKeys.some(
        (k) => k.includes('messages_search') && k.includes('cpl') && k.includes('r-9'),
      ),
    ).toBe(true);
  });
});

describe('useSearchMessages — passthrough & error', () => {
  it('[4] hits diteruskan apa adanya ke consumer', async () => {
    const hits = [
      {
        messageId: 'm-1',
        chatRoomId: 'r-1',
        roomName: 'Room A',
        initiativeId: 'i-1',
        authorId: 'u-1',
        authorName: 'Andi',
        snippet: 'target CPL turun 20%',
        createdAt: '2026-07-10T09:00:00.000Z',
        bodySimilarity: 0.42,
      },
    ];
    mockSearchChatMessages.mockResolvedValue(hits);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSearchMessages('cpl'), { wrapper });
    await waitFor(() => expect(result.current?.hits).toEqual(hits));
  });

  it('[5] error kode PGRST202 → isRpcMissing=true (banner degrade name-only ranah UI)', async () => {
    mockSearchChatMessages.mockRejectedValue({ code: 'PGRST202', message: 'function not found' });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSearchMessages('cpl'), { wrapper });
    await waitFor(() => expect(result.current?.isError).toBe(true));
    expect(result.current?.isRpcMissing).toBe(true);
  });

  it('[6] error non-PGRST202 → isRpcMissing=false (banner network+Coba lagi ranah UI)', async () => {
    mockSearchChatMessages.mockRejectedValue({ message: 'network down' });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSearchMessages('cpl'), { wrapper });
    await waitFor(() => expect(result.current?.isError).toBe(true));
    expect(result.current?.isRpcMissing).toBe(false);
  });
});

describe('useSearchMessages — realtime membership revocation (FR-22)', () => {
  it('[7] DELETE chat_room_members untuk user aktif → invalidateQueries messages_search + cleanup channel saat unmount', async () => {
    const { qc, wrapper } = makeWrapper();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const { unmount } = await renderHook(() => useSearchMessages('cpl'), { wrapper });

    // Channel harus disubscribe sekali dan handler tercapture.
    await waitFor(() => expect(capturedHandlers.length).toBeGreaterThanOrEqual(1));
    expect(mockChannelFactory).toHaveBeenCalledTimes(1);

    // Reset spy — abaikan invalidate awal dari useQuery setup.
    invalidateSpy.mockClear();

    // Trigger DELETE untuk user aktif → invalidate.
    await act(async () => {
      capturedHandlers[0]({ eventType: 'DELETE', old: { member_id: 'u-me' } });
    });
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey),
    );
    expect(invalidatedKeys.some((k) => k.includes('messages_search'))).toBe(true);

    // DELETE utk user LAIN → no-op.
    invalidateSpy.mockClear();
    await act(async () => {
      capturedHandlers[0]({ eventType: 'DELETE', old: { member_id: 'u-other' } });
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    // Unmount → removeChannel dipanggil.
    await unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });
});
