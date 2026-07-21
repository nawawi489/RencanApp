// Data layer Fase 4 — initiatives.ts. Mock ../supabase. Menguji createInitiative (INSERT ber-RLS:
// payload memuat strategy_id + field kedalaman + organization_id + created_by; rpc TIDAK dipanggil),
// activateInitiative (rpc activate_initiative), listInitiatives (guard kosong + eq/order), getInitiative
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
import { activateInitiative, createInitiative, getInitiative, listInitiatives } from '../initiatives';

/** Builder thenable: metode chainable kembalikan builder; await resolve di titik mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'insert', 'single', 'maybeSingle']) {
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
  // getOrgContext memakai maybeSingle (profil 0 baris → null, bukan 406).
  const resolveProfile = () =>
    Promise.resolve({ data: { organization_id: organizationId }, error: null });
  builder.single = jest.fn(resolveProfile);
  builder.maybeSingle = jest.fn(resolveProfile);
  return builder;
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

const NEW: Parameters<typeof createInitiative>[0] = {
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

describe('createInitiative', () => {
  it('[1] INSERT memuat strategy_id + field kedalaman + organization_id + created_by; rpc tidak dipanggil', async () => {
    const profiles = makeProfilesBuilder('org1');
    const { builder, calls } = makeQueryThenable({ data: { id: 's1' }, error: null });
    mockFrom.mockImplementation((table: string) => (table === 'profiles' ? profiles : builder));

    const result = await createInitiative(NEW);

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('initiatives');
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
    await expect(createInitiative(NEW)).rejects.toEqual({ message: 'insert gagal' });
  });
});

describe('activateInitiative', () => {
  it('[3] memanggil rpc activate_initiative dengan p_initiative_id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await activateInitiative('s1');
    expect(mockRpc).toHaveBeenCalledWith('activate_initiative', { p_initiative_id: 's1' });
  });

  it('[4] propagasi error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'tolak' } });
    await expect(activateInitiative('s1')).rejects.toEqual({ message: 'tolak' });
  });
});

describe('listInitiatives', () => {
  it('[5] strategyId kosong → [] tanpa query', async () => {
    expect(await listInitiatives('')).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[6] query eq(strategy_id) + order created_at asc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 's1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listInitiatives('k1');
    expect(mockFrom).toHaveBeenCalledWith('initiatives');
    expect(calls.select).toEqual(['*']);
    expect(calls.eq).toEqual(['strategy_id', 'k1']);
    expect(calls.order).toEqual(['created_at', { ascending: true }]);
    expect(rows).toEqual([{ id: 's1' }]);
  });

  it('[7] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'list gagal' } });
    mockFrom.mockReturnValue(builder);
    await expect(listInitiatives('k1')).rejects.toEqual({ message: 'list gagal' });
  });
});

describe('getInitiative', () => {
  it('[8] eq(id) + maybeSingle() mengembalikan baris', async () => {
    const { builder, calls } = makeQueryThenable({ data: { id: 's1' }, error: null });
    mockFrom.mockReturnValue(builder);
    const row = await getInitiative('s1');
    expect(mockFrom).toHaveBeenCalledWith('initiatives');
    expect(calls.eq).toEqual(['id', 's1']);
    expect(builder.maybeSingle).toHaveBeenCalled();
    expect(row).toEqual({ id: 's1' });
  });

  it('[9] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'tidak ada' } });
    mockFrom.mockReturnValue(builder);
    await expect(getInitiative('s1')).rejects.toEqual({ message: 'tidak ada' });
  });
});
