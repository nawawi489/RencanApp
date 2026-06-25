// Hooks Fase 5 — use-mbr. Mock data layer (@/lib/settings-mbr) agar tak menyentuh Supabase.
// Menguji: useMbrRules (list + enabled + refetch), useMbrCompliance (key + enabled + default
// is_compliant true saat hilang), useMbrRuleActions (setRule + invalidasi cache).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListMbrRules = jest.fn();
const mockSetMbrRule = jest.fn();
const mockCheckMbrCompliance = jest.fn();

jest.mock('@/lib/settings-mbr', () => ({
  listMbrRules: (...a: unknown[]) => mockListMbrRules(...a),
  setMbrRule: (...a: unknown[]) => mockSetMbrRule(...a),
  checkMbrCompliance: (...a: unknown[]) => mockCheckMbrCompliance(...a),
}));

// eslint-disable-next-line import/first -- jest.mock must precede the import it mocks
import { useMbrCompliance, useMbrRuleActions, useMbrRules } from '../use-mbr';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

const RULE = {
  id: 'r1',
  organization_id: 'org1',
  parent_card_type: 'kpi_area' as const,
  child_card_type: 'strategy' as const,
  min_count: 3,
  enforcement_mode: 'hanya_peringatan' as const,
  created_at: null,
  updated_at: null,
  updated_by: null,
};

const COMPLIANCE = {
  child_card_type: 'strategy' as const,
  child_count: 2,
  min_count: 3,
  enforcement_mode: 'blokir_aktivasi' as const,
  is_compliant: false,
};

beforeEach(() => {
  mockListMbrRules.mockReset();
  mockSetMbrRule.mockReset();
  mockCheckMbrCompliance.mockReset();
  mockListMbrRules.mockResolvedValue([RULE]);
  mockCheckMbrCompliance.mockResolvedValue(COMPLIANCE);
  mockSetMbrRule.mockResolvedValue('rule-uuid');
});

describe('useMbrRules', () => {
  it('[1] mengambil daftar rules dari data layer; rules.length cocok hasil mock', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMbrRules(), { wrapper });
    await waitFor(() => expect(result.current.rules).toHaveLength(1));
    expect(mockListMbrRules).toHaveBeenCalledTimes(1);
  });

  it('[2] queryKey eksak ["mbr_rules"] (tidak bentrok dengan key Fase 4)', async () => {
    const { qc, wrapper } = makeWrapper();
    await renderHook(() => useMbrRules(), { wrapper });
    await waitFor(() => expect(mockListMbrRules).toHaveBeenCalled());
    expect(qc.getQueryData(['mbr_rules'])).toEqual([RULE]);
  });

  it('[3] rules default [] saat data belum tersedia (isLoading)', async () => {
    mockListMbrRules.mockImplementation(
      () => new Promise(() => undefined), // pending forever
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMbrRules(), { wrapper });
    expect(result.current.rules).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});

describe('useMbrCompliance', () => {
  it('[4] queryKey ["mbr_compliance", parentType, parentId] terisolasi per pasangan', async () => {
    const { qc, wrapper } = makeWrapper();
    await renderHook(() => useMbrCompliance('kpi_area', 'k1'), { wrapper });
    await waitFor(() => expect(mockCheckMbrCompliance).toHaveBeenCalledWith('kpi_area', 'k1'));
    expect(qc.getQueryData(['mbr_compliance', 'kpi_area', 'k1'])).toEqual(COMPLIANCE);
  });

  it('[5] tidak fetch saat id kosong (enabled=false)', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(() => useMbrCompliance('kpi_area', ''), { wrapper });
    await waitFor(() => expect(true).toBe(true));
    expect(mockCheckMbrCompliance).not.toHaveBeenCalled();
  });

  it('[6] tidak fetch saat parentType kosong', async () => {
    const { wrapper } = makeWrapper();
    await renderHook(
      () => useMbrCompliance('' as unknown as 'kpi_area', 'k1'),
      { wrapper },
    );
    await waitFor(() => expect(true).toBe(true));
    expect(mockCheckMbrCompliance).not.toHaveBeenCalled();
  });

  it('[7] default fail-open: compliance hilang → is_compliant true (jangan blokir UI saat data null)', async () => {
    mockCheckMbrCompliance.mockImplementation(
      () => new Promise(() => undefined), // pending: compliance undefined
    );
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMbrCompliance('kpi_area', 'k1'), { wrapper });
    // Sebelum data tersedia: compliance undefined → isCompliant true (fail-open client; server otoritatif).
    expect(result.current.compliance).toBeUndefined();
    expect(result.current.isCompliant).toBe(true);
  });

  it('[8] saat data tiba, isCompliant mengikuti compliance.is_compliant', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMbrCompliance('kpi_area', 'k1'), { wrapper });
    await waitFor(() => expect(result.current.compliance).not.toBeUndefined());
    expect(result.current.isCompliant).toBe(false);
  });

  it('[8b] mengekspos refetch() untuk refresh indikator (dipakai useFocusEffect induk)', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMbrCompliance('kpi_area', 'k1'), { wrapper });
    await waitFor(() => expect(mockCheckMbrCompliance).toHaveBeenCalledTimes(1));
    expect(typeof result.current.refetch).toBe('function');
    await act(() => result.current.refetch());
    expect(mockCheckMbrCompliance).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------- Fase 6: MBR flip — dev types
