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
import { treeOrbLabel, taskTreeProgress } from '../progress';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('treeOrbLabel (spec §10)', () => {
  it("Goal & KPI Area → 'Capaian'", () => {
    expect(treeOrbLabel('goal')).toBe('Capaian');
    expect(treeOrbLabel('strategy')).toBe('Capaian');
  });

  it("Initiative/ActionPlan/Action Plan/Development Area/Problem Statement → 'Progress'", () => {
    for (const k of ['initiative', 'action_plan', 'task', 'development_area', 'problem_statement']) {
      expect(treeOrbLabel(k)).toBe('Progress');
    }
  });

  it("kind tak dikenal → default 'Progress' (fail-safe, tidak keliru 'Capaian')", () => {
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
    mockRpc.mockResolvedValue({ data: [{ card_id: 'g1', progress: 72 }], error: null });
    await fetchCardProgress(['g1', 'k1']);
    expect(mockRpc).toHaveBeenCalledWith('workspace_card_progress', { p_card_ids: ['g1', 'k1'] });
  });

  it('transform baris → Map<card_id, progress>; absen → undefined', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { card_id: 'g1', progress: 72 },
        { card_id: 'k1', progress: 30 },
      ],
      error: null,
    });
    const m = await fetchCardProgress(['g1', 'k1']);
    expect(m.get('g1')).toBe(72);
    expect(m.get('k1')).toBe(30);
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

  it('clamp + round ke 0–100 integer', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { card_id: 'g1', progress: 72.6 },
        { card_id: 'k1', progress: 140 },
        { card_id: 's1', progress: -5 },
      ],
      error: null,
    });
    const m = await fetchCardProgress(['g1', 'k1', 's1']);
    expect(m.get('g1')).toBe(73);
    expect(m.get('k1')).toBe(100);
    expect(m.get('s1')).toBe(0);
  });
});
