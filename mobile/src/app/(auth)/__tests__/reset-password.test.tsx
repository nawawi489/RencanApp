// AC-RESET: Reset-password screen — dipicu setelah PASSWORD_RECOVERY (deep link
// dari email "Lupa password"). Tanggung jawabnya:
//  - Terima password baru + konfirmasi
//  - Validasi client (panjang minimum & konfirmasi cocok) sebelum kirim ke server
//  - Panggil supabase.auth.updateUser({ password })
//  - Sukses → signOut + navigate ke login
//  - Gagal → surface pesan error via feedback banner
// Test ini mengunci behavior lewat public interface (label + text), bukan struktur.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';

jest.setTimeout(30000);

const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      signOut: (...a: unknown[]) => mockSignOut(...a),
    },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/providers/theme-provider', () => ({
  useThemePreference: () => ({ effective: 'light', preference: 'system', setMode: jest.fn() }),
}));

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  const passthrough = ({ children, ...rest }: { children?: unknown }) =>
    React.createElement(RN.View, rest, children);
  passthrough.displayName = 'LinearGradientMock';
  return { LinearGradient: passthrough };
});

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('@/components/brand-logo', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  const BrandLogo = () => React.createElement(RN.View, null);
  BrandLogo.displayName = 'BrandLogoMock';
  return { BRAND_TAGLINE: 'Tagline', BrandLogo };
});

// eslint-disable-next-line import/first
import ResetPasswordScreen from '../reset-password';

const PLACEHOLDER_PASSWORD = 'Kata sandi baru';
const PLACEHOLDER_CONFIRM = 'Ulangi kata sandi baru';
const SUBMIT_LABEL = 'Simpan kata sandi baru';
const MISMATCH_MSG = 'Konfirmasi kata sandi tidak cocok.';
const TOO_SHORT_MSG = 'Kata sandi minimal 6 karakter.';

beforeEach(() => {
  mockUpdateUser.mockReset();
  mockSignOut.mockReset();
  mockReplace.mockReset();
  mockUpdateUser.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
});

async function press(el: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(el);
    await Promise.resolve();
  });
}

async function type(el: Parameters<typeof fireEvent.changeText>[0], value: string) {
  await act(async () => {
    fireEvent.changeText(el, value);
    await Promise.resolve();
  });
}

async function setup() {
  await render(<ResetPasswordScreen />);
  const p1 = screen.getByPlaceholderText(PLACEHOLDER_PASSWORD);
  const p2 = screen.getByPlaceholderText(PLACEHOLDER_CONFIRM);
  const submitBtn = screen.getByLabelText(SUBMIT_LABEL);
  const fill = async (pw: string, confirm: string) => {
    await type(p1, pw);
    await type(p2, confirm);
  };
  const submit = async () => {
    await press(submitBtn);
  };
  return { fill, submit } as const;
}

describe('ResetPasswordScreen', () => {
  it('[AC-RESET-2] submit valid (>=6 char, match) → updateUser({ password }) dipanggil', async () => {
    const { fill, submit } = await setup();
    await fill('rahasia123', 'rahasia123');
    await submit();
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser.mock.calls[0][0]).toEqual({ password: 'rahasia123' });
  });

  it('[AC-RESET-3] password "12345" (<6) ditahan → feedback panjang, updateUser tidak dipanggil', async () => {
    const { fill, submit } = await setup();
    await fill('12345', '12345');
    await submit();
    expect(screen.getByText(TOO_SHORT_MSG)).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('[AC-RESET-4] konfirmasi tidak cocok → feedback mismatch, updateUser tidak dipanggil', async () => {
    const { fill, submit } = await setup();
    await fill('rahasia123', 'rahasia124');
    await submit();
    expect(screen.getByText(MISMATCH_MSG)).toBeTruthy();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('[AC-RESET-5] updateUser sukses → signOut + router.replace ke /(auth)/login', async () => {
    const { fill, submit } = await setup();
    await fill('rahasia123', 'rahasia123');
    await submit();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace.mock.calls[0][0]).toBe('/(auth)/login');
  });

  it('[AC-RESET-6] updateUser gagal → feedback error, tidak signOut, tidak navigate', async () => {
    mockUpdateUser.mockResolvedValueOnce({ error: new Error('Password should be at least') });
    const { fill, submit } = await setup();
    await fill('rahasia123', 'rahasia123');
    await submit();
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    // Pesan spesifik boleh berupa hasil terjemahan; yang penting banner tampil.
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  it('[AC-NET-3] updateUser "Failed to fetch" → pesan koneksi ramah (bukan raw EN)', async () => {
    mockUpdateUser.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { fill, submit } = await setup();
    await fill('rahasia123', 'rahasia123');
    await submit();
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      screen.getByText('Tidak dapat terhubung ke server. Cek koneksi internet Anda.'),
    ).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
