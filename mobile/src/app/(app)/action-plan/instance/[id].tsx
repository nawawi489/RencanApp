// UI Fase 2/instance lifecycle — Action Plan Instance Detail (mockup 23) + Review Flow (mockup 24).
// Menutup celah: submission instance repeat sebelumnya tak punya jalur review di UI
// (reviewInstanceSubmission ada di data layer, tak pernah dipanggil). Layar ini menyurfacekan
// detail instance + approve/reject untuk reviewer. Anti-self-approval ditegakkan server + UI.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { Badge, Button, EmptyState, ErrorState, MetaGrid, SectionCard, SkeletonList } from '@/components/ui';
import { SubmissionCard } from '@/components/submission-card';
import { personLabel } from '@/components/user-picker';
import { useProfile } from '@/hooks/use-profile';
import { useInstanceActions } from '@/hooks/use-repeat-instances';
import { getActionPlan } from '@/lib/cards';
import {
  INSTANCE_STATUS_LABEL,
  INSTANCE_STATUS_TONE,
  getInstance,
  reviewInstanceSubmission,
} from '@/lib/repeat';

export default function ActionPlanInstanceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useProfile();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const instQ = useQuery({ queryKey: ['instance', id], queryFn: () => getInstance(id) });
  const inst = instQ.data;
  const apQ = useQuery({
    queryKey: ['action-plan', inst?.action_plan_id],
    queryFn: () => getActionPlan(inst!.action_plan_id),
    enabled: !!inst?.action_plan_id,
  });

  useFocusEffect(
    useCallback(() => {
      instQ.refetch();
    }, [instQ]),
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ['instance', id] });
    if (inst?.action_plan_id) {
      qc.invalidateQueries({ queryKey: ['repeat-instances', inst.action_plan_id] });
      qc.invalidateQueries({ queryKey: ['repeat-compliance', inst.action_plan_id] });
    }
  }

  const reviewM = useMutation({
    mutationFn: (args: { decision: 'approve' | 'reject'; reason: string | null }) =>
      reviewInstanceSubmission({
        submissionId: inst!.current_submission_id!,
        decision: args.decision,
        reason: args.reason,
      }),
    onSuccess: () => {
      setRejecting(false);
      setRejectReason('');
      refresh();
    },
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const actions = useInstanceActions(
    { pic_id: inst?.pic_id ?? null, reviewer_id: inst?.reviewer_id ?? null, status: inst?.status ?? '' },
    profile?.id ?? null,
  );
  const submissions = inst?.action_plan_submissions ?? [];

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Instance' }} />
      <View className="gap-5 p-5">
        {instQ.isLoading ? (
          <SkeletonList count={3} />
        ) : instQ.isError || !inst ? (
          <ErrorState
            title="Gagal memuat instance"
            description="Tidak bisa mengambil data instance ini."
            onRetry={() => instQ.refetch()}
          />
        ) : (
          <>
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <View className="gap-1">
                <Badge
                  label={INSTANCE_STATUS_LABEL[inst.status] ?? inst.status}
                  tone={INSTANCE_STATUS_TONE[inst.status]}
                />
                <Text className="text-2xl font-bold text-black dark:text-white">
                  {apQ.data?.name ?? 'Instance'}
                </Text>
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  Jadwal {inst.instance_date} · {(inst.instance_time ?? '').slice(0, 5)}
                </Text>
              </View>
              <MetaGrid
                items={[
                  { label: 'PIC', value: inst.pic ? personLabel(inst.pic) : '—' },
                  { label: 'Reviewer', value: inst.reviewer ? personLabel(inst.reviewer) : '—' },
                  { label: 'Deadline', value: (inst.deadline_at ?? '').replace('T', ' ').slice(0, 16) || '—' },
                  {
                    label: 'Status',
                    value: INSTANCE_STATUS_LABEL[inst.status] ?? inst.status,
                  },
                ]}
              />
              {inst.status === 'missed' ? (
                <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
                  Terlewat — deadline terlewati tanpa submit.
                </Text>
              ) : null}
            </View>

            {/* PIC: submit / submit ulang */}
            {actions.canSubmit ? (
              <Button
                label={inst.status === 'revision' ? 'Submit Ulang (Revisi)' : 'Submit Bukti & Nilai Hasil'}
                onPress={() => router.push(`/action-plan/submit?instanceId=${inst.id}` as Href)}
              />
            ) : null}

            {/* Reviewer: review flow (mockup 24) — anti-self ditegakkan server. */}
            {actions.canReview && inst.current_submission_id ? (
              <View className="gap-2 rounded-2xl border border-amber-200 p-4 dark:border-amber-900">
                <Text className="text-sm font-semibold text-black dark:text-white">
                  Review submission terbaru
                </Text>
                {rejecting ? (
                  <View className="gap-2">
                    <TextInput
                      className="h-20 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
                      placeholder="Alasan penolakan (wajib)"
                      placeholderTextColor="#9ca3af"
                      value={rejectReason}
                      onChangeText={setRejectReason}
                      multiline
                      textAlignVertical="top"
                    />
                    <Button
                      label="Kirim Penolakan"
                      variant="danger"
                      loading={reviewM.isPending}
                      onPress={() => {
                        if (!rejectReason.trim()) {
                          Alert.alert('Alasan wajib', 'Isi alasan penolakan terlebih dahulu.');
                          return;
                        }
                        reviewM.mutate({ decision: 'reject', reason: rejectReason.trim() });
                      }}
                    />
                    <Button label="Batal" variant="secondary" onPress={() => setRejecting(false)} />
                  </View>
                ) : (
                  <View className="gap-2">
                    <Button
                      label="Setujui (Selesai)"
                      variant="success"
                      loading={reviewM.isPending}
                      onPress={() => reviewM.mutate({ decision: 'approve', reason: null })}
                    />
                    <Button label="Tolak (Minta Revisi)" variant="danger" onPress={() => setRejecting(true)} />
                  </View>
                )}
              </View>
            ) : null}

            {actions.isReviewer && actions.isSelfApproval && inst.status === 'submitted' ? (
              <View className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
                <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                  Anda PIC sekaligus reviewer instance ini — self-approval diblokir. Minta reviewer lain.
                </Text>
              </View>
            ) : null}

            {/* Riwayat submission */}
            <View className="gap-3">
              <Text className="text-lg font-bold text-black dark:text-white">Riwayat Submission</Text>
              {submissions.length > 0 ? (
                submissions.map((s) => <SubmissionCard key={s.id} s={s} />)
              ) : (
                <EmptyState
                  title="Belum ada submission"
                  description="Bukti yang dikirim PIC akan muncul di sini sebagai versi terkunci."
                />
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
