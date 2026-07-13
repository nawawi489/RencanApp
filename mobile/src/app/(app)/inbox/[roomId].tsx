// Layar Chat Initiative — UI-S-IN2/IN3/IN4.
// Tata letak: header banner governance (tutup) → daftar pesan kronologis-menaik (date divider antar-hari)
// dengan bubble me/them (Avatar + nama untuk them) → composer circular Kirim pesan.
// Guard: roomId undefined → ErrorState (markRead TIDAK dipanggil).
// Pola: useAuth().session?.user?.id menentukan me; default 'them' saat session kosong.
// Per Critic §8.4: SendButton pakai inline style {width:44,height:44} (NativeWind class tak selalu flatten di jest)
// dan accessibilityState={{disabled}} eksplisit.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { Avatar, EmptyState, ErrorState, SkeletonList, usePlaceholderColor } from '@/components/ui';
import { useChatActions, useChatMessages } from '@/hooks/use-inbox';
import { getActionPlan } from '@/lib/cards';
import { reportError } from '@/lib/errors';
import type { ChatMessage, ChatReaction } from '@/lib/inbox';
import { useAuth } from '@/providers/auth-provider';

import { buildTimelineItems, type TimelineItem } from '@/lib/inbox-timeline';

const GOVERNANCE_BANNER = 'Chat bukan jalur formal: keputusan & bukti tetap lewat Action Plan / Review.';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Label divider per-hari: 'd MMM' id-ID. Mengembalikan null saat invalid (skip render). */
function dayLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short' });
}

function GovernanceBanner({ onClose }: { onClose: () => void }) {
  return (
    <View
      className="mb-2 flex-row items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40"
      accessible
      accessibilityLabel={GOVERNANCE_BANNER}>
      <Text className="text-base">ℹ</Text>
      <Text className="flex-1 text-sm text-blue-800 dark:text-blue-200">{GOVERNANCE_BANNER}</Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Tutup banner"
        hitSlop={8}>
        <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">Tutup</Text>
      </Pressable>
    </View>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <View className="my-3 flex-row items-center gap-2">
      <View className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
      <View className="rounded-full bg-neutral-100 px-2.5 py-1 dark:bg-neutral-800">
        <Text className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{label}</Text>
      </View>
      <View className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
    </View>
  );
}

const REACTION_EMOJI_ORDER = ['👍', '✅', '👀', '🙏'];

type AggregatedReaction = { emoji: string; count: number; reactedByMe: boolean };

function aggregateReactions(
  reactions: ChatReaction[] | undefined,
  currentUserId: string | null,
): AggregatedReaction[] {
  if (!reactions || reactions.length === 0) return [];
  const map = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const r of reactions) {
    const entry = map.get(r.emoji) ?? { count: 0, reactedByMe: false };
    entry.count++;
    if (currentUserId && r.reactor_id === currentUserId) entry.reactedByMe = true;
    map.set(r.emoji, entry);
  }
  const sorted = Array.from(map.entries()).sort((a, b) => {
    const ia = REACTION_EMOJI_ORDER.indexOf(a[0]);
    const ib = REACTION_EMOJI_ORDER.indexOf(b[0]);
    const oa = ia === -1 ? REACTION_EMOJI_ORDER.length + a[0].codePointAt(0)! : ia;
    const ob = ib === -1 ? REACTION_EMOJI_ORDER.length + b[0].codePointAt(0)! : ib;
    return oa - ob;
  });
  return sorted.map(([emoji, { count, reactedByMe }]) => ({ emoji, count, reactedByMe }));
}

