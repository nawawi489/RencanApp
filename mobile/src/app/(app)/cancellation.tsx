// Fase 8 — Cancellation card. CEO auto-approve; non-CEO → pending. Feedback dari role_level
// (RPC cancel_card hanya mengembalikan uuid; status alur ditentukan dari peran, bukan return).
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Button, LabeledInput, SectionCard } from '@/components/ui';
import type { CardEntityType } from '@/lib/governance-admin';
import { useCancellationActions } from '@/hooks/use-governance-admin';
import { useProfile } from '@/hooks/use-profile';

export default function CancellationScreen() {
  const { profile } = useProfile();
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string }>();
  const entityType = (params.entityType ?? 'initiative') as CardEntityType;
  const entityId = params.entityId ?? '';
  const { cancel, isPending } = useCancellationActions();

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isCeo = profile?.role_level === 'ceo';

  async function handleCancel() {
    setError(null);
    setFeedback(null);
    if (!reason.trim()) {
      setError('Alasan pembatalan wajib diisi.');
      return;
    }
    try {
      await cancel({ entityType, entityId, reason: reason.trim() });
      setFeedback(
        isCeo
          ? 'Card berhasil dibatalkan.'
          : 'Permintaan pembatalan dikirim — menunggu persetujuan.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan card.');
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Batalkan Card' }} />
      <View className="gap-4 p-5">
        <SectionCard>
          <Text className="text-sm text-neutral-500 dark:text-neutral-400">
            Pembatalan tidak menghapus card — card berpindah ke status dibatalkan dan tetap tercatat.
          </Text>
          <LabeledInput label="Alasan pembatalan" value={reason} onChangeText={setReason} required multiline />
          {error ? (
            <Text className="text-sm text-red-600" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {feedback ? (
            <Text className="text-sm text-green-700 dark:text-green-400" accessibilityRole="alert">
              {feedback}
            </Text>
          ) : null}
          <Button label="Batalkan Card" variant="danger" onPress={handleCancel} loading={isPending} />
        </SectionCard>
      </View>
    </ScrollView>
  );
}
