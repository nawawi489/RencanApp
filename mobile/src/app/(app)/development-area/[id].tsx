import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { ActivityLogPanel } from '@/components/activity-log-panel';
import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  MetaGrid,
  SectionCard,
  SkeletonList,
} from '@/components/ui';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useProblemStatements } from '@/hooks/use-workspace';
import {
  PLANNING_STATUS_LABEL,
  STATUS_TONE,
  activateDevelopmentArea,
  getDevelopmentArea,
} from '@/lib/development-areas';
import type { ProblemStatement } from '@/lib/problem-statements';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { confirmAddDescendantIfIncomplete, guardActivationFields } from '@/lib/activation-check';

function ProblemStatementRow({ item, onPress }: { item: ProblemStatement; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge label={PLANNING_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
      </View>
    </SectionCard>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <SectionCard>
      <Text className="text-sm font-bold text-black dark:text-white">{label}</Text>
      <Text className="text-base text-black dark:text-white">{value}</Text>
    </SectionCard>
  );
}

export default function DevelopmentAreaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const devAreaQ = useQuery({
    queryKey: ['development_area', id],
    queryFn: () => getDevelopmentArea(id),
  });
  const {
    problemStatements,
    isLoading: psLoading,
    isError: psError,
    refetch: refetchPs,
  } = useProblemStatements(id);
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('development_area', id);

  useFocusEffect(
    useCallback(() => {
      devAreaQ.refetch();
      refetchPs();
      refetchCompliance();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const activateM = useMutation({
    mutationFn: () => activateDevelopmentArea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['development_area', id] });
      qc.invalidateQueries({ queryKey: ['development_areas'] });
    },
    onError: (e) =>
      Alert.alert('Tidak bisa diaktifkan', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const devArea = devAreaQ.data;
  const { focus } = usePeriodFocus();
  const devPast = devArea ? cardPeriodStatus(devArea, focus) === 'past' : false;
  const handleAddProblem = () => {
    if (devPast) {
      showPastPeriodAlert(devArea?.name);
      return;
    }
    confirmAddDescendantIfIncomplete({
      compliance,
      parentLabel: devArea?.name ?? 'Development Area',
      childLabel: 'Problem Statement',
      onProceed: () =>
        router.push(`/problem-statement/new?developmentAreaId=${id}` as Href),
    });
  };

  function handleActivate() {
    if (devArea && guardActivationFields('development_area', devArea)) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Problem Statement',
      onAddChild: () => router.push(`/problem-statement/new?developmentAreaId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: devArea?.name ?? 'Development Area' }} />
      <View className="gap-5 p-5">
        {devAreaQ.isLoading || !devArea ? (
          devAreaQ.isError ? (
            <ErrorState onRetry={() => devAreaQ.refetch()} />
          ) : (
            <SkeletonList count={3} />
          )
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <View className="gap-1">
                <Badge
                  label={PLANNING_STATUS_LABEL[devArea.status] ?? devArea.status}
                  tone={STATUS_TONE[devArea.status]}
                />
                <Text className="text-2xl font-bold text-black dark:text-white">{devArea.name}</Text>
              </View>
              <MetaGrid
                items={[
                  {
                    label: 'Periode',
                    value: `${devArea.period_start ?? '—'} → ${devArea.period_end ?? '—'}`,
                  },
                ]}
              />
            </View>

            {devArea.description ? (
              <DetailField label="Deskripsi" value={devArea.description} />
            ) : null}

            <MbrCompletionIndicator compliance={compliance} />

            {devArea.status === 'draft' ? (
              <Button
                label="Aktifkan Development Area"
                onPress={handleActivate}
                loading={activateM.isPending}
              />
            ) : null}

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-black dark:text-white">Problem Statement</Text>
                <Button
                  label="+ Tambah Problem Statement"
                  variant="secondary"
                  onPress={handleAddProblem}
                />
              </View>

              {psLoading ? (
                <SkeletonList count={2} />
              ) : psError ? (
                <ErrorState onRetry={() => refetchPs()} />
              ) : problemStatements.length > 0 ? (
                problemStatements.map((item) => (
                  <ProblemStatementRow
                    key={item.id}
                    item={item}
                    onPress={() => router.push(`/problem-statement/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Problem Statement"
                  description="Turunkan Development Area ini menjadi Problem Statement / Development Goal."
                />
              )}
            </View>

            <ActivityLogPanel entityType="development_area" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}
