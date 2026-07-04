# Workspace Compact Card Anatomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah tree card Workspace di `Performance` dan `Development` menjadi compact card anatomy seperti referensi user, tetap inline satu layar, lebih hemat ruang, dan tetap mempertahankan perilaku tree saat ini.

**Architecture:** Pertahankan struktur data, lazy fetch, dan routing detail yang sudah ada di `mobile/src/screens/workspace-screen.tsx`, lalu ganti anatomi visual tiap tree card: header compact, cluster orb + chevron di kanan atas, meta 1-2 baris, dan action row `Detail` / `...` / `+ Child`. Implementasi dibagi ke token/layout helper, komponen card tree, copy/meta, lalu regression tests untuk memastikan perilaku expand/collapse, permission, MBR, dan past-period tidak rusak.

**Tech Stack:** Expo Router, React 19, React Native 0.85, `react-native-css`, NativeWind v5, TanStack Query, Jest + `@testing-library/react-native`, TypeScript.

---

## Planned File Structure

### Tree anatomy and screen composition

- Modify: `mobile/src/screens/workspace-screen.tsx`
- Modify: `mobile/src/components/ui.tsx`
- Modify: `mobile/src/components/workspace-kind-pill.tsx`
- Modify: `mobile/src/lib/workspace-copy.ts`

Responsibilities:

- `workspace-screen.tsx` tetap menjadi sumber kebenaran tree Performance dan Development
- `ui.tsx` tetap menjadi sumber kebenaran progress orb compact dan helper visual tree
- `workspace-kind-pill.tsx` tetap menjadi sumber kebenaran kategori dan spacing indent
- `workspace-copy.ts` menyimpan copy baru yang lebih ringkas untuk meta/card actions bila perlu

### Tests

- Modify: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`
- Modify: `mobile/src/components/__tests__/tree-progress-orb.test.tsx`
- Create or Modify: `mobile/src/components/__tests__/workspace-kind-pill.test.tsx`

Responsibilities:

- `workspace.test.tsx` mengunci anatomi compact, chevron toggle, dan action row
- `tree-progress-orb.test.tsx` mengunci ukuran compact yang dipakai card tree
- `workspace-kind-pill.test.tsx` mengunci indent helper dan identitas visual dasar

### Docs

- Modify: `wiki/log.md`

Responsibilities:

- Menyimpan catatan rollout untuk compact Workspace tree setelah implementasi selesai

---

### Task 1: Kunci Layout Tree Compact

**Files:**
- Modify: `mobile/src/components/workspace-kind-pill.tsx`
- Modify: `mobile/src/components/__tests__/workspace-kind-pill.test.tsx`
- Modify: `mobile/src/screens/workspace-screen.tsx`

- [ ] **Step 1: Tulis failing test untuk layout compact**

```tsx
// mobile/src/components/__tests__/workspace-kind-pill.test.tsx
import { TREE_LEVEL_INDENT, WORKSPACE_KIND_BORDER } from '../workspace-kind-pill';

describe('TREE_LEVEL_INDENT compact tree', () => {
  it('memakai indent kecil agar child card hampir selebar parent', () => {
    expect(TREE_LEVEL_INDENT).toEqual({
      0: 0,
      1: 10,
      2: 16,
      3: 22,
      4: 28,
      5: 34,
    });
  });
});

describe('WORKSPACE_KIND_BORDER', () => {
  it('tetap mempertahankan identitas border kategori', () => {
    expect(WORKSPACE_KIND_BORDER.goal).toBe('#1877f2');
    expect(WORKSPACE_KIND_BORDER.problem_statement).toBe('#c2410c');
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/components/__tests__/workspace-kind-pill.test.tsx
```

Expected: FAIL karena nilai `TREE_LEVEL_INDENT` masih memakai skala lama

- [ ] **Step 3: Implementasikan indent compact dan connector pendek**

```tsx
// mobile/src/components/workspace-kind-pill.tsx
export const TREE_LEVEL_INDENT: Record<0 | 1 | 2 | 3 | 4 | 5, number> = {
  0: 0,
  1: 10,
  2: 16,
  3: 22,
  4: 28,
  5: 34,
};
```

```tsx
// mobile/src/screens/workspace-screen.tsx
function TreeConnector() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -10,
        top: -6,
        width: 10,
        height: 22,
        borderLeftWidth: 2,
        borderBottomWidth: 2,
        borderColor: '#cfd8e5',
        borderBottomLeftRadius: 8,
      }}
    />
  );
}
```

- [ ] **Step 4: Jalankan test kembali**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/components/__tests__/workspace-kind-pill.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/workspace-kind-pill.tsx mobile/src/components/__tests__/workspace-kind-pill.test.tsx mobile/src/screens/workspace-screen.tsx
git commit -m "fix: compact workspace tree nesting layout"
```

