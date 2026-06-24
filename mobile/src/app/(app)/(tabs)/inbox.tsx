import { useRouter, type Href } from 'expo-router';
import { Text, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { Badge, EmptyState, ErrorState, SectionCard, SkeletonList } from '@/components/ui';
import { useInboxRooms } from '@/hooks/use-inbox';

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

export default function InboxScreen() {
  const router = useRouter();
  const { rooms, isLoading, isError, refetch } = useInboxRooms();

  return (
    <Screen title="Inbox" subtitle="Khusus chat Initiative.">
      {isLoading ? (
        <SkeletonList count={4} />
      ) : isError ? (
        <ErrorState
          title="Gagal memuat Inbox"
          description="Tidak bisa mengambil daftar percakapan."
          onRetry={() => refetch()}
        />
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={<Text className="text-2xl">💬</Text>}
          title="Belum ada percakapan"
          description="Setiap Initiative otomatis punya chat room. Akan muncul di sini."
        />
      ) : (
        <View className="gap-3">
          {rooms.map((room) => (
            <SectionCard key={room.id} onPress={() => router.push(`/inbox/${room.id}` as Href)}>
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
          ))}
        </View>
      )}
    </Screen>
  );
}
