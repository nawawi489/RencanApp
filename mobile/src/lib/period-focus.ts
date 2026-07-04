// Period Focus Engine (PRD V1.8.2 §7.6 / §7.7 / §11.2).
//
// Pure helpers — TIDAK menyentuh Date.now()/AsyncStorage/RN. Semua fungsi yang
// butuh "sekarang" menerima `now: Date` agar deterministik di test (sesuai aturan
// jest setup repo). State + persistence tinggal di providers/period-focus-provider.

import { WS_COPY } from './workspace-copy';

export type PeriodMode = 'month' | 'quarter';

export type PeriodFocus =
  | { mode: 'month'; year: number; month: number } // month 1..12
  | { mode: 'quarter'; year: number; quarter: number }; // quarter 1..4

export type CardPeriodStatus = 'past' | 'current' | 'future';

export type PeriodOption = {
  mode: PeriodMode;
  year: number;
  month?: number;
  quarter?: number;
  label: string;
  status: CardPeriodStatus;
};

// Index 0 sengaja kosong agar lookup pakai 1..12 / 1..4 langsung.
export const MONTH_LABELS_ID = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const QUARTER_LABELS_ID = ['', 'Q1', 'Q2', 'Q3', 'Q4'] as const;

export function quarterOfMonth(month: number): number {
  if (month < 1 || month > 12) throw new Error(`invalid month ${month}`);
  return Math.ceil(month / 3); // 1→1, 4→2, 7→3, 10→4
}

