// Data layer Fase 7 — People & Score (RED phase).
// Pola mirror cards.test.ts / development-areas.test.ts: mock ../supabase, builder thenable/single,
// mockFrom per-tabel via mockImplementation untuk lintas-tabel (getMyScore: period_snapshots + user_score_results).
const mockFrom = jest.fn();
const mockGetUser = jest.fn();
const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// eslint-disable-next-line import/first
import {
  FORMULA_STATUS_LABEL,
  METRIC_LABEL,
  PERIOD_STATUS_LABEL,
  RESULT_KIND_LABEL,
  activateScoreFormulaVersion,
  assignScoreFormula,
  calculatePeriodScores,
  closePeriodSnapshot,
  effectiveScore,
  getActivePeriod,
  getMyScore,
  listRanking,
  listScoreFormulaVersions,
  openPeriodSnapshot,
  overrideUserScore,
  upsertScoreFormulaVersion,
  type UserScoreResult,
} from '../people-score';

function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'is', 'in', 'limit']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

function makeSingleBuilder(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'order']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  return { builder, calls };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

// ============================================================ label maps (pure)
describe('people-score label maps', () => {
  it('[1] PERIOD_STATUS_LABEL — bahasa Indonesia, 3 status', () => {
    expect(PERIOD_STATUS_LABEL.draft).toBeDefined();
    expect(PERIOD_STATUS_LABEL.active).toBeDefined();
    expect(PERIOD_STATUS_LABEL.closed).toBeDefined();
    expect(PERIOD_STATUS_LABEL.draft).not.toBe(PERIOD_STATUS_LABEL.active);
  });

  it('[2] FORMULA_STATUS_LABEL — 3 status formula', () => {
    expect(FORMULA_STATUS_LABEL.draft).toBeDefined();
    expect(FORMULA_STATUS_LABEL.active).toBeDefined();
    expect(FORMULA_STATUS_LABEL.archived).toBeDefined();
  });

  it('[3] RESULT_KIND_LABEL — auto vs override', () => {
    expect(RESULT_KIND_LABEL.auto).toBeDefined();
    expect(RESULT_KIND_LABEL.override).toBeDefined();
  });

  it('[4] METRIC_LABEL — 6 metric Fase 7 V1 (D4: result_achievement keluar)', () => {
    const keys = Object.keys(METRIC_LABEL);
    expect(keys).toEqual(
      expect.arrayContaining([
        'action_plan_completion',
        'repeat_compliance',
        'on_time_rate',
        'review_pass_rate',
        'development_contribution',
        'governance_discipline',
      ]),
    );
    expect(keys).not.toContain('result_achievement');
  });
});

// ============================================================ effectiveScore (?? bukan ||)
describe('effectiveScore — manual_adjusted_score ?? auto_calculated_score', () => {
  it('[5] override aktif → manual_adjusted_score', () => {
    const r = { manual_adjusted_score: 88, auto_calculated_score: 75 } as UserScoreResult;
    expect(effectiveScore(r)).toBe(88);
  });
  it('[6] manual_adjusted_score=0 (nyata) → 0, BUKAN fallback ke auto (?? bukan ||)', () => {
    const r = { manual_adjusted_score: 0, auto_calculated_score: 75 } as UserScoreResult;
    expect(effectiveScore(r)).toBe(0);
  });
  it('[7] manual_adjusted_score=null → auto_calculated_score', () => {
    const r = { manual_adjusted_score: null, auto_calculated_score: 75 } as UserScoreResult;
    expect(effectiveScore(r)).toBe(75);
  });
  it('[8] record null → null', () => {
    expect(effectiveScore(null)).toBeNull();
  });
});

// ============================================================ getActivePeriod
describe('getActivePeriod', () => {
  it('[9] select * eq status=active .maybeSingle()', async () => {
    const { builder, calls } = makeSingleBuilder({ data: { id: 'p1', status: 'active' }, error: null });
    mockFrom.mockReturnValue(builder);
    const row = await getActivePeriod();
    expect(mockFrom).toHaveBeenCalledWith('period_snapshots');
    expect(calls.eq).toEqual(['status', 'active']);
    expect(row).toEqual({ id: 'p1', status: 'active' });
  });

  it('[10] null saat tidak ada periode aktif', async () => {
    const { builder } = makeSingleBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    expect(await getActivePeriod()).toBeNull();
  });

  it('[11] propagasi error', async () => {
    const { builder } = makeSingleBuilder({ data: null, error: { message: 'x' } });
    mockFrom.mockReturnValue(builder);
    await expect(getActivePeriod()).rejects.toEqual({ message: 'x' });
  });
});

