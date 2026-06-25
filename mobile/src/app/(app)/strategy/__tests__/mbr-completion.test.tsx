// UI Fase 5 — indikator Kelengkapan + gating MBR di Strategy detail (parent='strategy').
// Verifikasi: useMbrCompliance dipanggil dgn ('strategy', id); gating blokir_aktivasi cegah aktivasi.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetStrategy = jest.fn();
const mockActivateStrategy = jest.fn();
jest.mock('@/lib/strategies', () => ({
  __esModule: true,
  getStrategy: (...a: unknown[]) => mockGetStrategy(...a),
  activateStrategy: (...a: unknown[]) => mockActivateStrategy(...a),
  PLANNING_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
}));

const mockRefetchInit = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useStrategyInitiatives: () => ({
    initiatives: [],
    isLoading: false,
    isError: false,
    refetch: mockRefetchInit,
  }),
}));

const mockUseMbrCompliance = jest.fn();
jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: (...a: unknown[]) => mockUseMbrCompliance(...a),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 's1' }),
}));

// eslint-disable-next-line import/first
import StrategyDetailScreen from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const DRAFT_STRATEGY = {
  id: 's1',
  name: 'Optimasi Funnel',
  status: 'draft',
  kpi_area_id: 'k1',
  reason: 'r',
  main_risk: 'm',
  alternative: 'a',
  description: null,
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

beforeEach(() => {
  mockGetStrategy.mockReset();
  mockActivateStrategy.mockReset();
  mockUseMbrCompliance.mockReset();
  mockRefetchInit.mockReset();
  mockGetStrategy.mockResolvedValue(DRAFT_STRATEGY);
  mockActivateStrategy.mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('StrategyDetailScreen — MBR', () => {
  it('[1] useMbrCompliance dipanggil dengan ("strategy", "s1") + indikator "2/3" tampil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'initiative',
        child_count: 2,
        min_count: 3,
        enforcement_mode: 'hanya_peringatan',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<StrategyDetailScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(mockUseMbrCompliance).toHaveBeenCalledWith('strategy', 's1'));
    expect(await screen.findByLabelText('Kelengkapan Perencanaan')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('[2] blokir_aktivasi + non-compliant → Aktifkan munculkan popup & activate TIDAK dipanggil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'initiative',
        child_count: 0,
        min_count: 2,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<StrategyDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Strategy'));
    const calls = (Alert.alert as jest.Mock).mock.calls;
    expect(calls[0][0]).toBe('Tidak Dapat Melanjutkan');
    expect(mockActivateStrategy).not.toHaveBeenCalled();
  });

  it('[3] compliant → Aktifkan memanggil activateStrategy("s1")', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'initiative',
        child_count: 3,
        min_count: 2,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: true,
      },
      isLoading: false,
      isCompliant: true,
    });
    await render(<StrategyDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Strategy'));
    await waitFor(() => expect(mockActivateStrategy).toHaveBeenCalledWith('s1'));
  });
});
