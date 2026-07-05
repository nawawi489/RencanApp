// PPL-02 tab structure — dipisah dari `app/(app)/people.tsx` (Fase E refactor pasca-hijau).
// Kontrak a11y & routing tetap sama; test PPL-02-1..8 mengunci behavior.
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

import { Avatar, GuidanceNote, ScoreBadge } from '@/components/ui';
import { personLabel, type OrgProfileWithRole } from '@/lib/cards';
import { PEOPLE_TAB_COPY, type PeriodSnapshot, type RankingSnapshot } from '@/lib/people-score';

export type PeopleTabKey = 'monthly' | 'quarterly' | 'ranking' | 'admin';
type Person = OrgProfileWithRole & { score?: number | null };

// OQ-9 diputuskan 2026-07-05: tab Admin = entry-point ke layar admin eksisting,
// gate `manage_score_formula`; tidak menambah surface admin baru.
type AdminEntry = { key: string; label: string; route: Href };
export const ADMIN_TAB_ENTRIES: AdminEntry[] = [
  { key: 'score-formula', label: 'Score Formula', route: '/settings-score-formula' as Href },
  { key: 'governance-violation', label: 'Governance Violation', route: '/settings-governance-violation' as Href },
];

export type PeopleTabsProps = {
  activeTab: PeopleTabKey;
  onChange: (tab: PeopleTabKey) => void;
  canAdmin: boolean;
};

/**
 * Tablist header. Fallback `getByLabelText` untuk identifikasi tab
 * (accessibilityRole='tab' fickle di react-native + react-native-css).
 * Admin tab dirender bersyarat `canAdmin`.
 */
export function PeopleTabs({ activeTab, onChange, canAdmin }: PeopleTabsProps) {
  const tabs: Array<{ key: PeopleTabKey; label: string }> = [
    { key: 'monthly', label: PEOPLE_TAB_COPY.monthly },
    { key: 'quarterly', label: PEOPLE_TAB_COPY.quarterly },
    { key: 'ranking', label: PEOPLE_TAB_COPY.ranking },
    ...(canAdmin ? [{ key: 'admin' as const, label: PEOPLE_TAB_COPY.admin }] : []),
  ];
  return (
    <View className="flex-row gap-2 pb-3">
      {tabs.map((t) => {
        const selected = activeTab === t.key;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(t.key)}
            className={
              'min-h-[44px] flex-1 items-center justify-center rounded-xl border px-3 py-2 ' +
              (selected
                ? 'border-brand-dark bg-brand-dark'
                : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-black')
            }>
            <Text
              className={
                'text-sm font-semibold ' +
                (selected ? 'text-white' : 'text-neutral-700 dark:text-neutral-300')
              }>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tab Quarter — placeholder DEFER (OQ-7 diputuskan 2026-07-05). */
export function PeopleQuarterlyTab({ tablist }: { tablist: ReactNode }) {
  return (
    <View className="flex-1 gap-4 bg-white p-5 dark:bg-black">
      {tablist}
      <GuidanceNote title="Quarter" body={PEOPLE_TAB_COPY.quarterlyPlaceholder} />
    </View>
  );
}

export type PeopleRankingTabProps = {
  tablist: ReactNode;
  latestClosed: PeriodSnapshot | null | undefined;
  ranking: RankingSnapshot[];
  people: Person[];
};

/** Tab Ranking — hanya periode closed (D9). Fallback GuidanceNote saat `latestClosed` null. */
export function PeopleRankingTab({ tablist, latestClosed, ranking, people }: PeopleRankingTabProps) {
  const router = useRouter();
  if (!latestClosed) {
    return (
      <View className="flex-1 gap-4 bg-white p-5 dark:bg-black">
        {tablist}
        <GuidanceNote
          title="Belum ada periode tertutup"
          body="Papan peringkat muncul setelah administrator menutup periode skoring pertama."
        />
      </View>
    );
  }
  return (
    <View className="flex-1 bg-white dark:bg-black">
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={ranking}
        keyExtractor={(r) => String(r.user_id)}
        ListHeaderComponent={
          <View className="gap-3 pb-3">
            {tablist}
            <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              Ranking periode {latestClosed.period_name}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const person = people.find((p) => p.id === item.user_id) ?? null;
          const label = person ? personLabel(person) : item.user_id;
          return (
            <Pressable
              className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4 active:opacity-70 dark:border-neutral-800"
              accessibilityRole="button"
              accessibilityLabel={`Buka profil ${label}`}
              onPress={() => router.push(`/people-profile/${item.user_id}` as Href)}>
              <View className="h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
                  {item.rank_number ?? index + 1}
                </Text>
              </View>
              <Avatar name={label} seed={item.user_id} />
              <View className="flex-1">
                <Text className="text-base font-bold text-black dark:text-white" numberOfLines={1}>
                  {label}
                </Text>
                <View className="mt-1.5">
                  <ScoreBadge score={item.score} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/** Tab Admin — daftar Pressable ke rute layar admin eksisting (OQ-9). */
export function PeopleAdminTab({ tablist }: { tablist: ReactNode }) {
  const router = useRouter();
  return (
    <View className="flex-1 gap-3 bg-white p-5 dark:bg-black">
      {tablist}
      {ADMIN_TAB_ENTRIES.map((e) => (
        <Pressable
          key={e.key}
          className="min-h-[44px] flex-row items-center justify-between rounded-2xl border border-neutral-200 p-4 active:opacity-70 dark:border-neutral-800"
          accessibilityRole="button"
          accessibilityLabel={`Buka ${e.label}`}
          onPress={() => router.push(e.route)}>
          <Text className="text-base font-semibold text-black dark:text-white">{e.label}</Text>
          <Text className="text-lg text-neutral-400">›</Text>
        </Pressable>
      ))}
    </View>
  );
}
