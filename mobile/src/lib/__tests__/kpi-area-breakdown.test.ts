// KPI Area Target Breakdown — pure helpers (PRD V1.8.2 §12). Migrasi 0021.
jest.mock('../supabase', () => ({ supabase: {} }));

import {
  QUARTER_KEYS,
  MONTH_KEYS,
  quarterOfMonthKey,
  sumOf,
  indexQuarterRows,
  indexMonthRowsPerQuarter,
  type BreakdownRow,
} from '../kpi-area-breakdown';

function row(over: Partial<BreakdownRow>): BreakdownRow {
  return {
    id: 'x',
    organization_id: 'org',
    kpi_area_id: 'k',
    period_type: 'quarter',
    period_key: 'Q1',
    parent_quarter_key: null,
    contribution_pct: 0,
    reason: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as BreakdownRow;
}

describe('QUARTER_KEYS & MONTH_KEYS', () => {
  it('Q1..Q4 berurutan', () => {
    expect(QUARTER_KEYS).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });
  it('M01..M12 berurutan dengan zero-pad', () => {
    expect(MONTH_KEYS[0]).toBe('M01');
    expect(MONTH_KEYS[11]).toBe('M12');
    expect(MONTH_KEYS).toHaveLength(12);
  });
});

describe('quarterOfMonthKey', () => {
  it.each([
    ['M01', 'Q1'], ['M02', 'Q1'], ['M03', 'Q1'],
    ['M04', 'Q2'], ['M06', 'Q2'],
    ['M07', 'Q3'], ['M09', 'Q3'],
    ['M10', 'Q4'], ['M12', 'Q4'],
  ] as const)('%s → %s', (m, q) => {
    expect(quarterOfMonthKey(m)).toBe(q);
  });
});

describe('sumOf', () => {
  it('ignore NaN/Infinity', () => {
    expect(sumOf([10, 20, 30])).toBe(60);
    expect(sumOf([10, NaN, 20])).toBe(30);
    expect(sumOf([10, Infinity, 20])).toBe(30);
    expect(sumOf([])).toBe(0);
  });
});

describe('indexQuarterRows', () => {
  it('hanya ambil baris period_type quarter, kunci Qx', () => {
    const out = indexQuarterRows([
      row({ period_type: 'quarter', period_key: 'Q1', contribution_pct: 20 }),
      row({ period_type: 'quarter', period_key: 'Q3', contribution_pct: 40 }),
      row({ period_type: 'month', period_key: 'M01', parent_quarter_key: 'Q1', contribution_pct: 33 }),
    ]);
    expect(out).toEqual({ Q1: 20, Q2: 0, Q3: 40, Q4: 0 });
  });
});

describe('indexMonthRowsPerQuarter', () => {
  it('group baris month per parent_quarter_key', () => {
    const out = indexMonthRowsPerQuarter([
      row({ period_type: 'month', period_key: 'M01', parent_quarter_key: 'Q1', contribution_pct: 50 }),
      row({ period_type: 'month', period_key: 'M02', parent_quarter_key: 'Q1', contribution_pct: 30 }),
      row({ period_type: 'month', period_key: 'M07', parent_quarter_key: 'Q3', contribution_pct: 25 }),
      row({ period_type: 'quarter', period_key: 'Q1', contribution_pct: 25 }), // diabaikan
    ]);
    expect(out.Q1).toEqual({ M01: 50, M02: 30 });
    expect(out.Q3).toEqual({ M07: 25 });
    expect(out.Q2).toEqual({});
    expect(out.Q4).toEqual({});
  });
});
