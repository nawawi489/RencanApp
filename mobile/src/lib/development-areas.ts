// Data layer Fase 6 — Development Area (root jalur Development).
// Pemanggil tipis: otorisasi server (RLS untuk INSERT, RPC SECURITY DEFINER untuk lifecycle).
// Mirror pola goals.ts (Goal) byte-for-byte; gantikan tabel/RPC saja.
import { STATUS_TONE, type PersonRef } from './cards';
import type { Tables } from './database.types';
import { getOrgContext } from './org-context';
import { supabase } from './supabase';

export type DevelopmentArea = Tables<'development_areas'>;
/** Development Area + jumlah Problem Statement (embedded count via PostgREST) — satu query. */
export type DevelopmentAreaWithProblemCount = DevelopmentArea & {
  problem_statements: { count: number }[];
};

/** Ekstrak jumlah Problem Statement dari hasil embedded; null bila tak tersedia. */
export function problemCountOf(da: DevelopmentAreaWithProblemCount): number | null {
  return da.problem_statements?.[0]?.count ?? null;
}

// Re-export agar konsumen UI tidak perlu impor dari dua modul; nilai TIDAK diduplikasi.
export { STATUS_TONE, type PersonRef };
export { PLANNING_STATUS_LABEL } from './goals';

// ---------------------------------------------------------------- queries

export async function listDevelopmentAreas(): Promise<DevelopmentAreaWithProblemCount[]> {
  const { data, error } = await supabase
    .from('development_areas')
    .select('*, problem_statements(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as DevelopmentAreaWithProblemCount[];
}

export async function getDevelopmentArea(id: string): Promise<DevelopmentArea | null> {
  // maybeSingle, BUKAN single: id di luar akses/tidak ada → RLS menyaring jadi 0 baris.
  // single() membalas 406 dan React Query terus retry → skeleton tak pernah selesai.
  const { data, error } = await supabase
    .from('development_areas')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- mutations (INSERT ber-RLS)

export type NewDevelopmentArea = {
  name: string;
  description?: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
};

export async function createDevelopmentArea(input: NewDevelopmentArea): Promise<DevelopmentArea> {
  const { uid, orgId } = await getOrgContext();
  const { data, error } = await supabase
    .from('development_areas')
    .insert({ ...input, organization_id: orgId, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * S4-3 — sunting Development Area. Periode TERKUNCI pasca-aktivasi (dasar
 * mapping Action Plan development → periode skor). Server MENOLAK
 * perubahannya eksplisit; kirim nilai apa adanya (termasuk `null`) supaya
 * panggilan yang tidak menyentuhnya tidak ikut tertolak.
 */
export type DevelopmentAreaPatch = {
  name: string;
  description: string | null;
  pic_id: string | null;
  period_start: string | null;
  period_end: string | null;
};

export async function updateDevelopmentArea(
  id: string,
  patch: DevelopmentAreaPatch,
): Promise<void> {
  const { error } = await supabase.rpc('update_development_area', {
    p_development_area_id: id,
    p_name: patch.name,
    p_description: (patch.description ?? null) as unknown as string,
    p_pic_id: (patch.pic_id ?? null) as unknown as string,
    p_period_start: (patch.period_start ?? null) as unknown as string,
    p_period_end: (patch.period_end ?? null) as unknown as string,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateDevelopmentArea(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_development_area', {
    p_development_area_id: id,
  });
  if (error) throw error;
}
