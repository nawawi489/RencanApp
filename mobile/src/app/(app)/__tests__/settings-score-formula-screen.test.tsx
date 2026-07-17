// UI Fase 7 — Settings · Score Formula. Permission guard + Manual Override surface.
// Pre-flight client: reason wajib + anti-self. RPC error message ditampilkan.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: { id: 'me' }, isLoading: false, can: mockCan }),
}));

const mockUseActivePeriod = jest.fn();
const mockOverride = jest.fn();
const mockUseScoreFormulaTemplates = jest.fn();
const mockUseScoreFormulaVersions = jest.fn();
const mockActivate = jest.fn();
const mockCreateDraft = jest.fn();
const mockUpdateWeights = jest.fn();
const mockClosePeriod = jest.fn();
const mockRefetchPeriod = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
  useClosePeriod: () => ({ closePeriod: mockClosePeriod, isPending: false }),
  useScoreOverride: () => ({ override: mockOverride, isPending: false }),
  useScoreFormulaTemplates: (...a: unknown[]) => mockUseScoreFormulaTemplates(...a),
  useScoreFormulaVersions: (...a: unknown[]) => mockUseScoreFormulaVersions(...a),
  useFormulaActions: () => ({
    activate: mockActivate,
    createDraft: mockCreateDraft,
    updateWeights: mockUpdateWeights,
    isPending: false,
    isCreatingDraft: false,
    isUpdatingWeights: false,
  }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

// eslint-disable-next-line import/first
import SettingsScoreFormulaScreen from '../settings-score-formula';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

beforeEach(() => {
  mockCan.mockReset();
  mockOverride.mockReset();
  mockUseActivePeriod.mockReset();
  mockUseScoreFormulaTemplates.mockReset();
  mockUseScoreFormulaVersions.mockReset();
  mockActivate.mockReset();
  mockCreateDraft.mockReset();
  mockUpdateWeights.mockReset();
  mockClosePeriod.mockReset();
  mockRefetchPeriod.mockReset();
  mockClosePeriod.mockResolvedValue(3);
  mockUseActivePeriod.mockReturnValue({
    period: { id: 'p1', period_name: 'Q1', period_start: '2026-01-01', period_end: '2026-03-31' },
    isLoading: false,
    isError: false,
    refetch: mockRefetchPeriod,
  });
  mockUseScoreFormulaTemplates.mockReturnValue({ templates: [], isLoading: false, isError: false });
  mockUseScoreFormulaVersions.mockReturnValue({ versions: [], isLoading: false, isError: false });
});

describe('SettingsScoreFormulaScreen — guard + override surface', () => {
  it('[1] tanpa permission → "tidak memiliki akses" + form TIDAK render', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
    expect(screen.queryByLabelText('Simpan Override')).toBeNull();
  });

  // [2]-[5] dihapus: seksi "Manual Override Skor" di layar ini dihapus (ponytail sweep) —
  // fungsi override dijalankan lewat rute dedikasi `/manual-score-override` (prefill dari
  // People Profile), yang punya suite test terpisah.

  it('[F-1] template + versi aktif (level staff) → render kategori + bobot + Total 100%', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't-staff', name: 'Staff Default', level: 'staff', is_default: true }],
      isLoading: false,
      isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({
      versions: [
        {
          id: 'v1',
          version_number: 1,
          status: 'active',
          level: 'staff',
          categories: [
            { code: 'task_completion', weight: 60, source_metric: 'a' },
            { code: 'repeat_compliance', weight: 40, source_metric: 'r' },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Staff Default')).toBeTruthy();
    expect(screen.getByText('Tugas Completion')).toBeTruthy();
    expect(screen.getByText('Repeat Compliance')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText(/Total: 100%/)).toBeTruthy();
  });

  it('[F-2] versi draft sum=100 + level staff → tombol Aktifkan enabled; klik → activate RPC dgn today', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't', name: 'Mgmt Default', level: 'management', is_default: true }],
      isLoading: false,
      isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({
      versions: [
        {
          id: 'v-draft',
          version_number: 2,
          status: 'draft',
          level: 'management',
          categories: [{ code: 'a', weight: 100, source_metric: 'a' }],
        },
      ],
      isLoading: false,
      isError: false,
    });
    mockActivate.mockResolvedValueOnce(undefined);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    const btn = await screen.findByLabelText('Aktifkan v2');
    expect(btn.props.accessibilityState?.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(btn);
    });
    expect(mockActivate).toHaveBeenCalledTimes(1);
    const [versionId, effectiveDate] = mockActivate.mock.calls[0];
    expect(versionId).toBe('v-draft');
    expect(effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('[F-3] versi draft sum<100 → tombol Aktifkan DISABLED (accessibilityState explicit); RPC tidak dipanggil', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't', name: 'Staff Default', level: 'staff', is_default: true }],
      isLoading: false,
      isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({
      versions: [
        { id: 'v-bad', version_number: 3, status: 'draft', level: 'staff',
          categories: [{ code: 'a', weight: 95, source_metric: 'a' }] },
      ],
      isLoading: false,
      isError: false,
    });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    const btn = await screen.findByLabelText('Aktifkan v3');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    // WeightTotalBadge a11y label menyebut status eksplisit (DESIGN §4 warna ≠ satu-satunya sinyal).
    expect(screen.getByLabelText(/Total bobot 95%, harus 100%/)).toBeTruthy();
    fireEvent.press(btn);
    expect(mockActivate).not.toHaveBeenCalled();
  });

  it('[SF1-1] OD-11: createDraft kedua dgn draft existing → error "draft existing" inline', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't', name: 'Staff', level: 'staff', is_default: true }],
      isLoading: false, isError: false,
    });
    // Tidak ada versi → CTA "Buat Draft" muncul.
    mockUseScoreFormulaVersions.mockReturnValue({ versions: [], isLoading: false, isError: false });
    mockCreateDraft.mockRejectedValueOnce(new Error('draft_already_exists: Sudah ada draft'));
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    const reasonInput = await screen.findByLabelText('Alasan pembuatan draft (min 8 karakter)');
    await act(async () => {
      fireEvent.changeText(reasonInput, 'fase awal cukup panjang');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat Draft'));
    });
    expect(mockCreateDraft).toHaveBeenCalledWith({
      templateId: 't',
      level: 'staff',
      changeReason: 'fase awal cukup panjang',
      categories: null,
    });
    await waitFor(() => expect(screen.getByText(/Sudah ada draft/i)).toBeTruthy());
  });

  it('[SF1-2] DEC-4: createDraft dgn reason <8 char → pre-flight inline, RPC tidak dipanggil', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't', name: 'Staff', level: 'staff', is_default: true }],
      isLoading: false, isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({ versions: [], isLoading: false, isError: false });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    const reasonInput = await screen.findByLabelText('Alasan pembuatan draft (min 8 karakter)');
    await act(async () => {
      fireEvent.changeText(reasonInput, 'pendek');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Buat Draft'));
    });
    expect(mockCreateDraft).not.toHaveBeenCalled();
    expect(screen.getByText(/minimal 8/i)).toBeTruthy();
  });

  it('[SF1-3] DEC-9: chip Custom TIDAK dirender; hanya 4 level chip', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't', name: 'Staff', level: 'staff', is_default: true }],
      isLoading: false, isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({ versions: [], isLoading: false, isError: false });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Staff')).toBeTruthy();
    expect(screen.getByLabelText('Management')).toBeTruthy();
    expect(screen.getByLabelText('C-Level')).toBeTruthy();
    expect(screen.getByLabelText('CEO')).toBeTruthy();
    expect(screen.queryByLabelText('Custom')).toBeNull();
  });

  it('[SF1-4] DraftEditor: ubah bobot → dirty → tombol Aktifkan disabled meski sum=100', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't', name: 'Staff', level: 'staff', is_default: true }],
      isLoading: false, isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({
      versions: [{
        id: 'v-draft', version_number: 4, status: 'draft', level: 'staff',
        categories: [
          { code: 'task_completion', weight: 60, source_metric: 'm1' },
          { code: 'repeat_compliance', weight: 40, source_metric: 'm2' },
        ],
      }],
      isLoading: false, isError: false,
    });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    const activateBtn = await screen.findByLabelText('Aktifkan v4');
    expect(activateBtn.props.accessibilityState?.disabled).toBe(false); // initial: clean + sum=100
    // Ubah bobot 60→70 (sum jadi 110 → invalid + dirty).
    const apInput = screen.getByLabelText('Bobot Tugas Completion');
    await act(async () => {
      fireEvent.changeText(apInput, '70');
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Aktifkan v4').props.accessibilityState?.disabled).toBe(true),
    );
  });

});

