// Submit screen UI-S-AP5 + UI-S-AP6 — refactor besar.
// Pola mock: stub supabase + mock hooks/picker; QueryClient retry:false.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockBack = jest.fn();
let mockParams: { id?: string; instanceId?: string } = { id: 'ap-1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack }),
}));

const mockGetTask = jest.fn();
jest.mock('@/lib/cards', () => {
  const actual = jest.requireActual('@/lib/cards');
  return {
    ...actual,
    getTask: (...a: unknown[]) => mockGetTask(...a),
  };
});

const mockGetInstance = jest.fn();
const mockSubmitInstance = jest.fn();
jest.mock('@/lib/repeat', () => ({
  getInstance: (...a: unknown[]) => mockGetInstance(...a),
  submitInstance: (...a: unknown[]) => mockSubmitInstance(...a),
}));

const mockPickFiles = jest.fn();
jest.mock('@/lib/file-picker', () => ({
  pickEvidenceFiles: (...a: unknown[]) => mockPickFiles(...a),
}));

const mockUseKpiCandidates = jest.fn();
const mockUseKpiCurrentValue = jest.fn();
const mockRunSubmission = jest.fn();
let mockIsSubmitting = false;
jest.mock('@/hooks/use-submission', () => ({
  useKpiCandidates: (...a: unknown[]) => mockUseKpiCandidates(...a),
  useKpiCurrentValue: (...a: unknown[]) => mockUseKpiCurrentValue(...a),
  useSubmissionFlow: () => ({
    runSubmission: mockRunSubmission,
    isSubmitting: mockIsSubmitting,
    error: null,
  }),
}));

// eslint-disable-next-line import/first
import SubmitScreen from '../submit';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

const baseAp = {
  id: 'ap-1',
  organization_id: 'org-1',
  action_plan_id: 'i-1',
  name: 'AP Test',
  pic_id: 'me',
  reviewer_id: 'rev-1',
  status: 'in_progress',
  evidence_required: false,
  result_value_required: true,
  review_required: true,
  repeat_setting: 'one_time',
  pic: { id: 'me', full_name: 'PIC', email: null },
  reviewer: { id: 'rev-1', full_name: 'REV', email: null },
};

beforeEach(() => {
  mockBack.mockReset();
  mockGetTask.mockReset();
  mockGetInstance.mockReset();
  mockSubmitInstance.mockReset();
  mockPickFiles.mockReset();
  mockUseKpiCandidates.mockReset();
  mockUseKpiCurrentValue.mockReset();
  mockRunSubmission.mockReset();
  mockIsSubmitting = false;
  mockParams = { id: 'ap-1' };
  mockGetTask.mockResolvedValue(baseAp);
  mockUseKpiCandidates.mockReturnValue({ candidates: [], isLoading: false, isError: false, refetch: jest.fn() });
  mockUseKpiCurrentValue.mockReturnValue({ value: null, isLoading: false, isError: false });
  mockRunSubmission.mockResolvedValue('sub-1');
});

