import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { ActivityLogPanel } from '@/components/activity-log-panel';
import { CardHelpTrigger } from '@/components/card-help-trigger';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LabeledInput,
  MetaGrid,
  ProgressBar,
  ProgressOrb,
  SectionCard,
  SkeletonList,
} from '@/components/ui';
import { childrenSublabel, ratioDoneOfChildren } from '@/lib/progress';
import { getKpiAreaCurrentValue, listKpiAreaResultValueSources, type KpiResultValueSource } from '@/lib/cards';
import { computeKpiGap, formatRemaining, groupThousands } from '@/lib/kpi-gap';
import { REVIEW_STATUS, formatDateTime } from '@/components/submission-card';
import { UserPicker } from '@/components/user-picker';
import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { KpiAreaBreakdownPanel } from '@/components/kpi-area-breakdown-panel';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { confirmAddDescendantIfIncomplete, guardActivationFields } from '@/lib/activation-check';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { usePerson, useStrategies } from '@/hooks/use-workspace';
import { StackScreenAdapter } from '@/prototype/adapters/stack-screen-adapter';
import PrototypeKpiAreaDetailScreen from '@/prototype/screens/kpi-area-detail';
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

function resultValueLabel(v: KpiResultValueSource): string {
  if (v.value_numeric != null) return groupThousands(v.value_numeric);
  return v.value_text?.trim() || '—';
}

/** UI-S-KD2 — Nilai Hasil yang sudah diajukan tapi belum direview reviewer (proposed vs current). */
function NilaiHasilCard({ pending, onOpenReview }: { pending: KpiResultValueSource; onOpenReview: () => void }) {
  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold text-black dark:text-white">Nilai Hasil Diajukan</Text>
        <Badge label="Menunggu Review" tone="warn" />
      </View>
      <Text className="text-sm text-neutral-600 dark:text-neutral-400">
        {resultValueLabel(pending)} · dari {pending.submission?.action_plan?.name ?? 'Action Plan'}
      </Text>
      <Button label="Buka Review" variant="secondary" onPress={onOpenReview} />
    </SectionCard>
  );
}

