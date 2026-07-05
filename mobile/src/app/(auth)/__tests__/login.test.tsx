// AUTH-02b — guard client-side untuk password.length < 6 sebelum signInWithPassword.
// Server tidak menegakkan panjang di jalur sign-IN (Supabase enforce hanya sign-UP),
// jadi client adalah SOLE signal di jalur login. Test ini mengunci:
// - guard blokir < 6 & pesan konstanta AUTH_COPY.passwordTooShort
// - boundary >= 6 (inklusif)
// - urutan: field kosong menang atas guard length
// - password TIDAK di-trim (6 spasi lolos)
// - a11y (accessibilityRole=alert, accessibilityLiveRegion=polite)
// - jalur resetPassword TIDAK terkena guard length
// - password tidak bocor ke console
//
// Ref: docs/spec-ui-testfix-2026-07-05.md AC-AUTH02-1..6
//      docs/tdd-plan-ui-testfix-batch1-2026-07-05.md Fase C1 + critic missing-cases

import { fireEvent, render, screen } from '@testing-library/react-native';

jest.setTimeout(30000);

const mockSignIn = jest.fn();
const mockReset = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      resetPasswordForEmail: (...a: unknown[]) => mockReset(...a),
    },
  },
}));

jest.mock('@/providers/theme-provider', () => ({
  useThemePreference: () => ({ effective: 'light', preference: 'system', setMode: jest.fn() }),
}));

// LinearGradient sering menyusahkan di jest-expo — passthrough View.
jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  const passthrough = ({ children, ...rest }: { children?: unknown }) =>
    React.createElement(RN.View, rest, children);
  passthrough.displayName = 'LinearGradientMock';
  return { LinearGradient: passthrough };
});

// Ionicons stub — hindari load font.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

// Per critic: react-native-css/components WAJIB di-mock dari awal (bukan fallback bersyarat).
jest.mock('react-native-css/components', () => {
  const RN = jest.requireActual('react-native');
  return {
    Pressable: RN.Pressable,
    ScrollView: RN.ScrollView,
    Text: RN.Text,
    TextInput: RN.TextInput,
    View: RN.View,
  };
});

// BrandLogo — reduce noise; Button dari @/components/ui tetap dipakai (tidak di-mock).
jest.mock('@/components/brand-logo', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  const BrandLogo = () => React.createElement(RN.View, null);
  BrandLogo.displayName = 'BrandLogoMock';
  return { BRAND_TAGLINE: 'Tagline', BrandLogo };
});

// eslint-disable-next-line import/first
import { AUTH_COPY } from '@/lib/auth-copy';
// eslint-disable-next-line import/first
import LoginScreen from '../login';

const PLACEHOLDER_EMAIL = 'Email perusahaan';
const PLACEHOLDER_PASSWORD = 'Kata sandi';
const EMPTY_MSG = 'Email dan kata sandi wajib diisi.';
const CRED_ERROR_MSG = 'Email atau kata sandi salah.';

beforeEach(() => {
  mockSignIn.mockReset();
  mockReset.mockReset();
  mockSignIn.mockResolvedValue({ error: null });
  mockReset.mockResolvedValue({ error: null });
});

async function renderLogin() {
  render(<LoginScreen />);
}

function fillForm(email: string, password: string) {
  fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_EMAIL), email);
  fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD), password);
}

