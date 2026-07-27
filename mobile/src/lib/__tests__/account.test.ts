// S5-8 — lib akun (permintaan hapus + anonimisasi + ekspor data).
// Passthrough tipis ke RPC — assertion menahan kontrak argumen + error path.
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

// eslint-disable-next-line import/first
import { anonymizeAccount, exportMyData, requestAccountDeletion } from '../account';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('requestAccountDeletion', () => {
  it('[ACC-01] tanpa reason → kirim p_reason: null', async () => {
    mockRpc.mockResolvedValue({ data: 'req-id-1', error: null });
    const id = await requestAccountDeletion();
    expect(mockRpc).toHaveBeenCalledWith('request_account_deletion', { p_reason: undefined });
    expect(id).toBe('req-id-1');
  });

  it('[ACC-02] reason terisi → diteruskan apa adanya', async () => {
    mockRpc.mockResolvedValue({ data: 'req-id-2', error: null });
    await requestAccountDeletion('Sudah tidak bekerja');
    expect(mockRpc).toHaveBeenCalledWith('request_account_deletion', {
      p_reason: 'Sudah tidak bekerja',
    });
  });

  it('[ACC-03] RPC error → di-throw ke pemanggil', async () => {
    const err = new Error('Tidak terautentikasi');
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(requestAccountDeletion()).rejects.toBe(err);
  });
});

describe('anonymizeAccount', () => {
  it('[ACC-04] kirim p_target_user_id + p_reason ke RPC anonymize_account', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await anonymizeAccount('user-x', 'Resign');
    expect(mockRpc).toHaveBeenCalledWith('anonymize_account', {
      p_target_user_id: 'user-x',
      p_reason: 'Resign',
    });
  });

  it('[ACC-05] tanpa reason → p_reason: null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await anonymizeAccount('user-y');
    expect(mockRpc).toHaveBeenCalledWith('anonymize_account', {
      p_target_user_id: 'user-y',
      p_reason: undefined,
    });
  });

  it('[ACC-06] RPC error → di-throw', async () => {
    const err = new Error('Tidak berwenang');
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(anonymizeAccount('user-z')).rejects.toBe(err);
  });
});

describe('exportMyData', () => {
  it('[ACC-07] kembalikan JSONB apa adanya dari RPC export_my_data', async () => {
    const payload = { profile: { id: 'u-1' }, activity_summary: { count: 3 } };
    mockRpc.mockResolvedValue({ data: payload, error: null });
    const out = await exportMyData();
    expect(mockRpc).toHaveBeenCalledWith('export_my_data');
    expect(out).toBe(payload);
  });

  it('[ACC-08] RPC error → di-throw (bukan silent null)', async () => {
    const err = new Error('boom');
    mockRpc.mockResolvedValue({ data: null, error: err });
    await expect(exportMyData()).rejects.toBe(err);
  });
});
