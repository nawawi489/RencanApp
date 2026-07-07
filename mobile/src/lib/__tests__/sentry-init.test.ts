import { _resetForTest, createLogger, getTransports } from '../logger';
import { initSentry, type InjectableSentry } from '../sentry-init';

function mockSentry(): InjectableSentry & { init: jest.Mock } {
  return {
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  };
}

afterEach(() => _resetForTest());

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
    expect(sentry.captureException).toHaveBeenCalledWith(err);
    spy.mockRestore();
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
});
