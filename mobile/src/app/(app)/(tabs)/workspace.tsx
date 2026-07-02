// Workspace (Fase 6) — dual-tab Performance/Development.
// Performance (Fase 4): Goal → KPI Area → Strategy → Initiative, + Initiative Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Initiative → Action Plan.
// UI-N-003 (Stage 1 B′): tree 3-level inline — KPI Area & Problem Statement EXPANDABLE
//   ke level-3 (Strategy / Initiative) untuk turunkan tap-count Goal→Strategy dari 3 → 1.
// Fetch independen per tab (DT-6: error satu tab tidak memblok tab lain). Tab Performance default.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

import { TabScreenAdapter } from '@/prototype/adapters/tab-screen-adapter';
import PrototypeWorkspaceScreen from '@/prototype/screens/workspace';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonList,
  TabBar,
} from '@/components/ui';
import { PeriodSwitcher } from '@/components/period-switcher';
import {
  useDevelopmentAreas,
  useFlatInitiatives,
  useGoals,
  useKpiAreas,
  useProblemStatements,
  useProblemStatementInitiatives,
  useStrategies,
} from '@/hooks/use-workspace';
import { useProfile } from '@/hooks/use-profile';
import { PLANNING_STATUS_LABEL, STATUS_TONE, kpiCountOf, type GoalWithKpiCount } from '@/lib/goals';
import { type Initiative } from '@/lib/cards';
import type { KpiArea } from '@/lib/kpi-areas';
import type { Strategy } from '@/lib/strategies';
import type { ProblemStatement } from '@/lib/problem-statements';
import {
  problemCountOf,
  type DevelopmentAreaWithProblemCount,
} from '@/lib/development-areas';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { WorkspaceHubCard } from '@/components/workspace-hub-card';
import {
  derivePerformanceHubStats,
  deriveDevelopmentHubStats,
} from '@/lib/workspace-hub-stats';
import { WS_COPY, WS_DEV_COPY, WS_HUB_COPY, WS_TABS } from '@/lib/workspace-copy';

/**
 * Tab Workspace + state lobby. `'hub'` = HubView (2 hub-card pilih ruang); `'performance'`/
 * `'development'` = panel detail. UI-N-002 Stage 2: default = `'hub'` agar user lihat ringkasan
 * dulu sebelum dive in. Pane dapat tombol "← Workspace" untuk balik ke hub.
 */
type Tab = 'hub' | 'performance' | 'development';

function StatusBadge({ status }: { status: string }) {
  return <Badge label={PLANNING_STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status]} />;
}

function PastPeriodBadge() {
  return <Badge label="Periode lewat" tone="neutral" />;
}

/**
 * Baris aksi tree-card (PRD V1.8.2 §7.3): [Lihat/Tutup ▾] [Detail] [⋯] [+ tambah?].
 * Tap di luar tombol TIDAK membuka detail. `+` dikunci popup bila past period (§7.7).
 *
 * `onAdd` & `addLabel` opsional — child terdalam (mis. KPI Area di expand Goal) tak punya "+".
 */
