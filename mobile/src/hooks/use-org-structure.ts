// Hooks Fase 8 — Org Structure. Query keys terisolasi ['org_structure', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  assignTeamMember,
  createDepartment,
  createTeam,
  listDepartments,
  listPositions,
  listTeamMembers,
  listTeams,
  type Department,
  type NewTeam,
  type NewTeamMember,
  type Position,
  type Team,
  type TeamMember,
} from '@/lib/org-structure';
import { createPosition, createRoleTemplate } from '@/lib/governance-admin';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

type RoleTemplate = Tables<'role_templates'>;

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

// UI-S-OR1 — Tab Posisi/Tim/Role di org structure.
export function usePositions() {
  const q = useQuery({
    queryKey: ['org_structure', 'positions'],
    queryFn: () => listPositions(),
  });
  return {
    positions: (q.data ?? []) as Position[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export function useTeams() {
  const q = useQuery({
    queryKey: ['org_structure', 'teams'],
    queryFn: () => listTeams(),
  });
  return {
    teams: (q.data ?? []) as Team[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export function useRoleTemplates() {
  const q = useQuery({
    queryKey: ['org_structure', 'role_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_templates')
        .select('*')
        .order('level', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoleTemplate[];
    },
  });
  return {
    roleTemplates: (q.data ?? []) as RoleTemplate[],
    isLoading: q.isLoading,
    isError: q.isError,
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

  const createPosM = useMutation({
    mutationFn: (input: { name: string; departmentId?: string | null; description?: string | null }) =>
      createPosition(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org_structure', 'positions'] }),
  });
  const createRoleM = useMutation({
    mutationFn: (input: { name: string; level: 'ceo' | 'c_level' | 'management' | 'staff' }) =>
      createRoleTemplate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org_structure', 'role_templates'] }),
  });

  return {
    createDepartment: (input: { name: string; description?: string }) => createDeptM.mutateAsync(input),
    createTeam: (input: NewTeam) => createTeamM.mutateAsync(input),
    assignTeamMember: (input: NewTeamMember) => assignMemberM.mutateAsync(input),
    createPosition: (input: { name: string; departmentId?: string | null; description?: string | null }) =>
      createPosM.mutateAsync(input),
    createRoleTemplate: (input: { name: string; level: 'ceo' | 'c_level' | 'management' | 'staff' }) =>
      createRoleM.mutateAsync(input),
    isPending:
      createDeptM.isPending ||
      createTeamM.isPending ||
      assignMemberM.isPending ||
      createPosM.isPending ||
      createRoleM.isPending,
  };
}
