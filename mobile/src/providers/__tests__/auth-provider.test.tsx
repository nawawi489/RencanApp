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
const mockSetSession = jest.fn();
const mockUnsubscribe = jest.fn();
const mockGetInitialURL = jest.fn();
const mockAddEventListener = jest.fn();
const mockLinkingRemove = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
      setSession: (...a: unknown[]) => mockSetSession(...a),
    },
  },
}));

jest.mock('expo-linking', () => ({
  getInitialURL: (...a: unknown[]) => mockGetInitialURL(...a),
  addEventListener: (...a: unknown[]) => mockAddEventListener(...a),
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
  mockSetSession.mockResolvedValue({ data: { session: null }, error: null });
  mockGetInitialURL.mockResolvedValue(null);
  mockAddEventListener.mockReturnValue({ remove: mockLinkingRemove });
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

describe('AuthProvider — PASSWORD_RECOVERY (forgot password)', () => {
  it('[H-RESET-1] event PASSWORD_RECOVERY dari onAuthStateChange → isRecovering=true', async () => {
    let capturedCallback: ((event: string, s: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementationOnce((cb: typeof capturedCallback) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.isRecovering).toBe(false);

    await act(async () => {
      capturedCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    });
    expect(result.current.isRecovering).toBe(true);
  });

  it('[H-RESET-2] SIGNED_OUT setelah recovery → isRecovering di-clear kembali ke false', async () => {
    let capturedCallback: ((event: string, s: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementationOnce((cb: typeof capturedCallback) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));

    await act(async () => {
      capturedCallback?.('PASSWORD_RECOVERY', { user: { id: 'u1' } });
    });
    expect(result.current.isRecovering).toBe(true);

    await act(async () => {
      capturedCallback?.('SIGNED_OUT', null);
    });
    expect(result.current.isRecovering).toBe(false);
  });
});

describe('AuthProvider — deep-link recovery URL', () => {
  it('[H-RESET-3] cold start dengan URL recovery → panggil supabase.auth.setSession dengan token', async () => {
    mockGetInitialURL.mockResolvedValueOnce(
      'ems://reset-password#access_token=aaa.bbb.ccc&refresh_token=rrr&type=recovery',
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledTimes(1));
    expect(mockSetSession.mock.calls[0][0]).toEqual({
      access_token: 'aaa.bbb.ccc',
      refresh_token: 'rrr',
    });
  });

  it('[H-RESET-4] URL non-recovery (mis. ems://home) → setSession TIDAK dipanggil', async () => {
    mockGetInitialURL.mockResolvedValueOnce('ems://home');
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    // Beri kesempatan effect deep-link menyelesaikan getInitialURL.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it('[H-RESET-5] warm deep-link (app sudah jalan): event "url" bawa recovery → setSession dipanggil', async () => {
    let urlListener: ((e: { url: string }) => void) | null = null;
    mockAddEventListener.mockImplementationOnce((event: string, cb: typeof urlListener) => {
      if (event === 'url') urlListener = cb;
      return { remove: mockLinkingRemove };
    });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));

    await act(async () => {
      urlListener?.({
        url: 'ems://reset-password#access_token=xxx&refresh_token=yyy&type=recovery',
      });
    });
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledTimes(1));
    expect(mockSetSession.mock.calls[0][0]).toEqual({
      access_token: 'xxx',
      refresh_token: 'yyy',
    });
  });

  it('[H-RESET-6] unmount melepas subscription Linking (event listener remove dipanggil)', async () => {
    const { wrapper } = makeWrapper();
    const { result, unmount } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      unmount();
    });
    expect(mockLinkingRemove).toHaveBeenCalled();
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
