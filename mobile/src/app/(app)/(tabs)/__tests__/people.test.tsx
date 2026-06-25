// Layar People — 4 state fondasi + 5 case Fase 7 (skor saya & periode).
// Pola: mock supabase (stub) + mock @/lib/cards.listOrgProfiles + mock @/hooks/use-people-score.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  listOrgProfiles: () => mockListOrgProfiles(),
}));

const mockUseActivePeriod = jest.fn();
const mockUseMyScore = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
  useMyScore: (...a: unknown[]) => mockUseMyScore(...a),
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
  // default: no active period, no score (preserves backward-compat shape).
  mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
  mockUseMyScore.mockReturnValue({ score: null, isLoading: false, isError: false });
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
    expect(screen.getByText('2 user')).toBeTruthy();
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
        metric_breakdown: { action_plan_completion: 90, governance_discipline: 70 },
      },
      isLoading: false,
      isError: false,
    });
    await render(<PeopleScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Score 80 · Stabil')).toBeTruthy();
    expect(screen.getByText('Action Plan Completion')).toBeTruthy();
    expect(screen.getByText('Governance Discipline')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
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
