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

  // Guard variabel shell tak terekspansi. Regresi NYATA: blok `environment:` CircleCI tidak
  // menginterpolasi `$VAR`, jadi bundel staging membawa teks `$STAGING_SUPABASE_URL`. Nilai itu
  // lolos check kosong DAN check placeholder, lalu app merender putih tanpa error konsol —
  // mati diam-diam sejak 2026-07-21 melewati 56 commit.
  it('[8] throw saat URL berisi variabel shell tak terekspansi ($STAGING_SUPABASE_URL)', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '$STAGING_SUPABASE_URL';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/tidak terekspansi/i);
  });

  it('[9] throw saat anon key memakai bentuk kurung kurawal (${VAR})', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://real-project-ref.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '${STAGING_SUPABASE_ANON_KEY}';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/tidak terekspansi/i);
  });

  // Jaring terakhir untuk bentuk yang tak dikenal kedua guard di atas.
  it('[10] throw saat URL bukan URL http(s) yang valid', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'bukan-sebuah-url';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/bukan URL http\(s\) yang valid/i);
  });

  it('[11] throw saat URL memakai skema non-http (mis. ftp)', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'ftp://project-ref.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon-test';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).toThrow(/bukan URL http\(s\) yang valid/i);
  });

  // Anon key BUKAN URL — guard URL tidak boleh merembet ke sana dan memblokir nilai sah.
  it('[12] anon key bebas-bentuk tetap diterima (guard URL tidak merembet)', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://real-project-ref.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_abc.def-123_XYZ';
    expect(() =>
      jest.isolateModules(() => {
        require('../env');
      }),
    ).not.toThrow();
  });
});
