// Layar Chat room — render pesan, composer kirim (clear input), markRead saat mount, 4 state.
// Pola: mock supabase (stub) + mock hook use-inbox + expo-router; QueryClient retry:false.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ roomId: 'r1' }),
}));

const mockUseChatMessages = jest.fn();
const mockSend = jest.fn();
const mockMarkRead = jest.fn();
jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({ send: mockSend, markRead: mockMarkRead, isSending: false }),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import ChatRoomScreen from '../[roomId]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockUseChatMessages.mockReset();
  mockSend.mockReset();
  mockMarkRead.mockReset();
  mockSend.mockResolvedValue('m2');
  mockMarkRead.mockResolvedValue(0);
  mockUseChatMessages.mockReturnValue({
    messages: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
});

describe('ChatRoomScreen', () => {
  it('loading → skeleton aksesibel "Memuat…"', async () => {
    mockUseChatMessages.mockReturnValue({ messages: [], isLoading: true, isError: false, refetch: jest.fn() });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('error → ErrorState (role alert) + retry', async () => {
    mockUseChatMessages.mockReturnValue({ messages: [], isLoading: false, isError: true, refetch: jest.fn() });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Gagal memuat pesan')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('kosong → EmptyState "Belum ada pesan"', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Belum ada pesan')).toBeTruthy();
  });

  it('markRead dipanggil saat mount', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalled());
  });

  it('data → render pesan; ketik lalu kirim → send dipanggil dgn teks & input di-clear', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'Halo tim', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Halo tim')).toBeTruthy();

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Pesan baru');
    // RNTL v14 async: tunggu state commit sebelum press (closure handleSend baca teks terbaru).
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('Pesan baru'));
    fireEvent.press(screen.getByRole('button', { name: 'Kirim' }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('Pesan baru'));
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe(''));
  });
});
