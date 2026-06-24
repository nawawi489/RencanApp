// cards.ts meng-import ./supabase di top-level → mock agar tak butuh env saat import.
// Menguji label maps (murni) + Fase 4: listInitiatives filter strategy_id & createInitiative passthrough strategy_id.
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

// eslint-disable-next-line import/first -- jest.mock must be declared before the import it mocks
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  STATUS_TONE,
  createInitiative,
  getPersonRef,
  listInitiatives,
  type NewInitiative,
} from '../cards';

/** Builder thenable: metode chainable kembalikan builder; await resolve di titik mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { builder, calls };
}

/** Builder yang diakhiri .single() (untuk profiles.select().eq().single() & insert().select().single()). */
function makeSingleBuilder(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert']) {
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
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('cards label maps', () => {
  it('[1] memetakan status initiative ke label Indonesia', () => {
    expect(INITIATIVE_STATUS_LABEL.active).toBe('Aktif');
    expect(INITIATIVE_STATUS_LABEL.done).toBe('Selesai');
  });

  it('[2] memetakan status action plan ke label Indonesia', () => {
    expect(ACTION_PLAN_STATUS_LABEL.submitted).toBe('Menunggu Review');
    expect(ACTION_PLAN_STATUS_LABEL.revision).toBe('Revisi Diperlukan');
  });

  it('[3] memberi tone semantik yang benar per status', () => {
    expect(STATUS_TONE.revision).toBe('danger');
    expect(STATUS_TONE.done).toBe('success');
    expect(STATUS_TONE.submitted).toBe('warn');
  });
});

describe('listInitiatives — filter strategy_id (Fase 4)', () => {
  it('[4] tanpa opts → tidak memfilter strategy_id, order desc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'i1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listInitiatives();
    expect(mockFrom).toHaveBeenCalledWith('initiatives');
    expect(calls.is).toBeUndefined();
    expect(calls.eq).toBeUndefined();
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(rows).toEqual([{ id: 'i1' }]);
  });

  it('[5] strategyId:null → .is(strategy_id, null) (section Tanpa Goal)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listInitiatives({ strategyId: null });
    expect(calls.is).toEqual(['strategy_id', null]);
    expect(calls.eq).toBeUndefined();
  });

  it('[6] strategyId:"s1" → .eq(strategy_id, s1)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listInitiatives({ strategyId: 's1' });
    expect(calls.eq).toEqual(['strategy_id', 's1']);
    expect(calls.is).toBeUndefined();
  });

  it('[7] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listInitiatives()).rejects.toEqual({ message: 'boom' });
  });
});

describe('createInitiative — passthrough strategy_id (Fase 4)', () => {
  const base: NewInitiative = {
    name: 'Init',
    target_result: null,
    pic_id: null,
    period_start: null,
    period_end: null,
  };

  function setup() {
    const profiles = makeSingleBuilder({ data: { organization_id: 'org1' }, error: null });
    const inits = makeSingleBuilder({ data: { id: 'i-new' }, error: null });
    mockFrom.mockImplementation((table: string) => (table === 'profiles' ? profiles.builder : inits.builder));
    return { profiles, inits };
  }

  it('[8] meneruskan strategy_id ke payload INSERT + org & created_by', async () => {
    const { inits } = setup();
    await createInitiative({ ...base, strategy_id: 's1' });
    const payload = (inits.calls.insert as unknown[])[0] as Record<string, unknown>;
    expect(payload.strategy_id).toBe('s1');
    expect(payload.organization_id).toBe('org1');
    expect(payload.created_by).toBe('u1');
  });

  it('[9] strategy_id:null eksplisit tetap diteruskan (backward-compat datar)', async () => {
    const { inits } = setup();
    await createInitiative({ ...base, strategy_id: null });
    const payload = (inits.calls.insert as unknown[])[0] as Record<string, unknown>;
    expect(payload.strategy_id).toBeNull();
  });

  it('[10] tanpa strategy_id → payload tidak memuat field itu (Fase 1 tak berubah)', async () => {
    const { inits } = setup();
    await createInitiative(base);
    const payload = (inits.calls.insert as unknown[])[0] as Record<string, unknown>;
    expect('strategy_id' in payload).toBe(false);
  });
});

describe('getPersonRef (prefill PIC dari pic_id)', () => {
  it('[11] id null/undefined → null tanpa query', async () => {
    expect(await getPersonRef(null)).toBeNull();
    expect(await getPersonRef(undefined)).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[12] id → profiles.select().eq().maybeSingle() & kembalikan PersonRef', async () => {
    const { builder, calls } = makeSingleBuilder({
      data: { id: 'p1', full_name: 'Budi', email: 'b@x.id' },
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    const p = await getPersonRef('p1');
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(calls.eq).toEqual(['id', 'p1']);
    expect(p).toEqual({ id: 'p1', full_name: 'Budi', email: 'b@x.id' });
  });

  it('[13] propagasi error', async () => {
    const { builder } = makeSingleBuilder({ data: null, error: { message: 'x' } });
    mockFrom.mockReturnValue(builder);
    await expect(getPersonRef('p1')).rejects.toEqual({ message: 'x' });
  });
});
