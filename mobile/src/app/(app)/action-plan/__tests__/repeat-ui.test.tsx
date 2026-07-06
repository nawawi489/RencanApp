// UI Fase 2 — form Repeat (new.tsx) & detail instance/compliance ([id].tsx).
// Strategi: mock supabase (stub) + override fungsi data layer; pertahankan label/tone asli
// via requireActual. render/renderHook RTL v14 bersifat async → selalu di-await.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

// Render RN pertama (cold transform react-native-css) bisa >5s; longgarkan timeout.
jest.setTimeout(30000);

const mockGetActionPlan = jest.fn();
const mockListSubmissions = jest.fn();
const mockListInstances = jest.fn();
const mockGetCompliance = jest.fn();
const mockRouterPush = jest.fn();
let mockParams: Record<string, string> = { id: 'ap-1', initiativeId: 'init-1' };

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockRouterPush, back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));

jest.mock('@/components/user-picker', () => ({
  UserPicker: () => null,
  personLabel: (p: { full_name?: string; email?: string } | null) => p?.full_name ?? p?.email ?? '—',
}));

jest.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { id: 'me' }, isLoading: false, can: () => true }),
}));

jest.mock('@/lib/cards', () => ({
  ...jest.requireActual('@/lib/cards'),
  getActionPlan: (...a: unknown[]) => mockGetActionPlan(...a),
  listSubmissions: (...a: unknown[]) => mockListSubmissions(...a),
  activateActionPlan: jest.fn(),
  startActionPlan: jest.fn(),
  reviewSubmission: jest.fn(),
  createActionPlan: jest.fn(),
}));

jest.mock('@/lib/repeat', () => ({
  ...jest.requireActual('@/lib/repeat'),
  listInstances: (...a: unknown[]) => mockListInstances(...a),
  getRepeatCompliance: (...a: unknown[]) => mockGetCompliance(...a),
  setRepeatRule: jest.fn(),
}));

/* eslint-disable import/first -- jest.mock must precede the imports it mocks */
import { INSTANCE_STATUS_LABEL, INSTANCE_STATUS_TONE } from '@/lib/repeat';
import NewActionPlanScreen from '../new';
import ActionPlanDetailScreen from '../[id]';
/* eslint-enable import/first */

function wrap(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return render(node, { wrapper: Wrapper });
}

const REPEAT_AP = {
  id: 'ap-1',
  name: 'Daily Finance Closing',
  status: 'in_progress',
  repeat_setting: 'repeat',
  pic_id: 'me',
  reviewer_id: 'rev',
  pic: { full_name: 'Saya' },
  reviewer: { full_name: 'Rev' },
  evidence_required: true,
  result_value_required: false,
};

const ONE_TIME_AP = { ...REPEAT_AP, repeat_setting: 'one_time', status: 'assigned' };

function makeInstance(over: Record<string, unknown>) {
  return {
    id: 'i1',
    instance_date: '2026-06-01',
    instance_time: '23:00:00',
    deadline_at: '2026-06-01T16:00:00Z',
    status: 'assigned',
    pic_id: 'me',
    reviewer_id: 'rev',
    action_plan_submissions: [],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'ap-1', initiativeId: 'init-1' };
  mockListSubmissions.mockResolvedValue([]);
  mockListInstances.mockResolvedValue([]);
  mockGetCompliance.mockResolvedValue({
    expected_count: 30,
    on_time_count: 28,
    missed_count: 2,
    done_count: 28,
    compliance: 0.9333,
  });
});

describe('label/tone instance (terpisah dari parent)', () => {
  it('[1] INSTANCE_STATUS_LABEL memetakan tiap status', () => {
    expect(INSTANCE_STATUS_LABEL.missed).toBe('Terlewat');
    expect(INSTANCE_STATUS_LABEL.done).toBe('Selesai');
    expect(INSTANCE_STATUS_LABEL.submitted).toBe('Menunggu Review');
  });
  it('[2] INSTANCE_STATUS_TONE memberi tone benar', () => {
    expect(INSTANCE_STATUS_TONE.missed).toBe('danger');
    expect(INSTANCE_STATUS_TONE.revision).toBe('danger');
    expect(INSTANCE_STATUS_TONE.done).toBe('success');
    expect(INSTANCE_STATUS_TONE.submitted).toBe('warn');
  });
});

