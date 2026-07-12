import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native-css/components';

import { Avatar, Badge, Button, IconTile, ScoreBadge, SkeletonCard, type IconTileTone } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { useMyScore } from '@/hooks/use-people-score';
import { effectiveScore } from '@/lib/people-score';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useThemePreference, type ThemeMode } from '@/providers/theme-provider';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Sistem' },
  { key: 'light', label: 'Terang' },
  { key: 'dark', label: 'Gelap' },
];

function ThemeSwitch() {
  const { mode, setMode } = useThemePreference();
  return (
    <View className="gap-1">
      <Text className="px-1 text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Tampilan</Text>
      <View className="overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Text className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
          Mode warna aplikasi. &ldquo;Sistem&rdquo; mengikuti pengaturan perangkat.
        </Text>
        <View
          className="flex-row gap-2"
          accessibilityRole="radiogroup"
          accessibilityLabel="Mode tampilan">
          {THEME_OPTIONS.map((opt) => {
            const active = opt.key === mode;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setMode(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={opt.label}
                className={`min-h-[44px] flex-1 items-center justify-center rounded-xl px-3 py-2 ${
                  active
                    ? 'bg-brand-dark'
                    : 'border border-neutral-300 dark:border-neutral-700'
                } active:opacity-70`}>
                <Text
                  className={`text-sm font-semibold ${
                    active ? 'text-white' : 'text-black dark:text-white'
                  }`}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

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

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type SettingsSection = {
  label: string;
  href?: Href;
  permission?: string;
  description?: string;
  icon: IoniconName;
  tone: IconTileTone;
};
type SettingsGroup = { title: string; items: SettingsSection[]; layout?: 'list' | 'grid' };

// PRD §31 mengelompokkan Menu menjadi: Akses Cepat, Template, Pengaturan, Admin Lanjutan.
// Manual Score Override tidak di sini — entry point lewat People Profile (butuh userId + periodId).
// Role Template tidak di sini — dikelola di dalam layar Organisasi (settings-org-structure).
const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: 'Akses Cepat',
    layout: 'grid', // prototype: Akses Cepat selalu tampil sebagai grid kartu (high-frequency surface).
    items: [
      { label: 'People', href: '/people' as Href, description: 'Ranking & profil', icon: 'people-outline', tone: 'info' },
      { label: 'People Ranking', href: '/people-ranking' as Href, description: 'Ranking score', icon: 'podium-outline', tone: 'violet' },
      {
        label: 'Activity Log',
        href: '/settings-activity-log' as Href,
        permission: 'view_activity_log',
        description: 'Riwayat sistem',
        icon: 'time-outline',
        tone: 'success',
      },
      { label: 'Arsip', href: '/settings-archive' as Href, description: 'Card disembunyikan', icon: 'archive-outline', tone: 'danger' },
      { label: 'Cari', href: '/search' as Href, description: 'Global search', icon: 'search-outline', tone: 'info' },
    ],
  },
  {
    title: 'Template',
    items: [
      { label: 'Goal Template Library', href: '/settings-goal-templates' as Href, icon: 'document-text-outline', tone: 'success' },
      {
        label: 'Strategi Template',
        href: '/settings-strategy-templates' as Href,
        permission: 'manage_strategy_templates',
        icon: 'bar-chart-outline',
        tone: 'warn',
      },
    ],
  },
  {
    title: 'Pengaturan',
    items: [
      { label: 'Organisasi', href: '/settings-org-structure' as Href, permission: 'create_department', icon: 'business-outline', tone: 'warn' },
      {
        label: 'User & Permission',
        href: '/settings-permission-users' as Href,
        permission: 'manage_users_permissions',
        icon: 'shield-checkmark-outline',
        tone: 'success',
      },
      { label: 'Repeat Setting', href: '/settings-repeat-rules' as Href, icon: 'repeat-outline', tone: 'success' },
      {
        label: 'Minimum Breakdown Rule',
        href: '/settings-mbr' as Href,
        permission: 'manage_minimum_breakdown_rule',
        icon: 'git-branch-outline',
        tone: 'info',
      },
      {
        label: 'Card Completion Rule',
        href: '/settings-card-completion-rule' as Href,
        permission: 'manage_card_completion_rule',
        icon: 'checkbox-outline',
        tone: 'info',
      },
      {
        label: 'Keterangan Card',
        href: '/settings-card-guidance' as Href,
        permission: 'manage_card_completion_rule',
        icon: 'information-circle-outline',
        tone: 'info',
      },
      { label: 'Status & Prioritas', href: '/settings-status-priority' as Href, permission: 'manage_settings', icon: 'flag-outline', tone: 'warn' },
      { label: 'Notifications Rule', href: '/settings-notifications-rule' as Href, permission: 'manage_settings', icon: 'notifications-outline', tone: 'info' },
      {
        label: 'Score Formula',
        href: '/settings-score-formula' as Href,
        permission: 'manage_score_formula',
        icon: 'stats-chart-outline',
        tone: 'violet',
      },
    ],
  },
  {
    title: 'Admin Lanjutan',
    items: [
      {
        label: 'Governance Violation',
        href: '/settings-governance-violation' as Href,
        permission: 'view_governance_violation',
        icon: 'warning-outline',
        tone: 'danger',
      },
      {
        label: 'Confidential Access',
        href: '/settings-confidential-access' as Href,
        permission: 'manage_confidential_access',
        icon: 'lock-closed-outline',
        tone: 'warn',
      },
    ],
  },
];

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const { can } = useProfile();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: fetchProfile,
  });
  // Score badge di profile card — fidelity prototype Menu (PRD §31 profile card menampilkan Score).
  const { score: myScore } = useMyScore();
  const scoreValue = effectiveScore(myScore ?? null);

  const name = profile?.full_name ?? session?.user.email ?? 'Pengguna';
  const userId = session?.user.id;

  // Tap profile card → buka People Profile sendiri (cocokkan prototype "Lihat profil kamu").
  const openMyProfile = userId ? () => router.push(`/people-profile/${userId}` as Href) : undefined;

  // PRD §31: Template / Pengaturan / Admin Lanjutan = accordion. Default OPEN agar item
  // settings selalu langsung terlihat (mobile-app convention); user dapat collapse via header.
  // Akses Cepat (layout=grid) tidak accordion — selalu tampil.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleGroup = (title: string) =>
    setCollapsed((s) => ({ ...s, [title]: !s[title] }));

  return (
    <ScrollView className="flex-1 bg-neutral-50 dark:bg-black">
      <View className="gap-5 p-5">
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Buka profil saya"
            onPress={openMyProfile}
            disabled={!openMyProfile}
            className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900">
            <Avatar name={name} seed={userId ?? name} size={52} />
            <View className="flex-1">
              <Text className="text-lg font-bold text-black dark:text-white" numberOfLines={1}>
                {name}
              </Text>
              <Text className="text-sm text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                {profile?.role_templates?.name ?? 'Lihat profil kamu'}
                {profile?.organizations?.name ? ` · ${profile.organizations.name}` : ''}
              </Text>
            </View>
            {scoreValue != null ? (
              <ScoreBadge score={scoreValue} />
            ) : (
              <Badge label="Belum" tone="neutral" />
            )}
          </Pressable>
        )}

        <ThemeSwitch />

        {SETTINGS_GROUPS.map((group) => {
          const isGrid = group.layout === 'grid';
          const isOpen = isGrid || !collapsed[group.title]; // grid selalu open; list default open.
          const header =
            isGrid ? (
              <View className="flex-row items-center justify-between px-1">
                <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">{group.title}</Text>
                <Text className="text-xs text-neutral-400">{group.items.length} item</Text>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Group ${group.title}`}
                accessibilityState={{ expanded: isOpen }}
                className="flex-row items-center justify-between px-1 active:opacity-70"
                onPress={() => toggleGroup(group.title)}>
                <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">{group.title}</Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-neutral-400">{group.items.length} item</Text>
                  <Text className="text-xs text-neutral-400">{isOpen ? '▾' : '▸'}</Text>
                </View>
              </Pressable>
            );
          return (
            <View key={group.title} className="gap-2">
              {header}
              {isOpen ? (
                isGrid ? (
              <View className="flex-row flex-wrap gap-2">
                {group.items.map((section) => {
                  const active = !!section.href && (!section.permission || can(section.permission));
                  const tile = (
                    <View
                      className={`min-h-[112px] flex-1 justify-between rounded-2xl border p-3 ${
                        active
                          ? 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                          : 'border-neutral-200 bg-neutral-100 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/40'
                      }`}>
                      <IconTile icon={section.icon} tone={active ? section.tone : 'neutral'} />
                      <View className="mt-2">
                      <Text
                        className={`text-sm font-bold ${active ? 'text-black dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}
                        numberOfLines={1}>
                        {section.label}
                      </Text>
                      {section.description ? (
                        <Text
                          className="mt-1 text-xs text-neutral-500 dark:text-neutral-400"
                          numberOfLines={2}>
                          {section.description}
                        </Text>
                      ) : null}
                      </View>
                    </View>
                  );
                  // Lebar tile ~48% agar muat 2 kolom di phone shell.
                  return (
                    <View key={section.label} className="basis-[48%]">
                      {active ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={section.label}
                          className="active:opacity-70"
                          onPress={() => router.push(section.href!)}>
                          {tile}
                        </Pressable>
                      ) : (
                        tile
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                {group.items.map((section, i) => {
                  const active = !!section.href && (!section.permission || can(section.permission));
                  const border = i > 0 ? 'border-t border-neutral-200 dark:border-neutral-800' : '';
                  const row = (
                    <View className={`flex-row items-center gap-3 px-4 py-3 ${border}`}>
                      <IconTile icon={section.icon} tone={active ? section.tone : 'neutral'} size={36} />
                      <Text
                        className={`flex-1 text-base ${active ? 'text-black dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}>
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
                )
              ) : null}
            </View>
          );
        })}
        <Text className="px-1 text-xs text-neutral-400">
          Item admin tampil sesuai permission. Override Score per orang dibuka dari Profil People.
        </Text>

        <Button label="Keluar" variant="danger" onPress={signOut} />
      </View>
    </ScrollView>
  );
}
