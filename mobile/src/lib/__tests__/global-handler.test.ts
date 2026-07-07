// Item — global handler untuk uncaught error di luar React tree (async yang tak di-catch,
// promise rejection tanpa handler). ErrorBoundary hanya menangkap crash render; tanpa ini
// error itu senyap di produksi. Diuji lewat ErrorUtils palsu (injectable) agar pure.
import { consoleLogger, setLogger } from '../logger';
import { installGlobalErrorHandler } from '../global-handler';

type Handler = (error: unknown, isFatal?: boolean) => void;

function fakeErrorUtils() {
  let current: Handler | undefined;
  return {
    getGlobalHandler: jest.fn(() => current),
    setGlobalHandler: jest.fn((h: Handler) => {
      current = h;
    }),
    // helper: trigger sebuah error untuk assert routing ke handler baru
    _trigger: (err: unknown, isFatal?: boolean) => current?.(err, isFatal),
  };
}

describe('installGlobalErrorHandler', () => {
  afterEach(() => setLogger(consoleLogger));

  it('tidak melempar bila ErrorUtils absent (aman di test/web)', () => {
    expect(() => installGlobalErrorHandler(undefined)).not.toThrow();
  });

  it('meneruskan uncaught error ke logger aktif (choke point telemetry)', () => {
    const active = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    setLogger(active);
    const eu = fakeErrorUtils();
    installGlobalErrorHandler(eu);
    const err = new Error('uncaught');
    eu._trigger(err, false);
    expect(active.error).toHaveBeenCalled();
    // objek error asli utuh (bukan hanya string) → stack tetap sampai telemetry
    expect(active.error.mock.calls[0]).toContain(err);
  });

  it('menandai isFatal saat error fatal (info berguna untuk telemetry)', () => {
    const active = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    setLogger(active);
    const eu = fakeErrorUtils();
    installGlobalErrorHandler(eu);
    eu._trigger(new Error('boom'), true);
    // salah satu argumen memuat penanda isFatal (bentuknya bebas: string/obj)
    const argsFlat = active.error.mock.calls[0].map((a: unknown) => JSON.stringify(a)).join(' ');
    expect(argsFlat).toMatch(/isFatal/i);
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
    const prev = jest.fn();
    const eu = fakeErrorUtils();
    eu.setGlobalHandler(prev);
    const dispose = installGlobalErrorHandler(eu);
    dispose();
    // handler aktif kembali ke prev — tak lagi mem-forward ke logger
    const active = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    setLogger(active);
    eu._trigger(new Error('after-dispose'), false);
    expect(prev).toHaveBeenCalledTimes(1);
    expect(active.error).not.toHaveBeenCalled();
  });
});
