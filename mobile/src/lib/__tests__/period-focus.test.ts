// Period Focus Engine — pure helpers (PRD V1.8.2 §7.6 / §7.7).
// Deterministik: semua fungsi yang butuh "sekarang" menerima Date eksplisit.
import {
  cardPeriodStatus,
  defaultFocus,
  enumerateMonths,
  enumerateQuarters,
  formatPeriodLabel,
  isSameFocus,
  parseFocusJson,
  periodBreadcrumb,
  periodWindow,
  quarterOfMonth,
  type PeriodFocus,
} from '../period-focus';

describe('quarterOfMonth', () => {
  it.each([
    [1, 1], [2, 1], [3, 1],
    [4, 2], [5, 2], [6, 2],
    [7, 3], [8, 3], [9, 3],
    [10, 4], [11, 4], [12, 4],
  ])('%i → Q%i', (m, q) => {
    expect(quarterOfMonth(m)).toBe(q);
  });

  it('throws untuk bulan invalid', () => {
    expect(() => quarterOfMonth(0)).toThrow();
    expect(() => quarterOfMonth(13)).toThrow();
  });
});

describe('defaultFocus', () => {
  it('Juni 2026 → month=6 year=2026', () => {
    expect(defaultFocus(new Date(2026, 5, 15))).toEqual({ mode: 'month', year: 2026, month: 6 });
  });
});

describe('formatPeriodLabel + periodBreadcrumb', () => {
  it('Juni 2026 (month)', () => {
    const f: PeriodFocus = { mode: 'month', year: 2026, month: 6 };
    expect(formatPeriodLabel(f)).toBe('Juni 2026');
    expect(periodBreadcrumb(f)).toBe('Goal 2026 · Q2 · Juni');
  });
  it('Q3 2026 (quarter)', () => {
    const f: PeriodFocus = { mode: 'quarter', year: 2026, quarter: 3 };
    expect(formatPeriodLabel(f)).toBe('Q3 2026');
    expect(periodBreadcrumb(f)).toBe('Goal 2026 · Q3');
  });
  // WSA-09 — prefix breadcrumb ikut ruang: Performance→"Goal", Development→"Development".
  it('space Development → prefix "Development" (month)', () => {
    const f: PeriodFocus = { mode: 'month', year: 2026, month: 6 };
    expect(periodBreadcrumb(f, 'development')).toBe('Development 2026 · Q2 · Juni');
  });
  it('space Development → prefix "Development" (quarter)', () => {
    const f: PeriodFocus = { mode: 'quarter', year: 2026, quarter: 3 };
    expect(periodBreadcrumb(f, 'development')).toBe('Development 2026 · Q3');
  });
  it('space Performance eksplisit sama dgn default "Goal"', () => {
    const f: PeriodFocus = { mode: 'month', year: 2026, month: 6 };
    expect(periodBreadcrumb(f, 'performance')).toBe('Goal 2026 · Q2 · Juni');
  });
});

describe('periodWindow', () => {
  it('Juni 2026: 1 Jun 00:00 → 30 Jun 23:59', () => {
    const w = periodWindow({ mode: 'month', year: 2026, month: 6 });
    expect(w.start).toEqual(new Date(2026, 5, 1, 0, 0, 0, 0));
    expect(w.end).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
  });
  it('Februari 2025 (28 hari)', () => {
    const w = periodWindow({ mode: 'month', year: 2025, month: 2 });
    expect(w.end.getDate()).toBe(28);
  });
  it('Februari 2024 (leap, 29 hari)', () => {
    const w = periodWindow({ mode: 'month', year: 2024, month: 2 });
    expect(w.end.getDate()).toBe(29);
  });
  it('Q2 2026: 1 Apr 00:00 → 30 Jun 23:59', () => {
    const w = periodWindow({ mode: 'quarter', year: 2026, quarter: 2 });
    expect(w.start).toEqual(new Date(2026, 3, 1, 0, 0, 0, 0));
    expect(w.end).toEqual(new Date(2026, 5, 30, 23, 59, 59, 999));
  });
  it('Q4 2026: Okt–Des', () => {
    const w = periodWindow({ mode: 'quarter', year: 2026, quarter: 4 });
    expect(w.start.getMonth()).toBe(9); // Oct (0-based)
    expect(w.end.getMonth()).toBe(11); // Dec
    expect(w.end.getDate()).toBe(31);
  });
});

