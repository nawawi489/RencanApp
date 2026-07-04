# Workspace Full Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti `Workspace` dari nested tree inline menjadi flow full drill-down untuk `Performance` dan `Development` dengan route eksplisit, shell screen generik, serta back behavior yang konsisten.

**Architecture:** Implementasi memakai route Expo Router per level, satu shell `WorkspaceLevelScreen` yang dipakai ulang, dan utilitas route/config terpusat agar `Performance` serta `Development` tidak menduplikasi logika. Tree inline lama dipertahankan sementara selama migrasi, lalu dibersihkan setelah route baru, header, dan test navigasi stabil.

**Tech Stack:** Expo Router, React Native, react-native-css, NativeWind v5, TanStack Query, Jest, Testing Library React Native, TypeScript

---

## File Structure

Target struktur file setelah implementasi:

- Modify: `mobile/src/components/app-header.tsx`
  - Generalisasi deteksi sub-route `workspace/*` agar back affordance berlaku untuk semua level drill-down.
- Create: `mobile/src/lib/workspace-routes.ts`
  - Route builder terpusat untuk semua level `Performance` dan `Development`.
- Create: `mobile/src/lib/__tests__/workspace-routes.test.ts`
  - Verifikasi semua builder route menghasilkan path yang stabil.
- Create: `mobile/src/components/workspace-level-screen.tsx`
  - Shell screen generik: `AppHeader`, periode, context card, section header, CTA utama, list wrapper.
- Create: `mobile/src/components/workspace-entity-card.tsx`
  - Card ringkas per item level aktif.
- Create: `mobile/src/components/parent-context-card.tsx`
  - Kartu konteks parent untuk orientasi user.
- Create: `mobile/src/components/__tests__/workspace-level-screen.test.tsx`
  - Verifikasi shell dan card generik.
- Create: `mobile/src/screens/workspace-drilldown.tsx`
  - Screen-level composition dan config untuk semua level baru.
- Modify: `mobile/src/screens/workspace-screen.tsx`
  - Pertahankan `HubScreen`, cabut `PerformanceScreen`/`DevelopmentScreen` dari tree inline, lalu hapus helper tree yang tidak dipakai saat akhir migrasi.
- Modify: `mobile/src/hooks/use-workspace.ts`
  - Tambah helper screen-level yang cocok untuk fetch parent context dan child list per level.
- Modify/Create routes di `mobile/src/app/(app)/(tabs)/workspace/`
  - `performance.tsx`, `development.tsx`, dan sub-route baru per level.
