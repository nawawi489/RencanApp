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
import {
  activateInitiative,
  createInitiative,
  getInitiative,
  listInitiatives,
  updateInitiative,
  type InitiativePatch,
} from '../initiatives';

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
  // 0103: RPC idempoten (org/created_by diturunkan server-side), bukan .from('initiatives').insert();
  // client_request_id diteruskan sebagai p_client_request_id.
  it('[1] memanggil rpc create_initiative_idempotent dgn param + client_request_id; from tidak dipakai', async () => {
    mockRpc.mockResolvedValue({ data: { id: 's1' }, error: null });

    const result = await createInitiative({ ...NEW, client_request_id: 'idem-1' });

    expect(mockRpc).toHaveBeenCalledWith('create_initiative_idempotent', {
      p_strategy_id: 'k1',
      p_name: 'Strategi A',
      p_description: 'desc',
      p_reason: 'alasan',
      p_main_risk: 'risiko',
      p_alternative: 'alt',
      p_pic_id: 'p1',
      p_period_start: '2026-01-01',
      p_period_end: '2026-12-31',
      p_contribution_pct: undefined,
      p_client_request_id: 'idem-1',
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 's1' });
  });

  it('[2] propagasi error dari rpc', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'insert gagal' } });
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

// S4-2b — updateInitiative passthrough via RPC update_initiative.
describe('updateInitiative', () => {
  const patch: InitiativePatch = {
    name: 'Init Diubah',
    description: null,
    pic_id: 'u1',
    reason: 'Alasan',
    main_risk: null,
    alternative: null,
    contribution_pct: 25,
    period_start: null,
    period_end: null,
  };
  const rpcArgs = () => mockRpc.mock.calls[0][1] as Record<string, unknown>;

  it('[10] meneruskan id + patch ke update_initiative', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await updateInitiative('i1', patch);
    expect(mockRpc.mock.calls[0][0]).toBe('update_initiative');
    expect(rpcArgs().p_initiative_id).toBe('i1');
    expect(rpcArgs().p_name).toBe('Init Diubah');
    expect(rpcArgs().p_pic_id).toBe('u1');
    expect(rpcArgs().p_contribution_pct).toBe(25);
    expect(rpcArgs().p_main_risk).toBeNull();
  });

  it('[11] propagasi error dari server (mis. "Kontribusi terkunci")', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'Kontribusi Inisiatif terkunci.' } });
    await expect(updateInitiative('i1', patch)).rejects.toEqual({
      message: 'Kontribusi Inisiatif terkunci.',
    });
  });
});
