// Tambah User — gate + validasi form + guard role C-Level + submit + error server inline.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockCan = jest.fn();
const mockProfile: { id: string; role_level: string } = { id: 'me', role_level: 'management' };
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: mockProfile, isLoading: false, can: mockCan }),
}));

const mockCreateUser = jest.fn();
jest.mock('@/hooks/use-users-admin', () => ({
  __esModule: true,
  useCreateUserAdmin: () => ({ createUser: mockCreateUser, isPending: false }),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack }),
}));

// eslint-disable-next-line import/first
import SettingsUserNewScreen from '../settings-user-new';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TW';
  return W;
}

const alertSpy = jest.spyOn(Alert, 'alert');

beforeEach(() => {
  mockCan.mockReset();
  mockCreateUser.mockReset();
  mockBack.mockReset();
  alertSpy.mockReset();
  mockCan.mockReturnValue(true);
  mockProfile.role_level = 'management';
  mockCreateUser.mockResolvedValue({ user_id: 'u-new', warning: null });
});

async function fillValidForm() {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Nama lengkap wajib'),'Rina Jaya');
    fireEvent.changeText(screen.getByLabelText('Email wajib'),'Rina@N.ID');
    fireEvent.changeText(screen.getByLabelText('Password sementara wajib'),'rahasia123');
  });
}

describe('SettingsUserNewScreen', () => {
  it('[U-UI-01] tanpa manage_users_permissions → AccessDenied', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Anda tidak memiliki akses')).toBeTruthy();
  });

  it('[U-UI-02] nama kosong → alert, createUser tak dipanggil', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Belum lengkap', 'Nama lengkap wajib diisi.');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('[U-UI-03] email tidak valid → alert, createUser tak dipanggil', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama lengkap wajib'),'Rina');
      fireEvent.changeText(screen.getByLabelText('Email wajib'),'bukan-email');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Email tidak valid', expect.any(String));
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('[U-UI-04] password < 8 karakter → alert, createUser tak dipanggil', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama lengkap wajib'),'Rina');
      fireEvent.changeText(screen.getByLabelText('Email wajib'),'rina@n.id');
      fireEvent.changeText(screen.getByLabelText('Password sementara wajib'),'pendek');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(alertSpy).toHaveBeenCalledWith('Password terlalu pendek', expect.any(String));
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('[U-UI-05] non-CEO: pill C-Level terkunci (disabled)', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    const pill = screen.getByLabelText('Role C-Level');
    expect(pill.props.accessibilityState.disabled).toBe(true);
  });

  it('[U-UI-06] CEO: pill C-Level bisa dipilih → payload roleLevel c_level', async () => {
    mockProfile.role_level = 'ceo';
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await fillValidForm();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Role C-Level'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'rina@n.id',
      password: 'rahasia123',
      fullName: 'Rina Jaya',
      roleLevel: 'c_level',
      // BL-19d: payload kini selalu membawa roleTemplateId; null = pakai template bawaan
      // sesuai Role — perilaku lama, dinyatakan eksplisit alih-alih tersirat lewat absennya field.
      roleTemplateId: null,
    });
  });

  it('[U-UI-07] submit valid → createUser + alert sukses + kembali', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await fillValidForm();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: 'rina@n.id',
      password: 'rahasia123',
      fullName: 'Rina Jaya',
      roleLevel: 'staff',
      roleTemplateId: null,
    });
    expect(alertSpy).toHaveBeenCalledWith('User dibuat', expect.stringContaining('rina@n.id'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('[U-UI-09] sukses dengan warning penempatan → alert beda + banner inline, tidak kembali', async () => {
    mockCreateUser.mockResolvedValue({
      user_id: 'u-new',
      warning: {
        code: 'role_template_missing',
        message: 'User dibuat, tetapi penempatan organisasi gagal — periksa manual di User & Permission.',
      },
    });
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await fillValidForm();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(alertSpy).toHaveBeenCalledWith('User dibuat — perlu diperiksa', expect.stringContaining('rina@n.id'));
    expect(alertSpy).not.toHaveBeenCalledWith('User dibuat', expect.any(String));
    expect(
      await screen.findByText(
        'User dibuat, tetapi penempatan organisasi gagal — periksa manual di User & Permission.',
      ),
    ).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('[U-UI-08] error server → pesan domain inline, tidak kembali', async () => {
    mockCreateUser.mockRejectedValue(new Error('Email ini sudah terdaftar sebagai user.'));
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await fillValidForm();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(await screen.findByText('Email ini sudah terdaftar sebagai user.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
