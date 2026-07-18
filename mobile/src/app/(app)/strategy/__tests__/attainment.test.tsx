// Increment 5 (P1 attainment roll-up) — Strategi detail header orb ↔ kartu "Capaian vs Target".
// Orb header memakai attainment RPC TER-CLAMP (progressOf via useCardProgress); badge kartu
// "Capaian vs Target" TETAP computeKpiGap.percent EKSAK (boleh >100). Divergensi over-achiever
// (orb 100% clamp vs kartu 120% eksak) DISENGAJA (FR-15b). Kualitatif → label "Progress".
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetStrategy = jest.fn();
jest.mock('@/lib/strategies', () => ({
  __esModule: true,
  getStrategy: (...a: unknown[]) => mockGetStrategy(...a),
  activateStrategy: jest.fn(),
  updateStrategy: jest.fn(),
  PLANNING_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
}));

// @/lib/cards — currentValue (numeric_total) menggerakkan computeKpiGap kartu; result sources kosong.
const mockGetStrategyCurrentValue = jest.fn();
const mockListStrategyResultValueSources = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  getStrategyCurrentValue: (...a: unknown[]) => mockGetStrategyCurrentValue(...a),
  listStrategyResultValueSources: (...a: unknown[]) => mockListStrategyResultValueSources(...a),
}));

// computeKpiGap / groupThousands / formatRemaining ASLI (jangan mock @/lib/strategy-gap).

const mockProgressOf = jest.fn();
const mockMeasuredOf = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useInitiatives: () => ({ initiatives: [], isLoading: false, isError: false, refetch: jest.fn() }),
  usePerson: () => ({ person: null }),
  useStrategyBreakdown: () => ({ rows: [], isLoading: false, isError: false, refetch: jest.fn() }),
  useStrategyBreakdownActions: () => ({ replace: jest.fn(), isPending: false }),
  useCardProgress: () => ({
    progressOf: (id: string) => mockProgressOf(id),
    measuredOf: (id: string) => mockMeasuredOf(id),
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: () => ({ compliance: undefined, isLoading: false, isCompliant: true, refetch: jest.fn() }),
}));

jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1', full_name: 'Rina' }, isLoading: false, can: () => true }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 'k1' }),
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

const BASE = {
  id: 'k1',
  name: 'Akuisisi Pelanggan',
  status: 'active',
  goal_id: 'g1',
  target: 'Tagih 95%',
  expected_outcome: null,
  description: null,
  pic_id: 'u1',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
  target_unit: null,
};

beforeEach(() => {
  mockGetStrategy.mockReset();
  mockGetStrategyCurrentValue.mockReset();
  mockListStrategyResultValueSources.mockReset();
  mockProgressOf.mockReset();
  mockMeasuredOf.mockReset();
  mockListStrategyResultValueSources.mockResolvedValue([]);
  mockProgressOf.mockReturnValue(null);
  mockMeasuredOf.mockReturnValue(false);
});

describe('StrategyDetailScreen — attainment roll-up (P1)', () => {
  it('[G3] terukur ≤100% → orb header ≡ badge kartu (keduanya "Capaian", nilai sama)', async () => {
    mockGetStrategy.mockResolvedValue({ ...BASE, target_numeric: 100 });
    mockGetStrategyCurrentValue.mockResolvedValue({ numeric_total: 75 }); // 75/100 = 75%
    mockProgressOf.mockReturnValue(75);
    mockMeasuredOf.mockReturnValue(true);

    await render(<StrategyDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByLabelText(/^Capaian 75 persen/)).toBeTruthy(); // orb header (RPC)
    expect(screen.getByText('Capaian vs Target')).toBeTruthy(); // kartu ada
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0); // badge kartu (computeKpiGap eksak)
  });

  it('[G3-over] over-achiever → orb "Capaian 100 persen" (clamp) vs badge kartu "120%" (eksak) — FR-15b', async () => {
    mockGetStrategy.mockResolvedValue({ ...BASE, target_numeric: 100 });
    mockGetStrategyCurrentValue.mockResolvedValue({ numeric_total: 120 }); // 120/100 = 120%
    mockProgressOf.mockReturnValue(100); // RPC ter-clamp 0..100
    mockMeasuredOf.mockReturnValue(true);

    await render(<StrategyDetailScreen />, { wrapper: wrapper() });

    // Orb header: clamp ke 100 (tak menggelembung karena over-achievement).
    expect(await screen.findByLabelText(/^Capaian 100 persen/)).toBeTruthy();
    // Badge kartu: EKSAK 120% (over-achievement = info, tak di-clamp). DISENGAJA divergen dari orb.
    expect(screen.getByText('120%')).toBeTruthy();
  });

  it('[G4] kualitatif (target_numeric null) → orb label "Progress", tanpa kartu "Capaian vs Target"', async () => {
    mockGetStrategy.mockResolvedValue({ ...BASE, target_numeric: null });
    mockGetStrategyCurrentValue.mockResolvedValue(null);
    mockProgressOf.mockReturnValue(null); // fallback ratioDone (initiatives kosong → 0)
    mockMeasuredOf.mockReturnValue(false);

    await render(<StrategyDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByLabelText(/^Progress 0 persen/)).toBeTruthy();
    expect(screen.queryByText('Capaian vs Target')).toBeNull();
  });
});
