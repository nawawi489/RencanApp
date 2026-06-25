// Data layer Fase 6 — Development Area (root jalur Development).
// Pemanggil tipis: otorisasi server (RLS untuk INSERT, RPC SECURITY DEFINER untuk lifecycle).
// Mirror pola goals.ts (Goal) byte-for-byte; gantikan tabel/RPC saja.
import { STATUS_TONE, type PersonRef } from './cards';
import type { Tables } from './database.types';
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

export async function getDevelopmentArea(id: string): Promise<DevelopmentArea> {
  const { data, error } = await supabase
    .from('development_areas')
    .select('*')
    .eq('id', id)
    .single();
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
    .from('development_areas')
    .insert({ ...input, organization_id: profile.organization_id, created_by: uid })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateDevelopmentArea(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_development_area', {
    p_development_area_id: id,
  });
  if (error) throw error;
}
