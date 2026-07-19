// Hooks Fase 7 — use-people-score (RED). Mengunci kontrak queryKey + gate enabled + invalidasi cache.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockGetLatestClosedPeriod = jest.fn();
const mockGetActivePeriod = jest.fn();
const mockGetMyScore = jest.fn();
const mockListRanking = jest.fn();
const mockListScoreFormulaVersions = jest.fn();
const mockListScoreFormulaTemplates = jest.fn();
const mockOverrideUserScore = jest.fn();
const mockUpsertScoreFormulaVersion = jest.fn();
const mockActivateScoreFormulaVersion = jest.fn();
const mockAssignScoreFormula = jest.fn();
const mockCreateScoreFormulaDraft = jest.fn();
const mockUpdateFormulaVersionWeights = jest.fn();
const mockClosePeriodSnapshot = jest.fn();
const mockCalculatePeriodScores = jest.fn();
const mockPreviewFinalization = jest.fn();

const mockListMyScoreHistory = jest.fn();
const mockListUserScoreHistory = jest.fn();
jest.mock('@/lib/people-score', () => ({
  calculatePeriodScores: (...a: unknown[]) => mockCalculatePeriodScores(...a),
  previewFinalization: (...a: unknown[]) => mockPreviewFinalization(...a),
  closePeriodSnapshot: (...a: unknown[]) => mockClosePeriodSnapshot(...a),
  getActivePeriod: (...a: unknown[]) => mockGetActivePeriod(...a),
  getLatestClosedPeriod: (...a: unknown[]) => mockGetLatestClosedPeriod(...a),
  listMyScoreHistory: (...a: unknown[]) => mockListMyScoreHistory(...a),
  listUserScoreHistory: (...a: unknown[]) => mockListUserScoreHistory(...a),
  getMyScore: (...a: unknown[]) => mockGetMyScore(...a),
  listRanking: (...a: unknown[]) => mockListRanking(...a),
  listScoreFormulaVersions: (...a: unknown[]) => mockListScoreFormulaVersions(...a),
  listScoreFormulaTemplates: (...a: unknown[]) => mockListScoreFormulaTemplates(...a),
  overrideUserScore: (...a: unknown[]) => mockOverrideUserScore(...a),
  upsertScoreFormulaVersion: (...a: unknown[]) => mockUpsertScoreFormulaVersion(...a),
  activateScoreFormulaVersion: (...a: unknown[]) => mockActivateScoreFormulaVersion(...a),
  assignScoreFormula: (...a: unknown[]) => mockAssignScoreFormula(...a),
  createScoreFormulaDraft: (...a: unknown[]) => mockCreateScoreFormulaDraft(...a),
  updateFormulaVersionWeights: (...a: unknown[]) => mockUpdateFormulaVersionWeights(...a),
}));

// eslint-disable-next-line import/first
import {
  useActivePeriod,
  useCalculatePeriodScores,
  useClosePeriod,
  useFormulaActions,
  usePreviewFinalization,
  useLatestClosedPeriod,
  useMyScore,
  useMyScoreHistory,
  useRanking,
  useScoreFormulaTemplates,
  useScoreFormulaVersions,
  useScoreOverride,
  useUserScoreHistory,
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
  mockGetLatestClosedPeriod.mockResolvedValue({ id: 'p-closed', status: 'closed' });
  mockListMyScoreHistory.mockResolvedValue([{ id: 'h1', auto_calculated_score: 75 }]);
  mockListUserScoreHistory.mockResolvedValue([{ id: 'uh1', auto_calculated_score: 82 }]);
  mockGetMyScore.mockResolvedValue({ id: 'r1', auto_calculated_score: 75 });
  mockListRanking.mockResolvedValue([{ rank_number: 1 }]);
  mockListScoreFormulaVersions.mockResolvedValue([{ version_number: 1 }]);
  mockListScoreFormulaTemplates.mockResolvedValue([{ id: 't1', level: 'staff' }]);
  mockOverrideUserScore.mockResolvedValue('r-over');
  mockUpsertScoreFormulaVersion.mockResolvedValue('v-new');
  mockActivateScoreFormulaVersion.mockResolvedValue(undefined);
  mockAssignScoreFormula.mockResolvedValue('a1');
  mockClosePeriodSnapshot.mockResolvedValue(3);
  mockCalculatePeriodScores.mockResolvedValue(5);
  mockPreviewFinalization.mockResolvedValue({ eligibleUsers: 5, activeOverrides: 1 });
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

describe('useLatestClosedPeriod', () => {
  it('[1b] fetch + queryKey [latest_closed_period]', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useLatestClosedPeriod(), { wrapper });
    await waitFor(() => expect(result.current.period?.id).toBe('p-closed'));
    expect(mockGetLatestClosedPeriod).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(['latest_closed_period'])).toBeTruthy();
  });
});

