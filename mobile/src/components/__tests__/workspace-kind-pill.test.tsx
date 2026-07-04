// WSA-03 / spec §9 — Workspace Pill System: letter badge kategori (bukan icon lucide).
import { render, screen } from '@testing-library/react-native';

import {
  TREE_LEVEL_INDENT,
  WORKSPACE_KIND,
  WORKSPACE_KIND_BORDER,
  WorkspaceKindPill,
} from '../workspace-kind-pill';

describe('WorkspaceKindPill', () => {
  it('goal → letter "G" + label "Goal"', async () => {
    await render(<WorkspaceKindPill kind="goal" />);
    expect(screen.getByText('G')).toBeTruthy();
    expect(screen.getByText('Goal')).toBeTruthy();
  });

  it('action_plan → letter "AP" (dua huruf) + label "Action Plan"', async () => {
    await render(<WorkspaceKindPill kind="action_plan" />);
    expect(screen.getByText('AP')).toBeTruthy();
    expect(screen.getByText('Action Plan')).toBeTruthy();
  });

  it('mapping huruf per kategori sesuai spec §9', () => {
    const expected: Record<string, string> = {
      goal: 'G',
      kpi_area: 'K',
      strategy: 'S',
      initiative: 'I',
      action_plan: 'AP',
      development_area: 'D',
      problem_statement: 'P',
    };
    for (const [kind, letter] of Object.entries(expected)) {
      expect(WORKSPACE_KIND[kind as keyof typeof WORKSPACE_KIND].letter).toBe(letter);
    }
  });

  it('accessibilityLabel menyertakan nama kategori penuh', async () => {
    await render(<WorkspaceKindPill kind="problem_statement" />);
    expect(screen.getByLabelText('Kategori: Problem Statement')).toBeTruthy();
  });
});

describe('TREE_LEVEL_INDENT', () => {
  it('mengompresi level 0..5 agar mobile level-dalam tidak lari terlalu kanan', () => {
    expect(TREE_LEVEL_INDENT).toEqual({
      0: 0,
      1: 6,
      2: 6,
      3: 6,
      4: 6,
      5: 6,
    });
  });
});

describe('WorkspaceKindPill', () => {
  it('tetap memakai warna border kategori yang ada', () => {
    expect(WORKSPACE_KIND_BORDER.goal).toBe('#1877f2');
    expect(WORKSPACE_KIND_BORDER.problem_statement).toBe('#c2410c');
  });
});
