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
const mockRefetchPeriod = jest.fn();
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
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

// Fase 4: FinalizePeriodModal di-mock jadi stub. Coverage modal internals ada di
// mobile/src/components/__tests__/finalize-period-modal.test.tsx (T-M-1..16); di sini
// kami hanya menegaskan wiring (tombol → modal props visible=true) dan invocation onClose.
jest.mock('@/components/finalize-period-modal', () => {
  const React = require('react');
  const { Text } = require('react-native-css/components');
  return {
    __esModule: true,
    FinalizePeriodModal: ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
      visible
        ? React.createElement(
            Text,
            {
              testID: 'finalize-modal-open',
              accessibilityLabel: 'Modal finalisasi terbuka',
              onPress: onClose,
            },
            'MODAL_OPEN',
          )
        : null,
  };
});

// OpenPeriodModal juga di-stub. Coverage internals ada di
// mobile/src/components/__tests__/open-period-modal.test.tsx (T-OP-M-1..16); di sini
// hanya wiring: empty-state → tombol → modal visible, dan onClose menutupnya.
jest.mock('@/components/open-period-modal', () => {
  const React = require('react');
  const { Text } = require('react-native-css/components');
  return {
    __esModule: true,
    OpenPeriodModal: ({ visible, onClose }: { visible: boolean; onClose: () => void }) =>
      visible
        ? React.createElement(
            Text,
            {
              testID: 'open-period-modal-open',
              accessibilityLabel: 'Modal buka periode terbuka',
              onPress: onClose,
            },
            'OPEN_MODAL_OPEN',
          )
        : null,
  };
});

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
  mockRefetchPeriod.mockReset();
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

  it('[F-2] versi draft sum=100 + level staff → tombol Aktifkan enabled; konfirmasi AckCheckbox → activate RPC dgn today', async () => {
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
    // S7-6: satu-tap sekarang membuka modal konfirmasi — belum memanggil RPC.
    await act(async () => {
      fireEvent.press(btn);
    });
    expect(mockActivate).not.toHaveBeenCalled();
    // Centang AckCheckbox, tekan tombol "Aktifkan versi" di modal → baru RPC dipanggil.
    await act(async () => {
      fireEvent.press(
        screen.getByLabelText(
          'Saya paham bahwa ini akan mengubah AchievementScore semua pengguna di level ini.',
        ),
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Aktifkan versi 2'));
    });
    expect(mockActivate).toHaveBeenCalledTimes(1);
    const [versionId, effectiveDate] = mockActivate.mock.calls[0];
    expect(versionId).toBe('v-draft');
    expect(effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('[F-2b] S7-6: aktifkan tanpa mencentang Ack → RPC TIDAK dipanggil (guard ireversibel)', async () => {
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
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Aktifkan v2'));
    });
    // Modal terbuka; tombol konfirmasi di dalam modal disabled sampai Ack.
    const confirmBtn = screen.getByLabelText('Aktifkan versi 2');
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(confirmBtn);
    });
    expect(mockActivate).not.toHaveBeenCalled();
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

// ============================================================ Fase 4 — Finalisasi Periode & Peringkat (specs/score-ranking-finalization-tdd-plan.md)
// WS5-UI-06..14 (modal internals) DIHAPUS di Fase 4 karena modal berubah arsitektur ke hook-driven
// dengan 9-state machine. Coverage modal ada di mobile/src/components/__tests__/finalize-period-modal.test.tsx.
// Yang tersisa di sini: wiring screen (label tombol, guard visibility, permission gate, delegated permission).
describe('SettingsScoreFormulaScreen — Fase 4 Finalisasi Periode & Peringkat', () => {
  it('[T-UI-1 / ex WS5-UI-01] periode active + permission → tombol "Finalisasi Periode & Peringkat" tampil', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Finalisasi Periode & Peringkat')).toBeTruthy();
  });

  // Direvisi saat NG-2 ditutup: sebelumnya test ini mengunci KETIADAAN UI buka-periode
  // ("copy tidak menjanjikan Buka periode"). Sekarang UI-nya ada, jadi kontraknya dibalik:
  // finalisasi tetap absen (tak ada periode untuk difinalisasi), buka-periode hadir.
  it('[ex WS5-UI-02] periode null → tombol Finalisasi absen, tombol Buka Periode hadir', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: null,
      isLoading: false,
      isError: false,
      refetch: mockRefetchPeriod,
    });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await waitFor(() =>
      expect(screen.queryByLabelText('Finalisasi Periode & Peringkat')).toBeNull(),
    );
    expect(screen.getByLabelText('Buka periode skoring baru')).toBeTruthy();
  });

  it('[ex WS5-UI-04] tanpa permission → guard + tombol tak pernah render', async () => {
    mockCan.mockReturnValue(false);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
    expect(screen.queryByLabelText('Finalisasi Periode & Peringkat')).toBeNull();
  });

  it('[ex WS5-UI-05] isError fetch periode → pesan + "Coba lagi" memicu refetch; tombol tak render', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: null,
      isLoading: false,
      isError: true,
      refetch: mockRefetchPeriod,
    });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Gagal memuat periode/i)).toBeTruthy();
    expect(screen.queryByLabelText('Finalisasi Periode & Peringkat')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Coba lagi memuat periode'));
    });
    expect(mockRefetchPeriod).toHaveBeenCalledTimes(1);
  });

  it('[T-UI-2] tap tombol → FinalizePeriodModal terbuka (visible=true)', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    // Modal awalnya tertutup — stub tidak render.
    expect(screen.queryByTestId('finalize-modal-open')).toBeNull();
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Finalisasi Periode & Peringkat'));
    });
    expect(await screen.findByTestId('finalize-modal-open')).toBeTruthy();
  });

  it('[T-UI-2b] onClose dari modal → showCloseModal jadi false → modal tersembunyi', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Finalisasi Periode & Peringkat'));
    });
    // Stub Text.onPress adalah proxy untuk onClose (jest.mock di atas).
    await act(async () => {
      fireEvent.press(screen.getByTestId('finalize-modal-open'));
    });
    await waitFor(() =>
      expect(screen.queryByTestId('finalize-modal-open')).toBeNull(),
    );
  });

  it('[T-UI-4] non-CEO dengan delegated manage_score_formula → tombol tetap render (AC-FIN-12)', async () => {
    // useProfile pakai mockCan (bukan role_level check di client). has_permission semantics
    // di server (0016:41-53) memperbolehkan CEO OR user dengan user_permissions.granted=true.
    // Client mempercayai profile.can — ini test simulasi delegated non-CEO.
    mockCan.mockImplementation((key: string) => key === 'manage_score_formula');
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Finalisasi Periode & Peringkat')).toBeTruthy();
  });
});

