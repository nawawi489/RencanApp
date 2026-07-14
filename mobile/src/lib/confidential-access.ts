// Data layer Fase 8 — Confidential Access Rules. Two-layer RLS: rule SELECT terbatas
// (user di-grant / pemberi / pengelola); grant hanya via RPC (manage_confidential_access).
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type ConfidentialAccessRule = Tables<'confidential_access_rules'>;

/** Tipe entity yang mendukung confidential rule (subset card). */
export type ConfidentialEntityType = 'goal' | 'strategy' | 'initiative' | 'action_plan' | 'task';

export const ACCESS_LEVEL_LABEL: Record<string, string> = {
  restricted: 'Terbatas',
  confidential: 'Rahasia',
};

export async function listConfidentialAccessRules(
  entityType: ConfidentialEntityType,
  entityId: string,
): Promise<ConfidentialAccessRule[]> {
  const { data, error } = await supabase
    .from('confidential_access_rules')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConfidentialAccessRule[];
}

export type GrantConfidentialAccessInput = {
  entityType: ConfidentialEntityType;
  entityId: string;
  userId: string;
  accessLevel?: 'restricted' | 'confidential';
  reason?: string;
};

export async function grantConfidentialAccess(input: GrantConfidentialAccessInput): Promise<string> {
  const { data, error } = await supabase.rpc('grant_confidential_access', {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_user_id: input.userId,
    p_access_level: input.accessLevel ?? 'restricted',
    p_reason: input.reason ?? '',
  });
  if (error) throw error;
  return data as string;
}
