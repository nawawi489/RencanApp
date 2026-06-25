// Label UI Fase 4 (Performance Workspace) + Fase 6 (Development Workspace) — TERKUNCI agar test merujuk
// konstanta, bukan literal (cegah churn). Status label planning card ada di goals.ts (PLANNING_STATUS_LABEL);
// jangan duplikasi di sini.

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

/** Label dual-tab Workspace — Performance vs Development. Test wajib pakai konstanta. */
export const WS_TABS = {
  performance: 'Performance',
  development: 'Development',
} as const;

/** Label Development Workspace (Fase 6). */
export const WS_DEV_COPY = {
  subtitle: 'Development — Development Area, Problem Statement, Initiative & Action Plan.',
  sectionDevAreas: 'Development Area',
  btnDevAreaBaru: '+ Development Area Baru',
  /** Indikator count-only (PS per DA). */
  problemCount: (n: number) => `Problem Statement: ${n}`,
  problemCountUnknown: 'Problem Statement: —',
  emptyDevAreaTitle: 'Belum ada Development Area',
  emptyDevAreaDescCan:
    'Buat Development Area pertama, lalu pecah jadi Problem Statement, Initiative, dan Action Plan.',
  emptyDevAreaDescView:
    'Anda akan melihat Development Area di sini begitu menjadi PIC atau Reviewer sebuah card.',
} as const;
