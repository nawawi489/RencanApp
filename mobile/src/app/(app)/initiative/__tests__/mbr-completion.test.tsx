// UI Fase 5 — indikator Kelengkapan + gating MBR di Inisiatif detail (parent='initiative').
// Verifikasi: useMbrCompliance dipanggil dgn ('initiative', id); gating blokir_aktivasi cegah aktivasi.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetInitiative = jest.fn();
const mockActivateInitiative = jest.fn();
jest.mock('@/lib/initiatives', () => ({
  __esModule: true,
  getInitiative: (...a: unknown[]) => mockGetInitiative(...a),
  activateInitiative: (...a: unknown[]) => mockActivateInitiative(...a),
  PLANNING_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
}));

const mockRefetchInit = jest.fn();
const mockProgressOf = jest.fn<number | null, [string]>(() => null);
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useInitiativeActionPlans: () => ({
    action_plans: [],
    isLoading: false,
    isError: false,
    refetch: mockRefetchInit,
  }),
  useCardProgress: () => ({
    progressOf: (id: string) => mockProgressOf(id),
    measuredOf: () => false,
    isLoading: false,
    isError: false,
  }),
}));

const mockUseMbrCompliance = jest.fn();
jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: (...a: unknown[]) => mockUseMbrCompliance(...a),
}));

// WSA-08 — Inisiatif detail kini men-gate CTA "+ Tambah Rencana Aksi" via useProfile().can().
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: () => true }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 's1' }),
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

const DRAFT_STRATEGY = {
  id: 's1',
  name: 'Optimasi Funnel',
  status: 'draft',
  strategy_id: 'k1',
  pic_id: 'u1',
  reason: 'r',
  main_risk: 'm',
  alternative: 'a',
  description: null,
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

beforeEach(() => {
  mockGetInitiative.mockReset();
  mockActivateInitiative.mockReset();
  mockUseMbrCompliance.mockReset();
  mockRefetchInit.mockReset();
  mockGetInitiative.mockResolvedValue(DRAFT_STRATEGY);
  mockActivateInitiative.mockResolvedValue(undefined);
  mockProgressOf.mockReset();
  mockProgressOf.mockReturnValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('InitiativeDetailScreen — MBR', () => {
  it('[1] useMbrCompliance dipanggil dengan ("initiative", "s1") + indikator "2/3" tampil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'action_plan',
        child_count: 2,
        min_count: 3,
        enforcement_mode: 'hanya_peringatan',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(mockUseMbrCompliance).toHaveBeenCalledWith('initiative', 's1'));
    expect(await screen.findByLabelText('Kelengkapan Perencanaan')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('[2] blokir_aktivasi + non-compliant → Aktifkan munculkan popup & activate TIDAK dipanggil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'action_plan',
        child_count: 0,
        min_count: 2,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Inisiatif'));
    await waitFor(() => {
      const calls = (Alert.alert as jest.Mock).mock.calls;
      expect(calls[0]?.[0]).toBe('Tidak Dapat Melanjutkan');
    });
    expect(mockActivateInitiative).not.toHaveBeenCalled();
  });

  it('[4] orb capaian pakai rollup rekursif server (Progress) bukan %-selesai klien', async () => {
    // action_plans kosong → heuristik %-selesai = 0; RPC mengembalikan 67 (rata-rata rekursif).
    // Orb harus tampilkan 67 dengan label "Progress" (sinkron tree), membuktikan wiring RPC.
    mockUseMbrCompliance.mockReturnValue({ compliance: null, isLoading: false, isCompliant: true });
    mockProgressOf.mockReturnValue(67);
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 67 persen/)).toBeTruthy();
  });

  it('[3] compliant → Aktifkan memanggil activateInitiative("s1")', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'action_plan',
        child_count: 3,
        min_count: 2,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: true,
      },
      isLoading: false,
      isCompliant: true,
    });
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Inisiatif'));
    await waitFor(() => expect(mockActivateInitiative).toHaveBeenCalledWith('s1'));
  });
});
