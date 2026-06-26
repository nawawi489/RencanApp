// Hooks Fase 8 — use-video-briefs. Mock @/lib/video-briefs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { createElement } from 'react';

const mockGetVideoBrief = jest.fn();
const mockListVideoBriefs = jest.fn();
const mockMark = jest.fn();

jest.mock('@/lib/video-briefs', () => ({
  getVideoBrief: (...a: unknown[]) => mockGetVideoBrief(...a),
  listVideoBriefs: (...a: unknown[]) => mockListVideoBriefs(...a),
  markBriefUnderstood: (...a: unknown[]) => mockMark(...a),
}));

// eslint-disable-next-line import/first
import { useVideoBrief } from '../use-video-briefs';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

beforeEach(() => {
  mockGetVideoBrief.mockReset().mockResolvedValue({ id: 'v1' });
  mockListVideoBriefs.mockReset().mockResolvedValue([]);
  mockMark.mockReset().mockResolvedValue(undefined);
});

it('[F8-H37] useVideoBrief fetch saat initiativeId terisi', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useVideoBrief('i1'), { wrapper });
  await waitFor(() => expect(result.current.brief).toEqual({ id: 'v1' }));
  expect(mockGetVideoBrief).toHaveBeenCalledWith('i1');
});

it('[F8-H38] useVideoBrief enabled:false saat initiativeId kosong', async () => {
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useVideoBrief(''), { wrapper });
  await waitFor(() => expect(result.current.enabled).toBe(false));
  expect(mockGetVideoBrief).not.toHaveBeenCalled();
});
