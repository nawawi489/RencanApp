// Hooks Fase 7 — People & Score. Pemanggil tipis di atas @/lib/people-score.
// Query keys TERKUNCI:
//   ['active_period']                              — periode aktif org
//   ['my_score', periodId | 'active']              — skor saya satu periode (atau active)
//   ['ranking', periodId]                          — ranking periode (post-close, D9)
//   ['score_formula_versions', templateId]         — versi formula per template
// Mutasi meng-invalidate key terkait; mutateAsync melempar agar error propagate.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/providers/auth-provider';
import {
  activateScoreFormulaVersion,
  calculatePeriodScores,
  closePeriodSnapshot,
  openPeriodSnapshot,
  type OpenPeriodSnapshotInput,
  createScoreFormulaDraft,
  previewFinalization,
  updateFormulaVersionWeights,
  type CreateScoreFormulaDraftInput,
  type FinalizationPreview,
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
  const { session } = useAuth();
  const uid = session?.user?.id ?? '';
  const q = useQuery({
    queryKey: ['my_score_history', uid, limit],
    queryFn: () => listMyScoreHistory(uid, limit),
    enabled: !!uid,
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
  const { session } = useAuth();
  const uid = session?.user?.id ?? '';
  const q = useQuery({
    queryKey: ['my_score', uid, periodId ?? 'active'],
    queryFn: () => getMyScore(uid, periodId),
    enabled: !!uid,
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

/**
 * WS-5 — tutup periode aktif (buat snapshot ranking beku, D9). Standalone (bukan
 * bagian useFormulaActions: close adalah aksi periode, tanpa templateId).
 * onSuccess invalidate TEPAT 3 key: ['active_period'] (periode aktif kini hilang),
 * ['latest_closed_period'] (People ScoreBadge), ['ranking'] (prefix — ranking baru muncul).
 * n=0 (tak ada skor current) = sukses. Error RPC (has_permission/sudah-tutup/tak-ada)
 * di-propagate apa adanya lewat mutateAsync agar modal menyurface.
 */
export function useClosePeriod() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (periodId: string) => closePeriodSnapshot(periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_period'] });
      qc.invalidateQueries({ queryKey: ['latest_closed_period'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
    },
  });
  return {
    closePeriod: (periodId: string) => m.mutateAsync(periodId),
    isPending: m.isPending,
  };
}

/**
 * Buka periode skoring baru (NG-2 follow-up jembatan finalisasi — sebelumnya open_period_snapshot
 * ada di DB tapi nol caller UI, sehingga org tanpa periode seeded tidak punya jalan masuk sama sekali).
 * onSuccess invalidate TEPAT 1 key: ['active_period']. Sengaja TIDAK menyentuh ['ranking'],
 * ['latest_closed_period'], maupun key skor — periode baru lahir kosong, belum ada skor
 * maupun peringkat yang berubah; meng-invalidate mereka hanya memicu refetch sia-sia.
 * Error RPC (has_permission / guard satu-aktif-per-org / CHECK period_order) di-propagate
 * apa adanya lewat mutateAsync agar modal menyurface + memetakan ke copy Indonesia.
 */
export function useOpenPeriod() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (input: OpenPeriodSnapshotInput) => openPeriodSnapshot(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_period'] });
    },
  });
  return {
    openPeriod: (input: OpenPeriodSnapshotInput) => m.mutateAsync(input),
    isPending: m.isPending,
  };
}

/**
 * Fase 2 TDD plan (specs/score-ranking-finalization-tdd-plan.md) — hitung skor per user
 * untuk periode aktif. Orchestrator FinalizePeriodModal memanggil ini SEBELUM useClosePeriod;
 * standalone call juga aman (calc idempotent + advisory lock 0079). onSuccess invalidate TEPAT
 * 4 key skor (bukan ranking/active/latest — calc tidak mengubah status period maupun ranking_snapshots).
 * Bila caller masa depan pakai standalone dan butuh ranking refresh, caller invalidasi manual.
 */
export function useCalculatePeriodScores() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (periodId: string) => calculatePeriodScores(periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_score'] });
      qc.invalidateQueries({ queryKey: ['user_score'] });
      qc.invalidateQueries({ queryKey: ['my_score_history'] });
      qc.invalidateQueries({ queryKey: ['user_score_history'] });
    },
  });
  return {
    calculatePeriod: (periodId: string) => m.mutateAsync(periodId),
    isPending: m.isPending,
  };
}

/**
 * Fase 2 TDD plan — pratinjau angka pre-flight untuk modal step 1 (FR-DL-3).
 * enabled=!!periodId supaya tidak fetch saat modal belum tahu period. staleTime=0 + gcTime=0
 * agar setiap kali modal dibuka, angka segar (bukan cached stale).
 */
export function usePreviewFinalization(periodId: string | undefined) {
  const q = useQuery({
    queryKey: ['finalize_preview', periodId],
    queryFn: () => previewFinalization(periodId as string),
    enabled: !!periodId,
    staleTime: 0,
    gcTime: 0,
  });
  return {
    preview: q.data as FinalizationPreview | undefined,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
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
