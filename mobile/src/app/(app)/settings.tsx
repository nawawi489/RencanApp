import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native-css/components';

import { Avatar, Button, SkeletonCard } from '@/components/ui';
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

  const name = profile?.full_name ?? session?.user.email ?? 'Pengguna';

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-5 p-5">
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <View className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <Avatar name={name} seed={session?.user.id ?? name} size={52} />
            <View className="flex-1">
              <Text className="text-lg font-bold text-black dark:text-white" numberOfLines={1}>
                {name}
              </Text>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                {profile?.email ?? session?.user.email}
              </Text>
              <Text className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {profile?.role_templates?.name ?? 'Role belum diatur'}
                {profile?.organizations?.name ? ` · ${profile.organizations.name}` : ''}
              </Text>
            </View>
          </View>
        )}

        <View className="gap-1">
          <Text className="px-1 text-xs font-semibold uppercase text-neutral-400">Pengaturan</Text>
          <View className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            {SECTIONS.map((label, i) => (
              <View
                key={label}
                className={`flex-row items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-neutral-200 dark:border-neutral-800' : ''}`}>
                <Text className="text-base text-neutral-400 dark:text-neutral-500">{label}</Text>
                <Text className="text-neutral-300 dark:text-neutral-600">›</Text>
              </View>
            ))}
          </View>
          <Text className="px-1 text-xs text-neutral-400">
            Bagian pengaturan aktif bertahap mulai Fase 5–8 sesuai permission.
          </Text>
        </View>

        <Button label="Keluar" variant="danger" onPress={signOut} />
      </View>
    </ScrollView>
  );
}
