// cards.ts meng-import ./supabase di top-level → mock agar tak butuh env saat import.
// Menguji label maps (murni) + Fase 4: listActionPlans filter initiative_id & createActionPlan passthrough initiative_id.
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

// eslint-disable-next-line import/first -- jest.mock must be declared before the import it mocks
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  STATUS_TONE,
  countCompletedTasksInPeriod,
  createActionPlan,
  createTask,
  createTaskWithRepeat,
  getPersonRef,
  listActionPlans,
  listActionPlansByProblemStatementIds,
  listStrategyResultValueSources,
  type NewActionPlan,
  type NewTask,
} from '../cards';

/** Builder thenable: metode chainable kembalikan builder; await resolve di titik mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte']) {
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
  mockRpc.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('cards label maps', () => {
  it('[1] memetakan status action_plan ke label Indonesia', () => {
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

describe('listActionPlans — filter initiative_id (Fase 4)', () => {
  it('[4] tanpa opts → tidak memfilter initiative_id, order desc', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'i1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listActionPlans();
    expect(mockFrom).toHaveBeenCalledWith('action_plans');
    expect(calls.is).toBeUndefined();
    expect(calls.eq).toBeUndefined();
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(rows).toEqual([{ id: 'i1' }]);
  });

  it('[5] initiativeId:null → .is(initiative_id, null) (section Tanpa Goal)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listActionPlans({ initiativeId: null });
    expect(calls.is).toEqual(['initiative_id', null]);
    expect(calls.eq).toBeUndefined();
  });

  it('[6] initiativeId:"s1" → .eq(initiative_id, s1)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listActionPlans({ initiativeId: 's1' });
    expect(calls.eq).toEqual(['initiative_id', 's1']);
    expect(calls.is).toBeUndefined();
  });

  it('[7] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listActionPlans()).rejects.toEqual({ message: 'boom' });
  });

  it('[7a] problemStatementId:"p1" → .eq(problem_statement_id, p1) (Fase 6)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listActionPlans({ problemStatementId: 'p1' });
    expect(calls.eq).toEqual(['problem_statement_id', 'p1']);
    expect(calls.is).toBeUndefined();
  });

  it('[7b] problemStatementId:null → .is(problem_statement_id, null)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    await listActionPlans({ problemStatementId: null });
    expect(calls.is).toEqual(['problem_statement_id', null]);
    expect(calls.eq).toBeUndefined();
  });
});

describe('createActionPlan — passthrough via RPC idempoten (Fase 4 / 0103)', () => {
  const base: NewActionPlan = {
    name: 'Init',
    target_result: null,
    pic_id: null,
    period_start: null,
    period_end: null,
  };
  const rpcArgs = () => mockRpc.mock.calls[0][1] as Record<string, unknown>;

  beforeEach(() => mockRpc.mockResolvedValue({ data: { id: 'i-new' }, error: null }));

  it('[8] meneruskan initiative_id + client_request_id ke create_action_plan_idempotent; from tidak dipakai', async () => {
    await createActionPlan({ ...base, initiative_id: 's1', client_request_id: 'idem-1' });
    expect(mockRpc.mock.calls[0][0]).toBe('create_action_plan_idempotent');
    expect(rpcArgs().p_initiative_id).toBe('s1');
    expect(rpcArgs().p_client_request_id).toBe('idem-1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[9] initiative_id:null → p_initiative_id undefined (RPC default null; hasil sama)', async () => {
    await createActionPlan({ ...base, initiative_id: null });
    expect(rpcArgs().p_initiative_id).toBeUndefined();
  });

  it('[10] tanpa initiative_id → p_initiative_id undefined (Fase 1 tak berubah)', async () => {
    await createActionPlan(base);
    expect(rpcArgs().p_initiative_id).toBeUndefined();
  });

  it('[10a] meneruskan problem_statement_id ke RPC (Fase 6)', async () => {
    await createActionPlan({ ...base, problem_statement_id: 'ps1' });
    expect(rpcArgs().p_problem_statement_id).toBe('ps1');
  });

  it('[10b] tanpa problem_statement_id → p_problem_statement_id undefined', async () => {
    await createActionPlan(base);
    expect(rpcArgs().p_problem_statement_id).toBeUndefined();
  });

  it('[10c] propagasi error dari rpc', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rls' } });
    await expect(createActionPlan(base)).rejects.toEqual({ message: 'rls' });
  });
});

describe('createTask — passthrough via RPC idempoten (0103)', () => {
  const base: NewTask = {
    action_plan_id: 'ap1',
    name: 'Tugas',
    pic_id: null,
    reviewer_id: null,
    start_date: null,
    deadline: null,
    expected_output: null,
    definition_of_done: null,
    priority: null,
    evidence_required: false,
    result_value_required: false,
  };
  const rpcArgs = () => mockRpc.mock.calls[0][1] as Record<string, unknown>;

  beforeEach(() => mockRpc.mockResolvedValue({ data: { id: 't-new' }, error: null }));

  it('[ID-2] memanggil create_task_idempotent dgn action_plan_id + booleans + client_request_id; from tidak dipakai', async () => {
    const task = await createTask({ ...base, evidence_required: true, client_request_id: 'idem-2' });
    expect(mockRpc.mock.calls[0][0]).toBe('create_task_idempotent');
    expect(rpcArgs().p_action_plan_id).toBe('ap1');
    expect(rpcArgs().p_name).toBe('Tugas');
    expect(rpcArgs().p_evidence_required).toBe(true);
    expect(rpcArgs().p_result_value_required).toBe(false);
    expect(rpcArgs().p_client_request_id).toBe('idem-2');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(task).toEqual({ id: 't-new' });
  });

  it('[ID-2b] tanpa client_request_id → p_client_request_id undefined', async () => {
    await createTask(base);
    expect(rpcArgs().p_client_request_id).toBeUndefined();
  });
});

// Fix bug partial-failure: Tugas + repeat rule ditulis dalam SATU RPC atomik
// (create_task_with_repeat_idempotent), bukan dua write terpisah (createTask lalu
// setRepeatRule) yang bisa meninggalkan draft yatim → duplikat saat retry.
describe('createTaskWithRepeat — satu RPC atomik (task + repeat)', () => {
  const base: NewTask = {
    action_plan_id: 'ap1',
    name: 'Tutup Buku',
    pic_id: null,
    reviewer_id: null,
    start_date: null,
    deadline: null,
    deadline_time: '23:00',
    expected_output: null,
    definition_of_done: null,
    priority: null,
    evidence_required: false,
    result_value_required: false,
  };
  const rpcArgs = () => mockRpc.mock.calls[0][1] as Record<string, unknown>;

  beforeEach(() => mockRpc.mockResolvedValue({ data: { id: 't-new' }, error: null }));

  it('[ID-R1] one-time (repeat null) → SATU panggilan RPC, p_repeat false, param repeat undefined', async () => {
    const task = await createTaskWithRepeat({ ...base, client_request_id: 'idem-r1' }, null);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('create_task_with_repeat_idempotent');
    expect(rpcArgs().p_action_plan_id).toBe('ap1');
    expect(rpcArgs().p_client_request_id).toBe('idem-r1');
    expect(rpcArgs().p_repeat).toBe(false);
    expect(rpcArgs().p_frequency).toBeUndefined();
    expect(rpcArgs().p_time_of_day).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(task).toEqual({ id: 't-new' });
  });

  it('[ID-R2] repeat aktif → SATU panggilan RPC membawa task + param repeat (p_repeat true)', async () => {
    await createTaskWithRepeat(base, {
      frequency: 'weekly',
      weekdays: [1, 3],
      monthDays: null,
      customDates: null,
      repeatStartDate: '2026-06-01',
      repeatEndDate: '2026-06-30',
      timeOfDay: '23:00',
      missedRule: 'grace_period',
      gracePeriodMinutes: 30,
    });
    // Kunci anti-regresi: TIDAK dua write terpisah — hanya satu RPC atomik.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('create_task_with_repeat_idempotent');
    expect(rpcArgs().p_repeat).toBe(true);
    expect(rpcArgs().p_frequency).toBe('weekly');
    expect(rpcArgs().p_weekdays).toEqual([1, 3]);
    expect(rpcArgs().p_repeat_start_date).toBe('2026-06-01');
    expect(rpcArgs().p_repeat_end_date).toBe('2026-06-30');
    expect(rpcArgs().p_time_of_day).toBe('23:00');
    expect(rpcArgs().p_missed_rule).toBe('grace_period');
    expect(rpcArgs().p_grace_period_minutes).toBe(30);
  });

  it('[ID-R3] error RPC dipropagasi (form dipertahankan oleh pemanggil)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'jaringan' } });
    await expect(createTaskWithRepeat(base, null)).rejects.toEqual({ message: 'jaringan' });
  });
});

describe('listActionPlansByProblemStatementIds (UI-S-DA2)', () => {
  it('[14] ids kosong → [] tanpa query', async () => {
    expect(await listActionPlansByProblemStatementIds([])).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('[15] ids → .in(problem_statement_id, ids)', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'i1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listActionPlansByProblemStatementIds(['p1', 'p2']);
    expect(mockFrom).toHaveBeenCalledWith('action_plans');
    expect(calls.in).toEqual(['problem_statement_id', ['p1', 'p2']]);
    expect(rows).toEqual([{ id: 'i1' }]);
  });

  it('[16] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listActionPlansByProblemStatementIds(['p1'])).rejects.toEqual({ message: 'boom' });
  });
});

describe('listStrategyResultValueSources (UI-S-KD2/KD3)', () => {
  it('[17] filter strategy_id, order terbaru dahulu', async () => {
    const { builder, calls } = makeQueryThenable({ data: [{ id: 'rv1' }], error: null });
    mockFrom.mockReturnValue(builder);
    const rows = await listStrategyResultValueSources('k1');
    expect(mockFrom).toHaveBeenCalledWith('task_result_values');
    expect(calls.eq).toEqual(['strategy_id', 'k1']);
    expect(calls.order).toEqual(['created_at', { ascending: false }]);
    expect(rows).toEqual([{ id: 'rv1' }]);
  });

  it('[18] data null → []', async () => {
    const { builder } = makeQueryThenable({ data: null, error: null });
    mockFrom.mockReturnValue(builder);
    expect(await listStrategyResultValueSources('k1')).toEqual([]);
  });

  it('[19] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listStrategyResultValueSources('k1')).rejects.toEqual({ message: 'boom' });
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

// ============================================================ PPL-06 Kontribusi bulan ini (OQ-6)
// Semantik "AP selesai bulan ini" (OQ-6 diputuskan 2026-07-05): idealnya `completed_at` window,
// namun schema tak punya kolom itu dan spec §NG-5 tidak mengizinkan migrasi baru untuk bug ini.
// Approksimasi: `updated_at` window. Untuk AP `done` yang tidak lagi diedit, updated_at ≈ completed_at.
describe('countCompletedTasksInPeriod — PPL-06 Kontribusi (OQ-6, approksimasi updated_at)', () => {
  const period = { period_start: '2026-07-01', period_end: '2026-07-31' };

  it('[D7] userId kosong → 0 tanpa fetch dan tanpa auth.getUser', async () => {
    let called = false;
    mockFrom.mockImplementation(() => {
      called = true;
      return makeQueryThenable({ data: [], error: null }).builder;
    });
    const n = await countCompletedTasksInPeriod('', period);
    expect(n).toBe(0);
    expect(called).toBe(false);
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('[D8] period null → 0 tanpa fetch', async () => {
    let called = false;
    mockFrom.mockImplementation(() => {
      called = true;
      return makeQueryThenable({ data: [], error: null }).builder;
    });
    const n = await countCompletedTasksInPeriod('u1', null);
    expect(n).toBe(0);
    expect(called).toBe(false);
  });

  it('[D9] query shape: from(tasks) eq(pic_id,userId) eq(status,done) gte(updated_at,start) lte(updated_at,end)', async () => {
    const { builder } = makeQueryThenable({
      data: [{ id: 'ap1' }, { id: 'ap2' }, { id: 'ap3' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    const n = await countCompletedTasksInPeriod('u1', period);
    expect(mockFrom).toHaveBeenCalledWith('tasks');
    const eqCalls = (builder.eq as jest.Mock).mock.calls;
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ['pic_id', 'u1'],
        ['status', 'done'],
      ]),
    );
    const gteCalls = (builder.gte as jest.Mock).mock.calls;
    const lteCalls = (builder.lte as jest.Mock).mock.calls;
    expect(gteCalls).toEqual(expect.arrayContaining([['updated_at', period.period_start]]));
    expect(lteCalls).toEqual(expect.arrayContaining([['updated_at', period.period_end]]));
    expect(n).toBe(3);
  });

  it('[D10] return data.length (belum ada AP selesai → 0)', async () => {
    const { builder } = makeQueryThenable({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    const n = await countCompletedTasksInPeriod('u1', period);
    expect(n).toBe(0);
  });

  it('[D11] propagasi error', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(countCompletedTasksInPeriod('u1', period)).rejects.toEqual({ message: 'boom' });
  });
});