describe('new.tsx — form Repeat', () => {
  it('[3] toggle Repeat memunculkan field konfigurasi (frequency, periode, jam, aturan terlewat)', async () => {
    await wrap(<NewActionPlanScreen />);
    expect(screen.queryByTestId('repeat-config')).toBeNull();
    fireEvent(screen.getByTestId('repeat-toggle'), 'valueChange', true);
    expect(await screen.findByTestId('repeat-config')).toBeTruthy();
    expect(screen.getByTestId('frequency-daily')).toBeTruthy();
    expect(screen.getByTestId('missed-rule-strict')).toBeTruthy();
    // Label field wajib me-render nested <Text> *</Text>, jadi cocokkan via regex (bukan exact).
    expect(screen.getByText(/Jam Deadline/)).toBeTruthy();
    expect(screen.getByText(/Mulai Repeat/)).toBeTruthy();
  });

  it('[4] field grace_period hanya muncul saat missed_rule = grace_period', async () => {
    await wrap(<NewActionPlanScreen />);
    fireEvent(screen.getByTestId('repeat-toggle'), 'valueChange', true);
    await screen.findByTestId('repeat-config');
    expect(screen.queryByTestId('grace-input')).toBeNull();
    fireEvent.press(screen.getByTestId('missed-rule-grace_period'));
    expect(await screen.findByTestId('grace-input')).toBeTruthy();
    fireEvent.press(screen.getByTestId('missed-rule-strict'));
    await waitFor(() => expect(screen.queryByTestId('grace-input')).toBeNull());
  });
});

describe('[id].tsx — detail repeat', () => {
  it('[5] menampilkan daftar instance dengan tanggal, deadline & badge status', async () => {
    mockGetActionPlan.mockResolvedValue(REPEAT_AP);
    mockListInstances.mockResolvedValue([
      makeInstance({ id: 'i1', instance_date: '2026-06-01', status: 'done' }),
      makeInstance({ id: 'i2', instance_date: '2026-06-02', status: 'assigned' }),
    ]);
    await wrap(<ActionPlanDetailScreen />);
    expect(await screen.findByText('2026-06-01')).toBeTruthy();
    expect(screen.getByText('2026-06-02')).toBeTruthy();
    expect(screen.getAllByText(/Deadline 23:00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Instance Terjadwal')).toBeTruthy();
  });

  it('[6] menampilkan metrik compliance On-time N/total (persen%)', async () => {
    mockGetActionPlan.mockResolvedValue(REPEAT_AP);
    mockListInstances.mockResolvedValue([makeInstance({ status: 'done' })]);
    await wrap(<ActionPlanDetailScreen />);
    const metric = await screen.findByTestId('compliance-metric');
    expect(metric).toHaveTextContent('On-time: 28/30 (93%)');
  });

  it('[7] compliance menampilkan "—" bukan "0%" saat expected_count = 0', async () => {
    mockGetActionPlan.mockResolvedValue(REPEAT_AP);
    mockGetCompliance.mockResolvedValue({
      expected_count: 0,
      on_time_count: 0,
      missed_count: 0,
      done_count: 0,
      compliance: null,
    });
    await wrap(<ActionPlanDetailScreen />);
    const metric = await screen.findByTestId('compliance-metric');
    expect(metric).toHaveTextContent('On-time: —');
    expect(metric).not.toHaveTextContent('0%');
  });

  it('[8] instance missed menyembunyikan Submit & menampilkan keterangan terlewat', async () => {
    mockGetActionPlan.mockResolvedValue(REPEAT_AP);
    mockListInstances.mockResolvedValue([makeInstance({ id: 'i1', status: 'missed', pic_id: 'me' })]);
    await wrap(<ActionPlanDetailScreen />);
    expect(await screen.findByText(/Terlewat — deadline terlewati/)).toBeTruthy();
    expect(screen.queryByText('Submit Bukti & Nilai Hasil')).toBeNull();
  });

  it('[3d] WS-3d: listInstances gagal → pesan gagal + "Coba lagi", BUKAN "Belum ada instance" (compliance tetap tampil)', async () => {
    mockGetActionPlan.mockResolvedValue(REPEAT_AP);
    mockListInstances.mockRejectedValue(new Error('rls/jaringan'));
    // compliance (query terpisah) tetap sukses (default 28/30) → replikasi kontradiksi laporan.
    await wrap(<ActionPlanDetailScreen />);
    expect(await screen.findByText(/Gagal memuat daftar instance/)).toBeTruthy();
    expect(screen.getByText('Coba lagi')).toBeTruthy();
    // Kunci anti-regresi: JANGAN tampilkan empty-state menyesatkan saat sebenarnya gagal.
    expect(screen.queryByText(/Belum ada instance/)).toBeNull();
    // Compliance tetap terlihat → membuktikan kedua sumber independen.
    expect(screen.getByTestId('compliance-metric')).toHaveTextContent('On-time: 28/30 (93%)');
  });

  it('[9] action plan one_time menyembunyikan bagian instance & compliance', async () => {
    mockGetActionPlan.mockResolvedValue(ONE_TIME_AP);
    await wrap(<ActionPlanDetailScreen />);
    // Tunggu detail termuat (PIC field), lalu pastikan compliance & instance tidak ada.
    expect(await screen.findByText('Riwayat Submission')).toBeTruthy();
    expect(screen.queryByTestId('compliance-metric')).toBeNull();
    expect(screen.queryByText('Instance Terjadwal')).toBeNull();
    expect(mockListInstances).not.toHaveBeenCalled();
  });
});