function CardActionRow({
  cardLabel,
  expanded,
  onToggleExpand,
  expandLabel,
  collapseLabel,
  onDetail,
  detailLabel,
  onMore,
  past,
  onAdd,
  addLabel,
}: {
  cardLabel: string;
  expanded: boolean;
  onToggleExpand: () => void;
  expandLabel: string;
  collapseLabel: string;
  onDetail: () => void;
  detailLabel: string;
  onMore: () => void;
  past: boolean;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        className="min-h-[44px] flex-1 flex-row items-center gap-1 active:opacity-70"
        accessibilityRole="button"
        accessibilityLabel={expanded ? collapseLabel : expandLabel}
        accessibilityState={{ expanded }}
        onPress={onToggleExpand}>
        <Text className="text-sm font-semibold text-brand-dark">
          {expanded ? collapseLabel : expandLabel}
        </Text>
        <Text className="text-sm text-brand-dark">{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      <Pressable
        className="min-h-[44px] items-center justify-center rounded-lg border border-neutral-300 px-3 active:opacity-70 dark:border-neutral-700"
        accessibilityRole="button"
        accessibilityLabel={detailLabel}
        onPress={onDetail}>
        <Text className="text-sm font-semibold text-black dark:text-white">Detail</Text>
      </Pressable>
      <Pressable
        className="min-h-[44px] w-11 items-center justify-center rounded-lg border border-neutral-300 active:opacity-70 dark:border-neutral-700"
        accessibilityRole="button"
        accessibilityLabel={`Aksi lain ${cardLabel}`}
        onPress={onMore}>
        <Text className="text-base font-bold text-black dark:text-white">⋯</Text>
      </Pressable>
      {onAdd ? (
        <Pressable
          className={`min-h-[44px] w-11 items-center justify-center rounded-lg active:opacity-70 ${
            past
              ? 'border border-neutral-300 dark:border-neutral-700'
              : 'bg-brand-dark'
          }`}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? 'Tambah turunan'}
          accessibilityState={{ disabled: past }}
          onPress={() => (past ? showPastPeriodAlert(cardLabel) : onAdd())}>
          <Text
            className={`text-lg font-bold ${
              past ? 'text-neutral-400 dark:text-neutral-500' : 'text-white'
            }`}>
            +
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Aksi sekunder default (Arsipkan/Ubah/Salin/Hapus draft) — saat ini placeholder V1: notify "Belum tersedia". */
function defaultRowActions(cardLabel: string): { label: string; onPress: () => void; disabled?: boolean }[] {
  const ph = (label: string) => () =>
    Alert.alert(label, `Aksi "${label}" untuk ${cardLabel} belum tersedia di V1.`);
  return [
    { label: 'Ubah', onPress: ph('Ubah') },
    { label: 'Arsipkan', onPress: ph('Arsipkan') },
    { label: 'Salin', onPress: ph('Salin') },
  ];
}

/**
 * Sub-row level 3: Strategy di bawah satu KPI Area. Per UI-N-003 (Stage 1 B′).
 * Tidak punya tree expand sendiri (Initiative tetap stack-nav via Strategy detail).
 * Punya RowActionsMenu + tombol "+ Initiative" (gated `create_initiative`, past-period lock).
 */
function StrategySubRow({ strategy }: { strategy: Strategy }) {
  const router = useRouter();
  const { can } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(strategy, focus) === 'past';
  const canAddInit = can('create_initiative');

  return (
    <View className={past ? 'opacity-50' : undefined}>
      <View className="gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-950">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 text-sm font-medium text-black dark:text-white"
            numberOfLines={2}
            accessibilityLabel={`Strategy ${strategy.name}`}>
            {strategy.name}
          </Text>
          <View className="flex-row items-center gap-1">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={strategy.status} />
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            className="min-h-[44px] flex-1 items-center justify-center rounded-lg border border-neutral-300 px-3 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Buka detail ${strategy.name}`}
            onPress={() => router.push(`/strategy/${strategy.id}` as Href)}>
            <Text className="text-sm font-semibold text-black dark:text-white">Detail</Text>
          </Pressable>
          <Pressable
            className="min-h-[44px] w-11 items-center justify-center rounded-lg border border-neutral-300 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${strategy.name}`}
            onPress={() => setMenuOpen(true)}>
            <Text className="text-base font-bold text-black dark:text-white">⋯</Text>
          </Pressable>
          {canAddInit ? (
            <Pressable
              className={`min-h-[44px] w-11 items-center justify-center rounded-lg active:opacity-70 ${
                past ? 'border border-neutral-300 dark:border-neutral-700' : 'bg-brand-dark'
              }`}
              accessibilityRole="button"
              accessibilityLabel={`Tambah Initiative ke ${strategy.name}`}
              accessibilityState={{ disabled: past }}
              onPress={() =>
                past
                  ? showPastPeriodAlert(strategy.name)
                  : router.push(`/initiative/new?strategyId=${strategy.id}` as Href)
              }>
              <Text
                className={`text-lg font-bold ${
                  past ? 'text-neutral-400 dark:text-neutral-500' : 'text-white'
                }`}>
                +
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={strategy.name}
        items={defaultRowActions(strategy.name)}
      />
    </View>
  );
}

/**
 * Sub-row level 2: KPI Area di bawah satu Goal. Expandable → Strategy children.
 * Lazy fetch Strategy hanya saat `expanded` (parameter `enabled` di useStrategies).
 */
function KpiAreaSubRow({ kpi }: { kpi: KpiArea }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { strategies, isLoading, isError, refetch } = useStrategies(kpi.id, expanded);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(kpi, focus) === 'past';
  const canAddStrategy = can('create_kpi_area'); // proxy izin tambah turunan (existing pattern)

  return (
    <View className={past ? 'opacity-50' : undefined}>
      <View className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-sm font-medium text-black dark:text-white">
            {kpi.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={kpi.status} />
          </View>
        </View>
        <CardActionRow
          cardLabel={kpi.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Strategy"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/kpi-area/${kpi.id}` as Href)}
          detailLabel={`Buka detail ${kpi.name}`}
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={
            canAddStrategy
              ? () => router.push(`/strategy/new?kpiAreaId=${kpi.id}` as Href)
              : undefined
          }
          addLabel={`Tambah Strategy ke ${kpi.name}`}
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : strategies.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Strategy. Tambah Strategy untuk pecah KPI Area ini.
            </Text>
          ) : (
            <View className="gap-2">
              {strategies.map((s) => (
                <StrategySubRow key={s.id} strategy={s} />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={kpi.name}
        items={defaultRowActions(kpi.name)}
      />
    </View>
  );
}

function GoalRow({ goal }: { goal: GoalWithKpiCount }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { kpiAreas } = useKpiAreas(goal.id, expanded);
  const { focus } = usePeriodFocus();

  const count = kpiCountOf(goal);
  const countLabel = count == null ? WS_COPY.kpiCountUnknown : WS_COPY.kpiCount(count);
  const past = cardPeriodStatus(goal, focus) === 'past';
  const canAddKpi = can('create_kpi_area');

  return (
    <View className={past ? 'opacity-50' : undefined}>
      <SectionCard>
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-black dark:text-white">{goal.name}</Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={goal.status} />
          </View>
        </View>

        <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>

        <CardActionRow
          cardLabel={goal.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat KPI Area"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/goal/${goal.id}` as Href)}
          detailLabel={`Buka detail ${goal.name}`}
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={canAddKpi ? () => router.push(`/kpi-area/new?goalId=${goal.id}` as Href) : undefined}
          addLabel={`Tambah KPI Area ke ${goal.name}`}
        />

        {expanded ? (
          <View className="gap-2">
            {kpiAreas.map((k) => (
              <KpiAreaSubRow key={k.id} kpi={k} />
            ))}
          </View>
        ) : null}
      </SectionCard>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={goal.name}
        items={defaultRowActions(goal.name)}
      />
    </View>
  );
}

/**
 * Sub-row level 3: Initiative di bawah satu Problem Statement (Development pane).
 * Action Plan tetap stack-nav via Initiative detail (4-level penuh ditunda — lihat ADR Stage 1).
 */
function InitiativeSubRow({ item }: { item: Initiative }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(item, focus) === 'past';

  return (
    <View className={past ? 'opacity-50' : undefined}>
      <View className="gap-2 rounded-xl border border-neutral-200 bg-white p-2.5 dark:border-neutral-800 dark:bg-neutral-950">
        <View className="flex-row items-start justify-between gap-2">
          <Text
            className="flex-1 text-sm font-medium text-black dark:text-white"
            numberOfLines={2}
            accessibilityLabel={`Initiative ${item.name}`}>
            {item.name}
          </Text>
          <View className="flex-row items-center gap-1">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={item.status} />
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            className="min-h-[44px] flex-1 items-center justify-center rounded-lg border border-neutral-300 px-3 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Buka detail ${item.name}`}
            onPress={() => router.push(`/initiative/${item.id}` as Href)}>
            <Text className="text-sm font-semibold text-black dark:text-white">Detail</Text>
          </Pressable>
          <Pressable
            className="min-h-[44px] w-11 items-center justify-center rounded-lg border border-neutral-300 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${item.name}`}
            onPress={() => setMenuOpen(true)}>
            <Text className="text-base font-bold text-black dark:text-white">⋯</Text>
          </Pressable>
        </View>
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={item.name}
        items={defaultRowActions(item.name)}
      />
    </View>
  );
}

/**
 * Sub-row level 2: Problem Statement di bawah satu Development Area. Expandable → Initiative.
 * Symmetric dgn KpiAreaSubRow di Performance pane.
 */
function ProblemStatementSubRow({ ps }: { ps: ProblemStatement }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { initiatives, isLoading, isError, refetch } = useProblemStatementInitiatives(ps.id, expanded);
  const { focus } = usePeriodFocus();
  const past = cardPeriodStatus(ps, focus) === 'past';
  const canAddInit = can('create_initiative');

  return (
    <View className={past ? 'opacity-50' : undefined}>
      <View className="gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-sm font-medium text-black dark:text-white">{ps.name}</Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={ps.status} />
          </View>
        </View>
        <CardActionRow
          cardLabel={ps.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Initiative"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/problem-statement/${ps.id}` as Href)}
          detailLabel={`Buka detail ${ps.name}`}
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={
            canAddInit
              ? () => router.push(`/initiative/new?problemStatementId=${ps.id}` as Href)
              : undefined
          }
          addLabel={`Tambah Initiative ke ${ps.name}`}
        />

        {expanded ? (
          isLoading ? (
            <SkeletonList count={2} />
          ) : isError ? (
            <ErrorState onRetry={() => refetch()} />
          ) : initiatives.length === 0 ? (
            <Text className="px-1 py-1 text-xs text-neutral-500 dark:text-neutral-400">
              Belum ada Initiative. Tambah Initiative untuk eksekusi Problem Statement ini.
            </Text>
          ) : (
            <View className="gap-2">
              {initiatives.map((i) => (
                <InitiativeSubRow key={i.id} item={i} />
              ))}
            </View>
          )
        ) : null}
      </View>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={ps.name}
        items={defaultRowActions(ps.name)}
      />
    </View>
  );
}

function DevelopmentAreaRow({ devArea }: { devArea: DevelopmentAreaWithProblemCount }) {
  const router = useRouter();
  const { can } = useProfile();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { problemStatements } = useProblemStatements(devArea.id, expanded);
  const { focus } = usePeriodFocus();

  const count = problemCountOf(devArea);
  const countLabel =
    count == null ? WS_DEV_COPY.problemCountUnknown : WS_DEV_COPY.problemCount(count);
  const past = cardPeriodStatus(devArea, focus) === 'past';
  const canAddProblem = can('create_development_area'); // proxy izin tambah turunan DevArea

  return (
    <View className={past ? 'opacity-50' : undefined}>
      <SectionCard>
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-black dark:text-white">
            {devArea.name}
          </Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={devArea.status} />
          </View>
        </View>

        <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>

        <CardActionRow
          cardLabel={devArea.name}
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          expandLabel="Lihat Problem Statement"
          collapseLabel="Tutup"
          onDetail={() => router.push(`/development-area/${devArea.id}` as Href)}
          detailLabel={`Buka detail ${devArea.name}`}
          onMore={() => setMenuOpen(true)}
          past={past}
          onAdd={
            canAddProblem
              ? () => router.push(`/problem-statement/new?developmentAreaId=${devArea.id}` as Href)
              : undefined
          }
          addLabel={`Tambah Problem Statement ke ${devArea.name}`}
        />

        {expanded ? (
          <View className="gap-2">
            {problemStatements.map((p) => (
              <ProblemStatementSubRow key={p.id} ps={p} />
            ))}
          </View>
        ) : null}
      </SectionCard>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={devArea.name}
        items={defaultRowActions(devArea.name)}
      />
    </View>
  );
}

function InitiativeRow({ item, onPress }: { item: Initiative; onPress: () => void }) {
  const { focus } = usePeriodFocus();
  const [menuOpen, setMenuOpen] = useState(false);
  const past = cardPeriodStatus(item, focus) === 'past';
  return (
    <View className={past ? 'opacity-50' : undefined}>
      <SectionCard>
        <View className="flex-row items-start justify-between gap-3">
          <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
          <View className="flex-row items-center gap-1.5">
            {past ? <PastPeriodBadge /> : null}
            <StatusBadge status={item.status} />
          </View>
        </View>
        <View className="flex-row items-center justify-end gap-2">
          <Pressable
            className="min-h-[44px] items-center justify-center rounded-lg border border-neutral-300 px-3 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Buka detail ${item.name}`}
            onPress={onPress}>
            <Text className="text-sm font-semibold text-black dark:text-white">Detail</Text>
          </Pressable>
          <Pressable
            className="min-h-[44px] w-11 items-center justify-center rounded-lg border border-neutral-300 active:opacity-70 dark:border-neutral-700"
            accessibilityRole="button"
            accessibilityLabel={`Aksi lain ${item.name}`}
            onPress={() => setMenuOpen(true)}>
            <Text className="text-base font-bold text-black dark:text-white">⋯</Text>
          </Pressable>
        </View>
      </SectionCard>
      <RowActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={item.name}
        items={defaultRowActions(item.name)}
      />
    </View>
  );
}

function PaneTopHeader({
  tab,
  onTabChange,
  onBackToHub,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onBackToHub: () => void;
}) {
  return (
    <View className="gap-5 pb-5">
      <View className="gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kembali ke Workspace"
          onPress={onBackToHub}
          className="min-h-[44px] justify-center self-start active:opacity-70">
          <Text className="text-sm font-semibold text-brand-dark">{WS_HUB_COPY.backToHub}</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-black dark:text-white">{WS_COPY.title}</Text>
      </View>
      <TabBar<'performance' | 'development'>
        tabs={[
          { key: 'performance', label: WS_TABS.performance },
          { key: 'development', label: WS_TABS.development },
        ]}
        active={tab === 'hub' ? 'performance' : tab}
        onChange={(t) => onTabChange(t)}
      />
    </View>
  );
}

/**
 * UI-N-002 Stage 2 — HubView (lobby). 2 hub-card derive stats dari `useGoals`/`useDevelopmentAreas`
 * (zero query baru). Tap hub → masuk pane dgn back button.
 */
function HubView({ onSelect }: { onSelect: (t: 'performance' | 'development') => void }) {
  const goalsQ = useGoals();
  const devQ = useDevelopmentAreas();

  useFocusEffect(
    useCallback(() => {
      goalsQ.refetch();
      devQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const perfStats = derivePerformanceHubStats(goalsQ.goals);
  const devStats = deriveDevelopmentHubStats(devQ.developmentAreas);
  const loading = goalsQ.isLoading || devQ.isLoading;

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-5 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">{WS_HUB_COPY.title}</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            {WS_HUB_COPY.subtitle}
          </Text>
        </View>
        {loading ? (
          <SkeletonList count={2} />
        ) : (
          <View className="gap-3">
            <WorkspaceHubCard
              kicker={WS_HUB_COPY.perf.kicker}
              title={WS_HUB_COPY.perf.title}
              meta={WS_HUB_COPY.perf.meta}
              stats={perfStats}
              enterLabel={WS_HUB_COPY.perf.enter}
              parentStatLabel="Goal"
              childStatLabel="KPI Area"
              activeStatLabel="Aktif"
              onEnter={() => onSelect('performance')}
            />
            <WorkspaceHubCard
              kicker={WS_HUB_COPY.dev.kicker}
              title={WS_HUB_COPY.dev.title}
              meta={WS_HUB_COPY.dev.meta}
              stats={devStats}
              enterLabel={WS_HUB_COPY.dev.enter}
              parentStatLabel="Dev Area"
              childStatLabel="Problem"
              activeStatLabel="Aktif"
              onEnter={() => onSelect('development')}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function PerformancePane({
  tab,
  onTabChange,
  onBackToHub,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onBackToHub: () => void;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const goalsQ = useGoals();
  const flatQ = useFlatInitiatives();
  const canCreate = can('create_goal');

  useFocusEffect(
    useCallback(() => {
      goalsQ.refetch();
      flatQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = (
    <View className="gap-5 pb-3">
      <PaneTopHeader tab={tab} onTabChange={onTabChange} onBackToHub={onBackToHub} />
      <PeriodSwitcher />
      <Text className="text-base text-neutral-500 dark:text-neutral-400">{WS_COPY.subtitle}</Text>
      {canCreate ? (
        <Button label={WS_COPY.btnGoalBaru} onPress={() => router.push('/goal-wizard' as Href)} />
      ) : null}
      <Text className="text-lg font-bold text-black dark:text-white">{WS_COPY.sectionStrategis}</Text>
      {goalsQ.isLoading ? <SkeletonList count={3} /> : null}
      {goalsQ.isError ? <ErrorState onRetry={() => goalsQ.refetch()} /> : null}
    </View>
  );

  const footer = (
    <View className="gap-3 pt-5">
      <Text className="text-lg font-bold text-black dark:text-white">{WS_COPY.sectionTanpaGoal}</Text>
      {flatQ.isLoading ? (
        <SkeletonList count={2} />
      ) : flatQ.isError ? (
        <ErrorState onRetry={() => flatQ.refetch()} />
      ) : flatQ.initiatives.length > 0 ? (
        <View className="gap-3">
          {flatQ.initiatives.map((item) => (
            <InitiativeRow
              key={item.id}
              item={item}
              onPress={() => router.push(`/initiative/${item.id}` as Href)}
            />
          ))}
        </View>
      ) : (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">
          {WS_COPY.emptyFlatInitiative}
        </Text>
      )}
    </View>
  );

  const goalsData = goalsQ.isLoading || goalsQ.isError ? [] : goalsQ.goals;
  const showEmpty = !goalsQ.isLoading && !goalsQ.isError && goalsQ.goals.length === 0;

  const renderItem = ({ item: goal }: { item: GoalWithKpiCount }) => <GoalRow goal={goal} />;

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <FlatList<GoalWithKpiCount>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={goalsData}
        keyExtractor={(goal) => goal.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          showEmpty ? (
            <EmptyState
              title={WS_COPY.emptyGoalTitle}
              description={canCreate ? WS_COPY.emptyGoalDescCan : WS_COPY.emptyGoalDescView}
              action={
                canCreate
                  ? { label: WS_COPY.btnGoalBaru, onPress: () => router.push('/goal-wizard' as Href) }
                  : undefined
              }
            />
          ) : null
        }
        ListFooterComponent={footer}
        renderItem={renderItem}
      />
    </View>
  );
}

function DevelopmentPane({
  tab,
  onTabChange,
  onBackToHub,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onBackToHub: () => void;
}) {
  const router = useRouter();
  const { can } = useProfile();
  const devQ = useDevelopmentAreas();
  const canCreate = can('create_development_area');

  useFocusEffect(
    useCallback(() => {
      devQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const header = (
    <View className="gap-5 pb-3">
      <PaneTopHeader tab={tab} onTabChange={onTabChange} onBackToHub={onBackToHub} />
      <PeriodSwitcher />
      <Text className="text-base text-neutral-500 dark:text-neutral-400">{WS_DEV_COPY.subtitle}</Text>
      {canCreate ? (
        <Button
          label={WS_DEV_COPY.btnDevAreaBaru}
          onPress={() => router.push('/development-area/new' as Href)}
        />
      ) : null}
      <Text className="text-lg font-bold text-black dark:text-white">
        {WS_DEV_COPY.sectionDevAreas}
      </Text>
      {devQ.isLoading ? <SkeletonList count={3} /> : null}
      {devQ.isError ? <ErrorState onRetry={() => devQ.refetch()} /> : null}
    </View>
  );

  const devData = devQ.isLoading || devQ.isError ? [] : devQ.developmentAreas;
  const showEmpty = !devQ.isLoading && !devQ.isError && devQ.developmentAreas.length === 0;

  const renderItem = ({ item: d }: { item: DevelopmentAreaWithProblemCount }) => (
    <DevelopmentAreaRow devArea={d} />
  );

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <FlatList<DevelopmentAreaWithProblemCount>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={devData}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          showEmpty ? (
            <EmptyState
              title={WS_DEV_COPY.emptyDevAreaTitle}
              description={
                canCreate ? WS_DEV_COPY.emptyDevAreaDescCan : WS_DEV_COPY.emptyDevAreaDescView
              }
              action={
                canCreate
                  ? {
                      label: WS_DEV_COPY.btnDevAreaBaru,
                      onPress: () => router.push('/development-area/new' as Href),
                    }
                  : undefined
              }
            />
          ) : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}

export function LiveWorkspaceScreen() {
  // UI-N-002 Stage 2: default `hub` agar user lihat lobby dulu sebelum dive in.
  const [tab, setTab] = useState<Tab>('hub');
  const backToHub = () => setTab('hub');

  if (tab === 'hub') return <HubView onSelect={setTab} />;
  return tab === 'performance' ? (
    <PerformancePane tab={tab} onTabChange={setTab} onBackToHub={backToHub} />
  ) : (
    <DevelopmentPane tab={tab} onTabChange={setTab} onBackToHub={backToHub} />
  );
}

export default function WorkspaceRoute() {
  return <TabScreenAdapter live={LiveWorkspaceScreen} prototype={PrototypeWorkspaceScreen} />;
}
