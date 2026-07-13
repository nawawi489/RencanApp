// Layar Chat room — UI-S-IN2/IN3/IN4. Bubble me/them (useAuth), Avatar+nama untuk them,
// date divider device-tz, banner governance, composer circular accessibilityLabel='Kirim pesan'.
// Pola mock per Critic §8.3: useAuth via `let mockSession` yang dibaca LAZY di factory.
// Pola mock per Critic §8.7: case existing 'data → kirim' di-rewrite ke label baru + mock useAuth.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/cards', () => ({ getActionPlan: jest.fn().mockResolvedValue(null) }));

// expo-router params — mutable per-test (Critic §8.3 pattern).
let mockRoomParams: { roomId?: string } = { roomId: 'r1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRoomParams,
  useRouter: () => ({ push: jest.fn() }),
}));

// useAuth — Critic §8.3: factory baca `mockSession` lazy di body fungsi (TDZ-safe).
let mockSession: { user: { id: string } } | null = { user: { id: 'me' } };
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ session: mockSession }),
}));

const mockUseChatMessages = jest.fn();
const mockSend = jest.fn();
const mockMarkRead = jest.fn();
const mockToggleReaction = jest.fn();
let mockIsSending = false;
let mockIsTogglingReaction = false;
const mockLoadOlder = jest.fn();
jest.mock('@/hooks/use-inbox', () => ({
  useChatMessages: (...a: unknown[]) => mockUseChatMessages(...a),
  useChatActions: () => ({
    send: mockSend,
    markRead: mockMarkRead,
    isSending: mockIsSending,
    toggleReaction: (...a: unknown[]) => mockToggleReaction(...a),
    isTogglingReaction: mockIsTogglingReaction,
  }),
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

/** Factory kontrak return `useChatMessages` — kunci tunggal utk baseline default (mis.
 * `isFetchingNextPage:false` kontrak baru Fase B) sehingga tiap test cukup override field
 * yg relevan. Mencegah test lama patah senyap saat screen mulai membaca field baru. */
function makeChatMessagesState(
  overrides: Partial<{
    messages: unknown[];
    isLoading: boolean;
    isError: boolean;
    refetch: unknown;
    loadOlder: unknown;
    hasMore: boolean;
    isFetchingNextPage: boolean;
  }> = {},
) {
  return {
    messages: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    loadOlder: mockLoadOlder,
    hasMore: false,
    isFetchingNextPage: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockUseChatMessages.mockReset();
  mockSend.mockReset();
  mockMarkRead.mockReset();
  mockToggleReaction.mockReset();
  mockLoadOlder.mockReset();
  mockSend.mockResolvedValue('m2');
  mockMarkRead.mockResolvedValue(0);
  mockToggleReaction.mockResolvedValue(true);
  mockSession = { user: { id: 'me' } };
  mockRoomParams = { roomId: 'r1' };
  mockIsSending = false;
  mockIsTogglingReaction = false;
  mockUseChatMessages.mockReturnValue(makeChatMessagesState());
});

describe('ChatRoomScreen — state dasar (existing)', () => {
  it('loading → skeleton aksesibel "Memuat…"', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({ isLoading: true }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.getByLabelText('Memuat…')).toBeTruthy();
  });

  it('error → ErrorState (role alert) + retry', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({ isError: true }));
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
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        { id: 'm1', chat_room_id: 'r1', author_id: 'u1', body: 'Halo tim', created_at: '2026-06-24T01:00:00Z' },
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Halo tim')).toBeTruthy();

    const input = screen.getByPlaceholderText('Tulis pesan…');
    fireEvent.changeText(input, 'Pesan baru');
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe('Pesan baru'));
    fireEvent.press(screen.getByLabelText('Kirim pesan'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('Pesan baru', [], undefined));
    await waitFor(() => expect(screen.getByPlaceholderText('Tulis pesan…').props.value).toBe(''));
  });
});

