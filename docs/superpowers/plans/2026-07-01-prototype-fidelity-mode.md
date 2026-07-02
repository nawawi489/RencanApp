# Prototype Fidelity Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a prototype fidelity mode in `mobile/` that renders all major app surfaces to match `design.html` as closely as possible, using deterministic demo fixtures instead of live data.

**Architecture:** Keep Expo Router public routes unchanged and add a fidelity layer under `mobile/src/prototype/`. Each migrated route delegates to a prototype adapter when fidelity mode is enabled and falls back to the extracted live screen when disabled. Force prototype tokens and light theme inside fidelity mode so visual QA can compare app routes directly against `design.html`.

**Tech Stack:** Expo Router, React 19, React Native 0.85, `react-native-css`, NativeWind v5, Jest + `@testing-library/react-native`, Expo web preview, browser-based visual QA against `design.html`.

---

## Planned File Structure

### Core mode and routing

- Create: `mobile/src/prototype/utils/fidelity-mode.ts`
- Create: `mobile/src/prototype/utils/fidelity-mode.web.ts`
- Create: `mobile/src/prototype/adapters/tab-screen-adapter.tsx`
- Create: `mobile/src/prototype/adapters/stack-screen-adapter.tsx`
- Modify: `mobile/src/app/_layout.tsx`
- Modify: `mobile/src/app/(app)/_layout.tsx`

Responsibilities:

- `fidelity-mode.ts` exposes a single source of truth for whether prototype mode is on
- `tab-screen-adapter.tsx` and `stack-screen-adapter.tsx` switch between live and prototype screen modules
- Root layouts force light mode and route wiring when fidelity mode is active

### Live screen extraction

- Create: `mobile/src/live/tabs/home-screen.tsx`
- Create: `mobile/src/live/tabs/notifications-screen.tsx`
- Create: `mobile/src/live/tabs/workspace-screen.tsx`
- Create: `mobile/src/live/tabs/inbox-screen.tsx`
- Create: `mobile/src/live/tabs/menu-screen.tsx`
- Create: `mobile/src/live/screens/people-screen.tsx`
- Create: `mobile/src/live/screens/people-ranking-screen.tsx`
- Create: `mobile/src/live/screens/people-profile-screen.tsx`
- Create: `mobile/src/live/screens/settings-screen.tsx`
- Modify: existing route files in `mobile/src/app/` to delegate instead of hosting business logic directly

Responsibilities:

- Preserve current live UI while route files become thin adapters
- Keep future prototype work isolated from current production flows

### Prototype layer

- Create: `mobile/src/prototype/tokens/theme.ts`
- Create: `mobile/src/prototype/tokens/spacing.ts`
- Create: `mobile/src/prototype/tokens/typography.ts`
- Create: `mobile/src/prototype/fixtures/home.ts`
- Create: `mobile/src/prototype/fixtures/notifications.ts`
- Create: `mobile/src/prototype/fixtures/workspace.ts`
- Create: `mobile/src/prototype/fixtures/inbox.ts`
- Create: `mobile/src/prototype/fixtures/menu.ts`
- Create: `mobile/src/prototype/fixtures/people.ts`
- Create: `mobile/src/prototype/fixtures/details.ts`
- Create: `mobile/src/prototype/fixtures/forms.ts`
- Create: `mobile/src/prototype/ui/shell/prototype-theme-boundary.tsx`
- Create: `mobile/src/prototype/ui/shell/prototype-topbar.tsx`
- Create: `mobile/src/prototype/ui/shell/prototype-bottom-nav.tsx`
- Create: `mobile/src/prototype/ui/cards/hero-card.tsx`
- Create: `mobile/src/prototype/ui/cards/priority-rail.tsx`
- Create: `mobile/src/prototype/ui/cards/today-card.tsx`
- Create: `mobile/src/prototype/ui/cards/snapshot-team-card.tsx`
- Create: `mobile/src/prototype/ui/forms/prototype-field.tsx`
- Create: `mobile/src/prototype/ui/forms/prototype-chip-group.tsx`
- Create: `mobile/src/prototype/ui/overlays/prototype-sheet.tsx`
- Create: `mobile/src/prototype/ui/overlays/prototype-action-row.tsx`
- Create: `mobile/src/prototype/screens/home.tsx`
- Create: `mobile/src/prototype/screens/notifications.tsx`
- Create: `mobile/src/prototype/screens/workspace.tsx`
- Create: `mobile/src/prototype/screens/inbox.tsx`
- Create: `mobile/src/prototype/screens/menu.tsx`
- Create: `mobile/src/prototype/screens/people.tsx`
- Create: `mobile/src/prototype/screens/people-ranking.tsx`
- Create: `mobile/src/prototype/screens/people-profile.tsx`
- Create: `mobile/src/prototype/screens/goal-detail.tsx`
- Create: `mobile/src/prototype/screens/kpi-area-detail.tsx`
- Create: `mobile/src/prototype/screens/strategy-detail.tsx`
- Create: `mobile/src/prototype/screens/initiative-detail.tsx`
- Create: `mobile/src/prototype/screens/action-plan-detail.tsx`
- Create: `mobile/src/prototype/screens/development-area-detail.tsx`
- Create: `mobile/src/prototype/screens/problem-statement-detail.tsx`
- Create: `mobile/src/prototype/screens/goal-form.tsx`
- Create: `mobile/src/prototype/screens/kpi-area-form.tsx`
- Create: `mobile/src/prototype/screens/strategy-form.tsx`
- Create: `mobile/src/prototype/screens/initiative-form.tsx`
- Create: `mobile/src/prototype/screens/action-plan-form.tsx`
- Create: `mobile/src/prototype/screens/action-plan-submit.tsx`
- Create: `mobile/src/prototype/screens/evaluation-flow.tsx`
- Create: `mobile/src/prototype/screens/global-search.tsx`