### Task 2: Bentuk Compact Header dan Cluster Orb + Chevron

**Files:**
- Modify: `mobile/src/components/ui.tsx`
- Modify: `mobile/src/components/__tests__/tree-progress-orb.test.tsx`
- Modify: `mobile/src/screens/workspace-screen.tsx`

- [ ] **Step 1: Tulis failing test untuk orb compact dan toggle chevron**

```tsx
// mobile/src/components/__tests__/tree-progress-orb.test.tsx
import { render, screen } from '@testing-library/react-native';

import { TreeProgressOrb } from '../ui';

describe('TreeProgressOrb compact tree', () => {
  it('tetap menampilkan persen dan label pada mode compact', async () => {
    await render(<TreeProgressOrb value={68} label="Capaian" compact />);
    expect(screen.getByText('68%')).toBeTruthy();
    expect(screen.getByText('Capaian')).toBeTruthy();
  });
});
```

```tsx
// mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
it('[compact-header] chevron di kanan atas mengontrol expand KPI Area', async () => {
  mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
  mockUseKpiAreas.mockReturnValue(
    kpiResult({ kpiAreas: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
  );
  await renderScreen();

  fireEvent.press(screen.getByLabelText('Toggle KPI Area Tumbuhkan Revenue'));
  expect(await screen.findByText('KPI Penjualan')).toBeTruthy();
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/components/__tests__/tree-progress-orb.test.tsx src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: FAIL karena belum ada label toggle chevron baru dan cluster kanan atas belum dipakai

- [ ] **Step 3: Implementasikan cluster kanan atas dan helper toggle**

```tsx
// mobile/src/screens/workspace-screen.tsx
function TreeOrbCell({
  kind,
  value,
  compact = true,
}: {
  kind: string;
  value: number | null;
  compact?: boolean;
}) {
  if (value == null) {
    return (
      <View style={{ width: compact ? 42 : 50 }} className="items-center justify-center">
        <Text className="text-sm font-bold text-neutral-400 dark:text-neutral-500">—</Text>
      </View>
    );
  }

  return <TreeProgressOrb value={value} label={treeOrbLabel(kind)} compact={compact} />;
}

function TreeToggleButton({
  expanded,
  label,
  onPress,
}: {
  expanded: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#d9e3ef',
        backgroundColor: '#f8fafc',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '900' }}>{expanded ? '⌃' : '⌄'}</Text>
    </Pressable>
  );
}
```

```tsx
// potongan header row di workspace-screen.tsx
<View className="flex-row items-start gap-3">
  <View className="flex-1 gap-2">
    <View className="flex-row flex-wrap items-center gap-2">
      <WorkspaceKindPill kind="goal" />
      <Badge label="Juni 2026" tone="neutral" />
    </View>
    <Text className="text-xl font-bold text-black dark:text-white" numberOfLines={2}>
      {goal.name}
    </Text>
  </View>
  <View className="items-center gap-2">
    <TreeOrbCell kind="goal" value={progress} compact />
    <TreeToggleButton
      expanded={expanded}
      label={`Toggle KPI Area ${goal.name}`}
      onPress={toggleExpanded}
    />
  </View>
</View>
```

- [ ] **Step 4: Jalankan test kembali**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/components/__tests__/tree-progress-orb.test.tsx src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui.tsx mobile/src/components/__tests__/tree-progress-orb.test.tsx mobile/src/screens/workspace-screen.tsx mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
git commit -m "feat: add compact workspace header anatomy"
```

### Task 3: Ubah Action Row ke Pola Detail / ... / + Child

