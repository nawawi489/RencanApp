// Hooks Fase 8 — Confidential Access Rules. FAIL-DENY (kebalikan MBR fail-open):
// saat data belum ada → isAccessGranted false (default deny untuk data sensitif).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  grantConfidentialAccess,
  listConfidentialAccessRules,
  type ConfidentialAccessRule,
  type ConfidentialEntityType,
  type GrantConfidentialAccessInput,
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

export function useConfidentialAccessActions() {
  const qc = useQueryClient();
  const grantM = useMutation({
    mutationFn: (input: GrantConfidentialAccessInput) => grantConfidentialAccess(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['confidential_access_rules'] }),
  });
  return {
    grantAccess: (input: GrantConfidentialAccessInput) => grantM.mutateAsync(input),
    isPending: grantM.isPending,
  };
}
