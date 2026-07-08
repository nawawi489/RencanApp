// Layar Chat Initiative — UI-S-IN2/IN3/IN4.
// Tata letak: header banner governance (tutup) → daftar pesan kronologis-menaik (date divider antar-hari)
// dengan bubble me/them (Avatar + nama untuk them) → composer circular Kirim pesan.
// Guard: roomId undefined → ErrorState (markRead TIDAK dipanggil).
// Pola: useAuth().session?.user?.id menentukan me; default 'them' saat session kosong.
// Per Critic §8.4: SendButton pakai inline style {width:44,height:44} (NativeWind class tak selalu flatten di jest)
// dan accessibilityState={{disabled}} eksplisit.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { Avatar, EmptyState, ErrorState, SkeletonList, usePlaceholderColor } from '@/components/ui';
import { useChatActions, useChatMessages } from '@/hooks/use-inbox';
import { reportError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/inbox';
import { useAuth } from '@/providers/auth-provider';

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

function MessageBubble({ m, isMe }: { m: ChatMessage; isMe: boolean }) {
  const authorName = m.author?.full_name ?? null;
  // Guard: them tanpa nama → '?' (audit-friendly placeholder).
  const displayName = authorName ?? '?';
  return (
    <View className={`mb-2 max-w-[80%] ${isMe ? 'self-end' : 'self-start'}`}>
      {!isMe ? (
        <View className="mb-1 flex-row items-center gap-2">
          <Avatar name={displayName} seed={m.author_id ?? displayName} size={24} />
          <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {displayName}
          </Text>
        </View>
      ) : null}
      <View
        className={`rounded-2xl px-3 py-2 ${
          isMe
            ? 'rounded-br-md bg-brand-dark'
            : 'rounded-bl-md bg-neutral-100 dark:bg-neutral-800'
        }`}>
        <Text className={`text-base ${isMe ? 'text-white' : 'text-black dark:text-white'}`}>
          {m.body}
        </Text>
        <Text className={`mt-1 text-[10px] ${isMe ? 'text-white/80' : 'text-neutral-400'}`}>
          {formatTime(m.created_at)}
        </Text>
      </View>
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
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user?.id ?? null;
  const safeRoomId = roomId ?? '';
  const { messages, isLoading, isError, refetch, loadOlder, hasMore } = useChatMessages(safeRoomId);
  const { send, markRead, isSending } = useChatActions(safeRoomId);
  const [text, setText] = useState('');
  const placeholderColor = usePlaceholderColor();
  const [sendError, setSendError] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    // Guard: roomId undefined / kosong → JANGAN panggil markRead.
    if (roomId) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jalankan sekali saat room dibuka
  }, [roomId]);

  // Kronologis-menaik: hook desc (terbaru→lama) → balik agar oldest di atas, newest di bawah.
  const ordered = useMemo(() => [...messages].reverse(), [messages]);

  // Per Critic §8.5: bangun divider sekali per "blok hari" pada array yang sudah merged+ordered.
  type Row = { kind: 'divider'; key: string; label: string } | { kind: 'msg'; key: string; m: ChatMessage };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let prevDay: string | null = null;
    for (const m of ordered) {
      const label = dayLabel(m.created_at);
      if (label && label !== prevDay) {
        out.push({ kind: 'divider', key: `d-${label}-${m.id}`, label });
        prevDay = label;
      }
      out.push({ kind: 'msg', key: m.id, m });
    }
    return out;
  }, [ordered]);

  async function handleSend() {
    if (isSending) return; // anti double-submit (Critic §8.5)
    const body = text.trim();
    if (!body) return;
    setSendError(null);
    try {
      await send(body);
      setText('');
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
    <Screen title="Diskusi Initiative">
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
        <ScrollView contentContainerStyle={{ gap: 0 }}>
          {hasMore ? (
            <Pressable
              onPress={() => loadOlder()}
              className="mb-2 self-center rounded-full border border-neutral-300 px-4 py-2 active:opacity-70 dark:border-neutral-700"
              accessibilityRole="button"
              accessibilityLabel="Muat pesan lama">
              <Text className="text-sm font-semibold text-black dark:text-white">Muat pesan lama</Text>
            </Pressable>
          ) : null}
          {rows.map((r) =>
            r.kind === 'divider' ? (
              <DateDivider key={r.key} label={r.label} />
            ) : (
              <MessageBubble
                key={r.key}
                m={r.m}
                isMe={currentUserId != null && r.m.author_id === currentUserId}
              />
            ),
          )}
        </ScrollView>
      )}

      <View className="gap-2 pt-2">
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
    </Screen>
  );
}
