// Hooks Fase 2 — use-repeat-instances. Mock data layer (@/lib/repeat) agar tak menyentuh Supabase.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListInstances = jest.fn();
const mockGetRepeatCompliance = jest.fn();

jest.mock('@/lib/repeat', () => ({
  listInstances: (...a: unknown[]) => mockListInstances(...a),
  getRepeatCompliance: (...a: unknown[]) => mockGetRepeatCompliance(...a),
}));

import { useInstanceActions, useRepeatInstances } from '../use-repeat-instances';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

const COMPLIANCE = {
  expected_count: 30,
  on_time_count: 28,
  missed_count: 2,
  done_count: 28,
  compliance: 0.9333,
};

beforeEach(() => {
  mockListInstances.mockReset();
  mockGetRepeatCompliance.mockReset();
  mockListInstances.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
  mockGetRepeatCompliance.mockResolvedValue(COMPLIANCE);
});

describe('useRepeatInstances', () => {
  it('[1] mengambil daftar instance via data layer dan mengekspos data saat sukses', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useRepeatInstances('ap-1'), { wrapper });
    await waitFor(() => expect(result.current.instances).toHaveLength(2));
    expect(mockListInstances).toHaveBeenCalledWith('ap-1');
  });

  it('[2] hanya enabled saat id terisi (id kosong → data layer tidak dipanggil)', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useRepeatInstances(''), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockListInstances).not.toHaveBeenCalled();
    expect(mockGetRepeatCompliance).not.toHaveBeenCalled();
  });

  it('[2b] tidak fetch saat enabled=false (mis. action plan one_time)', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useRepeatInstances('ap-1', { enabled: false }), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockListInstances).not.toHaveBeenCalled();
    expect(mockGetRepeatCompliance).not.toHaveBeenCalled();
  });

  it('[3] menghitung compliancePercent dari on_time_count/expected_count', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useRepeatInstances('ap-1'), { wrapper });
    await waitFor(() => expect(result.current.compliance).not.toBeUndefined());
    expect(result.current.compliancePercent).toBe(93); // round(28/30*100)
  });

  it('[4] compliancePercent null saat expected_count 0 (anti div-by-zero)', async () => {
    mockGetRepeatCompliance.mockResolvedValue({
      expected_count: 0,
      on_time_count: 0,
      missed_count: 0,
      done_count: 0,
      compliance: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useRepeatInstances('ap-1'), { wrapper });
    await waitFor(() => expect(result.current.compliance).not.toBeUndefined());
    expect(result.current.compliancePercent).toBeNull();
  });

  it('[5] refresh() meng-invalidate query instances & compliance', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useRepeatInstances('ap-1'), { wrapper });
    await waitFor(() => expect(result.current.instances).toHaveLength(2));
    result.current.refresh();
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes('repeat-instances'))).toBe(true);
    expect(keys.some((k) => k.includes('repeat-compliance'))).toBe(true);
  });
});

describe('useInstanceActions', () => {
  const base = { pic_id: 'pic', reviewer_id: 'rev' };

  it('[6] menentukan aksi dari status + peran (PIC vs Reviewer)', () => {
    // PIC, status assigned → boleh mulai & submit, tak boleh review
    let a = useInstanceActions({ ...base, status: 'assigned' }, 'pic');
    expect(a.canStart).toBe(true);
    expect(a.canSubmit).toBe(true);
    expect(a.canReview).toBe(false);

    // PIC, status in_progress → submit ya, start tidak
    a = useInstanceActions({ ...base, status: 'in_progress' }, 'pic');
    expect(a.canStart).toBe(false);
    expect(a.canSubmit).toBe(true);

    // PIC, status missed → tak boleh submit
    a = useInstanceActions({ ...base, status: 'missed' }, 'pic');
    expect(a.canSubmit).toBe(false);

    // Reviewer, status submitted → boleh review
    a = useInstanceActions({ ...base, status: 'submitted' }, 'rev');
    expect(a.canReview).toBe(true);
    expect(a.canSubmit).toBe(false);
  });

  it('[7] menonaktifkan review saat PIC == Reviewer (anti-self-approval di UI)', () => {
    const a = useInstanceActions({ pic_id: 'same', reviewer_id: 'same', status: 'submitted' }, 'same');
    expect(a.isSelfApproval).toBe(true);
    expect(a.canReview).toBe(false);
  });
});
