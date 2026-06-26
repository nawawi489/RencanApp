// Layar Chat room — UI-S-IN2/IN3/IN4. Bubble me/them (useAuth), Avatar+nama untuk them,
// date divider device-tz, banner governance, composer circular accessibilityLabel='Kirim pesan'.
// Pola mock per Critic §8.3: useAuth via `let mockSession` yang dibaca LAZY di factory.
// Pola mock per Critic §8.7: case existing 'data → kirim' di-rewrite ke label baru + mock useAuth.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// expo-router params — mutable per-test (Critic §8.3 pattern).
let mockRoomParams: { roomId?: string } = { roomId: 'r1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRoomParams,
}));

// useAuth — Critic §8.3: factory baca `mockSession` lazy di body fungsi (TDZ-safe).
let mockSession: { user: { id: string } } | null = { user: { id: 'me' } };
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockUseChatMessages = jest.fn();
const mockSend = jest.fn();
const mockMarkRead = jest.fn();
let mockIsSending = false;
const mockLoadOlder = jest.fn();
jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({ send: mockSend, markRead: mockMarkRead, isSending: mockIsSending }),
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
  mockLoadOlder.mockReset();
  mockSend.mockResolvedValue('m2');
  mockMarkRead.mockResolvedValue(0);
  mockSession = { user: { id: 'me' } };
  mockRoomParams = { roomId: 'r1' };
  mockIsSending = false;
  mockUseChatMessages.mockReturnValue({
    messages: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    loadOlder: mockLoadOlder,
    hasMore: false,
  });
});

describe('ChatRoomScreen — state dasar (existing)', () => {
  it('loading → skeleton aksesibel "Memuat…"', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [], isLoading: true, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('error → ErrorState (role alert) + retry', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [], isLoading: false, isError: true, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
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

  // [Critic §8.7] case existing 'data → render pesan; kirim' di-rewrite di Fase E:
  // - label tombol kini 'Kirim pesan' (bukan 'Kirim')
  // - useAuth ter-mock (default mockSession.user.id='me')
  it('[E0] data → render pesan; ketik lalu kirim via "Kirim pesan" → send dipanggil, input clear', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'Halo tim', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Halo tim')).toBeTruthy();

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Pesan baru');
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('Pesan baru'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('Pesan baru'));
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe(''));
  });
});

// =========================================================== UI-S-IN2: bubble me/them, urutan, identitas, divider ==========================================================
describe('ChatRoomScreen — UI-S-IN2 bubble & divider', () => {
  it('[E1] urutan KRONOLOGIS-MENAIK (terlama di atas, terbaru di bawah) — meskipun data desc dari hook', async () => {
    // hook return desc: ['m-newer','m-older']. Screen harus tampilkan 'lama' (older) sebelum 'baru' (newer).
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm-newer', chat_room_id: 'r1', author_id: 'me', body: 'baru',  created_at: '2026-06-24T05:00:00Z' },
        { id: 'm-older', chat_room_id: 'r1', author_id: 'me', body: 'lama', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    const { toJSON } = await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await screen.findByText('baru');
    const dump = JSON.stringify(toJSON());
    const idxLama = dump.indexOf('"lama"');
    const idxBaru = dump.indexOf('"baru"');
    expect(idxLama).toBeGreaterThan(-1);
    expect(idxBaru).toBeGreaterThan(-1);
    expect(idxLama).toBeLessThan(idxBaru); // 'lama' muncul lebih dulu di tree
  });

  it('[E2] bubble me vs them — me (author_id == session.user.id) tidak punya nama pengirim di atas bubble', async () => {
    mockSession = { user: { id: 'me' } };
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mm', chat_room_id: 'r1', author_id: 'me',   body: 'milik saya', created_at: '2026-06-24T01:00:00Z',
          author: { id: 'me', full_name: 'Saya' } },
        { id: 'mt', chat_room_id: 'r1', author_id: 'them', body: 'milik them', created_at: '2026-06-24T02:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Nama 'Budi' (them) muncul; 'Saya' (me) TIDAK muncul sebagai header bubble.
    expect(await screen.findByText('Budi')).toBeTruthy();
    expect(screen.queryByText('Saya')).toBeNull();
  });

  it('[E3] identitas them: Avatar + nama tampil di atas bubble (author null → "?")', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mnull', chat_room_id: 'r1', author_id: null, body: 'sistem update', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Avatar inisial '?' + nama header '?' — keduanya hadir → findAllByText length ≥ 1.
    const qmarks = await screen.findAllByText('?');
    expect(qmarks.length).toBeGreaterThanOrEqual(1);
    // Avatar a11y label = displayName.
    expect(screen.getByLabelText('?')).toBeTruthy();
  });

  it('[E4] currentUserId kosong (session=null) → default semua "them"', async () => {
    mockSession = null;
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mx', chat_room_id: 'r1', author_id: 'me', body: 'meskipun id me', created_at: '2026-06-24T01:00:00Z',
          author: { id: 'me', full_name: 'Saya' } },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Karena defaulting ke them, nama pengirim MUNCUL (untuk them ditampilkan).
    expect(await screen.findByText('Saya')).toBeTruthy();
  });

  it('[E5] date divider antar-hari — 2 hari beda muncul ≥1 chip "23 Jun" & ≥1 chip "24 Jun" (Critic §8.5 satu hari = tepat satu)', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm24a', chat_room_id: 'r1', author_id: 'them', body: 'p2',  created_at: '2026-06-24T10:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
        { id: 'm24b', chat_room_id: 'r1', author_id: 'them', body: 'p2b', created_at: '2026-06-24T11:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
        { id: 'm23',  chat_room_id: 'r1', author_id: 'them', body: 'p1',  created_at: '2026-06-23T10:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // dua hari beda → minimum dua divider chip yang berbeda. Format date 'd MMM' (id-ID).
    expect(await screen.findAllByText(/\b23 Jun\b/)).toHaveLength(1);
    expect(screen.getAllByText(/\b24 Jun\b/)).toHaveLength(1); // satu hari = tepat satu divider
  });

  it('[E6] created_at INVALID → skip divider (tidak crash, pesan tetap render)', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mok', chat_room_id: 'r1', author_id: 'them', body: 'oke', created_at: '2026-06-24T10:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
        { id: 'mbad', chat_room_id: 'r1', author_id: 'them', body: 'bad', created_at: 'not-a-date',
          author: { id: 'them', full_name: 'Budi' } },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('oke')).toBeTruthy();
    expect(screen.getByText('bad')).toBeTruthy();
  });
});

