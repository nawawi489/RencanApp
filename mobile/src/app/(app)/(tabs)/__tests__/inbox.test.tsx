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

// Chat FTS V1: idle stub. Test file ini fokus UI-S-IN1; Search Pesan diuji terpisah di
// inbox.search-messages.test.tsx. Mock ini menghindari useAuth throw (butuh AuthProvider).
jest.mock('@/hooks/use-search-messages', () => ({
  useSearchMessages: () => ({
    hits: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    isRpcMissing: false,
    refetch: jest.fn(),
  }),
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
        { id: 'r1', action_plan_id: 'i1', name: 'Room A', unread_count: 3, last_message_at: '2026-06-24T01:00:00Z', last_message_body: 'Halo tim', last_message_author_name: 'Budi' },
        { id: 'r2', action_plan_id: 'i2', name: 'Room B', unread_count: 0, last_message_at: null, last_message_body: null, last_message_author_name: null },
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

// =========================================================== UI-S-IN1 enrichments ==========================================================
// Spec specs/inbox-chat-ui.md UI-S-IN1: avatar+nama, preview "{author}: {body}",
// fallback timestamp saat null, chip Semua/Belum dibaca, search by-nama, clamp 99+,
// empty-state kontekstual. Anti-bypass search → assert OUTPUT (bukan call-count, lihat Critic §8.2).
describe('InboxScreen — UI-S-IN1 enrichments', () => {
  const room = (over: Partial<{
    id: string; name: string; unread: number; body: string | null; author: string | null; at: string | null;
  }> = {}) => ({
    id: over.id ?? 'r1',
    action_plan_id: 'i-' + (over.id ?? 'r1'),
    name: over.name ?? 'Room A',
    unread_count: over.unread ?? 0,
    last_message_at: over.at === undefined ? '2026-06-24T01:00:00Z' : over.at,
    last_message_body: over.body === undefined ? 'Halo tim' : over.body,
    last_message_author_name: over.author === undefined ? 'Budi' : over.author,
  });

  it('[a] Avatar terbaca via a11y label = nama room', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', name: 'Sales Q2' })], isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Sales Q2')).toBeTruthy();
  });

  it('[b] Preview "{author}: {body}" saat keduanya tersedia', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', body: 'Halo tim', author: 'Budi' })],
      isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Budi: Halo tim')).toBeTruthy();
  });

  it('[c] Fallback ke timestamp saat last_message_body NULL (room kosong / FR-DATA.1)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', body: null, author: null, at: '2026-06-24T01:00:00Z' })],
      isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    // Render tidak boleh ada "null: ..." (anti-regresi).
    expect(screen.queryByText(/^null: /)).toBeNull();
    // Preview shows placeholder; timestamp rendered separately containing 'Jun'.
    expect(await screen.findByText('Belum ada pesan')).toBeTruthy();
    expect(screen.getByText(/Jun/)).toBeTruthy();
  });

  it('[c2] Room baru tanpa pesan (body+at NULL) → "Belum ada pesan" tampil sekali, bukan dua kali', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', body: null, author: null, at: null })],
      isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findAllByText('Belum ada pesan')).toHaveLength(1);
  });

  it('[d] Preview hanya {body} saat author_name NULL (author terhapus / sistem)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', body: 'sistem update', author: null })],
      isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('sistem update')).toBeTruthy();
    expect(screen.queryByText(/^null: /)).toBeNull();
    expect(screen.queryByText(/^\? ?: /)).toBeNull();
  });

  it('[e] Clamp unread — boundary 99 → "99 baru", 100 → "99+ baru" (Critic §8.5 off-by-one)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', name: 'A', unread: 99 }), room({ id: 'r2', name: 'B', unread: 100 })],
      isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('99 baru')).toBeTruthy();
    expect(screen.getByText('99+ baru')).toBeTruthy();
    // sanity: 100 tidak boleh muncul sebagai '100 baru'
    expect(screen.queryByText('100 baru')).toBeNull();
  });

  it('[f] Search by-nama → output terfilter (anti-bypass: assert OUTPUT bukan call-count)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [
        room({ id: 'r1', name: 'Sales Q2' }),
        room({ id: 'r2', name: 'Marketing Spike' }),
      ], isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Sales Q2')).toBeTruthy();
    expect(screen.getByText('Marketing Spike')).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText('Cari Rencana Aksi atau pesan'), 'sales');
    expect(await screen.findByText('Sales Q2')).toBeTruthy();
    expect(screen.queryByText('Marketing Spike')).toBeNull();
  });

  it('[g] Chip "Belum dibaca" → hanya room dengan unread > 0', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', name: 'Unread', unread: 3 }), room({ id: 'r2', name: 'Read', unread: 0 })],
      isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Read')).toBeTruthy();
    fireEvent.press(screen.getByText('Belum dibaca'));
    expect(await screen.findByText('Unread')).toBeTruthy();
    expect(screen.queryByText('Read')).toBeNull();
  });

  it('[h] Chip ter-defer (Saya PIC / Review / Deadline) TIDAK dirender (scope-lock V1)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1' })], isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Semua')).toBeTruthy();
    expect(screen.queryByText('Saya PIC')).toBeNull();
    expect(screen.queryByText('Review')).toBeNull();
    expect(screen.queryByText('Deadline')).toBeNull();
  });

  it('[i] Empty-state kontekstual saat search 0 hasil (≠ default empty)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', name: 'Sales' })], isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Rencana Aksi atau pesan'), 'zzzz-tidak-ada');
    expect(await screen.findByText(/tidak ditemukan/i)).toBeTruthy();
    // default empty NOT shown
    expect(screen.queryByText('Belum ada percakapan')).toBeNull();
  });

  it('[j] Empty-state kontekstual saat filter "Belum dibaca" 0 unread (≠ default empty)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [room({ id: 'r1', unread: 0 })], isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.press(screen.getByText('Belum dibaca'));
    // Title spesifik untuk state ini (bukan default 'Belum ada percakapan').
    expect(await screen.findByText('Tidak ada yang belum dibaca')).toBeTruthy();
    expect(screen.queryByText('Belum ada percakapan')).toBeNull();
  });
});
