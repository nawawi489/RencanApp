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
jest.mock('@/hooks/use-people-score', () => ({
  __esModule: true,
  useActivePeriod: (...a: unknown[]) => mockUseActivePeriod(...a),
  useScoreOverride: () => ({ override: mockOverride, isPending: false }),
  useScoreFormulaTemplates: (...a: unknown[]) => mockUseScoreFormulaTemplates(...a),
  useScoreFormulaVersions: (...a: unknown[]) => mockUseScoreFormulaVersions(...a),
  useFormulaActions: () => ({ activate: mockActivate, isPending: false }),
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
  mockUseActivePeriod.mockReturnValue({
    period: { id: 'p1', period_name: 'Q1', period_start: '2026-01-01', period_end: '2026-03-31' },
    isLoading: false,
    isError: false,
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

  it('[2] tanpa periode aktif → form override BLOK (EmptyState)', async () => {
    mockCan.mockReturnValue(true);
    mockUseActivePeriod.mockReturnValue({ period: null, isLoading: false, isError: false });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Tidak ada periode aktif')).toBeTruthy();
    expect(screen.queryByLabelText('Simpan Override')).toBeNull();
  });

  it('[3] pre-flight: reason kosong → inline error, override RPC tidak dipanggil', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Simpan Override'));
    await waitFor(() => expect(screen.getByText('Alasan override wajib diisi.')).toBeTruthy());
    expect(mockOverride).not.toHaveBeenCalled();
  });

  it('[4] pre-flight anti-self: target = profile.id → inline error, RPC tidak dipanggil', async () => {
    mockCan.mockReturnValue(true);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('User ID target', undefined, { timeout: 10000 })).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('uuid user'), 'me');
      fireEvent.changeText(screen.getByPlaceholderText('contoh: 82'), '99');
      fireEvent.changeText(screen.getByPlaceholderText('koreksi data, dll'), 'self attempt');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Simpan Override'));
    });
    expect(screen.getByText(/tidak bisa mengubah score Anda sendiri/i)).toBeTruthy();
    expect(mockOverride).not.toHaveBeenCalled();
  });

  it('[F-1] template + versi aktif → render kategori + bobot + Total 100% (valid)', async () => {
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
          categories: [
            { code: 'action_plan_completion', weight: 60, source_metric: 'a' },
            { code: 'repeat_compliance', weight: 40, source_metric: 'r' },
          ],
        },
      ],
      isLoading: false,
      isError: false,
    });
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Staff Default')).toBeTruthy();
    expect(screen.getByText('Action Plan Completion')).toBeTruthy();
    expect(screen.getByText('Repeat Compliance')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText(/Total bobot: 100%.*valid/)).toBeTruthy();
  });

  it('[F-2] versi draft → tombol Aktifkan muncul; klik → activate RPC dgn tanggal hari ini', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't-mgmt', name: 'Management Default', level: 'management', is_default: true }],
      isLoading: false,
      isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({
      versions: [
        {
          id: 'v-draft',
          version_number: 2,
          status: 'draft',
          categories: [{ code: 'a', weight: 100, source_metric: 'a' }],
        },
      ],
      isLoading: false,
      isError: false,
    });
    mockActivate.mockResolvedValueOnce(undefined);
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    const btn = await screen.findByLabelText('Aktifkan versi 2');
    await act(async () => {
      fireEvent.press(btn);
    });
    expect(mockActivate).toHaveBeenCalledTimes(1);
    const [versionId, effectiveDate] = mockActivate.mock.calls[0];
    expect(versionId).toBe('v-draft');
    expect(effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('[F-3] activate gagal SUM≠100 → pesan server inline', async () => {
    mockCan.mockReturnValue(true);
    mockUseScoreFormulaTemplates.mockReturnValue({
      templates: [{ id: 't', name: 'Staff Default', level: 'staff', is_default: true }],
      isLoading: false,
      isError: false,
    });
    mockUseScoreFormulaVersions.mockReturnValue({
      versions: [
        { id: 'v-bad', version_number: 3, status: 'draft', categories: [{ code: 'a', weight: 95, source_metric: 'a' }] },
      ],
      isLoading: false,
      isError: false,
    });
    mockActivate.mockRejectedValueOnce(new Error('Total bobot Score Formula harus tepat 100. Saat ini 95.'));
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    await act(async () => {
      fireEvent.press(await screen.findByLabelText('Aktifkan versi 3'));
    });
    await waitFor(() => expect(screen.getByText(/harus tepat 100/i)).toBeTruthy());
  });

  it('[5] RPC reject (mis. 100% atau ditolak server) → pesan server dirender inline', async () => {
    mockCan.mockReturnValue(true);
    mockOverride.mockRejectedValueOnce(new Error('Periode ini sudah ditutup dan tidak bisa diubah.'));
    await render(<SettingsScoreFormulaScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('User ID target', undefined, { timeout: 10000 })).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('uuid user'), 'other-uid');
      fireEvent.changeText(screen.getByPlaceholderText('contoh: 82'), '82');
      fireEvent.changeText(screen.getByPlaceholderText('koreksi data, dll'), 'koreksi');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Simpan Override'));
    });
    expect(mockOverride).toHaveBeenCalledTimes(1);
    expect(mockOverride).toHaveBeenCalledWith({ userId: 'other-uid', manualScore: 82, reason: 'koreksi' });
    await waitFor(() => expect(screen.getByText(/Periode ini sudah ditutup/i)).toBeTruthy());
  });
});
