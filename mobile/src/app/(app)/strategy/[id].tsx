import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { ActivityLogPanel } from '@/components/activity-log-panel';
import { CardHelpTrigger } from '@/components/card-help-trigger';
import { DetailChildRow } from '@/components/detail-child-row';
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
import { childrenSublabel, ratioDoneOfChildren, treeOrbLabel } from '@/lib/progress';
import { getStrategyCurrentValue, listStrategyResultValueSources, type KpiResultValueSource } from '@/lib/cards';
import { computeKpiGap, formatRemaining, groupThousands } from '@/lib/strategy-gap';
import { REVIEW_STATUS, formatDateTime } from '@/components/submission-card';
import { useProfile } from '@/hooks/use-profile';
import { UserPicker } from '@/components/user-picker';
import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { StrategyBreakdownPanel } from '@/components/strategy-breakdown-panel';
import { guardActivationFields } from '@/lib/activation-check';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { alertFriendlyError } from '@/lib/errors';
import { useCardProgress, usePerson, useInitiatives } from '@/hooks/use-workspace';
import {
  PLANNING_STATUS_LABEL,
  STATUS_TONE,
  activateStrategy,
  getStrategy,
  updateStrategy,
  type StrategyPatch,
  type PersonRef,
} from '@/lib/strategies';
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
        {resultValueLabel(pending)} · dari {pending.submission?.task?.name ?? 'Tugas'}
      </Text>
      <Button label="Buka Review" variant="secondary" onPress={onOpenReview} />
    </SectionCard>
  );
}

