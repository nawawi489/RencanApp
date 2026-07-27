import { _resetForTest, createLogger, getTransports } from '../logger';
import { _resetSentryForTest, initSentry, setSentryUser, type InjectableSentry } from '../sentry-init';

function mockSentry(): InjectableSentry & {
  init: jest.Mock;
  captureException: jest.Mock;
  captureMessage: jest.Mock;
  setUser: jest.Mock;
} {
  return {
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
  };
}

afterEach(() => {
  _resetForTest();
  _resetSentryForTest();
});

describe('initSentry', () => {
  it('mengembalikan null (no-op) bila EXPO_PUBLIC_SENTRY_DSN tidak di-set', () => {
    const sentry = mockSentry();
    const result = initSentry({ env: {}, sentry });
    expect(result).toBeNull();
    expect(sentry.init).not.toHaveBeenCalled();
    expect(getTransports().some((t) => t.name === 'sentry')).toBe(false);
  });

  it('memanggil Sentry.init dgn DSN & mendaftarkan sentry transport', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sentry = mockSentry();
    const result = initSentry({
      env: { EXPO_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1' },
      sentry,
    });
    expect(result).toBe(sentry);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.dsn).toBe('https://key@o1.ingest.sentry.io/1');
    expect(getTransports().some((t) => t.name === 'sentry')).toBe(true);

    const err = new Error('boom');
    createLogger('ctx').error(err);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const captured = sentry.captureException.mock.calls[0][0] as Error;
    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe('boom');
    spy.mockRestore();
  });

  it('menonaktifkan sendDefaultPii eksplisit (defense-in-depth, IP/cookie tidak dikirim)', () => {
    const sentry = mockSentry();
    initSentry({ env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' }, sentry });
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.sendDefaultPii).toBe(false);
  });

  it('memasang beforeSend hook (defense-in-depth scrub event sebelum kirim ke Sentry)', () => {
    const sentry = mockSentry();
    initSentry({ env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' }, sentry });
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof opts.beforeSend).toBe('function');
  });

  it('beforeSend menyensor JWT/email di exception message', () => {
    const sentry = mockSentry();
    initSentry({ env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' }, sentry });
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    const beforeSend = opts.beforeSend as (e: Record<string, unknown>) => Record<string, unknown>;
    const event = {
      message: 'user alice@example.com',
      exception: {
        values: [{ value: 'token eyJhbGciOiJIUzI1NiJ9.aaaaaaaaaa.bbb dipakai' }],
      },
      extra: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.aaaaaaaaaa.bbb' },
    };
    const scrubbed = beforeSend(event) as {
      message: string;
      exception: { values: { value: string }[] };
      extra: { authorization: string };
    };
    expect(scrubbed.message).toContain('[REDACTED_EMAIL]');
    expect(scrubbed.exception.values[0].value).toContain('[REDACTED_JWT]');
    expect(scrubbed.extra.authorization).toBe('[REDACTED]');
  });

  it('beforeSend tetap mengembalikan event (bukan null) agar Sentry tidak drop silent', () => {
    const sentry = mockSentry();
    initSentry({ env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' }, sentry });
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    const beforeSend = opts.beforeSend as (e: Record<string, unknown>) => Record<string, unknown> | null;
    const result = beforeSend({ message: 'ok' });
    expect(result).not.toBeNull();
  });

  it('memakai environment dari EXPO_PUBLIC_APP_ENV bila diset', () => {
    const sentry = mockSentry();
    initSentry({
      env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1', EXPO_PUBLIC_APP_ENV: 'staging' },
      sentry,
    });
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.environment).toBe('staging');
  });

  it('memakai sampling konservatif di produksi (tracesSampleRate < 1)', () => {
    const sentry = mockSentry();
    initSentry({
      env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1', EXPO_PUBLIC_APP_ENV: 'production' },
      sentry,
    });
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof opts.tracesSampleRate).toBe('number');
    expect(opts.tracesSampleRate).toBeGreaterThan(0);
    expect(opts.tracesSampleRate).toBeLessThan(1);
  });

  describe('sampling rate override via env', () => {
    it('EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE valid → dipakai apa adanya (menang atas default)', () => {
      const sentry = mockSentry();
      initSentry({
        env: {
          EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1',
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0.5',
        },
        sentry,
      });
      const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
      expect(opts.tracesSampleRate).toBe(0.5);
    });

    it('EXPO_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE valid → dipakai apa adanya', () => {
      const sentry = mockSentry();
      initSentry({
        env: {
          EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1',
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE: '0',
        },
        sentry,
      });
      const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
      expect(opts.profilesSampleRate).toBe(0);
    });

    it.each([
      ['NaN', 'not-a-number'],
      ['negatif', '-0.1'],
      ['di atas 1', '1.5'],
      ['string kosong', ''],
    ])('nilai INVALID (%s) → fallback ke default produksi (tidak crash)', (_label, raw) => {
      const sentry = mockSentry();
      initSentry({
        env: {
          EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1',
          EXPO_PUBLIC_APP_ENV: 'production',
          EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: raw,
        },
        sentry,
      });
      const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
      expect(typeof opts.tracesSampleRate).toBe('number');
      expect(opts.tracesSampleRate).toBeGreaterThan(0);
      expect(opts.tracesSampleRate).toBeLessThan(1);
    });

    it('override berlaku juga di development (mis. 0 untuk mematikan tracing lokal)', () => {
      const sentry = mockSentry();
      initSentry({
        env: {
          EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1',
          EXPO_PUBLIC_APP_ENV: 'development',
          EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0',
        },
        sentry,
      });
      const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
      expect(opts.tracesSampleRate).toBe(0);
    });
  });

  // S5-6 — release + dist tag menempatkan event Sentry di build tertentu; sourcemap
  // yang di-upload workflow dicocokkan pada nilai `release`.
  describe('release + dist tag (S5-6)', () => {
    it('EXPO_PUBLIC_SENTRY_RELEASE + _DIST diset → diteruskan ke Sentry.init', () => {
      const sentry = mockSentry();
      initSentry({
        env: {
          EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1',
          EXPO_PUBLIC_SENTRY_RELEASE: 'abc123',
          EXPO_PUBLIC_SENTRY_DIST: '42',
        },
        sentry,
      });
      const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
      expect(opts.release).toBe('abc123');
      expect(opts.dist).toBe('42');
    });

    it('tanpa release env → key `release` TIDAK dikirim (SDK pakai default plugin)', () => {
      const sentry = mockSentry();
      initSentry({
        env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' },
        sentry,
      });
      const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
      expect('release' in opts).toBe(false);
      expect('dist' in opts).toBe(false);
    });

    it('release/dist BLANK string diperlakukan sbg tak-diset (bukan literal "")', () => {
      const sentry = mockSentry();
      initSentry({
        env: {
          EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1',
          EXPO_PUBLIC_SENTRY_RELEASE: '   ',
          EXPO_PUBLIC_SENTRY_DIST: '',
        },
        sentry,
      });
      const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
      expect('release' in opts).toBe(false);
      expect('dist' in opts).toBe(false);
    });
  });

  // S5-6 — Sentry.setUser hanya boleh menerima id (Supabase auth user_id UUID);
  // email/nama TIDAK boleh diteruskan.
  describe('setSentryUser (S5-6)', () => {
    it('no-op sebelum init: TIDAK memanggil Sentry.setUser', () => {
      const sentry = mockSentry();
      setSentryUser({ id: 'u1' });
      expect(sentry.setUser).not.toHaveBeenCalled();
    });

    it('setelah init: setSentryUser({id}) → sentry.setUser({id}) tanpa email/nama', () => {
      const sentry = mockSentry();
      initSentry({ env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' }, sentry });
      setSentryUser({ id: 'user-uuid-42' });
      expect(sentry.setUser).toHaveBeenCalledTimes(1);
      const arg = sentry.setUser.mock.calls[0][0] as Record<string, unknown> | null;
      expect(arg).toEqual({ id: 'user-uuid-42' });
      // Regression pin: TIDAK boleh ada email/nama key
      expect(arg).not.toHaveProperty('email');
      expect(arg).not.toHaveProperty('username');
      expect(arg).not.toHaveProperty('name');
    });

    it('setSentryUser(null) → sentry.setUser(null) untuk clear di sign-out', () => {
      const sentry = mockSentry();
      initSentry({ env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' }, sentry });
      setSentryUser(null);
      expect(sentry.setUser).toHaveBeenCalledWith(null);
    });

    it('init gagal (dsn malformed → throw) → setSentryUser tetap no-op (bukan crash)', () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const sentry = mockSentry();
      sentry.init.mockImplementationOnce(() => {
        throw new Error('bad dsn');
      });
      initSentry({ env: { EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1' }, sentry });
      expect(() => setSentryUser({ id: 'u1' })).not.toThrow();
      expect(sentry.setUser).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
