// Hooks Fase 8 — use-confidential-access (fail-deny). Mock @/lib/confidential-access.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockList = jest.fn();
const mockGrant = jest.fn();

jest.mock('@/lib/confidential-access', () => ({
  listConfidentialAccessRules: (...a: unknown[]) => mockList(...a),
  grantConfidentialAccess: (...a: unknown[]) => mockGrant(...a),
}));

// eslint-disable-next-line import/first
import { useConfidentialAccessActions, useConfidentialAccessRules } from '../use-confidential-access';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([{ id: 'r1' }]);
  mockGrant.mockReset().mockResolvedValue('r1');
});

it('[F8-H25] useConfidentialAccessRules mengambil rules', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useConfidentialAccessRules('initiative', 'i1'), { wrapper });
  await waitFor(() => expect(result.current.rules).toHaveLength(1));
  expect(mockList).toHaveBeenCalledWith('initiative', 'i1');
});

it('[F8-H26] grantAccess meneruskan payload & invalidate confidential_access_rules', async () => {
  const { qc, wrapper } = makeWrapper();
  const spy = jest.spyOn(qc, 'invalidateQueries');
  const { result } = await renderHook(() => useConfidentialAccessActions(), { wrapper });
  await act(async () => {
    await result.current.grantAccess({ entityType: 'initiative', entityId: 'i1', userId: 'u2' });
  });
  expect(mockGrant).toHaveBeenCalled();
  expect(spy).toHaveBeenCalledWith({ queryKey: ['confidential_access_rules'] });
});

it('[F8-H27] fail-deny: data undefined → isAccessGranted false', async () => {
  mockList.mockImplementation(() => new Promise(() => undefined));
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useConfidentialAccessRules('initiative', 'i1'), { wrapper });
  expect(result.current.isAccessGranted).toBe(false);
  expect(result.current.rules).toEqual([]);
});
