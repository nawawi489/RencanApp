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
});
