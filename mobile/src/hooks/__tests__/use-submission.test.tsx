// Hook tests: useKpiCandidates + useKpiCurrentValue + useSubmissionFlow.
// Mock @/lib/cards + @/lib/storage agar tak menyentuh Supabase nyata.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockCreateDraft = jest.fn();
const mockFinalize = jest.fn();
const mockListCandidates = jest.fn();
const mockGetCurrentValue = jest.fn();
const mockUpload = jest.fn();
const mockCleanup = jest.fn();

jest.mock('@/lib/cards', () => ({
  createSubmissionDraft: (...a: unknown[]) => mockCreateDraft(...a),
  finalizeSubmission: (...a: unknown[]) => mockFinalize(...a),
  listKpiAreaCandidates: (...a: unknown[]) => mockListCandidates(...a),
  getKpiAreaCurrentValue: (...a: unknown[]) => mockGetCurrentValue(...a),
}));

jest.mock('@/lib/storage', () => ({
  uploadEvidenceFile: (...a: unknown[]) => mockUpload(...a),
  cleanupOrphanUpload: (...a: unknown[]) => mockCleanup(...a),
}));

// eslint-disable-next-line import/first
import { useKpiCandidates, useKpiCurrentValue, useSubmissionFlow } from '../use-submission';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockCreateDraft.mockReset();
  mockFinalize.mockReset();
  mockListCandidates.mockReset();
  mockGetCurrentValue.mockReset();
  mockUpload.mockReset();
  mockCleanup.mockReset();
  mockCreateDraft.mockResolvedValue('draft-1');
  mockFinalize.mockResolvedValue('submission-1');
  mockListCandidates.mockResolvedValue([{ id: 'k1', name: 'KPI 1' }]);
  mockGetCurrentValue.mockResolvedValue({ numeric_total: 120, text_count: 0, last_approved_at: null });
  mockUpload.mockResolvedValue({ path: 'org/ap/draft-1/uuid-x.pdf', mimeType: 'application/pdf' });
  mockCleanup.mockResolvedValue(undefined);
});

describe('useKpiCandidates', () => {
  it('[H1] memanggil listKpiAreaCandidates(id) saat actionPlanId terisi', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useKpiCandidates('ap-1'), { wrapper });
    await waitFor(() => expect(result.current.candidates).toHaveLength(1));
    expect(mockListCandidates).toHaveBeenCalledWith('ap-1');
  });

  it('[H2] disabled saat actionPlanId undefined → tidak panggil RPC', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useKpiCandidates(undefined), { wrapper });
    expect(mockListCandidates).not.toHaveBeenCalled();
  });

  it('[H3] empty list = 0 candidates → OD-1 fallback (UI hide section)', async () => {
    mockListCandidates.mockResolvedValueOnce([]);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useKpiCandidates('ap-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.candidates).toHaveLength(0);
  });
});

describe('useKpiCurrentValue', () => {
  it('[H4] memanggil getKpiAreaCurrentValue(id) saat kpiAreaId terisi', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useKpiCurrentValue('k1'), { wrapper });
    await waitFor(() => expect(result.current.value?.numeric_total).toBe(120));
    expect(mockGetCurrentValue).toHaveBeenCalledWith('k1');
  });

  it('[H5] disabled saat kpiAreaId null/undefined → tidak panggil RPC', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useKpiCurrentValue(null), { wrapper });
    expect(mockGetCurrentValue).not.toHaveBeenCalled();
  });
});

