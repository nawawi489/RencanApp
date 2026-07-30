import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { MbrCompletionIndicator, guardMbrActivation } from '@/components/mbr-completion';
import { ActivityLogPanel } from '@/components/activity-log-panel';
import { DetailChildRow } from '@/components/detail-child-row';
import { DetailField } from '@/components/detail-field';
import { Badge, Button, EmptyState, ErrorState, MetaGrid, ProgressOrb, SectionHeading, SkeletonList } from '@/components/ui';
import { useMbrCompliance } from '@/hooks/use-mbr';
import { useCardProgress, useInitiativeActionPlans } from '@/hooks/use-workspace';
import { INITIATIVE_STATUS_LABEL } from '@/lib/cards';
import { childrenSublabel, ratioDoneOfChildren, treeOrbLabel } from '@/lib/progress';
import { PLANNING_STATUS_LABEL, STATUS_TONE, activateInitiative, getInitiative } from '@/lib/initiatives';
import { guardActivationFields } from '@/lib/activation-check';
import { alertFriendlyError } from '@/lib/errors';
import { useProfile } from '@/hooks/use-profile';

export function LiveInitiativeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { profile } = useProfile();
  const initiativeQ = useQuery({ queryKey: ['initiative', id], queryFn: () => getInitiative(id) });
  const {
    action_plans,
    isLoading: action_plansLoading,
    isError: action_plansError,
    refetch: refetchActionPlans,
  } = useInitiativeActionPlans(id);
  const { compliance, refetch: refetchCompliance } = useMbrCompliance('initiative', id);
  // WSA-15 / Opsi B — orb capaian sinkron dengan tree Workspace: pakai rollup rekursif
  // server (workspace_card_progress) = rata-rata progress Rencana Aksi anak, bukan
  // heuristik %-selesai klien. Selama RPC belum termuat (null), fall back ke
  // `ratioDoneOfChildren` agar orb tetap render angka wajar (bukan '—').
  const { progressOf } = useCardProgress([id]);

  useFocusEffect(
    useCallback(() => {
      initiativeQ.refetch();
      refetchActionPlans();
      refetchCompliance(); // indikator Kelengkapan ikut segar setelah tambah/arsip Rencana Aksi
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const activateM = useMutation({
    mutationFn: () => activateInitiative(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['initiative', id] });
      qc.invalidateQueries({ queryKey: ['initiatives'] });
    },
    onError: (e) => alertFriendlyError('Tidak bisa diaktifkan', e, 'Inisiatif belum bisa diaktifkan. Periksa kelengkapan lalu coba lagi.'),
  });

  const initiative = initiativeQ.data;
  // WSA-08 §14.4 — CTA "+ Tambah Rencana Aksi" dihapus; tambah turunan hanya dari tree Workspace.

  async function handleActivate() {
    const orgId = profile?.organization_id ?? '';
    if (initiative && (await guardActivationFields(orgId, 'initiative', initiative))) return;
    const blocked = guardMbrActivation(compliance, {
      childLabel: 'Rencana Aksi',
      onAddChild: () => router.push(`/action-plan/new?initiativeId=${id}`),
    });
    if (blocked) return;
    activateM.mutate();
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: initiative?.name ?? 'Inisiatif' }} />
      <View className="gap-5 p-5">
        {initiativeQ.isLoading ? (
          <SkeletonList count={3} />
        ) : initiativeQ.isError ? (
          <ErrorState onRetry={() => initiativeQ.refetch()} />
        ) : !initiative ? (
          // null (bukan error): getInitiative maybeSingle → id di luar akses/tidak ada. Sebelumnya
          // cabang ini jatuh ke SkeletonList dan terkunci di sana selamanya.
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
                    label={PLANNING_STATUS_LABEL[initiative.status] ?? initiative.status}
                    tone={STATUS_TONE[initiative.status]}
                  />
                  <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">{initiative.name}</Text>
                </View>
                <ProgressOrb
                  size={72}
                  value={progressOf(id) ?? ratioDoneOfChildren(action_plans)}
                  sublabel={childrenSublabel(action_plans)}
                  label={treeOrbLabel('initiative')}
                />
              </View>
              <MetaGrid
                items={[
                  {
                    label: 'Periode',
                    value: `${initiative.period_start ?? '—'} → ${initiative.period_end ?? '—'}`,
                  },
                  {
                    label: 'Kontribusi Q',
                    value:
                      initiative.contribution_pct != null
                        ? `${initiative.contribution_pct}%`
                        : '—',
                  },
                ]}
              />
            </View>

            {initiative.description ? <DetailField label="Deskripsi" value={initiative.description} /> : null}
            <DetailField label="Alasan" value={initiative.reason || '—'} />
            <DetailField label="Risiko Utama" value={initiative.main_risk || '—'} />
            <DetailField label="Alternatif" value={initiative.alternative || '—'} />

            <MbrCompletionIndicator compliance={compliance} />

            {initiative.status === 'draft' ? (
              <Button
                label="Aktifkan Inisiatif"
                onPress={handleActivate}
                loading={activateM.isPending}
              />
            ) : null}

            {/* S4-2 — sunting. Draft/aktif diterima RPC update_initiative; done/archived tak. */}
            {initiative.status === 'draft' || initiative.status === 'active' ? (
              <Button
                label="Ubah Inisiatif"
                variant="secondary"
                onPress={() => router.push(`/initiative/edit/${id}`)}
              />
            ) : null}

            <View className="gap-3">
              <SectionHeading title="Rencana Aksi" />

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
                    statusTone={STATUS_TONE[item.status]}
                    onPress={() => router.push(`/action-plan/${item.id}`)}
                  />
                ))
              ) : (
                <EmptyState
                  title="Belum ada Rencana Aksi"
                  description="Turunkan Inisiatif ini menjadi Rencana Aksi konkret lalu pecah jadi Tugas."
                />
              )}
            </View>

            <ActivityLogPanel entityType="initiative" entityId={id} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

export default function InitiativeDetailRoute() {
  return <LiveInitiativeDetailScreen />;
}
