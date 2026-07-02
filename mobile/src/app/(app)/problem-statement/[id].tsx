import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
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
import { useProblemStatementInitiatives } from '@/hooks/use-workspace';
import { INITIATIVE_STATUS_LABEL, STATUS_TONE as INIT_TONE, type Initiative } from '@/lib/cards';
import {
  PLANNING_STATUS_LABEL,
  STATUS_TONE,
  activateProblemStatement,
  getProblemStatement,
} from '@/lib/problem-statements';
import { cardPeriodStatus, showPastPeriodAlert } from '@/lib/period-focus';
import { usePeriodFocus } from '@/providers/period-focus-provider';
import { confirmAddDescendantIfIncomplete, guardActivationFields } from '@/lib/activation-check';
import { useProfile } from '@/hooks/use-profile';
import { alertFriendlyError } from '@/lib/errors';
import { StackScreenAdapter } from '@/prototype/adapters/stack-screen-adapter';
import PrototypeProblemStatementDetailScreen from '@/prototype/screens/problem-statement-detail';

function InitiativeRow({ item, onPress }: { item: Initiative; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge
          label={INITIATIVE_STATUS_LABEL[item.status] ?? item.status}
          tone={INIT_TONE[item.status]}
        />
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

export function LiveProblemStatementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const psQ = useQuery({
    queryKey: ['problem_statement', id],
    queryFn: () => getProblemStatement(id),
  });
  const {
    initiatives,
    isLoading: initiativesLoading,
    isError: initiativesError,
    refetch: refetchInitiatives,
  } = useProblemStatementInitiatives(id);
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('problem_statement', id);
  const { can } = useProfile();
  const canAddInitiative = can('create_initiative'); // WSA-08 — gate CTA tambah turunan

  useFocusEffect(
    useCallback(() => {
      psQ.refetch();
      refetchInitiatives();
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
  const { focus } = usePeriodFocus();
  const psPast = ps ? cardPeriodStatus(ps, focus) === 'past' : false;
  const handleAddInitiative = () => {
    if (psPast) {
      showPastPeriodAlert(ps?.name);
      return;
    }
    confirmAddDescendantIfIncomplete({
      compliance,
      parentLabel: ps?.name ?? 'Problem Statement',
      childLabel: 'Initiative',
      onProceed: () => router.push(`/initiative/new?problemStatementId=${id}` as Href),
    });
  };

  function handleActivate() {
    if (ps && guardActivationFields('problem_statement', ps)) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Initiative',
      onAddChild: () => router.push(`/initiative/new?problemStatementId=${id}` as Href),
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
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-black dark:text-white">Initiative</Text>
                {canAddInitiative ? (
                  <Button
                    label="+ Tambah Initiative"
                    variant="secondary"
                    onPress={handleAddInitiative}
                  />
                ) : null}
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
                  description="Turunkan Problem Statement ini menjadi Initiative konkret lalu pecah jadi Action Plan."
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
  return (
    <StackScreenAdapter
      live={LiveProblemStatementDetailScreen}
      prototype={PrototypeProblemStatementDetailScreen}
    />
  );
}
