// UI Fase 7 — People · Ranking. D9: ranking hanya setelah periode tertutup.
// Pola: mock supabase + listOrgProfiles + use-people-score + expo-router.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  listOrgProfiles: () => mockListOrgProfiles(),
}));

const mockUseLatestClosedPeriod = jest.fn();
const mockUseRanking = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useLatestClosedPeriod: (...a: unknown[]) => mockUseLatestClosedPeriod(...a),
  useRanking: (...a: unknown[]) => mockUseRanking(...a),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
  Stack: { Screen: () => null },
}));

// eslint-disable-next-line import/first
import PeopleRankingScreen from '../people-ranking';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockListOrgProfiles.mockReset();
  mockUseLatestClosedPeriod.mockReset();
  mockUseRanking.mockReset();
  mockPush.mockReset();
  mockListOrgProfiles.mockResolvedValue([]);
  mockUseLatestClosedPeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseRanking.mockReturnValue({ ranking: [], isLoading: false, isError: false, refetch: jest.fn() });
});

describe('PeopleRankingScreen', () => {
  it('[1] tanpa periode tertutup → EmptyState (D9)', async () => {
    await render(<PeopleRankingScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Ranking belum tersedia')).toBeTruthy();
  });

  it('[2] periode tertutup + ranking → nama + ScoreBadge + nama periode', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u-rina', full_name: 'Rina Jaya', email: 'rina@n.id' },
      { id: 'u-arman', full_name: 'Arman Malik', email: 'arman@n.id' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1 2026', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [
        { user_id: 'u-rina', rank_number: 1, score: 88 },
        { user_id: 'u-arman', rank_number: 2, score: 72 },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleRankingScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    expect(screen.getByText('Arman Malik')).toBeTruthy();
    expect(screen.getByLabelText('Score 88 · On track')).toBeTruthy();
    expect(screen.getByLabelText('Score 72 · Stabil')).toBeTruthy();
    expect(screen.getByText(/Q1 2026/)).toBeTruthy();
  });

  it('[3] periode tertutup tapi ranking kosong → EmptyState', async () => {
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({ ranking: [], isLoading: false, isError: false, refetch: jest.fn() });
    await render(<PeopleRankingScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Ranking belum tersedia')).toBeTruthy();
  });

  it('[4] error → ErrorState (role alert) + retry', async () => {
    mockUseRanking.mockReturnValue({
      ranking: [],
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    });
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleRankingScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat ranking')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
