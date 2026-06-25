// UI Fase 7 — link Settings → Score Formula. Gated permission manage_score_formula.
// Tanpa permission: baris non-Pressable (tidak punya accessibilityRole button).
// Dengan permission: pressable + router.push('/settings-score-formula').
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => Promise.resolve({ data: null, error: null })),
        })),
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
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/providers/auth-provider', () => ({
  __esModule: true,
  useAuth: () => ({ session: { user: { id: 'u1', email: 'u@n.id' } }, signOut: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsScreen from '../settings';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockCan.mockReset();
  mockPush.mockReset();
});

describe('Settings — Score Formula link guard', () => {
  it('[1] tanpa manage_score_formula → baris non-Pressable, push tak terpanggil', async () => {
    mockCan.mockImplementation((key: string) => key !== 'manage_score_formula');
    await render(<SettingsScreen />, { wrapper: wrapper() });
    // Label tetap muncul (untuk diskoverabilitas), tapi bukan Pressable.
    expect(await screen.findByText('Score Formula')).toBeTruthy();
    // getByRole button + accessibilityLabel='Score Formula' tak ada.
    expect(screen.queryByLabelText('Score Formula')).toBeNull();
  });

  it('[2] dengan manage_score_formula → tekan baris → router.push /settings-score-formula', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScreen />, { wrapper: wrapper() });
    const link = await screen.findByLabelText('Score Formula');
    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith('/settings-score-formula');
  });
});
