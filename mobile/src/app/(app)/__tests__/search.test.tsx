// BL-10 PR-1 — layar Search (W6c).
//
// URUTAN BERKAS MENGIKAT: seluruh test yang MENEKAN tombol ada di blok terakhir.
// Menekan Pressable ber-`active:` di jest membuat render test BERIKUTNYA kosong
// (memori rn-css-pressable-test-blank-render) — gejalanya tampak seperti komponen rusak.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// lib/search.ts mengimpor supabase → env.ts, yang melempar tanpa .env di lingkungan test.
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

const mockUseSearchGlobal = jest.fn();
const mockUseSearchScopePage = jest.fn();
jest.mock('@/hooks/use-search-global', () => ({
  ...jest.requireActual('@/hooks/use-search-global'),
  useSearchGlobal: (...a: unknown[]) => mockUseSearchGlobal(...a),
  useSearchScopePage: (...a: unknown[]) => mockUseSearchScopePage(...a),
}));

const mockCan = jest.fn(() => true);
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'u1' }, isLoading: false, can: mockCan }),
}));

// NG-6: layar baru tidak boleh menyentuh jalur lama sama sekali.
const mockUseSearchCards = jest.fn();
jest.mock('@/hooks/use-search', () => ({
  __esModule: true,
  useSearchCards: (...a: unknown[]) => mockUseSearchCards(...a),
}));

// eslint-disable-next-line import/first
import { LiveSearchScreen } from '../search';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  W.displayName = 'W';
  return W;
}

/**
 * Kumpulkan HANYA teks terlihat, berurutan sesuai pohon.
 *
 * `JSON.stringify(screen.toJSON())` tidak bisa dipakai: props memuat context Provider
 * sehingga strukturnya sirkular dan stringify melempar. Lebih buruk lagi, di suite yang
 * pohonnya kebetulan kosong ia TIDAK melempar — sehingga assertion berbasis stringify
 * bisa lolos secara palsu. Helper ini mengabaikan props sepenuhnya.
 */
function visibleTexts(node: unknown): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(visibleTexts);
  const children = (node as { children?: unknown }).children;
  return children ? visibleTexts(children) : [];
}

const hit = (over: Partial<Record<string, unknown>> = {}) => ({
  scope: 'goal', id: 'g1', parentId: null, title: 'Goal Satu', subtitle: null,
  snippet: null, status: 'active', sortTs: '2026-07-22T00:00:00Z', sortId: 'g1', ...over,
});

function state(over: Partial<Record<string, unknown>> = {}) {
  return {
    hits: [], isLoading: false, isError: false, isRpcMissing: false,
    enabled: true, trimmed: 'abc', ...over,
  };
}

beforeEach(() => {
  mockPush.mockReset();
  mockCan.mockReset().mockReturnValue(true);
  mockUseSearchCards.mockReset();
  mockUseSearchGlobal.mockReset().mockReturnValue(state());
  mockUseSearchScopePage.mockReset().mockReturnValue({
    hits: [], fetchNextPage: jest.fn(), hasNextPage: false,
    isFetchingNextPage: false, isLoading: false, isError: false, isRpcMissing: false,
  });
});

describe('scope audit (BL-10d)', () => {
  it('[BL10-UI-24] pemegang permission melihat label "Log Aktivitas"', async () => {
    mockCan.mockImplementation(() => true);
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'activity_log', id: 'al1', parentId: 'g1',
                   title: 'Sasaran A', subtitle: 'create', sortId: 'al1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Log Aktivitas')).toBeTruthy();
    expect(screen.queryByText('Aktivitas Saya')).toBeNull();
  });

  it('[BL10-UI-25] TANPA permission, label jadi "Aktivitas Saya" (FR-10)', async () => {
    // Perbedaan label ini fungsi permission PEMANGGIL SENDIRI — sesuatu yang sudah ia
    // ketahui — jadi ia bukan oracle atas data pihak lain.
    mockCan.mockImplementation(() => false);
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'activity_log', id: 'al1', parentId: 'g1',
                   title: 'Sasaran A', subtitle: 'update', sortId: 'al1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Aktivitas Saya')).toBeTruthy();
    expect(screen.queryByText('Log Aktivitas')).toBeNull();
  });

  it('[BL10-UI-26] label governance juga bervarian menurut permission', async () => {
    mockCan.mockImplementation(() => false);
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'governance_violation', id: 'gv1', parentId: 'g1',
                   title: 'Sasaran A', subtitle: 'self_approval_attempt · high', sortId: 'gv1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Catatan Governance Saya')).toBeTruthy();
  });
});

