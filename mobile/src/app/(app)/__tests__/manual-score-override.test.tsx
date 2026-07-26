// UI Fase 7 — Manual Score Override (jalur per-orang). Guards: wewenang, anti-self, reason wajib,
// clamp 0–100. D10 single-actor. Pola: mock use-people-score + use-profile + expo-router.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockOverride = jest.fn();
const mockUseUserScore = jest.fn();
jest.mock('@/hooks/use-people-score', () => {
  const actual = jest.requireActual('@/hooks/use-people-score');
  return {
    __esModule: true,
    ...actual,
    useScoreOverride: () => ({ override: mockOverride, isPending: false }),
    useUserScore: (...a: unknown[]) => mockUseUserScore(...a),
  };
});

const mockCan = jest.fn();
const mockProfile = { id: 'me' };
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: mockProfile, isLoading: false, can: mockCan }),
}));

const mockBack = jest.fn();
const mockParams: { userId: string; userName?: string; periodId: string } = {
  userId: 'u-rina',
  userName: 'Rina Jaya',
  periodId: 'p1',
};
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

// eslint-disable-next-line import/first
import ManualScoreOverrideScreen from '../manual-score-override';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockOverride.mockReset();
  mockUseUserScore.mockReset();
  mockCan.mockReset();
  mockBack.mockReset();
  mockParams.userId = 'u-rina';
  mockParams.userName = 'Rina Jaya';
  mockParams.periodId = 'p1';
  mockUseUserScore.mockReturnValue({ score: null, isLoading: false, isError: false });
  mockCan.mockReturnValue(true);
  mockOverride.mockResolvedValue('new-id');
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('ManualScoreOverrideScreen', () => {
  it('[1] tanpa wewenang → pesan akses + form tidak muncul', async () => {
    mockCan.mockReturnValue(false);
    await render(<ManualScoreOverrideScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Anda tidak berwenang mengelola Score Formula.')).toBeTruthy();
    expect(screen.queryByLabelText('Skor manual (0–100) wajib')).toBeNull();
  });

  it('[2] target = diri sendiri → pesan anti-self', async () => {
    mockParams.userId = 'me';
    await render(<ManualScoreOverrideScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Anda tidak bisa mengubah score Anda sendiri.')).toBeTruthy();
  });

  it('[3] reason kosong → error inline, override tak dipanggil', async () => {
    await render(<ManualScoreOverrideScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.changeText(await screen.findByLabelText('Skor manual (0–100) wajib'), '82');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Simpan Override'));
    });
    expect(screen.getByText('Alasan override wajib diisi.')).toBeTruthy();
    expect(mockOverride).not.toHaveBeenCalled();
  });

  it('[4] skor di luar 0–100 → error rentang', async () => {
    await render(<ManualScoreOverrideScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.changeText(await screen.findByLabelText('Skor manual (0–100) wajib'), '150');
      fireEvent.changeText(screen.getByLabelText('Alasan override wajib'), 'koreksi data');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Simpan Override'));
    });
    expect(screen.getByText('Skor manual harus dalam rentang 0–100.')).toBeTruthy();
    expect(mockOverride).not.toHaveBeenCalled();
  });

  it('[5] valid → override dipanggil dengan args + kembali', async () => {
    await render(<ManualScoreOverrideScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.changeText(await screen.findByLabelText('Skor manual (0–100) wajib'), '82');
      fireEvent.changeText(screen.getByLabelText('Alasan override wajib'), 'koreksi data instance');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Simpan Override'));
    });
    await waitFor(() =>
      expect(mockOverride).toHaveBeenCalledWith({
        userId: 'u-rina',
        manualScore: 82,
        reason: 'koreksi data instance',
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
