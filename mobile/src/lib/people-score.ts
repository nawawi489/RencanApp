// Data layer Fase 7 — People & Score.
// Achievement Score per user dari data eksekusi Fase 1-6, ber-versi, ranking ter-freeze per periode,
// manual override single-actor (D10 revisi). Pemanggil tipis: otorisasi server (RLS read + RPC tulis).
// Reuse score.ts (scoreBand/SCORE_*) di UI — JANGAN duplikasi semantik band di sini.
import type { Tables } from './database.types';
import { supabase } from './supabase';

export type PeriodSnapshot = Tables<'period_snapshots'>;
export type UserScoreResult = Tables<'user_score_results'>;
export type RankingSnapshot = Tables<'ranking_snapshots'>;
export type ScoreFormulaVersion = Tables<'score_formula_versions'>;
export type ScoreFormulaTemplate = Tables<'score_formula_templates'>;
export type ScoreCategory = Tables<'score_categories'>;
export type ScoreFormulaAssignment = Tables<'score_formula_assignments'>;

// ---------------------------------------------------------------- label maps

export const PERIOD_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Aktif',
  closed: 'Tertutup',
};

export const FORMULA_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Aktif',
  archived: 'Diarsipkan',
};

export const RESULT_KIND_LABEL: Record<string, string> = {
  auto: 'Otomatis',
  override: 'Override Manual',
};

/** 6 metric Fase 7 V1 — D4: result_achievement keluar (no data source). */
export const METRIC_LABEL: Record<string, string> = {
  action_plan_completion: 'Action Plan Completion',
  repeat_compliance: 'Repeat Compliance',
  on_time_rate: 'On-Time Rate',
  review_pass_rate: 'Review Pass Rate',
  development_contribution: 'Development Contribution',
  governance_discipline: 'Governance Discipline',
};

// ---------------------------------------------------------------- helpers

/**
 * Skor efektif = manual_adjusted_score ?? auto_calculated_score.
 * GOTCHA: pakai `??` (null/undefined coalesce) BUKAN `||` agar skor 0 nyata tidak fallback ke auto.
 * Record null → null (saat user belum punya skor di periode aktif).
 */
export function effectiveScore(r: UserScoreResult | null): number | null {
  if (r == null) return null;
  return r.manual_adjusted_score ?? r.auto_calculated_score;
}

// ---------------------------------------------------------------- reads (RLS)

