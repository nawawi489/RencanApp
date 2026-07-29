// WorkspaceHubCard — regresi 2026-07-29:
// Orb % (activeCount/parentCount) di hub-card lobby menipu — angka besar terbaca sbg capaian.
// Diganti chip status "N/M {parent} aktif". Capaian nyata tetap di orb per-card tree
// (RPC workspace_card_progress). Lihat wiki/concepts/workspace-hub-orb.md.
import { render, screen } from '@testing-library/react-native';

import { WorkspaceHubCard } from '../workspace-hub-card';
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
  activeStatLabel: 'Aktif',
  onEnter: () => {},
};

jest.setTimeout(30000);

describe('WorkspaceHubCard — chip status aktif (ganti orb % ambigu)', () => {
  it('[chip·1] Performance activeCount 2 / parentCount 2 → chip "2/2 Goal aktif"', async () => {
    await render(<WorkspaceHubCard {...baseProps} stats={makeStats({ activeCount: 2, parentCount: 2 })} />);
    expect(screen.getByText('2/2 Goal aktif')).toBeTruthy();
    // A11y label pakai "dari" biar screen reader terbaca natural.
    expect(screen.getByLabelText('2 dari 2 Goal aktif')).toBeTruthy();
  });

  it('[chip·2] Development activeCount 1 / parentCount 2 → chip "1/2 Area aktif"', async () => {
    await render(
      <WorkspaceHubCard
        {...baseProps}
        space="development"
        kicker="DEVELOPMENT"
        title="Pembangunan Sistem"
        parentStatLabel="Area"
        childStatLabel="Problem Statement"
        stats={makeStats({ activeCount: 1, parentCount: 2, childCount: 5 })}
      />,
    );
    expect(screen.getByText('1/2 Area aktif')).toBeTruthy();
    expect(screen.getByLabelText('1 dari 2 Area aktif')).toBeTruthy();
  });

  it('[chip·3] parentCount 0 → fallback "Belum ada Goal" (tidak render "0/0" yg canggung)', async () => {
    await render(
      <WorkspaceHubCard {...baseProps} stats={makeStats({ parentCount: 0, childCount: 0, activeCount: 0 })} />,
    );
    expect(screen.getByText('Belum ada Goal')).toBeTruthy();
    expect(screen.getByLabelText('Belum ada Goal')).toBeTruthy();
  });

  it('[chip·4] tidak render orb 72px lama; tidak ada label a11y "Capaian" di hub-card', async () => {
    await render(<WorkspaceHubCard {...baseProps} stats={makeStats({ activeCount: 2, parentCount: 2 })} />);
    // Orb ProgressOrb pakai accessibilityLabel `Capaian ${value} persen` — tak boleh ada di lobby.
    expect(screen.queryByLabelText(/Capaian \d+ persen/)).toBeNull();
  });
});