Responsibilities:

- `tokens/` hard-code the prototype values
- `fixtures/` provide deterministic demo content
- `ui/` contains reusable building blocks that mirror `design.html`
- `screens/` assemble route-level surfaces with prototype structure and copy

### Tests

- Create: `mobile/src/prototype/__tests__/fidelity-mode.test.ts`
- Create: `mobile/src/prototype/__tests__/prototype-shell.test.tsx`
- Create: `mobile/src/prototype/__tests__/home-screen.test.tsx`
- Create: `mobile/src/prototype/__tests__/notifications-screen.test.tsx`
- Create: `mobile/src/prototype/__tests__/workspace-screen.test.tsx`
- Create: `mobile/src/prototype/__tests__/inbox-screen.test.tsx`
- Create: `mobile/src/prototype/__tests__/menu-screen.test.tsx`
- Create: `mobile/src/prototype/__tests__/people-suite.test.tsx`
- Create: `mobile/src/prototype/__tests__/detail-suite.test.tsx`
- Create: `mobile/src/prototype/__tests__/form-suite.test.tsx`

Responsibilities:

- Guard mode switching, shell rendering, and key copy/section presence per migrated surface
- Keep tests focused on structure and adapter behavior instead of noisy snapshots

### Docs

- Modify: `DESIGN.md`
- Modify: `mobile/src/global.css`
- Modify: `wiki/log.md`

Responsibilities:

- Record fidelity-mode token override rules
- Keep root CSS aligned with new prototype token hooks
- Log the implementation rollout once execution begins

---

### Task 1: Add Fidelity Mode Gate

**Files:**
- Create: `mobile/src/prototype/utils/fidelity-mode.ts`
- Create: `mobile/src/prototype/__tests__/fidelity-mode.test.ts`
- Modify: `mobile/src/app/_layout.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/prototype/__tests__/fidelity-mode.test.ts
import { getPrototypeMode, PROTOTYPE_QUERY_PARAM } from '@/prototype/utils/fidelity-mode';

describe('getPrototypeMode', () => {
  it('returns true when EXPO_PUBLIC_UI_MODE=prototype', () => {
    const previous = process.env.EXPO_PUBLIC_UI_MODE;
    process.env.EXPO_PUBLIC_UI_MODE = 'prototype';

    expect(getPrototypeMode()).toBe(true);

    process.env.EXPO_PUBLIC_UI_MODE = previous;
  });

  it('exposes the expected query param key', () => {
    expect(PROTOTYPE_QUERY_PARAM).toBe('prototype');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/fidelity-mode.test.ts
```

Expected: FAIL with module-not-found for `@/prototype/utils/fidelity-mode`

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/prototype/utils/fidelity-mode.ts
export const PROTOTYPE_QUERY_PARAM = 'prototype';

export function getPrototypeMode(): boolean {
  return process.env.EXPO_PUBLIC_UI_MODE === 'prototype';
}
```

```tsx
// mobile/src/app/_layout.tsx (snippet)
import { getPrototypeMode } from '@/prototype/utils/fidelity-mode';

