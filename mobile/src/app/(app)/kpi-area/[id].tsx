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
  ProgressOrb,
  SectionCard,
  SkeletonList,
} from '@/components/ui';
import { childrenSublabel, ratioDoneOfChildren } from '@/lib/progress';
import { UserPicker } from '@/components/user-picker';
import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { usePerson, useStrategies } from '@/hooks/use-workspace';
import {
  PLANNING_STATUS_LABEL,
  STATUS_TONE,
  activateKpiArea,
  getKpiArea,
  updateKpiArea,
  type KpiAreaPatch,
  type PersonRef,
} from '@/lib/kpi-areas';
import type { Strategy } from '@/lib/strategies';

type Person = NonNullable<PersonRef>;

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
 * Editor kelengkapan KPI Area Draft (Target & PIC wajib saat aktivasi). Dirender hanya setelah KPI Area
 * dimuat & berstatus draft → useState ter-init benar tanpa effect sinkronisasi. `initialPic` (PIC tersimpan,
 * mis. warisan dari Goal Wizard) jadi nilai awal picker; bisa diubah agar Draft tanpa PIC tetap bisa aktif.
 */
function DraftCompletion({
  initialTarget,
  initialPic,
  onSave,
  saving,
  onActivate,
  activating,
}: {
  initialTarget: string;
  initialPic: PersonRef;
  onSave: (patch: KpiAreaPatch) => void;
  saving: boolean;
  onActivate: () => void;
  activating: boolean;
}) {
  const [target, setTarget] = useState(initialTarget);
  const [pic, setPic] = useState<Person | null>(null);
  const unchanged = target.trim() === initialTarget && pic === null;
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
      <UserPicker label="PIC / Owner" value={pic ?? initialPic} onChange={setPic} required />
      <Button
        label="Simpan Kelengkapan"
        variant="secondary"
        onPress={() => onSave({ target: target.trim() || null, pic_id: (pic ?? initialPic)?.id ?? null })}
        loading={saving}
        disabled={unchanged}
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

  // Fase 5 — Kelengkapan Perencanaan (MBR). Fail-open di klien: bila data belum tersedia,
  // tombol aktivasi tetap berjalan; server (RPC activate_kpi_area) penegak akhir.
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('kpi_area', id);

  useFocusEffect(
    useCallback(() => {
      kpiAreaQ.refetch();
      refetchStrategies();
      refetchCompliance(); // indikator Kelengkapan ikut segar setelah tambah/arsip Strategy
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
  // PIC tersimpan (mis. warisan Goal Wizard) untuk prefill picker editor.
  const { person: currentPic } = usePerson(kpiArea?.pic_id);

  function handleActivate() {
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Strategy',
      onAddChild: () => router.push(`/strategy/new?kpiAreaId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  // Target & PIC wajib saat aktivasi. KPI Area dari Goal Wizard bisa lahir tanpa Target/PIC → editor
  // inline (DraftCompletion) agar bisa dilengkapi sebelum aktivasi; tanpa ini Draft template terjebak.
  const saveM = useMutation({
    mutationFn: (patch: KpiAreaPatch) => updateKpiArea(id, patch),
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
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Badge
                    label={PLANNING_STATUS_LABEL[kpiArea.status] ?? kpiArea.status}
                    tone={STATUS_TONE[kpiArea.status]}
                  />
                  <Text className="text-2xl font-bold text-black dark:text-white">{kpiArea.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={ratioDoneOfChildren(strategies)}
                  sublabel={childrenSublabel(strategies)}
                />
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

            <MbrCompletionIndicator compliance={compliance} />

            {kpiArea.status === 'draft' ? (
              <DraftCompletion
                initialTarget={kpiArea.target ?? ''}
                initialPic={currentPic}
                onSave={(patch) => saveM.mutate(patch)}
                saving={saveM.isPending}
                onActivate={handleActivate}
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
