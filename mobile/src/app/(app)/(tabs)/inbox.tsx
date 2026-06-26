import { useRouter, type Href } from 'expo-router';
import { FlatList } from 'react-native';
import { Text, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { Badge, EmptyState, ErrorState, SectionCard, SkeletonList } from '@/components/ui';
import { useInboxRooms } from '@/hooks/use-inbox';
import type { ChatRoom } from '@/lib/inbox';

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

function InboxHeader() {
  return (
    <View className="gap-1 pb-3">
      <Text className="text-2xl font-bold text-black dark:text-white">Inbox</Text>
      <Text className="text-base text-neutral-500 dark:text-neutral-400">
        Khusus chat Initiative.
      </Text>
    </View>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const { rooms, isLoading, isError, refetch } = useInboxRooms();

  if (isLoading) {
    return (
      <Screen title="Inbox" subtitle="Khusus chat Initiative.">
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen title="Inbox" subtitle="Khusus chat Initiative.">
        <ErrorState
          title="Gagal memuat Inbox"
          description="Tidak bisa mengambil daftar percakapan."
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const renderItem = ({ item: room }: { item: ChatRoom }) => (
    <SectionCard onPress={() => router.push(`/inbox/${room.id}` as Href)}>
      <View className="flex-row items-center justify-between gap-2">
        <Text
          className="flex-1 text-base font-bold text-black dark:text-white"
          numberOfLines={1}>
          {room.name}
        </Text>
        {room.unread_count > 0 ? (
          <Badge label={`${room.unread_count} baru`} tone="info" />
        ) : null}
      </View>
      <Text className="text-xs text-neutral-400" numberOfLines={1}>
        {formatLast(room.last_message_at)}
      </Text>
    </SectionCard>
  );

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <FlatList<ChatRoom>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={rooms}
        keyExtractor={(room) => room.id}
        ListHeaderComponent={InboxHeader}
        ListEmptyComponent={
          <EmptyState
            icon={<Text className="text-2xl">💬</Text>}
            title="Belum ada percakapan"
            description="Setiap Initiative otomatis punya chat room. Akan muncul di sini."
          />
        }
        renderItem={renderItem}
      />
    </View>
  );
}
