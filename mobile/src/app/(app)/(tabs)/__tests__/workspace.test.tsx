// Workspace (Fase 4) — dua section: Hierarki Strategis (Goal+KPI count-only) & Rencana Aksi Tanpa Goal.
// Data layer dimock di tingkat hooks (use-workspace); useStrategies dipanggil per-GoalRow.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { act, createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

import { PeriodFocusProvider } from '@/providers/period-focus-provider';
import { WS_DEV_COPY } from '@/lib/workspace-copy';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockUseGoals = jest.fn();
const mockUseFlatActionPlans = jest.fn();
const mockUseStrategies = jest.fn();
const mockUseInitiatives = jest.fn();
const mockUseDevelopmentAreas = jest.fn();
const mockUseProblemStatements = jest.fn();
const mockUseProblemStatementActionPlans = jest.fn();
const mockUseInitiativeActionPlans = jest.fn();
const mockUseActionPlanTasks = jest.fn();
const mockUseCardProgress = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useCardProgress: (ids: string[]) => mockUseCardProgress(ids),
  useGoals: () => mockUseGoals(),
  useFlatActionPlans: () => mockUseFlatActionPlans(),
  useStrategies: (goalId: string, enabled?: boolean) => mockUseStrategies(goalId, enabled),
  useInitiatives: (strategyId: string, enabled?: boolean) => mockUseInitiatives(strategyId, enabled),
  useDevelopmentAreas: () => mockUseDevelopmentAreas(),
  useProblemStatements: (devAreaId: string, enabled?: boolean) =>
    mockUseProblemStatements(devAreaId, enabled),
  useProblemStatementActionPlans: (psId: string, enabled?: boolean) =>
    mockUseProblemStatementActionPlans(psId, enabled),
  useInitiativeActionPlans: (initiativeId: string, enabled?: boolean) =>
    mockUseInitiativeActionPlans(initiativeId, enabled),
  useActionPlanTasks: (actionPlanId: string, enabled?: boolean) =>
    mockUseActionPlanTasks(actionPlanId, enabled),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: mockCan }),
}));

// WSA-04 — guard MBR di tree: StrategySubRow fetch compliance strategy→initiative.
const mockUseMbrCompliance = jest.fn();
jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: (...a: unknown[]) => mockUseMbrCompliance(...a),
}));

// WSA-14 — action sheet Arsipkan → archiveCard.
const mockArchive = jest.fn();
jest.mock('@/hooks/use-governance-admin', () => ({
  __esModule: true,
  useArchiveActions: () => ({ archive: mockArchive, isPending: false }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
// Default segments untuk pane: AppHeader akan tampilkan back button.
let mockSegments: string[] = ['(app)', '(tabs)', 'workspace', 'performance'];
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
    navigate: jest.fn(),
  }),
  useSegments: () => mockSegments,
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
}));

