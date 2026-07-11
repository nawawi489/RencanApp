// Data layer Fase 4 — Inisiatif (turunan dari Strategi). Pemanggil tipis: card dibuat via INSERT
// ber-RLS (mengisi organization_id dari profiles + created_by), aktivasi lewat RPC SECURITY DEFINER.
// Otorisasi ditegakkan di server.
import { STATUS_TONE } from './cards';
import type { Tables } from './database.types';
import { getOrgContext } from './org-context';
import { supabase } from './supabase';

export type Inisiatif = Tables<'initiatives'>;

export { STATUS_TONE };

export { PLANNING_STATUS_LABEL } from './goals';

// ---------------------------------------------------------------- queries

/** Strategi di bawah satu Strategi, terlama dulu. Guard parentId kosong → []. */
export async function listInitiatives(strategyId: string): Promise<Inisiatif[]> {
  if (!strategyId) return [];
  const { data, error } = await supabase
    .from('initiatives')
    .select('*')
    .eq('strategy_id', strategyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getInitiative(id: string): Promise<Inisiatif> {
  const { data, error } = await supabase.from('initiatives').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- mutations

export type NewInitiative = {
  strategy_id: string;
  name: string;
  description?: string | null;
  reason: string | null;
  main_risk: string | null;
  alternative: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
  /** UI-S-S01 — PRD §20 "Kontribusi Quarter" (% ke parent Strategi); NULL diizinkan saat Draft. */
  contribution_pct?: number | null;
};

export async function createInitiative(input: NewInitiative): Promise<Inisiatif> {
  const { uid, orgId } = await getOrgContext();
  const { data, error } = await supabase
    .from('initiatives')
    .insert({ ...input, organization_id: orgId, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateInitiative(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_initiative', { p_initiative_id: id });
  if (error) throw error;
}
