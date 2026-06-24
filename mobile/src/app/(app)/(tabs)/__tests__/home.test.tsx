// Home (Fase 3) — Today Command Center per-section. Tanggal diklasifikasi SERVER (lib/home),
// jadi test memock data layer & TIDAK pernah memock Date global (AC-H6b diuji di SQL, bukan sini).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockMine = jest.fn();
const mockReview = jest.fn();
jest.mock('@/lib/cards', () => ({
  ...jest.requireActual('@/lib/cards'),
  listMyActionPlans: () => mockMine(),
  listPendingReviews: () => mockReview(),
}));

const mockToday = jest.fn();
const mockTodayRepeat = jest.fn();
const mockOverdue = jest.fn();
const mockNear = jest.fn();
jest.mock('@/lib/home', () => ({
  __esModule: true,
  getOrgToday: () => mockToday(),
  listTodayRepeatInstances: () => mockTodayRepeat(),
  listOverdueItems: () => mockOverdue(),
  listNearDeadline: () => mockNear(),
}));

const profileMock = { profile: { full_name: 'Rina Jaya', id: 'u1', created_at: '2020-01-01T00:00:00Z' } };
jest.mock('@/hooks/use-profile', () => ({
  ...jest.requireActual('@/hooks/use-profile'),
  useProfile: () => ({ ...profileMock, isLoading: false, can: () => false }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
  mockToday.mockResolvedValue('2026-06-24');
  mockTodayRepeat.mockResolvedValue([]);
  mockOverdue.mockResolvedValue([]);
  mockNear.mockResolvedValue([]);
}

beforeEach(() => {
  mockMine.mockReset();
  mockReview.mockReset();
  mockToday.mockReset();
  mockTodayRepeat.mockReset();
  mockOverdue.mockReset();
  mockNear.mockReset();
  profileMock.profile = { full_name: 'Rina Jaya', id: 'u1', created_at: '2020-01-01T00:00:00Z' };
});

describe('HomeScreen', () => {
  it('loading → skeleton', async () => {
    mockMine.mockReturnValue(new Promise(() => {}));
    mockReview.mockReturnValue(new Promise(() => {}));
    mockToday.mockReturnValue(new Promise(() => {}));
    mockTodayRepeat.mockReturnValue(new Promise(() => {}));
    mockOverdue.mockReturnValue(new Promise(() => {}));
    mockNear.mockReturnValue(new Promise(() => {}));
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
      { kind: 'instance', id: 'i1', action_plan_id: 'ap9', name: 'Daily Finance Closing', due: '2026-06-24', status: 'assigned' },
    ]);
    mockOverdue.mockResolvedValue([
      { kind: 'instance', id: 'i2', action_plan_id: 'ap8', name: 'Lapor harian', due: '2026-06-23', status: 'missed' },
      { kind: 'action_plan', id: 'ap2', action_plan_id: 'ap2', name: 'Desain banner', due: '2026-06-20', status: 'in_progress' },
    ]);
    mockNear.mockResolvedValue([]);
    await render(<HomeScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('Upload 5 konten')).toBeTruthy();
    expect(screen.getByText(/Selamat (pagi|siang|sore|malam), Rina\./)).toBeTruthy();
    expect(screen.getByText('Daily Finance Closing')).toBeTruthy(); // repeat hari ini
    expect(screen.getByText('2 item lewat deadline.')).toBeTruthy(); // priority Terlewat dari listOverdueItems
  });

  it('kosong → empty states tiap section', async () => {
    primeEmpty();
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tidak ada tugas aktif')).toBeTruthy();
    expect(screen.getByText('Tidak ada yang telat.')).toBeTruthy(); // priority subtitle
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

  it('onboarding hint tampil utk user baru (<7 hari), tersembunyi utk lama', async () => {
    primeEmpty();
    profileMock.profile = {
      full_name: 'Baru Sekali',
      id: 'u2',
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 hari lalu
    };
    const { unmount } = await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Selamat datang di RencanApp')).toBeTruthy();
    unmount();

    profileMock.profile = { full_name: 'Lama', id: 'u3', created_at: '2020-01-01T00:00:00Z' };
    await render(<HomeScreen />, { wrapper: wrapper() });
    await screen.findByText('Tidak ada tugas aktif');
    expect(screen.queryByText('Selamat datang di RencanApp')).toBeNull();
  });
});
