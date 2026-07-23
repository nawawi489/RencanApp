// Kelompok A — form Posisi/Tim tidak boleh membuang field tautan yang sudah diterima RPC.
// Regresi asal: layar memanggil `createPosition({ name })` dan `createTeam({ name,
// departmentId: null, leadId: null })` hardcoded, sehingga struktur org yang diisi user
// tersimpan tanpa relasi — gagal diam-diam, bukan error.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

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
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1', role_level: 'ceo' }, isLoading: false, can: mockCan }),
}));

const mockCreatePosition = jest.fn();
const mockCreateTeam = jest.fn();
const mockSetDepartmentActive = jest.fn();
const mockRouterPush = jest.fn();
const mockPositions = jest.fn();
const mockTeams = jest.fn();
const mockDepartments = jest.fn();
jest.mock('@/hooks/use-org-structure', () => ({
  __esModule: true,
  useOrgStructure: () => mockDepartments(),
  usePositions: () => mockPositions(),
  useTeams: () => mockTeams(),
  useRoleTemplates: () => ({ roleTemplates: [], isLoading: false }),
  useOrgActions: () => ({
    createDepartment: jest.fn(),
    createTeam: mockCreateTeam,
    createPosition: mockCreatePosition,
    createRoleTemplate: jest.fn(),
    setDepartmentActive: mockSetDepartmentActive,
    removeTeamMember: jest.fn(),
    assignTeamMember: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockRouterPush, back: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsOrgStructureScreen from '../settings-org-structure';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'LinkageWrapper';
  return W;
}

const DEPARTMENTS = [
  { id: 'd1', name: 'Operasi', description: null, is_active: true },
  { id: 'd2', name: 'Divisi Lama', description: null, is_active: false },
];

beforeEach(() => {
  mockCan.mockReset().mockReturnValue(true);
  mockCreatePosition.mockReset().mockResolvedValue('p1');
  mockCreateTeam.mockReset().mockResolvedValue('t1');
  mockSetDepartmentActive.mockReset().mockResolvedValue(undefined);
  mockRouterPush.mockReset();
  mockDepartments.mockReset().mockReturnValue({ departments: DEPARTMENTS, isLoading: false });
  mockPositions.mockReset().mockReturnValue({ positions: [], isLoading: false });
  mockTeams.mockReset().mockReturnValue({ teams: [], isLoading: false });
  mockListOrgProfiles
    .mockReset()
    .mockResolvedValue([{ id: 'u2', full_name: 'Dewi', email: 'dewi@x.id' }]);
});

async function openTab(label: string) {
  fireEvent.press(await screen.findByLabelText(label));
}

describe('tab Posisi — tautan departemen', () => {
  it('[A-01] departemen terpilih ikut terkirim ke createPosition', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Posisi');

    fireEvent.press(await screen.findByLabelText('+ Posisi Baru'));
    fireEvent.changeText(await screen.findByLabelText('Nama Posisi'), 'Sales Manager');
    fireEvent.press(await screen.findByLabelText('Departemen: belum dipilih'));
    fireEvent.press(await screen.findByLabelText('Operasi'));
    // trigger harus memantulkan pilihan sebelum simpan — kalau ini gagal, yang rusak
    // adalah picker-nya, bukan perakitan payload.
    expect(await screen.findByLabelText('Departemen: Operasi')).toBeTruthy();
    fireEvent.press(await screen.findByLabelText('Simpan Posisi'));

    await waitFor(() =>
      expect(mockCreatePosition).toHaveBeenCalledWith({ name: 'Sales Manager', departmentId: 'd1' }),
    );
  });

  it('[A-02] tanpa memilih departemen tetap boleh — terkirim null, bukan gagal', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Posisi');

    fireEvent.press(await screen.findByLabelText('+ Posisi Baru'));
    fireEvent.changeText(await screen.findByLabelText('Nama Posisi'), 'Staff Gudang');
    fireEvent.press(await screen.findByLabelText('Simpan Posisi'));

    await waitFor(() =>
      expect(mockCreatePosition).toHaveBeenCalledWith({ name: 'Staff Gudang', departmentId: null }),
    );
  });

  it('[A-03] departemen nonaktif tidak muncul sebagai opsi', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Posisi');

    fireEvent.press(await screen.findByLabelText('+ Posisi Baru'));
    fireEvent.press(await screen.findByLabelText('Departemen: belum dipilih'));

    expect(await screen.findByLabelText('Operasi')).toBeTruthy();
    expect(screen.queryByLabelText('Divisi Lama')).toBeNull();
  });

  it('[A-04] daftar posisi menampilkan departemen tertaut', async () => {
    mockPositions.mockReturnValue({
      positions: [
        { id: 'p1', name: 'Sales Manager', description: null, is_active: true, department_id: 'd1' },
        { id: 'p2', name: 'Lepas', description: null, is_active: true, department_id: null },
      ],
      isLoading: false,
    });
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Posisi');

    expect(await screen.findByText('Departemen: Operasi')).toBeTruthy();
    expect(screen.getByText('Lepas')).toBeTruthy();
  });
});

describe('tab Tim — tautan departemen + lead', () => {
  it('[A-05] departemen dan lead terpilih ikut terkirim ke createTeam', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Tim');

    fireEvent.press(await screen.findByLabelText('+ Tim Baru'));
    fireEvent.changeText(await screen.findByLabelText('Nama Tim'), 'Squad Mobile');

    fireEvent.press(await screen.findByLabelText('Departemen: belum dipilih'));
    fireEvent.press(await screen.findByLabelText('Operasi'));

    fireEvent.press(await screen.findByLabelText('Lead Tim: belum dipilih'));
    fireEvent.press(await screen.findByLabelText('Dewi'));

    fireEvent.press(await screen.findByLabelText('Simpan Tim'));

    await waitFor(() =>
      expect(mockCreateTeam).toHaveBeenCalledWith({
        name: 'Squad Mobile',
        departmentId: 'd1',
        leadId: 'u2',
      }),
    );
  });

  it('[A-06] daftar tim menampilkan departemen dan lead tertaut', async () => {
    mockTeams.mockReturnValue({
      teams: [
        {
          id: 't1',
          name: 'Squad Mobile',
          description: null,
          is_active: true,
          department_id: 'd1',
          lead_id: 'u2',
        },
      ],
      isLoading: false,
    });
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Tim');

    expect(await screen.findByText('Departemen: Operasi · Lead: Dewi')).toBeTruthy();
  });

  it('[A-07] pilihan tautan tidak lengket ke entri berikutnya setelah simpan', async () => {
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Tim');

    fireEvent.press(await screen.findByLabelText('+ Tim Baru'));
    fireEvent.changeText(await screen.findByLabelText('Nama Tim'), 'Squad A');
    fireEvent.press(await screen.findByLabelText('Departemen: belum dipilih'));
    fireEvent.press(await screen.findByLabelText('Operasi'));
    fireEvent.press(await screen.findByLabelText('Simpan Tim'));
    await waitFor(() => expect(mockCreateTeam).toHaveBeenCalledTimes(1));

    fireEvent.press(await screen.findByLabelText('+ Tim Baru'));
    fireEvent.changeText(await screen.findByLabelText('Nama Tim'), 'Squad B');
    fireEvent.press(await screen.findByLabelText('Simpan Tim'));

    await waitFor(() =>
      expect(mockCreateTeam).toHaveBeenLastCalledWith({
        name: 'Squad B',
        departmentId: null,
        leadId: null,
      }),
    );
  });
});