/** UI-S-KD3 — sumber Nilai Hasil (submission per Tugas) yang membentuk "Capaian vs Target" di atas. */
function SumberNilaiHasilPanel({
  sources,
  onOpenTask,
}: {
  sources: KpiResultValueSource[];
  onOpenTask: (taskId: string) => void;
}) {
  const { profile } = useProfile();
  return (
    <SectionCard>
      <Text className="text-sm font-bold text-black dark:text-white">Sumber Nilai Hasil</Text>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Submission Tugas yang berkontribusi ke nilai di atas, terbaru dahulu.
      </Text>
      <View className="gap-2 pt-1">
        {sources.map((s) => {
          const status = REVIEW_STATUS[s.submission?.review_status ?? 'pending'] ?? REVIEW_STATUS.pending;
          const apId = s.submission?.task_id;
          return (
            <Pressable
              key={s.id}
              disabled={!apId}
              onPress={() => apId && onOpenTask(apId)}
              accessibilityRole={apId ? 'button' : undefined}
              accessibilityLabel={`Buka Tugas ${s.submission?.task?.name ?? ''}`}
              className="gap-0.5 rounded-xl bg-neutral-50 px-3 py-2 active:opacity-70 dark:bg-neutral-900">
              <View className="flex-row items-start justify-between gap-2">
                <Text className="flex-1 text-sm font-medium text-black dark:text-white" numberOfLines={1}>
                  {s.submission?.task?.name ?? 'Tugas'}
                </Text>
                <Badge label={status.label} tone={status.tone} />
              </View>
              <View className="flex-row items-center justify-between gap-2">
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  {resultValueLabel(s)}
                </Text>
                <Text className="text-[11px] text-neutral-400">
                  {s.submission ? formatDateTime(s.submission.submitted_at, profile?.org_timezone) : '—'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </SectionCard>
  );
}

/**
 * Editor kelengkapan Strategi Draft (Target & PIC wajib saat aktivasi). Dirender hanya setelah Strategi
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
  onSave: (patch: StrategyPatch) => void;
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
      <Button label="Aktifkan Strategi" onPress={onActivate} loading={activating} />
    </SectionCard>
  );
}

export function LiveStrategyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useProfile();

  const strategyQ = useQuery({ queryKey: ['strategy', id], queryFn: () => getStrategy(id) });
  const { progressOf, measuredOf } = useCardProgress([id]);
  // 0032 — nilai agregat approved untuk "% capaian vs target" (hanya relevan bila target_numeric diisi).
  const currentValueQ = useQuery({
    queryKey: ['strategy_current_value', id],
    queryFn: () => getStrategyCurrentValue(id),
  });
  // UI-S-KD2/KD3 — sumber Nilai Hasil lintas Tugas (proposed pending + riwayat approved/rejected).
  const resultSourcesQ = useQuery({
    queryKey: ['strategy_result_sources', id],
    queryFn: () => listStrategyResultValueSources(id),
  });
  const { initiatives, isLoading: initiativesLoading, isError: initiativesError, refetch: refetchInitiatives } =
    useInitiatives(id);

  // Fase 5 — Kelengkapan Perencanaan (MBR). Fail-open di klien: bila data belum tersedia,
  // tombol aktivasi tetap berjalan; server (RPC activate_strategy) penegak akhir.
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('strategy', id);

  useFocusEffect(
    useCallback(() => {
      strategyQ.refetch();
      currentValueQ.refetch();
      resultSourcesQ.refetch();
      refetchInitiatives();
      refetchCompliance(); // indikator Kelengkapan ikut segar setelah tambah/arsip Inisiatif
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const activateM = useMutation({
    mutationFn: () => activateStrategy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategy', id] });
      qc.invalidateQueries({ queryKey: ['strategies'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
    onError: (e) => alertFriendlyError('Tidak bisa diaktifkan', e, 'Strategi belum bisa diaktifkan. Periksa kelengkapan lalu coba lagi.'),
  });

  const strategy = strategyQ.data;
  // PIC tersimpan (mis. warisan Goal Wizard) untuk prefill picker editor.
  const { person: currentPic } = usePerson(strategy?.pic_id);
  // WSA-08 §14.4 — CTA "+ Tambah Inisiatif" dihapus; tambah turunan hanya dari tree Workspace.

  async function handleActivate() {
    const orgId = profile?.organization_id ?? '';
    if (strategy && (await guardActivationFields(orgId, 'strategy', strategy))) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Inisiatif',
      onAddChild: () => router.push(`/action-plan/new?strategyId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  // Target & PIC wajib saat aktivasi. Strategi dari Goal Wizard bisa lahir tanpa Target/PIC → editor
  // inline (DraftCompletion) agar bisa dilengkapi sebelum aktivasi; tanpa ini Draft template terjebak.
  const saveM = useMutation({
    mutationFn: (patch: StrategyPatch) => updateStrategy(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategy', id] });
      qc.invalidateQueries({ queryKey: ['strategies'] });
    },
    onError: (e) => alertFriendlyError('Gagal menyimpan', e, 'Perubahan belum tersimpan. Coba lagi.'),
  });

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: strategy?.name ?? 'Strategi' }} />
      <View className="gap-5 p-5">
        {strategyQ.isLoading || !strategy ? (
          strategyQ.isError ? (
            <ErrorState onRetry={() => strategyQ.refetch()} />
          ) : (
            <SkeletonList count={3} />
          )
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
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
                  value={progressOf(id) ?? ratioDoneOfChildren(initiatives)}
                  label={treeOrbLabel('strategy', measuredOf(id))}
                  sublabel={childrenSublabel(initiatives)}
                />
              </View>
              <MetaGrid
                items={[
                  { label: 'Target', value: strategy.target || '—' },
                  { label: 'Ekspektasi Hasil', value: strategy.expected_outcome || '—' },
                  {
                    label: 'Periode',
                    value: `${strategy.period_start ?? '—'} → ${strategy.period_end ?? '—'}`,
                  },
                ]}
              />
            </View>

            {/* 0032 — Capaian vs Target (hanya bila target numerik diisi). */}
            {strategy.target_numeric != null
              ? (() => {
                  const target = Number(strategy.target_numeric);
                  const current = Number(currentValueQ.data?.numeric_total ?? 0);
                  const unit = strategy.target_unit;
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
                  onOpenReview={() => router.push(`/task/${pending.submission!.task_id}` as Href)}
                />
              ) : null;
            })()}

            {/* UI-S-KD3 — Sumber Nilai Hasil (riwayat submission lintas Tugas). */}
            {resultSourcesQ.data && resultSourcesQ.data.length > 0 ? (
              <SumberNilaiHasilPanel
                sources={resultSourcesQ.data}
                onOpenTask={(apId) => router.push(`/task/${apId}` as Href)}
              />
            ) : null}

            {strategy.description ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Deskripsi</Text>
                <Text className="text-base text-black dark:text-white">{strategy.description}</Text>
              </SectionCard>
            ) : null}

            <MbrCompletionIndicator compliance={compliance} />

            <StrategyBreakdownPanel
              strategyId={id}
              picId={strategy.pic_id}
              createdBy={strategy.created_by}
            />

            {strategy.status === 'draft' ? (
              <DraftCompletion
                initialTarget={strategy.target ?? ''}
                initialPic={currentPic}
                onSave={(patch) => saveM.mutate(patch)}
                saving={saveM.isPending}
                onActivate={handleActivate}
                activating={activateM.isPending}
              />
            ) : null}

            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-bold text-black dark:text-white">Inisiatif</Text>
                <CardHelpTrigger topic="initiative" />
              </View>

              {initiativesLoading ? (
                <SkeletonList count={2} />
              ) : initiativesError ? (
                <ErrorState onRetry={() => refetchInitiatives()} />
              ) : initiatives.length > 0 ? (
                initiatives.map((item) => (
                  <DetailChildRow
                    key={item.id}
                    name={item.name}
                    statusLabel={PLANNING_STATUS_LABEL[item.status] ?? item.status}
                    statusTone={STATUS_TONE[item.status]}
                    onPress={() => router.push(`/initiative/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Inisiatif"
                  description="Turunkan Strategi ini menjadi Inisiatif konkret beserta alasan, risiko, dan alternatifnya."
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

export default function StrategyDetailRoute() {
  return <LiveStrategyDetailScreen />;
}
