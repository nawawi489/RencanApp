// Hooks Fase 4 — Workspace (Goal → Strategy → Initiative → Action Plan). Pemanggil tipis di atas
// @/lib/goals, @/lib/strategies, @/lib/initiatives, @/lib/cards. Query keys TERKUNCI (lihat kontrak):
// ['goals'], ['goal', id], ['strategies', goalId], ['initiatives', strategyId],
// ['goal_templates']. Mutasi meng-invalidate key terkait; mutateAsync melempar agar error propagate.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getPersonRef,
  listTasks,
  listActionPlans,
  type TaskWithPeople,
  type ActionPlan,
  type PersonRef,
} from '@/lib/cards';
import {
  activateGoal,
  applyGoalTemplate,
  createGoal,
  getGoal,
  listGoalTemplates,
  listGoals,
  listStrategyTemplates,
  restoreGoalTemplateItems,
  type GoalTemplate,
  type StrategyTemplate,
  type Goal,
  type GoalWithKpiCount,
  type NewGoal,
} from '@/lib/goals';
import {
  activateStrategy,
  createStrategy,
  listStrategies,
  type Strategy,
  type NewStrategy,
} from '@/lib/strategies';
import {
  listStrategyBreakdown,
  replaceStrategyBreakdown,
  type BreakdownRow,
  type ReplaceArgs,
} from '@/lib/strategy-breakdown';
import {
  activateInitiative,
  createInitiative,
  listInitiatives,
  type NewInitiative,
  type Initiative,
} from '@/lib/initiatives';
import {
  activateDevelopmentArea,
  createDevelopmentArea,
  listDevelopmentAreas,
  type DevelopmentAreaWithProblemCount,
  type NewDevelopmentArea,
} from '@/lib/development-areas';
import {
  activateProblemStatement,
  createProblemStatement,
  listProblemStatements,
  type NewProblemStatement,
  type ProblemStatement,
} from '@/lib/problem-statements';
import { fetchCardProgress } from '@/lib/workspace-progress';

// ---------------------------------------------------------------- queries

/**
 * WSA-15 / AC 22 — progress orb tree. Ambil capaian 0–100 untuk sekumpulan card id (anak yang
 * sedang dirender satu kontainer) via RPC rollup. Dipanggil di level KONTAINER daftar anak (satu
 * query per parent expanded), BUKAN per row collapsed → hindari N+1. queryKey pakai ids yang
 * di-sort agar urutan berbeda berbagi cache. `progressOf` null-safe: id tak ada di hasil (belum
 * fetch / error / tak terlihat RLS) → null → UI render '—' (bukan angka palsu). 0 tetap 0.
 */
