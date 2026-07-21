// Data layer Fase 6 — Problem Statement (turunan Development Area). Pemanggil tipis: INSERT ber-RLS,
// lifecycle lewat RPC SECURITY DEFINER. Mirror pola initiatives.ts (Inisiatif) byte-for-byte.
import { STATUS_TONE } from './cards';
import type { Tables } from './database.types';
import { getOrgContext } from './org-context';
import { supabase } from './supabase';

export type ProblemStatement = Tables<'problem_statements'>;

export { STATUS_TONE };
export { PLANNING_STATUS_LABEL } from './goals';

// ---------------------------------------------------------------- queries

/** Problem Statement di bawah satu Development Area, terlama dulu. Guard parentId kosong → []. */
export async function listProblemStatements(developmentAreaId: string): Promise<ProblemStatement[]> {
  if (!developmentAreaId) return [];
  const { data, error } = await supabase
    .from('problem_statements')
    .select('*')
    .eq('development_area_id', developmentAreaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getProblemStatement(id: string): Promise<ProblemStatement | null> {
  // maybeSingle, BUKAN single: id di luar akses/tidak ada → RLS menyaring jadi 0 baris.
  // single() membalas 406 dan React Query terus retry → skeleton tak pernah selesai.
  const { data, error } = await supabase
    .from('problem_statements')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- mutations (INSERT ber-RLS)

export type NewProblemStatement = {
  development_area_id: string;
  name: string;
  description?: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
  /** UI-S-PR1 — Dampak (PRD §15 metadata). 'high' | 'medium' | 'low'. */
  impact?: string | null;
  /** UI-S-PR1 — Bukti awal (deskripsi/link bukti problem ini nyata). */
  initial_evidence?: string | null;
};

export async function createProblemStatement(input: NewProblemStatement): Promise<ProblemStatement> {
  const { uid, orgId } = await getOrgContext();
  const { data, error } = await supabase
    .from('problem_statements')
    .insert({ ...input, organization_id: orgId, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateProblemStatement(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_problem_statement', {
    p_problem_statement_id: id,
  });
  if (error) throw error;
}
