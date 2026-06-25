// Label UI Fase 4 (Performance Workspace) — TERKUNCI agar test merujuk konstanta, bukan literal (cegah churn).
// Status label planning card ada di goals.ts (PLANNING_STATUS_LABEL); jangan duplikasi di sini.

export const WS_COPY = {
  title: 'Workspace',
  subtitle: 'Performance — Goal, KPI Area, Strategy, Initiative & Action Plan.',
  sectionStrategis: 'Hierarki Strategis',
  sectionTanpaGoal: 'Initiative Tanpa Goal',
  btnGoalBaru: '+ Goal Baru',
  /** Indikator count-only (bukan X/N — MBR kuantitatif ditunda Fase 5). */
  kpiCount: (n: number) => `KPI Area: ${n}`,
  /** Boundary: count error/undefined → '—', bukan '0'. */
  kpiCountUnknown: 'KPI Area: —',
  emptyGoalTitle: 'Belum ada Goal',
  emptyGoalDescCan: 'Buat Goal pertama lewat Wizard, lalu pecah jadi KPI Area, Strategy, dan Initiative.',
  emptyGoalDescView: 'Anda akan melihat Goal di sini begitu menjadi PIC atau Reviewer sebuah card.',
  emptyFlatInitiative: 'Tidak ada Initiative tanpa Goal.',
} as const;
