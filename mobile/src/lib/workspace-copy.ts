// Label UI Fase 4 (Performance Workspace) + Fase 6 (Development Workspace) — TERKUNCI agar test merujuk
// konstanta, bukan literal (cegah churn). Status label planning card ada di goals.ts (PLANNING_STATUS_LABEL);
// jangan duplikasi di sini.

export const WS_COPY = {
  title: 'Workspace',
  subtitle: 'Performance — Goal, Strategi, Inisiatif, Rencana Aksi & Tugas.',
  sectionStrategis: 'Hierarki Strategis',
  // WSA-12 — CTA terkunci spec §6.3: "+ Goal" (bukan "+ Goal Baru").
  btnGoalBaru: '+ Goal',
  // WSA-12 — empty state terkunci spec §17. WS-05: Goal di-scope per TAHUN (Opsi A / PRD §11.1),
  // bukan per periode bulan/quarter — copy menyebut "tahun ini" agar jujur dgn perilaku tahunan.
  emptyGoalTitle: 'Belum ada Goal di tahun ini.',
  emptyGoalDescCan: 'Buat Goal pertama lewat Wizard, lalu pecah jadi Strategi, Inisiatif, dan Rencana Aksi.',
  emptyGoalDescView: 'Anda akan melihat Goal di sini begitu menjadi PIC atau Reviewer sebuah card.',
  // WSA-12 — toast periode-lewat terkunci spec §12.4 (satu kalimat, dipecah title/message untuk Alert).
  archivePeriodTitle: 'Periode ini sudah menjadi Archive',
  archivePeriodMsg: 'Card lama tetap bisa dibuka lewat Detail, tapi tidak bisa dibuat turunan baru.',
} as const;

function compactValue(value: string | null | undefined, fallback = 'belum ada') {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function compactJoin(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => !!part && part.trim().length > 0).join(' · ');
}

export const WS_TREE_COMPACT_COPY = {
  // "Aktif" dulu ambigu dgn status siklus-hidup card (draft/active/done/archived) — pembaca meta
  // membacanya sbg "status card = Aktif" padahal ini soal PERIODE. Status card pindah ke badge di
  // baris pill (lihat workspace-screen.tsx CompactHeaderPills), meta-row cukup soal periode.
  periodState: (past: boolean) => (past ? 'Periode lewat' : 'Periode berjalan'),
  target: (value: string | null | undefined) => `Target ${compactValue(value)}`,
  outcome: (value: string | null | undefined) => `Hasil ${compactValue(value)}`,
  risk: (value: string | null | undefined) => `Risiko ${compactValue(value)}`,
  impact: (value: string | null | undefined) => `Impact ${compactValue(value)}`,
  evidence: (value: string | null | undefined) => `Bukti ${compactValue(value)}`,
  contribution: (value: string | null | undefined) => `Kontribusi ${compactValue(value)}`,
  deadline: (value: string | null | undefined) => `Deadline ${compactValue(value)}`,
  reviewer: (value: string | null | undefined) => `Review ${compactValue(value)}`,
  needChild: (count: number | null | undefined, label: string) =>
    count == null ? `${label} belum dihitung` : count === 0 ? `Butuh 1 ${label}` : `${count} ${label}`,
  goalMeta: ({
    past,
    target,
  }: {
    past: boolean;
    target?: string | null | undefined;
  }) => [
    compactJoin([WS_TREE_COMPACT_COPY.periodState(past), WS_TREE_COMPACT_COPY.target(target)]),
  ],
  kpiMeta: ({
    past,
    target,
    outcome,
  }: {
    past: boolean;
    target?: string | null | undefined;
    outcome?: string | null | undefined;
  }) => [
    compactJoin([WS_TREE_COMPACT_COPY.periodState(past), WS_TREE_COMPACT_COPY.target(target)]),
    outcome ? WS_TREE_COMPACT_COPY.outcome(outcome) : null,
  ],
  initiativeMeta: ({
    past,
    contribution,
    risk,
  }: {
    past: boolean;
    contribution?: string | null | undefined;
    risk?: string | null | undefined;
  }) => [
    compactJoin([
      WS_TREE_COMPACT_COPY.periodState(past),
      WS_TREE_COMPACT_COPY.contribution(contribution),
    ]),
    risk ? WS_TREE_COMPACT_COPY.risk(risk) : null,
  ],
  actionPlanMeta: ({
    past,
    target,
  }: {
    past: boolean;
    target?: string | null | undefined;
  }) => [
    compactJoin([WS_TREE_COMPACT_COPY.periodState(past), WS_TREE_COMPACT_COPY.target(target)]),
    null,
  ],
  taskMeta: ({
    past,
    deadline,
    reviewer,
  }: {
    past: boolean;
    deadline?: string | null | undefined;
    reviewer?: string | null | undefined;
  }) => [
    WS_TREE_COMPACT_COPY.deadline(deadline),
    reviewer ? WS_TREE_COMPACT_COPY.reviewer(reviewer) : null,
  ],
  developmentAreaMeta: ({
    past,
  }: {
    past: boolean;
  }) => [
    WS_TREE_COMPACT_COPY.periodState(past),
  ],
  problemStatementMeta: ({
    past,
    impact,
    evidence,
  }: {
    past: boolean;
    impact?: string | null | undefined;
    evidence?: string | null | undefined;
  }) => [
    compactJoin([WS_TREE_COMPACT_COPY.periodState(past), WS_TREE_COMPACT_COPY.impact(impact)]),
    evidence ? WS_TREE_COMPACT_COPY.evidence(evidence) : null,
  ],
} as const;

