import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { ActivityLogPanel } from '@/components/activity-log-panel';
import { DetailChildRow } from '@/components/detail-child-row';
import { DetailField } from '@/components/detail-field';
import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { StatTile } from '@/components/stat-tile';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  MetaGrid,
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
import { listActionPlansByProblemStatementIds } from '@/lib/cards';
import type { ProblemStatement } from '@/lib/problem-statements';
import { ratioDoneOfChildren } from '@/lib/progress';
import { guardActivationFields } from '@/lib/activation-check';
import { alertFriendlyError } from '@/lib/errors';
import { useProfile } from '@/hooks/use-profile';

/** UI-S-DA2 — Progress (Problem Statement selesai), jumlah Problem Statement, jumlah Rencana Aksi turunan. */
function DevAreaSummaryStrip({
  problemStatements,
  actionPlanCount,
}: {
  problemStatements: ProblemStatement[];
  actionPlanCount: number;
}) {
  const progress = ratioDoneOfChildren(problemStatements);
  return (
    <View className="flex-row gap-2">
      <StatTile
        size="md"
        label="Progress"
        value={`${progress}%`}
        containerCls="bg-blue-100 dark:bg-blue-950"
        textCls="text-blue-700 dark:text-blue-300"
      />
      <StatTile
        size="md"
        label="Problem Statement"
        value={String(problemStatements.length)}
        containerCls="bg-neutral-100 dark:bg-neutral-800"
        textCls="text-neutral-700 dark:text-neutral-300"
      />
      <StatTile
        size="md"
        label="Rencana Aksi"
        value={String(actionPlanCount)}
        containerCls="bg-emerald-100 dark:bg-emerald-950"
        textCls="text-emerald-700 dark:text-emerald-300"
      />
    </View>
  );
}

export function LiveDevelopmentAreaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useProfile();
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

  const psIds = useMemo(() => problemStatements.map((p) => p.id), [problemStatements]);
  const action_plansQ = useQuery({
    queryKey: ['action_plans-by-problem-statements', psIds],
    queryFn: () => listActionPlansByProblemStatementIds(psIds),
    enabled: psIds.length > 0,
  });

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
      alertFriendlyError('Tidak bisa diaktifkan', e, 'Development Area belum bisa diaktifkan. Coba lagi.'),
  });

  const devArea = devAreaQ.data;
  // WSA-08 §14.4 — CTA "+ Tambah Problem Statement" dihapus; tambah turunan hanya dari tree.

  async function handleActivate() {
    const orgId = profile?.organization_id ?? '';
    if (devArea && (await guardActivationFields(orgId, 'development_area', devArea))) return;
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
        {devAreaQ.isLoading ? (
          <SkeletonList count={3} />
        ) : devAreaQ.isError ? (
          <ErrorState onRetry={() => devAreaQ.refetch()} />
        ) : !devArea ? (
          // null (bukan error): getDevelopmentArea maybeSingle → id di luar akses/tidak ada.
          // Sebelumnya cabang ini jatuh ke SkeletonList dan terkunci di sana selamanya.
          <EmptyState
            title="Card tidak ditemukan"
            description="Card ini tidak ada atau Anda tidak memiliki akses untuk melihatnya."
          />
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
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
              <DevAreaSummaryStrip
                problemStatements={problemStatements}
                actionPlanCount={action_plansQ.data?.length ?? 0}
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
              <Text className="text-lg font-bold text-black dark:text-white">Problem Statement</Text>

              {psLoading ? (
                <SkeletonList count={2} />
              ) : psError ? (
                <ErrorState onRetry={() => refetchPs()} />
              ) : problemStatements.length > 0 ? (
                problemStatements.map((item) => (
                  <DetailChildRow
                    key={item.id}
                    name={item.name}
                    statusLabel={PLANNING_STATUS_LABEL[item.status] ?? item.status}
                    statusTone={STATUS_TONE[item.status]}
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

export default function DevelopmentAreaDetailRoute() {
  return <LiveDevelopmentAreaDetailScreen />;
}
