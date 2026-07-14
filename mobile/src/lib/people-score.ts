// Data layer Fase 7 — People & Score.
// Achievement Score per user dari data eksekusi Fase 1-6, ber-versi, ranking ter-freeze per periode,
// manual override single-actor (D10 revisi). Pemanggil tipis: otorisasi server (RLS read + RPC tulis).
// Reuse score.ts (scoreBand/SCORE_*) di UI — JANGAN duplikasi semantik band di sini.
import type { ScoreBreakdownMetric } from '@/components/ui';
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

export const FORMULA_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  active: 'Aktif',
  archived: 'Diarsipkan',
};

/**
 * PPL-02 tab labels + placeholder (OQ-7/OQ-9 diputuskan 2026-07-05).
 * Quarter: DEFER placeholder sampai data quarterly-rollup skoring ada (Fase 7 aktivasi).
 * Admin: gate `manage_score_formula`, isi = entry-point ke layar admin eksisting.
 */
export const PEOPLE_TAB_COPY = {
  monthly: 'Bulan ini',
  quarterly: 'Quarter',
  ranking: 'Ranking',
  admin: 'Admin',
  quarterlyPlaceholder: 'Laporan Quarter menyusul setelah periode ditutup.',
} as const;

/** 6 metric Fase 7 V1 — D4: result_achievement keluar (no data source). */
export const METRIC_LABEL: Record<string, string> = {
  task_completion: 'Tugas Completion',
  repeat_compliance: 'Repeat Compliance',
  on_time_rate: 'On-Time Rate',
  review_pass_rate: 'Review Pass Rate',
  development_contribution: 'Development Contribution',
  governance_discipline: 'Governance Discipline',
};

/** metric_breakdown JSONB (skala 0–100) → metrik berlabel untuk ScoreBreakdown. */
export function breakdownToMetrics(breakdown: unknown): ScoreBreakdownMetric[] {
  if (!breakdown || typeof breakdown !== 'object') return [];
  const out: ScoreBreakdownMetric[] = [];
  for (const [code, raw] of Object.entries(breakdown as Record<string, unknown>)) {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) out.push({ label: METRIC_LABEL[code] ?? code, value });
  }
  return out;
}

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

/**
 * Periode aktif untuk org user (max 1 per D9/AC-7.29). null saat tak ada.
 * Order+limit(1) sebagai pengaman defensif: jika RLS pernah mengekspos >1 baris aktif
 * (mis. supervisor multi-org di masa depan), .maybeSingle() tanpa limit akan PGRST116 →
 * mematikan layar Score. Sort tie-break by period_start desc → ambil yang paling baru.
 */
export async function getActivePeriod(): Promise<PeriodSnapshot | null> {
  const { data, error } = await supabase
    .from('period_snapshots')
    .select('*')
    .eq('status', 'active')
    .order('period_start', { ascending: false })
    .limit(1)
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

/**
 * Skor user tertentu untuk satu periode (profil People). RLS membatasi visibility (D1):
 * lolos hanya bila viewer = user itu sendiri, pemegang manage_score_formula/CEO/view_all_workspace,
 * atau supervisor (is_supervisor_of). Di luar scope → null (graceful, AC-7.26 — bukan error).
 * userId/periodId kosong → null tanpa fetch.
 */
export async function getUserScore(userId: string, periodId: string): Promise<UserScoreResult | null> {
  if (!userId || !periodId) return null;
  const { data, error } = await supabase
    .from('user_score_results')
    .select('*')
    .eq('user_id', userId)
    .eq('period_snapshot_id', periodId)
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
  // Order by period_start (not calculated_at) so recalculations don't break sparkline order.
  // Server-side ORDER + LIMIT memastikan ambil window terbaru, bukan arbitrary N rows lalu sort.
  const { data, error } = await supabase
    .from('user_score_results')
    .select('*, period_snapshots!period_snapshot_id(period_start)')
    .eq('user_id', uid)
    .eq('is_current', true)
    .order('period_start', { ascending: false, foreignTable: 'period_snapshots' })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Array<UserScoreResult & { period_snapshots: { period_start: string } | null }>;
  // Safety net: re-sort client-side identitas urutan (server-side order via foreignTable kadang
  // tidak memerintahkan baris induk; klien menjamin newest-first untuk konsumen).
  rows.sort((a, b) => {
    const da = a.period_snapshots?.period_start ?? '';
    const db = b.period_snapshots?.period_start ?? '';
    return db.localeCompare(da); // DESC newest first
  });
  return rows as unknown as UserScoreResult[];
}

/**
 * Histori skor user TERTENTU (PPL-06 / OQ-5 cross-user). Pola sama dengan listMyScoreHistory
 * tapi tanpa auth.getUser: RLS server-side (0013:799-815) menyaring viewer berdasarkan
 * self OR manage_score_formula OR view_all_workspace OR is_supervisor_of(user_id).
 * Viewer di luar scope → [] graceful (0 baris dari RLS deny, bukan error).
 * userId kosong → [] tanpa fetch. Limit default 6.
 */
export async function listUserScoreHistory(userId: string, limit: number = 6): Promise<UserScoreResult[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('user_score_results')
    .select('*, period_snapshots!period_snapshot_id(period_start)')
    .eq('user_id', userId)
    .eq('is_current', true)
    .order('period_start', { ascending: false, foreignTable: 'period_snapshots' })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as Array<UserScoreResult & { period_snapshots: { period_start: string } | null }>;
  // Safety net client-side sort (foreignTable order kadang tidak menyortir baris induk).
  rows.sort((a, b) => {
    const da = a.period_snapshots?.period_start ?? '';
    const db = b.period_snapshots?.period_start ?? '';
    return db.localeCompare(da);
  });
  return rows as unknown as UserScoreResult[];
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

// ---------------------------------------------------------------- UI-S-SF1 (migrasi 0020)

export type FormulaLevel = 'staff' | 'management' | 'c_level' | 'ceo';

export type CreateScoreFormulaDraftInput = {
  templateId: string;
  level: FormulaLevel;
  changeReason: string;
  categories?: FormulaCategory[] | null; // null → server auto-clone dari versi terbaru
};

/**
 * 2-phase: create draft baru per (template, level).
 * Server: 1-draft enforce, change_reason min 8 char trimmed, hybrid clone categories.
 * Throws 'draft_already_exists' bila sudah ada draft untuk template+level.
 */
export async function createScoreFormulaDraft(input: CreateScoreFormulaDraftInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_score_formula_draft', {
    p_template_id: input.templateId,
    p_level: input.level,
    p_change_reason: input.changeReason,
    p_categories: (input.categories ?? null) as never,
  });
  if (error) throw error;
  return data as string;
}

export type UpdateFormulaVersionWeightsInput = {
  versionId: string;
  categories: FormulaCategory[];
  changeReason: string;
};

/**
 * UPDATE in-place pada draft.
 * Server: change_reason min 8 trimmed, categories_set_mismatch guard, weight integer 0..100.
 * Save sum != 100 DIIZINKAN (validasi 100 hanya di activate).
 */
export async function updateFormulaVersionWeights(input: UpdateFormulaVersionWeightsInput): Promise<void> {
  const { error } = await supabase.rpc('update_score_formula_version_weights', {
    p_version_id: input.versionId,
    p_categories: input.categories as never,
    p_change_reason: input.changeReason,
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
    p_role_level: input.roleLevel as unknown as string,
    p_user_id: input.userId as unknown as string,
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
