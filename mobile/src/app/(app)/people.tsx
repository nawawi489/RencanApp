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
  type ScoreBreakdownMetric,
} from '@/components/ui';
import { listOrgProfilesWithRoles, type OrgProfileWithRole } from '@/lib/cards';
import { METRIC_LABEL, effectiveScore } from '@/lib/people-score';
import { useActivePeriod, useLatestClosedPeriod, useMyScore, useMyScoreHistory, useRanking } from '@/hooks/use-people-score';

type Person = OrgProfileWithRole & { score?: number | null };

function personLabel(p: Person): string {
  return p.full_name?.trim() || p.email || 'Tanpa nama';
}

// UI-S-PP2 — subhead: position + role bila ada, fallback email.
function personSubhead(p: Person): string {
  const parts: string[] = [];
  if (p.position_title) parts.push(p.position_title);
  if (p.role_name) parts.push(p.role_name);
  if (parts.length === 0 && p.email) return p.email;
  return parts.join(' · ');
}

// UI-S-PP1 — tabs sederhana (V1: Ranking/Bulan/Quarter — Admin ditunda).
const PEOPLE_TABS = ['ranking', 'bulan', 'quarter'] as const;
type PeopleTab = (typeof PEOPLE_TABS)[number];
const PEOPLE_TAB_LABEL: Record<PeopleTab, string> = {
  ranking: 'Ranking',
  bulan: 'Bulan',
  quarter: 'Quarter',
};

function breakdownToMetrics(breakdown: unknown): ScoreBreakdownMetric[] {
  if (!breakdown || typeof breakdown !== 'object') return [];
  const obj = breakdown as Record<string, unknown>;
  const items: ScoreBreakdownMetric[] = [];
  for (const [code, raw] of Object.entries(obj)) {
    const label = METRIC_LABEL[code] ?? code;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) items.push({ label, value });
  }
  return items;
}

export default function PeopleScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<PeopleTab>('ranking');
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

  const header = (
    <View className="gap-5 pb-3">
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
            <Text className="text-xs font-semibold uppercase text-neutral-400">
              Skor saya · {period.period_name}
            </Text>
          </View>
          <ScoreBadge score={myEffective} />
          {sparklinePoints.length ? (
            <View className="gap-1.5">
              <Text className="text-xs font-semibold uppercase text-neutral-400">Tren</Text>
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

      {/* UI-S-PP1 — search + tabs */}
      <View className="gap-3">
        <TextInput
          accessibilityLabel="Cari anggota"
          className="rounded-xl border border-neutral-300 px-4 py-3 text-base text-black dark:border-neutral-700 dark:text-white"
          placeholder="Cari nama, posisi, atau role…"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        <View className="flex-row flex-wrap gap-2">
          {PEOPLE_TABS.map((k) => {
            const active = tab === k;
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Tab ${PEOPLE_TAB_LABEL[k]}`}
                className={`min-h-[44px] justify-center rounded-full border px-4 py-2 active:opacity-70 ${active ? 'border-brand-dark bg-brand-dark' : 'border-neutral-300 dark:border-neutral-700'}`}>
                <Text className={active ? 'text-sm font-semibold text-white' : 'text-sm text-black dark:text-white'}>
                  {PEOPLE_TAB_LABEL[k]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {tab !== 'ranking' ? (
          <Badge label="V1: filter periode menyusul" tone="neutral" />
        ) : null}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase text-neutral-400">
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
