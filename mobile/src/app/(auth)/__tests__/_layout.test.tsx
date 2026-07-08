// AC-RESET: AuthLayout tidak boleh redirect ke (app) selagi session yang aktif
// adalah recovery session (isRecovering=true dari onAuthStateChange PASSWORD_RECOVERY).
// Tanpa guard ini, user yang klik link "Lupa password" dari email langsung dilempar
// ke tabs sebelum sempat set password baru.

import { render, screen } from '@testing-library/react-native';

const mockUseAuth = jest.fn();

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(RN.Text, { testID: 'redirect' }, `REDIRECT:${href}`),
    Stack: () => React.createElement(RN.Text, { testID: 'stack' }, 'STACK'),
  };
});

// eslint-disable-next-line import/first
import AuthLayout from '../_layout';

beforeEach(() => {
  mockUseAuth.mockReset();
});

describe('AuthLayout — recovery session guard', () => {
  it('[AC-RESET-LAYOUT-1] tanpa session → render Stack (tidak redirect)', async () => {
    mockUseAuth.mockReturnValue({ session: null, isRecovering: false });
    await render(<AuthLayout />);
    expect(screen.getByTestId('stack')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('[AC-RESET-LAYOUT-2] session aktif non-recovery → Redirect ke /(app)/(tabs)', async () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: 'u1' } },
      isRecovering: false,
    });
    await render(<AuthLayout />);
    expect(String(screen.getByTestId('redirect').props.children)).toContain('/(app)/(tabs)');
  });

  it('[AC-RESET-LAYOUT-3] session aktif TAPI isRecovering=true → TETAP di Stack (tidak redirect)', async () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: 'u1' } },
      isRecovering: true,
    });
    await render(<AuthLayout />);
    expect(screen.getByTestId('stack')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });
});