// =========================================================== UI-S-IN2: bubble me/them, urutan, identitas, divider ==========================================================
describe('ChatRoomScreen — UI-S-IN2 bubble & divider', () => {
  it('[E1] data render newest-first (desc) — VISUAL kronologis dijamin `inverted` FlatList (owner §10)', async () => {
    // hook memberi desc: ['m-newer','m-older']. Sesudah owner §10, data layer tidak lagi
    // membalik urutan — FlatList `inverted` yang membalik VISUAL. Di TREE toJSON(), 'baru'
    // (newest, data[0]) muncul LEBIH DULU dari 'lama'. Visual kronologis diverifikasi
    // terpisah oleh [E-KP-U1/U2] (inverted prop + data[0]=newest).
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        { id: 'm-newer', chat_room_id: 'r1', author_id: 'me', body: 'baru',  created_at: '2026-06-24T05:00:00Z' },
        { id: 'm-older', chat_room_id: 'r1', author_id: 'me', body: 'lama', created_at: '2026-06-24T01:00:00Z' },
      ],
    }));
    const { toJSON } = await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await screen.findByText('baru');
    const dump = JSON.stringify(toJSON());
    const idxLama = dump.indexOf('"lama"');
    const idxBaru = dump.indexOf('"baru"');
    expect(idxLama).toBeGreaterThan(-1);
    expect(idxBaru).toBeGreaterThan(-1);
    // Tree order = data desc order → 'baru' (index 0) sebelum 'lama' (index 1).
    expect(idxBaru).toBeLessThan(idxLama);
  });

  it('[E2] bubble me vs them — me (author_id == session.user.id) tidak punya nama pengirim di atas bubble', async () => {
    mockSession = { user: { id: 'me' } };
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        { id: 'mm', chat_room_id: 'r1', author_id: 'me',   body: 'milik saya', created_at: '2026-06-24T01:00:00Z',
          author: { id: 'me', full_name: 'Saya' } },
        { id: 'mt', chat_room_id: 'r1', author_id: 'them', body: 'milik them', created_at: '2026-06-24T02:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Nama 'Budi' (them) muncul; 'Saya' (me) TIDAK muncul sebagai header bubble.
    expect(await screen.findByText('Budi')).toBeTruthy();
    expect(screen.queryByText('Saya')).toBeNull();
  });

  it('[E3] identitas them: Avatar + nama tampil di atas bubble (author null → "?")', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        { id: 'mnull', chat_room_id: 'r1', author_id: null, body: 'sistem update', created_at: '2026-06-24T01:00:00Z' },
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Avatar inisial '?' + nama header '?' — keduanya hadir → findAllByText length ≥ 1.
    const qmarks = await screen.findAllByText('?');
    expect(qmarks.length).toBeGreaterThanOrEqual(1);
    // Avatar a11y label = displayName.
    expect(screen.getByLabelText('?')).toBeTruthy();
  });

  it('[E4] currentUserId kosong (session=null) → default semua "them"', async () => {
    mockSession = null;
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        { id: 'mx', chat_room_id: 'r1', author_id: 'me', body: 'meskipun id me', created_at: '2026-06-24T01:00:00Z',
          author: { id: 'me', full_name: 'Saya' } },
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Karena defaulting ke them, nama pengirim MUNCUL (untuk them ditampilkan).
    expect(await screen.findByText('Saya')).toBeTruthy();
  });

  it('[E5] date divider antar-hari — 2 hari beda muncul ≥1 chip "23 Jun" & ≥1 chip "24 Jun" (Critic §8.5 satu hari = tepat satu)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        { id: 'm24a', chat_room_id: 'r1', author_id: 'them', body: 'p2',  created_at: '2026-06-24T10:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
        { id: 'm24b', chat_room_id: 'r1', author_id: 'them', body: 'p2b', created_at: '2026-06-24T11:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
        { id: 'm23',  chat_room_id: 'r1', author_id: 'them', body: 'p1',  created_at: '2026-06-23T10:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // dua hari beda → minimum dua divider chip yang berbeda. Format date 'd MMM' (id-ID).
    expect(await screen.findAllByText(/\b23 Jun\b/)).toHaveLength(1);
    expect(screen.getAllByText(/\b24 Jun\b/)).toHaveLength(1); // satu hari = tepat satu divider
  });

  it('[E6] created_at INVALID → skip divider (tidak crash, pesan tetap render)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        { id: 'mok', chat_room_id: 'r1', author_id: 'them', body: 'oke', created_at: '2026-06-24T10:00:00Z',
          author: { id: 'them', full_name: 'Budi' } },
        { id: 'mbad', chat_room_id: 'r1', author_id: 'them', body: 'bad', created_at: 'not-a-date',
          author: { id: 'them', full_name: 'Budi' } },
      ],
    }));
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

  // [E13] "tombol Muat pesan lama" — DIHAPUS Fase D (owner §10: infinite-scroll-up
  // menggantikan tombol manual). Kontrak baru diverifikasi [E-KP-U3/U11].
  // eslint-disable-next-line no-restricted-syntax -- placeholder anchor untuk history diff
  it.skip('[E13-removed] tombol Muat pesan lama (moved to E-KP-U3/U11)', async () => {
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(mockLoadOlder).toHaveBeenCalled());
  });
});

