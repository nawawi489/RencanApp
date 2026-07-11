// Layar People — 4 state fondasi + 5 case Fase 7 (skor saya & periode) + PPL-02 tab structure.
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
  // UI-S-PP2 — sibling baru yang dipakai PeopleScreen; default ke listOrgProfiles supaya test lama
  // tidak perlu mock dua-duanya. Mock entry per test boleh override.
  listOrgProfilesWithRoles: () => mockListOrgProfiles(),
  personLabel: (p: { full_name?: string | null; email?: string | null } | null | undefined, fallback = 'Tanpa nama') =>
    p?.full_name?.trim() || p?.email || fallback,
}));

// EXPO-ROUTER-MOCK (critic): top-level mockPush agar assertion toHaveBeenCalledWith stabil
// (setiap render tidak membuat instance baru).
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
}));

const mockUseActivePeriod = jest.fn();
const mockUseMyScore = jest.fn();
const mockUseLatestClosedPeriod = jest.fn();
const mockUseRanking = jest.fn();
const mockUseMyScoreHistory = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
  useMyScore: (...a: unknown[]) => mockUseMyScore(...a),
  useLatestClosedPeriod: (...a: unknown[]) => mockUseLatestClosedPeriod(...a),
  useRanking: (...a: unknown[]) => mockUseRanking(...a),
  useMyScoreHistory: (...a: unknown[]) => mockUseMyScoreHistory(...a),
}));

// STRATEGI-MOCK-2 (critic): mock useProfile dengan default profile=null/can=()=>false — tanpa ini
// implementasi baru yang panggil useProfile() akan crash pada test lama yang tak menyediakan mock.
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
  mockUseActivePeriod.mockReset();
  mockUseMyScore.mockReset();
  mockUseLatestClosedPeriod.mockReset();
  mockUseRanking.mockReset();
  mockPush.mockReset();
  // default: no active period, no score (preserves backward-compat shape).
  mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseMyScore.mockReturnValue({ score: null, isLoading: false, isError: false });
  // MOCK-SHAPE-DRIFT (critic): existing useLatestClosedPeriod tidak return refetch — jangan set di mock.
  mockUseLatestClosedPeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseRanking.mockReturnValue({ ranking: [], isLoading: false, isError: false, refetch: jest.fn() });
  mockUseMyScoreHistory.mockReset();
  mockUseMyScoreHistory.mockReturnValue({ history: [], isLoading: false, isError: false });
  // Default: non-admin. Admin tab tidak render; test PPL-02-2/PPL-02-8 override sendiri.
  mockUseProfile.mockReset();
  mockUseProfile.mockReturnValue({ profile: null, isLoading: false, can: () => false });
});

