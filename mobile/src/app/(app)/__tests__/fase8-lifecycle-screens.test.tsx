// UI Fase 8 — layar lifecycle: DCR, Evaluation, Search.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';

jest.setTimeout(30000);

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockProfile: { id: string; role_level: string } = { id: 'u-pic', role_level: 'staff' };
const mockCan = jest.fn();
jest.mock('@/hooks/use-profile', () => ({
  __esModule: true,
  useProfile: () => ({ profile: mockProfile, isLoading: false, can: mockCan }),
}));

const mockUseDcrRequests = jest.fn();
const mockCreateRequest = jest.fn();
const mockReviewRequest = jest.fn();
const mockResubmitRequest = jest.fn();
const mockDcrIsPending: { current: boolean } = { current: false };
const mockUseEvaluation = jest.fn();
const mockRecord = jest.fn();
jest.mock('@/hooks/use-governance-admin', () => ({
  __esModule: true,
  useDeadlineChangeRequests: (...a: unknown[]) => mockUseDcrRequests(...a),
  useDeadlineChangeActions: () => ({
    createRequest: mockCreateRequest,
    reviewRequest: mockReviewRequest,
    resubmitRequest: mockResubmitRequest,
    isPending: mockDcrIsPending.current,
  }),
  useEvaluation: (...a: unknown[]) => mockUseEvaluation(...a),
  useEvaluationActions: () => ({ record: mockRecord, isPending: false }),
}));

const mockUseSearch = jest.fn();
jest.mock('@/hooks/use-search', () => ({
  __esModule: true,
  useSearchCards: (...a: unknown[]) => mockUseSearch(...a),
}));

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams.current,
}));

// eslint-disable-next-line import/first
import DeadlineChangeRequestScreen from '../deadline-change-request';
// eslint-disable-next-line import/first
import EvaluationScreen from '../evaluation';
// eslint-disable-next-line import/first
import SearchScreen from '../search';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const W = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  W.displayName = 'TestWrapper';
  return W;
}

beforeEach(() => {
  mockCan.mockReset().mockReturnValue(false);
  mockUseDcrRequests.mockReset().mockReturnValue({ requests: [], isLoading: false, enabled: true });
  mockCreateRequest.mockReset().mockResolvedValue('dcr1');
  mockReviewRequest.mockReset().mockResolvedValue(undefined);
  mockResubmitRequest.mockReset().mockResolvedValue(undefined);
  mockDcrIsPending.current = false;
  mockUseEvaluation.mockReset().mockReturnValue({ evaluation: null, isLoading: false, enabled: true });
  mockRecord.mockReset().mockResolvedValue('e1');
  mockUseSearch.mockReset().mockReturnValue({ results: [], isLoading: false, enabled: false });
  mockProfile.id = 'u-pic';
  mockProfile.role_level = 'staff';
  mockParams.current = {};
});

