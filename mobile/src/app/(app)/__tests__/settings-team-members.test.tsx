// Kelompok B — layar anggota Tim (BL-19b). `assignTeamMember` sudah dirangkai lib→hook
// sejak Fase 8 tapi tidak pernah punya pemanggil, jadi Tim selalu kosong sejak dibuat.
// `removeTeamMember` (0092) menutup pintu satu arahnya.
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

const mockAssignTeamMember = jest.fn();
const mockRemoveTeamMember = jest.fn();
const mockMembers = jest.fn();
jest.mock('@/hooks/use-org-structure', () => ({
  __esModule: true,
  useTeams: () => ({
    teams: [{ id: 't1', name: 'Squad Mobile', description: null, is_active: true }],
    isLoading: false,
  }),
  useTeamMembers: () => mockMembers(),
  useOrgActions: () => ({
    assignTeamMember: mockAssignTeamMember,
    removeTeamMember: mockRemoveTeamMember,
    isPending: false,
  }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 't1' }),
}));

// eslint-disable-next-line import/first
import SettingsTeamMembersScreen from '../settings-team/[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TeamMembersWrapper';
  return W;
}

const DEWI = { id: 'u2', full_name: 'Dewi', email: 'dewi@x.id' };
const BUDI = { id: 'u3', full_name: 'Budi', email: 'budi@x.id' };

beforeEach(() => {
  mockCan.mockReset().mockReturnValue(true);
  mockAssignTeamMember.mockReset().mockResolvedValue('tm1');
  mockRemoveTeamMember.mockReset().mockResolvedValue(undefined);
  mockMembers.mockReset().mockReturnValue({ members: [], isLoading: false });
  mockListOrgProfiles.mockReset().mockResolvedValue([DEWI, BUDI]);
});

describe('layar anggota Tim', () => {
  it('[B-05] tanpa permission manage_teams → akses ditolak', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsTeamMembersScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
  });

  it('[B-06] anggota ditampilkan dengan nama orangnya, bukan UUID', async () => {
    mockMembers.mockReturnValue({
      members: [{ id: 'tm1', profile_id: 'u2', role_in_team: 'Koordinator', profiles: DEWI }],
      isLoading: false,
    });
    await render(<SettingsTeamMembersScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('Dewi')).toBeTruthy();
    expect(screen.getByText('Peran: Koordinator')).toBeTruthy();
    // daftar berisi UUID telanjang tidak bisa dipakai memutuskan siapa yang dilepas.
    expect(screen.queryByText('u2')).toBeNull();
  });

  it('[B-07] tambah anggota mengirim teamId, profileId, dan peran', async () => {
    await render(<SettingsTeamMembersScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('+ Anggota Baru'));
    fireEvent.press(await screen.findByLabelText('Anggota: belum dipilih'));
    fireEvent.press(await screen.findByLabelText('Dewi'));
    fireEvent.changeText(await screen.findByLabelText('Peran di Tim'), 'Koordinator');
    fireEvent.press(await screen.findByLabelText('Tambahkan ke Tim'));

    await waitFor(() =>
      expect(mockAssignTeamMember).toHaveBeenCalledWith({
        teamId: 't1',
        profileId: 'u2',
        roleInTeam: 'Koordinator',
      }),
    );
  });

  it('[B-08] orang yang sudah jadi anggota tidak ditawarkan lagi di picker', async () => {
    mockMembers.mockReturnValue({
      members: [{ id: 'tm1', profile_id: 'u2', role_in_team: null, profiles: DEWI }],
      isLoading: false,
    });
    await render(<SettingsTeamMembersScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('+ Anggota Baru'));
    fireEvent.press(await screen.findByLabelText('Anggota: belum dipilih'));

    // RPC menolak duplikat lewat unique(team_id, profile_id) — menawarkan pilihan
    // yang pasti gagal itu jebakan, bukan kelonggaran.
    expect(await screen.findByLabelText('Budi')).toBeTruthy();
    expect(screen.queryByLabelText('Dewi')).toBeNull();
  });

  it('[B-09] Lepas minta konfirmasi dulu, lalu kirim removeTeamMember', async () => {
    mockMembers.mockReturnValue({
      members: [{ id: 'tm1', profile_id: 'u2', role_in_team: null, profiles: DEWI }],
      isLoading: false,
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SettingsTeamMembersScreen />, { wrapper: wrapper() });

    fireEvent.press(await screen.findByLabelText('Lepas Dewi dari Tim'));
    expect(mockRemoveTeamMember).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Lepas')?.onPress?.();

    await waitFor(() =>
      expect(mockRemoveTeamMember).toHaveBeenCalledWith({ teamId: 't1', profileId: 'u2' }),
    );
    alertSpy.mockRestore();
  });
});
