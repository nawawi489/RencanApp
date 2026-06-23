import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

type ProfileRow = {
  full_name: string | null;
  email: string | null;
  role_templates: { name: string; level: string } | null;
  organizations: { name: string } | null;
};

async function fetchProfile(): Promise<ProfileRow | null> {
  // RLS profiles mengizinkan lihat seluruh anggota org → filter ke diri sendiri sebelum .single().
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email, role_templates(name, level), organizations(name)')
    .eq('id', auth.user!.id)
    .single();
  if (error) throw error;
  return data as unknown as ProfileRow;
}

const SECTIONS = [
  'User & Permission',
  'Role Template',
  'Organization',
  'Goal Template Library',
  'Minimum Breakdown Rule',
  'Card Completion Rule',
  'Score Formula',
  'Activity Log',
  'Governance Violation',
];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: fetchProfile,
  });

  return (
    <ScrollView className="flex-1 bg-white dark:bg-black">
      <View className="gap-5 p-5">
        <View className="gap-1 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
          {isLoading ? (
            <ActivityIndicator />
          ) : (
            <>
              <Text className="text-lg font-semibold text-black dark:text-white">
                {profile?.full_name ?? session?.user.email ?? 'Pengguna'}
              </Text>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">
                {profile?.email ?? session?.user.email}
              </Text>
              <Text className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {profile?.role_templates?.name ?? 'Role belum diatur'}
                {profile?.organizations?.name ? ` · ${profile.organizations.name}` : ''}
              </Text>
            </>
          )}
        </View>

        <View className="gap-1">
          <Text className="px-1 text-xs font-semibold uppercase text-neutral-400">Pengaturan</Text>
          <View className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
            {SECTIONS.map((label, i) => (
              <View
                key={label}
                className={`px-4 py-3 ${i > 0 ? 'border-t border-neutral-200 dark:border-neutral-800' : ''}`}>
                <Text className="text-base text-neutral-400 dark:text-neutral-500">{label}</Text>
              </View>
            ))}
          </View>
          <Text className="px-1 text-xs text-neutral-400">
            Bagian pengaturan aktif bertahap mulai Fase 5–8 sesuai permission.
          </Text>
        </View>

        <Pressable
          className="items-center rounded-xl border border-red-300 px-4 py-3 active:opacity-70 dark:border-red-900"
          onPress={signOut}>
          <Text className="text-base font-semibold text-red-600 dark:text-red-400">Keluar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
