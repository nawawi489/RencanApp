// UI Fase 5 — indikator Kelengkapan + gating MBR di Rencana Aksi detail (parent='action_plan').
// Verifikasi: useMbrCompliance('action_plan', id); gating blokir_aktivasi cegah aktivasi.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetActionPlan = jest.fn();
const mockActivateActionPlan = jest.fn();
const mockListTasks = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  getActionPlan: (...a: unknown[]) => mockGetActionPlan(...a),
  activateActionPlan: (...a: unknown[]) => mockActivateActionPlan(...a),
  listTasks: (...a: unknown[]) => mockListTasks(...a),
  INITIATIVE_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  ACTION_PLAN_STATUS_LABEL: { draft: 'Draft' },
  PRIORITY_LABEL: { low: 'Rendah', medium: 'Sedang', high: 'Tinggi', urgent: 'Urgent' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
  personLabel: (p: { full_name?: string | null; email?: string | null } | null | undefined, fallback = 'Tanpa nama') =>
    p?.full_name?.trim() || p?.email || fallback,
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

// Detail orb kini menarik rollup rekursif via useCardProgress; mock null → fallback heuristik.
const mockProgressOf = jest.fn<number | null, [string]>(() => null);
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useCardProgress: () => ({
    progressOf: (id: string) => mockProgressOf(id),
    measuredOf: () => false,
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 'i1' }),
}));

// eslint-disable-next-line import/first
import ActionPlanDetailScreen from '../[id]';

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
  initiative_id: 's1',
  pic_id: 'u1',
  target_result: 'naik 20%',
  team_id: 't1', // locked base per 0078 spec (action_plan)
  description: null,
  period_start: '2026-01-01',
  period_end: '2026-03-31',
};

beforeEach(() => {
  mockGetActionPlan.mockReset();
  mockActivateActionPlan.mockReset();
  mockListTasks.mockReset();
  mockUseMbrCompliance.mockReset();
  mockGetActionPlan.mockResolvedValue(DRAFT_INITIATIVE);
  mockActivateActionPlan.mockResolvedValue(undefined);
  mockListTasks.mockResolvedValue([]);
  mockProgressOf.mockReset();
  mockProgressOf.mockReturnValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('ActionPlanDetailScreen — MBR', () => {
  it('[1] useMbrCompliance("action_plan", "i1") + indikator "1/3" tampil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'task',
        child_count: 1,
        min_count: 3,
        enforcement_mode: 'hanya_peringatan',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(mockUseMbrCompliance).toHaveBeenCalledWith('action_plan', 'i1'));
    expect(await screen.findByLabelText('Kelengkapan Perencanaan')).toBeTruthy();
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('[4] orb capaian pakai rollup rekursif server (Progress) bukan %-selesai klien', async () => {
    // Tugas kosong → heuristik %-selesai = 0; RPC mengembalikan 67 (rata-rata rekursif Tugas).
    mockUseMbrCompliance.mockReturnValue({ compliance: null, isLoading: false, isCompliant: true });
    mockProgressOf.mockReturnValue(67);
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 67 persen/)).toBeTruthy();
  });

  it('[2] blokir_aktivasi + non-compliant → popup & activate TIDAK dipanggil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'task',
        child_count: 0,
        min_count: 3,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: false,
      },
      isLoading: false,
      isCompliant: false,
    });
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Rencana Aksi'));
    await waitFor(() => {
      expect((Alert.alert as jest.Mock).mock.calls[0]?.[0]).toBe('Tidak Dapat Melanjutkan');
    });
    expect(mockActivateActionPlan).not.toHaveBeenCalled();
  });

  it('[3] compliant → activateActionPlan("i1") dipanggil', async () => {
    mockUseMbrCompliance.mockReturnValue({
      compliance: {
        child_card_type: 'task',
        child_count: 3,
        min_count: 3,
        enforcement_mode: 'blokir_aktivasi',
        is_compliant: true,
      },
      isLoading: false,
      isCompliant: true,
    });
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Aktifkan Rencana Aksi'));
    await waitFor(() => expect(mockActivateActionPlan).toHaveBeenCalledWith('i1'));
  });
});
