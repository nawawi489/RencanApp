// Kelompok C — layar Profil Saya & Profil Organisasi (BL-19c). Keduanya jalur tulis
// pertama untuk `profiles` dan `organizations` di seluruh `src/`.
//
// Yang dijaga di sini bukan "form bisa submit", melainkan dua hal yang gampang lepas:
//   • Kolom yang boleh berubah tetap SEMPIT. Migrasi 0093 mencabut grant tulis `profiles`
//     justru karena RLS tak bisa membatasi kolom; kalau layar ini menumbuhkan input untuk
//     role/organisasi, penyempitan di server jadi satu-satunya penahan yang tersisa.
//   • Zona waktu yang tersimpan tidak boleh hilang dari picker. Picker yang diam-diam
//     membuang nilai di luar daftar akan menimpanya saat disimpan — kehilangan data senyap.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockProfile = jest.fn();
const mockCan = jest.fn();
const mockUpdateOwnProfile = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: mockProfile(), isLoading: false, can: mockCan }),
  useUpdateOwnProfile: () => ({ updateOwnProfile: mockUpdateOwnProfile, isPending: false }),
}));

const mockUpdateOrganization = jest.fn();
jest.mock('@/hooks/use-org-structure', () => ({
  __esModule: true,
  useOrganizationActions: () => ({
    updateOrganization: mockUpdateOrganization,
    isPending: false,
  }),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsProfileScreen from '../settings-profile';
// eslint-disable-next-line import/first
import SettingsOrganizationScreen from '../settings-organization';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'SelfServiceWrapper';
  return W;
}

const PROFILE = {
  id: 'u1',
  full_name: 'Siti',
  email: 'siti@rencana.id',
  organization_id: 'org1',
  role_level: 'ceo',
  role_name: 'CEO',
  org_name: 'PT Rencana',
  org_timezone: 'Asia/Jakarta',
  created_at: null,
  permissionKeys: [],
};

beforeEach(() => {
  mockProfile.mockReset().mockReturnValue(PROFILE);
  mockCan.mockReset().mockReturnValue(true);
  mockUpdateOwnProfile.mockReset().mockResolvedValue(undefined);
  mockUpdateOrganization.mockReset().mockResolvedValue(undefined);
  mockBack.mockReset();
});

describe('Profil Saya', () => {
  it('[C-01] nama tersimpan ter-trim', async () => {
    await render(<SettingsProfileScreen />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama lengkap wajib'), '  Siti Rahmawati  ');
    fireEvent.press(await screen.findByLabelText('Simpan'));

    await waitFor(() => expect(mockUpdateOwnProfile).toHaveBeenCalledWith('Siti Rahmawati'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('[C-02] nama kosong tidak dikirim ke server', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SettingsProfileScreen />, { wrapper: wrapper() });

    // Whitespace, bukan string kosong: `trim` di klien mencerminkan `trim` di RPC, jadi
    // nama tak terlihat tidak pernah sampai ke DB maupun ke round-trip yang sia-sia.
    fireEvent.changeText(await screen.findByLabelText('Nama lengkap wajib'), '   ');
    fireEvent.press(await screen.findByLabelText('Simpan'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockUpdateOwnProfile).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('[C-03] nama >120 karakter ditolak tanpa memanggil server', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SettingsProfileScreen />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama lengkap wajib'), 'x'.repeat(121));
    fireEvent.press(await screen.findByLabelText('Simpan'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockUpdateOwnProfile).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('[C-04] email / role / organisasi tampil tapi tidak punya input', async () => {
    await render(<SettingsProfileScreen />, { wrapper: wrapper() });

    expect(await screen.findByText('siti@rencana.id')).toBeTruthy();
    expect(screen.getByText('CEO')).toBeTruthy();
    expect(screen.getByText('PT Rencana')).toBeTruthy();
    // `update_own_profile` sengaja hanya menerima full_name. Input untuk salah satu kolom
    // ini berarti ada jalur tulis yang server tidak sediakan — gagal diam-diam.
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Role')).toBeNull();
    expect(screen.queryByLabelText('Organisasi')).toBeNull();
  });
});

describe('Profil Organisasi', () => {
  it('[C-05] tanpa manage_settings → akses ditolak, nol field', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsOrganizationScreen />, { wrapper: wrapper() });

    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
    expect(screen.queryByLabelText('Nama Organisasi wajib')).toBeNull();
  });

  it('[C-06] simpan mengirim nama ter-trim + zona waktu', async () => {
    await render(<SettingsOrganizationScreen />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama Organisasi wajib'), '  PT Rencana Nusantara ');
    fireEvent.press(await screen.findByLabelText('Simpan'));

    await waitFor(() =>
      expect(mockUpdateOrganization).toHaveBeenCalledWith({
        name: 'PT Rencana Nusantara',
        timezone: 'Asia/Jakarta',
      }),
    );
  });

  it('[C-07] zona tersimpan di luar daftar tetap muncul sebagai opsi', async () => {
    mockProfile.mockReturnValue({ ...PROFILE, org_timezone: 'Asia/Kuala_Lumpur' });
    await render(<SettingsOrganizationScreen />, { wrapper: wrapper() });

    // Server menerima zona apa pun dari katalog Postgres; picker yang hanya kenal 3 zona
    // Indonesia tidak boleh jadi alasan nilai tersimpan lenyap saat layar dibuka.
    expect(await screen.findByLabelText('Zona waktu wajib: Asia/Kuala_Lumpur')).toBeTruthy();

    fireEvent.press(await screen.findByLabelText('Simpan'));
    await waitFor(() =>
      expect(mockUpdateOrganization).toHaveBeenCalledWith({
        name: 'PT Rencana',
        timezone: 'Asia/Kuala_Lumpur',
      }),
    );
  });

  it('[C-08] nama Organisasi kosong tidak dikirim ke server', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SettingsOrganizationScreen />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama Organisasi wajib'), '  ');
    fireEvent.press(await screen.findByLabelText('Simpan'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockUpdateOrganization).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
