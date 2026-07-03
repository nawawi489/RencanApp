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

describe('WORKSPACE_KIND_BORDER (spec §6.4–6.8, 5px kiri)', () => {
  it('mapping warna border kiri per kategori', () => {
    expect(WORKSPACE_KIND_BORDER.goal).toBe('#1877f2');
    expect(WORKSPACE_KIND_BORDER.kpi_area).toBe('#b76b00');
    expect(WORKSPACE_KIND_BORDER.strategy).toBe('#6941c6');
    expect(WORKSPACE_KIND_BORDER.initiative).toBe('#14845c');
    expect(WORKSPACE_KIND_BORDER.action_plan).toBe('#145ebc');
    expect(WORKSPACE_KIND_BORDER.development_area).toBe('#0f766e');
    expect(WORKSPACE_KIND_BORDER.problem_statement).toBe('#c2410c');
  });
});

describe('TREE_LEVEL_INDENT (spec §8)', () => {
  it('level 0..5 → 0/12/16/20/24/28', () => {
    expect(TREE_LEVEL_INDENT[0]).toBe(0);
    expect(TREE_LEVEL_INDENT[1]).toBe(12);
    expect(TREE_LEVEL_INDENT[2]).toBe(16);
    expect(TREE_LEVEL_INDENT[3]).toBe(20);
    expect(TREE_LEVEL_INDENT[4]).toBe(24);
    expect(TREE_LEVEL_INDENT[5]).toBe(28);
  });
});