// Regression guard: useMbrCompliance generik tidak berubah. Hijau di sini menegaskan hook
// meneruskan tipe 'development_area' / 'problem_statement' apa adanya — sumber kebenaran
// flip RPC ada di DB contract suite (TEST10 fase6 contract).
describe('useMbrCompliance — Fase 6 dev types', () => {
  it('[F6-12] meneruskan parentType "development_area" ke data layer', async () => {
    const DEV_COMPLIANCE = {
      child_card_type: 'problem_statement' as const,
      child_count: 0,
      min_count: 1,
      enforcement_mode: 'hanya_peringatan' as const,
      is_compliant: false,
    };
    mockCheckMbrCompliance.mockResolvedValueOnce(DEV_COMPLIANCE);
    const { qc, wrapper } = makeWrapper();
    const { result } = await renderHook(
      () => useMbrCompliance('development_area', 'd1'),
      { wrapper },
    );
    await waitFor(() =>
      expect(mockCheckMbrCompliance).toHaveBeenCalledWith('development_area', 'd1'),
    );
    expect(qc.getQueryData(['mbr_compliance', 'development_area', 'd1'])).toEqual(DEV_COMPLIANCE);
    expect(result.current.isCompliant).toBe(false);
  });

  it('[F6-13] meneruskan parentType "problem_statement"', async () => {
    const PS_COMPLIANCE = {
      child_card_type: 'initiative' as const,
      child_count: 1,
      min_count: 1,
      enforcement_mode: 'hanya_peringatan' as const,
      is_compliant: true,
    };
    mockCheckMbrCompliance.mockResolvedValueOnce(PS_COMPLIANCE);
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(
      () => useMbrCompliance('problem_statement', 'p1'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.compliance).toEqual(PS_COMPLIANCE));
    expect(mockCheckMbrCompliance).toHaveBeenCalledWith('problem_statement', 'p1');
    expect(result.current.isCompliant).toBe(true);
  });
});

describe('useMbrRuleActions', () => {
  it('[9] setRule meneruskan input ke data layer & mengembalikan id baru', async () => {
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMbrRuleActions(), { wrapper });
    const id = await act(() =>
      result.current.setRule({
        parentCardType: 'kpi_area',
        childCardType: 'strategy',
        minCount: 3,
        enforcementMode: 'hanya_peringatan',
      }),
    );
    expect(mockSetMbrRule).toHaveBeenCalledWith({
      parentCardType: 'kpi_area',
      childCardType: 'strategy',
      minCount: 3,
      enforcementMode: 'hanya_peringatan',
    });
    expect(id).toBe('rule-uuid');
  });

  it('[10] setRule sukses → invalidate ["mbr_rules"]', async () => {
    const { qc, wrapper } = makeWrapper();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const { result } = await renderHook(() => useMbrRuleActions(), { wrapper });
    await act(() =>
      result.current.setRule({
        parentCardType: 'kpi_area',
        childCardType: 'strategy',
        minCount: 3,
        enforcementMode: 'hanya_peringatan',
      }),
    );
    const keys = spy.mock.calls.map((c) =>
      JSON.stringify((c[0] as { queryKey: unknown }).queryKey),
    );
    expect(keys.some((k) => k.includes('mbr_rules'))).toBe(true);
  });

  it('[11] propagasi error dari data layer (mis. permission denied)', async () => {
    mockSetMbrRule.mockRejectedValueOnce({ message: 'permission denied' });
    const { wrapper } = makeWrapper();
    const { result } = await renderHook(() => useMbrRuleActions(), { wrapper });
    await expect(
      act(() =>
        result.current.setRule({
          parentCardType: 'kpi_area',
          childCardType: 'strategy',
          minCount: 3,
          enforcementMode: 'hanya_peringatan',
        }),
      ),
    ).rejects.toEqual({ message: 'permission denied' });
  });
});