// WSA-19 — Workspace kini nested stack: hub (index) + pane deep-linkable. Test merender screen
// per-route langsung dari shared module (bukan lewat state lokal hub→pane).
// eslint-disable-next-line import/first
import { HubScreen, PerformanceScreen, DevelopmentScreen } from '@/screens/workspace-screen';

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
  return { action_plans: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function kpiResult(over: Record<string, unknown> = {}) {
  return { strategies: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function initiativesResult(over: Record<string, unknown> = {}) {
  return { initiatives: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function devResult(over: Record<string, unknown> = {}) {
  return { developmentAreas: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function psResult(over: Record<string, unknown> = {}) {
  return { problemStatements: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function psInitResult(over: Record<string, unknown> = {}) {
  return { action_plans: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function stratInitResult(over: Record<string, unknown> = {}) {
  return { action_plans: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
}
function taskResult(over: Record<string, unknown> = {}) {
  return { tasks: [], isLoading: false, isError: false, refetch: jest.fn(), ...over };
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

function flattenStyle(style: unknown) {
  if (Array.isArray(style)) return Object.assign({}, ...style);
  return style ?? {};
}

// Tipe node diturunkan dari return query RNTL (bukan `react-test-renderer` langsung) agar
// selalu cocok dengan yang dikembalikan screen.* — RNTL memakai `TestInstance` internalnya.
type RntlInstance = Awaited<ReturnType<typeof screen.findByText>>;

function hasTextDescendant(node: RntlInstance, text: string): boolean {
  for (const child of node.children) {
    if (typeof child === 'string' && child.includes(text)) return true;
    if (typeof child !== 'string' && hasTextDescendant(child, text)) return true;
  }
  return false;
}

// Cari pembungkus kartu tree terdekat via `testID` `tree-card-*` — react-native-css
// menanggalkan `className` dari host instance, jadi penanda struktur pakai testID (dipertahankan RN).
function findClosestSectionCardHost(node: RntlInstance): RntlInstance | null {
  let current: RntlInstance | null = node;
  while (current) {
    const testID = typeof current.props?.testID === 'string' ? current.props.testID : undefined;
    if (testID?.startsWith('tree-card-')) return current;
    current = current.parent;
  }
  return null;
}

const GOAL = { id: 'g1', name: 'Tumbuhkan Revenue', status: 'active' };
const FLAT = { id: 'fi1', name: 'Rencana Aksi Lepas', status: 'draft' };

beforeEach(async () => {
  await AsyncStorage.clear();
  mockUseGoals.mockReset();
  mockUseFlatActionPlans.mockReset();
  mockUseStrategies.mockReset();
  mockCan.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(true);
  mockCan.mockReturnValue(false);
  mockUseGoals.mockReturnValue(goalsResult());
  mockUseFlatActionPlans.mockReturnValue(flatResult());
  mockUseStrategies.mockReturnValue(kpiResult());
  mockUseInitiatives.mockReset();
  mockUseInitiatives.mockReturnValue(initiativesResult());
  mockUseDevelopmentAreas.mockReset();
  mockUseDevelopmentAreas.mockReturnValue(devResult());
  mockUseProblemStatements.mockReset();
  mockUseProblemStatements.mockReturnValue(psResult());
  mockUseProblemStatementActionPlans.mockReset();
  mockUseProblemStatementActionPlans.mockReturnValue(psInitResult());
  mockUseMbrCompliance.mockReset();
  // Default: compliance belum ada (fail-open di tree — jangan blokir sebelum data tahu).
  mockUseMbrCompliance.mockReturnValue({ compliance: undefined, isCompliant: true });
  mockUseInitiativeActionPlans.mockReset();
  mockUseInitiativeActionPlans.mockReturnValue(stratInitResult());
  mockUseActionPlanTasks.mockReset();
  mockUseActionPlanTasks.mockReturnValue(taskResult());
  mockUseCardProgress.mockReset();
  // Default WSA-15: progress belum ada → progressOf null (orb render '—'); test orb override per-kasus.
  mockUseCardProgress.mockReturnValue({ progressOf: () => null, measuredOf: () => false, isLoading: false, isError: false });
  mockArchive.mockReset();
  mockArchive.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

/**
 * WSA-19 — pane deep-linkable: render screen route langsung. `'performance'`→PerformanceScreen,
 * `'development'`→DevelopmentScreen. Tes hub-specific pakai `renderHub`.
 */
const renderScreen = async (which: 'performance' | 'development' = 'performance') => {
  const Screen = which === 'development' ? DevelopmentScreen : PerformanceScreen;
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<Screen />, { wrapper: wrapper() });
  });
  return result!;
};

const renderHub = async () => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<HubScreen />, { wrapper: wrapper() });
  });
  return result!;
};

describe('WorkspaceScreen', () => {
  it('[1] hierarki Goal render; WSA-16: section "Rencana Aksi Tanpa Goal" TIDAK ada di pane', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseFlatActionPlans.mockReturnValue(flatResult({ action_plans: [FLAT] }));
    await renderScreen();

    expect(await screen.findByText('Hierarki Strategis')).toBeTruthy();
    expect(screen.getByText('Tumbuhkan Revenue')).toBeTruthy();
    // WSA-16 — Rencana Aksi yatim pindah ke Search/Menu; section + card tak dirender di pane.
    expect(screen.queryByText('Rencana Aksi Tanpa Goal')).toBeNull();
    expect(screen.queryByText('Rencana Aksi Lepas')).toBeNull();
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
    // WS-05 — copy jujur: Goal di-scope per TAHUN (bukan periode bulan).
    expect(await screen.findByText('Belum ada Goal di tahun ini.')).toBeTruthy();
    expect(screen.queryByText('+ Goal')).toBeNull();
  });

  // WS-04 — archive period gating: saat periode fokus arsip, tombol section
  // "+ Goal" dan empty-state action harus disabled+redup, dan tetap tampil.
  // NOW anchor = Juni 2026; seed AsyncStorage focus = Januari 2026 (past).
  describe('[WS-04] archive-period gating', () => {
    beforeEach(async () => {
      await AsyncStorage.setItem(
        'rencanaapp:period-focus',
        JSON.stringify({ mode: 'month', year: 2026, month: 1 }),
      );
    });

    it('[WS-04·1] AC-WS04-2: fokus arsip → "+ Goal" section-level accessibilityState.disabled=true + tetap tampil', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
      await renderScreen();
      // Tombol tetap tampil (label a11y menyebut alasan arsip).
      const btn = await screen.findByLabelText('+ Goal (periode arsip — nonaktif)');
      expect(btn).toBeTruthy();
      expect(btn.props.accessibilityState?.disabled).toBe(true);
    });

    it('[WS-04·2] AC-WS04-3: press "+ Goal" saat arsip → showPastPeriodAlert(), TIDAK router.push', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('+ Goal (periode arsip — nonaktif)'));
      expect(alertSpy).toHaveBeenCalledWith(
        'Periode ini sudah menjadi Archive',
        'Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.',
        // showAlert (seam) meneruskan buttons=undefined ke Alert.alert di native (arg ke-3).
        undefined,
      );
      expect(mockPush).not.toHaveBeenCalledWith('/goal-wizard');
      alertSpy.mockRestore();
    });

    it('[WS-04·3] AC-WS04-2: empty-state action juga terkunci ("+ Goal" empty-state)', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult()); // goals empty → EmptyState render
      await renderScreen();
      // Ada 2 tombol dengan label "arsip" — satu di section header, satu di
      // EmptyState. Keduanya harus disabled.
      const btns = await screen.findAllByLabelText(/periode arsip — nonaktif/);
      expect(btns.length).toBeGreaterThanOrEqual(2);
      for (const b of btns) {
        expect(b.props.accessibilityState?.disabled).toBe(true);
      }
    });

    it('[WS-04·5] BUG-02: Goal TAHUNAN (card current) di fokus ARSIP → "+ Strategi" per-card terkunci (disabled + alert, TIDAK push)', async () => {
      // Root cause BUG-02: row memakai cardPeriodStatus saja. Goal berperiode tahunan
      // (2026-01-01..2026-12-31) TAK PERNAH 'past' di dalam 2026, jadi sebelum fix
      // tombol "+ Strategi" tetap aktif walau fokus di bulan arsip (Januari 2026).
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(
        goalsResult({
          goals: [
            {
              id: 'g-year',
              name: 'Goal Tahunan',
              status: 'active',
              period_start: '2026-01-01',
              period_end: '2026-12-31',
            },
          ],
        }),
      );
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await renderScreen();
      const addBtn = await screen.findByLabelText('Tambah Strategi ke Goal Tahunan');
      // Tombol tetap tampil tapi disabled (fokus arsip mengunci meski card sendiri 'current').
      expect(addBtn.props.accessibilityState?.disabled).toBe(true);
      fireEvent.press(addBtn);
      expect(alertSpy).toHaveBeenCalledWith(
        'Periode ini sudah menjadi Archive',
        'Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.',
        // showAlert (seam) meneruskan buttons=undefined ke Alert.alert di native (arg ke-3).
        undefined,
      );
      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/strategy/new'));
      alertSpy.mockRestore();
    });

    it('[WS-04·4] AC-WS04-5 (regresi negatif): fokus current → "+ Goal" tidak locked, push goal-wizard', async () => {
      await AsyncStorage.clear();
      // Kembali ke fokus default (Juni 2026, current di anchor NOW).
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
      await renderScreen();
      const btn = await screen.findByLabelText('+ Goal');
      expect(btn.props.accessibilityState?.disabled).toBeFalsy();
      fireEvent.press(btn);
      expect(mockPush).toHaveBeenCalledWith('/goal-wizard');
    });
  });

  // WS-04 — governance debt (AC-WS04-7): jalur create card memakai .insert() langsung
  // tanpa RPC/cek periode. Test ini MENDOKUMENTASIKAN gap secara eksplisit: gate archive
  // adalah UI-only saat ini (OQ-1 = a), server-side hardening menunggu batch berikutnya.
  it('[WS-04·gov-debt] AC-WS04-7: cards.ts memakai .insert() tanpa cek periode server', () => {
    // Static assertion: `cards.ts` tidak mengekspor RPC create_goal/create_kpi/dsb.
    // Test ini "gap doc" — memaksa developer sadar bahwa gating archive saat
    // ini UI-only (OQ-1=a); menghapus gate client tanpa menambah gate server
    // akan membuka kembali WS-04. Referensi audit: cards.ts:325/355 memakai
    // supabase.from(...).insert(...) langsung.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cardsModule = require('@/lib/cards');
    const exports = Object.keys(cardsModule);
    expect(exports).not.toContain('create_goal');
    expect(exports).not.toContain('create_strategy');
    expect(exports).not.toContain('create_initiative');
  });

  it('[compact-meta] Goal merender meta ringkas alih-alih count lama', async () => {
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ ...GOAL, target_value: 'Omset 48M', strategies: [{ count: 2 }] }],
      }),
    );
    await renderScreen();

    expect(await screen.findByText(/Target Omset 48M/i)).toBeTruthy();
    // Child count sebagai tappable expand trigger di luar overlay detail.
    expect(screen.getByLabelText(/2 Strategi/)).toBeTruthy();
    expect(screen.queryByText('Strategi: 2')).toBeNull();
  });

  it('[compact-meta] Goal tanpa Strategi menampilkan label "Belum ada KPI"', async () => {
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ ...GOAL, strategies: [{ count: 0 }] }],
      }),
    );
    await renderScreen();

    expect(await screen.findByText('Belum ada KPI')).toBeTruthy();
    expect(screen.queryByText('Butuh 1 Strategi')).toBeNull();
  });

  it('[compact-meta] Development merender pola compact yang setara', async () => {
    mockUseDevelopmentAreas.mockReturnValue(
      devResult({
        developmentAreas: [
          {
            id: 'd1',
            name: 'Sales Ops',
            status: 'active',
            problem_statements: [{ count: 2 }],
          },
        ],
      }),
    );
    await renderScreen('development');

    expect(await screen.findByText('Sales Ops')).toBeTruthy();
    expect(screen.getByLabelText(/2 Problem Statement/)).toBeTruthy();
    expect(screen.queryByText(WS_DEV_COPY.problemCount(2))).toBeNull();
  });

  it('[4] expand/collapse anak KPI', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseStrategies.mockReturnValue(
      kpiResult({ strategies: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
    );
    await renderScreen();

    expect(screen.queryByText('KPI Penjualan')).toBeNull();
    fireEvent.press(await screen.findByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    expect(await screen.findByText('KPI Penjualan')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    await screen.findByLabelText('Toggle Strategi Tumbuhkan Revenue');
    expect(screen.queryByText('KPI Penjualan')).toBeNull();
  });

  it('[tree-compact] tombol tambah tetap terlihat setelah row diringkas', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseStrategies.mockReturnValue(
      kpiResult({ strategies: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
    );
    await renderScreen();

    expect(await screen.findByText('+ Goal')).toBeTruthy();
    expect(screen.getByText('+ Strategi')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    expect(await screen.findByText('+ Inisiatif')).toBeTruthy();
  });

  it('[tree-compact] CardActionRow memakai kontrol compact tanpa hilangkan tap target', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    await renderScreen();

    const moreButton = await screen.findByLabelText('Aksi lain Tumbuhkan Revenue');
    const addButton = screen.getByLabelText('Tambah Strategi ke Tumbuhkan Revenue');
    const moreStyle = flattenStyle(moreButton.props.style) as {
      minWidth?: number;
      minHeight?: number;
      marginVertical?: number;
      marginHorizontal?: number;
    };
    const addStyle = flattenStyle(addButton.props.style) as {
      minHeight?: number;
      marginVertical?: number;
    };

    // harden-2 — kotak sentuh Pressable pembungkus NYATA ≥44px (bukan hitSlop, yang no-op di
    // react-native-web). Pill visual tetap compact 34px lewat margin negatif -5 yang
    // mengembalikan footprint layout ke 34 (kepadatan tree tak berubah).
    expect(moreStyle.minWidth).toBe(44);
    expect(moreStyle.minHeight).toBe(44);
    expect(moreStyle.marginVertical).toBe(-5);
    expect(moreStyle.marginHorizontal).toBe(-5);
    expect(addStyle.minHeight).toBe(44);
    expect(addStyle.marginVertical).toBe(-5);
  });

  it('[compact-actions] Goal row menampilkan Detail, ..., dan + Strategi', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    await renderScreen();

    expect(await screen.findByLabelText('Detail Tumbuhkan Revenue')).toBeTruthy();
    expect(screen.getByLabelText('Aksi lain Tumbuhkan Revenue')).toBeTruthy();
    expect(screen.getByText('+ Strategi')).toBeTruthy();
  });

  it('[tree-compact] expand/collapse tetap jalan setelah action row dipadatkan', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseStrategies.mockReturnValue(
      kpiResult({ strategies: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
    );
    await renderScreen();

    fireEvent.press(screen.getByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    expect(await screen.findByText('KPI Penjualan')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    await waitFor(() => expect(screen.queryByText('KPI Penjualan')).toBeNull());
  });

  it('[tree-layout] KPI child dirender sebagai sibling block di luar card parent Goal', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseStrategies.mockReturnValue(
      kpiResult({ strategies: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
    );
    await renderScreen();

    fireEvent.press(screen.getByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    const parentDetailButton = await screen.findByLabelText('Detail Tumbuhkan Revenue');
    await screen.findByText('KPI Penjualan');

    const parentCardHost = findClosestSectionCardHost(parentDetailButton);
    expect(parentCardHost).toBeTruthy();
    expect(hasTextDescendant(parentCardHost!, 'KPI Penjualan')).toBe(false);
  });

  it('[compact-header] Goal root memakai orb compact 38px di cluster kanan atas', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseCardProgress.mockReturnValue({
      progressOf: (id: string) => (id === GOAL.id ? 68 : null),
      measuredOf: (id: string) => id === GOAL.id,
      isLoading: false,
      isError: false,
    });
    await renderScreen();

    const orb = await screen.findByLabelText('Capaian 68 persen');
    // react-native-css meratakan `style` menjadi objek (bukan array) — flatten dulu.
    expect(flattenStyle(orb.props.style)).toEqual(expect.objectContaining({ minWidth: 38 }));
  });

  it('[compact-header] period pill mengikuti rentang periode card', async () => {
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            ...GOAL,
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    mockUseStrategies.mockReturnValue(
      kpiResult({
        strategies: [
          {
            id: 'k-q2',
            name: 'KPI Penjualan',
            status: 'active',
            period_start: '2026-04-01',
            period_end: '2026-06-30',
          },
        ],
      }),
    );
    await renderScreen();

    expect(await screen.findByText('2026')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    expect(await screen.findByText('Q2 2026')).toBeTruthy();
  });

  it('[compact-header] chevron di kanan atas mengontrol expand Strategi', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
    mockUseStrategies.mockReturnValue(
      kpiResult({ strategies: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
    );
    await renderScreen();

    expect(screen.queryByText('KPI Penjualan')).toBeNull();
    fireEvent.press(screen.getByLabelText('Toggle Strategi Tumbuhkan Revenue'));
    expect(await screen.findByText('KPI Penjualan')).toBeTruthy();
  });

  it('[5a] loading useGoals → SkeletonList (hub view juga loading)', async () => {
    mockUseGoals.mockReturnValue(goalsResult({ isLoading: true }));
    // Saat goals loading, HubView tampilkan SkeletonList tanpa render hub-card.
    await renderHub();
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
    expect(screen.getAllByText('Juni 2026').length).toBeGreaterThanOrEqual(1);
  });

  // WS-05 (Opsi A / PRD §11.1) — Goal bersifat TAHUNAN & di-scope ke TAHUN fokus. Goal tahun
  // lain (2025) TIDAK boleh bocor saat fokus 2026 (dulu tampil dgn badge "Periode lewat" — itu
  // kebocoran lintas-tahun yang diperbaiki). Anchor NOW=Juni 2026 → focus.year=2026.
  it('[S1-2/WS-05] Goal tahun lain (2025) TIDAK dirender saat fokus 2026; Goal 2026 tampil', async () => {
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-2025',
            name: 'Goal Tahun Lalu',
            status: 'active',
            period_start: '2025-01-01',
            period_end: '2025-12-31',
          },
          {
            id: 'g-2026',
            name: 'Goal Tahun Ini',
            status: 'active',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    await renderScreen();
    expect(await screen.findByText('Goal Tahun Ini')).toBeTruthy();
    // Kebocoran lintas-tahun tertutup: Goal 2025 tak ada di tree saat fokus 2026.
    expect(screen.queryByText('Goal Tahun Lalu')).toBeNull();
  });

  // WS-05 — Goal tanpa periode (null) SELALU tampil (konsisten cardPeriodStatus → 'current').
  it('[WS-05·null] Goal tanpa periode tetap tampil saat fokus 2026', async () => {
    mockUseGoals.mockReturnValue(
      goalsResult({ goals: [{ id: 'g-null', name: 'Goal Tanpa Periode', status: 'active' }] }),
    );
    await renderScreen();
    expect(await screen.findByText('Goal Tanpa Periode')).toBeTruthy();
  });

  // WS-05 — hanya Goal tahun lain (2025) yang ada → semua ter-scope keluar → EmptyState tampil
  // dengan copy jujur "…di tahun ini." (menghubungkan Celah #1 scoping ↔ Celah #2 copy).
  it('[WS-05·empty] hanya Goal 2025 → EmptyState "Belum ada Goal di tahun ini." saat fokus 2026', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          { id: 'g-2025', name: 'Goal Tahun Lalu', status: 'active', period_start: '2025-01-01', period_end: '2025-12-31' },
        ],
      }),
    );
    await renderScreen();
    expect(await screen.findByText('Belum ada Goal di tahun ini.')).toBeTruthy();
    expect(screen.queryByText('Goal Tahun Lalu')).toBeNull();
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
    expect(screen.queryByText(/Periode lewat/)).toBeNull();
  });

  // S3 — Card Interaction Rule (PRD V1.8.2 §7.3 / §7.7). Tombol Detail terpisah sudah dilebur ke
  // badan card (overlay penuh di atas pill + judul + orb) — tap di mana saja pada badan → push.
  it('[S3-1] tap badan card ("Buka detail X") → push detail', async () => {
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
    fireEvent.press(await screen.findByLabelText('Buka detail Goal Now'));
    expect(mockPush).toHaveBeenCalledWith('/goal/g-now');
  });

  // WSA-03 — kategori tree card ditandai letter-badge pill (§9), bukan hanya teks judul.
  it('[WSA-03] Goal card menampilkan pill kategori "Goal"; KPI card pill "Strategi"', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ id: 'g1', name: 'Goal A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }],
      }),
    );
    mockUseStrategies.mockReturnValue(
      kpiResult({ strategies: [{ id: 'k1', name: 'KPI A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
    );
    await renderScreen();
    expect(await screen.findByLabelText('Kategori: Goal')).toBeTruthy();
    fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal A'));
    expect(await screen.findByLabelText('Kategori: Strategi')).toBeTruthy();
  });

  // WSA-17 — label "+" konteks harus TERLIHAT (bukan hanya accessibilityLabel). Spec §11.
  it('[WSA-17·1] Goal "+" menampilkan teks "+ Strategi"', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ id: 'g1', name: 'Goal A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }],
      }),
    );
    await renderScreen();
    expect(await screen.findByText('+ Strategi')).toBeTruthy();
  });

  it('[WSA-17·2] Strategi "+" menampilkan teks "+ Inisiatif"; Inisiatif "+" teks "+ Rencana Aksi"', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [{ id: 'g1', name: 'Goal A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }],
      }),
    );
    mockUseStrategies.mockReturnValue(
      kpiResult({ strategies: [{ id: 'k1', name: 'KPI A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
    );
    mockUseInitiatives.mockReturnValue(
      initiativesResult({ initiatives: [{ id: 's1', name: 'Strat A', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
    );
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal A'));
    expect(await screen.findByText('+ Inisiatif')).toBeTruthy();
    fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI A'));
    expect(await screen.findByText('+ Rencana Aksi')).toBeTruthy();
  });

  it('[S3-2] tombol "+" current period → push /strategy/new?goalId=...', async () => {
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
    fireEvent.press(await screen.findByLabelText('Tambah Strategi ke Goal Cur'));
    expect(mockPush).toHaveBeenCalledWith('/strategy/new?goalId=g-cur');
  });

  // WS-05 — Goal bersifat tahunan: card-nya tak pernah 'past' via periodenya sendiri di dalam
  // tahun fokus. Lock "+" pada Goal berasal dari FOKUS arsip (isAddLocked → focusPeriodStatus).
  // Fokus di-seed ke Januari 2026 (arsip relatif NOW=Juni 2026); Goal tetap tahun 2026 (tampil).
  it('[S3-3] tombol "+" saat fokus arsip → showPastPeriodAlert dipanggil, push TIDAK', async () => {
    await AsyncStorage.setItem(
      'rencanaapp:period-focus',
      JSON.stringify({ mode: 'month', year: 2026, month: 1 }),
    );
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-arc',
            name: 'Goal Arsip Fokus',
            status: 'active',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Tambah Strategi ke Goal Arsip Fokus'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Periode ini sudah menjadi Archive',
      'Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.',
      // showAlert (seam) meneruskan buttons=undefined ke Alert.alert di native (arg ke-3).
      undefined,
    );
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/strategy/new'));
    alertSpy.mockRestore();
  });

  // WSA-14 — Arsipkan fungsional: konfirmasi → archiveCard({goal, id}). Bukan placeholder.
  it('[WSA-14] "⋯" → Arsipkan → konfirmasi → archive({entityType:goal, entityId})', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          { id: 'g-arc', name: 'Goal Arsip', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' },
        ],
      }),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Aksi lain Goal Arsip'));
    // Press di dalam act — update state RowActionsMenu (onClose) harus di-flush.
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Arsipkan'));
    });
    // Popup konfirmasi §12.2: tombol Batal + Arsipkan (destructive).
    const call = alertSpy.mock.calls.find((c) => c[0] === 'Arsipkan card?');
    expect(call).toBeTruthy();
    const buttons = call![2] as Array<{ text: string; onPress?: () => void }>;
    expect(buttons.map((b) => b.text)).toEqual(['Batal', 'Arsipkan']);
    expect(mockArchive).not.toHaveBeenCalled();
    // Unmount sebelum invoke handler arsip → promise archive tidak mencemari test berikutnya.
    cleanup();
    await buttons[1].onPress?.();
    expect(mockArchive).toHaveBeenCalledWith({ entityType: 'goal', entityId: 'g-arc' });
    alertSpy.mockRestore();
  });

  // WSA-20 — tombol Detail terpisah & toast edukasi (spec §12.1.4 lama) sudah dilebur: badan card
  // kini SATU overlay "Buka detail X" yang langsung push (bukan toast non-blocking).
  it('[WSA-20] tap badan card → push detail langsung (bukan toast)', async () => {
    mockCan.mockReturnValue(true);
    mockUseGoals.mockReturnValue(
      goalsResult({
        goals: [
          {
            id: 'g-body',
            name: 'Goal Body',
            status: 'active',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
          },
        ],
      }),
    );
    await renderScreen();
    fireEvent.press(await screen.findByLabelText('Buka detail Goal Body'));
    expect(mockPush).toHaveBeenCalledWith('/goal/g-body');
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

  // [S3-5] Judul pane kontekstual — bukan hardcode "Workspace" untuk kedua pane.
  // Sebelumnya PaneTopHeader render WS_COPY.title ("Workspace") pada Performance & Development,
  // sehingga user tidak bisa membedakan pane dari judul. Sekarang masing-masing pakai kicker
  // hub-card (Performance / Development) dan fallback ke WS_COPY.title untuk back-compat.
  it('[S3-5] Pane Performance: judul h1 = "Performance" (bukan "Workspace")', async () => {
    await renderScreen('performance');
    expect(await screen.findByText('Performance')).toBeTruthy();
    // Sanity: judul lama sudah tidak muncul.
    expect(screen.queryByText('Workspace')).toBeNull();
  });

  it('[S3-6] Pane Development: judul h1 = "Development" (bukan "Workspace")', async () => {
    await renderScreen('development');
    expect(await screen.findByText('Development')).toBeTruthy();
    expect(screen.queryByText('Workspace')).toBeNull();
  });

  // [UI-N-003 (Stage 1 B′) — tree 3-level inline: Goal → Strategi → Inisiatif.
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

    async function expandToInitiative() {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      await screen.findByText('KPI Penjualan');
      fireEvent.press(screen.getByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
    }

    it('[UI-N-003·1] KPI sub-row punya tombol "Lihat Inisiatif"; lazy fetch (enabled=false saat collapse)', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      await screen.findByText('KPI Penjualan');
      // Sebelum tap "Lihat Inisiatif", useInitiatives dipanggil dgn enabled=false.
      expect(mockUseInitiatives).toHaveBeenCalledWith('k1', false);
      fireEvent.press(screen.getByLabelText('Toggle Inisiatif KPI Penjualan'));
      // Setelah expand, dipanggil dgn enabled=true (waitFor agar React re-render selesai).
      await waitFor(() => expect(mockUseInitiatives).toHaveBeenCalledWith('k1', true));
    });

    it('[UI-N-003·2] expand Inisiatif → render nama Inisiatif; collapse → sembunyi', async () => {
      await expandToInitiative();
      fireEvent.press(screen.getByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByLabelText('Toggle Inisiatif KPI Penjualan');
      expect(screen.queryByText('Akuisisi Lewat Meta Ads')).toBeNull();
    });

    it('[UI-N-003·3] empty state: tidak ada Inisiatif → text "Belum ada Inisiatif"', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      expect(await screen.findByText(/Belum ada Inisiatif/)).toBeTruthy();
    });

    it('[UI-N-003·4] error state Inisiatif fetch → ErrorState + retry', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      const refetchSpy = jest.fn();
      mockUseInitiatives.mockReturnValue(
        initiativesResult({ isError: true, refetch: refetchSpy }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      expect(await screen.findByText('Gagal memuat')).toBeTruthy();
    });

    it('[UI-N-003·5] Inisiatif "+ Rencana Aksi" current period → push /action-plan/new?initiativeId=...', async () => {
      await expandToInitiative();
      fireEvent.press(screen.getByLabelText('Tambah Rencana Aksi ke Akuisisi Lewat Meta Ads'));
      expect(mockPush).toHaveBeenCalledWith('/action-plan/new?initiativeId=s1');
    });

    it('[UI-N-003·6] Inisiatif past period → tombol "+" Alert past period, tidak push', async () => {
      const PAST_STRATEGY = { ...STRATEGY_NOW, id: 's-past', period_end: '2025-12-31' };
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [PAST_STRATEGY] }));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      fireEvent.press(screen.getByLabelText('Tambah Rencana Aksi ke Akuisisi Lewat Meta Ads'));
      expect(alertSpy).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalledWith('/action-plan/new?initiativeId=s-past');
      alertSpy.mockRestore();
    });

    it('[UI-N-003·7] permission false (create_action_plan=false) → tombol "+" tidak ada di Inisiatif', async () => {
      mockCan.mockImplementation((key: string) => key !== 'create_action_plan');
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      expect(screen.queryByLabelText('Tambah Rencana Aksi ke Akuisisi Lewat Meta Ads')).toBeNull();
    });

    it('[UI-N-003·8] RowActionsMenu dari Inisiatif ⋯ → menu Aksi muncul', async () => {
      await expandToInitiative();
      fireEvent.press(screen.getByLabelText('Aksi lain Akuisisi Lewat Meta Ads'));
      expect(await screen.findByLabelText('Aksi: Akuisisi Lewat Meta Ads')).toBeTruthy();
    });

    // WSA-13·0 — "+ Strategi" (level Goal) digate key presisi `create_kpi_area` (mirror policy
    // strategies_insert 0010: has_permission('create_kpi_area') OR is_goal_pic). Proxy
    // create_strategy sebelumnya salah dua arah (lihat komentar di workspace-screen.tsx §GoalRow).
    it('[WSA-13·0·A] "+ Strategi" digate create_kpi_area: create_strategy true tapi create_kpi_area false & bukan PIC Goal → tombol sembunyi', async () => {
      mockCan.mockImplementation((key: string) => key === 'create_strategy'); // false untuk create_kpi_area
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ ...GOAL_NOW, pic_id: 'other-user' }] }));
      await renderScreen();
      expect(screen.queryByLabelText('Tambah Strategi ke Goal Aktif')).toBeNull();
    });

    it('[WSA-13·0·B] "+ Strategi" tampil saat create_kpi_area true (bukan PIC Goal, create_strategy false)', async () => {
      mockCan.mockImplementation((key: string) => key === 'create_kpi_area');
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ ...GOAL_NOW, pic_id: 'other-user' }] }));
      await renderScreen();
      expect(screen.getByLabelText('Tambah Strategi ke Goal Aktif')).toBeTruthy();
    });

    it('[WSA-13·0·C] "+ Strategi" tampil untuk PIC Goal walau tanpa create_kpi_area (jalur is_goal_pic K4)', async () => {
      mockCan.mockReturnValue(false); // tak ada permission apa pun
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ ...GOAL_NOW, pic_id: 'u1' }] })); // u1 = mock useProfile id
      await renderScreen();
      expect(screen.getByLabelText('Tambah Strategi ke Goal Aktif')).toBeTruthy();
    });

    // WSA-13 — "+ Inisiatif" digate key presisi `create_initiative` (bukan proxy `create_strategy`).
    it('[WSA-13·1] "+ Inisiatif" digate create_initiative: create_strategy true tapi create_initiative false → tombol sembunyi', async () => {
      mockCan.mockImplementation((key: string) => key !== 'create_initiative');
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      await screen.findByText('KPI Penjualan');
      expect(screen.queryByLabelText('Tambah Inisiatif ke KPI Penjualan')).toBeNull();
    });

    it('[WSA-13·2] "+ Inisiatif" tampil saat create_initiative true (create_strategy false)', async () => {
      mockCan.mockImplementation((key: string) => key === 'create_initiative');
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      await screen.findByText('KPI Penjualan');
      expect(screen.getByLabelText('Tambah Inisiatif ke KPI Penjualan')).toBeTruthy();
    });

    // WSA-01 — tree 4–5 level: Inisiatif expand → Rencana Aksi; Rencana Aksi expand → Tugas.
    it('[WSA-01·1] expand Inisiatif → "Lihat Rencana Aksi" → render Rencana Aksi (lazy fetch)', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      mockUseInitiativeActionPlans.mockReturnValue(
        stratInitResult({ action_plans: [{ id: 'i1', name: 'Campaign Meta Ads', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      // Sebelum expand Rencana Aksi: useInitiativeActionPlans dipanggil enabled=false.
      expect(mockUseInitiativeActionPlans).toHaveBeenCalledWith('s1', false);
      fireEvent.press(await screen.findByLabelText('Toggle Rencana Aksi Akuisisi Lewat Meta Ads'));
      expect(await screen.findByText('Campaign Meta Ads')).toBeTruthy();
      await waitFor(() => expect(mockUseInitiativeActionPlans).toHaveBeenCalledWith('s1', true));
    });

    it('[WSA-01·2] expand Rencana Aksi → "Lihat Tugas" → render Tugas (leaf: tanpa panah/+)', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      mockUseInitiativeActionPlans.mockReturnValue(
        stratInitResult({ action_plans: [{ id: 'i1', name: 'Campaign Meta Ads', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
      );
      mockUseActionPlanTasks.mockReturnValue(
        taskResult({ tasks: [{ id: 'ap1', name: 'Setup pixel tracking', status: 'active', start_date: '2026-01-01', deadline: '2026-12-31' }] }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      fireEvent.press(await screen.findByLabelText('Toggle Rencana Aksi Akuisisi Lewat Meta Ads'));
      await screen.findByText('Campaign Meta Ads');
      fireEvent.press(await screen.findByLabelText('Toggle Tugas Campaign Meta Ads'));
      expect(await screen.findByText('Setup pixel tracking')).toBeTruthy();
      // Tugas = leaf: tidak ada tombol tambah turunan / panah di bawahnya.
      expect(screen.queryByLabelText('Tambah Tugas ke Setup pixel tracking')).toBeNull();
      await waitFor(() => expect(mockUseActionPlanTasks).toHaveBeenCalledWith('i1', true));
    });

    it('[compact-actions] Tugas leaf tidak merender tombol tambah child', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      mockUseInitiativeActionPlans.mockReturnValue(
        stratInitResult({ action_plans: [{ id: 'i1', name: 'Campaign Meta Ads', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
      );
      mockUseActionPlanTasks.mockReturnValue(
        taskResult({ tasks: [{ id: 'ap1', name: 'Setup pixel tracking', status: 'active', start_date: '2026-01-01', deadline: '2026-12-31' }] }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      fireEvent.press(await screen.findByLabelText('Toggle Rencana Aksi Akuisisi Lewat Meta Ads'));
      fireEvent.press(await screen.findByLabelText('Toggle Tugas Campaign Meta Ads'));

      expect(await screen.findByText('Setup pixel tracking')).toBeTruthy();
      expect(screen.getByLabelText('Detail Setup pixel tracking')).toBeTruthy();
      expect(screen.getByLabelText('Aksi lain Setup pixel tracking')).toBeTruthy();
      // Tugas = leaf: TIDAK punya tombol tambah turunan. (Tombol "+ Plan" milik baris
      // Rencana Aksi — legitimate saat create_task aktif — jadi assert label leaf spesifik,
      // bukan queryByText('+ Plan') yang menangkap tombol Rencana Aksi.)
      expect(screen.queryByLabelText('Tambah Tugas ke Setup pixel tracking')).toBeNull();
    });

    it('[WSA-01·3] Rencana Aksi "+ Plan" current period → push /task/new', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      mockUseInitiativeActionPlans.mockReturnValue(
        stratInitResult({ action_plans: [{ id: 'i1', name: 'Campaign Meta Ads', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' }] }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      fireEvent.press(await screen.findByLabelText('Toggle Rencana Aksi Akuisisi Lewat Meta Ads'));
      fireEvent.press(await screen.findByLabelText('Tambah Tugas ke Campaign Meta Ads'));
      expect(mockPush).toHaveBeenCalledWith('/task/new?actionPlanId=i1');
    });

    // WSA-04 — guard MBR: Strategi belum cukup Inisiatif → tombol "+ Rencana Aksi" di Inisiatif
    // card ter-guard: tap TIDAK push, tampilkan Alert §12.3.
    const INCOMPLETE_KPI_MBR = {
      compliance: {
        child_card_type: 'initiative' as const,
        child_count: 2,
        min_count: 3,
        enforcement_mode: 'blokir_akses_turunan' as const,
        is_compliant: false,
      },
      isCompliant: false,
    };

    it('[WSA-04·1] KPI belum cukup Inisiatif → tap "+ Rencana Aksi" → Alert §12.3, TIDAK push', async () => {
      mockCan.mockReturnValue(true);
      mockUseMbrCompliance.mockReturnValue(INCOMPLETE_KPI_MBR);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      fireEvent.press(screen.getByLabelText('Tambah Rencana Aksi ke Akuisisi Lewat Meta Ads'));
      expect(alertSpy).toHaveBeenCalledWith(
        'Kelengkapan Perencanaan',
        expect.stringContaining('baru tombol + Rencana Aksi aktif'),
        undefined,
      );
      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/action-plan/new'));
      alertSpy.mockRestore();
    });

    it('[WSA-04·2] KPI compliant → "+ Rencana Aksi" push normal (tanpa Alert guard)', async () => {
      mockCan.mockReturnValue(true);
      mockUseMbrCompliance.mockReturnValue({
        compliance: { ...INCOMPLETE_KPI_MBR.compliance, child_count: 3, is_compliant: true },
        isCompliant: true,
      });
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [KPI_NOW] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [STRATEGY_NOW] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      fireEvent.press(screen.getByLabelText('Tambah Rencana Aksi ke Akuisisi Lewat Meta Ads'));
      expect(mockPush).toHaveBeenCalledWith('/action-plan/new?initiativeId=s1');
    });
  });

  // UI-N-003 Development pane — symmetric: DevArea → Problem Statement → Rencana Aksi.
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

    it('[UI-N-003·DEV·1] PS sub-row tampil "Lihat Rencana Aksi" → expand fetch Rencana Aksi', async () => {
      mockCan.mockReturnValue(true);
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [DEV] }));
      mockUseProblemStatements.mockReturnValue(psResult({ problemStatements: [PS] }));
      mockUseProblemStatementActionPlans.mockReturnValue(psInitResult({ action_plans: [INIT] }));
      await renderScreen('development');
      fireEvent.press(await screen.findByLabelText('Toggle Problem Statement Development Area Ops'));
      await screen.findByText('Problem WA respon lambat');
      fireEvent.press(screen.getByLabelText('Toggle Rencana Aksi Problem WA respon lambat'));
      await screen.findByText('Auto-reply WA jam sibuk');
      expect(mockUseProblemStatementActionPlans).toHaveBeenCalledWith('p1', true);
    });

    // WSA-13 — "+ Problem Statement" digate key presisi `create_problem_statement`.
    it('[WSA-13·DEV] "+ Problem Statement" digate create_problem_statement (bukan proxy create_development_area)', async () => {
      mockCan.mockImplementation((key: string) => key !== 'create_problem_statement');
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [DEV] }));
      await renderScreen('development');
      await screen.findByText('Development Area Ops');
      expect(screen.queryByLabelText('Tambah Problem Statement ke Development Area Ops')).toBeNull();
    });

    it('[tree-layout·DEV] Problem Statement child dirender sebagai sibling block di luar card parent Development Area', async () => {
      mockCan.mockReturnValue(true);
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [DEV] }));
      mockUseProblemStatements.mockReturnValue(psResult({ problemStatements: [PS] }));
      await renderScreen('development');

      fireEvent.press(screen.getByLabelText('Toggle Problem Statement Development Area Ops'));
      const parentDetailButton = await screen.findByLabelText('Detail Development Area Ops');
      await screen.findByText('Problem WA respon lambat');

      const parentCardHost = findClosestSectionCardHost(parentDetailButton);
      expect(parentCardHost).toBeTruthy();
      expect(hasTextDescendant(parentCardHost!, 'Problem WA respon lambat')).toBe(false);
    });
  });

  // BL-04 — cascade MBR untuk SETIAP aturan, bukan hanya strategy→initiative.
  // Aturan `X → Y` yang belum patuh mengunci tombol yang membuat `Z` di bawah `Y`; tombol yang
  // membuat `Y` sendiri tidak tersentuh (keputusan owner: cascade satu tingkat, PR #139).
  describe('[BL-04] cascade MBR per aturan', () => {
    const G = { id: 'g1', name: 'Goal Aktif', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' };
    const K = { id: 'k1', name: 'KPI Penjualan', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' };
    const I = { id: 's1', name: 'Akuisisi Lewat Meta Ads', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' };
    const AP = { id: 'i1', name: 'Campaign Meta Ads', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' };
    const D = { id: 'd1', name: 'Development Area Ops', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' };
    const P = { id: 'p1', name: 'Problem WA respon lambat', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' };
    const DAP = { id: 'i1', name: 'Auto-reply WA jam sibuk', status: 'active', period_start: '2026-01-01', period_end: '2026-12-31' };

    /**
     * Kepatuhan hanya untuk SATU jenis induk; sisanya undefined (fail-open). Ini yang membuat tes
     * peka terhadap salah-arah: kalau guard membaca induk yang keliru, ia tidak akan menahan apa pun.
     */
    function mbrFor(parentType: string, mode: string, compliant: boolean, childType: string) {
      mockUseMbrCompliance.mockImplementation((p: string) =>
        p === parentType
          ? {
              compliance: {
                child_card_type: childType,
                child_count: compliant ? 3 : 1,
                min_count: 3,
                enforcement_mode: mode,
                is_compliant: compliant,
              },
              isCompliant: compliant,
            }
          : { compliance: undefined, isCompliant: true },
      );
    }

    async function expandPerformance(depth: 1 | 2 | 3) {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [G] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [K] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [I] }));
      mockUseInitiativeActionPlans.mockReturnValue(stratInitResult({ action_plans: [AP] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      await screen.findByText('KPI Penjualan');
      if (depth === 1) return;
      fireEvent.press(screen.getByLabelText('Toggle Inisiatif KPI Penjualan'));
      await screen.findByText('Akuisisi Lewat Meta Ads');
      if (depth === 2) return;
      fireEvent.press(screen.getByLabelText('Toggle Rencana Aksi Akuisisi Lewat Meta Ads'));
      await screen.findByText('Campaign Meta Ads');
    }

    async function expandDevelopment(depth: 1 | 2) {
      mockCan.mockReturnValue(true);
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [D] }));
      mockUseProblemStatements.mockReturnValue(psResult({ problemStatements: [P] }));
      mockUseProblemStatementActionPlans.mockReturnValue(psInitResult({ action_plans: [DAP] }));
      await renderScreen('development');
      fireEvent.press(await screen.findByLabelText('Toggle Problem Statement Development Area Ops'));
      await screen.findByText('Problem WA respon lambat');
      if (depth === 1) return;
      fireEvent.press(screen.getByLabelText('Toggle Rencana Aksi Problem WA respon lambat'));
      await screen.findByText('Auto-reply WA jam sibuk');
    }

    const CASES = [
      {
        rule: 'goal→strategy',
        parentType: 'goal',
        childType: 'strategy',
        addLabel: 'Tambah Inisiatif ke KPI Penjualan',
        route: '/initiative/new',
        expand: () => expandPerformance(1),
      },
      {
        rule: 'strategy→initiative',
        parentType: 'strategy',
        childType: 'initiative',
        addLabel: 'Tambah Rencana Aksi ke Akuisisi Lewat Meta Ads',
        route: '/action-plan/new',
        expand: () => expandPerformance(2),
      },
      {
        rule: 'initiative→action_plan',
        parentType: 'initiative',
        childType: 'action_plan',
        addLabel: 'Tambah Tugas ke Campaign Meta Ads',
        route: '/task/new',
        expand: () => expandPerformance(3),
      },
      {
        rule: 'development_area→problem_statement',
        parentType: 'development_area',
        childType: 'problem_statement',
        addLabel: 'Tambah Rencana Aksi ke Problem WA respon lambat',
        route: '/action-plan/new',
        expand: () => expandDevelopment(1),
      },
      {
        rule: 'problem_statement→action_plan',
        parentType: 'problem_statement',
        childType: 'action_plan',
        addLabel: 'Tambah Tugas ke Auto-reply WA jam sibuk',
        route: '/task/new',
        expand: () => expandDevelopment(2),
      },
    ];

    describe.each(CASES)('$rule', ({ parentType, childType, addLabel, route, expand }) => {
      it('[BL-04·1] blokir_akses_turunan + induk belum patuh → tombol ditahan, Alert, TIDAK push', async () => {
        mbrFor(parentType, 'blokir_akses_turunan', false, childType);
        const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        await expand();
        fireEvent.press(screen.getByLabelText(addLabel));
        expect(alertSpy).toHaveBeenCalledWith(
          'Kelengkapan Perencanaan',
          expect.stringContaining('1 dari 3'),
          undefined,
        );
        expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining(route));
        alertSpy.mockRestore();
      });

      it('[BL-04·2] blokir_akses_turunan + induk patuh → tombol normal', async () => {
        mbrFor(parentType, 'blokir_akses_turunan', true, childType);
        await expand();
        fireEvent.press(screen.getByLabelText(addLabel));
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining(route));
      });

      // Mode lain tidak boleh menyentuh tombol tambah, sekalipun induk belum patuh.
      it.each(['nonaktif', 'hanya_peringatan', 'blokir_aktivasi'])(
        '[BL-04·3] mode %s + induk belum patuh → tombol tetap normal',
        async (mode) => {
          mbrFor(parentType, mode, false, childType);
          await expand();
          fireEvent.press(screen.getByLabelText(addLabel));
          expect(mockPush).toHaveBeenCalledWith(expect.stringContaining(route));
        },
      );
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

    it('[UI-N-002·1b] WSA-12 stat label ruang: kolom-3 "Aktif" (QA 2026-07-24 owner decision), Development "Area"/"Problem Statement"', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
      mockUseDevelopmentAreas.mockReturnValue(
        devResult({ developmentAreas: [{ id: 'd1', name: 'Dev A', status: 'active' }] }),
      );
      await renderHub();
      // Kolom-3 semula "Notif" (WSA-12) tapi value = activeCount (jumlah card aktif),
      // dan notif per-ruang goal/kpi/strategy DEFER (FR-GOV-04) → label menyesatkan.
      // Owner decision QA 2026-07-24: relabel ke "Aktif" agar label == value.
      // 2026-08-02 — prinsip yang SAMA diperluas: "Aktif" telanjang masih ambigu (aktif Goal
      // atau aktif Strategi?), dan chip yang dulu menambal ambiguitas itu sudah dihapus
      // karena redundan. Label kini menyebut entitasnya eksplisit per ruang.
      expect(await screen.findByText('Goal aktif')).toBeTruthy();
      expect(screen.getByText('Area aktif')).toBeTruthy();
      expect(screen.queryByText('Aktif')).toBeNull();
      expect(screen.queryByText('Notif')).toBeNull();
      expect(screen.getByText('Area')).toBeTruthy();
      expect(screen.getByText('Problem Statement')).toBeTruthy();
    });

    // WSA-19 — "Masuk" MENAVIGASI ke route pane deep-linkable (bukan state lokal).
    it('[UI-N-002·2] tap hub Performance → push /workspace/performance', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
      await renderHub();
      fireEvent.press(await screen.findByLabelText(/Masuk Performance/));
      expect(mockPush).toHaveBeenCalledWith('/workspace/performance');
    });

    it('[UI-N-002·3] tap hub Development → push /workspace/development', async () => {
      mockUseDevelopmentAreas.mockReturnValue(
        devResult({ developmentAreas: [{ id: 'd1', name: 'Dev A', status: 'active' }] }),
      );
      await renderHub();
      fireEvent.press(await screen.findByLabelText(/Masuk Development/));
      expect(mockPush).toHaveBeenCalledWith('/workspace/development');
    });

    // WSA-19 — back button pindah ke AppHeader (pola seragam dgn tab lain). Test behavior
    // back ada di app-header.test.tsx. Di sini cukup pastikan pane TIDAK merender back
    // secara inline (paritas dgn Notifications/Inbox/Menu yang tak punya back inline).
    it('[UI-N-002·4] pane Performance TIDAK merender tombol "Kembali" inline', async () => {
      await renderScreen('performance');
      expect(screen.queryByText('Target Kinerja')).toBeNull();
      // Back dipindah ke AppHeader (di luar hierarki pane).
      expect(screen.queryByLabelText('Kembali ke Workspace')).toBeNull();
      // PerformancePane tampil dengan section h1 dari PaneSectionHeader.
      expect(await screen.findByText('Hierarki Strategis')).toBeTruthy();
    });

    it('[UI-N-002·4b] pane Development TIDAK merender tombol "Kembali" inline', async () => {
      await renderScreen('development');
      expect(screen.queryByLabelText('Kembali ke Workspace')).toBeNull();
      expect(await screen.findByText(WS_DEV_COPY.sectionDevAreas)).toBeTruthy();
    });

    // WSA-19 — deep-link langsung ke pane (tanpa history). Back button di AppHeader fallback
    // ke `router.replace('/workspace')`. Test detail di app-header.test.tsx.

    // WSA-19 — pane dalam di Workspace tidak lagi punya TabBar internal; perpindahan
    // pane dilakukan via kembali ke Hub lalu masuk ruang lain. Tombol "Performance"/
    // "Development" tidak boleh muncul di pane agar tidak duplikasi navigasi hub.
    it('[WSA-19·2] TabBar internal pane TIDAK dirender; PaneSectionHeader tampil', async () => {
      await renderScreen('performance');
      // Tab "Development" tidak ada — `Development` text hanya muncul di Hub copy, bukan
      // sebagai tab button di pane.
      expect(screen.queryByRole('tab', { name: 'Development' })).toBeNull();
      expect(screen.queryByRole('tab', { name: 'Performance' })).toBeNull();
      // PaneSectionHeader tetap ada (h2 + primary action button) — paritas dengan section
      // header di screen lain.
      expect(await screen.findByText('Hierarki Strategis')).toBeTruthy();
    });

    it('[UI-N-002·5] hub-card stats — Performance: 2 Goal, 5 KPI, 1 aktif', async () => {
      mockUseGoals.mockReturnValue(
        goalsResult({
          goals: [
            { id: 'g1', name: 'G1', status: 'active', strategies: [{ count: 3 }] },
            { id: 'g2', name: 'G2', status: 'draft', strategies: [{ count: 2 }] },
          ],
        }),
      );
      await renderHub();
      // accessibilityLabel pada hub-card mencantumkan agregat 2 Goal + 5 Strategi.
      expect(
        await screen.findByLabelText(/Masuk Performance: 2 Goal, 5 Strategi/),
      ).toBeTruthy();
    });

    it('[UI-N-002·6] hub-card empty (0 Goal, 0 DevArea) → indikator "—" di ke-2 hub, bukan 0%', async () => {
      await renderHub();
      // 2026-08-02: chip "Belum ada …" dihapus bersama chip redundan; empty state kini
      // diwakili orb ruang yang merender '—'. Tanpa kartu sama sekali, tak ada nilai
      // terukur MAUPUN status-rollup → kedua ruang jatuh ke label "Progress".
      // Yang WAJIB dijaga: tidak pernah render 0% saat tak ada data.
      expect((await screen.findAllByLabelText(/Progress .* belum tersedia/)).length).toBe(2);
      expect(screen.queryByLabelText(/0 persen/)).toBeNull();
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
      expect(screen.getByText('Cari Goal, Strategi, Rencana Aksi, Tugas')).toBeTruthy();
      fireEvent.press(search);
      expect(mockPush).toHaveBeenCalledWith('/search');
    });
  });

  // UI-S-W07 (design-consultation 2026-07-02) — expand level-1 (Goal/Dev Area) wajib punya
  // state loading/kosong/error, paritas dgn level-2 (StrategySubRow/ProblemStatementSubRow).
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
      mockUseStrategies.mockReturnValue(kpiResult({ isLoading: true }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      expect((await screen.findAllByLabelText('Memuat…')).length).toBeGreaterThan(0);
    });

    it('[W07·2] expand Goal tanpa Strategi → hint "Belum ada Strategi"', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [] }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      expect(await screen.findByText(/Belum ada Strategi/)).toBeTruthy();
    });

    it('[W07·3] expand Goal error fetch KPI → ErrorState', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL_NOW] }));
      mockUseStrategies.mockReturnValue(kpiResult({ isError: true }));
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      expect(await screen.findByText('Gagal memuat')).toBeTruthy();
    });

    it('[W07·4] expand Dev Area tanpa Problem Statement → hint "Belum ada Problem Statement"', async () => {
      mockUseDevelopmentAreas.mockReturnValue(devResult({ developmentAreas: [DEV_NOW] }));
      mockUseProblemStatements.mockReturnValue(psResult({ problemStatements: [] }));
      await renderScreen('development');
      fireEvent.press(await screen.findByLabelText('Toggle Problem Statement Development Area Ops'));
      expect(await screen.findByText(/Belum ada Problem Statement/)).toBeTruthy();
    });
  });

  // UI-S-W08 (design-consultation 2026-07-02) — dim "periode lewat" via opacity dihapus (tidak ada
  // lagi opacity 0.5 di level manapun); badge teks "Periode lewat" jadi SATU-SATUNYA sinyal
  // periode-lewat (DESIGN §4: warna/opacity bukan satu-satunya sinyal — teks tetap wajib ada).
  describe('[UI-S-W08] periode-lewat: badge teks, tanpa dim opacity', () => {
    const PAST_PERIOD = { period_start: '2025-01-01', period_end: '2025-12-31' };
    const NOW_PERIOD = { period_start: '2026-01-01', period_end: '2026-12-31' };

    // WS-05 — Goal tahunan tak pernah 'past' via periodenya sendiri di dalam tahun fokus, jadi
    // "melihat periode lewat" (§11.3) dipicu lewat FOKUS arsip. Seed fokus Januari 2026 (arsip
    // relatif NOW=Juni 2026); semua card tetap tahun 2026 (tampil) namun ber-badge "Periode lewat".
    it('[W08·1] fokus arsip → Goal+KPI+Inisiatif badge "Periode lewat" 3×, tanpa opacity dim', async () => {
      await AsyncStorage.setItem(
        'rencanaapp:period-focus',
        JSON.stringify({ mode: 'month', year: 2026, month: 1 }),
      );
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(
        goalsResult({ goals: [{ id: 'g', name: 'Goal Arsip', status: 'active', ...NOW_PERIOD }] }),
      );
      mockUseStrategies.mockReturnValue(
        kpiResult({ strategies: [{ id: 'k', name: 'KPI Arsip', status: 'active', ...NOW_PERIOD }] }),
      );
      mockUseInitiatives.mockReturnValue(
        initiativesResult({
          initiatives: [{ id: 's', name: 'Inisiatif Arsip', status: 'active', ...NOW_PERIOD }],
        }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Arsip'));
      await screen.findByText('KPI Arsip');
      fireEvent.press(screen.getByLabelText('Toggle Inisiatif KPI Arsip'));
      await screen.findByText('Inisiatif Arsip');
      expect(countOpacityHalf(screen.toJSON())).toBe(0);
      expect(screen.getAllByText(/Periode lewat/).length).toBe(3);
    });

    it('[W08·2] hanya Inisiatif yang past → tanpa opacity dim di level-3, badge tetap tampil', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(
        goalsResult({ goals: [{ id: 'g', name: 'Goal Aktif', status: 'active', ...NOW_PERIOD }] }),
      );
      mockUseStrategies.mockReturnValue(
        kpiResult({ strategies: [{ id: 'k', name: 'KPI Aktif', status: 'active', ...NOW_PERIOD }] }),
      );
      mockUseInitiatives.mockReturnValue(
        initiativesResult({
          initiatives: [{ id: 's', name: 'Inisiatif Past', status: 'active', ...PAST_PERIOD }],
        }),
      );
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Aktif'));
      await screen.findByText('KPI Aktif');
      fireEvent.press(screen.getByLabelText('Toggle Inisiatif KPI Aktif'));
      await screen.findByText('Inisiatif Past');
      expect(countOpacityHalf(screen.toJSON())).toBe(0);
      expect(screen.getAllByText(/Periode lewat/).length).toBe(1);
    });
  });

  describe('WSA-15 — progress orb tree (spec §6.4–6.8 / §10)', () => {
    const PERIOD = { period_start: '2026-01-01', period_end: '2026-12-31' };
    const setProgress = (map: Record<string, number>, measuredIds: string[] = []) =>
      mockUseCardProgress.mockReturnValue({
        progressOf: (id: string) => (id in map ? map[id] : null),
        measuredOf: (id: string) => measuredIds.includes(id),
        isLoading: false,
        isError: false,
      });

    it('[ORB1] GoalRow measured render orb label "Capaian" dgn nilai capaian', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ id: 'g1', name: 'Goal Orb', status: 'active', ...PERIOD }] }));
      setProgress({ g1: 82 }, ['g1']);
      await renderScreen();
      expect(await screen.findByText('82%')).toBeTruthy();
      expect(screen.getByLabelText('Capaian 82 persen')).toBeTruthy();
    });

    it('[ORB2] InitiativeSubRow render orb label "Progress" (bukan "Capaian")', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ id: 'g1', name: 'Goal Orb', status: 'active', ...PERIOD }] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [{ id: 'k1', name: 'KPI A', status: 'active', ...PERIOD }] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [{ id: 's1', name: 'Strat A', status: 'active', ...PERIOD }] }));
      setProgress({ s1: 20 });
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Orb'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI A'));
      expect(await screen.findByText('20%')).toBeTruthy();
      expect(screen.getByLabelText('Progress 20 persen')).toBeTruthy();
      expect(screen.queryByLabelText('Capaian 20 persen')).toBeNull();
    });

    it('[ORB3] TaskSubRow leaf: orb "Progress" dari computeTaskProgress (submitted→80)', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ id: 'g1', name: 'Goal Orb', status: 'active', ...PERIOD }] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [{ id: 'k1', name: 'KPI A', status: 'active', ...PERIOD }] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [{ id: 's1', name: 'Strat A', status: 'active', ...PERIOD }] }));
      mockUseInitiativeActionPlans.mockReturnValue(stratInitResult({ action_plans: [{ id: 'i1', name: 'Init A', status: 'active', ...PERIOD }] }));
      mockUseActionPlanTasks.mockReturnValue(
        taskResult({ tasks: [{ id: 'ap1', name: 'Setup pixel', status: 'submitted', repeat_setting: 'one_time', start_date: '2026-01-01', deadline: '2026-12-31' }] }),
      );
      setProgress({}); // induk tak diset — fokus ke leaf yang dihitung klien
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Orb'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI A'));
      fireEvent.press(await screen.findByLabelText('Toggle Rencana Aksi Strat A'));
      fireEvent.press(await screen.findByLabelText('Toggle Tugas Init A'));
      expect(await screen.findByText('80%')).toBeTruthy();
      expect(screen.getByLabelText('Progress 80 persen')).toBeTruthy();
    });

    it('[ORB4] Tugas repeat tanpa compliance → "—" (bukan 0% menyesatkan)', async () => {
      mockCan.mockReturnValue(true);
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ id: 'g1', name: 'Goal Orb', status: 'active', ...PERIOD }] }));
      mockUseStrategies.mockReturnValue(kpiResult({ strategies: [{ id: 'k1', name: 'KPI A', status: 'active', ...PERIOD }] }));
      mockUseInitiatives.mockReturnValue(initiativesResult({ initiatives: [{ id: 's1', name: 'Strat A', status: 'active', ...PERIOD }] }));
      mockUseInitiativeActionPlans.mockReturnValue(stratInitResult({ action_plans: [{ id: 'i1', name: 'Init A', status: 'active', ...PERIOD }] }));
      mockUseActionPlanTasks.mockReturnValue(
        taskResult({ tasks: [{ id: 'ap2', name: 'Rutin harian', status: 'active', repeat_setting: 'repeat', start_date: '2026-01-01', deadline: '2026-12-31' }] }),
      );
      // Semua induk diberi nilai agar hanya AP repeat leaf yang jadi '—' (unik untuk assertion).
      setProgress({ g1: 70, k1: 50, s1: 50, i1: 50 });
      await renderScreen();
      fireEvent.press(await screen.findByLabelText('Toggle Strategi Goal Orb'));
      fireEvent.press(await screen.findByLabelText('Toggle Inisiatif KPI A'));
      fireEvent.press(await screen.findByLabelText('Toggle Rencana Aksi Strat A'));
      fireEvent.press(await screen.findByLabelText('Toggle Tugas Init A'));
      await screen.findByText('Rutin harian');
      // AP repeat leaf: computeTaskProgress tak dipakai (compliance absen) → '—', bukan 0%.
      expect(screen.queryByText('0%')).toBeNull();
      expect(screen.getByLabelText('Progress belum tersedia')).toBeTruthy();
    });

    it('[ORB5] progress induk null → orb "—", tidak mengarang 0%', async () => {
      mockUseGoals.mockReturnValue(goalsResult({ goals: [{ id: 'g1', name: 'Goal Kosong', status: 'active', ...PERIOD }] }));
      // default mockUseCardProgress → progressOf null, measuredOf false → label "Progress".
      await renderScreen();
      await screen.findByText('Goal Kosong');
      expect(screen.queryByText('0%')).toBeNull();
      expect(screen.getByLabelText('Progress belum tersedia')).toBeTruthy();
    });
  });

});
