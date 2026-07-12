// Layar Inbox — UI-S-IN1 (avatar/preview/chip Semua-Belum-dibaca) + Chat FTS V1 (search pesan).
// Chip filter ter-defer (Saya PIC/Review/Deadline) sengaja TIDAK dirender (scope-lock V1).
//
// Search dual-source (PRD §29 komponen 2): nama Initiative (client-filter atas useInboxRooms)
// + isi pesan (server RPC via useSearchMessages). Query <2 char → mode idle (daftar room saja).
// Query >=2 char → dua section: Initiative (client) lalu Pesan (server, sub-group per room,
// snippet ≤240 char). Empty state IDENTIK untuk no-match & silent-filter (AC-15).
// Deep-link tap → /inbox/{roomId}?highlight={messageId} (AC-17).
// Banner degrade saat RPC belum di-apply (PGRST202) atau error network (Coba lagi).
// Hit pesan read-only — TIDAK ada tombol approve/reject/mark-evidence (AC-19).
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { Text, TextInput, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonList,
  TabBar,
  usePlaceholderColor,
} from '@/components/ui';
import { useInboxRooms } from '@/hooks/use-inbox';
import { useSearchMessages } from '@/hooks/use-search-messages';
import type { ChatMessageHit, ChatRoom } from '@/lib/inbox';

type Filter = 'all' | 'unread';

const FILTER_TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'unread', label: 'Belum dibaca' },
];

const COPY = {
  placeholder: 'Cari Initiative atau pesan',
  hint2char: 'Ketik minimal 2 karakter untuk mencari pesan',
  emptyPesan: 'Tidak ada pesan yang cocok dengan pencarianmu',
  clearSearch: 'Hapus pencarian',
  rpcMissing: 'Pencarian pesan belum aktif di lingkungan ini',
  errorNetwork: 'Gagal memuat hasil pencarian pesan. Periksa koneksi lalu coba lagi.',
  retry: 'Coba lagi',
};

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

/** Preview baris Inbox per UI-S-IN1. */
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
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Khusus chat Initiative.
        </Text>
      </View>
      <TextInput
        placeholder={COPY.placeholder}
        placeholderTextColor={placeholderColor}
        value={q}
        onChangeText={setQ}
        accessibilityLabel={COPY.placeholder}
        className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
      />
      <TabBar tabs={FILTER_TABS} active={filter} onChange={setFilter} />
    </View>
  );
}