// =========================================================== UI-S-IN4: composer circular & guard ==========================================================
describe('ChatRoomScreen — composer & guards', () => {
  it('[E7] roomId undefined → ErrorState "Room tidak ditemukan" + markRead TIDAK dipanggil', async () => {
    mockRoomParams = {};
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Room tidak ditemukan/i)).toBeTruthy();
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('[E8] tombol Kirim pesan = circular ≥44dp (inline style) + accessibilityRole=button (Critic §8.4)', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const btn = await screen.findByLabelText('Kirim pesan');
    expect(btn.props.accessibilityRole).toBe('button');
    // Inline style numeric — Critic §8.4: NativeWind class tak selalu flatten.
    const style = Array.isArray(btn.props.style) ? Object.assign({}, ...btn.props.style) : btn.props.style;
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
  });

  it('[E9] disabled saat input kosong/whitespace (accessibilityState.disabled = true)', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const btn = await screen.findByLabelText('Kirim pesan');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByPlaceholderText('Tulis pesan…'), '   ');
    await waitFor(() =>
      expect(screen.getByLabelText('Kirim pesan').props.accessibilityState?.disabled).toBe(true),
    );
  });

  it('[E10] disabled saat isSending=true (Critic §8.5 anti double-submit guard)', async () => {
    mockIsSending = true;
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'sesuatu');
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('sesuatu'));
    const btn = screen.getByLabelText('Kirim pesan');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(btn);
    fireEvent.press(btn);
    // Double-press tetap TIDAK memanggil send (karena disabled).
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('[E11] send gagal → input TETAP, error muncul dgn role="alert" (Critic §8.5)', async () => {
    mockSend.mockRejectedValueOnce(new Error('boom'));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Tulis pesan…'), 'akan gagal');
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('akan gagal'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('akan gagal');
  });

  it('[E12] banner governance kanonik tampil + dapat ditutup (state lokal — re-mount muncul lagi by design)', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Chat bukan jalur formal|tidak menggantikan/i)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Tutup banner'));
    // setState dapat dijalankan async — tunggu unmount.
    await waitFor(() =>
      expect(screen.queryByText(/Chat bukan jalur formal|tidak menggantikan/i)).toBeNull(),
    );
  });

  it('[E13] tombol "Muat pesan lama" hanya muncul saat hasMore=true & memanggil loadOlder', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mhead', chat_room_id: 'r1', author_id: 'me', body: 'baru saja', created_at: '2026-06-24T10:00:00Z',
          author: { id: 'me', full_name: 'Saya' } },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: true,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const more = await screen.findByText(/Muat pesan lama/i);
    fireEvent.press(more);
    await waitFor(() => expect(mockLoadOlder).toHaveBeenCalled());
  });
});
