import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { ActivityLogPanel } from '@/components/activity-log-panel';
import { DetailChildRow } from '@/components/detail-child-row';
import { DetailField } from '@/components/detail-field';
import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  MetaGrid,
  SkeletonList,
} from '@/components/ui';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useProblemStatementActionPlans } from '@/hooks/use-workspace';
import { INITIATIVE_STATUS_LABEL, STATUS_TONE as INIT_TONE } from '@/lib/cards';
import {
  PLANNING_STATUS_LABEL,
  STATUS_TONE,
  activateProblemStatement,
  getProblemStatement,
} from '@/lib/problem-statements';
import { guardActivationFields } from '@/lib/activation-check';
import { alertFriendlyError } from '@/lib/errors';

export function LiveProblemStatementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const psQ = useQuery({
    queryKey: ['problem_statement', id],
    queryFn: () => getProblemStatement(id),
  });
  const {
    action_plans,
    isLoading: action_plansLoading,
    isError: action_plansError,
    refetch: refetchActionPlans,
  } = useProblemStatementActionPlans(id);
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('problem_statement', id);

  useFocusEffect(
    useCallback(() => {
      psQ.refetch();
      refetchActionPlans();
      refetchCompliance();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const activateM = useMutation({
    mutationFn: () => activateProblemStatement(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['problem_statement', id] });
      qc.invalidateQueries({ queryKey: ['problem_statements'] });
    },
    onError: (e) =>
      alertFriendlyError('Tidak bisa diaktifkan', e, 'Problem Statement belum bisa diaktifkan. Coba lagi.'),
  });

  const ps = psQ.data;
  // WSA-08 §14.4 — CTA "+ Tambah Rencana Aksi" dihapus; tambah turunan hanya dari tree Workspace.

  function handleActivate() {
    if (ps && guardActivationFields('problem_statement', ps)) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Rencana Aksi',
      onAddChild: () => router.push(`/action_plan/new?problemStatementId=${id}` as Href),
    });
    if (blocked) return;
    activateM.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: ps?.name ?? 'Problem Statement' }} />
      <View className="gap-5 p-5">
        {psQ.isLoading || !ps ? (
          psQ.isError ? (
            <ErrorState onRetry={() => psQ.refetch()} />
          ) : (
            <SkeletonList count={3} />
          )
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <View className="gap-1">
                <Badge
                  label={PLANNING_STATUS_LABEL[ps.status] ?? ps.status}
                  tone={STATUS_TONE[ps.status]}
                />
                <Text className="text-2xl font-bold text-black dark:text-white">{ps.name}</Text>
              </View>
              <MetaGrid
                items={[
                  {
                    label: 'Periode',
                    value: `${ps.period_start ?? '—'} → ${ps.period_end ?? '—'}`,
                  },
                  {
                    label: 'Dampak',
                    value:
                      ps.impact === 'high'
                        ? 'High'
                        : ps.impact === 'medium'
                          ? 'Medium'
                          : ps.impact === 'low'
                            ? 'Low'
                            : '—',
                  },
                ]}
              />
            </View>

            {ps.description ? <DetailField label="Deskripsi" value={ps.description} /> : null}
            {ps.initial_evidence ? (
              <DetailField label="Bukti Awal" value={ps.initial_evidence} />
            ) : null}

            <MbrCompletionIndicator compliance={compliance} />

            {ps.status === 'draft' ? (
              <Button
                label="Aktifkan Problem Statement"
                onPress={handleActivate}
                loading={activateM.isPending}
              />
            ) : null}

            <View className="gap-3">
              <Text className="text-lg font-bold text-black dark:text-white">Rencana Aksi</Text>

              {action_plansLoading ? (
                <SkeletonList count={2} />
              ) : action_plansError ? (
                <ErrorState onRetry={() => refetchActionPlans()} />
              ) : action_plans.length > 0 ? (
                action_plans.map((item) => (
                  <DetailChildRow
                    key={item.id}
                    name={item.name}
                    statusLabel={INITIATIVE_STATUS_LABEL[item.status] ?? item.status}
                    statusTone={INIT_TONE[item.status]}
                    onPress={() => router.push(`/action_plan/${item.id}` as Href)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Rencana Aksi"
                  description="Turunkan Problem Statement ini menjadi Rencana Aksi konkret lalu pecah jadi Tugas."
                />
              )}
            </View>

            <ActivityLogPanel entityType="problem_statement" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function ProblemStatementDetailRoute() {
  return <LiveProblemStatementDetailScreen />;
}
