# Workspace Tree Mobile Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merapikan nested Workspace tree di mobile agar level dalam tidak mudah overflow, action row lebih ringkas, progress orb lebih proporsional, dan rerender subtree berkurang tanpa mengganti model navigasi satu layar.

**Architecture:** Pertahankan struktur route dan tree yang sudah ada di `mobile/src/screens/workspace-screen.tsx`, lalu optimalkan empat titik panas: skala indent + connector, ukuran orb level-aware, compaction action row, dan stabilitas render/query. Perubahan dibatasi ke Workspace tree surfaces dan hook progress-nya; rules bisnis, permission, dan gating tetap sama.

**Tech Stack:** Expo Router, React 19, React Native 0.85, `react-native-css`, NativeWind v5, TanStack Query, Jest + `@testing-library/react-native`, TypeScript.

---

## Planned File Structure

### Tree spacing and connector

- Modify: `mobile/src/components/workspace-kind-pill.tsx`
- Modify: `mobile/src/components/__tests__/workspace-kind-pill.test.tsx`
- Modify: `mobile/src/screens/workspace-screen.tsx`

Responsibilities:

- `workspace-kind-pill.tsx` tetap menjadi sumber kebenaran untuk skala indent tree
- `workspace-screen.tsx` menyesuaikan geometri `TreeConnector` agar cocok dengan indent baru
- Test pill mengunci nilai indent yang dipakai layout

### Orb sizing

- Modify: `mobile/src/components/ui.tsx`
- Modify: `mobile/src/components/__tests__/tree-progress-orb.test.tsx`
- Modify: `mobile/src/screens/workspace-screen.tsx`

Responsibilities:

- `ui.tsx` menambah varian ukuran orb tree tanpa mengubah semantics warna dan persen
- `workspace-screen.tsx` mengirim mode compact untuk row non-root
- Test orb mengunci angka, label, clamp, dan ukuran compact

### Action row and row rendering

- Modify: `mobile/src/screens/workspace-screen.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`

Responsibilities:

- `workspace-screen.tsx` merapikan `CardActionRow`, tombol leaf `⋯`, dan memo boundary untuk row tree
- `workspace.test.tsx` memastikan kontrol utama tetap muncul dan expand/collapse tetap jalan setelah compaction

### Progress hook stabilization

- Modify: `mobile/src/hooks/use-workspace.ts`
- Modify: `mobile/src/hooks/__tests__/use-workspace.test.ts`
- Modify: `mobile/src/screens/workspace-screen.tsx`

Responsibilities:

- `use-workspace.ts` mengurangi churn `sort()` dan menstabilkan `progressOf`
- `workspace-screen.tsx` menghindari array baru yang tidak perlu saat subtree collapsed
- Hook test mengunci query key dan perilaku `progressOf`

---

### Task 1: Kompres Indent Tree dan Retune Connector

**Files:**
- Modify: `mobile/src/components/workspace-kind-pill.tsx`
- Modify: `mobile/src/components/__tests__/workspace-kind-pill.test.tsx`
- Modify: `mobile/src/screens/workspace-screen.tsx`

- [ ] **Step 1: Tulis failing test untuk skala indent baru**

```tsx
// mobile/src/components/__tests__/workspace-kind-pill.test.tsx
import { TREE_LEVEL_INDENT, WORKSPACE_KIND_BORDER, WorkspaceKindPill } from '../workspace-kind-pill';

describe('TREE_LEVEL_INDENT', () => {
  it('mengompresi level 0..5 agar mobile level-dalam tidak lari terlalu kanan', () => {
    expect(TREE_LEVEL_INDENT).toEqual({
      0: 0,
      1: 12,
      2: 20,
      3: 28,
      4: 36,
      5: 44,
    });
  });
});

describe('WorkspaceKindPill', () => {
  it('tetap memakai warna border kategori yang ada', () => {
    expect(WORKSPACE_KIND_BORDER.goal).toBe('#1877f2');
    expect(WORKSPACE_KIND_BORDER.action_plan).toBe('#145ebc');
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/components/__tests__/workspace-kind-pill.test.tsx
```

Expected: FAIL karena `TREE_LEVEL_INDENT` masih bernilai `0,16,32,48,64,80`

