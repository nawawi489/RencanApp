// Blok D — push permission banner UI tests (PN-PERM-1 to PN-PERM-4).
// Memverifikasi banner muncul/sembunyi sesuai permissionStatus dan CTA memanggil fungsi yang tepat.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockRegister = jest.fn();
const mockUsePushRegistration = jest.fn();

jest.mock('@/hooks/use-push-notifications', () => ({
  usePushRegistration: () => mockUsePushRegistration(),
}));

const mockUseNotifications = jest.fn();
const mockUseUnreadCount = jest.fn();

jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: (...a: unknown[]) => mockUseNotifications(...a),
  useUnreadCount: () => mockUseUnreadCount(),
  useNotificationActions: () => ({ markRead: jest.fn(), markAllRead: jest.fn() }),
}));

jest.mock('@/providers/theme-provider', () => ({
  useThemePreference: () => ({ effective: 'light', theme: 'light' }),
}));

const mockOpenSettings = jest.fn();
jest.mock('expo-linking', () => ({
  openSettings: (...a: unknown[]) => mockOpenSettings(...a),
}));

jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: jest.fn((cb: () => void) => cb()),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { LiveNotificationsScreen } from '../notifications';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

function primeDefaults(permissionStatus: string) {
  mockUsePushRegistration.mockReturnValue({
    permissionStatus,
    token: null,
    register: mockRegister,
    unregister: jest.fn(),
  });
  mockUseNotifications.mockReturnValue({
    notifications: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockUseUnreadCount.mockReturnValue({ count: 0 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRegister.mockResolvedValue(undefined);
  mockOpenSettings.mockResolvedValue(undefined);
});

describe('NotificationsScreen — push permission banner', () => {
  it('[PN-PERM-1] banner muncul saat permission status undetermined', async () => {
    primeDefaults('undetermined');
    await render(<LiveNotificationsScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText('Aktifkan')).toBeTruthy();
  });

  it('[PN-PERM-2] CTA Aktifkan memanggil register() tepat 1x', async () => {
    primeDefaults('undetermined');
    await render(<LiveNotificationsScreen />, { wrapper: makeWrapper() });
    fireEvent.press(screen.getByText('Aktifkan'));
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  it('[PN-PERM-3] denied state: guidance text "Buka pengaturan perangkat" ditampilkan', async () => {
    primeDefaults('denied');
    await render(<LiveNotificationsScreen />, { wrapper: makeWrapper() });
    expect(screen.getByText(/Buka pengaturan perangkat/)).toBeTruthy();
  });

  it('[PN-PERM-4] "Buka Pengaturan" memanggil Linking.openSettings', async () => {
    primeDefaults('denied');
    await render(<LiveNotificationsScreen />, { wrapper: makeWrapper() });
    fireEvent.press(screen.getByText('Buka Pengaturan'));
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