// ---------------------------------------------------------------- Kelompok B
// Departemen punya kolom `is_active` sejak 0014 dan copy admin menjanjikan
// "Nonaktifkan tanpa menghapus", tapi tidak pernah ada jalur tulisnya (0092).
describe('tab Departemen — nonaktif/aktif', () => {
  it('[B-01] Nonaktifkan minta konfirmasi dulu, lalu kirim active=false', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('Nonaktifkan Operasi'));
    expect(mockSetDepartmentActive).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Nonaktifkan')?.onPress?.();

    await waitFor(() =>
      expect(mockSetDepartmentActive).toHaveBeenCalledWith({ departmentId: 'd1', active: false }),
    );
    alertSpy.mockRestore();
  });

  it('[B-02] konfirmasi menyebut jumlah Posisi/Tim tertaut dan menjanjikan tautan tidak diputus', async () => {
    mockPositions.mockReturnValue({
      positions: [{ id: 'p1', name: 'Sales', description: null, is_active: true, department_id: 'd1' }],
      isLoading: false,
    });
    mockTeams.mockReturnValue({
      teams: [{ id: 't1', name: 'Squad', description: null, is_active: true, department_id: 'd1', lead_id: null }],
      isLoading: false,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('Nonaktifkan Operasi'));

    const body = alertSpy.mock.calls[0][1] as string;
    expect(body).toContain('2 Posisi/Tim');
    // Janji "tidak diputus" harus muncul di UI, bukan hanya di komentar migrasi —
    // ini satu-satunya tempat user bisa tahu riwayatnya aman sebelum menekan.
    expect(body).toMatch(/TIDAK akan diputus/i);
    alertSpy.mockRestore();
  });

  it('[B-03] departemen nonaktif menawarkan Aktifkan kembali, langsung tanpa dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('Aktifkan kembali Divisi Lama'));

    await waitFor(() =>
      expect(mockSetDepartmentActive).toHaveBeenCalledWith({ departmentId: 'd2', active: true }),
    );
    // Mengaktifkan kembali bukan aksi destruktif — tidak perlu gerbang konfirmasi.
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('tab Tim — buka anggota', () => {
  it('[B-04] baris Tim bisa ditekan → rute anggota Tim', async () => {
    mockTeams.mockReturnValue({
      teams: [{ id: 't1', name: 'Squad Mobile', description: null, is_active: true, department_id: null, lead_id: null }],
      isLoading: false,
    });
    await render(<SettingsOrgStructureScreen />, { wrapper: wrapper() });
    await openTab('Tim');

    fireEvent.press(await screen.findByLabelText('Buka Tim Squad Mobile'));
    expect(mockRouterPush).toHaveBeenCalledWith('/settings-team/t1');
  });
});
