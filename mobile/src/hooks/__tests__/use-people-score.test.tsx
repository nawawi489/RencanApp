// Hooks Fase 7 — use-people-score (RED). Mengunci kontrak queryKey + gate enabled + invalidasi cache.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockGetActivePeriod = jest.fn();
const mockGetMyScore = jest.fn();
const mockListRanking = jest.fn();
const mockListScoreFormulaVersions = jest.fn();
const mockOpenPeriodSnapshot = jest.fn();
const mockCalculatePeriodScores = jest.fn();
const mockClosePeriodSnapshot = jest.fn();
const mockOverrideUserScore = jest.fn();
const mockUpsertScoreFormulaVersion = jest.fn();
const mockActivateScoreFormulaVersion = jest.fn();
const mockAssignScoreFormula = jest.fn();

jest.mock('@/lib/people-score', () => ({
  getActivePeriod: (...a: unknown[]) => mockGetActivePeriod(...a),
  getMyScore: (...a: unknown[]) => mockGetMyScore(...a),
  listRanking: (...a: unknown[]) => mockListRanking(...a),
  listScoreFormulaVersions: (...a: unknown[]) => mockListScoreFormulaVersions(...a),
  openPeriodSnapshot: (...a: unknown[]) => mockOpenPeriodSnapshot(...a),
  calculatePeriodScores: (...a: unknown[]) => mockCalculatePeriodScores(...a),
  closePeriodSnapshot: (...a: unknown[]) => mockClosePeriodSnapshot(...a),
  overrideUserScore: (...a: unknown[]) => mockOverrideUserScore(...a),
  upsertScoreFormulaVersion: (...a: unknown[]) => mockUpsertScoreFormulaVersion(...a),
  activateScoreFormulaVersion: (...a: unknown[]) => mockActivateScoreFormulaVersion(...a),
  assignScoreFormula: (...a: unknown[]) => mockAssignScoreFormula(...a),
}));

// eslint-disable-next-line import/first
import {
  useActivePeriod,
  useFormulaActions,
  useMyScore,
  usePeriodActions,
  useRanking,
  useScoreFormulaVersions,
  useScoreOverride,
} from '../use-people-score';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActivePeriod.mockResolvedValue({ id: 'p-active', status: 'active' });
  mockGetMyScore.mockResolvedValue({ id: 'r1', auto_calculated_score: 75 });
  mockListRanking.mockResolvedValue([{ rank_number: 1 }]);
  mockListScoreFormulaVersions.mockResolvedValue([{ version_number: 1 }]);
  mockOpenPeriodSnapshot.mockResolvedValue('p-new');
  mockCalculatePeriodScores.mockResolvedValue(5);
  mockClosePeriodSnapshot.mockResolvedValue(3);
  mockOverrideUserScore.mockResolvedValue('r-over');
  mockUpsertScoreFormulaVersion.mockResolvedValue('v-new');
  mockActivateScoreFormulaVersion.mockResolvedValue(undefined);
  mockAssignScoreFormula.mockResolvedValue('a1');
});

describe('useActivePeriod', () => {
  it('[1] fetch tanpa gate, queryKey terkunci [active_period]', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useActivePeriod(), { wrapper });
    await waitFor(() => expect(result.current.period?.id).toBe('p-active'));
    expect(mockGetActivePeriod).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(['active_period'])).toEqual({ id: 'p-active', status: 'active' });
  });
});

describe('useMyScore', () => {
  it('[2] tanpa periodId — queryKey [my_score, "active"], passthrough undefined', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMyScore(), { wrapper });
    await waitFor(() => expect(result.current.score?.id).toBe('r1'));
    expect(mockGetMyScore).toHaveBeenCalledWith(undefined);
    expect(qc.getQueryData(['my_score', 'active'])).toBeTruthy();
  });

  it('[3] periodId eksplisit — queryKey [my_score, periodId]', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMyScore('p1'), { wrapper });
    await waitFor(() => expect(result.current.score?.id).toBe('r1'));
    expect(mockGetMyScore).toHaveBeenCalledWith('p1');
    expect(qc.getQueryData(['my_score', 'p1'])).toBeTruthy();
  });
});

describe('useRanking', () => {
  it('[4] periodId kosong → no fetch (gate enabled !!periodId)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useRanking(''), { wrapper });
    // beri waktu kesempatan untuk fetch yang seharusnya tak terjadi
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListRanking).not.toHaveBeenCalled();
    expect(result.current.ranking).toEqual([]);
  });

  it('[5] periodId terisi → fetch & queryKey [ranking, periodId]', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useRanking('p1'), { wrapper });
    await waitFor(() => expect(result.current.ranking.length).toBe(1));
    expect(mockListRanking).toHaveBeenCalledWith('p1');
    expect(qc.getQueryData(['ranking', 'p1'])).toBeTruthy();
  });
});

