// Panel Reviewer approve/reject satu submission (mockup 24).
// Sebelumnya diduplikasi verbatim di action-plan/[id].tsx (AP one-time) & instance/[id].tsx (repeat).
// State (rejecting, rejectReason) di-hoist ke sini agar owner cukup pasang panel + mutation.
import { useState } from 'react';
import { Alert } from 'react-native';
import { Text, TextInput, View } from 'react-native-css/components';

import { Button, usePlaceholderColor } from './ui';

export type ReviewDecision = 'approve' | 'reject';

export function ReviewSubmissionPanel({
  onDecide,
  isPending,
}: {
  onDecide: (args: { decision: ReviewDecision; reason: string | null }) => void;
  isPending: boolean;
}) {
  const placeholderColor = usePlaceholderColor();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  return (
    <View className="gap-2 rounded-2xl border border-amber-200 p-4 dark:border-amber-900">
      <Text className="text-sm font-semibold text-black dark:text-white">Review submission terbaru</Text>
      {rejecting ? (
        <View className="gap-2">
          <TextInput
            className="h-20 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
            placeholder="Alasan penolakan (wajib)"
            placeholderTextColor={placeholderColor}
            value={rejectReason}
            onChangeText={setRejectReason}
            multiline
            textAlignVertical="top"
          />
          <Button
            label="Kirim Penolakan"
            variant="danger"
            loading={isPending}
            onPress={() => {
              if (!rejectReason.trim()) {
                Alert.alert('Alasan wajib', 'Isi alasan penolakan terlebih dahulu.');
                return;
              }
              onDecide({ decision: 'reject', reason: rejectReason.trim() });
            }}
          />
          <Button label="Batal" variant="secondary" onPress={() => setRejecting(false)} />
        </View>
      ) : (
        <View className="gap-2">
          <Button
            label="Setujui (Selesai)"
            variant="success"
            loading={isPending}
            onPress={() => onDecide({ decision: 'approve', reason: null })}
          />
          <Button label="Tolak (Minta Revisi)" variant="danger" onPress={() => setRejecting(true)} />
        </View>
      )}
    </View>
  );
}
