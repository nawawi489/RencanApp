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

  // 0103: RPC idempoten (org/created_by + auth guard di server), bukan .from().insert()+getOrgContext.
  it('[5] memanggil rpc create_problem_statement_idempotent dgn param + client_request_id; from tidak dipakai', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'p-new' }, error: null });
    const row = await createProblemStatement({
      ...base,
      impact: 'high',
      initial_evidence: 'bukti',
      client_request_id: 'idem-1',
    });
    expect(mockRpc).toHaveBeenCalledWith('create_problem_statement_idempotent', {
      p_development_area_id: 'd1',
      p_name: 'Bug X',
      p_description: undefined,
      p_pic_id: undefined,
      p_period_start: undefined,
      p_period_end: undefined,
      p_impact: 'high',
      p_initial_evidence: 'bukti',
      p_client_request_id: 'idem-1',
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(row).toEqual({ id: 'p-new' });
  });

  it('[6] propagasi error dari rpc', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(createProblemStatement(base)).rejects.toEqual({ message: 'denied' });
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
