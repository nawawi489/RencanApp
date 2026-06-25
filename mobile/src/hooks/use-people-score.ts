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
  assignScoreFormula,
  calculatePeriodScores,
  closePeriodSnapshot,
  getActivePeriod,
  getMyScore,
  listRanking,
  listScoreFormulaVersions,
  openPeriodSnapshot,
  overrideUserScore,
  upsertScoreFormulaVersion,
  type AssignScoreFormulaInput,
  type FormulaCategory,
  type OpenPeriodSnapshotInput,
  type PeriodSnapshot,
  type RankingSnapshot,
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

export function usePeriodActions() {
  const qc = useQueryClient();

  const openM = useMutation({
    mutationFn: (input: OpenPeriodSnapshotInput) => openPeriodSnapshot(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_period'] });
    },
  });

  const calculateM = useMutation({
    mutationFn: (periodId: string) => calculatePeriodScores(periodId),
    onSuccess: (_data, periodId) => {
      qc.invalidateQueries({ queryKey: ['my_score'] });
      qc.invalidateQueries({ queryKey: ['ranking', periodId] });
    },
  });

  const closeM = useMutation({
    mutationFn: (periodId: string) => closePeriodSnapshot(periodId),
    onSuccess: (_data, periodId) => {
      qc.invalidateQueries({ queryKey: ['active_period'] });
      qc.invalidateQueries({ queryKey: ['ranking', periodId] });
      qc.invalidateQueries({ queryKey: ['my_score'] });
    },
  });

  return {
    open: (input: OpenPeriodSnapshotInput) => openM.mutateAsync(input),
    calculate: (periodId: string) => calculateM.mutateAsync(periodId),
    close: (periodId: string) => closeM.mutateAsync(periodId),
    isPending: openM.isPending || calculateM.isPending || closeM.isPending,
    calculatePending: calculateM.isPending,
    closePending: closeM.isPending,
  };
}

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
      qc.invalidateQueries({ queryKey: ['ranking', periodId] });
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
    },
  });

  const assignM = useMutation({
    mutationFn: (input: AssignScoreFormulaInput) => assignScoreFormula(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['score_formula_versions', templateId] });
    },
  });

  return {
    upsert: (args: UpsertFormulaArgs) => upsertM.mutateAsync(args),
    activate: (versionId: string, effectiveDate: string) =>
      activateM.mutateAsync({ versionId, effectiveDate }),
    assign: (input: AssignScoreFormulaInput) => assignM.mutateAsync(input),
    isPending: upsertM.isPending || activateM.isPending || assignM.isPending,
  };
}
