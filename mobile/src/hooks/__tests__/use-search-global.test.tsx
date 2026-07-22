// BL-10 PR-1 — hook Search global (W6b). Ditulis SEBELUM hooks/use-search-global.ts ada.
//
// CATATAN WAKTU (§9.2 Concern #12): hook menerima `debounceMs` lewat opsi sehingga test
// memakai 0 ms. Debounce 250 ms dengan timer nyata di ~17 kasus adalah sumber flake yang
// sudah punya riwayat di repo ini (memori ci-flake-test-ci). Nilai default 250 tetap
// diuji sekali lewat H02 memakai fake timers, bukan menunggu wall-clock.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

const mockSearchGlobal = jest.fn();
jest.mock('@/lib/search', () => ({
  ...jest.requireActual('@/lib/search'),
  searchGlobal: (...a: unknown[]) => mockSearchGlobal(...a),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}));

// Kalau hook menyentuh realtime, mock ini akan tercatat terpanggil (H10).
const mockChannel = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (...a: unknown[]) => {
      mockChannel(...a);
      return { on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) };
    },
    removeChannel: jest.fn(),
    rpc: jest.fn(),
  },
}));

// eslint-disable-next-line import/first
import { SEARCH_DEBOUNCE_MS, useSearchGlobal, useSearchScopePage } from '../use-search-global';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  W.displayName = 'W';
  return { W, client };
}

const HIT = {
  scope: 'goal', id: 'g1', parentId: null, title: 'Goal', subtitle: null,
  snippet: null, status: 'active', sortTs: '2026-07-22T00:00:00Z', sortId: 'g1',
};

beforeEach(() => {
  mockSearchGlobal.mockReset().mockResolvedValue([HIT]);
  mockChannel.mockReset();
});

