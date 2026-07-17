// Data layer Fase 3 — home.ts. Tiap section memanggil RPC server (org-tz dihitung server, CF-3);
// klien tak pernah menghitung/menyetor tanggal. Menguji pemetaan RPC, propagasi error, getOrgToday.
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
  getOrgToday,
  listKpiNeedsAttention,
  listNearDeadline,
  listOverdueItems,
  listTodayRepeatInstances,
} from '../home';

/** Builder thenable: select/eq chainable; await resolve {data,error} di titik mana pun. */
function thenable(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  b.select = jest.fn(() => b);
  b.eq = jest.fn(() => b);
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return b;
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

describe('getOrgToday (CF-3: tanggal dari server)', () => {
  it('[1] memanggil rpc get_org_today & mengembalikan tanggal', async () => {
    mockRpc.mockResolvedValue({ data: '2026-06-24', error: null });
    expect(await getOrgToday()).toBe('2026-06-24');
    expect(mockRpc).toHaveBeenCalledWith('get_org_today');
  });

  it('[2] error dipropagasi', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'tz' } });
    await expect(getOrgToday()).rejects.toEqual({ message: 'tz' });
  });
});

describe('section queries per-section (AC-H11)', () => {
  it('[3] listTodayRepeatInstances → rpc get_today_repeat_instances (TANPA argumen tanggal)', async () => {
    mockRpc.mockResolvedValue({ data: [{ kind: 'instance', id: 'i1' }], error: null });
    const rows = await listTodayRepeatInstances();
    expect(mockRpc).toHaveBeenCalledWith('get_today_repeat_instances');
    expect(mockRpc.mock.calls[0]).toHaveLength(1); // hanya nama fn, tak ada p_today klien (CF-3)
    expect(rows).toEqual([{ kind: 'instance', id: 'i1' }]);
  });

  it('[4] listOverdueItems → rpc get_overdue_items', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await listOverdueItems();
    expect(mockRpc).toHaveBeenCalledWith('get_overdue_items');
  });

  it('[5] listNearDeadline → rpc get_near_deadline_items', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await listNearDeadline();
    expect(mockRpc).toHaveBeenCalledWith('get_near_deadline_items');
  });

  it('[6] error per-section dipropagasi (tanpa masking partial)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listOverdueItems()).rejects.toEqual({ message: 'boom' });
  });

  it('[7] data null → [] (section kosong aman)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await listNearDeadline()).toEqual([]);
  });
});

describe('listKpiNeedsAttention (gap-aware, 0032 override PRD §18)', () => {
  it('[8] KPI kualitatif (tanpa target numerik): saring yang sudah ada progres', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'strategies')
        return thenable({
          data: [
            { id: 'k1', name: 'Sudah ada progres', target_numeric: null, target_unit: null },
            { id: 'k2', name: 'Customer Baru', target_numeric: null, target_unit: null },
          ],
          error: null,
        });
      if (table === 'strategy_current_values')
        return thenable({ data: [{ strategy_id: 'k1', numeric_total: 5 }], error: null });
      throw new Error(`unexpected table ${table}`);
    });
    // k1 punya nilai approved → tersaring; k2 belum → perlu dipantau (percent null = kualitatif).
    expect(await listKpiNeedsAttention()).toEqual([
      { id: 'k2', name: 'Customer Baru', percent: null, remaining: null, unit: null },
    ]);
  });

  it('[9] error strategies dipropagasi (tanpa masking partial)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'strategies') return thenable({ data: null, error: { message: 'rls' } });
      return thenable({ data: [], error: null });
    });
    await expect(listKpiNeedsAttention()).rejects.toEqual({ message: 'rls' });
  });

  it('[10] KPI bertarget numerik: di bawah target bawa % + sisa; tercapai disaring', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'strategies')
        return thenable({
          data: [
            { id: 'k3', name: 'Customer Baru', target_numeric: 5000, target_unit: 'customer' },
            { id: 'k4', name: 'Sudah Tercapai', target_numeric: 100, target_unit: 'unit' },
          ],
          error: null,
        });
      if (table === 'strategy_current_values')
        return thenable({
          // supabase-js mengembalikan numeric sebagai string → uji koersi.
          data: [
            { strategy_id: 'k3', numeric_total: '3940' },
            { strategy_id: 'k4', numeric_total: '120' },
          ],
          error: null,
        });
      throw new Error(`unexpected table ${table}`);
    });
    // k3: 3940/5000 = 79%, kurang 1.060 customer; k4: lampaui target → disaring.
    expect(await listKpiNeedsAttention()).toEqual([
      { id: 'k3', name: 'Customer Baru', percent: 79, remaining: 1060, unit: 'customer' },
    ]);
  });
});
