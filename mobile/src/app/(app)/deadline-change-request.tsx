// Fase 8 — Deadline Change Request (Action Plan). PIC mengajukan; Reviewer approve/reject.
// Anti-self UI gate: requestor = user → tombol approve disembunyikan (server tetap penegak akhir).
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Badge, Button, LabeledInput, SectionCard } from '@/components/ui';
import { DCR_STATUS_LABEL } from '@/lib/governance-admin';
import { useDeadlineChangeActions, useDeadlineChangeRequests } from '@/hooks/use-governance-admin';
import { useProfile } from '@/hooks/use-profile';

const STATUS_TONE: Record<string, 'neutral' | 'warn' | 'success' | 'danger'> = {
  pending: 'warn',
  approved: 'success',
  rejected: 'danger',
};

export default function DeadlineChangeRequestScreen() {
  const { profile, can } = useProfile();
  const params = useLocalSearchParams<{ actionPlanId?: string; oldDeadline?: string }>();
  const actionPlanId = params.actionPlanId ?? '';
  const oldDeadline = params.oldDeadline ?? '';
  const { requests } = useDeadlineChangeRequests(actionPlanId);
  const { createRequest, reviewRequest, isPending } = useDeadlineChangeActions();

  const [newDeadline, setNewDeadline] = useState('');
  const [reason, setReason] = useState('');
  const [impact, setImpact] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canReview = can('review_deadline_changes');
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
      await createRequest({ entityId: actionPlanId, oldDeadline, newDeadline: next, reason: reason.trim(), impact });
      // Reset hanya pada jalur sukses agar input tidak terhapus saat error jaringan.
      setNewDeadline('');
      setReason('');
      setImpact('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim permintaan.');
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
            <Text className="text-sm text-red-600" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button label="Kirim Permintaan" onPress={handleSubmit} loading={isPending} />
        </SectionCard>

        {requests.length > 0 ? (
          <View className="gap-3">
            <Text className="px-1 text-xs font-semibold uppercase text-neutral-400">Riwayat Permintaan</Text>
            {requests.map((r) => {
              const isSelf = r.requestor_id === profile?.id;
              const showApproveButtons = canReview && r.status === 'pending' && !isSelf;
              return (
                <SectionCard key={r.id}>
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-base text-black dark:text-white">
                      {r.old_deadline} → {r.new_deadline}
                    </Text>
                    <Badge label={DCR_STATUS_LABEL[r.status] ?? r.status} tone={STATUS_TONE[r.status] ?? 'neutral'} />
                  </View>
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400">{r.reason}</Text>
                  {showApproveButtons ? (
                    <View className="flex-row gap-2">
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Setujui permintaan ${r.id}`}
                        className="min-h-[44px] flex-1 items-center justify-center rounded-xl bg-green-600 active:opacity-70"
                        onPress={() => reviewRequest({ requestId: r.id, decision: 'approved', entityId: actionPlanId })}>
                        <Text className="text-base font-semibold text-white">Setujui</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Tolak permintaan ${r.id}`}
                        className="min-h-[44px] flex-1 items-center justify-center rounded-xl bg-red-600 active:opacity-70"
                        onPress={() =>
                          reviewRequest({ requestId: r.id, decision: 'rejected', reason: 'Ditolak', entityId: actionPlanId })
                        }>
                        <Text className="text-base font-semibold text-white">Tolak</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </SectionCard>
              );
            })}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
