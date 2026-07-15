import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';

import {
  PeopleAdminTab,
  PeopleQuarterlyTab,
  PeopleTabs,
  type PeopleTabKey,
} from '@/components/people-tabs';
import { Screen } from '@/components/screen';
import {
  Avatar,
  EmptyState,
  ErrorState,
  SkeletonList,
  usePlaceholderColor,
} from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { listOrgProfilesWithRoles, personLabel, type OrgProfileWithRole } from '@/lib/cards';
import { useLatestClosedPeriod, useRanking } from '@/hooks/use-people-score';

type Person = OrgProfileWithRole & { score?: number | null };

// UI-S-PP2 — subhead: position + role bila ada, fallback email.
function personSubhead(p: Person): string {
  const parts: string[] = [];
  if (p.position_title) parts.push(p.position_title);
  if (p.role_name) parts.push(p.role_name);
  if (parts.length === 0 && p.email) return p.email;
  return parts.join(' · ');
}

export function LivePeopleScreen() {
  const router = useRouter();
  const placeholderColor = usePlaceholderColor();
  const { can } = useProfile();
  const [activeTab, setActiveTab] = useState<PeopleTabKey>('monthly');
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['org-profiles-with-roles'],
    queryFn: listOrgProfilesWithRoles,
  });
  const { period: latestClosed } = useLatestClosedPeriod();
  const { ranking } = useRanking(latestClosed?.id ?? '');

  const scoreByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of ranking) m.set(r.user_id, r.score);
    return m;
  }, [ranking]);

  // Roster diurutkan by score DESC supaya angka rank (i+1) sesuai dengan posisi nyata.
  // User tanpa skor → ke bawah dan tak diberi badge angka rank.
  const people: Person[] = useMemo(() => {
    const raw = (data ?? []) as Person[];
    const mapped = raw.map((p) => ({
      ...p,
      score: scoreByUser.has(p.id) ? scoreByUser.get(p.id)! : p.score ?? null,
    }));
    mapped.sort((a, b) => {
      const sa = a.score ?? -Infinity;
      const sb = b.score ?? -Infinity;
      if (sa !== sb) return sb - sa;
      return personLabel(a).localeCompare(personLabel(b));
    });
    return mapped;
  }, [data, scoreByUser]);

  // UI-S-PP1 — filter case-insensitive di name/email/position/role.
  const filtered: Person[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      return (
        (p.full_name ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.position_title ?? '').toLowerCase().includes(q) ||
        (p.role_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [people, search]);

  if (isLoading) {
    return (
      <Screen title="People" subtitle="Anggota organisasi.">
        <SkeletonList count={5} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen title="People" subtitle="Anggota organisasi.">
        <ErrorState
          title="Gagal memuat People"
          description="Tidak bisa mengambil daftar anggota organisasi."
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  if (people.length === 0) {
    return (
      <Screen title="People" subtitle="Anggota organisasi.">
        <EmptyState
          icon={<Text className="text-2xl">👥</Text>}
          title="Belum ada anggota"
          description="Anggota organisasi yang diundang admin akan muncul di sini."
        />
      </Screen>
    );
  }

  const canAdmin = can('manage_score_formula');

  // PPL-02: tablist di-render di header setiap tab (mount/unmount per branch, bukan display:none).
  const tablist = <PeopleTabs activeTab={activeTab} onChange={setActiveTab} canAdmin={canAdmin} />;

  if (activeTab === 'quarterly') return <PeopleQuarterlyTab tablist={tablist} />;
  if (activeTab === 'admin') return <PeopleAdminTab tablist={tablist} />;

  // Tab Bulan ini (default) — konten eksisting di bawah tablist.
  const header = (
    <View className="gap-5 pb-3">
      {tablist}
      <View className="gap-1">
        <Text className="text-2xl font-bold text-black dark:text-white">People</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Anggota organisasi.
        </Text>
      </View>

      {/* UI-S-PP1 — search */}
      <View className="gap-3">
        <TextInput
          accessibilityLabel="Cari anggota"
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Cari nama, posisi, atau role…"
          placeholderTextColor={placeholderColor}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
          Anggota Organisasi
        </Text>
        <Text className="text-xs font-semibold text-neutral-400">{filtered.length}/{people.length} user</Text>
      </View>
    </View>
  );

  const renderItem = ({ item: p }: { item: Person }) => (
    <Pressable
      className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4 active:opacity-70 dark:border-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`Buka profil ${personLabel(p)}`}
      onPress={() => router.push(`/people-profile/${p.id}` as Href)}>
      <Avatar name={personLabel(p)} seed={p.id} />
      <View className="flex-1">
        <Text className="text-base font-bold text-black dark:text-white" numberOfLines={1}>
          {personLabel(p)}
        </Text>
        <Text className="text-xs text-neutral-400" numberOfLines={1}>
          {personSubhead(p)}
        </Text>
      </View>
      <Text className="text-lg text-neutral-400">›</Text>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <FlatList<Person>
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={filtered}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          search.trim() ? (
            <EmptyState
              icon={<Text className="text-2xl">🔍</Text>}
              title="Tidak ditemukan"
              description={`Tidak ada anggota cocok untuk "${search.trim()}".`}
            />
          ) : null
        }
        renderItem={renderItem}
      />
    </View>
  );
}

export default function PeopleRoute() {
  return <LivePeopleScreen />;
}
