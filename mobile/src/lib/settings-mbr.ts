// Data layer Fase 5 — Minimum Breakdown Rule (MBR) + Kelengkapan Perencanaan.
// Pemanggil tipis: otorisasi & validasi di server (RLS SELECT, RPC SECURITY DEFINER untuk tulis
// & pemeriksaan kepatuhan). Klien hanya mem-map camelCase→p_* dan menormalisasi bentuk return.
import type { Tone } from '@/components/ui';
import { supabase } from './supabase';

/** Jenis kartu yang relevan untuk rule MBR (mengikuti PRD §39–43). */
export type CardType =
  | 'goal'
  | 'strategy'
  | 'initiative'
  | 'action_plan'
  | 'task'
  | 'development_area'
  | 'problem_statement';

/** 3 mode enforcement kanonik. Tone & gating UI bergantung mode. */
export type EnforcementMode =
  | 'hanya_peringatan'
  | 'blokir_aktivasi'
  | 'blokir_akses_turunan';

/** Satu baris aturan; organization_id NULL = baris sistem (fallback). */
export type MbrRule = {
  id: string;
  organization_id: string | null;
  parent_card_type: CardType;
  child_card_type: CardType;
  min_count: number;
  enforcement_mode: EnforcementMode;
  created_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

/** Bentuk kanonik kepatuhan (dipakai hooks & UI). */
export type MbrCompliance = {
  child_card_type: CardType | null;
  child_count: number;
  min_count: number;
  enforcement_mode: EnforcementMode;
  is_compliant: boolean;
};

// ---------------------------------------------------------------- label maps

export const ENFORCEMENT_MODE_LABEL: Record<EnforcementMode, string> = {
  hanya_peringatan: 'Hanya Peringatan',
  blokir_aktivasi: 'Blokir Aktivasi',
  blokir_akses_turunan: 'Blokir Akses Turunan',
};

/** Label jenis kartu untuk tampilan Settings ("Parent → Child"). */
export const CARD_TYPE_LABEL: Record<CardType, string> = {
  goal: 'Goal',
  strategy: 'KPI Area',
  initiative: 'Initiative',
  action_plan: 'ActionPlan',
  task: 'Action Plan',
  development_area: 'Development Area',
  problem_statement: 'Problem Statement',
};

/** 3 mode urut untuk picker Settings. */
export const ENFORCEMENT_MODES: EnforcementMode[] = [
  'hanya_peringatan',
  'blokir_aktivasi',
  'blokir_akses_turunan',
];

/** Tone visual: ikut palet STATUS_TONE Fase 1. */
export const ENFORCEMENT_MODE_TONE: Record<EnforcementMode, Tone> = {
  hanya_peringatan: 'warn',
  blokir_aktivasi: 'danger',
  blokir_akses_turunan: 'danger',
};

// ---------------------------------------------------------------- util murni

/** "Lengkap" bila sudah memenuhi minimum, selain itu rasio "X/Y" untuk indikator. */
export function complianceLabel(count: number, min: number): string {
  return count >= min ? 'Lengkap' : `${count}/${min}`;
}

// ---------------------------------------------------------------- queries

export async function listMbrRules(): Promise<MbrRule[]> {
  const { data, error } = await supabase
    .from('minimum_breakdown_rules')
    .select('*')
    .order('parent_card_type', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as MbrRule[];
  // Deduplicate: org-level row wins over system fallback (organization_id NULL).
  const map = new Map<string, MbrRule>();
  for (const r of rows) {
    const key = `${r.parent_card_type}:${r.child_card_type}`;
    const existing = map.get(key);
    if (!existing || (r.organization_id && !existing.organization_id)) {
      map.set(key, r);
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------- mutations (RPC)

export type SetMbrRuleInput = {
  parentCardType: CardType;
  childCardType: CardType;
  minCount: number;
  enforcementMode: EnforcementMode;
};

export async function setMbrRule(input: SetMbrRuleInput): Promise<string> {
  const { data, error } = await supabase.rpc('set_minimum_breakdown_rule', {
    p_parent_card_type: input.parentCardType,
    p_child_card_type: input.childCardType,
    p_min_count: input.minCount,
    p_enforcement_mode: input.enforcementMode,
  });
  if (error) throw error;
  return data as string;
}

// ---------------------------------------------------------------- compliance check

/** Baris mentah dari RPC (snake_case dari plpgsql RETURNS TABLE). */
type RawComplianceRow = {
  child_card_type: CardType | null;
  current_count: number | null;
  required_count: number | null;
  enforcement_mode: EnforcementMode | null;
  meets_requirement: boolean | null;
};

const EMPTY_COMPLIANCE: MbrCompliance = {
  child_card_type: null,
  child_count: 0,
  min_count: 0,
  enforcement_mode: 'hanya_peringatan',
  is_compliant: true,
};

export async function checkMbrCompliance(
  parentCardType: CardType,
  parentCardId: string,
): Promise<MbrCompliance> {
  const { data, error } = await supabase.rpc('check_minimum_breakdown_compliance', {
    p_parent_card_type: parentCardType,
    p_parent_card_id: parentCardId,
  });
  if (error) throw error;
  // RPC RETURNS TABLE: data array; ambil baris pertama (level 1 deep — child terdekat).
  const rows = (data ?? []) as RawComplianceRow[];
  if (!rows.length) return EMPTY_COMPLIANCE;
  const r = rows[0];
  return {
    child_card_type: r.child_card_type,
    child_count: r.current_count ?? 0,
    min_count: r.required_count ?? 0,
    enforcement_mode: r.enforcement_mode ?? 'hanya_peringatan',
    is_compliant: !!r.meets_requirement,
  };
}
