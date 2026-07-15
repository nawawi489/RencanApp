// KPI gap (0032, override PRD §18) — derivasi "% capaian vs target" untuk Strategi bertarget numerik.
// Pure: current = numeric_total approved (VIEW strategy_current_values) ÷ target_numeric.
// KPI tanpa target numerik (kualitatif) → hasTarget=false, tidak dihitung %.

export type KpiGap = {
  /** true bila target_numeric > 0 (KPI kuantitatif). */
  hasTarget: boolean;
  /** current/target*100, dibulatkan, ≥0 (bisa >100 bila lampaui target). null bila tanpa target. */
  percent: number | null;
  /** Sisa menuju target = max(0, target-current). 0 bila tercapai/lampaui. null bila tanpa target. */
  remaining: number | null;
  /** current ≥ target. */
  reached: boolean;
};

export function computeKpiGap(args: {
  targetNumeric: number | null | undefined;
  current: number;
}): KpiGap {
  const t = args.targetNumeric;
  if (t == null || t <= 0) {
    return { hasTarget: false, percent: null, remaining: null, reached: false };
  }
  const current = Number.isFinite(args.current) ? args.current : 0;
  const percent = Math.max(0, Math.round((current / t) * 100));
  const remaining = Math.max(0, t - current);
  return { hasTarget: true, percent, remaining, reached: current >= t };
}

/** Pemisah ribuan gaya id-ID (titik). Deterministik (tanpa Intl, aman di Hermes). */
export function groupThousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(Math.round(n)).toString();
  return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Label gap, mis. "kurang 1.060 customer" (prototype). Tanpa unit → "kurang 1.060". */
export function formatRemaining(remaining: number, unit: string | null | undefined): string {
  const n = groupThousands(remaining);
  return unit && unit.trim() ? `kurang ${n} ${unit.trim()}` : `kurang ${n}`;
}