describe('Buka Periode — NG-2 follow-up (empty-state → OpenPeriodModal)', () => {
  const emptyPeriod = {
    period: null,
    isLoading: false,
    isError: false,
    refetch: mockRefetchPeriod,
  };

  it('[T-OP-UI-1] periode null → tap tombol membuka OpenPeriodModal (visible=true)', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue(emptyPeriod);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(screen.queryByTestId('open-period-modal-open')).toBeNull();
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Buka periode skoring baru'));
    });
    expect(await screen.findByTestId('open-period-modal-open')).toBeTruthy();
  });

  it('[T-OP-UI-2] onClose dari modal → modal tersembunyi kembali', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue(emptyPeriod);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Buka periode skoring baru'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('open-period-modal-open'));
    });
    await waitFor(() => expect(screen.queryByTestId('open-period-modal-open')).toBeNull());
  });

  it('[T-OP-UI-3] periode AKTIF ada → tombol Buka Periode TIDAK render (guard satu-aktif)', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Finalisasi Periode & Peringkat')).toBeTruthy();
    expect(screen.queryByLabelText('Buka periode skoring baru')).toBeNull();
  });

  it('[T-OP-UI-4] tanpa permission → tombol Buka Periode tak pernah render', async () => {
    mockCan.mockReturnValue(false);
    mockUseActivePeriod.mockReturnValue(emptyPeriod);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak memiliki akses/i)).toBeTruthy();
    expect(screen.queryByLabelText('Buka periode skoring baru')).toBeNull();
  });

  it('[T-OP-UI-5] isError fetch periode → tombol Buka Periode TIDAK render (status tak diketahui)', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({
      period: null,
      isLoading: false,
      isError: true,
      refetch: mockRefetchPeriod,
    });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Gagal memuat periode/i)).toBeTruthy();
    expect(screen.queryByLabelText('Buka periode skoring baru')).toBeNull();
  });
});
