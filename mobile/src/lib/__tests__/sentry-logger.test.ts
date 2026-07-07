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

  it('error dengan objek Error → captureException menerima Error tersanitasi (bukan Error mentah)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    const err = new Error('boom');
    createLogger('ctx').error(err);
    // Kontrak baru: Sentry harus menerima Error instance (untuk grouping) namun BUKAN
    // objek asli — kita bangun ulang dari entry tersanitasi supaya redaksi berlaku.
    expect(client.captureException).toHaveBeenCalledTimes(1);
    const captured = client.captureException.mock.calls[0][0] as Error;
    expect(captured).toBeInstanceOf(Error);
    expect(captured).not.toBe(err);
    expect(captured.message).toBe('boom');
    expect(client.captureMessage).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('error dgn message berisi JWT → captureException menerima message [REDACTED_JWT] (sink Sentry tidak menerima token mentah)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    const err = new Error('auth failed: eyJhbGciOiJIUzI1NiJ9.abcdefghij.signature');
    createLogger('ctx').error(err);
    const captured = client.captureException.mock.calls[0][0] as Error;
    expect(captured.message).toContain('[REDACTED_JWT]');
    expect(captured.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    spy.mockRestore();
  });

  it('error dgn PII karyawan di property enumerable → dihilangkan sebelum sampai ke Sentry', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    const err = new Error('conflict') as Error & { nik?: string; hp?: string };
    err.nik = '3201234567890001';
    err.hp = '081234567890';
    createLogger('ctx').error(err);
    const captured = client.captureException.mock.calls[0][0] as Error &
      Record<string, unknown>;
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain('3201234567890001');
    expect(serialized).not.toContain('081234567890');
    spy.mockRestore();
  });

  it('error dgn stack mengandung email → email disensor pada stack yg diteruskan ke Sentry', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    const err = new Error('bad');
    err.stack = 'Error: bad\n    at fn (user=alice@example.com)';
    createLogger('ctx').error(err);
    const captured = client.captureException.mock.calls[0][0] as Error;
    expect(captured.stack ?? '').not.toContain('alice@example.com');
    expect(captured.stack ?? '').toContain('[REDACTED_EMAIL]');
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

  it('warn dgn string berisi email/JWT → captureMessage menerima string tersanitasi', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    createLogger('ctx').warn(
      'auth retry untuk alice@example.com token eyJhbGciOiJIUzI1NiJ9.aaaaaaaaaa.bbb',
    );
    const [msg] = client.captureMessage.mock.calls[0];
    expect(msg).not.toContain('alice@example.com');
    expect(msg).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(msg).toContain('[REDACTED_EMAIL]');
    expect(msg).toContain('[REDACTED_JWT]');
    spy.mockRestore();
  });

  it('warn dgn object payload berisi kunci PII → key disensor sebelum diserialisasi ke Sentry', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const client = fakeClient();
    addTransport(createSentryTransport(client));
    createLogger('ctx').warn({ nik: '3201234567890001', address: 'Jl. Merdeka 1' });
    const [msg] = client.captureMessage.mock.calls[0];
    expect(msg).not.toContain('3201234567890001');
    expect(msg).not.toContain('Jl. Merdeka 1');
    expect(msg).toContain('[REDACTED]');
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