describe('PeopleScreen — 4 state fondasi', () => {
  it('loading → skeleton aksesibel "Memuat…"', async () => {
    mockListOrgProfiles.mockReturnValue(new Promise(() => {}));
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('data → ScoreLegend + nama anggota + Avatar', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Rina Jaya', email: 'rina@nyantuy.id' },
      { id: 'u2', full_name: 'Arman Malik', email: 'arman@nyantuy.id' },
    ]);
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Skala Score')).toBeTruthy();
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

describe('PeopleScreen — Fase 7 score states', () => {
  beforeEach(() => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'me', full_name: 'Aku', email: 'aku@nyantuy.id' },
    ]);
  });

  it('[F7-1] tak ada periode aktif → GuidanceNote "Belum ada periode skoring"', async () => {
    mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
    mockUseMyScore.mockReturnValue({ score: null, isLoading: false, isError: false });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Belum ada periode skoring')).toBeTruthy();
  });

  it('[F7-2] periode aktif + score null → GuidanceNote "Skor menyusul" (bukan ScoreBadge)', async () => {
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseMyScore.mockReturnValue({ score: null, isLoading: false, isError: false });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Skor menyusul')).toBeTruthy();
    // ScoreBadge dari skor saya TIDAK ada (label "Skor saya" tak muncul).
    expect(screen.queryByLabelText('Skor saya')).toBeNull();
  });

  it('[F7-3] periode aktif + my score 0 NYATA → ScoreBadge attention (bukan null)', async () => {
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseMyScore.mockReturnValue({
      score: {
        auto_calculated_score: 0,
        manual_adjusted_score: null,
        metric_breakdown: {},
      },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Skor saya')).toBeTruthy();
    expect(await screen.findByLabelText('Score 0 · Perlu perhatian')).toBeTruthy();
  });

  it('[F7-4] periode aktif + my score 80 + breakdown 2 metrics → ScoreBadge + breakdown render label', async () => {
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseMyScore.mockReturnValue({
      score: {
        auto_calculated_score: 80,
        manual_adjusted_score: null,
        metric_breakdown: { task_completion: 90, governance_discipline: 70 },
      },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Score 80 · Stabil')).toBeTruthy();
    expect(screen.getByText('Task Completion')).toBeTruthy();
    expect(screen.getByText('Governance Discipline')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
  });

  it('[F7-6] periode tertutup + ranking → ScoreBadge per user yang ada di ranking', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u-rina', full_name: 'Rina', email: 'r@n.id' },
      { id: 'u-arman', full_name: 'Arman', email: 'a@n.id' },
      { id: 'u-belum', full_name: 'Belum Dinilai', email: 'b@n.id' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Q1', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [
        { user_id: 'u-rina', rank_number: 1, score: 88 },
        { user_id: 'u-arman', rank_number: 2, score: 72 },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Score 88 · On track')).toBeTruthy();
    expect(screen.getByLabelText('Score 72 · Stabil')).toBeTruthy();
    // 'Belum Dinilai' tidak ada di ranking → tak ada badge.
    expect(screen.queryByLabelText(/Score \d+ · .* Belum/)).toBeNull();
  });

  it('[F7-7] tak ada periode tertutup → tidak ada per-user badge (graceful)', async () => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u1', full_name: 'Solo', email: 's@n.id' },
    ]);
    mockUseLatestClosedPeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
    mockUseRanking.mockReturnValue({ ranking: [], isLoading: false, isError: false, refetch: jest.fn() });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Solo')).toBeTruthy();
    // tidak ada ScoreBadge muncul untuk profile karena ranking kosong.
    expect(screen.queryByLabelText(/^Score \d/)).toBeNull();
  });

  it('[F7-8] Sparkline Trend muncul saat ada histori skor (≥1 titik)', async () => {
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseMyScore.mockReturnValue({
      score: { auto_calculated_score: 80, manual_adjusted_score: null, metric_breakdown: {} },
      isLoading: false,
      isError: false,
    });
    // History DESC: terbaru first. Sparkline reverse → kronologis kiri-ke-kanan: 60, 70, 80.
    mockUseMyScoreHistory.mockReturnValue({
      history: [
        { auto_calculated_score: 80, manual_adjusted_score: null },
        { auto_calculated_score: 70, manual_adjusted_score: null },
        { auto_calculated_score: 60, manual_adjusted_score: null },
      ],
      isLoading: false,
      isError: false,
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tren')).toBeTruthy();
    // a11y label dari ScoreSparkline (3 titik kronologis: 60, 70, 80; terbaru 80; delta +10)
    expect(
      screen.getByLabelText(/Tren skor 3 periode, terbaru 80, perubahan ↑ \+10/),
    ).toBeTruthy();
  });

  it('[F7-5-placeholder] — kept to preserve line-scope', () => { /* noop */ });
});

// ============================================================ PPL-02 tab structure (Fase C)
describe('PeopleScreen — PPL-02 tab structure', () => {
  beforeEach(() => {
    mockListOrgProfiles.mockResolvedValue([
      { id: 'u-rina', full_name: 'Rina Jaya', email: 'rina@nyantuy.id' },
    ]);
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1 2026', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseMyScore.mockReturnValue({
      score: { auto_calculated_score: 75, manual_adjusted_score: null, metric_breakdown: {} },
      isLoading: false,
      isError: false,
    });
  });

  it('[PPL-02-1] default tab "Bulan ini" — konten eksisting (Skor saya + search + roster) tampil', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    // Skor saya section rendered (existing behavior preserved).
    expect(await screen.findByLabelText('Skor saya')).toBeTruthy();
    // Search input existing.
    expect(screen.getByLabelText('Cari anggota')).toBeTruthy();
    // Roster row rendered.
    expect(screen.getByText('Rina Jaya')).toBeTruthy();
  });

  it('[PPL-02-2] 4 tab labels visible saat can("manage_score_formula")=true', async () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'me' },
      isLoading: false,
      can: (k: string) => k === 'manage_score_formula',
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    // TAB-A11Y-RN (critic): pakai getByLabelText fallback, bukan role='tab'.
    expect(await screen.findByLabelText('Bulan ini')).toBeTruthy();
    expect(screen.getByLabelText('Quarter')).toBeTruthy();
    expect(screen.getByLabelText('Ranking')).toBeTruthy();
    expect(screen.getByLabelText('Admin')).toBeTruthy();
  });

  it('[PPL-02-3] Admin tab HIDDEN saat can("manage_score_formula")=false', async () => {
    // default beforeEach: can=()=>false
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Bulan ini')).toBeTruthy();
    // 3 tab non-admin tetap tampak, Admin absen.
    expect(screen.getByLabelText('Quarter')).toBeTruthy();
    expect(screen.getByLabelText('Ranking')).toBeTruthy();
    expect(screen.queryByLabelText('Admin')).toBeNull();
  });

  it('[PPL-02-4] press Quarter → placeholder tampil; roster + search HILANG (mount/unmount)', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    // pre-condition: monthly-only content rendered.
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Quarter'));
    // Placeholder muncul (locked ke PEOPLE_TAB_COPY.quarterlyPlaceholder — cocok /quarter|kuartal/i).
    expect(await screen.findByText(/quarter|kuartal/i)).toBeTruthy();
    // TAB-DEFAULT-CONTENT-LEAK (critic): roster benar-benar unmount, bukan display:none.
    expect(screen.queryByText('Rina Jaya')).toBeNull();
    expect(screen.queryByLabelText('Cari anggota')).toBeNull();
  });

  it('[PPL-02-5] press Ranking tanpa closed period → GuidanceNote', async () => {
    // default: mockUseLatestClosedPeriod.period=null
    await render(<PeopleScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Ranking'));
    expect(await screen.findByText(/belum ada periode tertutup/i)).toBeTruthy();
  });

  it('[PPL-02-6] press Ranking dgn closed period + data → ranking rows dgn skor', async () => {
    mockUseLatestClosedPeriod.mockReturnValue({
      period: { id: 'p-closed', period_name: 'Q4 2025', status: 'closed' },
      isLoading: false,
      isError: false,
    });
    mockUseRanking.mockReturnValue({
      ranking: [
        { user_id: 'u-rina', rank_number: 1, score: 88 },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Ranking'));
    // Nama + skor ranking rendered di tab Ranking.
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    expect(screen.getByLabelText('Score 88 · On track')).toBeTruthy();
  });

  it('[PPL-02-7] tab selected state berubah setelah press', async () => {
    await render(<PeopleScreen />, { wrapper: wrapper() });
    const monthly = await screen.findByLabelText('Bulan ini');
    const quarter = screen.getByLabelText('Quarter');
    // Default: Bulan ini selected, Quarter tidak.
    expect(monthly.props.accessibilityState?.selected).toBe(true);
    expect(quarter.props.accessibilityState?.selected).toBe(false);
    fireEvent.press(quarter);
    // Setelah press Quarter, selected pindah — waitFor menunggu state React flush.
    // findByText di bawah juga berperan sebagai gate agar tree Quarter selesai render dulu.
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
    // ADMIN_TAB_ENTRIES minimal berisi Score Formula (rute eksisting /settings-score-formula).
    const entry = await screen.findByLabelText('Buka Score Formula');
    fireEvent.press(entry);
    expect(mockPush).toHaveBeenCalledWith('/settings-score-formula');
  });
});

describe('__PPL02_FSPLACEHOLDER__', () => {
  it('[F7-5-placeholder2] guard scope', () => { /* noop */ });
});

// Original F7-5 (kept — moved-guard scope):
describe('PeopleScreen — Fase 7 F7-5 (moved for scope)', () => {
  beforeEach(() => {
    mockListOrgProfiles.mockResolvedValue([{ id: 'me', full_name: 'Aku', email: 'aku@nyantuy.id' }]);
  });
  it('[F7-5] manual_adjusted_score=0 NYATA → effective=0, BUKAN fallback ke auto (?? bukan ||)', async () => {
    mockUseActivePeriod.mockReturnValue({
      period: { id: 'p1', period_name: 'Q1', status: 'active' },
      isLoading: false,
      isError: false,
    });
    mockUseMyScore.mockReturnValue({
      score: {
        auto_calculated_score: 85,
        manual_adjusted_score: 0,
        metric_breakdown: {},
      },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Score 0 · Perlu perhatian')).toBeTruthy();
    expect(screen.queryByLabelText('Score 85 · Stabil')).toBeNull();
  });
});