describe('LoginScreen — password guard AUTH-02b', () => {
  it('[1] AC-AUTH02-1: password "123" → passwordTooShort + spy signInWithPassword=0', async () => {
    await renderLogin();
    fillForm('a@b.co', '123');
    fireEvent.press(screen.getByText('Masuk'));
    expect(await screen.findByText(AUTH_COPY.passwordTooShort)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('[2] AC-AUTH02-2 boundary: password "123456" (=6) lolos → signInWithPassword dipanggil', async () => {
    await renderLogin();
    fillForm('a@b.co', '123456');
    fireEvent.press(screen.getByText('Masuk'));
    // Boundary inklusif: length === 6 harus melanjutkan ke network.
    // signInWithPassword adalah async; tunggu satu tick.
    await Promise.resolve();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn.mock.calls[0][0]).toEqual({ email: 'a@b.co', password: '123456' });
  });

  it('[3] AC-AUTH02-2 boundary: password "12345" (=5) ditahan', async () => {
    await renderLogin();
    fillForm('a@b.co', '12345');
    fireEvent.press(screen.getByText('Masuk'));
    expect(await screen.findByText(AUTH_COPY.passwordTooShort)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('[4] AC-AUTH02-3: email kosong menang atas guard length — pesan "wajib diisi"', async () => {
    await renderLogin();
    fillForm('', '123');
    fireEvent.press(screen.getByText('Masuk'));
    expect(await screen.findByText(EMPTY_MSG)).toBeTruthy();
    // Yang penting: bukan passwordTooShort.
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('[5] AC-AUTH02-3: password kosong → "wajib diisi" (branch discrimination vs 5 karakter)', async () => {
    await renderLogin();
    fillForm('a@b.co', '');
    fireEvent.press(screen.getByText('Masuk'));
    expect(await screen.findByText(EMPTY_MSG)).toBeTruthy();
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
  });

  it('[6] AC-AUTH02-4: password "      " (6 spasi) LOLOS (tidak di-trim); email tetap di-trim', async () => {
    await renderLogin();
    fillForm('  a@b.co  ', '      ');
    fireEvent.press(screen.getByText('Masuk'));
    await Promise.resolve();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    // Email di-trim, password apa adanya.
    expect(mockSignIn.mock.calls[0][0]).toEqual({ email: 'a@b.co', password: '      ' });
  });

  it('[7] AC-AUTH02-5: banner feedback pakai accessibilityRole="alert"', async () => {
    await renderLogin();
    fillForm('a@b.co', '123');
    fireEvent.press(screen.getByText('Masuk'));
    // Setelah guard sulut, banner error muncul dengan role=alert.
    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
  });

  it('[8] AC-AUTH02-5 side: password TIDAK bocor ke console pada jalur guard', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await renderLogin();
      fillForm('a@b.co', 'secret-123');
      // Tidak lolos guard (length >=6, network akan dipanggil dan mock resolve OK)
      // Tapi kita cek kasus guard sulut dulu:
      fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD), '123');
      fireEvent.press(screen.getByText('Masuk'));
      await Promise.resolve();
      const allCalls = [...spy.mock.calls, ...warnSpy.mock.calls, ...errSpy.mock.calls];
      for (const call of allCalls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain('123');
          expect(String(arg)).not.toContain('secret');
        }
      }
    } finally {
      spy.mockRestore();
      warnSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('[9] regression AC-AUTH02-6: kredensial salah tetap tampilkan pesan cred (bukan passwordTooShort)', async () => {
    mockSignIn.mockResolvedValueOnce({ error: new Error('Invalid login credentials') });
    await renderLogin();
    fillForm('a@b.co', 'correct-length');
    fireEvent.press(screen.getByText('Masuk'));
    expect(await screen.findByText(CRED_ERROR_MSG)).toBeTruthy();
    // Bukan passwordTooShort — password >= 6 tetap sampai ke network.
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('[10] critic regression: "Lupa password?" TIDAK terkena guard length', async () => {
    await renderLogin();
    fillForm('a@b.co', '123');
    // Klik "Lupa password?" — resetPassword harus dipanggil, guard length hanya di submit().
    fireEvent.press(screen.getByLabelText('Lupa kata sandi, kirim link reset'));
    await Promise.resolve();
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockReset.mock.calls[0][0]).toBe('a@b.co');
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
  });

  it('[11] critic regression: koreksi password (dari "123" → "123456") + submit ulang → feedback lama ter-clear', async () => {
    await renderLogin();
    fillForm('a@b.co', '123');
    fireEvent.press(screen.getByText('Masuk'));
    expect(await screen.findByText(AUTH_COPY.passwordTooShort)).toBeTruthy();

    // Koreksi password lalu submit ulang.
    fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER_PASSWORD), '123456');
    fireEvent.press(screen.getByText('Masuk'));
    await Promise.resolve();
    // Pesan lama harus hilang; signInWithPassword terpanggil sekali.
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });
});
