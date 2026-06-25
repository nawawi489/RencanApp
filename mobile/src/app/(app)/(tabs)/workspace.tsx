// Workspace (Fase 4) — Hierarki Strategis (Goal → KPI Area) + Initiative Tanpa Goal.
// Indikator count-only (KPI Area: N / —); MBR kuantitatif (X/N) ditunda Fase 5.
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Badge, Button, EmptyState, ErrorState, SectionCard, SkeletonList } from '@/components/ui';
import { useFlatInitiatives, useGoals, useKpiAreas } from '@/hooks/use-workspace';
import { useProfile } from '@/hooks/use-profile';
import { PLANNING_STATUS_LABEL, STATUS_TONE, kpiCountOf, type GoalWithKpiCount } from '@/lib/goals';
import { type Initiative } from '@/lib/cards';
import { WS_COPY } from '@/lib/workspace-copy';

function StatusBadge({ status }: { status: string }) {
  return <Badge label={PLANNING_STATUS_LABEL[status] ?? status} tone={STATUS_TONE[status]} />;
}

function GoalRow({ goal }: { goal: GoalWithKpiCount }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  // Jumlah KPI Area dari embedded count (satu query di listGoals) → tak ada N+1 per baris.
  // Daftar anak baru di-fetch saat di-expand (lazy): enabled = expanded.
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

export default function WorkspaceScreen() {
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

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-5 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">{WS_COPY.title}</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">{WS_COPY.subtitle}</Text>
        </View>

        {canCreate ? (
          <Button label={WS_COPY.btnGoalBaru} onPress={() => router.push('/goal-wizard' as Href)} />
        ) : null}

        {/* Section: Hierarki Strategis */}
        <View className="gap-3">
          <Text className="text-lg font-bold text-black dark:text-white">{WS_COPY.sectionStrategis}</Text>
          {goalsQ.isLoading ? (
            <SkeletonList count={3} />
          ) : goalsQ.isError ? (
            <ErrorState onRetry={() => goalsQ.refetch()} />
          ) : goalsQ.goals.length > 0 ? (
            <View className="gap-3">
              {goalsQ.goals.map((goal) => (
                <GoalRow key={goal.id} goal={goal} />
              ))}
            </View>
          ) : (
            <EmptyState
              title={WS_COPY.emptyGoalTitle}
              description={canCreate ? WS_COPY.emptyGoalDescCan : WS_COPY.emptyGoalDescView}
              action={
                canCreate
                  ? { label: WS_COPY.btnGoalBaru, onPress: () => router.push('/goal-wizard' as Href) }
                  : undefined
              }
            />
          )}
        </View>

        {/* Section: Initiative Tanpa Goal */}
        <View className="gap-3">
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
      </View>
    </ScrollView>
  );
}
