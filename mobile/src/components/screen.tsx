import type { PropsWithChildren } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

type ScreenProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  /** Bila false, wrapper root memakai `<View>` alih-alih `<ScrollView>` dan konten
   * (`children`) diberi `flex-1`. Dipakai surface yang punya list ter-virtualisasi
   * sendiri (mis. inverted `FlatList` di [roomId].tsx) — RN memperingatkan bila
   * `VirtualizedList` bersarang di dalam `ScrollView` biasa (kehilangan virtualisasi
   * & scroll-anchoring). Default `true` untuk kompatibilitas mundur. */
  scrollable?: boolean;
}>;

/** Wrapper standar tiap surface: judul + subjudul + konten yang bisa di-scroll. */
export function Screen({ title, subtitle, scrollable = true, children }: ScreenProps) {
  if (!scrollable) {
    return (
      <View className="flex-1 bg-white dark:bg-black">
        <View className="gap-1 p-5 pb-3">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-base text-neutral-500 dark:text-neutral-400">{subtitle}</Text>
          ) : null}
        </View>
        <View className="flex-1">{children}</View>
      </View>
    );
  }
  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <View className="gap-5 p-5">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-base text-neutral-500 dark:text-neutral-400">{subtitle}</Text>
          ) : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}
