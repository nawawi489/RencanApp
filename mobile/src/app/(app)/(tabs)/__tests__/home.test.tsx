// Home (Fase 3) — Today Command Center per-section. Tanggal diklasifikasi SERVER (lib/home),
// jadi test memock data layer & TIDAK pernah memock Date global (AC-H6b diuji di SQL, bukan sini).
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

// mockPush di scope modul agar push dapat di-assert (jest.fn() inline di dalam useRouter
// membuat instance baru tiap panggilan → tak terlacak). WS-3a butuh assert route.
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

/** Default semua section resolve kosong; tiap test override yang relevan. */
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

// Unmount di dalam act agar langganan react-query dari test sebelumnya dibatalkan dan
// setiap state update tuntas SEBELUM test berikutnya render (cegah "overlapping act()").
afterEach(async () => {
  await act(async () => {
    cleanup();
  });
});

describe('HomeScreen', () => {
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

  it('data → greeting + Terlewat count dari server + task row + repeat row', async () => {
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
    expect(screen.getByText('Daily Finance Closing')).toBeTruthy(); // repeat hari ini
    expect(screen.getByText('2 item lewat deadline.')).toBeTruthy(); // priority Terlewat dari listOverdueItems
    expect(screen.getByText('1 KPI perlu dipantau.')).toBeTruthy(); // priority Gap Strategy
    expect(screen.getByText('Customer Baru')).toBeTruthy(); // Snapshot Tim row
    expect(screen.getByText('kurang 1.060 customer')).toBeTruthy(); // "% gap" prototype
  });

  it('kosong → empty states tiap section', async () => {
    primeEmpty();
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tidak ada tugas aktif')).toBeTruthy();
    expect(screen.getByText('Tidak ada yang telat.')).toBeTruthy(); // priority subtitle
    expect(screen.getByText('Semua KPI sesuai target.')).toBeTruthy(); // priority Gap KPI subtitle (kosong)
    expect(screen.getByText('Semua Strategy terpantau')).toBeTruthy(); // Snapshot Tim empty
    expect(screen.getByText('Tidak ada tugas rutin hari ini')).toBeTruthy();
    expect(screen.getByText('Tidak ada deadline mendekat')).toBeTruthy();
  });

  it('error Terlewat → tampil "Gagal memuat." (bukan "0")', async () => {
    primeEmpty();
    mockOverdue.mockRejectedValue(new Error('boom'));
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat.')).toBeTruthy();
    expect(screen.queryByText('0 item lewat deadline.')).toBeNull();
  });

  it('revisi → muncul di section "Revisi diperlukan"', async () => {
    primeEmpty();
    mockMine.mockResolvedValue([
      { id: 'ap3', name: 'Revisi laporan', status: 'revision', deadline: '2026-06-28', pic: { full_name: 'Rina' } },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Revisi laporan')).toBeTruthy();
    expect(screen.getByText('Revisi Diperlukan')).toBeTruthy(); // badge label
  });

  // WS-3a (AP-03) — baris HomeItemRow bertipe instance harus membuka layar INSTANCE
  // (/task/instance/{id}), bukan parent AP. Kode saat ini memanggil
  // openTask(item.task_id) untuk SEMUA item di 3 section (Repeat/Terlewat/
  // Deadline) → salah rute ke parent. Baris bertipe task tetap ke parent AP.
  describe('WS-3a routing instance vs parent AP', () => {
    // render dibungkus act async agar SEMUA query section settle di dalam test (bukan hanya
    // yang di-findByText) → tak ada state update yang bocor ke test berikutnya (overlapping act).
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

    it('Terlewat: instance → instance route; task → parent AP (list campuran)', async () => {
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
      expect(mockPush).toHaveBeenCalledWith('/task/ap2'); // regresi: AP tetap ke parent
      expect(mockPush).not.toHaveBeenCalledWith('/task/ap8');
    });

    it('Deadline mendekat (instance) → push /task/instance/{id}', async () => {
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
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 hari lalu
    };
    const { unmount } = await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Selamat datang di Rencanapp')).toBeTruthy();
    unmount();

    profileMock.profile = { full_name: 'Lama', id: 'u3', created_at: '2020-01-01T00:00:00Z' };
    await render(<HomeScreen />, { wrapper: wrapper() });
    await screen.findByText('Tidak ada tugas aktif');
    expect(screen.queryByText('Selamat datang di Rencanapp')).toBeNull();
  });
});