describe('useMyScoreHistory', () => {
  it('[1c] fetch + queryKey [my_score_history, limit]', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMyScoreHistory(6), { wrapper });
    await waitFor(() => expect(result.current.history.length).toBe(1));
    expect(mockListMyScoreHistory).toHaveBeenCalledWith(6);
    expect(qc.getQueryData(['my_score_history', 6])).toBeTruthy();
  });
});

describe('useUserScoreHistory — cross-user RLS-gated (PPL-06 / OQ-5)', () => {
  it('[B1] userId kosong → tanpa fetch (enabled=!!userId), history=[]', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useUserScoreHistory('', 6), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListUserScoreHistory).not.toHaveBeenCalled();
    expect(result.current.history).toEqual([]);
  });

  it('[B2] userId+limit → fetch, queryKey [user_score_history, userId, limit], passthrough', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useUserScoreHistory('u2', 6), { wrapper });
    await waitFor(() => expect(result.current.history.length).toBe(1));
    expect(mockListUserScoreHistory).toHaveBeenCalledWith('u2', 6);
    expect(qc.getQueryData(['user_score_history', 'u2', 6])).toBeTruthy();
  });

  it('[B3] RLS deny (mock resolve []) → history=[], isError=false', async () => {
    mockListUserScoreHistory.mockResolvedValueOnce([]);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useUserScoreHistory('u-hidden', 6), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.history).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it('[B4] default limit=6 saat argumen tak diberi', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useUserScoreHistory('u2'), { wrapper });
    await waitFor(() => expect(result.current.history.length).toBe(1));
    expect(mockListUserScoreHistory).toHaveBeenCalledWith('u2', 6);
    expect(qc.getQueryData(['user_score_history', 'u2', 6])).toBeTruthy();
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

describe('useScoreFormulaTemplates', () => {
  it('[6b] fetch + queryKey [score_formula_templates]', async () => {
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(() => useScoreFormulaTemplates(), { wrapper });
    await waitFor(() => expect(result.current.templates.length).toBe(1));
    expect(mockListScoreFormulaTemplates).toHaveBeenCalledWith();
    expect(qc.getQueryData(['score_formula_templates'])).toBeTruthy();
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

describe('useScoreOverride — single-actor', () => {
  it('[10] override → overrideUserScore; invalidasi [my_score] + prefix [ranking] + [my_score_history]', async () => {
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
    // Override pada periode closed juga mempengaruhi badge People; invalidate prefix 'ranking'.
    // History (self + cross-user) juga ikut basi → invalidate 'my_score_history' + 'user_score_history'.
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify({ queryKey: ['my_score'] }),
      JSON.stringify({ queryKey: ['ranking'] }),
      JSON.stringify({ queryKey: ['my_score_history'] }),
      // [B5] PPL-06 / OQ-5: cross-user history dari useUserScoreHistory juga harus refresh
      // saat manage_score_formula meng-override skor user target.
      JSON.stringify({ queryKey: ['user_score_history'] }),
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

  it('[13] UI-S-SF1 createDraft passthrough + invalidasi', async () => {
    mockCreateScoreFormulaDraft.mockResolvedValue('draft-new');
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useFormulaActions('t1'), { wrapper });
    await act(async () => {
      await result.current.createDraft({ templateId: 't1', level: 'staff', changeReason: 'fase awal v1', categories: null });
    });
    expect(mockCreateScoreFormulaDraft).toHaveBeenCalledWith({
      templateId: 't1', level: 'staff', changeReason: 'fase awal v1', categories: null,
    });
    const keys = spy.mock.calls.map(c => JSON.stringify(c[0]));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify({ queryKey: ['score_formula_versions', 't1'] }),
    ]));
  });

  it('[14] UI-S-SF1 updateWeights passthrough + invalidasi', async () => {
    mockUpdateFormulaVersionWeights.mockResolvedValue(undefined);
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useFormulaActions('t1'), { wrapper });
    const cats = [{ code: 'perf', weight: 60, source_metric: 'm1' }];
    await act(async () => {
      await result.current.updateWeights({ versionId: 'v1', categories: cats, changeReason: 'tweak bobot perf' });
    });
    expect(mockUpdateFormulaVersionWeights).toHaveBeenCalledWith({
      versionId: 'v1', categories: cats, changeReason: 'tweak bobot perf',
    });
    const keys = spy.mock.calls.map(c => JSON.stringify(c[0]));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify({ queryKey: ['score_formula_versions', 't1'] }),
    ]));
  });

  it('[15] UI-S-SF1 createDraft error propagation (draft_already_exists)', async () => {
    mockCreateScoreFormulaDraft.mockRejectedValueOnce(new Error('draft_already_exists'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useFormulaActions('t1'), { wrapper });
    await expect(
      result.current.createDraft({ templateId: 't1', level: 'staff', changeReason: 'duplikat draft' }),
    ).rejects.toThrow(/draft_already_exists/);
  });
});

