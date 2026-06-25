// Hooks Fase 8 — Search (RLS-scoped via RPC). enabled hanya saat query non-kosong.
import { useQuery } from '@tanstack/react-query';

import { searchCards, type CardEntityType, type SearchResult } from '@/lib/governance-admin';

export function useSearchCards(params: {
  query: string;
  entityTypes?: CardEntityType[] | null;
  includeArchived?: boolean;
}) {
  const trimmed = (params.query ?? '').trim();
  const enabled = !!trimmed;
  const q = useQuery({
    queryKey: ['cards_search', trimmed, params.entityTypes ?? null, params.includeArchived ?? false],
    queryFn: () => searchCards(trimmed, params.entityTypes ?? null, params.includeArchived ?? false),
    enabled,
  });
  return {
    results: (q.data ?? []) as SearchResult[],
    isLoading: q.isLoading,
    isError: q.isError,
    enabled,
  };
}