describe('SubmitScreen — UI-S-AP5 file upload', () => {
  it('[U1] tombol UploadButton render dgn label "Pilih file (0/5)"', async () => {
    await render(<SubmitScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Pilih file bukti')).toBeTruthy();
    expect(screen.getByText(/Pilih file \(0\/5\)/)).toBeTruthy();
  });

  it('[U2] pick 2 file → 2 AttachmentRow tampil, label "(2/5)"', async () => {
    mockPickFiles.mockResolvedValueOnce([
      { uri: 'f1', name: 'a.pdf', size: 100, mimeType: 'application/pdf' },
      { uri: 'f2', name: 'b.png', size: 200, mimeType: 'image/png' },
    ]);
    await render(<SubmitScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pilih file bukti'));
    expect(await screen.findByText('a.pdf')).toBeTruthy();
    expect(screen.getByText('b.png')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/\(2\/5\)/)).toBeTruthy());
  });

  it('[U3] sudah 5 file → UploadButton disabled (accessibilityState.disabled=true) + label "Maksimum 5"', async () => {
    mockPickFiles.mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({
      uri: 'f' + i, name: 'x' + i + '.pdf', size: 100, mimeType: 'application/pdf',
    })));
    await render(<SubmitScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pilih file bukti'));
    await waitFor(() => expect(screen.getByText(/Maksimum 5 file/)).toBeTruthy());
    expect(screen.getByLabelText('Pilih file bukti').props.accessibilityState?.disabled).toBe(true);
  });

  it('[U4] tombol Hapus pada AttachmentRow menghilangkan file dari state', async () => {
    mockPickFiles.mockResolvedValueOnce([{ uri: 'f1', name: 'a.pdf', size: 100, mimeType: 'application/pdf' }]);
    await render(<SubmitScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Pilih file bukti'));
    expect(await screen.findByText('a.pdf')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Hapus a.pdf'));
    await waitFor(() => expect(screen.queryByText('a.pdf')).toBeNull());
  });
});

describe('SubmitScreen — UI-S-AP6 KPI Area linkage', () => {
  it('[U5] OD-1 fallback: 0 kandidat → section "Nilai Hasil" TIDAK dirender', async () => {
    mockUseKpiCandidates.mockReturnValue({ candidates: [], isLoading: false, isError: false, refetch: jest.fn() });
    await render(<SubmitScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Pilih file bukti');
    // Marker spesifik section ada di tombol "+ Tambah Nilai Hasil" (a11y label "Tambah Nilai Hasil")
    // — TIDAK boleh muncul saat 0 kandidat. Text "Nilai Hasil" lain ada di GuidanceNote header (sah).
    expect(screen.queryByLabelText('Tambah Nilai Hasil')).toBeNull();
  });

  it('[U6] 1 kandidat: KpiLinkageCard otomatis tampil (auto-select); picker chip tidak dirender', async () => {
    mockUseKpiCandidates.mockReturnValue({
      candidates: [{ id: 'k1', name: 'Sales Q2' }], isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<SubmitScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Tambah Nilai Hasil'));
    // KpiLinkageCard menampilkan nama KPI; picker chip "Pilih Sales Q2" tidak ada (auto-select).
    expect(await screen.findByText('Sales Q2')).toBeTruthy();
    expect(screen.queryByLabelText('Pilih Sales Q2')).toBeNull();
  });

  it('[U7] >1 kandidat: picker chip dirender; klik chip → KpiLinkageCard muncul', async () => {
    mockUseKpiCandidates.mockReturnValue({
      candidates: [{ id: 'k1', name: 'Sales Q2' }, { id: 'k2', name: 'Ops' }],
      isLoading: false, isError: false, refetch: jest.fn(),
    });
    await render(<SubmitScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Tambah Nilai Hasil'));
    expect(await screen.findByLabelText('Pilih Sales Q2')).toBeTruthy();
    expect(screen.getByLabelText('Pilih Ops')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pilih Ops'));
    // Setelah pilih, KpiLinkageCard menampilkan 'Ops' sebagai title bold dalam card.
    // (Nama 'Ops' muncul juga di chip; kita verifikasi minimal nama 'Ops' di-render di header card.)
    await waitFor(() => expect(screen.getAllByText('Ops').length).toBeGreaterThanOrEqual(2));
  });

  it('[U8] isi nilai → DeltaArrow muncul dgn a11y "Perubahan nilai: …"; ImpactApprovalCard muncul', async () => {
    mockUseKpiCandidates.mockReturnValue({
      candidates: [{ id: 'k1', name: 'Sales Q2' }], isLoading: false, isError: false, refetch: jest.fn(),
    });
    mockUseKpiCurrentValue.mockReturnValue({
      value: { numeric_total: 120, text_count: 0, last_approved_at: null }, isLoading: false, isError: false,
    });
    await render(<SubmitScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Tambah Nilai Hasil'));
    fireEvent.changeText(await screen.findByPlaceholderText('Nilai baru (mis. 145)'), '145');
    await waitFor(() => expect(screen.getByPlaceholderText('Nilai baru (mis. 145)').props.value).toBe('145'));
    // DeltaArrow a11y label
    expect(await screen.findByLabelText(/Perubahan nilai.*naik 25/)).toBeTruthy();
    // ImpactApprovalCard
    expect(screen.getByText(/Setelah disetujui Reviewer/i)).toBeTruthy();
  });
});

describe('SubmitScreen — submit flow', () => {
  it('[U9] Submit → runSubmission dipanggil dgn pendingFiles + resultValues; router.back saat sukses', async () => {
    mockUseKpiCandidates.mockReturnValue({
      candidates: [{ id: 'k1', name: 'Sales Q2' }], isLoading: false, isError: false, refetch: jest.fn(),
    });
    mockPickFiles.mockResolvedValueOnce([{ uri: 'f1', name: 'a.pdf', size: 100, mimeType: 'application/pdf' }]);
    await render(<SubmitScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Pilih file bukti');
    fireEvent.press(screen.getByLabelText('Pilih file bukti'));
    await waitFor(() => expect(screen.getByText('a.pdf')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Tambah Nilai Hasil'));
    fireEvent.changeText(await screen.findByPlaceholderText('Nilai baru (mis. 145)'), '145');
    await waitFor(() => expect(screen.getByPlaceholderText('Nilai baru (mis. 145)').props.value).toBe('145'));
    fireEvent.press(screen.getByText('Submit untuk Review'));

    await waitFor(() => expect(mockRunSubmission).toHaveBeenCalled());
    const call = mockRunSubmission.mock.calls[0][0];
    expect(call.orgId).toBe('org-1');
    expect(call.pendingFiles).toHaveLength(1);
    expect(call.pendingFiles[0].name).toBe('a.pdf');
    expect(call.resultValues).toHaveLength(1);
    expect(call.resultValues[0]).toEqual(expect.objectContaining({
      strategy_id: 'k1', value_text: '145', value_numeric: 145, value_type: 'number',
    }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('[U10] evidence_required=true tapi tidak ada bukti → Alert + tidak panggil runSubmission', async () => {
    const apReq = { ...baseAp, evidence_required: true };
    mockGetTask.mockResolvedValueOnce(apReq);
    // Spy Alert.alert
    const Alert = jest.requireActual('react-native').Alert;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<SubmitScreen />, { wrapper: wrapper() });
    await screen.findByLabelText('Pilih file bukti');
    fireEvent.press(screen.getByText('Submit untuk Review'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockRunSubmission).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
