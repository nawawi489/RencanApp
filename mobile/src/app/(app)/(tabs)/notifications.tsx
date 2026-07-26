// Notifications (Fase 3) — segmentasi 8 tab + 4 state per tab. Baris menandai dibaca saat ditekan;
// notifikasi task membuka detail. Tombol header menandai semua dibaca (bila ada yang unread).
// UI-S-N01 — tombol aksi inline per row sesuai (type, entity_type).
// UI-S-N02 — section "Baru" (≤24 jam) vs "Sebelumnya".
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { useRouter, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { SectionList } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import {
  Badge,
  EmptyState,
  ErrorState,
  IconTile,
  SkeletonList,
  TabBar,
} from '@/components/ui';
import { usePushRegistration } from '@/hooks/use-push-notifications';
import { useNotificationActions, useNotifications, useUnreadCount } from '@/hooks/use-notifications';
import {
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_TONE,
  type Notification,
  type NotificationTab,
  type NotificationType,
} from '@/lib/notifications';
import { useThemePreference } from '@/providers/theme-provider';

const LIST_CONTENT_STYLE = { gap: 12, padding: 20 };

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

// Ikon per tipe (Ionicons outline, DESIGN §10) — penguat visual; label teks Badge tetap sumber makna.
const TYPE_ICON: Record<NotificationType, ComponentProps<typeof Ionicons>['name']> = {
  review_request: 'eye-outline',
  approved: 'checkmark-circle-outline',
  rejected: 'close-circle-outline',
  deadline_reminder: 'time-outline',
  repeat_due: 'repeat-outline',
  instance_missed: 'alert-circle-outline',
  comment: 'chatbubble-ellipses-outline',
  mention: 'at-outline',
  governance_warning: 'shield-half-outline',
  deadline_change_requested: 'calendar-outline',
  deadline_change_approved: 'checkmark-circle-outline',
  deadline_change_rejected: 'close-circle-outline',
  deadline_change_revision_requested: 'refresh-outline',
  period_closing_reminder: 'trophy-outline',
  evidence_submitted: 'document-attach-outline',
  // Sengaja BEDA dari instance_missed ('alert-circle-outline'): keduanya berarti deadline lewat,
  // tapi ikon berbeda membantu membedakan tugas one-time dari instance rutin dalam satu tab.
  deadline_overdue: 'alarm-outline',
  permission_changed: 'key-outline',
};

/** Waktu relatif ringkas (id-ID). Graceful pada tanggal invalid: string kosong. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return 'Baru saja';
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'Kemarin';
  if (day < 7) return `${day} hari lalu`;
  return new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------- row

// UI-S-N01 — aksi inline diturunkan dari (type, entity_type). null = baris hanya bisa ditandai dibaca.
// ISSUE-005: kartu resolved menurunkan CTA ke "Lihat Detail" (aksi asli sudah tidak relevan —
// e.g. "Review Sekarang" untuk submission yg sudah diputuskan menyesatkan).
function inlineAction(item: Notification): { label: string; href: Href | null } | null {
  const t: NotificationType = item.type;
  const et = item.entity_type;
  const detail: Href = (et === 'task_instance'
    ? `/task/instance/${item.entity_id}`
    : `/task/${item.entity_id}`) as Href;
  // B-1: notif periode skoring mengarah ke layar Score Formula, BUKAN /task/{id}.
  // Diletakkan paling atas karena `detail` di atas mengasumsikan entitas Task —
  // termasuk cabang `resolved_at` di bawah. Ini alasan tipe baru dibuat, bukan
  // reuse `deadline_reminder` (lihat migrasi 0080 §1).
  if (et === 'period_snapshot') {
    return { label: 'Buka Score Formula', href: '/settings-score-formula' as Href };
  }
  if (item.resolved_at) return { label: 'Lihat Detail', href: detail };
  if (et === 'task_instance') {
    return { label: 'Buka Instance', href: detail };
  }
  if (et === 'task') {
    if (t === 'review_request') return { label: 'Review Sekarang', href: detail };
    if (t === 'rejected') return { label: 'Lihat Revisi', href: detail };
    if (t === 'approved') return { label: 'Lihat Bukti', href: detail };
    if (t === 'deadline_reminder') return { label: 'Buka Request', href: detail };
    return { label: 'Buka Detail', href: detail };
  }
  if (t === 'governance_warning') return null;
  return null;
}

// ISSUE-005 — label hasil (tone-consistent dgn DESIGN §4: teks label, bukan warna saja).
const RESOLUTION_LABEL: Record<string, { label: string; tone: 'success' | 'danger' | 'warn' | 'neutral' }> = {
  approved: { label: 'Disetujui', tone: 'success' },
  rejected: { label: 'Ditolak', tone: 'danger' },
  revision_requested: { label: 'Perlu Revisi', tone: 'warn' },
  resubmitted: { label: 'Sudah dikirim ulang', tone: 'neutral' },
  superseded: { label: 'Sudah ditindaklanjuti', tone: 'neutral' },
};

/** Tombol aksi kompak (primary, lebar mengikuti label — bukan full-width). */
function InlineActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // min-h-[44px]: touch target a11y; bg-brand-dark: solid + teks putih (DESIGN §4).
      className="min-h-[44px] items-center justify-center self-start rounded-xl bg-brand-dark px-5 active:opacity-80">
      <Text className="text-sm font-semibold text-white">{label}</Text>
    </Pressable>
  );
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
  const tone = NOTIFICATION_TYPE_TONE[item.type];
  const time = relativeTime(item.created_at);
  return (
    // Kartu = View; area tap baris & tombol aksi adalah sibling Pressable — nested <button>
    // invalid di web (react-native-web merender keduanya sebagai <button>).
    <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        className="flex-row items-start gap-3 active:opacity-70">
        <IconTile icon={TYPE_ICON[item.type]} tone={tone} />
        <View className="flex-1 gap-1">
          <View className="flex-row items-start gap-2">
            <Text
              className={`flex-1 text-base text-black dark:text-white ${
                item.is_read ? 'font-semibold' : 'font-bold'
              }`}>
              {item.title}
            </Text>
            {/* Indikator belum dibaca: titik + teks a11y (warna ≠ satu-satunya sinyal). */}
            {!item.is_read ? (
              <View
                className="mt-1.5 h-2.5 w-2.5 rounded-full bg-red-600"
                accessible
                accessibilityLabel="Belum dibaca"
              />
            ) : null}
          </View>
          {item.body ? (
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">{item.body}</Text>
          ) : null}
          <View className="flex-row items-center gap-2 pt-0.5">
            {item.resolved_at && item.resolution && RESOLUTION_LABEL[item.resolution] ? (
              <Badge
                label={RESOLUTION_LABEL[item.resolution].label}
                tone={RESOLUTION_LABEL[item.resolution].tone}
              />
            ) : (
              <Badge label={NOTIFICATION_TYPE_LABEL[item.type]} tone={tone} />
            )}
            {time ? (
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">{time}</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      {action && action.href ? (
        // pl-[52px] = lebar IconTile 40 + gap 12 — tombol sejajar kolom teks.
        <View className="pl-[52px]">
          <InlineActionButton label={action.label} onPress={() => onAction(action.href!)} />
        </View>
      ) : null}
    </View>
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
    <View className="bg-white pb-1 pt-2 dark:bg-black">
      <Text className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- push permission banner

function PushPermissionBanner({
  permissionStatus,
  onActivate,
}: {
  permissionStatus: string;
  onActivate: () => void;
}) {
  if (permissionStatus === 'granted') return null;

  if (permissionStatus === 'denied') {
    return (
      <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <Text className="text-sm text-neutral-600 dark:text-neutral-400">
          Notifikasi diblokir. Buka pengaturan perangkat untuk mengaktifkan.
        </Text>
        <Pressable
          onPress={() => void Linking.openSettings()}
          accessibilityRole="button"
          accessibilityLabel="Buka Pengaturan"
          className="mt-3 min-h-[44px] items-center justify-center self-start rounded-xl bg-brand-dark px-5 active:opacity-80">
          <Text className="text-sm font-semibold text-white">Buka Pengaturan</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <Text className="text-sm text-neutral-600 dark:text-neutral-400">
        Aktifkan notifikasi push agar tidak terlewat.
      </Text>
      <Pressable
        onPress={onActivate}
        accessibilityRole="button"
        accessibilityLabel="Aktifkan Notifikasi"
        className="mt-3 min-h-[44px] items-center justify-center self-start rounded-xl bg-brand-dark px-5 active:opacity-80">
        <Text className="text-sm font-semibold text-white">Aktifkan</Text>
      </Pressable>
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
  const { effective } = useThemePreference();
  const { permissionStatus, register } = usePushRegistration();
  // Pola warna ikon brand theme-aware (app-header/IconTile, DESIGN §12).
  const brandIconColor = effective === 'dark' ? '#93c5fd' : '#1564b3';
  const mutedIconColor = effective === 'dark' ? '#a3a3a3' : '#667085';

  const tabs = useMemo(
    () =>
      TABS.map((t) => (t.key === 'perlu_tindakan' && count > 0 ? { ...t, badge: count } : t)),
    [count],
  );

  const sections = useMemo(() => groupByRecency(notifications), [notifications]);

  // Identitas stabil (SectionList tak remount row tiap render). Logika mark-read +
  // navigasi di-inline; deps hanya markRead & router (keduanya stabil).
  const renderItem = useCallback(
    ({ item }: { item: Notification }) => (
      <NotificationRow
        item={item}
        onPress={() => {
          markRead(item.id);
          if (item.entity_type === 'task') {
            router.push(`/task/${item.entity_id}` as Href);
          } else if (item.entity_type === 'task_instance') {
            router.push(`/task/instance/${item.entity_id}` as Href);
          }
        }}
        onAction={(href) => {
          markRead(item.id);
          router.push(href);
        }}
      />
    ),
    [markRead, router],
  );

  const controls = (
    <>
      {count > 0 ? (
        // Aksi ringan (link-style, bukan tombol berbingkai): satu ketukan menandai semua.
        <Pressable
          onPress={() => markAllRead()}
          className="min-h-[44px] flex-row items-center gap-1.5 self-start active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Tandai semua dibaca">
          <Ionicons name="checkmark-done-outline" size={18} color={brandIconColor} />
          <Text className="text-sm font-semibold text-brand-dark dark:text-blue-300">
            Tandai semua dibaca
          </Text>
        </Pressable>
      ) : null}
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
    </>
  );

  const header = (
    <View className="gap-4 pb-3">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-black dark:text-white">Notifikasi</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Notifikasi resmi dan respons.
        </Text>
      </View>
      <PushPermissionBanner
        permissionStatus={permissionStatus}
        onActivate={() => void register()}
      />
      {controls}
    </View>
  );

  if (isLoading) {
    return (
      <Screen title="Notifikasi" subtitle="Notifikasi resmi dan respons.">
        {controls}
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen title="Notifikasi" subtitle="Notifikasi resmi dan respons.">
        {controls}
        <ErrorState
          title="Gagal memuat notifikasi"
          description="Periksa koneksi lalu coba lagi."
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <SectionList<Notification, NotifSection>
        contentContainerStyle={LIST_CONTENT_STYLE}
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="notifications-outline" size={28} color={mutedIconColor} />}
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