- Modify: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`
  - Geser coverage dari expand/collapse ke navigasi drill-down.
- Modify: `mobile/src/components/__tests__/app-header.test.tsx`
  - Tambah coverage semua sub-route `workspace/*`.

## Task 1: Tambah Route Builder Workspace

**Files:**
- Create: `mobile/src/lib/workspace-routes.ts`
- Test: `mobile/src/lib/__tests__/workspace-routes.test.ts`

- [ ] **Step 1: Write the failing test**

Tambahkan test route builder baru di `mobile/src/lib/__tests__/workspace-routes.test.ts`:

```ts
import {
  workspaceDevelopmentRoute,
  workspaceDevelopmentProblemStatementsRoute,
  workspaceDevelopmentInitiativesRoute,
  workspaceDevelopmentActionPlansRoute,
  workspacePerformanceRoute,
  workspacePerformanceKpiAreasRoute,
  workspacePerformanceStrategiesRoute,
  workspacePerformanceInitiativesRoute,
  workspacePerformanceActionPlansRoute,
} from '@/lib/workspace-routes';

describe('workspace-routes', () => {
  it('membangun route Performance bertingkat secara eksplisit', () => {
    expect(workspacePerformanceRoute()).toBe('/workspace/performance');
    expect(workspacePerformanceKpiAreasRoute('goal-1')).toBe(
      '/workspace/performance/goals/goal-1/kpi-areas',
    );
    expect(workspacePerformanceStrategiesRoute('kpi-1')).toBe(
      '/workspace/performance/kpi-areas/kpi-1/strategies',
    );
    expect(workspacePerformanceInitiativesRoute('strategy-1')).toBe(
      '/workspace/performance/strategies/strategy-1/initiatives',
    );
    expect(workspacePerformanceActionPlansRoute('initiative-1')).toBe(
      '/workspace/performance/initiatives/initiative-1/action-plans',
    );
  });

  it('membangun route Development bertingkat secara eksplisit', () => {
    expect(workspaceDevelopmentRoute()).toBe('/workspace/development');
    expect(workspaceDevelopmentProblemStatementsRoute('da-1')).toBe(
      '/workspace/development/areas/da-1/problem-statements',
    );
    expect(workspaceDevelopmentInitiativesRoute('ps-1')).toBe(
      '/workspace/development/problem-statements/ps-1/initiatives',
    );
    expect(workspaceDevelopmentActionPlansRoute('initiative-1')).toBe(
      '/workspace/development/initiatives/initiative-1/action-plans',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/lib/__tests__/workspace-routes.test.ts
```

Expected: FAIL dengan error module `@/lib/workspace-routes` belum ada.

- [ ] **Step 3: Write minimal implementation**

Buat `mobile/src/lib/workspace-routes.ts`:

```ts
export const workspacePerformanceRoute = () => '/workspace/performance' as const;

export const workspacePerformanceKpiAreasRoute = (goalId: string) =>
  `/workspace/performance/goals/${goalId}/kpi-areas` as const;

export const workspacePerformanceStrategiesRoute = (kpiAreaId: string) =>
  `/workspace/performance/kpi-areas/${kpiAreaId}/strategies` as const;

export const workspacePerformanceInitiativesRoute = (strategyId: string) =>
  `/workspace/performance/strategies/${strategyId}/initiatives` as const;

export const workspacePerformanceActionPlansRoute = (initiativeId: string) =>
  `/workspace/performance/initiatives/${initiativeId}/action-plans` as const;

export const workspaceDevelopmentRoute = () => '/workspace/development' as const;

export const workspaceDevelopmentProblemStatementsRoute = (developmentAreaId: string) =>
  `/workspace/development/areas/${developmentAreaId}/problem-statements` as const;

export const workspaceDevelopmentInitiativesRoute = (problemStatementId: string) =>
  `/workspace/development/problem-statements/${problemStatementId}/initiatives` as const;

export const workspaceDevelopmentActionPlansRoute = (initiativeId: string) =>
  `/workspace/development/initiatives/${initiativeId}/action-plans` as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/lib/__tests__/workspace-routes.test.ts
```

Expected: PASS, 2 test route builder hijau.

- [ ] **Step 5: Commit**

```powershell
Set-Location d:\Projects\RencanApp
git add mobile/src/lib/workspace-routes.ts mobile/src/lib/__tests__/workspace-routes.test.ts
git commit -m "test: add workspace drill-down route builders"
```

## Task 2: Buat Shell Dan Card Generik Workspace

**Files:**
- Create: `mobile/src/components/workspace-level-screen.tsx`
- Create: `mobile/src/components/workspace-entity-card.tsx`
- Create: `mobile/src/components/parent-context-card.tsx`
- Test: `mobile/src/components/__tests__/workspace-level-screen.test.tsx`

- [ ] **Step 1: Write the failing test**

Tambahkan `mobile/src/components/__tests__/workspace-level-screen.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ParentContextCard } from '@/components/parent-context-card';
import { WorkspaceEntityCard } from '@/components/workspace-entity-card';
import { WorkspaceLevelScreen } from '@/components/workspace-level-screen';

jest.mock('@/components/app-header', () => ({
  AppHeader: ({ title }: { title?: string }) => title ?? null,
}));

describe('WorkspaceLevelScreen', () => {
  it('menampilkan parent context, CTA utama, dan daftar item level aktif', () => {
    const onPrimaryAction = jest.fn();
    const onPressItem = jest.fn();

    render(
      <WorkspaceLevelScreen
        title="KPI Area"
        primaryActionLabel="+ KPI Area"
        onPrimaryAction={onPrimaryAction}
        parentContext={
          <ParentContextCard
            kind="Goal"
            title="Naikkan Omset Q3 2026"
            statusLabel="Aktif"
            meta="KPI Area: 2"
          />
        }>
        <WorkspaceEntityCard
          kind="KPI Area"
          title="Akuisisi Customer Baru"
          statusLabel="Aktif"
          meta="Strategy: 3"
          progressLabel="0%"
          onPress={onPressItem}
          onOpenMenu={jest.fn()}
        />
      </WorkspaceLevelScreen>,
    );

    expect(screen.getByText('KPI Area')).toBeTruthy();
    expect(screen.getByText('Naikkan Omset Q3 2026')).toBeTruthy();
    expect(screen.getByText('+ KPI Area')).toBeTruthy();
    expect(screen.getByText('Akuisisi Customer Baru')).toBeTruthy();

    fireEvent.press(screen.getByText('+ KPI Area'));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Buka level Akuisisi Customer Baru'));
    expect(onPressItem).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/components/__tests__/workspace-level-screen.test.tsx
```

Expected: FAIL karena tiga komponen baru belum ada.

- [ ] **Step 3: Write minimal implementation**

Buat `mobile/src/components/parent-context-card.tsx`:

```tsx
import { Text, View } from 'react-native-css/components';

import { Badge } from '@/components/ui';

export function ParentContextCard({
  kind,
  title,
  statusLabel,
  meta,
}: {
  kind: string;
  title: string;
  statusLabel: string;
  meta?: string;
}) {
  return (
    <View className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-black">
      <View className="flex-row items-center gap-2">
        <Badge label={kind} tone="info" />
        <Badge label={statusLabel} tone="info" />
      </View>
      <Text className="mt-3 text-base font-bold text-black dark:text-white">{title}</Text>
      {meta ? (
        <Text className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{meta}</Text>
      ) : null}
    </View>
  );
}
```

Buat `mobile/src/components/workspace-entity-card.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native-css/components';

import { Badge } from '@/components/ui';

export function WorkspaceEntityCard({
  kind,
  title,
  statusLabel,
  meta,
  progressLabel,
  onPress,
  onOpenMenu,
}: {
  kind: string;
  title: string;
  statusLabel: string;
  meta?: string;
  progressLabel?: string;
  onPress: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <View className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-black">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Badge label={kind} tone="info" />
            <Badge label={statusLabel} tone="info" />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Buka level ${title}`}
            onPress={onPress}
            className="mt-3 active:opacity-70">
            <Text className="text-base font-bold text-black dark:text-white">{title}</Text>
            {meta ? (
              <Text className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{meta}</Text>
            ) : null}
          </Pressable>
        </View>
        <View className="items-end gap-2">
          {progressLabel ? (
            <Text className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
              {progressLabel}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${title}`}
            onPress={onOpenMenu}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="text-base font-black text-black dark:text-white">⋯</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
```

Buat `mobile/src/components/workspace-level-screen.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui';

export function WorkspaceLevelScreen({
  title,
  parentContext,
  primaryActionLabel,
  onPrimaryAction,
  children,
}: {
  title: string;
  parentContext?: ReactNode;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <AppHeader title={title} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {parentContext}
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-xl font-bold text-black dark:text-white">{title}</Text>
          {primaryActionLabel && onPrimaryAction ? (
            <Button label={primaryActionLabel} onPress={onPrimaryAction} />
          ) : null}
        </View>
        <View className="gap-3">{children}</View>
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/components/__tests__/workspace-level-screen.test.tsx
```

Expected: PASS, shell generik dan entity card dapat dirender.

- [ ] **Step 5: Commit**

```powershell
Set-Location d:\Projects\RencanApp
git add mobile/src/components/workspace-level-screen.tsx mobile/src/components/workspace-entity-card.tsx mobile/src/components/parent-context-card.tsx mobile/src/components/__tests__/workspace-level-screen.test.tsx
git commit -m "feat: add workspace drill-down shell components"
```

## Task 3: Implementasi Route Dan Screen Drill-Down Performance

**Files:**
- Create: `mobile/src/screens/workspace-drilldown.tsx`
- Modify: `mobile/src/hooks/use-workspace.ts`
- Modify: `mobile/src/app/(app)/(tabs)/workspace/performance.tsx`
- Create: `mobile/src/app/(app)/(tabs)/workspace/performance/goals/[goalId]/kpi-areas.tsx`
- Create: `mobile/src/app/(app)/(tabs)/workspace/performance/kpi-areas/[kpiAreaId]/strategies.tsx`
- Create: `mobile/src/app/(app)/(tabs)/workspace/performance/strategies/[strategyId]/initiatives.tsx`
- Create: `mobile/src/app/(app)/(tabs)/workspace/performance/initiatives/[initiativeId]/action-plans.tsx`
- Test: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`

- [ ] **Step 1: Write the failing test**

Tambahkan blok test baru di `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`:

```tsx
it('Performance drill-down: tap Goal membuka daftar KPI Area via push route eksplisit', async () => {
  mockUseGoals.mockReturnValue(
    goalsResult({
      goals: [{ id: 'g1', name: 'Naikkan Omset Q3 2026', status: 'active', kpi_areas: [{ count: 2 }] }],
    }),
  );

  await renderScreen('performance');
  fireEvent.press(screen.getByLabelText('Buka level Naikkan Omset Q3 2026'));

  expect(mockPush).toHaveBeenCalledWith('/workspace/performance/goals/g1/kpi-areas');
});

it('Performance KPI Area route merender context parent dan child list', async () => {
  mockUseKpiAreas.mockReturnValue(
    kpiResult({
      kpiAreas: [{ id: 'k1', name: 'Akuisisi Customer Baru', status: 'active' }],
    }),
  );

  mockSegments = ['(app)', '(tabs)', 'workspace', 'performance', 'goals', 'g1', 'kpi-areas'];

  const { PerformanceGoalKpiAreasScreen } = await import('@/screens/workspace-drilldown');
  render(<PerformanceGoalKpiAreasScreen />, { wrapper: wrapper() });

  expect(screen.getByText('KPI Area')).toBeTruthy();
  expect(screen.getByText('Akuisisi Customer Baru')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx
```

Expected: FAIL karena `PerformanceScreen` belum memakai route push drill-down dan screen route child belum tersedia.

- [ ] **Step 3: Write minimal implementation**

Tambahkan composer baru di `mobile/src/screens/workspace-drilldown.tsx`:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native-css/components';

import { ParentContextCard } from '@/components/parent-context-card';
import { WorkspaceEntityCard } from '@/components/workspace-entity-card';
import { WorkspaceLevelScreen } from '@/components/workspace-level-screen';
import {
  useGoals,
  useKpiAreas,
  useStrategies,
  useStrategyInitiatives,
  useInitiativeActionPlans,
} from '@/hooks/use-workspace';
import {
  workspacePerformanceActionPlansRoute,
  workspacePerformanceInitiativesRoute,
  workspacePerformanceKpiAreasRoute,
  workspacePerformanceStrategiesRoute,
} from '@/lib/workspace-routes';

export function PerformanceGoalsScreen() {
  const router = useRouter();
  const { goals } = useGoals();

  return (
    <WorkspaceLevelScreen title="Performance" primaryActionLabel="+ Goal" onPrimaryAction={() => router.push('/goal-wizard')}>
      {goals.map(goal => (
        <WorkspaceEntityCard
          key={goal.id}
          kind="Goal"
          title={goal.name}
          statusLabel="Aktif"
          meta={`KPI Area: ${goal.kpi_areas?.[0]?.count ?? '—'}`}
          onPress={() => router.push(workspacePerformanceKpiAreasRoute(goal.id))}
          onOpenMenu={() => {}}
        />
      ))}
    </WorkspaceLevelScreen>
  );
}

export function PerformanceGoalKpiAreasScreen() {
  const router = useRouter();
  const { goalId } = useLocalSearchParams<{ goalId: string }>();
  const { kpiAreas } = useKpiAreas(goalId);

  return (
    <WorkspaceLevelScreen
      title="KPI Area"
      parentContext={
        <ParentContextCard kind="Goal" title={goalId} statusLabel="Aktif" meta="Context Goal aktif" />
      }>
      {kpiAreas.map(item => (
        <WorkspaceEntityCard
          key={item.id}
          kind="KPI Area"
          title={item.name}
          statusLabel="Aktif"
          onPress={() => router.push(workspacePerformanceStrategiesRoute(item.id))}
          onOpenMenu={() => {}}
        />
      ))}
    </WorkspaceLevelScreen>
  );
}
```

Ubah `mobile/src/app/(app)/(tabs)/workspace/performance.tsx`:

```tsx
import { PerformanceGoalsScreen } from '@/screens/workspace-drilldown';

export default PerformanceGoalsScreen;
```

Buat route child pertama di `mobile/src/app/(app)/(tabs)/workspace/performance/goals/[goalId]/kpi-areas.tsx`:

```tsx
import { PerformanceGoalKpiAreasScreen } from '@/screens/workspace-drilldown';

export default PerformanceGoalKpiAreasScreen;
```

Lanjutkan pola yang sama untuk route `strategies`, `initiatives`, dan `action-plans` memakai screen exported dari `workspace-drilldown.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx
```

Expected: test Performance drill-down hijau; test lama yang rusak boleh tetap merah sampai task migrasi test selesai, tetapi blok baru ini harus sudah valid saat difilter.

- [ ] **Step 5: Commit**

```powershell
Set-Location d:\Projects\RencanApp
git add mobile/src/screens/workspace-drilldown.tsx mobile/src/hooks/use-workspace.ts mobile/src/app/\(app\)/\(tabs\)/workspace/performance.tsx mobile/src/app/\(app\)/\(tabs\)/workspace/performance
git commit -m "feat: add performance workspace drill-down routes"
```

## Task 4: Implementasi Route Dan Screen Drill-Down Development

**Files:**
- Modify: `mobile/src/screens/workspace-drilldown.tsx`
- Modify: `mobile/src/hooks/use-workspace.ts`
- Modify: `mobile/src/app/(app)/(tabs)/workspace/development.tsx`
- Create: `mobile/src/app/(app)/(tabs)/workspace/development/areas/[developmentAreaId]/problem-statements.tsx`
- Create: `mobile/src/app/(app)/(tabs)/workspace/development/problem-statements/[problemStatementId]/initiatives.tsx`
- Create: `mobile/src/app/(app)/(tabs)/workspace/development/initiatives/[initiativeId]/action-plans.tsx`
- Test: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`

- [ ] **Step 1: Write the failing test**

Tambahkan test Development di `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`:

```tsx
it('Development drill-down: tap Development Area membuka Problem Statement route eksplisit', async () => {
  mockUseDevelopmentAreas.mockReturnValue(
    devResult({
      developmentAreas: [{ id: 'da1', name: 'Performa Tim Sales', status: 'active', problem_statements: [{ count: 2 }] }],
    }),
  );

  await renderScreen('development');
  fireEvent.press(screen.getByLabelText('Buka level Performa Tim Sales'));

  expect(mockPush).toHaveBeenCalledWith('/workspace/development/areas/da1/problem-statements');
});

it('Development Problem Statement route merender child list', async () => {
  mockUseProblemStatements.mockReturnValue(
    psResult({
      problemStatements: [{ id: 'ps1', name: 'Prospek lama tidak ditindaklanjuti', status: 'active' }],
    }),
  );

  mockSegments = [
    '(app)',
    '(tabs)',
    'workspace',
    'development',
    'areas',
    'da1',
    'problem-statements',
  ];

  const { DevelopmentAreaProblemStatementsScreen } = await import('@/screens/workspace-drilldown');
  render(<DevelopmentAreaProblemStatementsScreen />, { wrapper: wrapper() });

  expect(screen.getByText('Problem Statement')).toBeTruthy();
  expect(screen.getByText('Prospek lama tidak ditindaklanjuti')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx
```

Expected: FAIL karena route Development child belum ada.

- [ ] **Step 3: Write minimal implementation**

Tambahkan screen Development ke `mobile/src/screens/workspace-drilldown.tsx`:

```tsx
import {
  workspaceDevelopmentActionPlansRoute,
  workspaceDevelopmentInitiativesRoute,
  workspaceDevelopmentProblemStatementsRoute,
} from '@/lib/workspace-routes';
import {
  useDevelopmentAreas,
  useProblemStatements,
  useProblemStatementInitiatives,
  useInitiativeActionPlans,
} from '@/hooks/use-workspace';

export function DevelopmentAreasScreen() {
  const router = useRouter();
  const { developmentAreas } = useDevelopmentAreas();

  return (
    <WorkspaceLevelScreen
      title="Development"
      primaryActionLabel="+ Development Area"
      onPrimaryAction={() => router.push('/development-area/new')}>
      {developmentAreas.map(item => (
        <WorkspaceEntityCard
          key={item.id}
          kind="Development Area"
          title={item.name}
          statusLabel="Aktif"
          onPress={() => router.push(workspaceDevelopmentProblemStatementsRoute(item.id))}
          onOpenMenu={() => {}}
        />
      ))}
    </WorkspaceLevelScreen>
  );
}

export function DevelopmentAreaProblemStatementsScreen() {
  const router = useRouter();
  const { developmentAreaId } = useLocalSearchParams<{ developmentAreaId: string }>();
  const { problemStatements } = useProblemStatements(developmentAreaId);

  return (
    <WorkspaceLevelScreen
      title="Problem Statement"
      parentContext={
        <ParentContextCard
          kind="Development Area"
          title={developmentAreaId}
          statusLabel="Aktif"
          meta="Context Development Area aktif"
        />
      }>
      {problemStatements.map(item => (
        <WorkspaceEntityCard
          key={item.id}
          kind="Problem Statement"
          title={item.name}
          statusLabel="Aktif"
          onPress={() => router.push(workspaceDevelopmentInitiativesRoute(item.id))}
          onOpenMenu={() => {}}
        />
      ))}
    </WorkspaceLevelScreen>
  );
}
```

Ubah `mobile/src/app/(app)/(tabs)/workspace/development.tsx`:

```tsx
import { DevelopmentAreasScreen } from '@/screens/workspace-drilldown';

export default DevelopmentAreasScreen;
```

Buat tiga route child sesuai path spec, masing-masing hanya me-re-export screen yang relevan dari `workspace-drilldown.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx
```

Expected: blok Development baru hijau saat difilter.

- [ ] **Step 5: Commit**

```powershell
Set-Location d:\Projects\RencanApp
git add mobile/src/screens/workspace-drilldown.tsx mobile/src/hooks/use-workspace.ts mobile/src/app/\(app\)/\(tabs\)/workspace/development.tsx mobile/src/app/\(app\)/\(tabs\)/workspace/development
git commit -m "feat: add development workspace drill-down routes"
```

## Task 5: Generalisasi AppHeader Untuk Semua Sub-Route Workspace

**Files:**
- Modify: `mobile/src/components/app-header.tsx`
- Modify: `mobile/src/components/__tests__/app-header.test.tsx`

- [ ] **Step 1: Write the failing test**

Tambahkan test di `mobile/src/components/__tests__/app-header.test.tsx`:

```tsx
it('subroute Workspace drill-down level dalam (canGoBack false) → tetap tampil back dan fallback ke /workspace', async () => {
  mockCanGoBack.mockReturnValue(false);
  mockSegments = [
    '(app)',
    '(tabs)',
    'workspace',
    'performance',
    'goals',
    'g1',
    'kpi-areas',
  ];

  await render(<AppHeader />, { wrapper });
  fireEvent.press(screen.getByLabelText('Kembali ke Workspace'));

  expect(mockReplace).toHaveBeenCalledWith('/workspace');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/components/__tests__/app-header.test.tsx
```

Expected: FAIL karena `AppHeader` saat ini hanya menganggap `performance` dan `development` entry route sebagai subroute khusus.

- [ ] **Step 3: Write minimal implementation**

Ubah logika `mobile/src/components/app-header.tsx`:

```tsx
const workspaceIndex = segments.indexOf('workspace');
const isWorkspaceSubroute = workspaceIndex >= 0 && segments.length > workspaceIndex + 1;

const isRootTab =
  segments.length <= 3 &&
  segments.includes('(tabs)') &&
  !isWorkspaceSubroute;

const showBack = !isRootTab && (router.canGoBack() || isWorkspaceSubroute);

let headerTitle = title;
if (!headerTitle && workspaceIndex >= 0) {
  const section = segments[workspaceIndex + 1];
  if (section === 'performance') headerTitle = 'Performance';
  else if (section === 'development') headerTitle = 'Development';
}
```

Pastikan handler tetap:

```tsx
const handleBack = () => {
  if (router.canGoBack()) router.back();
  else if (isWorkspaceSubroute) router.replace('/workspace' as never);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/components/__tests__/app-header.test.tsx
```

Expected: PASS, termasuk route child dalam `workspace/*`.

- [ ] **Step 5: Commit**

```powershell
Set-Location d:\Projects\RencanApp
git add mobile/src/components/app-header.tsx mobile/src/components/__tests__/app-header.test.tsx
git commit -m "fix: support workspace drill-down back behavior"
```

## Task 6: Migrasi Test Workspace Dan Bersihkan Tree Inline Lama

**Files:**
- Modify: `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`
- Modify: `mobile/src/screens/workspace-screen.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/workspace/_layout.tsx`

- [ ] **Step 1: Write the failing test**

Di `mobile/src/app/(app)/(tabs)/__tests__/workspace.test.tsx`, ganti asumsi tree inline dengan blok regresi yang relevan:

```tsx
it('pane Performance tidak lagi merender affordance expand/collapse tree inline', async () => {
  mockUseGoals.mockReturnValue(goalsResult({ goals: [{ id: 'g1', name: 'Naikkan Omset Q3 2026', status: 'active' }] }));

  await renderScreen('performance');

  expect(screen.queryByText('Tutup')).toBeNull();
  expect(screen.queryByText('Lihat KPI Area')).toBeNull();
});

it('pane Development tidak lagi merender tree inline Problem Statement', async () => {
  mockUseDevelopmentAreas.mockReturnValue(
    devResult({ developmentAreas: [{ id: 'da1', name: 'Performa Tim Sales', status: 'active' }] }),
  );

  await renderScreen('development');

  expect(screen.queryByText('Lihat Problem Statement')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd test -- --runInBand src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx
```

Expected: FAIL karena screen lama masih merender affordance tree inline atau test lama masih mengunci perilaku expand/collapse.

- [ ] **Step 3: Write minimal implementation**

Rapikan `mobile/src/screens/workspace-screen.tsx` agar hanya menyisakan `HubScreen` dan ekspor lama yang didelegasikan ke drill-down baru:

```tsx
import { DevelopmentAreasScreen, PerformanceGoalsScreen } from '@/screens/workspace-drilldown';

export function HubScreen() {
  return <HubView />;
}

export function PerformanceScreen() {
  return <PerformanceGoalsScreen />;
}

export function DevelopmentScreen() {
  return <DevelopmentAreasScreen />;
}
```

Hapus helper tree yang tidak lagi dipakai secara bertahap. Jika `workspace-screen.tsx` masih terlalu besar, pindahkan `HubView` ke modul kecil terpisah lalu sisakan file ini sebagai adapter tipis.

Perbarui komentar di `mobile/src/app/(app)/(tabs)/workspace/_layout.tsx` agar tidak lagi menyebut tree inline:

```ts
// Workspace stack: hub + route drill-down penuh untuk Performance dan Development.
// initialRouteName tetap `index` agar `/workspace` menjadi anchor fallback untuk back affordance.
```

- [ ] **Step 4: Run tests and verification**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd run test:ci -- src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx
npm.cmd run test:ci -- src/components/__tests__/app-header.test.tsx
npm.cmd run test:ci -- src/components/__tests__/workspace-level-screen.test.tsx
npm.cmd run test:ci -- src/lib/__tests__/workspace-routes.test.ts
npm.cmd run type-check
npm.cmd run lint
```

Expected:

- Semua test Workspace/Header/route builder PASS
- `type-check` exit code `0`
- `lint` exit code `0`

- [ ] **Step 5: Commit**

```powershell
Set-Location d:\Projects\RencanApp
git add mobile/src/screens/workspace-screen.tsx mobile/src/app/\(app\)/\(tabs\)/workspace/_layout.tsx mobile/src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx
git commit -m "refactor: replace workspace tree with drill-down flow"
```

## Task 7: Final Regression Sweep

**Files:**
- Modify if needed: file mana pun yang gagal pada verifikasi akhir

- [ ] **Step 1: Run focused regression suite**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd run test:ci -- src/app/\(app\)/\(tabs\)/__tests__/workspace.test.tsx src/components/__tests__/app-header.test.tsx src/components/__tests__/workspace-level-screen.test.tsx src/lib/__tests__/workspace-routes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run repo safety checks**

Run:

```powershell
Set-Location d:\Projects\RencanApp\mobile
npm.cmd run type-check
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 3: Manual smoke checklist**

Verifikasi manual berikut di dev build:

```text
1. Buka /workspace dan pilih Performance.
2. Tap Goal pertama, pastikan masuk ke KPI Area list.
3. Tekan back, pastikan kembali ke screen sebelumnya.
4. Ulangi sampai level Action Plan.
5. Buka /workspace/development dan ulangi flow sampai Action Plan.
6. Akses deep-link level child langsung, pastikan tombol back tetap muncul dan fallback aman ke /workspace.
```

- [ ] **Step 4: Commit**

```powershell
Set-Location d:\Projects\RencanApp
git add -A
git commit -m "test: finish workspace drill-down regression sweep"
```

## Self-Review

Spec coverage check:

- Route eksplisit per level dicakup di Task 1, Task 3, dan Task 4.
- Shell generik, entity card, dan parent context dicakup di Task 2.
- Generalisasi back behavior `workspace/*` dicakup di Task 5.
- Migrasi dari tree inline dan pembersihan implementasi lama dicakup di Task 6.
- Test, type-check, lint, dan smoke flow dicakup di Task 6 dan Task 7.

Placeholder scan:

- Tidak ada `TBD`, `TODO`, atau “similar to”.
- Semua task punya file path, command, dan snippet implementasi/test.

Type consistency check:

- Builder route memakai nama yang sama di semua task.
- Screen-level composer memakai `PerformanceGoalsScreen`, `PerformanceGoalKpiAreasScreen`, `DevelopmentAreasScreen`, dan `DevelopmentAreaProblemStatementsScreen` secara konsisten.
- Shell dan card generik konsisten memakai `WorkspaceLevelScreen`, `WorkspaceEntityCard`, dan `ParentContextCard`.
