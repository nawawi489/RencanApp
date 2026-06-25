// Hooks Fase 8 — use-activity-governance (read-only). Mock @/lib/activity-governance.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockListActivityLog = jest.fn();
const mockListGovernanceViolations = jest.fn();

jest.mock('@/lib/activity-governance', () => ({
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

it('[F8-H20] useActivityLog mengambil log dgn pagination', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useActivityLog({ page: 1 }), { wrapper });
  await waitFor(() => expect(result.current.logs).toHaveLength(1));
  expect(mockListActivityLog).toHaveBeenCalledWith({ action: undefined, page: 1 });
});

it('[F8-H21] queryKey terisolasi ["activity_log","page",pageNum]', async () => {
  const { qc, wrapper } = makeWrapper();
  await renderHook(() => useActivityLog({ page: 2 }), { wrapper });
  await waitFor(() => expect(mockListActivityLog).toHaveBeenCalled());
  expect(qc.getQueryData(['activity_log', 'page', 2, null])).toHaveLength(1);
});

it('[F8-H22] read-only: hook tidak mengekspos mutation', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useActivityLog(), { wrapper });
  await waitFor(() => expect(mockListActivityLog).toHaveBeenCalled());
  const keys = Object.keys(result.current);
  expect(keys).not.toContain('mutate');
  expect(keys).not.toContain('create');
  expect(keys).not.toContain('remove');
  expect(keys.sort()).toEqual(['isError', 'isLoading', 'logs', 'refetch']);
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
