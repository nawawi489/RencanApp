// Fase 8 — Settings > Keterangan Card (Card Guidance). Gated manage_card_completion_rule.
// Submit via upsertSettings key whitelist 'card_guidance_<type>'.
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, LabeledInput, SectionCard } from '@/components/ui';
import { upsertSettings } from '@/lib/governance-admin';
import { useProfile } from '@/hooks/use-profile';

const CARD_TYPES = ['goal', 'kpi_area', 'strategy', 'initiative', 'action_plan'] as const;

export default function SettingsCardGuidanceScreen() {
  const { can } = useProfile();
  const allowed = can('manage_card_completion_rule') || can('manage_settings');
  const [cardType, setCardType] = useState<(typeof CARD_TYPES)[number]>('goal');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await upsertSettings(`card_guidance_${cardType}`, { body });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan keterangan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Keterangan Card' }} />
      <View className="gap-4 p-5">
        {!allowed ? (
          <AccessDenied message="Keterangan Card hanya untuk pemegang izin Kelola Card Completion Rule." />
        ) : (
          <SectionCard>
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">Jenis Card</Text>
            <View className="flex-row flex-wrap gap-2">
              {CARD_TYPES.map((t) => {
                const active = t === cardType;
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Pilih ${t}`}
                    className={`min-h-[44px] justify-center rounded-xl border px-3 py-2 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
                    onPress={() => setCardType(t)}>
                    <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-black dark:text-white'}`}>
                      {t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <LabeledInput label="Keterangan" value={body} onChangeText={setBody} multiline placeholder="Panduan singkat untuk jenis card ini" />
            {error ? <Text className="text-sm text-red-700 dark:text-red-400">{error}</Text> : null}
            <Button label="Simpan Keterangan" onPress={handleSave} loading={saving} />
          </SectionCard>
        )}
      </View>
    </ScrollView>
  );
}
