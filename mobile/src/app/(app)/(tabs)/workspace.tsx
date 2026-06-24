import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Badge, Button, EmptyState, ErrorState, SectionCard, SkeletonList } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import {
  INITIATIVE_STATUS_LABEL,
  STATUS_TONE,
  listInitiatives,
  type Initiative,
} from '@/lib/cards';

function InitiativeRow({ item, onPress }: { item: Initiative; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge label={INITIATIVE_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
      </View>
      {item.target_result ? (
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">🎯 {item.target_result}</Text>
      ) : null}
    </SectionCard>
  );
}

export default function WorkspaceScreen() {
  const router = useRouter();
  const { can } = useProfile();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['initiatives'], queryFn: listInitiatives });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-5 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Workspace</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Performance — Initiative & Action Plan (Fase 1). Hierarki strategis penuh menyusul di Fase 4.
          </Text>
        </View>

        {can('create_initiative') ? (
          <Button label="+ Initiative Baru" onPress={() => router.push('/initiative/new' as Href)} />
        ) : null}

        {isLoading ? (
          <SkeletonList count={3} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : data && data.length > 0 ? (
          <View className="gap-3">
            {data.map((item) => (
              <InitiativeRow key={item.id} item={item} onPress={() => router.push(`/initiative/${item.id}` as Href)} />
            ))}
          </View>
        ) : (
          <EmptyState
            title="Belum ada Initiative"
            description={
              can('create_initiative')
                ? 'Buat Initiative pertama, lalu pecah jadi Action Plan untuk ditugaskan ke tim.'
                : 'Anda akan melihat Initiative di sini begitu menjadi PIC atau Reviewer sebuah card.'
            }
          />
        )}
      </View>
    </ScrollView>
  );
}
