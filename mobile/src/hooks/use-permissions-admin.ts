// Hooks #35 — User & Permission (admin). Pemanggil tipis di atas @/lib/permissions-admin.
// Query key TERKUNCI: ['user_permissions_admin', targetUserId]. Mutasi meng-invalidate daftar target;
// FR-14: invalidate ['current-profile', actorId] HANYA bila perubahan menyentuh aktor (defensif —
// anti-self di server membuat ini praktis tak terjadi, tapi tetap benar bila kebijakan berubah).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listUserPermissionScopes,
  listUserPermissionsAdmin,
  setUserPermission,
  type AdminPermissionRow,
  type SetPermissionInput,
} from '@/lib/permissions-admin';
import { setUserPermissionScope } from '@/lib/governance-admin';

export function useUserPermissionsAdmin(targetUserId: string) {
  const q = useQuery({
    queryKey: ['user_permissions_admin', targetUserId],
    queryFn: () => listUserPermissionsAdmin(targetUserId),
    enabled: !!targetUserId,
  });
  return {
    rows: (q.data ?? []) as AdminPermissionRow[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

export function usePermissionActions(actorId?: string | null) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (input: SetPermissionInput) => setUserPermission(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['user_permissions_admin', input.targetUserId] });
      qc.invalidateQueries({ queryKey: ['user_permission_scopes', input.targetUserId] });
      if (actorId && input.targetUserId === actorId) {
        qc.invalidateQueries({ queryKey: ['current-profile', actorId] });
      }
    },
  });
  return {
    setPermission: (input: SetPermissionInput) => m.mutateAsync(input),
    isPending: m.isPending,
  };
}

// UI-S-PRM1 — fetch scope per permission_key untuk user (default 'org' jika belum ada baris).
export function useUserPermissionScopes(targetUserId: string) {
  const q = useQuery({
    queryKey: ['user_permission_scopes', targetUserId],
    queryFn: () => listUserPermissionScopes(targetUserId),
    enabled: !!targetUserId,
  });
  return {
    scopes: (q.data ?? {}) as Record<string, string>,
    isLoading: q.isLoading,
  };
}

export function useScopeActions() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (input: {
      targetUserId: string;
      permissionKey: string;
      scope: 'own' | 'team' | 'dept' | 'org';
    }) => setUserPermissionScope(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['user_permission_scopes', input.targetUserId] });
      qc.invalidateQueries({ queryKey: ['user_permissions_admin', input.targetUserId] });
    },
  });
  return {
    setScope: m.mutateAsync,
    isPending: m.isPending,
  };
}
