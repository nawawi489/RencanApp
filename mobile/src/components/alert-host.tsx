// Host banner in-app untuk `showAlert` di web (S3-1).
//
// Native tidak butuh host — `Alert.alert` sudah modal. Di web, `react-native-web`
// membuat `Alert.alert` no-op sehingga info alert (mis. `alertFriendlyError`)
// tidak pernah tampil. `showAlert` mem-broadcast event ke sini; komponen ini
// menampilkan kartu banner di atas layar selama beberapa detik lalu auto-dismiss.
//
// Dimount sekali di root `_layout.tsx`. Tidak merender apa-apa di native.
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';
import { Platform } from 'react-native';

import { subscribeBanner, type BannerEvent } from '@/lib/alert';

const AUTO_DISMISS_MS = 5000;

type QueuedBanner = BannerEvent & { id: number };

export function AlertHost(): React.ReactElement | null {
  const [queue, setQueue] = useState<QueuedBanner[]>([]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let counter = 0;
    // Track pending timers agar cleanup unmount tak meninggalkan timer aktif —
    // tanpa ini jest `--ci` (strict) menganggap suite tidak selesai (5m hang).
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const unsub = subscribeBanner((event) => {
      const id = ++counter;
      setQueue((prev) => [...prev, { ...event, id }]);
      const t = setTimeout(() => {
        pending.delete(t);
        setQueue((prev) => prev.filter((b) => b.id !== id));
      }, AUTO_DISMISS_MS);
      pending.add(t);
    });
    return () => {
      unsub();
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  if (Platform.OS !== 'web' || queue.length === 0) return null;

  return (
    <View
      // pointerEvents box-none: klik di luar banner tetap sampai ke UI di bawah.
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-4 z-50 items-center px-4"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert">
      {queue.map((banner) => (
        <BannerCard
          key={banner.id}
          title={banner.title}
          message={banner.message}
          onDismiss={() => setQueue((prev) => prev.filter((b) => b.id !== banner.id))}
        />
      ))}
    </View>
  );
}

function BannerCard({
  title,
  message,
  onDismiss,
}: {
  title: string;
  message?: string;
  onDismiss: () => void;
}) {
  return (
    <View className="mb-2 w-full max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
      <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</Text>
      {message ? (
        <Text className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{message}</Text>
      ) : null}
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Tutup pesan"
        className="mt-2 self-end px-2 py-1 active:opacity-70">
        <Text className="text-xs font-semibold text-brand-dark dark:text-brand">Tutup</Text>
      </Pressable>
    </View>
  );
}
