// Data layer Fase 8 — Governance & Admin lifecycle:
// Deadline Change Request, Cancellation, Evaluation, Archive, Search, Settings.
// Semua tulis via RPC SECURITY DEFINER (anti-self-approval, append-only, child-check di server).
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type DeadlineChangeRequest = Tables<'deadline_change_requests'>;
export type DeadlineChangeLog = Tables<'deadline_change_logs'>;
export type Cancellation = Tables<'cancellations'>;
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

export const CANCELLATION_APPROVAL_STATUS_LABEL: Record<string, string> = {
  auto_approved: 'Disetujui Otomatis',
  pending: 'Menunggu Persetujuan',
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

// ---------------------------------------------------------------- Cancellation

export async function cancelCard(
  entityType: CardEntityType,
  entityId: string,
  reason: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('cancel_card', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as string;
}

export async function approveCancellation(cancellationId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_cancellation', {
    p_cancellation_id: cancellationId,
  });
  if (error) throw error;
}

export async function listCancellations(entityId: string): Promise<Cancellation[]> {
  const { data, error } = await supabase
    .from('cancellations')
    .select('*')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Cancellation[];
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