describe('render', () => {
  it('[BL10-UI-01] kotak pencarian tampil', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ enabled: false, trimmed: '' }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Kotak pencarian')).toBeTruthy();
  });

  it('[BL10-UI-02] hasil dikelompokkan per scope dengan header label bisnis', async () => {
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit(), hit({ scope: 'chat', id: 'c1', title: 'Ruang A', sortId: 'c1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Goal')).toBeTruthy();     // label §6.1
    expect(screen.getByText('Pesan')).toBeTruthy();
    expect(screen.getByText('Goal Satu')).toBeTruthy();
  });

  it('[BL10-UI-03] urutan section mengikuti konstanta, bukan urutan kedatangan', async () => {
    // chat datang DULU di array; section Goal tetap harus di atas Pesan (§6.1).
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'chat', id: 'c1', title: 'Ruang A', sortId: 'c1' }), hit()],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    const texts = visibleTexts(screen.toJSON());
    expect(texts).toContain('Goal');
    expect(texts).toContain('Pesan');
    expect(texts.indexOf('Goal')).toBeLessThan(texts.indexOf('Pesan'));
  });

  it('[BL10-UI-04] grup TANPA hasil tidak dirender (anti-oracle FR-16)', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ hits: [hit()] }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Goal')).toBeTruthy();
    for (const absent of ['Strategi', 'Inisiatif', 'Rencana Aksi', 'Tugas', 'Pesan',
                          'Area Pengembangan', 'Problem Statement']) {
      expect(screen.queryByText(absent)).toBeNull();
    }
  });

  it('[BL10-UI-05] payload render IDENTIK untuk dua sebab kekosongan', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ hits: [], trimmed: 'tidak-cocok' }));
    const a = await render(<LiveSearchScreen />, { wrapper: wrapper() });
    const snapA = visibleTexts(a.toJSON()).join(String.fromCharCode(124));
    await act(async () => { a.unmount(); });

    mockUseSearchGlobal.mockReturnValue(state({ hits: [], trimmed: 'tersaring-otorisasi' }));
    const b = await render(<LiveSearchScreen />, { wrapper: wrapper() });
    const snapB = visibleTexts(b.toJSON()).join(String.fromCharCode(124));

    expect(snapA).toBe(snapB);
  });

  it('[BL10-UI-06] tanpa count apa pun (jumlah hasil = oracle)', async () => {
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit(), hit({ id: 'g2', title: 'Goal Dua', sortId: 'g2' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    const json = visibleTexts(screen.toJSON()).join(String.fromCharCode(124));
    expect(json).not.toMatch(/\(\s*\d+\s*\)/);        // "Goal (2)"
    expect(json).not.toMatch(/\d+\s*hasil/i);         // "2 hasil"
    expect(json).not.toMatch(/disembunyikan/i);       // "N disembunyikan"
  });

  it('[BL10-UI-07] loading → skeleton', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ isLoading: true }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Memuat…')).toBeTruthy();
  });

  it('[BL10-UI-08] PGRST202 → pesan degrade, bukan crash', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ isError: true, isRpcMissing: true }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect((await screen.findAllByText(/belum aktif/i)).length).toBeGreaterThan(0);
  });

  it('[BL10-UI-10] hasil read-only: tanpa kontrol mutasi', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ hits: [hit()] }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    await screen.findByText('Goal Satu');
    for (const label of [/hapus card/i, /arsipkan/i, /setujui/i, /tolak/i, /ubah/i]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('[BL10-UI-16] NG-6 — hook lama tidak pernah dipakai', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ hits: [hit()] }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    await screen.findByText('Goal Satu');
    expect(mockUseSearchCards).not.toHaveBeenCalled();
  });

  it('[BL10-UI-17] query < 2 char → ajakan mulai, bukan "tidak ada hasil"', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ enabled: false, trimmed: 'a', hits: [] }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Mulai mencari/i)).toBeTruthy();
  });
});

