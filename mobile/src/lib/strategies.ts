// Data layer Fase 4 — Strategy (turunan dari KPI Area). Pemanggil tipis: card dibuat via INSERT
// ber-RLS (mengisi organization_id dari profiles + created_by), aktivasi lewat RPC SECURITY DEFINER.
// Otorisasi ditegakkan di server.
import { STATUS_TONE } from './cards';
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type Strategy = Tables<'strategies'>;

export { STATUS_TONE };

export { PLANNING_STATUS_LABEL } from './goals';

// ---------------------------------------------------------------- queries

/** Strategi di bawah satu KPI Area, terlama dulu. Guard parentId kosong → []. */
export async function listStrategies(kpiAreaId: string): Promise<Strategy[]> {
  if (!kpiAreaId) return [];
  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('kpi_area_id', kpiAreaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getStrategy(id: string): Promise<Strategy> {
  const { data, error } = await supabase.from('strategies').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- mutations

export type NewStrategy = {
  kpi_area_id: string;
  name: string;
  description?: string | null;
  reason: string | null;
  main_risk: string | null;
  alternative: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
};

export async function createStrategy(input: NewStrategy): Promise<Strategy> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', uid)
    .single();
  if (!profile?.organization_id) throw new Error('Organization not found');
  const { data, error } = await supabase
    .from('strategies')
    .insert({ ...input, organization_id: profile.organization_id, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateStrategy(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_strategy', { p_strategy_id: id });
  if (error) throw error;
}