export function defaultFocus(now: Date): PeriodFocus {
  return { mode: 'month', year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function formatPeriodLabel(focus: PeriodFocus): string {
  if (focus.mode === 'month') return `${MONTH_LABELS_ID[focus.month]} ${focus.year}`;
  return `${QUARTER_LABELS_ID[focus.quarter]} ${focus.year}`;
}

/** Ruang Workspace — menentukan prefix breadcrumb (WSA-09, spec §6.2/§7.2). */
export type WorkspaceSpace = 'performance' | 'development';

const SPACE_BREADCRUMB_PREFIX: Record<WorkspaceSpace, string> = {
  performance: 'Goal',
  development: 'Development',
};

/**
 * Breadcrumb periode per ruang (spec §6.2 Performance / §7.2 Development):
 * "Goal 2026 · Q2 · Juni" (Performance, month) / "Development 2026 · Q2" (Development, quarter).
 * Default `performance` menjaga kompatibilitas pemanggil lama.
 */
export function periodBreadcrumb(
  focus: PeriodFocus,
  space: WorkspaceSpace = 'performance',
): string {
  const prefix = SPACE_BREADCRUMB_PREFIX[space];
  if (focus.mode === 'month') {
    const q = quarterOfMonth(focus.month);
    return `${prefix} ${focus.year} · ${QUARTER_LABELS_ID[q]} · ${MONTH_LABELS_ID[focus.month]}`;
  }
  return `${prefix} ${focus.year} · ${QUARTER_LABELS_ID[focus.quarter]}`;
}

/** Inclusive window [start..end]. End = last millisecond of the period. */
export function periodWindow(focus: PeriodFocus): { start: Date; end: Date } {
  if (focus.mode === 'month') {
    const start = new Date(focus.year, focus.month - 1, 1, 0, 0, 0, 0);
    const end = new Date(focus.year, focus.month, 0, 23, 59, 59, 999); // day 0 of next month = last day this month
    return { start, end };
  }
  const startMonthIdx = (focus.quarter - 1) * 3; // Q1→0, Q2→3, Q3→6, Q4→9 (zero-based)
  const start = new Date(focus.year, startMonthIdx, 1, 0, 0, 0, 0);
  const end = new Date(focus.year, startMonthIdx + 3, 0, 23, 59, 59, 999);
  return { start, end };
}

type CardDates = {
  period_start?: string | null;
  period_end?: string | null;
  start_date?: string | null;
  deadline?: string | null;
};

/**
 * Status kartu relatif ke periode fokus (PRD §7.7).
 * - 'past'    : card.end < window.start → redup, tambah turunan dikunci.
 * - 'future'  : card.start > window.end → belum dimulai (treat seperti current di S1; nanti dim juga jika diputuskan).
 * - 'current' : default (overlap atau kartu tanpa info tanggal).
 *
 * Aturan: kartu tanpa periode (mis. flat initiative tanpa periode) selalu 'current'.
 */
export function cardPeriodStatus(card: CardDates, focus: PeriodFocus): CardPeriodStatus {
  const win = periodWindow(focus);
  const startStr = card.period_start ?? card.start_date ?? null;
  const endStr = card.period_end ?? card.deadline ?? null;
  if (!startStr && !endStr) return 'current';
  if (endStr) {
    const end = parseDateOnly(endStr);
    if (end < win.start) return 'past';
  }
  if (startStr) {
    const start = parseDateOnly(startStr);
    if (start > win.end) return 'future';
  }
  return 'current';
}

// Tanggal dari DB datang sebagai "YYYY-MM-DD" (kolom `date`). Parse di local TZ
// supaya batasan periode (start-of-day local) konsisten lintas timezone tester.
function parseDateOnly(s: string): Date {
  // Bila string sudah ISO dgn waktu/zona, biarkan Date constructor menangani.
  if (s.length > 10) return new Date(s);
  const [y, m, d] = s.split('-').map((v) => Number(v));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function isSameFocus(a: PeriodFocus, b: PeriodFocus): boolean {
  if (a.mode !== b.mode || a.year !== b.year) return false;
  if (a.mode === 'month' && b.mode === 'month') return a.month === b.month;
  if (a.mode === 'quarter' && b.mode === 'quarter') return a.quarter === b.quarter;
  return false;
}

export function enumerateMonths(year: number, now: Date): PeriodOption[] {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const status: CardPeriodStatus =
      year < currentYear || (year === currentYear && m < currentMonth)
        ? 'past'
        : year === currentYear && m === currentMonth
          ? 'current'
          : 'future';
    return { mode: 'month' as const, year, month: m, label: MONTH_LABELS_ID[m], status };
  });
}

export function enumerateQuarters(year: number, now: Date): PeriodOption[] {
  const currentYear = now.getFullYear();
  const currentQ = quarterOfMonth(now.getMonth() + 1);
  return Array.from({ length: 4 }, (_, i) => {
    const q = i + 1;
    const status: CardPeriodStatus =
      year < currentYear || (year === currentYear && q < currentQ)
        ? 'past'
        : year === currentYear && q === currentQ
          ? 'current'
          : 'future';
    return { mode: 'quarter' as const, year, quarter: q, label: QUARTER_LABELS_ID[q], status };
  });
}

/**
 * Tampilkan Alert Archive (spec §12.4 / PRD §7.7) saat user menekan "+" tambah turunan
 * pada card yang periode-nya past relatif fokus.
 *
 * `alertImpl` injectable agar pure di test — default `react-native` Alert.alert.
 */
type AlertFn = (title: string, message?: string) => void;

export function showPastPeriodAlert(alertImpl?: AlertFn): void {
  // WSA-12 — copy terkunci spec §12.4.
  const title = WS_COPY.archivePeriodTitle;
  const msg = WS_COPY.archivePeriodMsg;
  if (alertImpl) {
    alertImpl(title, msg);
    return;
  }
  // Lazy import agar pure-helper test (yang tidak butuh Alert) tetap bebas react-native.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Alert } = require('react-native') as { Alert: { alert: AlertFn } };
  Alert.alert(title, msg);
}

/** Validate persisted JSON shape. Kembalikan null jika invalid → caller fallback ke default. */
export function parseFocusJson(raw: string | null | undefined): PeriodFocus | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PeriodFocus> & Record<string, unknown>;
    if (!v || typeof v !== 'object') return null;
    if (typeof v.year !== 'number' || !Number.isFinite(v.year)) return null;
    if (v.mode === 'month') {
      const m = (v as { month?: unknown }).month;
      if (typeof m !== 'number' || m < 1 || m > 12) return null;
      return { mode: 'month', year: v.year, month: m };
    }
    if (v.mode === 'quarter') {
      const q = (v as { quarter?: unknown }).quarter;
      if (typeof q !== 'number' || q < 1 || q > 4) return null;
      return { mode: 'quarter', year: v.year, quarter: q };
    }
    return null;
  } catch {
    return null;
  }
}
