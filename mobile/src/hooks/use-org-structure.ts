// Hooks Fase 8 — Org Structure. Query keys terisolasi ['org_structure', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  assignTeamMember,
  createDepartment,
  createTeam,
  listDepartments,
  listTeamMembers,
  type Department,
  type NewTeam,
  type NewTeamMember,
  type TeamMember,
} from '@/lib/org-structure';

export function useOrgStructure() {
  const q = useQuery({
    queryKey: ['org_structure', 'departments'],
    queryFn: listDepartments,
  });
  return {
    departments: (q.data ?? []) as Department[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

export function useTeamMembers(teamId: string | null | undefined) {
  const enabled = !!teamId;
  const q = useQuery({
    queryKey: ['org_structure', 'team_members', teamId],
    queryFn: () => listTeamMembers(teamId as string),
    enabled,
  });
  return {
    members: (q.data ?? []) as TeamMember[],
    isLoading: q.isLoading,
    isError: q.isError,
    enabled,
  };
}

export function useOrgActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['org_structure', 'departments'] });

  const createDeptM = useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      createDepartment(input.name, input.description),
    onSuccess: invalidate,
  });
  const createTeamM = useMutation({
    mutationFn: (input: NewTeam) => createTeam(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org_structure'] }),
  });
  const assignMemberM = useMutation({
    mutationFn: (input: NewTeamMember) => assignTeamMember(input),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['org_structure', 'team_members', vars.teamId] }),
  });

  return {
    createDepartment: (input: { name: string; description?: string }) => createDeptM.mutateAsync(input),
    createTeam: (input: NewTeam) => createTeamM.mutateAsync(input),
    assignTeamMember: (input: NewTeamMember) => assignMemberM.mutateAsync(input),
    isPending: createDeptM.isPending || createTeamM.isPending || assignMemberM.isPending,
  };
}
