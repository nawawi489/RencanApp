// UI-N-002 Stage 2 — Hub-card stats derivation. Zero query baru: agregat dari
// data yang sudah di-fetch oleh `useGoals` + `useDevelopmentAreas`.
//
// Orb % = jumlah card berstatus `active` ÷ total card non-arsip. Bukan progress
// children-aware (itu mahal). Cukup mewakili "kepadatan aktivitas" di lobby view.
import type { GoalWithKpiCount } from './goals';
import type { DevelopmentAreaWithProblemCount } from './development-areas';

export type HubStats = {
  /** Persen 0–100 (atau null bila belum ada data). */
  orbPercent: number | null;
  /** Total card lvl-1 (Goal / DevArea). */
  parentCount: number;
  /** Total card lvl-2 turunan (Strategi / Problem Statement) — dari embedded count. */
  childCount: number;
  /** Card lvl-1 berstatus `active`. */
  activeCount: number;
};

function ratioActive(items: { status: string }[]): number | null {
  const non = items.filter((i) => i.status !== 'archived');
  if (non.length === 0) return null;
  const active = non.filter((i) => i.status === 'active').length;
  return Math.round((active / non.length) * 100);
}

export function derivePerformanceHubStats(goals: GoalWithKpiCount[]): HubStats {
  const childCount = goals.reduce((sum, g) => {
    const c = g.strategies?.[0]?.count ?? 0;
    return sum + (typeof c === 'number' ? c : 0);
  }, 0);
  const activeCount = goals.filter((g) => g.status === 'active').length;
  return {
    orbPercent: ratioActive(goals),
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
    orbPercent: ratioActive(devAreas),
    parentCount: devAreas.length,
    childCount,
    activeCount,
  };
}
