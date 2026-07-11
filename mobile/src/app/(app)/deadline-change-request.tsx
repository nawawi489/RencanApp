// Fase 8 — Deadline Change Request (Action Plan). PIC mengajukan; Reviewer approve/reject/minta-revisi.
// Anti-self UI gate: requestor = user → tombol review disembunyikan (server tetap penegak akhir).
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { Badge, Button, LabeledInput, SectionCard, usePlaceholderColor } from '@/components/ui';
import { DATE_RE } from '@/lib/date';
import { reportError } from '@/lib/errors';
import { DCR_STATUS_LABEL, type DeadlineChangeRequest } from '@/lib/governance-admin';
import { useDeadlineChangeActions, useDeadlineChangeRequests } from '@/hooks/use-governance-admin';
import { useProfile } from '@/hooks/use-profile';

const STATUS_TONE: Record<string, 'neutral' | 'warn' | 'success' | 'danger'> = {
  pending: 'warn',
  revision_requested: 'warn',
  approved: 'success',
  rejected: 'danger',
};

export default function DeadlineChangeRequestScreen() {
  const { profile, can } = useProfile();
  const params = useLocalSearchParams<{ taskId?: string; oldDeadline?: string }>();
  const taskId = params.taskId ?? '';
  const oldDeadline = params.oldDeadline ?? '';
  const { requests } = useDeadlineChangeRequests(taskId);
  const { createRequest, reviewRequest, resubmitRequest, isPending } = useDeadlineChangeActions();

  const [newDeadline, setNewDeadline] = useState('');
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canReview = can('review_deadline_changes');

  async function handleSubmit() {
    if (isPending) return; // anti double-submit
    setError(null);
    const next = newDeadline.trim();
    if (!DATE_RE.test(next)) {
      setError('Format tanggal harus YYYY-MM-DD.');
      return;
    }
    if (!oldDeadline || !DATE_RE.test(oldDeadline)) {
      setError('Deadline saat ini tidak valid.');
      return;
    }
    // Bandingkan sebagai Date (lexicographic kebetulan jalan utk YYYY-MM-DD, tapi explicit lebih aman).
    if (new Date(next) <= new Date(oldDeadline)) {
      setError('Tanggal baru harus setelah deadline saat ini.');
      return;
    }
    if (!reason.trim()) {
      setError('Alasan wajib diisi.');
      return;
    }
    try {
      await createRequest({ entityId: taskId, oldDeadline, newDeadline: next, reason: reason.trim(), impact });
      setNewDeadline('');
      setReason('');
      setImpact('');
    } catch (e) {
      setError(reportError('Ajukan perubahan deadline', e, 'Gagal mengirim permintaan.'));
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Perubahan Deadline' }} />
      <View className="gap-4 p-5">
        <SectionCard>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            Deadline saat ini: {oldDeadline || '—'}
          </Text>
          <LabeledInput
            label="Deadline baru (YYYY-MM-DD)"
            value={newDeadline}
            onChangeText={setNewDeadline}
            required
            placeholder="2026-07-15"
          />
          <LabeledInput label="Alasan" value={reason} onChangeText={setReason} required multiline />
          <LabeledInput label="Dampak jika ditolak" value={impact} onChangeText={setImpact} multiline />
          {error ? (
            <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Kirim Permintaan" onPress={handleSubmit} loading={isPending} />
        </SectionCard>

        {requests.length > 0 ? (
          <View className="gap-3">
            <Text className="px-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Riwayat Permintaan</Text>
            {requests.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                isSelf={r.requestor_id === profile?.id}
                canReview={canReview}
                isPending={isPending}
                onReview={reviewRequest}
                onResubmit={resubmitRequest}
              />
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

// State input alasan di-scope ke row (per r.id) supaya tidak bocor antar-baris (rencana risiko §7).
function RequestRow({
  r,
  isSelf,
  canReview,
  isPending,
  onReview,
  onResubmit,
}: {
  r: DeadlineChangeRequest & { revision_reason?: string | null };
  isSelf: boolean;
  canReview: boolean;
  isPending: boolean;
  onReview: (i: { requestId: string; decision: 'approved' | 'rejected' | 'revision_requested'; reason?: string; entityId?: string }) => Promise<unknown>;
  onResubmit: (i: { requestId: string; newDeadline: string; reason: string }) => Promise<unknown>;
}) {
  const placeholderColor = usePlaceholderColor();
  const [reviewReason, setReviewReason] = useState('');
  const [resubmitDeadline, setResubmitDeadline] = useState<string>(r.new_deadline ?? '');
  const [resubmitReason, setResubmitReason] = useState<string>(r.reason ?? '');
  const [rowError, setRowError] = useState<string | null>(null);

  const showReviewActions = canReview && r.status === 'pending' && !isSelf;
  const showRevisionForm = r.status === 'revision_requested' && isSelf;

  async function doReview(decision: 'approved' | 'rejected' | 'revision_requested') {
    if (isPending) return;
    setRowError(null);
    // Alasan wajib untuk tolak & minta revisi (client guard; server tetap penegak akhir PRD §41).
    if ((decision === 'rejected' || decision === 'revision_requested') && !reviewReason.trim()) {
      setRowError('Alasan wajib diisi.');
      return;
    }
    try {
      await onReview({ requestId: r.id, decision, reason: reviewReason.trim() || undefined });
      setReviewReason('');
    } catch (e) {
      setRowError(reportError('Review perubahan deadline', e, 'Gagal memproses.'));
    }
  }

  async function doResubmit() {
    if (isPending) return;
    setRowError(null);
    const next = resubmitDeadline.trim();
    if (!DATE_RE.test(next)) {
      setRowError('Format tanggal harus YYYY-MM-DD.');
      return;
    }
    if (r.old_deadline && new Date(next) <= new Date(r.old_deadline)) {
      setRowError('Tanggal baru harus setelah deadline saat ini.');
      return;
    }
    if (!resubmitReason.trim()) {
      setRowError('Alasan wajib diisi.');
      return;
    }
    try {
      await onResubmit({ requestId: r.id, newDeadline: next, reason: resubmitReason.trim() });
    } catch (e) {
      setRowError(reportError('Kirim revisi deadline', e, 'Gagal mengirim revisi.'));
    }
  }

  return (
    <SectionCard>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-base text-black dark:text-white">
          {r.old_deadline} → {r.new_deadline}
        </Text>
        <Badge label={DCR_STATUS_LABEL[r.status] ?? r.status} tone={STATUS_TONE[r.status] ?? 'neutral'} />
      </View>
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">{r.reason}</Text>

      {r.status === 'revision_requested' && r.revision_reason ? (
        <View className="gap-1 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <Text className="text-xs font-semibold uppercase text-amber-800 dark:text-amber-300">Alasan Revisi Reviewer</Text>
          <Text className="text-sm text-amber-900 dark:text-amber-200">{r.revision_reason}</Text>
        </View>
      ) : null}

      {showReviewActions ? (
        <View className="gap-2">
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-black dark:text-white">Alasan review (wajib bila Tolak / Minta Revisi)</Text>
            <TextInput
              className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white h-24"
              accessibilityLabel={`Alasan review untuk ${r.id}`}
              placeholder="Jelaskan alasan penolakan atau permintaan revisi"
              placeholderTextColor={placeholderColor}
              value={reviewReason}
              onChangeText={setReviewReason}
              multiline
              textAlignVertical="top"
            />
          </View>
          {rowError ? (
            <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">{rowError}</Text>
          ) : null}
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Setujui permintaan ${r.id}`}
              accessibilityState={{ disabled: isPending, busy: isPending }}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-xl bg-green-700 active:opacity-70 ${isPending ? 'opacity-40' : ''}`}
              disabled={isPending}
              onPress={() => doReview('approved')}>
              <Text className="text-base font-semibold text-white">Setujui</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Minta revisi permintaan ${r.id}`}
              accessibilityState={{ disabled: isPending, busy: isPending }}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-xl bg-amber-600 active:opacity-70 ${isPending ? 'opacity-40' : ''}`}
              disabled={isPending}
              onPress={() => doReview('revision_requested')}>
              <Text className="text-base font-semibold text-white">Minta Revisi</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tolak permintaan ${r.id}`}
              accessibilityState={{ disabled: isPending, busy: isPending }}
              className={`min-h-[44px] flex-1 items-center justify-center rounded-xl bg-red-700 active:opacity-70 ${isPending ? 'opacity-40' : ''}`}
              disabled={isPending}
              onPress={() => doReview('rejected')}>
              <Text className="text-base font-semibold text-white">Tolak</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showRevisionForm ? (
        <View className="gap-2">
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-black dark:text-white">Deadline baru (YYYY-MM-DD)</Text>
            <TextInput
              className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
              accessibilityLabel={`Deadline baru revisi untuk ${r.id}`}
              placeholder="2026-07-15"
              placeholderTextColor={placeholderColor}
              value={resubmitDeadline}
              onChangeText={setResubmitDeadline}
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-sm font-semibold text-black dark:text-white">Alasan (revisi)</Text>
            <TextInput
              className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white h-24"
              accessibilityLabel={`Alasan revisi terbaru untuk ${r.id}`}
              placeholder="Perbarui alasan sesuai catatan reviewer"
              placeholderTextColor={placeholderColor}
              value={resubmitReason}
              onChangeText={setResubmitReason}
              multiline
              textAlignVertical="top"
            />
          </View>
          {rowError ? (
            <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">{rowError}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Kirim Revisi permintaan ${r.id}`}
            accessibilityState={{ disabled: isPending, busy: isPending }}
            className={`min-h-[44px] items-center justify-center rounded-xl bg-brand-dark active:opacity-80 ${isPending ? 'opacity-40' : ''}`}
            disabled={isPending}
            onPress={doResubmit}>
            <Text className="text-base font-semibold text-white">Kirim Revisi</Text>
          </Pressable>
        </View>
      ) : null}
    </SectionCard>
  );
}
