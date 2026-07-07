// Item 2 & 3 audit error handling — auth-provider:
//  - getSession() yang reject TIDAK boleh menggantung `initializing=true` (stuck splash).
//  - signOut() harus membersihkan cache React Query (queryClient.clear) — hindari data org
//    lama tersisa di memori setelah ganti akun.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();
const mockUnsubscribe = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the imports it mocks
import { AuthProvider, useAuth } from '../auth-provider';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, createElement(AuthProvider, null, children));
  return { qc, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
  mockSignOut.mockResolvedValue({ error: null });
});

describe('AuthProvider — inisialisasi sesi', () => {
  it('[H-ITEM2-1] getSession yang REJECT tetap menyelesaikan init (initializing=false, session=null)', async () => {
    mockGetSession.mockRejectedValueOnce(new Error('network down'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.session).toBeNull();
  });

  it('[H-ITEM2-2] happy-path: init selesai & session diambil dari data.session', async () => {
    const session = { user: { id: 'u1' } };
    mockGetSession.mockResolvedValueOnce({ data: { session } });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.session).toBe(session);
  });

  it('[H-ITEM2-3] cleanup: unmount melepas subscription onAuthStateChange', async () => {
    const { wrapper } = makeWrapper();
    const { result, unmount } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      unmount();
    });
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

describe('AuthProvider — signOut', () => {
  it('[H-ITEM3-1] signOut memanggil queryClient.clear() setelah supabase.auth.signOut()', async () => {
    const { qc, wrapper } = makeWrapper();
    const clearSpy = jest.spyOn(qc, 'clear');
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('[H-ITEM3-2] efek nyata: data cache terhapus setelah signOut', async () => {
    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['goals'], [{ id: 'g1' }]);
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(qc.getQueryData(['goals'])).toBeUndefined();
  });
});
