// Layar Chat room — UI-S-IN2/IN3/IN4. Bubble me/them (useAuth), Avatar+nama untuk them,
// date divider device-tz, banner governance, composer circular accessibilityLabel='Kirim pesan'.
// Pola mock per Critic §8.3: useAuth via `let mockSession` yang dibaca LAZY di factory.
// Pola mock per Critic §8.7: case existing 'data → kirim' di-rewrite ke label baru + mock useAuth.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// expo-router params — mutable per-test (Critic §8.3 pattern).
let mockRoomParams: { roomId?: string } = { roomId: 'r1' };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRoomParams,
  useRouter: () => ({ push: mockPush }),
  // Stack.Screen hanya set opsi header — render null di test.
  Stack: { Screen: () => null },
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
const mockUseChatRoom = jest.fn();
const mockUseChatRoomMembers = jest.fn();
const mockUseChatReads = jest.fn();
jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({ send: mockSend, markRead: mockMarkRead, isSending: mockIsSending }),
  // Realtime hook — no-op di test (tak menyentuh Supabase channel).
  useChatRealtime: () => {},
  useChatRoom: (...a: unknown[]) => mockUseChatRoom(...a),
  useChatRoomMembers: (...a: unknown[]) => mockUseChatRoomMembers(...a),
  useChatReads: (...a: unknown[]) => mockUseChatReads(...a),
  useChatReadsRealtime: () => {},
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

beforeEach(async () => {
  await AsyncStorage.clear(); // isolasi flag dismiss banner antar-tes
  mockUseChatMessages.mockReset();
  mockSend.mockReset();
  mockMarkRead.mockReset();
  mockLoadOlder.mockReset();
  mockSend.mockResolvedValue('m2');
  mockMarkRead.mockResolvedValue(0);
  mockSession = { user: { id: 'me' } };
  mockRoomParams = { roomId: 'r1' };
  mockIsSending = false;
  mockPush.mockReset();
  mockUseChatRoom.mockReset();
  mockUseChatRoomMembers.mockReset();
  mockUseChatReads.mockReset();
  mockUseChatRoom.mockReturnValue({ room: null });
  mockUseChatRoomMembers.mockReturnValue({ members: [] });
  mockUseChatReads.mockReturnValue({ readsByMessage: new Map() });
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

    // Kirim kini menyertakan mentions ([]) + pesan optimistik (author_id='me', body sama).
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith(
        'Pesan baru',
        [],
        expect.objectContaining({ body: 'Pesan baru', author_id: 'me' }),
      ),
    );
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

  it('[E12] banner governance kanonik tampil + dapat ditutup (persisten AsyncStorage: tak muncul lagi setelahnya)', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Chat bukan jalur formal|tidak menggantikan/i)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Tutup banner'));
    await waitFor(() =>
      expect(screen.queryByText(/Chat bukan jalur formal|tidak menggantikan/i)).toBeNull(),
    );
    // Re-mount → tetap tertutup karena flag tersimpan di AsyncStorage.
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.queryByLabelText('Tutup banner')).toBeNull());
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

