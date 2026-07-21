// BL-02 / PRD §44 AC-11 — Periode Strategi mengikuti Goal induk (PRD §12.1 baris 540-544:
// "Strategy tidak punya masa berlaku sendiri karena mengikuti Goal tahunan").
//
// Kontrak yang dikunci di sini:
//   1. Form TIDAK lagi merender input tanggal (DateRangeField) — periode bukan milik user.
//   2. Periode warisan tampil READ-ONLY sebagai konteks.
//   3. createStrategy menerima period_start/period_end MILIK GOAL, bukan string kosong/null.
//   4. Goal induk tanpa periode → simpan diblokir (bukan mengirim NULL diam-diam), karena
//      `activate_strategy` (0078) mem-gate period_start/period_end NOT NULL.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockCreate = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useStrategyActions: () => ({ create: mockCreate, isPending: false }),
  usePerson: () => ({ person: null, isLoading: false }),
}));

const mockGetGoal = jest.fn();
jest.mock('@/lib/goals', () => ({
  __esModule: true,
  getGoal: (id: string) => mockGetGoal(id),
  listStrategyTemplates: jest.fn().mockResolvedValue([]),
}));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => ({ goalId: 'g1' }),
}));

// eslint-disable-next-line import/first
import { LiveNewStrategyScreen } from '../new';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const GOAL = {
  id: 'g1',
  name: 'Tumbuhkan pendapatan',
  goal_template_id: null,
  pic_id: null,
  period_start: '2026-01-01',
  period_end: '2026-12-31',
};

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ id: 's1' });
  mockGetGoal.mockReset().mockResolvedValue(GOAL);
  mockReplace.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

/**
 * Render + isi field wajib. `periodLabel` = teks periode warisan yang harus sudah terender
 * sebelum submit — menunggu ini (bukan sekadar "getGoal dipanggil") memastikan data Goal
 * benar-benar sampai, jadi assert soal periode tidak balapan dengan query.
 */
async function renderAndFill(periodLabel: string) {
  // `await render` (pola [E0] inbox/[roomId].test.tsx): `screen` belum terikat sampai tick
  // berikutnya di setup ini — akses langsung melempar "render function has not been called".
  await render(createElement(LiveNewStrategyScreen), { wrapper: wrapper() });
  await screen.findByText(periodLabel);
  // setState dari fireEvent butuh flush eksplisit sebelum event berikutnya (pola [E0]
  // di inbox/[roomId].test.tsx) — tanpa await, submit membaca state kosong.
  await typeInto('Nama Strategi', 'Pertumbuhan Pendapatan');
  await typeInto('Target', 'Naik 20% YoY');
  await typeInto('Ekspektasi Hasil', 'Pendapatan naik');
}

async function typeInto(label: string, text: string) {
  fireEvent.changeText(screen.getByLabelText(label), text);
  await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(text));
}

describe('NewStrategyScreen — periode mengikuti Goal (BL-02 / AC-11)', () => {
  it('[BL02-1] tidak merender input tanggal; periode Goal tampil read-only', async () => {
    // `await render` (pola [E0] inbox/[roomId].test.tsx): `screen` belum terikat sampai tick
    // berikutnya di setup ini — akses langsung melempar "render function has not been called".
    await render(createElement(LiveNewStrategyScreen), { wrapper: wrapper() });
    // findBy*, BUKAN waitFor(getGoal dipanggil): "dipanggil" hanya berarti query start —
    // periode baru terender setelah datanya resolve. Tanpa ini test balapan dgn query.
    expect(await screen.findByText('2026-01-01 → 2026-12-31')).toBeTruthy();

    expect(screen.queryByLabelText('Tanggal Mulai')).toBeNull();
    expect(screen.queryByLabelText('Tanggal Selesai')).toBeNull();
    expect(screen.getByText('Periode (mengikuti Goal)')).toBeTruthy();
  });

  it('[BL02-2] createStrategy dikirim dengan periode milik Goal, bukan null', async () => {
    await renderAndFill('2026-01-01 → 2026-12-31');
    fireEvent.press(screen.getByLabelText('Simpan sebagai Draft'));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      goal_id: 'g1',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    });
  });

  it('[BL02-3] Goal tanpa periode → simpan diblokir, tidak mengirim NULL diam-diam', async () => {
    mockGetGoal.mockResolvedValue({ ...GOAL, period_start: null, period_end: null });
    await renderAndFill('Goal induk belum punya periode');
    fireEvent.press(screen.getByLabelText('Simpan sebagai Draft'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Periode Goal belum diisi', expect.any(String)));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // BL02-4/5 memisahkan dua sebab blokir yang sebelumnya berbagi satu kalimat. Keduanya
  // sama-sama memblokir, tapi perbaikannya beda: yang satu isi periode di Goal, yang satu
  // soal akses/rute. Ditemukan saat menjalankan layar ini di app lokal — Goal seed berada
  // di org lain sehingga RLS memulangkan null, dan copy-nya menuduh "belum punya periode".
  it('[BL02-4] Goal tak terbaca (RLS/dihapus) → copy "tidak ditemukan", BUKAN "belum punya periode"', async () => {
    mockGetGoal.mockResolvedValue(null); // getGoal maybeSingle → null saat RLS menyaring habis
    await renderAndFill('Goal induk tidak ditemukan');

    expect(screen.queryByText('Goal induk belum punya periode')).toBeNull();
    fireEvent.press(screen.getByLabelText('Simpan sebagai Draft'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Goal induk tidak ditemukan', expect.stringContaining('di luar akses')),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('[BL02-5] query Goal gagal → copy "gagal dimuat", tidak menuduh data Goal kosong', async () => {
    mockGetGoal.mockRejectedValue(new Error('network'));
    await renderAndFill('Gagal memuat Goal induk');

    expect(screen.queryByText('Goal induk belum punya periode')).toBeNull();
    expect(screen.queryByText('Goal induk tidak ditemukan')).toBeNull();
    fireEvent.press(screen.getByLabelText('Simpan sebagai Draft'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Goal induk gagal dimuat', expect.any(String)));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
