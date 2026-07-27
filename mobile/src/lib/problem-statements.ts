// Data layer Fase 6 — Problem Statement (turunan Development Area). Pemanggil tipis: INSERT ber-RLS,
// lifecycle lewat RPC SECURITY DEFINER. Mirror pola initiatives.ts (Inisiatif) byte-for-byte.
import { STATUS_TONE } from './cards';
import type { Tables } from './database.types';
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
  /** Kunci idempotensi (0103): retry-manual dgn key sama mengembalikan baris asli, bukan duplikat. */
  client_request_id?: string | null;
};

export async function createProblemStatement(input: NewProblemStatement): Promise<ProblemStatement> {
  const { data, error } = await supabase.rpc('create_problem_statement_idempotent', {
    p_development_area_id: input.development_area_id,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_pic_id: input.pic_id ?? undefined,
    p_period_start: input.period_start ?? undefined,
    p_period_end: input.period_end ?? undefined,
    p_impact: input.impact ?? undefined,
    p_initial_evidence: input.initial_evidence ?? undefined,
    p_client_request_id: input.client_request_id ?? undefined,
  });
  if (error) throw error;
  return data as ProblemStatement;
}

/**
 * S4-3 — sunting Problem Statement. Periode + Impact TERKUNCI pasca-aktivasi
 * (dasar skor + severity weighting governance). Server MENOLAK perubahannya
 * eksplisit; kirim nilai apa adanya (termasuk `null`).
 */
export type ProblemStatementPatch = {
  name: string;
  description: string | null;
  pic_id: string | null;
  impact: string | null;
  initial_evidence: string | null;
  period_start: string | null;
  period_end: string | null;
};

export async function updateProblemStatement(
  id: string,
  patch: ProblemStatementPatch,
): Promise<void> {
  const { error } = await supabase.rpc('update_problem_statement', {
    p_problem_statement_id: id,
    p_name: patch.name,
    p_description: (patch.description ?? null) as unknown as string,
    p_pic_id: (patch.pic_id ?? null) as unknown as string,
    p_impact: (patch.impact ?? null) as unknown as string,
    p_initial_evidence: (patch.initial_evidence ?? null) as unknown as string,
    p_period_start: (patch.period_start ?? null) as unknown as string,
    p_period_end: (patch.period_end ?? null) as unknown as string,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateProblemStatement(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_problem_statement', {
    p_problem_statement_id: id,
  });
  if (error) throw error;
}
