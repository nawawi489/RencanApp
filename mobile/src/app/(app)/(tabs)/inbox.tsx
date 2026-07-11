// Layar Inbox — UI-S-IN1: search + chip Semua/Belum dibaca + Avatar + preview
// "{author}: {body}" (fallback timestamp saat body null; body saja saat author null);
// clamp unread '99+ baru' ≥100. Filter & search lokal (useMemo) — TIDAK ada fetch baru.
// Chip filter ter-defer (Saya PIC/Review/Deadline) sengaja TIDAK dirender (scope-lock V1).
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { Text, TextInput, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { Avatar, Badge, EmptyState, ErrorState, SectionCard, SkeletonList, TabBar, usePlaceholderColor } from '@/components/ui';
import { useInboxRooms } from '@/hooks/use-inbox';
import type { ChatRoom } from '@/lib/inbox';
type Filter = 'all' | 'unread';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'unread', label: 'Belum dibaca' },
];

function formatLast(iso: string | null): string {
  if (!iso) return 'Belum ada pesan';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Preview baris Inbox per UI-S-IN1.
 *  - body null               → timestamp (fallback room kosong).
 *  - body ada, author null   → body saja (tanpa prefix 'null: ' / '? : ').
 *  - keduanya ada            → '{author}: {body}'.
 */
export function formatPreview(room: ChatRoom): string {
  if (room.last_message_body == null) return formatLast(room.last_message_at);
  if (room.last_message_author_name == null) return room.last_message_body;
  return `${room.last_message_author_name}: ${room.last_message_body}`;
}

/** Clamp unread badge: 0 → null (hide), 1..99 → '{n} baru', ≥100 → '99+ baru'. */
export function clampUnread(n: number): string | null {
  if (n <= 0) return null;
  if (n >= 100) return '99+ baru';
  return `${n} baru`;
}

function InboxHeader({
  q,
  setQ,
  filter,
  setFilter,
}: {
  q: string;
  setQ: (s: string) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const placeholderColor = usePlaceholderColor();
  return (
    <View className="gap-3 pb-3">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-black dark:text-white">Inbox</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">Khusus chat Action Plan.</Text>
      </View>
      <TextInput
        placeholder="Cari Action Plan"
        placeholderTextColor={placeholderColor}
        value={q}
        onChangeText={setQ}
        accessibilityLabel="Cari Action Plan"
        className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
      />
      <TabBar tabs={FILTER_TABS} active={filter} onChange={setFilter} />
    </View>
  );
}

export function LiveInboxScreen() {
  const router = useRouter();
  const { rooms, isLoading, isError, refetch } = useInboxRooms();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => {
    const lowered = q.trim().toLowerCase();
    return rooms.filter((r) => {
      if (filter === 'unread' && r.unread_count <= 0) return false;
      if (lowered && !r.name.toLowerCase().includes(lowered)) return false;
      return true;
    });
  }, [rooms, q, filter]);

  if (isLoading) {
    return (
      <Screen title="Inbox" subtitle="Khusus chat Action Plan.">
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen title="Inbox" subtitle="Khusus chat Action Plan.">
        <ErrorState
          title="Gagal memuat Inbox"
          description="Tidak bisa mengambil daftar percakapan."
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const renderItem = ({ item: room }: { item: ChatRoom }) => {
    const badge = clampUnread(room.unread_count);
    return (
      <SectionCard onPress={() => router.push(`/inbox/${room.id}` as Href)}>
        <View className="flex-row items-center gap-3">
          <Avatar name={room.name} seed={room.id} size={40} />
          <View className="flex-1 gap-0.5">
            <View className="flex-row items-center justify-between gap-2">
              <Text
                className="flex-1 text-base font-bold text-black dark:text-white"
                numberOfLines={1}>
                {room.name}
              </Text>
              {badge ? <Badge label={badge} tone="info" /> : null}
            </View>
            <Text className="text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
              {formatPreview(room)}
            </Text>
          </View>
        </View>
      </SectionCard>
    );
  };

  const trimmedQ = q.trim();
  const isSearching = trimmedQ.length > 0;
  const isUnreadFilter = filter === 'unread';
  const emptyTitle = isSearching
    ? 'Tidak ditemukan'
    : isUnreadFilter
      ? 'Tidak ada yang belum dibaca'
      : 'Belum ada percakapan';
  const emptyDescription = isSearching
    ? `Tidak ada Action Plan cocok dengan "${trimmedQ}".`
    : isUnreadFilter
      ? 'Semua percakapan sudah dibaca.'
      : 'Setiap Action Plan otomatis punya chat room. Akan muncul di sini.';

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <FlatList<ChatRoom>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={visible}
        keyExtractor={(room) => room.id}
        ListHeaderComponent={
          <InboxHeader q={q} setQ={setQ} filter={filter} setFilter={setFilter} />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Text className="text-2xl">💬</Text>}
            title={emptyTitle}
            description={emptyDescription}
          />
        }
        renderItem={renderItem}
      />
    </View>
  );
}

export default function InboxRoute() {
  return <LiveInboxScreen />;
}
