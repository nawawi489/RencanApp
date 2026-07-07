// Fase 8 — Settings > Status & Prioritas Card. Gated manage_settings.
// Submit via upsertSettings key whitelist 'status_*' / 'priority_*'.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, LabeledInput, SectionCard } from '@/components/ui';
import { reportError } from '@/lib/errors';
import { upsertSettings } from '@/lib/governance-admin';
import { useProfile } from '@/hooks/use-profile';

export default function SettingsStatusPriorityScreen() {
  const { can } = useProfile();
  const allowed = can('manage_settings');
  const [statusLabels, setStatusLabels] = useState('');
  const [priorityLabels, setPriorityLabels] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await upsertSettings('status_card_labels', { labels: statusLabels.split(',').map((s) => s.trim()) });
      await upsertSettings('priority_card_labels', { labels: priorityLabels.split(',').map((s) => s.trim()) });
    } catch (e) {
      setError(reportError('Simpan status & prioritas', e, 'Gagal menyimpan pengaturan.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Status & Prioritas' }} />
      <View className="gap-4 p-5">
        {!allowed ? (
          <AccessDenied message="Status & Prioritas hanya untuk pemegang izin Ubah Settings." />
        ) : (
          <SectionCard>
            <LabeledInput label="Label Status (pisahkan koma)" value={statusLabels} onChangeText={setStatusLabels} />
            <LabeledInput label="Label Prioritas (pisahkan koma)" value={priorityLabels} onChangeText={setPriorityLabels} />
            {error ? <Text className="text-sm text-red-700 dark:text-red-400">{error}</Text> : null}
            <Button label="Simpan" onPress={handleSave} loading={saving} />
          </SectionCard>
        )}
      </View>
    </ScrollView>
  );
}
