// Data layer Fase 4 — kpi-areas.ts (Planning).
// Otorisasi ditegakkan di server (RLS + RPC); fungsi di sini hanya pemanggil tipis.
// Card dibuat via INSERT ber-RLS (pola createInitiative); hanya activate_* yang lewat RPC.
import type { Tables } from './database.types';
import { getOrgContext } from './org-context';
import { supabase } from './supabase';

// Re-export token semantik dari sumber tunggal (cards) — JANGAN duplikasi nilai.
export { STATUS_TONE } from './cards';
export type { PersonRef } from './cards';

export type KpiArea = Tables<'kpi_areas'>;

export { PLANNING_STATUS_LABEL } from './goals';

// ---------------------------------------------------------------- queries

export async function listKpiAreas(goalId: string): Promise<KpiArea[]> {
  if (!goalId) return [];
  const { data, error } = await supabase
    .from('kpi_areas')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function getKpiArea(id: string): Promise<KpiArea> {
  const { data, error } = await supabase.from('kpi_areas').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- mutations

export type NewKpiArea = {
  goal_id: string;
  name: string;
  description?: string | null;
  target: string | null;
  /** Override PRD §18 (0032): basis angka untuk "% gap"; NULL = KPI kualitatif (teks `target` saja). */
  target_numeric?: number | null;
  /** Satuan tampilan, mis. "customer", "Rp" (0032). */
  target_unit?: string | null;
  /** UI-S-K03 — PRD §18 wajib "Ekspektasi Hasil". */
  expected_outcome?: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
};

export async function createKpiArea(input: NewKpiArea): Promise<KpiArea> {
  const { uid, orgId } = await getOrgContext();
  const { data, error } = await supabase
    .from('kpi_areas')
    .insert({ ...input, organization_id: orgId, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lengkapi/ubah KPI Area Draft (mis. isi Target untuk KPI Area hasil template yang awalnya null).
 * Update ber-RLS (policy kpi_areas_update: creator/PIC/manage_others). Server tetap penegak akhir.
 */
export type KpiAreaPatch = Partial<
  Pick<
    NewKpiArea,
    | 'name'
    | 'description'
    | 'target'
    | 'target_numeric'
    | 'target_unit'
    | 'expected_outcome'
    | 'pic_id'
    | 'period_start'
    | 'period_end'
  >
>;

export async function updateKpiArea(id: string, patch: KpiAreaPatch): Promise<KpiArea> {
  const { data, error } = await supabase
    .from('kpi_areas')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateKpiArea(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_kpi_area', { p_kpi_area_id: id });
  if (error) throw error;
}
