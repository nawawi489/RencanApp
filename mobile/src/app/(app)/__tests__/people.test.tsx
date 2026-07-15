// Layar People — 4 state fondasi + PPL-02 tab structure (V1.83 de-scored).
// Pola: mock supabase (stub) + mock @/lib/cards.listOrgProfiles + mock @/hooks/use-people-score.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  listOrgProfiles: () => mockListOrgProfiles(),
  listOrgProfilesWithRoles: () => mockListOrgProfiles(),
  personLabel: (p: { full_name?: string | null; email?: string | null } | null | undefined, fallback = 'Tanpa nama') =>
    p?.full_name?.trim() || p?.email || fallback,
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
}));

const mockUseLatestClosedPeriod = jest.fn();
const mockUseRanking = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useLatestClosedPeriod: (...a: unknown[]) => mockUseLatestClosedPeriod(...a),
  useRanking: (...a: unknown[]) => mockUseRanking(...a),
}));

const mockUseProfile = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: (...a: unknown[]) => mockUseProfile(...a),
}));

// eslint-disable-next-line import/first
import PeopleScreen from '../people';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockListOrgProfiles.mockReset();
  mockUseLatestClosedPeriod.mockReset();
  mockUseRanking.mockReset();
  mockPush.mockReset();
  mockUseLatestClosedPeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseRanking.mockReturnValue({ ranking: [], isLoading: false, isError: false, refetch: jest.fn() });
  mockUseProfile.mockReset();
  mockUseProfile.mockReturnValue({ profile: null, isLoading: false, can: () => false });
});

describe('PeopleScreen — 4 state fondasi', () => {
  it('loading → skeleton aksesibel "Memuat…"', async () => {
    mockListOrgProfiles.mockReturnValue(new Promise(() => {}));
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('data → nama anggota + Avatar', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina Jaya', email: 'rina@nyantuy.id' },
      { id: 'u2', full_name: 'Arman Malik', email: 'arman@nyantuy.id' },
    ]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    expect(screen.getByLabelText('Arman Malik')).toBeTruthy();
    expect(screen.getByText('2/2 user')).toBeTruthy();
  });

  it('kosong → EmptyState', async () => {
    mockListOrgProfiles.mockResolvedValue([]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Belum ada anggota')).toBeTruthy();
  });

  it('error → ErrorState (role alert) + retry', async () => {
    mockListOrgProfiles.mockRejectedValue(new Error('boom'));
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat People')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Coba lagi')).toBeTruthy();
  });
});

describe('PeopleScreen — V1.83 de-scored', () => {
  beforeEach(() => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
    ]);
  });

  it('no ScoreLegend, ScoreBadge, or "Skor saya" card rendered', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina')).toBeTruthy();
    expect(screen.queryByText('Skala Score')).toBeNull();
    expect(screen.queryByLabelText('Skor saya')).toBeNull();
    expect(screen.queryByLabelText(/^Score \d/)).toBeNull();
  });

  it('no "Papan peringkat" link even with closed period', async () => {
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Q1', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [{ user_id: 'u1', rank_number: 1, score: 88 }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina')).toBeTruthy();
    expect(screen.queryByLabelText('Lihat papan peringkat lengkap')).toBeNull();
  });

  it('no rank number circles on roster items', async () => {
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Q1', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [{ user_id: 'u1', rank_number: 1, score: 88 }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina')).toBeTruthy();
    expect(screen.queryByLabelText(/Score 88/)).toBeNull();
  });

  it('subtitle says "Anggota organisasi." (not ranking)', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Anggota organisasi.')).toBeTruthy();
  });
});

describe('PeopleScreen — PPL-02 tab structure (V1.83)', () => {
  beforeEach(() => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u-rina', full_name: 'Rina Jaya', email: 'rina@nyantuy.id' },
    ]);
  });

  it('[PPL-02-1] default tab "Bulan ini" — search + roster tampil', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Cari anggota')).toBeTruthy();
    expect(screen.getByText('Rina Jaya')).toBeTruthy();
  });

  it('[PPL-02-2] 3 tab labels visible saat can("manage_score_formula")=true (no Ranking tab)', async () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'me' },
      isLoading: false,
      can: (k: string) => k === 'manage_score_formula',
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Bulan ini')).toBeTruthy();
    expect(screen.getByLabelText('Quarter')).toBeTruthy();
    expect(screen.getByLabelText('Admin')).toBeTruthy();
    expect(screen.queryByLabelText('Ranking')).toBeNull();
  });

  it('[PPL-02-3] Admin tab HIDDEN saat can("manage_score_formula")=false', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Bulan ini')).toBeTruthy();
    expect(screen.getByLabelText('Quarter')).toBeTruthy();
    expect(screen.queryByLabelText('Admin')).toBeNull();
  });

  it('[PPL-02-4] press Quarter → placeholder tampil; roster + search HILANG', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Quarter'));
    expect(await screen.findByText(/quarter|kuartal/i)).toBeTruthy();
    expect(screen.queryByText('Rina Jaya')).toBeNull();
    expect(screen.queryByLabelText('Cari anggota')).toBeNull();
  });

  it('[PPL-02-7] tab selected state berubah setelah press', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    const monthly = await screen.findByLabelText('Bulan ini');
    const quarter = screen.getByLabelText('Quarter');
    expect(monthly.props.accessibilityState?.selected).toBe(true);
    expect(quarter.props.accessibilityState?.selected).toBe(false);
    fireEvent.press(quarter);
    await screen.findByText(/quarter|kuartal/i);
    expect(screen.getByLabelText('Bulan ini').props.accessibilityState?.selected).toBe(false);
    expect(screen.getByLabelText('Quarter').props.accessibilityState?.selected).toBe(true);
  });

  it('[PPL-02-8] Admin tab render min 1 entry Pressable ke rute admin saat gate lolos', async () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'me' },
      isLoading: false,
      can: (k: string) => k === 'manage_score_formula',
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Admin'));
    const entry = await screen.findByLabelText('Buka Score Formula');
    fireEvent.press(entry);
    expect(mockPush).toHaveBeenCalledWith('/settings-score-formula');
  });
});
