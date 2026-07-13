// FR-RC-2/4 — Composer context chip (contextAp param) + bubble context banner.
// Vertical TDD: satu test per behavior.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

let mockRoomParams: Record<string, string | undefined> = { roomId: 'r1' };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRoomParams,
  useRouter: () => ({ push: mockPush }),
}));

let mockSession: { user: { id: string } } | null = { user: { id: 'me' } };
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockGetActionPlan = jest.fn();
jest.mock('@/lib/cards', () => ({
  getActionPlan: (...a: unknown[]) => mockGetActionPlan(...a),
}));

const mockUseChatMessages = jest.fn();
const mockSend = jest.fn();
const mockMarkRead = jest.fn();
const mockToggleReaction = jest.fn();
let mockIsSending = false;
jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({
    send: mockSend,
    markRead: mockMarkRead,
    isSending: mockIsSending,
    toggleReaction: mockToggleReaction,
    isTogglingReaction: false,
  }),
}));

// eslint-disable-next-line import/first
import ChatRoomScreen from '../[roomId]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

function baseChatState(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    loadOlder: jest.fn(),
    hasMore: false,
    isFetchingNextPage: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: { id: 'me' } };
  mockRoomParams = { roomId: 'r1' };
  mockIsSending = false;
  mockSend.mockResolvedValue('m-new');
  mockMarkRead.mockResolvedValue(0);
  mockToggleReaction.mockResolvedValue(true);
  mockUseChatMessages.mockReturnValue(baseChatState());
  mockGetActionPlan.mockResolvedValue(null);
});

// ── Composer context chip ──────────────────────────────────

describe('Composer context chip (FR-RC-2)', () => {
  it('shows chip "Membalas Tugas: {nama}" when contextAp resolves', async () => {
    mockRoomParams = { roomId: 'r1', contextAp: 'ap-1' };
    mockGetActionPlan.mockResolvedValue({ id: 'ap-1', name: 'Review proposal' });

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    expect(await screen.findByText(/Membalas Tugas: Review proposal/)).toBeTruthy();
  });

  it('chip not shown when contextAp absent', async () => {
    mockRoomParams = { roomId: 'r1' };

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    await waitFor(() => expect(screen.queryByText(/Membalas Tugas:/)).toBeNull());
  });

  it('chip not shown when getActionPlan returns null (no access)', async () => {
    mockRoomParams = { roomId: 'r1', contextAp: 'ap-1' };
    mockGetActionPlan.mockResolvedValue(null);

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    await waitFor(() => expect(mockGetActionPlan).toHaveBeenCalledWith('ap-1'));
    expect(screen.queryByText(/Membalas Tugas:/)).toBeNull();
  });

  it('close button removes chip (accessibilityLabel "Lepas konteks")', async () => {
    mockRoomParams = { roomId: 'r1', contextAp: 'ap-1' };
    mockGetActionPlan.mockResolvedValue({ id: 'ap-1', name: 'Tugas Alpha' });

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    const chip = await screen.findByText(/Membalas Tugas: Tugas Alpha/);
    expect(chip).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Lepas konteks'));

    await waitFor(() => expect(screen.queryByText(/Membalas Tugas:/)).toBeNull());
  });

  it('send with context passes contextActionPlan to send()', async () => {
    mockRoomParams = { roomId: 'r1', contextAp: 'ap-1' };
    mockGetActionPlan.mockResolvedValue({ id: 'ap-1', name: 'Tugas Alpha' });

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    await screen.findByText(/Membalas Tugas: Tugas Alpha/);

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Tanya soal tugas');
    await waitFor(() => expect(input.props.value).toBe('Tanya soal tugas'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith('Tanya soal tugas', [], { contextActionPlan: 'ap-1' });
    });
  });

  it('chip auto-dismisses after successful send (D-4)', async () => {
    mockRoomParams = { roomId: 'r1', contextAp: 'ap-1' };
    mockGetActionPlan.mockResolvedValue({ id: 'ap-1', name: 'Tugas Alpha' });

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    await screen.findByText(/Membalas Tugas: Tugas Alpha/);

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Pesan konteks');
    await waitFor(() => expect(input.props.value).toBe('Pesan konteks'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Membalas Tugas:/)).toBeNull());
  });

  it('chip persists on send failure (retry keeps context)', async () => {
    mockRoomParams = { roomId: 'r1', contextAp: 'ap-1' };
    mockGetActionPlan.mockResolvedValue({ id: 'ap-1', name: 'Tugas Alpha' });
    mockSend.mockRejectedValue(new Error('network'));

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    await screen.findByText(/Membalas Tugas: Tugas Alpha/);

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Pesan gagal');
    await waitFor(() => expect(input.props.value).toBe('Pesan gagal'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(await screen.findByText(/Membalas Tugas: Tugas Alpha/)).toBeTruthy();
  });
});

// ── Context banner on bubble ───────────────────────────────

describe('Context banner on bubble (FR-RC-4)', () => {
  const msgWithContext = {
    id: 'm1',
    chat_room_id: 'r1',
    author_id: 'u1',
    body: 'Ada update soal ini',
    created_at: '2026-07-13T10:00:00Z',
    author: { id: 'u1', full_name: 'Bob', email: 'b@t' },
    context_entity_type: 'action_plan',
    context_entity_id: 'ap-1',
    context_label: 'Review proposal',
    reply_to_message_id: null,
    reply_to: null,
    reactions: [],
  };

  it('renders banner "Konteks Tugas" + label above body', async () => {
    mockUseChatMessages.mockReturnValue(baseChatState({ messages: [msgWithContext] }));

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    expect(await screen.findByText('Konteks Tugas')).toBeTruthy();
    expect(screen.getByText('Review proposal')).toBeTruthy();
    expect(screen.getByText('Ada update soal ini')).toBeTruthy();
  });

  it('banner tap navigates to /action-plan/{context_entity_id}', async () => {
    mockUseChatMessages.mockReturnValue(baseChatState({ messages: [msgWithContext] }));

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    const banner = await screen.findByLabelText('Buka Tugas Review proposal');
    fireEvent.press(banner);

    expect(mockPush).toHaveBeenCalledWith('/action-plan/ap-1');
  });

  it('no banner for messages without context', async () => {
    const plainMsg = {
      id: 'm2', chat_room_id: 'r1', author_id: 'u1', body: 'Pesan biasa',
      created_at: '2026-07-13T11:00:00Z', reactions: [],
    };
    mockUseChatMessages.mockReturnValue(baseChatState({ messages: [plainMsg] }));

    await render(createElement(ChatRoomScreen), { wrapper: wrapper() });

    expect(await screen.findByText('Pesan biasa')).toBeTruthy();
    expect(screen.queryByText('Konteks Tugas')).toBeNull();
  });
});
