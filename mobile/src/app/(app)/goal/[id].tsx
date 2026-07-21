import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { ActivityLogPanel } from '@/components/activity-log-panel';
import { CardHelpTrigger } from '@/components/card-help-trigger';
import { DetailChildRow } from '@/components/detail-child-row';
import { Badge, Button, EmptyState, ErrorState, MetaGrid, ProgressBar, ProgressOrb, SectionCard, SkeletonList } from '@/components/ui';
import { useCardProgress, useGoal, useGoalActions, useStrategies } from '@/hooks/use-workspace';
import { PLANNING_STATUS_LABEL, STATUS_TONE } from '@/lib/goals';
import { childrenSublabel, measuredStrategiesSublabel, ratioActiveOfChildren, ratioDoneOfChildren, treeOrbLabel } from '@/lib/progress';
import { guardActivationFields } from '@/lib/activation-check';
import { useProfile } from '@/hooks/use-profile';
import { alertFriendlyError } from '@/lib/errors';

export function LiveGoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goalQ = useGoal(id);
  const kpiQ = useStrategies(id);
  const { activate, restore, activatePending, restorePending } = useGoalActions();
  const { progressOf, measuredOf } = useCardProgress([id]);
  const { profile } = useProfile();
  const orgId = profile?.organization_id ?? '';
  // WSA-08 §14.4 — CTA "+ Tambah" dihapus dari detail page; tambah turunan HANYA dari tree Workspace.

  useFocusEffect(
    useCallback(() => {
      goalQ.refetch();
      kpiQ.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const goal = goalQ.goal;

  async function onActivate() {
    if (goalQ.goal && (await guardActivationFields(orgId, 'goal', goalQ.goal))) return;
    try {
      await activate(id);
    } catch (e) {
      alertFriendlyError('Tidak bisa diaktifkan', e, 'Goal butuh minimal 1 Strategi sebelum diaktifkan.');
    }
  }

  // PRD §50: pulihkan Strategi dari template yang belum ada (idempoten, tak menimpa data aktif).
  async function onRestore() {
    try {
      const added = await restore(id);
      Alert.alert('Pulihkan dari template', added > 0 ? `${added} Strategi ditambahkan.` : 'Semua item template sudah ada.');
    } catch (e) {
      alertFriendlyError('Gagal', e, 'Terjadi kesalahan. Coba lagi.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: goal?.name ?? 'Goal' }} />
      <View className="gap-5 p-5">
        {goalQ.isLoading ? (
          <SkeletonList count={3} />
        ) : goalQ.isError ? (
          <ErrorState onRetry={() => goalQ.refetch()} />
        ) : !goal ? (
          // null (bukan error): getGoal maybeSingle → id di luar akses/tidak ada. Retry tak menolong.
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Badge
                    label={PLANNING_STATUS_LABEL[goal.status] ?? goal.status}
                    tone={STATUS_TONE[goal.status]}
                  />
                  <Text className="text-2xl font-bold text-black dark:text-white">{goal.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={progressOf(id) ?? ratioDoneOfChildren(kpiQ.strategies ?? [])}
                  label={treeOrbLabel('goal', measuredOf(id))}
                  sublabel={measuredOf(id) ? measuredStrategiesSublabel(kpiQ.strategies ?? []) : childrenSublabel(kpiQ.strategies ?? [])}
                />
              </View>
              <MetaGrid
                items={[
                  {
                    label: 'Periode',
                    value: `${goal.period_start ?? '—'} → ${goal.period_end ?? '—'}`,
                  },
                  { label: 'PIC', value: goal.pic_id ? 'Ditetapkan' : '—' },
                  { label: 'Target Tahunan', value: goal.target_value ?? '—' },
                ]}
              />
            </View>

            <SectionCard>
              <Text className="text-sm font-bold text-black dark:text-white">
                {measuredOf(id) ? 'Progress vs Capaian' : 'Progress kerja'}
              </Text>
              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">Progress kerja</Text>
                  <Text className="text-xs font-semibold text-black dark:text-white">
                    {ratioActiveOfChildren(kpiQ.strategies ?? [])}%
                  </Text>
                </View>
                <ProgressBar value={ratioActiveOfChildren(kpiQ.strategies ?? [])} tone="brand" />
              </View>
              {measuredOf(id) && progressOf(id) != null ? (
                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-neutral-500 dark:text-neutral-400">Capaian hasil</Text>
                    <Text className="text-xs font-semibold text-black dark:text-white">
                      {progressOf(id)}%
                    </Text>
                  </View>
                  <ProgressBar value={progressOf(id)!} tone="success" />
                </View>
              ) : null}
            </SectionCard>

            {goal.description ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Deskripsi</Text>
                <Text className="text-base text-black dark:text-white">{goal.description}</Text>
              </SectionCard>
            ) : null}

            {goal.status === 'draft' ? (
              <Button label="Aktifkan Goal" onPress={onActivate} loading={activatePending} />
            ) : null}

            {goal.goal_template_id ? (
              <Button
                label="Pulihkan item dari template"
                variant="secondary"
                onPress={onRestore}
                loading={restorePending}
              />
            ) : null}

            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-lg font-bold text-black dark:text-white">Strategi</Text>
                <CardHelpTrigger topic="strategy" />
              </View>

              {kpiQ.isLoading ? (
                <SkeletonList count={2} />
              ) : kpiQ.isError ? (
                <ErrorState onRetry={() => kpiQ.refetch()} />
              ) : kpiQ.strategies.length > 0 ? (
                kpiQ.strategies.map((item) => (
                  <DetailChildRow
                    key={item.id}
                    name={item.name}
                    statusLabel={PLANNING_STATUS_LABEL[item.status] ?? item.status}
                    statusTone={STATUS_TONE[item.status]}
                    onPress={() => router.push(`/strategy/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Strategi"
                  description="Pecah Goal ini menjadi Strategi terukur, lalu turunkan jadi Inisiatif dan Rencana Aksi."
                />
              )}
            </View>

            <ActivityLogPanel entityType="goal" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function GoalDetailRoute() {
  return <LiveGoalDetailScreen />;
}
