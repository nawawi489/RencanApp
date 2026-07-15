// Blok E — integrasi push token + auth signOut (PN-AUTH-1 to PN-AUTH-5).
// Memverifikasi urutan: unregister push token → supabase.auth.signOut → queryClient.clear.
// Token disimpan di module-level store (getCurrentPushToken/setCurrentPushToken).
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

const mockUnregisterPushToken = jest.fn();
const mockGetCurrentPushToken = jest.fn();
const mockSetCurrentPushToken = jest.fn();

const mockReportError = jest.fn();

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

jest.mock('@/lib/push-notifications', () => ({
  unregisterPushToken: (...a: unknown[]) => mockUnregisterPushToken(...a),
  getCurrentPushToken: () => mockGetCurrentPushToken(),
  setCurrentPushToken: (...a: unknown[]) => mockSetCurrentPushToken(...a),
}));

jest.mock('@/lib/errors', () => ({
  reportError: (...a: unknown[]) => mockReportError(...a),
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
  mockUnregisterPushToken.mockResolvedValue(undefined);
  mockGetCurrentPushToken.mockReturnValue(null);
});

async function mountAndWaitReady() {
  const { qc, wrapper } = makeWrapper();
  const { result } = await renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.initializing).toBe(false));
  return { qc, result };
}

describe('AuthProvider — signOut push token integration', () => {
  it('[PN-AUTH-1] signOut memanggil unregisterPushToken SEBELUM queryClient.clear()', async () => {
    mockGetCurrentPushToken.mockReturnValue('token-abc');
    const { qc, result } = await mountAndWaitReady();
    const callOrder: string[] = [];
    mockUnregisterPushToken.mockImplementation(async () => {
      callOrder.push('unregister');
    });
    jest.spyOn(qc, 'clear').mockImplementation(() => {
      callOrder.push('clear');
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(callOrder).toEqual(expect.arrayContaining(['unregister', 'clear']));
    expect(callOrder.indexOf('unregister')).toBeLessThan(callOrder.indexOf('clear'));
  });

  it('[PN-AUTH-2] unregisterPushToken gagal → signOut tetap berhasil (best-effort)', async () => {
    mockGetCurrentPushToken.mockReturnValue('token-abc');
    mockUnregisterPushToken.mockRejectedValue(new Error('network error'));
    const { qc, result } = await mountAndWaitReady();
    const clearSpy = jest.spyOn(qc, 'clear');

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalled();
  });

  it('[PN-AUTH-3] signOut tanpa token tersimpan → unregisterPushToken TIDAK dipanggil', async () => {
    mockGetCurrentPushToken.mockReturnValue(null);
    await mountAndWaitReady().then(async ({ result }) => {
      await act(async () => {
        await result.current.signOut();
      });
    });

    expect(mockUnregisterPushToken).not.toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('[PN-AUTH-4] session switch: token lama di-unregister dan store di-clear', async () => {
    mockGetCurrentPushToken.mockReturnValue('old-token');
    const { result } = await mountAndWaitReady();

    await act(async () => {
      await result.current.signOut();
    });

    expect(mockUnregisterPushToken).toHaveBeenCalledWith('old-token');
    expect(mockSetCurrentPushToken).toHaveBeenCalledWith(null);
  });

  it('[PN-AUTH-5] signOut urutan: unregister → supabase.auth.signOut → queryClient.clear', async () => {
    mockGetCurrentPushToken.mockReturnValue('token-xyz');
    const { qc, result } = await mountAndWaitReady();
    const callOrder: string[] = [];
    mockUnregisterPushToken.mockImplementation(async () => {
      callOrder.push('unregister');
    });
    mockSignOut.mockImplementation(async () => {
      callOrder.push('supabase-signOut');
      return { error: null };
    });
    jest.spyOn(qc, 'clear').mockImplementation(() => {
      callOrder.push('clear');
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(callOrder).toEqual(['unregister', 'supabase-signOut', 'clear']);
  });
});
