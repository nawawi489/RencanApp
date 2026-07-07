import { _resetForTest, addTransport, createLogger, removeTransport } from '../logger';
import { createSentryTransport, noopSentryClient, type SentryClient } from '../sentry-logger';

function fakeClient(): SentryClient & {
  captureException: jest.Mock;
  captureMessage: jest.Mock;
} {
  return { captureException: jest.fn(), captureMessage: jest.fn() };
}

afterEach(() => _resetForTest());

describe('createSentryTransport', () => {
  it('memenuhi bentuk LogTransport (name + write)', () => {
    const t = createSentryTransport(fakeClient());
    expect(t.name).toBe('sentry');
    expect(typeof t.write).toBe('function');
  });

  it('error dengan objek Error → captureException(err)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    const err = new Error('boom');
    createLogger('ctx').error(err);
    expect(client.captureException).toHaveBeenCalledWith(err);
    expect(client.captureMessage).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('error tanpa objek Error → captureMessage(level error)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    createLogger('ctx').error('kegagalan tanpa Error');
    expect(client.captureMessage).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(client.captureException).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('warn → captureMessage(level warning)', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    createLogger('ctx').warn('hati-hati');
    expect(client.captureMessage).toHaveBeenCalledWith(expect.any(String), 'warning');
    spy.mockRestore();
  });

  it('info/debug tidak mengirim ke Sentry (hanya console)', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    createLogger('ctx').info('biasa');
    createLogger('ctx').debug('detail');
    expect(client.captureException).not.toHaveBeenCalled();
    expect(client.captureMessage).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('berjalan berdampingan dengan console transport (broadcast ke semua)', () => {
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    const err = new Error('boom');
    createLogger('ctx').error(err);
    expect(client.captureException).toHaveBeenCalledWith(err);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(parsed.namespace).toBe('ctx');
    errSpy.mockRestore();
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