describe('useClosePeriod — WS-5 tutup periode', () => {
  it('[WS5-H1] closePeriod(id) → closePeriodSnapshot(id) & mengembalikan int', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useClosePeriod(), { wrapper });
    let n: number | undefined;
    await act(async () => {
      n = await result.current.closePeriod('p1');
    });
    expect(mockClosePeriodSnapshot).toHaveBeenCalledWith('p1');
    expect(n).toBe(3);
  });

  it('[WS5-H2] onSuccess invalidasi TEPAT [active_period],[latest_closed_period],[ranking]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useClosePeriod(), { wrapper });
    await act(async () => {
      await result.current.closePeriod('p1');
    });
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify({ queryKey: ['active_period'] }),
        JSON.stringify({ queryKey: ['latest_closed_period'] }),
        JSON.stringify({ queryKey: ['ranking'] }),
      ]),
    );
  });

  it('[WS5-H3] n=0 → resolve (bukan reject) + tetap invalidasi', async () => {
    mockClosePeriodSnapshot.mockResolvedValueOnce(0);
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useClosePeriod(), { wrapper });
    let n: number | undefined;
    await act(async () => {
      n = await result.current.closePeriod('p1');
    });
    expect(n).toBe(0);
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(keys).toContain(JSON.stringify({ queryKey: ['active_period'] }));
  });

  it('[WS5-H4] error E1 → mutateAsync MELEMPAR + TIDAK invalidasi', async () => {
    mockClosePeriodSnapshot.mockRejectedValueOnce(new Error('Periode ini sudah ditutup dan tidak bisa diubah.'));
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useClosePeriod(), { wrapper });
    await expect(result.current.closePeriod('p1')).rejects.toThrow(/sudah ditutup/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('[WS5-H5] error E3 unauthorized → melempar apa adanya', async () => {
    mockClosePeriodSnapshot.mockRejectedValueOnce(new Error('Anda tidak berwenang mengelola Score Formula.'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useClosePeriod(), { wrapper });
    await expect(result.current.closePeriod('p1')).rejects.toThrow(/tidak berwenang/);
  });

  it('[WS5-H6] isPending toggle false → true → false', async () => {
    let resolveFn: (v: number) => void = () => {};
    mockClosePeriodSnapshot.mockReturnValueOnce(new Promise<number>((res) => { resolveFn = res; }));
    const { wrapper } = makeWrapper();
    const { result, unmount } = await renderHook(() => useClosePeriod(), { wrapper });
    expect(result.current.isPending).toBe(false);
    let p: Promise<number> = Promise.resolve(0);
    await act(async () => { p = result.current.closePeriod('p1'); });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    await act(async () => { resolveFn(2); await p; });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    // Unmount agar mutation observer H6 tidak bocor ke renderHook test berikutnya (result.current null).
    unmount();
  });

  it('[WS5-H7] satu closePeriod = tepat satu panggilan RPC (fondasi anti double-submit)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useClosePeriod(), { wrapper });
    await act(async () => {
      await result.current.closePeriod('p1');
    });
    expect(mockClosePeriodSnapshot).toHaveBeenCalledTimes(1);
  });

  it('[WS5-H8] regression: TIDAK invalidasi [my_score]/[my_score_history]/[user_score_history]; tepat 3 invalidasi', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useClosePeriod(), { wrapper });
    await act(async () => {
      await result.current.closePeriod('p1');
    });
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['my_score'] }));
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['my_score_history'] }));
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['user_score_history'] }));
    expect(spy).toHaveBeenCalledTimes(3);
  });
});

