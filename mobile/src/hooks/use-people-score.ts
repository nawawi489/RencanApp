// Hooks Fase 7 — People & Score. Pemanggil tipis di atas @/lib/people-score.
// Query keys TERKUNCI:
//   ['active_period']                              — periode aktif org
//   ['my_score', periodId | 'active']              — skor saya satu periode (atau active)
//   ['ranking', periodId]                          — ranking periode (post-close, D9)
//   ['score_formula_versions', templateId]         — versi formula per template
// Mutasi meng-invalidate key terkait; mutateAsync melempar agar error propagate.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  activateScoreFormulaVersion,
  createScoreFormulaDraft,
  updateFormulaVersionWeights,
  type CreateScoreFormulaDraftInput,
  type UpdateFormulaVersionWeightsInput,
  assignScoreFormula,
  getActivePeriod,
  getLatestClosedPeriod,
  getMyScore,
  getUserScore,
  listMyScoreHistory,
  listRanking,
  listUserScoreHistory,
  listScoreFormulaTemplates,
  listScoreFormulaVersions,
  overrideUserScore,
  upsertScoreFormulaVersion,
  type AssignScoreFormulaInput,
  type FormulaCategory,
  type PeriodSnapshot,
  type RankingSnapshot,
  type ScoreFormulaTemplate,
  type ScoreFormulaVersion,
  type UserScoreResult,
} from '@/lib/people-score';

// ---------------------------------------------------------------- queries

