import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import { Button, EmptyState, ErrorState, SkeletonList } from '@/components/ui';
import { useChatActions, useChatMessages } from '@/hooks/use-inbox';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { messages, isLoading, isError, refetch } = useChatMessages(roomId);
  const { send, markRead, isSending } = useChatActions(roomId);
  const [text, setText] = useState('');

  useEffect(() => {
    if (roomId) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jalankan sekali saat room dibuka
  }, [roomId]);

  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSend() {
    if (isSending) return; // anti double-submit
    const body = text.trim();
    if (!body) return;
    setSendError(null);
    try {
      await send(body);
      // Reset hanya jika sukses agar input tidak terhapus saat error.
      setText('');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Gagal mengirim pesan.');
    }
  }

  return (
    <Screen title="Diskusi Initiative">
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
        <View className="gap-3">
          {messages.map((m) => (
            <View
              key={m.id}
              className="gap-1 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
              <Text className="text-base text-black dark:text-white">{m.body}</Text>
              <Text className="text-xs text-neutral-400">{formatTime(m.created_at)}</Text>
            </View>
          ))}
        </View>
      )}

      <View className="gap-2">
        <TextInput
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Tulis pesan…"
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={setText}
          multiline
        />
        {sendError ? (
          <Text className="text-sm text-red-600" accessibilityRole="alert">
            {sendError}
          </Text>
        ) : null}
        <Button label="Kirim" onPress={handleSend} loading={isSending} disabled={!text.trim()} />
      </View>
    </Screen>
  );
}
