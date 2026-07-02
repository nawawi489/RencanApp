// UI Fase 7 — People · Ranking (mockup 32). Papan peringkat periode tertutup terbaru (D9:
// ranking hanya muncul setelah close; ranking_snapshots beku). RLS menyaring visibility (D1).
// Read-only: tidak ada mutasi di layar ini. Tap baris → profil orang (people-profile/[id]).
import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { FlatList } from 'react-native';
import { Pressable, Text, View } from 'react-native-css/components';

import { Avatar, EmptyState, ErrorState, ScoreBadge, ScoreLegend, SkeletonList } from '@/components/ui';
import { listOrgProfiles, type PersonRef } from '@/lib/cards';
import { useLatestClosedPeriod, useRanking } from '@/hooks/use-people-score';
import { StackScreenAdapter } from '@/prototype/adapters/stack-screen-adapter';
import PrototypePeopleRankingScreen from '@/prototype/screens/people-ranking';

type Person = NonNullable<PersonRef>;

function personLabel(p: Person | undefined, fallback: string): string {
  return p?.full_name?.trim() || p?.email || fallback;
}

export function LivePeopleRankingScreen() {
  const router = useRouter();
  const { period: closed, isLoading: periodLoading, isError: periodError } = useLatestClosedPeriod();
  const { ranking, isLoading: rankingLoading, isError: rankingError, refetch } = useRanking(closed?.id ?? '');
  const { data: profiles, isLoading: profilesLoading } = useQuery({
    queryKey: ['org-profiles'],
    queryFn: listOrgProfiles,
  });

  const personById = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of (profiles ?? []) as Person[]) m.set(p.id, p);
    return m;
  }, [profiles]);

  const loading = periodLoading || (closed && (rankingLoading || profilesLoading));

  if (loading) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Ranking' }} />
        <SkeletonList count={6} />
      </View>
    );
  }

  if (periodError || rankingError) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Ranking' }} />
        <ErrorState
          title="Gagal memuat ranking"
          description="Tidak bisa mengambil papan peringkat periode."
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  // D9: tanpa periode tertutup, tidak ada ranking yang beku untuk ditampilkan.
  if (!closed || ranking.length === 0) {
    return (
      <View className="flex-1 bg-white p-5 dark:bg-black">
        <Stack.Screen options={{ title: 'Ranking' }} />
        <EmptyState
          icon={<Text className="text-2xl">🏁</Text>}
          title="Ranking belum tersedia"
          description="Papan peringkat muncul setelah administrator menutup periode skoring."
        />
      </View>
    );
  }

  const header = (
    <View className="gap-5 pb-3">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-black dark:text-white">Ranking</Text>
        <Text className="text-base text-neutral-500 dark:text-neutral-400">
          Periode {closed.period_name} · {ranking.length} anggota dinilai.
        </Text>
      </View>
      <ScoreLegend />
    </View>
  );

  return (
    <View className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ title: 'Ranking' }} />
      <FlatList
        contentContainerStyle={{ gap: 12, padding: 20 }}
        data={ranking}
        keyExtractor={(r) => r.user_id}
        ListHeaderComponent={header}
        renderItem={({ item: r }) => {
          const person = personById.get(r.user_id);
          const label = personLabel(person, 'Anggota');
          // Rank 1-3 ditandai tonal emas/perak/perunggu via warna teks; tetap ada angka (a11y).
          const medal = r.rank_number === 1 ? '🥇' : r.rank_number === 2 ? '🥈' : r.rank_number === 3 ? '🥉' : null;
          return (
            <Pressable
              className="flex-row items-center gap-3 rounded-2xl border border-neutral-200 p-4 active:opacity-70 dark:border-neutral-800"
              accessibilityRole="button"
              accessibilityLabel={`Peringkat ${r.rank_number}, ${label}, score ${r.score}`}
              onPress={() => router.push(`/people-profile/${r.user_id}` as Href)}>
              <View className="h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                <Text className="text-sm font-bold text-blue-700 dark:text-blue-300">
                  {medal ?? r.rank_number}
                </Text>
              </View>
              <Avatar name={label} seed={r.user_id} />
              <View className="flex-1 gap-1">
                <Text className="text-base font-bold text-black dark:text-white" numberOfLines={1}>
                  {label}
                </Text>
                <ScoreBadge score={r.score} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export default function PeopleRankingRoute() {
  return <StackScreenAdapter live={LivePeopleRankingScreen} prototype={PrototypePeopleRankingScreen} />;
}
