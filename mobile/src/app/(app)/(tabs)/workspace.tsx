// Workspace (Fase 6) — dual-tab Performance/Development.
// Performance (Fase 4): Goal → KPI Area → Strategy → Initiative, + Initiative Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Initiative → Action Plan.
// Fetch independen per tab (DT-6: error satu tab tidak memblok tab lain). Tab Performance default.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

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
} from '@/hooks/use-workspace';
import { useProfile } from '@/hooks/use-profile';
import { PLANNING_STATUS_LABEL, STATUS_TONE, kpiCountOf, type GoalWithKpiCount } from '@/lib/goals';
import { type Initiative } from '@/lib/cards';
import {
  problemCountOf,
  type DevelopmentAreaWithProblemCount,
} from '@/lib/development-areas';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { WS_COPY, WS_DEV_COPY, WS_TABS } from '@/lib/workspace-copy';

type Tab = 'performance' | 'development';

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
            {kpiAreas.map((k) => {
              const kPast = cardPeriodStatus(k, focus) === 'past';
              return (
                <View
                  key={k.id}
                  className={`gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900 ${
                    kPast ? 'opacity-50' : ''
                  }`}>
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="flex-1 text-sm font-medium text-black dark:text-white">
                      {k.name}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      {kPast ? <PastPeriodBadge /> : null}
                      <StatusBadge status={k.status} />
                    </View>
                  </View>
                  <Pressable
                    className="min-h-[44px] flex-row items-center justify-end gap-2 active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={`Buka detail ${k.name}`}
                    onPress={() => router.push(`/kpi-area/${k.id}` as Href)}>
                    <Text className="text-sm font-semibold text-brand-dark">Detail</Text>
                    <Text className="text-sm text-brand-dark">›</Text>
                  </Pressable>
                </View>
              );
            })}
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
            {problemStatements.map((p) => {
              const pPast = cardPeriodStatus(p, focus) === 'past';
              return (
                <View
                  key={p.id}
                  className={`gap-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900 ${
                    pPast ? 'opacity-50' : ''
                  }`}>
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="flex-1 text-sm font-medium text-black dark:text-white">
                      {p.name}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      {pPast ? <PastPeriodBadge /> : null}
                      <StatusBadge status={p.status} />
                    </View>
                  </View>
                  <Pressable
                    className="min-h-[44px] flex-row items-center justify-end gap-2 active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={`Buka detail ${p.name}`}
                    onPress={() => router.push(`/problem-statement/${p.id}` as Href)}>
                    <Text className="text-sm font-semibold text-brand-dark">Detail</Text>
                    <Text className="text-sm text-brand-dark">›</Text>
                  </Pressable>
                </View>
              );
            })}
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
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
}) {
  return (
    <View className="gap-5 pb-5">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-black dark:text-white">{WS_COPY.title}</Text>
      </View>
      <TabBar<Tab>
        tabs={[
          { key: 'performance', label: WS_TABS.performance },
          { key: 'development', label: WS_TABS.development },
        ]}
        active={tab}
        onChange={onTabChange}
      />
    </View>
  );
}

function PerformancePane({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
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
      <PaneTopHeader tab={tab} onTabChange={onTabChange} />
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

function DevelopmentPane({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
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
      <PaneTopHeader tab={tab} onTabChange={onTabChange} />
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

export default function WorkspaceScreen() {
  const [tab, setTab] = useState<Tab>('performance');

  return tab === 'performance' ? (
    <PerformancePane tab={tab} onTabChange={setTab} />
  ) : (
    <DevelopmentPane tab={tab} onTabChange={setTab} />
  );
}
