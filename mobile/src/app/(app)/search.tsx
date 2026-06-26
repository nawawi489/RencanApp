// Fase 8 — Search global (RLS-scoped via search_cards RPC). Empty state saat query kosong.
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

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const { results, isLoading, enabled } = useSearchCards({ query });

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Cari' }} />
      <View className="gap-3 p-5">
        <TextInput
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Cari Goal, Initiative, Action Plan…"
          placeholderTextColor="#9ca3af"
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Kotak pencarian"
        />
        {!enabled ? (
          <EmptyState title="Mulai mencari" description="Ketik kata kunci untuk mencari card yang dapat Anda akses." />
        ) : isLoading ? (
          <SkeletonList count={4} />
        ) : results.length === 0 ? (
          <EmptyState title="Tidak ada hasil" description="Tidak ada card cocok yang dapat Anda akses." />
        ) : (
          results.map((r) => (
            <SectionCard key={`${r.entity_type}:${r.id}`}>
              <Text className="text-base font-semibold text-black dark:text-white">{r.name}</Text>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                {ENTITY_LABEL[r.entity_type] ?? r.entity_type}
              </Text>
            </SectionCard>
          ))
        )}
      </View>
    </ScrollView>
  );
}
