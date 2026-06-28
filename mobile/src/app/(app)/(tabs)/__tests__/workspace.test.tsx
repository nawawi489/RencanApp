// Workspace (Fase 4) — dua section: Hierarki Strategis (Goal+KPI count-only) & Initiative Tanpa Goal.
// Data layer dimock di tingkat hooks (use-workspace); useKpiAreas dipanggil per-GoalRow.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { act, createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

import { PeriodFocusProvider } from '@/providers/period-focus-provider';

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

// Anchor periode untuk seluruh test workspace: Juni 2026 (Q2). Deterministik agar
// klausa "Periode lewat" pada Goal/KPI dapat dites tanpa bergantung jam mesin.
const NOW = new Date(2026, 5, 15);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(
      QueryClientProvider,
      { client },
      createElement(PeriodFocusProvider, { now: NOW }, children),
    );
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

beforeEach(async () => {
  await AsyncStorage.clear();
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

const renderScreen = async () => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<WorkspaceScreen />, { wrapper: wrapper() });
  });
  return result!;
};

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

  // S1 — Period Focus Engine wiring (PRD V1.8.2 §7.6 / §7.7).
  it('[S1-1] PeriodSwitcher tampil di header (label "Periode aktif" + "Juni 2026")', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    await renderScreen();
    expect(await screen.findByText('Periode aktif')).toBeTruthy();
    expect(screen.getByText('Juni 2026')).toBeTruthy();
  });

  it('[S1-2] Goal dgn period_end < Jun 2026 → label berakhiran "Periode lewat"', async () => {
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-past',
            name: 'Goal Lewat',
            status: 'active',
            period_start: '2025-01-01',
            period_end: '2025-12-31',
          },
        ],
      }),
    );
    await renderScreen();
    // S3: full-row Pressable diganti — title text tetap muncul plus PastPeriodBadge.
    expect(await screen.findByText('Goal Lewat')).toBeTruthy();
    expect(screen.getByText('Periode lewat')).toBeTruthy();
  });

  it('[S1-3] Goal aktif (period overlap Jun 2026) → label tanpa "Periode lewat"', async () => {
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-active',
            name: 'Goal Aktif',
            status: 'active',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    await renderScreen();
    // S3: aksesibilitas via Detail button label baru.
    expect(await screen.findByLabelText('Buka detail Goal Aktif')).toBeTruthy();
    expect(screen.queryByText('Periode lewat')).toBeNull();
  });

  // S3 — Card Interaction Rule (PRD V1.8.2 §7.3 / §7.7).
  it('[S3-1] Detail button → push detail; tap area judul TIDAK push', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-now',
            name: 'Goal Now',
            status: 'active',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    await renderScreen();
    // Tap judul text (Pressable lama) — tidak ada handler nav.
    fireEvent.press(await screen.findByText('Goal Now'));
    expect(mockPush).not.toHaveBeenCalledWith('/goal/g-now');
    // Tap Detail button → push.
    fireEvent.press(screen.getByLabelText('Buka detail Goal Now'));
    expect(mockPush).toHaveBeenCalledWith('/goal/g-now');
  });

  it('[S3-2] tombol "+" current period → push /kpi-area/new?goalId=...', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-cur',
            name: 'Goal Cur',
            status: 'active',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Tambah KPI Area ke Goal Cur'));
    expect(mockPush).toHaveBeenCalledWith('/kpi-area/new?goalId=g-cur');
  });

  it('[S3-3] tombol "+" past period → showPastPeriodAlert dipanggil, push TIDAK', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-past',
            name: 'Goal Past',
            status: 'active',
            period_start: '2025-01-01',
            period_end: '2025-12-31',
          },
        ],
      }),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Tambah KPI Area ke Goal Past'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Periode sudah lewat',
      expect.stringContaining('Goal Past'),
    );
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/kpi-area/new'));
    alertSpy.mockRestore();
  });

  it('[S3-4] tombol "⋯" → RowActionsMenu terbuka (judul card di header sheet)', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-m',
            name: 'Goal Menu',
            status: 'active',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Aksi lain Goal Menu'));
    expect(await screen.findByLabelText('Aksi: Goal Menu')).toBeTruthy();
    expect(screen.getByLabelText('Ubah')).toBeTruthy();
    expect(screen.getByLabelText('Arsipkan')).toBeTruthy();
  });
});