- [ ] **Step 3: Ubah constant indent dan geometri connector**

```tsx
// mobile/src/components/workspace-kind-pill.tsx
export const TREE_LEVEL_INDENT: Record<0 | 1 | 2 | 3 | 4 | 5, number> = {
  0: 0,
  1: 12,
  2: 20,
  3: 28,
  4: 36,
  5: 44,
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
        left: -12,
        top: -8,
        width: 12,
        height: 28,
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
git commit -m "fix: compress workspace tree indentation"
```

### Task 2: Buat TreeProgressOrb Level-Aware

**Files:**
- Modify: `mobile/src/components/ui.tsx`
- Modify: `mobile/src/components/__tests__/tree-progress-orb.test.tsx`
- Modify: `mobile/src/screens/workspace-screen.tsx`

- [ ] **Step 1: Tulis failing test untuk orb compact**

```tsx
// mobile/src/components/__tests__/tree-progress-orb.test.tsx
import { render, screen } from '@testing-library/react-native';

import { TreeProgressOrb } from '../ui';

describe('TreeProgressOrb compact', () => {
  it('tetap menampilkan angka dan label pada mode compact', async () => {
    await render(<TreeProgressOrb value={41} label="Progress" compact />);
    expect(screen.getByText('41%')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
  });

  it('mode compact memakai ukuran visual lebih kecil', async () => {
    const view = await render(<TreeProgressOrb value={41} label="Progress" compact />);
    const ring = view.getByA11yLabel('Progress 41 persen');
    expect(ring.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minWidth: 42 })]));
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/components/__tests__/tree-progress-orb.test.tsx
```

Expected: FAIL karena prop `compact` belum ada

- [ ] **Step 3: Implementasikan orb compact dan pasang pada row non-root**

```tsx
// mobile/src/components/ui.tsx
export function TreeProgressOrb({
  value,
  label,
  compact = false,
}: {
  value: number;
  label: string;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const size = compact ? 42 : 50;
  const stroke = compact ? 5 : 6;
  const numberSize = compact ? 11 : 12;
  const labelSize = compact ? 9 : 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const color = treeOrbColor(pct);
  const { effective } = useThemePreference();
  const trackColor = effective === 'dark' ? '#334155' : '#d9e2ec';

  return (
    <View
      style={{ minWidth: size }}
      className="items-center gap-0.5"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${pct} persen`}
      accessibilityValue={{ now: pct, min: 0, max: 100 }}>
      <View style={{ width: size, height: size }} className="items-center justify-center">
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <Text className="font-extrabold text-black dark:text-white" style={{ fontSize: numberSize }}>
          {pct}%
        </Text>
      </View>
      <Text className="font-semibold text-neutral-500 dark:text-neutral-400" style={{ fontSize: labelSize }}>
        {label}
      </Text>
    </View>
  );
}
```

```tsx
// mobile/src/screens/workspace-screen.tsx
function TreeOrbCell({
  kind,
  value,
  compact = false,
}: {
  kind: string;
  value: number | null;
  compact?: boolean;
}) {
  if (value == null) {
    return (
      <View style={{ width: compact ? 42 : 50 }} className="items-center justify-center py-1">
        <Text className="text-base font-bold text-neutral-400 dark:text-neutral-500">—</Text>
      </View>
    );
  }
  return <TreeProgressOrb value={value} label={treeOrbLabel(kind)} compact={compact} />;
}

// pakai compact pada semua sub-row non-root
<TreeOrbCell kind="strategy" value={progress} compact />
<TreeOrbCell kind="kpi_area" value={progress} compact />
<TreeOrbCell kind="initiative" value={progress} compact />
<TreeOrbCell kind="action_plan" value={orbValue} compact />
<TreeOrbCell kind="problem_statement" value={progress} compact />
```

- [ ] **Step 4: Jalankan test kembali**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/components/__tests__/tree-progress-orb.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/ui.tsx mobile/src/components/__tests__/tree-progress-orb.test.tsx mobile/src/screens/workspace-screen.tsx
git commit -m "fix: compact workspace tree progress orb"
```

### Task 3: Ringkas Action Row dan Tambah Memo Boundary di Tree Rows

