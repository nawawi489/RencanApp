// WorkspaceHubCard — regresi FINDING-001 (design-review 2026-07-02):
// orbPercent 0–100 pernah dibagi 100 lagi sebelum masuk ProgressOrb → orb selalu render 0/1.
import { render, screen } from '@testing-library/react-native';

import { WorkspaceHubCard } from '../workspace-hub-card';
import type { HubStats } from '@/lib/workspace-hub-stats';

function makeStats(overrides: Partial<HubStats> = {}): HubStats {
  return { orbPercent: 68, parentCount: 2, childCount: 4, activeCount: 2, ...overrides };
}

const baseProps = {
  kicker: 'PERFORMANCE',
  title: 'Target Kinerja',
  meta: 'Goal → KPI Area → Initiative → ActionPlan → Action Plan',
  enterLabel: 'Masuk Performance',
  parentStatLabel: 'Goal',
  childStatLabel: 'KPI Area',
  activeStatLabel: 'Aktif',
  onEnter: () => {},
};

jest.setTimeout(30000);

describe('WorkspaceHubCard — orb percent', () => {
  it('[1] orbPercent 68 → orb menampilkan "68" (bukan 1 hasil pembagian ganda /100)', async () => {
    await render(<WorkspaceHubCard {...baseProps} stats={makeStats({ orbPercent: 68 })} />);
    expect(screen.getByText('68')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();
  });

  it('[2] orbPercent 100 → orb menampilkan "100"', async () => {
    await render(<WorkspaceHubCard {...baseProps} stats={makeStats({ orbPercent: 100 })} />);
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('[3] orbPercent null → fallback "—" tanpa angka misleading', async () => {
    await render(<WorkspaceHubCard {...baseProps} stats={makeStats({ orbPercent: null })} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
