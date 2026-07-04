// Hooks Fase 8 — Confidential Access Rules. FAIL-DENY (kebalikan MBR fail-open):
// saat data belum ada → isAccessGranted false (default deny untuk data sensitif).
import { useQuery } from '@tanstack/react-query';

import {
  listConfidentialAccessRules,
  type ConfidentialAccessRule,
  type ConfidentialEntityType,
} from '@/lib/confidential-access';

export function useConfidentialAccessRules(
  entityType: ConfidentialEntityType | '' | null | undefined,
  entityId: string | null | undefined,
) {
  const enabled = !!entityType && !!entityId;
  const q = useQuery({
    queryKey: ['confidential_access_rules', entityType, entityId],
    queryFn: () => listConfidentialAccessRules(entityType as ConfidentialEntityType, entityId as string),
    enabled,
  });
  const data = q.data as ConfidentialAccessRule[] | undefined;
  return {
    rules: (data ?? []) as ConfidentialAccessRule[],
    // fail-deny: undefined/loading → false.
    isAccessGranted: Array.isArray(data) ? data.length > 0 : false,
    isLoading: q.isLoading,
    isError: q.isError,
    enabled,
  };
}
