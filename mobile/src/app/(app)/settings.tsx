import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Avatar, Button, SkeletonCard } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
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

type SettingsSection = { label: string; href?: Href; permission?: string };

// Bagian aktif bertahap (Fase 5–8). href + permission diisi saat layarnya siap.
const SECTIONS: SettingsSection[] = [
  { label: 'User & Permission' },
  { label: 'Role Template' },
  { label: 'Organisasi', href: '/settings-org-structure' as Href, permission: 'create_department' },
  { label: 'Goal Template Library' },
  {
    label: 'Minimum Breakdown Rule',
    href: '/settings-mbr' as Href,
    permission: 'manage_minimum_breakdown_rule',
  },
  {
    label: 'Card Completion Rule',
    href: '/settings-card-completion-rule' as Href,
    permission: 'manage_card_completion_rule',
  },
  {
    label: 'Keterangan Card',
    href: '/settings-card-guidance' as Href,
    permission: 'manage_card_completion_rule',
  },
  { label: 'Status & Prioritas', href: '/settings-status-priority' as Href, permission: 'manage_settings' },
  { label: 'Notifications Rule', href: '/settings-notifications-rule' as Href, permission: 'manage_settings' },
  {
    label: 'Confidential Access',
    href: '/settings-confidential-access' as Href,
    permission: 'manage_confidential_access',
  },
  {
    label: 'Score Formula',
    href: '/settings-score-formula' as Href,
    permission: 'manage_score_formula',
  },
  { label: 'Activity Log', href: '/settings-activity-log' as Href, permission: 'view_activity_log' },
  {
    label: 'Governance Violation',
    href: '/settings-governance-violation' as Href,
    permission: 'view_governance_violation',
  },
  { label: 'Arsip', href: '/settings-archive' as Href },
  { label: 'Cari', href: '/search' as Href },
];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { can } = useProfile();
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
            {SECTIONS.map((section, i) => {
              const active = !!section.href && (!section.permission || can(section.permission));
              const border = i > 0 ? 'border-t border-neutral-200 dark:border-neutral-800' : '';
              const row = (
                <View className={`flex-row items-center justify-between px-4 py-3 ${border}`}>
                  <Text
                    className={`text-base ${active ? 'text-black dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}>
                    {section.label}
                  </Text>
                  <Text
                    className={active ? 'text-neutral-400 dark:text-neutral-500' : 'text-neutral-300 dark:text-neutral-600'}>
                    ›
                  </Text>
                </View>
              );
              return active ? (
                <Pressable
                  key={section.label}
                  accessibilityRole="button"
                  accessibilityLabel={section.label}
                  className="active:opacity-70"
                  onPress={() => router.push(section.href!)}>
                  {row}
                </Pressable>
              ) : (
                <View key={section.label}>{row}</View>
              );
            })}
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
