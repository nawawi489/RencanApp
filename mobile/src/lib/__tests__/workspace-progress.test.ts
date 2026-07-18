// WSA-15 / AC 22 — data layer progress orb tree.
// treeOrbLabel: util murni (tanpa mock). fetchCardProgress: mock ../supabase.rpc.
const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { fetchCardProgress } from '../workspace-progress';
// eslint-disable-next-line import/first
import { treeOrbLabel, taskTreeProgress, measuredStrategiesSublabel } from '../progress';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('treeOrbLabel (spec §10, data-driven)', () => {
  it.each([
    ['goal', true, 'Capaian'],
    ['goal', false, 'Progress'],
    ['strategy', true, 'Capaian'],
    ['strategy', false, 'Progress'],
    ['initiative', true, 'Progress'],
    ['initiative', false, 'Progress'],
    ['action_plan', true, 'Progress'],
    ['action_plan', false, 'Progress'],
    ['task', true, 'Progress'],
    ['task', false, 'Progress'],
    ['development_area', true, 'Progress'],
    ['problem_statement', false, 'Progress'],
  ] as const)('%s × isMeasured=%s → %s', (kind, isMeasured, expected) => {
    expect(treeOrbLabel(kind, isMeasured)).toBe(expected);
  });

  it('arity-1 (default isMeasured=false) → Progress untuk goal/strategy', () => {
    expect(treeOrbLabel('goal')).toBe('Progress');
    expect(treeOrbLabel('strategy')).toBe('Progress');
  });

  it("kind tak dikenal → default 'Progress' (fail-safe)", () => {
    expect(treeOrbLabel('mystery', true)).toBe('Progress');
    expect(treeOrbLabel('mystery')).toBe('Progress');
  });
});

describe('taskTreeProgress (leaf AP, reuse computeTaskProgress)', () => {
  it('one_time submitted → 80 (status heuristik)', () => {
    expect(taskTreeProgress({ status: 'submitted', repeatSetting: 'one_time' })).toBe(80);
  });

  it('one_time done → 100', () => {
    expect(taskTreeProgress({ status: 'done', repeatSetting: 'one_time' })).toBe(100);
  });

  it('repeat dgn compliancePercent → pakai compliance', () => {
    expect(taskTreeProgress({ status: 'active', repeatSetting: 'repeat', compliancePercent: 64 })).toBe(64);
  });

  it('repeat TANPA compliance → null (render —, bukan 0% menyesatkan)', () => {
    expect(taskTreeProgress({ status: 'active', repeatSetting: 'repeat' })).toBeNull();
    expect(taskTreeProgress({ status: 'active', repeatSetting: 'repeat', compliancePercent: null })).toBeNull();
  });
});

describe('fetchCardProgress (RPC rollup workspace_card_progress)', () => {
  it('memanggil RPC dgn { p_card_ids: ids } apa adanya', async () => {
    mockRpc.mockResolvedValue({ data: [{ card_id: 'g1', progress: 72, is_measured: true }], error: null });
    await fetchCardProgress(['g1', 'k1']);
    expect(mockRpc).toHaveBeenCalledWith('workspace_card_progress', { p_card_ids: ['g1', 'k1'] });
  });

  it('transform baris → Map<card_id, CardProgress>; absen → undefined', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { card_id: 'g1', progress: 72, is_measured: true },
        { card_id: 'k1', progress: 30, is_measured: false },
      ],
      error: null,
    });
    const m = await fetchCardProgress(['g1', 'k1']);
    expect(m.get('g1')).toEqual({ progress: 72, isMeasured: true });
    expect(m.get('k1')).toEqual({ progress: 30, isMeasured: false });
    expect(m.get('absent')).toBeUndefined();
  });

  it('ids kosong → Map kosong tanpa memanggil RPC', async () => {
    const m = await fetchCardProgress([]);
    expect(m.size).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('data null → Map kosong (bukan throw)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const m = await fetchCardProgress(['g1']);
    expect(m.size).toBe(0);
  });

  it('propagasi error RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(fetchCardProgress(['g1'])).rejects.toEqual({ message: 'boom' });
  });

  it('clamp + round progress ke 0–100 integer', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { card_id: 'g1', progress: 72.6, is_measured: true },
        { card_id: 'k1', progress: 140, is_measured: true },
        { card_id: 's1', progress: -5, is_measured: false },
      ],
      error: null,
    });
    const m = await fetchCardProgress(['g1', 'k1', 's1']);
    expect(m.get('g1')!.progress).toBe(73);
    expect(m.get('k1')!.progress).toBe(100);
    expect(m.get('s1')!.progress).toBe(0);
  });

  it('is_measured coercion: only boolean true → isMeasured true', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { card_id: 'a', progress: 50, is_measured: true },
        { card_id: 'b', progress: 50, is_measured: false },
        { card_id: 'c', progress: 50, is_measured: null },
        { card_id: 'd', progress: 50 },
      ],
      error: null,
    });
    const m = await fetchCardProgress(['a', 'b', 'c', 'd']);
    expect(m.get('a')!.isMeasured).toBe(true);
    expect(m.get('b')!.isMeasured).toBe(false);
    expect(m.get('c')!.isMeasured).toBe(false);
    expect(m.get('d')!.isMeasured).toBe(false);
  });
});

describe('measuredStrategiesSublabel', () => {
  it('3/5 terukur (active+done only)', () => {
    expect(
      measuredStrategiesSublabel([
        { status: 'active', target_numeric: 100 },
        { status: 'active', target_numeric: null },
        { status: 'done', target_numeric: 200 },
        { status: 'active', target_numeric: 50 },
        { status: 'active', target_numeric: null },
      ]),
    ).toBe('3/5 Strategi terukur');
  });

  it('0/4 terukur (semua kualitatif)', () => {
    expect(
      measuredStrategiesSublabel([
        { status: 'active', target_numeric: null },
        { status: 'active', target_numeric: null },
        { status: 'done', target_numeric: null },
        { status: 'active', target_numeric: null },
      ]),
    ).toBe('0/4 Strategi terukur');
  });

  it('kosong → "Belum ada turunan"', () => {
    expect(measuredStrategiesSublabel([])).toBe('Belum ada turunan');
  });

  it('archived + draft dikecualikan dari n & m (O4)', () => {
    expect(
      measuredStrategiesSublabel([
        { status: 'active', target_numeric: 100 },
        { status: 'archived', target_numeric: 50 },
        { status: 'draft', target_numeric: 80 },
        { status: 'active', target_numeric: null },
      ]),
    ).toBe('1/2 Strategi terukur');
  });

  it('semua archived/draft → "Belum ada turunan"', () => {
    expect(
      measuredStrategiesSublabel([
        { status: 'archived', target_numeric: 100 },
        { status: 'draft', target_numeric: 50 },
      ]),
    ).toBe('Belum ada turunan');
  });

  it('target_numeric=0 bukan terukur (guard div-by-zero)', () => {
    expect(
      measuredStrategiesSublabel([
        { status: 'active', target_numeric: 0 },
        { status: 'active', target_numeric: 100 },
      ]),
    ).toBe('1/2 Strategi terukur');
  });
});
