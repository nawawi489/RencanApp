import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native-css/components';

import { Badge, EmptyState, SectionCard } from '@/components/ui';
import {
  ACTION_PLAN_STATUS_LABEL,
  STATUS_TONE,
  listMyActionPlans,
  listPendingReviews,
  type ActionPlanWithPeople,
} from '@/lib/cards';

function TaskRow({ item, onPress }: { item: ActionPlanWithPeople; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge label={ACTION_PLAN_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
      </View>
      {item.deadline ? (
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">⏰ Deadline {item.deadline}</Text>
      ) : null}
    </SectionCard>
  );
}

function Section({
  title,
  loading,
  items,
  emptyTitle,
  emptyDesc,
  onItem,
}: {
  title: string;
  loading: boolean;
  items: ActionPlanWithPeople[] | undefined;
  emptyTitle: string;
  emptyDesc: string;
  onItem: (id: string) => void;
}) {
  return (
    <View className="gap-3">
      <Text className="text-lg font-bold text-black dark:text-white">{title}</Text>
      {loading ? (
        <ActivityIndicator />
      ) : items && items.length > 0 ? (
        items.map((item) => <TaskRow key={item.id} item={item} onPress={() => onItem(item.id)} />)
      ) : (
        <EmptyState title={emptyTitle} description={emptyDesc} />
      )}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const mineQ = useQuery({ queryKey: ['home-my-plans'], queryFn: listMyActionPlans });
  const reviewQ = useQuery({ queryKey: ['home-reviews'], queryFn: listPendingReviews });

  useFocusEffect(
    useCallback(() => {
      mineQ.refetch();
      reviewQ.refetch();
    }, [mineQ, reviewQ]),
  );

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <View className="gap-6 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">Home</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            Today Command Center — fokus kerja Anda hari ini.
          </Text>
        </View>

        <Section
          title="Perlu dikerjakan"
          loading={mineQ.isLoading}
          items={mineQ.data}
          emptyTitle="Tidak ada tugas aktif"
          emptyDesc="Action Plan yang Anda jadi PIC-nya akan muncul di sini."
          onItem={(id) => router.push(`/action-plan/${id}` as Href)}
        />

        <Section
          title="Butuh review Anda"
          loading={reviewQ.isLoading}
          items={reviewQ.data}
          emptyTitle="Tidak ada yang menunggu review"
          emptyDesc="Submission yang menunggu persetujuan Anda akan muncul di sini."
          onItem={(id) => router.push(`/action-plan/${id}` as Href)}
        />
      </View>
    </ScrollView>
  );
}