**Files:**
- Modify: `mobile/src/screens/workspace-screen.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`

- [ ] **Step 1: Tulis failing tests untuk kontrol tree setelah compaction**

```tsx
// mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
it('[tree-compact] tombol tambah tetap terlihat setelah row diringkas', async () => {
  mockCan.mockReturnValue(true);
  mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
  await renderScreen();

  expect(await screen.findByText('+ Goal')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Lihat KPI Area'));
  expect(screen.getByText('+ KPI Area')).toBeTruthy();
});

it('[tree-compact] expand/collapse tetap jalan setelah action row dipadatkan', async () => {
  mockUseGoals.mockReturnValue(goalsResult({ goals: [GOAL] }));
  mockUseKpiAreas.mockReturnValue(
    kpiResult({ kpiAreas: [{ id: 'k1', name: 'KPI Penjualan', status: 'active' }] }),
  );
  await renderScreen();

  fireEvent.press(screen.getByLabelText('Lihat KPI Area'));
  expect(await screen.findByText('KPI Penjualan')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Tutup'));
  await waitFor(() => expect(screen.queryByText('KPI Penjualan')).toBeNull());
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: FAIL bila label a11y atau struktur action row berubah belum sinkron

- [ ] **Step 3: Padatkan action row dan memoisasi row tree**

```tsx
// mobile/src/screens/workspace-screen.tsx
import { memo, useCallback, useMemo, useState, type PropsWithChildren, type ReactNode } from 'react';

const ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 6, right: 6 };