function RootNavigator() {
  const prototypeMode = getPrototypeMode();
  const { initializing } = useAuth();
  const { effective } = useThemePreference();
  const navTheme = prototypeMode ? DefaultTheme : effective === 'dark' ? DarkTheme : DefaultTheme;
  const barStyle = prototypeMode ? 'dark' : effective === 'dark' ? 'light' : 'dark';

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavThemeProvider value={navTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <StatusBar style={barStyle} />
    </NavThemeProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/fidelity-mode.test.ts
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/prototype/utils/fidelity-mode.ts mobile/src/prototype/__tests__/fidelity-mode.test.ts mobile/src/app/_layout.tsx
git commit -m "feat: add prototype fidelity mode gate"
```

### Task 2: Force Light Theme and Add Prototype Tokens

**Files:**
- Create: `mobile/src/prototype/tokens/theme.ts`
- Create: `mobile/src/prototype/tokens/spacing.ts`
- Create: `mobile/src/prototype/tokens/typography.ts`
- Create: `mobile/src/prototype/ui/shell/prototype-theme-boundary.tsx`
- Create: `mobile/src/prototype/__tests__/prototype-shell.test.tsx`
- Modify: `mobile/src/providers/theme-provider.tsx`
- Modify: `mobile/src/global.css`
- Modify: `DESIGN.md`

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/src/prototype/__tests__/prototype-shell.test.tsx
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { PrototypeThemeBoundary } from '@/prototype/ui/shell/prototype-theme-boundary';

describe('PrototypeThemeBoundary', () => {
  it('renders children without dark-mode dependency', () => {
    render(
      <PrototypeThemeBoundary>
        <Text>Prototype shell ready</Text>
      </PrototypeThemeBoundary>,
    );

    expect(screen.getByText('Prototype shell ready')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/prototype-shell.test.tsx
```

Expected: FAIL with module-not-found for `prototype-theme-boundary`

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/prototype/tokens/theme.ts
export const prototypeTheme = {
  bg: '#f3f5f8',
  surface: '#ffffff',
  line: '#dde3eb',
  text: '#172033',
  muted: '#667085',
  blue: '#1877f2',
  blueSoft: '#e8f2ff',
  green: '#14845c',
  amber: '#b76b00',
  red: '#c93434',
  shadow: '0 12px 30px rgba(31, 43, 68, .08)',
} as const;
```

```tsx
// mobile/src/prototype/ui/shell/prototype-theme-boundary.tsx
import type { PropsWithChildren } from 'react';
import { View } from 'react-native-css/components';

export function PrototypeThemeBoundary({ children }: PropsWithChildren) {
  return <View className="flex-1 bg-[#f3f5f8]">{children}</View>;
}
```

```ts
// mobile/src/providers/theme-provider.tsx (snippet)
import { getPrototypeMode } from '@/prototype/utils/fidelity-mode';

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const system = useColorScheme();
  const prototypeMode = getPrototypeMode();

  useEffect(() => {
    if (prototypeMode) {
      apply('light');
      setModeState('light');
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const next = VALID.includes(raw as ThemeMode) ? (raw as ThemeMode) : 'system';
        setModeState(next);
        apply(next);
      })
      .catch(() => {
        if (!cancelled) apply('system');
      });
    return () => {
      cancelled = true;
    };
  }, [prototypeMode]);

  const effective: 'light' | 'dark' =
    prototypeMode ? 'light' : mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
```

```css
/* mobile/src/global.css */
@theme {
  --color-brand: #1877f2;
  --color-brand-dark: #092753;
  --color-prototype-bg: #f3f5f8;
  --color-prototype-line: #dde3eb;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/prototype-shell.test.tsx
```

Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/prototype/tokens mobile/src/prototype/ui/shell/prototype-theme-boundary.tsx mobile/src/prototype/__tests__/prototype-shell.test.tsx mobile/src/providers/theme-provider.tsx mobile/src/global.css DESIGN.md
git commit -m "feat: add prototype tokens and forced light theme"
```

### Task 3: Extract Live Tab Screens and Add Tab Adapters

**Files:**
- Create: `mobile/src/live/tabs/home-screen.tsx`
- Create: `mobile/src/live/tabs/notifications-screen.tsx`
- Create: `mobile/src/live/tabs/workspace-screen.tsx`
- Create: `mobile/src/live/tabs/inbox-screen.tsx`
- Create: `mobile/src/live/tabs/menu-screen.tsx`
- Create: `mobile/src/prototype/adapters/tab-screen-adapter.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/index.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/notifications.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/workspace.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/inbox.tsx`
- Modify: `mobile/src/app/(app)/(tabs)/menu.tsx`
- Test: `mobile/src/prototype/__tests__/home-screen.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/src/prototype/__tests__/home-screen.test.tsx
import { render, screen } from '@testing-library/react-native';

import HomeRoute from '@/app/(app)/(tabs)/index';

jest.mock('@/prototype/utils/fidelity-mode', () => ({
  getPrototypeMode: () => true,
}));

describe('Home route adapter', () => {
  it('renders the prototype hero copy in prototype mode', () => {
    render(<HomeRoute />);
    expect(screen.getByText('Selamat pagi, Rina.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/home-screen.test.tsx
```

Expected: FAIL because the current tab route still renders the live home screen

- [ ] **Step 3: Write minimal implementation**

```tsx
// mobile/src/prototype/adapters/tab-screen-adapter.tsx
import { getPrototypeMode } from '@/prototype/utils/fidelity-mode';

export function TabScreenAdapter({
  live,
  prototype,
}: {
  live: React.ComponentType;
  prototype: React.ComponentType;
}) {
  const Screen = getPrototypeMode() ? prototype : live;
  return <Screen />;
}
```

```tsx
// mobile/src/live/tabs/home-screen.tsx
import { ScrollView, Text, View } from 'react-native-css/components';

import { GreetingHero } from '@/components/greeting-hero';
import { Badge, PriorityCard, SectionCard } from '@/components/ui';

export default function LiveHomeScreen() {
  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-6 p-5">
        <GreetingHero
          name="Rekan"
          dateLabel=""
          message="Semua tercatat rapi. Kerja bagus."
        />
        <Text className="text-lg font-bold text-black dark:text-white">Prioritas</Text>
        <View className="flex-row gap-3">
          <PriorityCard icon="!" title="Terlewat" subtitle="Tidak ada yang telat." tone="danger" />
          <PriorityCard icon="R" title="Butuh Review" subtitle="Tidak ada antrean review." tone="info" />
        </View>
        <SectionCard onPress={() => {}}>
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-black dark:text-white">Live home extracted</Text>
            <Badge label="Demo" tone="neutral" />
          </View>
        </SectionCard>
      </View>
    </ScrollView>
  );
}
```

```tsx
// mobile/src/app/(app)/(tabs)/index.tsx
import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import LiveHomeScreen from '@/live/tabs/home-screen';
import PrototypeHomeScreen from '@/prototype/screens/home';

export default function HomeRoute() {
  return <TabScreenAdapter live={LiveHomeScreen} prototype={PrototypeHomeScreen} />;
}
```

```tsx
// mobile/src/app/(app)/(tabs)/notifications.tsx
import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import LiveNotificationsScreen from '@/live/tabs/notifications-screen';
import PrototypeNotificationsScreen from '@/prototype/screens/notifications';

export default function NotificationsRoute() {
  return <TabScreenAdapter live={LiveNotificationsScreen} prototype={PrototypeNotificationsScreen} />;
}
```

```tsx
// mobile/src/app/(app)/(tabs)/workspace.tsx
import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import LiveWorkspaceScreen from '@/live/tabs/workspace-screen';
import PrototypeWorkspaceScreen from '@/prototype/screens/workspace';

export default function WorkspaceRoute() {
  return <TabScreenAdapter live={LiveWorkspaceScreen} prototype={PrototypeWorkspaceScreen} />;
}
```

```tsx
// mobile/src/app/(app)/(tabs)/inbox.tsx
import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import LiveInboxScreen from '@/live/tabs/inbox-screen';
import PrototypeInboxScreen from '@/prototype/screens/inbox';

export default function InboxRoute() {
  return <TabScreenAdapter live={LiveInboxScreen} prototype={PrototypeInboxScreen} />;
}
```

```tsx
// mobile/src/app/(app)/(tabs)/menu.tsx
import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import LiveMenuScreen from '@/live/tabs/menu-screen';
import PrototypeMenuScreen from '@/prototype/screens/menu';

export default function MenuRoute() {
  return <TabScreenAdapter live={LiveMenuScreen} prototype={PrototypeMenuScreen} />;
}
```

Important implementation note before editing:

- First copy each current route body into its corresponding `mobile/src/live/tabs/*-screen.tsx`
- Only after the move, replace the route file with the thin adapter shown above
- Do not re-export the route file from the live file, because that creates a circular import once the route becomes an adapter

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/home-screen.test.tsx
```

Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/live/tabs mobile/src/prototype/adapters/tab-screen-adapter.tsx mobile/src/app/(app)/(tabs)/index.tsx mobile/src/app/(app)/(tabs)/notifications.tsx mobile/src/app/(app)/(tabs)/workspace.tsx mobile/src/app/(app)/(tabs)/inbox.tsx mobile/src/app/(app)/(tabs)/menu.tsx mobile/src/prototype/__tests__/home-screen.test.tsx
git commit -m "refactor: extract live tab screens behind fidelity adapters"
```

### Task 4: Build Prototype Shell, Home, and Login

**Files:**
- Create: `mobile/src/prototype/fixtures/home.ts`
- Create: `mobile/src/prototype/ui/shell/prototype-topbar.tsx`
- Create: `mobile/src/prototype/ui/shell/prototype-bottom-nav.tsx`
- Create: `mobile/src/prototype/ui/cards/hero-card.tsx`
- Create: `mobile/src/prototype/ui/cards/priority-rail.tsx`
- Create: `mobile/src/prototype/ui/cards/today-card.tsx`
- Create: `mobile/src/prototype/ui/cards/snapshot-team-card.tsx`
- Create: `mobile/src/prototype/screens/home.tsx`
- Modify: `mobile/src/app/(auth)/login.tsx`
- Test: `mobile/src/prototype/__tests__/home-screen.test.tsx`

- [ ] **Step 1: Expand the failing test to cover shell and home structure**

```tsx
// mobile/src/prototype/__tests__/home-screen.test.tsx
import { render, screen } from '@testing-library/react-native';

import PrototypeHomeScreen from '@/prototype/screens/home';

describe('PrototypeHomeScreen', () => {
  it('renders the prototype shell and home sections', () => {
    render(<PrototypeHomeScreen />);

    expect(screen.getByText('Rencanaapp')).toBeTruthy();
    expect(screen.getByText('Pusat Kendali Hari Ini')).toBeTruthy();
    expect(screen.getByText('Selamat pagi, Rina.')).toBeTruthy();
    expect(screen.getByText('Prioritas')).toBeTruthy();
    expect(screen.getByText('Fokus Hari Ini')).toBeTruthy();
    expect(screen.getByText('Snapshot Tim')).toBeTruthy();
    expect(screen.getByText('Menu')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/home-screen.test.tsx
```

Expected: FAIL because `PrototypeHomeScreen` does not exist yet

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/prototype/fixtures/home.ts
export const prototypeHome = {
  title: 'Rencanaapp',
  kicker: 'Pusat Kendali Hari Ini',
  dateLabel: 'Selasa, 16 Juni',
  greeting: 'Selamat pagi, Rina.',
  heroBody: 'Hari ini ada 3 prioritas utama. Kerjakan yang paling dekat ke target, sisanya tetap tercatat rapi.',
  priorities: [
    { icon: '!', title: 'Lewat deadline', body: '1 Action Plan perlu bukti final.' },
    { icon: 'R', title: 'Butuh Review', body: '3 bukti menunggu keputusan.' },
    { icon: '65%', title: 'Gap KPI Area', body: 'Kurang 1.060 customer.' },
  ],
};
```

```tsx
// mobile/src/prototype/screens/home.tsx
import { Text, View } from 'react-native-css/components';

import { prototypeHome } from '@/prototype/fixtures/home';
import { PrototypeBottomNav } from '@/prototype/ui/shell/prototype-bottom-nav';
import { PrototypeTopbar } from '@/prototype/ui/shell/prototype-topbar';

export default function PrototypeHomeScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8]">
      <PrototypeTopbar kicker={prototypeHome.kicker} initials="RJ" />
      <View className="flex-1 gap-6 p-5">
        <View className="rounded-[20px] bg-[#1877f2] p-5">
          <Text className="self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#172033]">
            {prototypeHome.dateLabel}
          </Text>
          <Text className="mt-4 text-[20px] font-extrabold text-white">{prototypeHome.greeting}</Text>
          <Text className="mt-3 text-sm text-white">{prototypeHome.heroBody}</Text>
        </View>
        <Text className="text-[20px] font-bold text-[#172033]">Prioritas</Text>
        <Text className="text-[20px] font-bold text-[#172033]">Fokus Hari Ini</Text>
        <Text className="text-[20px] font-bold text-[#172033]">Snapshot Tim</Text>
      </View>
      <PrototypeBottomNav active="home" />
    </View>
  );
}
```

```tsx
// mobile/src/app/(auth)/login.tsx (target shape snippet)
<Text className="text-3xl font-extrabold text-[#092753]">
  Rencana<Text className="text-[#12a66a]">app</Text>
