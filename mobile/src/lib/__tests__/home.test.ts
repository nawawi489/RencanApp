// Data layer Fase 3 — home.ts. Tiap section memanggil RPC server (org-tz dihitung server, CF-3);
// klien tak pernah menghitung/menyetor tanggal. Menguji pemetaan RPC, propagasi error, getOrgToday.
const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import {
  getOrgToday,
  listNearDeadline,
  listOverdueItems,
  listTodayRepeatInstances,
} from '../home';

beforeEach(() => {
  mockRpc.mockReset();
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