function CardActionRow({
  cardLabel,
  expanded,
  onToggleExpand,
  expandLabel,
  collapseLabel,
  onMore,
  past,
  onAdd,
  onAddPress,
  addDimmed,
  addLabel,
  addButtonLabel,
}: {
  cardLabel: string;
  expanded: boolean;
  onToggleExpand: () => void;
  expandLabel: string;
  collapseLabel: string;
  onMore: () => void;
  past: boolean;
  onAdd?: () => void;
  onAddPress?: () => void;
  addDimmed?: boolean;
  addLabel?: string;
  addButtonLabel?: string;
}) {
  const isDark = useThemePreference().effective === 'dark';

  return (
    <View className="flex-row items-center gap-1.5">
      <Pressable
        className="min-h-[44px] flex-1 flex-row items-center gap-1 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={expanded ? collapseLabel : expandLabel}
        accessibilityState={{ expanded }}
        onPress={onToggleExpand}>
        <Text className="text-xs font-semibold text-brand-dark dark:text-brand">
          {expanded ? collapseLabel : expandLabel}
        </Text>
        <Text className="text-xs text-brand-dark dark:text-brand">{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      <Pressable
        hitSlop={ACTION_HIT_SLOP}
        style={{ width: 32, height: 30, borderRadius: 999, backgroundColor: isDark ? '#171717' : '#f8fafc', borderWidth: 1, borderColor: isDark ? '#404040' : '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
        accessibilityRole="button"
        accessibilityLabel={`Aksi lain ${cardLabel}`}
        onPress={onMore}>
        <Text style={{ color: isDark ? '#ffffff' : '#0f172a', fontSize: 14, fontWeight: '900' }}>⋯</Text>
      </Pressable>
      {onAdd || onAddPress ? (
        <Pressable
          hitSlop={ACTION_HIT_SLOP}
          style={{
            minHeight: 30,
            borderRadius: 999,
            paddingHorizontal: 10,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: (addDimmed ?? past) ? (isDark ? '#404040' : '#e2e8f0') : (isDark ? '#1e3a8a' : '#cce2ff'),
            backgroundColor: (addDimmed ?? past) ? (isDark ? '#262626' : '#f1f5f9') : (isDark ? '#172554' : '#eef6ff'),
          }}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? 'Tambah turunan'}
          accessibilityState={{ disabled: addDimmed ?? past }}
          onPress={() => (onAddPress ? onAddPress() : past ? showPastPeriodAlert(cardLabel) : onAdd?.())}>
          <Text style={{ color: (addDimmed ?? past) ? (isDark ? '#6b7280' : '#94a3b8') : (isDark ? '#93c5fd' : '#145ebc'), fontSize: 11, fontWeight: '900' }}>
            {addButtonLabel ?? '+'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const GoalRow = memo(function GoalRow({ goal, progress }: { goal: GoalWithKpiCount; progress: number | null }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { kpiAreas, isLoading, isError, refetch } = useKpiAreas(goal.id, expanded);
  const { focus } = usePeriodFocus();
  const kpiIds = useMemo(() => (expanded ? kpiAreas.map((k) => k.id) : EMPTY_IDS), [expanded, kpiAreas]);
  const { progressOf: kpiProgressOf } = useCardProgress(kpiIds);
  const count = kpiCountOf(goal);
  const countLabel = count == null ? WS_COPY.kpiCountUnknown : WS_COPY.kpiCount(count);
  const past = cardPeriodStatus(goal, focus) === 'past';
  const canAddKpi = can('create_kpi_area');
  const rowActions = useTreeRowActions('goal', goal.id, goal.name);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const openGoal = useCallback(() => router.push(`/goal/${goal.id}` as Href), [router, goal.id]);
  const addKpi = useCallback(() => router.push(`/kpi-area/new?goalId=${goal.id}` as Href), [router, goal.id]);
});

// titik pakai yang wajib diganti di GoalRow
<TreeCardBody cardLabel={goal.name} onPress={openGoal}>
<CardActionRow
  cardLabel={goal.name}
  expanded={expanded}
  onToggleExpand={toggleExpanded}
  expandLabel="Lihat KPI Area"
  collapseLabel="Tutup"
  onMore={openMenu}
  past={past}
  onAdd={canAddKpi ? addKpi : undefined}
  addLabel={`Tambah KPI Area ke ${goal.name}`}
  addButtonLabel="+ KPI Area"
/>
<RowActionsMenu open={menuOpen} onClose={closeMenu} title={goal.name} items={rowActions} />
```

Terapkan pola callback stabil yang sama pada `KpiAreaSubRow`, `StrategySubRow`, `InitiativeSubRow`, `ProblemStatementSubRow`, `DevelopmentAreaRow`, dan `ActionPlanSubRow`:

- `setExpanded((v) => !v)` dipindah ke `toggleExpanded`
- `setMenuOpen(true)` dan `setMenuOpen(false)` dipindah ke `openMenu` / `closeMenu`
- `router.push(...)` untuk detail dan create route dipindah ke `useCallback`
- Tombol leaf `⋯` di `ActionPlanSubRow` disamakan ke ukuran `32x30` dan `ACTION_HIT_SLOP`

- [ ] **Step 4: Jalankan test workspace kembali**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/app/(app)/(tabs)/__tests__/workspace.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/workspace-screen.tsx mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx
git commit -m "refactor: compact workspace tree actions"
```

### Task 4: Stabilkan useCardProgress dan Array ID Tree

**Files:**
- Modify: `mobile/src/hooks/use-workspace.ts`
- Modify: `mobile/src/hooks/__tests__/use-workspace.test.ts`
- Modify: `mobile/src/screens/workspace-screen.tsx`

- [ ] **Step 1: Tulis failing test untuk sorting stabil dan query key**

```tsx
// mobile/src/hooks/__tests__/use-workspace.test.ts
it('[workspace-progress] menormalkan ids sekali dan query key tetap stabil', async () => {
  mockFetchCardProgress.mockResolvedValue(new Map([['a', 10], ['b', 30]]));
  const { wrapper } = makeWrapper();
  const { result } = await renderHook(() => useCardProgress(['b', 'a', 'b']), { wrapper });

  await waitFor(() => expect(result.current.progressOf('a')).toBe(10));
  expect(mockFetchCardProgress).toHaveBeenCalledWith(['a', 'b']);
  expect(result.current.progressOf('missing')).toBeNull();
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/hooks/__tests__/use-workspace.test.ts
```

Expected: FAIL karena hook saat ini masih meneruskan duplikasi ID dan `sort()` tiap render

- [ ] **Step 3: Implementasikan normalisasi ID dan hindari array baru saat collapsed**

```ts
// mobile/src/hooks/use-workspace.ts
import { useMemo } from 'react';

export function useCardProgress(ids: string[]) {
  const idsKey = ids.join('|');
  const normalizedIds = useMemo(() => [...new Set(ids)].sort(), [idsKey]);
  const q = useQuery({
    queryKey: ['workspace_card_progress', normalizedIds],
    queryFn: () => fetchCardProgress(normalizedIds),
    enabled: normalizedIds.length > 0,
  });
  const map = q.data;
  const progressOf = useMemo(
    () => (id: string): number | null => (map && map.has(id) ? (map.get(id) as number) : null),
    [map],
  );

  return {
    progressOf,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
```

```tsx
// mobile/src/screens/workspace-screen.tsx
const EMPTY_IDS: string[] = [];

const strategyIds = useMemo(
  () => (expanded ? strategies.map((s) => s.id) : EMPTY_IDS),
  [expanded, strategies],
);
const initiativeIds = useMemo(
  () => (expanded ? initiatives.map((i) => i.id) : EMPTY_IDS),
  [expanded, initiatives],
);
const kpiIds = useMemo(
  () => (expanded ? kpiAreas.map((k) => k.id) : EMPTY_IDS),
  [expanded, kpiAreas],
);
const problemStatementIds = useMemo(
  () => (expanded ? problemStatements.map((p) => p.id) : EMPTY_IDS),
  [expanded, problemStatements],
);
```

- [ ] **Step 4: Jalankan hook test, workspace test, type-check, dan lint**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/hooks/__tests__/use-workspace.test.ts src/app/(app)/(tabs)/__tests__/workspace.test.tsx src/components/__tests__/tree-progress-orb.test.tsx src/components/__tests__/workspace-kind-pill.test.tsx
npm.cmd run type-check
npm.cmd run lint
```

Expected:

- Semua test terkait Workspace PASS
- `type-check` selesai tanpa error
- `lint` selesai tanpa error baru

- [ ] **Step 5: Commit**

```bash
git add mobile/src/hooks/use-workspace.ts mobile/src/hooks/__tests__/use-workspace.test.ts mobile/src/screens/workspace-screen.tsx
git commit -m "perf: stabilize workspace tree progress rendering"
```

### Task 5: QA Manual Mobile Width dan Hand-off

**Files:**
- Modify: `wiki/log.md`

- [ ] **Step 1: Jalankan preview untuk QA manual**

Run:

```bash
cd mobile
npm.cmd run web
```

Expected: Dev server berjalan dan Workspace dapat dibuka di browser preview

- [ ] **Step 2: Verifikasi manual pada pane Performance dan Development**

Checklist:

```md
- Goal level 0 tetap terbaca dengan orb dan tombol + Goal / + KPI Area
- Strategy, Initiative, dan Action Plan tidak menabrak sisi kanan pada lebar mobile
- Problem Statement, Initiative, dan Action Plan di Development ikut compact
- Expand/collapse tiap level tetap bisa ditekan dengan nyaman
- State disabled untuk past-period / MBR guard tidak hilang
```

- [ ] **Step 3: Catat hasil rollout singkat**

```md
<!-- wiki/log.md -->
## 2026-07-03

- Workspace tree mobile optimization:
  - Indent tree dikompresi untuk level 1-5
  - Progress orb non-root dibuat compact
  - Action row tree diringkas tanpa menghilangkan label tambah
  - `useCardProgress` dinormalisasi agar subtree besar tidak mengulang kerja yang sama
```

- [ ] **Step 4: Commit**

```bash
git add wiki/log.md
git commit -m "docs: record workspace tree mobile optimization rollout"
```

---

## Self-Review

- Spec coverage: seluruh requirement inti di spec tercakup oleh Task 1-4; QA manual dan log rollout ada di Task 5
- Placeholder scan: tidak ada `TBD`, `TODO`, `implement later`, atau referensi langkah samar
- Type consistency: nama file, hook, dan simbol mengikuti kode saat ini (`TREE_LEVEL_INDENT`, `TreeProgressOrb`, `useCardProgress`, `GoalRow`, `KpiAreaSubRow`, `StrategySubRow`, `InitiativeSubRow`, `ActionPlanSubRow`)

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-03-workspace-tree-mobile-optimization.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
