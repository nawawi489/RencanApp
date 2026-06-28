import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, View } from 'react-native-css/components';

import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { Badge, Button, EmptyState, ErrorState, MetaGrid, ProgressOrb, SectionCard, SkeletonList } from '@/components/ui';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useProfile } from '@/hooks/use-profile';
import { childrenSublabel, ratioDoneOfChildren } from '@/lib/progress';
import {
  ACTION_PLAN_STATUS_LABEL,
  INITIATIVE_STATUS_LABEL,
  PRIORITY_LABEL,
  STATUS_TONE,
  activateInitiative,
  getInitiative,
  listActionPlans,
  type ActionPlanWithPeople,
} from '@/lib/cards';
import { personLabel } from '@/components/user-picker';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { confirmAddDescendantIfIncomplete, guardActivationFields } from '@/lib/activation-check';

function ActionPlanRow({ item, onPress }: { item: ActionPlanWithPeople; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge
          label={ACTION_PLAN_STATUS_LABEL[item.status] ?? item.status}
          tone={STATUS_TONE[item.status]}
        />
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          PIC: {item.pic ? personLabel(item.pic) : '—'}
        </Text>
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">
          Reviewer: {item.reviewer ? personLabel(item.reviewer) : '—'}
        </Text>
        {item.deadline ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">⏰ {item.deadline}</Text>
        ) : null}
        {item.priority ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            {PRIORITY_LABEL[item.priority] ?? item.priority}
          </Text>
        ) : null}
      </View>
    </SectionCard>
  );
}

export default function InitiativeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useProfile();

  const initiativeQ = useQuery({ queryKey: ['initiative', id], queryFn: () => getInitiative(id) });
  const plansQ = useQuery({ queryKey: ['action-plans', id], queryFn: () => listActionPlans(id) });
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('initiative', id);

  useFocusEffect(
    useCallback(() => {
      initiativeQ.refetch();
      plansQ.refetch();
      refetchCompliance(); // indikator Kelengkapan ikut segar setelah tambah/arsip Action Plan
    }, [initiativeQ, plansQ, refetchCompliance]),
  );

  const activateM = useMutation({
    mutationFn: () => activateInitiative(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['initiative', id] });
      qc.invalidateQueries({ queryKey: ['initiatives'] });
    },
    onError: (e) => Alert.alert('Tidak bisa diaktifkan', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const initiative = initiativeQ.data;
  const { focus } = usePeriodFocus();
  const initPast = initiative ? cardPeriodStatus(initiative, focus) === 'past' : false;
  const handleAddActionPlan = () => {
    if (initPast) {
      showPastPeriodAlert(initiative?.name);
      return;
    }
    confirmAddDescendantIfIncomplete({
      compliance,
      parentLabel: initiative?.name ?? 'Initiative',
      childLabel: 'Action Plan',
      onProceed: () => router.push(`/action-plan/new?initiativeId=${id}` as Href),
    });
  };

  function handleActivate() {
    if (initiative && guardActivationFields('initiative', initiative)) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Action Plan',
      onAddChild: () => router.push(`/action-plan/new?initiativeId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: initiative?.name ?? 'Initiative' }} />
      <View className="gap-5 p-5">
        {initiativeQ.isLoading || !initiative ? (
          <SkeletonList count={3} />
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <View className="flex-row items-start gap-3">
                <View className="flex-1 gap-1">
                  <Badge
                    label={INITIATIVE_STATUS_LABEL[initiative.status] ?? initiative.status}
                    tone={STATUS_TONE[initiative.status]}
                  />
                  <Text className="text-2xl font-bold text-black dark:text-white">{initiative.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={ratioDoneOfChildren(plansQ.data ?? [])}
                  sublabel={childrenSublabel(plansQ.data ?? [])}
                />
              </View>
              <MetaGrid
                items={[
                  { label: 'Target Hasil', value: initiative.target_result || '—' },
                  {
                    label: 'Periode',
                    value: `${initiative.period_start ?? '—'} → ${initiative.period_end ?? '—'}`,
                  },
                ]}
              />
            </View>

            {initiative.description ? (
              <SectionCard>
                <Text className="text-sm font-bold text-black dark:text-white">Deskripsi</Text>
                <Text className="text-base text-black dark:text-white">{initiative.description}</Text>
              </SectionCard>
            ) : null}

            <MbrCompletionIndicator compliance={compliance} />

            {initiative.status === 'draft' ? (
              <Button
                label="Aktifkan Initiative"
                onPress={handleActivate}
                loading={activateM.isPending}
              />
            ) : null}

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-black dark:text-white">Action Plan</Text>
                {can('create_action_plan') ? (
                  <Button
                    label="+ Tambah"
                    variant="secondary"
                    onPress={handleAddActionPlan}
                  />
                ) : null}
              </View>

              {plansQ.isLoading ? (
                <SkeletonList count={2} />
              ) : plansQ.isError ? (
                <ErrorState onRetry={() => plansQ.refetch()} />
              ) : plansQ.data && plansQ.data.length > 0 ? (
                plansQ.data.map((item) => (
                  <ActionPlanRow
                    key={item.id}
                    item={item}
                    onPress={() => router.push(`/action-plan/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Action Plan"
                  description="Pecah Initiative ini menjadi pekerjaan konkret dengan PIC, Reviewer, dan deadline."
                />
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
