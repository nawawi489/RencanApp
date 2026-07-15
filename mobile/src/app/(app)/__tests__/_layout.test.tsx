import { render, screen } from '@testing-library/react-native';

const mockUseAuth = jest.fn();

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/use-push-notifications', () => ({
  usePushHandler: jest.fn(),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');

  function Stack({ children }: { children?: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  function StackScreen({
    name,
    options,
  }: {
    name: string;
    options?: { headerShown?: boolean; title?: string; presentation?: string };
  }) {
    return React.createElement(
      RN.Text,
      { testID: `screen:${name}` },
      JSON.stringify({ name, options: options ?? {} }),
    );
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
});

describe('AppLayout', () => {
  it('[APP-LAYOUT-1] tanpa session -> redirect ke login', async () => {
    mockUseAuth.mockReturnValue({ session: null });

    await render(<AppLayout />);

    expect(String(screen.getByTestId('redirect').props.children)).toContain('/(auth)/login');
  });

  it('[APP-LAYOUT-2] settings-mbr & settings-score-formula terdaftar dengan header aktif', async () => {
    mockUseAuth.mockReturnValue({ session: { user: { id: 'u1' } } });

    await render(<AppLayout />);

    expect(String(screen.getByTestId('screen:settings-mbr').props.children)).toContain(
      JSON.stringify({ headerShown: true, title: 'Minimum Breakdown Rule' }),
    );
    expect(String(screen.getByTestId('screen:settings-score-formula').props.children)).toContain(
      JSON.stringify({ headerShown: true, title: 'Score Formula' }),
    );
  });
});
