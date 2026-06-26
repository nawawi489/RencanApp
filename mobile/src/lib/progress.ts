// UI-G-001 — derivasi capaian (0–100) untuk header detail Goal/KPI/Strategy/Initiative/Action Plan.
// Murni di klien: angka indikatif berdasarkan status anak dan tidak menggantikan metrik server
// (Repeat Compliance untuk AP repeat tetap dipakai apa adanya — lihat `computeActionPlanProgress`).

type StatusItem = { status: string };

/** % child non-archived yang sudah `done`. Total 0 → 0 (orb tetap render, sublabel "Belum ada turunan"). */
export function ratioDoneOfChildren(children: StatusItem[]): number {
  const active = children.filter((c) => c.status !== 'archived');
  if (active.length === 0) return 0;
  const done = active.filter((c) => c.status === 'done').length;
  return Math.round((done / active.length) * 100);
}

/** Action Plan one-time: status-based heuristik (PRD eksekusi-loop). */
const ACTION_PLAN_STATUS_PROGRESS: Record<string, number> = {
  draft: 0,
  assigned: 10,
  in_progress: 50,
  revision: 30,
  submitted: 80,
  done: 100,
  archived: 0,
};

export function computeActionPlanProgress(args: {
  status: string;
  repeat: boolean;
  compliancePercent: number | null;
}): number {
  if (args.repeat) {
    return args.compliancePercent ?? 0;
  }
  return ACTION_PLAN_STATUS_PROGRESS[args.status] ?? 0;
}

/** Sublabel ringkas untuk orb (mis. "3/5 selesai" atau "Belum ada turunan"). */
export function childrenSublabel(children: StatusItem[]): string {
  const active = children.filter((c) => c.status !== 'archived');
  if (active.length === 0) return 'Belum ada turunan';
  const done = active.filter((c) => c.status === 'done').length;
  return `${done}/${active.length} selesai`;
}
