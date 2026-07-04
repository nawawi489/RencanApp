// Hooks Fase 8 — use-confidential-access (fail-deny). Mock @/lib/confidential-access.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockList = jest.fn();

jest.mock('@/lib/confidential-access', () => ({
  listConfidentialAccessRules: (...a: unknown[]) => mockList(...a),
}));

// eslint-disable-next-line import/first
import { useConfidentialAccessRules } from '../use-confidential-access';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([{ id: 'r1' }]);
});

it('[F8-H25] useConfidentialAccessRules mengambil rules', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useConfidentialAccessRules('initiative', 'i1'), { wrapper });
  await waitFor(() => expect(result.current.rules).toHaveLength(1));
  expect(mockList).toHaveBeenCalledWith('initiative', 'i1');
});

it('[F8-H27] fail-deny: data undefined → isAccessGranted false', async () => {
  mockList.mockImplementation(() => new Promise(() => undefined));
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useConfidentialAccessRules('initiative', 'i1'), { wrapper });
  expect(result.current.isAccessGranted).toBe(false);
  expect(result.current.rules).toEqual([]);
});
