// WSA-15 / spec §10 — Progress Orb tree variant: 50px, angka + "%", label bawah Capaian/Progress.
import { render, screen } from '@testing-library/react-native';

import { TreeProgressOrb, treeOrbColor } from '../ui';

describe('TreeProgressOrb', () => {
  it('menampilkan angka dengan "%" dan label bawah', async () => {
    await render(<TreeProgressOrb value={63} label="Progress" />);
    expect(screen.getByText('63%')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
  });

  it('label "Capaian" untuk Goal/KPI Area', async () => {
    await render(<TreeProgressOrb value={82} label="Capaian" />);
    expect(screen.getByText('Capaian')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
  });

  it('clamp 0..100 dan bulatkan', async () => {
    await render(<TreeProgressOrb value={150.6} label="Progress" />);
    expect(screen.getByText('100%')).toBeTruthy();
  });
});

describe('treeOrbColor (spec §10)', () => {
  it('good green ≥70', () => {
    expect(treeOrbColor(70)).toBe('#14845c');
    expect(treeOrbColor(100)).toBe('#14845c');
  });
  it('risk amber 35..69', () => {
    expect(treeOrbColor(35)).toBe('#b76b00');
    expect(treeOrbColor(69)).toBe('#b76b00');
  });
  it('bad red <35', () => {
    expect(treeOrbColor(0)).toBe('#c93434');
    expect(treeOrbColor(34)).toBe('#c93434');
  });
});
