// Regression: ISSUE-002 — kartu "Butuh Review" Home menampilkan "Tidak ada antrean review."
// padahal ada submission INSTANCE repeat (status 'submitted') yang menunggu reviewer.
// Found by /qa on 2026-07-07
// Report: .gstack/qa-reports/qa-report-localhost-8081-2026-07-07.md
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react-native';
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

jest.mock('@/hooks/use-profile', () => ({
  ...jest.requireActual('@/hooks/use-profile'),
  useProfile: () => ({
    profile: { full_name: 'Dewi Anggraini', id: 'u3', created_at: '2020-01-01T00:00:00Z' },
    isLoading: false,
    can: () => false,
  }),
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

beforeEach(() => {
  mockMine.mockResolvedValue([]);
  mockReview.mockResolvedValue([]);
  mockToday.mockResolvedValue('2026-07-07');
  mockTodayRepeat.mockResolvedValue([]);
  mockOverdue.mockResolvedValue([]);
  mockNear.mockResolvedValue([]);
  mockKpiAttn.mockResolvedValue([]);
  mockReviewInst.mockResolvedValue([]);
  mockPush.mockReset();
});

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
});

describe('ISSUE-002 — instance submitted masuk antrean "Butuh Review"', () => {
  it('kartu prioritas menghitung instance review & baris instance tampil', async () => {
    mockReviewInst.mockResolvedValue([
      {
        kind: 'instance',
        id: 'inst-702',
        task_id: 'ap-checkout',
        name: 'Checkout Harian (Repeat)',
        due: '2026-07-02',
        status: 'submitted',
      },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });

    // Kartu prioritas: bukan lagi "Tidak ada antrean review."
    expect(await screen.findByText('1 bukti menunggu keputusan.')).toBeTruthy();
    expect(screen.queryByText('Tidak ada antrean review.')).toBeNull();
    // Baris instance muncul di section "Butuh review Anda"
    expect(screen.getByText('Checkout Harian (Repeat)')).toBeTruthy();
  });

  it('gabungan AP one-time + instance dijumlahkan', async () => {
    mockReview.mockResolvedValue([
      { id: 'ap1', name: 'Desain Banner', status: 'submitted', deadline: '2026-07-10', pic: { full_name: 'Fajar' } },
    ]);
    mockReviewInst.mockResolvedValue([
      {
        kind: 'instance',
        id: 'inst-702',
        task_id: 'ap-checkout',
        name: 'Checkout Harian (Repeat)',
        due: '2026-07-02',
        status: 'submitted',
      },
    ]);
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('2 bukti menunggu keputusan.')).toBeTruthy();
  });

  it('error salah satu sumber → "Gagal memuat." pada kartu review', async () => {
    mockReviewInst.mockRejectedValue(new Error('boom'));
    await render(<HomeScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat.')).toBeTruthy();
    expect(screen.queryByText('Tidak ada antrean review.')).toBeNull();
  });
});
