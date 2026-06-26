// Hooks #35 — query enabled-gate + mutasi + invalidation kondisional (FR-14).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

const mockSet = jest.fn();
const mockList = jest.fn();
jest.mock('@/lib/permissions-admin', () => ({
  __esModule: true,
  setUserPermission: (...a: unknown[]) => mockSet(...a),
  listUserPermissionsAdmin: (...a: unknown[]) => mockList(...a),
}));

// eslint-disable-next-line import/first
import { usePermissionActions, useUserPermissionsAdmin } from '../use-permissions-admin';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockSet.mockReset();
  mockList.mockReset();
});

describe('useUserPermissionsAdmin', () => {
  it('[P-H1] fetch saat id terisi', async () => {
    mockList.mockResolvedValue([{ key: 'k', label: 'L', granted: true, is_default: false }]);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useUserPermissionsAdmin('u2'), { wrapper });
    await waitFor(() => expect(result.current.rows.length).toBe(1));
    expect(mockList).toHaveBeenCalledWith('u2');
  });

  it('[P-H2] disabled saat id kosong (tak fetch)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useUserPermissionsAdmin(''), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('usePermissionActions', () => {
  it('[P-H3] setPermission memanggil lib + invalidate daftar target', async () => {
    mockSet.mockResolvedValue(undefined);
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => usePermissionActions('admin'), { wrapper });
    await act(async () => {
      await result.current.setPermission({ targetUserId: 'u2', permissionKey: 'k', granted: true, reason: 'r' });
    });
    expect(mockSet).toHaveBeenCalledWith({ targetUserId: 'u2', permissionKey: 'k', granted: true, reason: 'r' });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['user_permissions_admin', 'u2'] });
  });

  it('[P-H4] FR-14: TIDAK invalidate current-profile saat target != aktor', async () => {
    mockSet.mockResolvedValue(undefined);
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => usePermissionActions('admin'), { wrapper });
    await act(async () => {
      await result.current.setPermission({ targetUserId: 'u2', permissionKey: 'k', granted: true, reason: 'r' });
    });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ['current-profile', 'admin'] });
  });

  it('[P-H5] FR-14: invalidate current-profile saat target == aktor', async () => {
    mockSet.mockResolvedValue(undefined);
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => usePermissionActions('admin'), { wrapper });
    await act(async () => {
      await result.current.setPermission({ targetUserId: 'admin', permissionKey: 'k', granted: true, reason: 'r' });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['current-profile', 'admin'] });
  });

  it('[P-H6] propagasi error dari lib', async () => {
    mockSet.mockRejectedValue(new Error('Alasan perubahan hak akses wajib diisi.'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => usePermissionActions('admin'), { wrapper });
    await expect(
      result.current.setPermission({ targetUserId: 'u2', permissionKey: 'k', granted: true, reason: '' }),
    ).rejects.toThrow('Alasan perubahan hak akses wajib diisi.');
  });
});
