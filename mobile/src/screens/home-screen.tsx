import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { GreetingHero } from '@/components/greeting-hero';
import { useThemedIcon } from '@/providers/theme-provider';
import {
  Badge,
  EmptyState,
  ErrorState,
  GuidanceNote,
  PriorityCard,
  ProgressBar,
  SectionCard,
  SectionHeading,
  SkeletonList,
  type Tone,
} from '@/components/ui';
import { computeTaskProgress } from '@/lib/progress';
import { getProfileAgeInDays, useProfile } from '@/hooks/use-profile';
import { useAuth } from '@/providers/auth-provider';
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
import { HOME_QUERY_PREFIX } from '@/lib/home-queries';
import { INSTANCE_STATUS_LABEL, INSTANCE_STATUS_TONE } from '@/lib/repeat';
import { useBreakpoint } from '@/lib/responsive';

const ONBOARDING_DAYS = 7;
const MAX_TASK_ROWS = 5;
const MAX_UPDATE_ROWS = 3;
const MAX_REVIEW_ROWS = 5;
// Home dashboards are considered fresh for this long. On tab re-focus we refetch
// only the queries that have gone stale (see the focus effect), instead of firing
// all seven refetches on every focus.
const HOME_STALE_MS = 30_000;

function TypeBadge({ repeat }: { repeat: boolean }) {
  return (
    <View
      // §4.5 — min-h/min-w (bukan tinggi fixed) supaya glyph "RT"/"T" tak terpotong saat
      // Dynamic Type membesarkan teks. Badge dekoratif → disembunyikan dari a11y tree di
      // KEDUA platform: Android `no-hide-descendants` + iOS `accessibilityElementsHidden`
      // (pola berpasangan `ui.tsx`), supaya VoiceOver tak membaca glyph "RT"/"T".
      className={`min-h-[36px] min-w-[36px] items-center justify-center rounded-xl p-1.5 ${repeat ? 'bg-green-700' : 'bg-brand-dark'}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text className="text-xs font-bold text-white">{repeat ? 'RT' : 'T'}</Text>
    </View>
  );
}

// Baris meta kecil (deadline / PIC / repeat) — ikon Ionicons dekoratif (§10) + teks muted.
// Teks tetap pembawa makna (§4); ikon disembunyikan dari a11y tree.
function MetaChip({
  icon,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: ReactNode;
}) {
  const color = useThemedIcon('#6b7280', '#a3a3a3');
  return (
    <View className="flex-row items-center gap-1">
      <Ionicons
        name={icon}
        size={12}
        color={color}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">{children}</Text>
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
            {/* Sinyal repeat non-warna untuk pembaca layar: TypeBadge kini disembunyikan dari
                a11y tree (lihat TypeBadge), jadi "Repeat" harus hadir sebagai teks — pola sama
                dengan HomeItemRow. */}
            {repeat ? <MetaChip icon="repeat">Repeat</MetaChip> : null}
            {item.deadline ? (
              <MetaChip icon="time-outline">Deadline {item.deadline}</MetaChip>
            ) : null}
            {item.pic ? (
              <MetaChip icon="person-outline">{item.pic.full_name ?? item.pic.email}</MetaChip>
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
            {item.due ? <MetaChip icon="time-outline">{item.due}</MetaChip> : null}
            {repeat ? <MetaChip icon="repeat">Repeat</MetaChip> : null}
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
      <SectionHeading title={title} />
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

type FokusItem = {
  id: string;
  taskId: string;
  name: string;
  statusLabel: string;
  statusTone: Tone;
  due: string | null;
  repeat: boolean;
  kind: 'task' | 'instance';
};

function pickFokus(
  revisi: TaskWithPeople[],
  overdue: HomeItem[],
  todayRepeat: HomeItem[],
  todo: TaskWithPeople[],
): FokusItem | null {
  if (revisi.length > 0) {
    const r = revisi[0];
    return {
      id: r.id, taskId: r.id, name: r.name,
      statusLabel: ACTION_PLAN_STATUS_LABEL[r.status] ?? r.status,
      statusTone: STATUS_TONE[r.status] ?? 'neutral',
      due: r.deadline ?? null,
      repeat: r.repeat_setting === 'repeat',
      kind: 'task',
    };
  }
  if (overdue.length > 0) {
    const o = overdue[0];
    return {
      id: o.id, taskId: o.task_id, name: o.name ?? 'Tanpa nama',
      statusLabel: INSTANCE_STATUS_LABEL[o.status] ?? o.status,
      statusTone: INSTANCE_STATUS_TONE[o.status] ?? 'neutral',
      due: o.due, repeat: o.kind === 'instance', kind: o.kind,
    };
  }
  if (todayRepeat.length > 0) {
    const t = todayRepeat[0];
    return {
      id: t.id, taskId: t.task_id, name: t.name ?? 'Tanpa nama',
      statusLabel: INSTANCE_STATUS_LABEL[t.status] ?? t.status,
      statusTone: INSTANCE_STATUS_TONE[t.status] ?? 'neutral',
      due: t.due, repeat: true, kind: 'instance',
    };
  }
  if (todo.length > 0) {
    const t = todo[0];
    return {
      id: t.id, taskId: t.id, name: t.name,
      statusLabel: ACTION_PLAN_STATUS_LABEL[t.status] ?? t.status,
      statusTone: STATUS_TONE[t.status] ?? 'neutral',
      due: t.deadline ?? null,
      repeat: t.repeat_setting === 'repeat',
      kind: 'task',
    };
  }
  return null;
}

function FokusCard({ fokus, onPress }: { fokus: FokusItem; onPress: () => void }) {
  return (
    <View className="gap-3">
      <SectionHeading title="Fokus Hari Ini" />
      <Pressable
        onPress={onPress}
        className="gap-3 rounded-2xl border-2 border-brand bg-blue-50 p-4 active:opacity-70 dark:bg-blue-950"
        accessibilityRole="button"
        accessibilityLabel={`Fokus: ${fokus.name}. Ketuk untuk detail.`}>
        <View className="flex-row items-start gap-3">
          <TypeBadge repeat={fokus.repeat} />
          <View className="flex-1 gap-1.5">
            <Text className="text-base font-semibold text-black dark:text-white" numberOfLines={2}>
              {fokus.name}
            </Text>
            <View className="flex-row items-center gap-2">
              <Badge label={fokus.statusLabel} tone={fokus.statusTone} />
              {fokus.due ? <MetaChip icon="time-outline">{fokus.due}</MetaChip> : null}
            </View>
          </View>
        </View>
        <View className="items-end">
          <View className="rounded-lg bg-brand-dark px-4 py-2.5">
            <Text className="text-sm font-semibold text-white">Detail</Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export default function LiveHomeScreen() {
  const router = useRouter();
  const { profile } = useProfile();
  const { session } = useAuth();
  const { isCompact } = useBreakpoint();
  const uid = session?.user?.id ?? '';
  const openTask = (id: string) => router.push(`/task/${id}` as Href);
  const openHomeItem = (item: HomeItem) =>
    router.push(
      (item.kind === 'instance'
        ? `/task/instance/${item.id}`
        : `/task/${item.task_id}`) as Href,
    );

  const queryClient = useQueryClient();

  const todayQ = useQuery({ queryKey: ['org-today'], queryFn: getOrgToday, staleTime: Infinity });
  const mineQ = useQuery({
    queryKey: ['home-my-plans', uid],
    queryFn: () => listMyTasks(uid),
    staleTime: HOME_STALE_MS,
    enabled: !!uid,
  });
  const reviewQ = useQuery({
    queryKey: ['home-reviews', uid],
    queryFn: () => listPendingReviews(uid),
    staleTime: HOME_STALE_MS,
    enabled: !!uid,
  });
  const reviewInstQ = useQuery({
    queryKey: ['home-review-instances', uid],
    queryFn: () => listPendingInstanceReviews(uid),
    staleTime: HOME_STALE_MS,
    enabled: !!uid,
  });
  const todayRepeatQ = useQuery({
    queryKey: ['home-today-repeat'],
    queryFn: listTodayRepeatInstances,
    staleTime: HOME_STALE_MS,
  });
  const overdueQ = useQuery({ queryKey: ['home-overdue'], queryFn: listOverdueItems, staleTime: HOME_STALE_MS });
  const nearQ = useQuery({ queryKey: ['home-near'], queryFn: listNearDeadline, staleTime: HOME_STALE_MS });
  const kpiAttnQ = useQuery({ queryKey: ['home-kpi-attention'], queryFn: listKpiNeedsAttention, staleTime: HOME_STALE_MS });

  // On tab re-focus, refresh only the Home dashboards that have actually gone
  // stale (HOME_STALE_MS elapsed). Previously every focus unconditionally
  // refetched all seven queries, so each tab switch produced up to seven
  // separate state updates + full-screen re-render passes — noticeable jank on
  // low-end Android. Gating on `stale` keeps the data current on return without
  // the refetch storm while it is still fresh. Keyed on the shared `home-`
  // prefix; `org-today` (staleTime Infinity) is excluded and never refetches.
  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({
        type: 'active',
        stale: true,
        predicate: (q) => typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith(HOME_QUERY_PREFIX),
      });
    }, [queryClient]),
  );

  const mine = mineQ.data ?? [];
  const todo = mine.filter((p) => p.status === 'assigned' || p.status === 'in_progress');
  const revisi = mine.filter((p) => p.status === 'revision');
  const overdue = overdueQ.data ?? [];
  const todayRepeat = todayRepeatQ.data ?? [];
  const near = nearQ.data ?? [];

  const overdueCount = overdueQ.isError ? '—' : String(overdue.length);
  const reviewError = reviewQ.isError || reviewInstQ.isError;
  const reviewTotal = (reviewQ.data?.length ?? 0) + (reviewInstQ.data?.length ?? 0);
  const reviewCount = reviewError ? '—' : String(reviewTotal);
  const numericPriority = overdue.length + reviewTotal;

  const fokus = pickFokus(revisi, overdue, todayRepeat, todo);
  const fokusId = fokus?.id ?? null;
  const fokusPress = fokus
    ? () => {
        if (fokus.kind === 'instance') {
          router.push(`/task/instance/${fokus.id}` as Href);
        } else {
          router.push(`/task/${fokus.taskId}` as Href);
        }
      }
    : undefined;

  const taskNodes: React.ReactNode[] = [];
  for (const item of revisi) {
    if (taskNodes.length >= MAX_TASK_ROWS) break;
    if (item.id === fokusId) continue;
    taskNodes.push(<TaskRow key={`rev-${item.id}`} item={item} onPress={() => openTask(item.id)} />);
  }
  for (const item of todayRepeat) {
    if (taskNodes.length >= MAX_TASK_ROWS) break;
    if (item.id === fokusId) continue;
    taskNodes.push(<HomeItemRow key={`rep-${item.id}`} item={item} onPress={() => openHomeItem(item)} />);
  }
  for (const item of todo) {
    if (taskNodes.length >= MAX_TASK_ROWS) break;
    if (item.id === fokusId) continue;
    taskNodes.push(<TaskRow key={`todo-${item.id}`} item={item} onPress={() => openTask(item.id)} />);
  }
  const taskLoading = mineQ.isLoading || todayRepeatQ.isLoading;
  const taskAllError = mineQ.isError && todayRepeatQ.isError;

  const updateNodes: React.ReactNode[] = [];
  for (const item of overdue) {
    if (updateNodes.length >= MAX_UPDATE_ROWS) break;
    if (item.id === fokusId) continue;
    updateNodes.push(<HomeItemRow key={`upd-o-${item.id}`} item={item} onPress={() => openHomeItem(item)} />);
  }
  for (const item of near) {
    if (updateNodes.length >= MAX_UPDATE_ROWS) break;
    updateNodes.push(<HomeItemRow key={`upd-n-${item.id}`} item={item} onPress={() => openHomeItem(item)} />);
  }
  const updateLoading = overdueQ.isLoading || nearQ.isLoading;
  const updateAllError = overdueQ.isError && nearQ.isError;

  // Cap "Butuh Review Anda" seperti section Task/Update — sebelumnya me-map penuh dua list
  // review ke dalam ScrollView (satu node tanpa batas). Jumlah antrean sebenarnya tetap
  // tampil di PriorityCard "Butuh Review" (reviewCount).
  const reviewNodes: React.ReactNode[] = [];
  for (const item of reviewQ.data ?? []) {
    if (reviewNodes.length >= MAX_REVIEW_ROWS) break;
    reviewNodes.push(<TaskRow key={`rev-t-${item.id}`} item={item} onPress={() => openTask(item.id)} />);
  }
  for (const item of reviewInstQ.data ?? []) {
    if (reviewNodes.length >= MAX_REVIEW_ROWS) break;
    reviewNodes.push(<HomeItemRow key={`rev-i-${item.id}`} item={item} onPress={() => openHomeItem(item)} />);
  }

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
            body="Home adalah pusat kendali hari ini — Task yang perlu perhatian, review, dan update terbaru tampil di sini. Buka tiap kartu untuk mulai mengeksekusi."
          />
        ) : null}

        {fokus ? <FokusCard fokus={fokus} onPress={fokusPress!} /> : null}

        <View className="gap-3">
          <SectionHeading title="Prioritas" />
          {/* §4.5 — di lebar compact (ponsel) 3 kartu sejajar menyempit ke ~85pt @320pt dan
              memotong subtitle. Susun bertumpuk (drop `flex-row` → kolom) sehingga tiap kartu
              full-width; `flex-1` internal kartu jadi no-op vertikal. ≥medium tetap sejajar. */}
          <View className={isCompact ? 'gap-3' : 'flex-row gap-3'}>
            <PriorityCard
              icon="!"
              title="Terlewat"
              subtitle={
                overdueQ.isError
                  ? 'Gagal memuat.'
                  : overdue.length > 0
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
              title="Gap Strategi"
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

        <Section
          title="Tugas Hari Ini"
          isLoading={taskLoading}
          isError={taskAllError}
          onRetry={() => {
            mineQ.refetch();
            todayRepeatQ.refetch();
          }}
          isEmpty={taskNodes.length === 0 && !fokus}
          emptyTitle="Tidak ada tugas hari ini"
          emptyDesc="Tugas yang perlu dikerjakan hari ini akan muncul di sini.">
          {taskNodes}
        </Section>

        <Section
          title="Butuh Review Anda"
          isLoading={reviewQ.isLoading || reviewInstQ.isLoading}
          isError={reviewError}
          onRetry={() => {
            reviewQ.refetch();
            reviewInstQ.refetch();
          }}
          isEmpty={reviewTotal === 0}
          emptyTitle="Tidak ada yang menunggu review"
          emptyDesc="Submission yang menunggu persetujuan Anda akan muncul di sini.">
          {reviewNodes}
        </Section>

        <Section
          title="Pembaruan Terbaru"
          isLoading={updateLoading}
          isError={updateAllError}
          onRetry={() => {
            overdueQ.refetch();
            nearQ.refetch();
          }}
          isEmpty={updateNodes.length === 0}
          emptyTitle="Semua berjalan tepat waktu"
          emptyDesc="Item yang lewat deadline atau mendekati deadline akan muncul di sini.">
          {updateNodes}
        </Section>
      </View>
    </ScrollView>
  );
}
