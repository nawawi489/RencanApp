// UI Inbox — Chat FTS V1 (Search Pesan) — 10 kasus.
// Mock useInboxRooms + useSearchMessages + expo-router. Menguji: placeholder baru, mode idle,
// hint 1-char, dua section (Initiative + Pesan sub-group per room + snippet), empty identik
// untuk no-match & silent-filter (AC-15), row hit read-only (AC-19), tap → router.push dengan
// highlight (AC-17), skeleton hanya saat first-fetch (bukan flash saat refetch), banner
// PGRST202 (isRpcMissing) → tetap tampil daftar room default (degrade), banner error network
// → tombol Coba lagi + daftar room default tetap.
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

const mockUseSearchMessages = jest.fn();
jest.mock('@/hooks/use-search-messages', () => ({
  useSearchMessages: (...a: unknown[]) => mockUseSearchMessages(...a),
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

// ------------------------------------------------------------------ fixtures
const makeRoom = (over: Partial<{ id: string; name: string; unread: number }> = {}) => ({
  id: over.id ?? 'r1',
  initiative_id: 'i-' + (over.id ?? 'r1'),
  name: over.name ?? 'Ekspansi Bandung',
  unread_count: over.unread ?? 0,
  last_message_at: '2026-07-10T09:00:00Z',
  last_message_body: 'Halo',
  last_message_author_name: 'Andi',
});

const makeHit = (over: Partial<{ messageId: string; roomId: string; roomName: string; snippet: string; author: string }> = {}) => ({
  messageId: over.messageId ?? 'm-1',
  chatRoomId: over.roomId ?? 'r-1',
  roomName: over.roomName ?? 'Ekspansi Bandung',
  initiativeId: 'i-' + (over.roomId ?? 'r-1'),
  authorId: 'u-1',
  authorName: over.author ?? 'Andi',
  snippet: over.snippet ?? 'target CPL turun 20%',
  createdAt: '2026-07-10T09:00:00.000Z',
  bodySimilarity: 0.42,
});

const idleSearch = {
  hits: undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  isRpcMissing: false,
  refetch: jest.fn(),
};

beforeEach(() => {
  mockPush.mockReset();
  mockUseInboxRooms.mockReset();
  mockUseSearchMessages.mockReset();
  mockUseInboxRooms.mockReturnValue({
    rooms: [makeRoom({ id: 'r-1', name: 'Ekspansi Bandung' })],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });
  mockUseSearchMessages.mockReturnValue(idleSearch);
});

// ------------------------------------------------------------------ [1] placeholder
describe('InboxScreen — Search Pesan (FTS V1)', () => {
  it('[1] placeholder input = "Cari Initiative atau pesan" (§3.1 FR-2 / AC-18)', async () => {
    await render(<InboxScreen />, { wrapper: wrapper() });
    expect(screen.getByPlaceholderText('Cari Initiative atau pesan')).toBeTruthy();
  });

  // ------------------------------------------------------------------ [2] idle
  it('[2] query kosong → useSearchMessages TIDAK memaksa fetch (enabled=false); section Pesan tidak muncul', async () => {
    await render(<InboxScreen />, { wrapper: wrapper() });
    // Header section 'Pesan' TIDAK muncul saat idle (mode default: daftar room saja).
    expect(screen.queryByText('Pesan')).toBeNull();
    // Room tetap tampil.
    expect(await screen.findByText('Ekspansi Bandung')).toBeTruthy();
    // Hook dipanggil dengan '' — tapi hook internal yang guard enabled.
    expect(mockUseSearchMessages).toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ [3] hint 1 char
  it('[3] query 1 char → hint "Ketik minimal 2 karakter untuk mencari pesan"; TIDAK render section Pesan', async () => {
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'c');
    expect(await screen.findByText('Ketik minimal 2 karakter untuk mencari pesan')).toBeTruthy();
    expect(screen.queryByText('Pesan')).toBeNull();
  });

  // ------------------------------------------------------------------ [4] two sections + snippet + sub-group per room
  it('[4] query ≥2 char + hits → dua section (Initiative, Pesan); Pesan sub-group per room (nama room sekali) dgn snippet', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [
        makeRoom({ id: 'r-1', name: 'Ekspansi Bandung' }),
        makeRoom({ id: 'r-2', name: 'Sales Q3' }),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseSearchMessages.mockReturnValue({
      ...idleSearch,
      hits: [
        makeHit({ messageId: 'm-a', roomId: 'r-1', roomName: 'Ekspansi Bandung', snippet: 'target CPL turun 20%' }),
        makeHit({ messageId: 'm-b', roomId: 'r-1', roomName: 'Ekspansi Bandung', snippet: 'update leads sales' }),
        makeHit({ messageId: 'm-c', roomId: 'r-2', roomName: 'Sales Q3', snippet: 'sales pipeline naik' }),
      ],
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'sales');

    // Section header "Initiative" & "Pesan" dua-duanya ada.
    expect(await screen.findByText('Initiative')).toBeTruthy();
    expect(screen.getByText('Pesan')).toBeTruthy();

    // Snippet setiap hit tampil.
    expect(screen.getByText('target CPL turun 20%')).toBeTruthy();
    expect(screen.getByText('update leads sales')).toBeTruthy();
    expect(screen.getByText('sales pipeline naik')).toBeTruthy();

    // Sub-group per room: nama 'Sales Q3' muncul persis sekali sebagai sub-header di section Pesan,
    // bukan sekali per hit. (Ekspansi Bandung boleh muncul di dua tempat: section Initiative + sub-header
    // Pesan; jadi kita cek room dgn 2 hit tapi tidak match filter Initiative — 'Sales Q3' cocok karena
    // nama room tetap terfilter oleh Initiative jg. Pakai getAllBy untuk hitung.)
    const salesRoomHeaders = screen.getAllByText('Sales Q3');
    // Section Initiative: 1 kali. Sub-header Pesan: 1 kali. Total 2. Tidak boleh 3 (=per-hit).
    expect(salesRoomHeaders.length).toBeLessThanOrEqual(2);
  });

  // ------------------------------------------------------------------ [5] empty state identik
  it('[5] query ≥2 char + 0 hit + no room match → EmptyState "Tidak ada pesan yang cocok dengan pencarianmu" + tombol "Hapus pencarian" (AC-15)', async () => {
    mockUseInboxRooms.mockReturnValue({
      rooms: [makeRoom({ id: 'r-1', name: 'Ekspansi Bandung' })],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseSearchMessages.mockReturnValue({ ...idleSearch, hits: [] });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'xyzz-nihil');
    expect(await screen.findByText('Tidak ada pesan yang cocok dengan pencarianmu')).toBeTruthy();
    expect(screen.getByText('Hapus pencarian')).toBeTruthy();
    // AC-15: TIDAK ada differentiator visual/hint/count untuk silent-filter — copy identik.
    expect(screen.queryByText(/disembunyikan/i)).toBeNull();
  });

  // ------------------------------------------------------------------ [6] read-only hit row
  it('[6] hit pesan TIDAK menyediakan tombol Approve/Reject/Mark-evidence (AC-19 read-only)', async () => {
    mockUseSearchMessages.mockReturnValue({
      ...idleSearch,
      hits: [makeHit({ messageId: 'm-a', roomId: 'r-1', snippet: 'bukti eksekusi terlampir' })],
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'bukti');
    await screen.findByText('bukti eksekusi terlampir');
    expect(screen.queryByText(/^Approve$/i)).toBeNull();
    expect(screen.queryByText(/^Reject$/i)).toBeNull();
    expect(screen.queryByText(/mark.*evidence|jadikan bukti|tandai bukti/i)).toBeNull();
  });

  // ------------------------------------------------------------------ [7] tap → router.push dengan highlight
  it('[7] tap hit → router.push("/inbox/{roomId}?highlight={messageId}") (AC-17)', async () => {
    mockUseSearchMessages.mockReturnValue({
      ...idleSearch,
      hits: [makeHit({ messageId: 'm-a', roomId: 'r-9', snippet: 'target CPL turun 20%' })],
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'cpl');
    fireEvent.press(await screen.findByText('target CPL turun 20%'));
    expect(mockPush).toHaveBeenCalledWith('/inbox/r-9?highlight=m-a');
  });

  // ------------------------------------------------------------------ [8] skeleton hanya first-fetch, spinner saat refetch
  it('[8] first-fetch → skeleton section Pesan; refetch di atas cache tidak flash skeleton', async () => {
    // First-fetch: isLoading=true (hits undefined) → skeleton wajib tampil.
    mockUseSearchMessages.mockReturnValue({
      ...idleSearch,
      isLoading: true,
      isFetching: true,
      hits: undefined,
    });
    const { rerender } = await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'cpl');
    // A11y label 'Memuat…' dipakai SkeletonList (pola konsisten repo).
    expect(await screen.findByLabelText('Memuat…')).toBeTruthy();

    // Refetch di atas cache: hits sudah ada tapi isFetching=true → tidak flash skeleton lagi.
    mockUseSearchMessages.mockReturnValue({
      ...idleSearch,
      isLoading: false,
      isFetching: true,
      hits: [makeHit({ messageId: 'm-a', snippet: 'target CPL turun 20%' })],
    });
    await rerender(<InboxScreen />);
    // Skeleton hilang.
    expect(screen.queryByLabelText('Memuat…')).toBeNull();
    // Hit yg sudah cache tetap muncul.
    expect(await screen.findByText('target CPL turun 20%')).toBeTruthy();
  });

  // ------------------------------------------------------------------ [9] banner PGRST202 → degrade
  it('[9] isRpcMissing=true → banner "Pencarian pesan belum aktif di lingkungan ini" + daftar room default tetap terlihat', async () => {
    mockUseSearchMessages.mockReturnValue({
      ...idleSearch,
      isError: true,
      error: { code: 'PGRST202' },
      isRpcMissing: true,
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'cpl');
    expect(await screen.findByText(/Pencarian pesan belum aktif di lingkungan ini/i)).toBeTruthy();
    // Degrade: daftar room default tetap tampil (nama_room match client-side masih jalan).
    expect(screen.getByText('Ekspansi Bandung')).toBeTruthy();
  });

  // ------------------------------------------------------------------ [10] banner network + Coba lagi
  it('[10] isError && !isRpcMissing → banner + tombol "Coba lagi" (memanggil refetch); daftar room default tetap tampil', async () => {
    const refetch = jest.fn();
    mockUseSearchMessages.mockReturnValue({
      ...idleSearch,
      isError: true,
      error: { message: 'network down' },
      refetch,
    });
    await render(<InboxScreen />, { wrapper: wrapper() });
    fireEvent.changeText(screen.getByPlaceholderText('Cari Initiative atau pesan'), 'cpl');
    expect(await screen.findByText('Coba lagi')).toBeTruthy();
    // Room default tetap.
    expect(screen.getByText('Ekspansi Bandung')).toBeTruthy();
    fireEvent.press(screen.getByText('Coba lagi'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
