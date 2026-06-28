// Hooks Fase 8 — Activity Log & Governance Violation pages (read-only).
import { useQuery } from '@tanstack/react-query';

import {
  listActivityLog,
  listEntityActivityLog,
  listGovernanceViolations,
  type ActivityLog,
  type GovernanceViolation,
} from '@/lib/activity-governance';

export function useActivityLog(opts?: { action?: string; page?: number }) {
  const page = opts?.page ?? 0;
  const q = useQuery({
    queryKey: ['activity_log', 'page', page, opts?.action ?? null],
    queryFn: () => listActivityLog({ action: opts?.action, page }),
  });
  // Read-only: TIDAK mengekspos mutation apapun (append-only di DB).
  return {
    logs: (q.data ?? []) as ActivityLog[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
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
