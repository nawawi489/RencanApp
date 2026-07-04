import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { Pressable, Text, View } from 'react-native-css/components';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui';
import { BrandLogo } from '@/components/brand-logo';
import { useProfile } from '@/hooks/use-profile';
import { useThemePreference } from '@/providers/theme-provider';

/** Topbar app: logo + wordmark + kicker per-layar + avatar (→ Settings).
 *  Tombol back otomatis muncul bila:
 *    1. `router.canGoBack()` true (push dari pane sebelumnya), atau
 *    2. route saat ini adalah sub-route Workspace deep-link (Performance/Development)
 *       — fallback ke `router.replace('/workspace')` agar back selalu afordan. */
export function AppHeader({ kicker }: { kicker?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // useSegments() infers a strict literal tuple from typed routes; we only need string membership
  // checks here (Workspace subroute / root-tab detection), not the exact literal shape.
  const segments = useSegments() as string[];
  const { profile } = useProfile();
  const { effective } = useThemePreference();
  // Ikon di atas pill bg-neutral-50/dark:bg-neutral-900 — brand-dark kontras di terang,
  // blue-300 di gelap (pola IconTile info, DESIGN §12: warna eksplisit via tema efektif).
  const searchIconColor = effective === 'dark' ? '#93c5fd' : '#1564b3';
  // Back chevron: blue-300 di gelap mengikuti pola brand-dark, brand-dark di terang.
  const backIconColor = effective === 'dark' ? '#93c5fd' : '#145ebc';
  const name = profile?.full_name?.trim() || profile?.email || 'Pengguna';
  // Sub-route Workspace → back wajib, meski deep-link (unstable_settings.initialRouteName
  // menyisipkan Hub, tapi replace('/workspace') adalah fallback defensif).
  const isWorkspaceSubroute =
    segments.includes('workspace') &&
    (segments.includes('performance') || segments.includes('development'));
  
  // Jangan pernah tampilkan back button di root tab (misal: /(app)/(tabs)/workspace),
  // meskipun router.canGoBack() bernilai true (misal akibat navigasi push antar tab).
  const isRootTab = segments.length <= 3 && segments.includes('(tabs)');
  const showBack = !isRootTab && (router.canGoBack() || isWorkspaceSubroute);
  
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else if (isWorkspaceSubroute) router.replace('/workspace' as never);
  };

  let headerTitle: string | undefined;
  if (isWorkspaceSubroute) {
    if (segments.includes('performance')) headerTitle = 'Performance';
    else if (segments.includes('development')) headerTitle = 'Development';
  }

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-black">
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-1">
          {showBack ? (
            <Pressable
              hitSlop={8}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Kembali ke Workspace"
              className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-70">
              <Ionicons name="chevron-back" size={22} color={backIconColor} />
            </Pressable>
          ) : null}
          
          {isWorkspaceSubroute ? (
            <View className="flex-row items-center gap-2.5 ml-1">
              <Text className="text-xl font-bold text-black dark:text-white">
                {headerTitle}
              </Text>
            </View>
          ) : (
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
          )}
        </View>

        <View className="flex-row items-center gap-2">
          {/* UI-G-005: Search pill berlabel "Cari" — afordans eksplisit (prototype; mobile tanpa hover).
              Min-44px touch (DESIGN §4). */}
          <Pressable
            className="min-h-[44px] flex-row items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
            onPress={() => router.push('/(app)/search')}
            accessibilityRole="button"
            accessibilityLabel="Cari">
            <Ionicons name="search-outline" size={18} color={searchIconColor} />
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
