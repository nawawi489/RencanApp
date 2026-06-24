import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { GreetingHero } from '@/components/greeting-hero';
import { Badge, EmptyState, ErrorState, PriorityCard, SectionCard, SkeletonList } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import {
  ACTION_PLAN_STATUS_LABEL,
  STATUS_TONE,
  listMyActionPlans,
  listPendingReviews,
  type ActionPlanWithPeople,
} from '@/lib/cards';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(p: ActionPlanWithPeople): boolean {
  return (
    !!p.deadline && p.deadline < todayISO() && p.status !== 'approved' && p.status !== 'done'
  );
}

function TaskRow({ item, onPress }: { item: ActionPlanWithPeople; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge label={ACTION_PLAN_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
      </View>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {item.deadline ? (
          <Text className={`text-xs ${isOverdue(item) ? 'font-semibold text-red-600' : 'text-neutral-500 dark:text-neutral-400'}`}>
            ⏰ {isOverdue(item) ? 'Lewat ' : ''}Deadline {item.deadline}
          </Text>
        ) : null}
        {item.pic ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            👤 {item.pic.full_name ?? item.pic.email}
          </Text>
        ) : null}
      </View>
    </SectionCard>
  );
}

function Section({
  title,
  query,
  emptyTitle,
  emptyDesc,
  onItem,
}: {
  title: string;
  query: ReturnType<typeof useQuery<ActionPlanWithPeople[]>>;
  emptyTitle: string;
  emptyDesc: string;
  onItem: (id: string) => void;
}) {
  const items = query.data;
  return (
    <View className="gap-3">
      <Text className="text-lg font-bold text-black dark:text-white">{title}</Text>
      {query.isLoading ? (
        <SkeletonList count={2} />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
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
  const { profile } = useProfile();
  const mineQ = useQuery({ queryKey: ['home-my-plans'], queryFn: listMyActionPlans });
  const reviewQ = useQuery({ queryKey: ['home-reviews'], queryFn: listPendingReviews });

  useFocusEffect(
    useCallback(() => {
      mineQ.refetch();
      reviewQ.refetch();
    }, [mineQ, reviewQ]),
  );

  const overdue = (mineQ.data ?? []).filter(isOverdue).length;
  const reviewCount = reviewQ.data?.length ?? 0;
  const name = profile?.full_name?.trim()?.split(' ')[0] || 'Rekan';
  const dateLabel = new Date()
    .toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-6 p-5">
        <GreetingHero
          name={name}
          dateLabel={dateLabel}
          message={
            overdue + reviewCount > 0
              ? `Ada ${overdue + reviewCount} prioritas utama hari ini.`
              : 'Semua tercatat rapi. Kerja bagus.'
          }
        />

        <View className="gap-3">
          <Text className="text-lg font-bold text-black dark:text-white">Prioritas</Text>
          <View className="flex-row gap-3">
            <PriorityCard
              icon="!"
              title="Lewat deadline"
              subtitle={overdue > 0 ? `${overdue} Action Plan perlu tindakan.` : 'Tidak ada yang telat.'}
              tone="danger"
            />
            <PriorityCard
              icon="R"
              title="Butuh Review"
              subtitle={reviewCount > 0 ? `${reviewCount} bukti menunggu keputusan.` : 'Tidak ada antrean review.'}
              tone="info"
            />
          </View>
        </View>

        <Section
          title="Perlu dikerjakan"
          query={mineQ}
          emptyTitle="Tidak ada tugas aktif"
          emptyDesc="Action Plan yang Anda jadi PIC-nya akan muncul di sini."
          onItem={(id) => router.push(`/action-plan/${id}` as Href)}
        />

        <Section
          title="Butuh review Anda"
          query={reviewQ}
          emptyTitle="Tidak ada yang menunggu review"
          emptyDesc="Submission yang menunggu persetujuan Anda akan muncul di sini."
          onItem={(id) => router.push(`/action-plan/${id}` as Href)}
        />
      </View>
    </ScrollView>
  );
}
