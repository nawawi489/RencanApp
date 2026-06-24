// Data layer Fase 2 — repeat.ts. Mock ../supabase agar tak butuh env/native saat import.
// Menguji: label/tone instance, struktur argumen RPC (nama p_*), kolom query, dan propagasi error.

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import {
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  getInstance,
  getRepeatCompliance,
  listInstances,
  reviewInstanceSubmission,
  setRepeatRule,
  submitInstance,
  type RepeatRuleInput,
} from '../repeat';

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

/** Builder query chainable; metode terminal (order/single) me-resolve {data,error}. */
function makeQuery(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, jest.Mock> = {};
  for (const m of ['select', 'eq']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return builder;
    });
  }
  for (const m of ['order', 'single', 'maybeSingle']) {
    builder[m] = jest.fn((...args: unknown[]) => {
      calls[m] = args;
      return Promise.resolve(result);
    });
  }
  return { builder, calls };
}

describe('repeat label & tone maps', () => {
  it('[1] memetakan tiap status instance ke label Indonesia', () => {
    expect(INSTANCE_STATUS_LABEL.assigned).toBe('Ditugaskan');
    expect(INSTANCE_STATUS_LABEL.in_progress).toBe('Dikerjakan');
    expect(INSTANCE_STATUS_LABEL.submitted).toBe('Menunggu Review');
    expect(INSTANCE_STATUS_LABEL.done).toBe('Selesai');
    expect(INSTANCE_STATUS_LABEL.revision).toBe('Revisi Diperlukan');
    expect(INSTANCE_STATUS_LABEL.missed).toBe('Terlewat');
    expect(INSTANCE_STATUS_LABEL.archived).toBe('Diarsipkan');
  });

  it('[2] tone: missed & revision danger, submitted warn, done success', () => {
    expect(INSTANCE_STATUS_TONE.missed).toBe('danger');
    expect(INSTANCE_STATUS_TONE.revision).toBe('danger');
    expect(INSTANCE_STATUS_TONE.submitted).toBe('warn');
    expect(INSTANCE_STATUS_TONE.done).toBe('success');
    expect(INSTANCE_STATUS_TONE.assigned).toBe('info');
  });
});

const RULE_INPUT: RepeatRuleInput = {
  frequency: 'daily',
  weekdays: null,
  monthDays: null,
  customDates: null,
  repeatStartDate: '2026-06-01',
  repeatEndDate: '2026-06-30',
  timeOfDay: '23:00',
  missedRule: 'strict',
  gracePeriodMinutes: null,
};

describe('setRepeatRule', () => {
  it('[3] memanggil rpc set_action_plan_repeat_rule dengan nama p_* benar & semua field', async () => {
    mockRpc.mockResolvedValue({ data: 'rule-1', error: null });
    const id = await setRepeatRule('ap-1', RULE_INPUT);
    expect(id).toBe('rule-1');
    expect(mockRpc).toHaveBeenCalledWith('set_action_plan_repeat_rule', {
      p_action_plan_id: 'ap-1',
      p_frequency: 'daily',
      p_weekdays: null,
      p_month_days: null,
      p_custom_dates: null,
      p_repeat_start_date: '2026-06-01',
      p_repeat_end_date: '2026-06-30',
      p_time_of_day: '23:00',
      p_missed_rule: 'strict',
      p_grace_period_minutes: null,
    });
  });

  it('[4] melempar error saat RPC mengembalikan error (immutability/otorisasi)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Repeat Rule terkunci' } });
    await expect(setRepeatRule('ap-1', RULE_INPUT)).rejects.toEqual({ message: 'Repeat Rule terkunci' });
  });
});

