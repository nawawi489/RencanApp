// Kunci wiring supabase.ts terhadap resolveSupabaseUrl agar bug CFG-01 tidak diam-diam
// terbuka lagi bila developer mengganti argumen createClient balik ke env.supabaseUrl mentah.
// Unit test resolveSupabaseUrl saja tidak menangkap kelalaian wiring ini (per critic).
//
// Ref: docs/spec-ui-testfix-2026-07-05.md AC-CFG01-1..2 (integrasi wiring)

const mockCreateClient = jest.fn((..._args: unknown[]) => ({
  auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() },
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  Platform: { OS: 'web' },
}));

jest.mock('react-native-url-polyfill/auto', () => ({}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('supabase wiring (AC-CFG01-1..2 integrasi)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    mockCreateClient.mockClear();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('[1] Platform web + env 127.0.0.1 → createClient dipanggil dengan localhost (bukan env mentah)', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';

    jest.isolateModules(() => {
      require('../supabase');
    });

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const call = mockCreateClient.mock.calls[0];
    expect(call[0]).toBe('http://localhost:54321');
    expect(call[1]).toBe('anon-test');
  });

  it('[3] global.fetch di-wire dengan wrapper timeout (AbortController), meng-clear timer saat selesai', async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';

    const underlyingFetch = jest.fn().mockResolvedValue({ ok: true });
    const originalFetch = global.fetch;
    (global as { fetch: unknown }).fetch = underlyingFetch;
    const clearSpy = jest.spyOn(global, 'clearTimeout');

    try {
      jest.isolateModules(() => {
        require('../supabase');
      });

      const options = mockCreateClient.mock.calls[0][2] as { global?: { fetch?: typeof fetch } };
      const wrappedFetch = options?.global?.fetch;
      expect(typeof wrappedFetch).toBe('function');

      await wrappedFetch!('http://127.0.0.1:54321/rest/v1/x');

      // Meneruskan ke fetch underlying dengan signal AbortController.
      expect(underlyingFetch).toHaveBeenCalledTimes(1);
      const passedInit = underlyingFetch.mock.calls[0][1] as RequestInit;
      expect(passedInit.signal).toBeInstanceOf(AbortSignal);
      // Timer dibersihkan setelah request selesai (tidak bocor).
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      (global as { fetch: unknown }).fetch = originalFetch;
    }
  });

  it('[4] wrapper meng-abort request saat REQUEST_TIMEOUT_MS terlewati', async () => {
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';

    let capturedSignal: AbortSignal | undefined;
    const underlyingFetch = jest.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<never>((_resolve, reject) => {
          capturedSignal = init?.signal ?? undefined;
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const originalFetch = global.fetch;
    (global as { fetch: unknown }).fetch = underlyingFetch;

    try {
      jest.isolateModules(() => {
        require('../supabase');
      });
      const options = mockCreateClient.mock.calls[0][2] as { global?: { fetch?: typeof fetch } };
      const wrappedFetch = options!.global!.fetch!;

      const promise = wrappedFetch('http://127.0.0.1:54321/rest/v1/x');
      const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });

      expect(capturedSignal?.aborted).toBe(false);
      jest.advanceTimersByTime(20_000);
      expect(capturedSignal?.aborted).toBe(true);

      await assertion;
    } finally {
      (global as { fetch: unknown }).fetch = originalFetch;
      jest.useRealTimers();
    }
  });

  it('[2] Platform native (ios) → storage adalah secureStorage (SecureStore), bukan AsyncStorage langsung', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';

    const SecureStoreMock = {
      getItemAsync: jest.fn().mockResolvedValue(null),
      setItemAsync: jest.fn().mockResolvedValue(undefined),
      deleteItemAsync: jest.fn().mockResolvedValue(undefined),
    };

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
        AppState: { addEventListener: jest.fn() },
        Platform: { OS: 'ios' },
      }));
      jest.doMock('expo-secure-store', () => SecureStoreMock);
      require('../supabase');
    });

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const options = mockCreateClient.mock.calls[0][2] as { auth: { storage: { getItem: (k: string) => unknown; setItem: (k: string, v: string) => unknown; removeItem: (k: string) => unknown } } };
    const storage = options?.auth?.storage;

    storage.getItem('k');
    expect(SecureStoreMock.getItemAsync).toHaveBeenCalledWith('k');
    storage.setItem('k', 'v');
    expect(SecureStoreMock.setItemAsync).toHaveBeenCalledWith('k', 'v');
    storage.removeItem('k');
    expect(SecureStoreMock.deleteItemAsync).toHaveBeenCalledWith('k');
  });
});
