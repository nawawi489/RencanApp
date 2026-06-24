// Workspace (Fase 4) — dua section: Hierarki Strategis (Goal+KPI count-only) & Initiative Tanpa Goal.
// Data layer dimock di tingkat hooks (use-workspace); useKpiAreas dipanggil per-GoalRow.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseGoals = jest.fn();
const mockUseFlatInitiatives = jest.fn();
const mockUseKpiAreas = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoals: () => mockUseGoals(),
  useFlatInitiatives: () => mockUseFlatInitiatives(),
  useKpiAreas: (goalId: string) => mockUseKpiAreas(goalId),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: mockCan }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
}));

// eslint-disable-next-line import/first
import WorkspaceScreen from '../workspace';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

function goalsResult(over: Record<string, unknown> = {}) {
  return { goals: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function flatResult(over: Record<string, unknown> = {}) {
  return { initiatives: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function kpiResult(over: Record<string, unknown> = {}) {
  return { kpiAreas: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}

const GOAL = { id: 'g1', name: 'Tumbuhkan Revenue', status: 'active' };
const FLAT = { id: 'fi1', name: 'Initiative Lepas', status: 'draft' };

beforeEach(() => {
  mockUseGoals.mockReset();
  mockUseFlatInitiatives.mockReset();
  mockUseKpiAreas.mockReset();
  mockCan.mockReset();
  mockPush.mockReset();
  mockCan.mockReturnValue(false);
  mockUseGoals.mockReturnValue(goalsResult());
  mockUseFlatInitiatives.mockReturnValue(flatResult());
  mockUseKpiAreas.mockReturnValue(kpiResult());
});

afterEach(() => {
  cleanup();
});

const renderScreen = () => render(<WorkspaceScreen />, { wrapper: wrapper() });

describe('WorkspaceScreen', () => {
  it('[1] dua section render; goal & flat-initiative tampil terpisah', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseFlatInitiatives.mockReturnValue(flatResult({ initiatives: [FLAT] }));
    await renderScreen();

    expect(await screen.findByText('Hierarki Strategis')).toBeTruthy();
    expect(screen.getByText('Initiative Tanpa Goal')).toBeTruthy();
    expect(screen.getByText('Tumbuhkan Revenue')).toBeTruthy();
    expect(screen.getByText('Initiative Lepas')).toBeTruthy();
  });

  it('[2a] can(create_goal) true → tombol tampil & push goal-wizard', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    await renderScreen();
    fireEvent.press(await screen.findByText('+ Goal Baru'));
    expect(mockPush).toHaveBeenCalledWith('/goal-wizard');
  });

  it('[2b] can(create_goal) false → tombol sembunyi + EmptyState saat goals kosong', async () => {
    mockCan.mockReturnValue(false);
    await renderScreen();
    expect(await screen.findByText('Belum ada Goal')).toBeTruthy();
    expect(screen.queryByText('+ Goal Baru')).toBeNull();
  });

  it('[3a] GoalRow count dari embedded kpi_areas(count) → "KPI Area: 2"', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [{ ...GOAL, kpi_areas: [{ count: 2 }] }] }));
    await renderScreen();
    expect(await screen.findByText('KPI Area: 2')).toBeTruthy();
  });

  it('[3b] GoalRow count tak tersedia (kpi_areas kosong) → "KPI Area: —"', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [{ ...GOAL, kpi_areas: [] }] }));
    await renderScreen();
    expect(await screen.findByText('KPI Area: —')).toBeTruthy();
  });

  it('[4] expand/collapse anak KPI', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseKpiAreas.mockReturnValue(
      kpiResult({ kpiAreas: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
    );
    await renderScreen();

    expect(screen.queryByText('KPI Penjualan')).toBeNull();
    fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
    expect(await screen.findByText('KPI Penjualan')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Tutup'));
    await screen.findByLabelText('Lihat KPI Area');
    expect(screen.queryByText('KPI Penjualan')).toBeNull();
  });

  it('[5a] loading useGoals → SkeletonList', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ isLoading: true }));
    await renderScreen();
    expect(screen.getAllByLabelText('Memuat…').length).toBeGreaterThan(0);
  });

  it('[5b] error useGoals → ErrorState', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ isError: true }));
    await renderScreen();
    expect(await screen.findByText('Gagal memuat')).toBeTruthy();
  });
});
