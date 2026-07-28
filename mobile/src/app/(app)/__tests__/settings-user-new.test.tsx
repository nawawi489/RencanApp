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

  // S7-3: validasi field pindah dari Alert.alert(...) ke error inline per-field —
  // Alert lama tidak menunjuk field mana yang salah, dan pesannya hilang saat ditutup.
  it('[U-UI-02] nama kosong → error inline "Nama lengkap wajib diisi.", createUser tak dipanggil', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(screen.getByText('Nama lengkap wajib diisi.')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalledWith('Belum lengkap', expect.any(String));
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('[U-UI-03] email tidak valid → error inline "Periksa kembali format alamat email."', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama lengkap wajib'),'Rina');
      fireEvent.changeText(screen.getByLabelText('Email wajib'),'bukan-email');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(screen.getByText('Periksa kembali format alamat email.')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalledWith('Email tidak valid', expect.any(String));
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('[U-UI-04] password < 8 karakter → error inline "Password sementara minimal 8 karakter."', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Nama lengkap wajib'),'Rina');
      fireEvent.changeText(screen.getByLabelText('Email wajib'),'rina@n.id');
      fireEvent.changeText(screen.getByLabelText('Password sementara wajib'),'pendek');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(screen.getByText('Password sementara minimal 8 karakter.')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalledWith('Password terlalu pendek', expect.any(String));
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  // S7-3: submit dengan tiga field kosong menampilkan TIGA error sekaligus, bukan satu-per-satu
  // (pola Alert lama exit di error pertama). Admin melihat semua yang salah sekaligus.
  it('[U-UI-02b] tiga field kosong → tiga pesan error inline sekaligus', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat User'));
    });
    expect(screen.getByText('Nama lengkap wajib diisi.')).toBeTruthy();
    expect(screen.getByText('Periksa kembali format alamat email.')).toBeTruthy();
    expect(screen.getByText('Password sementara minimal 8 karakter.')).toBeTruthy();
  });

  // S7-4: "Password sementara" ter-render sebagai teks biasa sebelum sprint 7 — terbaca
  // siapa pun di dekat layar admin. Sekarang secureTextEntry aktif; toggle reveal built-in
  // dari LabeledInput (label a11y sesuai state).
  it('[U-UI-04b] password sementara di-mask (secureTextEntry) + tombol reveal a11y', async () => {
    await render(<SettingsUserNewScreen />, { wrapper: wrapper() });
    const passwordInput = screen.getByLabelText('Password sementara wajib');
    expect(passwordInput.props.secureTextEntry).toBe(true);
    // Reveal tersedia dan mengumumkan state; menekan sekali harus mengubah label a11y.
    const revealBtn = screen.getByLabelText('Tampilkan kata sandi');
    await act(async () => {
      fireEvent.press(revealBtn);
    });
    expect(screen.getByLabelText('Sembunyikan kata sandi')).toBeTruthy();
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
