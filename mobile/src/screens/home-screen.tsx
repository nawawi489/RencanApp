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
  ProgressBar,
  SectionCard,
  SkeletonList,
  StatPill,
} from '@/components/ui';
import { computeTaskProgress } from '@/lib/progress';
import { formatRemaining } from '@/lib/strategy-gap';
import { getProfileAgeInDays, useProfile } from '@/hooks/use-profile';
import {
  ACTION_PLAN_STATUS_LABEL,
  STATUS_TONE,
  listMyTasks,
  listPendingReviews,
  type TaskWithPeople,
} from '@/lib/cards';
import {
  getOrgToday,
  listKpiNeedsAttention,
  listNearDeadline,
  listOverdueItems,
  listPendingInstanceReviews,
  listTodayRepeatInstances,
  type HomeItem,
} from '@/lib/home';
import { INSTANCE_STATUS_LABEL, INSTANCE_STATUS_TONE } from '@/lib/repeat';

const ONBOARDING_DAYS = 7;

function TypeBadge({ repeat }: { repeat: boolean }) {
  return (
    <View
      className={`h-9 w-9 items-center justify-center rounded-xl ${repeat ? 'bg-green-700' : 'bg-brand-dark'}`}
      importantForAccessibility="no-hide-descendants">
      <Text className="text-xs font-bold text-white">{repeat ? 'RP' : 'AP'}</Text>
    </View>
  );
}

function TaskRow({ item, onPress }: { item: TaskWithPeople; onPress: () => void }) {
  const repeat = item.repeat_setting === 'repeat';
  const progress = computeTaskProgress({ status: item.status, repeat, compliancePercent: null });
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start gap-3">
        <TypeBadge repeat={repeat} />
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-base font-semibold text-black dark:text-white" numberOfLines={2}>
              {item.name}
            </Text>
            <Badge label={ACTION_PLAN_STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status]} />
          </View>
          <ProgressBar value={progress} showLabel tone={progress >= 100 ? 'success' : 'brand'} />
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
        </View>
      </View>
    </SectionCard>
  );
}

function HomeItemRow({ item, onPress }: { item: HomeItem; onPress: () => void }) {
  const repeat = item.kind === 'instance';
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start gap-3">
        <TypeBadge repeat={repeat} />
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-base font-semibold text-black dark:text-white" numberOfLines={2}>
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
            {repeat ? (
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">🔁 Repeat</Text>
            ) : null}
          </View>
        </View>
      </View>
    </SectionCard>
  );
}

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

