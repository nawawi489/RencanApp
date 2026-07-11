// Hooks Fase 8 — use-governance-admin (DCR, Evaluation, Archive). Mock @/lib/governance-admin.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockGov = {
  listDeadlineChangeRequests: jest.fn(),
  createDeadlineChangeRequest: jest.fn(),
  reviewDeadlineChange: jest.fn(),
  resubmitDeadlineChangeRequest: jest.fn(),
  getEvaluation: jest.fn(),
  recordEvaluation: jest.fn(),
  archiveCard: jest.fn(),
};

jest.mock('@/lib/governance-admin', () => ({
  listDeadlineChangeRequests: (...a: unknown[]) => mockGov.listDeadlineChangeRequests(...a),
  createDeadlineChangeRequest: (...a: unknown[]) => mockGov.createDeadlineChangeRequest(...a),
  reviewDeadlineChange: (...a: unknown[]) => mockGov.reviewDeadlineChange(...a),
  resubmitDeadlineChangeRequest: (...a: unknown[]) => mockGov.resubmitDeadlineChangeRequest(...a),
  getEvaluation: (...a: unknown[]) => mockGov.getEvaluation(...a),
  recordEvaluation: (...a: unknown[]) => mockGov.recordEvaluation(...a),
  archiveCard: (...a: unknown[]) => mockGov.archiveCard(...a),
}));

// eslint-disable-next-line import/first
import {
  useArchiveActions,
  useDeadlineChangeActions,
  useDeadlineChangeRequests,
  useEvaluation,
  useEvaluationActions,
} from '../use-governance-admin';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  Object.values(mockGov).forEach((fn) => fn.mockReset());
  mockGov.listDeadlineChangeRequests.mockResolvedValue([{ id: 'dcr1' }]);
  mockGov.createDeadlineChangeRequest.mockResolvedValue('dcr1');
  mockGov.reviewDeadlineChange.mockResolvedValue(undefined);
  mockGov.resubmitDeadlineChangeRequest.mockResolvedValue(undefined);
  mockGov.getEvaluation.mockResolvedValue({ id: 'e1' });
  mockGov.recordEvaluation.mockResolvedValue('e1');
  mockGov.archiveCard.mockResolvedValue(undefined);
});