describe('deadline-change-request', () => {
  it('[F8-UI-11] validasi deadline baru wajib > deadline lama', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    const dl = screen.getByLabelText(/Deadline baru/i);
    fireEvent.changeText(dl, '2026-06-30');
    await waitFor(() => expect(dl.props.value).toBe('2026-06-30'));
    fireEvent.press(screen.getByLabelText('Kirim Permintaan'));
    expect(await screen.findByText(/harus setelah deadline saat ini/i)).toBeTruthy();
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it('[F8-UI-12] alasan wajib (tidak boleh kosong)', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    const dl = screen.getByLabelText(/Deadline baru/i);
    fireEvent.changeText(dl, '2026-07-10');
    await waitFor(() => expect(dl.props.value).toBe('2026-07-10'));
    fireEvent.press(screen.getByLabelText('Kirim Permintaan'));
    expect(await screen.findByText(/Alasan wajib diisi/i)).toBeTruthy();
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it('[F8-UI-13] riwayat DCR menampilkan status Menunggu Review', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockUseDcrRequests.mockReturnValue({
      requests: [
        { id: 'req1', status: 'pending', requestor_id: 'u-pic', old_deadline: '2026-07-01', new_deadline: '2026-07-10', reason: 'r' },
      ],
      isLoading: false,
      enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Menunggu Review')).toBeTruthy();
  });

  it('[DCR-UI-1] reviewer melihat 3 aksi Setujui/Tolak/Minta Revisi saat pending & !isSelf', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockCan.mockReturnValue(true);
    mockProfile.id = 'u-approver';
    mockUseDcrRequests.mockReturnValue({
      requests: [{ id: 'req1', status: 'pending', requestor_id: 'u-pic', old_deadline: '2026-07-01', new_deadline: '2026-07-10', reason: 'r' }],
      isLoading: false,
      enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Setujui permintaan req1')).toBeTruthy();
    expect(screen.getByLabelText('Tolak permintaan req1')).toBeTruthy();
    expect(screen.getByLabelText('Minta revisi permintaan req1')).toBeTruthy();
  });

  it('[DCR-UI-2] Minta Revisi wajib alasan (client validation) sebelum reviewRequest', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockCan.mockReturnValue(true);
    mockProfile.id = 'u-approver';
    mockUseDcrRequests.mockReturnValue({
      requests: [{ id: 'req1', status: 'pending', requestor_id: 'u-pic', old_deadline: '2026-07-01', new_deadline: '2026-07-10', reason: 'r' }],
      isLoading: false,
      enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Minta revisi permintaan req1'));
    // Tanpa alasan → tidak memanggil server
    await waitFor(() => expect(mockReviewRequest).not.toHaveBeenCalled());
    // Isi alasan lalu tekan ulang → panggil dengan decision revision_requested
    const reasonInput = await screen.findByLabelText(/Alasan review untuk req1/i);
    fireEvent.changeText(reasonInput, 'bukti kurang detail');
    await waitFor(() => expect(reasonInput.props.value).toBe('bukti kurang detail'));
    fireEvent.press(screen.getByLabelText('Minta revisi permintaan req1'));
    await waitFor(() =>
      expect(mockReviewRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req1', decision: 'revision_requested', reason: 'bukti kurang detail' }),
      ),
    );
  });

  it('[DCR-UI-3] Tolak mengirim alasan asli reviewer (bukan hardcode "Ditolak")', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockCan.mockReturnValue(true);
    mockProfile.id = 'u-approver';
    mockUseDcrRequests.mockReturnValue({
      requests: [{ id: 'req1', status: 'pending', requestor_id: 'u-pic', old_deadline: '2026-07-01', new_deadline: '2026-07-10', reason: 'r' }],
      isLoading: false,
      enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    // Tanpa alasan → block
    fireEvent.press(await screen.findByLabelText('Tolak permintaan req1'));
    await waitFor(() => expect(mockReviewRequest).not.toHaveBeenCalled());
    const reasonInput = await screen.findByLabelText(/Alasan review untuk req1/i);
    fireEvent.changeText(reasonInput, 'tidak sesuai kebijakan');
    await waitFor(() => expect(reasonInput.props.value).toBe('tidak sesuai kebijakan'));
    fireEvent.press(screen.getByLabelText('Tolak permintaan req1'));
    await waitFor(() =>
      expect(mockReviewRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req1', decision: 'rejected', reason: 'tidak sesuai kebijakan' }),
      ),
    );
    // Tidak boleh ada panggilan dengan literal 'Ditolak'
    const anyDitolak = mockReviewRequest.mock.calls.some((c: unknown[]) => {
      const arg = c[0] as { reason?: string } | undefined;
      return arg?.reason === 'Ditolak';
    });
    expect(anyDitolak).toBe(false);
  });

  it('[DCR-UI-4] badge "Perlu Revisi" muncul saat status revision_requested', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockUseDcrRequests.mockReturnValue({
      requests: [{
        id: 'req1', status: 'revision_requested', requestor_id: 'u-pic',
        old_deadline: '2026-07-01', new_deadline: '2026-07-10',
        reason: 'r', revision_reason: 'bukti kurang',
      }],
      isLoading: false, enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Perlu Revisi')).toBeTruthy();
  });

  it('[DCR-UI-5] pengaju lihat form revisi inline + alasan reviewer read-only; "Kirim Revisi" panggil resubmit (bukan create)', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockProfile.id = 'u-pic';
    mockUseDcrRequests.mockReturnValue({
      requests: [{
        id: 'req1', status: 'revision_requested', requestor_id: 'u-pic',
        old_deadline: '2026-07-01', new_deadline: '2026-07-10',
        reason: 'r awal', revision_reason: 'butuh detail bukti',
      }],
      isLoading: false, enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    // Alasan reviewer tampil
    expect(await screen.findByText('butuh detail bukti')).toBeTruthy();
    // Prefill deadline baru
    const dl = await screen.findByLabelText(/Deadline baru revisi untuk req1/i);
    expect(dl.props.value).toBe('2026-07-10');
    fireEvent.changeText(dl, '2026-07-15');
    await waitFor(() => expect(dl.props.value).toBe('2026-07-15'));
    const rs = await screen.findByLabelText(/Alasan revisi terbaru untuk req1/i);
    fireEvent.changeText(rs, 'sudah dilampirkan bukti tambahan');
    await waitFor(() => expect(rs.props.value).toBe('sudah dilampirkan bukti tambahan'));
    fireEvent.press(screen.getByLabelText('Kirim Revisi permintaan req1'));
    await waitFor(() =>
      expect(mockResubmitRequest).toHaveBeenCalledWith({
        requestId: 'req1',
        newDeadline: '2026-07-15',
        reason: 'sudah dilampirkan bukti tambahan',
      }),
    );
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it('[DCR-UI-6] reviewer tidak melihat tombol aksi saat status revision_requested', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockCan.mockReturnValue(true);
    mockProfile.id = 'u-approver';
    mockUseDcrRequests.mockReturnValue({
      requests: [{
        id: 'req1', status: 'revision_requested', requestor_id: 'u-pic',
        old_deadline: '2026-07-01', new_deadline: '2026-07-10',
        reason: 'r', revision_reason: 'kurang bukti',
      }],
      isLoading: false, enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    await screen.findByText('Perlu Revisi');
    expect(screen.queryByLabelText('Setujui permintaan req1')).toBeNull();
    expect(screen.queryByLabelText('Tolak permintaan req1')).toBeNull();
    expect(screen.queryByLabelText('Minta revisi permintaan req1')).toBeNull();
  });

  it('[DCR-UI-7] anti double-submit: isPending true → onPress reviewer tidak memanggil handler', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockCan.mockReturnValue(true);
    mockProfile.id = 'u-approver';
    mockDcrIsPending.current = true;
    mockUseDcrRequests.mockReturnValue({
      requests: [{ id: 'req1', status: 'pending', requestor_id: 'u-pic', old_deadline: '2026-07-01', new_deadline: '2026-07-10', reason: 'r' }],
      isLoading: false, enabled: true,
    });
    await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    fireEvent.press(await screen.findByLabelText('Setujui permintaan req1'));
    await waitFor(() => expect(mockReviewRequest).not.toHaveBeenCalled());
  });

  it('[F8-UI-14] approver lihat tombol Setujui/Tolak; anti-self menyembunyikan', async () => {
    mockParams.current = { taskId: 'ap1', oldDeadline: '2026-07-01' };
    mockCan.mockReturnValue(true);
    mockProfile.id = 'u-approver';
    mockUseDcrRequests.mockReturnValue({
      requests: [{ id: 'req1', status: 'pending', requestor_id: 'u-pic', old_deadline: '2026-07-01', new_deadline: '2026-07-10', reason: 'r' }],
      isLoading: false,
      enabled: true,
    });
    const view = await render(<DeadlineChangeRequestScreen />, { wrapper: wrapper() });
    expect(await screen.findByLabelText('Setujui permintaan req1')).toBeTruthy();
    expect(screen.getByLabelText('Tolak permintaan req1')).toBeTruthy();

    // anti-self: requestor = approver → tombol hilang
    mockUseDcrRequests.mockReturnValue({
      requests: [{ id: 'req1', status: 'pending', requestor_id: 'u-approver', old_deadline: '2026-07-01', new_deadline: '2026-07-10', reason: 'r' }],
      isLoading: false,
      enabled: true,
    });
    view.rerender(<DeadlineChangeRequestScreen />);
    await waitFor(() => expect(screen.queryByLabelText('Setujui permintaan req1')).toBeNull());
  });
});

describe('evaluation', () => {
  it('[F8-UI-17] anti-self: PIC = profil → tidak bisa submit + pesan error', async () => {
    mockParams.current = { actionPlanId: 'i1', picId: 'u-pic', status: 'done' };
    mockProfile.id = 'u-pic';
    await render(<EvaluationScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/tidak dapat mengevaluasi action_plannya sendiri/i)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Simpan Evaluasi'));
    await waitFor(() => expect(mockRecord).not.toHaveBeenCalled());
  });

  it('[F8-UI-18] UPSERT pre-fill existing evaluation; submit memanggil record', async () => {
    mockParams.current = { actionPlanId: 'i1', picId: 'u-pic', status: 'done' };
    mockProfile.id = 'u-reviewer';
    mockUseEvaluation.mockReturnValue({
      evaluation: { id: 'ev1', target_achieved: 'sebagian', results: 'hampir tercapai', lessons_learned: '' },
      isLoading: false,
      enabled: true,
    });
    await render(<EvaluationScreen />, { wrapper: wrapper() });
    const input = await screen.findByDisplayValue('hampir tercapai');
    fireEvent.changeText(input, 'lebih baik');
    await waitFor(() => expect(input.props.value).toBe('lebih baik'));
    fireEvent.press(screen.getByLabelText('Simpan Evaluasi'));
    await waitFor(() =>
      expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ actionPlanId: 'i1', results: 'lebih baik' })),
    );
  });

  it('[F8-UI-19] status bukan done/active → prompt evaluasi tidak muncul', async () => {
    mockParams.current = { actionPlanId: 'i1', picId: 'u-pic', status: 'draft' };
    mockProfile.id = 'u-reviewer';
    await render(<EvaluationScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/belum tersedia/i)).toBeTruthy();
    expect(screen.queryByLabelText('Simpan Evaluasi')).toBeNull();
  });
});

describe('search', () => {
  it('[F8-UI-20a] empty state saat query kosong', async () => {
    await render(<SearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText(/Mulai mencari/i)).toBeTruthy();
  });

  it('[F8-UI-20b] hasil pencarian dengan label entity_type', async () => {
    mockUseSearch.mockReturnValue({
      results: [{ id: 'i1', entity_type: 'action_plan', name: 'Migrasi Server', status: 'active' }],
      isLoading: false,
      enabled: true,
    });
    await render(<SearchScreen />, { wrapper: wrapper() });
    expect(await screen.findByText('Migrasi Server')).toBeTruthy();
    expect(screen.getByText('Action Plan')).toBeTruthy();
  });
});