/** UI-S-KD3 — sumber Nilai Hasil (submission per Action Plan) yang membentuk "Capaian vs Target" di atas. */
function SumberNilaiHasilPanel({
  sources,
  onOpenActionPlan,
}: {
  sources: KpiResultValueSource[];
  onOpenActionPlan: (actionPlanId: string) => void;
}) {
  return (
    <SectionCard>
      <Text className="text-sm font-bold text-black dark:text-white">Sumber Nilai Hasil</Text>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Submission Action Plan yang berkontribusi ke nilai di atas, terbaru dahulu.
      </Text>
      <View className="gap-2 pt-1">
        {sources.map((s) => {
          const status = REVIEW_STATUS[s.submission?.review_status ?? 'pending'] ?? REVIEW_STATUS.pending;
          const apId = s.submission?.action_plan_id;
          return (
            <Pressable
              key={s.id}
              disabled={!apId}
              onPress={() => apId && onOpenActionPlan(apId)}
              accessibilityRole={apId ? 'button' : undefined}
              accessibilityLabel={`Buka Action Plan ${s.submission?.action_plan?.name ?? ''}`}
              className="gap-0.5 rounded-xl bg-neutral-50 px-3 py-2 active:opacity-70 dark:bg-neutral-900">
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-sm font-medium text-black dark:text-white" numberOfLines={1}>
                  {s.submission?.action_plan?.name ?? 'Action Plan'}
                </Text>
                <Badge label={status.label} tone={status.tone} />
              </View>
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  {resultValueLabel(s)}
                </Text>
                <Text className="text-[11px] text-neutral-400">
                  {s.submission ? formatDateTime(s.submission.submitted_at) : '—'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

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

export function LiveKpiAreaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const kpiAreaQ = useQuery({ queryKey: ['kpi_area', id], queryFn: () => getKpiArea(id) });
  // 0032 — nilai agregat approved untuk "% capaian vs target" (hanya relevan bila target_numeric diisi).
  const currentValueQ = useQuery({
    queryKey: ['kpi_area_current_value', id],
    queryFn: () => getKpiAreaCurrentValue(id),
  });
  // UI-S-KD2/KD3 — sumber Nilai Hasil lintas Action Plan (proposed pending + riwayat approved/rejected).
  const resultSourcesQ = useQuery({
    queryKey: ['kpi_area_result_sources', id],
    queryFn: () => listKpiAreaResultValueSources(id),
  });
  const { strategies, isLoading: strategiesLoading, isError: strategiesError, refetch: refetchStrategies } =
    useStrategies(id);

  // Fase 5 — Kelengkapan Perencanaan (MBR). Fail-open di klien: bila data belum tersedia,
  // tombol aktivasi tetap berjalan; server (RPC activate_kpi_area) penegak akhir.
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('kpi_area', id);

  useFocusEffect(
    useCallback(() => {
      kpiAreaQ.refetch();
      currentValueQ.refetch();
      resultSourcesQ.refetch();
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
  const { focus } = usePeriodFocus();
  const kpiPast = kpiArea ? cardPeriodStatus(kpiArea, focus) === 'past' : false;
  const handleAddStrategy = () => {
    if (kpiPast) {
      showPastPeriodAlert(kpiArea?.name);
      return;
    }
    confirmAddDescendantIfIncomplete({
      compliance,
      parentLabel: kpiArea?.name ?? 'KPI Area',
      childLabel: 'Strategy',
      onProceed: () => router.push(`/strategy/new?kpiAreaId=${id}` as Href),
    });
  };

  function handleActivate() {
    if (kpiArea && guardActivationFields('kpi_area', kpiArea)) return;
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
                  { label: 'Ekspektasi Hasil', value: kpiArea.expected_outcome || '—' },
                  {
                    label: 'Periode',
                    value: `${kpiArea.period_start ?? '—'} → ${kpiArea.period_end ?? '—'}`,
                  },
                ]}
              />
            </View>

            {/* 0032 — Capaian vs Target (hanya bila target numerik diisi). */}
            {kpiArea.target_numeric != null
              ? (() => {
                  const target = Number(kpiArea.target_numeric);
                  const current = Number(currentValueQ.data?.numeric_total ?? 0);
                  const unit = kpiArea.target_unit;
                  const gap = computeKpiGap({ targetNumeric: target, current });
                  const unitSuffix = unit ? ` ${unit}` : '';
                  return (
                    <SectionCard>
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-bold text-black dark:text-white">Capaian vs Target</Text>
                        {gap.percent != null ? (
                          <Badge
                            label={`${gap.percent}%`}
                            tone={gap.reached ? 'success' : gap.percent >= 70 ? 'info' : 'warn'}
                          />
                        ) : null}
                      </View>
                      <ProgressBar value={gap.percent ?? 0} showLabel tone={gap.reached ? 'success' : 'brand'} />
                      <Text className="text-sm text-neutral-600 dark:text-neutral-400">
                        {groupThousands(current)}
                        {unitSuffix} dari target {groupThousands(target)}
                        {unitSuffix}
                        {gap.reached ? ' · Target tercapai' : ` · ${formatRemaining(gap.remaining ?? 0, unit)}`}
                      </Text>
                    </SectionCard>
                  );
                })()
              : null}

            {/* UI-S-KD2 — Nilai Hasil yang sudah diajukan tapi menunggu review (ambil yang terbaru). */}
            {(() => {
              const pending = resultSourcesQ.data?.find((s) => s.submission?.review_status === 'pending');
              return pending ? (
                <NilaiHasilCard
                  pending={pending}
                  onOpenReview={() => router.push(`/action-plan/${pending.submission!.action_plan_id}` as Href)}
                />
              ) : null;
            })()}

            {/* UI-S-KD3 — Sumber Nilai Hasil (riwayat submission lintas Action Plan). */}
            {resultSourcesQ.data && resultSourcesQ.data.length > 0 ? (
              <SumberNilaiHasilPanel
                sources={resultSourcesQ.data}
                onOpenActionPlan={(apId) => router.push(`/action-plan/${apId}` as Href)}
              />
            ) : null}

            {kpiArea.description ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Deskripsi</Text>
                <Text className="text-base text-black dark:text-white">{kpiArea.description}</Text>
              </SectionCard>
            ) : null}

            <MbrCompletionIndicator compliance={compliance} />

            <KpiAreaBreakdownPanel
              kpiAreaId={id}
              picId={kpiArea.pic_id}
              createdBy={kpiArea.created_by}
            />

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
                <View className="flex-row items-center gap-2">
                  <Text className="text-lg font-bold text-black dark:text-white">Strategy</Text>
                  <CardHelpTrigger topic="strategy" />
                </View>
                <Button
                  label="+ Tambah Strategy"
                  variant="secondary"
                  onPress={handleAddStrategy}
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

            <ActivityLogPanel entityType="kpi_area" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function KpiAreaDetailRoute() {
  return <StackScreenAdapter live={LiveKpiAreaDetailScreen} prototype={PrototypeKpiAreaDetailScreen} />;
}
