// BL-19d — dua sisi klien:
//   (1) tab "Atasan" di Organisasi — garis pelaporan §34.3 item 5, sebelumnya absen total
//   (2) picker Role Template di Tambah User — template kustom bisa dibuat tapi tak pernah
//       bisa di-assign karena server selalu memungut baris seeded tertua per level
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = () => b;
      b.single = async () => ({ data: null, error: { message: 'skip' } });
      return b;
    },
  },
}));

const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  ...jest.requireActual('@/lib/cards'),
  listOrgProfiles: () => mockListOrgProfiles(),
}));

const mockCan = jest.fn();
const mockRoleLevel = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({
    profile: { id: 'u1', role_level: mockRoleLevel() },
    isLoading: false,
    can: mockCan,
  }),
}));

const mockPeople = jest.fn();
const mockSetReportingLine = jest.fn();
const mockRoleTemplates = jest.fn();
jest.mock('@/hooks/use-org-structure', () => ({
  __esModule: true,
  useOrgStructure: () => ({ departments: [], isLoading: false }),
  usePositions: () => ({ positions: [], isLoading: false }),
  useTeams: () => ({ teams: [], isLoading: false }),
  useTeamMembers: () => ({ members: [], isLoading: false }),
  useRoleTemplates: () => mockRoleTemplates(),
  useReportingLines: () => mockPeople(),
  useReportingLineActions: () => ({
    setReportingLine: mockSetReportingLine,
    isPending: false,
  }),
  useOrgActions: () => ({
    createDepartment: jest.fn(), createTeam: jest.fn(), createPosition: jest.fn(),
    createRoleTemplate: jest.fn(), assignTeamMember: jest.fn(), removeTeamMember: jest.fn(),
    setDepartmentActive: jest.fn(), isPending: false,
  }),
}));

const mockCreateUser = jest.fn();
jest.mock('@/hooks/use-users-admin', () => ({
  __esModule: true,
  useCreateUserAdmin: () => ({ createUser: mockCreateUser, isPending: false }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsOrgStructureScreen from '../settings-org-structure';
// eslint-disable-next-line import/first
import SettingsUserNewScreen from '../settings-user-new';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'Bl19dWrapper';
  return W;
}

const DEWI = { id: 'u2', full_name: 'Dewi', email: 'dewi@x.id' };
const BUDI = { id: 'u3', full_name: 'Budi', email: 'budi@x.id' };

beforeEach(() => {
  mockCan.mockReset().mockReturnValue(true);
  mockRoleLevel.mockReset().mockReturnValue('ceo');
  mockSetReportingLine.mockReset().mockResolvedValue(undefined);
  mockCreateUser.mockReset().mockResolvedValue({ user_id: 'new1', warning: null });
  mockListOrgProfiles.mockReset().mockResolvedValue([DEWI, BUDI]);
  mockPeople.mockReset().mockReturnValue({
    people: [
      { ...DEWI, is_active: true, manager_id: null, manager: null },
      { ...BUDI, is_active: true, manager_id: 'u2', manager: DEWI },
    ],
    isLoading: false,
  });
  mockRoleTemplates.mockReset().mockReturnValue({
    roleTemplates: [
      { id: 'rt-staff', name: 'Staff', level: 'staff', is_system: true },
      { id: 'rt-sales', name: 'Sales Lead', level: 'management', is_system: false },
      { id: 'rt-ceo', name: 'CEO', level: 'ceo', is_system: true },
    ],
    isLoading: false,
  });
});

describe('tab Atasan — garis pelaporan', () => {
  it('[D-01] tab hanya muncul untuk pemegang manage_users_permissions', async () => {
    // Garis pelaporan menyentuh semua orang, bukan satu unit — gerbangnya sengaja
    // disamakan dengan User & Permission, bukan manage_settings.
    mockCan.mockImplementation((key: string) => key !== 'manage_users_permissions');
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('Atasan'));
    expect(await screen.findByText(/manage_users_permissions/)).toBeTruthy();
  });

  it('[D-02] menampilkan atasan yang sudah ada dan yang belum punya', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Atasan'));

    expect(await screen.findByText('Atasan: Dewi')).toBeTruthy();
    expect(screen.getByText('Belum ada atasan')).toBeTruthy();
  });

  it('[D-03] memilih atasan mengirim userId + managerId', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Atasan'));

    fireEvent.press(await screen.findByLabelText('Atasan Dewi: belum dipilih'));
    fireEvent.press(await screen.findByLabelText('Budi'));

    await waitFor(() =>
      expect(mockSetReportingLine).toHaveBeenCalledWith({ userId: 'u2', managerId: 'u3' }),
    );
  });

  it('[D-04] melepas atasan mengirim managerId null', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Atasan'));

    // Tanpa jalur "lepas", struktur yang salah hanya bisa dibetulkan lewat DB langsung.
    fireEvent.press(await screen.findByLabelText('Atasan Budi: Dewi'));
    fireEvent.press(await screen.findByLabelText('Kosongkan pilihan'));

    await waitFor(() =>
      expect(mockSetReportingLine).toHaveBeenCalledWith({ userId: 'u3', managerId: null }),
    );
  });

  it('[D-05] menyatakan bahwa ini BUKAN pengaturan hak akses', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Atasan'));

    // Cakupan V1 deskriptif. Kalau copy ini hilang, admin akan menyangka sedang
    // memberi atasan akses ke data bawahannya — padahal tidak.
    expect(await screen.findByText(/TIDAK memberi\s+akses ke data bawahan/)).toBeTruthy();
  });
});

describe('Tambah User — Role Template kustom', () => {
  it('[D-06] template kustom ikut terkirim ke createUser', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama lengkap wajib'), 'Orang Baru');
    fireEvent.changeText(await screen.findByLabelText('Email wajib'), 'baru@x.id');
    fireEvent.changeText(await screen.findByLabelText('Password sementara wajib'), 'rahasia123');

    fireEvent.press(await screen.findByLabelText('Role Template (opsional): belum dipilih'));
    fireEvent.press(await screen.findByLabelText('Sales Lead'));
    fireEvent.press(await screen.findByLabelText('Buat User'));

    await waitFor(() =>
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ roleTemplateId: 'rt-sales' }),
      ),
    );
  });

  it('[D-07] tanpa memilih template tetap boleh — terkirim null', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama lengkap wajib'), 'Orang Baru');
    fireEvent.changeText(await screen.findByLabelText('Email wajib'), 'baru@x.id');
    fireEvent.changeText(await screen.findByLabelText('Password sementara wajib'), 'rahasia123');
    fireEvent.press(await screen.findByLabelText('Buat User'));

    await waitFor(() =>
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({ roleTemplateId: null, roleLevel: 'staff' }),
      ),
    );
  });

  it('[D-08] template ber-level CEO tidak ditawarkan', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('Role Template (opsional): belum dipilih'));

    // Server menolaknya; menawarkan pilihan yang pasti gagal itu jebakan.
    expect(await screen.findByLabelText('Sales Lead')).toBeTruthy();
    expect(screen.queryByLabelText('CEO')).toBeNull();
  });
});
