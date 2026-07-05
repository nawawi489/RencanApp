import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { Pressable, Text, TextInput, View } from 'react-native-css/components';

import { Screen } from '@/components/screen';
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorState,
  GuidanceNote,
  ScoreBadge,
  ScoreBreakdown,
  ScoreLegend,
  ScoreSparkline,
  SkeletonList,
  usePlaceholderColor,
} from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';
import { listOrgProfilesWithRoles, personLabel, type OrgProfileWithRole } from '@/lib/cards';
import { breakdownToMetrics, effectiveScore, PEOPLE_TAB_COPY } from '@/lib/people-score';
import { useActivePeriod, useLatestClosedPeriod, useMyScore, useMyScoreHistory, useRanking } from '@/hooks/use-people-score';

type Person = OrgProfileWithRole & { score?: number | null };
type PeopleTabKey = 'monthly' | 'quarterly' | 'ranking' | 'admin';

// PPL-02 / OQ-9 diputuskan 2026-07-05: tab Admin = entry-point ke layar admin eksisting.
// Gate visibility tab = `manage_score_formula`; entry route pakai rute layar admin yang sudah ada.
type AdminEntry = { key: string; label: string; route: Href };
const ADMIN_TAB_ENTRIES: AdminEntry[] = [
  { key: 'score-formula', label: 'Score Formula', route: '/settings-score-formula' as Href },
  { key: 'governance-violation', label: 'Governance Violation', route: '/settings-governance-violation' as Href },
];

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
  const { period } = useActivePeriod();
  const { score: myScore } = useMyScore(period?.id);
  // Per-user ScoreBadge bersumber dari ranking_snapshots periode tertutup terbaru
  // (D9: ranking hanya tampil setelah close). RLS otomatis menyaring per visibility.
  const { period: latestClosed } = useLatestClosedPeriod();
  const { ranking } = useRanking(latestClosed?.id ?? '');
  const { history } = useMyScoreHistory(6);
  // Sparkline KRONOLOGIS (kiri = terlama). DB urut DESC → reverse.
  const sparklinePoints = useMemo(
    () => [...history].reverse().map((h) => Number(h.manual_adjusted_score ?? h.auto_calculated_score) || 0),
    [history],
  );

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

  const myEffective = effectiveScore(myScore ?? null);
  const myBreakdown = useMemo(
    () => (myScore ? breakdownToMetrics(myScore.metric_breakdown) : []),
    [myScore],
  );

  if (isLoading) {
    return (
      <Screen title="People" subtitle="Ranking dan profil pencapaian.">
        <SkeletonList count={5} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen title="People" subtitle="Ranking dan profil pencapaian.">
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
      <Screen title="People" subtitle="Ranking dan profil pencapaian.">
        <EmptyState
          icon={<Text className="text-2xl">👥</Text>}
          title="Belum ada anggota"
          description="Anggota organisasi yang diundang admin akan muncul di sini."
        />
      </Screen>
    );
  }

  const canAdmin = can('manage_score_formula');

  // PPL-02: 4 tab (Admin bersyarat manage_score_formula). Fallback getByLabelText (RN a11y-role='tab' fickle).
  const tabs: Array<{ key: PeopleTabKey; label: string }> = [
    { key: 'monthly', label: PEOPLE_TAB_COPY.monthly },
    { key: 'quarterly', label: PEOPLE_TAB_COPY.quarterly },
    { key: 'ranking', label: PEOPLE_TAB_COPY.ranking },
    ...(canAdmin ? [{ key: 'admin' as const, label: PEOPLE_TAB_COPY.admin }] : []),
  ];

  const tablist = (
    <View className="flex-row gap-2 pb-3">
      {tabs.map((t) => {
        const selected = activeTab === t.key;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected }}
            onPress={() => setActiveTab(t.key)}
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

  // Tab Quarter — placeholder DEFER (OQ-7 diputuskan 2026-07-05).
  if (activeTab === 'quarterly') {
    return (
      <View className="flex-1 gap-4 bg-white p-5 dark:bg-black">
        {tablist}
        <GuidanceNote title="Quarter" body={PEOPLE_TAB_COPY.quarterlyPlaceholder} />
      </View>
    );
  }

  // Tab Ranking — hanya periode closed (D9).
  if (activeTab === 'ranking') {
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

  // Tab Admin — entry-point ke layar admin eksisting (OQ-9 diputuskan 2026-07-05).
  if (activeTab === 'admin') {
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

  // Tab Bulan ini (default) — konten eksisting di bawah tablist.
  const header = (
    <View className="gap-5 pb-3">
      {tablist}
      <View className="gap-1">
        <Text className="text-2xl font-bold text-black dark:text-white">People</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Ranking dan profil pencapaian.
        </Text>
      </View>

      <ScoreLegend />

      {/* Skor saya — hanya tampil saat ada periode aktif & skor sudah dihitung. */}
      {period && myEffective != null ? (
        <View
          className="gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
          accessible
          accessibilityLabel="Skor saya">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              Skor saya · {period.period_name}
            </Text>
          </View>
          <ScoreBadge score={myEffective} />
          {sparklinePoints.length ? (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Tren</Text>
              <ScoreSparkline points={sparklinePoints} />
            </View>
          ) : null}
          {myBreakdown.length ? <ScoreBreakdown metrics={myBreakdown} /> : null}
        </View>
      ) : period ? (
        <GuidanceNote
          title="Skor menyusul"
          body={`Periode "${period.period_name}" aktif. Skor Anda muncul setelah perhitungan periode berjalan.`}
        />
      ) : (
        <GuidanceNote
          title="Belum ada periode skoring"
          body="Achievement Score muncul setelah administrator membuka periode skoring untuk organisasi."
        />
      )}

      {/* Papan peringkat lengkap — hanya tampil setelah ada periode tertutup (D9). */}
      {latestClosed ? (
        <Pressable
          className="flex-row items-center justify-between rounded-2xl border border-neutral-200 p-4 active:opacity-70 dark:border-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Lihat papan peringkat lengkap"
          onPress={() => router.push('/people-ranking' as Href)}>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-semibold text-black dark:text-white">Papan peringkat</Text>
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Ranking periode {latestClosed.period_name}
            </Text>
          </View>
          <Text className="text-lg text-neutral-400">›</Text>
        </Pressable>
      ) : null}

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

  const renderItem = ({ item: p, index: i }: { item: Person; index: number }) => (
    <Pressable
      className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4 active:opacity-70 dark:border-neutral-800"
      accessibilityRole="button"
      accessibilityLabel={`Buka profil ${personLabel(p)}`}
      onPress={() => router.push(`/people-profile/${p.id}` as Href)}>
      {/* Hanya tampilkan angka rank untuk user yang punya skor; user tanpa skor → em-dash. */}
      <View className="h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
        <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
          {p.score != null ? i + 1 : '—'}
        </Text>
      </View>
      <Avatar name={personLabel(p)} seed={p.id} />
      <View className="flex-1">
        <Text className="text-base font-bold text-black dark:text-white" numberOfLines={1}>
          {personLabel(p)}
        </Text>
        <Text className="text-xs text-neutral-400" numberOfLines={1}>
          {personSubhead(p)}
        </Text>
        {/* p.score null vs 0: null → tak ada badge; 0 nyata → band attention */}
        {p.score != null ? (
          <View className="mt-1.5">
            <ScoreBadge score={p.score} />
          </View>
        ) : null}
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
