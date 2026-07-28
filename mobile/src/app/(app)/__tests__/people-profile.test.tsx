// UI Fase 7 — People · Profil. null vs 0 (AC-7.23); tombol Override hanya berwenang + non-self.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetOrgProfileDetail = jest.fn();
const mockCountCompletedTasksInPeriod = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  getOrgProfileDetail: (...a: unknown[]) => mockGetOrgProfileDetail(...a),
  countCompletedTasksInPeriod: (...a: unknown[]) => mockCountCompletedTasksInPeriod(...a),
  personLabel: (p: { full_name?: string | null; email?: string | null } | null | undefined, fallback = 'Tanpa nama') =>
    p?.full_name?.trim() || p?.email || fallback,
}));

const mockUseActivePeriod = jest.fn();
const mockUseUserScore = jest.fn();
const mockUseLatestClosedPeriod = jest.fn();
const mockUseRanking = jest.fn();
const mockUseMyScoreHistory = jest.fn();
const mockUseUserScoreHistory = jest.fn();
jest.mock('@/hooks/use-people-score', () => {
  const actual = jest.requireActual('@/hooks/use-people-score');
  return {
    __esModule: true,
    ...actual,
    useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
    useUserScore: (...a: unknown[]) => mockUseUserScore(...a),
    useLatestClosedPeriod: (...a: unknown[]) => mockUseLatestClosedPeriod(...a),
    useRanking: (...a: unknown[]) => mockUseRanking(...a),
    useMyScoreHistory: (...a: unknown[]) => mockUseMyScoreHistory(...a),
    useUserScoreHistory: (...a: unknown[]) => mockUseUserScoreHistory(...a),
  };
});

const mockCan = jest.fn();
const mockProfile = { id: 'me' };
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: mockProfile, isLoading: false, can: mockCan }),
}));

const mockPush = jest.fn();
const mockParams: { id: string } = { id: 'u-rina' };
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));

// eslint-disable-next-line import/first
import PeopleProfileScreen from '../people-profile/[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockGetOrgProfileDetail.mockReset();
  mockUseActivePeriod.mockReset();
  mockUseUserScore.mockReset();
  mockUseLatestClosedPeriod.mockReset();
  mockUseRanking.mockReset();
  mockUseMyScoreHistory.mockReset();
  mockUseUserScoreHistory.mockReset();
  mockCan.mockReset();
  mockPush.mockReset();
  mockParams.id = 'u-rina';
  // Header identitas kini bersumber dari query detail per-orang (getOrgProfileDetail),
  // bukan lagi seluruh roster org. Resolve per-id; id tak dikenal → null (not-found state).
  const DETAILS: Record<string, unknown> = {
    'u-rina': {
      id: 'u-rina', full_name: 'Rina Jaya', email: 'rina@n.id',
      position_title: null, is_active: true, created_at: null, role_name: null, role_level: null,
    },
    me: {
      id: 'me', full_name: 'Aku', email: 'aku@n.id',
      position_title: null, is_active: true, created_at: null, role_name: null, role_level: null,
    },
  };
  mockGetOrgProfileDetail.mockImplementation((pid: string) => Promise.resolve(DETAILS[pid] ?? null));
  mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseUserScore.mockReturnValue({ score: null, isLoading: false, isError: false });
  mockUseLatestClosedPeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseRanking.mockReturnValue({ ranking: [], isLoading: false, isError: false, refetch: jest.fn() });
  mockUseMyScoreHistory.mockReturnValue({ history: [], isLoading: false, isError: false });
  mockUseUserScoreHistory.mockReturnValue({ history: [], isLoading: false, isError: false });
  mockCountCompletedTasksInPeriod.mockReset();
  mockCountCompletedTasksInPeriod.mockResolvedValue(0);
  mockCan.mockReturnValue(false);
});

