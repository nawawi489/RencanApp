// UI Fase 7 — Settings · Score Formula. Permission guard + Manual Override surface.
// Pre-flight client: reason wajib + anti-self. RPC error message ditampilkan.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'me' }, isLoading: false, can: mockCan }),
}));

const mockUseActivePeriod = jest.fn();
const mockOverride = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
  useScoreOverride: () => ({ override: mockOverride, isPending: false }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsScoreFormulaScreen from '../settings-score-formula';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockCan.mockReset();
  mockOverride.mockReset();
  mockUseActivePeriod.mockReset();
  mockUseActivePeriod.mockReturnValue({
    period: { id: 'p1', period_name: 'Q1', period_start: '2026-01-01', period_end: '2026-03-31' },
    isLoading: false,
    isError: false,
  });
});

describe('SettingsScoreFormulaScreen — guard + override surface', () => {
  it('[1] tanpa permission → "tidak memiliki akses" + form TIDAK render', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
    expect(screen.queryByLabelText('Simpan Override')).toBeNull();
  });

  it('[2] tanpa periode aktif → form override BLOK (EmptyState)', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tidak ada periode aktif')).toBeTruthy();
    expect(screen.queryByLabelText('Simpan Override')).toBeNull();
  });

  it('[3] pre-flight: reason kosong → inline error, override RPC tidak dipanggil', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Simpan Override'));
    await waitFor(() => expect(screen.getByText('Alasan override wajib diisi.')).toBeTruthy());
    expect(mockOverride).not.toHaveBeenCalled();
  });

  it('[4] pre-flight anti-self: target = profile.id → inline error, RPC tidak dipanggil', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('User ID target', undefined, { timeout: 10000 })).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('uuid user'), 'me');
      fireEvent.changeText(screen.getByPlaceholderText('contoh: 82'), '99');
      fireEvent.changeText(screen.getByPlaceholderText('koreksi data, dll'), 'self attempt');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Simpan Override'));
    });
    expect(screen.getByText(/tidak bisa mengubah score Anda sendiri/i)).toBeTruthy();
    expect(mockOverride).not.toHaveBeenCalled();
  });

  it('[5] RPC reject (mis. 100% atau ditolak server) → pesan server dirender inline', async () => {
    mockCan.mockReturnValue(true);
    mockOverride.mockRejectedValueOnce(new Error('Periode ini sudah ditutup dan tidak bisa diubah.'));
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('User ID target', undefined, { timeout: 10000 })).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('uuid user'), 'other-uid');
      fireEvent.changeText(screen.getByPlaceholderText('contoh: 82'), '82');
      fireEvent.changeText(screen.getByPlaceholderText('koreksi data, dll'), 'koreksi');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Simpan Override'));
    });
    expect(mockOverride).toHaveBeenCalledTimes(1);
    expect(mockOverride).toHaveBeenCalledWith({ userId: 'other-uid', manualScore: 82, reason: 'koreksi' });
    await waitFor(() => expect(screen.getByText(/Periode ini sudah ditutup/i)).toBeTruthy());
  });
});
