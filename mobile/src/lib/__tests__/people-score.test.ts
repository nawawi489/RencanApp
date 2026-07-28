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
  PEOPLE_TAB_COPY,
  activateScoreFormulaVersion,
  assignScoreFormula,
  calculatePeriodScores,
  closePeriodSnapshot,
  effectiveScore,
  getActivePeriod,
  getLatestClosedPeriod,
  getMyScore,
  listMyScoreHistory,
  listRanking,
  listScoreFormulaTemplates,
  listScoreFormulaVersions,
  listUserScoreHistory,
  openPeriodSnapshot,
  overrideUserScore,
  previewFinalization,
  createScoreFormulaDraft,
  updateFormulaVersionWeights,
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
  for (const m of ['select', 'eq', 'insert', 'order', 'limit']) {
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
  it('[2] FORMULA_STATUS_LABEL — 3 status formula', () => {
    expect(FORMULA_STATUS_LABEL.draft).toBeDefined();
    expect(FORMULA_STATUS_LABEL.active).toBeDefined();
    expect(FORMULA_STATUS_LABEL.archived).toBeDefined();
  });

  it('[4] METRIC_LABEL — 6 metric Fase 7 V1 (D4: result_achievement keluar)', () => {
    const keys = Object.keys(METRIC_LABEL);
    expect(keys).toEqual(
      expect.arrayContaining([
        'task_completion',
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
    const row = await getMyScore('u1', 'p1');
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
    const row = await getMyScore('u1');
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
    expect(await getMyScore('u1')).toBeNull();
    expect(scoreFetched).toBe(false);
  });

  it('[15] uid kosong → throw "Not authenticated" (hook wrap harus enabled=false, ini backstop)', async () => {
    await expect(getMyScore('', 'p1')).rejects.toThrow('Not authenticated');
  });
});

// ============================================================ listRanking
describe('getLatestClosedPeriod', () => {
  it('[L1] eq status=closed + order closed_at desc + limit 1 + maybeSingle', async () => {
    const { builder, calls } = makeSingleBuilder({ data: { id: 'p-closed', status: 'closed' }, error: null });
    mockFrom.mockReturnValue(builder);
    const row = await getLatestClosedPeriod();
    expect(mockFrom).toHaveBeenCalledWith('period_snapshots');
    expect(calls.eq).toEqual(['status', 'closed']);
    expect(calls.order).toEqual(['closed_at', { ascending: false }]);
    expect(row?.id).toBe('p-closed');
  });
  it('[L2] null saat belum pernah ada periode tertutup', async () => {
    const { builder } = makeSingleBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    expect(await getLatestClosedPeriod()).toBeNull();
  });
});

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
// ============================================================ PEOPLE_TAB_COPY (PPL-02 constant lock)
describe('PEOPLE_TAB_COPY — konstanta label tab People (PPL-02, V1.83 de-scored)', () => {
  it('[TC1] mengunci 3 label tab + placeholder quarterly (ranking removed V1.83)', () => {
    expect(PEOPLE_TAB_COPY.monthly).toBe('Bulan Ini');
    expect(PEOPLE_TAB_COPY.quarterly).toBe('Kuartal');
    expect(PEOPLE_TAB_COPY.admin).toBe('Admin');
    expect(PEOPLE_TAB_COPY.quarterlyPlaceholder).toMatch(/quarter|kuartal/i);
  });
});

// ============================================================ listUserScoreHistory (PPL-06 cross-user, OQ-5)
describe('listUserScoreHistory — cross-user RLS-gated (PPL-06 / OQ-5)', () => {
  it('[UH1] userId kosong → [] tanpa fetch dan tanpa auth.getUser', async () => {
    let called = false;
    mockFrom.mockImplementation(() => {
      called = true;
      return makeQueryThenable({ data: [], error: null }).builder;
    });
    const rows = await listUserScoreHistory('');
    expect(rows).toEqual([]);
    expect(called).toBe(false);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('[UH2] query shape: eq(user_id,userId) + eq(is_current,true) + limit(n) — TIDAK panggil auth.getUser', async () => {
    const { builder, calls } = makeQueryThenable({
      data: [
        { id: 'h1', period_snapshots: { period_start: '2026-01-01' } },
        { id: 'h2', period_snapshots: { period_start: '2026-03-01' } },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    await listUserScoreHistory('u2', 6);
    expect(mockFrom).toHaveBeenCalledWith('user_score_results');
    const eqCalls = (builder.eq as jest.Mock).mock.calls;
    expect(eqCalls).toEqual(expect.arrayContaining([['user_id', 'u2'], ['is_current', true]]));
    expect(calls.limit).toEqual([6]);
    // Cross-user: RLS server-side yang menyaring (self OR supervisor OR manage_score_formula OR view_all_workspace).
    // Client tidak perlu auth.getUser (viewer identity ada di JWT), berbeda dari listMyScoreHistory.
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('[UH3] sort DESC by period_start (join period_snapshots) — h2 (Mar) sebelum h1 (Jan)', async () => {
    const { builder } = makeQueryThenable({
      data: [
        { id: 'h1', period_snapshots: { period_start: '2026-01-01' } },
        { id: 'h2', period_snapshots: { period_start: '2026-03-01' } },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    const rows = await listUserScoreHistory('u2', 6);
    expect((rows as Array<{ id: string }>).map((r) => r.id)).toEqual(['h2', 'h1']);
  });

  it('[UH4] RLS deny (viewer di luar scope) → [] graceful, bukan error', async () => {
    const { builder } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listUserScoreHistory('u-hidden', 6);
    expect(rows).toEqual([]);
  });

  it('[UH5] default limit=6 saat argumen tak diberi', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listUserScoreHistory('u2');
    expect(calls.limit).toEqual([6]);
  });

  it('[UH6] propagasi error dari Supabase', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'network' } });
    mockFrom.mockReturnValue(builder);
    await expect(listUserScoreHistory('u2', 6)).rejects.toEqual({ message: 'network' });
  });
});

describe('listMyScoreHistory', () => {
  it('[H1] eq user_id + is_current=true + join period_start + limit n, sort desc by period_start', async () => {
    // Impl mengurutkan client-side by period_start (join), recalculation-safe (commit fase7).
    const { builder, calls } = makeQueryThenable({
      data: [
        { id: 'h1', period_snapshots: { period_start: '2026-01-01' } },
        { id: 'h2', period_snapshots: { period_start: '2026-03-01' } },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    const rows = await listMyScoreHistory('u1', 6);
    expect(mockFrom).toHaveBeenCalledWith('user_score_results');
    const eqCalls = (builder.eq as jest.Mock).mock.calls;
    expect(eqCalls).toEqual(expect.arrayContaining([['user_id', 'u1'], ['is_current', true]]));
    expect(calls.limit).toEqual([6]);
    // DESC by period_start → h2 (Mar) sebelum h1 (Jan)
    expect((rows as Array<{ id: string }>).map((r) => r.id)).toEqual(['h2', 'h1']);
  });
  it('[H2] uid kosong → throw Not authenticated (backstop; hook wrap enabled=false)', async () => {
    await expect(listMyScoreHistory('')).rejects.toThrow('Not authenticated');
  });
});

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

describe('listScoreFormulaTemplates', () => {
  it('[T1] tanpa level → order by level asc, tanpa filter eq', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 't1' }, { id: 't2' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listScoreFormulaTemplates();
    expect(mockFrom).toHaveBeenCalledWith('score_formula_templates');
    expect(calls.order).toEqual(['level', { ascending: true }]);
    expect(builder.eq).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
  });
  it('[T2] dgn level → tambah eq level', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 't1', level: 'staff' }], error: null });
    mockFrom.mockReturnValue(builder);
    await listScoreFormulaTemplates('staff');
    expect(calls.eq).toEqual(['level', 'staff']);
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
  // WS-5: error RPC (Bahasa Indonesia) diteruskan APA ADANYA (tanpa wrapping) — modal menyurface langsung.
  it('[WS5-L1] closePeriodSnapshot melempar error E1 "sudah ditutup" apa adanya', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Periode ini sudah ditutup dan tidak bisa diubah.' } });
    await expect(closePeriodSnapshot('p1')).rejects.toEqual({
      message: 'Periode ini sudah ditutup dan tidak bisa diubah.',
    });
    expect(mockRpc).toHaveBeenCalledWith('close_period_snapshot', { p_period_id: 'p1' });
  });
  it('[WS5-L2] closePeriodSnapshot melempar error E2 "tidak ditemukan" (cross-org/tak ada) apa adanya', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Periode tidak ditemukan.' } });
    await expect(closePeriodSnapshot('p1')).rejects.toEqual({ message: 'Periode tidak ditemukan.' });
  });
  it('[WS5-L3] closePeriodSnapshot melempar error E3 unauthorized apa adanya', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Anda tidak berwenang mengelola Score Formula.' } });
    await expect(closePeriodSnapshot('p1')).rejects.toEqual({
      message: 'Anda tidak berwenang mengelola Score Formula.',
    });
  });
  it('[WS5-L4] closePeriodSnapshot resolve number 0 saat tak ada skor (n=0 = sukses, bukan null/throw)', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });
    const n = await closePeriodSnapshot('p1');
    expect(n).toBe(0);
    expect(typeof n).toBe('number');
  });

  // Fase 1 TDD plan (specs/score-ranking-finalization-tdd-plan.md) — calc error branches mirror WS5-L1..L4.
  // Pesan server verified 0013:516 + 0039:39 ('mengelola Score Formula', BUKAN 'mengubah periode ini').
  it('[T-DL-2a] calculatePeriodScores melempar E1 "sudah ditutup" apa adanya', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Periode ini sudah ditutup dan tidak bisa diubah.' },
    });
    await expect(calculatePeriodScores('p1')).rejects.toEqual({
      message: 'Periode ini sudah ditutup dan tidak bisa diubah.',
    });
    expect(mockRpc).toHaveBeenCalledWith('calculate_period_scores', { p_period_id: 'p1' });
  });
  it('[T-DL-2b] calculatePeriodScores melempar E2 "tidak ditemukan" (cross-org/tak ada) apa adanya', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Periode tidak ditemukan.' } });
    await expect(calculatePeriodScores('p1')).rejects.toEqual({ message: 'Periode tidak ditemukan.' });
  });
  it('[T-DL-2c] calculatePeriodScores melempar E3 unauthorized apa adanya', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'Anda tidak berwenang mengelola Score Formula.' },
    });
    await expect(calculatePeriodScores('p1')).rejects.toEqual({
      message: 'Anda tidak berwenang mengelola Score Formula.',
    });
  });
  it('[T-DL-2d] calculatePeriodScores resolve number 0 saat tak ada staff (n=0 = sukses)', async () => {
    mockRpc.mockResolvedValue({ data: 0, error: null });
    const n = await calculatePeriodScores('p1');
    expect(n).toBe(0);
    expect(typeof n).toBe('number');
  });
});

