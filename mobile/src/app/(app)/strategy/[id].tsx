import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { ActivityLogPanel } from '@/components/activity-log-panel';
import { Badge, Button, EmptyState, ErrorState, MetaGrid, ProgressOrb, SectionCard, SkeletonList } from '@/components/ui';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useStrategyInitiatives } from '@/hooks/use-workspace';
import { INITIATIVE_STATUS_LABEL, type Initiative } from '@/lib/cards';
import { childrenSublabel, ratioDoneOfChildren } from '@/lib/progress';
import { PLANNING_STATUS_LABEL, STATUS_TONE, activateStrategy, getStrategy } from '@/lib/strategies';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { confirmAddDescendantIfIncomplete, guardActivationFields } from '@/lib/activation-check';

function InitiativeRow({ item, onPress }: { item: Initiative; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge label={INITIATIVE_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
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

export default function StrategyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const strategyQ = useQuery({ queryKey: ['strategy', id], queryFn: () => getStrategy(id) });
  const {
    initiatives,
    isLoading: initiativesLoading,
    isError: initiativesError,
    refetch: refetchInitiatives,
  } = useStrategyInitiatives(id);
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('strategy', id);

  useFocusEffect(
    useCallback(() => {
      strategyQ.refetch();
      refetchInitiatives();
      refetchCompliance(); // indikator Kelengkapan ikut segar setelah tambah/arsip Initiative
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const activateM = useMutation({
    mutationFn: () => activateStrategy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategy', id] });
      qc.invalidateQueries({ queryKey: ['strategies'] });
    },
    onError: (e) => Alert.alert('Tidak bisa diaktifkan', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const strategy = strategyQ.data;
  const { focus } = usePeriodFocus();
  const strategyPast = strategy ? cardPeriodStatus(strategy, focus) === 'past' : false;
  const handleAddInitiative = () => {
    if (strategyPast) {
      showPastPeriodAlert(strategy?.name);
      return;
    }
    confirmAddDescendantIfIncomplete({
      compliance,
      parentLabel: strategy?.name ?? 'Strategy',
      childLabel: 'Initiative',
      onProceed: () => router.push(`/initiative/new?strategyId=${id}` as Href),
    });
  };

  function handleActivate() {
    if (strategy && guardActivationFields('strategy', strategy)) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Initiative',
      onAddChild: () => router.push(`/initiative/new?strategyId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: strategy?.name ?? 'Strategy' }} />
      <View className="gap-5 p-5">
        {strategyQ.isLoading || !strategy ? (
          strategyQ.isError ? (
            <ErrorState onRetry={() => strategyQ.refetch()} />
          ) : (
            <SkeletonList count={3} />
          )
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Badge
                    label={PLANNING_STATUS_LABEL[strategy.status] ?? strategy.status}
                    tone={STATUS_TONE[strategy.status]}
                  />
                  <Text className="text-2xl font-bold text-black dark:text-white">{strategy.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={ratioDoneOfChildren(initiatives)}
                  sublabel={childrenSublabel(initiatives)}
                />
              </View>
              <MetaGrid
                items={[
                  {
                    label: 'Periode',
                    value: `${strategy.period_start ?? '—'} → ${strategy.period_end ?? '—'}`,
                  },
                ]}
              />
            </View>

            {strategy.description ? <DetailField label="Deskripsi" value={strategy.description} /> : null}
            <DetailField label="Alasan" value={strategy.reason || '—'} />
            <DetailField label="Risiko Utama" value={strategy.main_risk || '—'} />
            <DetailField label="Alternatif" value={strategy.alternative || '—'} />

            <MbrCompletionIndicator compliance={compliance} />

            {strategy.status === 'draft' ? (
              <Button
                label="Aktifkan Strategy"
                onPress={handleActivate}
                loading={activateM.isPending}
              />
            ) : null}

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-black dark:text-white">Initiative</Text>
                <Button
                  label="+ Tambah Initiative"
                  variant="secondary"
                  onPress={handleAddInitiative}
                />
              </View>

              {initiativesLoading ? (
                <SkeletonList count={2} />
              ) : initiativesError ? (
                <ErrorState onRetry={() => refetchInitiatives()} />
              ) : initiatives.length > 0 ? (
                initiatives.map((item) => (
                  <InitiativeRow
                    key={item.id}
                    item={item}
                    onPress={() => router.push(`/initiative/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Initiative"
                  description="Turunkan Strategy ini menjadi Initiative konkret lalu pecah jadi Action Plan."
                />
              )}
            </View>

            <ActivityLogPanel entityType="strategy" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}
