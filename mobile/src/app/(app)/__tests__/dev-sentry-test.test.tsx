// Smoke test route untuk verifikasi wire Sentry end-to-end. Hanya boleh muncul
// di build non-production; kalau bocor ke prod, tombol tetap disembunyikan.
import { fireEvent, render, screen } from '@testing-library/react-native';

import DevSentryTest from '../dev-sentry-test';
import { _resetForTest, addTransport, type LogTransport } from '@/lib/logger';

function mockTransport(): LogTransport & { write: jest.Mock } {
  return { name: 'mock', write: jest.fn() };
}

const ORIGINAL_APP_ENV = process.env.EXPO_PUBLIactionPlanP_ENV;

afterEach(() => {
  _resetForTest();
  process.env.EXPO_PUBLIactionPlanP_ENV = ORIGINAL_APP_ENV;
});

describe('DevSentryTest — smoke test route', () => {
  it('MENYEMBUNYIKAN tombol di production (safety guard)', async () => {
    process.env.EXPO_PUBLIactionPlanP_ENV = 'production';
    await render(<DevSentryTest />);
    expect(screen.queryByRole('button', { name: 'Trigger sync error' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trigger async error' })).toBeNull();
    expect(screen.getByText(/tidak tersedia/i)).toBeTruthy();
  });

  it('menampilkan 2 tombol di non-production (staging/dev)', async () => {
    process.env.EXPO_PUBLIactionPlanP_ENV = 'staging';
    await render(<DevSentryTest />);
    expect(screen.getByRole('button', { name: 'Trigger sync error' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trigger async error' })).toBeTruthy();
  });

  it('tombol sync error meneruskan Error ke logger transport (namespace DevSmokeTest)', async () => {
    process.env.EXPO_PUBLIactionPlanP_ENV = 'staging';
    const t = mockTransport();
    addTransport(t);
    await render(<DevSentryTest />);
    fireEvent.press(screen.getByRole('button', { name: 'Trigger sync error' }));
    expect(t.write).toHaveBeenCalled();
    const entry = t.write.mock.calls[0][0];
    expect(entry.namespace).toBe('DevSmokeTest');
    expect(entry.level).toBe('error');
    const rawArgs = t.write.mock.calls[0][1] as unknown[];
    expect(rawArgs.some((a) => a instanceof Error && /smoke test/i.test((a as Error).message))).toBe(true);
  });

  it('tombol async error meneruskan Error ke logger transport', async () => {
    process.env.EXPO_PUBLIactionPlanP_ENV = 'staging';
    const t = mockTransport();
    addTransport(t);
    await render(<DevSentryTest />);
    fireEvent.press(screen.getByRole('button', { name: 'Trigger async error' }));
    // Async errors di-throw di next tick — tunggu microtask
    await new Promise((r) => setTimeout(r, 10));
    expect(t.write).toHaveBeenCalled();
    const entry = t.write.mock.calls[0][0];
    expect(entry.namespace).toBe('DevSmokeTest');
  });
});