// ============================================================ previewFinalization (Fase 1 TDD plan)
// Query builder untuk 2 count query berturut-turut (total is_current + subset result_kind='override').
// Tidak ada preseden count-query di codebase — helper baru mirror makeQueryThenable
// tapi resolve ke { data: null, count, error } shape.
function makeCountThenable(result: { count: number | null; error: unknown }) {
  const calls: Record<string, unknown[][]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      (calls[m] ||= []).push(args);
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, count: result.count, error: result.error }).then(resolve, reject);
  return { builder, calls };
}

describe('previewFinalization', () => {
  it('[T-DL-3] sukses → return { eligibleUsers, activeOverrides } dari 2 count query', async () => {
    const total = makeCountThenable({ count: 5, error: null });
    const overrides = makeCountThenable({ count: 1, error: null });
    mockFrom
      .mockReturnValueOnce(total.builder)
      .mockReturnValueOnce(overrides.builder);

    const result = await previewFinalization('p1');
    expect(result).toEqual({ eligibleUsers: 5, activeOverrides: 1 });
    expect(mockFrom).toHaveBeenCalledWith('user_score_results');
    expect(mockFrom).toHaveBeenCalledTimes(2);
    // Total query: filter period_snapshot_id + is_current=true
    expect(total.calls.eq).toEqual(
      expect.arrayContaining([['period_snapshot_id', 'p1'], ['is_current', true]]),
    );
    // Override subset query: filter tambahan result_kind='override'
    expect(overrides.calls.eq).toEqual(
      expect.arrayContaining([
        ['period_snapshot_id', 'p1'],
        ['is_current', true],
        ['result_kind', 'override'],
      ]),
    );
  });

  it('[T-DL-4] count 0 → return { 0, 0 } (bukan throw)', async () => {
    const zero1 = makeCountThenable({ count: 0, error: null });
    const zero2 = makeCountThenable({ count: 0, error: null });
    mockFrom.mockReturnValueOnce(zero1.builder).mockReturnValueOnce(zero2.builder);
    const result = await previewFinalization('p1');
    expect(result).toEqual({ eligibleUsers: 0, activeOverrides: 0 });
  });

  it('[T-DL-5] count query error → throw dengan message persis', async () => {
    const err = makeCountThenable({ count: null, error: { message: 'boom' } });
    mockFrom.mockReturnValueOnce(err.builder);
    await expect(previewFinalization('p1')).rejects.toEqual({ message: 'boom' });
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

// ============================================================ UI-S-SF1 wrappers (migrasi 0020)
describe('createScoreFormulaDraft', () => {
  it('[29] passthrough p_template_id/p_level/p_change_reason/p_categories (null untuk auto-clone)', async () => {
    mockRpc.mockResolvedValue({ data: 'draft-new', error: null });
    const id = await createScoreFormulaDraft({
      templateId: 't1',
      level: 'staff',
      changeReason: 'inisialisasi v1 fase awal',
      categories: null,
    });
    expect(mockRpc).toHaveBeenCalledWith('create_score_formula_draft', {
      p_template_id: 't1',
      p_level: 'staff',
      p_change_reason: 'inisialisasi v1 fase awal',
      p_categories: null,
    });
    expect(id).toBe('draft-new');
  });

  it('[30] pass categories eksplisit saat disuplai (bukan null)', async () => {
    mockRpc.mockResolvedValue({ data: 'draft-x', error: null });
    const cats = [
      { code: 'perf', weight: 60, source_metric: 'm1' },
      { code: 'disc', weight: 40, source_metric: 'm2' },
    ];
    await createScoreFormulaDraft({
      templateId: 't1', level: 'management', changeReason: 'override default seed', categories: cats,
    });
    expect(mockRpc).toHaveBeenCalledWith('create_score_formula_draft', expect.objectContaining({
      p_categories: cats,
    }));
  });

  it('[31] propagasi error (mis. draft_already_exists)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'draft_already_exists' } });
    await expect(
      createScoreFormulaDraft({ templateId: 't1', level: 'staff', changeReason: 'sudah ada draft' }),
    ).rejects.toEqual({ message: 'draft_already_exists' });
  });
});

describe('updateFormulaVersionWeights', () => {
  it('[32] passthrough p_version_id/p_categories/p_change_reason', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const cats = [{ code: 'perf', weight: 70, source_metric: 'm1' }];
    await updateFormulaVersionWeights({ versionId: 'v1', categories: cats, changeReason: 'tweak bobot' });
    expect(mockRpc).toHaveBeenCalledWith('update_score_formula_version_weights', {
      p_version_id: 'v1',
      p_categories: cats,
      p_change_reason: 'tweak bobot',
    });
  });

  it('[33] propagasi error (mis. categories_set_mismatch)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'categories_set_mismatch' } });
    await expect(
      updateFormulaVersionWeights({ versionId: 'v1', categories: [], changeReason: 'reset kategori' }),
    ).rejects.toEqual({ message: 'categories_set_mismatch' });
  });
});
