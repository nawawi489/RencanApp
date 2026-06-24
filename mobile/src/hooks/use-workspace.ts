// Hooks Fase 4 — Workspace (Goal → KPI Area → Strategy → Initiative). Pemanggil tipis di atas
// @/lib/goals, @/lib/kpi-areas, @/lib/strategies, @/lib/cards. Query keys TERKUNCI (lihat kontrak):
// ['goals'], ['goal', id], ['kpi_areas', goalId], ['strategies', kpiAreaId], ['initiatives','flat'],
// ['goal_templates']. Mutasi meng-invalidate key terkait; mutateAsync melempar agar error propagate.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listInitiatives, type Initiative } from '@/lib/cards';
import {
  activateGoal,
  applyGoalTemplate,
  createGoal,
  getGoal,
  listGoalTemplates,
  listGoals,
  restoreGoalTemplateItems,
  type GoalTemplate,
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

/** Initiative datar (tanpa Strategy). */
export function useFlatInitiatives() {
  const q = useQuery({
    queryKey: ['initiatives', 'flat'],
    queryFn: () => listInitiatives({ strategyId: null }),
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
    }) => applyTemplateM.mutateAsync(args),
    restore: (goalId: string) => restoreM.mutateAsync(goalId),
    isPending:
      createM.isPending || activateM.isPending || applyTemplateM.isPending || restoreM.isPending,
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