describe('cardPeriodStatus', () => {
  const focus: PeriodFocus = { mode: 'month', year: 2026, month: 6 };

  it('past: period_end < window.start', () => {
    expect(cardPeriodStatus({ period_start: '2026-01-01', period_end: '2026-05-31' }, focus)).toBe('past');
  });
  it('current: overlap', () => {
    expect(cardPeriodStatus({ period_start: '2026-04-01', period_end: '2026-09-30' }, focus)).toBe('current');
  });
  it('future: period_start > window.end', () => {
    expect(cardPeriodStatus({ period_start: '2026-07-01', period_end: '2026-12-31' }, focus)).toBe('future');
  });
  it('current: kartu tanpa tanggal sama sekali', () => {
    expect(cardPeriodStatus({}, focus)).toBe('current');
  });
  it('action_plan: start_date/deadline juga dikenali', () => {
    expect(cardPeriodStatus({ start_date: '2026-01-01', deadline: '2026-05-31' }, focus)).toBe('past');
    expect(cardPeriodStatus({ start_date: '2026-07-01', deadline: '2026-07-31' }, focus)).toBe('future');
  });
  it('past tepat di tepi: deadline 31 Mei 2026 vs fokus Jun 2026', () => {
    // 31 Mei 23:59:59 < 1 Jun 00:00 → past
    expect(cardPeriodStatus({ deadline: '2026-05-31' }, focus)).toBe('past');
  });
});

describe('enumerateMonths', () => {
  it('semua 12 bulan, current = bulan ini di tahun ini', () => {
    const list = enumerateMonths(2026, new Date(2026, 5, 15)); // Jun 2026
    expect(list).toHaveLength(12);
    expect(list[0].status).toBe('past'); // Jan
    expect(list[4].status).toBe('past'); // Mei
    expect(list[5].status).toBe('current'); // Jun
    expect(list[6].status).toBe('future'); // Jul
    expect(list[11].label).toBe('Desember');
  });
  it('tahun lampau → semua past', () => {
    const list = enumerateMonths(2024, new Date(2026, 5, 15));
    expect(list.every((o) => o.status === 'past')).toBe(true);
  });
  it('tahun mendatang → semua future', () => {
    const list = enumerateMonths(2028, new Date(2026, 5, 15));
    expect(list.every((o) => o.status === 'future')).toBe(true);
  });
});

describe('enumerateQuarters', () => {
  it('Q1–Q4: Jun 2026 → Q2 = current', () => {
    const list = enumerateQuarters(2026, new Date(2026, 5, 15));
    expect(list.map((o) => o.status)).toEqual(['past', 'current', 'future', 'future']);
    expect(list[1].label).toBe('Q2');
  });
});

describe('isSameFocus', () => {
  it('match', () => {
    expect(
      isSameFocus(
        { mode: 'month', year: 2026, month: 6 },
        { mode: 'month', year: 2026, month: 6 },
      ),
    ).toBe(true);
  });
  it('mode beda', () => {
    expect(
      isSameFocus(
        { mode: 'month', year: 2026, month: 6 },
        { mode: 'quarter', year: 2026, quarter: 2 },
      ),
    ).toBe(false);
  });
});

describe('parseFocusJson', () => {
  it('valid month', () => {
    expect(parseFocusJson('{"mode":"month","year":2026,"month":6}')).toEqual({
      mode: 'month',
      year: 2026,
      month: 6,
    });
  });
  it('valid quarter', () => {
    expect(parseFocusJson('{"mode":"quarter","year":2026,"quarter":2}')).toEqual({
      mode: 'quarter',
      year: 2026,
      quarter: 2,
    });
  });
  it('invalid → null (bukan throw)', () => {
    expect(parseFocusJson(null)).toBeNull();
    expect(parseFocusJson('')).toBeNull();
    expect(parseFocusJson('not-json')).toBeNull();
    expect(parseFocusJson('{"mode":"week"}')).toBeNull();
    expect(parseFocusJson('{"mode":"month","year":2026,"month":13}')).toBeNull();
    expect(parseFocusJson('{"mode":"month","year":"x","month":6}')).toBeNull();
    expect(parseFocusJson('{"mode":"quarter","year":2026,"quarter":5}')).toBeNull();
  });
});
