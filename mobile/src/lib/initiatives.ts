// Data layer Fase 4 — Inisiatif (turunan dari Strategi). Pemanggil tipis: card dibuat via INSERT
// ber-RLS (mengisi organization_id dari profiles + created_by), aktivasi lewat RPC SECURITY DEFINER.
// Otorisasi ditegakkan di server.
import { STATUS_TONE } from './cards';
import type { Tables } from './database.types';
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

export async function getInitiative(id: string): Promise<Inisiatif | null> {
  // maybeSingle, BUKAN single: id di luar akses/tidak ada → RLS menyaring jadi 0 baris.
  // single() membalas 406 dan React Query terus retry → skeleton tak pernah selesai.
  const { data, error } = await supabase
    .from('initiatives')
    .select('*')
    .eq('id', id)
    .maybeSingle();
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
  /** Kunci idempotensi (0103): retry-manual dgn key sama mengembalikan baris asli, bukan duplikat. */
  client_request_id?: string | null;
};

export async function createInitiative(input: NewInitiative): Promise<Inisiatif> {
  const { data, error } = await supabase.rpc('create_initiative_idempotent', {
    p_strategy_id: input.strategy_id,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_reason: input.reason ?? undefined,
    p_main_risk: input.main_risk ?? undefined,
    p_alternative: input.alternative ?? undefined,
    p_pic_id: input.pic_id ?? undefined,
    p_period_start: input.period_start ?? undefined,
    p_period_end: input.period_end ?? undefined,
    p_contribution_pct: input.contribution_pct ?? undefined,
    p_client_request_id: input.client_request_id ?? undefined,
  });
  if (error) throw error;
  return data as Inisiatif;
}

/**
 * S4-2 — sunting Inisiatif. Periode & kontribusi TERKUNCI pasca-aktivasi
 * (dasar skor); server MENOLAK perubahannya dengan error, bukan mengabaikan
 * diam-diam. Kirim nilai apa adanya (termasuk `null`) supaya panggilan yang
 * tidak menyentuh keduanya tidak ikut tertolak.
 */
export type InitiativePatch = {
  name: string;
  description: string | null;
  pic_id: string | null;
  reason: string | null;
  main_risk: string | null;
  alternative: string | null;
  contribution_pct: number | null;
  period_start: string | null;
  period_end: string | null;
};

export async function updateInitiative(id: string, patch: InitiativePatch): Promise<void> {
  const { error } = await supabase.rpc('update_initiative', {
    p_initiative_id: id,
    p_name: patch.name,
    p_description: (patch.description ?? null) as unknown as string,
    p_pic_id: (patch.pic_id ?? null) as unknown as string,
    p_reason: (patch.reason ?? null) as unknown as string,
    p_main_risk: (patch.main_risk ?? null) as unknown as string,
    p_alternative: (patch.alternative ?? null) as unknown as string,
    p_contribution_pct: (patch.contribution_pct ?? null) as unknown as number,
    p_period_start: (patch.period_start ?? null) as unknown as string,
    p_period_end: (patch.period_end ?? null) as unknown as string,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------- RPC (lifecycle)

export async function activateInitiative(id: string): Promise<void> {
  const { error } = await supabase.rpc('activate_initiative', { p_initiative_id: id });
  if (error) throw error;
}