/** Periode aktif untuk org user (max 1 per D9/AC-7.29). null saat tak ada. */
export async function getActivePeriod(): Promise<PeriodSnapshot | null> {
  const { data, error } = await supabase
    .from('period_snapshots')
    .select('*')
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Periode tertutup terbaru (per D9: ranking hanya muncul setelah close).
 * Sumber data untuk ranking_snapshots & per-user ScoreBadge di People.
 * null saat belum pernah ada periode yang ditutup.
 */
export async function getLatestClosedPeriod(): Promise<PeriodSnapshot | null> {
  const { data, error } = await supabase
    .from('period_snapshots')
    .select('*')
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Skor saya untuk satu periode. periodId opsional — bila tak diberi, auto-fetch active period.
 * Mengembalikan null saat: belum ada periode aktif, ATAU belum ada baris current untuk user.
 * Filter: user_id = auth.uid() AND period_snapshot_id = id AND is_current = true.
 */
export async function getMyScore(periodId?: string): Promise<UserScoreResult | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not authenticated');

  let pid = periodId;
  if (!pid) {
    const period = await getActivePeriod();
    if (!period) return null;
    pid = period.id;
  }

  const { data, error } = await supabase
    .from('user_score_results')
    .select('*')
    .eq('user_id', uid)
    .eq('period_snapshot_id', pid)
    .eq('is_current', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Ranking untuk satu periode (ASC rank_number). periodId kosong → array kosong tanpa fetch. */
export async function listRanking(periodId: string): Promise<RankingSnapshot[]> {
  if (!periodId) return [];
  const { data, error } = await supabase
    .from('ranking_snapshots')
    .select('*')
    .eq('period_snapshot_id', periodId)
    .order('rank_number', { ascending: true });
  if (error) throw error;
  return data as RankingSnapshot[];
}

/**
 * Histori skor saya (D6 Trend): user_score_results yang current=true, urut periode terbaru → terlama.
 * RLS otomatis menyaring ke user_id=auth.uid() (juga via supervisor/manage). Limit default 6.
 * Mengembalikan array kosong saat user belum punya histori (graceful sparkline).
 */
export async function listMyScoreHistory(limit: number = 6): Promise<UserScoreResult[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('user_score_results')
    .select('*')
    .eq('user_id', uid)
    .eq('is_current', true)
    .order('calculated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as UserScoreResult[];
}

/** Daftar versi formula untuk satu template, terbaru dulu. */
export async function listScoreFormulaVersions(templateId: string): Promise<ScoreFormulaVersion[]> {
  const { data, error } = await supabase
    .from('score_formula_versions')
    .select('*')
    .eq('template_id', templateId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return data as ScoreFormulaVersion[];
}

/** Daftar template formula untuk org user (D13 transparan org). Difilter level bila perlu. */
export async function listScoreFormulaTemplates(level?: string): Promise<ScoreFormulaTemplate[]> {
  let q = supabase
    .from('score_formula_templates')
    .select('*')
    .order('level', { ascending: true });
  if (level) q = q.eq('level', level);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ScoreFormulaTemplate[];
}

// ---------------------------------------------------------------- writes (RPC SECURITY DEFINER)

export type FormulaCategory = {
  code: string;
  weight: number;
  source_metric: string;
};

export type UpsertScoreFormulaVersionInput = {
  templateId: string;
  categories: FormulaCategory[];
  changeReason: string;
};

export async function upsertScoreFormulaVersion(input: UpsertScoreFormulaVersionInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_score_formula_version', {
    p_template_id: input.templateId,
    p_categories: input.categories,
    p_change_reason: input.changeReason,
  });
  if (error) throw error;
  return data as string;
}

export async function activateScoreFormulaVersion(versionId: string, effectiveDate: string): Promise<void> {
  const { error } = await supabase.rpc('activate_score_formula_version', {
    p_version_id: versionId,
    p_effective_date: effectiveDate,
  });
  if (error) throw error;
}

export type AssignScoreFormulaInput = {
  versionId: string;
  scopeLevel: 'org_role' | 'user';
  roleLevel: 'staff' | 'management' | 'c_level' | 'ceo' | null;
  userId: string | null;
  startDate: string;
};

export async function assignScoreFormula(input: AssignScoreFormulaInput): Promise<string> {
  const { data, error } = await supabase.rpc('assign_score_formula', {
    p_version_id: input.versionId,
    p_scope_level: input.scopeLevel,
    p_role_level: input.roleLevel,
    p_user_id: input.userId,
    p_start_date: input.startDate,
  });
  if (error) throw error;
  return data as string;
}

export type OpenPeriodSnapshotInput = {
  periodName: string;
  periodStart: string;
  periodEnd: string;
};

export async function openPeriodSnapshot(input: OpenPeriodSnapshotInput): Promise<string> {
  const { data, error } = await supabase.rpc('open_period_snapshot', {
    p_period_name: input.periodName,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
  });
  if (error) throw error;
  return data as string;
}

export async function calculatePeriodScores(periodId: string): Promise<number> {
  const { data, error } = await supabase.rpc('calculate_period_scores', { p_period_id: periodId });
  if (error) throw error;
  return data as number;
}

export async function closePeriodSnapshot(periodId: string): Promise<number> {
  const { data, error } = await supabase.rpc('close_period_snapshot', { p_period_id: periodId });
  if (error) throw error;
  return data as number;
}

export type OverrideUserScoreInput = {
  periodId: string;
  userId: string;
  manualScore: number;
  reason: string;
};

/**
 * Override skor user — SINGLE-actor (D10 revisi). Anti-self & reason wajib ditegakkan server.
 * Return id baris user_score_results baru (result_kind='override').
 */
export async function overrideUserScore(input: OverrideUserScoreInput): Promise<string> {
  const { data, error } = await supabase.rpc('override_user_score', {
    p_period_id: input.periodId,
    p_user_id: input.userId,
    p_manual_score: input.manualScore,
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as string;
}
