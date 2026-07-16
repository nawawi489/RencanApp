// Home (§27 V1.83) — "Pusat kendali hari ini." Compact layout: Fokus Hari Ini card,
// Prioritas, Task Hari Ini (merged), Butuh Review, Update Terbaru.
// Tanggal diklasifikasi SERVER (lib/home); test memock data layer, TIDAK memock Date global.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockMine = jest.fn();
const mockReview = jest.fn();
jest.mock('@/lib/cards', () => ({
  ...jest.requireActual('@/lib/cards'),
  listMyTasks: () => mockMine(),
  listPendingReviews: () => mockReview(),
}));

const mockToday = jest.fn();
const mockTodayRepeat = jest.fn();
const mockOverdue = jest.fn();
const mockNear = jest.fn();
const mockKpiAttn = jest.fn();
const mockReviewInst = jest.fn();
jest.mock('@/lib/home', () => ({
  __esModule: true,
  getOrgToday: () => mockToday(),
  listTodayRepeatInstances: () => mockTodayRepeat(),
  listOverdueItems: () => mockOverdue(),
  listNearDeadline: () => mockNear(),
  listKpiNeedsAttention: () => mockKpiAttn(),
  listPendingInstanceReviews: () => mockReviewInst(),
}));

const profileMock = { profile: { full_name: 'Rina Jaya', id: 'u1', created_at: '2020-01-01T00:00:00Z' } };
jest.mock('@/hooks/use-profile', () => ({
  ...jest.requireActual('@/hooks/use-profile'),
  useProfile: () => ({ ...profileMock, isLoading: false, can: () => false }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: () => {},
}));

// eslint-disable-next-line import/first
import HomeScreen from '../index';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

function primeEmpty() {
  mockMine.mockResolvedValue([]);
  mockReview.mockResolvedValue([]);
  mockReviewInst.mockResolvedValue([]);
  mockToday.mockResolvedValue('2026-06-24');
  mockTodayRepeat.mockResolvedValue([]);
  mockOverdue.mockResolvedValue([]);
  mockNear.mockResolvedValue([]);
  mockKpiAttn.mockResolvedValue([]);
}

beforeEach(() => {
  mockMine.mockReset();
  mockReview.mockReset();
  mockToday.mockReset();
  mockTodayRepeat.mockReset();
  mockOverdue.mockReset();
  mockNear.mockReset();
  mockKpiAttn.mockReset();
  mockReviewInst.mockReset();
  mockReviewInst.mockResolvedValue([]);
  mockPush.mockReset();
  profileMock.profile = { full_name: 'Rina Jaya', id: 'u1', created_at: '2020-01-01T00:00:00Z' };
});

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
});