/** UI-N-002 Stage 2 — Hub view (lobby) di tab Workspace. 2 hub-card + back-to-hub button. */
export const WS_HUB_COPY = {
  title: 'Workspace',
  // WSA-12 — section title kanan "2 ruang" (spec §4.1), menggantikan subtitle kalimat.
  sectionCount: '2 ruang',
  perf: {
    kicker: 'Performance',
    title: 'Target Kinerja',
    meta: 'Goal → Strategi → Inisiatif → Rencana Aksi → Tugas',
    // WSA-12 — tombol masuk visible = "Masuk" (spec §6.4 no.14); a11y label tetap
    // membedakan ruang agar test/aksesibilitas tak ambigu antar dua hub-card.
    enter: 'Masuk',
    enterA11y: 'Masuk Performance',
  },
  dev: {
    kicker: 'Development',
    title: 'Pembangunan Sistem',
    meta: 'Development Area → Problem Statement → Rencana Aksi → Tugas',
    enter: 'Masuk',
    enterA11y: 'Masuk Development',
  },
} as const;

/** WSA-05 / spec §5 — konten Help Modal `?` per ruang (terkunci spec). */
export const WS_HELP_COPY = {
  performance: {
    kind: 'Performance',
    title: 'Apa itu Performance Workspace?',
    question: 'Ruang mana yang dipakai untuk mengejar target kinerja?',
    description:
      'Performance Workspace berisi struktur eksekusi target perusahaan dari Goal sampai Tugas.',
    checks: [
      'Dipakai untuk target tahunan dan pecahan bulan/quarter.',
      'Fokus pada hasil terukur seperti omset, profit, customer, dan output.',
      'Masuk ke ruang ini untuk melihat turunan Goal dan pekerjaan aktif.',
    ],
  },
  development: {
    kind: 'Development',
    title: 'Apa itu Development Workspace?',
    question: 'Ruang mana yang dipakai untuk memperbaiki sistem kerja?',
    description:
      'Development Workspace berisi area perbaikan perusahaan, Problem Statement, Rencana Aksi, dan Tugas.',
    checks: [
      'Dipakai untuk membangun sistem, SOP, alur kerja, dan governance.',
      'Fokus pada masalah yang perlu dibereskan agar eksekusi lebih rapi.',
      'Masuk ke ruang ini untuk melihat perbaikan yang sedang berjalan.',
    ],
  },
} as const;

/** Label Development Workspace (Fase 6). */
export const WS_DEV_COPY = {
  subtitle: 'Development — Development Area, Problem Statement, Rencana Aksi & Tugas.',
  sectionDevAreas: 'Development Area',
  // WSA-12 — CTA terkunci spec §7.1: "+ Development Area" (bukan "…Baru").
  btnDevAreaBaru: '+ Development Area',
  /** Indikator count-only (PS per DA). */
  problemCount: (n: number) => `Problem Statement: ${n}`,
  // WSA-12 — empty state terkunci spec §17. WS-05: Development Area di-scope per TAHUN fokus
  // (mirror Goal) — copy menyebut "tahun ini" agar jujur dgn perilaku tahunan.
  emptyDevAreaTitle: 'Belum ada Development Area di tahun ini.',
  emptyDevAreaDescCan:
    'Buat Development Area pertama, lalu pecah jadi Problem Statement, Rencana Aksi, dan Tugas.',
  emptyDevAreaDescView:
    'Anda akan melihat Development Area di sini begitu menjadi PIC atau Reviewer sebuah card.',
} as const;
