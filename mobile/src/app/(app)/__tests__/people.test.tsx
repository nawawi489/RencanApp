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
    expect(screen.getByText('2/2 anggota')).toBeTruthy();
  });

  it('kosong → EmptyState', async () => {
    mockListOrgProfiles.mockResolvedValue([]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Belum ada anggota')).toBeTruthy();
  });

  it('error → ErrorState (role alert) + retry', async () => {
    mockListOrgProfiles.mockRejectedValue(new Error('boom'));
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat Anggota')).toBeTruthy();
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

  it('no score value badges on roster items', async () => {
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

describe('PeopleScreen — §32 rank + Lihat Profil', () => {
  it('rank badge shown for users with ranking data', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
      { id: 'u2', full_name: 'Arman', email: 'a@n.id' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Q1', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [
        { user_id: 'u1', rank_number: 1, score: 90 },
        { user_id: 'u2', rank_number: 2, score: 75 },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Peringkat 1')).toBeTruthy();
    expect(screen.getByLabelText('Peringkat 2')).toBeTruthy();
  });

  // D11: skor identik → rank kembar (1,1,3). Angka harus datang dari
  // ranking_snapshots.rank_number, bukan posisi array (yang akan render 1,2,3).
  it('tie renders rank_number kembar dari DB, bukan index+1', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
      { id: 'u2', full_name: 'Arman', email: 'a@n.id' },
      { id: 'u3', full_name: 'Budi', email: 'b@n.id' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Q1', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [
        { user_id: 'u2', rank_number: 1, score: 90 },
        { user_id: 'u1', rank_number: 1, score: 90 },
        { user_id: 'u3', rank_number: 3, score: 75 },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina')).toBeTruthy();
    expect(screen.getAllByLabelText('Peringkat 1')).toHaveLength(2);
    expect(screen.getByLabelText('Peringkat 3')).toBeTruthy();
    expect(screen.queryByLabelText('Peringkat 2')).toBeNull();
  });

  it('no rank badge when no closed period; keterangan tampil', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
    ]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina')).toBeTruthy();
    expect(screen.queryByLabelText(/Peringkat/)).toBeNull();
    expect(screen.getByText('Peringkat tampil setelah periode score ditutup.')).toBeTruthy();
  });

  it('keterangan HILANG saat sudah ada periode closed', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
    ]);
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
    expect(
      screen.queryByText('Peringkat tampil setelah periode score ditutup.')
    ).toBeNull();
  });

  it('Staff tanpa rank di periode closed → placeholder "Tidak dinilai periode ini"', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id', role_level: 'staff' },
      // Bayu = Staff yang belum sempat masuk hitungan (mis. data belum lengkap).
      { id: 'u2', full_name: 'Bayu', email: 'b@n.id', role_level: 'staff' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Juni 2026', status: 'closed' },
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
    expect(await screen.findByText('Bayu')).toBeTruthy();
    expect(screen.getByLabelText('Tidak dinilai periode ini')).toBeTruthy();
  });

  it('non-Staff (mis. C-Level) unranked → placeholder "Belum masuk cakupan penilaian"', async () => {
    // Formula level atas belum diaktifkan V1 (D7 owner 2026-06-25). Copy harus
    // membedakan "belum di-scope" (level di luar Staff) dari "tidak dinilai
    // periode ini" (Staff yang belum sempat masuk hitungan periode itu).
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id', role_level: 'staff' },
      { id: 'u2', full_name: 'Citra', email: 'c@n.id', role_level: 'ceo' },
      { id: 'u3', full_name: 'Bayu', email: 'b@n.id', role_level: 'c_level' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Juni 2026', status: 'closed' },
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
    expect(await screen.findByText('Citra')).toBeTruthy();
    // Dua non-Staff (Citra, Bayu) → dua placeholder "belum masuk cakupan".
    expect(screen.getAllByLabelText('Belum masuk cakupan penilaian')).toHaveLength(2);
    // Staff Rina sudah ada di ranking → tidak ada "Tidak dinilai periode ini".
    expect(screen.queryByLabelText('Tidak dinilai periode ini')).toBeNull();
  });

  it('tanpa periode closed → placeholder "Tidak dinilai …" TIDAK muncul', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
    ]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina')).toBeTruthy();
    expect(screen.queryByLabelText('Tidak dinilai periode ini')).toBeNull();
  });

  it('caption periode aktual tampil saat ada periode closed', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Juni 2026', status: 'closed' },
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
    expect(screen.getByText('Peringkat periode Juni 2026')).toBeTruthy();
  });

  it('setiap baris dapat dibuka via label "Buka profil …"', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina', email: 'r@n.id' },
      { id: 'u2', full_name: 'Arman', email: 'a@n.id' },
    ]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina')).toBeTruthy();
    expect(screen.getByLabelText('Buka profil Rina')).toBeTruthy();
    expect(screen.getByLabelText('Buka profil Arman')).toBeTruthy();
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
    expect(await screen.findByLabelText('Bulan Ini')).toBeTruthy();
    expect(screen.getByLabelText('Kuartal')).toBeTruthy();
    expect(screen.getByLabelText('Admin')).toBeTruthy();
    expect(screen.queryByLabelText('Ranking')).toBeNull();
  });

  it('[PPL-02-3] Admin tab HIDDEN saat can("manage_score_formula")=false', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Bulan Ini')).toBeTruthy();
    expect(screen.getByLabelText('Kuartal')).toBeTruthy();
    expect(screen.queryByLabelText('Admin')).toBeNull();
  });

  it('[PPL-02-4] press Quarter → placeholder tampil; roster + search HILANG', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Kuartal'));
    expect(await screen.findByText(/quarter|kuartal/i)).toBeTruthy();
    expect(screen.queryByText('Rina Jaya')).toBeNull();
    expect(screen.queryByLabelText('Cari anggota')).toBeNull();
  });

  it('[PPL-02-7] tab selected state berubah setelah press', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    const monthly = await screen.findByLabelText('Bulan Ini');
    const quarter = screen.getByLabelText('Kuartal');
    expect(monthly.props.accessibilityState?.selected).toBe(true);
    expect(quarter.props.accessibilityState?.selected).toBe(false);
    fireEvent.press(quarter);
    await screen.findByText(/quarter|kuartal/i);
    expect(screen.getByLabelText('Bulan Ini').props.accessibilityState?.selected).toBe(false);
    expect(screen.getByLabelText('Kuartal').props.accessibilityState?.selected).toBe(true);
  });

  it('[PPL-02-8] Admin tab render min 1 entry Pressable ke rute admin saat gate lolos', async () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'me' },
      isLoading: false,
      can: (k: string) => k === 'manage_score_formula',
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Admin'));
    const entry = await screen.findByLabelText('Buka Rumus Skor');
    fireEvent.press(entry);
    expect(mockPush).toHaveBeenCalledWith('/settings-score-formula');
  });
});
