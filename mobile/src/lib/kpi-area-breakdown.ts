// Data layer — KPI Area Target Breakdown (PRD V1.8.2 §12). Migrasi 0021.
//
// Aturan kunci:
//   - Σ kontribusi Quarter wajib 100% (4 entri Q1..Q4).
//   - Σ kontribusi Month wajib 100% PER Quarter (3 entri/quarter).
//   - Mutasi WAJIB lewat RPC `strategy_breakdown_replace` (RLS direct DML ditutup).
//   - Edit periode berjalan WAJIB sertakan `reason` ≥ 8 char (audit ke activity_log).
import { supabase } from './supabase';

export const QUARTER_KEYS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export type QuarterKey = (typeof QUARTER_KEYS)[number];

export const MONTH_KEYS = [
  'M01','M02','M03','M04','M05','M06','M07','M08','M09','M10','M11','M12',
] as const;
export type MonthKey = (typeof MONTH_KEYS)[number];

export type BreakdownRow = {
  id: string;
  organization_id: string;
  strategy_id: string;
  period_type: 'quarter' | 'month';
  period_key: QuarterKey | MonthKey;
  parent_quarter_key: QuarterKey | null;
  contribution_pct: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Map MonthKey → parent QuarterKey. M01..M03 → Q1, M04..M06 → Q2, dst. */
export function quarterOfMonthKey(m: MonthKey): QuarterKey {
  const n = Number(m.slice(1));
  return QUARTER_KEYS[Math.ceil(n / 3) - 1];
}

/** Sum array of percentages (numerik; toleransi pembulatan di caller). */
export function sumOf(values: number[]): number {
  return values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
}

/** Group rows oleh period_type → map period_key → contribution_pct. */
export function indexQuarterRows(rows: BreakdownRow[]): Record<QuarterKey, number> {
  const out = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 } as Record<QuarterKey, number>;
  for (const r of rows) {
    if (r.period_type === 'quarter') {
      out[r.period_key as QuarterKey] = Number(r.contribution_pct) || 0;
    }
  }
  return out;
}

/** Group monthly rows by parent_quarter_key → { M01: pct, M02: pct, M03: pct }. */
export function indexMonthRowsPerQuarter(
  rows: BreakdownRow[],
): Record<QuarterKey, Partial<Record<MonthKey, number>>> {
  const out: Record<QuarterKey, Partial<Record<MonthKey, number>>> = {
    Q1: {}, Q2: {}, Q3: {}, Q4: {},
  };
  for (const r of rows) {
    if (r.period_type === 'month' && r.parent_quarter_key) {
      out[r.parent_quarter_key][r.period_key as MonthKey] = Number(r.contribution_pct) || 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------- queries

export async function listKpiAreaBreakdown(kpiAreaId: string): Promise<BreakdownRow[]> {
  if (!kpiAreaId) return [];
  const { data, error } = await supabase
    .from('strategy_target_breakdowns')
    .select('*')
    .eq('strategy_id', kpiAreaId)
    .order('period_type', { ascending: true })
    .order('period_key', { ascending: true });
  if (error) throw error;
  return (data ?? []) as BreakdownRow[];
}

// ---------------------------------------------------------------- mutations

export type QuarterInput = { period_key: QuarterKey; pct: number };
export type MonthInput = { period_key: MonthKey; parent_quarter_key: QuarterKey; pct: number };

export type ReplaceArgs = {
  kpiAreaId: string;
  quarter: QuarterInput[] | null;
  month: MonthInput[] | null;
  reason: string;
};

/**
 * Atomic replace seluruh breakdown KPI Area (per period_type).
 * - `quarter` null → tidak menyentuh baris Quarter eksisting.
 * - `quarter` array (4 entri Σ=100) → upsert 4 baris Q1..Q4.
 * - `month` null/empty → tidak menyentuh.
 * - `month` array (3 entri × N quarter Σ=100/quarter) → upsert per Q.
 * Server validasi & emit activity_log.
 */
export async function replaceKpiAreaBreakdown(args: ReplaceArgs): Promise<BreakdownRow[]> {
  const { data, error } = await supabase.rpc('strategy_breakdown_replace', {
    p_strategy_id: args.kpiAreaId,
    p_quarter: args.quarter,
    p_month: args.month,
    p_reason: args.reason,
  });
  if (error) throw error;
  return (data ?? []) as BreakdownRow[];
}