// ============================================================ getMyScore — lintas-tabel
describe('getMyScore — period auto-detect + user_id=auth.uid()', () => {
  it('[12] periodId eksplisit → langsung query user_score_results, TIDAK query period_snapshots', async () => {
    const ranking = makeQueryThenable({ data: [], error: null });
    const periodBuilder = makeSingleBuilder({ data: { id: 'PERIOD_SHOULD_NOT_BE_FETCHED' }, error: null });
    const scoreRow = { id: 'r1', auto_calculated_score: 70, manual_adjusted_score: null, is_current: true };
    const scoreBuilder = makeSingleBuilder({ data: scoreRow, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_score_results') return scoreBuilder.builder;
      if (table === 'period_snapshots') return periodBuilder.builder;
      return ranking.builder;
    });
    const row = await getMyScore('p1');
    expect(row).toEqual(scoreRow);
    // assertion penting: TIDAK fetch period_snapshots
    expect(periodBuilder.builder.eq).not.toHaveBeenCalled();
    // user_id=auth.uid() ('u1') terkirim
    const eqCalls = (scoreBuilder.builder.eq as jest.Mock).mock.calls;
    expect(eqCalls).toEqual(expect.arrayContaining([['user_id', 'u1'], ['period_snapshot_id', 'p1'], ['is_current', true]]));
  });

  it('[13] tanpa periodId → fetch active period dulu, lalu score', async () => {
    const periodActive = makeSingleBuilder({ data: { id: 'p-active', status: 'active' }, error: null });
    const scoreBuilder = makeSingleBuilder({ data: { id: 'r2', auto_calculated_score: 60 }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'period_snapshots') return periodActive.builder;
      if (table === 'user_score_results') return scoreBuilder.builder;
      throw new Error('unexpected ' + table);
    });
    const row = await getMyScore();
    expect(row?.id).toBe('r2');
    expect((periodActive.builder.eq as jest.Mock).mock.calls).toEqual(
      expect.arrayContaining([['status', 'active']]),
    );
  });

  it('[14] tanpa periode aktif → null (tanpa query user_score_results)', async () => {
    const periodActive = makeSingleBuilder({ data: null, error: null });
    let scoreFetched = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'period_snapshots') return periodActive.builder;
      if (table === 'user_score_results') {
        scoreFetched = true;
        return makeSingleBuilder({ data: null, error: null }).builder;
      }
      throw new Error('unexpected ' + table);
    });
    expect(await getMyScore()).toBeNull();
    expect(scoreFetched).toBe(false);
  });

  it('[15] tanpa auth user → throw "Not authenticated"', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(getMyScore('p1')).rejects.toThrow('Not authenticated');
  });
});

// ============================================================ listRanking
describe('listRanking', () => {
  it('[16] eq period_snapshot_id + order rank_number asc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ rank_number: 1, score: 80 }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listRanking('p1');
    expect(mockFrom).toHaveBeenCalledWith('ranking_snapshots');
    expect(calls.eq).toEqual(['period_snapshot_id', 'p1']);
    expect(calls.order).toEqual(['rank_number', { ascending: true }]);
    expect(rows).toHaveLength(1);
  });

  it('[17] periodId kosong → array kosong tanpa query (gate enabled)', async () => {
    let called = false;
    mockFrom.mockImplementation(() => {
      called = true;
      return makeQueryThenable({ data: [], error: null }).builder;
    });
    const rows = await listRanking('');
    expect(rows).toEqual([]);
    expect(called).toBe(false);
  });

  it('[18] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'err' } });
    mockFrom.mockReturnValue(builder);
    await expect(listRanking('p1')).rejects.toEqual({ message: 'err' });
  });
});

// ============================================================ listScoreFormulaVersions
describe('listScoreFormulaVersions', () => {
  it('[19] order by version_number desc (newest first)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ version_number: 2 }, { version_number: 1 }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listScoreFormulaVersions('t1');
    expect(mockFrom).toHaveBeenCalledWith('score_formula_versions');
    expect(calls.eq).toEqual(['template_id', 't1']);
    expect(calls.order).toEqual(['version_number', { ascending: false }]);
    expect(rows).toHaveLength(2);
  });
});

