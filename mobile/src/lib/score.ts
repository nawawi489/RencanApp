// Semantik skor People — warna SELALU dipasangkan dengan label teks (a11y:
// jangan andalkan warna saja). Threshold dipakai bersama oleh ScoreBadge & ScoreLegend.

export type ScoreBand = 'on-track' | 'stable' | 'attention';

export const SCORE_THRESHOLD = { onTrack: 85, stable: 70 } as const;

/** Petakan skor (0–100) ke band semantik. */
export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_THRESHOLD.onTrack) return 'on-track';
  if (score >= SCORE_THRESHOLD.stable) return 'stable';
  return 'attention';
}

export const SCORE_LABEL: Record<ScoreBand, string> = {
  'on-track': 'On track',
  stable: 'Stabil',
  attention: 'Perlu perhatian',
};

export const SCORE_DESC: Record<ScoreBand, string> = {
  'on-track': 'konsisten di atas target',
  stable: 'sesuai ekspektasi',
  attention: 'di bawah target',
};

/** Rentang untuk legenda, mis. "≥ 85" / "70 – 84" / "< 70". */
export const SCORE_RANGE: Record<ScoreBand, string> = {
  'on-track': `≥ ${SCORE_THRESHOLD.onTrack}`,
  stable: `${SCORE_THRESHOLD.stable} – ${SCORE_THRESHOLD.onTrack - 1}`,
  attention: `< ${SCORE_THRESHOLD.stable}`,
};