</Text>
<Text className="text-sm font-semibold text-[#667085]">Rencanakan. Jalankan. Tuntaskan.</Text>
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/home-screen.test.tsx
```

Expected: PASS with `1 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/prototype/fixtures/home.ts mobile/src/prototype/ui/shell mobile/src/prototype/ui/cards mobile/src/prototype/screens/home.tsx mobile/src/app/(auth)/login.tsx mobile/src/prototype/__tests__/home-screen.test.tsx
git commit -m "feat: add prototype shell and home screen"
```

### Task 5: Build Prototype Notifications and Workspace

**Files:**
- Create: `mobile/src/prototype/fixtures/notifications.ts`
- Create: `mobile/src/prototype/fixtures/workspace.ts`
- Create: `mobile/src/prototype/screens/notifications.tsx`
- Create: `mobile/src/prototype/screens/workspace.tsx`
- Create: `mobile/src/prototype/__tests__/notifications-screen.test.tsx`
- Create: `mobile/src/prototype/__tests__/workspace-screen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// mobile/src/prototype/__tests__/notifications-screen.test.tsx
import { render, screen } from '@testing-library/react-native';
import PrototypeNotificationsScreen from '@/prototype/screens/notifications';

it('renders prototype notification groups and actions', () => {
  render(<PrototypeNotificationsScreen />);
  expect(screen.getByText('Baru')).toBeTruthy();
  expect(screen.getByText('Sebelumnya')).toBeTruthy();
  expect(screen.getByText('Review')).toBeTruthy();
  expect(screen.getByText('Lihat Bukti')).toBeTruthy();
});
```

```tsx
// mobile/src/prototype/__tests__/workspace-screen.test.tsx
import { render, screen } from '@testing-library/react-native';
import PrototypeWorkspaceScreen from '@/prototype/screens/workspace';

