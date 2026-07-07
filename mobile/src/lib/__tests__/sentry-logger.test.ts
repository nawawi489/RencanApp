// Item 4 — adapter Sentry untuk seam logger. STUB: tidak menautkan @sentry/react-native (butuh
// dep + DSN). Diuji lewat client palsu agar membuktikan routing tanpa memanggil Sentry nyata.
import { getLogger, setLogger, consoleLogger } from '../logger';
import { createSentryLogger, noopSentryClient, type SentryClient } from '../sentry-logger';

function fakeClient(): SentryClient & {
  captureException: jest.Mock;
  captureMessage: jest.Mock;
} {
  return { captureException: jest.fn(), captureMessage: jest.fn() };
}

describe('createSentryLogger', () => {
  let consoleErr: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;
  beforeEach(() => {
    consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErr.mockRestore();
    consoleWarn.mockRestore();
    setLogger(consoleLogger);
  });

  it('memenuhi bentuk Logger (error/warn/log)', () => {
    const logger = createSentryLogger(fakeClient());
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.log).toBe('function');
  });

  it('error dengan objek Error → captureException(err)', () => {
    const client = fakeClient();
    const logger = createSentryLogger(client);
    const err = new Error('boom');
    logger.error('[ctx]', err);
    expect(client.captureException).toHaveBeenCalledWith(err);
    expect(client.captureMessage).not.toHaveBeenCalled();
  });

  it('error tanpa objek Error → captureMessage(level error)', () => {
    const client = fakeClient();
    const logger = createSentryLogger(client);
    logger.error('[ctx]', 'kegagalan tanpa Error');
    expect(client.captureMessage).toHaveBeenCalledWith(expect.stringContaining('kegagalan tanpa Error'), 'error');
    expect(client.captureException).not.toHaveBeenCalled();
  });

  it('warn → captureMessage(level warning)', () => {
    const client = fakeClient();
    createSentryLogger(client).warn('hati-hati');
    expect(client.captureMessage).toHaveBeenCalledWith(expect.stringContaining('hati-hati'), 'warning');
  });

  it('tetap menulis ke console agar dev build tetap melihat', () => {
    createSentryLogger(fakeClient()).error('[ctx]', new Error('boom'));
    expect(consoleErr).toHaveBeenCalled();
  });

  it('melengkapi seam: setLogger(createSentryLogger(client)) merutekan error aplikasi ke Sentry', () => {
    const client = fakeClient();
    setLogger(createSentryLogger(client));
    const err = new Error('dari alertFriendlyError');
    getLogger().error('[Gagal]', err);
    expect(client.captureException).toHaveBeenCalledWith(err);
  });
});

describe('noopSentryClient (placeholder pra-SDK)', () => {
  it('tidak melempar saat dipanggil', () => {
    expect(() => {
      noopSentryClient.captureException(new Error('x'));
      noopSentryClient.captureMessage('y', 'error');
    }).not.toThrow();
  });
});