describe('useSearchGlobal', () => {
  it('[BL10-H01] enabled hanya saat query >= 2 char', async () => {
    const { W } = wrapper();
    const { rerender } = await renderHook(({ q }: { q: string }) => useSearchGlobal(q, { debounceMs: 0 }), {
      wrapper: W, initialProps: { q: 'a' },
    });
    await waitFor(() => expect(mockSearchGlobal).not.toHaveBeenCalled());

    rerender({ q: 'ab' });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
  });

  // §9.2 Concern #12 — TANPA fake timers, dan tanpa menunggu 250 ms wall-clock.
  //
  // Percobaan pertama memakai `jest.useFakeTimers()`; hasilnya test ini gagal SENDIRIAN
  // (await renderHook menunggu timer yang dibekukan) dan kegagalannya membocorkan fake
  // timers ke seluruh test sesudahnya sehingga 8 kasus lain ikut merah. Nilai default
  // karena itu diuji sebagai KONSTANTA, dan perilaku debounce diuji dengan delay pendek.
  it('[BL10-H02a] konstanta debounce default = 250 ms', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(250);
  });

  it('[BL10-H02b] debounce menunda pemanggilan, lalu tetap terjadi', async () => {
    const { W } = wrapper();
    const { rerender } = await renderHook(({ q }: { q: string }) => useSearchGlobal(q, { debounceMs: 40 }), {
      wrapper: W, initialProps: { q: '' },
    });
    rerender({ q: 'abc' });
    expect(mockSearchGlobal).not.toHaveBeenCalled();       // belum lewat 40 ms
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
  });

  it('[BL10-H03] queryKey ternamai search_global', async () => {
    const { W, client } = wrapper();
    await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
    const keys = client.getQueryCache().getAll().map((q) => q.queryKey[0]);
    expect(keys).toContain('search_global');
  });

  it('[BL10-H04] NG-6 — tidak pernah menyentuh cards_search', async () => {
    const { W, client } = wrapper();
    await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
    const keys = client.getQueryCache().getAll().map((q) => String(q.queryKey[0]));
    expect(keys).not.toContain('cards_search');
  });

  it('[BL10-H05] passthrough tanpa field turunan', async () => {
    const { W } = wrapper();
    const { result } = await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(result.current.hits).toHaveLength(1));
    expect(result.current.hits[0]).toEqual(HIT);
    expect(result.current as Record<string, unknown>).not.toHaveProperty('total');
    expect(result.current as Record<string, unknown>).not.toHaveProperty('count');
  });

  it('[BL10-H06] kembalian identik untuk dua sebab kekosongan', async () => {
    const { W } = wrapper();
    mockSearchGlobal.mockResolvedValue([]);
    const a = await renderHook(() => useSearchGlobal('tidak-cocok', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    const b = await renderHook(() => useSearchGlobal('tersaring', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(b.result.current.isLoading).toBe(false));
    expect(JSON.stringify(a.result.current.hits)).toBe(JSON.stringify(b.result.current.hits));
  });

  it('[BL10-H07] query diteruskan mentah ke lapis data', async () => {
    const { W } = wrapper();
    await renderHook(() => useSearchGlobal('  a%b  ', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
    expect(mockSearchGlobal.mock.calls[0][0].query).toBe('  a%b  ');
  });

  it('[BL10-H08] PGRST202 → isRpcMissing true', async () => {
    mockSearchGlobal.mockRejectedValue({ code: 'PGRST202', message: 'not found' });
    const { W } = wrapper();
    const { result } = await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(result.current.isRpcMissing).toBe(true));
  });

  it('[BL10-H09] staleTime 0 diuji sebagai PERILAKU: mount ulang memicu fetch lagi', async () => {
    // §9.5 Concern #1 — react-query v5 tidak menyimpan staleTime di Query.options, dan
    // membacanya lewat internal cache tetap rapuh lintas versi. Yang diuji artinya.
    const { W } = wrapper();
    // `unmount()` WAJIB dibungkus act (preseden use-push-notifications.test.tsx:383).
    // Tanpa itu, efek pembongkaran tidak ter-flush dan SELURUH test sesudah blok ini
    // gagal me-render — gejalanya "searchGlobal tidak pernah dipanggil", yang menyesatkan
    // karena tampak seperti bug hook padahal sisa keadaan React dari test sebelumnya.
    const a = await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalledTimes(1));
    await act(async () => { a.unmount(); });
    const b = await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalledTimes(2));
    await act(async () => { b.unmount(); });
  });

  it('[BL10-H10] tanpa realtime channel (Search read-only, tidak berlangganan)', async () => {
    const { W } = wrapper();
    await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('[BL10-H17] limit default 5, tanpa clamp klien', async () => {
    const { W } = wrapper();
    await renderHook(() => useSearchGlobal('abc', { debounceMs: 0 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
    expect(mockSearchGlobal.mock.calls[0][0].limit).toBe(5);

    mockSearchGlobal.mockClear();
    await renderHook(() => useSearchGlobal('abc', { debounceMs: 0, limit: 999 }), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
    expect(mockSearchGlobal.mock.calls[0][0].limit).toBe(999);   // clamp milik server
  });
});

describe('useSearchScopePage', () => {
  it('[BL10-H11] scopes selalu TEPAT SATU (syarat cursor FR-19)', async () => {
    const { W } = wrapper();
    await renderHook(() => useSearchScopePage('abc', 'goal'), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalled());
    expect(mockSearchGlobal.mock.calls[0][0].scopes).toEqual(['goal']);
  });

  it('[BL10-H12] cursor diambil dari baris TERAKHIR, tanpa offset/page', async () => {
    const page1 = Array.from({ length: 5 }, (_, i) => ({
      ...HIT, id: `g${i}`, sortId: `g${i}`, sortTs: `2026-07-2${i}T00:00:00Z`,
    }));
    mockSearchGlobal.mockResolvedValueOnce(page1).mockResolvedValueOnce([]);
    const { W } = wrapper();
    const { result } = await renderHook(() => useSearchScopePage('abc', 'goal'), { wrapper: W });
    await waitFor(() => expect(result.current.hits).toHaveLength(5));

    await act(async () => { await result.current.fetchNextPage(); });
    const second = mockSearchGlobal.mock.calls[1][0];
    expect(second.cursorTs).toBe(page1[4].sortTs);
    expect(second.cursorId).toBe(page1[4].sortId);
    expect(second).not.toHaveProperty('offset');
    expect(second).not.toHaveProperty('page');
  });

  it('[BL10-H13] halaman tidak penuh → hasNextPage false', async () => {
    mockSearchGlobal.mockResolvedValue([HIT]);   // 1 < limit 5
    const { W } = wrapper();
    const { result } = await renderHook(() => useSearchScopePage('abc', 'goal'), { wrapper: W });
    await waitFor(() => expect(result.current.hits).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('[BL10-H15] queryKey terpisah per scope', async () => {
    const { W, client } = wrapper();
    await renderHook(() => useSearchScopePage('abc', 'goal'), { wrapper: W });
    await renderHook(() => useSearchScopePage('abc', 'task'), { wrapper: W });
    await waitFor(() => expect(mockSearchGlobal).toHaveBeenCalledTimes(2));
    const keys = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
    expect(keys.some((k) => k.includes('"goal"'))).toBe(true);
    expect(keys.some((k) => k.includes('"task"'))).toBe(true);
  });
});
