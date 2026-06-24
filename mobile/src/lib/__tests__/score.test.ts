import { SCORE_LABEL, SCORE_RANGE, scoreBand } from '../score';

describe('scoreBand', () => {
  it('≥85 = on-track', () => {
    expect(scoreBand(85)).toBe('on-track');
    expect(scoreBand(86)).toBe('on-track');
    expect(scoreBand(100)).toBe('on-track');
  });

  it('70–84 = stable', () => {
    expect(scoreBand(70)).toBe('stable');
    expect(scoreBand(78)).toBe('stable');
    expect(scoreBand(84)).toBe('stable');
  });

  it('<70 = attention', () => {
    expect(scoreBand(69)).toBe('attention');
    expect(scoreBand(0)).toBe('attention');
  });

  it('label & range konsisten dengan threshold', () => {
    expect(SCORE_LABEL['on-track']).toBe('On track');
    expect(SCORE_LABEL.attention).toBe('Perlu perhatian');
    expect(SCORE_RANGE['on-track']).toBe('≥ 85');
    expect(SCORE_RANGE.stable).toBe('70 – 84');
    expect(SCORE_RANGE.attention).toBe('< 70');
  });
});
