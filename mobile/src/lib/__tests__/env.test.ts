// Kunci perilaku guard env.ts (throw saat variabel wajib kosong) sebagai regression net
// SEBELUM CFG-01 menyentuh supabase.ts. env.ts adalah pure module yang throw di module
// load, jadi kita re-require via jest.isolateModules dengan env yang dimanipulasi.
// Referensi: docs/spec-ui-testfix-2026-07-05.md AC-CFG01-3.

describe('env guard (AC-CFG01-3)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('[1] throw saat EXPO_PUBLIC_SUPABASE_URL kosong', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('[2] throw saat EXPO_PUBLIC_SUPABASE_ANON_KEY kosong', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('[3] tidak throw saat kedua variabel diisi', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    expect(() =>
      jest.isolateModules(() => {
        const mod = require('../env');
        expect(mod.env.supabaseUrl).toBe('http://localhost:54321');
        expect(mod.env.supabaseAnonKey).toBe('anon-test');
      }),
    ).not.toThrow();
  });
});
