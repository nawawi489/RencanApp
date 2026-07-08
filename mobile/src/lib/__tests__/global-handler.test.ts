import { _resetForTest, addTransport, type LogTransport } from '../logger';
import { installGlobalErrorHandler } from '../global-handler';

type Handler = (error: unknown, isFatal?: boolean) => void;

function fakeErrorUtils() {
  let current: Handler | undefined;
  return {
    getGlobalHandler: jest.fn(() => current),
    setGlobalHandler: jest.fn((h: Handler) => {
      current = h;
    }),
    _trigger: (err: unknown, isFatal?: boolean) => current?.(err, isFatal),
  };
}

function mockTransport(): LogTransport & { write: jest.Mock } {
  return { name: 'mock', write: jest.fn() };
}

afterEach(() => _resetForTest());

describe('installGlobalErrorHandler', () => {
  it('tidak melempar bila ErrorUtils absent (aman di test/web)', () => {
    expect(() => installGlobalErrorHandler(undefined)).not.toThrow();
  });

  it('meneruskan uncaught error ke transport (choke point telemetry)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const eu = fakeErrorUtils();
    installGlobalErrorHandler(eu);
    const err = new Error('uncaught');
    eu._trigger(err, false);
    expect(t.write).toHaveBeenCalled();
    expect(t.write.mock.calls[0][0].namespace).toBe('GlobalHandler');
    const rawArgs = t.write.mock.calls[0][1] as unknown[];
    expect(rawArgs).toContain(err);
    spy.mockRestore();
  });

  it('menandai isFatal saat error fatal (info berguna untuk telemetry)', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const t = mockTransport();
    addTransport(t);
    const eu = fakeErrorUtils();
    installGlobalErrorHandler(eu);
    eu._trigger(new Error('boom'), true);
    const entry = t.write.mock.calls[0][0];
    expect(JSON.stringify(entry)).toMatch(/isFatal/i);
    spy.mockRestore();
  });

  it('memanggil handler sebelumnya (chain, agar RN LogBox default tetap jalan di dev)', () => {
    const prev = jest.fn();
    const eu = fakeErrorUtils();
    eu.setGlobalHandler(prev);
    installGlobalErrorHandler(eu);
    const err = new Error('boom');
    eu._trigger(err, false);
    expect(prev).toHaveBeenCalledWith(err, false);
  });

  it('mengembalikan disposer yang memulihkan handler sebelumnya', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const prev = jest.fn();
    const eu = fakeErrorUtils();
    eu.setGlobalHandler(prev);
    const dispose = installGlobalErrorHandler(eu);
    dispose();
    const t = mockTransport();
    addTransport(t);
    eu._trigger(new Error('after-dispose'), false);
    expect(prev).toHaveBeenCalledTimes(1);
    expect(t.write).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
