// Wire Sentry ke seam logger. DSN dari env (EXPO_PUBLIC_SENTRY_DSN) — bila kosong,
// aplikasi tetap boot dgn console logger (default). SDK diinjeksi (bukan di-require
// langsung) agar unit test tak menyeret native module & Metro tak perlu resolusi.
import { consoleLogger, getLogger, setLogger } from '../logger';
import { initSentry, type InjectableSentry } from '../sentry-init';

function mockSentry(): InjectableSentry & { init: jest.Mock } {
  return {
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  };
}

describe('initSentry', () => {
  afterEach(() => setLogger(consoleLogger));

  it('mengembalikan null (no-op) bila EXPO_PUBLIC_SENTRY_DSN tidak di-set', () => {
    const sentry = mockSentry();
    const result = initSentry({ env: {}, sentry });
    expect(result).toBeNull();
    expect(sentry.init).not.toHaveBeenCalled();
    // Logger aktif tetap console (tak diganti).
    expect(getLogger()).toBe(consoleLogger);
  });

  it('memanggil Sentry.init dgn DSN dari env & menukar logger aktif ke Sentry', () => {
    const sentry = mockSentry();
    const result = initSentry({
      env: { EXPO_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1' },
      sentry,
    });
    expect(result).toBe(sentry);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    const opts = sentry.init.mock.calls[0][0] as Record<string, unknown>;
    expect(opts.dsn).toBe('https://key@o1.ingest.sentry.io/1');
    // Logger aktif sekarang meneruskan ke Sentry (getLogger !== consoleLogger).
    expect(getLogger()).not.toBe(consoleLogger);
    // Bukti fungsional: getLogger().error meneruskan Error ke sentry.captureException.
    const err = new Error('boom');
    getLogger().error('[ctx]', err);
    expect(sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('memakai environment dari EXPO_PUBLIC_APP_ENV bila diset', () => {
    const sentry = mockSentry();
    initSentry({
      env: {
        EXPO_PUBLIC_SENTRY_DSN: 'https://k@s.io/1',
        EXPO_PUBLIC_APP_ENV: 'staging',
      },
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
    // Nilai boleh berubah — invarian: tak boleh 100% di produksi (biaya + noise).
    expect(typeof opts.tracesSampleRate).toBe('number');
    expect(opts.tracesSampleRate).toBeGreaterThan(0);
    expect(opts.tracesSampleRate).toBeLessThan(1);
  });
});
