import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui';
import { BrandLogo } from '@/components/brand-logo';
import { useProfile } from '@/hooks/use-profile';

/** Topbar app: logo + wordmark + kicker per-layar + avatar (→ Settings). */
export function AppHeader({ kicker }: { kicker?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useProfile();
  const name = profile?.full_name?.trim() || profile?.email || 'Pengguna';

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-black">
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2.5">
          <BrandLogo size={32} />
          <View>
            <Text className="text-base font-extrabold text-black dark:text-white">
              Rencana<Text className="text-green-700 dark:text-green-400">app</Text>
            </Text>
            {kicker ? (
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">{kicker}</Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          {/* UI-G-005: Search pill berlabel "Cari" — afordans eksplisit (prototype; mobile tanpa hover).
              Min-44px touch (DESIGN §4). */}
          <Pressable
            className="min-h-[44px] flex-row items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
            onPress={() => router.push('/(app)/search')}
            accessibilityRole="button"
            accessibilityLabel="Cari">
            <Ionicons name="search-outline" size={18} color="#1564b3" />
            <Text className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">Cari</Text>
          </Pressable>
          <Pressable
            className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70"
            onPress={() => router.push('/(app)/settings')}
            accessibilityRole="button"
            accessibilityLabel="Buka profil & pengaturan">
            <Avatar name={name} seed={profile?.id ?? name} size={34} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
