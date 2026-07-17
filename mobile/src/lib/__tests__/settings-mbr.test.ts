// Data layer Fase 5 — settings-mbr.ts. Mock ../supabase. Menguji konstanta label/tone, util
// murni complianceLabel, listMbrRules (SELECT), setMbrRule (RPC set_minimum_breakdown_rule),
// checkMbrCompliance (RPC check_minimum_breakdown_compliance + normalisasi null), propagasi error.
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
  ENFORCEMENT_MODE_LABEL,
  ENFORCEMENT_MODE_TONE,
  checkMbrCompliance,
  complianceLabel,
  listMbrRules,
  setMbrRule,
} from '../settings-mbr';

/** Builder thenable: chainable select/eq/order, await resolve di mana pun. */
function makeQueryThenable(result: { data: unknown; error: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'single']) {
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
});

describe('konstanta MBR', () => {
  it('[1] ENFORCEMENT_MODE_LABEL menutup 4 mode kanonik §34.4 (id-ID, user-friendly)', () => {
    expect(ENFORCEMENT_MODE_LABEL).toEqual({
      nonaktif: 'Nonaktif',
      hanya_peringatan: 'Peringatan Saja',
      blokir_aktivasi: 'Blokir Aktivasi',
      blokir_akses_turunan: 'Blokir Akses Turunan',
    });
  });

  it('[2] ENFORCEMENT_MODE_TONE memetakan ke tone (neutral/warn/danger/danger)', () => {
    expect(ENFORCEMENT_MODE_TONE).toEqual({
      nonaktif: 'neutral',
      hanya_peringatan: 'warn',
      blokir_aktivasi: 'danger',
      blokir_akses_turunan: 'danger',
    });
  });
});

describe('complianceLabel (util murni)', () => {
  it('[3] count >= min → "Lengkap"', () => {
    expect(complianceLabel(3, 3)).toBe('Lengkap');
    expect(complianceLabel(5, 3)).toBe('Lengkap');
  });

  it('[4] count < min → "X/Y"', () => {
    expect(complianceLabel(2, 3)).toBe('2/3');
    expect(complianceLabel(0, 1)).toBe('0/1');
  });
});

describe('listMbrRules', () => {
  it('[5] SELECT * dari minimum_breakdown_rules, order parent_card_type asc; tidak panggil RPC', async () => {
    const { builder, calls } = makeQueryThenable({
      data: [
        { id: 'r1', parent_card_type: 'strategy', child_card_type: 'initiative', min_count: 3 },
      ],
      error: null,
    });
    mockFrom.mockReturnValue(builder);

    const rules = await listMbrRules();

    expect(mockFrom).toHaveBeenCalledWith('minimum_breakdown_rules');
    expect(calls.select).toEqual(['*']);
    expect(calls.order).toEqual(['parent_card_type', { ascending: true }]);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(rules).toEqual([
      { id: 'r1', parent_card_type: 'strategy', child_card_type: 'initiative', min_count: 3 },
    ]);
  });

  it('[6] propagasi error SELECT', async () => {
    const { builder } = makeQueryThenable({ data: null, error: { message: 'rls' } });
    mockFrom.mockReturnValue(builder);
    await expect(listMbrRules()).rejects.toEqual({ message: 'rls' });
  });
});

describe('setMbrRule', () => {
  it('[7] memanggil rpc set_minimum_breakdown_rule dengan p_* args; map camelCase→snake_case', async () => {
    mockRpc.mockResolvedValue({ data: 'rule-uuid', error: null });
    const id = await setMbrRule({
      parentCardType: 'strategy',
      childCardType: 'initiative',
      minCount: 3,
      enforcementMode: 'hanya_peringatan',
    });
    expect(mockRpc).toHaveBeenCalledWith('set_minimum_breakdown_rule', {
      p_parent_card_type: 'strategy',
      p_child_card_type: 'initiative',
      p_min_count: 3,
      p_enforcement_mode: 'hanya_peringatan',
    });
    expect(mockFrom).not.toHaveBeenCalled();
    expect(id).toBe('rule-uuid');
  });

  it('[8] propagasi error (mis. permission ditolak)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(
      setMbrRule({
        parentCardType: 'strategy',
        childCardType: 'initiative',
        minCount: 3,
        enforcementMode: 'hanya_peringatan',
      }),
    ).rejects.toEqual({ message: 'permission denied' });
  });
});

describe('checkMbrCompliance', () => {
  it('[9] memanggil rpc check_minimum_breakdown_compliance dgn p_parent_card_type+p_parent_card_id; meneruskan baris pertama; normalisasi data null → is_compliant true count 0', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          child_card_type: 'initiative',
          current_count: 2,
          required_count: 3,
          enforcement_mode: 'blokir_aktivasi',
          meets_requirement: false,
        },
      ],
      error: null,
    });
    const c = await checkMbrCompliance('strategy', 'k1');
    expect(mockRpc).toHaveBeenCalledWith('check_minimum_breakdown_compliance', {
      p_parent_card_type: 'strategy',
      p_parent_card_id: 'k1',
    });
    expect(c).toEqual({
      child_card_type: 'initiative',
      child_count: 2,
      min_count: 3,
      enforcement_mode: 'blokir_aktivasi',
      is_compliant: false,
    });

    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const empty = await checkMbrCompliance('strategy', 'k2');
    expect(empty).toEqual({
      child_card_type: null,
      child_count: 0,
      min_count: 0,
      enforcement_mode: 'hanya_peringatan',
      is_compliant: true,
    });

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'not allowed' } });
    await expect(checkMbrCompliance('strategy', 'k3')).rejects.toEqual({ message: 'not allowed' });
  });
});