// ============================================================ WS-5 — Tutup Periode
describe('SettingsScoreFormulaScreen — WS-5 Tutup Periode', () => {
  it('[WS5-UI-01] periode active + permission → tombol "Tutup Periode" tampil', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Tutup Periode')).toBeTruthy();
  });

  it('[WS5-UI-02] periode null → tombol TIDAK render + copy tidak menjanjikan "Buka periode"', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false, refetch: mockRefetchPeriod });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.queryByLabelText('Tutup Periode')).toBeNull());
    // Copy state-kosong tidak menyesatkan (tak ada UI open-period).
    expect(screen.queryByText(/Buka periode skoring/i)).toBeNull();
  });

  it('[WS5-UI-04] tanpa permission → guard + tombol Tutup Periode tak pernah render', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
    expect(screen.queryByLabelText('Tutup Periode')).toBeNull();
  });

  it('[WS5-UI-05] isError fetch periode → pesan + "Coba lagi" memicu refetch; tombol tak render', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: true, refetch: mockRefetchPeriod });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Gagal memuat periode/i)).toBeTruthy();
    expect(screen.queryByLabelText('Tutup Periode')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Coba lagi memuat periode'));
    });
    expect(mockRefetchPeriod).toHaveBeenCalledTimes(1);
  });

  it('[WS5-UI-06/07] tekan Tutup Periode → modal langkah 1 (ringkasan) → Lanjutkan → tombol final', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Tutup Periode'));
    });
    // Langkah 1: ringkasan dampak (teks khas modal); belum ada tombol final.
    expect(await screen.findByText(/membekukan ranking/i)).toBeTruthy();
    expect(screen.queryByLabelText('Tutup periode Q1')).toBeNull();
    // Lanjut ke langkah 2.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lanjutkan tutup periode'));
    });
    expect(await screen.findByLabelText('Tutup periode Q1')).toBeTruthy();
  });

  it('[WS5-UI-08] batal di langkah 1 → closePeriod TIDAK dipanggil', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Tutup Periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Batal tutup periode'));
    });
    expect(mockClosePeriod).not.toHaveBeenCalled();
  });

  it('[WS5-UI-09] konfirmasi final → closePeriod(id) dipanggil + pesan sukses menyebut jumlah', async () => {
    mockCan.mockReturnValue(true);
    mockClosePeriod.mockResolvedValueOnce(4);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Tutup Periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lanjutkan tutup periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tutup periode Q1'));
    });
    expect(mockClosePeriod).toHaveBeenCalledWith('p1');
    expect(await screen.findByText(/4 pengguna/)).toBeTruthy();
  });

  it('[WS5-UI-10] n=0 → sukses dengan copy "0 pengguna" (bukan error)', async () => {
    mockCan.mockReturnValue(true);
    mockClosePeriod.mockResolvedValueOnce(0);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Tutup Periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lanjutkan tutup periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tutup periode Q1'));
    });
    expect(await screen.findByText(/0 pengguna/)).toBeTruthy();
  });

  it('[WS5-UI-11] error E1 (sudah ditutup) → pesan inline + refetch periode', async () => {
    mockCan.mockReturnValue(true);
    mockClosePeriod.mockRejectedValueOnce(new Error('Periode ini sudah ditutup dan tidak bisa diubah.'));
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Tutup Periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lanjutkan tutup periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tutup periode Q1'));
    });
    expect(await screen.findByText(/sudah ditutup/i)).toBeTruthy();
    expect(mockRefetchPeriod).toHaveBeenCalled();
  });

  it('[WS5-UI-13] a11y: tombol final accessibilityLabel menyebut periode + kontainer konfirmasi role alert', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Tutup Periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lanjutkan tutup periode'));
    });
    const finalBtn = await screen.findByLabelText('Tutup periode Q1');
    expect(finalBtn.props.accessibilityState?.disabled).toBe(false);
    // Kontainer konfirmasi mengumumkan intent destruktif.
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('[WS5-UI-14] error E3 unauthorized → pesan inline apa adanya', async () => {
    mockCan.mockReturnValue(true);
    mockClosePeriod.mockRejectedValueOnce(new Error('Anda tidak berwenang mengelola Score Formula.'));
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Tutup Periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Lanjutkan tutup periode'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Tutup periode Q1'));
    });
    expect(await screen.findByText(/tidak berwenang/i)).toBeTruthy();
  });
});
