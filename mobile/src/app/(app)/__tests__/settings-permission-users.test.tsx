// UI #35 — settings-permission-users. Gate + list→drill + locked default + modal reason + grant/revoke.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  __esModule: true,
  listOrgProfiles: () => mockListOrgProfiles(),
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'me' }, isLoading: false, can: mockCan }),
}));

const mockUseUserPerms = jest.fn();
const mockSetPermission = jest.fn();
jest.mock('@/hooks/use-permissions-admin', () => ({
  __esModule: true,
  useUserPermissionsAdmin: (...a: unknown[]) => mockUseUserPerms(...a),
  usePermissionActions: () => ({ setPermission: mockSetPermission, isPending: false }),
}));

jest.mock('expo-router', () => ({ __esModule: true, Stack: { Screen: () => null } }));

// eslint-disable-next-line import/first
import SettingsPermissionUsersScreen from '../settings-permission-users';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TW';
  return W;
}

const ROWS = [
  { key: 'create_strategy', label: 'Buat Strategy', granted: true, is_default: true },
  { key: 'view_all_workspace', label: 'Lihat Semua Workspace', granted: false, is_default: false },
  { key: 'manage_others_cards', label: 'Kelola Card Orang Lain', granted: true, is_default: false },
];

beforeEach(() => {
  mockListOrgProfiles.mockReset();
  mockCan.mockReset();
  mockUseUserPerms.mockReset();
  mockSetPermission.mockReset();
  mockCan.mockReturnValue(true);
  mockListOrgProfiles.mockResolvedValue([
    { id: 'me', full_name: 'Aku', email: 'me@n.id' },
    { id: 'u2', full_name: 'Rina Jaya', email: 'rina@n.id' },
  ]);
  mockUseUserPerms.mockReturnValue({ rows: ROWS, isLoading: false, isError: false });
  mockSetPermission.mockResolvedValue(undefined);
});

async function drillIntoRina() {
  await render(<SettingsPermissionUsersScreen />, { wrapper: wrapper() });
  await act(async () => {
    fireEvent.press(await screen.findByLabelText('Atur hak akses Rina Jaya'));
  });
}

describe('SettingsPermissionUsersScreen', () => {
  it('[P-UI-01] tanpa manage_users_permissions → AccessDenied', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsPermissionUsersScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Anda tidak memiliki akses')).toBeTruthy();
  });

  it('[P-UI-02] daftar anggota tanpa diri sendiri; drill → render toggle', async () => {
    await render(<SettingsPermissionUsersScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Rina Jaya')).toBeTruthy();
    expect(screen.queryByText('Aku')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Atur hak akses Rina Jaya'));
    });
    expect(screen.getByText('Lihat Semua Workspace')).toBeTruthy();
  });

  it('[P-UI-03] default-role toggle terkunci (disabled)', async () => {
    await drillIntoRina();
    const sw = screen.getByLabelText('Buat Strategy');
    expect(sw.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(sw);
    // tak ada modal terbuka (locked).
    expect(screen.queryByText('Beri Hak Akses')).toBeNull();
  });

  it('[P-UI-04] grant tanpa reason → error, setPermission tak dipanggil', async () => {
    await drillIntoRina();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lihat Semua Workspace'));
    });
    expect(screen.getByText('Beri Hak Akses')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Konfirmasi'));
    });
    expect(screen.getByText('Alasan perubahan hak akses wajib diisi.')).toBeTruthy();
    expect(mockSetPermission).not.toHaveBeenCalled();
  });

  it('[P-UI-05] grant valid → setPermission(granted:true) dengan reason', async () => {
    await drillIntoRina();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lihat Semua Workspace'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Alasan'), 'butuh akses lintas tim');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Konfirmasi'));
    });
    expect(mockSetPermission).toHaveBeenCalledWith({
      targetUserId: 'u2',
      permissionKey: 'view_all_workspace',
      granted: true,
      reason: 'butuh akses lintas tim',
    });
  });

  it('[P-UI-06] revoke = modal danger "Cabut" → setPermission(granted:false)', async () => {
    await drillIntoRina();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Kelola Card Orang Lain'));
    });
    expect(screen.getByText('Cabut Hak Akses')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Alasan'), 'tidak lagi relevan');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Cabut'));
    });
    expect(mockSetPermission).toHaveBeenCalledWith({
      targetUserId: 'u2',
      permissionKey: 'manage_others_cards',
      granted: false,
      reason: 'tidak lagi relevan',
    });
  });

  it('[P-UI-07] error server → pesan inline di modal', async () => {
    mockSetPermission.mockRejectedValue(new Error('Hanya CEO yang dapat memberikan hak Kelola User & Permission.'));
    await drillIntoRina();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lihat Semua Workspace'));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Alasan'), 'coba');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Konfirmasi'));
    });
    expect(await screen.findByText(/Hanya CEO/)).toBeTruthy();
  });
});
