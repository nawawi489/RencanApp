// Data layer #35 — User & Permission. Marshalling snake_case + propagasi error (pola governance-admin).
const mockRpc = jest.fn();
jest.mock('../supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

// eslint-disable-next-line import/first
import { listUserPermissionsAdmin, setUserPermission } from '../permissions-admin';

beforeEach(() => mockRpc.mockReset());

describe('permissions-admin data layer', () => {
  it('[1] setUserPermission marshals snake_case args', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await setUserPermission({ targetUserId: 'u2', permissionKey: 'view_all_workspace', granted: true, reason: 'r' });
    expect(mockRpc).toHaveBeenCalledWith('set_user_permission', {
      p_target_user_id: 'u2',
      p_permission_key: 'view_all_workspace',
      p_granted: true,
      p_reason: 'r',
    });
  });

  it('[2] setUserPermission resolves void on success', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(
      setUserPermission({ targetUserId: 'u2', permissionKey: 'k', granted: false, reason: 'r' }),
    ).resolves.toBeUndefined();
  });

  it('[3] setUserPermission throws on RPC error (server message)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Anda tidak dapat mengubah hak akses Anda sendiri.' } });
    await expect(
      setUserPermission({ targetUserId: 'me', permissionKey: 'k', granted: true, reason: 'r' }),
    ).rejects.toEqual({ message: 'Anda tidak dapat mengubah hak akses Anda sendiri.' });
  });

  it('[4] listUserPermissionsAdmin passes target + returns rows', async () => {
    const rows = [{ key: 'view_all_workspace', label: 'Lihat Semua', granted: false, is_default: false }];
    mockRpc.mockResolvedValue({ data: rows, error: null });
    const out = await listUserPermissionsAdmin('u2');
    expect(mockRpc).toHaveBeenCalledWith('list_user_permissions_admin', { p_target_user_id: 'u2' });
    expect(out).toEqual(rows);
  });

  it('[5] listUserPermissionsAdmin returns [] when data null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await listUserPermissionsAdmin('u2')).toEqual([]);
  });

  it('[6] listUserPermissionsAdmin short-circuits empty id (no rpc)', async () => {
    expect(await listUserPermissionsAdmin('')).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('[7] listUserPermissionsAdmin throws on error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Anda tidak berwenang melihat hak akses pengguna.' } });
    await expect(listUserPermissionsAdmin('u2')).rejects.toEqual({
      message: 'Anda tidak berwenang melihat hak akses pengguna.',
    });
  });
});
