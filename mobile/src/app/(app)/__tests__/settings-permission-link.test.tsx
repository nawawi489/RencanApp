// UI #35 — link Settings → User & Permission. Gated manage_users_permissions.
// Tanpa permission: baris non-Pressable. Dengan: push('/settings-permission-users').
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: jest.fn(() => Promise.resolve({ data: null, error: null })) })),
      })),
    })),
  },
}));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: mockCan }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('@/providers/auth-provider', () => ({
  __esModule: true,
  useAuth: () => ({ session: { user: { id: 'u1', email: 'u@n.id' } }, signOut: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsScreen from '../settings';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TW';
  return W;
}

beforeEach(() => {
  mockCan.mockReset();
  mockPush.mockReset();
});

describe('Settings — User & Permission link gate (#35)', () => {
  it('[1] tanpa manage_users_permissions → baris non-Pressable', async () => {
    mockCan.mockImplementation((k: string) => k !== 'manage_users_permissions');
    await render(<SettingsScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('User & Permission')).toBeTruthy();
    expect(screen.queryByLabelText('User & Permission')).toBeNull();
  });

  it('[2] dengan manage_users_permissions → push /settings-permission-users', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('User & Permission'));
    expect(mockPush).toHaveBeenCalledWith('/settings-permission-users');
  });
});
