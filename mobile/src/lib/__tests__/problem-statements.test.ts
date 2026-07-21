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
  activateProblemStatement,
  createProblemStatement,
  getProblemStatement,
  listProblemStatements,
  type NewProblemStatement,
} from '../problem-statements';

function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'maybeSingle']) {
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
  for (const m of ['select', 'eq', 'insert']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  // Getter detail memakai maybeSingle (baris tersaring RLS → null, bukan 406); INSERT tetap single.
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

describe('listProblemStatements — guarded by developmentAreaId', () => {
  it('[1] developmentAreaId kosong → [] tanpa query', async () => {
    const rows = await listProblemStatements('');
    expect(rows).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[2] developmentAreaId terisi → .eq(development_area_id, id).order(created_at asc)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'p1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listProblemStatements('d1');
    expect(mockFrom).toHaveBeenCalledWith('problem_statements');
    expect(calls.eq).toEqual(['development_area_id', 'd1']);
    expect(calls.order).toEqual(['created_at', { ascending: true }]);
    expect(rows).toEqual([{ id: 'p1' }]);
  });

  it('[3] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listProblemStatements('d1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('getProblemStatement', () => {
  it('[4] select * eq id .maybeSingle()', async () => {
    const { builder, calls } = makeSingleBuilder({ data: { id: 'p1' }, error: null });
    mockFrom.mockReturnValue(builder);
    const row = await getProblemStatement('p1');
    expect(calls.eq).toEqual(['id', 'p1']);
    expect(row).toEqual({ id: 'p1' });
  });
});

describe('createProblemStatement', () => {
  const base: NewProblemStatement = {
    development_area_id: 'd1',
    name: 'Bug X',
    pic_id: null,
    period_start: null,
    period_end: null,
  };

  function setup() {
    const profiles = makeSingleBuilder({ data: { organization_id: 'org1' }, error: null });
    const inserts = makeSingleBuilder({ data: { id: 'p-new' }, error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'profiles' ? profiles.builder : inserts.builder,
    );
    return { profiles, inserts };
  }

  it('[5] payload memuat development_area_id + org + created_by', async () => {
    const { inserts } = setup();
    await createProblemStatement(base);
    const payload = (inserts.calls.insert as unknown[])[0] as Record<string, unknown>;
    expect(payload.development_area_id).toBe('d1');
    expect(payload.organization_id).toBe('org1');
    expect(payload.created_by).toBe('u1');
  });

  it('[6] tanpa auth user → throw "Not authenticated"', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(createProblemStatement(base)).rejects.toThrow('Not authenticated');
  });
});

describe('activateProblemStatement — RPC', () => {
  it('[7] memanggil rpc activate_problem_statement dgn p_problem_statement_id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await activateProblemStatement('p1');
    expect(mockRpc).toHaveBeenCalledWith('activate_problem_statement', {
      p_problem_statement_id: 'p1',
    });
  });

  it('[8] propagasi RPC error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'denied' } });
    await expect(activateProblemStatement('p1')).rejects.toEqual({ message: 'denied' });
  });
});
