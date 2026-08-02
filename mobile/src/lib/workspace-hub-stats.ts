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

/**
 * Rollup satu RUANG (Performance atau Development) untuk orb hub-card lobby.
 * SATU fungsi untuk kedua ruang — bedanya cuma `label`, persis pola `treeOrbLabel`
 * di tree ("Capaian" utk Goal/Strategi terukur, "Progress" utk sisanya).
 *
 * Bug `c7627a6` yang harus tetap tertutup adalah orb yang menampilkan KEPADATAN
 * (`activeCount/parentCount`) menyamar jadi capaian. "Capaian vs Progress" BUKAN
 * bug — itu yang tree lakukan tiap hari dengan satu bentuk orb + label berbeda.
 *
 * Aturan (mencerminkan cabang `goal_attainment` RPC satu tingkat ke atas):
 *   1. Populasi = status `active`/`done` saja (draft + archived dibuang).
 *   2. Bila ADA anak terukur → mean anak TERUKUR saja, label "Capaian".
 *      Anak tak-terukur DIKELUARKAN (bukan dihitung 0) — sama seperti guard
 *      `target_numeric > 0` di RPC. Merata-ratakan capaian dengan status-rollup
 *      akan mencampur dua semantik.
 *   3. Bila NOL anak terukur → mean SEMUA anak (homogen status-rollup),
 *      label "Progress". Inilah jalur Development: lapis `measured` RPC hanya
 *      punya cabang Goal & Strategy, jadi Development Area selalu
 *      `is_measured=false` → selalu berlabel "Progress".
 *   4. Tak ada nilai sama sekali → `null` → UI render '—'.
 *
 * `null` HANYA berarti "tak ada data" (kosong / gagal fetch / RLS), BUKAN 0%.
 * Mengikuti `TreeOrbCell`: kartu tak-terukur tetap merender orb berlabel
 * "Progress" — '—' dicadangkan untuk value null saja.
 * Clamp 0..100 tidak diulang di sini — RPC sudah clamp per kartu.
 */
export function deriveSpaceProgress(
  items: { id: string; status: string }[],
  progressOf: (id: string) => number | null,
  measuredOf: (id: string) => boolean,
): {
  value: number | null;
  label: 'Capaian' | 'Progress';
  measuredCount: number;
  population: number;
} {
  const population = items.filter((i) => i.status === 'active' || i.status === 'done');
  const mean = (xs: number[]) =>
    Math.round(xs.reduce((sum, x) => sum + x, 0) / xs.length);
  const valueOf = (subset: typeof population) =>
    subset.map((i) => progressOf(i.id)).filter((v): v is number => v != null);

  const measured = valueOf(population.filter((i) => measuredOf(i.id)));
  if (measured.length > 0) {
    return {
      value: mean(measured),
      label: 'Capaian',
      measuredCount: measured.length,
      population: population.length,
    };
  }
  const all = valueOf(population);
  return {
    value: all.length ? mean(all) : null,
    label: 'Progress',
    measuredCount: 0,
    population: population.length,
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
