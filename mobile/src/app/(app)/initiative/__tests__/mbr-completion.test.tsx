// UI Fase 5 — indikator Kelengkapan + gating MBR di Initiative detail (parent='initiative').
// Verifikasi: useMbrCompliance('initiative', id); gating blokir_aktivasi cegah aktivasi.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetInitiative = jest.fn();
const mockActivateInitiative = jest.fn();
const mockListActionPlans = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  getInitiative: (...a: unknown[]) => mockGetInitiative(...a),
  activateInitiative: (...a: unknown[]) => mockActivateInitiative(...a),
  listActionPlans: (...a: unknown[]) => mockListActionPlans(...a),
  INITIATIVE_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  ACTION_PLAN_STATUS_LABEL: { draft: 'Draft' },
  PRIORITY_LABEL: { low: 'Rendah', medium: 'Sedang', high: 'Tinggi', urgent: 'Urgent' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
}));

jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: () => true }),
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
  useLocalSearchParams: () => ({ id: 'i1' }),
}));

// eslint-disable-next-line import/first
import InitiativeDetailScreen from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const DRAFT_INITIATIVE = {
  id: 'i1',
  name: 'Kampanye Q1',
  status: 'draft',
  strategy_id: 's1',
  pic_id: 'u1',
  target_result: 'naik 20%',
  description: null,
  period_start: '2026-01-01',
  period_end: '2026-03-31',
};

beforeEach(() => {
  mockGetInitiative.mockReset();
  mockActivateInitiative.mockReset();
  mockListActionPlans.mockReset();
  mockUseMbrCompliance.mockReset();
  mockGetInitiative.mockResolvedValue(DRAFT_INITIATIVE);
  mockActivateInitiative.mockResolvedValue(undefined);
  mockListActionPlans.mockResolvedValue([]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('InitiativeDetailScreen — MBR', () => {
  it('[1] useMbrCompliance("initiative", "i1") + indikator "1/3" tampil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'action_plan',
        child_count: 1,
        min_count: 3,
        enforcement_mode: 'hanya_peringatan',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(mockUseMbrCompliance).toHaveBeenCalledWith('initiative', 'i1'));
    expect(await screen.findByLabelText('Kelengkapan Perencanaan')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('[2] blokir_aktivasi + non-compliant → popup & activate TIDAK dipanggil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'action_plan',
        child_count: 0,
        min_count: 3,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Initiative'));
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Tidak Dapat Melanjutkan');
    expect(mockActivateInitiative).not.toHaveBeenCalled();
  });

  it('[3] compliant → activateInitiative("i1") dipanggil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'action_plan',
        child_count: 3,
        min_count: 3,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: true,
      },
      isLoading: false,
      isCompliant: true,
    });
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Initiative'));
    await waitFor(() => expect(mockActivateInitiative).toHaveBeenCalledWith('i1'));
  });
});
