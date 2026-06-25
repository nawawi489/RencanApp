// Hooks Fase 4 — Workspace (Goal → KPI Area → Strategy → Initiative). Pemanggil tipis di atas
// @/lib/goals, @/lib/kpi-areas, @/lib/strategies, @/lib/cards. Query keys TERKUNCI (lihat kontrak):
// ['goals'], ['goal', id], ['kpi_areas', goalId], ['strategies', kpiAreaId], ['initiatives','flat'],
// ['goal_templates']. Mutasi meng-invalidate key terkait; mutateAsync melempar agar error propagate.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getPersonRef, listInitiatives, type Initiative, type PersonRef } from '@/lib/cards';
import {
  activateGoal,
  applyGoalTemplate,
  createGoal,
  getGoal,
  listGoalTemplates,
  listGoals,
  listKpiAreaTemplates,
  restoreGoalTemplateItems,
  type GoalTemplate,
  type KpiAreaTemplate,
  type Goal,
  type GoalWithKpiCount,
  type NewGoal,
} from '@/lib/goals';
import {
  activateKpiArea,
  createKpiArea,
  listKpiAreas,
  type KpiArea,
  type NewKpiArea,
} from '@/lib/kpi-areas';
import {
  activateStrategy,
  createStrategy,
  listStrategies,
  type NewStrategy,
  type Strategy,
} from '@/lib/strategies';
import {
  activateDevelopmentArea,
  createDevelopmentArea,
  getDevelopmentArea,
  listDevelopmentAreas,
  type DevelopmentArea,
  type DevelopmentAreaWithProblemCount,
  type NewDevelopmentArea,
} from '@/lib/development-areas';
import {
  activateProblemStatement,
  createProblemStatement,
  getProblemStatement,
  listProblemStatements,
  type NewProblemStatement,
  type ProblemStatement,
} from '@/lib/problem-statements';

// ---------------------------------------------------------------- queries

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
 * KPI Area di bawah satu Goal. Hanya fetch saat goalId terisi DAN `enabled` (lazy: child tree
 * Workspace baru di-fetch saat baris Goal di-expand — jumlah KPI Area collapsed pakai embedded count).
 */
export function useKpiAreas(goalId: string, enabled = true) {
  const q = useQuery({
    queryKey: ['kpi_areas', goalId],
    queryFn: () => listKpiAreas(goalId),
    enabled: !!goalId && enabled,
  });

  return {
    kpiAreas: (q.data ?? []) as KpiArea[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Strategy di bawah satu KPI Area. Hanya fetch saat kpiAreaId terisi. */
export function useStrategies(kpiAreaId: string) {
  const q = useQuery({
    queryKey: ['strategies', kpiAreaId],
    queryFn: () => listStrategies(kpiAreaId),
    enabled: !!kpiAreaId,
  });

  return {
    strategies: (q.data ?? []) as Strategy[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Initiative datar (tanpa Strategy DAN tanpa Problem Statement). */
export function useFlatInitiatives() {
  const q = useQuery({
    queryKey: ['initiatives', 'flat'],
    queryFn: () => listInitiatives({ strategyId: null, problemStatementId: null }),
  });

  return {
    initiatives: (q.data ?? []) as Initiative[],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Initiative di bawah satu Strategy. Hanya fetch saat strategyId terisi. */
export function useStrategyInitiatives(strategyId: string) {
  const q = useQuery({
    queryKey: ['initiatives', 'strategy', strategyId],
    queryFn: () => listInitiatives({ strategyId }),
    enabled: !!strategyId,
  });

  return {
    initiatives: (q.data ?? []) as Initiative[],
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

/** KPI Area template di bawah satu Goal Template (untuk isian Target di Wizard). */
export function useKpiAreaTemplates(goalTemplateId: string) {
  const q = useQuery({
    queryKey: ['kpi_area_templates', goalTemplateId],
    queryFn: () => listKpiAreaTemplates(goalTemplateId),
    enabled: !!goalTemplateId,
  });

  return {
    items: (q.data ?? []) as KpiAreaTemplate[],
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
      qc.invalidateQueries({ queryKey: ['kpi_areas', goalId] });
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

/** Aksi tulis KPI Area di bawah satu Goal: create, activate. */
export function useKpiAreaActions(goalId: string) {
  const qc = useQueryClient();

  const createM = useMutation({
    mutationFn: (input: NewKpiArea) => createKpiArea(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      qc.invalidateQueries({ queryKey: ['kpi_areas', goalId] });
    },
  });

  const activateM = useMutation({
    mutationFn: (id: string) => activateKpiArea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi_areas', goalId] });
    },
  });

  return {
    create: (input: NewKpiArea) => createM.mutateAsync(input),
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

/** Satu Development Area. */
export function useDevelopmentArea(id: string) {
  const q = useQuery({
    queryKey: ['development_area', id],
    queryFn: () => getDevelopmentArea(id),
    enabled: !!id,
  });
  return {
    developmentArea: q.data as DevelopmentArea | undefined,
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

/** Satu Problem Statement. */
export function useProblemStatement(id: string) {
  const q = useQuery({
    queryKey: ['problem_statement', id],
    queryFn: () => getProblemStatement(id),
    enabled: !!id,
  });
  return {
    problemStatement: q.data as ProblemStatement | undefined,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}

/** Initiative di bawah satu Problem Statement (jalur Development). */
export function useProblemStatementInitiatives(problemStatementId: string) {
  const q = useQuery({
    queryKey: ['initiatives', 'problem_statement', problemStatementId],
    queryFn: () => listInitiatives({ problemStatementId }),
    enabled: !!problemStatementId,
  });
  return {
    initiatives: (q.data ?? []) as Initiative[],
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
    },
  });
  const activateM = useMutation({
    mutationFn: (id: string) => activateProblemStatement(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['problem_statement', id] });
      qc.invalidateQueries({ queryKey: ['problem_statements', developmentAreaId] });
    },
  });
  return {
    create: (input: NewProblemStatement) => createM.mutateAsync(input),
    activate: (id: string) => activateM.mutateAsync(id),
    isPending: createM.isPending || activateM.isPending,
    activatePending: activateM.isPending,
  };
}

/** Aksi tulis Strategy di bawah satu KPI Area: create, activate. */
export function useStrategyActions(kpiAreaId: string) {
  const qc = useQueryClient();

  const createM = useMutation({
    mutationFn: (input: NewStrategy) => createStrategy(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategies', kpiAreaId] });
    },
  });

  const activateM = useMutation({
    mutationFn: (id: string) => activateStrategy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategies', kpiAreaId] });
    },
  });

  return {
    create: (input: NewStrategy) => createM.mutateAsync(input),
    activate: (id: string) => activateM.mutateAsync(id),
    isPending: createM.isPending || activateM.isPending,
  };
}
