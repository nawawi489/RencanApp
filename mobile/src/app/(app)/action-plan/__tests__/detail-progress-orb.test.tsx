// AC-20 / OQ-5 / Opsi B — orb header Rencana Aksi membaca rollup rekursif server
// (workspace_card_progress via useCardProgress) = rata-rata progress Tugas anak, BUKAN heuristik
// %-selesai klien. Fallback ke count-done hanya saat RPC null (loading/error/miss). Kritis OQ-5:
// progressOf=0 adalah nilai RPC SAH (bukan null) → harus MENANG atas fallback (`??`, bukan `||`).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetActionPlan = jest.fn();
const mockListTasks = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  getActionPlan: (...a: unknown[]) => mockGetActionPlan(...a),
  activateActionPlan: jest.fn(),
  listTasks: (...a: unknown[]) => mockListTasks(...a),
  INITIATIVE_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  ACTION_PLAN_STATUS_LABEL: { draft: 'Draft' },
  PRIORITY_LABEL: { low: 'Rendah', medium: 'Sedang', high: 'Tinggi', urgent: 'Urgent' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
  personLabel: (p: { full_name?: string | null; email?: string | null } | null | undefined, fallback = 'Tanpa nama') =>
    p?.full_name?.trim() || p?.email || fallback,
}));

jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: () => true }),
}));

jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: () => ({ compliance: null, isLoading: false, isCompliant: true, refetch: jest.fn() }),
}));

let mockProgressValue: number | null = null;
let mockIsLoading = false;
let mockIsError = false;
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useCardProgress: () => ({
    progressOf: () => mockProgressValue,
    measuredOf: () => false,
    isLoading: mockIsLoading,
    isError: mockIsError,
  }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 'i1' }),
}));

// eslint-disable-next-line import/first
import ActionPlanDetailScreen from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const ACTIVE_AP = {
  id: 'i1',
  name: 'Kampanye Q1',
  status: 'active',
  initiative_id: 's1',
  pic_id: 'u1',
  target_result: 'naik 20%',
  team_id: 't1',
  description: null,
  period_start: '2026-01-01',
  period_end: '2026-03-31',
};

function task(id: string, status: string) {
  return { id, name: `T ${id}`, status, pic: null, reviewer: null, deadline: null, priority: null };
}

beforeEach(() => {
  mockGetActionPlan.mockReset();
  mockListTasks.mockReset();
  mockGetActionPlan.mockResolvedValue(ACTIVE_AP);
  mockListTasks.mockResolvedValue([]);
  mockProgressValue = null;
  mockIsLoading = false;
  mockIsError = false;
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('ActionPlanDetailScreen — orb progress (AC-20 / OQ-5)', () => {
  it('[ORB-1] RPC menang atas count-done: progressOf=45 vs Tugas 0/2 done → "Progress 45 persen"', async () => {
    mockListTasks.mockResolvedValue([task('t1', 'assigned'), task('t2', 'in_progress')]); // 0/2 done
    mockProgressValue = 45;
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 45 persen/)).toBeTruthy();
    expect(screen.queryByLabelText(/Capaian/)).toBeNull();
  });

  it('[ORB-2] OQ-5: Tugas kosong + progressOf=0 → "Progress 0 persen" + sublabel "Belum ada turunan" (0 RPC menang, `??`)', async () => {
    mockListTasks.mockResolvedValue([]);
    mockProgressValue = 0; // nilai RPC SAH; ratioDoneOfChildren([]) juga 0 tapi harus datang dari RPC via `??`
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 0 persen.*Belum ada turunan/)).toBeTruthy();
    expect(screen.queryByLabelText(/Capaian/)).toBeNull();
  });

  it('[ORB-3] fallback saat RPC null: pakai count-done klien, label "Progress", bukan "—"', async () => {
    mockListTasks.mockResolvedValue([
      task('t1', 'done'),
      task('t2', 'active'),
      task('t3', 'active'),
      task('t4', 'active'),
    ]); // 1/4 = 25
    mockProgressValue = null;
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    // Orb render angka fallback (25), bukan '—'. (Tak pakai queryByText('—'): MetaGrid meta
    // kosong mis. "Tim" sah tampil '—' — ProgressOrb sendiri selalu render angka di tengah.)
    expect(await screen.findByLabelText(/^Progress 25 persen/)).toBeTruthy();
  });

  it('[ORB-4] loading (RPC null) → fallback count-done tanpa flash nilai salah', async () => {
    mockListTasks.mockResolvedValue([task('t1', 'done'), task('t2', 'active')]); // 1/2 = 50
    mockProgressValue = null;
    mockIsLoading = true;
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 50 persen/)).toBeTruthy();
  });

  it('[ORB-5] error (RPC null) → fallback count-done, tetap render angka, tak crash', async () => {
    mockListTasks.mockResolvedValue([task('t1', 'done'), task('t2', 'done'), task('t3', 'active')]); // 2/3 = 67
    mockProgressValue = null;
    mockIsError = true;
    await render(<ActionPlanDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 67 persen/)).toBeTruthy();
  });
});