// =========================================================== Topbar konteks (PRD §30) & @mention ==========================================================
describe('ChatRoomScreen — konteks room & @mention', () => {
  const members = [
    { id: 'u2', full_name: 'Budi', email: null },
    { id: 'u3', full_name: 'Sari', email: null },
  ];

  it('[IN5] context bar tampil jumlah anggota; tap → modal daftar nama anggota', async () => {
    mockUseChatRoomMembers.mockReturnValue({ members });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const openMembers = await screen.findByLabelText('2 anggota');
    fireEvent.press(openMembers);
    expect(await screen.findByText('Anggota (2)')).toBeTruthy();
    expect(screen.getByText('Budi')).toBeTruthy();
    expect(screen.getByText('Sari')).toBeTruthy();
  });

  it('[IN6] tombol "Rencana Aksi" → router.push ke /action-plan/{action_plan_id}', async () => {
    mockUseChatRoom.mockReturnValue({ room: { id: 'r1', name: 'Kampanye Q3', action_plan_id: 'ap9' } });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const btn = await screen.findByLabelText('Buka Rencana Aksi');
    fireEvent.press(btn);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/action-plan/ap9'));
  });

  it('[IN7] @mention: ketik "@" → saran anggota; pilih → sisip nama; kirim → mention id diteruskan', async () => {
    mockUseChatRoomMembers.mockReturnValue({ members });
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm1', chat_room_id: 'r1', author_id: 'me', body: 'x', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'halo @bu');
    const pick = await screen.findByLabelText('Sebut Budi');
    fireEvent.press(pick);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('halo @Budi '),
    );
    fireEvent.press(screen.getByLabelText('Kirim pesan'));
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith(
        'halo @Budi',
        ['u2'],
        expect.objectContaining({ body: 'halo @Budi' }),
      ),
    );
  });

  it('[IN9] seen-by: pill "Dilihat oleh N" hanya di me-message TERAKHIR yg punya pembaca lain', async () => {
    // Dua me-messages, keduanya punya read oleh 'u2'. Pola WhatsApp: hanya bubble terbaru
    // ('m2') yang menampilkan pill; 'm1' (lebih lama) tidak.
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm2', chat_room_id: 'r1', author_id: 'me', body: 'yang baru', created_at: '2026-06-24T02:00:00Z' },
        { id: 'm1', chat_room_id: 'r1', author_id: 'me', body: 'yang lama', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    mockUseChatReads.mockReturnValue({
      readsByMessage: new Map([
        ['m1', [{ chat_message_id: 'm1', reader_id: 'u2', read_at: '2026-06-24T01:30:00Z', reader: { id: 'u2', full_name: 'Budi', email: null } }]],
        ['m2', [{ chat_message_id: 'm2', reader_id: 'u2', read_at: '2026-06-24T02:30:00Z', reader: { id: 'u2', full_name: 'Budi', email: null } }]],
      ]),
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Tepat satu pill (pada m2 — bubble terbaru).
    const pills = await screen.findAllByLabelText(/Dilihat oleh 1 orang/);
    expect(pills).toHaveLength(1);
  });

  it('[IN10] seen-by: hanya reader ≠ diri yang dihitung (baca sendiri diabaikan)', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mm', chat_room_id: 'r1', author_id: 'me', body: 'x', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    mockUseChatReads.mockReturnValue({
      readsByMessage: new Map([
        ['mm', [{ chat_message_id: 'mm', reader_id: 'me', read_at: '2026-06-24T02:00:00Z', reader: { id: 'me', full_name: 'Saya', email: null } }]],
      ]),
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.queryByLabelText(/Dilihat oleh/)).toBeNull();
  });

  it('[IN11] seen-by: tidak muncul pada bubble THEM (privasi — tak track pesan orang lain)', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mt', chat_room_id: 'r1', author_id: 'u2', body: 'pesan dari lain', created_at: '2026-06-24T01:00:00Z',
          author: { id: 'u2', full_name: 'Budi' } },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    mockUseChatReads.mockReturnValue({
      readsByMessage: new Map([
        ['mt', [{ chat_message_id: 'mt', reader_id: 'me', read_at: '2026-06-24T02:00:00Z', reader: { id: 'me', full_name: 'Saya', email: null } }]],
      ]),
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.queryByLabelText(/Dilihat oleh/)).toBeNull();
  });

  it('[IN12] tap seen-by → modal "Dilihat oleh (N)" dgn nama pembaca (bukan diri)', async () => {
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'mm', chat_room_id: 'r1', author_id: 'me', body: 'x', created_at: '2026-06-24T01:00:00Z' },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    mockUseChatReads.mockReturnValue({
      readsByMessage: new Map([
        ['mm', [
          { chat_message_id: 'mm', reader_id: 'u2', read_at: '2026-06-24T02:00:00Z', reader: { id: 'u2', full_name: 'Budi', email: null } },
          { chat_message_id: 'mm', reader_id: 'me', read_at: '2026-06-24T03:00:00Z', reader: { id: 'me', full_name: 'Saya', email: null } },
        ]],
      ]),
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText(/Dilihat oleh 1 orang/));
    expect(await screen.findByText('Dilihat oleh (1)')).toBeTruthy();
    expect(screen.getByText('Budi')).toBeTruthy();
    // Nama diri sendiri TIDAK ada di daftar.
    expect(screen.queryByText('Saya')).toBeNull();
  });

  it('[IN13] highlight @Nama di dalam bubble: teks mention tampil sbg elemen terpisah', async () => {
    mockUseChatRoomMembers.mockReturnValue({ members: [{ id: 'u2', full_name: 'Budi', email: null }] });
    mockUseChatMessages.mockReturnValue({
      messages: [
        { id: 'm1', chat_room_id: 'r1', author_id: 'u3', body: 'halo @Budi apa kabar', created_at: '2026-06-24T01:00:00Z',
          author: { id: 'u3', full_name: 'Sari' } },
      ],
      isLoading: false, isError: false, refetch: jest.fn(), loadOlder: mockLoadOlder, hasMore: false,
    });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // findByText default = exact match. Tanpa split, body Text=' halo @Budi apa kabar' → tak
    // cocok '@Budi' persis. Ketemunya '@Budi' persis membuktikan segmen mention ter-split.
    expect(await screen.findByText('@Budi')).toBeTruthy();
  });

  it('[IN8] mention yang sudah dihapus dari teks TIDAK diteruskan', async () => {
    mockUseChatRoomMembers.mockReturnValue({ members });
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'halo @bu');
    fireEvent.press(await screen.findByLabelText('Sebut Budi'));
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('halo @Budi '),
    );
    // User menghapus mention, ganti teks polos (re-query node pasca re-render pick).
    fireEvent.changeText(screen.getByPlaceholderText('Tulis pesan…'), 'halo semua');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('halo semua'),
    );
    fireEvent.press(screen.getByLabelText('Kirim pesan'));
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith('halo semua', [], expect.any(Object)),
    );
  });
});