// ============================================================ RPC: upsertScoreFormulaVersion
describe('upsertScoreFormulaVersion — rpc', () => {
  it('[20] memanggil rpc dgn p_template_id/p_categories/p_change_reason; mengembalikan id', async () => {
    mockRpc.mockResolvedValue({ data: 'v-new', error: null });
    const id = await upsertScoreFormulaVersion({
      templateId: 't1',
      categories: [{ code: 'a', weight: 100, source_metric: 'a' }],
      changeReason: 'init',
    });
    expect(mockRpc).toHaveBeenCalledWith('upsert_score_formula_version', {
      p_template_id: 't1',
      p_categories: [{ code: 'a', weight: 100, source_metric: 'a' }],
      p_change_reason: 'init',
    });
    expect(id).toBe('v-new');
  });

  it('[21] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(
      upsertScoreFormulaVersion({ templateId: 't1', categories: [], changeReason: 'r' }),
    ).rejects.toEqual({ message: 'denied' });
  });
});

// ============================================================ RPC: activateScoreFormulaVersion
describe('activateScoreFormulaVersion — rpc', () => {
  it('[22] memanggil rpc dgn p_version_id/p_effective_date', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await activateScoreFormulaVersion('v1', '2026-06-25');
    expect(mockRpc).toHaveBeenCalledWith('activate_score_formula_version', {
      p_version_id: 'v1',
      p_effective_date: '2026-06-25',
    });
  });

  it('[23] propagasi error 100% (pesan ID dari RPC)', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'Total bobot Score Formula harus tepat 100. Saat ini 95.' } });
    await expect(activateScoreFormulaVersion('v1', '2026-06-25')).rejects.toEqual({
      message: 'Total bobot Score Formula harus tepat 100. Saat ini 95.',
    });
  });
});

// ============================================================ RPC: assignScoreFormula
describe('assignScoreFormula — rpc', () => {
  it('[24] passthrough 5 param', async () => {
    mockRpc.mockResolvedValue({ data: 'a1', error: null });
    const id = await assignScoreFormula({
      versionId: 'v1',
      scopeLevel: 'org_role',
      roleLevel: 'staff',
      userId: null,
      startDate: '2026-06-25',
    });
    expect(mockRpc).toHaveBeenCalledWith('assign_score_formula', {
      p_version_id: 'v1',
      p_scope_level: 'org_role',
      p_role_level: 'staff',
      p_user_id: null,
      p_start_date: '2026-06-25',
    });
    expect(id).toBe('a1');
  });
});

// ============================================================ RPC: openPeriodSnapshot
describe('openPeriodSnapshot — rpc', () => {
  it('[25] memanggil rpc dgn p_period_name/p_period_start/p_period_end', async () => {
    mockRpc.mockResolvedValue({ data: 'p-new', error: null });
    const id = await openPeriodSnapshot({
      periodName: 'Juni 2026',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
    });
    expect(mockRpc).toHaveBeenCalledWith('open_period_snapshot', {
      p_period_name: 'Juni 2026',
      p_period_start: '2026-06-01',
      p_period_end: '2026-06-30',
    });
    expect(id).toBe('p-new');
  });
});

// ============================================================ RPC: calculatePeriodScores / closePeriodSnapshot
describe('calculatePeriodScores & closePeriodSnapshot', () => {
  it('[26] calculatePeriodScores → rpc dgn p_period_id; return count', async () => {
    mockRpc.mockResolvedValue({ data: 5, error: null });
    const n = await calculatePeriodScores('p1');
    expect(mockRpc).toHaveBeenCalledWith('calculate_period_scores', { p_period_id: 'p1' });
    expect(n).toBe(5);
  });
  it('[27] closePeriodSnapshot → rpc dgn p_period_id; return count', async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });
    const n = await closePeriodSnapshot('p1');
    expect(mockRpc).toHaveBeenCalledWith('close_period_snapshot', { p_period_id: 'p1' });
    expect(n).toBe(3);
  });
});

// ============================================================ RPC: overrideUserScore
describe('overrideUserScore — single-actor (D10 revisi)', () => {
  it('[28] passthrough 4 param; return id baru', async () => {
    mockRpc.mockResolvedValue({ data: 'r-over', error: null });
    const id = await overrideUserScore({
      periodId: 'p1',
      userId: 'staff-1',
      manualScore: 82,
      reason: 'koreksi data',
    });
    expect(mockRpc).toHaveBeenCalledWith('override_user_score', {
      p_period_id: 'p1',
      p_user_id: 'staff-1',
      p_manual_score: 82,
      p_reason: 'koreksi data',
    });
    expect(id).toBe('r-over');
  });
});