describe('deadline change requests', () => {
  it('[F8-H8] useDeadlineChangeRequests mengambil list utk entityId', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useDeadlineChangeRequests('ap1'), { wrapper });
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    expect(mockGov.listDeadlineChangeRequests).toHaveBeenCalledWith('ap1');
  });

  it('[F8-H9] enabled:false saat entityId kosong', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useDeadlineChangeRequests(''), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(mockGov.listDeadlineChangeRequests).not.toHaveBeenCalled();
  });

  it('[F8-H10] createRequest meneruskan input & invalidate ["deadline_change_requests", entityId]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    await act(async () => {
      await result.current.createRequest({
        entityId: 'ap1', oldDeadline: '2026-07-01', newDeadline: '2026-07-10', reason: 'r',
      });
    });
    expect(mockGov.createDeadlineChangeRequest).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['deadline_change_requests', 'ap1'] });
  });

  it('[F8-H11] reviewRequest invalidate key setelah sukses', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    await act(async () => {
      await result.current.reviewRequest({ requestId: 'dcr1', decision: 'approved', entityId: 'ap1' });
    });
    expect(mockGov.reviewDeadlineChange).toHaveBeenCalledWith('dcr1', 'approved', undefined);
    // Invalidate via prefix supaya entityId opsional yang dihilangkan caller tidak bikin list basi.
    expect(spy).toHaveBeenCalledWith({ queryKey: ['deadline_change_requests'] });
  });

  it('[F8-H12] reviewRequest self-approval error propagasi', async () => {
    mockGov.reviewDeadlineChange.mockRejectedValue(new Error('sendiri'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    await expect(
      result.current.reviewRequest({ requestId: 'dcr1', decision: 'approved' }),
    ).rejects.toThrow('sendiri');
  });

  it('[DCR-H-1] reviewRequest decision revision_requested + reason ke data layer', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    await act(async () => {
      await result.current.reviewRequest({
        requestId: 'dcr1',
        decision: 'revision_requested',
        reason: 'butuh bukti',
        entityId: 'ap1',
      });
    });
    expect(mockGov.reviewDeadlineChange).toHaveBeenCalledWith('dcr1', 'revision_requested', 'butuh bukti');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['deadline_change_requests'] });
  });

  it('[DCR-H-2] resubmitRequest meneruskan input & invalidate prefix ["deadline_change_requests"]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    await act(async () => {
      await result.current.resubmitRequest({
        requestId: 'dcr1',
        newDeadline: '2026-07-20',
        reason: 'revisi bukti dilampirkan',
      });
    });
    expect(mockGov.resubmitDeadlineChangeRequest).toHaveBeenCalledWith({
      requestId: 'dcr1',
      newDeadline: '2026-07-20',
      reason: 'revisi bukti dilampirkan',
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['deadline_change_requests'] });
  });

  it('[DCR-H-3] resubmitRequest error propagasi', async () => {
    mockGov.resubmitDeadlineChangeRequest.mockRejectedValue(new Error('bukan pengaju'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    await expect(
      result.current.resubmitRequest({ requestId: 'dcr1', newDeadline: '2026-07-20', reason: 'r' }),
    ).rejects.toThrow('bukan pengaju');
  });

  it('[DCR-H-4] isPending true saat resubmitRequest berjalan', async () => {
    let resolveFn: () => void = () => undefined;
    mockGov.resubmitDeadlineChangeRequest.mockImplementation(
      () => new Promise<void>((r) => { resolveFn = r; }),
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    let p: Promise<unknown> = Promise.resolve();
    await act(async () => {
      p = result.current.resubmitRequest({ requestId: 'dcr1', newDeadline: '2026-07-20', reason: 'r' });
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    await act(async () => {
      resolveFn();
      await p;
    });
  });

  it('[F8-H36] isPending true saat reviewRequest berjalan', async () => {
    let resolveFn: () => void = () => undefined;
    mockGov.reviewDeadlineChange.mockImplementation(
      () => new Promise<void>((r) => { resolveFn = r; }),
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useDeadlineChangeActions(), { wrapper });
    let p: Promise<unknown> = Promise.resolve();
    await act(async () => {
      p = result.current.reviewRequest({ requestId: 'dcr1', decision: 'approved', entityId: 'ap1' });
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    // bersihkan act scope: resolve promise & tunggu agar render berikutnya tidak null.
    await act(async () => {
      resolveFn();
      await p;
    });
  });
});

describe('evaluation', () => {
  it('[F8-H16] useEvaluation mengambil evaluation utk initiativeId', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useEvaluation('i1'), { wrapper });
    await waitFor(() => expect(result.current.evaluation).toEqual({ id: 'e1' }));
    expect(mockGov.getEvaluation).toHaveBeenCalledWith('i1');
  });

  it('[F8-H17] useEvaluation enabled:false saat initiativeId kosong', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useEvaluation(''), { wrapper });
    await waitFor(() => expect(result.current.enabled).toBe(false));
    expect(mockGov.getEvaluation).not.toHaveBeenCalled();
  });

  it('[F8-H18] recordEvaluation invalidate ["evaluations", initiativeId]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useEvaluationActions(), { wrapper });
    await act(async () => {
      await result.current.record({ initiativeId: 'i1', targetAchieved: 'ya' });
    });
    expect(mockGov.recordEvaluation).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith({ queryKey: ['evaluations', 'i1'] });
  });

  it('[F8-H19] recordEvaluation self-evaluate error propagasi', async () => {
    mockGov.recordEvaluation.mockRejectedValue(new Error('PIC tidak dapat'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useEvaluationActions(), { wrapper });
    await expect(result.current.record({ initiativeId: 'i1' })).rejects.toThrow('PIC tidak dapat');
  });
});

describe('archive', () => {
  it('[F8-H33] archive meneruskan entityType+entityId & invalidate semua list workspace nyata', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useArchiveActions(), { wrapper });
    await act(async () => {
      await result.current.archive({ entityType: 'goal', entityId: 'g1' });
    });
    expect(mockGov.archiveCard).toHaveBeenCalledWith('goal', 'g1');
    // Key nyata yang dipakai use-workspace.ts; key 'workspace' tidak pernah ada di kode.
    expect(spy).toHaveBeenCalledWith({ queryKey: ['goals'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['strategies'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['strategies'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['initiatives'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['development_areas'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['problem_statements'] });
  });

  it('[F8-H34] archive card active error propagasi', async () => {
    mockGov.archiveCard.mockRejectedValue(new Error('hanya card selesai'));
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useArchiveActions(), { wrapper });
    await expect(result.current.archive({ entityType: 'goal', entityId: 'g1' })).rejects.toThrow(
      'hanya card selesai',
    );
  });
});
