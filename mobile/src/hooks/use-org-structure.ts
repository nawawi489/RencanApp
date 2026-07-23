// Hooks Fase 8 — Org Structure. Query keys terisolasi ['org_structure', ...].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  assignTeamMember,
  createDepartment,
  createTeam,
  listDepartments,
  listPositions,
  listTeamMembersWithProfiles,
  listTeams,
  removeTeamMember,
  setDepartmentActive,
  updateOrganization,
  type Department,
  type NewTeam,
  type NewTeamMember,
  type Position,
  type Team,
  type TeamMemberWithProfile,
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

/** Anggota satu Tim. Key sejajar dengan yang di-invalidate `assignTeamMember`/`removeTeamMember`. */
export function useTeamMembers(teamId: string | null) {
  const q = useQuery({
    queryKey: ['org_structure', 'team_members', teamId],
    queryFn: () => listTeamMembersWithProfiles(teamId as string),
    enabled: !!teamId,
  });
  return {
    members: (q.data ?? []) as TeamMemberWithProfile[],
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

/**
 * BL-19c — identitas Organisasi. Dipisah dari `useOrgActions` karena konsumennya berbeda:
 * yang ini menyentuh cache PROFIL (nama + zona org ikut di `useProfile`) dan cache zona
 * waktu yang dibaca Repeat Setting — bukan cabang `org_structure` sama sekali.
 */
export function useOrganizationActions() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (input: { name: string; timezone: string }) => updateOrganization(input),
    onSuccess: () => {
      // `['org_timezone']` dibaca `task/new.tsx` untuk TimezoneNote. Tanpa invalidasi ini
      // layar Repeat Setting terus menampilkan zona lama sampai app di-restart — dan zona
      // itulah yang dipakai user untuk menafsirkan jam deadline.
      qc.invalidateQueries({ queryKey: ['current-profile'] });
      qc.invalidateQueries({ queryKey: ['org_timezone'] });
    },
  });
  return {
    updateOrganization: (input: { name: string; timezone: string }) => m.mutateAsync(input),
    isPending: m.isPending,
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
  const removeMemberM = useMutation({
    mutationFn: (input: { teamId: string; profileId: string }) => removeTeamMember(input),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['org_structure', 'team_members', vars.teamId] }),
  });
  // Nonaktif/aktif Departemen mengubah opsi picker di tab Posisi & Tim juga, jadi
  // invalidasi seluruh cabang `org_structure` — bukan hanya daftar departemen.
  const setDeptActiveM = useMutation({
    mutationFn: (input: { departmentId: string; active: boolean }) => setDepartmentActive(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org_structure'] }),
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
    removeTeamMember: (input: { teamId: string; profileId: string }) => removeMemberM.mutateAsync(input),
    setDepartmentActive: (input: { departmentId: string; active: boolean }) =>
      setDeptActiveM.mutateAsync(input),
    createPosition: (input: { name: string; departmentId?: string | null; description?: string | null }) =>
      createPosM.mutateAsync(input),
    createRoleTemplate: (input: { name: string; level: 'ceo' | 'c_level' | 'management' | 'staff' }) =>
      createRoleM.mutateAsync(input),
    isPending:
      createDeptM.isPending ||
      createTeamM.isPending ||
      assignMemberM.isPending ||
      removeMemberM.isPending ||
      setDeptActiveM.isPending ||
      createPosM.isPending ||
      createRoleM.isPending,
  };
}