**Files:**
- Modify: `mobile/src/screens/workspace-screen.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`

- [ ] **Step 1: Tulis failing test untuk action row baru**

```tsx
// mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
it('[compact-actions] Goal row menampilkan Detail, ..., dan + KPI Area', async () => {
  mockCan.mockReturnValue(true);
  mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
  await renderScreen();

  expect(await screen.findByText('Detail')).toBeTruthy();
  expect(screen.getByLabelText(`Aksi lain ${GOAL.name}`)).toBeTruthy();
  expect(screen.getByText('+ KPI Area')).toBeTruthy();
});
```

```tsx
it('[compact-actions] Action Plan leaf tidak merender tombol tambah child', async () => {
  mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
  mockUseKpiAreas.mockReturnValue(
    kpiResult({ kpiAreas: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
  );
  mockUseStrategies.mockReturnValue(
    strategiesResult({ strategies: [{ id: 's1', name: 'Strategy A', status: 'active' }] }),
  );
  mockUseStrategyInitiatives.mockReturnValue(
    stratInitResult({ initiatives: [{ id: 'i1', name: 'Initiative A', status: 'active' }] }),
  );
  mockUseInitiativeActionPlans.mockReturnValue(
    actionPlanResult({ actionPlans: [{ id: 'ap1', name: 'Plan A', status: 'todo', repeat_setting: 'one_time' }] }),
  );

  await renderScreen();
  fireEvent.press(screen.getByLabelText('Toggle KPI Area Tumbuhkan Revenue'));
  fireEvent.press(await screen.findByLabelText('Toggle Strategy KPI Penjualan'));
  fireEvent.press(await screen.findByLabelText('Toggle Initiative Strategy A'));
  fireEvent.press(await screen.findByLabelText('Toggle Action Plan Initiative A'));

  expect(await screen.findByText('Plan A')).toBeTruthy();
  expect(screen.queryByText('+ Plan')).toBeNull();
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: FAIL karena row lama masih memakai affordance expand/collapse di action row

- [ ] **Step 3: Implementasikan action row baru**

```tsx
// mobile/src/screens/workspace-screen.tsx
function CompactActionRow({
  detailLabel,
  onDetail,
  onMore,
  addLabel,
  onAdd,
  disabled = false,
}: {
  detailLabel: string;
  onDetail: () => void;
  onMore: () => void;
  addLabel?: string;
  onAdd?: () => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={detailLabel}
        onPress={onDetail}
        className="min-h-[40px] rounded-full bg-brand px-4 items-center justify-center">
        <Text className="text-sm font-extrabold text-white">Detail</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={detailLabel.replace('Detail ', 'Aksi lain ')}
        onPress={onMore}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#d9e3ef',
          backgroundColor: '#f8fafc',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ color: '#475569', fontSize: 16, fontWeight: '900' }}>…</Text>
      </Pressable>
      {addLabel && onAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          accessibilityState={{ disabled }}
          onPress={onAdd}
          className="min-h-[40px] rounded-full border border-[#cce2ff] bg-[#eef6ff] px-4 items-center justify-center">
          <Text className="text-sm font-extrabold text-brand-dark">{addLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

```tsx
// contoh pakai di GoalRow
<CompactActionRow
  detailLabel={`Detail ${goal.name}`}
  onDetail={openGoal}
  onMore={openMenu}
  addLabel="+ KPI Area"
  onAdd={canAddKpi ? addKpi : undefined}
  disabled={past}
/>
```

- [ ] **Step 4: Jalankan test kembali**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/workspace-screen.tsx mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
git commit -m "refactor: switch workspace tree to compact action row"
```

### Task 4: Ringkas Meta per Card Type dan Samakan Ritme Performance/Development

**Files:**
- Modify: `mobile/src/screens/workspace-screen.tsx`
- Modify: `mobile/src/lib/workspace-copy.ts`
- Modify: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`

- [ ] **Step 1: Tulis failing test untuk meta compact**

```tsx
// mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
it('[compact-meta] Goal merender meta ringkas alih-alih count lama', async () => {
  mockUseGoals.mockReturnValue(
    goalsResult({
      goals: [
        {
          ...GOAL,
          target_result: 'Omset 48M',
          kpi_areas: [{ count: 2 }],
        },
      ],
    }),
  );
  await renderScreen();

  expect(await screen.findByText(/Target/)).toBeTruthy();
  expect(screen.queryByText('KPI Area: 2')).toBeNull();
});
```

```tsx
it('[compact-meta] Development merender pola compact yang setara', async () => {
  mockUseDevelopmentAreas.mockReturnValue(
    devResult({
      developmentAreas: [{ id: 'd1', name: 'Sales Ops', status: 'active', problem_statements: [{ count: 2 }] }],
    }),
  );
  await renderScreen('development');

  expect(await screen.findByText('Sales Ops')).toBeTruthy();
  expect(screen.queryByText(WS_DEV_COPY.problemCount(2))).toBeNull();
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: FAIL karena card masih merender pola meta lama

- [ ] **Step 3: Implementasikan meta compact**

```tsx
// mobile/src/lib/workspace-copy.ts
export const WS_TREE_COMPACT_COPY = {
  goalMeta: (period: string, target: string, actual: string) => `${period} · Target ${target} · Aktual ${actual}`,
  kpiMeta: (actual: string, target: string, gap: string) => `Aktual ${actual} / Target ${target} · Gap ${gap}`,
  strategyMeta: (contribution: string, risk: string) => `Kontribusi ${contribution} · Risiko: ${risk}`,
  initiativeMeta: (progress: string, context: string) => `${progress} · ${context}`,
  actionPlanMeta: (status: string, context: string) => `${status} · ${context}`,
  needChild: (count: number, label: string) => `Butuh ${count} ${label}`,
};
```

```tsx
// mobile/src/screens/workspace-screen.tsx
<Text className="text-[15px] leading-6 text-neutral-600 dark:text-neutral-300" numberOfLines={2}>
  {WS_TREE_COMPACT_COPY.goalMeta('Juni aktif', 'bulan 4M', '3.1M')}
</Text>
<Text className="text-[15px] leading-6 text-neutral-600 dark:text-neutral-300" numberOfLines={2}>
  {WS_TREE_COMPACT_COPY.needChild(1, 'Strategy')}
</Text>
```

- [ ] **Step 4: Jalankan test kembali**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/workspace-screen.tsx mobile/src/lib/workspace-copy.ts mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
git commit -m "feat: add compact workspace card meta"
```

### Task 5: Verifikasi Regresi, Type-Check, Lint, dan Log Rollout

**Files:**
- Modify: `wiki/log.md`

- [ ] **Step 1: Jalankan regression suite terarah**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/app/(app)/(tabs)/__tests__/workspace.test.tsx src/components/__tests__/tree-progress-orb.test.tsx src/components/__tests__/workspace-kind-pill.test.tsx
```

Expected: PASS

- [ ] **Step 2: Jalankan type-check dan lint**

Run:

```bash
cd mobile
npm.cmd run type-check
npm.cmd run lint
```

Expected:

- `type-check` selesai tanpa error
- `lint` selesai tanpa error baru

- [ ] **Step 3: Catat rollout di wiki**

```md
## 2026-07-03

- Workspace tree compact card anatomy:
  - nested card diubah ke pola compact yang hampir selebar parent
  - cluster orb + chevron dipindah ke kanan atas
  - action row diseragamkan ke `Detail`, `...`, dan `+ Child`
  - meta card diringkas ke 1-2 baris untuk Performance dan Development
```

- [ ] **Step 4: Commit**

```bash
git add wiki/log.md
git commit -m "docs: record workspace compact card rollout"
```

---

## Self-Review

- Spec coverage: anatomi compact, cluster orb + chevron, action row baru, meta compact, konsistensi Performance/Development, dan regression verification semuanya tercakup oleh Task 1-5
- Placeholder scan: tidak ada `TBD`, `TODO`, `implement later`, atau referensi “mirip task sebelumnya”
- Type consistency: simbol yang dipakai konsisten dengan kode eksisting dan rencana baru (`TREE_LEVEL_INDENT`, `TreeProgressOrb`, `TreeOrbCell`, `TreeToggleButton`, `CompactActionRow`, `WS_TREE_COMPACT_COPY`)

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-workspace-compact-card-anatomy.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
