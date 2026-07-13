// Chat FTS V1 — deep-link highlight. Search Pesan → tap hit → /inbox/{roomId}?highlight={id}.
// Screen [roomId] baca `highlight`, sorot bubble yang matching (a11y label). AC-26: highlight
// yang tampered (id bukan bagian dari list yang ke-fetch RLS-aware) → silently ignored (no crash,
// no highlight). RLS `chat_messages_select` sudah menjamin listChatMessages hanya mengembalikan
// pesan room dimana user adalah anggota — jadi id di luar list otomatis "not found".
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/cards', () => ({ getActionPlan: jest.fn().mockResolvedValue(null) }));

// expo-router params — mutable per-test.
let mockRoomParams: { roomId?: string; highlight?: string } = { roomId: 'r1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRoomParams,
  useRouter: () => ({ push: jest.fn() }),
}));

let mockSession: { user: { id: string } } | null = { user: { id: 'me' } };
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockUseChatMessages = jest.fn();
const mockSend = jest.fn();
const mockMarkRead = jest.fn();
const mockLoadOlder = jest.fn();
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

const msg = (over: Partial<{ id: string; author: string; body: string; at: string }> = {}) => ({
  id: over.id ?? 'm-1',
  chat_room_id: 'r1',
  author_id: over.author ?? 'other',
  body: over.body ?? 'halo',
  created_at: over.at ?? '2026-07-10T09:00:00.000Z',
});

beforeEach(() => {
  mockUseChatMessages.mockReset();
  mockSend.mockReset();
  mockMarkRead.mockReset();
  mockLoadOlder.mockReset();
  mockSession = { user: { id: 'me' } };
  mockRoomParams = { roomId: 'r1' };
  mockUseChatMessages.mockReturnValue({
    messages: [msg({ id: 'm-1', body: 'halo tim' }), msg({ id: 'm-2', body: 'target CPL turun 20%' })],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    loadOlder: mockLoadOlder,
    hasMore: false,
  });
});

describe('ChatRoomScreen — deep-link highlight (AC-17/AC-26)', () => {
  it('[1] ?highlight=<valid-id> → bubble bertanda a11y "Pesan yang dicari" & label sesuai body', async () => {
    mockRoomParams = { roomId: 'r1', highlight: 'm-2' };
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    // Ada bubble untuk 'target CPL turun 20%' yang bertanda highlight.
    // Menggunakan a11y label khusus supaya tidak bergantung pada styling (NativeWind class
    // tidak selalu flatten di jest — pola Critic §8.4 di layar ini).
    const highlighted = await screen.findByLabelText(/Pesan yang dicari.*target CPL turun 20%/);
    expect(highlighted).toBeTruthy();

    // Pesan lain TIDAK bertanda highlight.
    expect(screen.queryByLabelText(/Pesan yang dicari.*halo tim/)).toBeNull();
  });

  it('[2] ?highlight=<tampered-id-tidak-di-list> → silently ignored (tidak crash, tidak ada tanda)', async () => {
    mockRoomParams = { roomId: 'r1', highlight: 'm-tampered-not-in-list' };
    await render(<ChatRoomScreen />, { wrapper: wrapper() });

    // Kedua pesan tetap tampil normal — TIDAK ada bubble yang bertanda highlight.
    expect(await screen.findByText('halo tim')).toBeTruthy();
    expect(screen.getByText('target CPL turun 20%')).toBeTruthy();
    expect(screen.queryByLabelText(/Pesan yang dicari/)).toBeNull();
  });
});
