// UI Fase 5 — Indikator Kelengkapan Perencanaan + gating popup "Tidak Dapat Melanjutkan"
// di layar KPI Area detail. Otoritas akhir tetap server (onError aktivasi); klien hanya gating
// pre-flight untuk mode 'blokir_aktivasi' + indikator visual berdasarkan compliance.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// Data layer KPI Area — dimock seluruhnya agar useQuery inline ['kpi_area', id] resolve sesuai test.
const mockGetKpiArea = jest.fn();
const mockActivateKpiArea = jest.fn();
const mockUpdateKpiArea = jest.fn();
jest.mock('@/lib/kpi-areas', () => ({
  __esModule: true,
  getKpiArea: (...a: unknown[]) => mockGetKpiArea(...a),
  activateKpiArea: (...a: unknown[]) => mockActivateKpiArea(...a),
  updateKpiArea: (...a: unknown[]) => mockUpdateKpiArea(...a),
  PLANNING_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
}));

// hooks workspace — useStrategies dipakai layar; usePerson dipakai utk picker (PIC prefill);
// useKpiAreaBreakdown + useKpiAreaBreakdownActions dipakai panel Pecahan Target (S2).
const mockRefetchStrategies = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useStrategies: () => ({ strategies: [], isLoading: false, isError: false, refetch: mockRefetchStrategies }),
  usePerson: () => ({ person: null }),
  useKpiAreaBreakdown: () => ({ rows: [], isLoading: false, isError: false, refetch: jest.fn() }),
  useKpiAreaBreakdownActions: () => ({ replace: jest.fn(), isPending: false }),
}));

// Hook MBR — variabel dapat di-set per test.
const mockUseMbrCompliance = jest.fn();
jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: (...a: unknown[]) => mockUseMbrCompliance(...a),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1', full_name: 'Rina' }, isLoading: false, can: mockCan }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 'k1' }),
}));

// eslint-disable-next-line import/first
import KpiAreaDetailScreen from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const DRAFT_KPI = {
  id: 'k1',
  name: 'Akuisisi Pelanggan',
  status: 'draft',
  goal_id: 'g1',
  target: 'Tagih 95%',
  description: null,
  pic_id: 'u1',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

beforeEach(() => {
  mockGetKpiArea.mockReset();
  mockActivateKpiArea.mockReset();
  mockUpdateKpiArea.mockReset();
  mockUseMbrCompliance.mockReset();
  mockRefetchStrategies.mockReset();
  mockGetKpiArea.mockResolvedValue(DRAFT_KPI);
  mockActivateKpiArea.mockResolvedValue(undefined);
  mockCan.mockReset();
  mockCan.mockReturnValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('KpiAreaDetailScreen — indikator Kelengkapan & gating MBR', () => {
  it('[1] non-compliant hanya_peringatan → indikator "2/3" tampil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'strategy',
        child_count: 2,
        min_count: 3,
        enforcement_mode: 'hanya_peringatan',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<KpiAreaDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Kelengkapan Perencanaan')).toBeTruthy();
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('[2] compliant → indikator "Lengkap" tampil (afirmatif, bukan rasio)', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'strategy',
        child_count: 3,
        min_count: 3,
        enforcement_mode: 'hanya_peringatan',
        is_compliant: true,
      },
      isLoading: false,
      isCompliant: true,
    });
    await render(<KpiAreaDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Lengkap')).toBeTruthy();
  });

  it('[3] blokir_aktivasi + non-compliant → Aktifkan munculkan popup "Tidak Dapat Melanjutkan" & activate TIDAK dipanggil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'strategy',
        child_count: 2,
        min_count: 3,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<KpiAreaDetailScreen />, { wrapper: wrapper() });
    const btn = await screen.findByText('Aktifkan KPI Area');
    fireEvent.press(btn);
    const calls = (Alert.alert as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toBe('Tidak Dapat Melanjutkan');
    expect(mockActivateKpiArea).not.toHaveBeenCalled();
  });

  it('[4] blokir_aktivasi + compliant → Aktifkan memanggil activateKpiArea("k1")', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'strategy',
        child_count: 3,
        min_count: 3,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: true,
      },
      isLoading: false,
      isCompliant: true,
    });
    await render(<KpiAreaDetailScreen />, { wrapper: wrapper() });
    const btn = await screen.findByText('Aktifkan KPI Area');
    fireEvent.press(btn);
    await waitFor(() => expect(mockActivateKpiArea).toHaveBeenCalledWith('k1'));
    // tidak ada popup gating
    const popupCalls = (Alert.alert as jest.Mock).mock.calls.filter(
      (c) => c[0] === 'Tidak Dapat Melanjutkan',
    );
    expect(popupCalls).toHaveLength(0);
  });

  // WSA-08 — CTA "+ Tambah Strategy" digate can('create_strategy').
  it('[WSA-08] can(create_strategy) false → "+ Tambah Strategy" tidak dirender', async () => {
    mockCan.mockImplementation((key: string) => key !== 'create_strategy');
    mockUseMbrCompliance.mockReturnValue({ compliance: undefined, isLoading: false, isCompliant: true });
    await render(<KpiAreaDetailScreen />, { wrapper: wrapper() });
    await screen.findByText('Strategy');
    expect(screen.queryByText('+ Tambah Strategy')).toBeNull();
  });

  it('[WSA-08b] can(create_strategy) true → "+ Tambah Strategy" tampil', async () => {
    mockCan.mockReturnValue(true);
    mockUseMbrCompliance.mockReturnValue({ compliance: undefined, isLoading: false, isCompliant: true });
    await render(<KpiAreaDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('+ Tambah Strategy')).toBeTruthy();
  });

  it('[5] compliance undefined (loading) → fail-open: Aktifkan tetap memanggil activateKpiArea (server otoritatif)', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: undefined,
      isLoading: true,
      isCompliant: true,
    });
    await render(<KpiAreaDetailScreen />, { wrapper: wrapper() });
    const btn = await screen.findByText('Aktifkan KPI Area');
    fireEvent.press(btn);
    await waitFor(() => expect(mockActivateKpiArea).toHaveBeenCalledWith('k1'));
  });
});
