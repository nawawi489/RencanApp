// AC-20 / Opsi B — orb header Inisiatif membaca rollup rekursif server (workspace_card_progress
// via useCardProgress), BUKAN heuristik %-selesai klien `ratioDoneOfChildren`. Fallback ke
// count-done hanya saat RPC belum termuat (null: loading/error/miss) — orb tetap render angka,
// tak pernah '—'. Label selalu "Progress" (Initiative bukan level attainment → never "Capaian").
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetInitiative = jest.fn();
jest.mock('@/lib/initiatives', () => ({
  __esModule: true,
  getInitiative: (...a: unknown[]) => mockGetInitiative(...a),
  activateInitiative: jest.fn(),
  PLANNING_STATUS_LABEL: { draft: 'Draft', active: 'Aktif', done: 'Selesai', archived: 'Diarsipkan' },
  STATUS_TONE: { draft: 'neutral', active: 'info', done: 'success', archived: 'neutral' },
}));

type Child = { id: string; status: string };
let mockActionPlans: Child[] = [];
let mockProgressValue: number | null = null;
let mockIsLoading = false;
let mockIsError = false;

jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useInitiativeActionPlans: () => ({
    action_plans: mockActionPlans,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useCardProgress: () => ({
    progressOf: () => mockProgressValue,
    measuredOf: () => false,
    isLoading: mockIsLoading,
    isError: mockIsError,
  }),
}));

jest.mock('@/hooks/use-mbr', () => ({
  __esModule: true,
  useMbrCompliance: () => ({ compliance: null, isLoading: false, isCompliant: true, refetch: jest.fn() }),
}));

jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: () => true }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({ id: 's1' }),
}));

// eslint-disable-next-line import/first
import InitiativeDetailScreen from '../[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const ACTIVE_INITIATIVE = {
  id: 's1',
  name: 'Optimasi Funnel',
  status: 'active',
  strategy_id: 'k1',
  contribution_pct: null,
  description: null,
  reason: 'r',
  main_risk: 'm',
  alternative: 'a',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

beforeEach(() => {
  mockGetInitiative.mockReset();
  mockGetInitiative.mockResolvedValue(ACTIVE_INITIATIVE);
  mockActionPlans = [];
  mockProgressValue = null;
  mockIsLoading = false;
  mockIsError = false;
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore?.();
});

describe('InitiativeDetailScreen — orb progress (AC-20)', () => {
  it('[ORB-1] RPC menang atas count-done: progressOf=50 vs anak 0/2 done → "Progress 50 persen"', async () => {
    // Dua Rencana Aksi non-done → ratioDoneOfChildren = 0. RPC rekursif = 50 (mis. anak 50%/50%).
    mockActionPlans = [{ id: 'a1', status: 'active' }, { id: 'a2', status: 'in_progress' }];
    mockProgressValue = 50;
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 50 persen/)).toBeTruthy();
    // Bukti RPC menang, bukan fallback count-done 0 (anchor ke awal string: "50 persen"
    // memuat substring "0 persen", jadi cek harus `^Progress 0 persen`); label bukan attainment.
    expect(screen.queryByLabelText(/^Progress 0 persen/)).toBeNull();
    expect(screen.queryByLabelText(/Capaian/)).toBeNull();
  });

  it('[ORB-2] fallback saat RPC null: pakai count-done klien, label "Progress", bukan "—"', async () => {
    // 1 dari 4 done → ratioDoneOfChildren = 25. RPC null (belum termuat) → orb tampil 25.
    mockActionPlans = [
      { id: 'a1', status: 'done' },
      { id: 'a2', status: 'active' },
      { id: 'a3', status: 'active' },
      { id: 'a4', status: 'active' },
    ];
    mockProgressValue = null;
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    // Orb render angka fallback (25), bukan '—'; ProgressOrb selalu render angka di tengah.
    // (Tak pakai queryByText('—'): MetaGrid meta kosong mis. "Kontribusi Q" sah tampil '—'.)
    expect(await screen.findByLabelText(/^Progress 25 persen/)).toBeTruthy();
    expect(screen.queryByLabelText(/Capaian/)).toBeNull();
  });

  it('[ORB-3] loading (RPC null) → fallback count-done tanpa flash nilai salah', async () => {
    mockActionPlans = [{ id: 'a1', status: 'done' }, { id: 'a2', status: 'active' }]; // 1/2 = 50
    mockProgressValue = null;
    mockIsLoading = true;
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 50 persen/)).toBeTruthy();
  });

  it('[ORB-4] error (RPC null) → fallback count-done, tetap render angka, tak crash', async () => {
    mockActionPlans = [{ id: 'a1', status: 'done' }, { id: 'a2', status: 'done' }, { id: 'a3', status: 'active' }]; // 2/3 = 67
    mockProgressValue = null;
    mockIsError = true;
    await render(<InitiativeDetailScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/^Progress 67 persen/)).toBeTruthy();
  });
});
