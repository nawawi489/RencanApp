// Data layer Fase 4 — goals.ts. Mock ../supabase. Menguji createGoal (INSERT ber-RLS dengan
// organization_id + created_by; bukan RPC), activateGoal/applyGoalTemplate/restoreGoalTemplateItems
// (RPC), listGoals/getGoal, listGoalTemplates, listKpiAreaTemplates (guard kosong + query), propagasi error.
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: () => mockGetUser() },
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import {
  activateGoal,
  applyGoalTemplate,
  createGoal,
  getGoal,
  listGoalTemplates,
  listGoals,
  listKpiAreaTemplates,
  restoreGoalTemplateItems,
} from '../goals';

/** Builder thenable: metode chainable kembalikan builder; await resolve di titik mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'single']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

/** Builder profiles: .select().eq().single() → Promise. */
function makeProfilesBuilder(orgId: string | null) {
  const builder: Record<string, unknown> = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.single = jest.fn(() =>
    Promise.resolve({ data: { organization_id: orgId }, error: null }),
  );
  return builder;
}

/** Builder INSERT: .insert().select().single() → Promise; menyimpan payload insert. */
function makeInsertBuilder(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  builder.insert = jest.fn((...args: unknown[]) => {
    calls.insert = args;
    return builder;
  });
  builder.select = jest.fn(() => builder);
  builder.single = jest.fn(() => Promise.resolve(result));
  return { builder, calls };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('createGoal', () => {
  it('[1] INSERT menyertakan organization_id + created_by + field input; RPC tidak dipanggil', async () => {
    const profiles = makeProfilesBuilder('org1');
    const { builder: insertB, calls: insertCalls } = makeInsertBuilder({
      data: { id: 'g1', name: 'Goal A' },
      error: null,
    });
    mockFrom.mockImplementation((table: string) =>
      table === 'profiles' ? profiles : insertB,
    );

    const goal = await createGoal({
      name: 'Goal A',
      description: 'desc',
      pic_id: 'p1',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('goals');
    expect(insertCalls.insert).toEqual([
      {
        name: 'Goal A',
        description: 'desc',
        pic_id: 'p1',
        period_start: '2026-01-01',
        period_end: '2026-12-31',
        organization_id: 'org1',
        created_by: 'u1',
      },
    ]);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(goal).toEqual({ id: 'g1', name: 'Goal A' });
  });

  it('[2] propagasi error dari INSERT', async () => {
    const profiles = makeProfilesBuilder('org1');
    const { builder: insertB } = makeInsertBuilder({ data: null, error: { message: 'rls' } });
    mockFrom.mockImplementation((table: string) =>
      table === 'profiles' ? profiles : insertB,
    );
    await expect(
      createGoal({
        name: 'x',
        pic_id: null,
        period_start: null,
        period_end: null,
      }),
    ).rejects.toEqual({ message: 'rls' });
  });
});

describe('activateGoal', () => {
  it('[3] memanggil rpc activate_goal dengan p_goal_id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await activateGoal('g1');
    expect(mockRpc).toHaveBeenCalledWith('activate_goal', { p_goal_id: 'g1' });
  });

  it('[4] propagasi error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'nope' } });
    await expect(activateGoal('g1')).rejects.toEqual({ message: 'nope' });
  });
});

describe('applyGoalTemplate', () => {
  it('[5] memanggil rpc apply_goal_template (bukan insert) & mengembalikan goal_id', async () => {
    mockRpc.mockResolvedValue({ data: 'g-new', error: null });
    const id = await applyGoalTemplate({
      goalTemplateId: 'tmpl1',
      picId: 'p1',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      targets: { 'A/R Collection': 'Tagih 95%' },
    });
    expect(mockRpc).toHaveBeenCalledWith('apply_goal_template', {
      p_goal_template_id: 'tmpl1',
      p_pic_id: 'p1',
      p_period_start: '2026-01-01',
      p_period_end: '2026-12-31',
      p_targets: { 'A/R Collection': 'Tagih 95%' },
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(id).toBe('g-new');
  });

  it('[6] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'bad' } });
    await expect(
      applyGoalTemplate({
        goalTemplateId: 'tmpl1',
        picId: 'p1',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
      }),
    ).rejects.toEqual({ message: 'bad' });
  });
});

describe('restoreGoalTemplateItems', () => {
  it('[7] memanggil rpc restore_goal_template_items (bukan insert) & mengembalikan count', async () => {
    mockRpc.mockResolvedValue({ data: 3, error: null });
    const n = await restoreGoalTemplateItems('g1');
    expect(mockRpc).toHaveBeenCalledWith('restore_goal_template_items', { p_goal_id: 'g1' });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(n).toBe(3);
  });

  it('[8] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'err' } });
    await expect(restoreGoalTemplateItems('g1')).rejects.toEqual({ message: 'err' });
  });
});

describe('listGoals', () => {
  it('[9] query select * order created_at desc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'g1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const goals = await listGoals();
    expect(mockFrom).toHaveBeenCalledWith('goals');
    expect(calls.select).toEqual(['*, kpi_areas(count)']);
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(goals).toEqual([{ id: 'g1' }]);
  });

  it('[10] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'x' } });
    mockFrom.mockReturnValue(builder);
    await expect(listGoals()).rejects.toEqual({ message: 'x' });
  });
});

describe('getGoal', () => {
  it('[11] select * eq(id) single', async () => {
    const { builder, calls } = makeQueryThenable({ data: { id: 'g1' }, error: null });
    mockFrom.mockReturnValue(builder);
    const goal = await getGoal('g1');
    expect(mockFrom).toHaveBeenCalledWith('goals');
    expect(calls.eq).toEqual(['id', 'g1']);
    expect(goal).toEqual({ id: 'g1' });
  });

  it('[12] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'nf' } });
    mockFrom.mockReturnValue(builder);
    await expect(getGoal('g1')).rejects.toEqual({ message: 'nf' });
  });
});

describe('listGoalTemplates', () => {
  it('[13] query order sort_order asc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 't1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const tpls = await listGoalTemplates();
    expect(mockFrom).toHaveBeenCalledWith('goal_templates');
    expect(calls.order).toEqual(['sort_order', { ascending: true }]);
    expect(tpls).toEqual([{ id: 't1' }]);
  });

  it('[14] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'x' } });
    mockFrom.mockReturnValue(builder);
    await expect(listGoalTemplates()).rejects.toEqual({ message: 'x' });
  });
});

describe('listKpiAreaTemplates', () => {
  it('[15] goalTemplateId kosong → [] tanpa query', async () => {
    expect(await listKpiAreaTemplates('')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[16] query eq(goal_template_id) + order sort_order asc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'k1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const items = await listKpiAreaTemplates('tmpl1');
    expect(mockFrom).toHaveBeenCalledWith('kpi_area_templates');
    expect(calls.eq).toEqual(['goal_template_id', 'tmpl1']);
    expect(calls.order).toEqual(['sort_order', { ascending: true }]);
    expect(items).toEqual([{ id: 'k1' }]);
  });

  it('[17] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'x' } });
    mockFrom.mockReturnValue(builder);
    await expect(listKpiAreaTemplates('tmpl1')).rejects.toEqual({ message: 'x' });
  });
});
