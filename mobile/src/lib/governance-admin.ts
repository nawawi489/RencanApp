// Data layer Fase 8 — Governance & Admin lifecycle:
// Deadline Change Request, Cancellation, Evaluation, Archive, Search, Settings.
// Semua tulis via RPC SECURITY DEFINER (anti-self-approval, append-only, child-check di server).
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type DeadlineChangeRequest = Tables<'deadline_change_requests'>;
export type Evaluation = Tables<'evaluations'>;

/** Tipe entity card yang bisa dibatalkan/diarsipkan/dicari. */
export type CardEntityType =
  | 'goal'
  | 'kpi_area'
  | 'strategy'
  | 'initiative'
  | 'action_plan'
  | 'development_area'
  | 'problem_statement';

export type SearchResult = { id: string; entity_type: string; name: string; status: string };

// ---------------------------------------------------------------- label maps

export const DCR_STATUS_LABEL: Record<string, string> = {
  pending: 'Menunggu Review',
  approved: 'Disetujui',
  rejected: 'Ditolak',
};

export const EVALUATION_TARGET_LABEL: Record<string, string> = {
  ya: 'Tercapai',
  sebagian: 'Tercapai Sebagian',
  tidak: 'Tidak Tercapai',
};

// ---------------------------------------------------------------- Deadline Change Request

export type NewDeadlineChangeRequest = {
  entityId: string;
  oldDeadline: string;
  newDeadline: string;
  reason: string;
  impact?: string;
  evidenceNote?: string;
};

export async function createDeadlineChangeRequest(input: NewDeadlineChangeRequest): Promise<string> {
  const { data, error } = await supabase.rpc('create_deadline_change_request', {
    p_entity_id: input.entityId,
    p_old_deadline: input.oldDeadline,
    p_new_deadline: input.newDeadline,
    p_reason: input.reason,
    p_impact: input.impact ?? '',
    p_evidence_note: input.evidenceNote ?? '',
  });
  if (error) throw error;
  return data as string;
}

export async function listDeadlineChangeRequests(entityId: string): Promise<DeadlineChangeRequest[]> {
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .select('*')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeadlineChangeRequest[];
}

export async function reviewDeadlineChange(
  requestId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('review_deadline_change', {
    p_request_id: requestId,
    p_decision: decision,
    p_reason: reason ?? '',
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Evaluation

export type NewEvaluation = {
  initiativeId: string;
  targetAchieved?: 'ya' | 'sebagian' | 'tidak' | null;
  results?: string;
  successFactors?: string[];
  failureFactors?: string[];
  lessonsLearned?: string;
  shouldBecomeSop?: boolean;
  rolloutNeeded?: boolean;
  rolloutNotes?: string;
};

export async function recordEvaluation(input: NewEvaluation): Promise<string> {
  const { data, error } = await supabase.rpc('record_evaluation', {
    p_initiative_id: input.initiativeId,
    p_target_achieved: (input.targetAchieved ?? null) as unknown as string,
    p_results: input.results ?? '',
    p_success_factors: input.successFactors ?? [],
    p_failure_factors: input.failureFactors ?? [],
    p_lessons_learned: input.lessonsLearned ?? '',
    p_should_become_sop: input.shouldBecomeSop ?? false,
    p_rollout_needed: input.rolloutNeeded ?? false,
    p_rollout_notes: input.rolloutNotes ?? '',
  });
  if (error) throw error;
  return data as string;
}

export async function getEvaluation(initiativeId: string): Promise<Evaluation | null> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('initiative_id', initiativeId)
    .maybeSingle();
  if (error) throw error;
  return data as Evaluation | null;
}

// ---------------------------------------------------------------- Archive

export async function archiveCard(entityType: CardEntityType, entityId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_card', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
}

/** UI-S-AR1 — Pulihkan card terarsip ke status 'draft' (governance-safe). */
export async function restoreCard(entityType: CardEntityType, entityId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_card', {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
}

/** UI-S-GV1 — Selesaikan / tutup pelanggaran governance dgn catatan ≥8 char. */
export async function resolveGovernanceViolation(
  violationId: string,
  resolutionNote: string,
  status: 'resolved' | 'dismissed' = 'resolved',
): Promise<void> {
  const { error } = await supabase.rpc('resolve_governance_violation', {
    p_violation_id: violationId,
    p_resolution_note: resolutionNote,
    p_status: status,
  });
  if (error) throw error;
}

/** UI-S-OR1 — buat Posisi (gated manage_positions). */
export async function createPosition(args: {
  name: string;
  departmentId?: string | null;
  description?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_position', {
    p_name: args.name,
    p_department_id: args.departmentId ?? undefined,
    p_description: args.description ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

/** UI-S-OR1 — buat Role Template baru (gated manage_settings). */
export async function createRoleTemplate(args: {
  name: string;
  level: 'ceo' | 'c_level' | 'management' | 'staff';
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_role_template', {
    p_name: args.name,
    p_level: args.level,
  });
  if (error) throw error;
  return data as string;
}

/** UI-S-PRM1 — set scope (own/team/dept/org) untuk permission user. */
export async function setUserPermissionScope(args: {
  targetUserId: string;
  permissionKey: string;
  scope: 'own' | 'team' | 'dept' | 'org';
}): Promise<void> {
  const { error } = await supabase.rpc('set_user_permission_scope', {
    p_target_user_id: args.targetUserId,
    p_permission_key: args.permissionKey,
    p_scope: args.scope,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- Search (RLS-scoped via RPC)

export async function searchCards(
  query: string,
  entityTypes?: CardEntityType[] | null,
  includeArchived = false,
): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('search_cards', {
    p_query: query,
    p_entity_types: (entityTypes ?? null) as unknown as string[],
    p_include_archived: includeArchived,
  });
  if (error) throw error;
  return ((data ?? []) as unknown as SearchResult[]);
}

// ---------------------------------------------------------------- Settings (whitelist via RPC)

export async function upsertSettings(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.rpc('upsert_settings', {
    p_key: key,
    p_value: value as never,
  });
  if (error) throw error;
}
