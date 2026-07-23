// Kelompok D — layar Ubah Goal (BL-19c). `updateGoal` adalah jalur tulis pertama untuk
// Goal setelah create/activate.
//
// Assertion inti bukan "form terkirim", melainkan bentuk payload saat Goal AKTIF: periode
// dan target dikirim APA ADANYA dari Goal (termasuk `null`). Mengirim string kosong untuk
// target yang memang null akan dibaca server sebagai perubahan, dan panggilan yang cuma
// mengganti nama ikut tertolak "Target Goal terkunci" — kegagalan yang tidak masuk akal
// bagi user dan sulit ditelusuri.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockGetPersonRef = jest.fn();
const mockListOrgProfiles = jest.fn();
jest.mock('@/lib/cards', () => ({
  ...jest.requireActual('@/lib/cards'),
  getPersonRef: (id: string | null | undefined) => mockGetPersonRef(id),
  listOrgProfiles: () => mockListOrgProfiles(),
}));

const mockUseGoal = jest.fn();
const mockUpdate = jest.fn();
jest.mock('@/hooks/use-workspace', () => ({
  __esModule: true,
  useGoal: (id: string) => mockUseGoal(id),
  useGoalActions: () => ({ update: mockUpdate, updatePending: false }),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'g1' }),
}));

// eslint-disable-next-line import/first
import EditGoalRoute from '../edit/[id]';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'EditGoalWrapper';
  return W;
}

const DEWI = { id: 'u2', full_name: 'Dewi', email: 'dewi@x.id' };

const ACTIVE_GOAL = {
  id: 'g1',
  name: 'Tumbuhkan pendapatan',
  description: null,
  status: 'active',
  pic_id: 'u2',
  period_start: '2026-01-01',
  period_end: '2026-12-31',
  target_value: null,
};

const DRAFT_GOAL = { ...ACTIVE_GOAL, status: 'draft', pic_id: null, target_value: '100' };

function goalResult(goal: unknown) {
  return { goal, isLoading: false, isError: false, refetch: jest.fn() };
}

beforeEach(() => {
  mockUseGoal.mockReset().mockReturnValue(goalResult(ACTIVE_GOAL));
  mockUpdate.mockReset().mockResolvedValue(undefined);
  // Setia pada lib/cards: `getPersonRef(null)` mengembalikan null, bukan orang.
  // Mock yang selalu mengembalikan orang membuat Goal tanpa PIC tampak punya PIC.
  mockGetPersonRef.mockReset().mockImplementation(async (id: string | null) => (id ? DEWI : null));
  mockListOrgProfiles.mockReset().mockResolvedValue([DEWI]);
  mockBack.mockReset();
});

describe('Ubah Goal', () => {
  it('[D-01] Goal aktif → periode & target read-only, bukan disembunyikan', async () => {
    await render(<EditGoalRoute />, { wrapper: wrapper() });

    // Ditampilkan sebagai konteks…
    expect(await screen.findByText('2026-01-01 → 2026-12-31')).toBeTruthy();
    expect(screen.getByText('Periode')).toBeTruthy();
    expect(screen.getByText('Target Tahunan')).toBeTruthy();
    // …tapi tidak bisa disunting: nol stepper tahun, nol input target.
    expect(screen.queryByLabelText('Tambah tahun Tahun Goal')).toBeNull();
    expect(screen.queryByLabelText('Target Tahunan')).toBeNull();
  });

  it('[D-02] Goal aktif → periode & target dikirim apa adanya, target null tetap null', async () => {
    await render(<EditGoalRoute />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama Goal'), 'Nama diperbarui');
    fireEvent.press(await screen.findByLabelText('Simpan perubahan'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('g1', {
        name: 'Nama diperbarui',
        description: null,
        pic_id: 'u2',
        period_start: '2026-01-01',
        period_end: '2026-12-31',
        // '' di sini akan membuat server menolak dengan "Target Goal terkunci".
        target_value: null,
      }),
    );
  });

  it('[D-03] Goal draft → tahun bisa diubah dan jadi 1 Jan–31 Des', async () => {
    mockUseGoal.mockReturnValue(goalResult(DRAFT_GOAL));
    await render(<EditGoalRoute />, { wrapper: wrapper() });

    // YearField adalah stepper, bukan input bebas — 2026 + 1.
    fireEvent.press(await screen.findByLabelText('Tambah tahun Tahun Goal'));
    fireEvent.changeText(await screen.findByLabelText('Target Tahunan'), '250');
    fireEvent.press(await screen.findByLabelText('Simpan perubahan'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('g1', {
        name: 'Tumbuhkan pendapatan',
        description: null,
        pic_id: null,
        period_start: '2027-01-01',
        period_end: '2027-12-31',
        target_value: '250',
      }),
    );
  });

  it('[D-04] nama kosong tidak dikirim ke server', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<EditGoalRoute />, { wrapper: wrapper() });

    fireEvent.changeText(await screen.findByLabelText('Nama Goal'), '   ');
    fireEvent.press(await screen.findByLabelText('Simpan perubahan'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockUpdate).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('[D-05] PIC ter-prefill dengan nama orangnya, bukan UUID', async () => {
    await render(<EditGoalRoute />, { wrapper: wrapper() });

    // `goals.pic_id` hanya UUID; form yang menampilkannya mentah membuat user tidak bisa
    // tahu apakah PIC-nya sudah benar sebelum menyimpan.
    expect(await screen.findByLabelText('PIC / Owner: Dewi')).toBeTruthy();
  });

  it('[D-06] Goal di luar akses → pesan generik, nol form', async () => {
    mockUseGoal.mockReturnValue(goalResult(null));
    await render(<EditGoalRoute />, { wrapper: wrapper() });

    expect(await screen.findByText(/tidak ditemukan/i)).toBeTruthy();
    expect(screen.queryByLabelText('Nama Goal')).toBeNull();
  });
});