describe('useCalculatePeriodScores — Fase 2 TDD plan (jembatan finalize)', () => {
  it('[T-H-1] calculatePeriod(id) → calculatePeriodScores(id) & return int', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useCalculatePeriodScores(), { wrapper });
    let n: number | undefined;
    await act(async () => {
      n = await result.current.calculatePeriod('p1');
    });
    expect(mockCalculatePeriodScores).toHaveBeenCalledWith('p1');
    expect(n).toBe(5);
  });

  it('[T-H-2] onSuccess invalidasi TEPAT [my_score],[user_score],[my_score_history],[user_score_history]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useCalculatePeriodScores(), { wrapper });
    await act(async () => {
      await result.current.calculatePeriod('p1');
    });
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(keys).toEqual(
      expect.arrayContaining([
        JSON.stringify({ queryKey: ['my_score'] }),
        JSON.stringify({ queryKey: ['user_score'] }),
        JSON.stringify({ queryKey: ['my_score_history'] }),
        JSON.stringify({ queryKey: ['user_score_history'] }),
      ]),
    );
    // Negative: calculate TIDAK mengubah status periode maupun ranking → jangan invalidate.
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['active_period'] }));
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['latest_closed_period'] }));
    expect(keys).not.toContain(JSON.stringify({ queryKey: ['ranking'] }));
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('[T-H-3a] error E1 sudah ditutup → mutateAsync MELEMPAR + TIDAK invalidasi', async () => {
    mockCalculatePeriodScores.mockRejectedValueOnce(
      new Error('Periode ini sudah ditutup dan tidak bisa diubah.'),
    );
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useCalculatePeriodScores(), { wrapper });
    await expect(result.current.calculatePeriod('p1')).rejects.toThrow(/sudah ditutup/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('[T-H-3b] error E2 tidak ditemukan (cross-org) → mutateAsync MELEMPAR', async () => {
    mockCalculatePeriodScores.mockRejectedValueOnce(new Error('Periode tidak ditemukan.'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useCalculatePeriodScores(), { wrapper });
    await expect(result.current.calculatePeriod('p1')).rejects.toThrow(/tidak ditemukan/);
  });

  it('[T-H-3c] error E3 unauthorized → melempar apa adanya', async () => {
    mockCalculatePeriodScores.mockRejectedValueOnce(
      new Error('Anda tidak berwenang mengelola Score Formula.'),
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useCalculatePeriodScores(), { wrapper });
    await expect(result.current.calculatePeriod('p1')).rejects.toThrow(/tidak berwenang/);
  });
});

describe('usePreviewFinalization — Fase 2 TDD plan', () => {
  it('[T-H-4] enabled=true → query fires; return { eligibleUsers, activeOverrides }', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePreviewFinalization('p1'), { wrapper });
    await waitFor(() =>
      expect(result.current.preview).toEqual({ eligibleUsers: 5, activeOverrides: 1 }),
    );
    expect(mockPreviewFinalization).toHaveBeenCalledWith('p1');
  });

  it('[T-H-5] enabled=false ketika periodId undefined → tidak fetch', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePreviewFinalization(undefined), { wrapper });
    // Beri jest kesempatan flush micro-task tanpa memicu fetch.
    await act(async () => { await Promise.resolve(); });
    expect(mockPreviewFinalization).not.toHaveBeenCalled();
    expect(result.current.preview).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
