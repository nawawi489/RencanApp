import type { PropsWithChildren } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { contentWidthStyle } from '@/lib/responsive';

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

/** Wrapper standar tiap surface: judul + subjudul + konten yang bisa di-scroll.
 *
 * Kontrak safe-area: sisi ATAS dimiliki header navigasi (Tabs `header`=AppHeader /
 * native Stack header), jadi Screen TIDAK menambah inset atas (hindari double-pad).
 * Screen memiliki:
 *   - inset KIRI/KANAN → konten tak tenggelam di balik notch saat landscape;
 *   - inset BAWAH (varian scroll) → item terakhir lolos dari home indicator.
 * Varian non-scroll menyerahkan inset bawah ke anak (mis. komposer chat) yang
 * mengelola bottom-nya sendiri. */
export function Screen({ title, subtitle, scrollable = true, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  if (!scrollable) {
    return (
      <View
        className="flex-1 bg-white dark:bg-black"
        style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
        <View className="gap-1 p-5 pb-3" style={contentWidthStyle}>
          <Text accessibilityRole="header" className="text-2xl font-bold text-black dark:text-white">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-base text-neutral-500 dark:text-neutral-400">{subtitle}</Text>
          ) : null}
        </View>
        <View className="flex-1" style={contentWidthStyle}>
          {children}
        </View>
      </View>
    );
  }
  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-black"
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom,
      }}>
      <View className="gap-5 p-5" style={contentWidthStyle}>
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
