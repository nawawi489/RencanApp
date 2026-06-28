// Data layer Fase 8 — Activity Log & Governance Violation pages (read-only, append-only di DB).
// RLS: activity_logs/governance_violations sudah ada sejak Fase 1; halaman ini hanya membaca.
import type { Tables } from './database.types';
import { supabase } from './supabase';
import type { Tone } from '@/components/ui';

export type ActivityLog = Tables<'activity_logs'>;
export type GovernanceViolation = Tables<'governance_violations'>;

/** Severity 4-tier → tone semantik Badge. */
export const GOVERNANCE_VIOLATION_SEVERITY_TONE: Record<string, Tone> = {
  low: 'neutral',
  medium: 'warn',
  high: 'warn',
  critical: 'danger',
};

export const GOVERNANCE_VIOLATION_SEVERITY_LABEL: Record<string, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
};

const PAGE_SIZE = 50;

/**
 * UI-S-AR1 — metadata arsip (kapan & oleh siapa) dari activity_logs.
 * Mengambil entri TERBARU dgn action 'card_archived' utk satu (entity_type, entity_id).
 * Returns null bila belum ada (mis. record arsip lama sebelum logging).
 */
export type ArchiveMetadata = {
  archived_at: string;
  archived_by: string | null;
};

export async function getArchiveMetadata(
  entityType: string,
  entityId: string,
): Promise<ArchiveMetadata | null> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('actor_id, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('action', 'card_archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { archived_at: data.created_at, archived_by: data.actor_id ?? null };
}

/** UI-G-002 — activity log untuk satu entity (entity_type + entity_id). RLS aktif (org-scoped). */
export async function listEntityActivityLog(
  entityType: string,
  entityId: string,
  opts?: { limit?: number },
): Promise<ActivityLog[]> {
  const limit = opts?.limit ?? 25;
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function listActivityLog(opts?: {
  action?: string;
  limit?: number;
  page?: number;
}): Promise<ActivityLog[]> {
  const limit = opts?.limit ?? PAGE_SIZE;
  const page = opts?.page ?? 0;
  let q = supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1);
  if (opts?.action) q = q.eq('action', opts.action);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ActivityLog[];
}

export async function listGovernanceViolations(opts?: {
  severity?: string;
  limit?: number;
  page?: number;
}): Promise<GovernanceViolation[]> {
  const limit = opts?.limit ?? PAGE_SIZE;
  const page = opts?.page ?? 0;
  let q = supabase
    .from('governance_violations')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1);
  if (opts?.severity) q = q.eq('severity', opts.severity);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as GovernanceViolation[];
}