export function useActivePeriod() {
  const q = useQuery({
    queryKey: ['active_period'],
    queryFn: getActivePeriod,
  });
  return {
    period: q.data as PeriodSnapshot | null | undefined,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Periode tertutup terbaru — sumber per-user ScoreBadge di People (D9). */
export function useLatestClosedPeriod() {
  const q = useQuery({
    queryKey: ['latest_closed_period'],
    queryFn: getLatestClosedPeriod,
  });
  return {
    period: q.data as PeriodSnapshot | null | undefined,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/** Histori skor saya (D6 Trend). N periode terbaru, urut DESC. */
export function useMyScoreHistory(limit: number = 6) {
  const q = useQuery({
    queryKey: ['my_score_history', limit],
    queryFn: () => listMyScoreHistory(limit),
  });
  return {
    history: (q.data ?? []) as UserScoreResult[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/**
 * Histori skor user tertentu (PPL-06 / OQ-5 cross-user). RLS server-side menyaring
 * viewer (self OR manage_score_formula OR view_all_workspace OR is_supervisor_of).
 * Disabled saat userId kosong → history=[] tanpa fetch.
 */
export function useUserScoreHistory(userId: string, limit: number = 6) {
  const q = useQuery({
    queryKey: ['user_score_history', userId, limit],
    queryFn: () => listUserScoreHistory(userId, limit),
    enabled: !!userId,
  });
  return {
    history: (q.data ?? []) as UserScoreResult[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export function useMyScore(periodId?: string) {
  const q = useQuery({
    queryKey: ['my_score', periodId ?? 'active'],
    queryFn: () => getMyScore(periodId),
  });
  return {
    score: q.data as UserScoreResult | null | undefined,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Skor satu user untuk satu periode (profil People). RLS menyaring per visibility (D1) →
 * di luar scope mengembalikan null, bukan error. Disabled saat userId/periodId kosong.
 */
export function useUserScore(userId: string, periodId: string) {
  const q = useQuery({
    queryKey: ['user_score', userId, periodId],
    queryFn: () => getUserScore(userId, periodId),
    enabled: !!userId && !!periodId,
  });
  return {
    score: q.data as UserScoreResult | null | undefined,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

export function useRanking(periodId: string) {
  const q = useQuery({
    queryKey: ['ranking', periodId],
    queryFn: () => listRanking(periodId),
    enabled: !!periodId,
  });
  return {
    ranking: (q.data ?? []) as RankingSnapshot[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Daftar template formula (D13 transparan org). */
export function useScoreFormulaTemplates() {
  const q = useQuery({
    queryKey: ['score_formula_templates'],
    queryFn: () => listScoreFormulaTemplates(),
  });
  return {
    templates: (q.data ?? []) as ScoreFormulaTemplate[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

export function useScoreFormulaVersions(templateId: string) {
  const q = useQuery({
    queryKey: ['score_formula_versions', templateId],
    queryFn: () => listScoreFormulaVersions(templateId),
    enabled: !!templateId,
  });
  return {
    versions: (q.data ?? []) as ScoreFormulaVersion[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

// ---------------------------------------------------------------- actions (mutations)

export type ScoreOverrideArgs = {
  userId: string;
  manualScore: number;
  reason: string;
};

export function useScoreOverride(periodId: string) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (args: ScoreOverrideArgs) =>
      overrideUserScore({ periodId, ...args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_score'] });
      // Override mengubah skor user target → profil People (useUserScore) ikut basi.
      qc.invalidateQueries({ queryKey: ['user_score'] });
      // Invalidate semua ranking (override pada periode closed mempengaruhi badge People juga).
      qc.invalidateQueries({ queryKey: ['ranking'] });
      qc.invalidateQueries({ queryKey: ['my_score_history'] });
      // Cross-user history (PPL-06 / OQ-5): profil orang lain juga ikut basi.
      qc.invalidateQueries({ queryKey: ['user_score_history'] });
    },
  });
  return {
    override: (args: ScoreOverrideArgs) => m.mutateAsync(args),
    isPending: m.isPending,
  };
}

export type UpsertFormulaArgs = {
  categories: FormulaCategory[];
  changeReason: string;
};

export function useFormulaActions(templateId: string) {
  const qc = useQueryClient();

  const upsertM = useMutation({
    mutationFn: (args: UpsertFormulaArgs) =>
      upsertScoreFormulaVersion({ templateId, ...args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score_formula_versions', templateId] });
    },
  });

  const activateM = useMutation({
    mutationFn: (args: { versionId: string; effectiveDate: string }) =>
      activateScoreFormulaVersion(args.versionId, args.effectiveDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score_formula_versions', templateId] });
      // Aktivasi mengubah "active version" pada listing template (D13 transparan org).
      qc.invalidateQueries({ queryKey: ['score_formula_templates'] });
    },
  });

  const assignM = useMutation({
    mutationFn: (input: AssignScoreFormulaInput) => assignScoreFormula(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score_formula_versions', templateId] });
      qc.invalidateQueries({ queryKey: ['score_formula_templates'] });
    },
  });

  // UI-S-SF1: 2 mutasi baru — createDraft + updateWeights.
  const createDraftM = useMutation({
    mutationFn: (input: CreateScoreFormulaDraftInput) => createScoreFormulaDraft(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score_formula_versions', templateId] });
    },
  });

  const updateWeightsM = useMutation({
    mutationFn: (input: UpdateFormulaVersionWeightsInput) => updateFormulaVersionWeights(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score_formula_versions', templateId] });
    },
  });

  return {
    upsert: (args: UpsertFormulaArgs) => upsertM.mutateAsync(args),
    activate: (versionId: string, effectiveDate: string) =>
      activateM.mutateAsync({ versionId, effectiveDate }),
    assign: (input: AssignScoreFormulaInput) => assignM.mutateAsync(input),
    createDraft: (input: CreateScoreFormulaDraftInput) => createDraftM.mutateAsync(input),
    updateWeights: (input: UpdateFormulaVersionWeightsInput) => updateWeightsM.mutateAsync(input),
    isPending:
      upsertM.isPending ||
      activateM.isPending ||
      assignM.isPending ||
      createDraftM.isPending ||
      updateWeightsM.isPending,
    isCreatingDraft: createDraftM.isPending,
    isUpdatingWeights: updateWeightsM.isPending,
  };
}