describe('listInstances', () => {
  it('[5] select kolom relasi pic/reviewer/submissions, filter & urut instance_date', async () => {
    const rows = [{ id: 'i1' }, { id: 'i2' }];
    const { builder, calls } = makeQuery({ data: rows, error: null });
    mockFrom.mockReturnValue(builder);
    const out = await listInstances('ap-1');
    expect(mockFrom).toHaveBeenCalledWith('action_plan_instances');
    const selectArg = String(calls.select?.[0]);
    expect(selectArg).toContain('pic:pic_id');
    expect(selectArg).toContain('reviewer:reviewer_id');
    expect(selectArg).toContain('action_plan_submissions');
    expect(calls.eq).toEqual(['action_plan_id', 'ap-1']);
    expect(calls.order?.[0]).toBe('instance_date');
    expect(out).toBe(rows);
  });

  it('[6] melempar error saat query mengembalikan error', async () => {
    const { builder } = makeQuery({ data: null, error: { message: 'boom' } });
    mockFrom.mockReturnValue(builder);
    await expect(listInstances('ap-1')).rejects.toEqual({ message: 'boom' });
  });
});

describe('getInstance', () => {
  it('[7] memakai .single() dengan filter id dan mengembalikan satu instance', async () => {
    const row = { id: 'i1', pic: null, reviewer: null, action_plan_submissions: [] };
    const { builder, calls } = makeQuery({ data: row, error: null });
    mockFrom.mockReturnValue(builder);
    const out = await getInstance('i1');
    expect(mockFrom).toHaveBeenCalledWith('action_plan_instances');
    expect(calls.eq).toEqual(['id', 'i1']);
    expect(builder.single).toHaveBeenCalled();
    expect(out).toBe(row);
  });
});

describe('submitInstance', () => {
  it('[8] rpc submit_action_plan_instance dgn p_instance_id + evidence/result, note null→""', async () => {
    mockRpc.mockResolvedValue({ data: 'sub-1', error: null });
    const out = await submitInstance({
      instanceId: 'i1',
      note: null,
      evidence: [{ kind: 'text_note', text_content: 'ok' }],
      resultValues: [{ label: 'Selisih', value_type: 'currency', value_text: '0' }],
    });
    expect(out).toBe('sub-1');
    expect(mockRpc).toHaveBeenCalledWith('submit_action_plan_instance', {
      p_instance_id: 'i1',
      p_note: '',
      p_evidence: [{ kind: 'text_note', text_content: 'ok' }],
      p_result_values: [{ label: 'Selisih', value_type: 'currency', value_text: '0' }],
    });
  });

  it('[9] melempar error saat submit ke instance yang sudah Terlewat', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Instance sudah Terlewat' } });
    await expect(
      submitInstance({ instanceId: 'i1', note: null, evidence: [], resultValues: [] }),
    ).rejects.toEqual({ message: 'Instance sudah Terlewat' });
  });
});

describe('reviewInstanceSubmission', () => {
  it('[10] rpc review_action_plan_instance_submission dgn decision & reason, reason null→""', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await reviewInstanceSubmission({ submissionId: 'sub-1', decision: 'approve', reason: null });
    expect(mockRpc).toHaveBeenCalledWith('review_action_plan_instance_submission', {
      p_submission_id: 'sub-1',
      p_decision: 'approve',
      p_reason: '',
    });
  });

  it('[11] melempar error self-approval saat reviewer == PIC instance', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'PIC tidak boleh me-review' } });
    await expect(
      reviewInstanceSubmission({ submissionId: 'sub-1', decision: 'approve', reason: null }),
    ).rejects.toEqual({ message: 'PIC tidak boleh me-review' });
  });
});

describe('getRepeatCompliance', () => {
  it('[12] mengembalikan baris pertama hasil RPC (28/30)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ expected_count: 30, on_time_count: 28, missed_count: 2, done_count: 28, compliance: 0.9333 }],
      error: null,
    });
    const out = await getRepeatCompliance('ap-1');
    expect(mockRpc).toHaveBeenCalledWith('get_repeat_compliance', { p_action_plan_id: 'ap-1' });
    expect(out.expected_count).toBe(30);
    expect(out.on_time_count).toBe(28);
    expect(out.compliance).toBe(0.9333);
  });

  it('[13] compliance null untuk one_time (hasil RPC kosong)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const out = await getRepeatCompliance('ap-1');
    expect(out.compliance).toBeNull();
    expect(out.expected_count).toBe(0);
  });

  it('[14] melempar error saat RPC gagal', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'gagal' } });
    await expect(getRepeatCompliance('ap-1')).rejects.toEqual({ message: 'gagal' });
  });
});
