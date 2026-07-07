// Item 4 — abstraksi logger injectable sebagai choke point telemetry (Sentry di-swap di sini).
// SDK Sentry nyata TIDAK diuji; hanya kontrak abstraksi + kemampuan swap.
import { consoleLogger, getLogger, setLogger } from '../logger';

describe('logger', () => {
  afterEach(() => {
    setLogger(consoleLogger); // restore default
    jest.restoreAllMocks();
  });

  it('default logger meneruskan error ke console.error', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    getLogger().error('[ctx]', err);
    expect(spy).toHaveBeenCalledWith('[ctx]', err);
  });

  it('setLogger menukar impl aktif (mis. kanal Sentry) tanpa memanggil console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const custom = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    setLogger(custom);
    const err = new Error('boom');
    getLogger().error('[ctx]', err);
    expect(custom.error).toHaveBeenCalledWith('[ctx]', err);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