it('renders both workspace hub cards', () => {
  render(<PrototypeWorkspaceScreen />);
  expect(screen.getByText('Target Kinerja')).toBeTruthy();
  expect(screen.getByText('Pembangunan Sistem')).toBeTruthy();
  expect(screen.getAllByText('Masuk').length).toBe(2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/notifications-screen.test.tsx src/prototype/__tests__/workspace-screen.test.tsx
```

Expected: FAIL because the prototype screen modules are missing

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/prototype/fixtures/notifications.ts
export const prototypeNotifications = {
  tabs: ['Semua', 'Perlu Aksi', 'Review', 'Deadline', 'Mention'],
  fresh: [
    { title: 'Rina Jaya mengirim Bukti untuk Action Plan Upload 5 konten angle hemat.', actions: ['Review', 'Lihat Bukti'] },
    { title: 'Dika Saputra meminta perubahan deadline untuk bukti foto outlet.', actions: ['Buka Request'] },
  ],
};
```

```tsx
// mobile/src/prototype/screens/notifications.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypeNotificationsScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">Notifications</Text>
      <Text className="mt-5 text-xs font-semibold uppercase text-[#667085]">Baru</Text>
      <Text className="mt-3 text-sm font-semibold text-[#172033]">Review</Text>
      <Text className="text-sm font-semibold text-[#172033]">Lihat Bukti</Text>
      <Text className="mt-5 text-xs font-semibold uppercase text-[#667085]">Sebelumnya</Text>
    </View>
  );
}
```

```tsx
// mobile/src/prototype/screens/workspace.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypeWorkspaceScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">Workspace</Text>
      <Text className="mt-6 text-xl font-bold text-[#172033]">Target Kinerja</Text>
      <Text className="mt-3 text-sm font-semibold text-[#1877f2]">Masuk</Text>
      <Text className="mt-6 text-xl font-bold text-[#172033]">Pembangunan Sistem</Text>
      <Text className="mt-3 text-sm font-semibold text-[#1877f2]">Masuk</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/notifications-screen.test.tsx src/prototype/__tests__/workspace-screen.test.tsx
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/prototype/fixtures/notifications.ts mobile/src/prototype/fixtures/workspace.ts mobile/src/prototype/screens/notifications.tsx mobile/src/prototype/screens/workspace.tsx mobile/src/prototype/__tests__/notifications-screen.test.tsx mobile/src/prototype/__tests__/workspace-screen.test.tsx
git commit -m "feat: add prototype notifications and workspace screens"
```

### Task 6: Build Prototype Inbox and Menu

**Files:**
- Create: `mobile/src/prototype/fixtures/inbox.ts`
- Create: `mobile/src/prototype/fixtures/menu.ts`
- Create: `mobile/src/prototype/screens/inbox.tsx`
- Create: `mobile/src/prototype/screens/menu.tsx`
- Create: `mobile/src/prototype/__tests__/inbox-screen.test.tsx`
- Create: `mobile/src/prototype/__tests__/menu-screen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// mobile/src/prototype/__tests__/inbox-screen.test.tsx
import { render, screen } from '@testing-library/react-native';
import PrototypeInboxScreen from '@/prototype/screens/inbox';

it('renders the prototype inbox filters and room list', () => {
  render(<PrototypeInboxScreen />);
  expect(screen.getByText('Inbox')).toBeTruthy();
  expect(screen.getByText('Semua')).toBeTruthy();
  expect(screen.getByText('Belum dibaca')).toBeTruthy();
  expect(screen.getByText('Saya PIC')).toBeTruthy();
});
```

```tsx
// mobile/src/prototype/__tests__/menu-screen.test.tsx
import { render, screen } from '@testing-library/react-native';
import PrototypeMenuScreen from '@/prototype/screens/menu';

it('renders the prototype menu sections', () => {
  render(<PrototypeMenuScreen />);
  expect(screen.getByText('Menu')).toBeTruthy();
  expect(screen.getByText('People Ranking & profil')).toBeTruthy();
  expect(screen.getByText('Admin Lanjutan')).toBeTruthy();
  expect(screen.getByText('Keluar')).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/inbox-screen.test.tsx src/prototype/__tests__/menu-screen.test.tsx
```

Expected: FAIL because the prototype modules are missing

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/prototype/fixtures/inbox.ts
export const prototypeInbox = {
  filters: ['Semua', 'Belum dibaca', 'Saya PIC', 'Review', 'Deadline'],
  rooms: [
    { title: 'Campaign Paket Hemat Pizza', preview: 'Arman: Data Parepare sudah masuk?' },
    { title: 'Pindahkan Review dari WA ke EMS', preview: 'Maya: Hak Akses flow sudah final.' },
  ],
};
```

```tsx
// mobile/src/prototype/screens/inbox.tsx
import { Text, View } from 'react-native-css/components';
import { prototypeInbox } from '@/prototype/fixtures/inbox';

export default function PrototypeInboxScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">Inbox</Text>
      {prototypeInbox.filters.map((item) => (
        <Text key={item} className="mt-3 text-sm font-semibold text-[#172033]">
          {item}
        </Text>
      ))}
    </View>
  );
}
```

```tsx
// mobile/src/prototype/screens/menu.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypeMenuScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">Menu</Text>
      <Text className="mt-6 text-base font-semibold text-[#172033]">People Ranking & profil</Text>
      <Text className="mt-3 text-base font-semibold text-[#172033]">Admin Lanjutan</Text>
      <Text className="mt-3 text-base font-semibold text-[#172033]">Keluar</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/inbox-screen.test.tsx src/prototype/__tests__/menu-screen.test.tsx
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/prototype/fixtures/inbox.ts mobile/src/prototype/fixtures/menu.ts mobile/src/prototype/screens/inbox.tsx mobile/src/prototype/screens/menu.tsx mobile/src/prototype/__tests__/inbox-screen.test.tsx mobile/src/prototype/__tests__/menu-screen.test.tsx
git commit -m "feat: add prototype inbox and menu screens"
```

### Task 7: Build Prototype People Surfaces

**Files:**
- Create: `mobile/src/live/screens/people-screen.tsx`
- Create: `mobile/src/live/screens/people-ranking-screen.tsx`
- Create: `mobile/src/live/screens/people-profile-screen.tsx`
- Create: `mobile/src/prototype/fixtures/people.ts`
- Create: `mobile/src/prototype/screens/people.tsx`
- Create: `mobile/src/prototype/screens/people-ranking.tsx`
- Create: `mobile/src/prototype/screens/people-profile.tsx`
- Create: `mobile/src/prototype/__tests__/people-suite.test.tsx`
- Modify: `mobile/src/app/(app)/people.tsx`
- Modify: `mobile/src/app/(app)/people-ranking.tsx`
- Modify: `mobile/src/app/(app)/people-profile/[id].tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/src/prototype/__tests__/people-suite.test.tsx
import { render, screen } from '@testing-library/react-native';

import PrototypePeopleScreen from '@/prototype/screens/people';
import PrototypePeopleProfileScreen from '@/prototype/screens/people-profile';

describe('prototype people surfaces', () => {
  it('renders the people roster tabs and CTA', () => {
    render(<PrototypePeopleScreen />);
    expect(screen.getByText('People')).toBeTruthy();
    expect(screen.getByText('Ranking')).toBeTruthy();
    expect(screen.getByText('Bulan')).toBeTruthy();
    expect(screen.getByText('Quarter')).toBeTruthy();
  });

  it('renders the profile header treatment', () => {
    render(<PrototypePeopleProfileScreen />);
    expect(screen.getByText('Rina Jaya')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/people-suite.test.tsx
```

Expected: FAIL because prototype people screen modules do not exist

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/src/prototype/fixtures/people.ts
export const prototypePeople = {
  tabs: ['Ranking', 'Bulan', 'Quarter', 'Admin'],
  roster: [
    { name: 'Rina Jaya', subhead: 'Staf Marketing' },
    { name: 'Arman Malik', subhead: 'Head of Marketing' },
  ],
};
```

```tsx
// mobile/src/prototype/screens/people.tsx
import { Text, View } from 'react-native-css/components';
import { prototypePeople } from '@/prototype/fixtures/people';

export default function PrototypePeopleScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">People</Text>
      {prototypePeople.tabs.map((tab) => (
        <Text key={tab} className="mt-3 text-sm font-semibold text-[#172033]">
          {tab}
        </Text>
      ))}
    </View>
  );
}
```

```tsx
// mobile/src/prototype/screens/people-profile.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypePeopleProfileScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">Rina Jaya</Text>
      <Text className="mt-4 text-sm font-semibold text-[#172033]">Chat</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/people-suite.test.tsx
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/live/screens/people-screen.tsx mobile/src/live/screens/people-ranking-screen.tsx mobile/src/live/screens/people-profile-screen.tsx mobile/src/prototype/fixtures/people.ts mobile/src/prototype/screens/people.tsx mobile/src/prototype/screens/people-ranking.tsx mobile/src/prototype/screens/people-profile.tsx mobile/src/prototype/__tests__/people-suite.test.tsx mobile/src/app/(app)/people.tsx mobile/src/app/(app)/people-ranking.tsx mobile/src/app/(app)/people-profile/[id].tsx
git commit -m "feat: add prototype people surfaces"
```

### Task 8: Build Prototype Detail Screens

**Files:**
- Create: `mobile/src/prototype/fixtures/details.ts`
- Create: `mobile/src/prototype/screens/goal-detail.tsx`
- Create: `mobile/src/prototype/screens/kpi-area-detail.tsx`
- Create: `mobile/src/prototype/screens/strategy-detail.tsx`
- Create: `mobile/src/prototype/screens/initiative-detail.tsx`
- Create: `mobile/src/prototype/screens/action-plan-detail.tsx`
- Create: `mobile/src/prototype/screens/development-area-detail.tsx`
- Create: `mobile/src/prototype/screens/problem-statement-detail.tsx`
- Create: `mobile/src/prototype/__tests__/detail-suite.test.tsx`
- Modify: route files for these detail paths to delegate through `stack-screen-adapter.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/src/prototype/__tests__/detail-suite.test.tsx
import { render, screen } from '@testing-library/react-native';
import PrototypeActionPlanDetailScreen from '@/prototype/screens/action-plan-detail';
import PrototypeKpiAreaDetailScreen from '@/prototype/screens/kpi-area-detail';

describe('prototype detail surfaces', () => {
  it('renders the action plan guidance and gate sections', () => {
    render(<PrototypeActionPlanDetailScreen />);
    expect(screen.getByText('Panduan Selesai')).toBeTruthy();
    expect(screen.getByText('Gate & kendala')).toBeTruthy();
  });

  it('renders the KPI area gap surface', () => {
    render(<PrototypeKpiAreaDetailScreen />);
    expect(screen.getByText('Cakupan & Gap')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/detail-suite.test.tsx
```

Expected: FAIL because the prototype detail screens do not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// mobile/src/prototype/adapters/stack-screen-adapter.tsx
import { getPrototypeMode } from '@/prototype/utils/fidelity-mode';

export function StackScreenAdapter({
  live,
  prototype,
}: {
  live: React.ComponentType;
  prototype: React.ComponentType;
}) {
  const Screen = getPrototypeMode() ? prototype : live;
  return <Screen />;
}
```

```tsx
// mobile/src/prototype/screens/action-plan-detail.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypeActionPlanDetailScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">Action Plan</Text>
      <Text className="mt-6 text-base font-semibold text-[#172033]">Panduan Selesai</Text>
      <Text className="mt-3 text-base font-semibold text-[#172033]">Gate & kendala</Text>
    </View>
  );
}
```

```tsx
// mobile/src/prototype/screens/kpi-area-detail.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypeKpiAreaDetailScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">KPI Area</Text>
      <Text className="mt-6 text-base font-semibold text-[#172033]">Cakupan & Gap</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/detail-suite.test.tsx
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/prototype/fixtures/details.ts mobile/src/prototype/screens/goal-detail.tsx mobile/src/prototype/screens/kpi-area-detail.tsx mobile/src/prototype/screens/strategy-detail.tsx mobile/src/prototype/screens/initiative-detail.tsx mobile/src/prototype/screens/action-plan-detail.tsx mobile/src/prototype/screens/development-area-detail.tsx mobile/src/prototype/screens/problem-statement-detail.tsx mobile/src/prototype/adapters/stack-screen-adapter.tsx mobile/src/prototype/__tests__/detail-suite.test.tsx mobile/src/app/(app)/goal/[id].tsx mobile/src/app/(app)/kpi-area/[id].tsx mobile/src/app/(app)/strategy/[id].tsx mobile/src/app/(app)/initiative/[id].tsx mobile/src/app/(app)/action-plan/[id].tsx mobile/src/app/(app)/development-area/[id].tsx mobile/src/app/(app)/problem-statement/[id].tsx
git commit -m "feat: add prototype detail screen suite"
```

### Task 9: Build Prototype Form and Modal Screens

**Files:**
- Create: `mobile/src/prototype/fixtures/forms.ts`
- Create: `mobile/src/prototype/screens/goal-form.tsx`
- Create: `mobile/src/prototype/screens/kpi-area-form.tsx`
- Create: `mobile/src/prototype/screens/strategy-form.tsx`
- Create: `mobile/src/prototype/screens/initiative-form.tsx`
- Create: `mobile/src/prototype/screens/action-plan-form.tsx`
- Create: `mobile/src/prototype/screens/action-plan-submit.tsx`
- Create: `mobile/src/prototype/screens/evaluation-flow.tsx`
- Create: `mobile/src/prototype/screens/global-search.tsx`
- Create: `mobile/src/prototype/__tests__/form-suite.test.tsx`
- Modify: `mobile/src/app/(app)/goal/new.tsx`
- Modify: `mobile/src/app/(app)/kpi-area/new.tsx`
- Modify: `mobile/src/app/(app)/strategy/new.tsx`
- Modify: `mobile/src/app/(app)/initiative/new.tsx`
- Modify: `mobile/src/app/(app)/action-plan/new.tsx`
- Modify: `mobile/src/app/(app)/action-plan/submit.tsx`
- Modify: `mobile/src/app/(app)/evaluation.tsx`
- Modify: `mobile/src/app/(app)/search.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/src/prototype/__tests__/form-suite.test.tsx
import { render, screen } from '@testing-library/react-native';
import PrototypeKpiAreaFormScreen from '@/prototype/screens/kpi-area-form';
import PrototypeActionPlanSubmitScreen from '@/prototype/screens/action-plan-submit';

describe('prototype form suite', () => {
  it('renders the KPI template and target breakdown affordances', () => {
    render(<PrototypeKpiAreaFormScreen />);
    expect(screen.getByText('Pakai Template')).toBeTruthy();
    expect(screen.getByText('Target Quarter')).toBeTruthy();
  });

  it('renders evidence and result-value submission affordances', () => {
    render(<PrototypeActionPlanSubmitScreen />);
    expect(screen.getByText('Upload bukti')).toBeTruthy();
    expect(screen.getByText('Nilai Hasil')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/form-suite.test.tsx
```

Expected: FAIL because the prototype form modules are missing

- [ ] **Step 3: Write minimal implementation**

```tsx
// mobile/src/prototype/screens/kpi-area-form.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypeKpiAreaFormScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">KPI Area Baru</Text>
      <Text className="mt-6 text-base font-semibold text-[#172033]">Pakai Template</Text>
      <Text className="mt-3 text-base font-semibold text-[#172033]">Target Quarter</Text>
    </View>
  );
}
```

```tsx
// mobile/src/prototype/screens/action-plan-submit.tsx
import { Text, View } from 'react-native-css/components';

export default function PrototypeActionPlanSubmitScreen() {
  return (
    <View className="flex-1 bg-[#f3f5f8] p-5">
      <Text className="text-2xl font-bold text-[#172033]">Submit Bukti</Text>
      <Text className="mt-6 text-base font-semibold text-[#172033]">Upload bukti</Text>
      <Text className="mt-3 text-base font-semibold text-[#172033]">Nilai Hasil</Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/form-suite.test.tsx
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/prototype/fixtures/forms.ts mobile/src/prototype/screens/goal-form.tsx mobile/src/prototype/screens/kpi-area-form.tsx mobile/src/prototype/screens/strategy-form.tsx mobile/src/prototype/screens/initiative-form.tsx mobile/src/prototype/screens/action-plan-form.tsx mobile/src/prototype/screens/action-plan-submit.tsx mobile/src/prototype/screens/evaluation-flow.tsx mobile/src/prototype/screens/global-search.tsx mobile/src/prototype/__tests__/form-suite.test.tsx mobile/src/app/(app)/goal/new.tsx mobile/src/app/(app)/kpi-area/new.tsx mobile/src/app/(app)/strategy/new.tsx mobile/src/app/(app)/initiative/new.tsx mobile/src/app/(app)/action-plan/new.tsx mobile/src/app/(app)/action-plan/submit.tsx mobile/src/app/(app)/evaluation.tsx mobile/src/app/(app)/search.tsx
git commit -m "feat: add prototype forms and modal flows"
```

### Task 10: Run Visual QA and Document Gaps

**Files:**
- Modify: `wiki/log.md`
- Modify: `docs/superpowers/specs/2026-07-01-prototype-fidelity-mode-design.md` (only if the implementation exposes spec ambiguity)
- Create: `docs/superpowers/plans/qa/prototype-fidelity-checklist.md`

- [ ] **Step 1: Write the failing checklist**

```md
<!-- docs/superpowers/plans/qa/prototype-fidelity-checklist.md -->
# Prototype Fidelity QA Checklist

- [ ] Home matches `design.html`
- [ ] Notifications matches `design.html`
- [ ] Workspace matches `design.html`
- [ ] Inbox matches `design.html`
- [ ] Menu matches `design.html`
- [ ] People suite matches `design.html`
- [ ] Detail suite matches `design.html`
- [ ] Form suite matches `design.html`
```

- [ ] **Step 2: Run route smoke checks before visual review**

Run:

```bash
cd mobile
npm.cmd run test:ci -- --runTestsByPath src/prototype/__tests__/home-screen.test.tsx src/prototype/__tests__/notifications-screen.test.tsx src/prototype/__tests__/workspace-screen.test.tsx src/prototype/__tests__/inbox-screen.test.tsx src/prototype/__tests__/menu-screen.test.tsx src/prototype/__tests__/people-suite.test.tsx src/prototype/__tests__/detail-suite.test.tsx src/prototype/__tests__/form-suite.test.tsx
```

Expected: PASS across all prototype tests

- [ ] **Step 3: Perform manual visual QA**

Run:

```bash
cd mobile
npx.cmd expo start --web --port 8082
```

Manual validation checklist:

```text
1. Open http://localhost:8082 with EXPO_PUBLIC_UI_MODE=prototype
2. Open http://127.0.0.1:4599/design.html
3. Compare each route side-by-side
4. Record every visible mismatch in spacing, copy, tokens, badges, CTA labels, and section order
5. Fix mismatches before checking the route off
```

- [ ] **Step 4: Update log and checklist after QA passes**

```md
## [2026-07-01] update | prototype fidelity mode
- Completed batches: shell, tabs, people, detail, forms
- Verification: route smoke tests + side-by-side visual QA against `design.html`
- Remaining gaps: none blocking
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/qa/prototype-fidelity-checklist.md wiki/log.md
git commit -m "docs: record prototype fidelity qa results"
```

---

## Self-Review

### Spec coverage

- Fidelity mode gate: Task 1
- Forced light theme and token override: Task 2
- Route preservation with adapters: Tasks 3, 7, 8, 9
- Demo fixtures: Tasks 4 through 9
- Global shell: Task 4
- Five primary tabs: Tasks 4, 5, 6
- People suite: Task 7
- Detail screens: Task 8
- Forms and modal/helper surfaces: Task 9
- Visual verification and acceptance criteria: Task 10

No spec section is left without a corresponding task.

### Placeholder scan

- No `TBD`
- No `TODO`
- No "implement later"
- No "write tests for the above" without concrete test code

### Type consistency

- Mode helper is consistently named `getPrototypeMode`
- Route switching uses `TabScreenAdapter` for tabs and `StackScreenAdapter` for stack routes
- Prototype screen modules consistently live under `mobile/src/prototype/screens/`

No naming conflicts were introduced in the plan.
