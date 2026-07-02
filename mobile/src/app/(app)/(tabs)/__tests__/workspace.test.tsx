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

// WSA-04 — guard MBR di tree: KpiAreaSubRow fetch compliance kpi_area→strategy.
const mockUseMbrCompliance = jest.fn();
jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: (...a: unknown[]) => mockUseMbrCompliance(...a),
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

/**
 * UI-S-W08 — hitung node dgn style `opacity: 0.5` (inline, dari PastDim) di JSON tree.
 * Dipakai untuk memastikan dim "periode lewat" TIDAK bertumpuk di tree bersarang.
 */
function countOpacityHalf(node: unknown): number {
  if (node == null || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((acc: number, n) => acc + countOpacityHalf(n), 0);
  const el = node as { props?: { style?: unknown }; children?: unknown };
  const styles = Array.isArray(el.props?.style) ? el.props!.style : [el.props?.style];
  let count = 0;
  for (const s of styles as unknown[]) {
    if (s && typeof s === 'object' && (s as { opacity?: number }).opacity === 0.5) count += 1;
  }
  return count + countOpacityHalf(el.children ?? null);
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
  mockUseMbrCompliance.mockReset();
  // Default: compliance belum ada (fail-open di tree — jangan blokir sebelum data tahu).
  mockUseMbrCompliance.mockReturnValue({ compliance: undefined, isCompliant: true });
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
    fireEvent.press(await screen.findByText('+ Goal'));
    expect(mockPush).toHaveBeenCalledWith('/goal-wizard');
  });

  it('[2b] can(create_goal) false → tombol sembunyi + EmptyState saat goals kosong', async () => {
    mockCan.mockReturnValue(false);
    await renderScreen();
    expect(await screen.findByText('Belum ada Goal aktif di periode ini.')).toBeTruthy();
    expect(screen.queryByText('+ Goal')).toBeNull();
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

  // WSA-03 — kategori tree card ditandai letter-badge pill (§9), bukan hanya teks judul.
  it('[WSA-03] Goal card menampilkan pill kategori "Goal"; KPI card pill "KPI Area"', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ id: 'g1', name: 'Goal A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }],
      }),
    );
    mockUseKpiAreas.mockReturnValue(
      kpiResult({ kpiAreas: [{ id: 'k1', name: 'KPI A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
    );
    await renderScreen();
    expect(await screen.findByLabelText('Kategori: Goal')).toBeTruthy();
    fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
    expect(await screen.findByLabelText('Kategori: KPI Area')).toBeTruthy();
  });

  // WSA-17 — label "+" konteks harus TERLIHAT (bukan hanya accessibilityLabel). Spec §11.
  it('[WSA-17·1] Goal "+" menampilkan teks "+ KPI Area"', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ id: 'g1', name: 'Goal A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }],
      }),
    );
    await renderScreen();
    expect(await screen.findByText('+ KPI Area')).toBeTruthy();
  });

  it('[WSA-17·2] KPI Area "+" menampilkan teks "+ Strategy"; Strategy "+" teks "+ Initiative"', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ id: 'g1', name: 'Goal A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }],
      }),
    );
    mockUseKpiAreas.mockReturnValue(
      kpiResult({ kpiAreas: [{ id: 'k1', name: 'KPI A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
    );
    mockUseStrategies.mockReturnValue(
      strategiesResult({ strategies: [{ id: 's1', name: 'Strat A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
    );
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
    expect(await screen.findByText('+ Strategy')).toBeTruthy();
    fireEvent.press(await screen.findByLabelText('Lihat Strategy'));
    expect(await screen.findByText('+ Initiative')).toBeTruthy();
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
      'Periode ini sudah menjadi Archive',
      'Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.',
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

    // WSA-13 — "+ Strategy" digate key presisi `create_strategy` (bukan proxy `create_kpi_area`).
    it('[WSA-13·1] "+ Strategy" digate create_strategy: create_kpi_area true tapi create_strategy false → tombol sembunyi', async () => {
      mockCan.mockImplementation((key: string) => key !== 'create_strategy');
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      await screen.findByText('KPI Penjualan');
      expect(screen.queryByLabelText('Tambah Strategy ke KPI Penjualan')).toBeNull();
    });

    it('[WSA-13·2] "+ Strategy" tampil saat create_strategy true (create_kpi_area false)', async () => {
      mockCan.mockImplementation((key: string) => key === 'create_strategy');
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      await screen.findByText('KPI Penjualan');
      expect(screen.getByLabelText('Tambah Strategy ke KPI Penjualan')).toBeTruthy();
    });

    // WSA-04 — guard MBR: KPI Area belum cukup Strategy → tombol "+ Initiative" di Strategy
    // card ter-guard: tap TIDAK push, tampilkan Alert §12.3.
    const INCOMPLETE_KPI_MBR = {
      compliance: {
        child_card_type: 'strategy' as const,
        child_count: 2,
        min_count: 3,
        enforcement_mode: 'blokir_akses_turunan' as const,
        is_compliant: false,
      },
      isCompliant: false,
    };

    it('[WSA-04·1] KPI belum cukup Strategy → tap "+ Initiative" → Alert §12.3, TIDAK push', async () => {
      mockCan.mockReturnValue(true);
      mockUseMbrCompliance.mockReturnValue(INCOMPLETE_KPI_MBR);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      mockUseStrategies.mockReturnValue(strategiesResult({ strategies: [STRATEGY_NOW] }));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      fireEvent.press(await screen.findByLabelText('Lihat Strategy'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      fireEvent.press(screen.getByLabelText('Tambah Initiative ke Akuisisi Lewat Meta Ads'));
      expect(alertSpy).toHaveBeenCalledWith(
        'Kelengkapan Perencanaan',
        expect.stringContaining('baru tombol + Initiative aktif'),
      );
      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/initiative/new'));
      alertSpy.mockRestore();
    });

    it('[WSA-04·2] KPI compliant → "+ Initiative" push normal (tanpa Alert guard)', async () => {
      mockCan.mockReturnValue(true);
      mockUseMbrCompliance.mockReturnValue({
        compliance: { ...INCOMPLETE_KPI_MBR.compliance, child_count: 3, is_compliant: true },
        isCompliant: true,
      });
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [KPI_NOW] }));
      mockUseStrategies.mockReturnValue(strategiesResult({ strategies: [STRATEGY_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      fireEvent.press(await screen.findByLabelText('Lihat Strategy'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      fireEvent.press(screen.getByLabelText('Tambah Initiative ke Akuisisi Lewat Meta Ads'));
      expect(mockPush).toHaveBeenCalledWith('/initiative/new?strategyId=s1');
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

    // WSA-13 — "+ Problem Statement" digate key presisi `create_problem_statement`.
    it('[WSA-13·DEV] "+ Problem Statement" digate create_problem_statement (bukan proxy create_development_area)', async () => {
      mockCan.mockImplementation((key: string) => key !== 'create_problem_statement');
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [DEV] }));
      await renderScreen('development');
      await screen.findByText('Development Area Ops');
      expect(screen.queryByLabelText('Tambah Problem Statement ke Development Area Ops')).toBeNull();
    });
  });

  // UI-N-002 (Stage 2) — Hub-card lobby di tab Workspace.
  describe('[UI-N-002 hub-card] Workspace lobby', () => {
    it('[UI-N-002·1] default state = hub view (2 hub-card tampil sebelum dive in)', async () => {
      await renderHub();
      expect(await screen.findByText('Target Kinerja')).toBeTruthy();
      expect(screen.getByText('Pembangunan Sistem')).toBeTruthy();
      // WSA-12: section title kanan "2 ruang" (bukan subtitle kalimat).
      expect(screen.getByText('2 ruang')).toBeTruthy();
      // Tombol masuk visible label spec = "Masuk" (bukan "Masuk Performance").
      expect(screen.getAllByText('Masuk').length).toBe(2);
      // Goal title (di pane) TIDAK muncul saat masih di hub.
      expect(screen.queryByText('Hierarki Strategis')).toBeNull();
    });

    it('[UI-N-002·1b] WSA-12 stat label ruang: Performance "Notif", Development "Area"/"Problem Statement"', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
      mockUseDevelopmentAreas.mockReturnValue(
        devResult({ developmentAreas: [{ id: 'd1', name: 'Dev A', status: 'active' }] }),
      );
      await renderHub();
      // Kedua hub-card memakai label kolom-3 "Notif" → dua match.
      expect((await screen.findAllByText('Notif')).length).toBe(2);
      expect(screen.getByText('Area')).toBeTruthy();
      expect(screen.getByText('Problem Statement')).toBeTruthy();
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
      // "Development Area" kini muncul ganda (section title + pill kategori) — pakai nama
      // card unik untuk konfirmasi kita di pane Development.
      expect(await screen.findByText('Dev A')).toBeTruthy();
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

    // WSA-05 — Help modal `?` di hub card: buka konten spec §5; TIDAK menavigasi (onEnter).
    it('[WSA-05·1] tap `?` Performance → modal konten §5 muncul, TIDAK masuk pane', async () => {
      await renderHub();
      fireEvent.press(await screen.findByLabelText('Bantuan Performance'));
      expect(await screen.findByText('Apa itu Performance Workspace?')).toBeTruthy();
      expect(screen.getByText('Ruang mana yang dipakai untuk mengejar target kinerja?')).toBeTruthy();
      expect(
        screen.getByText('Fokus pada hasil terukur seperti omset, profit, customer, dan output.'),
      ).toBeTruthy();
      // Masih di hub (tidak masuk pane Performance).
      expect(screen.queryByText('Hierarki Strategis')).toBeNull();
    });

    it('[WSA-05·2] tap `?` Development → modal konten §5 Development', async () => {
      await renderHub();
      fireEvent.press(await screen.findByLabelText('Bantuan Development'));
      expect(await screen.findByText('Apa itu Development Workspace?')).toBeTruthy();
    });

    // WSA-06 — search overview di atas card; placeholder spec §4.1; menuju route /search.
    it('[WSA-06] search bar overview → placeholder spec, tap navigasi /search', async () => {
      await renderHub();
      const search = await screen.findByLabelText('Cari Workspace');
      expect(screen.getByText('Cari Goal, KPI Area, Initiative, Action Plan')).toBeTruthy();
      fireEvent.press(search);
      expect(mockPush).toHaveBeenCalledWith('/search');
    });
  });

  // UI-S-W07 (design-consultation 2026-07-02) — expand level-1 (Goal/Dev Area) wajib punya
  // state loading/kosong/error, paritas dgn level-2 (KpiAreaSubRow/ProblemStatementSubRow).
  describe('[UI-S-W07] expand level-1: loading/kosong/error', () => {
    const GOAL_NOW = {
      id: 'g1',
      name: 'Goal Aktif',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };
    const DEV_NOW = {
      id: 'd1',
      name: 'Development Area Ops',
      status: 'active',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    };

    it('[W07·1] expand Goal saat KPI loading → SkeletonList tampil', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ isLoading: true }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      expect((await screen.findAllByLabelText('Memuat…')).length).toBeGreaterThan(0);
    });

    it('[W07·2] expand Goal tanpa KPI Area → hint "Belum ada KPI Area"', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ kpiAreas: [] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      expect(await screen.findByText(/Belum ada KPI Area/)).toBeTruthy();
    });

    it('[W07·3] expand Goal error fetch KPI → ErrorState', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseKpiAreas.mockReturnValue(kpiResult({ isError: true }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      expect(await screen.findByText('Gagal memuat')).toBeTruthy();
    });

    it('[W07·4] expand Dev Area tanpa Problem Statement → hint "Belum ada Problem Statement"', async () => {
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [DEV_NOW] }));
      mockUseProblemStatements.mockReturnValue(psResult({ problemStatements: [] }));
      await renderScreen('development');
      fireEvent.press(await screen.findByLabelText('Lihat Problem Statement'));
      expect(await screen.findByText(/Belum ada Problem Statement/)).toBeTruthy();
    });
  });

  // UI-S-W08 (design-consultation 2026-07-02) — dim "periode lewat" tidak boleh bertumpuk:
  // opacity 0.5 per level bersarang = 0.125 efektif di level-3 → teks tak terbaca (DESIGN §4).
  describe('[UI-S-W08] dim periode-lewat single-layer', () => {
    const PAST_PERIOD = { period_start: '2025-01-01', period_end: '2025-12-31' };
    const NOW_PERIOD = { period_start: '2026-01-01', period_end: '2026-12-31' };

    it('[W08·1] Goal+KPI+Strategy semuanya past → tepat 1 lapis opacity 0.5, badge tetap 3×', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(
        goalsResult({ goals: [{ id: 'g', name: 'Goal Past', status: 'active', ...PAST_PERIOD }] }),
      );
      mockUseKpiAreas.mockReturnValue(
        kpiResult({ kpiAreas: [{ id: 'k', name: 'KPI Past', status: 'active', ...PAST_PERIOD }] }),
      );
      mockUseStrategies.mockReturnValue(
        strategiesResult({
          strategies: [{ id: 's', name: 'Strategy Past', status: 'active', ...PAST_PERIOD }],
        }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      await screen.findByText('KPI Past');
      fireEvent.press(screen.getByLabelText('Lihat Strategy'));
      await screen.findByText('Strategy Past');
      expect(countOpacityHalf(screen.toJSON())).toBe(1);
      // Sinyal teks per-node tetap utuh (warna ≠ satu-satunya sinyal, DESIGN §4).
      expect(screen.getAllByText('Periode lewat').length).toBe(3);
    });

    it('[W08·2] hanya Strategy yang past → dim 1 lapis di level-3', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(
        goalsResult({ goals: [{ id: 'g', name: 'Goal Aktif', status: 'active', ...NOW_PERIOD }] }),
      );
      mockUseKpiAreas.mockReturnValue(
        kpiResult({ kpiAreas: [{ id: 'k', name: 'KPI Aktif', status: 'active', ...NOW_PERIOD }] }),
      );
      mockUseStrategies.mockReturnValue(
        strategiesResult({
          strategies: [{ id: 's', name: 'Strategy Past', status: 'active', ...PAST_PERIOD }],
        }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Lihat KPI Area'));
      await screen.findByText('KPI Aktif');
      fireEvent.press(screen.getByLabelText('Lihat Strategy'));
      await screen.findByText('Strategy Past');
      expect(countOpacityHalf(screen.toJSON())).toBe(1);
      expect(screen.getAllByText('Periode lewat').length).toBe(1);
    });
  });

});
