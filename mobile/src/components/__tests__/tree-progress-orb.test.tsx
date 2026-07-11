// WSA-15 / spec §10 — Progress Orb tree variant: 50px, angka + "%", label bawah Capaian/Progress.
import { render, screen } from '@testing-library/react-native';

import { TREE_PROGRESS_ORB_COMPACT_SIZE, TreeProgressOrb, treeOrbColor } from '../ui';

describe('TreeProgressOrb', () => {
  it('menampilkan angka dengan "%" dan label bawah', async () => {
    await render(<TreeProgressOrb value={63} label="Progress" />);
    expect(screen.getByText('63%')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
  });

  it('label "Capaian" untuk Goal/Strategy', async () => {
    await render(<TreeProgressOrb value={82} label="Capaian" />);
    expect(screen.getByText('Capaian')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
  });

  it('clamp 0..100 dan bulatkan', async () => {
    await render(<TreeProgressOrb value={150.6} label="Progress" />);
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('tetap menampilkan angka dan label pada mode compact', async () => {
    await render(<TreeProgressOrb value={41} label="Progress" compact />);
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
  });

  it('mode compact memakai ukuran visual lebih kecil', async () => {
    const view = await render(<TreeProgressOrb value={41} label="Progress" compact />);
    const ring = view.getByLabelText('Progress 41 persen');
    expect(TREE_PROGRESS_ORB_COMPACT_SIZE).toBe(38);
    // react-native-css meratakan `style` menjadi objek tunggal (bukan array).
    const flat = Array.isArray(ring.props.style)
      ? Object.assign({}, ...ring.props.style)
      : ring.props.style;
    expect(flat).toEqual(expect.objectContaining({ minWidth: TREE_PROGRESS_ORB_COMPACT_SIZE }));
  });
});

describe('treeOrbColor (spec §10 + UI-S-W09)', () => {
  it('good green ≥70', () => {
    expect(treeOrbColor(70)).toBe('#14845c');
    expect(treeOrbColor(100)).toBe('#14845c');
  });
  it('risk amber 35..69', () => {
    expect(treeOrbColor(35)).toBe('#b76b00');
    expect(treeOrbColor(69)).toBe('#b76b00');
  });
  it('bad red 1..34', () => {
    expect(treeOrbColor(1)).toBe('#c93434');
    expect(treeOrbColor(34)).toBe('#c93434');
  });
  it('neutral 0 (UI-S-W09): 0% = "belum mulai", bukan kondisi buruk', () => {
    expect(treeOrbColor(0)).toBe('#94a3b8');
  });
});
