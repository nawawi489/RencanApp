// Notifications (Fase 3) — segmentasi 8 tab + 4 state per tab. Baris menandai dibaca saat ditekan;
// notifikasi action_plan membuka detail. Tombol header menandai semua dibaca (bila ada yang unread).
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import {
  Badge,
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

function NotificationRow({ item, onPress }: { item: Notification; onPress: () => void }) {
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
        </View>
      </View>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- screen

export default function NotificationsScreen() {
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
    }
  }

  return (
    <Screen title="Notifications" subtitle="Notifikasi resmi dan respons.">
      {count > 0 ? (
        <Pressable
          onPress={() => markAllRead()}
          className="min-h-[44px] items-center justify-center self-start rounded-xl border border-neutral-300 px-4 py-2.5 active:opacity-70 dark:border-neutral-700"
          accessibilityRole="button"
          accessibilityLabel="Tandai semua dibaca">
          <Text className="text-sm font-semibold text-black dark:text-white">Tandai semua dibaca</Text>
        </Pressable>
      ) : null}

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {isLoading ? (
        <SkeletonList count={4} />
      ) : isError ? (
        <ErrorState
          title="Gagal memuat notifikasi"
          description="Periksa koneksi lalu coba lagi."
          onRetry={() => refetch()}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<Text className="text-2xl">🔔</Text>}
          title="Belum ada notifikasi"
          description="Review request, approval, deadline reminder, dan repeat due akan tampil di sini."
        />
      ) : (
        <View className="gap-3">
          {notifications.map((item) => (
            <NotificationRow key={item.id} item={item} onPress={() => openRow(item)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
