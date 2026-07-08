// UI Fase 2/instance lifecycle — Action Plan Instance Detail (mockup 23) + Review Flow (mockup 24).
// Menutup celah: submission instance repeat sebelumnya tak punya jalur review di UI
// (reviewInstanceSubmission ada di data layer, tak pernah dipanggil). Layar ini menyurfacekan
// detail instance + approve/reject untuk reviewer. Anti-self-approval ditegakkan server + UI.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { ReviewSubmissionPanel } from '@/components/review-submission-panel';
import { alertFriendlyError } from '@/lib/errors';
import { StatTile } from '@/components/stat-tile';
import { Badge, Button, EmptyState, ErrorState, MetaGrid, SectionCard, SkeletonList } from '@/components/ui';
import { SubmissionCard, formatDateTime } from '@/components/submission-card';
import { useProfile } from '@/hooks/use-profile';
import { useInstanceActions, useRepeatInstances } from '@/hooks/use-repeat-instances';
import { getActionPlan, personLabel } from '@/lib/cards';
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

  const instQ = useQuery({ queryKey: ['instance', id], queryFn: () => getInstance(id) });
  const inst = instQ.data;
  const apQ = useQuery({
    queryKey: ['action-plan', inst?.action_plan_id],
    queryFn: () => getActionPlan(inst!.action_plan_id),
    enabled: !!inst?.action_plan_id,
  });

  // Depend pada `refetch` (identitas stabil react-query), BUKAN objek `instQ` yang
  // berubah tiap render. Dengan `[instQ]`, sebuah fetch yang gagal memicu refetch →
  // error → render → refetch tanpa henti, sehingga layar terkunci di skeleton
  // (tampak "blank") alih-alih jatuh ke ErrorState. Lihat WS-3c.
  const refetchInstance = instQ.refetch;
  useFocusEffect(
    useCallback(() => {
      refetchInstance();
    }, [refetchInstance]),
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
    onSuccess: refresh,
    onError: (e) => alertFriendlyError('Gagal', e, 'Kesalahan.'),
  });

  const actions = useInstanceActions(
    { pic_id: inst?.pic_id ?? null, reviewer_id: inst?.reviewer_id ?? null, status: inst?.status ?? '' },
    profile?.id ?? null,
  );
  const submissions = inst?.action_plan_submissions ?? [];

  // UI-S-AP7 — "Hari Ini N/M" + ringkasan Target/Selesai/Terlewat/Grace.
  // Sumber: instances of THIS action plan, filtered by current local date == instance.instance_date.
  const repeatQ = useRepeatInstances(inst?.action_plan_id ?? '', { enabled: !!inst?.action_plan_id });
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayInstances = repeatQ.instances.filter((i) => i.instance_date === todayStr);
  const todayDone = todayInstances.filter((i) => i.status === 'done').length;
  const todayMissed = todayInstances.filter((i) => i.status === 'missed').length;
  const todaySubmitted = todayInstances.filter((i) => i.status === 'submitted').length;
  const todayGrace = todayInstances.filter(
    (i) => i.status !== 'done' && i.status !== 'missed' && i.deadline_at && new Date(i.deadline_at) < new Date(),
  ).length;

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
            <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
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
                  {
                    label: 'Deadline',
                    value: inst.deadline_at
                      ? formatDateTime(inst.deadline_at, profile?.org_timezone)
                      : '—',
                  },
                  {
                    label: 'Status',
                    value: INSTANCE_STATUS_LABEL[inst.status] ?? inst.status,
                  },
                ]}
              />
              {inst.status === 'missed' ? (
                <Text className="text-xs font-semibold text-red-700 dark:text-red-400">
                  Terlewat — deadline terlewati tanpa submit.
                </Text>
              ) : null}
            </View>

            {/* UI-S-AP7 — Ringkasan Hari Ini. Tampil hanya jika ada instance berjadwal hari ini. */}
            {todayInstances.length > 0 ? (
              <SectionCard>
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-sm font-bold text-black dark:text-white">
                    Ringkasan Hari Ini
                  </Text>
                  <Badge label={`Hari Ini ${todayDone}/${todayInstances.length}`} tone="info" />
                </View>
                <View className="flex-row flex-wrap gap-2 pt-1">
                  <StatTile
                    label="Target"
                    value={todayInstances.length}
                    containerCls="bg-neutral-100 dark:bg-neutral-800"
                    textCls="text-neutral-700 dark:text-neutral-300"
                  />
                  <StatTile
                    label="Selesai"
                    value={todayDone}
                    containerCls="bg-emerald-100 dark:bg-emerald-950"
                    textCls="text-emerald-700 dark:text-emerald-300"
                  />
                  <StatTile
                    label="Submitted"
                    value={todaySubmitted}
                    containerCls="bg-amber-100 dark:bg-amber-950"
                    textCls="text-amber-700 dark:text-amber-300"
                  />
                  <StatTile
                    label="Terlewat"
                    value={todayMissed}
                    containerCls="bg-red-100 dark:bg-red-950"
                    textCls="text-red-700 dark:text-red-300"
                  />
                  <StatTile
                    label="Grace"
                    value={todayGrace}
                    containerCls="bg-orange-100 dark:bg-orange-950"
                    textCls="text-orange-700 dark:text-orange-300"
                  />
                </View>
                {repeatQ.compliancePercent != null ? (
                  <Text className="text-[11px] text-neutral-400">
                    Compliance keseluruhan: {repeatQ.compliancePercent}% on-time.
                  </Text>
                ) : null}
              </SectionCard>
            ) : null}

            {/* UI-S-AP7 — Panduan Hari Ini (kuratorial; sumber card_guidance_contents nanti). */}
            <SectionCard>
              <Text className="text-sm font-bold text-black dark:text-white">Panduan Hari Ini</Text>
              <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                • Cek bukti & data hasil sebelum submit.{'\n'}
                • Pastikan format file sesuai (PDF/PNG/JPG ≤ 5 MB).{'\n'}
                • Tulis catatan singkat bila ada perubahan dari rencana.{'\n'}
                • Submit sebelum deadline — instance lewat masuk hitungan Terlewat.
              </Text>
            </SectionCard>

            {/* PIC: submit / submit ulang */}
            {actions.canSubmit ? (
              <Button
                label={inst.status === 'revision' ? 'Submit Ulang (Revisi)' : 'Submit Bukti & Nilai Hasil'}
                onPress={() => router.push(`/action-plan/submit?instanceId=${inst.id}` as Href)}
              />
            ) : null}

            {/* Reviewer: review flow (mockup 24) — anti-self ditegakkan server. */}
            {actions.canReview && inst.current_submission_id ? (
              <ReviewSubmissionPanel
                onDecide={(args) => reviewM.mutate(args)}
                isPending={reviewM.isPending}
              />
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
