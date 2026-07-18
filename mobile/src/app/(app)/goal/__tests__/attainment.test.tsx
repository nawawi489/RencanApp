// Increment 5 (P1 attainment roll-up) — Goal detail header orb + kartu "Progress vs Capaian".
// Membuktikan orb header memakai ATTAINMENT RPC (progressOf/measuredOf via useCardProgress),
// BUKAN status-rollup ratioDone; label "Capaian" hanya saat terukur, "Progress" saat kualitatif;
// sublabel cakupan "n/m Strategi terukur"; "Target Tahunan" (goal.target_value) tetap teks bebas.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseGoal = jest.fn();
const mockUseStrategies = jest.fn();
const mockProgressOf = jest.fn();
const mockMeasuredOf = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoal: (id: string) => mockUseGoal(id),
  useStrategies: (id: string) => mockUseStrategies(id),
  useGoalActions: () => ({ activate: jest.fn(), restore: jest.fn(), activatePending: false, restorePending: false }),
  useCardProgress: () => ({
    progressOf: (id: string) => mockProgressOf(id),
    measuredOf: (id: string) => mockMeasuredOf(id),
    isLoading: false,
    isError: false,
  }),
}));

jest.mock('@/hooks/use-profile', () => ({
  ...jest.requireActual('@/hooks/use-profile'),
  useProfile: () => ({ profile: { id: 'u1', full_name: 'Rina' }, isLoading: false, can: () => true }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 'g1' }),
}));

// eslint-disable-next-line import/first
import GoalDetailScreen from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const refetch = jest.fn();

const GOAL = {
  id: 'g1',
  name: 'Tumbuhkan pendapatan',
  status: 'active',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
  pic_id: 'u1',
  target_value: 'Naik 20% YoY',
  description: null,
};

function setStrategies(strategies: { id: string; name: string; status: string; target_numeric: number | null }[]) {
  mockUseStrategies.mockReturnValue({ strategies, isLoading: false, isError: false, refetch });
}

beforeEach(() => {
  mockUseGoal.mockReset();
  mockUseStrategies.mockReset();
  mockProgressOf.mockReset();
  mockMeasuredOf.mockReset();
  refetch.mockReset();
  mockUseGoal.mockReturnValue({ goal: GOAL, isLoading: false, isError: false, refetch });
  setStrategies([]);
  mockProgressOf.mockReturnValue(null);
  mockMeasuredOf.mockReturnValue(false);
});

describe('GoalDetailScreen — attainment roll-up (P1)', () => {
  it('[G2] orb header memakai attainment RPC (progressOf), BUKAN status-rollup ratioDone', async () => {
    // Semua Strategi 'active' → ratioDoneOfChildren = 0. Orb harus tetap 82 (dari RPC), bukan 0.
    setStrategies([
      { id: 's1', name: 'A', status: 'active', target_numeric: 100 },
      { id: 's2', name: 'B', status: 'active', target_numeric: 50 },
    ]);
    mockProgressOf.mockReturnValue(82);
    mockMeasuredOf.mockReturnValue(true);

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByLabelText(/^Capaian 82 persen/)).toBeTruthy();
    // Bukti negatif: tidak ada orb "Capaian 0 persen" (yang akan muncul bila pakai ratioDone).
    expect(screen.queryByLabelText(/^Capaian 0 persen/)).toBeNull();
  });

  it('[G1] terukur → kartu "Capaian hasil" numerik (attainment) + "Progress kerja" (status)', async () => {
    setStrategies([
      { id: 's1', name: 'A', status: 'active', target_numeric: 100 },
      { id: 's2', name: 'B', status: 'active', target_numeric: 50 },
    ]);
    mockProgressOf.mockReturnValue(82);
    mockMeasuredOf.mockReturnValue(true);

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('Progress vs Capaian')).toBeTruthy(); // judul kartu (mode terukur)
    expect(screen.getByText('Capaian hasil')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy(); // nilai attainment RPC
    expect(screen.getByText('Progress kerja')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy(); // ratioActive: 2/2 non-draft
  });

  it('[G-KUAL] kualitatif (measuredOf=false) → label "Progress", tanpa kartu "Capaian hasil"', async () => {
    setStrategies([
      { id: 's1', name: 'A', status: 'done', target_numeric: null },
      { id: 's2', name: 'B', status: 'active', target_numeric: null },
    ]);
    mockProgressOf.mockReturnValue(null); // RPC bilang tak terukur → klien fallback ratioDone
    mockMeasuredOf.mockReturnValue(false);

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    // ratioDone = 1/2 = 50 → orb "Progress 50 persen"
    expect(await screen.findByLabelText(/^Progress 50 persen/)).toBeTruthy();
    expect(screen.queryByText('Capaian hasil')).toBeNull();
    expect(screen.queryByText('Progress vs Capaian')).toBeNull(); // judul kartu mode terukur TIDAK muncul
    expect(screen.getAllByText('Progress kerja').length).toBeGreaterThan(0); // judul kartu mode kualitatif
  });

  it('[D1] sublabel orb = "3/5 Strategi terukur" (populasi active+done, O4)', async () => {
    setStrategies([
      { id: 's1', name: 'A', status: 'active', target_numeric: 100 },
      { id: 's2', name: 'B', status: 'active', target_numeric: 200 },
      { id: 's3', name: 'C', status: 'done', target_numeric: 5 },
      { id: 's4', name: 'D', status: 'active', target_numeric: null }, // eligible tapi tak terukur
      { id: 's5', name: 'E', status: 'active', target_numeric: null }, // eligible tapi tak terukur
      { id: 's6', name: 'F', status: 'draft', target_numeric: 99 }, // draft → dikecualikan (O4)
    ]);
    mockProgressOf.mockReturnValue(60);
    mockMeasuredOf.mockReturnValue(true);

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByLabelText(/3\/5 Strategi terukur/)).toBeTruthy();
  });

  it('[D3] terukur tapi tanpa Strategi eligible → sublabel "Belum ada turunan"', async () => {
    setStrategies([]);
    mockProgressOf.mockReturnValue(0);
    mockMeasuredOf.mockReturnValue(true);

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByLabelText(/Belum ada turunan/)).toBeTruthy();
  });

  it('[MetaGrid] "Target Tahunan" tetap teks bebas (goal.target_value), bukan angka attainment', async () => {
    mockProgressOf.mockReturnValue(82);
    mockMeasuredOf.mockReturnValue(true);

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('Target Tahunan')).toBeTruthy();
    expect(screen.getByText('Naik 20% YoY')).toBeTruthy();
  });
});
