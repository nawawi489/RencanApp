// Hooks Fase 8 — use-activity-governance (read-only). Mock @/lib/activity-governance.
// UPDATE 2026-07-17: useActivityLog kini pakai useInfiniteQuery (filter chip + search push
// ke server; virtualisasi via SectionList di layar). Test disesuaikan agar mencocokkan
// invocation shape baru & queryKey namespace baru (`inf`).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListActivityLog = jest.fn();
const mockListGovernanceViolations = jest.fn();

jest.mock('@/lib/activity-governance', () => ({
  __esModule: true,
  ACTIVITY_LOG_PAGE_SIZE: 30,
  listActivityLog: (...a: unknown[]) => mockListActivityLog(...a),
  listGovernanceViolations: (...a: unknown[]) => mockListGovernanceViolations(...a),
}));

// eslint-disable-next-line import/first
import { useActivityLog, useGovernanceViolations } from '../use-activity-governance';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockListActivityLog.mockReset().mockResolvedValue([{ id: 'a1', action: 'create' }]);
  mockListGovernanceViolations.mockReset().mockResolvedValue([{ id: 'v1', severity: 'high' }]);
});

it('[F8-H20] useActivityLog memuat halaman pertama dgn chip+q default', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useActivityLog(), { wrapper });
  await waitFor(() => expect(result.current.logs).toHaveLength(1));
  expect(mockListActivityLog).toHaveBeenCalledWith({ chip: 'semua', q: '', page: 0, limit: 30 });
});

it('[F8-H21] filter chip diteruskan ke listActivityLog & queryKey terisolasi per chip', async () => {
  const { qc, wrapper } = makeWrapper();
  await renderHook(() => useActivityLog({ chip: 'create' }), { wrapper });
  await waitFor(() => expect(mockListActivityLog).toHaveBeenCalledWith(
    expect.objectContaining({ chip: 'create', q: '' }),
  ));
  expect(qc.getQueryData(['activity_log', 'inf', 'create', ''])).toBeTruthy();
});

it('[F8-H22] read-only: hook tidak mengekspos mutation', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useActivityLog(), { wrapper });
  await waitFor(() => expect(mockListActivityLog).toHaveBeenCalled());
  const keys = Object.keys(result.current);
  expect(keys).not.toContain('mutate');
  expect(keys).not.toContain('create');
  expect(keys).not.toContain('remove');
  // API infinite scroll: fetchNextPage/hasNextPage/isFetchingNextPage adalah passthrough
  // pagination — bukan mutation.
  expect(keys.sort()).toEqual([
    'fetchNextPage',
    'hasNextPage',
    'isError',
    'isFetchingNextPage',
    'isLoading',
    'logs',
    'refetch',
  ]);
});

it('[F8-H23] useGovernanceViolations mengambil violations', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useGovernanceViolations(), { wrapper });
  await waitFor(() => expect(result.current.violations).toHaveLength(1));
});

it('[F8-H24] queryKey ["governance_violations",...] tidak bentrok ["mbr_rules"]', async () => {
  const { qc, wrapper } = makeWrapper();
  await renderHook(() => useGovernanceViolations(), { wrapper });
  await waitFor(() => expect(mockListGovernanceViolations).toHaveBeenCalled());
  expect(qc.getQueryData(['governance_violations', null, 0])).toHaveLength(1);
  expect(qc.getQueryData(['mbr_rules'])).toBeUndefined();
});
