// PN-WIRE — verifikasi usePushHandler di-wire di AppLayout dan menerima session.
// Hook harus dipanggil sebelum conditional return (Rules of Hooks) — juga saat session null.
import { render } from '@testing-library/react-native';

const mockUseAuth = jest.fn();
const mockUsePushHandler = jest.fn();

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/use-push-notifications', () => ({
  usePushHandler: (...a: unknown[]) => mockUsePushHandler(...a),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  function Stack({ children }: { children?: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }
  function StackScreen() {
    return null;
  }
  Stack.Screen = StackScreen;

  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(RN.Text, { testID: 'redirect' }, `REDIRECT:${href}`),
    Stack,
  };
});

// eslint-disable-next-line import/first
import AppLayout from '../_layout';

beforeEach(() => {
  mockUseAuth.mockReset();
  mockUsePushHandler.mockReset();
});

describe('AppLayout — push handler wiring', () => {
  it('[PN-WIRE-1] memanggil usePushHandler dengan session saat user terautentikasi', async () => {
    const fakeSession = { user: { id: 'u1' } };
    mockUseAuth.mockReturnValue({ session: fakeSession });

    await render(<AppLayout />);

    expect(mockUsePushHandler).toHaveBeenCalledTimes(1);
    expect(mockUsePushHandler).toHaveBeenCalledWith(fakeSession);
  });

  it('[PN-WIRE-2] memanggil usePushHandler(null) saat session null (Rules of Hooks)', async () => {
    mockUseAuth.mockReturnValue({ session: null });

    await render(<AppLayout />);

    expect(mockUsePushHandler).toHaveBeenCalledTimes(1);
    expect(mockUsePushHandler).toHaveBeenCalledWith(null);
  });
});
