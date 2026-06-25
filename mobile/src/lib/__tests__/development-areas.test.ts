// Mirror cards.test pattern: mock ../supabase, builder thenable/single, jest.fn route by table.
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
  activateDevelopmentArea,
  createDevelopmentArea,
  getDevelopmentArea,
  listDevelopmentAreas,
  problemCountOf,
  type DevelopmentAreaWithProblemCount,
  type NewDevelopmentArea,
} from '../development-areas';

function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) {
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
  builder.single = jest.fn(() => Promise.resolve(result));
  return { builder, calls };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockGetUser.mockReset();
  mockRpc.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('listDevelopmentAreas — embedded problem_statements(count)', () => {
  it('[1] memanggil select dgn embedded count + order desc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'd1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listDevelopmentAreas();
    expect(mockFrom).toHaveBeenCalledWith('development_areas');
    expect(calls.select).toEqual(['*, problem_statements(count)']);
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(rows).toEqual([{ id: 'd1' }]);
  });

  it('[2] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'x' } });
    mockFrom.mockReturnValue(builder);
    await expect(listDevelopmentAreas()).rejects.toEqual({ message: 'x' });
  });
});

describe('problemCountOf', () => {
  it('[3] mengekstrak count dari embedded array', () => {
    const da = { problem_statements: [{ count: 3 }] } as DevelopmentAreaWithProblemCount;
    expect(problemCountOf(da)).toBe(3);
  });
  it('[4] null bila count tak tersedia', () => {
    expect(problemCountOf({ problem_statements: [] } as unknown as DevelopmentAreaWithProblemCount)).toBeNull();
  });
});

describe('getDevelopmentArea', () => {
  it('[5] select * eq id .single()', async () => {
    const { builder, calls } = makeSingleBuilder({ data: { id: 'd1' }, error: null });
    mockFrom.mockReturnValue(builder);
    const row = await getDevelopmentArea('d1');
    expect(calls.eq).toEqual(['id', 'd1']);
    expect(row).toEqual({ id: 'd1' });
  });
});

describe('createDevelopmentArea — org_id from profile + created_by from auth', () => {
  const base: NewDevelopmentArea = {
    name: 'Org Dev',
    pic_id: null,
    period_start: null,
    period_end: null,
  };

  function setup() {
    const profiles = makeSingleBuilder({ data: { organization_id: 'org1' }, error: null });
    const inserts = makeSingleBuilder({ data: { id: 'd-new' }, error: null });
    mockFrom.mockImplementation((table: string) =>
      table === 'profiles' ? profiles.builder : inserts.builder,
    );
    return { profiles, inserts };
  }

  it('[6] meneruskan org_id dari profile & created_by dari auth.uid()', async () => {
    const { inserts } = setup();
    await createDevelopmentArea(base);
    const payload = (inserts.calls.insert as unknown[])[0] as Record<string, unknown>;
    expect(payload.organization_id).toBe('org1');
    expect(payload.created_by).toBe('u1');
    expect(payload.name).toBe('Org Dev');
  });

  it('[7] tanpa auth user → throw "Not authenticated"', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(createDevelopmentArea(base)).rejects.toThrow('Not authenticated');
  });

  it('[8] tanpa org_id pada profile → throw "Organization not found"', async () => {
    const profiles = makeSingleBuilder({ data: { organization_id: null }, error: null });
    mockFrom.mockImplementation(() => profiles.builder);
    await expect(createDevelopmentArea(base)).rejects.toThrow('Organization not found');
  });
});

describe('activateDevelopmentArea — RPC', () => {
  it('[9] memanggil rpc activate_development_area dgn p_development_area_id', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await activateDevelopmentArea('d1');
    expect(mockRpc).toHaveBeenCalledWith('activate_development_area', {
      p_development_area_id: 'd1',
    });
  });

  it('[10] propagasi RPC error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'denied' } });
    await expect(activateDevelopmentArea('d1')).rejects.toEqual({ message: 'denied' });
  });
});
