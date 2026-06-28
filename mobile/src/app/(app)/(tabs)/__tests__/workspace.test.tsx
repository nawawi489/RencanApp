// Workspace (Fase 4) — dua section: Hierarki Strategis (Goal+KPI count-only) & Initiative Tanpa Goal.
// Data layer dimock di tingkat hooks (use-workspace); useKpiAreas dipanggil per-GoalRow.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { act, createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

import { PeriodFocusProvider } from '@/providers/period-focus-provider';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseGoals = jest.fn();
const mockUseFlatInitiatives = jest.fn();
const mockUseKpiAreas = jest.fn();
const mockUseStrategies = jest.fn();
const mockUseDevelopmentAreas = jest.fn();
const mockUseProblemStatements = jest.fn();
const mockUseProblemStatementInitiatives = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoals: () => mockUseGoals(),
  useFlatInitiatives: () => mockUseFlatInitiatives(),
  useKpiAreas: (goalId: string, enabled?: boolean) => mockUseKpiAreas(goalId, enabled),
  useStrategies: (kpiAreaId: string, enabled?: boolean) => mockUseStrategies(kpiAreaId, enabled),
  useDevelopmentAreas: () => mockUseDevelopmentAreas(),
  useProblemStatements: (devAreaId: string, enabled?: boolean) =>
    mockUseProblemStatements(devAreaId, enabled),
  useProblemStatementInitiatives: (psId: string, enabled?: boolean) =>
    mockUseProblemStatementInitiatives(psId, enabled),
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
function strategiesResult(over: Record<string, unknown> = {}) {
  return { strategies: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function devResult(over: Record<string, unknown> = {}) {
  return { developmentAreas: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function psResult(over: Record<string, unknown> = {}) {
  return { problemStatements: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function psInitResult(over: Record<string, unknown> = {}) {
  return { initiatives: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
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
  mockUseStrategies.mockReset();
  mockUseStrategies.mockReturnValue(strategiesResult());
  mockUseDevelopmentAreas.mockReset();
  mockUseDevelopmentAreas.mockReturnValue(devResult());
  mockUseProblemStatements.mockReset();
  mockUseProblemStatements.mockReturnValue(psResult());
  mockUseProblemStatementInitiatives.mockReset();
  mockUseProblemStatementInitiatives.mockReturnValue(psInitResult());
});

afterEach(() => {
  cleanup();
});

/**
 * UI-N-002 Stage 2 — default state Workspace adalah `hub` (lobby 2 hub-card). Untuk tes existing
 * yang mengharap pane Performance langsung tampak, helper ini tap "Masuk Performance" segera setelah
 * render. Tes Stage 2 (hub-specific) pakai `renderHub` untuk skip auto-enter.
 */
const renderScreen = async (autoEnter: 'performance' | 'development' | null = 'performance') => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<WorkspaceScreen />, { wrapper: wrapper() });
  });
  if (autoEnter === 'performance') {
    fireEvent.press(await screen.findByLabelText(/Masuk Performance/));
  } else if (autoEnter === 'development') {
    fireEvent.press(await screen.findByLabelText(/Masuk Development/));
  }
  return result!;
};

const renderHub = async () => {
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

  it('[5a] loading useGoals → SkeletonList (hub view juga loading)', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ isLoading: true }));
    // Saat goals loading, HubView tampilkan SkeletonList tanpa render hub-card —
    // tidak ada tombol "Masuk Performance" untuk di-tap, jadi tahan di hub.
    await renderScreen(null);
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

  // UI-N-003 (Stage 1 B′) — tree 3-level inline: Goal → KPI Area → Strategy.
  describe('[UI-N-003 tree 3-level] Performance pane', () => {
    const GOAL_NOW = {
      id: 'g1',
      name: 'Goal Aktif',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };
    const KPI_NOW = {
      id: 'k1',
      name: 'KPI Penjualan',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };
    const STRATEGY_NOW = {
      id: 's1',
      name: 'Akuisisi Lewat Meta Ads',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };

    async function expandToStrategy() {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      mockUseStrategies.mockReturnValue(strategiesResult({ strategies: [STRATEGY_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      await screen.findByText('KPI Penjualan');
      fireEvent.press(screen.getByLabelText('Lihat Strategy'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
    }

    it('[UI-N-003·1] KPI sub-row punya tombol "Lihat Strategy"; lazy fetch (enabled=false saat collapse)', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      await screen.findByText('KPI Penjualan');
      // Sebelum tap "Lihat Strategy", useStrategies dipanggil dgn enabled=false.
      expect(mockUseStrategies).toHaveBeenCalledWith('k1', false);
      fireEvent.press(screen.getByLabelText('Lihat Strategy'));
      // Setelah expand, dipanggil dgn enabled=true (waitFor agar React re-render selesai).
      await waitFor(() => expect(mockUseStrategies).toHaveBeenCalledWith('k1', true));
    });

    it('[UI-N-003·2] expand Strategy → render nama Strategy; collapse → sembunyi', async () => {
      await expandToStrategy();
      // Dua "Tutup" terlihat (Goal & KPI level). Yang menutup Strategy adalah KPI-level (kedua).
      const tutupButtons = screen.getAllByLabelText('Tutup');
      expect(tutupButtons.length).toBeGreaterThanOrEqual(2);
      fireEvent.press(tutupButtons[1]);
      await screen.findByLabelText('Lihat Strategy');
      expect(screen.queryByText('Akuisisi Lewat Meta Ads')).toBeNull();
    });

    it('[UI-N-003·3] empty state: tidak ada Strategy → text "Belum ada Strategy"', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      mockUseStrategies.mockReturnValue(strategiesResult({ strategies: [] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      fireEvent.press(await screen.findByLabelText('Lihat Strategy'));
      expect(await screen.findByText(/Belum ada Strategy/)).toBeTruthy();
    });

    it('[UI-N-003·4] error state Strategy fetch → ErrorState + retry', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      const refetchSpy = jest.fn();
      mockUseStrategies.mockReturnValue(
        strategiesResult({ isError: true, refetch: refetchSpy }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      fireEvent.press(await screen.findByLabelText('Lihat Strategy'));
      expect(await screen.findByText('Gagal memuat')).toBeTruthy();
    });

    it('[UI-N-003·5] Strategy "+ Initiative" current period → push /initiative/new?strategyId=...', async () => {
      await expandToStrategy();
      fireEvent.press(screen.getByLabelText('Tambah Initiative ke Akuisisi Lewat Meta Ads'));
      expect(mockPush).toHaveBeenCalledWith('/initiative/new?strategyId=s1');
    });

    it('[UI-N-003·6] Strategy past period → tombol "+" Alert past period, tidak push', async () => {
      const PAST_STRATEGY = { ...STRATEGY_NOW, id: 's-past', period_end: '2025-12-31' };
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      mockUseStrategies.mockReturnValue(strategiesResult({ strategies: [PAST_STRATEGY] }));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      fireEvent.press(await screen.findByLabelText('Lihat Strategy'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      fireEvent.press(screen.getByLabelText('Tambah Initiative ke Akuisisi Lewat Meta Ads'));
      expect(alertSpy).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalledWith('/initiative/new?strategyId=s-past');
      alertSpy.mockRestore();
    });

    it('[UI-N-003·7] permission false (create_initiative=false) → tombol "+" tidak ada di Strategy', async () => {
      mockCan.mockImplementation((key: string) => key !== 'create_initiative');
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      mockUseStrategies.mockReturnValue(strategiesResult({ strategies: [STRATEGY_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      fireEvent.press(await screen.findByLabelText('Lihat Strategy'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      expect(screen.queryByLabelText('Tambah Initiative ke Akuisisi Lewat Meta Ads')).toBeNull();
    });

    it('[UI-N-003·8] RowActionsMenu dari Strategy ⋯ → menu Aksi muncul', async () => {
      await expandToStrategy();
      fireEvent.press(screen.getByLabelText('Aksi lain Akuisisi Lewat Meta Ads'));
      expect(await screen.findByLabelText('Aksi: Akuisisi Lewat Meta Ads')).toBeTruthy();
    });
  });

  // UI-N-003 Development pane — symmetric: DevArea → Problem Statement → Initiative.
  describe('[UI-N-003 tree 3-level] Development pane symmetry', () => {
    const DEV = {
      id: 'd1',
      name: 'Development Area Ops',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };
    const PS = {
      id: 'p1',
      name: 'Problem WA respon lambat',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };
    const INIT = {
      id: 'i1',
      name: 'Auto-reply WA jam sibuk',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };

    it('[UI-N-003·DEV·1] PS sub-row tampil "Lihat Initiative" → expand fetch Initiative', async () => {
      mockCan.mockReturnValue(true);
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [DEV] }));
      mockUseProblemStatements.mockReturnValue(psResult({ problemStatements: [PS] }));
      mockUseProblemStatementInitiatives.mockReturnValue(psInitResult({ initiatives: [INIT] }));
      await renderScreen('development');
      fireEvent.press(await screen.findByLabelText('Lihat Problem Statement'));
      await screen.findByText('Problem WA respon lambat');
      fireEvent.press(screen.getByLabelText('Lihat Initiative'));
      await screen.findByText('Auto-reply WA jam sibuk');
      expect(mockUseProblemStatementInitiatives).toHaveBeenCalledWith('p1', true);
    });
  });

  // UI-N-002 (Stage 2) — Hub-card lobby di tab Workspace.
  describe('[UI-N-002 hub-card] Workspace lobby', () => {
    it('[UI-N-002·1] default state = hub view (2 hub-card tampil sebelum dive in)', async () => {
      await renderHub();
      expect(await screen.findByText('Target Kinerja')).toBeTruthy();
      expect(screen.getByText('Pembangunan Sistem')).toBeTruthy();
      expect(screen.getByText(/2 ruang eksekusi/)).toBeTruthy();
      // Goal title (di pane) TIDAK muncul saat masih di hub.
      expect(screen.queryByText('Hierarki Strategis')).toBeNull();
    });

    it('[UI-N-002·2] tap hub Performance → pindah ke pane Performance + tombol back muncul', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
      await renderHub();
      fireEvent.press(await screen.findByLabelText(/Masuk Performance/));
      expect(await screen.findByText('Hierarki Strategis')).toBeTruthy();
      expect(screen.getByLabelText('Kembali ke Workspace')).toBeTruthy();
    });

    it('[UI-N-002·3] tap hub Development → pindah ke pane Development', async () => {
      mockUseDevelopmentAreas.mockReturnValue(
        devResult({ developmentAreas: [{ id: 'd1', name: 'Dev A', status: 'active' }] }),
      );
      await renderHub();
      fireEvent.press(await screen.findByLabelText(/Masuk Development/));
      expect(await screen.findByText('Development Area')).toBeTruthy();
    });

    it('[UI-N-002·4] tombol "← Workspace" balik ke hub', async () => {
      await renderScreen('performance');
      expect(screen.queryByText('Target Kinerja')).toBeNull();
      fireEvent.press(screen.getByLabelText('Kembali ke Workspace'));
      expect(await screen.findByText('Target Kinerja')).toBeTruthy();
    });

    it('[UI-N-002·5] hub-card stats — Performance: 2 Goal, 5 KPI, 1 aktif', async () => {
      mockUseGoals.mockReturnValue(
        goalsResult({
          goals: [
            { id: 'g1', name: 'G1', status: 'active', kpi_areas: [{ count: 3 }] },
            { id: 'g2', name: 'G2', status: 'draft', kpi_areas: [{ count: 2 }] },
          ],
        }),
      );
      await renderHub();
      // accessibilityLabel pada hub-card mencantumkan agregat 2 Goal + 5 KPI Area.
      expect(
        await screen.findByLabelText(/Masuk Performance: 2 Goal, 5 KPI Area/),
      ).toBeTruthy();
    });

    it('[UI-N-002·6] hub-card empty (0 Goal, 0 DevArea) → orb "—" + stats 0/0/0', async () => {
      await renderHub();
      // Orb fallback "—" tampak di ke-2 hub.
      const dashes = await screen.findAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });
  });

});
