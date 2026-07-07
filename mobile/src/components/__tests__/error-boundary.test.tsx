import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from '../error-boundary';
import { _resetForTest, addTransport, type LogTransport } from '@/lib/logger';

let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error('boom secret technical detail');
  return <Text>konten pulih</Text>;
}

function mockTransport(): LogTransport & { write: jest.Mock } {
  return { name: 'mock', write: jest.fn() };
}

describe('ErrorBoundary', () => {
  let consoleErr: jest.SpyInstance;
  beforeEach(() => {
    shouldThrow = true;
    consoleErr = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErr.mockRestore();
    _resetForTest();
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

  it('mengirim detail teknis ke transport (bukan ke user)', async () => {
    const t = mockTransport();
    addTransport(t);
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(t.write).toHaveBeenCalled();
    expect(t.write.mock.calls[0][0].namespace).toBe('ErrorBoundary');
    expect(t.write.mock.calls[0][0].level).toBe('error');
  });

  it('tombol retry memulihkan tree setelah penyebab crash hilang', async () => {
    await render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
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