export default function LiveHomeScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const openTask = (id: string) => router.push(`/task/${id}` as Href);
  const openStrategy = (id: string) => router.push(`/strategy/${id}` as Href);
  // WS-3a (AP-03) — baris section campuran (Repeat/Terlewat/Deadline) memuat one-time AP
  // DAN Repeat Instance. Instance harus membuka layar instance-nya sendiri; one-time AP
  // membuka parent AP. Satu helper dipakai ketiga section agar routing konsisten.
  const openHomeItem = (item: HomeItem) =>
    router.push(
      (item.kind === 'instance'
        ? `/task/instance/${item.id}`
        : `/task/${item.task_id}`) as Href,
    );

  const todayQ = useQuery({ queryKey: ['org-today'], queryFn: getOrgToday, staleTime: Infinity });
  const mineQ = useQuery({ queryKey: ['home-my-plans'], queryFn: listMyTasks });
  const reviewQ = useQuery({ queryKey: ['home-reviews'], queryFn: listPendingReviews });
  const reviewInstQ = useQuery({ queryKey: ['home-review-instances'], queryFn: listPendingInstanceReviews });
  const todayRepeatQ = useQuery({ queryKey: ['home-today-repeat'], queryFn: listTodayRepeatInstances });
  const overdueQ = useQuery({ queryKey: ['home-overdue'], queryFn: listOverdueItems });
  const nearQ = useQuery({ queryKey: ['home-near'], queryFn: listNearDeadline });
  const kpiAttnQ = useQuery({ queryKey: ['home-kpi-attention'], queryFn: listKpiNeedsAttention });

  const refetchMine = mineQ.refetch;
  const refetchReview = reviewQ.refetch;
  const refetchReviewInst = reviewInstQ.refetch;
  const refetchTodayRepeat = todayRepeatQ.refetch;
  const refetchOverdue = overdueQ.refetch;
  const refetchNear = nearQ.refetch;
  const refetchKpiAttn = kpiAttnQ.refetch;
  useFocusEffect(
    useCallback(() => {
      refetchMine();
      refetchReview();
      refetchReviewInst();
      refetchTodayRepeat();
      refetchOverdue();
      refetchNear();
      refetchKpiAttn();
    }, [refetchMine, refetchReview, refetchReviewInst, refetchTodayRepeat, refetchOverdue, refetchNear, refetchKpiAttn]),
  );

  const mine = mineQ.data ?? [];
  const todo = mine.filter((p) => p.status === 'assigned' || p.status === 'in_progress');
  const revisi = mine.filter((p) => p.status === 'revision');

  const overdueCount = overdueQ.isError ? '—' : String(overdueQ.data?.length ?? 0);
  // Antrean review = one-time AP submitted + instance repeat submitted (dua sumber).
  const reviewError = reviewQ.isError || reviewInstQ.isError;
  const reviewTotal = (reviewQ.data?.length ?? 0) + (reviewInstQ.data?.length ?? 0);
  const reviewCount = reviewError ? '—' : String(reviewTotal);
  const numericPriority = (overdueQ.data?.length ?? 0) + reviewTotal;

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
            title="Selamat datang di Rencanapp"
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
                reviewError
                  ? 'Gagal memuat.'
                  : reviewTotal > 0
                    ? `${reviewCount} bukti menunggu keputusan.`
                    : 'Tidak ada antrean review.'
              }
              tone="info"
            />
            <PriorityCard
              icon="K"
              title="Gap Strategy"
              subtitle={
                kpiAttnQ.isError
                  ? 'Gagal memuat.'
                  : (kpiAttnQ.data?.length ?? 0) > 0
                    ? `${kpiAttnQ.data!.length} KPI perlu dipantau.`
                    : 'Semua KPI sesuai target.'
              }
              tone="warn"
            />
          </View>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-black dark:text-white">Snapshot Tim</Text>
            {!kpiAttnQ.isLoading && !kpiAttnQ.isError && (kpiAttnQ.data?.length ?? 0) > 0 ? (
              <Badge label="Perlu dipantau" tone="warn" />
            ) : null}
          </View>
          {kpiAttnQ.isLoading ? (
            <SkeletonList count={1} />
          ) : kpiAttnQ.isError ? (
            <ErrorState onRetry={() => kpiAttnQ.refetch()} />
          ) : (kpiAttnQ.data?.length ?? 0) === 0 ? (
            <EmptyState
              tone="success"
              title="Semua Strategy terpantau"
              description="Strategy aktif sudah punya progres tercatat."
            />
          ) : (
            <View className="gap-3">
              <View className="flex-row gap-2">
                <StatPill label="KPI perlu progres" value={String(kpiAttnQ.data!.length)} tone="warn" />
              </View>
              {kpiAttnQ.data!.slice(0, 3).map((k) => (
                <SectionCard key={k.id} onPress={() => openStrategy(k.id)}>
                  <View className="gap-1.5">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text
                        className="flex-1 text-base font-semibold text-black dark:text-white"
                        numberOfLines={1}>
                        {k.name}
                      </Text>
                      {k.percent != null ? (
                        <Badge label={`${k.percent}%`} tone={k.percent >= 70 ? 'info' : 'warn'} />
                      ) : (
                        <Badge label="Belum ada progres" tone="warn" />
                      )}
                    </View>
                    {k.percent != null ? (
                      <>
                        <ProgressBar value={k.percent} tone="brand" />
                        {k.remaining != null && k.remaining > 0 ? (
                          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                            {formatRemaining(k.remaining, k.unit)}
                          </Text>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                </SectionCard>
              ))}
            </View>
          )}
        </View>

        <Section
          title="Perlu dikerjakan"
          isLoading={mineQ.isLoading}
          isError={mineQ.isError}
          onRetry={() => mineQ.refetch()}
          isEmpty={todo.length === 0}
          emptyTitle="Tidak ada tugas aktif"
          emptyDesc="Task yang Anda jadi PIC-nya akan muncul di sini.">
          {todo.map((item) => (
            <TaskRow key={item.id} item={item} onPress={() => openTask(item.id)} />
          ))}
        </Section>

        <Section
          title="Repeat hari ini"
          isLoading={todayRepeatQ.isLoading}
          isError={todayRepeatQ.isError}
          onRetry={() => todayRepeatQ.refetch()}
          isEmpty={(todayRepeatQ.data?.length ?? 0) === 0}
          emptyTitle="Tidak ada tugas rutin hari ini"
          emptyDesc="Instance Task Repeat yang jatuh tempo hari ini akan muncul di sini.">
          {(todayRepeatQ.data ?? []).map((item) => (
            <HomeItemRow key={item.id} item={item} onPress={() => openHomeItem(item)} />
          ))}
        </Section>

        <Section
          title="Butuh review Anda"
          isLoading={reviewQ.isLoading || reviewInstQ.isLoading}
          isError={reviewError}
          onRetry={() => {
            reviewQ.refetch();
            reviewInstQ.refetch();
          }}
          isEmpty={reviewTotal === 0}
          emptyTitle="Tidak ada yang menunggu review"
          emptyDesc="Submission yang menunggu persetujuan Anda akan muncul di sini.">
          {(reviewQ.data ?? []).map((item) => (
            <TaskRow key={item.id} item={item} onPress={() => openTask(item.id)} />
          ))}
          {(reviewInstQ.data ?? []).map((item) => (
            <HomeItemRow key={item.id} item={item} onPress={() => openHomeItem(item)} />
          ))}
        </Section>

        <Section
          title="Terlewat"
          isLoading={overdueQ.isLoading}
          isError={overdueQ.isError}
          onRetry={() => overdueQ.refetch()}
          isEmpty={(overdueQ.data?.length ?? 0) === 0}
          emptyTitle="Tidak ada yang terlewat"
          emptyDesc="Task & instance yang lewat deadline akan muncul di sini.">
          {(overdueQ.data ?? []).map((item) => (
            <HomeItemRow key={item.id} item={item} onPress={() => openHomeItem(item)} />
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
            <HomeItemRow key={item.id} item={item} onPress={() => openHomeItem(item)} />
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
            <TaskRow key={item.id} item={item} onPress={() => openTask(item.id)} />
          ))}
        </Section>
      </View>
    </ScrollView>
  );
}
