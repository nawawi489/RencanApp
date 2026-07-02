import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockMine = jest.fn();
const mockReview = jest.fn();
jest.mock('@/lib/cards', () => ({
  ...jest.requireActual('@/lib/cards'),
  listMyActionPlans: () => mockMine(),
  listPendingReviews: () => mockReview(),
}));

const mockToday = jest.fn();
const mockTodayRepeat = jest.fn();
const mockOverdue = jest.fn();
const mockNear = jest.fn();
const mockKpiAttn = jest.fn();
jest.mock('@/lib/home', () => ({
  __esModule: true,
  getOrgToday: () => mockToday(),
  listTodayRepeatInstances: () => mockTodayRepeat(),
  listOverdueItems: () => mockOverdue(),
  listNearDeadline: () => mockNear(),
  listKpiNeedsAttention: () => mockKpiAttn(),
}));

jest.mock('@/hooks/use-profile', () => ({
  ...jest.requireActual('@/hooks/use-profile'),
  useProfile: () => ({
    profile: { full_name: 'Rina Jaya', id: 'u1', created_at: '2020-01-01T00:00:00Z' },
    isLoading: false,
    can: () => false,
  }),
}));

jest.mock('@/prototype/utils/fidelity-mode', () => ({
  getPrototypeMode: () => true,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: () => {},
}));

import HomeRoute from '@/app/(app)/(tabs)/index';
import PrototypeHomeScreen from '@/prototype/screens/home';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'PrototypeHomeRouteWrapper';
  return Wrapper;
}

describe('Home route adapter', () => {
  beforeEach(() => {
    mockMine.mockReset();
    mockReview.mockReset();
    mockToday.mockReset();
    mockTodayRepeat.mockReset();
    mockOverdue.mockReset();
    mockNear.mockReset();
    mockKpiAttn.mockReset();

    mockMine.mockResolvedValue([]);
    mockReview.mockResolvedValue([]);
    mockToday.mockResolvedValue('2026-06-24');
    mockTodayRepeat.mockResolvedValue([]);
    mockOverdue.mockResolvedValue([]);
    mockNear.mockResolvedValue([]);
    mockKpiAttn.mockResolvedValue([]);
  });

  it('renders the prototype home shell in prototype mode', async () => {
    await render(<HomeRoute />, { wrapper: wrapper() });

    expect(screen.getByText('Pusat Kendali Hari Ini')).toBeTruthy();
  });
});

describe('PrototypeHomeScreen', () => {
  it('renders the prototype shell and home sections', async () => {
    await render(<PrototypeHomeScreen />);

    expect(screen.getByText('Rencanaapp')).toBeTruthy();
    expect(screen.getByText('Pusat Kendali Hari Ini')).toBeTruthy();
    expect(screen.getByText('Selamat pagi, Rina.')).toBeTruthy();
    expect(screen.getByText('Prioritas')).toBeTruthy();
    expect(screen.getByText('Fokus Hari Ini')).toBeTruthy();
    expect(screen.getByText('Snapshot Tim')).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
  });
});
