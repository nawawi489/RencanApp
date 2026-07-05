import type { PropsWithChildren } from 'react';
import { ScrollView, Text, View } from 'react-native-css/components';

type ScreenProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

/** Wrapper standar tiap surface: judul + subjudul + konten yang bisa di-scroll. */
export function Screen({ title, subtitle, children }: ScreenProps) {
  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <View className="gap-5 p-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-black dark:text-white">{title}</Text>
          {subtitle ? (
            <Text className="text-base text-neutral-500 dark:text-neutral-400">{subtitle}</Text>
          ) : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}