function ReactionPill({
  emoji,
  count,
  reactedByMe,
  onPress,
}: {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  onPress: () => void;
}) {
  const label = `Reaksi ${emoji}, ${count}, ${reactedByMe ? 'saya sudah bereaksi' : 'belum bereaksi'}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: reactedByMe }}
      style={{ minWidth: 44, minHeight: 44 }}
      className={`flex-row items-center justify-center rounded-full px-3 ${
        reactedByMe
          ? 'border-2 border-brand-dark bg-blue-50 dark:bg-blue-950/40'
          : 'border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800'
      }`}>
      <Text className="text-base">{emoji}</Text>
      <Text className={`ml-1 text-sm font-semibold ${reactedByMe ? 'text-brand-dark' : 'text-neutral-600 dark:text-neutral-300'}`}>
        {count}
      </Text>
      {reactedByMe ? <Text className="ml-0.5 text-xs font-bold text-brand-dark">✓</Text> : null}
    </Pressable>
  );
}

function ReactionPillRow({
  reactions,
  currentUserId,
  messageId,
  onToggle,
  disabled,
}: {
  reactions: ChatReaction[] | undefined;
  currentUserId: string | null;
  messageId: string;
  onToggle: (messageId: string, emoji: string) => void;
  disabled: boolean;
}) {
  const aggregated = useMemo(
    () => aggregateReactions(reactions, currentUserId),
    [reactions, currentUserId],
  );
  if (aggregated.length === 0) return null;
  return (
    <View className="mt-1 flex-row flex-wrap gap-1">
      {aggregated.map((r) => (
        <ReactionPill
          key={r.emoji}
          emoji={r.emoji}
          count={r.count}
          reactedByMe={r.reactedByMe}
          onPress={() => {
            if (!disabled) onToggle(messageId, r.emoji);
          }}
        />
      ))}
    </View>
  );
}

function ContextBanner({
  label,
  entityId,
  onNavigate,
}: {
  label: string;
  entityId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onNavigate(entityId)}
      accessibilityRole="link"
      accessibilityLabel={`Buka Tugas ${label}`}
      style={{ minHeight: 44 }}
      className="mb-1 flex-row items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-950/40">
      <Text className="text-sm text-blue-700 dark:text-blue-300">🔗</Text>
      <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">Konteks Tugas</Text>
      <Text className="flex-1 text-xs text-blue-800 dark:text-blue-200" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-sm text-blue-700 dark:text-blue-300">›</Text>
    </Pressable>
  );
}

function MessageBubble({
  m,
  isMe,
  isHighlighted,
  currentUserId,
  onToggleReaction,
  reactionDisabled,
  onNavigateContext,
}: {
  m: ChatMessage;
  isMe: boolean;
  isHighlighted?: boolean;
  currentUserId: string | null;
  onToggleReaction: (messageId: string, emoji: string) => void;
  reactionDisabled: boolean;
  onNavigateContext: (id: string) => void;
}) {
  const authorName = m.author?.full_name ?? null;
  // Guard: them tanpa nama → '?' (audit-friendly placeholder).
  const displayName = authorName ?? '?';
  const hasContext = m.context_entity_type === 'action_plan' && m.context_label && m.context_entity_id;
  return (
    <View
      className={`mb-2 max-w-[80%] ${isMe ? 'self-end' : 'self-start'}`}
      accessible={isHighlighted}
      accessibilityLabel={isHighlighted ? `Pesan yang dicari: ${m.body}` : undefined}>
      {!isMe ? (
        <View className="mb-1 flex-row items-center gap-2">
          <Avatar name={displayName} seed={m.author_id ?? displayName} size={24} />
          <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {displayName}
          </Text>
        </View>
      ) : null}
      {hasContext ? (
        <ContextBanner
          label={m.context_label!}
          entityId={m.context_entity_id!}
          onNavigate={onNavigateContext}
        />
      ) : null}
      <View
        className={`rounded-2xl px-3 py-2 ${
          isMe
            ? 'rounded-br-md bg-brand-dark'
            : 'rounded-bl-md bg-neutral-100 dark:bg-neutral-800'
        } ${isHighlighted ? 'border-2 border-amber-400 dark:border-amber-500' : ''}`}>
        <Text className={`text-base ${isMe ? 'text-white' : 'text-black dark:text-white'}`}>
          {m.body}
        </Text>
        <Text className={`mt-1 text-[10px] ${isMe ? 'text-white/80' : 'text-neutral-400'}`}>
          {formatTime(m.created_at)}
        </Text>
      </View>
      <ReactionPillRow
        reactions={m.reactions}
        currentUserId={currentUserId}
        messageId={m.id}
        onToggle={onToggleReaction}
        disabled={reactionDisabled}
      />
    </View>
  );
}

function SendButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  // Critic §8.4: inline 44×44 + accessibilityState eksplisit.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Kirim pesan"
      accessibilityState={{ disabled }}
      style={{ width: 44, height: 44 }}
      className={`items-center justify-center rounded-full bg-brand-dark ${disabled ? 'opacity-40' : 'active:opacity-80'}`}>
      <Text className="text-base font-bold text-white">➤</Text>
    </Pressable>
  );
}

export default function ChatRoomScreen() {
  const { roomId, highlight, contextAp } = useLocalSearchParams<{
    roomId?: string;
    highlight?: string;
    contextAp?: string;
  }>();
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;
  const safeRoomId = roomId ?? '';
  const { messages, isLoading, isError, refetch, loadOlder, hasMore, isFetchingNextPage } =
    useChatMessages(safeRoomId);
  const { send, markRead, isSending, toggleReaction, isTogglingReaction } = useChatActions(safeRoomId);
  const [text, setText] = useState('');
  const placeholderColor = usePlaceholderColor();
  const [sendError, setSendError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [contextApId, setContextApId] = useState<string | null>(contextAp ?? null);
  const [contextApName, setContextApName] = useState<string | null>(null);

  useEffect(() => {
    if (!contextApId) return;
    let cancelled = false;
    getActionPlan(contextApId).then((ap) => {
      if (cancelled) return;
      if (ap?.name) setContextApName(ap.name);
      else setContextApId(null);
    }).catch(() => {
      if (!cancelled) setContextApId(null);
    });
    return () => { cancelled = true; };
  }, [contextApId]);

  useEffect(() => {
    // Guard: roomId undefined / kosong → JANGAN panggil markRead.
    if (roomId) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jalankan sekali saat room dibuka
  }, [roomId]);

  // Owner §10: inverted FlatList membalik VISUAL — data tetap desc (newest-first) apa adanya
  // dari hook. Algoritma pemetaan pesan+divider dipisah jadi `buildTimelineItems` (pure fn,
  // diuji di [roomId].timeline.test.ts) — refactor critic §MC5.
  const timelineData = useMemo<TimelineItem[]>(
    () => buildTimelineItems(messages, dayLabel),
    [messages],
  );

  const canLoadOlder = hasMore && !isFetchingNextPage;
  const onEndReached = useCallback(() => {
    if (canLoadOlder) loadOlder();
  }, [canLoadOlder, loadOlder]);
  const keyExtractor = useCallback((item: TimelineItem) => item.key, []);
  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId || isTogglingReaction) return;
      try {
        await toggleReaction(messageId, emoji);
        setReactionError(null);
      } catch (e) {
        reportError('Reaksi', e, 'Gagal memperbarui reaksi.');
        setReactionError('Gagal memperbarui reaksi.');
      }
    },
    [currentUserId, isTogglingReaction, toggleReaction],
  );

  const handleNavigateContext = useCallback(
    (apId: string) => router.push(`/action-plan/${apId}` as never),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: TimelineItem }) =>
      item.type === 'divider' ? (
        <DateDivider label={item.label} />
      ) : (
        <MessageBubble
          m={item.msg}
          isMe={currentUserId != null && item.msg.author_id === currentUserId}
          isHighlighted={highlight != null && item.msg.id === highlight}
          currentUserId={currentUserId}
          onToggleReaction={handleToggleReaction}
          reactionDisabled={!currentUserId || isTogglingReaction}
          onNavigateContext={handleNavigateContext}
        />
      ),
    [currentUserId, highlight, handleToggleReaction, isTogglingReaction, handleNavigateContext],
  );

  async function handleSend() {
    if (isSending) return; // anti double-submit (Critic §8.5)
    const body = text.trim();
    if (!body) return;
    setSendError(null);
    try {
      const opts = contextApId ? { contextActionPlan: contextApId } : undefined;
      await send(body, [], opts);
      setText('');
      if (contextApId) {
        setContextApId(null);
        setContextApName(null);
      }
    } catch (e) {
      setSendError(reportError('Kirim pesan', e, 'Gagal mengirim pesan.'));
    }
  }

  // Guard: roomId undefined → ErrorState (Critic §8.5).
  if (!roomId) {
    return (
      <Screen title="Diskusi Initiative">
        <ErrorState
          title="Room tidak ditemukan"
          description="Buka room dari Inbox untuk memulai diskusi."
        />
      </Screen>
    );
  }

  const isInputBlank = text.trim().length === 0;
  const composerDisabled = isInputBlank || isSending;

  return (
    <Screen title="Diskusi Initiative" scrollable={false}>
      <View className="flex-1 px-5">
        {!bannerDismissed ? <GovernanceBanner onClose={() => setBannerDismissed(true)} /> : null}

        {isLoading ? (
          <SkeletonList count={4} />
        ) : isError ? (
          <ErrorState
            title="Gagal memuat pesan"
            description="Tidak bisa mengambil percakapan."
            onRetry={() => refetch()}
          />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<Text className="text-2xl">💬</Text>}
            title="Belum ada pesan"
            description="Mulai percakapan dengan mengirim pesan pertama."
          />
        ) : (
          <FlatList
            testID="chat-list"
            inverted
            data={timelineData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View
                  className="my-3 items-center"
                  accessibilityRole="progressbar"
                  accessibilityLabel="Memuat pesan lama">
                  <ActivityIndicator />
                </View>
              ) : null
            }
          />
        )}

        {reactionError ? (
          <Text className="px-1 py-1 text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
            {reactionError}
          </Text>
        ) : null}
        <View className="gap-2 py-3">
          {contextApName ? (
            <View className="mx-3 mt-2 flex-row items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/40">
              <Text className="flex-1 text-xs text-blue-800 dark:text-blue-200">
                Membalas Tugas: {contextApName}
              </Text>
              <Pressable
                onPress={() => {
                  setContextApId(null);
                  setContextApName(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Lepas konteks"
                style={{ minWidth: 44, minHeight: 44 }}
                className="items-center justify-center">
                <Text className="text-sm font-semibold text-blue-700 dark:text-blue-300">✕</Text>
              </Pressable>
            </View>
          ) : null}
          <View className="flex-row items-end gap-2">
            <TextInput
              className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
              placeholder="Tulis pesan…"
              placeholderTextColor={placeholderColor}
              value={text}
              onChangeText={setText}
              multiline
            />
            <SendButton disabled={composerDisabled} onPress={handleSend} />
          </View>
          {sendError ? (
            <Text className="text-sm text-red-700 dark:text-red-400" accessibilityRole="alert">
              {sendError}
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
