// Workspace (Fase 6) — dual-tab Performance/Development.
// Performance (Fase 4): Goal → KPI Area → Strategy → Initiative, + Initiative Tanpa Goal.
// Development (Fase 6): Development Area → Problem Statement → Initiative → Action Plan.
// Fetch independen per tab (DT-6: error satu tab tidak memblok tab lain). Tab Performance default.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
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
import { WS_COPY, WS_DEV_COPY, WS_TABS } from '@/lib/workspace-copy';

type Tab = 'performance' | 'development';

function StatusBadge({ status }: { status: string }) {
  return <Badge label={PLANNING_STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status]} />;
}

function GoalRow({ goal }: { goal: GoalWithKpiCount }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { kpiAreas } = useKpiAreas(goal.id, expanded);

  const count = kpiCountOf(goal);
  const countLabel = count == null ? WS_COPY.kpiCountUnknown : WS_COPY.kpiCount(count);

  return (
    <SectionCard>
      <Pressable
        className="flex-row items-start justify-between gap-3 active:opacity-70"
        onPress={() => router.push(`/goal/${goal.id}` as Href)}
        accessibilityRole="button"
        accessibilityLabel={goal.name}>
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{goal.name}</Text>
        <StatusBadge status={goal.status} />
      </Pressable>

      <Pressable
        className="min-h-[44px] flex-row items-center justify-between gap-3 active:opacity-70"
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Tutup' : 'Lihat KPI Area'}
        accessibilityState={{ expanded }}>
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>
        <Text className="text-sm font-semibold text-brand-dark">
          {expanded ? 'Tutup' : 'Lihat KPI Area'}
        </Text>
      </Pressable>

      {expanded ? (
        <View className="gap-2">
          {kpiAreas.map((k) => (
            <Pressable
              key={k.id}
              className="min-h-[44px] flex-row items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3 active:opacity-70 dark:bg-neutral-900"
              onPress={() => router.push(`/kpi-area/${k.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={k.name}>
              <Text className="flex-1 text-sm font-medium text-black dark:text-white">{k.name}</Text>
              <StatusBadge status={k.status} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

function DevelopmentAreaRow({ devArea }: { devArea: DevelopmentAreaWithProblemCount }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { problemStatements } = useProblemStatements(devArea.id, expanded);

  const count = problemCountOf(devArea);
  const countLabel =
    count == null ? WS_DEV_COPY.problemCountUnknown : WS_DEV_COPY.problemCount(count);

  return (
    <SectionCard>
      <Pressable
        className="flex-row items-start justify-between gap-3 active:opacity-70"
        onPress={() => router.push(`/development-area/${devArea.id}` as Href)}
        accessibilityRole="button"
        accessibilityLabel={devArea.name}>
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">
          {devArea.name}
        </Text>
        <StatusBadge status={devArea.status} />
      </Pressable>

      <Pressable
        className="min-h-[44px] flex-row items-center justify-between gap-3 active:opacity-70"
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Tutup' : 'Lihat Problem Statement'}
        accessibilityState={{ expanded }}>
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">{countLabel}</Text>
        <Text className="text-sm font-semibold text-brand-dark">
          {expanded ? 'Tutup' : 'Lihat Problem Statement'}
        </Text>
      </Pressable>

      {expanded ? (
        <View className="gap-2">
          {problemStatements.map((p) => (
            <Pressable
              key={p.id}
              className="min-h-[44px] flex-row items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3 active:opacity-70 dark:bg-neutral-900"
              onPress={() => router.push(`/problem-statement/${p.id}` as Href)}
              accessibilityRole="button"
              accessibilityLabel={p.name}>
              <Text className="flex-1 text-sm font-medium text-black dark:text-white">{p.name}</Text>
              <StatusBadge status={p.status} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </SectionCard>
  );
}

function InitiativeRow({ item, onPress }: { item: Initiative; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <StatusBadge status={item.status} />
      </View>
    </SectionCard>
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
