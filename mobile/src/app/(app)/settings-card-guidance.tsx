// V1.8.3 — Settings > Keterangan Card. Gated manage_card_completion_rule (D-7 reuse).
// Wave 4.6: writer sekarang target tabel dedicated `card_guidance_contents` via
// upsertCardGuidance dgn dua field (title + body), bukan legacy `settings` key store.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, LabeledInput, SectionCard } from '@/components/ui';
import {
  getGuidance,
  upsertCardGuidance,
  type CardTypeGuided,
} from '@/lib/card-rules';
import { reportError } from '@/lib/errors';
import { useProfile } from '@/hooks/use-profile';

// §34.6 whitelist: termasuk task (guidance universal).
const CARD_TYPES: CardTypeGuided[] = [
  'goal', 'strategy', 'initiative', 'action_plan', 'task', 'development_area', 'problem_statement',
];

const CARD_TYPE_LABEL: Record<CardTypeGuided, string> = {
  goal: 'Goal',
  strategy: 'Strategi',
  initiative: 'Inisiatif',
  action_plan: 'Rencana Aksi',
  task: 'Tugas',
  development_area: 'Development Area',
  problem_statement: 'Problem Statement',
};

const MAX_TITLE = 120;
const MAX_BODY = 800;

export default function SettingsCardGuidanceScreen() {
  const { profile, can } = useProfile();
  const allowed = can('manage_card_completion_rule') || can('manage_settings');
  const orgId = profile?.organization_id ?? '';
  const qc = useQueryClient();

  const [cardType, setCardType] = useState<CardTypeGuided>('goal');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const guidanceQ = useQuery({
    queryKey: ['card-rules', 'guidance', orgId, cardType],
    queryFn: () => getGuidance(orgId, cardType),
    enabled: !!orgId && allowed,
  });

  // Prefill dari server query.
  useEffect(() => {
    if (guidanceQ.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(guidanceQ.data.title ?? '');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBody(guidanceQ.data.body ?? '');
    }
  }, [guidanceQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => upsertCardGuidance(cardType, title, body, undefined),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['card-rules', 'guidance', orgId, cardType] });
    },
    onError: (e) => setError(reportError('Simpan Keterangan Card', e, 'Gagal menyimpan.')),
  });

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Keterangan Card' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Keterangan Card</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Panduan pengisian tiap jenis card (tampil di icon &quot;?&quot; — pendek, praktis).
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Keterangan Card hanya untuk pemegang izin Kelola Card Completion Rule. Anda tidak memiliki akses." />
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
                    accessibilityLabel={`Pilih ${CARD_TYPE_LABEL[t]}`}
                    className={`min-h-[44px] justify-center rounded-xl border px-3 py-2 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}
                    onPress={() => setCardType(t)}>
                    <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-black dark:text-white'}`}>
                      {CARD_TYPE_LABEL[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <LabeledInput
              label={`Judul (${title.length}/${MAX_TITLE})`}
              value={title}
              onChangeText={(v) => setTitle(v.slice(0, MAX_TITLE))}
              placeholder="Judul singkat card"
            />
            <LabeledInput
              label={`Keterangan (${body.length}/${MAX_BODY})`}
              value={body}
              onChangeText={(v) => setBody(v.slice(0, MAX_BODY))}
              multiline
              placeholder="Panduan pengisian card ini"
            />

            {error ? <Text className="text-sm text-red-700 dark:text-red-400">{error}</Text> : null}
            <Button
              label="Simpan Keterangan"
              accessibilityLabel="Simpan Keterangan Card"
              onPress={() => saveMut.mutate()}
              loading={saveMut.isPending}
            />
          </SectionCard>
        )}
      </View>
    </ScrollView>
  );
}