describe('useScoreFormulaVersions', () => {
  it('[6] templateId kosong → no fetch; templateId terisi → queryKey [score_formula_versions, id]', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(
      () => ({ empty: useScoreFormulaVersions(''), v: useScoreFormulaVersions('t1') }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.v.versions.length).toBe(1));
    expect(mockListScoreFormulaVersions).toHaveBeenCalledTimes(1);
    expect(mockListScoreFormulaVersions).toHaveBeenCalledWith('t1');
  });
});

describe('usePeriodActions — open / calculate / close + invalidasi', () => {
  it('[7] open() → openPeriodSnapshot; invalidasi [active_period]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => usePeriodActions(), { wrapper });
    await act(async () => {
      await result.current.open({ periodName: 'Q1', periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    });
    expect(mockOpenPeriodSnapshot).toHaveBeenCalledWith({
      periodName: 'Q1', periodStart: '2026-01-01', periodEnd: '2026-03-31',
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['active_period'] });
  });

  it('[8] calculate(p1) → invalidasi [my_score] semua + [ranking, p1]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => usePeriodActions(), { wrapper });
    await act(async () => {
      await result.current.calculate('p1');
    });
    expect(mockCalculatePeriodScores).toHaveBeenCalledWith('p1');
    const keys = spy.mock.calls.map(c => JSON.stringify(c[0]));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify({ queryKey: ['my_score'] }),
      JSON.stringify({ queryKey: ['ranking', 'p1'] }),
    ]));
  });

  it('[9] close(p1) → invalidasi [active_period] + [ranking, p1] + [my_score]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => usePeriodActions(), { wrapper });
    await act(async () => {
      await result.current.close('p1');
    });
    expect(mockClosePeriodSnapshot).toHaveBeenCalledWith('p1');
    const keys = spy.mock.calls.map(c => JSON.stringify(c[0]));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify({ queryKey: ['active_period'] }),
      JSON.stringify({ queryKey: ['ranking', 'p1'] }),
      JSON.stringify({ queryKey: ['my_score'] }),
    ]));
  });
});

describe('useScoreOverride — single-actor', () => {
  it('[10] override → overrideUserScore; invalidasi [my_score] + [ranking, p1]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useScoreOverride('p1'), { wrapper });
    await act(async () => {
      await result.current.override({ userId: 'u2', manualScore: 82, reason: 'koreksi' });
    });
    expect(mockOverrideUserScore).toHaveBeenCalledWith({
      periodId: 'p1', userId: 'u2', manualScore: 82, reason: 'koreksi',
    });
    const keys = spy.mock.calls.map(c => JSON.stringify(c[0]));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify({ queryKey: ['my_score'] }),
      JSON.stringify({ queryKey: ['ranking', 'p1'] }),
    ]));
  });

  it('[11] override gagal → mutateAsync MELEMPAR (error propagate)', async () => {
    mockOverrideUserScore.mockRejectedValueOnce(new Error('Anda tidak bisa mengubah score Anda sendiri.'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useScoreOverride('p1'), { wrapper });
    await expect(
      result.current.override({ userId: 'self', manualScore: 99, reason: 'x' }),
    ).rejects.toThrow('Anda tidak bisa mengubah score Anda sendiri.');
  });
});

describe('useFormulaActions — upsert / activate / assign', () => {
  it('[12] upsert→activate→assign passthrough + invalidasi [score_formula_versions, templateId]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useFormulaActions('t1'), { wrapper });
    await act(async () => {
      await result.current.upsert({ categories: [{ code: 'a', weight: 100, source_metric: 'a' }], changeReason: 'init' });
    });
    expect(mockUpsertScoreFormulaVersion).toHaveBeenCalledWith({
      templateId: 't1',
      categories: [{ code: 'a', weight: 100, source_metric: 'a' }],
      changeReason: 'init',
    });
    await act(async () => {
      await result.current.activate('v1', '2026-06-25');
    });
    expect(mockActivateScoreFormulaVersion).toHaveBeenCalledWith('v1', '2026-06-25');
    await act(async () => {
      await result.current.assign({
        versionId: 'v1', scopeLevel: 'org_role', roleLevel: 'staff', userId: null, startDate: '2026-06-25',
      });
    });
    expect(mockAssignScoreFormula).toHaveBeenCalled();
    const keys = spy.mock.calls.map(c => JSON.stringify(c[0]));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify({ queryKey: ['score_formula_versions', 't1'] }),
    ]));
  });
});
