import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { Badge, Button, Field, SectionCard } from '@/components/ui';
import { personLabel } from '@/components/user-picker';
import { useProfile } from '@/hooks/use-profile';
import {
  ACTION_PLAN_STATUS_LABEL,
  EVIDENCE_KIND_LABEL,
  PRIORITY_LABEL,
  RESULT_VALUE_TYPE_LABEL,
  STATUS_TONE,
  activateActionPlan,
  getActionPlan,
  listSubmissions,
  reviewSubmission,
  startActionPlan,
  type EvidenceFile,
  type ResultValue,
  type SubmissionDetail,
} from '@/lib/cards';

function formatDateTime(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}

const REVIEW_STATUS: Record<string, { label: string; tone: 'warn' | 'success' | 'danger' }> = {
  pending: { label: 'Menunggu Review', tone: 'warn' },
  approved: { label: 'Disetujui', tone: 'success' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};

function EvidenceItem({ ev }: { ev: EvidenceFile }) {
  const detail = ev.text_content || ev.url || ev.file_name || '—';
  return (
    <View className="rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
      <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
        {EVIDENCE_KIND_LABEL[ev.kind] ?? ev.kind}
      </Text>
      <Text className="text-sm text-black dark:text-white">{detail}</Text>
    </View>
  );
}

function ResultValueItem({ rv }: { rv: ResultValue }) {
  return (
    <View className="flex-row justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
      <Text className="text-sm text-neutral-600 dark:text-neutral-300">
        {rv.label || RESULT_VALUE_TYPE_LABEL[rv.value_type] || 'Nilai'}
      </Text>
      <Text className="text-sm font-semibold text-black dark:text-white">{rv.value_text ?? '—'}</Text>
    </View>
  );
}

function SubmissionCard({ s }: { s: SubmissionDetail }) {
  const status = REVIEW_STATUS[s.review_status] ?? REVIEW_STATUS.pending;
  return (
    <SectionCard>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-black dark:text-white">Versi {s.version_number}</Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">
        Oleh {s.submitter ? personLabel(s.submitter) : '—'} · {formatDateTime(s.submitted_at)}
      </Text>
      {s.note ? <Text className="text-sm text-black dark:text-white">{s.note}</Text> : null}

      {s.evidence_files.length > 0 ? (
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-neutral-400">Bukti</Text>
          {s.evidence_files.map((ev) => (
            <EvidenceItem key={ev.id} ev={ev} />
          ))}
        </View>
      ) : null}

      {s.action_plan_result_values.length > 0 ? (
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase text-neutral-400">Nilai Hasil</Text>
          {s.action_plan_result_values.map((rv) => (
            <ResultValueItem key={rv.id} rv={rv} />
          ))}
        </View>
      ) : null}

      {s.review_status === 'rejected' && s.review_reason ? (
        <View className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-950/40">
          <Text className="text-xs font-semibold text-red-700 dark:text-red-300">Alasan ditolak</Text>
          <Text className="text-sm text-red-700 dark:text-red-300">{s.review_reason}</Text>
        </View>
      ) : null}
      {s.reviewed_at ? (
        <Text className="text-xs text-neutral-400">
          Direview {s.reviewer ? `oleh ${personLabel(s.reviewer)} ` : ''}· {formatDateTime(s.reviewed_at)}
        </Text>
      ) : null}
    </SectionCard>
  );
}

export default function ActionPlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useProfile();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const apQ = useQuery({ queryKey: ['action-plan', id], queryFn: () => getActionPlan(id) });
  const subsQ = useQuery({ queryKey: ['submissions', id], queryFn: () => listSubmissions(id) });

  useFocusEffect(
    useCallback(() => {
      apQ.refetch();
      subsQ.refetch();
    }, [apQ, subsQ]),
  );

  function refresh() {
    qc.invalidateQueries({ queryKey: ['action-plan', id] });
    qc.invalidateQueries({ queryKey: ['submissions', id] });
    qc.invalidateQueries({ queryKey: ['action-plans'] });
  }

  const activateM = useMutation({
    mutationFn: () => activateActionPlan(id),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Tidak bisa diaktifkan', e instanceof Error ? e.message : 'Kesalahan.'),
  });
  const startM = useMutation({
    mutationFn: () => startActionPlan(id),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Kesalahan.'),
  });
  const reviewM = useMutation({
    mutationFn: (args: { decision: 'approve' | 'reject'; reason: string | null }) =>
      reviewSubmission({ submissionId: ap!.current_submission_id!, decision: args.decision, reason: args.reason }),
    onSuccess: () => {
      setRejecting(false);
      setRejectReason('');
      refresh();
    },
    onError: (e) => Alert.alert('Gagal', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const ap = apQ.data;
  const isPic = !!profile && profile.id === ap?.pic_id;
  const isReviewer = !!profile && profile.id === ap?.reviewer_id;

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ title: ap?.name ?? 'Action Plan' }} />
      <View className="gap-5 p-5">
        {apQ.isLoading || !ap ? (
          <ActivityIndicator />
        ) : (
          <>
            <View className="gap-2">
              <Badge
                label={ACTION_PLAN_STATUS_LABEL[ap.status] ?? ap.status}
                tone={STATUS_TONE[ap.status]}
              />
              <Text className="text-2xl font-bold text-black dark:text-white">{ap.name}</Text>
            </View>

            <SectionCard>
              <Field label="PIC (eksekutor)" value={ap.pic ? personLabel(ap.pic) : '—'} />
              <Field label="Reviewer" value={ap.reviewer ? personLabel(ap.reviewer) : '—'} />
              <Field label="Periode" value={`${ap.start_date ?? '—'} → ${ap.deadline ?? '—'}`} />
              {ap.priority ? <Field label="Prioritas" value={PRIORITY_LABEL[ap.priority] ?? ap.priority} /> : null}
              {ap.expected_output ? <Field label="Output yang Diharapkan" value={ap.expected_output} /> : null}
              {ap.definition_of_done ? <Field label="Definition of Done" value={ap.definition_of_done} /> : null}
              <Field
                label="Aturan Submit"
                value={`Bukti ${ap.evidence_required ? 'wajib' : 'opsional'} · Nilai Hasil ${ap.result_value_required ? 'wajib' : 'opsional'}`}
              />
            </SectionCard>

            {/* ---- Aksi sesuai peran & status ---- */}
            {ap.status === 'draft' ? (
              <Button label="Aktifkan Action Plan" onPress={() => activateM.mutate()} loading={activateM.isPending} />
            ) : null}

            {isPic && ap.status === 'assigned' ? (
              <View className="gap-2">
                <Button label="Mulai Kerjakan" onPress={() => startM.mutate()} loading={startM.isPending} />
                <Button
                  label="Submit Bukti & Nilai Hasil"
                  variant="secondary"
                  onPress={() => router.push(`/action-plan/submit?id=${id}` as Href)}
                />
              </View>
            ) : null}

            {isPic && (ap.status === 'in_progress' || ap.status === 'revision') ? (
              <Button
                label={ap.status === 'revision' ? 'Submit Ulang (Revisi)' : 'Submit Bukti & Nilai Hasil'}
                onPress={() => router.push(`/action-plan/submit?id=${id}` as Href)}
              />
            ) : null}

            {ap.status === 'submitted' && isReviewer ? (
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

            {ap.status === 'submitted' && isPic ? (
              <View className="rounded-2xl border border-amber-200 p-4 dark:border-amber-900">
                <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                  Menunggu review oleh {ap.reviewer ? personLabel(ap.reviewer) : 'reviewer'}.
                </Text>
              </View>
            ) : null}

            {ap.status === 'done' ? (
              <View className="rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                <Text className="text-sm font-semibold text-green-700 dark:text-green-300">
                  ✓ Selesai & disetujui reviewer.
                </Text>
              </View>
            ) : null}

            {/* ---- Riwayat submission ---- */}
            <View className="gap-3">
              <Text className="text-lg font-bold text-black dark:text-white">Riwayat Submission</Text>
              {subsQ.isLoading ? (
                <ActivityIndicator />
              ) : subsQ.data && subsQ.data.length > 0 ? (
                subsQ.data.map((s) => <SubmissionCard key={s.id} s={s} />)
              ) : (
                <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                  Belum ada submission. Bukti yang sudah dikirim terkunci dan tersimpan sebagai versi.
                </Text>
              )}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
