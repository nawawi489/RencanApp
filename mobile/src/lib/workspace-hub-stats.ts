// UI-N-002 Stage 2 — Hub-card stats derivation. Zero query baru: agregat dari
// data yang sudah di-fetch oleh `useGoals` + `useDevelopmentAreas`.
//
// Hub-card lobby TIDAK menampilkan capaian numerik — hanya distribusi jumlah
// (Goal/DevArea total, children, dan berapa yang berstatus `active`). Capaian
// nyata per-card live di orb tree via RPC `workspace_card_progress`.
// Lihat wiki/concepts/workspace-hub-orb.md untuk keputusan desain.
import type { GoalWithKpiCount } from './goals';
import type { DevelopmentAreaWithProblemCount } from './development-areas';

export type HubStats = {
  /** Total card lvl-1 (Goal / DevArea). */
  parentCount: number;
  /** Total card lvl-2 turunan (Strategi / Problem Statement) — dari embedded count. */
  childCount: number;
  /** Card lvl-1 berstatus `active`. */
  activeCount: number;
};

export function derivePerformanceHubStats(goals: GoalWithKpiCount[]): HubStats {
  const childCount = goals.reduce((sum, g) => {
    const c = g.strategies?.[0]?.count ?? 0;
    return sum + (typeof c === 'number' ? c : 0);
  }, 0);
  const activeCount = goals.filter((g) => g.status === 'active').length;
  return {
    parentCount: goals.length,
    childCount,
    activeCount,
  };
}

export function deriveDevelopmentHubStats(
  devAreas: DevelopmentAreaWithProblemCount[],
): HubStats {
  const childCount = devAreas.reduce((sum, d) => {
    const c = d.problem_statements?.[0]?.count ?? 0;
    return sum + (typeof c === 'number' ? c : 0);
  }, 0);
  const activeCount = devAreas.filter((d) => d.status === 'active').length;
  return {
    parentCount: devAreas.length,
    childCount,
    activeCount,
  };
}