export function useCardProgress(ids: string[]) {
  const idsKey = ids.join('|');
  const normalizedIds = useMemo(() => [...new Set(ids)].sort(), [idsKey]);
  const q = useQuery({
    queryKey: ['workspace_card_progress', normalizedIds],
    queryFn: () => fetchCardProgress(normalizedIds),
    enabled: normalizedIds.length > 0,
  });
  const map = q.data;
  const progressOf = useMemo(
    () => (id: string): number | null => map?.get(id) ?? null,
    [map],
  );
  return {
    progressOf,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/** Semua Goal (terbaru dulu). */
export function useGoals() {
  const q = useQuery({
    queryKey: ['goals'],
    queryFn: listGoals,
  });

  return {
    goals: (q.data ?? []) as GoalWithKpiCount[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Satu Goal. Hanya fetch saat id terisi. */
export function useGoal(id: string) {
  const q = useQuery({
    queryKey: ['goal', id],
    queryFn: () => getGoal(id),
    enabled: !!id,
  });

  return {
    goal: q.data as Goal | undefined,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Strategy di bawah satu Goal. Hanya fetch saat goalId terisi DAN `enabled` (lazy: child tree
 * Workspace baru di-fetch saat baris Goal di-expand — jumlah Strategy collapsed pakai embedded count).
 */
export function useStrategies(goalId: string, enabled = true) {
  const q = useQuery({
    queryKey: ['strategies', goalId],
    queryFn: () => listStrategies(goalId),
    enabled: !!goalId && enabled,
  });

  return {
    strategies: (q.data ?? []) as Strategy[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Initiative di bawah satu Strategy. Hanya fetch saat strategyId terisi DAN `enabled` (lazy:
 * dipakai oleh StrategySubRow di Workspace tree 3-level — fetch saat user expand baris KPI).
 */
export function useInitiatives(strategyId: string, enabled = true) {
  const q = useQuery({
    queryKey: ['initiatives', strategyId],
    queryFn: () => listInitiatives(strategyId),
    enabled: !!strategyId && enabled,
  });

  return {
    initiatives: (q.data ?? []) as Initiative[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Action Plan di bawah satu Initiative. `enabled` opsional untuk lazy-fetch di tree
 * (default true agar detail page yang memanggil tanpa arg tetap fetch begitu initiativeId ada).
 */
export function useInitiativeActionPlans(initiativeId: string, enabled = true) {
  const q = useQuery({
    queryKey: ['action_plans', 'initiative', initiativeId],
    queryFn: () => listActionPlans({ initiativeId }),
    enabled: !!initiativeId && enabled,
  });

  return {
    action_plans: (q.data ?? []) as ActionPlan[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Task di bawah satu Action Plan. Lazy-fetch di tree (WSA-01, level terbawah). */
export function useActionPlanTasks(actionPlanId: string, enabled = true) {
  const q = useQuery({
    queryKey: ['tasks', 'action_plan', actionPlanId],
    queryFn: () => listTasks(actionPlanId),
    enabled: !!actionPlanId && enabled,
  });

  return {
    tasks: (q.data ?? []) as TaskWithPeople[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Resolusi pic_id → PersonRef (untuk prefill picker dengan PIC induk / PIC tersimpan). */
export function usePerson(id: string | null | undefined) {
  const q = useQuery({
    queryKey: ['person', id],
    queryFn: () => getPersonRef(id),
    enabled: !!id,
  });
  return { person: (q.data ?? null) as PersonRef };
}

/** Strategy template di bawah satu Goal Template (untuk isian Target di Wizard). */
export function useStrategyTemplates(goalTemplateId: string) {
  const q = useQuery({
    queryKey: ['strategy_templates', goalTemplateId],
    queryFn: () => listStrategyTemplates(goalTemplateId),
    enabled: !!goalTemplateId,
  });

  return {
    items: (q.data ?? []) as StrategyTemplate[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

/** Daftar template Goal. */
export function useGoalTemplates() {
  const q = useQuery({
    queryKey: ['goal_templates'],
    queryFn: listGoalTemplates,
  });

  return {
    templates: (q.data ?? []) as GoalTemplate[],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}

// ---------------------------------------------------------------- actions

/** Aksi tulis Goal: create, activate, applyTemplate, restore. */
export function useGoalActions() {
  const qc = useQueryClient();

  const createM = useMutation({
    mutationFn: (input: NewGoal) => createGoal(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });

  const activateM = useMutation({
    mutationFn: (id: string) => activateGoal(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['goal', id] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  const applyTemplateM = useMutation({
    mutationFn: (args: {
      goalTemplateId: string;
      picId: string;
      periodStart: string;
      periodEnd: string;
      targets?: Record<string, string>;
    }) => applyGoalTemplate(args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });

  const restoreM = useMutation({
    mutationFn: (goalId: string) => restoreGoalTemplateItems(goalId),
    onSuccess: (_data, goalId) => {
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      qc.invalidateQueries({ queryKey: ['strategies', goalId] });
    },
  });

  return {
    create: (input: NewGoal) => createM.mutateAsync(input),
    activate: (id: string) => activateM.mutateAsync(id),
    applyTemplate: (args: {
      goalTemplateId: string;
      picId: string;
      periodStart: string;
      periodEnd: string;
      targets?: Record<string, string>;
    }) => applyTemplateM.mutateAsync(args),
    restore: (goalId: string) => restoreM.mutateAsync(goalId),
    isPending:
      createM.isPending || activateM.isPending || applyTemplateM.isPending || restoreM.isPending,
    activatePending: activateM.isPending,
    restorePending: restoreM.isPending,
  };
}

// ---------------------------------------------------------------- Strategy Target Breakdown (S2)

/** Baris breakdown periode untuk satu Strategy. Hanya fetch saat strategyId terisi. */
export function useStrategyBreakdown(strategyId: string) {
  const q = useQuery({
    queryKey: ['strategy_breakdown', strategyId],
    queryFn: () => listStrategyBreakdown(strategyId),
    enabled: !!strategyId,
  });
  return {
    rows: (q.data ?? []) as BreakdownRow[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Aksi tulis Target Breakdown Strategy: replace atomik (Σ=100% per Q dan per Q-bulan). */
export function useStrategyBreakdownActions(strategyId: string) {
  const qc = useQueryClient();
  const replaceM = useMutation({
    mutationFn: (args: Omit<ReplaceArgs, 'strategyId'>) =>
      replaceStrategyBreakdown({ ...args, strategyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategy_breakdown', strategyId] });
    },
  });
  return {
    replace: (args: Omit<ReplaceArgs, 'strategyId'>) => replaceM.mutateAsync(args),
    isPending: replaceM.isPending,
  };
}

/** Aksi tulis Strategy di bawah satu Goal: create, activate. */
export function useStrategyActions(goalId: string) {
  const qc = useQueryClient();

  const createM = useMutation({
    mutationFn: (input: NewStrategy) => createStrategy(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      qc.invalidateQueries({ queryKey: ['strategies', goalId] });
      // Anak baru → total anak Goal berubah → capaian Goal (orb) bisa berubah.
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  const activateM = useMutation({
    mutationFn: (id: string) => activateStrategy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategies', goalId] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  return {
    create: (input: NewStrategy) => createM.mutateAsync(input),
    activate: (id: string) => activateM.mutateAsync(id),
    isPending: createM.isPending || activateM.isPending,
  };
}

// ---------------------------------------------------------------- Fase 6: Development Workspace

/** Semua Development Area (terbaru dulu). Query key: ['development_areas']. */
export function useDevelopmentAreas() {
  const q = useQuery({
    queryKey: ['development_areas'],
    queryFn: listDevelopmentAreas,
  });
  return {
    developmentAreas: (q.data ?? []) as DevelopmentAreaWithProblemCount[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Problem Statement di bawah satu Development Area. */
export function useProblemStatements(developmentAreaId: string, enabled = true) {
  const q = useQuery({
    queryKey: ['problem_statements', developmentAreaId],
    queryFn: () => listProblemStatements(developmentAreaId),
    enabled: !!developmentAreaId && enabled,
  });
  return {
    problemStatements: (q.data ?? []) as ProblemStatement[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/**
 * Action Plan di bawah satu Problem Statement (jalur Development).
 * Lazy: dipakai oleh ProblemStatementSubRow di Workspace tree 3-level (Stage 1 B′).
 */
export function useProblemStatementActionPlans(problemStatementId: string, enabled = true) {
  const q = useQuery({
    queryKey: ['action_plans', 'problem_statement', problemStatementId],
    queryFn: () => listActionPlans({ problemStatementId }),
    enabled: !!problemStatementId && enabled,
  });
  return {
    action_plans: (q.data ?? []) as ActionPlan[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Aksi tulis Development Area. */
export function useDevelopmentAreaActions() {
  const qc = useQueryClient();
  const createM = useMutation({
    mutationFn: (input: NewDevelopmentArea) => createDevelopmentArea(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['development_areas'] });
    },
  });
  const activateM = useMutation({
    mutationFn: (id: string) => activateDevelopmentArea(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['development_area', id] });
      qc.invalidateQueries({ queryKey: ['development_areas'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });
  return {
    create: (input: NewDevelopmentArea) => createM.mutateAsync(input),
    activate: (id: string) => activateM.mutateAsync(id),
    isPending: createM.isPending || activateM.isPending,
    activatePending: activateM.isPending,
  };
}

/** Aksi tulis Problem Statement di bawah satu Development Area. */
export function useProblemStatementActions(developmentAreaId: string) {
  const qc = useQueryClient();
  const createM = useMutation({
    mutationFn: (input: NewProblemStatement) => createProblemStatement(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['development_area', developmentAreaId] });
      qc.invalidateQueries({ queryKey: ['development_areas'] });
      qc.invalidateQueries({ queryKey: ['problem_statements', developmentAreaId] });
      // MC-? — invalidasi MBR compliance DA agar indikator Kelengkapan Perencanaan refresh.
      qc.invalidateQueries({ queryKey: ['mbr_compliance', 'development_area', developmentAreaId] });
      // Anak baru → capaian Development Area (orb) bisa berubah.
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });
  const activateM = useMutation({
    mutationFn: (id: string) => activateProblemStatement(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['problem_statement', id] });
      qc.invalidateQueries({ queryKey: ['problem_statements', developmentAreaId] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });
  return {
    create: (input: NewProblemStatement) => createM.mutateAsync(input),
    activate: (id: string) => activateM.mutateAsync(id),
    isPending: createM.isPending || activateM.isPending,
    activatePending: activateM.isPending,
  };
}

/** Aksi tulis Initiative di bawah satu Strategy: create, activate. */
export function useInitiativeActions(strategyId: string) {
  const qc = useQueryClient();

  const createM = useMutation({
    mutationFn: (input: NewInitiative) => createInitiative(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['initiatives', strategyId] });
      // Strategy & Goal punya embedded count anak → wajib refresh agar badge tidak basi.
      // Tidak ada goalId di scope; pakai prefix.
      qc.invalidateQueries({ queryKey: ['strategies'] });
      qc.invalidateQueries({ queryKey: ['goal'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  const activateM = useMutation({
    mutationFn: (id: string) => activateInitiative(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['initiatives', strategyId] });
      qc.invalidateQueries({ queryKey: ['strategies'] });
      qc.invalidateQueries({ queryKey: ['goal'] });
      qc.invalidateQueries({ queryKey: ['workspace_card_progress'] });
    },
  });

  return {
    create: (input: NewInitiative) => createM.mutateAsync(input),
    activate: (id: string) => activateM.mutateAsync(id),
    isPending: createM.isPending || activateM.isPending,
  };
}
