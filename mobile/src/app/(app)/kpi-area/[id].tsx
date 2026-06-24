import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LabeledInput,
  MetaGrid,
  SectionCard,
  SkeletonList,
} from '@/components/ui';
import { useStrategies } from '@/hooks/use-workspace';
import { PLANNING_STATUS_LABEL, STATUS_TONE, activateKpiArea, getKpiArea, updateKpiArea } from '@/lib/kpi-areas';
import type { Strategy } from '@/lib/strategies';

function StrategyRow({ item, onPress }: { item: Strategy; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge label={PLANNING_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
      </View>
    </SectionCard>
  );
}

/**
 * Editor kelengkapan KPI Area Draft (Target wajib saat aktivasi). Dirender hanya setelah KPI Area
 * dimuat & berstatus draft → useState(initialTarget) ter-init benar tanpa effect sinkronisasi.
 */
function DraftCompletion({
  initialTarget,
  onSaveTarget,
  savingTarget,
  onActivate,
  activating,
}: {
  initialTarget: string;
  onSaveTarget: (t: string) => void;
  savingTarget: boolean;
  onActivate: () => void;
  activating: boolean;
}) {
  const [target, setTarget] = useState(initialTarget);
  return (
    <SectionCard>
      <Text className="text-sm font-bold text-black dark:text-white">Lengkapi sebelum aktivasi</Text>
      <LabeledInput
        label="Target"
        value={target}
        onChangeText={setTarget}
        required
        placeholder="mis. Naik 20% YoY"
        multiline
      />
      <Button
        label="Simpan Target"
        variant="secondary"
        onPress={() => onSaveTarget(target)}
        loading={savingTarget}
        disabled={target.trim() === initialTarget}
      />
      <Button label="Aktifkan KPI Area" onPress={onActivate} loading={activating} />
    </SectionCard>
  );
}

export default function KpiAreaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const kpiAreaQ = useQuery({ queryKey: ['kpi_area', id], queryFn: () => getKpiArea(id) });
  const { strategies, isLoading: strategiesLoading, isError: strategiesError, refetch: refetchStrategies } =
    useStrategies(id);

  useFocusEffect(
    useCallback(() => {
      kpiAreaQ.refetch();
      refetchStrategies();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const activateM = useMutation({
    mutationFn: () => activateKpiArea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi_area', id] });
      qc.invalidateQueries({ queryKey: ['kpi_areas'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: (e) => Alert.alert('Tidak bisa diaktifkan', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const kpiArea = kpiAreaQ.data;

  // Target wajib saat aktivasi. KPI Area dari Goal Wizard lahir tanpa Target (null) → editor inline
  // (DraftCompletion) agar bisa dilengkapi sebelum aktivasi; tanpa ini KPI Area template terjebak Draft.
  const saveTargetM = useMutation({
    mutationFn: (t: string) => updateKpiArea(id, { target: t.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi_area', id] });
      qc.invalidateQueries({ queryKey: ['kpi_areas'] });
    },
    onError: (e) => Alert.alert('Gagal menyimpan', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: kpiArea?.name ?? 'KPI Area' }} />
      <View className="gap-5 p-5">
        {kpiAreaQ.isLoading || !kpiArea ? (
          kpiAreaQ.isError ? (
            <ErrorState onRetry={() => kpiAreaQ.refetch()} />
          ) : (
            <SkeletonList count={3} />
          )
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <View className="gap-1">
                <Badge
                  label={PLANNING_STATUS_LABEL[kpiArea.status] ?? kpiArea.status}
                  tone={STATUS_TONE[kpiArea.status]}
                />
                <Text className="text-2xl font-bold text-black dark:text-white">{kpiArea.name}</Text>
              </View>
              <MetaGrid
                items={[
                  { label: 'Target', value: kpiArea.target || '—' },
                  {
                    label: 'Periode',
                    value: `${kpiArea.period_start ?? '—'} → ${kpiArea.period_end ?? '—'}`,
                  },
                ]}
              />
            </View>

            {kpiArea.description ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Deskripsi</Text>
                <Text className="text-base text-black dark:text-white">{kpiArea.description}</Text>
              </SectionCard>
            ) : null}

            {kpiArea.status === 'draft' ? (
              <DraftCompletion
                initialTarget={kpiArea.target ?? ''}
                onSaveTarget={(t) => saveTargetM.mutate(t)}
                savingTarget={saveTargetM.isPending}
                onActivate={() => activateM.mutate()}
                activating={activateM.isPending}
              />
            ) : null}

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-black dark:text-white">Strategy</Text>
                <Button
                  label="+ Tambah Strategy"
                  variant="secondary"
                  onPress={() => router.push(`/strategy/new?kpiAreaId=${id}` as Href)}
                />
              </View>

              {strategiesLoading ? (
                <SkeletonList count={2} />
              ) : strategiesError ? (
                <ErrorState onRetry={() => refetchStrategies()} />
              ) : strategies.length > 0 ? (
                strategies.map((item) => (
                  <StrategyRow
                    key={item.id}
                    item={item}
                    onPress={() => router.push(`/strategy/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Strategy"
                  description="Turunkan KPI Area ini menjadi Strategy konkret beserta alasan, risiko, dan alternatifnya."
                />
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
