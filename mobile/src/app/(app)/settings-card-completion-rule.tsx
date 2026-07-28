// V1.8.3 — Settings > Card Completion Rule. Gated manage_card_completion_rule (D-7 shared dgn Keterangan).
// Wave 4.5: writer sekarang target tabel dedicated `card_completion_rules` via
// upsertCompletionRule (bukan legacy `settings` key store). Locked base ditampilkan
// terpisah sebagai chip disabled (F1 critic).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { AccessDenied } from '@/components/access-denied';
import { Button, SectionCard } from '@/components/ui';
import {
  getCompletionRule,
  upsertCompletionRule,
  type CardTypeGated,
} from '@/lib/card-rules';
import { HARDCODED_CORE } from '@/lib/activation-check';
import { reportError } from '@/lib/errors';
import { useProfile } from '@/hooks/use-profile';

// §34.5 whitelist: task DROP (tak ada activate_task RPC per spec §5.4).
const CARD_TYPES: CardTypeGated[] = [
  'goal', 'strategy', 'initiative', 'action_plan', 'development_area', 'problem_statement',
];

const CARD_TYPE_LABEL: Record<CardTypeGated, string> = {
  goal: 'Goal',
  strategy: 'Strategi',
  initiative: 'Inisiatif',
  action_plan: 'Rencana Aksi',
  development_area: 'Development Area',
  problem_statement: 'Problem Statement',
};

const FIELD_LABEL: Record<string, string> = {
  name: 'Nama', pic_id: 'PIC', period_start: 'Periode mulai', period_end: 'Periode selesai',
  target: 'Target', target_value: 'Target Tahunan', target_result: 'Target Hasil',
  expected_outcome: 'Ekspektasi Hasil', reason: 'Alasan', main_risk: 'Risiko Utama',
  alternative: 'Alternatif', impact: 'Dampak', team_id: 'Tim',
};

// Whitelist configurable per cardType. Overlap dgn HARDCODED_CORE (locked base) —
// admin tak bisa disable locked, hanya menambah/mengurangi lapisan configurable.
const CONFIGURABLE_FIELDS: Record<CardTypeGated, string[]> = {
  goal:              ['target_value'],
  strategy:          ['target', 'expected_outcome'],
  initiative:        ['reason', 'main_risk', 'alternative'],
  action_plan:       ['target_result', 'team_id'],
  development_area:  [],
  problem_statement: ['impact'],
};

export default function SettingsCardCompletionRuleScreen() {
  const { profile, can } = useProfile();
  const allowed = can('manage_card_completion_rule') || can('manage_settings');
  const orgId = profile?.organization_id ?? '';
  const qc = useQueryClient();

  const [cardType, setCardType] = useState<CardTypeGated>('goal');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const ruleQ = useQuery({
    queryKey: ['card-rules', 'completion', orgId, cardType],
    queryFn: () => getCompletionRule(orgId, cardType),
    enabled: !!orgId && allowed,
  });

  // Prefill dari server query; pola standar React Query → local editable state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ruleQ.data) setSelected(new Set(ruleQ.data.requiredFields));
  }, [ruleQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => upsertCompletionRule(cardType, Array.from(selected), undefined),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['card-rules', 'completion', orgId, cardType] });
    },
    onError: (e) => setError(reportError('Simpan Card Completion Rule', e, 'Gagal menyimpan.')),
  });

  function toggle(field: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Aturan Penyelesaian Card' }} />
      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">Aturan Penyelesaian Card</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Field wajib per jenis card sebelum bisa diaktifkan.
          </Text>
        </View>
        {!allowed ? (
          <AccessDenied message="Aturan Penyelesaian Card hanya untuk pemegang izin Kelola Card Completion Rule. Anda tidak memiliki akses." />
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

            <View className="mt-2 gap-2">
              <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                Wajib bawaan sistem
              </Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Sesuai PRD — tidak bisa dinonaktifkan.
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {HARDCODED_CORE[cardType].map((f) => (
                  <View
                    key={f}
                    accessibilityState={{ disabled: true }}
                    className="rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                    <Text className="text-xs text-neutral-600 dark:text-neutral-400">
                      {FIELD_LABEL[f] ?? f}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-2 gap-2">
              <Text className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                Wajib tambahan per organisasi
              </Text>
              {CONFIGURABLE_FIELDS[cardType].length === 0 ? (
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                  Belum ada field tambahan yang bisa dikonfigurasi untuk jenis ini.
                </Text>
              ) : (
                CONFIGURABLE_FIELDS[cardType].map((f) => {
                  const checked = selected.has(f);
                  return (
                    <Pressable
                      key={f}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`Toggle ${FIELD_LABEL[f] ?? f}`}
                      className="min-h-[44px] flex-row items-center justify-between rounded-xl border border-neutral-300 px-3 py-2 dark:border-neutral-700"
                      onPress={() => toggle(f)}>
                      <Text className="text-base text-black dark:text-white">
                        {FIELD_LABEL[f] ?? f}
                      </Text>
                      <Text className="text-base font-semibold text-brand-dark">
                        {checked ? '✓' : ''}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>

            {error ? <Text className="text-sm text-red-700 dark:text-red-400">{error}</Text> : null}
            <Button
              label="Simpan Aturan"
              accessibilityLabel="Simpan Aturan Penyelesaian Card"
              onPress={() => saveMut.mutate()}
              loading={saveMut.isPending}
            />
          </SectionCard>
        )}
      </View>
    </ScrollView>
  );
}
