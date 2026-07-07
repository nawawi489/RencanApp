// Item 2 — ErrorBoundary root: crash render TIDAK boleh mematikan app (white screen). Fallback
// ramah, tak membocorkan error.message (WSA-18), kirim detail ke logger, dan bisa retry.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from '../error-boundary';
import { consoleLogger, setLogger } from '@/lib/logger';

let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error('boom secret technical detail');
  return <Text>konten pulih</Text>;
}

describe('ErrorBoundary', () => {
  let consoleErr: jest.SpyInstance;
  beforeEach(() => {
    shouldThrow = true;
    // React menuliskan error boundary ke console.error — redam agar output test bersih.
    consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErr.mockRestore();
    setLogger(consoleLogger);
  });

  it('menampilkan fallback ramah saat child crash, TANPA membocorkan error.message', async () => {
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Terjadi masalah')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Muat ulang' })).toBeTruthy();
    expect(screen.queryByText(/boom secret technical detail/)).toBeNull();
  });

  it('mengirim detail teknis ke logger (bukan ke user)', async () => {
    const active = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    setLogger(active);
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(active.error).toHaveBeenCalled();
  });

  it('tombol retry memulihkan tree setelah penyebab crash hilang', async () => {
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    // penyebab crash hilang, lalu user menekan retry
    shouldThrow = false;
    fireEvent.press(screen.getByRole('button', { name: 'Muat ulang' }));
    await waitFor(() => expect(screen.getByText('konten pulih')).toBeTruthy());
  });

  it('merender children apa adanya saat tidak ada error', async () => {
    shouldThrow = false;
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('konten pulih')).toBeTruthy();
  });
});
