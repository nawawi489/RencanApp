// Fase 8 — Search global (RLS-scoped via search_cards RPC). Empty state saat query kosong.
import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList } from 'react-native';
import { Text, TextInput, View } from 'react-native-css/components';

import { EmptyState, SectionCard, SkeletonList, usePlaceholderColor } from '@/components/ui';
import { useSearchCards } from '@/hooks/use-search';
import { ENTITY_ROUTE_SEGMENT } from '@/lib/entity-routes';
import type { CardEntityType, SearchResult } from '@/lib/governance-admin';
import { CARD_TYPE_LABEL, type CardType } from '@/lib/settings-mbr';

export function LiveSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { results, isLoading, enabled } = useSearchCards({ query });
  const placeholderColor = usePlaceholderColor();

  const header = (
    <View className="pb-3">
      <TextInput
        className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
        placeholder="Cari Goal, Rencana Aksi, Tugas…"
        placeholderTextColor={placeholderColor}
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Kotak pencarian"
      />
    </View>
  );

  let body: React.ReactNode = null;
  if (!enabled) {
    body = (
      <EmptyState title="Mulai mencari" description="Ketik kata kunci untuk mencari card yang dapat Anda akses." />
    );
  } else if (isLoading) {
    body = <SkeletonList count={4} />;
  } else if (results.length === 0) {
    body = <EmptyState title="Tidak ada hasil" description="Tidak ada card cocok yang dapat Anda akses." />;
  }

  if (body !== null) {
    return (
      <View className="flex-1 bg-neutral-50 dark:bg-black">
        <Stack.Screen options={{ title: 'Cari' }} />
        <View className="gap-3 p-5">
          {header}
          {body}
        </View>
      </View>
    );
  }

  const renderItem = ({ item: r }: { item: SearchResult }) => {
    const segment = ENTITY_ROUTE_SEGMENT[r.entity_type as CardEntityType];
    return (
      <SectionCard
        onPress={segment ? () => router.push(`/${segment}/${r.id}` as Href) : undefined}
      >
        <Text className="text-base font-semibold text-black dark:text-white">{r.name}</Text>
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">
          {CARD_TYPE_LABEL[r.entity_type as CardType] ?? r.entity_type}
        </Text>
      </SectionCard>
    );
  };

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-black">
      <Stack.Screen options={{ title: 'Cari' }} />
      <FlatList<SearchResult>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={results}
        keyExtractor={(r) => `${r.entity_type}:${r.id}`}
        ListHeaderComponent={header}
        renderItem={renderItem}
      />
    </View>
  );
}

export default function SearchRoute() {
  return <LiveSearchScreen />;
}
