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
