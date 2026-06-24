// Layar Inbox — 4 state + daftar room dengan badge unread + navigasi ke chat.
// Pola: mock supabase (stub) + mock hook use-inbox; QueryClient retry:false.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockUseInboxRooms = jest.fn();
jest.mock('@/hooks/use-inbox', () => ({
  useInboxRooms: () => mockUseInboxRooms(),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import InboxScreen from '../inbox';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockPush.mockReset();
  mockUseInboxRooms.mockReset();
  mockUseInboxRooms.mockReturnValue({
    rooms: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
});

describe('InboxScreen', () => {
  it('loading → skeleton aksesibel "Memuat…"', async () => {
    mockUseInboxRooms.mockReturnValue({ rooms: [], isLoading: true, isError: false, refetch: jest.fn() });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('error → ErrorState (role alert) + retry', async () => {
    mockUseInboxRooms.mockReturnValue({ rooms: [], isLoading: false, isError: true, refetch: jest.fn() });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat Inbox')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Coba lagi')).toBeTruthy();
  });

  it('kosong → EmptyState', async () => {
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Belum ada percakapan')).toBeTruthy();
  });

  it('data → daftar room + badge unread, tap → navigasi ke chat', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [
        { id: 'r1', initiative_id: 'i1', name: 'Room A', unread_count: 3, last_message_at: '2026-06-24T01:00:00Z' },
        { id: 'r2', initiative_id: 'i2', name: 'Room B', unread_count: 0, last_message_at: null },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Room A')).toBeTruthy();
    expect(screen.getByText('Room B')).toBeTruthy();
    expect(screen.getByText('3 baru')).toBeTruthy();

    fireEvent.press(screen.getByText('Room A'));
    expect(mockPush).toHaveBeenCalledWith('/inbox/r1');
  });
});