// =========================================================== E-KP: infinite-scroll-up (owner §10) — inverted FlatList ==========================================================
// Kontrak render pengganti tombol "Muat pesan lama": data desc (newest-first) di-render oleh
// inverted FlatList (RN menampilkan data[0] di BAWAH, data[N] di ATAS → visual kronologis:
// oldest atas, newest bawah). onEndReached (= scroll ke atas mendekati item paling lama)
// memanggil loadOlder dgn guard hasMore && !isFetchingNextPage. Indicator "Memuat pesan lama"
// menggantikan tombol lama.
describe('ChatRoomScreen — E-KP infinite-scroll-up (owner §10)', () => {
  const sampleMsg = (id: string, ts: string, body = id) => ({
    id, chat_room_id: 'r1', author_id: 'me', body, created_at: ts,
    author: { id: 'me', full_name: 'Saya' },
  });

  it('[E-KP-U1] chat-list terekspos via testID + inverted=true (owner §10 render migration)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const list = await screen.findByTestId('chat-list');
    expect(list.props.inverted).toBe(true);
  });

  it('[E-KP-U2] data[0] = pesan TERBARU (data desc apa-adanya, TIDAK ada [...].reverse())', async () => {
    // Hook memberikan desc: [newer, older]. FlatList inverted membalik VISUAL — data tetap desc.
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        sampleMsg('m-newer', '2026-06-24T10:00:00Z', 'baru'),
        sampleMsg('m-older', '2026-06-24T05:00:00Z', 'lama'),
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const list = await screen.findByTestId('chat-list');
    const data = list.props.data as Array<{ type?: string; key?: string; msg?: { id: string } }>;
    // Item pertama data WAJIB pesan terbaru (id 'm-newer'). Divider chip boleh mendahului
    // seluruh data (visual TOP), tapi item pesan pertama = newer.
    const firstMsg = data.find((r) => r.type === 'message');
    expect(firstMsg?.msg?.id).toBe('m-newer');
  });

  it('[E-KP-U3] tombol "Muat pesan lama" DIHAPUS — tidak dirender meski hasMore=true', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
      hasMore: true,
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.queryByText(/Muat pesan lama/i)).toBeNull();
  });

  it('[E-KP-U11] tidak ada accessibilityRole=button dgn label "Muat pesan lama" (regresi anti-tombol)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
      hasMore: true,
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.queryByLabelText('Muat pesan lama')).toBeNull();
  });

  it('[E-KP-U4] onEndReached → loadOlder dipanggil (AC-21 pemicu scroll ke atas)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
      hasMore: true,
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const list = await screen.findByTestId('chat-list');
    // FlatList `onEndReached` di inverted view = mendekati ujung atas = pesan terlama.
    list.props.onEndReached?.();
    expect(mockLoadOlder).toHaveBeenCalled();
  });

  it('[E-KP-U5] hasMore=false → onEndReached NO-OP (guard, tak menyulut loadOlder berulang)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
      hasMore: false,
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const list = await screen.findByTestId('chat-list');
    list.props.onEndReached?.();
    expect(mockLoadOlder).not.toHaveBeenCalled();
  });

  it('[E-KP-U6] isFetchingNextPage=true → onEndReached NO-OP (guard, mencegah race saat batch berjalan)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
      hasMore: true,
      isFetchingNextPage: true,
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const list = await screen.findByTestId('chat-list');
    list.props.onEndReached?.();
    expect(mockLoadOlder).not.toHaveBeenCalled();
  });

  it('[E-KP-U7] indicator "Memuat pesan lama" muncul saat isFetchingNextPage=true (pengganti tombol)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
      hasMore: true,
      isFetchingNextPage: true,
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText(/Memuat pesan lama/i)).toBeTruthy();
  });

  it('[E-KP-U8] indicator TIDAK muncul saat isFetchingNextPage=false', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
      hasMore: true,
      isFetchingNextPage: false,
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(screen.queryByLabelText(/Memuat pesan lama/i)).toBeNull();
  });

  it('[E-KP-U9] day divider posisi TEPAT saat iterasi desc + inverted (critic §MC5/§MC6: order, bukan cuma count)', async () => {
    // Data desc yg diberi ke FlatList inverted: chip disisipkan SETELAH grup harian
    // saat iterasi desc, agar inverted menampilkan chip DI ATAS grup visual (kronologis).
    // Expected data (desc iteration order):
    //   [msg-24b, msg-24a, chip(24), msg-23, chip(23)]
    // FlatList inverted merender data[0] di BAWAH → visual top-to-bottom:
    //   chip(23), msg-23, chip(24), msg-24a, msg-24b ✓
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        sampleMsg('m24b', '2026-06-24T11:00:00Z', 'p2b'),
        sampleMsg('m24a', '2026-06-24T10:00:00Z', 'p2'),
        sampleMsg('m23',  '2026-06-23T10:00:00Z', 'p1'),
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const list = await screen.findByTestId('chat-list');
    const data = list.props.data as Array<{
      type: 'divider' | 'message';
      key: string;
      label?: string;
      msg?: { id: string };
    }>;

    // Cari indeks tiap item. Data harus mengandung: 3 msg + 2 divider.
    const msgIdxs = data.map((r, i) => (r.type === 'message' ? { i, id: r.msg!.id } : null)).filter(Boolean) as {i:number; id:string}[];
    const divIdxs = data.map((r, i) => (r.type === 'divider' ? { i, label: r.label! } : null)).filter(Boolean) as {i:number; label:string}[];

    expect(msgIdxs.map((x) => x.id)).toEqual(['m24b', 'm24a', 'm23']); // urutan pesan desc
    expect(divIdxs).toHaveLength(2);

    // Chip 24 Jun ada SETELAH pesan 24 Jun terakhir (m24a) DAN SEBELUM pesan 23 Jun.
    const iM24a = msgIdxs.find((x) => x.id === 'm24a')!.i;
    const iM23  = msgIdxs.find((x) => x.id === 'm23')!.i;
    const iChip24 = divIdxs.find((x) => /24/.test(x.label))!.i;
    const iChip23 = divIdxs.find((x) => /23/.test(x.label))!.i;

    expect(iChip24).toBeGreaterThan(iM24a);
    expect(iChip24).toBeLessThan(iM23);
    // Chip 23 Jun ada SETELAH pesan 23 Jun (indeks akhir array = visual TOP).
    expect(iChip23).toBeGreaterThan(iM23);
  });

  it('[E-KP-U10] keyExtractor mengembalikan id item (message.msg.id atau divider.key)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [sampleMsg('m1', '2026-06-24T10:00:00Z')],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const list = await screen.findByTestId('chat-list');
    const data = list.props.data as Array<{ type: string; key: string; msg?: { id: string } }>;
    // keyExtractor(item, index) — kontrak: kembalikan string unik.
    const kx = list.props.keyExtractor as (item: unknown, index: number) => string;
    expect(typeof kx).toBe('function');
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const k = kx(item, i);
      expect(typeof k).toBe('string');
      expect(k.length).toBeGreaterThan(0);
      // Untuk item pesan, key WAJIB memuat id pesan (stabil lintas re-render, bukan index).
      if (item.type === 'message' && item.msg) {
        expect(k).toContain(item.msg.id);
      }
    }
  });
});

