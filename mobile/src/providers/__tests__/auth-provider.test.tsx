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
const mockSetSentryUser = jest.fn();

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

// env.supabaseUrl needs to match the `iss` in test JWTs so
// isRecoveryTokenForProject accepts them.
jest.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'anon' } }));

// S5-6 — auth-provider hooks Sentry setUser on session change. Mock so tests
// verify the CALL contract (id-only, non-PII) without needing the SDK.
jest.mock('@/lib/sentry-init', () => ({
  setSentryUser: (...a: unknown[]) => mockSetSentryUser(...a),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the imports it mocks
import { AuthProvider, useAuth } from '../auth-provider';

// Build a JWT whose `iss` origin matches the mocked env.supabaseUrl. Signature
// is ignored — the app only checks structural claims before calling setSession.
function recoveryJwt(overrides: Record<string, unknown> = {}): string {
  const enc = (obj: unknown) => {
    const b64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const payload = { iss: 'https://abc.supabase.co/auth/v1', sub: 'u1', ...overrides };
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.sig`;
}

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
    const jwt = recoveryJwt();
    mockGetInitialURL.mockResolvedValueOnce(
      `ems://reset-password#access_token=${jwt}&refresh_token=rrr&type=recovery`,
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledTimes(1));
    expect(mockSetSession.mock.calls[0][0]).toEqual({
      access_token: jwt,
      refresh_token: 'rrr',
    });
    // S2-6: isRecovering is raised BEFORE setSession so the SIGNED_IN event
    // that follows does not redirect the user into (app).
    expect(result.current.isRecovering).toBe(true);
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
    const jwt = recoveryJwt();
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));

    await act(async () => {
      urlListener?.({
        url: `ems://reset-password#access_token=${jwt}&refresh_token=yyy&type=recovery`,
      });
    });
    await waitFor(() => expect(mockSetSession).toHaveBeenCalledTimes(1));
    expect(mockSetSession.mock.calls[0][0]).toEqual({
      access_token: jwt,
      refresh_token: 'yyy',
    });
  });

  // S2-6 new coverage: cross-project token substitution attack rejected.
  it('[H-RESET-7] token dengan iss project lain → TIDAK panggil setSession', async () => {
    const foreignJwt = recoveryJwt({ iss: 'https://attacker.supabase.co/auth/v1' });
    mockGetInitialURL.mockResolvedValueOnce(
      `ems://reset-password#access_token=${foreignJwt}&refresh_token=rrr&type=recovery`,
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(result.current.isRecovering).toBe(false);
  });

  // S2-6 new coverage: replayed recovery link on an already-active session
  // must force sign-out and NOT call setSession — the session-fixation vector.
  it('[H-RESET-8] recovery link datang saat sesi aktif → signOut dipanggil, setSession tidak', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } } });
    let urlListener: ((e: { url: string }) => void) | null = null;
    mockAddEventListener.mockImplementationOnce((event: string, cb: typeof urlListener) => {
      if (event === 'url') urlListener = cb;
      return { remove: mockLinkingRemove };
    });
    const jwt = recoveryJwt();
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      urlListener?.({
        url: `ems://reset-password#access_token=${jwt}&refresh_token=rrr&type=recovery`,
      });
    });

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockSetSession).not.toHaveBeenCalled();
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

  // S5-6 — Sentry user tag mengikuti session user id (Supabase UUID, non-PII).
  // Reset (setSentryUser(null)) saat sign-out agar event pasca-logout tidak
  // masih ter-tag ke user lama.
  it('[S5-6-1] session dgn user.id → setSentryUser({id}) dipanggil (tanpa email/nama)', async () => {
    const session = { user: { id: 'user-uuid-1' } };
    mockGetSession.mockResolvedValueOnce({ data: { session } });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await waitFor(() => expect(mockSetSentryUser).toHaveBeenCalledWith({ id: 'user-uuid-1' }));
    // Regression pin: TIDAK boleh diteruskan properti PII apa pun.
    const calls = mockSetSentryUser.mock.calls;
    const identityCalls = calls.filter((c) => c[0] && typeof c[0] === 'object');
    for (const c of identityCalls) {
      expect(c[0]).not.toHaveProperty('email');
      expect(c[0]).not.toHaveProperty('username');
    }
  });

  it('[S5-6-2] signOut → setSentryUser(null) dipanggil (clear tag pasca-logout)', async () => {
    const session = { user: { id: 'user-uuid-2' } };
    mockGetSession.mockResolvedValueOnce({ data: { session } });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await waitFor(() => expect(mockSetSentryUser).toHaveBeenCalledWith({ id: 'user-uuid-2' }));
    // Simulate the SIGNED_OUT event from supabase → session becomes null.
    const authCb = mockOnAuthStateChange.mock.calls[0][0] as (
      ev: string,
      s: unknown,
    ) => void;
    await act(async () => {
      authCb('SIGNED_OUT', null);
    });
    await waitFor(() => expect(mockSetSentryUser).toHaveBeenCalledWith(null));
  });

  // AC-14 regression pin (Wave 5.2, spec settings-consumers §5.1):
  // queryClient.clear() must also evict ['card-rules', ...] entries to prevent
  // cross-org contamination when a multi-org user signs out + signs in as another org.
  // If a future refactor drops .clear() or narrows it, this test tersandung.
  it('[AC-14] card-rules cache dihapus di signOut (cross-org contamination guard)', async () => {
    const { qc, wrapper } = makeWrapper();
    qc.setQueryData(['card-rules', 'completion', 'org-A', 'goal'], { requiredFields: ['reason'] });
    qc.setQueryData(['card-rules', 'guidance', 'org-A', 'initiative'], { title: 't', body: 'b' });
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(qc.getQueryData(['card-rules', 'completion', 'org-A', 'goal'])).toBeUndefined();
    expect(qc.getQueryData(['card-rules', 'guidance', 'org-A', 'initiative'])).toBeUndefined();
  });
});
