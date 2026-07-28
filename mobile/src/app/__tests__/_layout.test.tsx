// S9-3 — root layout adalah host untuk seluruh tree (auth + app). Bila render-nya
// crash saat startup, aplikasi menampilkan screen putih tanpa error yang bisa
// dilacak. Sebelumnya tanpa smoke test — regresi hanya terdeteksi saat build
// dijalankan di device.

import { render } from '@testing-library/react-native';

// Side-effects module-scope diinisialisasi saat _layout.tsx di-import. Stub tiap
// dependency non-render menjadi no-op agar test tidak menyentuh Sentry, native
// notification channel, network handler, dsb.
jest.mock('@sentry/react-native', () => ({}));
jest.mock('@/lib/sentry-init', () => ({ initSentry: jest.fn() }));
jest.mock('@/lib/global-handler', () => ({ installGlobalErrorHandler: jest.fn() }));
jest.mock('@/lib/online-manager', () => ({ installOnlineManager: jest.fn() }));
jest.mock('@/hooks/use-push-notifications', () => ({ ensureAndroidNotificationChannel: jest.fn() }));

jest.mock('@/lib/query-client', () => ({
  createQueryClient: () => ({
    getQueryCache: () => ({ subscribe: () => () => {} }),
    getMutationCache: () => ({ subscribe: () => () => {} }),
  }),
}));

jest.mock('@tanstack/react-query', () => {
  const React = jest.requireActual('react');
  return {
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual('react');
  return {
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(RN.Text, { testID: 'stack' }, 'STACK', children);
  const StackScreen = () => null;
  StackScreen.displayName = 'StackScreen';
  Stack.Screen = StackScreen;
  return {
    Stack,
    DarkTheme: {},
    DefaultTheme: {},
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('expo-status-bar', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return {
    StatusBar: () => React.createElement(RN.Text, { testID: 'status-bar' }, ''),
  };
});

jest.mock('react-native-css/components', () => {
  const RN = jest.requireActual('react-native');
  return { ActivityIndicator: RN.ActivityIndicator, View: RN.View };
});

jest.mock('@/components/alert-host', () => {
  const React = jest.requireActual('react');
  const RN = jest.requireActual('react-native');
  return { AlertHost: () => React.createElement(RN.Text, { testID: 'alert-host' }, '') };
});

jest.mock('@/components/error-boundary', () => {
  const React = jest.requireActual('react');
  return { ErrorBoundary: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children) };
});

const mockUseAuth = jest.fn();
jest.mock('@/providers/auth-provider', () => {
  const React = jest.requireActual('react');
  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useAuth: () => mockUseAuth(),
  };
});

const mockUseTheme = jest.fn();
jest.mock('@/providers/theme-provider', () => {
  const React = jest.requireActual('react');
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    useThemePreference: () => mockUseTheme(),
  };
});

jest.mock('@/providers/period-focus-provider', () => {
  const React = jest.requireActual('react');
  return {
    PeriodFocusProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});

// Global.css side-effect: swap ke no-op agar Jest tidak mem-parse CSS.
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-url-polyfill/auto', () => ({}));

// eslint-disable-next-line import/first
import RootLayout from '../_layout';

beforeEach(() => {
  mockUseAuth.mockReset();
  mockUseTheme.mockReset();
  mockUseTheme.mockReturnValue({ effective: 'light' });
});

describe('RootLayout — startup smoke', () => {
  it('render tanpa crash saat auth belum siap → tampilkan spinner (initializing=true)', async () => {
    mockUseAuth.mockReturnValue({ initializing: true });
    const r = await render(<RootLayout />);
    // Spinner render, Stack belum.
    expect(r.queryByTestId('stack')).toBeNull();
  });

  it('render Stack begitu auth siap (initializing=false)', async () => {
    mockUseAuth.mockReturnValue({ initializing: false });
    const r = await render(<RootLayout />);
    expect(r.getByTestId('stack')).toBeTruthy();
    // AlertHost dan StatusBar juga ter-render.
    expect(r.getByTestId('alert-host')).toBeTruthy();
    expect(r.getByTestId('status-bar')).toBeTruthy();
  });

  it('menerapkan tema dark (effective="dark") tanpa crash', async () => {
    mockUseAuth.mockReturnValue({ initializing: false });
    mockUseTheme.mockReturnValue({ effective: 'dark' });
    const r = await render(<RootLayout />);
    expect(r.getByTestId('stack')).toBeTruthy();
  });
});
