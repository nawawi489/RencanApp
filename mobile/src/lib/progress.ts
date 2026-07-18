// UI-G-001 — derivasi capaian (0–100) untuk header detail Goal/KPI/Inisiatif/Rencana Aksi/Tugas.
// Murni di klien: angka indikatif berdasarkan status anak dan tidak menggantikan metrik server
// (Repeat Compliance untuk AP repeat tetap dipakai apa adanya — lihat `computeTaskProgress`).

type StatusItem = { status: string };

/** % child non-archived yang sudah `done`. Total 0 → 0 (orb tetap render, sublabel "Belum ada turunan"). */
export function ratioDoneOfChildren(children: StatusItem[]): number {
  const active = children.filter((c) => c.status !== 'archived');
  if (active.length === 0) return 0;
  const done = active.filter((c) => c.status === 'done').length;
  return Math.round((done / active.length) * 100);
}

/** Tugas one-time: status-based heuristik (PRD eksekusi-loop). */
const ACTION_PLAN_STATUS_PROGRESS: Record<string, number> = {
  draft: 0,
  assigned: 10,
  in_progress: 50,
  revision: 30,
  submitted: 80,
  done: 100,
  archived: 0,
};

export function computeTaskProgress(args: {
  status: string;
  repeat: boolean;
  compliancePercent: number | null;
}): number {
  if (args.repeat) {
    return args.compliancePercent ?? 0;
  }
  return ACTION_PLAN_STATUS_PROGRESS[args.status] ?? 0;
}

/**
 * UI-S-GD1 — proksi "Progress kerja": % child non-archived yang sudah bergerak dari draft
 * (active/submitted/done/dst). Berpasangan dengan `ratioDoneOfChildren` ("Capaian hasil") di
 * kartu "Progress vs Capaian". Total 0 → 0.
 */
export function ratioActiveOfChildren(children: StatusItem[]): number {
  const active = children.filter((c) => c.status !== 'archived');
  if (active.length === 0) return 0;
  const moving = active.filter((c) => c.status !== 'draft').length;
  return Math.round((moving / active.length) * 100);
}

/**
 * Label bawah orb tree (spec §10 / WSA-15, data-driven per P1 attainment):
 * Goal/Strategi TERUKUR (isMeasured=true) → 'Capaian'; selain itu 'Progress'.
 * Kind tak dikenal → default 'Progress' (fail-safe; 'Capaian' punya makna khusus hasil).
 */
export function treeOrbLabel(kind: string, isMeasured = false): 'Capaian' | 'Progress' {
  return (kind === 'goal' || kind === 'strategy') && isMeasured ? 'Capaian' : 'Progress';
}

/**
 * Nilai orb Tugas leaf di tree. Reuse `computeTaskProgress` (satu sumber kebenaran).
 * Repeat AP butuh Repeat Compliance real; bila compliance belum ter-fetch (undefined/null) →
 * kembalikan null agar UI render '—' (prinsip no-misleading-numbers), BUKAN 0%.
 */
export function taskTreeProgress(args: {
  status: string;
  repeatSetting: string;
  compliancePercent?: number | null;
}): number | null {
  const repeat = args.repeatSetting === 'repeat';
  if (repeat && args.compliancePercent == null) return null;
  return computeTaskProgress({
    status: args.status,
    repeat,
    compliancePercent: args.compliancePercent ?? null,
  });
}

/** Sublabel ringkas untuk orb (mis. "3/5 selesai" atau "Belum ada turunan"). */
export function childrenSublabel(children: StatusItem[]): string {
  const active = children.filter((c) => c.status !== 'archived');
  if (active.length === 0) return 'Belum ada turunan';
  const done = active.filter((c) => c.status === 'done').length;
  return `${done}/${active.length} selesai`;
}

type StrategyItem = { status: string; target_numeric: number | null };

/** Sublabel cakupan Goal: "n/m Strategi terukur" (populasi active+done, O4). */
export function measuredStrategiesSublabel(strategies: StrategyItem[]): string {
  const eligible = strategies.filter((s) => s.status === 'active' || s.status === 'done');
  if (eligible.length === 0) return 'Belum ada turunan';
  const measured = eligible.filter((s) => s.target_numeric != null && s.target_numeric > 0).length;
  return `${measured}/${eligible.length} Strategi terukur`;
}