function RoomRow({ room, onPress }: { room: ChatRoom; onPress: () => void }) {
  const badge = clampUnread(room.unread_count);
  return (
    <SectionCard onPress={onPress}>
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
}

function MessageHitRow({ hit, onPress }: { hit: ChatMessageHit; onPress: () => void }) {
  const authorName = hit.authorName ?? 'Pengguna dihapus';
  const when = formatLast(hit.createdAt);
  return (
    <SectionCard onPress={onPress}>
      <View className="gap-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text
            className="flex-1 text-sm font-semibold text-black dark:text-white"
            numberOfLines={1}>
            {authorName}
          </Text>
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">{when}</Text>
        </View>
        <Text className="text-sm text-neutral-700 dark:text-neutral-200" numberOfLines={3}>
          {hit.snippet}
        </Text>
      </View>
    </SectionCard>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="mt-2 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
      {title}
    </Text>
  );
}

function SubHeader({ label }: { label: string }) {
  return (
    <Text className="mt-1 text-sm font-semibold text-black dark:text-white">{label}</Text>
  );
}

function Banner({
  tone,
  message,
  action,
}: {
  tone: 'warn' | 'error';
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const bg =
    tone === 'error'
      ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-900'
      : 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-900';
  const text =
    tone === 'error'
      ? 'text-red-800 dark:text-red-200'
      : 'text-amber-800 dark:text-amber-200';
  return (
    <View className={`gap-2 rounded-xl border p-3 ${bg}`}>
      <Text className={`text-sm ${text}`}>{message}</Text>
      {action ? (
        <View className="self-start">
          <Button label={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

// Group hits per chat room; preserve order dari server (created_at desc).
function groupHitsByRoom(
  hits: ChatMessageHit[] | undefined,
): Array<{ roomId: string; roomName: string; hits: ChatMessageHit[] }> {
  if (!hits || hits.length === 0) return [];
  const groups = new Map<string, { roomId: string; roomName: string; hits: ChatMessageHit[] }>();
  for (const h of hits) {
    const g = groups.get(h.chatRoomId) ?? {
      roomId: h.chatRoomId,
      roomName: h.roomName,
      hits: [],
    };
    g.hits.push(h);
    groups.set(h.chatRoomId, g);
  }
  return Array.from(groups.values());
}

export function LiveInboxScreen() {
  const router = useRouter();
  const { rooms, isLoading, isError, refetch } = useInboxRooms();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const trimmed = q.trim();
  const isSearching = trimmed.length >= 2;
  const isHint = trimmed.length === 1;

  const search = useSearchMessages(q);
  const groupedHits = useMemo(() => groupHitsByRoom(search.hits), [search.hits]);
  // Degrade: RPC belum di-apply (PGRST202) atau error jaringan → jangan hilangkan daftar room
  // hanya karena string filter tak match — user perlu jalur akses ke room-nya. Filter chip
  // (Semua/Belum-dibaca) tetap berjalan.
  const isSearchDegraded = isSearching && (search.isRpcMissing || search.isError);

  // Initiative list (client-side filter atas useInboxRooms). Chip Semua/Belum-dibaca hanya
  // memfilter grup Initiative — bukan grup Pesan (TB-16).
  const visibleRooms = useMemo(() => {
    const lowered = trimmed.toLowerCase();
    return rooms.filter((r) => {
      if (filter === 'unread' && r.unread_count <= 0) return false;
      if (lowered && !isSearchDegraded && !r.name.toLowerCase().includes(lowered)) return false;
      return true;
    });
  }, [rooms, trimmed, filter, isSearchDegraded]);

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

  const isUnreadFilter = filter === 'unread';
  const emptyTitle = isSearching
    ? 'Tidak ditemukan'
    : isHint
      ? 'Tidak ditemukan'
      : isUnreadFilter
        ? 'Tidak ada yang belum dibaca'
        : 'Belum ada percakapan';
  const emptyDescription = isSearching
    ? `Tidak ada Initiative cocok dengan "${trimmed}".`
    : isUnreadFilter
      ? 'Semua percakapan sudah dibaca.'
      : 'Setiap Initiative otomatis punya chat room. Akan muncul di sini.';

  // Skeleton hanya saat first-fetch (hits === undefined). Refetch di atas cache: hits ada +
  // isFetching=true → tidak flash skeleton (TB-15).
  const showPesanSkeleton = isSearching && search.isLoading && search.hits === undefined;
  const showPesanEmpty =
    isSearching &&
    !search.isLoading &&
    !search.isError &&
    (search.hits?.length ?? 0) === 0 &&
    visibleRooms.length === 0;

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <FlatList<ChatRoom>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={visibleRooms}
        keyExtractor={(room) => room.id}
        ListHeaderComponent={
          <View className="gap-3">
            <InboxHeader q={q} setQ={setQ} filter={filter} setFilter={setFilter} />

            {isHint ? (
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                {COPY.hint2char}
              </Text>
            ) : null}

            {isSearching && search.isRpcMissing ? (
              <Banner tone="warn" message={COPY.rpcMissing} />
            ) : null}

            {isSearching && search.isError && !search.isRpcMissing ? (
              <Banner
                tone="error"
                message={COPY.errorNetwork}
                action={{ label: COPY.retry, onPress: () => search.refetch() }}
              />
            ) : null}

            {isSearching && visibleRooms.length > 0 ? (
              <SectionHeader title="Initiative" />
            ) : null}
          </View>
        }
        ListFooterComponent={
          <View className="gap-3">
            {isSearching ? (
              <View className="gap-2">
                {(showPesanSkeleton ||
                  groupedHits.length > 0 ||
                  (search.hits?.length ?? 0) > 0) && <SectionHeader title="Pesan" />}
                {showPesanSkeleton ? <SkeletonList count={3} /> : null}
                {!showPesanSkeleton &&
                  groupedHits.map((g) => (
                    <View className="gap-2" key={g.roomId}>
                      <SubHeader label={g.roomName} />
                      {g.hits.map((hit) => (
                        <MessageHitRow
                          key={hit.messageId}
                          hit={hit}
                          onPress={() =>
                            router.push(
                              `/inbox/${hit.chatRoomId}?highlight=${hit.messageId}` as Href,
                            )
                          }
                        />
                      ))}
                    </View>
                  ))}
              </View>
            ) : null}

            {showPesanEmpty ? (
              <EmptyState
                icon={<Text className="text-2xl">💬</Text>}
                title={COPY.emptyPesan}
                description=""
                action={{ label: COPY.clearSearch, onPress: () => setQ('') }}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isSearching || isHint || showPesanEmpty ? null : (
            <EmptyState
              icon={<Text className="text-2xl">💬</Text>}
              title={emptyTitle}
              description={emptyDescription}
            />
          )
        }
        renderItem={({ item: room }) => (
          <RoomRow
            room={room}
            onPress={() => router.push(`/inbox/${room.id}` as Href)}
          />
        )}
      />
    </View>
  );
}

export default function InboxRoute() {
  return <LiveInboxScreen />;
}
