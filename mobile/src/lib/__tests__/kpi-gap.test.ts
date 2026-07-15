import { computeKpiGap, formatRemaining, groupThousands } from '../kpi-gap';

describe('computeKpiGap', () => {
  it('tanpa target numerik → hasTarget false (KPI kualitatif)', () => {
    expect(computeKpiGap({ targetNumeric: null, current: 10 })).toEqual({
      hasTarget: false,
      percent: null,
      remaining: null,
      reached: false,
    });
    expect(computeKpiGap({ targetNumeric: undefined, current: 0 }).hasTarget).toBe(false);
  });

  it('target 0 atau negatif → hasTarget false (cegah bagi-nol)', () => {
    expect(computeKpiGap({ targetNumeric: 0, current: 5 }).hasTarget).toBe(false);
    expect(computeKpiGap({ targetNumeric: -10, current: 5 }).hasTarget).toBe(false);
  });

  it('di bawah target → percent + remaining (prototype: kurang 1.060)', () => {
    const g = computeKpiGap({ targetNumeric: 5000, current: 3940 });
    expect(g).toEqual({ hasTarget: true, percent: 79, remaining: 1060, reached: false });
  });

  it('65% contoh', () => {
    expect(computeKpiGap({ targetNumeric: 1000, current: 650 })).toEqual({
      hasTarget: true,
      percent: 65,
      remaining: 350,
      reached: false,
    });
  });

  it('tercapai / lampaui → remaining 0, reached true, percent bisa >100', () => {
    expect(computeKpiGap({ targetNumeric: 100, current: 100 })).toEqual({
      hasTarget: true,
      percent: 100,
      remaining: 0,
      reached: true,
    });
    expect(computeKpiGap({ targetNumeric: 100, current: 120 })).toEqual({
      hasTarget: true,
      percent: 120,
      remaining: 0,
      reached: true,
    });
  });

  it('current non-finite → diperlakukan 0', () => {
    expect(computeKpiGap({ targetNumeric: 100, current: NaN })).toEqual({
      hasTarget: true,
      percent: 0,
      remaining: 100,
      reached: false,
    });
  });
});

describe('groupThousands', () => {
  it('pemisah ribuan gaya id-ID (titik)', () => {
    expect(groupThousands(1060)).toBe('1.060');
    expect(groupThousands(1000000)).toBe('1.000.000');
    expect(groupThousands(50)).toBe('50');
    expect(groupThousands(0)).toBe('0');
  });
});

describe('formatRemaining', () => {
  it('dengan unit', () => {
    expect(formatRemaining(1060, 'customer')).toBe('kurang 1.060 customer');
  });
  it('tanpa unit / unit kosong', () => {
    expect(formatRemaining(350, null)).toBe('kurang 350');
    expect(formatRemaining(350, '   ')).toBe('kurang 350');
  });
});
