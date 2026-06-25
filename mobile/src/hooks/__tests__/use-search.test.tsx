// Hooks Fase 8 — use-search. Mock searchCards dari @/lib/governance-admin.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockSearchCards = jest.fn();

jest.mock('@/lib/governance-admin', () => ({
  searchCards: (...a: unknown[]) => mockSearchCards(...a),
}));

// eslint-disable-next-line import/first
import { useSearchCards } from '../use-search';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockSearchCards.mockReset().mockResolvedValue([{ id: 'g1', entity_type: 'goal', name: 'G', status: 'active' }]);
});

it('[F8-H28] useSearchCards mengambil hasil dgn query string', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useSearchCards({ query: 'Goal' }), { wrapper });
  await waitFor(() => expect(result.current.results).toHaveLength(1));
  expect(mockSearchCards).toHaveBeenCalledWith('Goal', null, false);
});

it('[F8-H29] enabled:false saat query kosong', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useSearchCards({ query: '   ' }), { wrapper });
  await waitFor(() => expect(result.current.enabled).toBe(false));
  expect(mockSearchCards).not.toHaveBeenCalled();
});
