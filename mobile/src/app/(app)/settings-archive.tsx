// Fase 8 — Settings > Arsip. Daftar card terarsip (search includeArchived). TIDAK ada hapus permanen
// (governance: archived = soft-delete, bukan hard delete).
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native-css/components';

import { EmptyState, SectionCard, SkeletonList } from '@/components/ui';
import { useSearchCards } from '@/hooks/use-search';

const ENTITY_LABEL: Record<string, string> = {
  goal: 'Goal',
  kpi_area: 'KPI Area',
  strategy: 'Strategy',
  initiative: 'Initiative',
  action_plan: 'Action Plan',
  development_area: 'Development Area',
  problem_statement: 'Problem Statement',
};

export default function SettingsArchiveScreen() {
  const [query, setQuery] = useState('');
  const { results, isLoading, enabled } = useSearchCards({ query, includeArchived: true });
  const archived = results.filter((r) => r.status === 'archived');

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Arsip' }} />
      <View className="gap-3 p-5">
        <Text className="text-xs text-neutral-400">
          Card yang diarsipkan tidak dihapus permanen — tetap dapat dicari oleh pemegang akses.
        </Text>
        <TextInput
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Cari card terarsip…"
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Kotak pencarian arsip"
        />
        {!enabled ? (
          <EmptyState title="Cari arsip" description="Ketik kata kunci untuk menemukan card terarsip." />
        ) : isLoading ? (
          <SkeletonList count={3} />
        ) : archived.length === 0 ? (
          <EmptyState title="Tidak ada arsip" description="Tidak ada card terarsip yang cocok." />
        ) : (
          archived.map((r) => (
            <SectionCard key={`${r.entity_type}:${r.id}`}>
              <Text className="text-base font-semibold text-black dark:text-white">{r.name}</Text>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                {ENTITY_LABEL[r.entity_type] ?? r.entity_type} · Diarsipkan
              </Text>
            </SectionCard>
          ))
        )}
      </View>
    </ScrollView>
  );
}