// =========================================================== Reaction pill (FR-RX-4.x) — Fase D ==========================================================
describe('ChatRoomScreen — Reaction pill (FR-RX-4.x)', () => {
  const rxMsg = (id: string, reactions: { emoji: string; reactor_id: string }[], extra: Record<string, unknown> = {}) => ({
    id,
    chat_room_id: 'r1',
    author_id: 'other',
    body: `body-${id}`,
    created_at: '2026-07-10T10:00:00Z',
    author: { id: 'other', full_name: 'Andi', email: null },
    reactions,
    ...extra,
  });

  // [1] tidak merender pill row saat pesan tanpa reaksi
  it('[RX-UI-1] tidak merender pill saat reactions kosong/undefined', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await screen.findByText('body-m1');
    expect(screen.queryByLabelText(/^Reaksi /)).toBeNull();
  });

  // [2] agregasi count: dua reaktor emoji sama → satu pill count 2
  it('[RX-UI-2] agregasi count: 2 reaktor emoji sama → 1 pill count 2', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'a' }, { emoji: '👍', reactor_id: 'b' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await screen.findByText('body-m1');
    const pills = screen.queryAllByLabelText(/^Reaksi 👍/);
    expect(pills.length).toBe(1);
    expect(screen.getByLabelText('Reaksi 👍, 2, belum bereaksi')).toBeTruthy();
  });

  // [3] reactedByMe true saat currentUserId ada di reactor_id
  it('[RX-UI-3] reactedByMe=true → accessibilityState.selected=true', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'me' }, { emoji: '✅', reactor_id: 'other' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pillLike = await screen.findByLabelText(/Reaksi 👍.*saya sudah bereaksi/);
    const pillCheck = screen.getByLabelText(/Reaksi ✅.*belum bereaksi/);
    expect(pillLike.props.accessibilityState.selected).toBe(true);
    expect(pillCheck.props.accessibilityState.selected).toBe(false);
  });

  // [4] reactedByMe false saat session null
  it('[RX-UI-4] session=null → selected false, pill tetap render', async () => {
    mockSession = null;
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'someone' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    expect(pill.props.accessibilityState.selected).toBe(false);
  });

  // [5] touch target ≥44px via inline style numeric
  it('[RX-UI-5] touch target ≥44px via inline style numeric', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'a' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    const flat = Array.isArray(pill.props.style)
      ? Object.assign({}, ...pill.props.style.filter(Boolean))
      : (pill.props.style ?? {});
    expect((flat.minHeight ?? flat.height) >= 44).toBe(true);
    expect((flat.minWidth ?? flat.width) >= 44).toBe(true);
  });

  // [6] non-color signal untuk selected (border tebal atau ✓)
  it('[RX-UI-6] non-color signal: selected pill memiliki border ≥2 atau ✓', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'me' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/Reaksi 👍.*saya sudah bereaksi/);
    expect(pill.props.accessibilityState.selected).toBe(true);
    const flat = Array.isArray(pill.props.style)
      ? Object.assign({}, ...pill.props.style.filter(Boolean))
      : (pill.props.style ?? {});
    const hasCheck = within(pill).queryByText('✓') !== null;
    expect(hasCheck || (flat.borderWidth ?? 0) >= 2).toBe(true);
  });

  // [7] tap pill → toggleReaction(messageId, emoji)
  it('[RX-UI-7] tap pill memanggil toggleReaction(messageId, emoji)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'a' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    fireEvent.press(pill);
    await waitFor(() => expect(mockToggleReaction).toHaveBeenCalledTimes(1));
    expect(mockToggleReaction).toHaveBeenCalledWith('m1', '👍');
  });

  // [8] tap saat session null → no-op
  it('[RX-UI-8] session=null → tap pill no-op', async () => {
    mockSession = null;
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'x' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    fireEvent.press(pill);
    expect(mockToggleReaction).not.toHaveBeenCalled();
  });

  // [9] error toggle → alert inline tanpa merusak list pesan
  it('[RX-UI-9] error toggle → alert inline, list pesan tetap utuh', async () => {
    mockToggleReaction.mockRejectedValueOnce(new Error('boom'));
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        rxMsg('m1', [{ emoji: '👍', reactor_id: 'x' }]),
        rxMsg('m2', [], { body: 'Balasan' }),
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    fireEvent.press(pill);
    const alert = await screen.findByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.getByText('body-m1')).toBeTruthy();
    expect(screen.getByText('Balasan')).toBeTruthy();
  });

  // [10] multi-emoji ordering stabil via REACTION_EMOJI_ORDER
  it('[RX-UI-10] multi-emoji ordering stabil: 👍 → ✅ → 👀 (konstanta)', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [
        { emoji: '✅', reactor_id: 'a' },
        { emoji: '👍', reactor_id: 'a' },
        { emoji: '👀', reactor_id: 'b' },
      ])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pills = await screen.findAllByLabelText(/^Reaksi /);
    const labels = pills.map((p) => String(p.props.accessibilityLabel));
    expect(labels.length).toBe(3);
    expect(labels[0]).toMatch(/👍/);
    expect(labels[1]).toMatch(/✅/);
    expect(labels[2]).toMatch(/👀/);
  });

  // [11] isLoading tidak merender pill (skeleton path)
  it('[RX-UI-11] isLoading=true → no pill, no chat-list', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({ isLoading: true, messages: [] }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Memuat…');
    expect(screen.queryByLabelText(/^Reaksi /)).toBeNull();
    expect(screen.queryByTestId('chat-list')).toBeNull();
  });

  // [12] compat highlight — bubble ter-highlight tetap render pill
  it('[RX-UI-12] highlight compat — pill dirender dalam bubble ter-highlight', async () => {
    mockRoomParams = { roomId: 'r1' };
    // Inject highlight param
    jest.requireMock('expo-router').useLocalSearchParams = () => ({ roomId: 'r1', highlight: 'm1' });
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'x' }], { body: 'Pesan target' })],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    await screen.findByText('Pesan target');
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    expect(pill).toBeTruthy();
    // Restore
    jest.requireMock('expo-router').useLocalSearchParams = () => mockRoomParams;
  });

  // [13] pesan self (author=me) tetap menampilkan pill
  it('[RX-UI-13] self-react: bubble author=me tetap render pill selected', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'me' }], { author_id: 'me' })],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/Reaksi 👍.*saya sudah bereaksi/);
    expect(pill).toBeTruthy();
    expect(pill.props.accessibilityState.selected).toBe(true);
  });

  // [UI-14] pending-guard: isTogglingReaction=true → tap no-op
  it('[RX-UI-14] isTogglingReaction=true → tap pill no-op', async () => {
    mockIsTogglingReaction = true;
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'a' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    fireEvent.press(pill);
    expect(mockToggleReaction).not.toHaveBeenCalled();
  });

  // [UI-15] alert clears setelah sukses berikutnya
  it('[RX-UI-15] alert clears setelah toggle sukses berikutnya', async () => {
    mockToggleReaction.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(true);
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [
        { emoji: '👍', reactor_id: 'a' },
        { emoji: '✅', reactor_id: 'b' },
      ])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    // Tap pertama gagal
    const pill1 = await screen.findByLabelText(/^Reaksi 👍/);
    fireEvent.press(pill1);
    await screen.findByRole('alert');
    // Tap kedua sukses → alert clears
    const pill2 = screen.getByLabelText(/^Reaksi ✅/);
    fireEvent.press(pill2);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  // [UI-16] accessibilityLabel exact copy dgn digit
  it('[RX-UI-16] accessibilityLabel exact copy: "Reaksi 👍, 2, belum bereaksi"', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [rxMsg('m1', [{ emoji: '👍', reactor_id: 'a' }, { emoji: '👍', reactor_id: 'b' }])],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    const pill = await screen.findByLabelText(/^Reaksi 👍/);
    expect(pill.props.accessibilityLabel).toBe('Reaksi 👍, 2, belum bereaksi');
  });

  // [UI-17] wiring per-item: dua bubble reaksi berbeda
  it('[RX-UI-17] wiring per-item: dua bubble dgn reaksi berbeda dirender terpisah', async () => {
    mockUseChatMessages.mockReturnValue(makeChatMessagesState({
      messages: [
        rxMsg('m1', [{ emoji: '👍', reactor_id: 'a' }]),
        rxMsg('m2', [{ emoji: '✅', reactor_id: 'b' }, { emoji: '✅', reactor_id: 'c' }]),
      ],
    }));
    await render(<ChatRoomScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Reaksi 👍, 1, belum bereaksi')).toBeTruthy();
    expect(screen.getByLabelText('Reaksi ✅, 2, belum bereaksi')).toBeTruthy();
  });
});
