// UI Fase 7 — People · Profil. null vs 0 (AC-7.23); tombol Override hanya berwenang + non-self.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  listOrgProfiles: () => mockListOrgProfiles(),
  personLabel: (p: { full_name?: string | null; email?: string | null } | null | undefined, fallback = 'Tanpa nama') =>
    p?.full_name?.trim() || p?.email || fallback,
}));

const mockUseActivePeriod = jest.fn();
const mockUseUserScore = jest.fn();
const mockUseLatestClosedPeriod = jest.fn();
const mockUseRanking = jest.fn();
const mockUseMyScoreHistory = jest.fn();
jest.mock('@/hooks/use-people-score', () => {
  const actual = jest.requireActual('@/hooks/use-people-score');
  return {
    __esModule: true,
    ...actual,
    useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
    useUserScore: (...a: unknown[]) => mockUseUserScore(...a),
    useLatestClosedPeriod: (...a: unknown[]) => mockUseLatestClosedPeriod(...a),
    useRanking: (...a: unknown[]) => mockUseRanking(...a),
    useMyScoreHistory: (...a: unknown[]) => mockUseMyScoreHistory(...a),
  };
});

const mockCan = jest.fn();
const mockProfile = { id: 'me' };
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: mockProfile, isLoading: false, can: mockCan }),
}));

const mockPush = jest.fn();
const mockParams: { id: string } = { id: 'u-rina' };
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

// eslint-disable-next-line import/first
import PeopleProfileScreen from '../people-profile/[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockListOrgProfiles.mockReset();
  mockUseActivePeriod.mockReset();
  mockUseUserScore.mockReset();
  mockUseLatestClosedPeriod.mockReset();
  mockUseRanking.mockReset();
  mockUseMyScoreHistory.mockReset();
  mockCan.mockReset();
  mockPush.mockReset();
  mockParams.id = 'u-rina';
  mockListOrgProfiles.mockResolvedValue([
    { id: 'u-rina', full_name: 'Rina Jaya', email: 'rina@n.id' },
    { id: 'me', full_name: 'Aku', email: 'aku@n.id' },
  ]);
  mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseUserScore.mockReturnValue({ score: null, isLoading: false, isError: false });
  mockUseLatestClosedPeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseRanking.mockReturnValue({ ranking: [], isLoading: false, isError: false, refetch: jest.fn() });
  mockUseMyScoreHistory.mockReturnValue({ history: [], isLoading: false, isError: false });
  mockCan.mockReturnValue(false);
});

describe('PeopleProfileScreen', () => {
  it('[1] nama + email tampil dari roster', async () => {
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    expect(screen.getByText('rina@n.id')).toBeTruthy();
  });

  it('[2] skor null → GuidanceNote "Skor menyusul" (AC-7.23)', async () => {
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Skor menyusul')).toBeTruthy();
  });

  it('[3] skor aktif + breakdown → ScoreBadge + label metrik', async () => {
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseUserScore.mockReturnValue({
      score: {
        auto_calculated_score: 88,
        manual_adjusted_score: null,
        metric_breakdown: { action_plan_completion: 90, governance_discipline: 70 },
      },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Score 88 · On track')).toBeTruthy();
    expect(screen.getByText('Action Plan Completion')).toBeTruthy();
    expect(screen.getByText('Governance Discipline')).toBeTruthy();
  });

  it('[4] berwenang + non-self + periode aktif → tombol Override muncul', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Override Skor')).toBeTruthy();
  });

  it('[5] tanpa wewenang → tombol Override tidak muncul', async () => {
    mockCan.mockReturnValue(false);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Rina Jaya');
    expect(screen.queryByLabelText('Override Skor')).toBeNull();
  });

  it('[6] profil diri sendiri → tombol Override tidak muncul (anti-self D10)', async () => {
    mockParams.id = 'me';
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Aku');
    expect(screen.queryByLabelText('Override Skor')).toBeNull();
  });
});
