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

  // Guard placeholder (P3-F): nilai template lolos check "kosong" tapi menunjuk host fiktif.
  it('[4] throw saat URL masih placeholder REPLACE (profil production eas.json belum di-wire)', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://REPLACE-prod-project-ref.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/placeholder/i);
  });

  it('[5] throw saat anon key masih placeholder REPLACE', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://real-project-ref.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'REPLACE_PROD_ANON_KEY';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/placeholder/i);
  });

  it('[6] throw saat URL masih memakai angle-bracket template <prod-project-ref>', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://<prod-project-ref>.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/placeholder/i);
  });

  it('[7] tidak throw untuk nilai staging asli (sb_publishable_ + host nyata)', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://staging-project-ref-fixture.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_fixture_value_for_env_test_only';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).not.toThrow();
  });
});
