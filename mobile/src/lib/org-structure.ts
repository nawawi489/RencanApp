// Data layer Fase 8 — Org Structure (Department / Position / Team / Team Member).
// Pemanggil tipis: RLS org-scoped untuk read, RPC SECURITY DEFINER untuk tulis.
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type Department = Tables<'departments'>;
export type Position = Tables<'positions'>;
export type Team = Tables<'teams'>;
export type TeamMember = Tables<'team_members'>;

// ---------------------------------------------------------------- reads (RLS org-scoped)

export async function listDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function listPositions(): Promise<Position[]> {
  const { data, error } = await supabase.from('positions').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as Position[];
}

export async function listTeams(opts?: { activeOnly?: boolean }): Promise<Team[]> {
  let q = supabase.from('teams').select('*').order('name');
  if (opts?.activeOnly) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Team[];
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .order('joined_at');
  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

// ---------------------------------------------------------------- writes (RPC)

export async function createDepartment(name: string, description?: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_department', {
    p_name: name,
    p_description: description ?? '',
  });
  if (error) throw error;
  return data as string;
}

export type NewTeam = { name: string; departmentId?: string | null; description?: string; leadId?: string | null };

export async function createTeam(input: NewTeam): Promise<string> {
  const { data, error } = await supabase.rpc('create_team', {
    p_name: input.name,
    p_department_id: (input.departmentId ?? null) as unknown as string,
    p_description: input.description ?? '',
    p_lead_id: (input.leadId ?? null) as unknown as string,
  });
  if (error) throw error;
  return data as string;
}

export type NewTeamMember = { teamId: string; profileId: string; roleInTeam?: string };

export async function assignTeamMember(input: NewTeamMember): Promise<string> {
  const { data, error } = await supabase.rpc('assign_team_member', {
    p_team_id: input.teamId,
    p_profile_id: input.profileId,
    p_role_in_team: input.roleInTeam ?? '',
  });
  if (error) throw error;
  return data as string;
}

/** BL-19b — pasangan `assignTeamMember`; tanpa ini salah-assign jadi pintu satu arah. */
export async function removeTeamMember(input: { teamId: string; profileId: string }): Promise<void> {
  const { error } = await supabase.rpc('remove_team_member', {
    p_team_id: input.teamId,
    p_profile_id: input.profileId,
  });
  if (error) throw error;
}

/**
 * BL-19b — Departemen dinonaktifkan, bukan dihapus (janji copy admin sejak 0014).
 * Tautan Posisi/Tim sengaja tidak ikut diputus; lihat 0092.
 */
export async function setDepartmentActive(input: { departmentId: string; active: boolean }): Promise<void> {
  const { error } = await supabase.rpc('set_department_active', {
    p_department_id: input.departmentId,
    p_active: input.active,
  });
  if (error) throw error;
}

export type TeamMemberWithProfile = TeamMember & {
  profiles: { id: string; full_name: string | null; email: string | null } | null;
};

/** Anggota Tim + identitas orangnya — daftar berisi UUID telanjang tidak bisa dipakai memutuskan. */
export async function listTeamMembersWithProfiles(teamId: string): Promise<TeamMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('team_members')
    .select('*, profiles(id, full_name, email)')
    .eq('team_id', teamId)
    .order('joined_at');
  if (error) throw error;
  return (data ?? []) as TeamMemberWithProfile[];
}
