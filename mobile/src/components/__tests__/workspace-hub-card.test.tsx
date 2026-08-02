// WorkspaceHubCard — regresi indikator ruang (2026-08-02).
//
// Riwayat elemen ini (jangan diputar balik tanpa membaca ketiganya):
//   1. Orb % = activeCount/parentCount → MENIPU (kepadatan aktivitas terbaca capaian).
//   2. Diganti chip "N/M {parent} aktif" (c7627a6) → jujur, tapi REDUNDAN: kedua angkanya
//      sudah tampil persis di stat row ({parent} dan {parent} aktif) tepat di bawahnya.
//   3. Sekarang: chip dihapus; `indicator` jadi SLOT yang diisi metrik asli tiap ruang —
//      Performance = ring capaian (RPC lapis `measured`), Development = bar "N/M selesai"
//      (Development Area selalu is_measured=false, jadi tak ada capaian jujur di sana).
// Bentuk sengaja BEDA antar-ruang supaya tak terulang "dua simbol identik, semantik beda".
// Lihat wiki/concepts/workspace-hub-orb.md.
import { render, screen } from '@testing-library/react-native';

import { WorkspaceHubCard, HubProgressOrb } from '../workspace-hub-card';
import type { HubStats } from '@/lib/workspace-hub-stats';

function makeStats(overrides: Partial<HubStats> = {}): HubStats {
  return { parentCount: 2, childCount: 4, activeCount: 2, ...overrides };
}

const baseProps = {
  kicker: 'PERFORMANCE',
  title: 'Target Kinerja',
  meta: 'Goal → Strategi → Inisiatif → Rencana Aksi → Tugas',
  enterLabel: 'Masuk Performance',
  parentStatLabel: 'Goal',
  childStatLabel: 'Strategi',
  activeStatLabel: 'Goal aktif',
  onEnter: () => {},
};

jest.setTimeout(30000);

describe('WorkspaceHubCard — chip redundan dihapus', () => {
  it('[hub·1] TIDAK merender chip "N/M aktif" (duplikat stat row)', async () => {
    await render(
      <WorkspaceHubCard {...baseProps} stats={makeStats({ activeCount: 2, parentCount: 2 })} />,
    );
    expect(screen.queryByText('2/2 Goal aktif')).toBeNull();
    expect(screen.queryByLabelText('2 dari 2 Goal aktif')).toBeNull();
  });

  it('[hub·2] stat row tetap sumber angka — label kolom-3 eksplisit (bukan "Aktif" telanjang)', async () => {
    await render(
      <WorkspaceHubCard {...baseProps} stats={makeStats({ parentCount: 3, childCount: 5, activeCount: 3 })} />,
    );
    // Prinsip owner QA 2026-07-24 ("label == value") diperluas: "Aktif" telanjang ambigu
    // (aktif Goal atau aktif Strategi?), makin terasa setelah chip penambal dihapus.
    expect(screen.getByText('Goal aktif')).toBeTruthy();
    expect(screen.queryByText('Aktif')).toBeNull();
  });

  it('[hub·3] indicator slot ter-render di kartu', async () => {
    await render(
      <WorkspaceHubCard
        {...baseProps}
        stats={makeStats()}
        indicator={<HubProgressOrb value={42} label="Capaian" periodLabel="2026" />}
      />,
    );
    expect(screen.getByLabelText(/Capaian 2026 42 persen/)).toBeTruthy();
  });
});

describe('HubProgressOrb — satu bentuk, label yang membedakan', () => {
  it('[orb·1] label "Capaian" → caption + a11y bertahun', async () => {
    await render(<HubProgressOrb value={4} label="Capaian" periodLabel="2026" />);
    expect(screen.getByText('Capaian 2026')).toBeTruthy();
    expect(screen.getByLabelText(/Capaian 2026 4 persen/)).toBeTruthy();
  });

  it('[orb·2] label "Progress" (jalur Development) → orb SAMA, caption beda', async () => {
    // Bentuk sengaja identik dgn Performance — persis pola tree (satu orb, label beda).
    await render(<HubProgressOrb value={50} label="Progress" periodLabel="2026" />);
    expect(screen.getByText('Progress 2026')).toBeTruthy();
    expect(screen.getByLabelText(/Progress 2026 50 persen/)).toBeTruthy();
    expect(screen.queryByText('Capaian 2026')).toBeNull();
  });

  it('[orb·3] value null → "—", BUKAN 0% (bedakan "tak ada data" dari "nol")', async () => {
    await render(<HubProgressOrb value={null} label="Capaian" periodLabel="2026" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByLabelText('Capaian 2026 belum tersedia')).toBeTruthy();
    expect(screen.queryByLabelText(/0 persen/)).toBeNull();
  });

  it('[orb·4] value 0 → tetap render 0%, bukan "—"', async () => {
    await render(<HubProgressOrb value={0} label="Progress" periodLabel="2026" />);
    expect(screen.getByLabelText(/Progress 2026 0 persen/)).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('[orb·5] tanpa periodLabel → caption polos', async () => {
    await render(<HubProgressOrb value={10} label="Capaian" />);
    expect(screen.getByText('Capaian')).toBeTruthy();
  });
});
