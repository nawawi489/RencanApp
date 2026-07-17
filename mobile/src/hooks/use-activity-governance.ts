// Hooks Fase 8 — Activity Log & Governance Violation pages (read-only).
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  ACTIVITY_LOG_PAGE_SIZE,
  listActivityLog,
  listEntityActivityLog,
  listGovernanceViolations,
  type ActivityLog,
  type ActivityLogChipKey,
  type GovernanceViolation,
} from '@/lib/activity-governance';

/**
 * Infinite-scroll Activity Log hook (UI-S-AL1).
 *
 * Halaman berukuran `ACTIVITY_LOG_PAGE_SIZE` (30). Filter chip & search di-push ke
 * server via `listActivityLog` — hasil filter TIDAK terbatas pada halaman yang
 * sudah dimuat.
 *
 * `getNextPageParam` mengembalikan `undefined` bila halaman terakhir < PAGE_SIZE
 * (heuristik akhir data — offset paging tanpa count query).
 *
 * `placeholderData: keepPreviousData` menahan data lama saat filter berubah
 * agar list tidak flicker ke skeleton.
 */
export function useActivityLog(opts?: { q?: string; chip?: ActivityLogChipKey }) {
  const chip = opts?.chip ?? 'semua';
  const q = opts?.q ?? '';
  const query = useInfiniteQuery({
    queryKey: ['activity_log', 'inf', chip, q],
    initialPageParam: 0,
    queryFn: ({ pageParam = 0 }) =>
      listActivityLog({ chip, q, page: pageParam as number, limit: ACTIVITY_LOG_PAGE_SIZE }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < ACTIVITY_LOG_PAGE_SIZE ? undefined : allPages.length,
    placeholderData: keepPreviousData,
  });
  const logs = useMemo(
    () => (query.data?.pages ?? []).flat() as ActivityLog[],
    [query.data],
  );
  return {
    logs,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

/** UI-G-002 — activity log untuk satu entity (collapsible panel di layar detail). */
export function useEntityActivityLog(
  entityType: string,
  entityId: string | null | undefined,
  enabled = true,
) {
  const isEnabled = !!entityId && enabled;
  const q = useQuery({
    queryKey: ['activity_log', 'entity', entityType, entityId],
    queryFn: () => listEntityActivityLog(entityType, entityId as string),
    enabled: isEnabled,
  });
  return {
    logs: (q.data ?? []) as ActivityLog[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

export function useGovernanceViolations(opts?: { severity?: string; page?: number }) {
  const q = useQuery({
    queryKey: ['governance_violations', opts?.severity ?? null, opts?.page ?? 0],
    queryFn: () => listGovernanceViolations({ severity: opts?.severity, page: opts?.page }),
  });
  return {
    violations: (q.data ?? []) as GovernanceViolation[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
