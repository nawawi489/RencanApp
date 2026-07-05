// Notifications (Fase 3) — segmentasi 8 tab + 4 state per tab. Baris menandai dibaca saat ditekan;
// notifikasi action_plan membuka detail. Tombol header menandai semua dibaca (bila ada yang unread).
// UI-S-N01 — tombol aksi inline per row sesuai (type, entity_type).
// UI-S-N02 — section "Baru" (≤24 jam) vs "Sebelumnya".
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonList,
  TabBar,
} from '@/components/ui';
import { useNotificationActions, useNotifications, useUnreadCount } from '@/hooks/use-notifications';
import {
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  type Notification,
  type NotificationTab,
  type NotificationType,
} from '@/lib/notifications';

const TABS: { key: NotificationTab; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'perlu_tindakan', label: 'Perlu Tindakan' },
  { key: 'review', label: 'Review' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'komentar', label: 'Komentar' },
  { key: 'terlewat', label: 'Terlewat' },
  { key: 'repeat', label: 'Repeat' },
  { key: 'governance', label: 'Governance' },
];

// ---------------------------------------------------------------- row

// UI-S-N01 — aksi inline diturunkan dari (type, entity_type). null = baris hanya bisa ditandai dibaca.
function inlineAction(item: Notification): { label: string; href: Href | null } | null {
  const t: NotificationType = item.type;
  const et = item.entity_type;
  if (et === 'action_plan_instance') {
    return { label: 'Buka Instance', href: `/action-plan/instance/${item.entity_id}` as Href };
  }
  if (et === 'action_plan') {
    if (t === 'review_request') return { label: 'Review Sekarang', href: `/action-plan/${item.entity_id}` as Href };
    if (t === 'rejected') return { label: 'Lihat Revisi', href: `/action-plan/${item.entity_id}` as Href };
    if (t === 'approved') return { label: 'Lihat Bukti', href: `/action-plan/${item.entity_id}` as Href };
    if (t === 'deadline_reminder') return { label: 'Buka Request', href: `/action-plan/${item.entity_id}` as Href };
    return { label: 'Buka Detail', href: `/action-plan/${item.entity_id}` as Href };
  }
  if (t === 'governance_warning') return null;
  return null;
}

function NotificationRow({
  item,
  onPress,
  onAction,
}: {
  item: Notification;
  onPress: () => void;
  onAction: (href: Href) => void;
}) {
  const action = inlineAction(item);
  return (
    <SectionCard onPress={onPress}>
      <View className="flex-row items-start gap-2">
        {/* Indikator belum dibaca: titik + teks a11y (warna ≠ satu-satunya sinyal). */}
        {!item.is_read ? (
          <View
            className="mt-1.5 h-2 w-2 rounded-full bg-brand-dark"
            accessible
            accessibilityLabel="Belum dibaca"
          />
        ) : null}
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="flex-1 text-base font-semibold text-black dark:text-white">
              {item.title}
            </Text>
            <Badge label={NOTIFICATION_TYPE_LABEL[item.type]} tone={NOTIFICATION_TYPE_TONE[item.type]} />
          </View>
          {item.body ? (
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">{item.body}</Text>
          ) : null}
          {action && action.href ? (
            <View className="pt-1">
              <Button label={action.label} variant="secondary" onPress={() => onAction(action.href!)} />
            </View>
          ) : null}
        </View>
      </View>
    </SectionCard>
  );
}

// UI-S-N02 — group notifikasi ke section "Baru" (≤24 jam) vs "Sebelumnya".
type NotifSection = { title: string; data: Notification[] };
function groupByRecency(items: Notification[]): NotifSection[] {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const fresh: Notification[] = [];
  const old: Notification[] = [];
  for (const n of items) {
    const created = Date.parse(n.created_at);
    if (Number.isFinite(created) && now - created < DAY) fresh.push(n);
    else old.push(n);
  }
  const sections: NotifSection[] = [];
  if (fresh.length) sections.push({ title: 'Baru', data: fresh });
  if (old.length) sections.push({ title: 'Sebelumnya', data: old });
  return sections;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View className="bg-white py-2 dark:bg-black">
      <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- screen

export function LiveNotificationsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<NotificationTab>('semua');
  const { notifications, isLoading, isError, refetch } = useNotifications(tab);
  const { count } = useUnreadCount();
  const { markRead, markAllRead } = useNotificationActions();

  const tabs = TABS.map((t) =>
    t.key === 'perlu_tindakan' && count > 0 ? { ...t, badge: count } : t,
  );

  function openRow(item: Notification) {
    markRead(item.id);
    if (item.entity_type === 'action_plan') {
      router.push(`/action-plan/${item.entity_id}` as Href);
    } else if (item.entity_type === 'action_plan_instance') {
      router.push(`/action-plan/instance/${item.entity_id}` as Href);
    }
  }

  function openAction(item: Notification, href: Href) {
    markRead(item.id);
    router.push(href);
  }

  const sections = useMemo(() => groupByRecency(notifications), [notifications]);

  const controls = (
    <>
      {count > 0 ? (
        <Pressable
          onPress={() => markAllRead()}
          className="min-h-[44px] items-center justify-center self-start rounded-xl border border-neutral-300 px-4 py-2.5 active:opacity-70 dark:border-neutral-700"
          accessibilityRole="button"
          accessibilityLabel="Tandai semua dibaca">
          <Text className="text-sm font-semibold text-black dark:text-white">
            Tandai semua dibaca
          </Text>
        </Pressable>
      ) : null}
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
    </>
  );

  const header = (
    <View className="gap-5 pb-3">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-black dark:text-white">Notifications</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Notifikasi resmi dan respons.
        </Text>
      </View>
      {controls}
    </View>
  );

  if (isLoading) {
    return (
      <Screen title="Notifications" subtitle="Notifikasi resmi dan respons.">
        {controls}
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen title="Notifications" subtitle="Notifikasi resmi dan respons.">
        {controls}
        <ErrorState
          title="Gagal memuat notifikasi"
          description="Periksa koneksi lalu coba lagi."
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const renderItem = ({ item }: { item: Notification }) => (
    <NotificationRow
      item={item}
      onPress={() => openRow(item)}
      onAction={(href) => openAction(item, href)}
    />
  );

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <SectionList<Notification, NotifSection>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Text className="text-2xl">🔔</Text>}
            title="Belum ada notifikasi"
            description="Review request, approval, deadline reminder, dan repeat due akan tampil di sini."
          />
        }
        renderItem={renderItem}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

export default function NotificationsRoute() {
  return <LiveNotificationsScreen />;
}
