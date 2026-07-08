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

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';

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

// expo-linking: kontrol nilai createURL agar assertion redirectTo stabil.
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `ems://${path.replace(/^\//, '')}`,
}));

// react-native-css/components dan @/components/ui SENGAJA tidak di-mock — mengikuti
// pola menu.test.tsx yang berhasil (mocking Pressable di test-renderer justru
// merusak wiring fireEvent.press → onPress). Button real dari @/components/ui akan
// merender Pressable dengan accessibilityLabel = label prop.

// BrandLogo — reduce noise.
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

// Pola dari wizard-validation.test.tsx (yang berhasil di project ini): cleanup
// sync di afterEach + press dibungkus act().
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
  await render(<LoginScreen />);
  const emailInput = screen.getByPlaceholderText(PLACEHOLDER_EMAIL);
  const passwordInput = screen.getByPlaceholderText(PLACEHOLDER_PASSWORD);
  const masukBtn = screen.getByLabelText('Masuk');
  const fillForm = async (email: string, password: string) => {
    await type(emailInput, email);
    await type(passwordInput, password);
  };
  const setPasswordOnly = async (password: string) => {
    await type(passwordInput, password);
  };
  const submit = async () => {
    await press(masukBtn);
  };
  return { fillForm, setPasswordOnly, submit } as const;
}

describe('LoginScreen — password guard AUTH-02b', () => {
  it('[1] AC-AUTH02-1: password "123" → passwordTooShort + spy signInWithPassword=0', async () => {
    const { fillForm, submit } = await setup();
    await fillForm('a@b.co', '123');
    await submit();
    expect(screen.getByText(AUTH_COPY.passwordTooShort)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('[2] AC-AUTH02-2 boundary: password "123456" (=6) lolos → signInWithPassword dipanggil', async () => {
    const { fillForm, submit } = await setup();
    await fillForm('a@b.co', '123456');
    await submit();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn.mock.calls[0][0]).toEqual({ email: 'a@b.co', password: '123456' });
  });

  it('[3] AC-AUTH02-2 boundary: password "12345" (=5) ditahan', async () => {
    const { fillForm, submit } = await setup();
    await fillForm('a@b.co', '12345');
    await submit();
    expect(screen.getByText(AUTH_COPY.passwordTooShort)).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('[4] AC-AUTH02-3: email kosong menang atas guard length — pesan "wajib diisi"', async () => {
    const { fillForm, submit } = await setup();
    await fillForm('', '123');
    await submit();
    expect(screen.getByText(EMPTY_MSG)).toBeTruthy();
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('[5] AC-AUTH02-3: password kosong → "wajib diisi" (branch discrimination vs 5 karakter)', async () => {
    const { fillForm, submit } = await setup();
    await fillForm('a@b.co', '');
    await submit();
    expect(screen.getByText(EMPTY_MSG)).toBeTruthy();
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
  });

  it('[6] AC-AUTH02-4: password "      " (6 spasi) LOLOS (tidak di-trim); email tetap di-trim', async () => {
    const { fillForm, submit } = await setup();
    await fillForm('  a@b.co  ', '      ');
    await submit();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn.mock.calls[0][0]).toEqual({ email: 'a@b.co', password: '      ' });
  });

  it('[7] AC-AUTH02-5: banner feedback pakai accessibilityRole="alert" + accessibilityLiveRegion="polite"', async () => {
    const { fillForm, submit } = await setup();
    await fillForm('a@b.co', '123');
    await submit();
    const feedbackText = screen.getByText(AUTH_COPY.passwordTooShort);
    // Ancestor terdekat yang mengekspos a11y: View bungkus banner.
    let node: typeof feedbackText | null = feedbackText;
    while (node) {
      const role = (node.props as { accessibilityRole?: string }).accessibilityRole;
      if (role === 'alert') {
        const live = (node.props as { accessibilityLiveRegion?: string })
          .accessibilityLiveRegion;
        expect(live).toBe('polite');
        return;
      }
      node = node.parent;
    }
    throw new Error('Banner feedback tidak menyediakan accessibilityRole="alert".');
  });

  it('[8] AC-AUTH02-5 side: password TIDAK bocor ke console pada jalur guard', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { fillForm, setPasswordOnly, submit } = await setup();
      await fillForm('a@b.co', 'secret-abc');
      await setPasswordOnly('123');
      await submit();
      expect(screen.getByText(AUTH_COPY.passwordTooShort)).toBeTruthy();
      const allCalls = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errSpy.mock.calls];
      for (const call of allCalls) {
        for (const arg of call) {
          const s = String(arg);
          expect(s).not.toContain('123');
          expect(s).not.toContain('secret-abc');
        }
      }
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('[9] regression AC-AUTH02-6: kredensial salah tetap tampilkan pesan cred (bukan passwordTooShort)', async () => {
    mockSignIn.mockResolvedValueOnce({ error: new Error('Invalid login credentials') });
    const { fillForm, submit } = await setup();
    await fillForm('a@b.co', 'correct-length');
    await submit();
    // Feedback perlu tick untuk render setelah setState di catch block.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(CRED_ERROR_MSG)).toBeTruthy();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('[10] critic regression: "Lupa password?" TIDAK terkena guard length', async () => {
    const { fillForm } = await setup();
    await fillForm('a@b.co', '123');
    await press(screen.getByLabelText('Lupa kata sandi, kirim link reset'));
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockReset.mock.calls[0][0]).toBe('a@b.co');
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
  });

  it('[13] AC-NET-1 (login): "Failed to fetch" → pesan koneksi ramah (bukan raw EN)', async () => {
    mockSignIn.mockResolvedValueOnce({ error: new Error('Failed to fetch') });
    const { fillForm, submit } = await setup();
    await fillForm('a@b.co', 'rahasia123');
    await submit();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(AUTH_COPY.networkUnavailable)).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('[14] AC-NET-2 (reset link): "Network request failed" → pesan koneksi ramah', async () => {
    mockReset.mockResolvedValueOnce({ error: new Error('Network request failed') });
    const { fillForm } = await setup();
    await fillForm('a@b.co', '');
    await press(screen.getByLabelText('Lupa kata sandi, kirim link reset'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(AUTH_COPY.networkUnavailable)).toBeTruthy();
  });

  it('[12] AC-RESET-1: resetPasswordForEmail dikirim dengan redirectTo deep-link ems://reset-password', async () => {
    const { fillForm } = await setup();
    await fillForm('a@b.co', '');
    await press(screen.getByLabelText('Lupa kata sandi, kirim link reset'));
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockReset.mock.calls[0][1]).toEqual({ redirectTo: 'ems://reset-password' });
  });

  it('[11] critic regression: koreksi password (dari "123" → "123456") + submit ulang → feedback lama ter-clear', async () => {
    const { fillForm, setPasswordOnly, submit } = await setup();
    await fillForm('a@b.co', '123');
    await submit();
    expect(screen.getByText(AUTH_COPY.passwordTooShort)).toBeTruthy();

    await setPasswordOnly('123456');
    await submit();
    expect(screen.queryByText(AUTH_COPY.passwordTooShort)).toBeNull();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('[15] brand regression: login screen mengekspose label "Rencanapp"', async () => {
    await setup();
    expect(screen.getByLabelText('Rencanapp')).toBeTruthy();
  });
});