describe('PeopleProfileScreen', () => {
  it('[1] nama + email tampil dari query detail (bukan roster)', async () => {
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    // Email dirender di header + seksi "Detail People" (keduanya dari `detail`).
    expect(screen.getAllByText('rina@n.id').length).toBeGreaterThan(0);
  });

  it('[2] skor null + self → GuidanceNote "Skor menyusul" (AC-7.23)', async () => {
    mockParams.id = 'me';
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Skor menyusul')).toBeTruthy();
  });

  it('[3] skor aktif + breakdown + admin → ScoreBadge + label metrik', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseUserScore.mockReturnValue({
      score: {
        auto_calculated_score: 88,
        manual_adjusted_score: null,
        metric_breakdown: { task_completion: 90, governance_discipline: 70 },
      },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Score 88 · On track')).toBeTruthy();
    expect(screen.getByText('Penyelesaian Tugas')).toBeTruthy();
    expect(screen.getByText('Disiplin Tata Kelola')).toBeTruthy();
  });

  it('[4] berwenang + non-self + periode aktif → tombol Override muncul', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Override Skor')).toBeTruthy();
  });

  it('[5] tanpa wewenang → tombol Override tidak muncul', async () => {
    mockCan.mockReturnValue(false);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Rina Jaya');
    expect(screen.queryByLabelText('Override Skor')).toBeNull();
  });

  it('[6] profil diri sendiri → tombol Override tidak muncul (anti-self D10)', async () => {
    mockParams.id = 'me';
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Aku');
    expect(screen.queryByLabelText('Override Skor')).toBeNull();
  });

  // ================================================================ §33 score detail gating
  it('[§33-1] staff viewing others → Achievement Score + Breakdown HIDDEN', async () => {
    mockParams.id = 'u-rina';
    mockCan.mockReturnValue(false);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseUserScore.mockReturnValue({
      score: {
        auto_calculated_score: 88,
        manual_adjusted_score: null,
        metric_breakdown: { task_completion: 90 },
      },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Rina Jaya');
    expect(screen.queryByText('Skor Pencapaian')).toBeNull();
    expect(screen.queryByText('Rincian Metrik')).toBeNull();
  });

  it('[§33-2] staff viewing self → Achievement Score visible', async () => {
    mockParams.id = 'me';
    mockCan.mockReturnValue(false);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseUserScore.mockReturnValue({
      score: { auto_calculated_score: 75, manual_adjusted_score: null, metric_breakdown: {} },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Aku');
    expect(screen.getByText('Skor Pencapaian')).toBeTruthy();
  });

  it('[§33-3] staff viewing others → Ranking ringan still visible (komponen 4)', async () => {
    mockParams.id = 'u-rina';
    mockCan.mockReturnValue(false);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'cp1', period_name: 'Q4', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [{ user_id: 'u-rina', rank_number: 3, score: 80, metric_breakdown: {} }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Rina Jaya');
    expect(screen.getByText('#3')).toBeTruthy();
    expect(screen.getByText('Ranking')).toBeTruthy();
  });

  // ================================================================ PPL-06 Fase D subset (OQ-5)
  it('[PPL-06-Q1] id tidak match anggota org → GuidanceNote "Anggota tidak ditemukan" (not blank)', async () => {
    mockParams.id = 'unknown-id';
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/anggota tidak ditemukan/i)).toBeTruthy();
    // Konten profil (email, override, breakdown, dsb) TIDAK dirender pada not-found state.
    expect(screen.queryByText('rina@n.id')).toBeNull();
    expect(screen.queryByLabelText('Override Skor')).toBeNull();
  });

  it('[PPL-06-Q2] profil orang lain + admin + useUserScoreHistory berisi 3 titik → seksi Tren + sparkline render', async () => {
    // viewer = 'me', profil = 'u-rina' (bukan self); admin sees score detail (§33).
    mockParams.id = 'u-rina';
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseUserScore.mockReturnValue({
      score: { auto_calculated_score: 82, manual_adjusted_score: null, metric_breakdown: {} },
      isLoading: false,
      isError: false,
    });
    // History DESC: terbaru first → reverse jadi kronologis 60, 70, 82.
    mockUseUserScoreHistory.mockReturnValue({
      history: [
        { auto_calculated_score: 82, manual_adjusted_score: null },
        { auto_calculated_score: 70, manual_adjusted_score: null },
        { auto_calculated_score: 60, manual_adjusted_score: null },
      ],
      isLoading: false,
      isError: false,
    });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    // Label "Tren" muncul (existing implementation self-only akan miss — proper RED).
    expect(await screen.findByText('Tren')).toBeTruthy();
    // Sparkline accessibilityLabel (3 titik kronologis: 60 → 70 → 82; delta = last - previous = +12).
    expect(
      screen.getByLabelText(/Tren skor 3 periode, terbaru 82, perubahan ↑ \+12/),
    ).toBeTruthy();
  });

  it('[PPL-06-Q3] profil orang lain + admin + useUserScoreHistory kosong → seksi Tren HIDDEN (graceful)', async () => {
    mockParams.id = 'u-rina';
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseUserScore.mockReturnValue({
      score: { auto_calculated_score: 82, manual_adjusted_score: null, metric_breakdown: {} },
      isLoading: false,
      isError: false,
    });
    mockUseUserScoreHistory.mockReturnValue({ history: [], isLoading: false, isError: false });
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Rina Jaya');
    // Skor tampil tapi Tren tidak (RLS-deny history atau belum ada histori).
    // Band 82 = Stabil (band range dari @/components/ui/ScoreBadge, sama dgn F7-4).
    expect(screen.getByLabelText('Score 82 · Stabil')).toBeTruthy();
    expect(screen.queryByText('Tren')).toBeNull();
  });

  it('[PPL-06-Q4] rules-of-hooks — kedua useMyScoreHistory & useUserScoreHistory dipanggil unconditionally per render', async () => {
    // Profil orang lain: kedua hook TETAP dipanggil (bukan conditional) supaya urutan hooks stabil
    // saat viewer berpindah dari profil self ke profil orang lain (STRATEGI-MOCK-3 kritik).
    mockParams.id = 'u-rina';
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Rina Jaya');
    expect(mockUseMyScoreHistory).toHaveBeenCalled();
    expect(mockUseUserScoreHistory).toHaveBeenCalled();
  });

  // ================================================================ PPL-06 Kontribusi bulan ini (OQ-6)
  it('[PPL-06-K1] isSelf + count 5 → "5 tugas selesai bulan ini" render', async () => {
    mockParams.id = 'me';
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active', period_start: '2026-07-01', period_end: '2026-07-31' },
      isLoading: false,
      isError: false,
    });
    mockCountCompletedTasksInPeriod.mockResolvedValue(5);
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    // Header 'Kontribusi bulan ini' + jumlah 5 tampil.
    expect(await screen.findByText('Kontribusi bulan ini')).toBeTruthy();
    expect(screen.getByText(/5 tugas selesai bulan ini/i)).toBeTruthy();
  });

  it('[PPL-06-K2] isSelf + count 0 → GuidanceNote "Belum ada AP selesai bulan ini"', async () => {
    mockParams.id = 'me';
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active', period_start: '2026-07-01', period_end: '2026-07-31' },
      isLoading: false,
      isError: false,
    });
    mockCountCompletedTasksInPeriod.mockResolvedValue(0);
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    // Seksi tetap render untuk isSelf, tapi copy = 'Belum ada AP selesai bulan ini' (disambiguasi 0-nyata).
    expect(await screen.findByText('Kontribusi bulan ini')).toBeTruthy();
    expect(screen.getByText(/belum ada .* selesai bulan ini/i)).toBeTruthy();
  });

  it('[PPL-06-K3] !isSelf + count 0 → seksi HIDDEN (OQ-6 sub-2: hindari ambiguitas 0-nyata vs RLS-hidden)', async () => {
    mockParams.id = 'u-rina';
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active', period_start: '2026-07-01', period_end: '2026-07-31' },
      isLoading: false,
      isError: false,
    });
    mockCountCompletedTasksInPeriod.mockResolvedValue(0);
    await render(<PeopleProfileScreen />, { wrapper: wrapper() });
    await screen.findByText('Rina Jaya');
    // Untuk profil orang lain + count=0: seksi TIDAK render (ambigu 0 nyata vs RLS-hidden).
    expect(screen.queryByText('Kontribusi bulan ini')).toBeNull();
  });
});
