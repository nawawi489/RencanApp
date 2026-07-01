// Tab Menu (V1.8.2 §7.1) — adapter ke hub /settings, plus baris People & People Ranking.
// Validasi 2 hal: (1) surface live Menu tetap memunculkan SettingsScreen kanonik; (2) row People → push '/people',
// row People Ranking → push '/people-ranking' (tak ber-permission gate).
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
import MenuScreen from '../menu';
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TW';
  return W;
}

beforeEach(() => {
  mockCan.mockReset();
  mockPush.mockReset();
  // Mode default: tanpa permission admin apapun.
  mockCan.mockReturnValue(false);
});

describe('Tab Menu (S0 nav)', () => {
  it('merender surface Settings melalui adapter tab', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('People')).toBeTruthy();
  });

  it('row People (tak ber-gate) → push /people', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('People'));
    expect(mockPush).toHaveBeenCalledWith('/people');
  });

  it('row People Ranking (tak ber-gate) → push /people-ranking', async () => {
    await render(<MenuScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('People Ranking'));
    expect(mockPush).toHaveBeenCalledWith('/people-ranking');
  });
});