describe('HomeScreen — §27 compact layout', () => {
  it('loading → skeleton', async () => {
    mockMine.mockReturnValue(new Promise(() => {}));
    mockReview.mockReturnValue(new Promise(() => {}));
    mockToday.mockReturnValue(new Promise(() => {}));
    mockTodayRepeat.mockReturnValue(new Promise(() => {}));
    mockOverdue.mockReturnValue(new Promise(() => {}));
    mockNear.mockReturnValue(new Promise(() => {}));
    mockKpiAttn.mockReturnValue(new Promise(() => {}));
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(screen.getAllByLabelText('Memuat…').length).toBeGreaterThan(0);
  });

  it('data → greeting + Fokus Hari Ini + Prioritas + Task Hari Ini + Update Terbaru', async () => {
    mockMine.mockResolvedValue([
      { id: 'ap1', name: 'Upload 5 konten', status: 'in_progress', deadline: '2026-06-30', pic: { full_name: 'Rina' } },
    ]);
    mockReview.mockResolvedValue([]);
    mockToday.mockResolvedValue('2026-06-24');
    mockTodayRepeat.mockResolvedValue([
      { kind: 'instance', id: 'i1', task_id: 'ap9', name: 'Daily Finance Closing', due: '2026-06-24', status: 'assigned' },
    ]);
    mockOverdue.mockResolvedValue([
      { kind: 'instance', id: 'i2', task_id: 'ap8', name: 'Lapor harian', due: '2026-06-23', status: 'missed' },
      { kind: 'task', id: 'ap2', task_id: 'ap2', name: 'Desain banner', due: '2026-06-20', status: 'in_progress' },
    ]);
    mockNear.mockResolvedValue([]);
    mockKpiAttn.mockResolvedValue([
      { id: 'k1', name: 'Customer Baru', percent: 79, remaining: 1060, unit: 'customer' },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('Upload 5 konten')).toBeTruthy();
    expect(screen.getByText(/Selamat (pagi|siang|sore|malam), Rina\./)).toBeTruthy();
    expect(screen.getByText('Daily Finance Closing')).toBeTruthy();
    expect(screen.getByText('2 item lewat deadline.')).toBeTruthy();
    expect(screen.getByText('1 KPI perlu dipantau.')).toBeTruthy();
    expect(screen.getByText('Fokus Hari Ini')).toBeTruthy();
    expect(screen.getByText('Task Hari Ini')).toBeTruthy();
    expect(screen.getByText('Update Terbaru')).toBeTruthy();
  });

  it('kosong → empty states for Task Hari Ini, Review, Update Terbaru', async () => {
    primeEmpty();
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tidak ada task hari ini')).toBeTruthy();
    expect(screen.getByText('Tidak ada yang telat.')).toBeTruthy();
    expect(screen.getByText('Semua KPI sesuai target.')).toBeTruthy();
    expect(screen.getByText('Tidak ada yang menunggu review')).toBeTruthy();
    expect(screen.getByText('Semua berjalan tepat waktu')).toBeTruthy();
  });

  it('error Terlewat → tampil "Gagal memuat." (bukan "0")', async () => {
    primeEmpty();
    mockOverdue.mockRejectedValue(new Error('boom'));
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat.')).toBeTruthy();
    expect(screen.queryByText('0 item lewat deadline.')).toBeNull();
  });

  it('revisi → muncul di Fokus Hari Ini (prioritas tertinggi)', async () => {
    primeEmpty();
    mockMine.mockResolvedValue([
      { id: 'ap3', name: 'Revisi laporan', status: 'revision', deadline: '2026-06-28', pic: { full_name: 'Rina' } },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Revisi laporan')).toBeTruthy();
    expect(screen.getByText('Revisi Diperlukan')).toBeTruthy();
    expect(screen.getByLabelText(/Fokus: Revisi laporan/)).toBeTruthy();
    expect(screen.getByText('Detail')).toBeTruthy();
  });

  it('TypeBadge menampilkan T (Task) dan RT (Repeat Task), bukan AP/RP', async () => {
    primeEmpty();
    mockMine.mockResolvedValue([
      { id: 'ap1', name: 'Task Biasa', status: 'in_progress', deadline: null, pic: null, repeat_setting: 'once' },
      { id: 'ap2', name: 'Task Rutin', status: 'in_progress', deadline: null, pic: null, repeat_setting: 'repeat' },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    await screen.findByText('Task Biasa');
    // TypeBadge text hidden from a11y tree (importantForAccessibility="no-hide-descendants"),
    // so verify via serialised JSON instead of getAllByText.
    const json = JSON.stringify(screen.toJSON());
    expect(json).toMatch(/"children":\["T"\]/);
    expect(json).toMatch(/"children":\["RT"\]/);
    expect(json).not.toMatch(/"children":\["AP"\]/);
    expect(json).not.toMatch(/"children":\["RP"\]/);
  });

  it('Fokus Hari Ini prioritas: revisi > overdue > repeat > todo', async () => {
    primeEmpty();
    mockMine.mockResolvedValue([
      { id: 'ap3', name: 'Revisi laporan', status: 'revision', deadline: null, pic: null },
      { id: 'ap4', name: 'Task aktif', status: 'in_progress', deadline: null, pic: null },
    ]);
    mockOverdue.mockResolvedValue([
      { kind: 'task', id: 'ap2', task_id: 'ap2', name: 'Overdue task', due: '2026-06-20', status: 'in_progress' },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/Fokus: Revisi laporan/)).toBeTruthy();
  });

  it('Fokus item tidak terduplikasi di Task Hari Ini', async () => {
    primeEmpty();
    mockMine.mockResolvedValue([
      { id: 'ap1', name: 'Satu-satunya task', status: 'in_progress', deadline: null, pic: null },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    await screen.findByText('Fokus Hari Ini');
    const matches = screen.getAllByText('Satu-satunya task');
    expect(matches).toHaveLength(1);
  });

  describe('WS-3a routing instance vs parent AP', () => {
    const renderHome = async () => {
      await act(async () => {
        render(<HomeScreen />, { wrapper: wrapper() });
      });
    };

    it('Repeat hari ini (instance) → push /task/instance/{id}, BUKAN parent AP', async () => {
      primeEmpty();
      mockTodayRepeat.mockResolvedValue([
        { kind: 'instance', id: 'i1', task_id: 'ap9', name: 'Daily Finance Closing', due: '2026-06-24', status: 'assigned' },
      ]);
      await renderHome();
      const row = await screen.findByText('Daily Finance Closing');
      await act(async () => {
        fireEvent.press(row);
      });
      expect(mockPush).toHaveBeenCalledWith('/task/instance/i1');
      expect(mockPush).not.toHaveBeenCalledWith('/task/ap9');
    });

    it('Overdue: instance → instance route; task → parent AP (Update Terbaru)', async () => {
      primeEmpty();
      mockOverdue.mockResolvedValue([
        { kind: 'instance', id: 'i2', task_id: 'ap8', name: 'Lapor harian', due: '2026-06-23', status: 'missed' },
        { kind: 'task', id: 'ap2', task_id: 'ap2', name: 'Desain banner', due: '2026-06-20', status: 'in_progress' },
      ]);
      await renderHome();
      const instRow = await screen.findByText('Lapor harian');
      const apRow = screen.getByText('Desain banner');
      await act(async () => {
        fireEvent.press(instRow);
        fireEvent.press(apRow);
      });
      expect(mockPush).toHaveBeenCalledWith('/task/instance/i2');
      expect(mockPush).toHaveBeenCalledWith('/task/ap2');
      expect(mockPush).not.toHaveBeenCalledWith('/task/ap8');
    });

    it('Near deadline (instance) → push /task/instance/{id} (Update Terbaru)', async () => {
      primeEmpty();
      mockNear.mockResolvedValue([
        { kind: 'instance', id: 'i3', task_id: 'ap7', name: 'Closing malam', due: '2026-06-26', status: 'assigned' },
      ]);
      await renderHome();
      const row = await screen.findByText('Closing malam');
      await act(async () => {
        fireEvent.press(row);
      });
      expect(mockPush).toHaveBeenCalledWith('/task/instance/i3');
      expect(mockPush).not.toHaveBeenCalledWith('/task/ap7');
    });
  });

  it('onboarding hint tampil utk user baru (<7 hari), tersembunyi utk lama', async () => {
    primeEmpty();
    profileMock.profile = {
      full_name: 'Baru Sekali',
      id: 'u2',
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    };
    const { unmount } = await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Selamat datang di Rencanapp')).toBeTruthy();
    unmount();

    profileMock.profile = { full_name: 'Lama', id: 'u3', created_at: '2020-01-01T00:00:00Z' };
    await render(<HomeScreen />, { wrapper: wrapper() });
    await screen.findByText('Tidak ada task hari ini');
    expect(screen.queryByText('Selamat datang di Rencanapp')).toBeNull();
  });
});
