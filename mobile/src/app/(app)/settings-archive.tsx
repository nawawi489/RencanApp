// Fase 8 — Settings > Arsip. Daftar card terarsip + UI-S-AR1: filter chip per entity type
// + tombol "Pulihkan" per row (RPC restore_card → status 'draft'). TIDAK ada hapus permanen.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { Button, EmptyState, SectionCard, SkeletonList } from '@/components/ui';
import { useSearchCards } from '@/hooks/use-search';
import { restoreCard, type CardEntityType } from '@/lib/governance-admin';

const ENTITY_LABEL: Record<string, string> = {
  goal: 'Goal',
  kpi_area: 'KPI Area',
  strategy: 'Strategy',
  initiative: 'Initiative',
  action_plan: 'Action Plan',
  development_area: 'Development Area',
  problem_statement: 'Problem Statement',
};

const FILTER_CHIPS: { key: 'semua' | CardEntityType; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'goal', label: 'Goal' },
  { key: 'kpi_area', label: 'KPI Area' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'initiative', label: 'Initiative' },
  { key: 'action_plan', label: 'Action Plan' },
  { key: 'development_area', label: 'Dev Area' },
  { key: 'problem_statement', label: 'Problem' },
];

export default function SettingsArchiveScreen() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<'semua' | CardEntityType>('semua');
  const { results, isLoading, enabled } = useSearchCards({ query, includeArchived: true });

  const restoreM = useMutation({
    mutationFn: (args: { entityType: CardEntityType; entityId: string }) =>
      restoreCard(args.entityType, args.entityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['search'] });
      Alert.alert('Dipulihkan', 'Card kembali ke status Draft. Verifikasi lalu Aktifkan kembali.');
    },
    onError: (e) => Alert.alert('Gagal pulihkan', e instanceof Error ? e.message : 'Kesalahan.'),
  });

  const archived = useMemo(() => {
    const filt = results.filter((r) => r.status === 'archived');
    if (chip === 'semua') return filt;
    return filt.filter((r) => r.entity_type === chip);
  }, [results, chip]);

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Arsip' }} />
      <View className="gap-3 p-5">
        <Text className="text-xs text-neutral-400">
          Card yang diarsipkan tidak dihapus permanen — pemegang akses dapat memulihkan ke Draft.
        </Text>
        <TextInput
          className="min-h-[44px] rounded-xl border border-neutral-300 px-4 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Cari card terarsip…"
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Kotak pencarian arsip"
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          accessibilityLabel="Filter tipe arsip"
          contentContainerStyle={{ gap: 8 }}>
          {FILTER_CHIPS.map((c) => {
            const active = chip === c.key;
            return (
              <Pressable
                key={c.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filter ${c.label}`}
                onPress={() => setChip(c.key)}
                className={`min-h-[36px] items-center justify-center rounded-full px-3 ${
                  active ? 'bg-brand-dark' : 'border border-neutral-300 dark:border-neutral-700'
                } active:opacity-70`}>
                <Text
                  className={`text-xs font-semibold ${
                    active ? 'text-white' : 'text-black dark:text-white'
                  }`}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {!enabled ? (
          <EmptyState title="Cari arsip" description="Ketik kata kunci untuk menemukan card terarsip." />
        ) : isLoading ? (
          <SkeletonList count={3} />
        ) : archived.length === 0 ? (
          <EmptyState title="Tidak ada arsip" description="Tidak ada card terarsip yang cocok dengan filter." />
        ) : (
          archived.map((r) => (
            <SectionCard key={`${r.entity_type}:${r.id}`}>
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold text-black dark:text-white">{r.name}</Text>
                  <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                    {ENTITY_LABEL[r.entity_type] ?? r.entity_type} · Diarsipkan
                  </Text>
                </View>
              </View>
              <Button
                label="Pulihkan ke Draft"
                variant="secondary"
                loading={restoreM.isPending}
                onPress={() =>
                  Alert.alert(
                    'Pulihkan card?',
                    `Mengembalikan "${r.name}" ke status Draft. Anda perlu verifikasi & Aktifkan ulang.`,
                    [
                      { text: 'Tutup', style: 'cancel' },
                      {
                        text: 'Pulihkan',
                        onPress: () =>
                          restoreM.mutate({ entityType: r.entity_type as CardEntityType, entityId: r.id }),
                      },
                    ],
                  )
                }
              />
            </SectionCard>
          ))
        )}
      </View>
    </ScrollView>
  );
}
