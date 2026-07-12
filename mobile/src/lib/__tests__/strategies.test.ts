// Data layer Fase 4 — strategies.ts. Mock ../supabase. Menguji createStrategy (INSERT ber-RLS:
// payload berisi goal_id + organization_id + created_by, rpc TIDAK dipanggil), activateStrategy
// (rpc nama+param benar), listStrategies (guard kosong + query eq/order benar), getStrategy (single),
// propagasi error.
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { activateStrategy, createStrategy, getStrategy, listStrategies } from '../strategies';

/** Builder thenable: metode chainable kembalikan builder; await resolve di titik mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

/** Builder yang menyelesaikan (await) pada terminator tertentu (single/maybeSingle). */
function makeTerminatedBuilder(
  result: { data: unknown; error: unknown },
  terminator: 'single' | 'maybeSingle' = 'single',
) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'insert']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder[terminator] = jest.fn((...args: unknown[]) => {
    calls[terminator] = args;
    return Promise.resolve(result);
  });
  return { builder, calls };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('createStrategy', () => {
  it('[1] INSERT berisi goal_id + organization_id + created_by + field input; rpc TIDAK dipanggil', async () => {
    const profiles = makeTerminatedBuilder({ data: { organization_id: 'org1' }, error: null });
    const target = makeTerminatedBuilder({ data: { id: 'k1' }, error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'profiles' ? profiles.builder : target.builder,
    );

    const result = await createStrategy({
      goal_id: 'g1',
      name: 'Pendapatan',
      target: 'Rp1M',
      pic_id: 'u2',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    });

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('strategies');
    expect(target.calls.insert[0]).toEqual({
      goal_id: 'g1',
      name: 'Pendapatan',
      target: 'Rp1M',
      pic_id: 'u2',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      organization_id: 'org1',
      created_by: 'u1',
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'k1' });
  });

  it('[2] propagasi error INSERT', async () => {
    const profiles = makeTerminatedBuilder({ data: { organization_id: 'org1' }, error: null });
    const target = makeTerminatedBuilder({ data: null, error: { message: 'rls' } });
    mockFrom.mockImplementation((table: string) =>
      table === 'profiles' ? profiles.builder : target.builder,
    );
    await expect(
      createStrategy({
        goal_id: 'g1',
        name: 'x',
        target: null,
        pic_id: null,
        period_start: null,
        period_end: null,
      }),
    ).rejects.toEqual({ message: 'rls' });
  });
});

describe('activateStrategy', () => {
  it('[3] memanggil rpc activate_strategy dengan p_strategy_id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await activateStrategy('k1');
    expect(mockRpc).toHaveBeenCalledWith('activate_strategy', { p_strategy_id: 'k1' });
  });

  it('[4] propagasi error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(activateStrategy('k1')).rejects.toEqual({ message: 'denied' });
  });
});

describe('listStrategies', () => {
  it('[5] goalId kosong → [] tanpa query', async () => {
    expect(await listStrategies('')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[6] query eq(goal_id) + order created_at asc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'k1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listStrategies('g1');
    expect(mockFrom).toHaveBeenCalledWith('strategies');
    expect(calls.eq).toEqual(['goal_id', 'g1']);
    expect(calls.order).toEqual(['created_at', { ascending: true }]);
    expect(rows).toEqual([{ id: 'k1' }]);
  });

  it('[7] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listStrategies('g1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('getStrategy', () => {
  it('[8] eq(id) + single → row', async () => {
    const { builder, calls } = makeTerminatedBuilder({ data: { id: 'k1' }, error: null });
    mockFrom.mockReturnValue(builder);
    const row = await getStrategy('k1');
    expect(mockFrom).toHaveBeenCalledWith('strategies');
    expect(calls.eq).toEqual(['id', 'k1']);
    expect(row).toEqual({ id: 'k1' });
  });

  it('[9] propagasi error', async () => {
    const { builder } = makeTerminatedBuilder({ data: null, error: { message: 'nf' } });
    mockFrom.mockReturnValue(builder);
    await expect(getStrategy('k1')).rejects.toEqual({ message: 'nf' });
  });
});
