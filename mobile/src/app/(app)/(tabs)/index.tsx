import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

import { GreetingHero } from '@/components/greeting-hero';
import {
  Badge,
  EmptyState,
  ErrorState,
  GuidanceNote,
  PriorityCard,
  SectionCard,
  SkeletonList,
} from '@/components/ui';
import { getProfileAgeInDays, useProfile } from '@/hooks/use-profile';
import {
  ACTION_PLAN_STATUS_LABEL,
  STATUS_TONE,
  listMyActionPlans,
  listPendingReviews,
  type ActionPlanWithPeople,
} from '@/lib/cards';
import {
  getOrgToday,
  listNearDeadline,
  listOverdueItems,
  listTodayRepeatInstances,
  type HomeItem,
} from '@/lib/home';
import { INSTANCE_STATUS_LABEL, INSTANCE_STATUS_TONE } from '@/lib/repeat';

const ONBOARDING_DAYS = 7;

// ---------------------------------------------------------------- rows

function TaskRow({ item, onPress }: { item: ActionPlanWithPeople; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">{item.name}</Text>
        <Badge label={ACTION_PLAN_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
      </View>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {item.deadline ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">⏰ Deadline {item.deadline}</Text>
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

function HomeItemRow({ item, onPress }: { item: HomeItem; onPress: () => void }) {
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-black dark:text-white">
          {item.name ?? 'Tanpa nama'}
        </Text>
        <Badge
          label={INSTANCE_STATUS_LABEL[item.status] ?? item.status}
          tone={INSTANCE_STATUS_TONE[item.status] ?? 'neutral'}
        />
      </View>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {item.due ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">⏰ {item.due}</Text>
        ) : null}
        {item.kind === 'instance' ? (
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">🔁 Repeat</Text>
        ) : null}
      </View>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- section shell

/** Wrapper section: judul + 4 state (loading/error/empty/data) independen per-section (AC-H11). */
function Section({
  title,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyTitle,
  emptyDesc,
  children,
}: {
  title: string;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDesc: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <Text className="text-lg font-bold text-black dark:text-white">{title}</Text>
      {isLoading ? (
        <SkeletonList count={2} />
      ) : isError ? (
        <ErrorState onRetry={onRetry} />
      ) : isEmpty ? (
        <EmptyState title={emptyTitle} description={emptyDesc} />
      ) : (
        children
      )}
    </View>
  );
}

// ---------------------------------------------------------------- screen

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const openActionPlan = (id: string) => router.push(`/action-plan/${id}` as Href);

  // Tanggal "hari ini" dari SERVER (org timezone) — hanya untuk label, tak dipakai klasifikasi (CF-3).
  const todayQ = useQuery({ queryKey: ['org-today'], queryFn: getOrgToday, staleTime: Infinity });

  // Per-section queries (retry granular AC-H11). Klasifikasi tanggal terjadi di server.
  const mineQ = useQuery({ queryKey: ['home-my-plans'], queryFn: listMyActionPlans });
  const reviewQ = useQuery({ queryKey: ['home-reviews'], queryFn: listPendingReviews });
  const todayRepeatQ = useQuery({ queryKey: ['home-today-repeat'], queryFn: listTodayRepeatInstances });
  const overdueQ = useQuery({ queryKey: ['home-overdue'], queryFn: listOverdueItems });
  const nearQ = useQuery({ queryKey: ['home-near'], queryFn: listNearDeadline });

  useFocusEffect(
    useCallback(() => {
      mineQ.refetch();
      reviewQ.refetch();
      todayRepeatQ.refetch();
      overdueQ.refetch();
      nearQ.refetch();
    }, [mineQ, reviewQ, todayRepeatQ, overdueQ, nearQ]),
  );

  const mine = mineQ.data ?? [];
  const todo = mine.filter((p) => p.status === 'assigned' || p.status === 'in_progress');
  const revisi = mine.filter((p) => p.status === 'revision');

  // Hitungan prioritas dari server; saat error tampilkan "—" (bukan "0" yang menyesatkan).
  const overdueCount = overdueQ.isError ? '—' : String(overdueQ.data?.length ?? 0);
  const reviewCount = reviewQ.isError ? '—' : String(reviewQ.data?.length ?? 0);
  const numericPriority = (overdueQ.data?.length ?? 0) + (reviewQ.data?.length ?? 0);

  const name = profile?.full_name?.trim()?.split(' ')[0] || 'Rekan';
  const dateLabel = todayQ.data
    ? new Date(`${todayQ.data}T00:00:00`)
        .toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
        .replace(/^\w/, (c) => c.toUpperCase())
    : '';
  const isNewUser = !!profile && getProfileAgeInDays(profile.created_at) < ONBOARDING_DAYS;

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-6 p-5">
        <GreetingHero
          name={name}
          dateLabel={dateLabel}
          message={
            numericPriority > 0
              ? `Ada ${numericPriority} prioritas utama hari ini.`
              : 'Semua tercatat rapi. Kerja bagus.'
          }
        />

        {isNewUser ? (
          <GuidanceNote
            title="Selamat datang di RencanApp"
            body="Home adalah pusat fokus harian Anda: tugas hari ini, yang butuh review, terlewat, dan deadline mendekat tampil di sini. Buka tiap kartu untuk mulai mengeksekusi."
          />
        ) : null}

        <View className="gap-3">
          <Text className="text-lg font-bold text-black dark:text-white">Prioritas</Text>
          <View className="flex-row gap-3">
            <PriorityCard
              icon="!"
              title="Terlewat"
              subtitle={
                overdueQ.isError
                  ? 'Gagal memuat.'
                  : (overdueQ.data?.length ?? 0) > 0
                    ? `${overdueCount} item lewat deadline.`
                    : 'Tidak ada yang telat.'
              }
              tone="danger"
            />
            <PriorityCard
              icon="R"
              title="Butuh Review"
              subtitle={
                reviewQ.isError
                  ? 'Gagal memuat.'
                  : (reviewQ.data?.length ?? 0) > 0
                    ? `${reviewCount} bukti menunggu keputusan.`
                    : 'Tidak ada antrean review.'
              }
              tone="info"
            />
          </View>
        </View>

        <Section
          title="Perlu dikerjakan"
          isLoading={mineQ.isLoading}
          isError={mineQ.isError}
          onRetry={() => mineQ.refetch()}
          isEmpty={todo.length === 0}
          emptyTitle="Tidak ada tugas aktif"
          emptyDesc="Action Plan yang Anda jadi PIC-nya akan muncul di sini.">
          {todo.map((item) => (
            <TaskRow key={item.id} item={item} onPress={() => openActionPlan(item.id)} />
          ))}
        </Section>

        <Section
          title="Repeat hari ini"
          isLoading={todayRepeatQ.isLoading}
          isError={todayRepeatQ.isError}
          onRetry={() => todayRepeatQ.refetch()}
          isEmpty={(todayRepeatQ.data?.length ?? 0) === 0}
          emptyTitle="Tidak ada tugas rutin hari ini"
          emptyDesc="Instance Action Plan Repeat yang jatuh tempo hari ini akan muncul di sini.">
          {(todayRepeatQ.data ?? []).map((item) => (
            <HomeItemRow key={item.id} item={item} onPress={() => openActionPlan(item.action_plan_id)} />
          ))}
        </Section>

        <Section
          title="Butuh review Anda"
          isLoading={reviewQ.isLoading}
          isError={reviewQ.isError}
          onRetry={() => reviewQ.refetch()}
          isEmpty={(reviewQ.data?.length ?? 0) === 0}
          emptyTitle="Tidak ada yang menunggu review"
          emptyDesc="Submission yang menunggu persetujuan Anda akan muncul di sini.">
          {(reviewQ.data ?? []).map((item) => (
            <TaskRow key={item.id} item={item} onPress={() => openActionPlan(item.id)} />
          ))}
        </Section>

        <Section
          title="Terlewat"
          isLoading={overdueQ.isLoading}
          isError={overdueQ.isError}
          onRetry={() => overdueQ.refetch()}
          isEmpty={(overdueQ.data?.length ?? 0) === 0}
          emptyTitle="Tidak ada yang terlewat"
          emptyDesc="Action Plan & instance yang lewat deadline akan muncul di sini.">
          {(overdueQ.data ?? []).map((item) => (
            <HomeItemRow key={item.id} item={item} onPress={() => openActionPlan(item.action_plan_id)} />
          ))}
        </Section>

        <Section
          title="Deadline mendekat"
          isLoading={nearQ.isLoading}
          isError={nearQ.isError}
          onRetry={() => nearQ.refetch()}
          isEmpty={(nearQ.data?.length ?? 0) === 0}
          emptyTitle="Tidak ada deadline mendekat"
          emptyDesc="Item dengan deadline dalam 3 hari ke depan akan muncul di sini.">
          {(nearQ.data ?? []).map((item) => (
            <HomeItemRow key={item.id} item={item} onPress={() => openActionPlan(item.action_plan_id)} />
          ))}
        </Section>

        <Section
          title="Revisi diperlukan"
          isLoading={mineQ.isLoading}
          isError={mineQ.isError}
          onRetry={() => mineQ.refetch()}
          isEmpty={revisi.length === 0}
          emptyTitle="Tidak ada revisi"
          emptyDesc="Pekerjaan yang ditolak reviewer dan perlu diperbaiki akan muncul di sini.">
          {revisi.map((item) => (
            <TaskRow key={item.id} item={item} onPress={() => openActionPlan(item.id)} />
          ))}
        </Section>
      </View>
    </ScrollView>
  );
}