describe('useSubmissionFlow — 2-phase commit', () => {
  const baseInput = {
    orgId: 'org-1',
    pendingFiles: [
      { uri: 'file:///a.pdf', name: 'a.pdf', size: 100, mimeType: 'application/pdf' },
      { uri: 'file:///b.png', name: 'b.png', size: 200, mimeType: 'image/png' },
    ],
    staticEvidence: [{ kind: 'text_note', text_content: 'catatan' }],
    resultValues: [{ strategy_id: 'k1', label: 'r', value_type: 'number', value_text: '145', value_numeric: 145 }],
    note: 'oke',
  };

  it('[H6] sukses: createDraft → uploadParallel → finalize; messages id dikembalikan', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSubmissionFlow('ap-1'), { wrapper });
    const id = await result.current.runSubmission(baseInput);
    expect(id).toBe('submission-1');
    expect(mockCreateDraft).toHaveBeenCalledWith('ap-1', 2);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockFinalize).toHaveBeenCalledWith(expect.objectContaining({
      submissionDraftId: 'draft-1',
      note: 'oke',
      evidence: expect.any(Array),
      resultValues: baseInput.resultValues,
    }));
  });

  it('[H7] anti double-tap: tap kedua saat in-flight → createDraft cuma 1x (Critic §7.2 H_HM2)', async () => {
    let resolveDraft: (v: string) => void = () => undefined;
    mockCreateDraft.mockImplementationOnce(() => new Promise<string>((res) => { resolveDraft = res; }));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSubmissionFlow('ap-1'), { wrapper });
    const p1 = result.current.runSubmission(baseInput);
    const p2 = result.current.runSubmission(baseInput);
    // mutateAsync menjadwalkan mutationFn async → tunggu sampai mockCreateDraft benar2 dipanggil
    // sebelum resolveDraft (jika tidak, resolveDraft no-op karena promise belum di-create).
    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalled());
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
    resolveDraft('draft-1');
    await Promise.all([p1, p2]);
    expect(mockCreateDraft).toHaveBeenCalledTimes(1);
  });

  it('[H8] actionPlanId undefined → reject tanpa panggil RPC', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSubmissionFlow(undefined), { wrapper });
    await expect(result.current.runSubmission(baseInput)).rejects.toThrow(/Action Plan ID/);
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it('[H9] upload gagal di file ke-2 → cleanup HANYA untuk file ke-1 (path ter-upload)', async () => {
    mockUpload
      .mockResolvedValueOnce({ path: 'org/ap/draft-1/uuid-a.pdf', mimeType: 'application/pdf' })
      .mockRejectedValueOnce(new Error('upload fail'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSubmissionFlow('ap-1'), { wrapper });
    await expect(result.current.runSubmission(baseInput)).rejects.toThrow(/upload fail/);
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(mockCleanup).toHaveBeenCalledWith('org/ap/draft-1/uuid-a.pdf');
  });

  it('[H10] semua upload gagal → cleanup TIDAK dipanggil dgn array kosong', async () => {
    mockUpload.mockRejectedValue(new Error('upload fail'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSubmissionFlow('ap-1'), { wrapper });
    await expect(result.current.runSubmission(baseInput)).rejects.toThrow();
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it('[H11] finalize gagal SETELAH 2 file sukses → cleanup kedua path', async () => {
    mockUpload
      .mockResolvedValueOnce({ path: 'p1', mimeType: 'application/pdf' })
      .mockResolvedValueOnce({ path: 'p2', mimeType: 'image/png' });
    mockFinalize.mockRejectedValueOnce(new Error('server reject'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSubmissionFlow('ap-1'), { wrapper });
    await expect(result.current.runSubmission(baseInput)).rejects.toThrow(/server reject/);
    expect(mockCleanup).toHaveBeenCalledTimes(2);
    expect(mockCleanup.mock.calls.map((c) => c[0]).sort()).toEqual(['p1', 'p2']);
  });

  it('[H12] sukses → invalidate ["action-plan",id]+["action-plan-submissions",id]+["kpi_candidates",id]+["kpi_current_value"]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useSubmissionFlow('ap-1'), { wrapper });
    await result.current.runSubmission(baseInput);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toEqual(expect.arrayContaining([
      JSON.stringify(['action-plan', 'ap-1']),
      JSON.stringify(['action-plan-submissions', 'ap-1']),
      JSON.stringify(['kpi_candidates', 'ap-1']),
      JSON.stringify(['kpi_current_value']),
    ]));
  });

  it('[H13] 0 file (text/link only) → tidak panggil upload sama sekali; tetap finalize', async () => {
    const input = { ...baseInput, pendingFiles: [] };
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useSubmissionFlow('ap-1'), { wrapper });
    await result.current.runSubmission(input);
    expect(mockCreateDraft).toHaveBeenCalledWith('ap-1', 0);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockFinalize).toHaveBeenCalled();
  });
});
