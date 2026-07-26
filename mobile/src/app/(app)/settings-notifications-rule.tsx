// Fase 8 — Settings > Notifications Rule. Gated manage_settings.
// Submit via upsertSettings key whitelist 'notification_rule_*'; key invalid → pesan error inline.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, LabeledInput, SectionCard } from '@/components/ui';
import { reportError } from '@/lib/errors';
import { upsertSettings } from '@/lib/governance-admin';
import { useProfile } from '@/hooks/use-profile';

export default function SettingsNotificationsRuleScreen() {
  const { can } = useProfile();
  const allowed = can('manage_settings');
  const [deadlineReminderDays, setDeadlineReminderDays] = useState('3');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await upsertSettings('notification_rule_deadline_reminder', {
        days_before: Number(deadlineReminderDays) || 0,
      });
    } catch (e) {
      setError(reportError('Simpan aturan notifikasi', e, 'Kunci pengaturan tidak valid.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Aturan Notifikasi' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Aturan Notifikasi</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Aturan pengiriman notifikasi.
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Aturan Notifikasi hanya untuk pemegang izin Ubah Settings." />
        ) : (
          <SectionCard>
            <LabeledInput
              label="Pengingat deadline (hari sebelum)"
              value={deadlineReminderDays}
              onChangeText={setDeadlineReminderDays}
              keyboardType="numeric"
            />
            {error ? (
              <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Simpan Aturan Notifikasi" onPress={handleSave} loading={saving} />
          </SectionCard>
        )}
      </View>
    </ScrollView>
  );
}