// ============================================================================
// INTERAKSI — blok TERAKHIR (memori rn-css-pressable-test-blank-render)
// ============================================================================
describe('interaksi', () => {
  it('[BL10-UI-12] tap baris card → push rute detail', async () => {
    mockUseSearchGlobal.mockReturnValue(state({ hits: [hit()] }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Goal Satu'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/goal/g1'));
  });

  it('[BL10-UI-18] tap baris people → profil (BL-10b)', async () => {
    // `ENTITY_ROUTE_SEGMENT` ber-key `CardEntityType` (7 tipe card) dan TIDAK BOLEH
    // diubah (NG-7). Rute People karena itu ditangani terpisah di `hrefForHit`,
    // pola yang sama dengan chat.
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'people', id: 'u9', title: 'Dewi Anggraini',
                   subtitle: 'Analis Riset', sortId: 'u9' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Dewi Anggraini'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/people-profile/u9'));
  });

  it('[BL10-UI-19] tap baris task_instance → layar instance (BL-10c)', async () => {
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'task_instance', id: 'ti1', parentId: 'tk1',
                   title: 'Tugas Induk', subtitle: '2026-07-23 · missed', sortId: 'ti1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Tugas Induk'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/task/instance/ti1'));
  });

  it('[BL10-UI-20] tap baris evidence → Task induknya (BL-10c)', async () => {
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'evidence', id: 'ev1', parentId: 'tk9',
                   title: 'laporan.pdf', subtitle: 'Tugas A', sortId: 'ev1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('laporan.pdf'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/task/tk9'));
  });

  it('[BL10-UI-21] komentar ber-literal WARISAN `action_plan` tetap dapat dirute', async () => {
    // Rename 0045 tidak memigrasi nilai data; literal lama masih sah tersimpan (§6.4).
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'comment', id: 'c1', parentId: 'tk5',
                   title: 'Tugas B', subtitle: 'action_plan', sortId: 'c1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Tugas B'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/task/tk5'));
  });

  it('[BL10-UI-22] komentar pada Inisiatif → rute inisiatif, bukan /task', async () => {
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'comment', id: 'c2', parentId: 'in7',
                   title: 'Inisiatif C', subtitle: 'initiative', sortId: 'c2' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Inisiatif C'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/initiative/in7'));
  });

  it('[BL10-UI-23] komentar ber-literal tak dikenal TIDAK dapat ditekan (fail-closed)', async () => {
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'comment', id: 'c3', parentId: 'zz1',
                   title: 'Entah', subtitle: 'entitas_masa_depan', sortId: 'c3' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Entah'));
    // Tidak ada rute tebakan: lebih baik baris mati daripada push path rusak.
    await waitFor(() => expect(mockPush).not.toHaveBeenCalled());
  });

  it('[BL10-UI-14] tap baris chat → deep-link ke room dgn highlight', async () => {
    mockUseSearchGlobal.mockReturnValue(state({
      hits: [hit({ scope: 'chat', id: 'm1', parentId: 'r1', title: 'Ruang A', sortId: 'm1' })],
    }));
    await render(<LiveSearchScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByText('Ruang A'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/inbox/r1?highlight=m1'));
  });
});
