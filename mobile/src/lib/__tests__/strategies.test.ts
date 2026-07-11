// Data layer Fase 4 — strategies.ts. Mock ../supabase. Menguji createStrategy (INSERT ber-RLS:
// payload memuat strategy_id + field kedalaman + organization_id + created_by; rpc TIDAK dipanggil),
// activateStrategy (rpc activate_strategy), listStrategies (guard kosong + eq/order), getStrategy
// (single), propagasi error.
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
import { activateStrategy, createStrategy, getStrategy, listStrategies } from '../strategies';

/** Builder thenable: metode chainable kembalikan builder; await resolve di titik mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'insert', 'single']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

/** Builder untuk profiles: .select().eq().single() → Promise (single resolve). */
function makeProfilesBuilder(organizationId: string) {
  const builder: Record<string, unknown> = {};
  builder.select = jest.fn(() => builder);
  builder.eq = jest.fn(() => builder);
  builder.single = jest.fn(() =>
    Promise.resolve({ data: { organization_id: organizationId }, error: null }),
  );
  return builder;
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

const NEW: Parameters<typeof createStrategy>[0] = {
  strategy_id: 'k1',
  name: 'Strategi A',
  description: 'desc',
  reason: 'alasan',
  main_risk: 'risiko',
  alternative: 'alt',
  pic_id: 'p1',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

describe('createStrategy', () => {
  it('[1] INSERT memuat strategy_id + field kedalaman + organization_id + created_by; rpc tidak dipanggil', async () => {
    const profiles = makeProfilesBuilder('org1');
    const { builder, calls } = makeQueryThenable({ data: { id: 's1' }, error: null });
    mockFrom.mockImplementation((table: string) => (table === 'profiles' ? profiles : builder));

    const result = await createStrategy(NEW);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('strategies');
    expect(calls.insert).toEqual([
      {
        strategy_id: 'k1',
        name: 'Strategi A',
        description: 'desc',
        reason: 'alasan',
        main_risk: 'risiko',
        alternative: 'alt',
        pic_id: 'p1',
        period_start: '2026-01-01',
        period_end: '2026-12-31',
        organization_id: 'org1',
        created_by: 'u1',
      },
    ]);
    expect(calls.select).toEqual(['*']);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 's1' });
  });

  it('[2] propagasi error dari INSERT', async () => {
    const profiles = makeProfilesBuilder('org1');
    const { builder } = makeQueryThenable({ data: null, error: { message: 'insert gagal' } });
    mockFrom.mockImplementation((table: string) => (table === 'profiles' ? profiles : builder));
    await expect(createStrategy(NEW)).rejects.toEqual({ message: 'insert gagal' });
  });
});

describe('activateStrategy', () => {
  it('[3] memanggil rpc activate_strategy dengan p_strategy_id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await activateStrategy('s1');
    expect(mockRpc).toHaveBeenCalledWith('activate_strategy', { p_strategy_id: 's1' });
  });

  it('[4] propagasi error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'tolak' } });
    await expect(activateStrategy('s1')).rejects.toEqual({ message: 'tolak' });
  });
});

describe('listStrategies', () => {
  it('[5] kpiAreaId kosong → [] tanpa query', async () => {
    expect(await listStrategies('')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[6] query eq(strategy_id) + order created_at asc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 's1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listStrategies('k1');
    expect(mockFrom).toHaveBeenCalledWith('strategies');
    expect(calls.select).toEqual(['*']);
    expect(calls.eq).toEqual(['strategy_id', 'k1']);
    expect(calls.order).toEqual(['created_at', { ascending: true }]);
    expect(rows).toEqual([{ id: 's1' }]);
  });

  it('[7] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'list gagal' } });
    mockFrom.mockReturnValue(builder);
    await expect(listStrategies('k1')).rejects.toEqual({ message: 'list gagal' });
  });
});

describe('getStrategy', () => {
  it('[8] eq(id) + single() mengembalikan baris', async () => {
    const { builder, calls } = makeQueryThenable({ data: { id: 's1' }, error: null });
    mockFrom.mockReturnValue(builder);
    const row = await getStrategy('s1');
    expect(mockFrom).toHaveBeenCalledWith('strategies');
    expect(calls.eq).toEqual(['id', 's1']);
    expect(builder.single).toHaveBeenCalled();
    expect(row).toEqual({ id: 's1' });
  });

  it('[9] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'tidak ada' } });
    mockFrom.mockReturnValue(builder);
    await expect(getStrategy('s1')).rejects.toEqual({ message: 'tidak ada' });
  });
});
