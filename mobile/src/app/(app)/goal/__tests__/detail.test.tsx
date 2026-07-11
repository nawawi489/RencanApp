// Goal detail (Fase 4). Memock hook layer (use-workspace), bukan data layer langsung.
// AC kunci: deep-link luar scope TIDAK boleh membocorkan keberadaan card (ErrorState generik,
// tanpa nama). Mirror pola home.test.tsx: await render WAJIB di RTL versi repo ini.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseGoal = jest.fn();
const mockUseStrategies = jest.fn();
const mockActivate = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoal: (id: string) => mockUseGoal(id),
  useStrategies: (id: string) => mockUseStrategies(id),
  useGoalActions: () => ({ activate: mockActivate, isPending: false }),
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

beforeEach(() => {
  mockUseGoal.mockReset();
  mockUseStrategies.mockReset();
  mockActivate.mockReset();
  refetch.mockReset();
  // default: KPI list resolved kosong; tiap test override yang relevan.
  mockUseStrategies.mockReturnValue({ strategies: [], isLoading: false, isError: false, refetch });
});

describe('GoalDetailScreen', () => {
  it('data → nama goal + status badge + KPI Area tampil', async () => {
    mockUseGoal.mockReturnValue({
      goal: {
        id: 'g1',
        name: 'Tumbuhkan pendapatan',
        status: 'draft',
        period_start: '2026-01-01',
        period_end: '2026-12-31',
        pic_id: 'u1',
        description: null,
      },
      isLoading: false,
      isError: false,
      refetch,
    });
    mockUseStrategies.mockReturnValue({
      strategies: [{ id: 'k1', name: 'Akuisisi Pelanggan', status: 'active' }],
      isLoading: false,
      isError: false,
      refetch,
    });

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('Tumbuhkan pendapatan')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy(); // status badge goal
    expect(screen.getByText('Akuisisi Pelanggan')).toBeTruthy(); // minimal satu KPI Area
  });

  it('deep-link luar scope → ErrorState generik, tidak membocorkan nama card', async () => {
    mockUseGoal.mockReturnValue({ goal: undefined, isLoading: false, isError: true, refetch });

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('Gagal memuat')).toBeTruthy();
    expect(screen.queryByText('Tumbuhkan pendapatan')).toBeNull();
  });

  it('loading → SkeletonList', async () => {
    mockUseGoal.mockReturnValue({ goal: undefined, isLoading: true, isError: false, refetch });

    await render(<GoalDetailScreen />, { wrapper: wrapper() });

    expect(screen.getAllByLabelText('Memuat…').length).toBeGreaterThan(0);
  });
});
