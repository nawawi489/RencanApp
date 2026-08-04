// PPL-02 tab structure — dipisah dari `app/(app)/people.tsx` (Fase E refactor pasca-hijau).
// Kontrak a11y & routing tetap sama; test PPL-02-1..8 mengunci behavior.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native-css/components';

import { GuidanceNote } from '@/components/ui';
import { useThemedIcon } from '@/providers/theme-provider';
import { PEOPLE_TAB_COPY } from '@/lib/people-score';

export type PeopleTabKey = 'monthly' | 'quarterly' | 'admin';

// OQ-9 diputuskan 2026-07-05: tab Admin = entry-point ke layar admin eksisting,
// gate `manage_score_formula`; tidak menambah surface admin baru.
type AdminEntry = { key: string; label: string; route: Href };
export const ADMIN_TAB_ENTRIES: AdminEntry[] = [
  { key: 'score-formula', label: 'Rumus Skor', route: '/settings-score-formula' as Href },
  { key: 'governance-violation', label: 'Pelanggaran Tata Kelola', route: '/settings-governance-violation' as Href },
];

export type PeopleTabsProps = {
  activeTab: PeopleTabKey;
  onChange: (tab: PeopleTabKey) => void;
  canAdmin: boolean;
};

export function PeopleTabs({ activeTab, onChange, canAdmin }: PeopleTabsProps) {
  // Segmented control HANYA untuk filter waktu (Bulan ini / Quarter). Admin
  // dipisah sebagai tombol tersendiri di kanan agar tidak dibaca sebagai opsi
  // filter yang saling meng-eksklusifkan.
  const timeTabs: Array<{ key: PeopleTabKey; label: string }> = [
    { key: 'monthly', label: PEOPLE_TAB_COPY.monthly },
    { key: 'quarterly', label: PEOPLE_TAB_COPY.quarterly },
  ];
  const adminSelected = activeTab === 'admin';
  const brandIcon = useThemedIcon('#1564b3', '#93c5fd');
  return (
    <View className="flex-row items-center gap-2 pb-3">
      {timeTabs.map((t) => {
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
      {canAdmin ? (
        <Pressable
          key="admin"
          accessibilityRole="button"
          accessibilityLabel={PEOPLE_TAB_COPY.admin}
          accessibilityState={{ selected: adminSelected }}
          onPress={() => onChange('admin')}
          className={
            'min-h-[44px] min-w-[44px] flex-row items-center justify-center gap-1.5 rounded-xl border px-3 py-2 ' +
            (adminSelected
              ? 'border-brand-dark bg-brand-dark'
              : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-black')
          }>
          <Ionicons
            name="settings-outline"
            size={16}
            color={adminSelected ? '#ffffff' : brandIcon}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text
            className={
              'text-sm font-semibold ' +
              (adminSelected ? 'text-white' : 'text-brand-dark dark:text-brand-light')
            }>
            {PEOPLE_TAB_COPY.admin}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Tab Quarter — placeholder DEFER (OQ-7 diputuskan 2026-07-05). */
export function PeopleQuarterlyTab({ tablist }: { tablist: ReactNode }) {
  return (
    <View className="flex-1 gap-4 bg-white p-5 dark:bg-black">
      {tablist}
      <GuidanceNote title="Kuartal" body={PEOPLE_TAB_COPY.quarterlyPlaceholder} />
    </View>
  );
}

/** Tab Admin — daftar Pressable ke rute layar admin eksisting (OQ-9). */
export function PeopleAdminTab({ tablist }: { tablist: ReactNode }) {
  const router = useRouter();
  const mutedIcon = useThemedIcon('#6b7280', '#a3a3a3');
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
          <Ionicons name="chevron-forward" size={18} color={mutedIcon} />
        </Pressable>
      ))}
    </View>
  );
}
